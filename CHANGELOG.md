# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Runtime filter translation used wrong `ConditionOperator` codes (e.g. LessThan mapped to `ge`, OnOrAfter to `contains`, LastMonth to `in`), so server totals could silently apply the wrong filter. Codes now follow the documented PCF / Dataverse SDK enum.
- `in` / `not-in` values were joined into one attribute; they now emit `<value>` children. Attribute names are escaped.
- Conditions on linked tables were applied to the root entity; they now fall back to client totals.

### Added

- Relative-date and user operators (today, this month, last X days, eq-userid, …) now stay on the server totals path.
- **Copy totals** button: copies the group-total table to the clipboard as TSV.
- `core/filterTranslator.ts` and `core/totalsTsv.ts`, with tests.
- Solution project committed at `GroupedTotalsGridSolution/` (publisher `ONEConsultNET`, prefix `onec`); `npm run package` / `package:dev` build the release / dev zip on any OS. `lint:versions` now also checks `Solution.xml`, set to 1.0.18.
- Component tests in `__tests__/components/` using `@testing-library/react` 12 (React 16 compatible): group rendering, expand/collapse, keyboard, selection, empty/error states, Copy totals. `jest.setup.js` stubs `ResizeObserver` for Fluent. 206 tests total.

## [1.0.18] - 2026-08-25

Documentation catch-up. The last three releases updated CHANGELOG and CONFIGURATION but left four other documents behind.

### Changed

- Corrected the test count in README, GETTING-STARTED and KNOWN-LIMITATIONS: 109 → 150.
- Corrected the production bundle size: 60 KB → 62 KB, measured rather than remembered.
- README architecture listing now includes `components/columnLayout`, `components/icons/` and `core/groupingPreference`, none of which existed when it was written.
- README design-decisions section covers flex column sizing, stacking-context isolation, and why the header menu offers only working commands.
- STYLE-PARITY.md records what the first live deployment settled: column widths are flex-distributed so there is no width measurement to capture; the header lives inside the scroll container; the control isolates its stacking context. It also records the trap of putting the layout class on `<FluentProvider>`, which turns every menu popover into a full-viewport sheet.
- STYLE-PARITY checklist adds two items the live run showed were needed: no spurious horizontal scrollbar, and header/body alignment maintained during horizontal scroll.
- KNOWN-LIMITATIONS documents the deliberate omission of filtering and column reordering from the header menu, and that grouping preferences are per browser rather than roaming.
- The outstanding `nativeGridMetrics` work is narrower than stated: with widths flex-distributed, only row heights, typography and hover/selection colours remain to be measured.

### Added

- `npm run lint:versions` — fails the build when `package.json`, the control manifest and the top CHANGELOG entry disagree. The manifest case is the dangerous one: the platform caches bundles by manifest version, so a missed increment makes a deployment a silent no-op. That is exactly what happened for several releases in this project, with fixes reported as deployed while the old bundle kept being served. Wired into `verify` and `verify:prod`.

## [1.0.17] - 2026-08-25

### Fixed

- **Remove grouping did nothing.** It cleared the stored preference, which is indistinguishable from "this user has never chosen" — so the next resolve fell straight back to the maker's configured **Group by column** and grouping reappeared. There is now an explicit `NO_GROUPING` sentinel: turning grouping off is stored as a choice and outranks the configured column, for that user and view. Re-grouping afterwards works normally.

### Removed

- **Filter by**, **Move left** and **Move right** from the column header menu. They were carried over from the native grid's command set for familiarity, but nothing was wired behind them. A menu item that does nothing when clicked is worse than an absent one. Column filtering and reordering remain available through the platform's own view definition and personalisation UI.
- The corresponding `.resx` strings, `HeaderStrings` members, and the `onFilter` / `onMove` props.

### Added

- Six tests covering the sentinel (150 total): removal beating a configured column, removal beating a stored column, the round trip through storage, re-grouping after removal, and the sentinel never being mistaken for a real column name.
- A column header menu reference table in CONFIGURATION.md, with a note on why filtering and reordering are not there.

## [1.0.16] - 2026-08-25

Two layering defects, both from styling the wrong element.

### Fixed

- **Column menus rendered as a full-screen white sheet**, hiding the whole app behind them. `styles.root` — which carries `width: 100%`, `height: 100%` and an opaque background — was applied directly to `<FluentProvider>`. Fluent applies the provider's class to the portal mount node it creates for popovers, so every menu portal became a body-level element sized to the entire viewport and painted opaque. Layout now lives on a plain inner `div`; the provider carries only `display: contents`, which also keeps any portal mount node boxless and lets the inner root size against the host container.
- **The dashboard selector flyout appeared behind the control**, making it impossible to switch dashboards. The sticky header, group headers and totals row need to layer against each other, but nothing confined those z-indexes to the control. Added `isolation: isolate` to the root, which creates a local stacking context: internal layering still works, and no value inside the control can outrank the host's own chrome.

### Changed

- Internal layer order is now explicit and non-tying — header (3) above totals (2) above group headers (1) — rather than the header and totals row both sitting at 3.

## [1.0.15] - 2026-08-25

Visual fixes from the first working deployment.

### Fixed

- **Column headers drifted out of alignment with the rows.** The header row sat *outside* the horizontal scroll container, so the moment anything scrolled sideways the header stayed put while the body moved. The header is now inside the scroller and pinned vertically with `position: sticky`, so it scrolls horizontally with the body and cannot desynchronise.
- **A horizontal scrollbar that should not have existed.** Column widths were computed in pixels from the container's measured width, but the *scrollport* is narrower than the container by the width of the vertical scrollbar — so rows came out slightly too wide every time, guaranteeing a scrollbar.

### Changed

- Column sizing is now flex distribution rather than pixel arithmetic (`components/columnLayout.ts`). `flexBasis: 0` with `flexGrow` taken from the view's own `visualSizeFactor` means a row is always exactly as wide as its container, whatever that is. Nothing to measure and nothing to go stale. Column proportions still follow the view definition, because `visualSizeFactor` is already a relative weight.
- One helper now drives the header, data rows, group headers and the totals row, so they cannot disagree about column boundaries — which is what produced the misalignment.
- Horizontal scrolling happens only when the `MIN_COLUMN_WIDTH` floor (96px per column) genuinely cannot fit, which is the one case where a scrollbar is the correct answer.
- The selection checkbox column is explicitly `flexGrow: 0, flexShrink: 0`, so it cannot absorb space from the data columns or vary between row types.
- Group header rows are sticky beneath the header again (`top: HEADER_HEIGHT`), correct now that the header shares the scroll container. The 1.0.12 fix set this to 0 for a header that was outside it.
- `ResizeObserver` is retained, but only for the narrow-width card reflow — column sizing no longer needs it.

## [1.0.14] - 2026-08-24

### Fixed

- **`dotnet build` produced no solution zip** — only `obj/` cache files and a `.FileListAbsolute.txt`. The `.pcfproj` added in 1.0.7 was written in legacy (non-SDK) project format: `ToolsVersion`, the 2003 MSBuild xmlns, and a `Microsoft.CSharp.targets` import. `dotnet build` builds SDK-style projects only and skips legacy ones without a meaningful error, so the solution had nothing to package. Rewritten as `<Project Sdk="Microsoft.NET.Sdk">`.
- `EnableDefaultItems` set to `false`: the SDK's default globs would otherwise sweep `**/*.resx` in as embedded resources (including the control's string resources) and walk `node_modules` looking for sources.
- `Microsoft.NETFramework.ReferenceAssemblies` bumped to 1.0.3, which is what lets the .NET SDK build `net462` on a machine without the .NET Framework.

### Added

- `npm run lint:manifest` now fails the build if the `.pcfproj` is not SDK-style, naming the fix — the failure it prevents has no useful error message of its own.
- A "if the build produces no zip" section in GETTING-STARTED.md and DEPLOYMENT.md covering the two real causes: running in the control folder rather than the solution folder, and a legacy project file.

## [1.0.13] - 2026-08-24

Found by debugging the deployed control live in Chrome.

### Fixed

- **No column was ever totalled.** `selectTotalColumns` received an empty array when the maker left "Columns to total" blank, and `[]` is truthy — so the "explicit list" branch ran and matched nothing. Auto-detection was unreachable dead code, which is why every deployment showed group headers and a Total row with no numbers in them. DOM inspection confirmed it: group rows rendered exactly two cells, the checkbox and the label, and no total cells at all. Emptiness is now tested by length, in a pure function in `core/` with nine tests.
- **A grid with no grouping column rendered nothing.** Rows were only ever emitted inside a group, so when no grouping column resolved, the body was empty while the footer reported "7 records". There is now a flat rendering path, and the grand total shows there too.

### Verified against a live environment

`devnt_time` is `Whole.None` (210) and `devnt_amount` is `Currency` (350, with a `devnt_amount_base` sibling) — both totalable, confirming the defect was selection logic and not type detection. The sticky-offset defect fixed in 1.0.12 was also confirmed directly: `Category 1` and `Category 2` group rows both reported `position: sticky; top: 44px` with bounding-box tops of 262px and 263px — overlapping, which is why Category 1 looked like a blank row.

## [1.0.12] - 2026-08-24

First run against a real environment. Four defects, three of them visible in a single screenshot.

### Fixed

- **Group rows rendered with correct counts but no records underneath.** The filter deciding which records belong to an expanded group assumed the grouping column was always a lookup, reading `raw.id.guid` and building a `lookup:` key. For a choice column the raw value is a number, so no record ever matched and every group expanded to nothing. Row matching now uses the same key function as bucketing.
- **A blank row appeared above the first group, and the first group was missing.** Group header rows were sticky with `top: 44px` to clear the column header — but the column header is a sibling *above* the scroll container, not inside it. The offset pushed the first group row down by 44px, leaving an empty band and hiding it behind the next group. Now `top: 0`.
- **Totals rendered blank.** Values were only accepted when `getValue()` returned a JS `number`; some hosts and column types return numeric strings, which were silently discarded, leaving the column with nothing to sum. Added `toNumber`, applied to totals, base-currency values and format sampling.
- **The server aggregate path built lookup-shaped keys for every data type**, so once server aggregation succeeded, rows would fail to match their groups for the same reason as the first defect. Server results now go through `serverGroupKey`, which mirrors client key construction, and read their label from the formatted-value annotation rather than showing raw option codes.

### Added

- `groupKeyPrefix`, `serverGroupKey` and `isRowInGroup` in `core/groupKey.ts` — a single definition of group identity shared by client bucketing, server aggregate parsing and row filtering. These three disagreeing is what caused two of the four defects.
- Blank group labels now fall back to the raw value or the empty-group label, so a group is never an anonymous unclickable row.
- With **Enable debug logging** on, the control writes a table of every view column with its data type, whether it is totalable, and whether it was totalled — plus a warning when nothing is being totalled. "No totals appear" has several causes that are indistinguishable from the rendered output.
- Column widths now come from a `ResizeObserver` on the container, falling back to `allocatedWidth`. The host reports 0 or -1 until it has sized the control, and in some dashboard tiles never reports at all, which silently fell back to 150px per column.
- 13 regression tests (135 total) covering row-to-group matching across lookup, choice, boolean, text, numeric and null; client/server key agreement including GUID casing and braces; blank-label fallback; and `toNumber`.

## [1.0.11] - 2026-08-24

### Added

- **The runtime grouping choice now persists.** Picking *Group by this column* from the column header menu is remembered per user, per entity, per view, and survives a page reload. This makes the `groupByColumn` property genuinely optional: a maker who cannot or does not want to type a logical name can leave it blank and let users choose.
- `core/groupingPreference.ts` with 13 unit tests (122 total). Storage access is fully guarded — private browsing and locked-down browser policies raise on `localStorage`, and an unguarded access would take the whole grid down.
- Grouping resolution order: the user's stored choice, then the maker's configured column, then ungrouped. A stored or configured column that is no longer in the view is ignored rather than leaving the grid grouped by an invisible column.

### Changed

- CONFIGURATION.md opens with a "minimum you need to set" table. Nothing is mandatory.
- Documented that **Group by column** takes a typed static value, not a field binding, plus how to find a column's logical name and what to do when the classic property editor will not accept a static value.
- Three troubleshooting rows covering the property editor, unresolvable grouping columns, and blocked browser storage.

## [1.0.10] - 2026-08-24

### Fixed

- Dashboard configuration instructions were wrong. Dashboards call the component a **List**, not a subgrid, and the control is added through **Set Properties → Controls** in the classic dashboard designer — not through the modern Components pane, which dashboards do not use. GETTING-STARTED.md and CONFIGURATION.md now describe the actual flow, including **Edit Component** for later changes, adding the dashboard to an app under **Pages**, and **Enable Security Roles**.

### Added

- Guidance that dashboards need a **classic** layout (interactive dashboards do not expose control configuration) and a reasonably wide tile, since the control reflows to cards below roughly 480px.
- Three dashboard-specific rows in the CONFIGURATION.md troubleshooting table.

## [1.0.9] - 2026-08-24

### Fixed

- Documentation instructed `msbuild`, which is only on the PATH inside the Developer Command Prompt / Developer PowerShell for Visual Studio. A plain PowerShell window reports `The term 'msbuild' is not recognized`. All build instructions now lead with `dotnet build`, which requires no Visual Studio and works on Windows, macOS and Linux; MSBuild equivalents are retained as an alternative.
- Corrected an incorrect claim in DEPLOYMENT.md that `dotnet build` could not restore the component project. It can: the project targets `net462` but references `Microsoft.NETFramework.ReferenceAssemblies`, so the .NET SDK builds it without the .NET Framework installed.
- `dotnet build` on the solution project restores and builds the referenced component project in one command, so the separate restore step is now optional rather than required.

### Added

- `PcfBuildMode` set to `production` in `GroupedTotalsGrid.pcfproj`. Without it, MSBuild-driven builds and `pac pcf push` emit an unminified development bundle — noticeably larger and slower at runtime. `npm run build` is unaffected.
- Two rows in the GETTING-STARTED troubleshooting table: `msbuild is not recognized`, and the `MSB4057: CreateManifestResourceNames` error that indicates an MSBuild / .NET Framework mismatch.

## [1.0.8] - 2026-08-24

### Added

- `docs/GETTING-STARTED.md` — the complete path from source to a working grid: build, MSBuild restore, solution packaging, zip verification, maker portal import, and maker portal configuration via both the modern subgrid designer and the classic Controls tab. Includes checkpoints at each stage, a first-run problem table, the `pac pcf push` fast path for development, and the correct removal order.
- Quick start block at the top of the README.

### Changed

- DEPLOYMENT.md import section rewritten with step-by-step maker portal navigation, an explicit environment-picker warning, and how to confirm the control is available in both the modern and classic surfaces afterwards.
- CONFIGURATION.md registration steps expanded with precise maker portal navigation, including reaching the classic solution explorer via **… > Switch to classic**, and setting properties there via the pencil icon and **Bind to static value**.

## [1.0.7] - 2026-08-24

### Fixed

- **Built solution imported with zero objects.** The project had no `.pcfproj`, so `pac solution add-reference` had nothing to reference and the solution zip built successfully while containing no component. Added `GroupedTotalsGrid.pcfproj`. This was an omission from the original scaffold: the project was hand-authored rather than generated by `pac pcf init`, and the npm build path (`pcf-scripts` directly) works without it, so the gap only surfaced at solution packaging time.

### Added

- `GroupedTotalsGrid.pcfproj` — the MSBuild component project. `OutputPath` matches pcf-scripts' `out/controls` default; docs, tests and scripts are excluded from packaged output.
- `.gitignore` covering `node_modules/`, `out/`, `bin/`, `obj/` and the pcf-scripts-generated `GroupedTotalsGrid/generated/`.
- `scripts/check-manifest.js` now validates the `.pcfproj` as well.

### Changed

- Rewrote the solution packaging section of DEPLOYMENT.md: the required `msbuild /t:restore` step, correct `--path` target for `add-reference` (the folder holding the `.pcfproj`), a check that the `ProjectReference` actually landed in the `.cdsproj`, and a zip inspection step before importing.
- Solution folder naming guidance. The previous instructions said `mkdir solution`, and `pac solution init` derives the solution's unique name from the folder — producing a solution literally named "solution".

## [1.0.6] - 2026-08-24

### Fixed

- **Build failed with three errors; all resolved and the build now succeeds end to end.**
- `Module not found: Can't resolve 'react/jsx-runtime'` in `@griffel/react`. Root cause: `@fluentui/react-icons` is not a platform library, so it was bundled, dragging in `@griffel/react` source, which fails strict ESM resolution. Fixed by removing the dependency entirely.
- `TS6133: 'context' is declared but its value is never read` in `index.ts`. The private `context` field was assigned in `init` and `updateView` but never read, since `updateView` uses its own parameter. Field removed.
- `TS7006: Parameter 's' implicitly has an 'any' type` in the `aggregateColumns` parsing chain. Now explicitly typed.
- Restored the `@fluentui/react-components` import block in `ColumnHeaderMenu.tsx`, clobbered by an over-greedy edit in 1.0.6 development.

### Added

- `components/icons/Icons.tsx` - twelve hand-drawn SVG glyphs replacing `@fluentui/react-icons`. Plain geometry using `currentColor`, so they inherit Fluent token colours and stay correct across light, dark and high-contrast themes.

### Removed

- `@fluentui/react-icons` dependency.

### Changed

- **Production bundle is 60 KB, down from a failed 1.57 MiB build.** React and Fluent are externals; nothing else is bundled.
- Manifest now records the verified platform library ranges (React 16.8-16.14.0 or 18-18.3.1; Fluent 9.0.0-9.68.0) and warns that the `FluentUIReactv940` external name is a legacy alias.

### Verified

Against `pcf-scripts` 1.51.1: `build`, `build --buildMode production`, `lint`, 109 tests, and a full `strict` typecheck of every component - all passing.

## [1.0.5] - 2026-08-24

### Removed

- `@testing-library/react` devDependency. It was declared in anticipation of component tests that were never written and was never imported. Re-add it alongside those tests.

### Added

- `docs/DEPENDENCIES.md`, recording what every `npm install` warning and audit finding means. Summary: all nine audit findings are devDependencies of Microsoft's own build tooling (`@opentelemetry/core` via `applicationinsights`, and `immutable` via `browser-sync`), none reach the shipped bundle, and `npm audit fix` is verifiably a no-op because the vulnerable versions are pinned by `pcf-scripts` and `pcf-start`. The `eslint@9.39.5 is no longer supported` warning reflects ESLint's support policy, not the availability of a newer 9.x.

## [1.0.4] - 2026-08-24

### Fixed

- `npm run build` failed at the "Running ESLint..." step with `Could not find config file.` Removing eslint in 1.0.3 was incorrect: `pcf-scripts` invokes ESLint itself as a pipeline task in the `build`, `rebuild`, `start` and `lint` groups, so a config file must exist regardless of whether eslint is declared as a project dependency.

### Added

- `eslint.config.mjs` — a minimal flat config. ESLint 9 (which `pcf-scripts` 1.51 bundles) requires flat config; a legacy `.eslintrc.json` would not be read. Scope is kept small because TypeScript `strict` with `noUnusedLocals` already covers most of it: `no-explicit-any` on, `no-unused-vars` off as duplicative, `no-empty` permitting the deliberate empty catches on the fallback paths, and no type-aware linting.
- `eslint` and `typescript-eslint` restored as devDependencies, since the config imports the latter and it must resolve from the project root.
- `lint` and `lint:fix` scripts, delegating to `pcf-scripts lint` so local linting matches the build exactly.

### Notes

- `verify` does not run lint separately — `build` already does it.
- Linting can be skipped for builds with a `pcfconfig.json` containing `{ "skipBuildLinting": true }`, but this does not apply to `pcf-scripts start`.

## [1.0.3] - 2026-08-24

### Removed

- eslint, `@typescript-eslint/*`, and the `lint` / `lint:fix` scripts. No eslint configuration file was ever committed, so `npm run lint` failed outright; nothing in the build depended on it. Correctness is now covered by TypeScript `strict` with `noUnusedLocals` and `noUnusedParameters`, the two standalone guard scripts, and the test suite.
- Inert `eslint-disable` directives in `hooks/useAggregates.ts` and `core/nativeGridMetrics.ts`. The reasoning behind the deliberately narrow dependency list in `useAggregates` is now stated as a plain comment, since it still matters.

### Changed

- `scripts/check-no-raw-colors.js` per-line escape hatch is now `style-guard-allow` rather than eslint directive syntax, which would have implied a linter that is not running.
- `verify` and `verify:prod` no longer invoke eslint.

## [1.0.2] - 2026-08-24

### Added

- `build:prod`, `rebuild:prod` and `verify:prod` scripts with `--buildMode production` baked in. npm treats flags after `npm run <script>` as its own configuration unless separated by `--`, so `npm run build --buildMode production` silently passed the bare word `production` to `pcf-scripts` and failed with `[pcf-1041] Not a valid sub-command`. The scripts remove the trap.

## [1.0.1] - 2026-08-24

### Fixed

- Manifest failed to parse with `[pcf-1013] Cannot parse manifest: Malformed comment`. XML forbids `--` inside comments, and a comment contained a CLI example with double-hyphen flags.
- Exported control class was `GroupedTotalsGridControl` while the manifest `constructor` attribute was `GroupedTotalsGrid`. These must match. The React component is now imported under an alias in `index.ts`.
- Removed the `currencyColumn` property-set: `Lookup.Simple` is not a valid dataset property-set type. See KNOWN-LIMITATIONS.md for the effect on client-path mixed-currency detection.
- Removed a dead local and its placeholder element in the root component, which `noUnusedLocals` would have rejected.
- Wired the previously unused group sort setter: sorting the grouping column now reorders groups; sorting any other column sorts rows.

### Added

- `npm run lint:manifest` - checks the manifest and resx for malformed comments, unescaped ampersands and unbalanced comment markers, with messages explaining the fix. Wired into `npm run verify` ahead of the build.

## [1.0.0] - 2026-08-24

### Added

- PCF dataset control rendering a model-driven view grouped by a single column, **including lookup columns**, which the native Power Apps grid control does not support.
- Automatic detection of totalable columns (Currency, Decimal, FP, Whole.None, Whole.Duration), with Whole.TimeZone / Whole.Language / Whole.Template deliberately excluded.
- Per-group totals on collapsible group header rows, and a pinned grand-total row.
- Formatting parity: totals render exactly as the platform renders the cells in the same column — precision, currency symbol and placement, locale separators, duration shape.
- Locale-agnostic duration handling. The shape (hours-and-minutes, `h:mm`, decimal hours, minutes) is inferred structurally by comparing rendered numbers against raw minute values, and the platform's own unit words are reused when rendering totals.
- Server-side aggregation via FetchXML built from the view's own FetchXML plus the runtime filter, search and relationship links.
- Aggregate record limit detection by error code, with escalating query partitioning (2, 4, 8…) and bounded concurrency.
- Client-side fallback that computes totals from loaded rows and discloses when they are partial.
- Mixed-currency detection with base-currency substitution and an explanatory info icon.
- Scaled integer-minor-unit summing to eliminate floating-point drift across large result sets.
- Local-calendar-day bucketing for date grouping.
- Native-grid parity: Fluent v9 tokens throughout, cell rendering with hyperlinks for primary and lookup columns, native-mirroring `navigationTypesAllowed`, `enableOptionSetColors` and `rowDensity` properties, a column header menu mirroring the native command set, and skeleton/empty/error states.
- `npm run lint:no-raw-colors` CI guard failing the build on hex, `rgb()`/`hsl()` or hardcoded font-stack literals in styles.
- 109 unit tests across `core/`, including the single-record formatting parity gate.
- Full localisation via `.resx`; no hardcoded user-visible strings.
- Documentation: README, DEPLOYMENT, CONFIGURATION, STYLE-PARITY, KNOWN-LIMITATIONS.

### Known gaps

See `docs/KNOWN-LIMITATIONS.md`. Notably `core/nativeGridMetrics.ts` holds placeholder values pending measurement against a live environment, and component-level tests are not yet written.
