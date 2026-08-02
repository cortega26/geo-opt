# Plan 087: Reuse one JavaScript test and coverage run per quality gate

> **Executor instructions**: Preserve test-count and coverage badge guarantees
> while eliminating subprocesses that rerun the entire suite. Keep `npm test` as
> a convenient standalone command.
>
> **Drift check (run first)**: `git diff --stat 888d3e7..HEAD -- package.json scripts/check-test-count.js scripts/check-coverage.js .github/workflows/ci.yml README.md README.es.md tests plans/README.md`

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/073-make-fetcher-tests-hermetic.md and plans/086-lint-javascript-tests.md
- **Category**: performance / dx
- **Planned at**: commit `888d3e7`, 2026-08-02

## Why this matters

Each CI matrix leg runs the full JavaScript suite through `npm test`, again in
the test-count script, through c8, and again inside the coverage-check script.
Local `npm run check` also runs it twice. Badge verification should consume one
run's results rather than launching more suites.

## Current state

- `package.json:44` runs `npm test` then `check-test-count.js`.
- `scripts/check-test-count.js:31-43` spawns `node --test` again.
- `scripts/check-coverage.js:30-41` spawns c8+tests itself.
- `.github/workflows/ci.yml:52-59` separately runs tests, count check, coverage,
  and coverage check; `check-coverage.js` makes the coverage command a second
  coverage run.
- `coverage/` is ignored in `.gitignore`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Unified verification | `npm run test:verify` | one suite run; badges pass |
| Full | `npm run check` | exit 0 |
| CI syntax | `node --test tests/ci-assets.test.js` | pass |
| Diff | `git diff --check` | exit 0 |

## Scope

**In scope**: package scripts, both badge scripts or one replacement,
CI workflow, focused script tests, README badge docs only if command changes,
`CHANGELOG.md`, `plans/README.md`.

**Out of scope**: changing test framework, lowering coverage/test-count claims,
removing Node 22/24 matrix coverage, or caching results across commits.

## Git workflow

- Branch: `advisor/087-single-suite-run`
- Commit example: `chore(ci): reuse one test coverage run`.

## Steps

### Step 1: Add invocation-count characterization

Make the badge-checking core accept captured output/coverage data and unit-test
its parsers. Add a test seam/counter proving the canonical quality command
launches `node --test` exactly once.

**Verify**: parser tests cover pass, drift, malformed output, and raised coverage.

### Step 2: Create one canonical test-verification command

Add the canonical `test:verify` package script. Run c8 with
`node --test tests/*.test.js` once, capture test count and coverage
summary (stdout or JSON summary), then verify both README badges from that same
run. Preserve output streaming and original nonzero test status. Do not invoke
`npx` if the local c8 binary/npm script is available.

**Verify**: `npm run test:verify` exits 0, reports 745+ tests and branch coverage at
or above the documented floor, and the invocation counter is one.

### Step 3: Wire local check and CI to the canonical command

Replace redundant JS test/count/coverage steps in `npm run check` and CI while
leaving `npm test` and `npm run test:coverage` available for direct use. Keep
Python, conformance, types, package, changelog, and security gates unchanged.

**Verify**: `npm run check`; inspect output to confirm one full JS suite run.

### Step 4: Record the tooling improvement

Add an Unreleased Build/Changed bullet.

**Verify**: CI asset tests and diff check pass.

## Test plan

- Parser unit tests for node:test count and c8 coverage.
- Child failure propagation, malformed output, badge drift, coverage increase,
  and invocation count.

## Done criteria

- [ ] `npm run check` launches the full JS suite once.
- [ ] Each CI matrix leg launches it once.
- [ ] Test-count and coverage badges remain enforced from that run.
- [ ] All other quality gates remain present and pass.

## STOP conditions

- c8 cannot preserve node:test exit code/output reliably in one subprocess.
- Consolidation removes a supported-runtime matrix leg or independent security gate.
- Invocation counting requires brittle process-table inspection rather than an
  injected spawn seam.

## Maintenance notes

Archived Plans 033/067 established the gates, not efficient data flow between
them. Future badge metrics should consume the same run artifact, not spawn a
new full suite.
