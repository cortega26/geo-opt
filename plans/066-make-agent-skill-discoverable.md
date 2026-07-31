# Plan 066: Make the bundled agent skill discoverable

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 296b60f..HEAD -- README.md README.es.md docs/ .agents/skills/geo-optimization/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (independent of plans 065 and 067)
- **Category**: docs / direction
- **Planned at**: commit `296b60f`, 2026-07-31
- **Issue**: (none)
- **Executed**: APPROVED 2026-07-31 (executor worktree, branch
  `docs/066-agent-skill-discoverability`, commits `be2092b` + `d4aa4e9`;
  all done criteria re-verified). Dispatch corrections applied: es
  headings are translated, so parity checks compare heading LEVELS, not
  strings. Review revision 1 (2026-07-31) applied: usage hint now states
  the checkout assumption (the skill's Node CLI path is checkout-only).
  Merge is the maintainer's decision.

## Why this matters

`geo-opt` ships a 450-line agent skill (`.agents/skills/geo-optimization/`)
that lets an AI coding agent audit and optimize web content with the tool —
the native channel for the exact audience of the 90-day validation
(Plan 059): repository and docs maintainers who work through agents. The
skill is fully versioned and tested (its Python port runs a conformance
suite in CI), yet it is invisible publicly:

- `README.md` and `README.es.md` contain zero mentions of a skill.
- The npm package does not ship it: `package.json` `files` is a whitelist
  (`dist/`, `scripts/`, `index.d.ts`, `README.md`, `CHANGELOG.md`, the
  license files, `docs/`) that does not include `.agents/`.
- `docs/architecture.md` mentions only the Python implementation's location
  (line 53–54), not the skill as an entry point.

This plan makes the skill discoverable for people who clone the repository
(README section in both languages + an architecture-doc pointer), with
claims kept precisely true: the skill lives in the repository checkout
today and is not part of the npm package. Shipping it inside the npm
package is deliberately out of scope (see the "Current state" note on
paths below) — that is a separate packaging decision, not a text edit.

## Current state

Files and the facts the executor needs:

- `.agents/skills/geo-optimization/` — the skill, tracked in git (the
  `.gitignore` ignores `.agents/skills/*` but explicitly un-ignores this
  directory). Contents:
  - `SKILL.md` (450 lines) — frontmatter `name: geo-optimization` plus a
    description covering the three pillars (GEO, Schema.org JSON-LD,
    technical SEO) "without promising ranking or citation outcomes".
  - `scripts/geo_optimizer.py` + `scripts/test_optimizer.py` + `scripts/requirements.txt`
    (`beautifulsoup4>=4.12`, `mistune>=3.0`) — Python compatibility port.
  - `examples/example_blog_before.md` / `example_blog_after.md`,
    `resources/schema_templates/{article,faq,product}.json`.
  - The skill's own docs say it uses the repository-source CLI
    (`node bin/cli.js`) and the Python port (`python3 scripts/geo_optimizer.py`);
    both paths are repo-layout paths that do **not** exist in the published
    npm package (`dist/bin/cli.js` is the packaged bin). That is why the
    skill cannot simply be added to `package.json` `files` without
    reworking the skill's path references.
- `README.md` — 486 lines; sections (per its table of contents): …
  `Quick start` … `Command reference` … `Evidence vocabulary` … `Free vs.
  Pro` … `Configuration` … `JavaScript library` … `Privacy guarantees` …
  `Development` … `Research` … `License`. The new section goes after
  "JavaScript library" and before "Privacy guarantees" (or adjacent if the
  TOC has drifted — keep the TOC in sync either way).
- `README.es.md` — the Spanish mirror; the repo keeps heading parity
  between the two READMEs (verified 2026-07-31).
- `docs/architecture.md` — lines 50–56 describe the Python implementation
  location; `docs/documentation-governance.md` governs doc changes: claims
  must match the capability matrix and runtime behavior; docs do not
  outrank tests.
- Changelog policy (`scripts/check-changelog.js`): `README.md` and
  `docs/` are **not** in the code-path patterns, so a docs-only change
  needs no `CHANGELOG.md` bullet. Do not add one.

Repo conventions to match:

- README style: terse `##`/`###` sections, `**bold**` lead-ins, code fences
  with bash examples, no marketing promises about ranking or citations
  (see the "Why your content needs GEO" section for the calibrated tone).
- The Spanish README is a translation, not a summary — mirror every added
  heading and paragraph.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Full quality gate | `npm run check` | exit 0 |
| Changelog policy | `npm run changelog:check` | passes (docs-only change) |
| Heading parity en/es | `diff <(grep -oP '^#{1,3}(?= )' README.md) <(grep -oP '^#{1,3}(?= )' README.es.md)` — note: the es README TRANSLATES its headings (`Quick start` → `Inicio rápido`), so compare the heading-LEVEL sequence, not the strings | no output (structural parity) |

## Scope

**In scope** (the only files you should modify):
- `README.md` — new "Agent skill" section + Table of contents entry
- `README.es.md` — same section, translated
- `docs/architecture.md` — extend the existing `.agents/skills/geo-optimization` mention (line ~53) with the SKILL.md entry point and the repo-only packaging note

**Out of scope** (do NOT touch, even though they look related):
- `package.json` `files` — adding `.agents/` to the published package is
  NOT part of this plan (skill paths are repo-layout-relative; see
  "Current state"). The README wording must not imply the skill ships via
  npm.
- `skills-lock.json` and any skill-registry tooling (autoskills/skills.sh)
  — separate, owner-managed distribution channel.
- `.agents/skills/geo-optimization/SKILL.md` content itself — no edits to
  the skill in this plan; the goal is only to point at it.
- `CHANGELOG.md` — no bullet required for docs-only changes.

## Git workflow

- Branch: `docs/066-agent-skill-discoverability` (repo history uses
  conventional commit prefixes such as `docs:`, `chore:`).
- Commit once per logical unit (README en, README es, architecture doc),
  e.g. `docs: document the bundled geo-optimization agent skill`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add the "Agent skill" section to `README.md`

1. Add a Table of contents line under `- [JavaScript library](#javascript-library)`,
   i.e. `- [Agent skill](#agent-skill)`.
2. Insert a `## Agent skill` section after the "JavaScript library"
   section and before "Privacy guarantees". Content, following the repo's
   calibrated tone (no ranking/citation promises):

   - What it is: a bundled skill for AI coding agents that audits and
     optimizes content with `geo-opt` — the same three pillars, driven as a
     workflow (audit → analyze → apply → inject schema → verify).
   - Where it lives: `.agents/skills/geo-optimization/` in the repository
     checkout (link the path), with `SKILL.md` as the entry point.
   - Implementation note, mirroring SKILL.md's own words: canonical Node
     CLI + a capability-scoped Python port; the Python port does not
     support the v2 model or the technical HTML audit; see
     `docs/architecture.md` for the capability matrix.
   - A one-line note that the skill ships with the repository checkout and
     is not part of the npm package (keep this claim exactly true).
   - One short usage hint: copy the skill directory into your agent's
     skills path (`.claude/skills/` for Claude Code, or your agent's
     equivalent) and point the agent at `SKILL.md`. Keep it to two or
     three lines — no elaborate installation guide.
   - (Review revision 1, 2026-07-31) The hint must add one sentence: the
     skill's commands assume a `geo-opt` repository checkout (`node
     bin/cli.js` is the canonical CLI path — the skill directory contains
     no `bin/`); only the Python port's scripts work from the copied
     directory. Without this, a user copying just the skill gets an agent
     whose Node CLI commands cannot resolve.

**Verify**:
- `grep -n "## Agent skill" README.md` → found
- `grep -n "Agent skill" README.md` → the TOC line and the section heading both present
- `grep -c "ranking or citation\|ranking, retrieval, or citation" README.md` → unchanged count (no new promise wording added; compare with the count before your edit)
- `npm run changelog:check` → passes without touching CHANGELOG.md

### Step 2: Mirror the section in `README.es.md`

Translate the new section (including the TOC line) into neutral Spanish,
matching the existing translation's tone (the es README uses "tú"/neutral
forms, e.g. "audita", "genera").

**Verify**:
- `grep -n "## Agent skill\|## Habilidad para agentes\|## Skill para agentes" README.es.md` → the section exists (heading text may be translated; keep the anchor consistent)
- TOC line present in README.es.md as well

### Step 3: Extend `docs/architecture.md`

At the existing mention of `.agents/skills/geo-optimization/` (around
line 53, where the Python compatibility implementation is described), add
one or two sentences: the directory is the bundled agent skill
(`SKILL.md` is the entry point), backed by the canonical Node CLI and the
Python port, and it is distributed with the repository checkout only —
not in the npm package. Keep it consistent with the capability matrix
section of the same file (Python v2/technical HTML are Node-only).

**Verify**:
- `grep -n "SKILL.md" docs/architecture.md` → found
- `grep -n "not in the npm package\|repository checkout" docs/architecture.md` → the packaging claim is present

### Step 4: Full gate

**Verify**: `npm run check` → exit 0. Also run the heading-parity check
from "Commands you will need" and confirm only the two newly added
headings appear in the diff (the es heading is TRANSLATED — `## Agent
skill` / `## Habilidad para agentes`; parity is structural: same
heading-level sequence, one new `##` per README).

## Test plan

- No new automated tests. The change is documentation; the repo's doc
  governance (capability matrix, `npm run check`) is the verification.
- Regression coverage is manual and spelled out in the verification
  commands above: section present, TOC synced, no new promises, es mirror
  in parity, changelog policy unaffected.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -n "Agent skill" README.md` and `grep -n "Habilidad para agentes" README.es.md` → both have the TOC line and the section heading (es heading is translated, per the es README convention)
- [ ] `grep -n "SKILL.md" docs/architecture.md` → found, with the repo-only packaging claim
- [ ] The README section says the skill is in the repository checkout and NOT in the npm package (exact claim, no overreach)
- [ ] No changes to `package.json`, `.agents/skills/geo-optimization/`, or `CHANGELOG.md` (`git status`)
- [ ] `npm run check` exits 0
- [ ] `npm run changelog:check` passes
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row for 066 updated

## STOP conditions

Stop and report back (do not improvise) if:

- `.agents/skills/geo-optimization/SKILL.md` no longer exists or its
  structure changed materially (the section you describe would be wrong).
- The skill was meanwhile added to the npm package `files` (the packaging
  note would be a false claim — report for a wording decision).
- The README structure drifted so the anchor/TOC placement differs
  materially from "Current state".
- A step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

- If the skill is ever shipped in the npm package (after its
  repo-layout-relative paths are reworked for the package layout), the
  README "repository checkout only" sentence and the architecture note
  must be updated in the same change.
- The owner's separate skill-registry distribution (skills.sh submit step)
  is independent of this plan; this plan only creates the in-repo
  discoverability surface.
- The Python port scope (v2/technical are Node-only) is a documented
  capability boundary — any future parity work interacts with the wording
  added here.
