/**
 * A single record row. Kept dumb and memoised - it re-renders on every scroll
 * tick otherwise, which is what makes large groups feel sluggish.
 */

import * as React from "react";
import { Checkbox, mergeClasses } from "@fluentui/react-components";
import { useGridStyles } from "../styles/useGridStyles";
import { CellRenderer, NavigationTypes } from "./cells/CellRenderer";
import { GridColumn, isTotalableType } from "../core/types";
import { columnFlex } from "./columnLayout";

export interface DataRowProps {
  recordId: string;
  columns: readonly GridColumn[];
  /** visualSizeFactor per column; flex weights, not pixels. */
  factors: Record<string, number>;
  getFormatted: (recordId: string, column: string) => string;
  getRaw: (recordId: string, column: string) => unknown;
  selected: boolean;
  compact: boolean;
  multiSelect: boolean;
  navigationTypesAllowed: NavigationTypes;
  enableOptionSetColors: boolean;
  onToggleSelect: (recordId: string, additive: boolean) => void;
  onOpenRecord: (recordId: string) => void;
  onOpenLookup: (entityName: string, id: string) => void;
  rowIndex: number;
}

const DataRowInner: React.FC<DataRowProps> = (props) => {
  const styles = useGridStyles();

  return (
    <div
      role="row"
      aria-rowindex={props.rowIndex}
      aria-selected={props.selected}
      className={mergeClasses(
        styles.row,
        props.compact ? styles.rowCompact : styles.rowComfortable,
        props.selected && styles.rowSelected
      )}
      onClick={(e) => {
        if (e.ctrlKey || e.metaKey || e.shiftKey) props.onToggleSelect(props.recordId, true);
        else props.onOpenRecord(props.recordId);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") props.onOpenRecord(props.recordId);
        if (e.key === " ") {
          e.preventDefault();
          props.onToggleSelect(props.recordId, true);
        }
      }}
      tabIndex={-1}
    >
      {props.multiSelect && (
        <div className={styles.checkboxCell} role="gridcell">
          <Checkbox
            checked={props.selected}
            onClick={(e) => e.stopPropagation()}
            onChange={() => props.onToggleSelect(props.recordId, true)}
          />
        </div>
      )}

      {props.columns.map((column) => {
        const numeric = isTotalableType(column.dataType);
        return (
          <div
            key={column.name}
            role="gridcell"
            className={`${styles.cell} ${numeric ? styles.cellNumeric : ""}`}
            style={columnFlex(props.factors[column.name])}
          >
            <CellRenderer
              columnName={column.name}
              dataType={column.dataType}
              isPrimary={column.isPrimary}
              formatted={props.getFormatted(props.recordId, column.name)}
              raw={props.getRaw(props.recordId, column.name)}
              navigationTypesAllowed={props.navigationTypesAllowed}
              enableOptionSetColors={props.enableOptionSetColors}
              onOpenRecord={() => props.onOpenRecord(props.recordId)}
              onOpenLookup={props.onOpenLookup}
            />
          </div>
        );
      })}
    </div>
  );
};

export const DataRow = React.memo(DataRowInner);
