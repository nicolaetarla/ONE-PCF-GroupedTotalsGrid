/**
 * Aggregation.
 *
 * Two paths produce the same shape:
 *   - the client path, summing loaded rows (this file);
 *   - the server path, reading FetchXML aggregate results (fetchXmlBuilder.ts
 *     builds the query, mergePartitions here recombines split results).
 *
 * Invariants enforced here:
 *   - sums are computed in scaled integer minor units, never naive float adds;
 *   - a column with no numeric contributions totals to null, not 0, so an
 *     empty column renders blank instead of a misleading zero;
 *   - money is never summed across transaction currencies.
 */

import { sumScaled } from "./formatters/localeNumber";
import { emptyKey, resolveGroupKey, GroupSourceValue } from "./groupKey";
import { AggregateResult, ColumnTotal, GroupAggregate, GroupKey } from "./types";

/**
 * Coerce a dataset value to a number.
 *
 * `getValue` does not always hand back a JS number for numeric columns - some
 * hosts and column types return the value as a string. The previous strict
 * `typeof v === "number"` check silently discarded those, which produced a
 * column of perfectly good data totalling to blank.
 */
export function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof value === "boolean") return value ? 1 : 0;
  return null;
}

/** One row, reduced to what aggregation needs. */
export interface AggregationRow {
  recordId: string;
  group: GroupSourceValue;
  /** Raw numeric values by column logical name; null/undefined are skipped. */
  values: Record<string, number | null | undefined>;
  /** Base-currency equivalents, keyed by the same column names. */
  baseValues?: Record<string, number | null | undefined>;
  /** Transaction currency id, for mixed-currency detection. */
  currencyId?: string | null;
}

export interface AggregationSpec {
  /** Columns to total. */
  columns: readonly string[];
  /** Precision per column, for scaled-integer summing. */
  precisionByColumn: Record<string, number>;
  /** Which columns are money and therefore currency-sensitive. */
  currencyColumns: ReadonlySet<string>;
  emptyGroupLabel: string;
}

interface Bucket {
  key: GroupKey;
  count: number;
  values: Record<string, number[]>;
  baseValues: Record<string, number[]>;
  currencies: Set<string>;
}

function newBucket(key: GroupKey, columns: readonly string[]): Bucket {
  const values: Record<string, number[]> = {};
  const baseValues: Record<string, number[]> = {};
  for (const c of columns) {
    values[c] = [];
    baseValues[c] = [];
  }
  return { key, count: 0, values, baseValues, currencies: new Set<string>() };
}

function finaliseBucket(bucket: Bucket, spec: AggregationSpec): GroupAggregate {
  const totals: Record<string, ColumnTotal> = {};
  const mixedCurrency = bucket.currencies.size > 1;

  for (const column of spec.columns) {
    const isMoney = spec.currencyColumns.has(column);
    const precision = spec.precisionByColumn[column] ?? 2;

    // Summing transaction-currency amounts across different currencies produces
    // a number with no meaning. When a group spans currencies we fall back to
    // the base-currency column and tell the UI, which surfaces an info icon.
    const useBase = isMoney && mixedCurrency;
    const source = useBase ? bucket.baseValues[column] : bucket.values[column];

    if (!source || source.length === 0) {
      totals[column] = { columnName: column, value: null };
      continue;
    }
    totals[column] = {
      columnName: column,
      value: sumScaled(source, precision),
      usedBaseCurrency: useBase || undefined
    };
  }

  return { key: bucket.key, recordCount: bucket.count, totals };
}

/**
 * Group and total loaded rows.
 *
 * `partial` must be set by the caller when it stopped paging at maxClientRows -
 * this function has no way to know it was handed an incomplete set, and showing
 * a partial total as if it were final is the worst failure mode this control
 * has.
 */
export function aggregateRows(
  rows: readonly AggregationRow[],
  spec: AggregationSpec,
  partial = false
): AggregateResult {
  const buckets = new Map<string, Bucket>();
  const grand = newBucket(emptyKey(""), spec.columns);

  for (const row of rows) {
    const key = resolveGroupKey(row.group, spec.emptyGroupLabel);
    let bucket = buckets.get(key.key);
    if (!bucket) {
      bucket = newBucket(key, spec.columns);
      buckets.set(key.key, bucket);
    }
    bucket.count++;
    grand.count++;

    if (row.currencyId) {
      bucket.currencies.add(row.currencyId);
      grand.currencies.add(row.currencyId);
    }

    for (const column of spec.columns) {
      const v = row.values[column];
      if (typeof v === "number" && !Number.isNaN(v)) {
        bucket.values[column].push(v);
        grand.values[column].push(v);
      }
      const b = row.baseValues?.[column];
      if (typeof b === "number" && !Number.isNaN(b)) {
        bucket.baseValues[column].push(b);
        grand.baseValues[column].push(b);
      }
    }
  }

  return {
    groups: Array.from(buckets.values()).map((b) => finaliseBucket(b, spec)),
    grandTotal: finaliseBucket(grand, spec),
    source: "client",
    partial
  };
}

/**
 * Recombine aggregate results from partitioned server queries.
 *
 * Sum and count compose across partitions. Average deliberately is not
 * supported here: averaging averages is wrong, so if avg is ever added it must
 * be derived as sum/count from these composed values.
 */
export function mergePartitions(
  parts: readonly AggregateResult[],
  spec: AggregationSpec
): AggregateResult {
  const merged = new Map<string, GroupAggregate>();

  const addInto = (target: GroupAggregate, source: GroupAggregate): GroupAggregate => {
    const totals: Record<string, ColumnTotal> = { ...target.totals };
    for (const column of spec.columns) {
      const a = target.totals[column]?.value;
      const b = source.totals[column]?.value;
      const usedBase =
        target.totals[column]?.usedBaseCurrency || source.totals[column]?.usedBaseCurrency;
      const value =
        a === null || a === undefined
          ? b ?? null
          : b === null || b === undefined
          ? a
          : sumScaled([a, b], spec.precisionByColumn[column] ?? 2);
      totals[column] = { columnName: column, value, usedBaseCurrency: usedBase || undefined };
    }
    return {
      key: target.key,
      recordCount: target.recordCount + source.recordCount,
      totals
    };
  };

  for (const part of parts) {
    for (const group of part.groups) {
      const existing = merged.get(group.key.key);
      merged.set(group.key.key, existing ? addInto(existing, group) : group);
    }
  }

  let grand: GroupAggregate = {
    key: emptyKey(""),
    recordCount: 0,
    totals: Object.fromEntries(spec.columns.map((c) => [c, { columnName: c, value: null }]))
  };
  for (const part of parts) grand = addInto(grand, part.grandTotal);

  return {
    groups: Array.from(merged.values()),
    grandTotal: grand,
    source: "server",
    partial: parts.some((p) => p.partial),
    partitions: parts.length
  };
}
