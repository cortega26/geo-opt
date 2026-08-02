# Plan 070: Make evidence freshness tests deterministic

> **Executor instructions**: Run each gate in order. Preserve the production
> default of using the real current time. Update `plans/README.md` on completion.
>
> **Drift check (run first)**: `git diff --stat 888d3e7..HEAD -- src/evidence.js index.d.ts tests/optimizer.test.js tests/consumer.test.ts plans/README.md`

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests / bug
- **Planned at**: commit `888d3e7`, 2026-08-02

## Why this matters

`npm test` currently has one date-dependent failure. The test assumes evidence
re-verified on 2026-08-01 is younger than one day, so it becomes false as wall
time advances. A deterministic clock keeps freshness behavior testable without
changing the default user-facing calculation.

## Current state

- `src/evidence.js:120-129` constructs `new Date()` inside
  `staleEvidenceWarnings(staleDays)`.
- `tests/optimizer.test.js:2186-2200` asserts exact freshness relative to the
  machine's current date.
- `index.d.ts:168` declares only the single optional `staleDays` argument.
- Public type examples live in `tests/consumer.test.ts`; use ESM, double quotes,
  and `node:test` assertions.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused test | `node --test --test-name-pattern="staleEvidenceWarnings" tests/optimizer.test.js` | pass |
| Types | `npm run typecheck` | exit 0 |
| Full check | `npm run check` | exit 0 |
| Diff | `git diff --check` | exit 0 |

## Scope

**In scope**: `src/evidence.js`, `index.d.ts`, `tests/optimizer.test.js`,
`tests/consumer.test.ts`, `CHANGELOG.md`, `plans/README.md`.

**Out of scope**: changing registry dates, freshness thresholds, or fetching
evidence sources.

## Git workflow

- Branch: `advisor/070-deterministic-evidence-clock`
- Commit example: `fix(test): inject evidence freshness clock`.

## Steps

### Step 1: Add an explicit clock seam

Add an optional second argument accepting a `Date` (recommended) or an options
object containing `now`. Default it to the real current time. Reject or clearly
normalize invalid clock values; do not silently change `staleDays` semantics.

**Verify**: `npm run typecheck` -> exit 0 after updating `index.d.ts` and the
consumer compile fixture.

### Step 2: Pin the regression test to a fixed instant

Use a fixed time immediately after 2026-08-01. Assert the two re-verified
entries are fresh and the 2026-06-27 Google entry is stale. Add a boundary case
showing `ageDays > staleDays`, not `>=`, remains the contract.

**Verify**: focused test command -> all matching tests pass regardless of the
host date.

### Step 3: Document and run the full gate

Add an Unreleased Fixed bullet for the deterministic test seam.

**Verify**: `npm run check && git diff --check` -> both exit 0.

## Test plan

- Preserve the existing registry-specific assertions.
- Add fixed-now tests for fresh, stale, and exact-boundary behavior.
- Add a consumer type assertion for the optional clock argument.

## Done criteria

- [ ] No evidence-freshness assertion depends on wall-clock date.
- [ ] Calling `staleEvidenceWarnings()` still uses real current time.
- [ ] Type declarations and consumer fixture match runtime.
- [ ] Full check passes and only scoped files changed.

## STOP conditions

- The proposed seam requires globally monkey-patching `Date` across parallel tests.
- Runtime behavior must change for callers that omit the new argument.
- Freshness dates themselves appear factually wrong; report that separately.

## Maintenance notes

Future evidence updates should change registry dates, not the fixed test clock.
Reviewers should ensure the seam is deterministic and does not expose mutable
global clock state.
