# Plan 090: Render Python audit results without rescoring files

> **Executor instructions**: Reuse the report already produced by `audit_files`.
> Preserve text output and exit behavior exactly while eliminating the second
> read/score pass.
>
> **Drift check (run first)**: `git diff --stat 888d3e7..HEAD -- .agents/skills/geo-optimization/scripts/geo_optimizer.py .agents/skills/geo-optimization/scripts/test_optimizer.py tests/conformance.test.js plans/README.md`

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/084-align-python-artifact-contracts.md
- **Category**: performance / architecture
- **Planned at**: commit `0006bb1`, 2026-08-03 (reconciled)

## Why this matters

Python text-mode auditing first scores every file through `audit_files`, then
calls `audit_file` for each success, which rereads and scores the file again.
Large batches pay roughly double scoring work and can render data different
from the report used for thresholds if a file changes between passes.

## Current state

- `geo_optimizer.py:2380` computes `batch_results = audit_files(...)`.
- Text mode loops successes and calls `audit_file(r["file"], ...)` at lines
  2389-2393.
- `audit_files` starts at line 1271; `_score_content` is at 1353; `audit_file`
  is at 1441; rendering is currently coupled to that path.
- JSON and summary modes already consume `batch_results` directly.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Python | `python3 .agents/skills/geo-optimization/scripts/test_optimizer.py` | all pass |
| Conformance | `npm run test:conformance` | pass |
| Full | `npm run check` | exit 0 |

## Scope

**In scope**: Python rendering/orchestration and tests, conformance only if
needed, `CHANGELOG.md`, `plans/README.md`.

**Out of scope**: changing v1 scoring, Python capability tier, text format, or
Node implementation.

## Git workflow

- Branch: `advisor/090-python-single-score-pass`
- Commit example: `perf(python): render cached audit reports`.

## Steps

### Step 1: Characterize output and call count

Capture text output for one success, mixed success/error, multi-file summary,
and threshold pass/fail. Add a seam/mock around `_score_content` asserting one
call per discovered file.

**Verify**: output tests pass; call-count test reports two calls per successful
file before the fix.

### Step 2: Extract a pure report renderer

Separate text rendering from file I/O/scoring so it accepts `(report, filepath)`
or the batch success record. Keep `audit_file` as a compatible adapter for
direct callers, but have CLI batch text mode render `r["report"]` directly.

**Verify**: unit tests for renderer and `audit_file` adapter pass.

### Step 3: Prove single-pass orchestration

Switch the CLI loop to the pure renderer. Keep stderr ordering, summaries,
thresholds, and partial-failure exit unchanged.

**Verify**: one `_score_content` call per file; golden text output is unchanged.

### Step 4: Record and run gates

Add an Unreleased Performance bullet.

**Verify**: Python suite, conformance, full check, and diff check pass.

## Test plan

- Direct `audit_file`; CLI one/many/mixed; JSON unaffected; threshold;
  score-call counter; file mutation between scoring/rendering no longer matters.

## Done criteria

- [ ] Each Python CLI audit scores a file at most once.
- [ ] Text/JSON/summary/threshold outputs and exits remain compatible.
- [ ] Direct `audit_file` callers remain supported.
- [ ] Python/conformance/full checks pass.

## STOP conditions

- Existing external callers import a renderer contract not represented in tests.
- Output equivalence requires rescoring because batch results omit a load-bearing field.
- A score/report changes.

## Maintenance notes

Keep scoring, rendering, and process exit as separate layers. Future Python
batch features should consume stored reports, not reopen source files.
