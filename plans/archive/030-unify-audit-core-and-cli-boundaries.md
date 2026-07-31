# Plan 030: Unify audit orchestration and isolate CLI side effects

> **Executor instructions**: Consolidate behavior incrementally. Add a shared
> path, switch callers, then remove duplication. Preserve command names, flags,
> stdout JSON and exit codes.
>
> **Drift check (run first)**:
> `git diff --stat f91fae7..HEAD -- bin/cli.js src/batch.js src/config.js src/scoring.js src/scoring-v2.js src/schema.js src/robots.js src/validate.js src/index.js tests index.d.ts README.md docs/architecture.md CHANGELOG.md`

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: plan 029
- **Category**: architecture / maintainability
- **Planned at**: commit `f91fae7`, 2026-06-27
- **Status**: TODO

## Why this matters

The CLI has separate v1 and v2 loops for batch execution, threshold handling,
serialization and errors. Several exported library functions also print and
terminate the host process. `batchInject` already duplicates behavior to avoid
those exits. This makes every new model or output option a multi-path change.

## Current state

- `bin/cli.js:254-318` implements the v2 workflow.
- `bin/cli.js:320-395` implements a second v1 workflow.
- `src/batch.js:17-38` is hard-wired to `scoreContent`.
- `src/config.js`, `src/scoring.js`, `src/schema.js`, `src/robots.js` and
  `src/validate.js` contain exported functions that call `process.exit`.
- Pure precedents already exist: `scoreContent`, `scoreContentV2`,
  `auditRobots`, `auditTechnicalHtml` and `validateWritableTargetInsideCwd`.

## Commands

| Purpose    | Command                                                        | Expected       |
| ---------- | -------------------------------------------------------------- | -------------- |
| CLI tests  | `node --test tests/optimizer.test.js tests/scoring-v2.test.js` | all pass       |
| Full check | `npm run check`                                                | exit 0         |
| Package    | `npm pack --dry-run --json`                                    | parseable JSON |
| Whitespace | `git diff --check`                                             | no output      |

## Scope

**In scope:** files in the drift check. New focused modules under `src/` or
`bin/commands/` are allowed only when they own a clear responsibility.

**Out of scope:** changing scoring formulas, schema semantics, v1 deprecation,
remote fetching, asynchronous rewrite, plugin framework or Python parity.

## Steps

### 1. Define a small audit-engine boundary

Create one internal selector that accepts model, content, filepath and config,
then returns the normalized `{score, report}` result. Reject unknown models with
a normal error.

**Verify:** unit tests execute v1 and v2 through the same boundary.

### 2. Generalize batch execution

Make one batch function accept the selected engine/model and collect per-file
errors. Reuse one aggregate, threshold and serialization path.

**Verify:** v1/v2 single, batch, summary and threshold CLI contracts pass.

### 3. Separate domain errors from process exits

Pure/library functions return result data or throw typed/descriptive errors.
Thin CLI adapters own stderr and exit codes. Preserve compatibility wrappers
only where needed and document them.

**Verify:** importing and calling the core from a child test cannot terminate
the host process; CLI failure cases still exit non-zero.

### 4. Consolidate rendering

Keep text renderers separate from analyzers. JSON serialization must operate on
returned reports and emit one valid document.

**Verify:** machine-readable stdout contains only JSON for every audit mode.

### 5. Split CLI code only along stable boundaries

If `bin/cli.js` remains difficult to review after consolidation, extract audit,
schema/validation, robots and llms command registration modules. Do not create a
generic command framework.

**Verify:** `node bin/cli.js --help` and every subcommand help snapshot remain
compatible.

## Test plan

- Shared engine selection and invalid model.
- V1/v2 single and multi-file JSON.
- Summary and threshold with successes and errors.
- Core error does not exit the process.
- CLI maps core errors to stderr/non-zero.
- Existing injection/path-confinement tests remain green.

## Done criteria

- [ ] One path owns batch, summary, threshold and JSON behavior for v1/v2.
- [ ] Core/library functions in scope do not own process termination.
- [ ] No duplicated injection implementation exists solely to avoid exits.
- [ ] Public CLI contracts and tests remain compatible.
- [ ] Full checks and package preview pass.

## STOP conditions

- Consolidation requires changing a documented JSON field or exit code without
  a migration decision.
- A proposed abstraction has only one caller and adds no contract boundary.
- Scope expands into structured-data semantic changes from plan 024.

## Maintenance notes

Future models implement the engine boundary; they do not add new CLI loops.
Terminal presentation remains replaceable without changing domain results.
