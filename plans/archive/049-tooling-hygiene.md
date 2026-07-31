# Plan 049: Tooling hygiene — lint tests/, expand pre-commit hook, remove dead test vars

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If a
> "STOP conditions" item occurs, stop and report. When done, update the status
> row in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat b09a5f8..HEAD -- eslint.config.js hooks/pre-commit tests CHANGELOG.md`
> If any of those files changed since this plan was written, compare the
> "Current state" excerpts against the live code first.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW (pure tooling; no runtime behavior changes)
- **Depends on**: none
- **Category**: dx / tooling
- **Planned at**: commit `b09a5f8`, 2026-06-28

## Why this matters

Three independent tooling gaps let real errors hide in the test suite and in
the developer workflow:

1. **`tests/` is not covered by eslint (F15).** Running `npx eslint tests/`
   against the current config surfaces 32 errors: ~20 `quotes` violations
   (template literals flagged as needing double quotes — a false positive caused
   by `allowTemplateLiterals` being absent from the config), plus ~10 real
   dead-variable errors in test and fixture files. At least two are dead imports
   that accumulated without anyone noticing: `EVIDENCE_REGISTRY` in
   `tests/optimizer.test.js:24`, `mock` in `tests/optimizer.test.js:1`,
   `normalizeReport` in `tests/conformance.test.js:53`, and `fileURLToPath` in
   `tests/cli-smoke.test.js:15`. One test has a `no-undef` error for
   `structuredClone` (available in Node 17+ but absent from the eslint globals
   list). These errors are invisible because `npm run lint` only covers `src/`
   and `bin/`.

2. **The pre-commit hook doesn't lint or format-check (F16).** `hooks/pre-commit`
   runs only `node scripts/check-changelog.js` — if a developer commits with
   lint errors or formatting violations, CI is the only gate. Adding lint +
   format:check to the hook catches these locally before they go to CI and
   before they land in a code review.

3. **Dead variables in test files (F17).** Several test files declare variables
   that are never read. These were real imports at some point and now mask
   potential typos or missing assertions behind the linter's blind spot.

## Current state

**`eslint.config.js`** (full file):
```js
import js from "@eslint/js";

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        process: "readonly",
        console: "readonly",
        Buffer: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        fetch: "readonly",
        Headers: "readonly",
        Request: "readonly",
        Response: "readonly",
      }
    },
    rules: {
      "no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
      "no-console": "off",
      "semi": ["error", "always"],
      "quotes": ["error", "double", { "avoidEscape": true }],
      "no-undef": "error",
      "no-useless-escape": "off",
      "no-useless-assignment": "off"
    }
  }
];
```

**`hooks/pre-commit`** (full file):
```bash
#!/usr/bin/env bash
set -euo pipefail
node scripts/check-changelog.js
```

**Dead variables to remove** (verified by running `npx eslint tests/` at
commit `b09a5f8`):

| File | Line | Symbol | Error |
|---|---|---|---|
| `tests/optimizer.test.js` | 1 | `mock` (import) | `no-unused-vars` |
| `tests/optimizer.test.js` | 24 | `EVIDENCE_REGISTRY` (import) | `no-unused-vars` |
| `tests/conformance.test.js` | 53 | `normalizeReport` (import) | `no-unused-vars` |
| `tests/cli-smoke.test.js` | 15 | `fileURLToPath` (import) | `no-unused-vars` |
| `tests/scoring.test.js` | 186 | `file` (destructured arg) | `no-unused-vars` |

There are also numerous dead destructured results in `tests/cli-smoke.test.js`
(`stderr`, `status`, `stdout` in spawnSync results) — fix only the ones at
lines **84, 154, 461, 467, 476, 492, 607** by prefixing them with `_` (e.g.
`const { status: _status, stderr: _stderr, stdout } = runCli(...)`) or
removing them from the destructure entirely if not read. Use the `_` prefix
convention the project already uses for args (`argsIgnorePattern: "^_"`).

The `no-undef` for `structuredClone` at `tests/conformance.test.js:54` is
fixed by adding it to the globals list in the eslint config.

**`quotes` false positives** — template literals in test files are flagged
because the `quotes` rule's `allowTemplateLiterals` option defaults to `false`.
Fix: add `"allowTemplateLiterals": true` to the rule options.

**Conventions**: ESM, double quotes, semicolons. The `hooks/` directory
contains shell scripts. `npm run lint` runs `eslint src/ bin/` today.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Lint tests dir | `npx eslint tests/` | 0 errors after fixes |
| Lint src + bin | `npm run lint` | exit 0 (unchanged) |
| Format check | `npm run format:check` | exit 0 |
| Full suite | `npm test` | all pass |
| Pre-commit smoke | `bash hooks/pre-commit` | exit 0 |

## Scope

**In scope**: `eslint.config.js`, `hooks/pre-commit`, `tests/optimizer.test.js`,
`tests/conformance.test.js`, `tests/cli-smoke.test.js`, `tests/scoring.test.js`,
`CHANGELOG.md`.

**Out of scope**: any file under `src/` or `bin/`; fixture files under
`tests/fixtures/`; `package.json` lint scripts (the script itself may stay as
`eslint src/ bin/` — expanding it to also cover `tests/` is optional and can
wait for a CI step update).

## Git workflow

- Branch: `advisor/049-tooling-hygiene`
- Commit style: `chore(tooling): lint tests/, add pre-commit lint+format, remove dead test vars`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Fix the eslint config

In `eslint.config.js`, make two targeted changes:

**1a.** Add `structuredClone` to the `globals` block:
```js
      structuredClone: "readonly",
```

**1b.** Update the `quotes` rule to allow template literals:
```js
      "quotes": ["error", "double", { "avoidEscape": true, "allowTemplateLiterals": true }],
```

The final config looks like:
```js
import js from "@eslint/js";

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        process: "readonly",
        console: "readonly",
        Buffer: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        fetch: "readonly",
        Headers: "readonly",
        Request: "readonly",
        Response: "readonly",
        structuredClone: "readonly",
      }
    },
    rules: {
      "no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
      "no-console": "off",
      "semi": ["error", "always"],
      "quotes": ["error", "double", { "avoidEscape": true, "allowTemplateLiterals": true }],
      "no-undef": "error",
      "no-useless-escape": "off",
      "no-useless-assignment": "off"
    }
  }
];
```

**Verify**: `npm run lint` → still exit 0 (no regressions in `src/` or `bin/`).

### Step 2: Remove dead imports and variables in test files

Work through each item in the table above:

**`tests/optimizer.test.js`**:
- Line 1: remove `mock` from the `node:test` import (or remove the whole
  named import if `mock` is the only thing imported from that position).
- Line 24: remove the `EVIDENCE_REGISTRY` import from `../src/evidence.js`
  (check if it is the only named import; if so, remove the whole statement).

**`tests/conformance.test.js`**:
- Line 53: remove `normalizeReport` from its import statement. Check whether
  other names in the same `import { ... }` are still used; keep those.

**`tests/cli-smoke.test.js`**:
- Line 15: remove `fileURLToPath` from its import statement. Check if the
  import has other names that are still used.
- Lines 84, 154, 461, 467, 476, 492, 607: for each dead destructured result
  from `runCli(...)` or `spawnSync(...)`, either remove it from the destructure
  or prefix it with `_` (e.g. `_stderr`, `_status`). Use `_` only when the
  binding must stay for syntactic reasons.

**`tests/scoring.test.js`**:
- Line 186: the unused `file` arg in a callback. Rename to `_file` to match
  the project's `argsIgnorePattern: "^_"` convention.

**Verify** after each file: `npx eslint tests/<filename>` → 0 errors for that
file.

### Step 3: Confirm the full test suite passes

After Step 2, confirm all tests still pass. The removals are dead-code cleanup;
no test behavior should change.

**Verify**: `node --test tests/optimizer.test.js` → all pass.
**Verify**: `npm test` → all pass.

### Step 4: Run eslint on tests/ — should be clean

**Verify**: `npx eslint tests/` → 0 errors.

If any unexpected errors appear (beyond what this plan addresses), fix them
only if they are clearly dead code or unused-var problems. Do NOT
restructure tests or change assertions; if an error requires more than a
trivial fix, note it and leave it for a follow-up.

### Step 5: Expand the pre-commit hook

In `hooks/pre-commit`, add lint and format checks before the changelog check
(so a linting failure surfaces before the changelog failure):

```bash
#!/usr/bin/env bash
set -euo pipefail
npm run lint
npm run format:check
node scripts/check-changelog.js
```

**Verify**: `bash hooks/pre-commit` → exit 0 (the repo is currently clean).

**Verify**: temporarily introduce a syntax error in a `src/` file and run
`bash hooks/pre-commit` — it should exit non-zero. Then revert. (This is a
local sanity check only; do not commit the broken file.)

### Step 6: Changelog

Under `## [Unreleased]`:
- `### Changed`:
  - `- ESLint config now allows template literals (removing \~20 false-positive quote errors in test files) and recognizes \`structuredClone\` as a Node 17+ global.`
  - `- Pre-commit hook now runs \`npm run lint\` and \`npm run format:check\` before the changelog check.`
- `### Fixed` (or a new `### Chore`):
  - `- Removed dead imports and unused variables in test files (\`optimizer.test.js\`, \`conformance.test.js\`, \`cli-smoke.test.js\`, \`scoring.test.js\`).`

**Verify**: `npm run changelog:check` → exit 0.

## Test plan

This plan changes only tooling. The verification is:
- `npx eslint tests/` → 0 errors (was 32).
- `npm run lint` → still 0 errors (no regression in `src/` + `bin/`).
- `npm test` → all pass (no accidental test changes).
- `bash hooks/pre-commit` → exit 0.

## Done criteria

ALL must hold:

- [ ] `npx eslint tests/` exits with 0 errors
- [ ] `npm run lint` exits with 0 errors (unchanged from before)
- [ ] `npm test` exits with all tests passing
- [ ] `grep -n "allowTemplateLiterals" eslint.config.js` shows `true`
- [ ] `grep -n "structuredClone" eslint.config.js` shows the global entry
- [ ] `grep -n "npm run lint" hooks/pre-commit` shows the lint step
- [ ] `bash hooks/pre-commit` exits 0
- [ ] `npm run changelog:check` exits 0
- [ ] Only in-scope files modified
- [ ] `plans/README.md` status row for 049 updated

## STOP conditions

Stop and report if:

- Removing a "dead" import in step 2 causes a test to fail (means the import
  was used indirectly or the variable name appeared in a string); restore it
  and report.
- `npm run lint` starts failing after step 1 (the config change introduced a
  regression to `src/` or `bin/`); revert step 1 and report the specific error.
- `bash hooks/pre-commit` fails after step 5 in the current clean repo state;
  report the command and output.
- `npx eslint tests/` still shows non-zero errors after step 4 for reasons not
  addressed by this plan; list the residual errors and leave them for a
  follow-up rather than improvising.

## Maintenance notes

- The `npm run lint` script in `package.json` currently targets `eslint src/ bin/`
  only. Consider adding `tests/` in a future iteration so `npm run lint` and
  `npx eslint tests/` stay in sync. That change is intentionally left here to
  keep this plan's scope small.
- The `_` prefix convention for unused args (`argsIgnorePattern: "^_"`) is
  already in the config; future test code should follow it.
- The pre-commit hook now runs two extra commands; on large repos this adds
  a few seconds to every commit. If that becomes annoying, the format check
  can be moved to CI only, but for this repo the overhead is negligible.
