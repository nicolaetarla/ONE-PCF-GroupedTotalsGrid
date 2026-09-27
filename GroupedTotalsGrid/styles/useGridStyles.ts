/**
 * All grid styling.
 *
 * Every value here resolves to a Fluent design token, which is what makes the
 * control follow the app theme (light / dark / high contrast) without any
 * configuration, and what keeps it correct when the platform reskins the native
 * grid. `npm run lint:no-raw-colors` fails the build if a literal sneaks in.
 *
 * Row and header heights come from core/nativeGridMetrics.ts, which is the
 * measured-against-the-real-grid evidence file.
 */

import { makeStyles, shorthands, tokens } from "@fluentui/react-components";
import { CHECKBOX_COLUMN_WIDTH, HEADER_HEIGHT, ROW_HEIGHTS } from "../core/nativeGridMetrics";

export const useGridStyles = makeStyles({
  /**
   * NEVER put this class on <FluentProvider>.
   *
   * Fluent applies the provider's class to the portal mount node it creates for
   * popovers and menus. With `width/height: 100%` and an opaque background on
   * that class, every menu portal became a full-viewport white sheet that hid
   * the entire app behind it. This belongs on a plain inner div.
   */
  root: {
    display: "flex",
    flexDirection: "column",
    width: "100%",
    height: "100%",
    minHeight: "120px",
    overflow: "hidden",
    fontFamily: tokens.fontFamilyBase,
    fontSize: tokens.fontSizeBase300,
    lineHeight: tokens.lineHeightBase300,
    color: tokens.colorNeutralForeground1,
    backgroundColor: tokens.colorNeutralBackground1,
    /**
     * Confines every z-index inside this control to a local stacking context.
     *
     * The sticky header, group headers and totals row need to layer against
     * each other, but those values must never compete with the host's own
     * chrome. Without this, the sticky header painted over the dashboard
     * selector flyout, making it impossible to switch dashboards.
     */
    isolation: "isolate",
    position: "relative"
  },

  /**
   * The provider itself: layout only, no background, no size, no stacking.
   * Anything set here also lands on portal mount nodes.
   */
  provider: {
    /**
     * `display: contents` removes the provider's own box, so the inner root
     * sizes against the host container directly (height: 100% resolves), and
     * any portal mount node that inherits this class stays boxless rather than
     * becoming a full-viewport sheet. Fluent popovers position themselves with
     * fixed positioning, so they are unaffected by having no containing box.
     */
    display: "contents"
  },

  scroller: {
    flexGrow: 1,
    overflowY: "auto",
    // Only scrolls horizontally when MIN_COLUMN_WIDTH totals exceed the width;
    // flex distribution means it otherwise fits exactly.
    overflowX: "auto",
    position: "relative"
  },

  table: { display: "table", width: "100%", tableLayout: "fixed", borderCollapse: "collapse" },

  headerRow: {
    display: "flex",
    alignItems: "center",
    height: `${HEADER_HEIGHT}px`,
    position: "sticky",
    top: 0,
    // Above group headers, which stick just beneath it. Scoped by the
    // `isolation` on root, so it cannot outrank host chrome.
    zIndex: 3,
    minWidth: "fit-content",
    backgroundColor: tokens.colorNeutralBackground1,
    ...shorthands.borderBottom("1px", "solid", tokens.colorNeutralStroke1)
  },

  headerCell: {
    display: "flex",
    alignItems: "center",
    ...shorthands.padding(0, tokens.spacingHorizontalS),
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground1,
    cursor: "pointer",
    userSelect: "none",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    ":hover": { backgroundColor: tokens.colorSubtleBackgroundHover }
  },

  headerCellNumeric: { justifyContent: "flex-end" },

  row: {
    display: "flex",
    alignItems: "center",
    minWidth: "fit-content",
    ...shorthands.borderBottom("1px", "solid", tokens.colorNeutralStroke2),
    ":hover": { backgroundColor: tokens.colorSubtleBackgroundHover }
  },
  rowComfortable: { height: `${ROW_HEIGHTS.Comfortable}px` },
  rowCompact: { height: `${ROW_HEIGHTS.Compact}px` },
  rowSelected: {
    backgroundColor: tokens.colorNeutralBackground1Selected,
    ":hover": { backgroundColor: tokens.colorNeutralBackground1Hover }
  },

  cell: {
    ...shorthands.padding(0, tokens.spacingHorizontalS),
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    display: "flex",
    alignItems: "center"
  },
  cellNumeric: { justifyContent: "flex-end", fontVariantNumeric: "tabular-nums" },

  link: {
    color: tokens.colorBrandForegroundLink,
    textDecorationLine: "none",
    cursor: "pointer",
    overflow: "hidden",
    textOverflow: "ellipsis",
    ":hover": { color: tokens.colorBrandForegroundLinkHover, textDecorationLine: "underline" },
    ":focus-visible": { outlineStyle: "solid", outlineWidth: "2px", outlineColor: tokens.colorStrokeFocus2 }
  },

  checkboxCell: {
    // Fixed and non-flexible: it must not absorb space from the data columns,
    // and it must be identical in the header, data, group and totals rows or
    // every column below it shifts.
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: `${CHECKBOX_COLUMN_WIDTH}px`,
    width: `${CHECKBOX_COLUMN_WIDTH}px`,
    minWidth: `${CHECKBOX_COLUMN_WIDTH}px`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center"
  },

  /* --- elements with no native counterpart: kept deliberately plain --- */
  groupRow: {
    display: "flex",
    alignItems: "center",
    minWidth: "fit-content",
    position: "sticky",
    // Layer order inside the control: header (3) > totals (2) > groups (1).
    zIndex: 1,
    backgroundColor: tokens.colorNeutralBackground2,
    fontWeight: tokens.fontWeightSemibold,
    cursor: "pointer",
    ...shorthands.borderBottom("1px", "solid", tokens.colorNeutralStroke2),
    ":hover": { backgroundColor: tokens.colorNeutralBackground2Hover }
  },
  groupLabel: {
    display: "flex",
    alignItems: "center",
    ...shorthands.gap(tokens.spacingHorizontalXS),
    ...shorthands.padding(0, tokens.spacingHorizontalS),
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap"
  },
  groupCount: { color: tokens.colorNeutralForeground3, fontWeight: tokens.fontWeightRegular },

  totalsRow: {
    display: "flex",
    alignItems: "center",
    minWidth: "fit-content",
    position: "sticky",
    bottom: 0,
    zIndex: 2,
    backgroundColor: tokens.colorNeutralBackground1,
    fontWeight: tokens.fontWeightSemibold,
    boxShadow: tokens.shadow4,
    ...shorthands.borderTop("1px", "solid", tokens.colorNeutralStroke1)
  },

  footer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    ...shorthands.padding(tokens.spacingVerticalXS, tokens.spacingHorizontalM),
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
    ...shorthands.borderTop("1px", "solid", tokens.colorNeutralStroke2)
  },

  stateContainer: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    ...shorthands.gap(tokens.spacingVerticalS),
    ...shorthands.padding(tokens.spacingVerticalXXL),
    color: tokens.colorNeutralForeground3,
    textAlign: "center"
  },

  warningIcon: { color: tokens.colorPaletteYellowForeground1, marginInlineStart: tokens.spacingHorizontalXXS },

  /* --- narrow-width card reflow, mirroring the native card list --- */
  card: {
    display: "flex",
    flexDirection: "column",
    ...shorthands.gap(tokens.spacingVerticalXXS),
    ...shorthands.padding(tokens.spacingVerticalS, tokens.spacingHorizontalM),
    ...shorthands.borderBottom("1px", "solid", tokens.colorNeutralStroke2)
  },
  cardPrimary: { fontWeight: tokens.fontWeightSemibold },
  cardSecondary: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 }
});
