/**
 * Shared types for the Grouped Totals Grid.
 *
 * Everything in core/ is deliberately PCF-free: plain data in, plain data out,
 * so it can be unit tested without a mock ComponentFramework context. The
 * adapters that read the real dataset live in hooks/.
 */

/* ------------------------------------------------------------------ *
 * Column classification
 * ------------------------------------------------------------------ */

/** Dataset column data types we care about. Mirrors the platform strings. */
export type DataverseDataType =
  | "Currency"
  | "Decimal"
  | "FP"
  | "Whole.None"
  | "Whole.Duration"
  | "Whole.TimeZone"
  | "Whole.Language"
  | "Whole.Template"
  | "SingleLine.Text"
  | "SingleLine.Email"
  | "SingleLine.Phone"
  | "SingleLine.URL"
  | "SingleLine.Ticker"
  | "SingleLine.TextArea"
  | "Multiple"
  | "DateAndTime.DateOnly"
  | "DateAndTime.DateAndTime"
  | "TwoOptions"
  | "OptionSet"
  | "MultiSelectPicklist"
  | "Lookup.Simple"
  | "Lookup.Customer"
  | "Lookup.Owner"
  | "Lookup.PartyList"
  | "Lookup.Regarding";

/**
 * Types that may be totalled.
 *
 * Whole.TimeZone / Whole.Language / Whole.Template are numeric on the wire but
 * summing them is meaningless, so they are excluded on purpose. See
 * isTotalableType().
 */
export const TOTALABLE_TYPES: ReadonlySet<string> = new Set<string>([
  "Currency",
  "Decimal",
  "FP",
  "Whole.None",
  "Whole.Duration"
]);

export function isTotalableType(dataType: string | undefined): boolean {
  return !!dataType && TOTALABLE_TYPES.has(dataType);
}

/** A column as presented by the dataset, reduced to what core/ needs. */
export interface GridColumn {
  name: string; // logical name
  displayName: string;
  dataType: string;
  order: number;
  visualSizeFactor: number;
  isPrimary: boolean;
  /** Target table for lookup columns, when known. */
  lookupTargetEntity?: string;
}

/* ------------------------------------------------------------------ *
 * Formatting
 * ------------------------------------------------------------------ */

export type DurationShape =
  | "HoursAndMinutes" // 37 hours 45 minutes
  | "HoursColonMinutes" // 37:45
  | "DecimalHours" // 37.75 hours
  | "Minutes"; // 2265 minutes

export type NumericKind = "currency" | "decimal" | "integer" | "duration";

/**
 * Everything needed to render a total exactly the way the platform renders the
 * cells in the same column. Built once per column per query, then reused.
 */
export interface ColumnFormat {
  columnName: string;
  kind: NumericKind;
  /** Digits after the decimal separator. 0 for integer and duration. */
  precision: number;
  /** Currency symbol as the platform would render it, for kind === "currency". */
  currencySymbol?: string;
  /** ISO code, used when falling back to base currency on mixed-currency groups. */
  currencyIsoCode?: string;
  /** Resolved shape for kind === "duration". */
  durationShape?: DurationShape;
  /**
   * True when precision/shape was inferred from sampled getFormattedValue()
   * output rather than read from attribute metadata. Surfaced in debug logs so
   * support can tell a metadata problem from an inference problem.
   */
  inferred: boolean;
}

/** Locale settings, mirroring context.userSettings.numberFormattingInfo. */
export interface NumberFormattingInfo {
  numberDecimalSeparator: string;
  numberGroupSeparator: string;
  numberGroupSizes: number[];
  currencyDecimalSeparator: string;
  currencyGroupSeparator: string;
  currencyGroupSizes: number[];
  currencySymbol: string;
  currencyDecimalDigits: number;
  numberDecimalDigits: number;
  /** .NET-style pattern index for negative currency, e.g. 0 => ($n). */
  currencyNegativePattern: number;
  /** .NET-style pattern index for positive currency, e.g. 0 => $n. */
  currencyPositivePattern: number;
  numberNegativePattern: number;
}

/* ------------------------------------------------------------------ *
 * Grouping and aggregation
 * ------------------------------------------------------------------ */

/** Stable identity for a group. `key` is what we bucket on. */
export interface GroupKey {
  /** Stable string used for bucketing and React keys. */
  key: string;
  /** Human label, already localised/formatted. */
  label: string;
  /** Raw value for building the scoped "expand this group" query. */
  rawValue: string | number | boolean | null;
  /** True for the null/empty bucket, which always sorts last. */
  isEmpty: boolean;
}

/** Totals for one column within one group. */
export interface ColumnTotal {
  columnName: string;
  /**
   * Sum in the column's natural unit: minutes for duration, major currency
   * units for money, the raw value for decimal/integer. Null means "no
   * numeric values contributed" (distinct from zero).
   */
  value: number | null;
  /** True when we substituted the base-currency sum. See MixedCurrency. */
  usedBaseCurrency?: boolean;
}

export interface GroupAggregate {
  key: GroupKey;
  recordCount: number;
  totals: Record<string, ColumnTotal>;
}

export interface AggregateResult {
  groups: GroupAggregate[];
  grandTotal: GroupAggregate;
  /** Where the numbers came from, for the UI to disclose honestly. */
  source: "server" | "client";
  /** True when the client path hit maxClientRows and totals are partial. */
  partial: boolean;
  /** Number of partitions used, when the aggregate limit forced a split. */
  partitions?: number;
}

/* ------------------------------------------------------------------ *
 * Query identity
 * ------------------------------------------------------------------ */

/**
 * The inputs that actually change the answer. updateView fires far more often
 * than any of these change, so totals are only recomputed when the hash of this
 * shape changes. See core/queryHash.ts.
 */
export interface QueryIdentity {
  viewId: string;
  entityName: string;
  filterJson: string;
  searchTerm: string;
  linkedEntitiesJson: string;
  groupByColumn: string;
  aggregateColumns: string[];
}

/* ------------------------------------------------------------------ *
 * Errors
 * ------------------------------------------------------------------ */

export type AggregateFailureReason =
  | "aggregate-limit"
  | "unsupported-grouping"
  | "network"
  | "unknown";

export class AggregateError extends Error {
  constructor(
    public readonly reason: AggregateFailureReason,
    message: string,
    public readonly inner?: unknown
  ) {
    super(message);
    this.name = "AggregateError";
  }
}

/**
 * Choose which columns to total.
 *
 * Pulled out of the component and into core/ after a live bug: the caller
 * always passes an array, and an EMPTY array is truthy, so a
 * `explicit ? filterByList : autoDetect` check took the explicit branch every
 * time and matched nothing. Auto-detection never ran, and no view ever showed
 * a total. Emptiness has to be tested by length, and it is now tested by tests.
 *
 * `explicitNames` empty means "auto-detect every totalable column".
 */
export function selectTotalColumns(
  columns: readonly GridColumn[],
  explicitNames: readonly string[] | undefined,
  hidden: ReadonlySet<string> = new Set()
): GridColumn[] {
  const explicit = (explicitNames ?? []).map((n) => n.trim()).filter((n) => n.length > 0);

  const candidates =
    explicit.length > 0
      ? columns.filter((c) => explicit.includes(c.name) && isTotalableType(c.dataType))
      : columns.filter((c) => isTotalableType(c.dataType));

  return candidates.filter((c) => !hidden.has(c.name));
}
