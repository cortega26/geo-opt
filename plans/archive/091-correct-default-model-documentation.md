# Plan 091: Make all normative documentation name v2 as the default model

> **Executor instructions**: Runtime and current CLI help are authoritative.
> Correct current normative prose only; preserve historical statements in
> archived plans/changelog with dated context.
>
> **Drift check (run first)**: `git diff --stat 888d3e7..HEAD -- docs/documentation-governance.md docs/architecture.md README.md README.es.md .agents/skills/geo-optimization/SKILL.md tests/058-docs-claims.test.js tests/ci-assets.test.js plans/README.md`

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/085-remove-v2-predictive-wording.md
- **Category**: docs
- **Planned at**: commit `0006bb1`, 2026-08-03 (reconciled)

## Why this matters

Runtime, README, action, and the opening architecture section say v2 is the
default. Two normative architecture/governance lines still say v1/default and
that a future switch is gated. Maintainers following those sources can make the
wrong compatibility or migration decision.

## Current state

- `docs/documentation-governance.md:66-67` says v1 remains default until a gate.
- `docs/architecture.md:20-21` correctly says v2 is default.
- `docs/architecture.md:43` labels v1/default ("Legacy heuristic scoring
  (v1/default)").
- `docs/architecture.md:279-280` describes a future v1-to-v2 switch even though
  it already happened.
- README action input and CI assets default to v2; Python remains v1-only by its
  documented capability tier.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Claim tests | `node --test tests/058-docs-claims.test.js tests/ci-assets.test.js` | pass |
| Current-doc scan | `rg -n "v1/default|v1 remains the default|default switch from v1" docs README*.md .agents/skills/geo-optimization/SKILL.md` | no current contradictory matches |
| Full | `npm run check` | exit 0 |
| Diff | `git diff --check` | exit 0 |

## Scope

**In scope**: normative governance/architecture docs, README EN/ES and bundled
skill only if a current contradiction is found, documentation contract tests,
`plans/README.md`.

**Out of scope**: runtime defaults, Python's intentional v1-only capability,
model stability/experimental labels, archived plans, or historical changelog.

## Git workflow

- Branch: `advisor/091-default-model-docs`
- Commit example: `docs(model): make v2 default claims consistent`.

## Steps

### Step 1: Add a current-doc invariant

Extend docs-claim tests to assert Node CLI/public docs name v2 as default and
that Python examples do not claim v2 support. Scope searches to current sources
so history remains intact.

**Verify**: claim test fails on the two current contradictions.

### Step 2: Correct governance and architecture

Rewrite the invariant, responsibility table, and recalibration policy in past/
current terms: v2 is default; v1 is legacy/deprecated but selectable; a future
default/model change requires an explicit release decision. Keep v2
experimental characterization language and Python boundary.

**Verify**: current-doc scan returns no contradictory matches.

### Step 3: Reconcile index and run gates

Update this plan's status only; a docs-only correction does not need a
changelog entry unless repository policy/test requires one.

**Verify**: claim tests, `npm run check`, and diff check pass.

## Test plan

- Positive v2-default claim in architecture/governance/README.
- Negative v1-default claim scan in current docs.
- Python v1-only and v2 experimental/characterized claims remain intact.

## Done criteria

- [ ] Every current normative Node document names v2 as default.
- [ ] V1 is consistently legacy/deprecated but available.
- [ ] Python is not falsely documented as v2-capable.
- [ ] Historical records are untouched; full checks pass.

## STOP conditions

- Runtime/CLI no longer defaults to v2 at execution time.
- A current document intentionally defines a different surface's default; label
  that surface explicitly instead of globally replacing text.
- Fixing history would be required; add a current supersession note instead.

## Maintenance notes

Model default, model stability, contract stability, and Python capability are
separate claims. Future migrations need one invariant test per surface.
