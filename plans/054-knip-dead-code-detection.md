# Plan 054: Add `knip` for dead-code and unused-dependency detection

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If a
> "STOP conditions" item occurs, stop and report. When done, update the status
> row in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 13fb3bf..HEAD -- package.json src/index.js bin/cli.js`
> If any changed since this plan was written, compare against the live files.

## Status

- **Priority**: P3
- **Effort**: S (tool + config + triage); the *fixes* it surfaces may be larger
- **Risk**: LOW for adding the tool; MED for acting on its findings (so this
  plan only *adds and configures* it, and acts on findings conservatively)
- **Horizon**: medium term (reevaluate when the audit backlog is clear)
- **Depends on**: none
- **Category**: dx / tech-debt hygiene
- **Planned at**: commit `13fb3bf`, 2026-06-29

## Why this matters

The repo has 26 modules in `src/`, a 1800-line `bin/cli.js`, a public
`src/index.js` re-export barrel, and a curated `index.d.ts`. As the surface
grows, unused exports, unreferenced files, and unused dependencies accumulate
silently. ESLint's `no-unused-vars` only catches *within-file* dead code; it
cannot see an exported symbol that nothing imports, a dependency in
`package.json` that nothing requires, or a file no longer referenced.

[`knip`](https://knip.dev) is the standard tool for this in the Node/TS
ecosystem. It reports unused files, unused exports, and unused (and missing)
dependencies across the whole project graph. It is dev-only and read-only.

**Important caveat for this repo** (read before acting on any finding): knip's
"unused export" heuristic does NOT understand that this project intentionally
re-exports a public API via `src/index.js` whose consumers are *external*, and
it will not by default see usage inside test files or the bundled skill. The
roadmap already documents one such false positive: `auditFile` was reported as
"dead code (~128 lines)" and **REJECTED** — it is a public export covered by
tests and an artifact contract (`plans/README.md`, "Considered and rejected"
note). knip must be configured with the public entry points and test files as
entry points, and every finding must be triaged against that note before
removal.

## Current state

- `src/index.js` is the public re-export barrel; its exports are the package's
  public API (consumed externally, not internally).
- `bin/cli.js` is the `bin` entry point.
- `tests/*.test.js` and `tests/consumer.test.ts` import from `src/` and the
  built package; the bundled skill under `.agents/skills/` also references code.
- ESLint covers within-file unused vars only (`eslint.config.js`,
  `no-unused-vars`), and after plan 049 it lints `tests/` too.
- No project-wide unused-export/dependency detection exists today.

## Commands you will need

| Purpose       | Command                  | Expected                         |
|---------------|--------------------------|----------------------------------|
| Install (dev) | `npm install -D knip`    | exit 0                           |
| Run           | `npx knip`               | report (may be non-empty first run) |
| Full check    | `npm run check`          | exit 0                           |

## Scope

**In scope**:
- `package.json` — add `knip` to `devDependencies`; add a `knip` script.
- `knip.json` (or `knip` config in `package.json`) — configure entry points and
  ignores so the public API and tests are recognized.
- `CHANGELOG.md`.
- **Conservative cleanup only**: remove a flagged item *only if* it is
  unambiguously dead (not a public export, not used by tests, not used by the
  bundled skill, not in the "considered and rejected" note) AND removal does not
  change public API. Anything else is recorded, not removed.

**Out of scope**:
- Making `knip` a blocking CI gate on the first pass — it runs as a non-blocking
  report until the baseline is clean. Promote it to blocking in a follow-up once
  the report is empty.
- Removing `auditFile` or anything else listed in the roadmap's
  "Considered and rejected" section.
- Any public-API change (removing a `src/index.js` export or an `index.d.ts`
  entry) — that is a documentation-governance synchronized-update change, filed
  separately.

## Git workflow

- Branch: `advisor/054-knip`
- Commit: `chore(tooling): add knip for unused export/dependency detection`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Install knip (dev)

```bash
npm install -D knip
```

**Verify**: `knip` in `devDependencies`; `npx knip --version` prints a version.

### Step 2: Configure entry points

Create `knip.json` declaring the real entry points so the public API and tests
are not misreported as dead:

```json
{
  "$schema": "https://unpkg.com/knip@5/schema.json",
  "entry": [
    "src/index.js",
    "bin/cli.js",
    "tests/**/*.test.{js,ts}",
    "scripts/*.js"
  ],
  "project": ["src/**/*.js", "bin/**/*.js", "scripts/**/*.js"],
  "ignoreDependencies": []
}
```

Adjust globs to match the live layout. If the bundled skill under
`.agents/skills/` imports project code, add it as an entry too so its usage is
counted.

**Verify**: `npx knip` runs without a config error and produces a report.

### Step 3: Triage the report — do not bulk-delete

Go through each finding category:

- **Unused files**: confirm by grepping the whole repo (including `tests/`,
  `.agents/`, and `docs/` examples) before considering removal.
- **Unused exports**: cross-check against `src/index.js` (public API), tests,
  the bundled skill, and the roadmap's "Considered and rejected" note. A symbol
  re-exported from `src/index.js` is public by definition — **keep it** even if
  no internal caller exists.
- **Unused dependencies**: verify with `grep -rn "<pkg>" src/ bin/ scripts/`. A
  truly unimported runtime dependency can be removed; be careful with deps used
  only via dynamic import or by tooling.
- **Missing dependencies**: knip may flag a package imported but not declared —
  if real, add it (this is a genuine bug worth fixing).

Apply only unambiguous, non-public, non-test removals. Record everything else in
the PR description / a notes file for maintainer review.

**Verify** after any removal: `npm run check` → exit 0 (tests still pass; the
removed item really was unused).

### Step 4: Add a non-blocking script

```json
"knip": "knip"
```

Do **not** add it to the `check` aggregate yet — the first baseline may have
intentional residue (public exports knip can't see as used even with entry
config). Once `npx knip` is clean, a follow-up plan can promote it to a gate.

**Verify**: `npm run knip` runs.

### Step 5: Changelog

Under `## [Unreleased]`:

```markdown
### Changed
- Added `knip` (dev-only) for project-wide unused-file, unused-export, and
  unused/missing-dependency detection (`npm run knip`).
```

Add a `### Removed` bullet only if Step 3 removed something concrete.

**Verify**: `npm run changelog:check` → exit 0.

## Test plan

- `npm run knip` runs and produces a report.
- Any removal is validated by `npm run check` passing (proves the item was dead).
- No public-API export removed; `tests/consumer.test.ts` still passes.

## Done criteria

- [ ] `knip` in `devDependencies`; `knip` script present
- [ ] `knip.json` configures entry points (public API + tests + bundled skill)
- [ ] Report triaged against the "Considered and rejected" note; `auditFile`
  NOT removed
- [ ] Any removal validated by `npm run check` exit 0
- [ ] knip NOT yet a blocking gate (left for a follow-up once baseline is clean)
- [ ] `npm run changelog:check` exits 0
- [ ] `plans/README.md` status row updated

## STOP conditions

- knip flags a `src/index.js` re-export or `index.d.ts` entry as unused — do NOT
  remove it; record it. Public API removal needs synchronized governance review.
- Removing a flagged item breaks any test — restore it and mark it used.
- The unused-dependency list includes a package used only dynamically or by a
  build/tooling path — keep it; add it to `ignoreDependencies` with a comment.
- The report is large and ambiguous — keep the tool non-blocking, hand the
  triaged list to the maintainer, and stop.

## Maintenance notes

- knip's value compounds over time: run it before each release and during
  refactors (e.g. the core-layering plan 050 follow-ups, or the TS migration
  plan 056) to catch newly-orphaned code.
- Once the baseline is genuinely empty, promote `npm run knip` into `check` /
  CI as a blocking gate in a small follow-up plan.
- Keep `entry`/`ignoreDependencies` in sync when the public API or build layout
  changes, or knip will produce false positives again.
