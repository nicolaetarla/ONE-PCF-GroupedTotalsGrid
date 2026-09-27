# Known limitations

Stated plainly, because the alternative is someone discovering them in production.

## Outstanding before production use

These are not permanent limitations — they are unfinished work that requires a real environment.

1. **`core/nativeGridMetrics.ts` holds placeholder values.** They come from Fluent's own grid sizing, not from measuring the native Power Apps grid. Follow the procedure in `STYLE-PARITY.md` and fill in the platform version, date and initials. Until this is done, visual parity is asserted, not demonstrated.

2. **The `platform-library` versions in the manifest are unverified.** React and Fluent versions for virtual controls change between platform releases. Run `pac pcf init --template dataset --framework react` on your machine and use the versions it emits. A mismatch does not error — it silently falls back to bundling the libraries, which inflates the bundle and can desynchronise the theme.

3. **Several PCF API details need confirmation against a live org**, specifically: the exact shape returned by `context.utils.getEntityMetadata` for attribute precision and `PrecisionSource`; whether `context.webAPI.retrieveMultipleRecords` returns formatted-value annotations for aggregate results (the control does not depend on this — it joins the lookup target for a display name instead — but the fallback path assumes it). (The `ConditionOperator` codes in `core/filterTranslator.ts` have been checked against the published PCF and Dataverse SDK enum and are pinned by `__tests__/filterTranslator.test.ts`; runtime behaviour of the grid's filter values should still be spot-checked.) Each has a defensive fallback, but each should be verified.

4. **Component tests cover the main interactions but not everything.** `__tests__/components/` renders the grid against a mock dataset (React Testing Library 12, matching React 16) and covers group rendering and totals, expand/collapse, keyboard toggling, row open/select, empty and error states, and Copy totals. Not yet covered: the column header menu (Fluent's popover), the narrow-width card layout, and the server aggregate path through `useAggregates`.

## Deliberate omissions

**No filtering or column reordering in the header menu.** Both were present as menu items until 1.0.17 with nothing wired behind them. Rather than implement duplicates, they were removed: the platform's view definition and column personalisation already provide both.

**Grouping preferences are per browser.** The runtime grouping choice, including an explicit "remove grouping", is stored in `localStorage` keyed by entity and view. It does not roam between browsers or devices, and private browsing or a locked-down browser policy disables it. The control degrades to the maker-configured column, or to ungrouped, rather than erroring.

## Permanent limitations

**Export to Excel ignores grouping and totals.** Export is a platform command that operates on the underlying view, not on the control. The exported workbook contains the flat rows. Mitigation: the **Copy totals** button in the status bar puts the group-total table on the clipboard as TSV, formatted exactly as shown, ready to paste into Excel. Values are pasted as the displayed text (durations stay "5 hours 30 minutes"), so Excel may not treat every column as numeric.

**Only one grouping level.** Nested grouping (resource → month) is not supported. Adding it would change the aggregate query shape and the row-virtualisation model substantially.

**Advanced Find and legacy dialogs render the default grid.** Control registration does not apply there.

**Offline is not supported.** Server aggregation needs the Web API. Offline, the control falls back to totalling whatever rows are cached, and marks the totals partial.

**Sum only.** Min, max and average are not implemented. If average is added, it must be derived as sum ÷ count from composed values — averaging partition averages is wrong, and the merge logic in `core/aggregation.ts` deliberately refuses to compose averages.

**Rollup fields cannot substitute for this.** Rollup columns compute against a fixed filter defined at design time; they cannot answer "totals for the date range the user just picked". This is why the control queries rather than reading a stored aggregate.

## Behaviours that look like bugs but are not

**A column with no values shows blank, not `0`.** Blank is honest. A zero asserts that the data summed to nothing, which is a different claim.

**Money totals sometimes switch to base currency.** When a group spans transaction currencies, the transaction-currency sum has no meaning. The control substitutes the base-currency sum and shows an info icon. It will not add USD to EUR.

**Hours do not roll over into days.** A 200-hour total renders as 200 hours, not "8 days 8 hours" — because the cells above it do not roll over either, and the total must match the column.

**Totals occasionally fall back to loaded rows.** When the runtime filter contains an operator the control cannot translate to FetchXML, it falls back rather than issuing an aggregate query missing a filter. A total that quietly disagrees with the rows on screen is worse than one that says it is partial. Debug logging names the operator.

**Dates group on the local calendar day.** Dataverse stores UTC. Grouping on the raw instant misfiles entries near midnight, which is how period totals end up off by a day.

**Duration inference can be wrong on a column where every value is under an hour.** "45 minutes" is equally consistent with a minutes-only format and with an hours-and-minutes format collapsing the zero hours part. The control prefers the richer shape and flags the ambiguity in debug logging. Set **Duration total format** explicitly if it matters.

## Performance notes

- Server aggregation is one extra request per query change, debounced at 300 ms and gated on a hash of the query identity. `updateView` fires far more often than the query actually changes.
- Aggregate partitioning runs at most 4 concurrent requests. Unbounded parallelism gets throttled, which turns a slow grid into a broken one.
- Expanding a group with tens of thousands of rows is bounded by **Maximum rows loaded**, not by the group size. Totals stay server-side and correct either way.

## Build gotchas fixed in 1.0.1

Recorded because each produced an unhelpful error message.

**`[pcf-1013] Cannot parse manifest: Malformed comment`.** The XML specification forbids a double hyphen anywhere inside a comment, so a CLI example containing `--flag` in a manifest comment breaks the build. `npm run lint:manifest` now catches this with a message that explains it.

**Exported class name must equal the manifest `constructor` attribute.** The class was `GroupedTotalsGridControl` while the manifest said `GroupedTotalsGrid`. The React component of the same name is now imported under an alias in `index.ts`.

**`property-set` cannot bind a `Lookup.Simple`.** The dataset previously declared a `currencyColumn` property-set to guarantee `transactioncurrencyid` was fetched. Lookup types are not valid there, so it was removed. Consequence: on the **server** totals path, mixed-currency detection is unaffected because the aggregate query groups by `transactioncurrencyid` itself. On the **client fallback** path, mixed-currency detection only works when the currency column is present in the view. If it is not, money columns are summed in transaction currency without a warning icon. Add the currency column to the view if the data spans currencies and you rely on the client path.
