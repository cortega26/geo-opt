# Plan 042: CI runs `npm run typecheck` so public-type regressions fail the build

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If a
> "STOP conditions" item occurs, stop and report. When done, update the status
> row for this plan in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat b09a5f8..HEAD -- .github/workflows/ci.yml package.json index.d.ts`
> If `.github/workflows/ci.yml` changed since this plan was written, compare the
> "Current state" excerpt against the live file before proceeding.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `b09a5f8`, 2026-06-28

## Why this matters

The published package ships a hand-maintained type surface (`index.d.ts`,
declared as the package `types`). It is verified by `tests/consumer.test.ts` +
`npm run typecheck` (`tsc -p tsconfig.json`). The local `npm run check` script
includes `typecheck`, but **CI does not run it**: `.github/workflows/ci.yml`
runs lint, format, `npm test`, the Python tests, changelog, a dogfood audit,
and an advisory `npm audit` — but never `typecheck`. A PR that breaks the
public type contract (renames/removes an export, changes a signature) therefore
merges green; only a contributor who happens to run `npm run check` locally
catches it. This plan closes the gap with one CI step.

## Current state

- `package.json` already defines the script (line 39):
  `"typecheck": "tsc -p tsconfig.json"`, and `check` (line 40) includes it.
  `typescript` is a devDependency, installed by `npm ci`.
- `.github/workflows/ci.yml` — the `check` job. Steps as they exist today
  (`.github/workflows/ci.yml:47-69`):

```yaml
      - name: Lint
        run: npm run lint

      - name: Format check
        run: npm run format:check

      - name: JS tests
        run: npm test

      - name: Python compatibility tests
        run: python3 .agents/skills/geo-optimization/scripts/test_optimizer.py

      - name: Changelog policy
        if: github.event_name == 'pull_request'
        env:
          GITHUB_BASE_REF: ${{ github.base_ref }}
        run: node scripts/check-changelog.js

      - name: Dogfood — audit own documentation
        run: node bin/cli.js audit docs/ --recursive --threshold 50

      - name: Security audit (advisory only)
        run: npm audit --audit-level=high || true
        continue-on-error: true
```

The string `typecheck` does not appear anywhere in `ci.yml`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck locally | `npm run typecheck` | exit 0, no errors |
| Confirm CI step added | `grep -n "typecheck" .github/workflows/ci.yml` | one match |

## Scope

**In scope**:
- `.github/workflows/ci.yml`
- `CHANGELOG.md` (a one-line `### Changed` or `### Docs` note about CI)

**Out of scope**:
- `package.json`, `tsconfig.json`, `index.d.ts`, `tests/consumer.test.ts` — do
  not modify. If `npm run typecheck` already fails on the current tree, that is
  a STOP condition (see below), not something to fix in this plan.
- `.github/workflows/changelog-policy.yml` — unrelated workflow.

## Git workflow

- Branch: `advisor/042-add-typecheck-to-ci`
- Commit message: `ci: run npm run typecheck in the check job`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 0: Confirm the type contract is currently green

Run `npm run typecheck`. Expected: exit 0 with no errors. If it errors, **STOP**
and report the errors — adding the CI step would (correctly) turn the build red,
but fixing pre-existing type errors is outside this plan's scope and needs a
separate decision.

**Verify**: `npm run typecheck` → exit 0.

### Step 1: Add the typecheck step to CI

In `.github/workflows/ci.yml`, add a new step immediately after the `JS tests`
step (so it runs early, before the slower Python/dogfood steps):

```yaml
      - name: Typecheck
        run: npm run typecheck
```

Keep indentation consistent with the surrounding steps (6 spaces before
`- name`).

**Verify**: `grep -n "Typecheck\|npm run typecheck" .github/workflows/ci.yml`
shows the new step.

### Step 2: Update the changelog

Add a bullet under `## [Unreleased]` (use a `### Docs` section, creating it if
absent, since this is a CI-only change with no runtime behavior change):

```
- CI now runs `npm run typecheck`, so regressions in the public `index.d.ts`
  type surface fail the build instead of only the local `npm run check`.
```

**Verify**: `npm run changelog:check` → exit 0.

## Test plan

- No new unit tests (this is a CI configuration change).
- Validate the workflow YAML is well-formed: `node -e "const fs=require('fs');
  const s=fs.readFileSync('.github/workflows/ci.yml','utf8'); if(!/name:
  Typecheck/.test(s)) throw new Error('step missing'); console.log('ok')"`.
- The authoritative test is the next CI run on a PR; the local proxy is
  `npm run typecheck` passing.

## Done criteria

ALL must hold:

- [ ] `npm run typecheck` exits 0
- [ ] `.github/workflows/ci.yml` contains a `Typecheck` step running
      `npm run typecheck`
- [ ] `npm run changelog:check` exits 0
- [ ] Only `.github/workflows/ci.yml` and `CHANGELOG.md` modified (`git status`)
- [ ] `plans/README.md` status row for 042 updated

## STOP conditions

Stop and report if:

- `npm run typecheck` fails on the unmodified tree (pre-existing type errors —
  needs a separate fix decision before CI can enforce it).
- `.github/workflows/ci.yml` has drifted and no longer has the step layout in
  "Current state".

## Maintenance notes

- If a future change splits CI into multiple jobs, ensure typecheck stays on
  the critical (required) path, not an optional/`continue-on-error` job.
- The matrix runs Node 22 and 24; `tsc` behavior is Node-version independent, so
  the step is redundant across matrix legs but cheap — fine to leave on both.
