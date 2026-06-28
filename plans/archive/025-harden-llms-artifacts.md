# Plan 025: Make llms.txt artifacts spec-correct, curated, and size-aware

> **Executor instructions**: Treat `llms.txt` as an optional community proposal,
> not a search ranking feature. Preserve human review and deterministic output.
>
> **Drift check (run first)**:
> `git diff --stat c6a604a..HEAD -- src/llms-txt.js src/text.js src/index.js bin/cli.js index.d.ts tests/optimizer.test.js .agents/skills/geo-optimization/scripts/geo_optimizer.py .agents/skills/geo-optimization/scripts/test_optimizer.py README.md .agents/skills/geo-optimization/SKILL.md CHANGELOG.md`

## Status

- **Priority**: P2
- **Horizon**: corto plazo, 4–8 semanas
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans 020, 021, 030, 031 and 034
- **Category**: correctness
- **Planned at**: commit `c6a604a`, 2026-06-26
- **Status**: DONE — completed 2026-06-27, branch advisor/025-harden-llms-artifacts

## Reconciliation — 2026-06-27

The validation, curation and size-budget problems remain relevant, but this
community-proposal surface does not block T0 or business discovery. Refresh the
plan after the common engine/API/Python decisions. Execute after plan 024 or
direct user evidence that `llms.txt` is a priority.

## Why this matters

The current audit reports a missing blockquote and H2 section as issues even
though the proposal requires only H1. The generator decides “Optional” from the
legacy GEO score, which can demote excellent API pages for lacking quotes.
`llms-full.txt` strips Markdown structure, code blocks, and tables even though
those are often the most useful parts of technical documentation, and it has no
size budget. These choices reduce interoperability while overstating spec
requirements.

## Current state

- `src/llms-txt.js:97-152` uses `optionalThreshold=50` and page score to curate.
- `src/llms-txt.js:163-190` converts full content to plain text with no byte or
  token budget.
- `src/llms-txt.js:239-255` treats blockquote/H2 absence as an issue.
- The proposal says only H1 is required and describes `Optional` as a curatorial
  choice: <https://llmstxt.org/>.
- Google says it ignores `llms.txt` for Search:
  <https://developers.google.com/search/docs/fundamentals/ai-optimization-guide>.

## Commands you will need

| Purpose    | Command               | Expected on success |
| ---------- | --------------------- | ------------------- |
| JS tests   | `npm test`            | all pass            |
| Python     | `npm run test:python` | `OK`                |
| Full check | `npm run check`       | exit 0              |

## Scope

**In scope**: files in the drift check.

**Out of scope**: claiming universal consumer support, fetching arbitrary remote
pages, or automatically publishing artifacts.

## Git workflow

- Branch: `advisor/025-harden-llms-artifacts`
- Commit validation, curation, full-context generation, and docs separately.
- Do not push or open a PR unless the operator explicitly requests it.

## Steps

### Step 1: Correct proposal validation

Make H1 the sole hard requirement. Report missing summary, descriptions, or
sections as recommendations/notes. Parse the optional pre-H2 details area and
validate link syntax without inventing constraints absent from the proposal.

**Verify**: proposal-minimal H1-only content is valid with notes, not invalid.

### Step 2: Decouple curation from score

Replace `optionalThreshold` behavior with explicit entry priority or include
rules. Keep score-based curation only as a deprecated opt-in flag with a warning.
Default ordering must be deterministic and user-reviewable.

**Verify**: low legacy score does not automatically move a page to Optional.

### Step 3: Preserve useful Markdown in full-context artifacts

Strip unsafe/unhelpful frontmatter and HTML chrome, but retain headings, code
blocks, tables, lists, and link provenance. Detect duplicate headings and
rewrite hierarchy deterministically. Add configurable byte/token estimates,
per-page limits, and split-manifest output when the corpus exceeds budget.

**Verify**: code/table fixtures survive generation and oversized corpora produce
deterministic warnings or segments.

### Step 4: Add drift and safety checks

Audit broken local targets, duplicate URLs, non-http schemes, leaked private
paths, and stale generated artifacts via content hashes or a manifest. Do not
scan ignored/private files by default.

**Verify**: unsafe schemes and ignored/private fixtures are excluded with
findings.

### Step 5: Update capability contracts and docs

Apply plan 034's Python tier, update types, CLI help, README, skill and
changelog. Mirror behavior only when the capability is committed as shared.
Label the whole module experimental/interoperability-oriented.

**Verify**: `npm run check` exits 0.

## Test plan

- Minimal and full proposal formats.
- Explicit Optional curation.
- Markdown/code/table preservation.
- Frontmatter removal and private-path exclusion.
- Size segmentation and deterministic output.
- Cross-runtime tests only for behavior committed as equivalent or compatible.

## Done criteria

- [ ] Validation matches the proposal's required/optional distinction.
- [ ] Legacy content score does not curate by default.
- [ ] Full artifacts retain technical structure and enforce budgets.
- [ ] No Google Search benefit is implied.

## STOP conditions

- Preserving content could expose ignored/private files; fail closed.
- A “token count” would imply tokenizer precision without a pinned tokenizer;
  use a documented estimate instead.

## Maintenance notes

Track proposal changes separately from consumer-specific behavior. A consumer
adapter may impose tighter limits, but must not redefine the base proposal.
