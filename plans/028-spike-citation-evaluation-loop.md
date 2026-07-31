# Plan 028: Time-box an experimental citation-evaluation spike

> **Executor instructions**: This is a research spike, not a production feature.
> Produce evidence and a GO/STOP recommendation. Do not merge experimental
> metrics into the default audit.
>
> **Drift check (run first)**:
> `git diff --stat c6a604a..HEAD -- experiments docs tests/fixtures plans README.md CHANGELOG.md`

## Status

- **Priority**: P3
- **Horizon**: largo plazo / investigación, 6–12 meses
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans 022 and 027
- **Category**: direction
- **Planned at**: commit `c6a604a`, 2026-06-26
- **Status**: DEFERRED — research gate, stable v2 and approved budget required

## Reconciliation — 2026-06-27

The spike remains conceptually valid, but its dependencies are now a stable v2
contract (T0), a falsifiable question, an approved time/cost budget and a named
decision owner. Provider adapters from plan 027 are not a mandatory dependency.
Do not add it to production execution order.

## Why this matters

AgentGEO, MAGEO, GEO-SFE, and “What Gets Cited” suggest that controlled,
diagnostic evaluation can outperform blanket rewriting. They are recent
preprints and controlled testbeds, not proof that a local score predicts live
consumer engines. A bounded reproducibility spike can determine whether any
method belongs in `geo-opt` without turning research claims into product claims.

## Current state

There is no evaluation harness, query set, paired comparison, edit-fidelity
check, or engine-specific benchmark. Relevant primary preprints:

- AgentGEO: <https://arxiv.org/abs/2603.09296>
- GEO-SFE: <https://arxiv.org/abs/2603.29979>
- MAGEO: <https://arxiv.org/abs/2604.19516>
- What Gets Cited: <https://arxiv.org/abs/2605.25517>

## Commands you will need

| Purpose     | Command                 | Expected on success            |
| ----------- | ----------------------- | ------------------------------ |
| Baseline    | `npm run check`         | exit 0                         |
| Spike tests | documented by the spike | deterministic local tests pass |
| Whitespace  | `git diff --check`      | no output                      |

## Scope

**In scope**: `experiments/citation-eval/`, a methodology document, synthetic
fixtures, reproducibility scripts, and a decision memo.

**Out of scope**: production dependencies, automated content rewriting,
multi-agent orchestration, paid API spend without approval, scraping, or
publishing benchmark claims.

## Git workflow

- Branch: `advisor/028-citation-eval-spike`
- Use `docs:` and `test:` commits; do not mix the spike with runtime code.
- Do not push or open a PR unless the operator explicitly requests it.

## Steps

### Step 1: Define falsifiable questions and budget

Specify which claims are tested: section structure, evidence proximity,
relevance, source order sensitivity, and fidelity after edits. Cap time, model
calls, and spend. Use synthetic or redistributable fixtures only.

**Verify**: methodology lists hypotheses, null outcomes, budget, seeds, models,
and stopping rules before any run.

### Step 2: Reproduce a minimal paired protocol

Build a local deterministic harness first, then optionally one approved model
adapter. Counterbalance source order and change one factor at a time. Record raw
inputs/outputs where licensing and privacy permit.

**Verify**: reruns with the same seed reproduce local results.

### Step 3: Measure fidelity and failure modes

Track not just selection/citation but whether edits preserve facts,
attribution, and user intent. Classify failures rather than applying a generic
rewrite.

**Verify**: at least one negative/control case can fail without being “fixed”
by adding arbitrary statistics or quotes.

### Step 4: Write a GO/ADAPT/STOP decision

Recommend production work only if results are repeatable, incremental over
plan-022 observations, affordable, and explainable. Otherwise archive the spike
with a STOP decision.

**Verify**: no runtime or package manifest changes exist.

## Test plan

- Deterministic local harness.
- Source-order counterbalancing.
- One-factor mutations.
- Fidelity regression cases.
- Cost and provenance ledger.

## Done criteria

- [ ] The spike is reproducible and time-boxed.
- [ ] Results distinguish controlled evidence from live-engine inference.
- [ ] A written GO/ADAPT/STOP decision exists.
- [ ] Production code and dependencies are untouched.

## STOP conditions

- Reproduction needs undisclosed data or unapproved paid access.
- Results are dominated by nondeterminism or source order.
- The method cannot detect factual degradation.

## Maintenance notes

Archive raw methodology even on STOP; negative evidence prevents future teams
from repeatedly chasing the same attractive but unsupported feature.
