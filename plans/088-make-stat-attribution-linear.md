# Plan 088: Make repeated-stat attribution scanning linear

> **Executor instructions**: Preserve every observed count and source window.
> Characterize output first, then replace repeated full-string searches with
> indices captured during matching.
>
> **Drift check (run first)**: `git diff --stat 888d3e7..HEAD -- src/observations.js tests/observations.test.js tests/scoring-v2.test.js plans/README.md`

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: MED
- **Depends on**: none
- **Category**: performance
- **Planned at**: commit `888d3e7`, 2026-08-02

## Why this matters

Attribution detection collects statistic strings, then repeatedly calls
`nthIndexOf` for each occurrence during filtering and again during source-window
evaluation. Documents with many repeated values can trigger quadratic scanning.
Regex iteration already provides each occurrence index.

## Current state

- `src/observations.js:593-610` uses `String.match`, a seen map, and
  `nthIndexOf` to recover indices.
- Lines 625-641 repeat the seen-map/`nthIndexOf` process.
- Quotes use the same pattern at lines 643-676 and should be assessed but not
  changed unless the same safe indexed representation applies.
- Regression for repeated `50%` values is
  `tests/observations.test.js:217-237`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Observations | `node --test tests/observations.test.js` | pass |
| V2 corpus | `node --test tests/scoring-v2.test.js` | pass; fixture scores unchanged |
| Full | `npm run check` | exit 0 |

## Scope

**In scope**: attribution occurrence collection/evaluation, focused tests and a
bounded benchmark/regression, `CHANGELOG.md`, `plans/README.md`.

**Out of scope**: attribution regex/pattern changes, window-size tuning, score
changes, or general async/performance rewrites.

## Git workflow

- Branch: `advisor/088-linear-stat-attribution`
- Commit example: `perf(observations): retain statistic match offsets`.

## Steps

### Step 1: Capture semantic and scaling baselines

Add table tests for repeated identical stats with mixed attribution and a large
synthetic document. Record counts/status and use an operation counter or a very
generous relative timing check; avoid flaky absolute millisecond gates.

**Verify**: existing and new semantic tests pass before refactor.

### Step 2: Retain match records

Use `matchAll` or an equivalent single regex iteration to produce
`{ raw, index }` records. Filter years/contextual identifiers using the captured
index, then evaluate windows from the same record. Remove the redundant
`nthIndexOf` passes for stats. Apply to quotes only if tests prove identical
ordering/index semantics.

**Verify**: operation-count test is O(matches + text length); every semantic
count and corpus score is unchanged.

### Step 3: Record and run gates

Add an Unreleased Changed/Performance bullet.

**Verify**: observation tests, v2 corpus, full check, and diff check pass.

## Test plan

- Repeated same value; overlapping-looking values (`50`, `50%`); years;
  technical ids; source before/after; Unicode surrounding text; large repeat set.

## Done criteria

- [ ] Statistic locations are captured in one scan and reused.
- [ ] Existing observed facts and all fixture scores are unchanged.
- [ ] Scaling regression demonstrates linear lookup work.
- [ ] Full checks pass; scoped files only.

## STOP conditions

- Refactor changes occurrence ordering or attribution windows.
- A score fixture changes for any reason.
- Performance can only be asserted with a flaky wall-time threshold.

## Maintenance notes

Review future detectors for “collect strings, then rediscover their offsets.”
Prefer structured match records at the extraction boundary.
