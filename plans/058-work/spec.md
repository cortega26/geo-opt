# Spec — Plan 058: Reconcile factual product claims and prepare a narrow product-led entry point

> **Source plan:** [`plans/058-relaunch-community-validation.md`](../058-relaunch-community-validation.md)
> **Scope:** repository documentation and local planning records ONLY.
> **Hard limits (from plan):** no external publication, no LinkedIn/social posting, no
> outreach, no Tooltician.com changes, no telemetry, no service CTA, no licensing
> behavior changes, no source-code behavior changes, no prices/checkout/legal terms.
> Runtime + tests outrank prose. If a truthful claim cannot be established, stop rather
> than preserve a persuasive-but-uncertain statement.

## 1. Goal

Make every public capability claim in the repository match current tested runtime
behavior at HEAD (`b2e6055`), and establish one truthful copy-paste local-to-CI
onboarding route for the selected job:

> **Local, version-controlled quality checks for Markdown, HTML, and static-site
> content before merge — without uploading proprietary content.**

The three-pillar AI-discoverability framing stays as product context; it is NOT the
first-screen entry message. Historical LinkedIn/social campaign drafts must be
labelled historical / not approved for publication, not turned into a live campaign.

## 2. Claim-to-runtime matrix (empirically verified 2026-07-22 at HEAD `b2e6055`)

Verification method: ran each command in a clean `/tmp` sandbox with no
`TOOLTICIAN_LICENSE_KEY` and no `license.key` in config. Recorded exit behavior and
whether a file/write/output occurred.

### 2.1 CLI commands — actual gating

| Command / flag                                  | Doc claims        | Runtime reality (verified)                                   | Classification |
| ---------------------------------------------- | ----------------- | ----------------------------------------------------------- | -------------- |
| `audit <file>`                                 | Free              | Runs, no gate                                               | **Community now** |
| `audit <file1> <file2> ...`                    | Pro ❌            | Runs, no gate                                               | **Community now** (doc WRONG) |
| `audit --recursive`                            | Pro ❌            | Runs, no gate                                               | **Community now** (doc WRONG) |
| `audit --summary`                              | Pro ❌            | Runs, no gate                                               | **Community now** (doc WRONG) |
| `audit --threshold <n>`                       | Pro ❌            | Runs; exits non-zero when threshold missed                  | **Community now** (doc WRONG) |
| `audit --format json`                         | (not gated)       | Runs                                                        | Community now |
| `technical <files...>`                        | Free              | Runs                                                        | Community now |
| `technical --url` / `--sitemap`               | Free              | Runs with SSRF guards                                       | Community now |
| `schema <file> <type>` (Community types)       | Free (with branding) | Runs                                                     | Community now |
| `schema <file> <type>` (Pro types: course, event, recipe, howto) | Pro ❌ | **Pro-gated** at `src/schema.js:330` (`hasProEntitlement`) | **gated now** ✓ |
| `validate <file>`                             | Free              | Runs                                                        | Community now |
| `inject <file> <type>`                         | Pro ❌            | **Runs, no gate** (verified `--dry-run` and real write)     | **Community now** (doc WRONG) |
| `inject --recursive`                           | Pro ❌            | Not separately gated                                        | **Community now** (doc WRONG) |
| `inject --backup`, `--dry-run`                | (Pro)             | Run, no gate                                                | Community now |
| `inject --no-branding`                         | Pro ❌            | **Pro-gated** via `getNoBrandingError` in `src/schema.js`    | **gated now** ✓ |
| `schema --no-branding`                         | Pro ❌            | **Option not implemented** on `schema` subcommand (unknown-option error) | **unsupported** — remove from docs |
| `robots audit <file>`                          | Free              | Runs                                                        | Community now |
| `robots generate`                              | Pro ❌            | **Runs, no gate** (wrote `robots.txt`)                      | **Community now** (doc WRONG) |
| `llmstxt audit <file>`                         | Free              | Runs                                                        | Community now |
| `llmstxt generate`                             | Pro ❌            | **Runs, no gate**                                           | **Community now** (doc WRONG) |
| `llmstxt generate --frontmatter-fields`        | (Pro)             | Runs, Node-only                                             | Community now (Node-only) |
| `sitemap generate`                             | Pro ❌            | **Runs, no gate**                                           | **Community now** (doc WRONG) |
| `generate-all [dir]`                           | Pro ❌            | **Runs, no gate** (generated package)                       | **Community now** (doc WRONG) |
| `badge <file>`                                 | Free              | Runs                                                        | Community now |
| `init`, `config get/set`                       | Free              | Runs                                                        | Community now |
| `report [files...]`                            | Pro ❌            | **Pro-gated** at `bin/cli.js:1019` (`hasProEntitlement`)    | **gated now** ✓ |
| `report --no-branding`                         | Pro ❌            | **Pro-gated** (after the `report` gate)                     | **gated now** ✓ |
| `report --compare <baseline.json>`             | (Pro)             | Pro-gated (whole `report` command is gated)                 | gated now |

**Summary:** Runtime gates exactly THREE things: the `report` command, `--no-branding`
on `inject` and `report`, and the four Pro schema types (`course`, `event`, `recipe`,
`howto`). Every other "Pro ❌" row in the docs is a factual defect.

### 2.2 Library API — actual gating

`src/index.js` exports the full surface with no per-export Pro gate. Pro enforcement
for `injectSchema` / `batchInject` is performed **inside the function bodies** via
`getNoBrandingError` / `hasProEntitlement` for the `--no-branding`/Pro-schema-type
paths only. The write/batch functions themselves are callable from Community. So the
"JavaScript library — write / batch functions: No" rows are WRONG.

### 2.3 Scoring model claims (`docs/architecture.md` "Current maturity")

| Claim in architecture.md                            | Runtime reality                                   | Fix |
| -------------------------------------------------- | ------------------------------------------------- | --- |
| "The public npm package has not been released."     | Published: `npm install -g geo-opt` works (README)| **Correct** to "published" |
| "V1 is the default scoring model."                 | v2 is default (`--help`, README, plan 022 DONE)   | **Correct** |
| "V2 is experimental and available only in Node.js through `--model v2`." | v2 is default; `--model v1` is the opt-in deprecated path | **Correct** |
| "there is no supported `technical` CLI command yet."| `technical` is a documented CLI command           | **Correct** |
| "Last verified: 2026-06-27 (post plan 034)"        | Should reflect 2026-07-22 reconciliation          | **Update date** |

### 2.4 Test-count badge (README.md)

README badge claimed `573_passed` (stale). The badge is a moving target — it
must equal the actual `npm test` count. As of the Plan 058 edits (54 new tests
added, plus 2 internal-consistency tests), the real count is **666**. Update
the badge SVG URL and the prose mentions ("610 tests", "610 tests pasados") in
both READMEs to `666`.

The in-test verification (§6.2) asserts internal consistency: the badge number,
the highlights line, and the dev section all agree, and the two READMEs agree.
node:test refuses to run `node --test` from inside a test file (recursion
guard), so the live badge-vs-actual-count check lives in a standalone
`scripts/check-test-count.js` that the owner can run manually
(`node scripts/check-test-count.js`) or wire into CI later. It is intentionally
NOT wired into `npm run check` here, because that would require a `package.json`
edit outside this plan's scope (§6.5 guards `package.json` against any change).
The script is a new untracked file; the owner must `git add scripts/check-test-count.js`
(and the `tests/058-*.test.js` files) when committing Plan 058 so CI retains the
drift detector.

## 3. Files to change (in scope)

| File                                              | Change                                                                                              |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `docs/free-vs-pro.md`                             | Rewrite the two Free/Pro tables to match §2.1/§2.2. Remove `--no-branding` from `schema` row. Add a clear "Community is broad; Pro adds HTML reports, branding-free output, and advanced schema types" framing. |
| `docs/commercial-licensing.md`                    | Fix the "Current distinction" table the same way. Update "Last verified". Keep the "not yet generally available" truth. |
| `docs/architecture.md`                            | Fix §"Current maturity" (4 wrong claims from §2.3). Update "Last verified". Update cross-refs that point to archived plans as if active. |
| `README.md`                                       | Fix "Command reference" + "Free vs. Pro" tables per §2.1. Update test-count badge (573 → current count). Add a clear copy-paste **local-to-CI onboarding** subsection (§4 below). Keep three-pillar framing as context. |
| `README.es.md`                                     | Mirror README.md changes in Spanish.                                                                 |
| `plans/business/launch-content/linkedin-post-en.md` | Add a dated "HISTORICAL / NOT APPROVED FOR PUBLICATION" banner at top. Fix the stale repo URL. Do NOT rewrite the body. |
| `plans/business/launch-content/linkedin-post-es.md` | Same banner, same URL fix. |
| `plans/business/launch-content/short-social.md`     | Same banner, same URL fix. |
| `plans/business/launch-content/follow-up.md`        | Same banner, same URL fix. |
| `plans/business/funnel-and-metrics.md`              | Already reconciled (top block dated 2026-07-22). Add one line confirming launch-content drafts are quarantined historical assets. |
| `plans/018-build-tooltician-ai-discoverability-business.md` | Add a dated supersession note at top pointing to Plan 058/059 as the current execution, per plan §work item 5. Do NOT edit historical body. |
| `plans/README.md`                                   | Update Plan 058 status `READY → DONE`; reconcile "Last reconciled" date. |
| `CHANGELOG.md`                                      | Add an `Unreleased` `Docs` entry: factual Free/Pro reconciliation + onboarding route + stale-asset quarantine. (Public behavior claim changed → required by changelog policy.) |

> **Pre-existing owner edit (out of Plan 058 scope, not reverted):**
> `plans/057-positioning-and-defect-reporting.md` carries an uncommitted
> working-tree edit made by the owner on 2026-07-22 (P2→P3, DEFERRED status,
> "Operating override" block) on top of HEAD `b2e6055`. It is NOT in the
> in-scope list above and was NOT modified by Plan 058. It appears in
> `git diff b2e6055` because the working tree differs from HEAD; the file was
> first committed at `9444a97` (2026-06-30). The in-file `Planned at: b8cd937`
> label is an author annotation, not the commit that created or last modified
> this file.

## 4. The local-to-CI onboarding route (must be copy-paste and truthful)

This is the single concrete entry path. Every command in it must be verified to run
exactly as written in the verification section below.

```bash
# 1. Install (or use npx — no install needed)
npm install -g geo-opt

# 2. First local audit on a single file — no network, no signup
geo-opt audit path/to/content.md

# 3. Batch audit of a content directory with a CI quality gate
geo-opt audit content/ --recursive --threshold 70

# 4. Machine-readable output for downstream tooling
geo-opt audit content/ --recursive --format json > geo-audit.json

# 5. Drop into GitHub Actions as a pre-merge quality gate
#    (see ci-templates/gitlab-ci.yml for the GitLab equivalent)
```

```yaml
# .github/workflows/geo-opt.yml
name: Content quality gate
on: [pull_request]
jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm install -g geo-opt
      - run: geo-opt audit content/ --recursive --threshold 70
```

**Honest framing:** findings are QA remediation guidance, never a ranking or citation
prediction.

## 5. Out of scope (explicitly)

- Any source-code behavior change (`src/`, `bin/`, `index.d.ts`).
- Any entitlement/licensing behavior change.
- Any price, checkout, legal-term, or support-commitment addition.
- Any external publication, social campaign, Tooltician.com change, outreach, or CTA.
- Any new product feature, telemetry, or customer-data collection.
- Rewriting the historical LinkedIn draft bodies beyond the quarantine banner + URL fix.

## 6. Verification (exactly how each piece is proven)

Each check maps 1:1 to a test in [`tests/`](tests/) or a command in this section.

### 6.1 Runtime still behaves as the new docs claim

| Check                                                                                       | Test file                                |
| ------------------------------------------------------------------------------------------ | ---------------------------------------- |
| `audit --recursive` runs without Pro key and succeeds                                      | `tests/058-entitlements.test.js`        |
| `audit --threshold <n>` runs without Pro key; exits non-zero when below                    | same                                     |
| `inject <file> <type>` runs without Pro key (dry-run)                                      | same                                     |
| `robots generate` runs without Pro key                                                    | same                                     |
| `llmstxt generate` runs without Pro key                                                   | same                                     |
| `sitemap generate` runs without Pro key                                                   | same                                     |
| `generate-all` runs without Pro key                                                       | same                                     |
| `schema <file> course` IS Pro-gated (errors, non-zero exit) without key                   | same                                     |
| `report` IS Pro-gated (errors, non-zero exit) without key                                | same                                     |
| `inject --no-branding` IS Pro-gated without key                                          | same                                     |

### 6.2 Documentation matches runtime

| Check                                                                                                       | Test file                        |
| ---------------------------------------------------------------------------------------------------------- | -------------------------------- |
| `docs/free-vs-pro.md` no longer marks Community commands as Pro ❌                                         | `tests/058-docs-claims.test.js`  |
| `docs/commercial-licensing.md` distinction table matches runtime gates                                    | same                             |
| `docs/architecture.md` "Current maturity" no longer says npm unreleased / v1 default / no technical CLI   | same                             |
| `README.md` + `README.es.md` command reference and Free/Pro tables match runtime                          | same                             |
| README test-count badge matches `npm test` count                                                           | same                             |
| No remaining "Pro ❌" in docs for commands that actually run Community-side                                | same                             |

### 6.3 Onboarding route is executable end-to-end

| Check                                                                                              | Test file                          |
| ------------------------------------------------------------------------------------------------- | ---------------------------------- |
| The exact README onboarding command sequence runs and exits 0 in a clean sandbox                  | `tests/058-onboarding-route.test.js` |
| The GitHub Actions snippet is syntactically valid YAML and references real commands              | same                               |

### 6.4 Stale campaign assets are quarantined

| Check                                                                                                  | Test file                          |
| ----------------------------------------------------------------------------------------------------- | ---------------------------------- |
| Each file in `plans/business/launch-content/` starts with a "HISTORICAL" / "NOT APPROVED" banner     | `tests/058-historical-assets.test.js` |
| None of those files still reference the stale `cortega26/GEO-skill.git` repo URL                     | same                               |
| `plans/business/funnel-and-metrics.md` notes that launch-content is quarantined historical          | same                               |

### 6.5 Governing checks

| Check                | Command                              | Expected |
| -------------------- | ------------------------------------ | -------- |
| Full repo check      | `npm run check`                      | exit 0   |
| Markdown safety      | `git diff --check`                   | exit 0   |
| First-run confirmed  | `node bin/cli.js audit tests/fixtures/sample.md --format json` | exit 0, valid JSON |
| No behavior change   | `git diff b2e6055 -- src/ bin/ index.d.ts package.json` | empty (no source changes) |

**Note on `plans/` governance:** untracked files under `plans/` are git-ignored
via `.git/info/exclude` (maintainer-local planning space, not part of the npm
package — see `docs/architecture.md`). The `git diff` check above therefore
covers only the published surface (`src/`, `bin/`, `index.d.ts`,
`package.json`); the §6.4 and §6.6 `plans/` edits to *untracked* files
(`plans/business/launch-content/*`, `plans/018-…md`,
`plans/business/funnel-and-metrics.md`) are verified by their content-assertion
tests against the working tree, not by git history. A fresh clone would not
contain those local-only edits; that is the owner's existing `plans/` design,
not a Plan 058 defect. Two `plans/` files ARE tracked and diffable against
`b2e6055`: `plans/README.md` and `plans/057-…md` (the latter carries a
pre-existing owner working-tree edit — see the note in §3).

### 6.6 Plan-record reconciliation

| Check                                                                                                   | Test file                          |
| ------------------------------------------------------------------------------------------------------ | ---------------------------------- |
| `plans/README.md` marks Plan 058 as DONE and updates "Last reconciled"                                | `tests/058-plan-records.test.js`   |
| `plans/018-…md` has a dated supersession note pointing to Plan 058/059                                | same                               |
| `CHANGELOG.md` has an `Unreleased` entry under `Docs` describing the reconciliation                  | same                               |

## 7. Stop conditions (from plan §"Stop conditions")

Halt and surface to the owner if:

- A truthful first-run route requires a missing feature or entitlement change.
- A proposed statement promises ranking, retrieval, inclusion, or citation.
- Correcting an offer claim requires choosing a price, checkout, legal term, or support commitment.
- The only proposed distribution path is founder LinkedIn or cold sales.

None of these are triggered by the current work; the route in §4 uses only already-
implemented Community commands.

## 8. Iteration / review cadence

- Consult this spec before every edit.
- Check off `todo.md` items as they complete.
- Run `npm test` (incl. the new `tests/058-*.test.js`) after each meaningful change.
- Every ~20 iterations, dispatch a fresh review sub-agent with:
  "review plans/058-work/spec.md and the current implementation for gaps" and loop on its feedback until alignment.
