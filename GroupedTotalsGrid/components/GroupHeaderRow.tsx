/**
 * The group header row - one of the two elements with no native counterpart.
 *
 * Design constraint from the parity brief: it must read as native rather than
 * invented. So it uses the standard cell font size, the neutral secondary
 * surface, the same chevron as the native nested-grid expander, and no accent
 * colours or badges. Totals sit in the same columns as the cells they total.
 */

import * as React from "react";
import { ChevronRight, ChevronDown, Info } from "./icons/Icons";
import { Tooltip } from "@fluentui/react-components";
import { useGridStyles } from "../styles/useGridStyles";
import { GridColumn, GroupAggregate, isTotalableType } from "../core/types";
import { columnFlex, spanFlex } from "./columnLayout";

export interface GroupHeaderRowProps {
  group: GroupAggregate;
  columns: readonly GridColumn[];
  factors: Record<string, number>;
  expanded: boolean;
  compact: boolean;
  showRecordCounts: boolean;
  multiSelect: boolean;
  /** Pre-formatted totals by column - formatting happens once, upstream. */
  formattedTotals: Record<string, string>;
  baseCurrencyNotice: string;
  countLabel: (n: number) => string;
  onToggle: (groupKey: string) => void;
  stickyTop: number;
  level?: number;
}

export const GroupHeaderRow: React.FC<GroupHeaderRowProps> = (props) => {
  const styles = useGridStyles();
  const { group } = props;

  // The label occupies the leading columns up to the first totalled column, so
  // long resource names have room without pushing the numbers out of alignment.
  const firstTotalIndex = props.columns.findIndex((c) => props.formattedTotals[c.name] !== undefined);
  const labelSpan = firstTotalIndex === -1 ? props.columns.length : Math.max(1, firstTotalIndex);
  const labelFlex = spanFlex(props.columns.slice(0, labelSpan).map((c) => props.factors[c.name]));

  return (
    <div
      role="row"
      aria-expanded={props.expanded}
      aria-level={props.level ?? 1}
      className={`${styles.groupRow} ${props.compact ? styles.rowCompact : styles.rowComfortable}`}
      style={{ top: props.stickyTop }}
      tabIndex={0}
      onClick={() => props.onToggle(group.key.key)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          props.onToggle(group.key.key);
        }
        if (e.key === "ArrowRight" && !props.expanded) props.onToggle(group.key.key);
        if (e.key === "ArrowLeft" && props.expanded) props.onToggle(group.key.key);
      }}
    >
      {props.multiSelect && <div className={styles.checkboxCell} role="gridcell" />}

      <div
        role="gridcell"
        className={styles.groupLabel}
        style={labelFlex}
        title={group.key.label}
      >
        {props.expanded ? <ChevronDown /> : <ChevronRight />}
        <span>{group.key.label}</span>
        {props.showRecordCounts && (
          <span className={styles.groupCount}>{props.countLabel(group.recordCount)}</span>
        )}
      </div>

      {props.columns.slice(labelSpan).map((column) => {
        const total = props.formattedTotals[column.name];
        const numeric = isTotalableType(column.dataType);
        const usedBase = group.totals[column.name]?.usedBaseCurrency;
        return (
          <div
            key={column.name}
            role="gridcell"
            className={`${styles.cell} ${numeric ? styles.cellNumeric : ""}`}
            style={columnFlex(props.factors[column.name])}
          >
            {total ?? ""}
            {usedBase && (
              <Tooltip content={props.baseCurrencyNotice} relationship="label">
                <Info className={styles.warningIcon} />
              </Tooltip>
            )}
          </div>
        );
      })}
    </div>
  );
};
