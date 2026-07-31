# Plan 056: Type the JSON-LD generator with `schema-dts` (TS-migration companion)

> **Executor instructions**: This plan is **READY**. It is no longer gated on the
> TypeScript migration — the gate was reopened on 2026-07-31 via the per-file
> JSDoc route (see "Activation gate"). Follow the steps in order, run every
> verification, and update the status row in `plans/README.md`. If a
> "STOP conditions" item occurs, stop and report.
>
> **Drift check (run before starting)**:
> `git diff --stat 13fb3bf..HEAD -- src/schema.js src/config.js index.d.ts tsconfig.json`
> Compare the "Current state" excerpts against the live code before proceeding.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: LOW–MED (type-only; no runtime output change)
- **Horizon**: near term (unblocked 2026-07-31)
- **Depends on**: nothing outstanding. The former dependency on the TypeScript
  migration was **removed** on 2026-07-31 — see "Activation gate" for the
  measurements that replaced it. The source migration stays deferred (memory
  `project-ts-migration.md`) and this plan no longer waits on it.
- **Category**: tech-debt / correctness (compile-time guardrail)
- **Planned at**: commit `13fb3bf`, 2026-06-29
- **Re-scoped at**: commit `2c03601`, 2026-07-31

## Why this matters

The JSON-LD generator in `src/schema.js` (620 lines) builds Schema.org objects
by hand — `@type`, `@context`, nested `@graph` nodes, property names like
`datePublished`, `author`, `offers`, etc. A typo in a property name or a wrong
`@type` produces JSON-LD that is **syntactically valid but semantically wrong**:
search engines and AI crawlers silently ignore the malformed node, and nothing
in the test suite necessarily catches it.

[`schema-dts`](https://www.npmjs.com/package/schema-dts) is Google's official,
type-only package of TypeScript definitions for the entire Schema.org
vocabulary. Typing the generator's output against `schema-dts` turns
property/`@type` mistakes into **compile-time errors** in the exact module where
a vocabulary error is otherwise invisible. It ships no runtime code (types
only), so it adds zero bytes to the published artifact.

This only pays off once `src/schema.js` is type-checked. Hence the dependency on
the TS migration and the long-term horizon. Until then it is recorded so it is
not re-discovered.

## Current state

- `src/schema.js` is plain JS (ESM) generating Schema.org JSON-LD; Pro-only
  advanced types (Course, Event, Recipe, HowTo) landed in plan 038.
- `src/config.js` already validates user config shapes with `zod` (e.g.
  `offerSchema` with `price`/`priceCurrency`/`availability`) — that guards
  **input**; `schema-dts` would guard **output** (the emitted JSON-LD).
- TypeScript is configured for typecheck (`tsconfig.json`, `npm run typecheck`;
  CI runs it after plan 042). The public surface is `index.d.ts`.
- The TS migration is deferred (memory `project-ts-migration.md`).
- **Governance constraint** (`AGENTS.md`): never infer author, publisher,
  publication date, price, or availability for generated structured data. Typing
  the output must not change *which* fields are populated — only *that* the ones
  populated are spelled and typed correctly.

## Activation gate — OPEN as of 2026-07-31

The original gate assumed this plan had to wait for the whole-codebase TypeScript
migration. That assumption was **measured and rejected** on 2026-07-31.

`tsconfig.json` today sets `allowJs: false`, `checkJs: false` and includes only
`index.d.ts` + `tests/consumer.test.ts` — so `src/` is not type-checked at all.
Compiling *only* `src/schema.js` (and its transitive imports) under `checkJs`:

| Configuration | Errors in the transitive closure |
|---|---|
| `strict: true` inherited from the root config | 187 (103 in `schema.js`) |
| `strict: false`, `noImplicitAny: false` | **11** (4 `schema.js`, 6 `llms-txt.js`, 1 `text.js`) |

The 45 `TS7006` "implicit any parameter" errors are the bulk of the cost and
contribute **nothing** to this plan's goal, which is Schema.org *vocabulary*
correctness — not full typing of the module.

The load-bearing assumption was verified empirically: under `strict: false` /
`noImplicitAny: false`, `schema-dts` still catches what matters via a JSDoc
`@type` annotation:

```
error TS2561: 'headLine' does not exist in type 'ArticleLeaf...'. Did you mean 'headline'?
error TS2322: Type '"HowToStepp"' is not assignable to type '"HowToStep"'.
```

Unannotated code in the same file produced no new errors. Therefore the gate is
open on the **per-file JSDoc route** anticipated by this plan's own Maintenance
notes: a dedicated `tsconfig.schema.json`, no `.ts` conversion, no dependency on
the source migration.

Preconditions still required before starting:
- `npm run check` green on `main` (it is, as of `2c03601`).
- The root `tsconfig.json` remains `strict: true` for `index.d.ts` — see Step 1.

## Commands you will need

| Purpose          | Command                        | Expected |
|------------------|--------------------------------|----------|
| Install (dev)    | `npm install -D schema-dts`    | exit 0; in `devDependencies` (type-only) |
| Typecheck (root) | `npm run typecheck`            | exit 0; must stay `strict: true` |
| Typecheck schema | `npm run typecheck:schema`     | exit 0 (new in Step 1) |
| Full check       | `npm run check`                | exit 0   |

## Scope

**In scope**:
- `tsconfig.schema.json` — **new** per-file type-check project (Step 1).
- `package.json` — add `schema-dts` to `devDependencies` (it is types-only; it
  must not become a runtime dependency), plus the `typecheck:schema` script
  wired into `check`.
- `.github/workflows/ci.yml` — one new typecheck step.
- `src/schema.js` — annotate the builders' constructed objects with `schema-dts`
  types via JSDoc (e.g. `Article`, `Product`, `WithContext<...>`, `Graph`);
  the file stays `.js`.
- `src/llms-txt.js`, `src/text.js` — minimal JSDoc to clear the baseline errors
  they contribute to the schema project (Step 2). No behavior change.
- `tests/schema.test.js` — only for the `HowToStep` shape fix (Step 2).
- `CHANGELOG.md`.

**Out of scope**:
- Modifying the root `tsconfig.json`, or relaxing `strict` anywhere outside
  `tsconfig.schema.json`.
- Extending `checkJs` to the rest of `src/` — that is the deferred TS migration
  (187→724 errors), explicitly *not* this plan.
- Inferring any author/publisher/date/price/availability (governance rule
  stands). The one deliberate output change permitted is the `HowToStep` `name`
  inconsistency in Step 2, which adds no inferred data.
- Runtime validation of JSON-LD — `schema-dts` is compile-time only. Runtime
  Schema.org validation, if ever wanted, is a separate decision.
- The zod input schemas in `src/config.js` — unrelated layer.
- Public `index.d.ts` shape, unless typing surfaces a real prior defect (then
  it is a synchronized-governance change, filed separately).

## Git workflow

- Branch: `advisor/056-schema-dts-typed-jsonld`
- Commit: `feat(schema): type JSON-LD output with schema-dts (compile-time vocabulary guard)`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Per-file type-check scaffolding

Create `tsconfig.schema.json` — a **second, separate** project. Do **not** modify
the root `tsconfig.json`: it guards the public surface (`index.d.ts`) at
`strict: true`, and relaxing it there would regress that guarantee.

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "allowJs": true,
    "checkJs": true,
    "noEmit": true,
    "strict": false,
    "noImplicitAny": false
  },
  "include": ["src/schema.js"]
}
```

The relaxed strictness is deliberate and scoped: it buys the drop from 187 to 11
errors while preserving every check this plan actually depends on (verified —
see "Activation gate"). It applies to this project only.

**Verify**: `npx tsc -p tsconfig.schema.json` runs and reports the 11 known
errors (fixed in Step 2). `npm run typecheck` still exits 0 and `tsconfig.json`
is unchanged in the diff.

### Step 2: Fix the 11 errors

Baseline errors at commit `2c03601`:

- `src/schema.js` ×4 — three are `.error` accessed on a discriminated union
  (`{valid:true,…} | {valid:false,error}`). **Diagnose each before "fixing" it**:
  these are most likely narrowing artifacts resolved by an explicit JSDoc
  `@returns` on the validator, *not* real defects. Do not restructure working
  runtime code to satisfy an annotation gap.
- `src/schema.js:294` — `TS2322`, a **genuine shape inconsistency**: the primary
  `HowToStep` branch emits `{name, text}` while the fallback branch emits
  `{position, text}`. This is exactly the class of silent defect this plan exists
  to catch. **Do not assume the fix is "add `name` to the fallback."** Both
  `name` and `position` are valid `HowToStep` properties, and the fallback path
  derives from numbered steps where no heading exists — synthesizing a `name`
  there would be *inferring content*, which the governance rule forbids.
  Determine the correct shape against the Schema.org `HowToStep` definition
  first; the likely answer is to reconcile the *types*, not to invent data.
  If the resolution does change emitted output, treat it as a real behavior
  change: update `tests/schema.test.js` deliberately and add the second
  changelog bullet in Step 7.
- `src/llms-txt.js` ×6 — `.title` / `.description` on `object | {}`; JSDoc.
- `src/text.js:170` ×1 — Cheerio `this`-context clash
  (`Cheerio<Document> | Cheerio<Element>`); may warrant a single narrowly-scoped
  suppression with a comment.

**Verify**: `npx tsc -p tsconfig.schema.json` → exit 0.

### Step 3: Wire it into `check` and CI

Without this step the config exists and **enforces nothing** — `npm run
typecheck` runs only the root project.

- `package.json`: add `"typecheck:schema": "tsc -p tsconfig.schema.json"`, and
  add it to the `check` script next to the existing `typecheck`.
- `.github/workflows/ci.yml`: add a `Typecheck (schema)` step after the existing
  `Typecheck` step.

**Verify**: `npm run check` → exit 0, and its output shows the schema typecheck
running. Deliberately reintroduce a property typo and confirm `npm run check`
fails.

### Step 4: Install `schema-dts` (dev, type-only)

```bash
npm install -D schema-dts
```

**Verify**: under `devDependencies`; resolves from ESM. Confirm it contributes no
runtime import in `dist/` after build.

### Step 5: Annotate builder return types

For each JSON-LD builder in `src/schema.js`, type its constructed object with the
matching `schema-dts` type. Use `WithContext<T>` for top-level nodes that carry
`@context`, and the bare type for `@graph` members.

`src/schema.js` stays **plain JS** — annotate via JSDoc `@type` with inline
`import(...)` types. No `.ts` conversion, no `import type` statement (which would
be a syntax error in a `.js` module):

```js
/** @type {import("schema-dts").WithContext<import("schema-dts").Article>} */
const node = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: meta.title,
  //  ^ a typo like "headLine" or a wrong @type is now a compile error
};
```

Annotate the constructed object (or the variable holding it) rather than the
function's return type — under `noImplicitAny: false` the annotation on the
object literal is what triggers excess/unknown-property checking.

Fix every type error `schema-dts` surfaces. Each one is either a real
property/`@type` mistake (fix the value) or an over-narrow type (widen with the
correct `schema-dts` union member — do not cast to `any` to silence it).

**Verify**: `npm run typecheck:schema` → exit 0 with the new annotations.

### Step 6: Guard against `any`-casting

Grep the diff for `as any` / `// @ts-ignore` introduced to silence `schema-dts`.
Each must be justified in a comment or removed. The point of the plan is that
the types are *real* guards.

**Verify**: `grep -n "as any\|@ts-ignore\|@ts-nocheck" src/schema.*` shows no
newly-introduced, unjustified suppressions. In particular `@ts-nocheck` must
never appear in `src/schema.js` — it would silently void the entire plan.

### Step 7: Full check + changelog

Under `## [Unreleased]`:

```markdown
### Changed
- JSON-LD output in `src/schema.js` is now typed against `schema-dts` (Google's
  Schema.org type definitions), so property-name and `@type` mistakes are caught
  at compile time. Type-only; no runtime/dependency change to the published
  package.
```

**If — and only if — Step 2's `HowToStep` resolution changed emitted output**,
add a second bullet. The "type-only" claim above is then no longer complete on
its own, and omitting this would under-report a real behavior change:

```markdown
### Fixed
- `HowToStep` nodes emitted by the HowTo generator now use a consistent shape
  across both the section-derived and numbered-step paths. <!-- describe the
  actual reconciliation; do not claim more than was changed -->
```

**Verify**: `npm run check` → exit 0.

## Test plan

- `npm run typecheck:schema` passes with `schema-dts` annotations in place.
- `npm run typecheck` (root, `strict: true`) still passes — unchanged.
- **Negative test**: introduce a property typo (e.g. `headLine`) and confirm
  `npm run check` fails. Without this, the gate may be inert.
- `tests/schema.test.js` passes; the only permitted assertion change is the
  `HowToStep` `name`/`position` fix from Step 2, which must be deliberate and
  reviewed — every other assertion stays untouched.
- `dist/` contains no `schema-dts` runtime import (it is types-only).

## Done criteria

- [ ] `tsconfig.schema.json` added; root `tsconfig.json` unchanged in the diff
- [ ] The 11 baseline errors resolved; `npm run typecheck:schema` green
- [ ] `typecheck:schema` wired into `npm run check` **and** into `ci.yml`
- [ ] Negative test confirms the gate actually fails on a typo
- [ ] `schema-dts` in `devDependencies` only
- [ ] Builders in `src/schema.js` annotated via JSDoc; file is still `.js`
- [ ] No new unjustified `as any` / `@ts-ignore` / `@ts-nocheck`
- [ ] No newly inferred author/date/price/availability — including no
      synthesized `HowToStep` `name` (see Step 2)
- [ ] If emitted output changed at all, the changelog says so (Step 7 bullet 2)
- [ ] `npm run check` exits 0
- [ ] `plans/README.md` status row updated

## STOP conditions

- Clearing the baseline errors starts requiring changes to runtime logic rather
  than annotations — STOP and report; the 11-error figure was measured against
  annotation-only fixes.
- Typing forces a change to *which* fields are emitted beyond the known
  `HowToStep` fix, risking the "never infer author/publisher/date/price/
  availability" rule — STOP; the rule outranks convenience.
- `schema-dts` types conflict with a deliberate, spec-valid construct the
  generator emits — widen with the correct union member or, as a last resort,
  document a single narrowly-scoped exception; do not blanket-cast.
- Making `typecheck:schema` green appears to require relaxing the **root**
  `tsconfig.json` — STOP; that regresses the public-surface guard and is out of
  scope.

## Maintenance notes

- `schema-dts` is versioned against Schema.org releases; bump it occasionally and
  re-run typecheck to pick up new/renamed types.
- This pairs naturally with plan 053 (`attw`): once the schema module is typed,
  `attw` confirms the *consumer*-facing types resolve, and `schema-dts` confirms
  the *internal* JSON-LD is well-typed.
- **This is now the primary route, not a fallback**: the plan applies
  via JSDoc `@type {import("schema-dts").Article}` annotations
  on the builder functions, without converting the file to `.ts`.
