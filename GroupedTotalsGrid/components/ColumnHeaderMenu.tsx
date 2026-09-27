/**
 * The column header dropdown.
 *
 * Command set, order and wording deliberately mirror the native grid's menu, so
 * grouping and totals arrive as two extra items in a familiar menu rather than
 * as a separate-looking extension.
 */

import * as React from "react";
import {
  Menu,
  MenuDivider,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger
} from "@fluentui/react-components";
import { SortAscending, SortDescending, Group, GroupDismiss, Sum } from "./icons/Icons";
import { GridColumn, isTotalableType } from "../core/types";

/**
 * Only commands that actually do something appear here.
 *
 * "Filter by", "Move left" and "Move right" were carried over from the native
 * grid's menu for familiarity, but nothing was wired behind them - a menu item
 * that does nothing when clicked is worse than an absent one. Column filtering
 * and reordering remain available through the platform's own view and
 * personalisation UI.
 */
export interface HeaderStrings {
  sortAsc: string;
  sortDesc: string;
  groupBy: string;
  ungroup: string;
  showTotal: string;
  hideTotal: string;
}

export interface ColumnHeaderMenuProps {
  column: GridColumn;
  children: React.ReactElement;
  strings: HeaderStrings;
  isGrouped: boolean;
  isTotalled: boolean;
  allowGrouping: boolean;
  onSort: (column: string, descending: boolean) => void;
  /** `undefined` means remove grouping entirely. */
  onGroupBy: (column: string | undefined) => void;
  onToggleTotal: (column: string) => void;
}

export const ColumnHeaderMenu: React.FC<ColumnHeaderMenuProps> = (props) => {
  const { column, strings } = props;
  // Lookups are groupable here on purpose. That is the whole reason this
  // control exists - the native grid excludes them.
  const canGroup = props.allowGrouping;
  const canTotal = isTotalableType(column.dataType);

  return (
    <Menu>
      <MenuTrigger disableButtonEnhancement>{props.children}</MenuTrigger>
      <MenuPopover>
        <MenuList>
          <MenuItem icon={<SortAscending />} onClick={() => props.onSort(column.name, false)}>
            {strings.sortAsc}
          </MenuItem>
          <MenuItem icon={<SortDescending />} onClick={() => props.onSort(column.name, true)}>
            {strings.sortDesc}
          </MenuItem>

          {(canGroup || canTotal) && <MenuDivider />}

          {canGroup && (
            <MenuItem
              icon={props.isGrouped ? <GroupDismiss /> : <Group />}
              onClick={() => props.onGroupBy(props.isGrouped ? undefined : column.name)}
            >
              {props.isGrouped ? strings.ungroup : strings.groupBy}
            </MenuItem>
          )}
          {canTotal && (
            <MenuItem icon={<Sum />} onClick={() => props.onToggleTotal(column.name)}>
              {props.isTotalled ? strings.hideTotal : strings.showTotal}
            </MenuItem>
          )}

        </MenuList>
      </MenuPopover>
    </Menu>
  );
};
