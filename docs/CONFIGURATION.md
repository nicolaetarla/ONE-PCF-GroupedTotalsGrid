# Configuration

![Grouped Totals Grid, light theme](media/control-light.png)

> New to this control? [GETTING-STARTED.md](GETTING-STARTED.md) walks the whole path from build to a working grid. This document is the reference: every property, two worked examples, and troubleshooting.

## Where the table and view come from

The control does not have "entity" or "view" properties, and that is deliberate. It is a dataset control, so it inherits both from where you register it — which means makers keep authoring views the normal way, and users keep their filters, search and view switching.

### Option A — one subgrid (most common)

Use this when you want grouped totals in one specific place.

1. make.powerapps.com → **Solutions** → open your solution.
2. **New** → **Dashboard** (or open an existing form under the table's **Forms** area).
3. Add a **Subgrid** component from the component palette.
4. In the right-hand properties pane, set **Table** and **Default view**. *This is where you choose the entity and the starting view.* Turn on **Show view selection** if users should be able to switch.
5. Still in that pane, expand **Components** → **+ Component** → **Grouped Totals Grid**.
6. Tick the form factors: **Web**, **Phone**, **Tablet**.
7. Configure the properties (below). Enter **logical names**, not display names.
8. **Save**, then **Publish**.

Users can still switch views from the subgrid's view selector if **Show view selection** is on; the control follows.

### Option B — every view of a table

Use this when the whole table should always show grouped totals.

1. make.powerapps.com → **Solutions** → open your solution → command bar **…** (More) → **Switch to classic**. A new browser window opens. The modern designer cannot register a control at table level.
2. Expand **Entities**, select the table, open the **Controls** tab.
3. **Add Control…** → **Grouped Totals Grid** → **Add**.
4. In the row that appears, tick the form factors: **Web** / **Phone** / **Tablet**. This makes it the default grid for those clients.
5. Configure the properties: click the **pencil icon** beside each one, choose **Bind to static value**, and enter the value.
6. **Save**, then **Publish**.

This is a heavier commitment — every view of that table renders through the control — so pilot it with Option A first.

### Option C — a dashboard

The usual home for an "hours by resource this month" style view. Note that dashboards call the component a **List**, not a subgrid, and configure it through a different dialog.

Use a **classic** dashboard; interactive dashboards do not expose control configuration.

1. make.powerapps.com → **Solutions** → open your solution → **New** → **Dashboard** → choose a classic layout.
2. The dashboard designer opens in a new tab. In an empty tile, click the **List** icon.
3. In **Set Properties**: set **Name**, **Label**, **Table** and **Default View**.
4. Switch to the **Controls** tab → **Add Control…** → **Grouped Totals Grid** → **Add**.
5. Tick **Web** (and Phone / Tablet as needed).
6. Set each property via the **pencil icon** → **Bind to static value**.
7. **OK** → **Save** → **Publish**.
8. Add the dashboard to your app in the app designer under **Pages**, then publish. Use **Enable Security Roles** on the dashboard to restrict visibility.

To change it afterwards, select the list and use **Edit Component** on the designer toolbar.

Size the tile generously. Below roughly 480px the control reflows to a card layout — correct on a phone, but not what you want in a narrow desktop tile.

---

## The minimum you need to set

Nothing is mandatory. Every property has a working default, and the control auto-detects which columns to total. In practice:

| Situation | What to set |
|---|---|
| You want users to choose the grouping | **Nothing.** Add the control, save, publish. Users pick from the column header menu, and their choice is remembered per view. |
| You want a fixed grouping for everyone | **Group by column** = the column's logical name. |
| Grouping a percentage or rating column is meaningless | **Columns to total** = an explicit comma-separated list. |
| Duration totals look wrong | **Duration total format** = an explicit shape. |

### The column header menu

Clicking a column header opens a menu with only the commands the control actually implements:

| Command | Effect |
|---|---|
| Sort A to Z / Z to A | Sorts the view. On the grouping column it reorders the groups instead. |
| Group by this column | Groups by that column. Remembered per user, per view. |
| Remove grouping | Turns grouping off, overriding the **Group by column** property for that user and view. |
| Show total / Hide total | Adds or removes that column from the totals. Numeric columns only. |

Column filtering and reordering are deliberately absent: the platform's own view definition and personalisation UI already provide them, and duplicating the entries without wiring them to anything is worse than leaving them out.

### Setting Group by column in the classic Controls tab

This property takes a **typed logical name**, not a field binding. In the property editor, choose the **static value** option and type the name — for example `new_category`. The "bind to a value on a field" option is for per-record properties and does not apply to a grid-wide setting like this one.

If the static option is not offered in your dialog, do not fight it. **Leave the property empty**, save and publish, then group from the column header menu at runtime. The choice is stored per user, per entity, per view, and survives reloads — so the visible result is the same.

### Finding a column's logical name

Solutions → **Tables** → your table → **Columns**. The **Name** column is the logical name. A column labelled *Category* is typically `new_category`, `cr123_category` or similar depending on the publisher prefix — it is rarely just `category`.

## Properties

### Grouping

| Property | Default | Notes |
|---|---|---|
| **Group by column** | *(blank)* | Logical name, e.g. `msdyn_bookableresource`. **Lookups are supported** — this is the control's main reason to exist. Blank means users pick from the column header menu, and their choice is remembered per view. A user's choice overrides this value. |
| **Allow users to change grouping** | Yes | Adds *Group by this column* to the column header menu. Set to No to pin the grouping. |
| **Start with groups collapsed** | Yes | Leave on for large result sets; expanding everything on a few thousand rows is slow and rarely what anyone wants. |
| **Show record counts** | Yes | The "12 records" beside each group label. |
| **Empty group label** | `(No value)` | Records with nothing in the grouping column. This group always sorts last. |

### Totals

| Property | Default | Notes |
|---|---|---|
| **Columns to total** | *(blank)* | Comma-separated logical names. Blank auto-detects every totalable column in the view. Names not in the current view are ignored. |
| **Show grand total** | Yes | Pins a total row to the bottom. |
| **Totals mode** | Auto | See below. |
| **Duration total format** | Auto | `Auto` matches how the platform formats the cells. Override with Hours and minutes / Hours:minutes / Decimal hours / Minutes. |
| **Maximum rows loaded** | 5000 | Ceiling on rows pulled into the browser. Beyond it, groups load rows on expand. |

**Totals mode:**

- **Auto** (recommended) — server aggregation, falling back to loaded rows if the aggregate query fails. Always shows a number; discloses when it is partial.
- **Server aggregate only** — never falls back. Shows an error instead of a possibly-partial total. Use when a wrong number is worse than no number.
- **Loaded rows only** — never queries the server. Use for small subgrids where the extra request is not worth it, or where the aggregate query cannot be built.

### Native-grid parity

| Property | Default | Notes |
|---|---|---|
| **Navigation types allowed** | All | Which cells are hyperlinks. `All`, `Primary only`, `None`. Mirrors the Power Apps grid control property of the same name. |
| **Enable choice colours** | No | Renders choice columns with their configured background colours. Check contrast before enabling. |
| **Row density** | Platform default | `Platform` follows the host setting or the native default. |

### Diagnostics

| Property | Default | Notes |
|---|---|---|
| **Enable debug logging** | No | Console diagnostics: which totals path ran, why a fallback happened, which duration shape was inferred. Leave off in production. |

---

## Worked example 1 — Field Service time entries by resource

The scenario the native grid cannot handle, because Bookable Resource is a lookup.

**View setup** — create a Time Entry view:

- Table: `msdyn_timeentry`
- Columns: Resource (`msdyn_bookableresource`), Start (`msdyn_start`), Work Order, Entry Type, Duration (`msdyn_duration`), any billable amount column
- Filter: Entry Status equals Submitted, Start on or after the period start
- Sort: Start descending

**Control setup:**

| Property | Value |
|---|---|
| Group by column | `msdyn_bookableresource` |
| Columns to total | *(blank — auto-detect)* |
| Duration total format | Auto |
| Totals mode | Auto |
| Show grand total | Yes |

**Result:** one collapsible row per resource showing total hours and total billable amount, and a pinned grand total. Duration totals render as hours and minutes because that is how the Duration cells render.

**Why blank is the right answer for "Columns to total":** auto-detection picks up `msdyn_duration` and the currency column and nothing else — `msdyn_timeentryid` is not numeric, and time-zone/language integer columns are excluded on purpose because summing them is meaningless.

**Note on the duration unit:** `msdyn_duration` is stored in **minutes**. The control sums minutes and formats once at the end. It never sums the formatted strings, which is the mistake that produces totals like "37 hour 45 minute".

## Worked example 2 — Opportunities by account (the currency path)

**View setup:**

- Table: `opportunity`
- Columns: Topic, Account (`parentaccountid`), Est. Close Date, Est. Revenue (`estimatedvalue`), Probability
- Filter: State equals Open

**Control setup:**

| Property | Value |
|---|---|
| Group by column | `parentaccountid` |
| Columns to total | `estimatedvalue` |
| Show grand total | Yes |

Here **Columns to total** is set explicitly, because auto-detection would also total **Probability** — a percentage, where a sum is nonsense even though the type is numeric. Auto-detection cannot know that; you can.

**Multiple currencies:** if a group contains opportunities in more than one transaction currency, the control substitutes the base-currency sum and shows an info icon on that group explaining why. It will not add USD to EUR and present the result as a number.

---

## Choosing Totals mode and Maximum rows

| Result set | Totals mode | Maximum rows loaded |
|---|---|---|
| Under ~500 rows (typical subgrid) | Loaded rows only | 5000 |
| A few thousand | Auto | 5000 |
| Tens of thousands | Auto | 2000 |
| Hundreds of thousands | Server aggregate only | 1000 |

Lowering **Maximum rows loaded** on a large set is not a downgrade — totals still come from the server and stay correct. It only means group rows load on expand rather than up front, which is faster.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| No totals at all | No totalable columns in the view | Add a Currency, Decimal, or Duration column to the view layout. The control will not total a column the user cannot see. |
| Totals blank for one column | Every value is null | Blank is correct here — a `0` would be a claim the data does not support. |
| "Totals cover the records loaded so far" | Server aggregate path failed; client fallback in use | Turn on debug logging to see why. Usually an untranslatable filter operator or a missing view id. |
| Totals disagree with the rows | Runtime filter not carried into the aggregate query | Debug logging will show the generated FetchXML. Report the filter that broke it — this is a bug, not a configuration issue. |
| "Totals unavailable" error bar | Aggregate limit exceeded and partitioning could not run | Narrow the date filter, or switch Totals mode to Auto so it can fall back. |
| Grouping column not found | Logical name typo, or column not in the view | Use the logical name (`msdyn_bookableresource`), not the display name. The column must be in the view layout. If it cannot be resolved, the grid renders ungrouped rather than failing. |
| Cannot enter a value for **Group by column** | The dialog is offering field binding only | Leave it empty and group from the column header menu instead. The choice persists per user, per view. |
| Grouping choice not remembered | Browser storage blocked, or the view changed | Preferences are stored in `localStorage` per entity and view. Private browsing or a locked-down browser policy disables this; the control degrades to ungrouped rather than erroring. |
| Duration total in the wrong shape | Inference had nothing usable to sample | Set **Duration total format** explicitly. |
| Duration total like "37.75" where cells show "37 hours 45 minutes" | Column is Decimal (hours) not Whole.Duration (minutes) | This is correct behaviour — check which column you totalled. |
| Info icon on a money total | Group spans multiple transaction currencies | Working as designed. The total shown is base currency. |
| Command bar buttons stay greyed out | Selection not reaching the host | Confirm **Enable multiselect** behaviour and that the control version is current; selection is wired through `setSelectedRecordIds`. |
| Control not appearing after import | Customizations not published | Publish all customizations, then hard refresh. |
| Deployed a change but nothing changed | Control version not incremented | Bump `<control version>` in the manifest, rebuild, reimport, publish, hard refresh. |
| Looks unstyled or wrong colours | Theme not reaching the control | Confirm the platform-library versions in the manifest match your platform release. A mismatch silently falls back to bundled libraries. |
| Export to Excel has no grouping or totals | Expected | Export is a platform command operating on the view, not on the control. See KNOWN-LIMITATIONS.md. |
| On a dashboard, the grid renders as cards instead of a table | Tile too narrow | The control reflows below ~480px by design. Use a wider tile, or a full-width single-column layout. |
| Dashboard shows the standard list, not this control | Control added to the wrong place | On dashboards the control goes in **Set Properties → Controls** for the **List** component — not in the modern Components pane, which dashboards do not use. |
| Dashboard not visible to users | Not added to the app, or restricted | Add it under **Pages** in the app designer and publish. Check **Enable Security Roles** on the dashboard. |
