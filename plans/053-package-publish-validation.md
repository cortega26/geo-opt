# Plan 053: Validate the published package with `publint` + `@arethetypeswrong/cli`

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If a
> "STOP conditions" item occurs, stop and report. When done, update the status
> row in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 13fb3bf..HEAD -- package.json index.d.ts tsconfig.json .github/workflows`
> If any changed since this plan was written, compare the "Current state"
> excerpts against the live files first.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW (dev tooling + CI; no runtime behavior change)
- **Horizon**: short term
- **Depends on**: none
- **Category**: dx / release quality
- **Planned at**: commit `13fb3bf`, 2026-06-29

## Why this matters

`geo-opt` is published to npm with a hand-maintained export surface: a custom
`exports` map, a `bin`, a top-level `types`, `"type": "module"`, and a
`files` allowlist (`package.json`). Mistakes in this surface — a `types`
condition pointing at the wrong file, an `exports` path that bundlers can't
resolve, a missing `dist/` file in `files`, a CJS/ESM interop trap — are
invisible to `npm test` and only surface as broken installs for consumers.

Two small, dev-only, industry-standard tools close that gap in CI:

- **`publint`** lints the published package shape (exports/main/types/files,
  ESM/CJS correctness) the way real package managers and bundlers resolve it.
- **`@arethetypeswrong/cli`** (`attw`) checks that the TypeScript types resolve
  correctly under every module-resolution mode a consumer might use.

The repo already has `tests/consumer.test.ts`, which proves intent to protect
the consumer-facing contract; these tools make that protection systematic and
cheap. They run against the packed tarball, so they validate exactly what
publishes.

## Current state

### `package.json` (export surface, current)

```json
{
  "main": "dist/index.js",
  "types": "index.d.ts",
  "exports": {
    ".": { "types": "./index.d.ts", "default": "./dist/index.js" },
    "./package.json": "./package.json"
  },
  "bin": { "geo-opt": "./dist/bin/cli.js" },
  "type": "module",
  "files": ["dist/", "index.d.ts", "README.md", "CHANGELOG.md", "LICENSE", "COMMERCIAL-LICENSE.md", "LICENSE-HISTORY.md", "LEGACY-MIT-LICENSE", "docs/"]
}
```

The build (`scripts/build.js`) emits `dist/`. `npm pack --dry-run --json` is the
documented package-preview command (`AGENTS.md`). `npm run check` is the
aggregate gate; CI mirrors it.

### Conventions

- devDependencies for tooling; do not add runtime deps here.
- Changelog policy applies to package-behavior changes.
- Both tools must run **after** the build, against the packed artifact.

## Commands you will need

| Purpose         | Command                                            | Expected |
|-----------------|----------------------------------------------------|----------|
| Install (dev)   | `npm install -D publint @arethetypeswrong/cli`     | exit 0   |
| Build           | `npm run build`                                    | exit 0   |
| publint         | `npx publint`                                      | 0 problems |
| attw (tarball)  | `npm pack` then `npx attw <tarball>.tgz`           | no errors |
| Full check      | `npm run check`                                    | exit 0   |

## Scope

**In scope**:
- `package.json` — add `publint` + `@arethetypeswrong/cli` to `devDependencies`;
  add scripts; wire into the `check` aggregate (after `build`).
- CI workflow (`.github/workflows/*`) — add the validation step if the existing
  CI does not already run `npm run check`. If CI runs `npm run check`, wiring it
  into `check` is sufficient.
- `CHANGELOG.md`.

**Out of scope**:
- Any `src/`, `bin/`, or `dist/` source. If the tools report a **real** export
  or types problem, do NOT fix it in this plan — record it and file a follow-up,
  unless the fix is a one-line `package.json`/`files`/`exports` correction that
  the tool explicitly recommends.
- Runtime dependencies.

## Git workflow

- Branch: `advisor/053-package-publish-validation`
- Commit: `chore(release): validate published package with publint + attw`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Install the tools (dev)

```bash
npm install -D publint @arethetypeswrong/cli
```

**Verify**: both appear under `devDependencies`; `npx publint --version` and
`npx attw --version` print versions.

### Step 2: Add scripts

Add to `package.json` `scripts`:

```json
"publint": "publint",
"attw": "attw --pack .",
"validate:package": "npm run build && npm run publint && npm run attw"
```

`attw --pack .` packs the current package and checks the resulting tarball, so
it validates exactly what would publish without a manual `npm pack` step.

**Verify**: `npm run validate:package` runs end to end. Capture the output.

### Step 3: Triage the first run

Record every problem the tools report. Expected categories and how to handle:

- **publint "exports" / "types" condition order**: usually a one-line
  `package.json` fix the tool names explicitly — apply it.
- **publint "files" missing an entry that `exports`/`bin` references**: add the
  missing path to `files`.
- **attw "masquerading" / "resolution" issues**: since the package is pure ESM
  (`"type": "module"`) with a single `types` file, most consumer modes should
  pass. If attw flags CJS-consumer resolution, evaluate whether the project
  intends to support CJS consumers at all. If it does not, configure attw to
  ignore the irrelevant profile (document why) rather than contorting the
  exports map.

If a report requires a **non-trivial** source or build change, STOP, write it
down, and file a follow-up plan. Keep this plan's diff limited to tooling +
trivial `package.json` corrections.

**Verify**: after trivial fixes, `npm run validate:package` → publint reports 0
problems (or only explicitly-suppressed, documented ones); attw reports no
errors for supported consumer profiles.

### Step 4: Wire into `check` and CI

Append `validate:package` to the `check` script so the local + CI gate covers
it. Confirm ordering: `validate:package` builds internally, so place it so the
build is not run twice unnecessarily, or accept the extra build for isolation
(document the choice in a comment if needed). If the CI workflow runs an
explicit step list rather than `npm run check`, add a `Validate package` step
there too.

**Verify**: `npm run check` → exit 0 and includes the package validation.

### Step 5: Changelog

Under `## [Unreleased]`:

```markdown
### Changed
- CI now validates the published package shape and type resolution with
  `publint` and `@arethetypeswrong/cli` (`npm run validate:package`).
```

**Verify**: `npm run changelog:check` → exit 0.

## Test plan

- `npm run validate:package` exits 0 (publint 0 problems; attw no errors on
  supported profiles).
- `npm run check` exits 0 with the new step included.
- No `src/`/`bin/`/`dist/` source changes (only `package.json`, CI, changelog,
  and at most trivial `files`/`exports` corrections).

## Done criteria

- [ ] `publint` + `@arethetypeswrong/cli` in `devDependencies`
- [ ] `validate:package` script present and passing
- [ ] `check` (and CI, if step-listed) runs package validation
- [ ] publint reports 0 problems (or only documented suppressions)
- [ ] attw reports no errors for supported consumer profiles
- [ ] No runtime-source changes; any real export/types defect is filed as a
  follow-up rather than force-fixed here
- [ ] `npm run changelog:check` exits 0
- [ ] `plans/README.md` status row updated

## STOP conditions

- A tool reports a defect that needs a non-trivial source/build change — record
  it, file a follow-up plan, and do not expand this plan's scope.
- attw cannot resolve types in a profile the project genuinely needs and the fix
  would change the public `exports`/`types` contract — STOP; that is a
  documentation-governance public-contract change requiring synchronized review.
- `npm run build` fails (pre-existing build break) — report; do not work around
  it here.

## Maintenance notes

- Both tools are dev-only and run on the packed tarball, so they cannot affect
  runtime. They will catch regressions when the export surface, `dist/` layout,
  or `index.d.ts` changes — which is exactly when they are most valuable (e.g. a
  future TypeScript migration, plan 056).
- If attw profiles are suppressed, keep the suppression list short and commented
  so a future maintainer knows which consumer modes are intentionally unsupported.
