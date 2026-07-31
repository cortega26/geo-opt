# Plan 001: Add test coverage measurement with c8

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 4dff240..HEAD -- package.json tests/ .github/workflows/`
> If any of these files changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx (testing infrastructure)
- **Planned at**: commit `4dff240`, 2026-06-26

## Why this matters

The test suite (`tests/optimizer.test.js`, 24KB) covers the main public API
functions, but there is no visibility into which branches, lines, or files
are actually exercised. Before refactoring HTML parsing (plan 002),
Markdown parsing (plan 003), or the CLI (plan 004), a coverage baseline is
essential to confirm those refactors don't silently drop functionality. c8
adds ~300KB as a devDependency, integrates natively with `node:test`, and
produces human-readable terminal + HTML reports.

## Current state

- `package.json` scripts — `"test": "node --test tests/*.test.js"` with no
  coverage flags. No coverage tool listed in devDependencies.
  (`package.json:22`)
- CI workflow (`.github/workflows/changelog-policy.yml`) only enforces the
  changelog policy; it does not run tests or lint at all. Coverage will be
  a `package.json` script addition only — CI changes are out of scope.
- Tests use `node:test` (`tests/optimizer.test.js:1`)—c8 supports this
  natively since Node 20.
- Repo conventions: ESM, camelCase, double quotes, semicolons. npm scripts
  follow the pattern `npm run <name>` with no npx shims. See
  `AGENTS.md:107-108`.
- `npm run check` chains lint → format:check → test → test:python →
  changelog:check (`package.json:28`). Adding coverage there would slow the
  check loop, so coverage gets its own script invoked on demand.

## Commands you will need

| Purpose           | Command                          | Expected on success         |
|-------------------|----------------------------------|-----------------------------|
| Install           | `npm install`                    | exit 0                      |
| Current tests     | `npm test`                       | exit 0, all tests pass      |
| Lint              | `npm run lint`                   | exit 0                      |
| Full check        | `npm run check`                  | exit 0                      |
| Coverage (after)  | `npm run test:coverage`          | exit 0, prints coverage %   |
| Changelog check   | `npm run changelog:check`        | exit 0                      |

## Scope

**In scope** (the only files you should modify):
- `package.json` — add `c8` devDependency and `test:coverage` script
- `CHANGELOG.md` — add `Unreleased` entry per changelog policy

**Out of scope** (do NOT touch, even though they look related):
- `.github/workflows/` — CI changes are out of scope. Do not add coverage
  enforcement to CI.
- `tests/*.test.js` — do not add or modify tests in this plan.
- `.c8rc.json` — the defaults work; no config file needed unless coverage
  thresholds are enforced, which is out of scope.
- `scripts/check-changelog.js` — the changelog enforcement mechanism itself.

## Git workflow

- Branch: `advisor/001-test-coverage`
- Commit style: conventional commits with scope prefix. Example from
  `git log`: `build: untrack files matched by latest gitignore rules`
- Commit message: `build: add c8 coverage measurement`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Install c8 as devDependency

From the repo root, add c8:

```bash
npm install --save-dev c8
```

**Verify**: `node -e "require('c8')"` → prints nothing (module loads
without error). `grep '"c8"' package.json` returns a line in
devDependencies.

### Step 2: Add test:coverage script

Edit `package.json` — in the `"scripts"` block, add after the `"test"`
line:

```json
"test:coverage": "c8 node --test tests/*.test.js",
```

The `c8` binary wraps `node --test` and outputs a text summary to stdout.
No reporter flag is needed — the default text reporter prints a table with
file-level coverage percentages.

**Verify**: `npm run test:coverage` → exit 0, prints a coverage summary
table with columns for each `src/` file and % lines covered. Confirm
`src/index.js` (the re-export barrel) shows 100% (all re-exports are
exercised by the test imports).

### Step 3: Update changelog

Add one bullet under the `## [Unreleased]` section of `CHANGELOG.md` in the
`Added` subsection (create the subsection if it doesn't exist):

```markdown
### Added
- Test coverage measurement via `npm run test:coverage` (c8).
```

**Verify**: `npm run changelog:check` → exit 0.

## Test plan

No new test code in this plan. The verification is:

```bash
npm run test:coverage
```

Expected: exit 0. Coverage report shows ≥70% line coverage across `src/`
files. The exact percentage may vary — any number is fine as long as the
command succeeds.

## Done criteria

- [ ] `npm install` exits 0
- [ ] `npm run test:coverage` exits 0 and prints a coverage table
- [ ] `npm run check` exits 0 (coverage script excluded from check chain)
- [ ] `grep "test:coverage" package.json` returns exactly the new script line
- [ ] `npm run changelog:check` exits 0
- [ ] Only `package.json` and `CHANGELOG.md` are modified (`git status`)
- [ ] `plans/README.md` status row updated to DONE

## STOP conditions

Stop and report back (do not improvise) if:

- `npm install --save-dev c8` fails or `c8` does not load after install.
- `npm run test:coverage` exits non-zero or prints errors instead of a
  coverage table.
- `package.json` does not contain the exact `"test:coverage"` line shown
  in step 2 after editing.
- The code at the locations referenced in "Current state" does not match
  the excerpts (the codebase has drifted).
- Any file outside `package.json` or `CHANGELOG.md` is modified.

## Maintenance notes

- c8 should be kept at the latest major version (currently v10+). It is a
  thin wrapper around Node's built-in V8 coverage and has no transitive
  dependencies that require auditing.
- If the project adds a build step (TypeScript, bundling), coverage must
  measure the compiled output, not the source. At that point, switch from
  `c8 node` to `c8` with a `--src` flag pointing at the build directory.
- Coverage thresholds as enforcement gates (e.g., `--lines 80`) are
  intentionally deferred — they require a separate plan once the team
  agrees on acceptable floors.
- The Python parity tests (`test:python`) are not covered by c8 — they run
  Python's own `unittest` runner. A future plan could add `coverage.py`
  for parity, but that is out of scope here.
