# Plan 021: Add a versioned finding contract and evidence registry

> **State: DONE.** The JavaScript and Python implementations emit the same
> versioned finding contract, verified against a shared fixture.

> **Executor instructions**: Preserve the existing score and report fields.
> Add the new contract additively so current consumers continue to work.
>
> **Drift check (run first)**:
> `git diff --stat c6a604a..HEAD -- src/scoring.js src/batch.js src/config.js src/index.js bin/cli.js index.d.ts tests/optimizer.test.js .agents/skills/geo-optimization/scripts/geo_optimizer.py .agents/skills/geo-optimization/scripts/test_optimizer.py docs/architecture.md README.md CHANGELOG.md`

## Status

- **Priority**: P1
- **Horizon**: corto plazo, 2–4 semanas
- **Effort**: M
- **Risk**: MED
- **Depends on**: plan 020
- **Category**: tech-debt
- **Planned at**: commit `c6a604a`, 2026-06-26

## Why this matters

The current report exposes scores and prose recommendations, but not stable
rule IDs, evidence levels, applicability, remediation risk, or the source and
date behind a rule. Every new module would otherwise invent its own output
shape. A versioned finding contract is the foundation for maintainable rules,
engine adapters, CI suppression, reporting, and honest evidence updates.

## Current state

`src/scoring.js:380-390` returns:

```javascript
{
  file,
  total_score,
  breakdown: { structure, statistics, quotations, citations, clarity },
  recommendations
}
```

`index.d.ts:119-130` hard-codes those five dimensions. There is no
`ruleId`, severity, evidence label, engine scope, source URL, verification date,
or model version. `aggregateReport()` groups free-form recommendation strings,
which makes wording changes look like new findings.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| JS tests | `npm test` | all pass |
| Python parity | `npm run test:python` | `OK` |
| Full check | `npm run check` | exit 0 |

## Scope

**In scope**: files in the drift check plus new `src/evidence.js`,
`src/findings.js`, and focused tests.

**Out of scope**: changing score weights, remote requests, or implementing new
technical checks.

## Git workflow

- Branch: `advisor/021-version-findings`
- Use conventional commits (`feat:`, `test:`, `docs:`) by logical unit.
- Do not push or open a PR unless the operator explicitly requests it.

## Target contract

Each finding must include stable `ruleId`, category, severity, status
(`pass|warn|fail|not_applicable`), message, evidence label
(`strong|probable|experimental|heuristic`), applicability (`common` or engine
IDs), source references, observed facts, and remediation. Reports must include
`reportVersion`, `modelVersion`, and `generatedAt`. Evidence registry entries
must include title, URL, source type, and `lastVerified`.

## Steps

### Step 1: Define and validate the contract

Create pure constructors/validators and TypeScript declarations. Use stable
namespaced IDs such as `content.answer_first` and `crawler.openai.search`.
Unknown fields may be preserved, but required fields must fail tests.

**Verify**: unit tests cover valid, invalid, and not-applicable findings.

### Step 2: Map legacy scoring observations into findings

Emit additive `findings` alongside the existing breakdown. Do not change any
score or recommendation text yet. Aggregate by `ruleId`, not prose, while
retaining old aggregate keys for compatibility.

**Verify**: snapshot-like contract tests show identical legacy scores and new
stable finding IDs.

### Step 3: Add evidence registry metadata

Seed only sources required by current rules, prioritizing official docs and
the KDD 2024 paper. A rule may cite multiple sources. Add a maintenance check
that rejects missing URLs/dates and optionally warns when verification is over
180 days old.

**Verify**: registry validation test passes and intentionally stale fixture
produces a warning.

### Step 4: Expose the contract

Update JSON output, public exports, types, architecture docs, README, Python
parity, and changelog. Text output should show evidence labels without becoming
noisy; add `--explain` if detailed citations need a separate view.

**Verify**: `npm run check` exits 0 and legacy JSON fields remain present.

## Test plan

- Contract validation and stable rule IDs.
- Legacy score/recommendation compatibility.
- Aggregation across wording changes using rule IDs.
- Registry missing/stale metadata.
- JS/Python JSON parity for one fixture.

## Done criteria

- [x] Every emitted finding is machine-readable and evidence-labeled.
- [x] Existing score consumers do not break.
- [x] Evidence can be updated without editing rule logic.
- [x] JS/Python parity and full checks pass.

## STOP conditions

- Adding the contract requires removing or renaming a public legacy field.
- The Python implementation cannot represent the same JSON without divergence.
- A rule has no defensible source; label it `heuristic`, do not invent one.

## Maintenance notes

Version the report contract independently from the scoring model. Evidence
updates should produce changelog entries even when the underlying check stays
the same.
