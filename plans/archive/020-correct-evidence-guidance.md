# Plan 020: Correct prescriptive GEO guidance before adding new features

> **Executor instructions**: This is a documentation and product-contract
> correction. Do not change scoring behavior in this plan. Update the status
> row in `plans/README.md` when complete.
>
> **Drift check (run first)**:
> `git diff --stat c6a604a..HEAD -- README.md .agents/skills/geo-optimization/SKILL.md docs/architecture.md package.json CHANGELOG.md`

## Status

- **Priority**: P0
- **Horizon**: inmediato, 0–1 semana
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: docs
- **Planned at**: commit `c6a604a`, 2026-06-26

## Why this matters

The bundled skill currently instructs users to add one or two quotes, keep an
opening paragraph at 40–90 words, and hold selected pronouns below 2% as if
these were generally valid optimization rules. The current evidence supports
these as project heuristics or hypotheses, not universal platform
requirements. Leaving the prose unchanged invites users to fabricate or
overfit content even though the README correctly calls the score uncalibrated.

## Current state

- `.agents/skills/geo-optimization/SKILL.md:62-67` presents five equally
  weighted dimensions without evidence levels.
- `.agents/skills/geo-optimization/SKILL.md:78-116` uses imperative language
  for 40–90 words, statistics, one to two quotes, reference sections, and a 2%
  pronoun limit.
- Google now explicitly says there is no ideal page length, no need to rewrite
  for AI, no special schema, and no requirement for tiny chunks:
  <https://developers.google.com/search/docs/fundamentals/ai-optimization-guide>.
- The original GEO paper is a controlled benchmark, not calibration for live
  engines: <https://arxiv.org/abs/2311.09735>.
- “What Gets Cited” found relevance and position stronger than formatting-only
  changes in its controlled setup: <https://arxiv.org/abs/2605.25517>.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Format | `npm run format:check` | exit 0 |
| Full check | `npm run check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

**In scope**: files in the drift check.

**Out of scope**: changing scores, CLI JSON, schema generation, or crawler
behavior.

## Git workflow

- Branch: `advisor/020-correct-evidence-guidance`
- Use a commit such as `docs: correct GEO evidence guidance`.
- Do not push or open a PR unless the operator explicitly requests it.

## Steps

### Step 1: Introduce an evidence vocabulary

Define `strong`, `probable`, `experimental`, and `project heuristic` in the
README and skill. Explain that the label describes support for the
recommendation, not a guaranteed outcome.

**Verify**: both documents define all four labels consistently.

### Step 2: Reframe every imperative heuristic

Change fixed word counts, quote counts, statistics counts, pronoun density, and
table/list advice into observable heuristics with audience/context checks.
Explicitly forbid invented evidence, fake authorship, gratuitous quotations,
and restructuring solely to gain points.

**Verify**: literal searches for “Add 1 to 2 direct”, “less than **2%”, and
“between **40 and 90 words**” return no unconditional instruction.

### Step 3: Correct platform-specific positioning

State that `llms.txt` is an inference-time community proposal ignored by Google
Search, structured data is useful for supported Search features but not a
special GEO mechanism, and MCP is agent integration rather than web ranking.
Mention the June 2026 removal of Google's FAQ rich result without implying
Schema.org FAQ markup is itself invalid.

**Verify**: all claims link to primary or official sources and `npm run check`
passes.

### Step 4: Record the change

Add a concise `Docs` or `Changed` bullet under `CHANGELOG.md` Unreleased.

**Verify**: `npm run changelog:check` exits 0.

## Test plan

No new runtime tests. Use documentation assertions via `rg` plus the full
repository check.

## Done criteria

- [ ] No heuristic is presented as a live-engine requirement.
- [ ] Platform-specific claims have primary/official links.
- [ ] The score remains documented as legacy and uncalibrated.
- [ ] `npm run check` and `git diff --check` pass.

## STOP conditions

- A wording change would alter runtime output or CLI behavior.
- A claim cannot be supported by a primary source; omit or downgrade it.

## Maintenance notes

This is an immediate truthfulness patch. Plan 022 changes the underlying model;
do not wait for that larger migration before correcting user guidance.
