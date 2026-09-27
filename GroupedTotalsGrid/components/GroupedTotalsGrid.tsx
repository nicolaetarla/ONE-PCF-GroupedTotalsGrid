/**
 * Root component.
 *
 * Composition, not logic: rows come from useDatasetRows, formats from
 * useColumnFormats, totals from useAggregates, and this file arranges them.
 * Anything resembling a calculation belongs in core/ where it can be tested.
 */

import * as React from "react";
import { Button, FluentProvider, Theme, webLightTheme, mergeClasses } from "@fluentui/react-components";
import { ChevronUpDown } from "./icons/Icons";

import { useGridStyles } from "../styles/useGridStyles";
import { DataRow } from "./DataRow";
import { GroupHeaderRow } from "./GroupHeaderRow";
import { TotalsFooter } from "./TotalsFooter";
import { ColumnHeaderMenu, HeaderStrings } from "./ColumnHeaderMenu";
import { EmptyState, ErrorBar, LoadingRows } from "./States";
import { NavigationTypes } from "./cells/CellRenderer";

import { useDatasetRows } from "../hooks/useDatasetRows";
import { useColumnFormats, readNumberFormattingInfo } from "../hooks/useColumnFormats";
import { useAggregates } from "../hooks/useAggregates";

import { AggregationRow, AggregationSpec, toNumber } from "../core/aggregation";
import { GroupBySpec } from "../core/fetchXmlBuilder";
import { formatTotal } from "../core/formatters/totalFormatter";
import { buildTotalsTsv } from "../core/totalsTsv";
import { DurationWords } from "../core/formatters/durationFormatter";
import { sortGroups, GroupSortMode, isRowInGroup } from "../core/groupKey";
import {
  groupingStorageKey,
  NO_GROUPING,
  readStoredGrouping,
  resolveGroupingColumn,
  writeStoredGrouping
} from "../core/groupingPreference";
import { columnFlex } from "./columnLayout";
import { HEADER_HEIGHT } from "../core/nativeGridMetrics";
import {
  DurationShape,
  GridColumn,
  GroupAggregate,
  isTotalableType,
  selectTotalColumns
} from "../core/types";

type DataSet = ComponentFramework.PropertyTypes.DataSet;
type Context = ComponentFramework.Context<unknown>;

export interface GridStrings extends HeaderStrings {
  emptyGroupLabel: string;
  noRecords: string;
  grandTotal: string;
  recordCount: (n: number) => string;
  baseCurrencyNotice: string;
  partialTotalsNotice: string;
  aggregateLimitTitle: string;
  aggregateLimitMessage: string;
  copyTotals: string;
  totalsCopied: string;
  copyFailed: string;
  recordsColumn: string;
  duration: DurationWords;
}

export interface GroupedTotalsGridProps {
  context: Context;
  dataset: DataSet;
  entityName: string;
  primaryIdAttribute: string;
  theme?: Theme;
  strings: GridStrings;

  groupByColumn?: string;
  allowRuntimeGroupChange: boolean;
  aggregateColumns?: string[];
  showGrandTotal: boolean;
  groupsInitiallyCollapsed: boolean;
  showRecordCounts: boolean;
  durationDisplay?: DurationShape;
  totalsMode: "Auto" | "ServerAggregate" | "ClientOnly";
  maxClientRows: number;
  navigationTypesAllowed: NavigationTypes;
  enableOptionSetColors: boolean;
  rowDensity: "Platform" | "Comfortable" | "Compact";
  debug: boolean;

  onOpenRecord: (recordId: string) => void;
  onOpenLookup: (entityName: string, id: string) => void;
  onSelectionChange: (recordIds: string[]) => void;
  onSort: (columnName: string, descending: boolean) => void;
  width: number;
}

const NARROW_BREAKPOINT = 480;

function readColumns(dataset: DataSet): GridColumn[] {
  return [...(dataset.columns ?? [])]
    .filter((c) => !c.isHidden)
    .sort((a, b) => a.order - b.order)
    .map((c) => ({
      name: c.name,
      displayName: c.displayName,
      dataType: c.dataType,
      order: c.order,
      visualSizeFactor: c.visualSizeFactor,
      isPrimary: !!(c as unknown as { isPrimary?: boolean }).isPrimary
    }));
}

export const GroupedTotalsGrid: React.FC<GroupedTotalsGridProps> = (props) => {
  const styles = useGridStyles();
  const { dataset, context, strings } = props;

  const columns = React.useMemo(() => readColumns(dataset), [dataset, dataset.columns]);
  const compact = props.rowDensity === "Compact";


  /* ---- grouping selection ------------------------------------------- */
  // The user's own choice wins over the maker's configured column, and it is
  // remembered per entity + view across reloads. This is what makes the
  // groupByColumn property optional rather than required.
  const storageKey = React.useMemo(
    () => groupingStorageKey(props.entityName, dataset.getViewId?.() ?? ""),
    [props.entityName, dataset]
  );

  const [runtimeGroupBy, setRuntimeGroupByState] = React.useState<string | undefined>(() =>
    readStoredGrouping(storageKey)
  );

  // Switching views must load that view's own preference, not carry the last
  // one across - a column that exists on one view often does not on another.
  React.useEffect(() => {
    setRuntimeGroupByState(readStoredGrouping(storageKey));
  }, [storageKey]);

  const setRuntimeGroupBy = React.useCallback(
    (columnName: string | undefined) => {
      // undefined from the menu means "remove grouping", which is a choice and
      // must be stored as one - clearing the key would just fall back to the
      // maker's configured column on the next render.
      const next = columnName ?? NO_GROUPING;
      setRuntimeGroupByState(next);
      writeStoredGrouping(storageKey, next);
    },
    [storageKey]
  );

  const groupByName = resolveGroupingColumn(runtimeGroupBy, props.groupByColumn, columns);
  const groupByColumn = columns.find((c) => c.name === groupByName);

  const groupBy: GroupBySpec | undefined = React.useMemo(() => {
    if (!groupByColumn) return undefined;
    const isLookup = groupByColumn.dataType.startsWith("Lookup.");
    return {
      logicalName: groupByColumn.name,
      dataType: groupByColumn.dataType,
      // Populated by index.ts from metadata; without it we still group, we just
      // fall back to the formatted value for the label.
      lookupTargetEntity: isLookup ? groupByColumn.lookupTargetEntity : undefined,
      lookupTargetNameAttribute: isLookup ? "name" : undefined
    };
  }, [groupByColumn]);

  /* ---- which columns get totalled ------------------------------------ */
  const [hiddenTotals, setHiddenTotals] = React.useState<Set<string>>(new Set());

  const totalColumns = React.useMemo(
    () => selectTotalColumns(columns, props.aggregateColumns, hiddenTotals),
    [columns, props.aggregateColumns, hiddenTotals]
  );

  /* ---- data ----------------------------------------------------------- */
  // With debug logging on, report exactly what the control decided and why.
  // "No totals appear" has several possible causes - no totalable column in the
  // view, a column excluded by configuration, or a type we do not recognise -
  // and they are indistinguishable from the rendered output.
  React.useEffect(() => {
    if (!props.debug) return;
    /* eslint-disable no-console */
    console.groupCollapsed("[GroupedTotalsGrid] column analysis");
    console.table(
      columns.map((c) => ({
        logicalName: c.name,
        displayName: c.displayName,
        dataType: c.dataType,
        totalable: isTotalableType(c.dataType),
        totalled: totalColumns.some((t) => t.name === c.name)
      }))
    );
    console.log("grouping by:", groupByName ?? "(none - pick from a column header menu)");
    if (totalColumns.length === 0) {
      console.warn(
        "No columns are being totalled. Either the view contains no Currency, " +
          "Decimal, FP, Whole.None or Whole.Duration column, or the " +
          "'Columns to total' property excludes them all."
      );
    }
    console.groupEnd();
    /* eslint-enable no-console */
  }, [props.debug, columns, totalColumns, groupByName]);

  const rows = useDatasetRows(dataset, props.maxClientRows);

  const formats = useColumnFormats(
    context,
    dataset,
    props.entityName,
    totalColumns,
    rows.recordIds,
    props.durationDisplay
  );

  const spec: AggregationSpec = React.useMemo(
    () => ({
      columns: totalColumns.map((c) => c.name),
      precisionByColumn: Object.fromEntries(
        totalColumns.map((c) => [c.name, formats[c.name]?.precision ?? 2])
      ),
      currencyColumns: new Set(totalColumns.filter((c) => c.dataType === "Currency").map((c) => c.name)),
      emptyGroupLabel: strings.emptyGroupLabel
    }),
    [totalColumns, formats, strings.emptyGroupLabel]
  );

  const clientRows: AggregationRow[] = React.useMemo(() => {
    return rows.recordIds.map((id) => {
      const record = dataset.records[id];
      const values: Record<string, number | null> = {};
      const baseValues: Record<string, number | null> = {};
      for (const c of totalColumns) {
        values[c.name] = toNumber(record?.getValue(c.name));
        baseValues[c.name] = toNumber(record?.getValue(`${c.name}_base`));
      }
      const currency = record?.getValue("transactioncurrencyid") as
        | { id?: { guid?: string } | string }
        | undefined;
      const currencyId =
        typeof currency?.id === "string" ? currency.id : currency?.id?.guid ?? undefined;

      // With no grouping column every record lands in one bucket, which is
      // what the ungrouped flat rendering below expects.
      const group = groupByColumn
        ? {
            raw: record?.getValue(groupByColumn.name),
            formatted: record?.getFormattedValue(groupByColumn.name),
            dataType: groupByColumn.dataType
          }
        : { raw: null, formatted: undefined, dataType: "SingleLine.Text" };

      return { recordId: id, group, values, baseValues, currencyId };
    });
  }, [rows.recordIds, dataset, totalColumns, groupByColumn]);

  const aggregates = useAggregates({
    context,
    dataset,
    entityName: props.entityName,
    primaryIdAttribute: props.primaryIdAttribute,
    groupBy,
    spec,
    totalsMode: props.totalsMode,
    clientRows,
    clientCapped: rows.capped,
    debug: props.debug
  });

  /* ---- layout --------------------------------------------------------- */
  const [sortMode, setSortMode] = React.useState<GroupSortMode>("label-asc");
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());

  React.useEffect(() => {
    if (!props.groupsInitiallyCollapsed && aggregates.result) {
      setExpanded(new Set(aggregates.result.groups.map((g) => g.key.key)));
    }
  }, [props.groupsInitiallyCollapsed, aggregates.result]);

  const rootRef = React.useRef<HTMLDivElement>(null);
  const [measuredWidth, setMeasuredWidth] = React.useState(0);

  // Only used for the narrow-width card reflow now that columns are flex-sized.
  // allocatedWidth is 0 or -1 until the host reports a size, and some dashboard
  // tiles never report at all.
  React.useEffect(() => {
    const element = rootRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect?.width ?? 0;
      if (width > 0) setMeasuredWidth(width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Flex weights straight from the view layout. No pixel maths, so the row is
  // always exactly the width of the scrollport and the header cannot drift out
  // of alignment with the body.
  const factors = React.useMemo(() => {
    const out: Record<string, number> = {};
    for (const c of columns) out[c.name] = c.visualSizeFactor || 100;
    return out;
  }, [columns]);

  const effectiveWidth = measuredWidth > 0 ? measuredWidth : props.width;
  const narrow = effectiveWidth > 0 && effectiveWidth < NARROW_BREAKPOINT;

  const info = React.useMemo(() => readNumberFormattingInfo(context), [context]);

  const formatGroupTotals = React.useCallback(
    (group: GroupAggregate): Record<string, string> => {
      const out: Record<string, string> = {};
      for (const column of totalColumns) {
        const format = formats[column.name];
        if (!format) continue;
        out[column.name] = formatTotal(group.totals[column.name]?.value ?? null, {
          format,
          info,
          words: strings.duration,
          platform: context.formatting
        });
      }
      return out;
    },
    [totalColumns, formats, info, strings.duration, context.formatting]
  );

  /* ---- selection ------------------------------------------------------ */
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const toggleSelect = React.useCallback(
    (recordId: string, additive: boolean) => {
      setSelected((prev) => {
        const next = additive ? new Set(prev) : new Set<string>();
        if (next.has(recordId)) next.delete(recordId);
        else next.add(recordId);
        props.onSelectionChange([...next]);
        return next;
      });
    },
    [props]
  );

  const sortedGroups = React.useMemo(() => {
    if (!aggregates.result) return [];
    const first = totalColumns[0]?.name;
    return sortGroups(aggregates.result.groups, sortMode, (g) =>
      first ? g.totals[first]?.value ?? 0 : 0
    );
  }, [aggregates.result, sortMode, totalColumns]);

  /* ---- copy totals ------------------------------------------------------ */
  // Export to Excel sees only the flat view, so this is how grouped totals get
  // out of the control. The status message is announced via the aria-live span.
  const [copyStatus, setCopyStatus] = React.useState<string | undefined>();

  React.useEffect(() => {
    if (!copyStatus) return;
    const timer = setTimeout(() => setCopyStatus(undefined), 3000);
    return () => clearTimeout(timer);
  }, [copyStatus]);

  const copyTotals = React.useCallback(async () => {
    if (!aggregates.result || !groupByColumn) return;
    const text = buildTotalsTsv({
      groupColumnLabel: groupByColumn.displayName,
      countLabel: strings.recordsColumn,
      columns: totalColumns,
      groups: sortedGroups.map((g) => ({
        label: g.key.label,
        recordCount: g.recordCount,
        formattedTotals: formatGroupTotals(g)
      })),
      grandTotal: props.showGrandTotal
        ? {
            label: strings.grandTotal,
            recordCount: aggregates.result.grandTotal.recordCount,
            formattedTotals: formatGroupTotals(aggregates.result.grandTotal)
          }
        : undefined,
      partialNotice: aggregates.result.partial ? strings.partialTotalsNotice : undefined
    });
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus(strings.totalsCopied);
    } catch {
      setCopyStatus(strings.copyFailed);
    }
  }, [aggregates.result, groupByColumn, totalColumns, sortedGroups, formatGroupTotals, props.showGrandTotal, strings]);

  /* ---- render --------------------------------------------------------- */
  const theme = props.theme ?? webLightTheme;

  return (
    <FluentProvider theme={theme} className={styles.provider}>
      <div className={styles.root} ref={rootRef}>
      {aggregates.error === "aggregate-limit" && (
        <ErrorBar title={strings.aggregateLimitTitle} message={strings.aggregateLimitMessage} />
      )}

      {/*
        The header lives INSIDE the scroller so it scrolls horizontally with
        the body - outside it, the two desynchronised the moment anything
        scrolled sideways. It stays pinned vertically via position: sticky.
      */}
      <div className={styles.scroller} role="treegrid" aria-rowcount={rows.totalResultCount}>
      <div className={styles.headerRow} role="row">
        <div className={styles.checkboxCell} />
        {columns.map((column) => {
          const numeric = isTotalableType(column.dataType);
          return (
            <ColumnHeaderMenu
              key={column.name}
              column={column}
              strings={strings}
              isGrouped={groupByName === column.name}
              isTotalled={totalColumns.some((c) => c.name === column.name)}
              allowGrouping={props.allowRuntimeGroupChange}
              onSort={(name, descending) => {
                if (name === groupByName) setSortMode(descending ? "label-desc" : "label-asc");
                else props.onSort(name, descending);
              }}
              onGroupBy={(name) => setRuntimeGroupBy(name)}
              onToggleTotal={(name) =>
                setHiddenTotals((prev) => {
                  const next = new Set(prev);
                  if (next.has(name)) next.delete(name);
                  else next.add(name);
                  return next;
                })
              }
            >
              <div
                role="columnheader"
                className={mergeClasses(styles.headerCell, numeric && styles.headerCellNumeric)}
                style={columnFlex(factors[column.name])}
                title={column.displayName}
              >
                {column.displayName}
                <ChevronUpDown />
              </div>
            </ColumnHeaderMenu>
          );
        })}
      </div>

        {rows.loading && !aggregates.result && <LoadingRows compact={compact} />}

        {!rows.loading && rows.recordIds.length === 0 && <EmptyState message={strings.noRecords} />}

        {/*
          Ungrouped: a plain list of rows. Before this existed, rows were only
          ever rendered inside a group, so a grid with no grouping column
          resolved rendered an empty body while the footer cheerfully reported
          the record count.
        */}
        {!narrow &&
          !groupByColumn &&
          clientRows.map((r, index) => (
            <DataRow
              key={r.recordId}
              recordId={r.recordId}
              rowIndex={index + 1}
              columns={columns}
              factors={factors}
              getFormatted={(id, col) => dataset.records[id]?.getFormattedValue(col) ?? ""}
              getRaw={(id, col) => dataset.records[id]?.getValue(col)}
              selected={selected.has(r.recordId)}
              compact={compact}
              multiSelect
              navigationTypesAllowed={props.navigationTypesAllowed}
              enableOptionSetColors={props.enableOptionSetColors}
              onToggleSelect={toggleSelect}
              onOpenRecord={props.onOpenRecord}
              onOpenLookup={props.onOpenLookup}
            />
          ))}

        {!narrow &&
          groupByColumn &&
          sortedGroups.map((group) => {
            const isExpanded = expanded.has(group.key.key);
            return (
              <React.Fragment key={group.key.key}>
                <GroupHeaderRow
                  group={group}
                  columns={columns}
                  factors={factors}
                  expanded={isExpanded}
                  compact={compact}
                  showRecordCounts={props.showRecordCounts}
                  multiSelect
                  formattedTotals={formatGroupTotals(group)}
                  baseCurrencyNotice={strings.baseCurrencyNotice}
                  countLabel={strings.recordCount}
                  stickyTop={HEADER_HEIGHT}
                  onToggle={(key) =>
                    setExpanded((prev) => {
                      const next = new Set(prev);
                      if (next.has(key)) next.delete(key);
                      else next.add(key);
                      return next;
                    })
                  }
                />

                {isExpanded &&
                  clientRows
                    .filter((r) => isRowInGroup(r.group, group.key, strings.emptyGroupLabel))
                    .map((r, index) => (
                      <DataRow
                        key={r.recordId}
                        recordId={r.recordId}
                        rowIndex={index + 1}
                        columns={columns}
                        factors={factors}
                        getFormatted={(id, col) => dataset.records[id]?.getFormattedValue(col) ?? ""}
                        getRaw={(id, col) => dataset.records[id]?.getValue(col)}
                        selected={selected.has(r.recordId)}
                        compact={compact}
                        multiSelect
                        navigationTypesAllowed={props.navigationTypesAllowed}
                        enableOptionSetColors={props.enableOptionSetColors}
                        onToggleSelect={toggleSelect}
                        onOpenRecord={props.onOpenRecord}
                        onOpenLookup={props.onOpenLookup}
                      />
                    ))}
              </React.Fragment>
            );
          })}

        {narrow &&
          sortedGroups.map((group) => {
            const totals = formatGroupTotals(group);
            return (
              <div key={group.key.key} className={styles.card}>
                <div className={styles.cardPrimary}>{group.key.label}</div>
                <div className={styles.cardSecondary}>
                  {totalColumns.map((c) => `${c.displayName}: ${totals[c.name] ?? ""}`).join(" · ")}
                </div>
                <div className={styles.cardSecondary}>{strings.recordCount(group.recordCount)}</div>
              </div>
            );
          })}

        {props.showGrandTotal &&
          aggregates.result &&
          !narrow &&
          (groupByColumn ? sortedGroups.length > 0 : clientRows.length > 0) && (
          <TotalsFooter
            grandTotal={aggregates.result.grandTotal}
            columns={columns}
            factors={factors}
            formattedTotals={formatGroupTotals(aggregates.result.grandTotal)}
            compact={compact}
            multiSelect
            label={strings.grandTotal}
            baseCurrencyNotice={strings.baseCurrencyNotice}
            partialNotice={aggregates.result.partial ? strings.partialTotalsNotice : undefined}
          />
          )}
      </div>

      <div className={styles.footer}>
        <span>{strings.recordCount(rows.totalResultCount)}</span>
        <span aria-live="polite">
          {copyStatus ??
            (aggregates.result?.source === "server" ? "" : aggregates.result?.partial ? strings.partialTotalsNotice : "")}
        </span>
        {groupByColumn && sortedGroups.length > 0 && (
          <Button appearance="subtle" size="small" onClick={() => void copyTotals()}>
            {strings.copyTotals}
          </Button>
        )}
      </div>
      </div>
    </FluentProvider>
  );
};
