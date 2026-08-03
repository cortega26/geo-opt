# Plan 082: Make JSON-LD validation fail on invalid content

> **Executor instructions**: Preserve human-readable diagnostics while returning
> a structured validation result the CLI can enforce. Never crash on arbitrary
> parsed JSON values.
>
> **Drift check (run first)**: `git diff --stat 888d3e7..HEAD -- src/validate.js bin/cli.js index.d.ts tests/validate.test.js tests/cli-smoke.test.js plans/README.md`

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/081-reconcile-public-types-and-exports.md
- **Category**: bug / public-api
- **Planned at**: commit `0006bb1`, 2026-08-03 (reconciled)

## Why this matters

`geo-opt validate` prints invalid JSON/schema errors but exits zero, so it cannot
serve as a CI validator. `validateSchema(null)` also dereferences `@context` and
crashes. The command should distinguish valid, invalid, and operational failure
without changing unknown-type notes into hard errors.

## Current state

- `src/validate.js:49-58` assumes `parsed` is an object (`parsed["@context"]`
  deref at 54-56; a `null` root crashes).
- `validateSchemaFile` (starts at `src/validate.js:96`) prints and continues for
  parse/schema errors, then returns `undefined` ("No JSON-LD blocks found" early
  return at 125-132; per-block loop after).
- `bin/cli.js:544-552` exits nonzero only when an exception is thrown.
- `tests/validate.test.js` asserts messages but not structured return or CLI
  exit status.
- Core-return/CLI-exit ownership is an invariant at
  `docs/documentation-governance.md:71-72`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Validator | `node --test tests/validate.test.js` | pass |
| CLI | `node --test --test-name-pattern="validate" tests/cli-smoke.test.js` | pass |
| Types | `npm run typecheck` | exit 0 |
| Full | `npm run check` | exit 0 |

## Scope

**In scope**: validator core, CLI adapter, public return declarations, focused
tests, `CHANGELOG.md`, `plans/README.md`.

**Out of scope**: adding remote Schema.org validation, changing required-field
policy, or treating unknown types/notes as invalid.

## Git workflow

- Branch: `advisor/082-enforce-jsonld-validation`
- Commit example: `fix(validate): return and enforce invalid status`.

## Steps

### Step 1: Define the result contract

Return a stable aggregate such as `{ valid, blockCount, errors, warnings,
notes, blocks }` from `validateSchemaFile`. Each block should record parse vs
schema errors without including source file content. Define no blocks,
malformed JSON, non-object roots, empty graph, missing type/fields, and wrong
context as invalid; unknown-type notes remain valid.

**Verify**: declaration and consumer type tests compile.

### Step 2: Make validation total over JSON values

Handle null, primitives, and arrays explicitly in `validateSchema` and return
errors rather than throwing. Preserve valid graph/root-object behavior.

**Verify**: table-driven unit tests for null/string/number/array/object all
return structured results and never crash.

### Step 3: Enforce result in the CLI

Keep diagnostics, but have the CLI set/return nonzero when `valid` is false.
Operational read errors remain stderr + nonzero. Valid and note-only files exit
zero. Keep machine-readable stdout concerns out of this text-only command.

**Verify**: CLI smoke tests assert exit 0 for valid/note-only and exit 1 for no
block, malformed, and schema-invalid files.

### Step 4: Record and run gates

Add an Unreleased Fixed bullet and run type/package/full gates.

**Verify**: `npm run check && git diff --check` -> exit 0.

## Test plan

- Function results plus spawned CLI exit/status/stderr/stdout.
- Valid root, valid graph, unknown type note, null, primitive, empty graph,
  invalid JSON, missing fields, no block, unreadable/missing file.

## Done criteria

- [ ] Invalid structured data exits nonzero.
- [ ] Valid/note-only data exits zero.
- [ ] Arbitrary parsed JSON values cannot crash the validator.
- [ ] Public types and full checks pass.

## STOP conditions

- Existing documented consumers rely on `undefined` return in a way that makes
  additive result data breaking.
- Required-field policy must change to satisfy tests.
- Output must become JSON; that is a separate CLI contract decision.

## Maintenance notes

Future validators should add structured block diagnostics first, then render in
the CLI. Review invalidity rules separately from warnings/notes.
