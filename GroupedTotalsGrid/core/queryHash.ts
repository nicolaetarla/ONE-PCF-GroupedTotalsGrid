/**
 * Query identity.
 *
 * updateView fires on scroll, resize, selection, theme change and a dozen other
 * things that do not change the answer. Recomputing server aggregates on every
 * one of those would be both slow and rude to the platform, so totals are keyed
 * on a hash of the things that genuinely change the result.
 */

import { QueryIdentity } from "./types";

/**
 * FNV-1a. Not cryptographic - it only needs to be stable, fast and collision-
 * resistant enough that two different queries do not share a key.
 */
export function hashString(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/** Order-independent so a reordered aggregate column list does not requery. */
export function queryHash(identity: QueryIdentity): string {
  const canonical = [
    identity.entityName,
    identity.viewId,
    identity.filterJson,
    identity.searchTerm,
    identity.linkedEntitiesJson,
    identity.groupByColumn,
    [...identity.aggregateColumns].sort().join(",")
  ].join("\u241f");
  return hashString(canonical);
}

/**
 * Trailing-edge debounce with cancellation.
 *
 * Used so a burst of updateView calls collapses into one aggregate request, and
 * so an in-flight request can be abandoned when the user changes the filter
 * again before it returns.
 */
export function createDebouncer(delayMs: number): {
  run: (fn: () => void) => void;
  cancel: () => void;
} {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    run(fn: () => void): void {
      if (timer) clearTimeout(timer);
      timer = setTimeout(fn, delayMs);
    },
    cancel(): void {
      if (timer) clearTimeout(timer);
      timer = undefined;
    }
  };
}
