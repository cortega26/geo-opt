# Plan 069: Match accepted audit advisories by stable identity

> **Executor instructions**: Follow every step and verification gate. Stop on any
> condition below; do not broaden the vulnerability exception. Update this plan's
> row in `plans/README.md` when complete unless a reviewer owns the index.
>
> **Drift check (run first)**: `git diff --stat 888d3e7..HEAD -- scripts/check-audit.js package-lock.json plans/README.md`

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security / dx
- **Planned at**: commit `888d3e7`, 2026-08-02
- **Executed at**: commits `444f3bf` + `8ffd095` (2026-08-02) on branch
  `advisor/069-stable-audit-identity`, approved by reviewer, squash-merged to
  main as `db423ac` (2026-08-02). Deviations recorded:
  README.md/README.es.md test-count badges updated 745→755→758 (required by
  `scripts/check-test-count.js`, part of done criterion `npm run check`); the
  only `npm run check` failure is the pre-existing time-dependent
  `staleEvidenceWarnings` test (Plan 070's subject), verified present at the base commit.
  Reviewer revision round (F1–F3): stale warning now fires only when the GHSA is
  absent from the report entirely (was a false positive for sub-blocking
  severity and wrong-package matches); dead `entryName` field dropped from
  blocking/suppressed records; cross-entry fail-closed test added (13 hermetic
  cases total).

## Why this matters

The security gate is red even though the accepted dev-only advisory did not
change. npm changed the advisory's numeric `source` from `1124334` to `1130591`
and its range spelling from `<=5.0.7` to `>=4.0.0 <5.0.8`. The exception must
survive registry metadata churn without suppressing a different package,
advisory, installed version, or dependency path.

## Current state

- `scripts/check-audit.js:37-53` keys the exception by numeric source and a raw
  range string.
- `scripts/check-audit.js:91-109` requires both values to match exactly.
- The current report identifies the same stable URL
  `GHSA-mh99-v99m-4gvg`, installed only at
  `node_modules/npm/node_modules/brace-expansion`; `package-lock.json` records
  that bundled copy as 5.0.7.
- Match the existing ESM, double-quote, `node:assert` conventions in
  `scripts/check-audit.js` and `tests/ci-assets.test.js`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused gate | `npm run audit:check` | exit 0; accepted GHSA is printed |
| Tests | `npm test` | all tests pass |
| Full check | `npm run check` | exit 0 |
| Diff hygiene | `git diff --check` | exit 0 |

## Scope

**In scope**: `scripts/check-audit.js`, a new focused test under `tests/`,
`CHANGELOG.md`, `plans/README.md`.

**Out of scope**: changing dependency versions, weakening the high/critical
threshold, omitting dev dependencies, or accepting any additional advisory.

## Git workflow

- Branch: `advisor/069-stable-audit-identity`
- Use conventional commits such as `fix(audit): match exceptions by GHSA identity`.
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Characterize registry churn without live-network tests

Extract a pure matcher (or make the script accept a report fixture) and add
fixtures for: the old numeric source/range, the current source/range, a wrong
GHSA URL, a wrong package, version 5.0.8, and a second dependency path.

**Verify**: `node --test tests/check-audit.test.js` -> all new cases pass after
the implementation and fail against the old source-id matcher.

### Step 2: Key the exception by GHSA plus reviewed installed surface

Store the stable GHSA id/URL and package name. Verify from `package-lock.json`
that every reported vulnerable node is the reviewed bundled npm path and its
installed version is exactly 5.0.7 (or satisfies an equally narrow reviewed
constraint). Keep recheck-date warnings. Numeric source and advisory range may
be diagnostic fields but must not be identity keys.

**Verify**: `npm run audit:check` -> exit 0 and exactly one accepted high
advisory; the stale-entry warning is absent.

### Step 3: Record the gate repair

Add an Unreleased `Fixed` or `Security` changelog bullet explaining that GHSA
identity is stable while installed version/path checks remain strict.

**Verify**: `npm run changelog:check && npm run check` -> exit 0.

## Test plan

- Model the new test on the small script-contract tests in
  `tests/ci-assets.test.js`.
- Cover both historical/current npm spellings and fail closed for wrong
  identity, package, installed version, and node path.
- Do not make the test call the advisory registry.

## Done criteria

- [ ] `npm run audit:check` exits 0 for GHSA-mh99-v99m-4gvg at the reviewed bundled 5.0.7 path.
- [ ] A different GHSA, package, version, or path remains blocking.
- [ ] `npm run check` and `git diff --check` exit 0.
- [ ] No files outside Scope changed; index status is updated.

## STOP conditions

- The installed vulnerable copy is no longer exactly the reviewed dev-only npm bundle.
- A production dependency or release path beyond `semantic-release -> npm` is affected.
- Passing the gate would require accepting a new advisory or a broader version set.

## Maintenance notes

Reviewers should confirm the test proves fail-closed behavior. Future registry
source/range spelling changes should not require code changes; installed
version/path or GHSA changes must trigger a fresh security decision.
