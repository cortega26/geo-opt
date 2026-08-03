# Plan 081: Reconcile the published TypeScript API with runtime exports

> **Executor instructions**: Treat `src/index.js` runtime exports as current
> truth unless evidence shows an export is accidental. Synchronize declarations,
> consumer tests, and architecture docs in one change.
>
> **Drift check (run first)**: `git diff --stat 888d3e7..HEAD -- src/index.js src/profiles.js src/batch.js src/findings.js src/llms-txt.js src/sitemap.js index.d.ts tests/consumer.test.ts tests/artifact.test.js docs/architecture.md plans/README.md`

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: bug / public-api / types
- **Planned at**: commit `0006bb1`, 2026-08-03 (reconciled — line refs verified current:
  `src/index.js:33-34` exports the model constants, `findCommonBaseDir` at 84,
  `validateSitemapXml` at 96; `index.d.ts:307` declares only `MODEL_VERSION`)

## Why this matters

The package exposes runtime symbols and accepted values that its declaration
file omits, while at least one function signature and report union are stale.
TypeScript consumers receive false errors or incomplete autocomplete despite
publish validation passing.

## Current state

- `src/index.js` exports `MODEL_VERSION_V1`, `MODEL_VERSION_V2`,
  `findCommonBaseDir`, and `validateSitemapXml`; `index.d.ts` declares none.
- `src/profiles.js:69-77` defines profile `service`; `ProfileId` at
  `index.d.ts:171-177` omits it.
- `auditFiles` accepts `(files, config, model = "v1", onProgress)` at
  `src/batch.js:19`; declaration line 651 has only two arguments.
- `AuditResult.report` is declared only `AuditReport`, although v2 returns
  `V2Report`; `GeoConfig.profile` is an unbounded string.
- `tests/consumer.test.ts:140-174` imports only part of the runtime surface.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Type contract | `npm run typecheck` | exit 0 |
| Package | `npm run validate:package` | publint/attw pass |
| Runtime | `node --test tests/artifact.test.js` | pass |
| Full | `npm run check` | exit 0 |

## Scope

**In scope**: `index.d.ts`, consumer/artifact contract tests, runtime export
files only if an export is proven accidental, `docs/architecture.md`,
`CHANGELOG.md`, `plans/README.md`.

**Out of scope**: TypeScript rewrite, changing scoring/report behavior, or
removing a public runtime export without an explicit breaking-change decision.

## Git workflow

- Branch: `advisor/081-public-type-parity`
- Commit example: `fix(types): synchronize runtime export surface`.

## Steps

### Step 1: Make parity machine-checkable

Add a contract test that enumerates runtime export names and compares them to a
maintained compile-time consumer import list or generated declaration-export
list. It must fail for the four currently missing declarations.

**Verify**: contract test fails before declaration repair and passes after it.

### Step 2: Correct declarations

Declare both model constants, `findCommonBaseDir`, `validateSitemapXml`, and the
`service` profile. Correct `GeoConfig.profile`, `AuditResult.report`, and the
full `auditFiles` model/progress signature. Reconcile any additional mismatch
reported by the parity test; do not broaden types to `any`/`string` to hide it.

**Verify**: `npm run typecheck` -> exit 0 with consumer examples exercising
every corrected symbol/value/signature.

### Step 3: Update public-contract docs and release record

Update architecture only where export/profile contracts are enumerated. Add an
Unreleased Fixed bullet.

**Verify**: package validation and full check pass.

## Test plan

- Import every missing symbol from `geo-opt` in `tests/consumer.test.ts`.
- Compile `profile: "service"`, v2 `auditFiles`, and an `onProgress` callback.
- Assert runtime exported names stay synchronized with the contract fixture.

## Done criteria

- [ ] Every runtime export has a usable declaration.
- [ ] Profile and batch signatures match live runtime behavior.
- [ ] Consumer type test and package validators pass.
- [ ] No public export is removed without approval.

## STOP conditions

- A runtime export is intentionally private but already shipped; request a
  compatibility decision before removing it.
- Parity requires a breaking report-type redesign.
- Another selected plan changes the same signature; rebase and refresh excerpts.

## Maintenance notes

This is a regression after archived Plan 031. Keep the new parity test as the
durable gate; public export changes must update index, declarations, consumer
tests, and architecture together.
