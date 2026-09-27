/**
 * Where the totals actually come from.
 *
 * Server path by default: retrieve the view's FetchXML, layer the runtime
 * filter on top, ask the server to group and sum. Falls back to summing the
 * loaded rows when the aggregate query cannot run, and always reports which
 * path produced the numbers so the UI can be honest about it.
 */

import * as React from "react";
import { aggregateRows, AggregationRow, AggregationSpec, mergePartitions } from "../core/aggregation";
import { ALIASES, buildAggregateFetchXml, GroupBySpec } from "../core/fetchXmlBuilder";
import {
  isAggregateLimitError,
  partitionByDate,
  partitionFilterXml,
  runWithConcurrency,
  withPartitionRetry
} from "../core/fetchXmlPartitioner";
import { createDebouncer, queryHash } from "../core/queryHash";
import { AggregateResult, GroupAggregate, GroupKey, QueryIdentity } from "../core/types";
import { serverGroupKey } from "../core/groupKey";
import { toNumber } from "../core/aggregation";
import { filterExpressionToFetchXml } from "../core/filterTranslator";

type DataSet = ComponentFramework.PropertyTypes.DataSet;
type Context = ComponentFramework.Context<unknown>;

const DEBOUNCE_MS = 300;
const MAX_CONCURRENT_PARTITIONS = 4;

export interface UseAggregatesOptions {
  context: Context;
  dataset: DataSet;
  entityName: string;
  primaryIdAttribute: string;
  groupBy: GroupBySpec | undefined;
  spec: AggregationSpec;
  totalsMode: "Auto" | "ServerAggregate" | "ClientOnly";
  clientRows: readonly AggregationRow[];
  clientCapped: boolean;
  /** Date attribute used to partition when the aggregate limit is hit. */
  partitionAttribute?: string;
  partitionRange?: { from: Date; to: Date };
  debug: boolean;
}

export interface AggregateState {
  result: AggregateResult | undefined;
  loading: boolean;
  error: string | undefined;
}

/** Serialise the runtime filter so it can be hashed and diffed. */
function filterToJson(dataset: DataSet): string {
  try {
    return JSON.stringify(dataset.filtering.getFilter() ?? {});
  } catch {
    return "";
  }
}

async function retrieveViewFetchXml(context: Context, viewId: string): Promise<string | undefined> {
  for (const table of ["savedquery", "userquery"]) {
    try {
      const record = await context.webAPI.retrieveRecord(table, viewId, "?$select=fetchxml");
      const xml = (record as unknown as { fetchxml?: string }).fetchxml;
      if (xml) return xml;
    } catch {
      // Try the other table; a personal view is not in savedquery and vice versa.
    }
  }
  return undefined;
}

/** Read one aggregate row into our shape. */
function readAggregateRow(
  raw: Record<string, unknown>,
  spec: AggregationSpec,
  aliasByColumn: Record<string, string>,
  emptyLabel: string,
  groupByDataType: string
): { key: GroupKey; group: GroupAggregate; currencyId?: string } {
  const groupValue = raw[ALIASES.group];

  // The lookup join supplies a name; for every other type the formatted-value
  // annotation carries the label (the choice label, the boolean label, and so
  // on). Falling back to the raw value would show option codes to users.
  const groupName =
    (raw[ALIASES.groupName] as string | undefined) ??
    (raw[`${ALIASES.group}@OData.Community.Display.V1.FormattedValue`] as string | undefined);

  // Keys MUST match what resolveGroupKey produces client-side, or rows never
  // land under their group header.
  const key = serverGroupKey(groupByDataType, groupValue, groupName, emptyLabel);

  const totals: GroupAggregate["totals"] = {};
  for (const column of spec.columns) {
    totals[column] = { columnName: column, value: toNumber(raw[aliasByColumn[column]]) };
  }

  return {
    key,
    group: { key, recordCount: Number(raw[ALIASES.count] ?? 0), totals },
    currencyId: raw[ALIASES.currency] ? String(raw[ALIASES.currency]) : undefined
  };
}

export function useAggregates(options: UseAggregatesOptions): AggregateState {
  const {
    context,
    dataset,
    entityName,
    groupBy,
    spec,
    totalsMode,
    clientRows,
    clientCapped,
    debug
  } = options;

  const [state, setState] = React.useState<AggregateState>({
    result: undefined,
    loading: true,
    error: undefined
  });

  const debouncer = React.useMemo(() => createDebouncer(DEBOUNCE_MS), []);
  const inFlight = React.useRef(0);

  const identity: QueryIdentity = React.useMemo(
    () => ({
      viewId: dataset.getViewId?.() ?? "",
      entityName,
      filterJson: filterToJson(dataset),
      searchTerm: (dataset as unknown as { searchQuery?: string }).searchQuery ?? "",
      linkedEntitiesJson: (() => {
        try {
          return JSON.stringify(dataset.linking?.getLinkedEntities?.() ?? []);
        } catch {
          return "[]";
        }
      })(),
      groupByColumn: groupBy?.logicalName ?? "",
      aggregateColumns: [...spec.columns]
    }),
    [dataset, entityName, groupBy?.logicalName, spec.columns]
  );

  const hash = queryHash(identity);

  const computeClient = React.useCallback((): AggregateResult => {
    const result = aggregateRows(clientRows, spec, clientCapped);
    return result;
  }, [clientRows, spec, clientCapped]);

  React.useEffect(() => {
    if (!groupBy || spec.columns.length === 0) {
      setState({ result: computeClient(), loading: false, error: undefined });
      return;
    }

    if (totalsMode === "ClientOnly") {
      setState({ result: computeClient(), loading: false, error: undefined });
      return;
    }

    const token = ++inFlight.current;
    setState((s) => ({ ...s, loading: true }));

    debouncer.run(() => {
      void (async () => {
        try {
          const viewId = identity.viewId;
          if (!viewId) throw new Error("No view id available");

          const viewFetchXml = await retrieveViewFetchXml(context, viewId);
          if (!viewFetchXml) throw new Error("Could not retrieve view FetchXML");

          const runtimeFilterXml = filterExpressionToFetchXml(dataset.filtering.getFilter());
          if (runtimeFilterXml === undefined) {
            // An operator we cannot translate. Falling back is the honest move:
            // an aggregate missing a filter would disagree with the rows.
            throw new Error("Unsupported runtime filter operator");
          }

          const aliasByColumn: Record<string, string> = {};
          spec.columns.forEach((c, i) => (aliasByColumn[c] = `gtg_agg_${i}`));

          const runQuery = async (extraFilterXml?: string): Promise<AggregateResult> => {
            const xml = buildAggregateFetchXml({
              entityName,
              viewFetchXml,
              primaryIdAttribute: options.primaryIdAttribute,
              groupBy,
              aggregates: spec.columns.map((c) => ({
                logicalName: c,
                alias: aliasByColumn[c],
                isMoney: spec.currencyColumns.has(c)
              })),
              runtimeFilterXml: [runtimeFilterXml, extraFilterXml].filter(Boolean).join(""),
              includeCount: true,
              detectMixedCurrency: spec.currencyColumns.size > 0
            });

            const response = await context.webAPI.retrieveMultipleRecords(
              entityName,
              `?fetchXml=${encodeURIComponent(xml)}`
            );

            const groups = new Map<string, GroupAggregate>();
            let count = 0;
            for (const entity of response.entities as unknown as Array<Record<string, unknown>>) {
              const parsed = readAggregateRow(
                entity,
                spec,
                aliasByColumn,
                spec.emptyGroupLabel,
                groupBy.dataType
              );
              const existing = groups.get(parsed.key.key);
              groups.set(
                parsed.key.key,
                existing
                  ? mergePartitions(
                      [
                        { groups: [existing], grandTotal: existing, source: "server", partial: false },
                        { groups: [parsed.group], grandTotal: parsed.group, source: "server", partial: false }
                      ],
                      spec
                    ).groups[0]
                  : parsed.group
              );
              count += parsed.group.recordCount;
            }

            const list = Array.from(groups.values());
            const grand = mergePartitions(
              list.map((g) => ({ groups: [], grandTotal: g, source: "server" as const, partial: false })),
              spec
            ).grandTotal;

            return {
              groups: list,
              grandTotal: { ...grand, recordCount: count },
              source: "server",
              partial: false
            };
          };

          const result = await withPartitionRetry(async (partitions) => {
            if (partitions === 1) return runQuery();
            if (!options.partitionAttribute || !options.partitionRange) {
              throw new Error("Aggregate limit exceeded and no partition key available");
            }
            const specs = partitionByDate(options.partitionAttribute, options.partitionRange, partitions);
            const parts = await runWithConcurrency(specs, MAX_CONCURRENT_PARTITIONS, (p) =>
              runQuery(partitionFilterXml(p))
            );
            return mergePartitions(parts, spec);
          });

          if (token !== inFlight.current) return; // superseded
          setState({ result, loading: false, error: undefined });
        } catch (error) {
          if (token !== inFlight.current) return;
          if (debug) {
            console.warn("[GroupedTotalsGrid] server aggregate failed, using client totals", error);
          }
          if (totalsMode === "ServerAggregate") {
            setState({
              result: undefined,
              loading: false,
              error: isAggregateLimitError(error)
                ? "aggregate-limit"
                : (error as Error)?.message ?? "unknown"
            });
            return;
          }
          setState({ result: computeClient(), loading: false, error: undefined });
        }
      })();
    });

    return () => debouncer.cancel();
    // The dependency list is intentionally narrow. `hash` is the gate: it
    // already encodes view, filter, search, grouping and aggregate columns, so
    // adding `context`, `dataset` or `groupBy` here would re-fire the effect on
    // every updateView - which is the exact behaviour the hash exists to
    // prevent. Do not "fix" this list without reading core/queryHash.ts.
  }, [hash, totalsMode, computeClient]);

  return state;
}
