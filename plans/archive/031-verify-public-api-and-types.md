# Plan 031: Make the public JavaScript API and types verifiably identical

> **Executor instructions**: Preserve current root imports unless a documented
> pre-release API decision explicitly removes one. Do not rewrite runtime code
> in TypeScript.
>
> **Drift check (run first)**:
> `git diff --stat f91fae7..HEAD -- src/index.js index.d.ts package.json package-lock.json tests README.md docs/architecture.md CHANGELOG.md`

## Status

- **Priority**: P1
- **Effort**: S–M
- **Risk**: LOW
- **Depends on**: plan 029
- **Category**: API / DX
- **Planned at**: commit `f91fae7`, 2026-06-27
- **Status**: DONE (landed 2026-06-27)

## Why this matters

`src/index.js` exports `scoreContentV2`, but the handwritten declaration file
does not declare it or its report. No current check compiles a consumer. The
package can therefore pass CI while publishing JavaScript and types that
disagree.

## Current state

- `package.json:5-6` points runtime to `src/index.js` and types to `index.d.ts`.
- `src/index.js:1-75` is the runtime export surface.
- `index.d.ts` is a 648-line ambient declaration.
- `package.json:23-32` has no typecheck or public-consumer test.
- The npm package has not been publicly released, so an explicit export map is
  still low-risk.

## Commands

| Purpose    | Command                     | Expected                                |
| ---------- | --------------------------- | --------------------------------------- |
| Typecheck  | `npm run typecheck`         | exit 0                                  |
| Full check | `npm run check`             | exit 0                                  |
| Package    | `npm pack --dry-run --json` | types and intended entry point included |
| Whitespace | `git diff --check`          | no output                               |

## Scope

**In scope:** files in the drift check plus a focused TypeScript consumer
fixture/config.

**Out of scope:** TypeScript source migration, behavior changes, scoring changes
or arbitrary removal of current root exports.

## Steps

### 1. Inventory and classify root exports

Produce a machine-checkable list of runtime exports. Classify the root as the
supported facade; prevent undocumented deep imports with a package `exports`
map while preserving the root and package metadata access needed by tooling.

**Verify:** existing root import examples work in Node.

### 2. Complete v1/v2 and technical types

Add explicit v2 report, profile, dimension and result types. Correct any
signature drift found while comparing every runtime export to declarations.

**Verify:** a consumer fixture imports and uses every supported export.

### 3. Add a typecheck gate

Add TypeScript as a development-only checker, a minimal NodeNext-compatible
config and `npm run typecheck`. Include it in `npm run check`.

**Verify:** intentional removal of one declaration makes the consumer fixture
fail.

### 4. Document support boundaries

Update the README library section and architecture source-of-truth matrix.
Document that internal files are not supported import paths.

**Verify:** package preview includes declarations and excludes test fixtures.

## Test plan

- Compile a realistic consumer using v1, v2, technical audit, schema and robots
  APIs.
- Assert runtime root export names match a maintained expected list.
- Assert package self-reference resolves under NodeNext.
- Preserve current JavaScript tests.

## Done criteria

- [x] Every supported runtime export has an accurate declaration.
- [x] `scoreContentV2` and its report compile in a consumer.
- [x] `npm run typecheck` is part of the full check.
- [x] The package export map blocks accidental deep-import contracts.
- [x] README describes the supported facade.

## STOP conditions

- A known external consumer relies on a deep import that the export map would
  block.
- Type accuracy requires guessing an unstable report field before plan 029
  completes.
- The proposed checker requires runtime TypeScript dependencies.

## Maintenance notes

Any future root export must update the declaration and consumer fixture in the
same change.
