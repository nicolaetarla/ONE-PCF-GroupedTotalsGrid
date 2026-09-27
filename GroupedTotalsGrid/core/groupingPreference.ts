/**
 * Remembering the user's grouping choice.
 *
 * The `groupByColumn` manifest property is a typed logical name, set by a maker.
 * That is fine when the maker knows the logical name and the classic property
 * editor cooperates, but it is a poor experience otherwise - and it fixes the
 * grouping for everyone.
 *
 * So the column header menu lets any user group by any column at runtime, and
 * this module makes that choice stick. Scoped per entity and per view, because
 * "group by Category" is meaningful on one view and nonsense on another.
 *
 * localStorage is used deliberately rather than a Dataverse record: this is a
 * display preference, it must survive a page reload, and it is not worth a
 * server round trip or a table to store. Every access is guarded - storage is
 * unavailable in some embedded and private-browsing contexts, and a thrown
 * SecurityError there would take the whole grid down.
 */

const PREFIX = "gtg.groupBy";

/**
 * Stored to mean "this user deliberately turned grouping off", as distinct from
 * "this user has never chosen", which is the absence of a stored value.
 *
 * Without the distinction, Remove grouping cleared the preference and the next
 * resolve fell straight back to the maker's configured column - so the command
 * appeared to do nothing whenever `groupByColumn` was set.
 */
export const NO_GROUPING = "__gtg_none__";

export function groupingStorageKey(entityName: string, viewId: string): string {
  return `${PREFIX}.${entityName || "unknown"}.${viewId || "default"}`;
}

/** Returns undefined when nothing is stored, or when storage is unavailable. */
export function readStoredGrouping(key: string): string | undefined {
  try {
    const value = window.localStorage.getItem(key);
    return value === null || value === "" ? undefined : value;
  } catch {
    return undefined;
  }
}

/** Passing undefined clears the stored preference. */
export function writeStoredGrouping(key: string, columnName: string | undefined): void {
  try {
    if (columnName === undefined) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, columnName);
  } catch {
    // Preference is best-effort. Losing it is not worth surfacing to the user.
  }
}

/**
 * Resolve the grouping column, in priority order:
 *   1. an explicit "no grouping" from this user;
 *   2. what this user picked at runtime for this view, if still valid;
 *   3. what the maker configured on the control;
 *   4. nothing - the grid renders ungrouped until a column is chosen.
 *
 * A stored column that is no longer in the view (layout changed, or the user
 * switched views) is ignored rather than leaving the grid grouped by a column
 * nobody can see.
 */
export function resolveGroupingColumn(
  stored: string | undefined,
  configured: string | undefined,
  availableColumns: readonly { name: string }[]
): string | undefined {
  // An explicit opt-out beats the maker's configured column. The user is
  // looking at the grid; they get the last word on how it is arranged.
  if (stored === NO_GROUPING) return undefined;

  const exists = (name: string | undefined): boolean =>
    !!name && availableColumns.some((c) => c.name === name);

  if (exists(stored)) return stored;
  if (exists(configured)) return configured;
  return undefined;
}
