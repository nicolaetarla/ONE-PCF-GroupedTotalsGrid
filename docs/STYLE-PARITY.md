# Visual parity with the native grid

The control must be indistinguishable from the standard model-driven grid, apart from the two elements that have no native counterpart: group header rows and the totals row. "Close enough" is a failure — a user moving between a standard view and this one should not perceive a change of product.

This document is both the procedure and the evidence.

## How parity is enforced in code

**Tokens, not pixels.** Every colour, spacing value, radius, shadow, font size and weight in `styles/useGridStyles.ts` resolves to a Fluent v9 design token, sourced from `context.fluentDesignLanguage`. The point is not to freeze today's pixels — it is to stay correct when Microsoft reskins the native grid.

**A CI guard.** `npm run lint:no-raw-colors` scans `components/`, `styles/` and `hooks/` for hex colours, `rgb()`/`hsl()` literals and hardcoded font stacks, and fails the build on any hit. The single allowed exception is `core/nativeGridMetrics.ts`, allowlisted by name, which exists to hold measured values and map them to tokens. Individual lines elsewhere can be exempted with a `style-guard-allow` comment on the preceding line, but doing so should be rare enough to need justifying in review.

## What changed after the first live deployment

Three parity-relevant decisions were settled against a real environment, and the checklist below should be read with them in mind:

- **Column widths are flex-distributed**, not measured in pixels. `flexBasis: 0` with `flexGrow` taken from the view's `visualSizeFactor` makes a row exactly as wide as its scrollport. Pixel arithmetic produced a permanent horizontal scrollbar, because the scrollport is narrower than the container by the width of the vertical scrollbar. There is consequently no column-width measurement to capture — only the row heights, typography and colours below.
- **The header row lives inside the scroll container**, pinned with `position: sticky`. Outside it, header and body desynchronised on any horizontal scroll.
- **The control isolates its stacking context** (`isolation: isolate` on the root). Internal sticky layering is header (3) > totals (2) > group headers (1), and none of it can outrank host chrome.

One trap worth recording: do not put the grid's layout class on `<FluentProvider>`. Fluent applies the provider's class to portal mount nodes, so a class carrying `height: 100%` and an opaque background turns every menu popover into a full-viewport sheet. Layout belongs on an inner `div`; the provider carries `display: contents` only.

## Measurement procedure (milestone 2)

`core/nativeGridMetrics.ts` currently holds **placeholder values taken from Fluent's own grid sizing, not from a live measurement.** Filling it in is a prerequisite for shipping.

1. Open a model-driven app with the native Power Apps grid control on a table having a mix of text, lookup, choice, date and numeric columns.
2. Register this control against a second view of the same table, with the same columns in the same order.
3. Open both, side by side, at the same viewport width.
4. In DevTools, read the computed styles of the native grid for each item below.
5. Update `nativeGridMetrics.ts`, filling in the platform version, date and initials in the header comment.
6. Re-capture the screenshots in the Evidence section.

| Item | Where to read it |
|---|---|
| Header row height | Native header row element |
| Data row height (default and compact) | Native data row element |
| Cell horizontal padding | Native data cell |
| Font family / size / weight / line-height | Header cell and data cell separately |
| Row divider colour and thickness | Border on the data row |
| Hover background | Row with `:hover` forced |
| Selected background | Row with a record selected |
| Selected + hovered background | Both at once |
| Focus indicator | Tab to a row |
| Link colour and hover treatment | Primary column cell |
| Checkbox column width | Selection column |
| (Column widths) | Not applicable — flex-distributed from `visualSizeFactor`. |
| Sort / filter indicator size and position | Sorted column header |

Where no Fluent token matches a measurement exactly, take the nearest token and record the discrepancy in the `note` field rather than dropping in a raw value.

## Structural checklist

Tick each against the native grid at the same viewport.

- [ ] Horizontal row dividers only; no vertical gridlines
- [ ] Sticky header row with a bottom border; no zebra striping
- [ ] Selection checkbox column on the left, revealed on hover or when any row is selected
- [ ] Select-all in the header
- [ ] Cells with no value render **blank** (not `---`)
- [ ] Numeric, currency and duration columns right-aligned; all others left-aligned
- [ ] Header alignment follows cell alignment
- [ ] Column resize handles present and positioned as native
- [ ] Sort and filter indicators positioned as native
- [ ] Text truncates with an ellipsis and a hover tooltip; cells never wrap
- [ ] Column proportions derived from `visualSizeFactor` line up with the native grid's
- [ ] No horizontal scrollbar appears at any container width above the minimum column widths
- [ ] Header cells stay aligned with body cells when the grid does scroll horizontally

## Cell rendering checklist

- [ ] Primary column renders as a hyperlink in the platform link style
- [ ] Lookup columns render as hyperlinks and open the target record
- [ ] `Navigation types allowed = Primary only` suppresses lookup links but keeps the primary link
- [ ] `Navigation types allowed = None` suppresses all links
- [ ] Choice columns render with configured colours when enabled, plain otherwise
- [ ] Email cells open a mail client; phone cells dial; URL cells navigate
- [ ] Dates, times, booleans, choices and lookups display via `getFormattedValue()` — never reimplemented

## The two new elements

Group header rows and the totals row have no native counterpart, so the standard is "reads as native", not "matches native".

- [ ] Group header uses the neutral secondary surface, standard cell font size, semibold label
- [ ] Expand chevron matches the native nested-grid chevron
- [ ] Record count uses the muted foreground token and regular weight
- [ ] Group totals sit in the same columns and alignment as the cells they total
- [ ] Totals row is the same height as a data row, semibold, with a divider above
- [ ] Totals row pins to the bottom with the standard elevation shadow when content scrolls beneath
- [ ] No accent colours, badges, pills or decoration absent from the native grid

## Manual test matrix

| Dimension | Cases |
|---|---|
| Theme | Light, dark, high contrast |
| Direction | LTR, RTL |
| Locale | en-US, de-DE (comma decimal, period grouping) |
| Client | Web, tablet, phone |
| Density | Platform, comfortable, compact |
| Data volume | < 100 rows, ~5,000 rows, large enough to trigger the aggregate limit |
| Grouping column | Lookup, choice, boolean, date, text, all-null |
| Numeric columns | Currency (single and mixed), decimal 2dp and 4dp, whole number, duration |

## Evidence

Capture at the same viewport, native grid and this control side by side.

| Theme | Screenshot | Captured | Platform version |
|---|---|---|---|
| Light | `media/parity-light.png` | *pending* | *pending* |
| Dark | `media/parity-dark.png` | *pending* | *pending* |
| High contrast | `media/parity-hc.png` | *pending* | *pending* |

The illustrations currently in `media/` (`control-light.png`, `control-dark.png`) show the **intended** rendering. They are drawn from the control's own layout constants and are useful for documentation, but they are not measured parity evidence and must not be treated as such.

## Accepted deviations

Any parity item that could not be met is recorded in `KNOWN-LIMITATIONS.md` with its reason. Do not silently leave a checkbox unticked.
