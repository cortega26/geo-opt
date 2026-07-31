# Plan 065: Fix and test the CI entry assets (GitLab template + GitHub Action)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 296b60f..HEAD -- ci-templates/gitlab-ci.yml .github/actions/geo-opt-audit/action.yml README.md README.es.md tests/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx / docs
- **Planned at**: commit `296b60f`, 2026-07-31
- **Issue**: (none)
- **Executed**: APPROVED 2026-07-31 (executor worktree, branch
  `chore/065-harden-ci-entry-assets`; all done criteria re-verified).
  Review revision 1 (2026-07-31) applied: dead `format` input removed,
  stderr captured via `$RUNNER_TEMP`, `badge-url` documented, regression
  assertions added. Merged into main 2026-07-31 (squash, `d550d08`).

## Why this matters

`geo-opt` is entering a 90-day product-led validation (Plan 059) whose single
entry path is "local, version-controlled quality checks before merge" — the
README CI example, the GitHub Actions composite action, and the GitLab CI
template. Two of those three entry assets are broken today:

1. The GitLab template's own `include:` URL points at `tooltician-ai/geo-opt`,
   a GitHub org that does not exist (HTTP 404 verified 2026-07-31). The real
   repository is `cortega26/geo-opt` (see `git remote -v` and `package.json`
   `repository.url`). A GitLab user following the template's instructions gets
   a failed pipeline before running anything.
2. Both the action and the template parse the audit JSON looking for a
   `score` field, but the CLI emits `effectiveScore`. Verified against the
   live CLI: single-file JSON output has `effectiveScore: 41` and **no**
   `score` key; recursive output is an array of the same shape. So the
   `score` output and the shields badge are **always `0`/red** even on a
   passing audit. The exit-code gate (`passed`/pipeline failure) does work,
   because it comes from the CLI's own exit code.

Additionally, the action is undocumented in the README (only the copy-paste
YAML exists there), its `model` input defaults to the legacy `v1` while the
CLI's default is `v2`, and no test covers `.github/actions/` or
`ci-templates/` content, so nothing prevents this class of breakage from
returning. This plan fixes the assets, documents the action, and adds a
contract test that pins the org, the JSON field, and the model default so the
entry assets cannot silently drift again.

## Current state

Files and the facts the executor needs:

- `ci-templates/gitlab-ci.yml` — the GitLab template. Two defects:
  - Line 6: `#     - remote: 'https://raw.githubusercontent.com/tooltician-ai/geo-opt/main/ci-templates/gitlab-ci.yml'` — wrong org (`tooltician-ai` does not exist; the repo is `cortega26/geo-opt`).
  - Lines 68–75: the score extraction reads the wrong JSON field:
    ```yaml
    SCORE=$(node -e "
      const fs = require('fs');
      try {
        const d = JSON.parse(fs.readFileSync('geo-opt-audit.json','utf8'));
        const s = Array.isArray(d) ? (d[0]?.score ?? 0) : (d.score ?? 0);
    ```
    (`?? 0` on a field that never exists → always 0. Note the GitLab job
    pipes stdout through `tee geo-opt-audit.json`, so the file is pure
    stdout — only the field name is wrong here.)
  - Line 13 comment `GEO_OPT_MODEL — scoring model: "v1" (default) or "v2"` and line 23 default `GEO_OPT_MODEL: "v1"` — the CLI default is v2 (verified: `node bin/cli.js audit --help` prints `(default: "v2")`).
- `.github/actions/geo-opt-audit/action.yml` — the composite action. Defects:
  - Lines 27–31: `model` input: `description: "Scoring model: v1 (default) or v2 (profile-aware)"` and `default: "v1"` — should default to v2 to match the CLI and README.
  - Lines 66–85 (the `run:` script): capture merges streams —
    `OUTPUT=$($CLI $ARGS 2>&1) || AUDIT_EXIT=$?` — and the parser reads
    `const s = Array.isArray(d) ? (d[0]?.score ?? 0) : (d.score ?? 0);`
    (always 0, same field problem). The merged-stream capture is also
    fragile: any stderr content would break `JSON.parse` and the `catch`
    silently falls back to `0`.
- The JSON shape the parser must handle (verified by running the CLI):
  - Single file: a single object with `effectiveScore` (e.g.
    `tests/fixtures/sample.md` → `"effectiveScore": 41` in a clean
    checkout), **no** `score`.
  - Recursive: an array of those objects, each with `effectiveScore`.
  - NOTE (environment factor, confirmed at execution + review, 2026-07-31):
    the fixture's live `effectiveScore` is **41 in a clean checkout** and
    **39 when a gitignored local `geo_config.json` exists in the CLI's
    cwd** (the maintainer's main repo has one; fresh worktrees/CI do not).
    The assertion that matters is "the fixture's real score, not 0"; the
    literal expected value below is 41 (clean checkout).
- `README.md` — the "CI/CD integration" section (currently around lines
  216–243) shows a copy-paste GitHub Actions YAML step but never mentions
  the composite action. The README badge (line 18) and the GitLab template
  are the only other CI references.
- `README.es.md` — a translated mirror of README.md; it has the same
  "CI/CD integration" section. The repo keeps both in sync.
- `tests/058-plan-records.test.js` — the established pattern for tests that
  read repository files and assert on their content: ESM imports
  (`node:test`, `node:assert`, `node:fs`, `node:path`), a `read(rel)`
  helper rooted at the repo root (`const repoRoot = path.join(__dirname, "..")`),
  `describe`/`it` blocks. Match this file's structure for the new test.
- `package.json` — `repository.url` is
  `git+https://github.com/cortega26/geo-opt.git`. Tags run v2.0.0…v2.3.0
  (verified: no `v1` tag exists; the action exists in tags from v2.0.0 up).
- Changelog policy (`scripts/check-changelog.js`): `tests/` changes require
  a bullet under `## [Unreleased]` in `CHANGELOG.md`. `.github/` and
  `ci-templates/` and `README.md` do **not** trigger the policy.

Repo conventions to match:

- JavaScript: ESM, camelCase, double quotes, semicolons (see any file in
  `tests/`).
- CLI errors write to stderr; test files use `node:test` — see
  `tests/058-plan-records.test.js` as the exemplar for repo-content tests.
- Conventional commits in git history (`chore:`, `fix:`, `feat:`).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Full quality gate | `npm run check` | exit 0 |
| JS tests only | `npm test` | exit 0 |
| Audit JSON shape check | `node bin/cli.js audit tests/fixtures/sample.md --format json` | JSON object containing `"effectiveScore"` and no top-level `"score"` |

## Scope

**In scope** (the only files you should modify):
- `ci-templates/gitlab-ci.yml`
- `.github/actions/geo-opt-audit/action.yml`
- `README.md` (the "CI/CD integration" section only, plus the Table of
  contents if the new subsection adds a heading that belongs in it)
- `README.es.md` (the same subsection, translated; the repo keeps the
  Spanish mirror in sync with the English README)
- `tests/ci-assets.test.js` (create)
- `CHANGELOG.md` (one bullet under `## [Unreleased]`)

**Out of scope** (do NOT touch, even though they look related):
- `plans/archive/040-pro-ci-cd-integration.md` — archived historical
  evidence; per `docs/documentation-governance.md`, do not modernize
  archived plans. (It contains the same wrong `tooltician-ai` reference; it
  is deliberately left as-is.)
- `.github/workflows/` — the repo's own CI pipeline is unrelated to the
  entry assets.
- Any change to the audit JSON output shape in `src/` — the contract test
  pins the *existing* shape (`effectiveScore`).
- The `skill`-related files (`.agents/`) — separate plan.

## Git workflow

- Branch: `chore/065-harden-ci-entry-assets` (the repo's history uses
  `chore:`/`fix:`/`feat:` conventional commits, squashed into PRs).
- Commit once per logical unit (template fix, action fix, README section,
  contract test), message style matching history, e.g.
  `fix(ci): correct GitLab include org and JSON score field`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Fix the GitLab template (`ci-templates/gitlab-ci.yml`)

1. Line 6: replace `tooltician-ai` with `cortega26` in the include URL.
2. Lines 68–75: change the parser to read `effectiveScore`:
   `const s = Array.isArray(d) ? (d[0]?.effectiveScore ?? 0) : (d.effectiveScore ?? 0);`
   Keep the `?? 0` fallback (it now only fires for genuinely absent data).
3. Line 13 and line 23: change the model default from `"v1"` to `"v2"` in
   both the comment and the variable default.

**Verify**:
- `grep -n "tooltician-ai" ci-templates/gitlab-ci.yml` → no matches
- `grep -n "effectiveScore" ci-templates/gitlab-ci.yml` → the two `?? 0`
  occurrences now read `effectiveScore`
- `grep -n "GEO_OPT_MODEL" ci-templates/gitlab-ci.yml` → default is `"v2"`

### Step 2: Fix the GitHub Action (`.github/actions/geo-opt-audit/action.yml`)

1. `model` input (around lines 27–31): change `description` to
   `"Scoring model: v2 (default, profile-aware) or v1 (legacy)"` and
   `default` to `"v2"`.
2. In the `run:` script, capture stdout and stderr separately instead of
   merging them, then parse only stdout. Capture stderr via `$RUNNER_TEMP`
   (review revision 1, 2026-07-31: a temp file in the repo working
   directory would clobber a tracked file of the same name and dirty
   `git status`):
   ```bash
   OUTPUT=$($CLI $ARGS 2>"$RUNNER_TEMP/geo-opt-audit-stderr.txt") || AUDIT_EXIT=$?
   AUDIT_EXIT=${AUDIT_EXIT:-0}
   cat "$RUNNER_TEMP/geo-opt-audit-stderr.txt" >&2
   ```
   (Keep the existing `AUDIT_EXIT=${AUDIT_EXIT:-0}` line — it is correct.)
3. In the same script, change the parser to:
   `const s = Array.isArray(d) ? (d[0]?.effectiveScore ?? 0) : (d.effectiveScore ?? 0);`
4. At the end of the script, re-print the original stdout only:
   ```bash
   echo "$OUTPUT"
   ```
   (stderr was already printed once, right after the capture — do not print
   it twice. The behavior that matters: stderr is visible to the job log,
   and only stdout is parsed.)
5. (Review revision 1, 2026-07-31) Remove the dead `format` input: the run
   command always forces `--format json` and `inputs.format` is never
   referenced anywhere. Do not document it as an input.

**Verify**: replicate the fixed parse against the live CLI:
```bash
cd "$(git rev-parse --show-toplevel)"
OUTPUT=$(node bin/cli.js audit tests/fixtures/sample.md --format json 2>/dev/null) || true
echo "$OUTPUT" | node -e '
  const c=[];process.stdin.on("data",d=>c.push(d));
  process.stdin.on("end",()=>{
    const d=JSON.parse(c.join(""));
    const s=Array.isArray(d)?(d[0]?.effectiveScore??0):(d.effectiveScore??0);
    process.stdout.write(String(Math.round(s)));
  });'
```
→ prints `41` (the fixture's real score in a clean checkout; 39 if a
gitignored local `geo_config.json` is in cwd), **not** `0`.

### Step 3: Document the action in the README (en + es)

In `README.md`, in the "CI/CD integration" section, after the existing
copy-paste YAML block and before the GitLab template sentence, add a short
"GitHub Actions composite action" subsection. Include:

- A reference with the correct org and an existing release tag (use the
  latest tag from `git tag --sort=-v:refname | head -1` at execution time —
  expected `v2.3.0`):
  ```yaml
  - uses: cortega26/geo-opt/.github/actions/geo-opt-audit@v2.3.0
    with:
      path: content/
      threshold: 70
  ```
- One line each on the `path`, `threshold`, `model` inputs and the
  `score`/`passed`/`badge-url`/`badge-markdown` outputs (review revision 1:
  the dead `format` input was removed, so it is not documented; `badge-url`
  is a real output in the action). Keep the claim precise: the
  action audits content and gates on the exit code; it does not change the
  repository.
- No invented claims (no telemetry, no "Pro requires X" beyond what
  `docs/free-vs-pro.md` says about `--recursive`/`--no-branding`).

Mirror the subsection in `README.es.md` (neutral Spanish, matching the
tone of the existing translation).

**Verify**:
- `grep -n "geo-opt-audit" README.md README.es.md` → both show the new
  `uses:` line
- `grep -n "tooltician-ai" README.md README.es.md` → no matches
- The tag in the example exists: `git rev-parse --verify v2.3.0` (or
  whichever tag you used) → prints a SHA

### Step 4: Add the contract test (`tests/ci-assets.test.js`)

Model the file on `tests/058-plan-records.test.js` (ESM `node:test`,
`read(rel)` helper rooted at repo root). Assert:

1. The GitLab include URL org matches `package.json` `repository.url` org:
   parse `package.json` with `JSON.parse`, extract the org from
   `repository.url` (regex like `/github\.com\/([^/]+)\//u`), then assert
   the `raw.githubusercontent.com/<org>/` string appears in
   `ci-templates/gitlab-ci.yml`. (This keeps the test correct even if the
   org ever changes.)
2. Both `ci-templates/gitlab-ci.yml` and
   `.github/actions/geo-opt-audit/action.yml` contain `effectiveScore` and
   do **not** contain `?.score ` (the broken field access) — a literal
   string assertion on the read files.
3. Both files default the model to `v2`: in the action, the `model` input
   block contains `default: "v2"`; in the template, `GEO_OPT_MODEL: "v2"`.
4. The README (`README.md` and `README.es.md`) action reference uses the
   same org derived from `package.json` and contains a `@v` pin
   (regex like `geo-opt-audit@v\d+\.\d+\.\d+`).

Do not assert on the exact score value or on tag existence (tags may not be
present in a shallow CI checkout).

**Verify**: `npm test` → all tests pass, including the new
`ci-assets.test.js` file (test runner picks up `tests/*.test.js`
automatically). Confirm with `node --test tests/ci-assets.test.js` first,
then the full `npm test`.

### Step 5: Changelog entry and full gate

1. Add one bullet under `## [Unreleased]` in `CHANGELOG.md`, section
   `### Fixed` (or `### Docs` if you prefer), concise, e.g.:
   `- Fixed the GitLab CI template include URL and the GitHub Actions
   composite action score parsing (JSON field is `effectiveScore`), and
   documented the action in the README.`
2. Run the full gate:
   `npm run check` → exit 0 (includes lint, format check, all JS tests
   including the new one, Python conformance, both typechecks, changelog
   policy, and package validation).

**Verify**: `npm run check` exits 0.

## Test plan

- New file `tests/ci-assets.test.js` with the four assertion groups in
  Step 4 (org consistency, `effectiveScore` usage, v2 defaults, README
  action reference) plus a fifth (review revision 1): the action forces
  `--format json`, has no `inputs.format` reference, and captures stderr
  via `$RUNNER_TEMP` (never `2>audit-stderr.txt`). Structural pattern:
  `tests/058-plan-records.test.js`.
- Regression coverage: the org assertion fails if anyone reintroduces
  `tooltician-ai`; the field assertion fails if the parser is rewritten
  back to `score`; the default assertions fail if the model defaults drift
  back to v1.
- No runtime tests are added: the action itself cannot run in this
  repository's unit test suite (composite actions run in GitHub's runner).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -rn "tooltician-ai" ci-templates/ .github/actions/ README.md README.es.md` returns no matches
- [ ] `grep -rn "?\.score " ci-templates/gitlab-ci.yml .github/actions/geo-opt-audit/action.yml` returns no matches; both contain `effectiveScore` (the action's `outputs.score` output name is legitimate and stays)
- [ ] The step-2 parse replication prints `41` (not `0`) for `tests/fixtures/sample.md` (39 if a gitignored local `geo_config.json` is in cwd — the assertion is "real score, not 0")
- [ ] `grep -n "inputs.format" .github/actions/geo-opt-audit/action.yml` returns no matches; the run script contains `--format json` and `$RUNNER_TEMP`, and does not contain the literal `2>audit-stderr.txt`
- [ ] `git tag --sort=-v:refname | head -1` exists and is the tag used in the README example
- [ ] `node --test tests/ci-assets.test.js` passes; `npm test` passes
- [ ] `npm run check` exits 0
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row for 065 updated

## STOP conditions

Stop and report back (do not improvise) if:

- `tests/fixtures/sample.md` audit JSON no longer has `effectiveScore`
  (the CLI shape changed — the whole fix target is wrong).
- `package.json` `repository.url` is not a GitHub URL (the org-extraction
  test design does not apply).
- No `v2.x` tag exists at execution time (the README example needs a real
  tag to pin).
- The action or template files differ substantially from the "Current
  state" excerpts beyond the listed defects (e.g. the parser was already
  fixed — then only add the test and the README section).
- A step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

- `plans/archive/040-pro-ci-cd-integration.md` still references
  `tooltician-ai/geo-opt` and `@v1`; it is archived evidence and stays
  as-is per documentation governance.
- When the next release tag is cut (e.g. v2.4.0), consider bumping the
  `uses:` pin in the README example; the contract test only checks the
  `@v` shape, not the exact tag.
- The action runs `npm ci` in the checked-out action repo — any future
  runtime-dependency change in `package.json` must keep `package-lock.json`
  in sync or the action's `npm ci` will fail for users.
- An end-to-end smoke test of the action in a scratch public repo (using
  the action from a tag) is recommended but out of scope for this plan.
- Recursive audits return a JSON array; both parsers use `d[0]` (first
  file's score) for the score/badge outputs — a deliberate, plan-pinned
  behavior. The threshold gate is correct regardless (it uses the CLI exit
  code, which fails when ANY file is below threshold).
- The action runs `--format json` unconditionally; a `format` input was
  removed in review revision 1 because it was dead (never referenced). Do
  not re-add it without wiring it through the run command.
