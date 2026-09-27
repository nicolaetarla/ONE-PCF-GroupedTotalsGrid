# Deployment

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | LTS (18 or 20) | Newer majors sometimes outpace `pcf-scripts`; if the build fails oddly, drop to the current LTS before debugging anything else. |
| npm | 9+ | Ships with Node. |
| Power Platform CLI (`pac`) | Latest | `dotnet tool install --global Microsoft.PowerApps.CLI.Tool`, or the VS Code extension. |
| .NET SDK | 6.0+ | Builds the solution project and the component project. Sufficient on its own. |
| Visual Studio Build Tools | Optional | Only if you prefer `msbuild`. Note that `msbuild` is only on the PATH inside the Developer Command Prompt / Developer PowerShell for VS — a plain PowerShell window will report `The term 'msbuild' is not recognized`. |

Environment prerequisites:

- System Administrator or System Customizer on the target environment.
- Code components must be permitted in the environment. For model-driven apps this is the default; if your tenant has restricted it, an admin must re-enable it in the Power Platform admin centre.

Verify your setup:

```bash
node --version
pac --version
dotnet --version
```

Visual Studio is not required. `dotnet build` works on Windows, macOS and Linux; the component project targets `net462` but references `Microsoft.NETFramework.ReferenceAssemblies`, so the .NET SDK builds it without the .NET Framework present.

## Build

```bash
npm install
npm run verify     # lint + colour guard + tests + build
```

`npm run build` produces the development bundle. For a release bundle:

```bash
npm run rebuild:prod
```

> **Do not write `npm run build --buildMode production`.** npm parses those flags as its own configuration rather than passing them to the script, so `pcf-scripts` receives the bare word `production` and fails with `[pcf-1041] Not a valid sub-command 'production'`. Passing arguments through npm requires a `--` separator (`npm run build -- --buildMode production`), which is easy to forget — hence the `build:prod` and `rebuild:prod` scripts, which have the flag baked in.

To run the full gate including a production build:

```bash
npm run verify:prod
```

### Linting is part of the build

`pcf-scripts` runs ESLint itself, in the `build`, `rebuild`, `start` and `lint` task groups. It is not optional in the way a normal lint step is: with no config file present the build fails outright with `Could not find config file.` ESLint cannot be removed from a PCF project, only configured.

The project ships a deliberately small `eslint.config.mjs`. ESLint 9 requires **flat config** — a legacy `.eslintrc.json` is ignored and will not satisfy the build.

To skip linting during builds, add a `pcfconfig.json` at the project root:

```json
{ "skipBuildLinting": true }
```

This only affects `build` and `rebuild`. `pcf-scripts start` lints regardless of the flag, so the config file still has to exist.

Report the bundle size after a production build and keep an eye on it — a dataset control that balloons past ~1 MB noticeably delays first paint on every view it is registered against.

## Development inner loop

For iterating on the control itself:

```bash
npm start watch
```

This opens the local test harness. It is genuinely useful for layout and formatter work, but it is **not** the platform: it does not give you real view FetchXML, real metadata, real security trimming, or the real theme. Anything touching the aggregate path has to be tested in an org.

To push directly to a development environment:

```bash
pac auth create --environment https://yourorg.crm.dynamics.com
pac pcf push --publisher-prefix onec
```

`pac pcf push` is a **development-only** mechanism. It creates a temporary unmanaged solution and does not produce an artifact you can move between environments. Never use it against test or production.

## Packaging into a solution

> **If your imported solution shows 0 objects, this section is why.** The most common cause is that the solution project has no working reference to the component project, so the zip builds successfully and contains nothing. Verify the zip contents before importing — see "Check the zip" below.

### Prerequisite: the component project must restore

The component project file is `GroupedTotalsGrid.pcfproj` at the repo root. `pac solution add-reference` points at it, and MSBuild builds it. Restore it once before anything else:

```bash
cd /path/to/D365PCF-GroupsAndTotals
npm install
dotnet restore
```

MSBuild equivalent, from a Developer Command Prompt: `msbuild /t:restore`.

A `NU1100: Unable to resolve 'Microsoft.PowerApps.MSBuild.Pcf'` error at this step means NuGet cannot reach nuget.org. Check your NuGet sources, and behind a corporate feed make sure the package is mirrored.

### The solution project

The solution project is committed at [`GroupedTotalsGridSolution/`](../GroupedTotalsGridSolution): unique name `GroupedTotalsGridSolution`, publisher `ONEConsultNET`, prefix `onec`, with a `ProjectReference` to `../GroupedTotalsGrid.pcfproj`. Do not regenerate it with `pac solution init` — a new solution or publisher would import as a different solution alongside the existing one.

Its version lives in `src/Other/Solution.xml` and must equal `package.json`; `npm run lint:versions` fails the build otherwise. Bump it with the manifest version on every release.

### Build

From the repo root. `dotnet build` restores and builds the referenced component project in the same command, on Windows, macOS or Linux:

```bash
# Unmanaged, for a development environment
npm run package:dev      # dotnet build GroupedTotalsGridSolution --configuration Debug

# Managed, for test and production
npm run package          # dotnet build GroupedTotalsGridSolution --configuration Release
```

MSBuild equivalent, from a Developer Command Prompt: `msbuild GroupedTotalsGridSolution /t:build /restore /p:configuration=Release`.

Output lands in `GroupedTotalsGridSolution/bin/Debug/` and `GroupedTotalsGridSolution/bin/Release/` as a `.zip`.

To emit both managed and unmanaged in one file — the usual choice for a release artifact — set `<SolutionPackageType>Both</SolutionPackageType>` in the `.cdsproj`.

### If no zip is produced

A successful build with no `.zip` in `bin/` — just cache files and a `.FileListAbsolute.txt` — means the packaging target never ran. Check, in order:

1. **Project.** Build `GroupedTotalsGridSolution` (where the `.cdsproj` lives). A bare `dotnet build` at the repo root builds only the component and emits `out/controls`.
2. **Project style.** `GroupedTotalsGrid.pcfproj` must open with `<Project Sdk="Microsoft.NET.Sdk">`. `dotnet build` skips legacy project files without a meaningful error. `npm run lint:manifest` enforces this.
3. **Reference.** The `.cdsproj` must contain a `ProjectReference` to `GroupedTotalsGrid.pcfproj`.

MSBuild from a Developer Command Prompt builds both project styles, so it is the quicker workaround if you would rather not change the project file.

### Check the zip before importing

Sixty seconds here saves an import-and-wonder cycle:

```bash
unzip -l GroupedTotalsGridSolution/bin/Release/GroupedTotalsGridSolution.zip
```

You should see a `Controls/onec_ONEConsult.net.GroupedTotalsGrid/` folder containing `ControlManifest.xml`, `bundle.js` and `strings/`. If the zip holds only `solution.xml`, `customizations.xml` and `[Content_Types].xml`, the component was not included — go back and check the `ProjectReference` in the `.cdsproj`.

You can also grep `customizations.xml` for a `<CustomControl>` node naming the control.

## Importing

### Maker portal

1. Go to **make.powerapps.com**.
2. **Confirm the environment** in the top-right picker before anything else. Importing into the wrong environment is the most common mistake here and the least obvious afterwards.
3. Left navigation → **Solutions**.
4. Command bar → **Import solution**.
5. **Browse** → select the built zip → **Next**.
6. Review the solution name, version and publisher → **Import**. Expect a minute or two.
7. Open the imported solution and confirm **Objects** lists the custom control. **If it shows 0, stop** — the zip did not contain the component. See "Check the zip" above.
8. Back on the Solutions list, command bar → **Publish all customizations**.

### CLI

```bash
pac auth create --environment https://target.crm.dynamics.com
pac solution import --path GroupedTotalsGridSolution/bin/Release/GroupedTotalsGridSolution.zip --publish-changes --async
```

### Confirm the control is available

Either surface works as a check:

- **Modern:** open any form with a subgrid → select the subgrid → **Components** → **+ Component**. *Grouped Totals Grid* should be in the list.
- **Classic:** Solutions → your solution → **…** → **Switch to classic** → **Entities** → any table → **Controls** tab → **Add Control…**. It should appear in the dialog.

If it does not appear, publish all customizations again and hard refresh. Control registration lists are cached.

For configuring a view to actually use it, see [GETTING-STARTED.md](GETTING-STARTED.md) step 6, or [CONFIGURATION.md](CONFIGURATION.md) for the full property reference.

## Versioning

Two version numbers matter and they are not the same thing.

1. **Control version** in `ControlManifest.Input.xml` (`<control version="1.0.0">`). This must be incremented on **every** change to the control, however small. The platform caches control bundles aggressively; shipping a code change without bumping this is the single most common cause of "I deployed but nothing changed."
2. **Solution version** in the solution project. Increment for each release you distribute.

After an upgrade, users may still hold a cached bundle. A hard refresh (Ctrl+F5) clears it. If a whole org is stuck, republish customizations.

## ALM

Recommended layering:

- **DEV** — unmanaged. Control developed here, solution exported from here.
- **TEST / UAT** — managed, imported from the DEV export.
- **PROD** — managed, imported from the same artifact that passed UAT. Never rebuild between TEST and PROD; ship the bytes you tested.

Pipeline outline:

```
1. npm ci
2. npm run verify                       # lint, colour guard, tests, build
3. dotnet build -c Release              # produce managed zip (no VS required on the agent)
4. pac solution import --path ... (TEST) --async
5. run the manual matrix in STYLE-PARITY.md
6. pac solution import --path ... (PROD) --async
```

Store the built zip as a pipeline artifact so step 6 consumes exactly what step 4 consumed.

## Upgrading

Import the new managed solution over the old one; the platform performs an upgrade. Views already configured to use the control pick up the new version automatically once customizations are published and caches clear.

If a property was added between versions, existing registrations get its default value. If a property was **removed**, the platform tolerates the orphaned configuration but the value is ignored — clean it up at the next convenient release.

## Rollback

Order matters here, and getting it wrong leaves views rendering nothing.

**To revert to a previous version:** import the previous managed solution as an upgrade. Properties introduced in the newer version are dropped.

**To remove the control entirely:**

1. **First**, change every affected view and subgrid back to the default grid control. Classic solution explorer → table → Controls tab → remove Grouped Totals Grid; and each form's subgrid → Components → remove it.
2. Publish all customizations.
3. Confirm the affected views render normally.
4. **Only then** uninstall the solution.

Uninstalling first leaves registrations pointing at a control that no longer exists, and those views break until the registration is manually cleaned up.

Keep a note of which tables and subgrids the control is registered against — there is no built-in report for this, and on a large org it is easy to miss one.
