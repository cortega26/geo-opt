# Plan 085: Remove remaining ranking and citation predictions from v2 wording

> **Executor instructions**: Preserve stable JSON band ids and score thresholds
> unless a separate versioning decision approves a change. Correct only claims
> that exceed what the heuristic measures.
>
> **Drift check (run first)**: `git diff --stat 888d3e7..HEAD -- src/scoring-v2.js src/renderer.js tests/scoring-v2.test.js tests/optimizer.test.js README.md README.es.md docs/architecture.md .agents/skills/geo-optimization/SKILL.md plans/README.md`

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug / docs / product-truth
- **Planned at**: commit `888d3e7`, 2026-08-02

## Why this matters

The repository explicitly says scores measure style markers and cannot predict
ranking, retrieval, or citation. Several lower readiness bands and renderer
summaries still predict citation/discovery outcomes, and the bundled skill
still calls the top band Production-Ready. These claims are materially stronger
than the model's evidence.

## Current state

- `src/scoring-v2.js:674-695` says improvements reach
  “production-ready,” gaps reduce citation likelihood, and engines are unlikely
  to cite the page.
- `src/renderer.js:397-403` says pages are optimized/reliably discovered.
- Bundled skill lines 396-401 documents “Production-Ready.”
- `docs/architecture.md:256-265` is normative: no live ranking/citation or
  future-engine prediction.
- The `production-ready` band id is described as stable at
  `src/scoring-v2.js:665-671`; do not rename it here.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| V2 tests | `node --test tests/scoring-v2.test.js tests/optimizer.test.js` | pass |
| Claim scan | `rg -n "production-ready|reliably discovered|unlikely to cite|likelihood of being cited|well-optimized for AI" src README*.md docs .agents/skills/geo-optimization/SKILL.md` | only historical/explicitly disclaimed matches |
| Full | `npm run check` | exit 0 |

## Scope

**In scope**: v2 human-readable labels/descriptions, renderer summaries, EN/ES
public docs and bundled skill where affected, tests, `CHANGELOG.md`,
`plans/README.md`.

**Out of scope**: band ids, thresholds, scores, findings, model version, or
claims in archived plans/changelog history.

## Git workflow

- Branch: `advisor/085-truthful-v2-wording`
- Commit example: `fix(copy): remove predictive v2 claims`.

## Steps

### Step 1: Pin non-predictive wording invariants

Add tests that all band descriptions and plain-English summaries describe
observed structure/attribution/citation hygiene and do not promise ranking,
discovery, readiness, or citation outcomes. Keep stable ids asserted.

**Verify**: focused tests fail on current strings without changing scores.

### Step 2: Rewrite runtime copy

Use neutral language such as strong/partial/weak style markers and specific
observed gaps. Include a concise disclaimer where needed; avoid repeating it in
every line. Do not alter report shape or thresholds.

**Verify**: snapshot/string tests show identical scores/band ids and corrected
descriptions.

### Step 3: Synchronize public documentation

Update README EN/ES, architecture if any contradiction remains, and bundled
skill profile/readiness guidance. Preserve historical records untouched. Add an
Unreleased Fixed/Docs bullet.

**Verify**: claim scan, full check, and diff check pass.

## Test plan

- All four readiness bands, high/mid/low renderer branches, stable ids, and
  corpus score equality before/after.
- Literal claim scan scoped away from history.

## Done criteria

- [ ] Runtime/public current wording makes no ranking/citation/discovery prediction.
- [ ] Stable ids, thresholds, and all fixture scores are unchanged.
- [ ] EN/ES/skill wording is consistent with architecture limitations.
- [ ] Full checks pass; scoped files only.

## STOP conditions

- Correct wording requires renaming a stable JSON id or changing a score.
- A source claim has external evidence the architecture intentionally adopted;
  request a product/evidence decision.
- Search matches occur only in immutable history.

## Maintenance notes

Review new scoring copy against the AGENTS.md truthfulness warning. Heuristic
scores can describe observed markers and remediation, never engine outcomes.
