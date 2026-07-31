# Plan 067: Verify the quality badges and wire their checks into CI

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 9fe5d20..HEAD -- README.md README.es.md scripts/ tests/058-historical-assets.test.js package.json .github/workflows/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (independent of plans 065 and 066)
- **Category**: dx / docs
- **Planned at**: commit `9fe5d20`, 2026-07-31
- **Revised**: 2026-07-31 (review round 1). Execution revealed the plan's
  premise ("check-test-count.js matches the live 666") was true only at
  `296b60f` in the maintainer's tree. Two staleness causes: (1) plan 065
  added `tests/ci-assets.test.js` (+6 tests) after the badge was set, so
  even the maintainer-tree count is 672 ≠ 666; (2) the count is
  **environment-dependent**: `tests/058-historical-assets.test.js`
  registers 3 tests per `.md` file in the git-ignored, maintainer-local
  `plans/business/launch-content/` (absent in CI and fresh clones) — 672
  with it present vs 661 without (Δ 11 = 3×4 − 1). No badge value can
  satisfy an exact-count check across both environments. Revision: make
  the 058 test's registration count-deterministic (Step 0), then correct
  the badge to the now-environment-independent count **664** (Step 1).
- **Revised again**: 2026-07-31 (review round 2). The suite count
  guard in Step 1 was mis-calibrated on the stale "97 suites" claim:
  the live, deterministic `node:test` suite count is **112** (measured
  on Node 22 and Node 24, and in both the maintainer tree and a fresh
  worktree). Accepted; Step 1 writes "112 suites" directly.
- **Issue**: (none)

## Why this matters

The README's two quality badges are hand-maintained claims:

- `README.md:18` — `tests-666_passed` badge (and the "666 tests across 97
  suites" claims in the Highlights line 81 and the Development section
  line 510).
- `README.md:19` — `branch_coverage-80%25` badge.

A drift guard for the test count already exists (`scripts/check-test-count.js`,
but its own header comment says it was never wired into `npm run check` or CI
because the `package.json` edit was outside the scope of Plan 058. The coverage
badge has **no** guard at all: CI never runs `c8`, so nothing verifies the 80%
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
  `README.es.md`, exiting non-zero on mismatch. Its error message names
  the three spots per README to update: badge URL, highlights line, dev
  section. **Not** wired into `package.json` scripts or
  `.github/workflows/ci.yml`.
- `README.md:18` — `<img src="https://img.shields.io/badge/tests-666_passed-16a34a?logo=nodedotjs&logoColor=white" alt="666 tests passed">`
- `README.md:19` — `<img src="https://img.shields.io/badge/branch_coverage-80%25-16a34a" alt="Branch coverage 80%">`
- `README.es.md` — localized mirror of README; it carries the same two
  badges under Spanish labels: `tests-666_pasados` (line 18) and
  `cobertura_de_ramas-80%25` (line 19). `check-test-count.js` already
  handles the localized tests badge (`passed|pasados`); the new
  `check-coverage.js` must likewise accept both badge tokens.
- **The test count is environment-dependent** (measured 2026-07-31, Node
  v24.15.0, commit `9fe5d20`): **672** in the maintainer tree (with
  maintainer-local files present), **661** in a fresh checkout / CI. The
  difference is exactly 11, from `tests/058-historical-assets.test.js`:
  it registers **3 tests per `.md` file** under
  `plans/business/launch-content/` (4 files, git-ignored, maintainer-local
  — see the test's own header NOTE) when the directory exists, and 1
  placeholder test when it does not (CI, fresh clones). The non-058 base
  is 659 in both environments (672 − 13 = 661 − 2). The 666 badge was
  correct at `296b60f` in the maintainer tree only; plan 065 then added
  `tests/ci-assets.test.js` (6 `it()` blocks).
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
  table. Measured in a fresh worktree 2026-07-31 (Node 24, commit
  `9fe5d20`):

  ```
  =============================== Coverage summary ===============================
  Statements   : 57.6% ( 14454/25090 )
  Branches     : 80.88% ( 2179/2694 )
  Functions    : 50.43% ( 230/456 )
  Lines        : 57.6% ( 14454/25090 )
  ```

  Branch coverage is 80.88% — above the badge's 80 floor, so the badge
  survives unchanged. (The low Statements/Functions numbers come from
  `coverage/` also instrumenting the built `dist/` copies of `src/` —
  double-counted build artifacts that pull the statement total down.
  That is a known measurement quirk, harmless for a floor check: it only
  makes the number more conservative. Do not "fix" it in this plan.)
- Changelog policy (`scripts/check-changelog.js`): `scripts/`, `tests/`
  and `package.json` are in the code-path patterns → changes to them
  require a bullet under `## [Unreleased]` in `CHANGELOG.md`. `.github/`
  and `README.md` are not.

Repo conventions to match:

- The check scripts pattern: ESM, standalone entry, `spawnSync`,
  repo-root-relative reads, clear `✖`/`✔` output, `process.exit(1)` on
  failure — see `scripts/check-test-count.js` and
  `scripts/check-changelog.js` as exemplars.
- ci.yml steps are flat `- name:` / `run:` entries; match the existing
  style (see the "JS tests" step).
- `tests/058-historical-assets.test.js` uses `describe`/`it` from
  `node:test`, `assert` from `node:assert`, and per-file loop tests with
  descriptive `it()` titles — match its existing style.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| 058 test file alone | `node --test tests/058-historical-assets.test.js` | exit 0; `ℹ tests 4` |
| Live test count | `node scripts/check-test-count.js` | after Step 1: exit 0 |
| Baseline coverage | `npm run test:coverage` | exit 0; coverage report written to `coverage/` |
| c8 summary only | `npx c8 --reporter=text-summary node --test tests/*.test.js` | exit 0; summary block prints a `Branches : <pct>%` line |
| Full gate | `npm run check` | exit 0 |
| Badge presence | `grep -nE "branch_coverage|cobertura_de_ramas" README.md README.es.md` | both show their badge |
| No stale count | `grep -rn "666" README.md README.es.md` | no matches |

## Scope

**In scope** (the only files you should modify):
- `tests/058-historical-assets.test.js` (Step 0: count-deterministic
  registration only — assertions unchanged)
- `README.md` and `README.es.md` (Step 1: correct the `tests-666` claims
  to the live count in badge, highlights and dev-section lines, and the
  "97 suites" claim if it drifted; Step 2: coverage badge only if the
  measured floor is below 80 — nothing else)
- `scripts/check-coverage.js` (create)
- `package.json` (the `check` script only)
- `.github/workflows/ci.yml` (two new steps after the "JS tests" step)
- `CHANGELOG.md` (one bullet under `## [Unreleased]`)

**Out of scope** (do NOT touch, even though they look related):
- `scripts/check-test-count.js` — exists and works; the only change is
  *wiring* it, not editing it.
- `coverage/` — build artifact, gitignored, never committed.
- Any other change to the test suite, or the badge *style* (shields URLs,
  colors) — the goal is verification, not redesign.
- The `tests-<n>` badge's exact-match semantics: it is an exact count and
  stays exact. Do not change it to a floor.
- `plans/` files other than this plan's own status row.

## Git workflow

- Branch: `chore/067-verify-quality-badges` (repo history uses `chore:` /
  `fix:` conventional commits).
- Commit once per logical unit, in this order:
  1. `fix: make 058 test registration count-deterministic; correct README test badges to live count` (Step 0 + Step 1)
  2. `ci: add coverage badge check script` (Step 3)
  3. `ci: verify README quality badges against live test and coverage runs` (Steps 4–6)
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 0: Make the test count environment-independent

`tests/058-historical-assets.test.js` currently registers 3 `it()` blocks
per `.md` file when `plans/business/launch-content/` exists and 1 when it
does not. Replace the FIRST `describe(...)` block (from
`describe("Plan 058 §6.4 — stale campaign assets are quarantined", () => {`
through its closing `});` before the second `describe`) with a version that
registers a FIXED number of tests (1 presence test + 3 content tests) and
loops over the files *inside* the test bodies. All assertions are
unchanged; only the registration shape differs.

The replacement block (keep the file's existing `read()` helper and the
header comment; optionally extend the header NOTE with: "The test count
here is intentionally fixed (4 tests) so the README test-count badge check
stays deterministic in CI and local runs."):

```js
describe("Plan 058 §6.4 — stale campaign assets are quarantined", () => {
  const present = existsSync(launchDir);
  const files = present ? readdirSync(launchDir).filter((f) => f.endsWith(".md")) : [];

  it("launch-content directory is maintainer-local (skipped in CI)", () => {
    assert.ok(true);
  });

  it("each launch-content file starts with a HISTORICAL / NOT APPROVED banner", () => {
    if (!present) return;
    assert.ok(files.length >= 4, `expected ≥4 launch-content files, found ${files.length}`);
    for (const f of files) {
      const head = read(f).split("\n").slice(0, 15).join("\n");
      assert.match(
        head,
        /HISTORICAL|NOT APPROVED|not approved for publication|HISTÓRIC[OA]/iu,
        `${f} must declare itself historical/not-approved near the top`
      );
    }
  });

  it("launch-content files do not reference the stale cortega26/GEO-skill.git URL", () => {
    if (!present) return;
    for (const f of files) {
      assert.doesNotMatch(
        read(f),
        /cortega26\/GEO-skill\.git/u,
        `${f} still references the stale repo URL cortega26/GEO-skill.git`
      );
    }
  });

  it("launch-content files do not carry an actionable live publish date", () => {
    if (!present) return;
    for (const f of files) {
      assert.doesNotMatch(
        read(f),
        /\*\*(Publish|Publicar):\*\*\s*2026-0[67]-\d{2}/u,
        `${f} still schedules a live publication in **Publish:**/**Publicar:** format`
      );
    }
  });
});
```

Do NOT touch the second `describe` (funnel-and-metrics) — it already
registers exactly one test in both environments.

**Verify**:
- `node --test tests/058-historical-assets.test.js` → exit 0, summary shows
  `ℹ tests 5` (the fixed block's 4 + the untouched funnel describe's 1)
- `node scripts/check-test-count.js` → exit 1 (STILL expected at this
  point) reporting "actual test count is **664**"

### Step 1: Correct the test-count claims in both READMEs

The live count is now **664** in every environment (659 non-058 base + 5
from the 058 file). Correct the claims:

1. Badge URLs: `tests-666_passed` → `tests-664_passed` (`README.md:18`),
   `tests-666_pasados` → `tests-664_pasados` (`README.es.md:18`).
2. Highlights line: `README.md:81` "666 tests across 97 suites" →
   "664 tests across 112 suites". Same for the mirror line
   `README.es.md:79` → "664 tests en 112 suites".
3. Dev section: `README.md:510` (`npm test # 666 tests · 97 suites · 0
   failures (Node.js)`) → `# 664 tests · 112 suites · 0 failures
   (Node.js)`, and the mirror `README.es.md:499` → `# 664 tests · 112
   suites · 0 fallos (Node.js)`.
4. Only these claims — nothing else in the READMEs. The suite count is
   deterministic: **112** (measured 2026-07-31 on Node 22 and Node 24,
   in both the maintainer tree and a fresh worktree). If your measured
   `ℹ suites` differs from 112, STOP and report — do not write any other
   value.

**Verify**:
- `grep -rn "666" README.md README.es.md` → no matches
- `node scripts/check-test-count.js` → exit 0

### Step 2: Measure the real branch coverage (baseline)

Run: `npx c8 --reporter=text-summary node --test tests/*.test.js`

Record the `Branches : <pct>%` value from the summary block. As of
2026-07-31 it measures **80.88%** (2179/2694) in a fresh tree — ≥ 80, so
the badge survives unchanged and the expected outcome below is "keep".
(The 058 test executes no `src/` code, so the Step 0 edit cannot change
this measurement.)

- If the measured value is **≥ 80**: keep the badge as-is.
- If the measured value is **< 80**: the badge overclaims. Correct the
  badge in BOTH `README.md` and `README.es.md` (line 19 and its mirror —
  `cobertura_de_ramas-<n>%25` in es) to the measured value rounded down
  to the nearest whole percent (the badge is a floor claim). Do not touch
  anything else in the READMEs. Note the correction in your final report.

**Verify**:
- `npm run test:coverage` exits 0
- `grep -nE "branch_coverage|cobertura_de_ramas" README.md README.es.md`
  → both badges equal the measured floor (either the original 80 or the
  corrected value)

### Step 3: Write `scripts/check-coverage.js`

Model it on `scripts/check-test-count.js`:

1. Spawn `npm run test:coverage` (or `npx c8 --reporter=text-summary node
   --test tests/*.test.js`) with `spawnSync`, `cwd` at repo root, encoding
   utf8, a generous timeout (300_000 ms — the suite is large). NOTE: the
   `--reporter=text-summary` form is required — `npm run test:coverage`'s
   default `text` reporter prints a table, not the summary block the
   parser targets. If you spawn the `npm run` form, stdout will not parse.
2. Parse the branch percentage from the summary block:

   ```
   Branches     : 80.88% ( 2179/2694 )
   ```

   Parse with `/Branches\s*:\s*([\d.]+)%/u` (first capture = branch %).
   If the line does not match, print the tail of the c8 output and exit 1
   (same approach as check-test-count.js lines 36–42).
3. Read the badge from each README with its own token:
   `/branch_coverage-(\d+)%25/` for `README.md` and
   `/cobertura_de_ramas-(\d+)%25/` for `README.es.md` (both files must
   have their badge — fail with a clear message if missing, mirroring
   check-test-count.js lines 22–29 and its `passed|pasados` handling).
4. Compare with **floor semantics**: the check passes when
   `measured >= badge`. This is deliberate: the badge says "at least N%",
   not "exactly N%", so test additions that raise coverage must not break
   the check. (Do NOT mirror check-test-count's exact-equality comparison
   here — that would be wrong for a floor claim.)
5. Output `✔ README.md: badge (80) verified — measured branch coverage is
   80.9%` (and the es README) on success; exit non-zero with a `✖` message
   telling the operator to correct the badge to the measured floor on
   failure.

**Verify**: `node scripts/check-coverage.js` → exit 0, `✔` lines for both
READMEs, and the printed measured value matches Step 2's measurement.

### Step 4: Wire the test-count check into `npm run check`

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

### Step 5: Add both checks to CI

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

### Step 6: Changelog entry and full gate

1. Add one bullet under `## [Unreleased]` in `CHANGELOG.md`
   (`### Changed` or `### Fixed`), concise, covering all code-path
   changes (scripts/, tests/, package.json are all in the changelog
   policy patterns), e.g.:
   `- CI now verifies the README test-count and branch-coverage badges
   against live runs (new scripts/check-coverage.js; check-test-count.js
   wired into npm run check; 058 test registration count-deterministic;
   README test badges corrected to the live count).`
2. Run `npm run check` → exit 0. Then run the two new checks once more
   directly: `node scripts/check-test-count.js` and
   `node scripts/check-coverage.js` → both exit 0.

**Verify**: `npm run check` exits 0; both check scripts exit 0.

## Test plan

- No new unit tests: the checks are CI-time scripts, not library code.
  The verification commands above ARE the tests (each script exits
  non-zero on drift, which is the failure mode being guarded).
- The Step 0 rewrite is the behavior-preserving change; its assertions
  are identical to the pre-rewrite ones (same regexes, same per-file
  messages, `files.length >= 4` moved from a module-level assert into a
  test body).
- To prove the coverage check fails loudly when it should (optional
  smoke test): temporarily set the badge to `branch_coverage-99%25` in
  `README.md`, run `node scripts/check-coverage.js` (expect exit 1 with a
  `✖` message), then revert. This exercises the failure path exactly
  once.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `node --test tests/058-historical-assets.test.js` → `ℹ tests 4`, exit 0
- [ ] `node scripts/check-test-count.js` exits 0 (live count 664 matches the corrected badge)
- [ ] `node scripts/check-coverage.js` exits 0
- [ ] `npm run check` exits 0 (and includes `node scripts/check-test-count.js` after `npm test` in `package.json`)
- [ ] `.github/workflows/ci.yml` has the "Test-count badge" and "Coverage badge" steps after "JS tests"
- [ ] README badges match reality: `tests-664` (badge + highlights + dev section, both READMEs, no "666" remains); `branch_coverage-<n>` (README.md) and `cobertura_de_ramas-<n>` (README.es.md) ≤ measured branch % (either 80 with measured ≥ 80, or the corrected floor value in both files)
- [ ] `CHANGELOG.md` has the new Unreleased bullet
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row for 067 updated

## STOP conditions

Stop and report back (do not improvise) if:

- After Step 0, `node scripts/check-test-count.js` reports a count other
  than **664** (the arithmetic above is wrong somewhere — report the
  actual count instead of adjusting the badge to anything else).
- The `c8` text-summary `Branches : <pct>%` line cannot be matched by
  any reasonable regex variant (the reporter format changed) — report
  the actual output instead of guessing a different parse.
- Measured branch coverage is below ~65% (a correction this large suggests
  a measurement problem, not a badge problem — e.g. c8 picking up
  uninstrumented or wrong files).
- The measured `ℹ suites` count differs from **112** (verified 2026-07-31
  on Node 22 and Node 24; do not write any other value).
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
- The test-count check is exact and now environment-independent BY
  DESIGN: `tests/058-historical-assets.test.js` registers a fixed number
  of tests, so maintainer-local files under
  `plans/business/launch-content/` never change the count. Future tests
  must keep per-file dynamic registration out of maintainer-local
  directories — adding `.md` files there no longer affects the count,
  but adding *new tests* still requires a badge update (the check names
  the spots).
- When the test count grows, `scripts/check-test-count.js`'s error message
  tells you exactly which three README spots to update (badge, Highlights
  line, Development section) — this is the same note already in that
  script; nothing changes here.
- If the project ever switches coverage tooling away from `c8`, the
  parser in `scripts/check-coverage.js` (step 3) is the only place that
  needs to change.
- Plan 065 adds a contract test for CI entry assets; 066 documents the
  skill. None of them interact with these checks except that all three
  plans add CI steps — if 065/066 are executed in the same window, each
  executor must re-verify the final `ci.yml` state (their drift checks
  cover this).
