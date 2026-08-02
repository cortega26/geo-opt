# Plan 071: Make the GitHub composite action execute quoted paths correctly

> **Executor instructions**: Treat input values as data, never shell source. Run
> every test with a path containing spaces and quotes. Update the index when done.
>
> **Drift check (run first)**: `git diff --stat 888d3e7..HEAD -- .github/actions/geo-opt-audit/action.yml tests/ci-assets.test.js plans/059-rebaseline-g1-evidence-cohort.md plans/README.md`

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: MED
- **Depends on**: plans/069-match-audit-advisories-by-stable-identity.md and plans/070-make-evidence-freshness-tests-deterministic.md for a green baseline
- **Category**: bug / dx
- **Planned at**: commit `888d3e7`, 2026-08-02
- **Executed at**: commits `f08577d` + `b6321b6` (2026-08-02) on branch
  `advisor/071-repair-github-action`, approved by reviewer, squash-merged to
  main as `eca2aa4` (2026-08-02, after release 2.3.4 `9cc6c22`). Deviations
  recorded: README.md/README.es.md test-count badges updated 758→763→764
  (required by `scripts/check-test-count.js`, part of done criterion "full
  checks pass"; same pattern as Plans 069/070). Reviewer revision round:
  hostile threshold/label inertness test added (the original suite covered
  only a hostile path); verified live that all five input channels are inert
  argv/data elements.
  Pre-existing inconsistency flagged, not fixed (out of scope):
  `tests/058-docs-claims.test.js` pins the prose "112 suites" while the live
  `node --test` count is 145 — the README badge count (the gate-checked
  figure) is correct.

## Why this matters

The documented copy-paste GitHub Action cannot reliably run: it stores literal
quote characters inside a scalar `ARGS` string and expands that string
unquoted. Bash does not re-interpret embedded quote characters as syntax, so a
normal path becomes malformed arguments. This entry path must work before the
Plan 059 adoption clock begins.

## Current state

- `.github/actions/geo-opt-audit/action.yml:58-74` builds `CLI` and `ARGS` as
  strings, then executes `$CLI $ARGS`.
- `tests/ci-assets.test.js:44-62` checks only static JSON/stderr tokens; it does
  not execute argument construction.
- `README.md:309-329` and `README.es.md:289-309` advertise this action.
- Shell input handling must use a Bash array and quoted expansion, e.g.
  `args=(audit "$path")` followed by `node "$cli" "${args[@]}"`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| CI asset tests | `node --test tests/ci-assets.test.js` | all pass |
| Action smoke | `node --test tests/ci-action-shell.test.js` | exit 0 for spaced/quoted path |
| Full check | `npm run check` | exit 0 |
| Diff | `git diff --check` | exit 0 |

## Scope

**In scope**: `.github/actions/geo-opt-audit/action.yml`,
`tests/ci-assets.test.js`, new `tests/ci-action-shell.test.js` and a directly
tested shell helper only if needed, `CHANGELOG.md`,
`plans/059-rebaseline-g1-evidence-cohort.md`, `plans/README.md`.

**Out of scope**: score aggregation and Pro wording (Plan 072), GitLab shell
construction, publishing a release, or changing the CLI parser.

## Git workflow

- Branch: `advisor/071-repair-github-action`
- Commit example: `fix(ci): execute composite action arguments safely`.

## Steps

### Step 1: Add an executable argument-boundary regression

Factor the command construction into a directly testable Bash helper if that is
the smallest way to execute the exact logic. Test a fixture path containing a
space, a single quote, and shell metacharacters; prove it is passed as one
argument and no metacharacter executes. Also cover recursive and threshold
flags.

**Verify**: `node --test tests/ci-action-shell.test.js` fails against scalar
`ARGS` and passes after Step 2.

### Step 2: Replace scalar command strings with arrays

Resolve the CLI path into one quoted variable, build `args=(...)`, append flags
as separate elements, and invoke `node "$cli_path" "${args[@]}"`. Keep stdout,
stderr, exit-code capture, and `$RUNNER_TEMP` behavior unchanged.

**Verify**: `node --test tests/ci-assets.test.js` plus the focused smoke test ->
all pass.

### Step 3: Gate Plan 059 on the repaired action

Update Plan 059's dependency/status text and drift paths so its observation
clock cannot start before Plans 071 and 072 are done. Add an Unreleased Fixed
bullet.

**Verify**: `npm run check && git diff --check` -> exit 0.

## Test plan

- Execute the same helper/command shape used by the action, not a retyped
  approximation.
- Assert argv boundaries for plain, spaced, quoted, and metacharacter paths.
- Assert threshold exit status is preserved and stderr stays separate.

## Done criteria

- [ ] The action uses no scalar `ARGS` plus unquoted expansion.
- [ ] Hostile-looking input remains one inert argv element.
- [ ] The action still emits score/passed/badge outputs and propagates CLI exit.
- [ ] Plan 059 records the dependency; full checks pass.

## STOP conditions

- Testing would require real GitHub secrets or publishing the action.
- The fix requires `eval`, `bash -c` with interpolated inputs, or another parse pass.
- Score semantics must change to repair argv handling; leave that to Plan 072.

## Maintenance notes

The archived Plan 065 covered static asset contracts but not executable shell
semantics. Review future inputs for array-based argv handling; never concatenate
user-controlled values into shell source.
