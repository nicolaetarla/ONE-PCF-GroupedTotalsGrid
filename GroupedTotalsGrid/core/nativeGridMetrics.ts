/**
 * Measured native grid metrics.
 *
 * scripts/check-no-raw-colors.js allowlists this file by name. It is the one
 * sanctioned place in this codebase for raw style values, and even here
 * they exist to be MAPPED to Fluent tokens rather than used directly - see the
 * `token` field on each entry. Components consume the tokens; these numbers are
 * the evidence trail proving the token choice was right.
 *
 * HOW THESE WERE CAPTURED (repeat this after any platform update):
 *   1. Open a model-driven app with the native Power Apps grid control on a
 *      table with a mix of text, lookup, choice, date and numeric columns.
 *   2. Add this control to a second view of the same table, same columns.
 *   3. In DevTools, select a native header cell, a native data cell, and a
 *      native row in default / hover / selected state, and read the computed
 *      styles listed below.
 *   4. Update this file, note the platform version, and re-run the parity
 *      screenshots in docs/STYLE-PARITY.md.
 *
 * MEASURED AGAINST: Power Apps grid control, platform version <FILL IN>.
 * MEASURED ON:      <FILL IN DATE>
 * MEASURED BY:      <FILL IN>
 *
 * The values below are the starting point taken from Fluent's own grid sizing,
 * NOT from a live measurement - they must be verified against a real
 * environment before the control ships. Milestone 2 of the build is not
 * complete until the placeholders above are filled in.
 */

export interface MetricMapping {
  /** What was measured on the native grid. */
  measured: string;
  /** The Fluent token that reproduces it. Components use this, not `measured`. */
  token: string;
  /** Set when no token matches exactly and the nearest was taken. */
  approximate?: boolean;
  note?: string;
}

export const NATIVE_GRID_METRICS: Record<string, MetricMapping> = {
  headerRowHeight: { measured: "44px", token: "44px", note: "Fluent DataGrid header, medium size" },
  dataRowHeightComfortable: { measured: "44px", token: "44px" },
  dataRowHeightCompact: { measured: "32px", token: "32px" },
  cellPaddingHorizontal: { measured: "8px", token: "tokens.spacingHorizontalS" },
  cellGapHorizontal: { measured: "4px", token: "tokens.spacingHorizontalXS" },

  fontFamily: {
    measured: "Segoe UI Variable / Segoe UI stack",
    token: "tokens.fontFamilyBase",
    note: "Do not restate the stack - the token carries the platform font."
  },
  cellFontSize: { measured: "14px", token: "tokens.fontSizeBase300" },
  cellLineHeight: { measured: "20px", token: "tokens.lineHeightBase300" },
  cellFontWeight: { measured: "400", token: "tokens.fontWeightRegular" },
  headerFontWeight: { measured: "600", token: "tokens.fontWeightSemibold" },

  rowDivider: { measured: "1px solid neutral stroke 2", token: "tokens.colorNeutralStroke2" },
  headerBorderBottom: { measured: "1px solid neutral stroke 1", token: "tokens.colorNeutralStroke1" },
  rowHoverBackground: { measured: "subtle hover", token: "tokens.colorSubtleBackgroundHover" },
  rowSelectedBackground: { measured: "selected", token: "tokens.colorNeutralBackground1Selected" },
  rowSelectedHoverBackground: {
    measured: "selected + hover",
    token: "tokens.colorNeutralBackground1Hover",
    approximate: true,
    note: "Native blends selection and hover; nearest single token taken."
  },
  focusIndicator: { measured: "2px focus stroke", token: "tokens.colorStrokeFocus2" },

  linkColour: { measured: "brand foreground link", token: "tokens.colorBrandForegroundLink" },
  linkHoverColour: { measured: "brand foreground link hover", token: "tokens.colorBrandForegroundLinkHover" },

  checkboxColumnWidth: { measured: "44px", token: "44px" },

  groupHeaderBackground: {
    measured: "n/a - no native equivalent",
    token: "tokens.colorNeutralBackground2",
    note: "New element. Chosen to sit one step off the row surface, as nested-grid headers do."
  },
  mutedForeground: { measured: "secondary text", token: "tokens.colorNeutralForeground3" }
};

/** Row heights in px, by density. `Platform` resolves to the native default. */
export const ROW_HEIGHTS: Record<"Platform" | "Comfortable" | "Compact", number> = {
  Platform: 44,
  Comfortable: 44,
  Compact: 32
};

export const HEADER_HEIGHT = 44;
export const CHECKBOX_COLUMN_WIDTH = 44;

/**
 * Dataset columns express width as visualSizeFactor, a relative weight rather
 * than pixels. The native grid converts it to a pixel width; this matches that
 * conversion so column boundaries line up between the two controls.
 */
export function columnWidthPx(visualSizeFactor: number, totalFactor: number, availableWidth: number): number {
  if (!totalFactor || !availableWidth) return 150;
  const width = (visualSizeFactor / totalFactor) * availableWidth;
  return Math.max(48, Math.round(width));
}
