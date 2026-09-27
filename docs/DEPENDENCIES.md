# Dependencies and audit findings

`npm install` on this project emits deprecation warnings and reports audit findings. All of them were investigated; none require action. This document records what they are, so nobody has to re-derive it.

Verified against `pcf-scripts` 1.51.1 / `pcf-start` 1.51.1 on 2026-08-24.

## Nothing here reaches production

Every finding below sits in **devDependencies** — the build toolchain and the local test harness. The artifact you ship is the control bundle produced by `pcf-scripts build`, which contains your source plus React and Fluent (and for a virtual control, those are supplied by the platform rather than bundled). None of these packages are in it.

That is the main thing to tell a security reviewer who arrives holding an `npm audit` printout.

## The audit findings

Nine findings, five moderate and four high, tracing to exactly two roots — both inside Microsoft's own tooling:

| Root | Chain | Severity |
|---|---|---|
| `@opentelemetry/core` | ← `applicationinsights` ← `pcf-scripts`, `pcf-start` | 5 moderate |
| `immutable` | ← `browser-sync`, `browser-sync-ui` ← `pcf-start` | 4 high |

The first is Microsoft's build telemetry. The second is the local development harness's live-reload server.

**`npm audit fix` does nothing here.** It advertises a fix, but running it leaves all nine findings in place, because the vulnerable versions are pinned by `pcf-scripts` and `pcf-start`'s own dependency ranges — `immutable` stays at 3.8.4 and `@opentelemetry/core` at 1.30.1 regardless. This was tested, not assumed. Do not spend time on it; it resolves when Microsoft updates the tooling.

**If you must reduce the count**, the only real lever is dropping the local harness:

```bash
npm uninstall pcf-start
```

then remove the `start` and `start:watch` scripts. This eliminates all four high findings, which all come from `browser-sync`. The cost is losing `npm start` — the local harness is genuinely useful for iterating on layout and formatter work, though it cannot exercise the aggregate path, real view FetchXML, metadata, or security trimming, all of which need a real environment anyway. Judge it against how much you actually use it.

## The deprecation warnings

| Warning | Comes from | Verdict |
|---|---|---|
| `inflight`, `glob@7` | transitive, via jest and the build tooling | Not directly installed. Nothing to do. |
| `whatwg-encoding`, `abab`, `domexception` | `jsdom`, via `jest-environment-jsdom` | Needed: `core/fetchXmlBuilder.ts` uses `DOMParser` and `XMLSerializer`, so the tests must run against a DOM implementation. Testing against the same APIs the browser provides is the point. |
| `eslint@9.39.5 is no longer supported` | `eslint` | **9.39.5 is the current 9.x release.** This is ESLint's support policy — they only support the newest version — not a signal that a newer one exists. Confirmed via `npm view eslint@^9 version`. It is also the exact version `pcf-scripts` bundles. Nothing to upgrade to. |

## The allow-scripts warning

```
npm warn allow-scripts   @parcel/watcher@2.6.0 (install: node scripts/build-from-source.js)
```

`@parcel/watcher` is an optional native dependency of `sass`, itself pulled in by the build tooling. Your npm setup blocks install scripts by default, which is a sensible policy.

**You do not need to approve it for `npm run build`, `test`, `lint` or `verify`** — those all work with it unbuilt. Approve it only if you use `npm start watch` and find file watching unreliable, in which case:

```bash
npm approve-scripts @parcel/watcher
```

## Removed dependencies

- **`@testing-library/react`** — declared in 1.0.0 in anticipation of component tests that were never written, so it sat unused. Re-add it at the same time as the tests rather than carrying it dead. See KNOWN-LIMITATIONS.md.

## Re-checking this later

```bash
npm audit                       # current findings
npm ls <package>                # what pulls a package in
npm view eslint@^9 version      # is a newer minor actually available
```

If the counts change materially from the table above, the tooling has moved and this document is stale.
