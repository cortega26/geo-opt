# Plan 029: Stabilize audit findings and version identities

> **Executor instructions**: Follow this plan step by step. Preserve v1 as the
> default. Do not change scoring thresholds or readiness bands. If a contract
> decision cannot preserve current v1 JSON fields, stop and report.
>
> **Drift check (run first)**:
> `git diff --stat f91fae7..HEAD -- src/findings.js src/scoring.js src/scoring-v2.js src/batch.js src/engagement.js bin/cli.js tests CHANGELOG.md`

## Status

- **Priority**: P0
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: correctness / public contract
- **Planned at**: commit `f91fae7`, 2026-06-27
- **Status**: DONE (2026-06-27)

## Why this matters

V2 currently publishes two incompatible finding shapes. Dimension scorers emit
only `ruleId`, `status` and `message`; the observation bridge calls
`createFinding` with `status` instead of `severity` and omits `category`.
Aggregation expects the complete contract. In addition, v1 and v2 reports both
identify their model as `2.0.0`, so persisted reports cannot reliably identify
the algorithm that produced them.

## Current state

- `src/findings.js:59-96` defines the complete finding factory.
- `src/findings.js:477-583` passes incomplete arguments to that factory.
- `src/scoring-v2.js:27-455` creates reduced dimension findings.
- `src/scoring-v2.js:548-612` merges reduced and full findings.
- `src/batch.js:84-109` aggregates fields absent from reduced findings.
- `src/findings.js:14-17` conflates report/model/package-era versioning.
- `bin/cli.js:315-316` records a successful free injection after a v2 audit.

## Commands

| Purpose       | Command                                                        | Expected  |
| ------------- | -------------------------------------------------------------- | --------- |
| Focused tests | `node --test tests/scoring-v2.test.js tests/optimizer.test.js` | all pass  |
| Full check    | `npm run check`                                                | exit 0    |
| Coverage      | `npm run test:coverage`                                        | exit 0    |
| Whitespace    | `git diff --check`                                             | no output |

## Scope

**In scope:** files in the drift check.

**Out of scope:** changing score weights, switching the default model, removing
v1, redesigning CLI modules, changing the Python port, or narrowing exports.

## Steps

### 1. Define explicit version constants

Represent report-contract version, v1 model version and v2 model version
separately. Make `buildReportMeta` receive or derive an explicit model identity.
Keep all existing v1 fields.

**Verify:** tests prove v1 and v2 report different model identifiers while
sharing the intended report-contract version.

### 2. Normalize every v2 finding

Route all published v2 findings through `createFinding`. Supply category,
severity/status, evidence label, applicability, source refs, observed facts and
remediation. Remove duplicate findings only when they express the same rule and
facts; do not silently discard distinct diagnostics.

**Verify:** iterate through every v2 fixture and assert every finding has the
complete contract with valid values.

### 3. Harden aggregation and rendering

Make summary aggregation consume only validated findings. Add regression tests
for v2 `topFindings`, JSON and `--explain` output.

**Verify:** no `topFindings` entry omits `category` or `evidenceLabel`.

### 4. Remove the audit/injection side effect

Delete the v2-audit call to `recordSuccessfulFreeInjection`. Keep the legitimate
call after successful non-dry-run Community injection.

**Verify:** a v2 audit does not create or increment engagement state; injection
still does.

### 5. Document the contract correction

Update `CHANGELOG.md` under `Unreleased` and any inline contract comments.

**Verify:** `npm run changelog:check` exits 0.

## Test plan

- Complete finding shape for every v2 fixture.
- Invalid severity/evidence/category inputs fail at the factory boundary.
- v1 and v2 model identities differ.
- V2 summary preserves category/evidence.
- V2 audit has no engagement side effect.
- Existing v1 compatibility and calibration ordering remain unchanged.

## Done criteria

- [x] Every published finding satisfies one validated contract.
- [x] V1 and v2 reports have unambiguous model identities.
- [x] V2 summaries contain complete finding metadata.
- [x] Audits do not count as injections.
- [x] `npm run check`, coverage and whitespace checks pass.

## Outcome (2026-06-27)

- `createFinding` is now the single boundary for v2 findings: every dimension
  scorer and the observation bridge emit the full contract, and the factory
  rejects an invalid `severity` or missing `category`. Exact rule+fact
  duplicates are collapsed; distinct diagnostics are preserved.
- v1 keeps its established `modelVersion` `2.0.0` (preserving v1 JSON and Python
  port compatibility); v2 now reports a distinct `2.1.0`. Report-contract
  version stays shared as `REPORT_VERSION`. The Python port was intentionally
  not modified (out of scope).
- Site summaries aggregate only validated findings.
- The model v2 audit no longer calls `recordSuccessfulFreeInjection`; only a
  real injection advances engagement state.

## STOP conditions

- A fix requires removing or renaming existing v1 JSON fields.
- Finding deduplication changes score or readiness ordering.
- The current branch has intentionally introduced another report version not
  represented in this plan.

## Maintenance notes

Package, report and model versions must remain independent. New rules enter the
report only through the finding factory and contract tests.
