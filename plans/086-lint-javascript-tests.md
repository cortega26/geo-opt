# Plan 086: Put JavaScript tests inside the lint gate

> **Executor instructions**: Extend lint coverage and fix only real violations in
> tests. Do not weaken production lint rules globally to make tests pass.
>
> **Drift check (run first)**: `git diff --stat 888d3e7..HEAD -- package.json eslint.config.js tests/058-onboarding-route.test.js tests/audit-2026-07-31.e2e.test.js tests/fetcher.test.js tests/sitemap.test.js plans/README.md`

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/069-match-audit-advisories-by-stable-identity.md and plans/070-make-evidence-freshness-tests-deterministic.md
- **Category**: dx / tests
- **Planned at**: commit `888d3e7`, 2026-08-02

## Why this matters

Prettier checks `tests/`, but ESLint checks only `src/`, `bin/`, and `scripts/`.
Dead variables, undefined globals, and accidental style drift can land in the
largest JavaScript surface without a gate. Tests should use the same baseline
with narrowly scoped test globals where necessary.

## Current state

- `package.json:35` defines `eslint src/ bin/ scripts/`.
- `package.json:36-37` already includes `tests/` in formatting.
- `eslint.config.js:3-35` has one global ESM config and no test override.
- Archived Plan 049 claimed test linting was done, but the current script proves
  the gate regressed; this plan restores the executable contract.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Baseline inventory | `npx eslint tests/` | violations listed; no files changed |
| Lint | `npm run lint` | exit 0 and includes tests |
| Full | `npm run check` | exit 0 |
| Diff | `git diff --check` | exit 0 |

## Scope

**In scope**: `package.json`, `eslint.config.js` only for a narrow test override,
`tests/058-onboarding-route.test.js`, `tests/audit-2026-07-31.e2e.test.js`,
`tests/fetcher.test.js`, `tests/sitemap.test.js`, `CHANGELOG.md`, and
`plans/README.md`. At commit `888d3e7`, `npx eslint tests/` reports exactly 15
errors across those four files (unused imports/variables/arguments plus missing
`setImmediate` global).

**Out of scope**: changing runtime code, disabling `no-undef`/`no-unused-vars`
globally, replacing ESLint, or formatting unrelated files.

## Git workflow

- Branch: `advisor/086-lint-tests`
- Commit example: `chore(lint): include JavaScript tests`.

## Steps

### Step 1: Capture the lint delta

Run `npx eslint tests/` and classify the 15 known errors. Add only the required
`setImmediate` test/global declaration; prefer fixing dead imports/variables
and real undefined names in the four named files.

**Verify**: the baseline reports 15 errors in exactly the four scoped files; no
source files changed.

### Step 2: Extend the canonical script and repair violations

Change lint to `eslint src/ bin/ scripts/ tests/`. Apply minimal mechanical test
fixes. Keep double quotes/semicolons and underscore ignore conventions.

**Verify**: `npm run lint` exits 0 and command output/config proves tests were
visited (or add a contract test for the script string).

### Step 3: Record and run gates

Add an Unreleased Build/Changed bullet for restored test lint coverage.

**Verify**: `npm run check && git diff --check` -> exit 0.

## Test plan

- Add a small package-script contract assertion only if silent future removal
  would otherwise be easy.
- Existing tests must remain behaviorally unchanged.

## Done criteria

- [ ] `npm run lint` includes every `tests/*.js` file and exits 0.
- [ ] No global production lint rule is weakened.
- [ ] Full check passes; only enumerated violations were edited.
- [ ] Index status updated.

## STOP conditions

- Lint reports generated or fixture JavaScript that should not be treated as
  executable tests; add a narrow ignore and document it.
- Passing requires a broad rule disable.
- Test edits would change assertions/behavior rather than hygiene.

## Maintenance notes

Keep `package.json` lint and format scopes aligned. New JavaScript test
directories must be added to both gates.
