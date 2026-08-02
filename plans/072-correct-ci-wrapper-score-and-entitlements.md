# Plan 072: Report truthful aggregate scores and entitlements in CI wrappers

> **Executor instructions**: Preserve CLI exit status as the pass/fail source of
> truth. Do not invent Pro gates. Update `plans/README.md` when complete.
>
> **Drift check (run first)**: `git diff --stat 888d3e7..HEAD -- .github/actions/geo-opt-audit/action.yml ci-templates/gitlab-ci.yml tests/ci-assets.test.js README.md README.es.md docs/free-vs-pro.md plans/059-rebaseline-g1-evidence-cohort.md plans/README.md`

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/071-repair-github-composite-action.md
- **Category**: bug / docs / dx
- **Planned at**: commit `888d3e7`, 2026-08-02

## Why this matters

Both wrappers parse the first report in a JSON array, so a recursive audit's
badge can describe only one file while the CLI gates all files. The GitHub
action also says recursive/threshold use is Pro-only, contradicting the
normative Community boundary. CI outputs must describe the same audited set and
entitlements as the CLI.

## Current state

- Action lines 10, 14, and 25-27 attach false Pro claims to Community features.
- Action lines 78-89 and `ci-templates/gitlab-ci.yml:64-72` select
  `d[0].effectiveScore` for arrays.
- `README.md:374` and `docs/free-vs-pro.md:23-42` say recursive audits and CI
  thresholds are Community features; only reports, `--no-branding`, and four
  schema types are Pro-gated.
- `aggregateReport` exposes `averageScore`; `audit --summary --format json`
  yields one aggregate object.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| CI tests | `node --test tests/ci-assets.test.js` | all pass |
| Entitlements | `node --test tests/058-entitlements.test.js` | all pass |
| Full check | `npm run check` | exit 0 |
| Diff | `git diff --check` | exit 0 |

## Scope

**In scope**: both CI wrapper files, `tests/ci-assets.test.js`, README EN/ES if
output semantics need clarification, `docs/free-vs-pro.md`, `CHANGELOG.md`,
Plan 059, and `plans/README.md`.

**Out of scope**: changing scoring formulas, threshold semantics, licensing
code, or adding paid functionality.

## Git workflow

- Branch: `advisor/072-truthful-ci-wrappers`
- Commit example: `fix(ci): report aggregate audit score`.

## Steps

### Step 1: Pin desired multi-file semantics

Add a fixture with two materially different scores. Assert wrapper parsing
uses the aggregate `averageScore`, rounded only for badge display, while
`passed` remains derived from the CLI exit code. Cover single-file and partial
failure output.

**Verify**: `node --test tests/ci-assets.test.js` -> new semantic tests pass.

### Step 2: Make both wrappers request and parse summary JSON

Invoke `audit ... --summary --format json` and parse `averageScore`. Treat
missing/non-numeric aggregate scores as a wrapper error, not a fabricated zero.
Keep the original audit exit code and artifact output.

**Verify**: focused CI tests -> score equals the fixture-set average; malformed
JSON produces non-zero wrapper status.

### Step 3: Correct entitlement copy everywhere touched

Remove Pro claims from recursive audits and thresholds. Describe the optional
license input only in terms of real gates. Keep EN/ES README wording aligned.
Mark Plan 059 unblocked only when Plans 071 and 072 are DONE.

**Verify**: `node --test tests/058-entitlements.test.js tests/ci-assets.test.js` -> pass.

### Step 4: Record and run the release gates

Add an Unreleased Fixed bullet for aggregate wrapper scores and corrected
entitlement copy.

**Verify**: `npm run check && git diff --check` -> exit 0.

## Test plan

- Multi-file average, single file, malformed JSON, threshold failure, and
  partial file failure.
- Static assertions that neither wrapper claims recursive/threshold is Pro.
- Preserve badge color boundary tests at 40/41, 60/61, 75/76, and 89/90 if
  helper extraction makes them inexpensive.

## Done criteria

- [ ] A recursive badge represents the aggregate audited set, not file zero.
- [ ] Missing score data fails visibly instead of returning score 0.
- [ ] Pass/fail matches CLI exit status.
- [ ] Pro copy matches `docs/free-vs-pro.md`; all gates pass.

## STOP conditions

- The CLI summary contract lacks `averageScore` for a successful audit.
- Correct behavior would require changing the score model or licensing policy.
- GitHub and GitLab cannot share the same score semantics without a public API break.

## Maintenance notes

Reviewers should compare wrapper output against a direct CLI run on the same
fixture set. Any future report-shape change must update both wrappers and their
contract tests in one change.
