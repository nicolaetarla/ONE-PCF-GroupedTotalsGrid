/**
 * Turning a cell value into a group.
 *
 * Lookups are the case that matters most - they are exactly what the native
 * grid refuses to group on - so they get first-class treatment: the GUID is the
 * bucket key, the related record's primary name is the label.
 */

import { GroupKey } from "./types";

/** The minimum a record must expose for us to derive a group key. */
export interface GroupSourceValue {
  /** record.getValue(column) - shape depends on data type. */
  raw: unknown;
  /** record.getFormattedValue(column) - already localised by the platform. */
  formatted: string | undefined;
  dataType: string;
}

const isLookupType = (t: string): boolean => t.startsWith("Lookup.");

function lookupParts(raw: unknown): { id?: string; name?: string } {
  if (!raw) return {};
  // Dataset lookups arrive as EntityReference or as a single-element array of
  // them, depending on the column and the host version. Handle both.
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || typeof value !== "object") return {};
  const v = value as { id?: { guid?: string } | string; name?: string; etn?: string };
  const id = typeof v.id === "string" ? v.id : v.id?.guid;
  return { id: id ? normaliseGuid(id) : undefined, name: v.name };
}

/** Dataverse hands back GUIDs with and without braces; normalise for bucketing. */
export function normaliseGuid(guid: string): string {
  return guid.replace(/[{}]/g, "").toLowerCase();
}

/**
 * Derive the bucket key and display label for one record.
 *
 * `emptyLabel` is used for nulls; the empty group always sorts last regardless
 * of the chosen sort direction, matching how users expect "(No value)" to
 * behave.
 */
export function resolveGroupKey(source: GroupSourceValue, emptyLabel: string): GroupKey {
  const { raw, formatted, dataType } = source;

  if (isLookupType(dataType)) {
    const { id, name } = lookupParts(raw);
    if (!id) return emptyKey(emptyLabel);
    return {
      key: `lookup:${id}`,
      label: (name || formatted || "").trim() || emptyLabel,
      rawValue: id,
      isEmpty: false
    };
  }

  if (raw === null || raw === undefined || raw === "") return emptyKey(emptyLabel);

  switch (dataType) {
    case "TwoOptions": {
      const b = raw === true || raw === 1 || raw === "1";
      return { key: `bool:${b}`, label: formatted || String(b), rawValue: b, isEmpty: false };
    }

    case "OptionSet":
    case "MultiSelectPicklist": {
      const v = Array.isArray(raw) ? raw.join(",") : String(raw);
      return { key: `opt:${v}`, label: (formatted || "").trim() || v, rawValue: v, isEmpty: false };
    }

    case "DateAndTime.DateOnly":
    case "DateAndTime.DateAndTime": {
      const d = raw instanceof Date ? raw : new Date(String(raw));
      if (Number.isNaN(d.getTime())) return emptyKey(emptyLabel);
      // Bucket on the LOCAL calendar day. Dataverse stores UTC, so grouping on
      // the raw instant silently misfiles anything near midnight - the classic
      // way period totals go wrong by one day.
      const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
        d.getDate()
      ).padStart(2, "0")}`;
      return { key: `date:${local}`, label: formatted || local, rawValue: local, isEmpty: false };
    }

    case "Currency":
    case "Decimal":
    case "FP":
    case "Whole.None":
    case "Whole.Duration": {
      const n = Number(raw);
      return {
        key: `num:${n}`,
        label: formatted ?? String(n),
        rawValue: n,
        isEmpty: false
      };
    }

    default: {
      const s = String(raw);
      return { key: `str:${s}`, label: formatted || s, rawValue: s, isEmpty: false };
    }
  }
}

/**
 * The bucket prefix for a data type.
 *
 * Exported because THREE places must agree on key format: client-side bucketing
 * (resolveGroupKey), server aggregate results (useAggregates), and the row
 * filter that decides which records belong under an expanded group. When they
 * disagreed, choice-column grouping produced group headers with correct counts
 * and no rows underneath, because the filter assumed every grouping column was
 * a lookup.
 */
export function groupKeyPrefix(dataType: string): string {
  if (dataType.startsWith("Lookup.")) return "lookup";
  switch (dataType) {
    case "TwoOptions":
      return "bool";
    case "OptionSet":
    case "MultiSelectPicklist":
      return "opt";
    case "DateAndTime.DateOnly":
    case "DateAndTime.DateAndTime":
      return "date";
    case "Currency":
    case "Decimal":
    case "FP":
    case "Whole.None":
    case "Whole.Duration":
      return "num";
    default:
      return "str";
  }
}

/**
 * Build a group key from a server aggregate row, matching what resolveGroupKey
 * produces for the same record on the client.
 */
export function serverGroupKey(
  dataType: string,
  rawValue: unknown,
  label: string | undefined,
  emptyLabel: string
): GroupKey {
  if (rawValue === null || rawValue === undefined || rawValue === "") return emptyKey(emptyLabel);

  const prefix = groupKeyPrefix(dataType);
  let id: string;

  if (prefix === "lookup") {
    id = normaliseGuid(String(rawValue));
  } else if (prefix === "bool") {
    id = String(rawValue === true || rawValue === 1 || rawValue === "1" || rawValue === "true");
  } else {
    id = String(rawValue);
  }

  const text = (label ?? "").trim();
  return {
    key: `${prefix}:${id}`,
    // A blank label renders as an anonymous row the user cannot interpret, so
    // fall back rather than showing nothing.
    label: text || id || emptyLabel,
    rawValue: prefix === "bool" ? id === "true" : (rawValue as string | number),
    isEmpty: false
  };
}

/** Does this record belong under this group? */
export function isRowInGroup(
  source: GroupSourceValue,
  groupKey: GroupKey,
  emptyLabel: string
): boolean {
  return resolveGroupKey(source, emptyLabel).key === groupKey.key;
}

export function emptyKey(emptyLabel: string): GroupKey {
  return { key: "\u0000empty", label: emptyLabel, rawValue: null, isEmpty: true };
}

export type GroupSortMode = "label-asc" | "label-desc" | "total-desc" | "total-asc" | "count-desc";

/** Sort groups, always pushing the empty bucket to the end. */
export function sortGroups<T extends { key: GroupKey; recordCount: number }>(
  groups: T[],
  mode: GroupSortMode,
  totalFor?: (g: T) => number | null
): T[] {
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
  const sorted = [...groups].sort((a, b) => {
    if (a.key.isEmpty !== b.key.isEmpty) return a.key.isEmpty ? 1 : -1;
    switch (mode) {
      case "label-desc":
        return collator.compare(b.key.label, a.key.label);
      case "count-desc":
        return b.recordCount - a.recordCount;
      case "total-desc":
        return (totalFor?.(b) ?? 0) - (totalFor?.(a) ?? 0);
      case "total-asc":
        return (totalFor?.(a) ?? 0) - (totalFor?.(b) ?? 0);
      case "label-asc":
      default:
        return collator.compare(a.key.label, b.key.label);
    }
  });
  return sorted;
}
