/**
 * Column sizing.
 *
 * Replaces pixel-width computation, which caused two visible defects:
 *
 *   1. A horizontal scrollbar that should not exist. Widths were derived from
 *      the container's measured width, but the *scrollport* is narrower than the
 *      container by the width of the vertical scrollbar. Rows therefore came out
 *      a dozen or so pixels too wide, every time.
 *
 *   2. Header cells drifting out of alignment with body cells once anything
 *      scrolled horizontally.
 *
 * Flex distribution fixes both by construction: `flexBasis: 0` with
 * `flexGrow` proportional to the view's own visualSizeFactor means the row is
 * always exactly as wide as its container, whatever that turns out to be. No
 * measurement, nothing to get stale, and the same helper drives the header,
 * data rows, group headers and the totals row - so they cannot disagree.
 *
 * Overflow becomes possible only when the minimum widths genuinely do not fit,
 * which is the one case where a scrollbar is the right answer.
 */

/** Below this, columns stop shrinking and the grid scrolls instead. */
export const MIN_COLUMN_WIDTH = 96;

export interface ColumnFlex {
  flexGrow: number;
  flexShrink: number;
  flexBasis: number;
  minWidth: number;
  /** Guards against a flex item refusing to shrink below its content width. */
  overflow: "hidden";
}

/**
 * `visualSizeFactor` from the view layout is a relative weight, not pixels, so
 * it maps onto flexGrow directly - which is what keeps column proportions
 * faithful to the view definition.
 */
export function columnFlex(factor: number | undefined, minWidth = MIN_COLUMN_WIDTH): ColumnFlex {
  return {
    flexGrow: Math.max(1, factor || 100),
    flexShrink: 1,
    flexBasis: 0,
    minWidth,
    overflow: "hidden"
  };
}

/**
 * A group label spans the leading columns up to the first totalled one, so it
 * takes their combined weight and stays aligned with the columns above it.
 */
export function spanFlex(factors: readonly (number | undefined)[], minWidth = MIN_COLUMN_WIDTH): ColumnFlex {
  const total = factors.reduce<number>((sum, f) => sum + Math.max(1, f || 100), 0);
  return {
    flexGrow: total,
    flexShrink: 1,
    flexBasis: 0,
    minWidth,
    overflow: "hidden"
  };
}
