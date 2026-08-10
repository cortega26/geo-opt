# Plan 084: Align Python artifact output with its documented compatibility tier

> **Executor instructions**: Node is canonical. Align only capabilities the
> matrix says are equivalent/compatible; document any intentionally retained
> divergence. Update the index when complete.
>
> **Drift check (run first)**: `git diff --stat 888d3e7..HEAD -- .agents/skills/geo-optimization/scripts/geo_optimizer.py .agents/skills/geo-optimization/scripts/test_optimizer.py tests/conformance.test.js src/llms-txt.js src/schema.js docs/architecture.md .agents/skills/geo-optimization/SKILL.md plans/README.md`

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/083-close-symlink-write-escapes.md
- **Category**: bug / docs
- **Planned at**: commit `0006bb1`, 2026-08-03 (reconciled)

## Why this matters

The capability matrix says schema/llms artifact outcomes are compatible and
claims no divergence in `llms.txt` content. Python nevertheless uses a
different H1-less schema title, defaults low-score pages into Optional, and
interpolates raw titles/descriptions into Markdown links. Either align these
observable outputs with canonical Node behavior or explicitly narrow the claim.

## Current state

- Python metadata falls back to filename at `geo_optimizer.py:718-727`, but
  schema generation falls back to `"Untitled Document"` at line 2024.
- Python `generate_llms_txt` defaults `optional_threshold=50` and interpolates
  raw values at lines 753-788.
- Node disables score-based Optional placement unless explicitly requested and
  escapes link text (`src/llms-txt.js:220-240,260-297`).
- `docs/architecture.md:128-142` says no known divergence affects schema,
  robots, or llms content.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Python | `python3 .agents/skills/geo-optimization/scripts/test_optimizer.py` | all pass |
| Conformance | `npm run test:conformance` | 26+ tests pass |
| Node llms | `node --test tests/llms-txt.test.js` | pass |
| Full | `npm run check` | exit 0 |

## Scope

**In scope**: Python artifact functions/CLI/tests, cross-runtime conformance,
matrix/skill docs, `CHANGELOG.md`, `plans/README.md`.

**Out of scope**: adding Python v2/technical support, requiring byte-identical
parser internals, or changing canonical Node outputs.

## Git workflow

- Branch: `advisor/084-python-artifact-contracts`
- Commit example: `fix(python): align compatible artifact outputs`.

## Steps

### Step 1: Add cross-runtime artifact fixtures

Cover H1-less Markdown/HTML, low-score entries with no explicit optional flag,
explicit optional/threshold behavior, and hostile title/description/section
text. Compare semantic output and safety invariants, not irrelevant whitespace.

**Verify**: new tests expose the current title, Optional, and escaping drift.

### Step 2: Reuse Python metadata and escape helpers

Have Python schema generation call `extract_page_metadata` (or the same title
helper) so filename fallback is consistent. Add a Markdown link-text escaping
helper matching Node's backslash/bracket/parenthesis behavior and use it in
llms and llms-full headings/descriptions/sections.

**Verify**: Python and conformance tests pass for H1-less/hostile fixtures.

### Step 3: Align Optional semantics

Disable score-based demotion when no threshold is supplied. Preserve explicit
opt-in compatibility if Python exposes it, including deprecation messaging
consistent with Node. Do not infer `optional` from score by default.

**Verify**: low-score page remains in its normal section by default; explicit
opt-in moves it to Optional.

### Step 4: Reconcile matrix and release note

Document any remaining compatible-tier differences precisely. Update bundled
skill only where its claims/examples change. Add an Unreleased Fixed bullet.

**Verify**: Python, conformance, full check, and diff check pass.

## Test plan

- H1-less schema title; HTML H1; filename fallback; hostile Markdown link text;
  default low score; explicit optional threshold; llms-full heading safety.

## Done criteria

- [ ] Python artifact behavior matches canonical Node for documented outcomes.
- [ ] Hostile titles cannot inject links in Python outputs.
- [ ] Remaining divergences are explicitly present in the matrix.
- [ ] Python/conformance/full gates pass.

## STOP conditions

- Alignment would require adding a Node-only capability to Python.
- Node behavior itself is unsafe or undocumented; stop and report the canonical
  issue rather than copying it.
- A byte-for-byte test would encode parser/formatting differences the matrix
  intentionally permits.

## Maintenance notes

This is not a mandate for full parity. Future Node artifact changes require an
explicit matrix decision and compatible-tier conformance update.
