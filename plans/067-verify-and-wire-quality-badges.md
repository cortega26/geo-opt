# Plan 067: Verify the quality badges and wire their checks into CI

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 296b60f..HEAD -- README.md README.es.md scripts/ package.json .github/workflows/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (independent of plans 065 and 066)
- **Category**: dx / docs
- **Planned at**: commit `296b60f`, 2026-07-31
- **Issue**: (none)

## Why this matters

The README's two quality badges are hand-maintained claims:

- `README.md:18` — `tests-666_passed` badge (and the "666 tests across 97
  suites" claims in the Highlights line 81 and the Development section
  line 453).
- `README.md:19` — `branch_coverage-80%25` badge.

A drift guard for the test count already exists (`scripts/check-test-count.js`,
verified working 2026-07-31: it matches the live 666), but its own header
comment says it was never wired into `npm run check` or CI because the
`package.json` edit was outside the scope of Plan 058. The coverage badge
has **no** guard at all: CI never runs `c8`, so nothing verifies the 80%
branch-coverage claim — and the claim's *semantics* are a floor ("we keep
branch coverage at or above 80%"), not an exact number.

This plan wires the existing test-count check into `npm run check` and CI,
adds a sibling `scripts/check-coverage.js` that verifies the coverage badge
against a real `c8` measurement (correcting the badge if the measurement is
below the claim), and adds both as CI steps. Outcome: the two README
badges are either true or CI fails loudly.

## Current state

Files and the facts the executor needs:

- `scripts/check-test-count.js` — exists, standalone (header comment:
  "Run standalone … NOT inside `npm test` — node:test refuses to run
  recursively"). Spawns `node --test tests/*.test.js`, parses the count
  (`/ℹ tests\s+(\d+)/`), and compares with the badge
  `/tests-(\d+)_(?:passed|pasados)/` in **both** `README.md` and
  `README.es.md`, exiting non-zero on mismatch. **Not** wired into
  `package.json` scripts or `.github/workflows/ci.yml`.
- `README.md:18` — `<img src="https://img.shields.io/badge/tests-666_passed-16a34a?logo=nodedotjs&logoColor=white" alt="666 tests passed">`
- `README.md:19` — `<img src="https://img.shields.io/badge/branch_coverage-80%25-16a34a" alt="Branch coverage 80%">`
- `README.es.md` — mirror README; it carries the same two badges
  (check-test-count.js asserts the tests badge exists there).
- `package.json` scripts:
  - `"test:coverage": "c8 node --test tests/*.test.js"` (writes to
    `coverage/`, which is gitignored)
  - `"check": "npm run lint && npm run format:check && npm test && npm run test:python && npm run test:conformance && npm run typecheck && npm run typecheck:schema && npm run changelog:check && npm run validate:package"`
- `.github/workflows/ci.yml` — step order (matching names):
  Check out repository / Set up Node.js (matrix 22+24) / Install Node
  dependencies (`npm ci`) / Set up Python / Install Python dependencies /
  Lint / Format check / **JS tests** (`npm test`) / Typecheck / Typecheck
  (schema) / Python compatibility tests / Changelog policy / Validate
  package / Dogfood — audit own documentation / Security audit.
- `c8` with `--reporter=text-summary` prints a summary block, not a
  table. Verified output from this repository (2026-07-31, Node 24):

  ```
  =============================== Coverage summary ===============================
  Statements   : 57.6% ( 14454/25090 )
  Branches     : 81.33% ( 2188/2690 )
  Functions    : 50.43% ( 230/456 )
  Lines        : 57.6% ( 14454/25090 )
  ================================================================================
  ```

  Branch coverage is 81.33% — above the badge's 80 floor, so the badge
  survives Step 1 unchanged. (The low Statements/Functions numbers come
  from `coverage/` also instrumenting the built `dist/` copies of `src/`
  — double-counted build artifacts that pull the statement total down.
  That is a known measurement quirk, harmless for a floor check: it only
  makes the number more conservative. Do not "fix" it in this plan.)
- Changelog policy (`scripts/check-changelog.js`): `scripts/` and
  `package.json` are in the code-path patterns → changes to them require a
  bullet under `## [Unreleased]` in `CHANGELOG.md`. `.github/` and
  `README.md` are not.

Repo conventions to match:

- The check scripts pattern: ESM, standalone entry, `spawnSync`,
  repo-root-relative reads, clear `✖`/`✔` output, `process.exit(1)` on
  failure — see `scripts/check-test-count.js` and
  `scripts/check-changelog.js` as exemplars.
- ci.yml steps are flat `- name:` / `run:` entries; match the existing
  style (see the "JS tests" step).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Baseline coverage | `npm run test:coverage` | exit 0; coverage report written to `coverage/` |
| c8 summary only | `npx c8 --reporter=text-summary node --test tests/*.test.js` | exit 0; summary block prints a `Branches : <pct>%` line |
| Full gate | `npm run check` | exit 0 |
| Badge presence | `grep -n "branch_coverage" README.md README.es.md` | both show the badge |

## Scope

**In scope** (the only files you should modify):
- `scripts/check-coverage.js` (create)
- `package.json` (the `check` script only)
- `.github/workflows/ci.yml` (two new steps after the "JS tests" step)
- `README.md` and `README.es.md` — ONLY if Step 1 shows the branch
  coverage claim is too high (correct the badge value to the measured
  floor; nothing else)
- `CHANGELOG.md` (one bullet under `## [Unreleased]`)

**Out of scope** (do NOT touch, even though they look related):
- `scripts/check-test-count.js` — exists and works; the only change is
  *wiring* it, not editing it.
- `coverage/` — build artifact, gitignored, never committed.
- Any change to the test suite or the badge *style* (shields URLs,
  colors) — the goal is verification, not redesign.
- The `tests-666` badge's exact-match semantics: it is an exact count and
  stays exact. Do not change it to a floor.
- `plans/` files other than this plan's own status row.

## Git workflow

- Branch: `chore/067-verify-quality-badges` (repo history uses `chore:` /
  `fix:` conventional commits).
- Commit once per logical unit (check script, wiring, badge correction if
  needed), e.g. `ci: verify README quality badges against live test and
  coverage runs`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Measure the real branch coverage (baseline)

Run: `npx c8 --reporter=text-summary node --test tests/*.test.js`

Record the `Branches : <pct>%` value from the summary block (the
coverage run takes a couple of minutes — be patient). As of 2026-07-31
it measures **81.33%** (2188/2690), which is ≥ 80 — the badge survives
unchanged and the expected outcome below is "keep".

- If the measured value is **≥ 80**: keep the badge as-is.
- If the measured value is **< 80** (this would mean the baseline
  regressed since this plan was written): the badge overclaims. Correct
  the badge in BOTH `README.md` and `README.es.md` (line 19 and its
  mirror) to the measured value rounded down to the nearest whole percent
  (the badge is a floor claim), e.g. 78.4% → `branch_coverage-78%25`. Do
  not touch anything else in the READMEs. Note the correction in your
  final report.

**Verify**:
- `npm run test:coverage` exits 0
- `grep -n "branch_coverage" README.md README.es.md` → both badges equal
  the measured floor (either the original 80 or the corrected value)

### Step 2: Write `scripts/check-coverage.js`

Model it on `scripts/check-test-count.js`:

1. Spawn `npm run test:coverage` (or `npx c8 --reporter=text-summary node
   --test tests/*.test.js`) with `spawnSync`, `cwd` at repo root, encoding
   utf8, a generous timeout (300_000 ms — the suite is large).
2. Parse the branch percentage from the summary block. The block looks
   like the one in "Current state":

   ```
   Branches     : 81.33% ( 2188/2690 )
   ```

   Parse with `/Branches\s*:\s*([\d.]+)%/u` (first capture = branch %).
   If the line does not match, print the tail of the c8 output and exit 1
   (same approach as check-test-count.js lines 36–42).
3. Read the badge from both READMEs with
   `/branch_coverage-(\d+)%25/` (both files must have it — fail with a
   clear message if missing, mirroring check-test-count.js lines 22–29).
4. Compare with **floor semantics**: the check passes when
   `measured >= badge`. This is deliberate: the badge says "at least N%",
   not "exactly N%", so test additions that raise coverage must not break
   the check. (Do NOT mirror check-test-count's exact-equality comparison
   here — that would be wrong for a floor claim.)
5. Output `✔ README.md: badge (80) verified — measured branch coverage is
   82.3%` (and the es README) on success; exit non-zero with a `✖` message
   telling the operator to correct the badge to the measured floor on
   failure.

**Verify**: `node scripts/check-coverage.js` → exit 0, `✔` lines for both
READMEs, and the printed measured value matches Step 1's measurement.

### Step 3: Wire the test-count check into `npm run check`

In `package.json`, change the `check` script to run
`node scripts/check-test-count.js` right after `npm test`:

```
"check": "npm run lint && npm run format:check && npm test && node scripts/check-test-count.js && npm run test:python && npm run test:conformance && npm run typecheck && npm run typecheck:schema && npm run changelog:check && npm run validate:package"
```

(Keep the rest of the chain byte-identical. The script re-runs the suite;
that is inherent to its standalone design — the header comment explains
why it cannot run inside `npm test`.)

**Verify**: `npm run check` → exit 0 (allow a few minutes; it now runs the
suite twice plus coverage-independent gates).

### Step 4: Add both checks to CI

In `.github/workflows/ci.yml`, immediately after the "JS tests" step, add
two steps matching the existing flat style:

```yaml
      - name: Test-count badge
        run: node scripts/check-test-count.js
      - name: Coverage badge
        run: npm run test:coverage && node scripts/check-coverage.js
```

(The coverage step re-runs the suite once more under `c8`; CI already
accepts the suite running in multiple steps.)

**Verify**: `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/ci.yml'))"` → parses without error; `grep -n "Coverage badge\|Test-count badge" .github/workflows/ci.yml` → both steps present after "JS tests".

### Step 5: Changelog entry and full gate

1. Add one bullet under `## [Unreleased]` in `CHANGELOG.md`
   (`### Changed` or `### Fixed`), concise, e.g.:
   `- CI now verifies the README test-count and branch-coverage badges
   against live runs (new scripts/check-coverage.js; check-test-count.js
   wired into npm run check).`
2. Run `npm run check` → exit 0. Then run the two new checks once more
   directly: `node scripts/check-test-count.js` and
   `node scripts/check-coverage.js` → both exit 0.

**Verify**: `npm run check` exits 0; both check scripts exit 0.

## Test plan

- No new unit tests: the checks are CI-time scripts, not library code.
  The verification commands above ARE the tests (each script exits
  non-zero on drift, which is the failure mode being guarded).
- To prove the coverage check fails loudly when it should (optional
  smoke test): temporarily set the badge to `branch_coverage-99%25` in
  `README.md`, run `node scripts/check-coverage.js` (expect exit 1 with a
  `✖` message), then revert. This exercises the failure path exactly
  once.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `node scripts/check-test-count.js` exits 0
- [ ] `node scripts/check-coverage.js` exits 0
- [ ] `npm run check` exits 0 (and includes `node scripts/check-test-count.js` after `npm test` in `package.json`)
- [ ] `.github/workflows/ci.yml` has the "Test-count badge" and "Coverage badge" steps after "JS tests"
- [ ] README badges match reality: `tests-<n>` equals the live count (already enforced), `branch_coverage-<n>` ≤ measured branch % (either 80 with measured ≥ 80, or the corrected floor value)
- [ ] `CHANGELOG.md` has the new Unreleased bullet
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row for 067 updated

## STOP conditions

Stop and report back (do not improvise) if:

- The `c8` text-summary `Branches : <pct>%` line cannot be matched by
  any reasonable regex variant (the reporter format changed) — report
  the actual output instead of guessing a different parse.
- Measured branch coverage is below ~65% (a correction this large suggests
  a measurement problem, not a badge problem — e.g. c8 picking up
  uninstrumented or wrong files).
- `check-test-count.js` has meanwhile been wired into `check`/CI by
  someone else (the wiring step would duplicate).
- The `check` script in `package.json` differs materially from the
  excerpt above (reconcile by inserting the new segment at the equivalent
  position).
- A step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

- The coverage check uses floor semantics on purpose: adding tests should
  never break the badge check. Only *lowering* coverage below the badge
  value fails.
- When the test count grows, `scripts/check-test-count.js`'s error message
  tells you exactly which three README spots to update (badge, Highlights
  line, Development section) — this is the same note already in that
  script; nothing changes here.
- If the project ever switches coverage tooling away from `c8`, the
  parser in `scripts/check-coverage.js` (step 2) is the only place that
  needs to change.
- Plan 065 adds a contract test for CI entry assets; 066 documents the
  skill. None of them interact with these checks except that all three
  plans add CI steps — if 065/066 are executed in the same window, each
  executor must re-verify the final `ci.yml` state (their drift checks
  cover this).
