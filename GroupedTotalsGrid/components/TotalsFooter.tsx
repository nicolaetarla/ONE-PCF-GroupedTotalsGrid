/**
 * The pinned grand-total row. Same row height and column alignment as the data
 * rows, semibold values, a divider above, and the standard Fluent elevation so
 * it reads as pinned rather than as a stray row.
 */

import * as React from "react";
import { Info } from "./icons/Icons";
import { Tooltip } from "@fluentui/react-components";
import { useGridStyles } from "../styles/useGridStyles";
import { GridColumn, GroupAggregate, isTotalableType } from "../core/types";
import { columnFlex, spanFlex } from "./columnLayout";

export interface TotalsFooterProps {
  grandTotal: GroupAggregate;
  columns: readonly GridColumn[];
  factors: Record<string, number>;
  formattedTotals: Record<string, string>;
  compact: boolean;
  multiSelect: boolean;
  label: string;
  baseCurrencyNotice: string;
  /** Set when totals cover only the loaded rows - disclosed, never hidden. */
  partialNotice?: string;
}

export const TotalsFooter: React.FC<TotalsFooterProps> = (props) => {
  const styles = useGridStyles();

  const firstTotalIndex = props.columns.findIndex((c) => props.formattedTotals[c.name] !== undefined);
  const labelSpan = firstTotalIndex === -1 ? props.columns.length : Math.max(1, firstTotalIndex);
  const labelFlex = spanFlex(props.columns.slice(0, labelSpan).map((c) => props.factors[c.name]));

  return (
    <div
      role="row"
      className={`${styles.totalsRow} ${props.compact ? styles.rowCompact : styles.rowComfortable}`}
    >
      {props.multiSelect && <div className={styles.checkboxCell} role="gridcell" />}
      <div className={styles.cell} role="gridcell" style={labelFlex}>
        {props.label}
        {props.partialNotice && (
          <Tooltip content={props.partialNotice} relationship="label">
            <Info className={styles.warningIcon} />
          </Tooltip>
        )}
      </div>

      {props.columns.slice(labelSpan).map((column) => {
        const numeric = isTotalableType(column.dataType);
        const usedBase = props.grandTotal.totals[column.name]?.usedBaseCurrency;
        return (
          <div
            key={column.name}
            role="gridcell"
            aria-label={`${column.displayName} ${props.label}`}
            className={`${styles.cell} ${numeric ? styles.cellNumeric : ""}`}
            style={columnFlex(props.factors[column.name])}
          >
            {props.formattedTotals[column.name] ?? ""}
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
