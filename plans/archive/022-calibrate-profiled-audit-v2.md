# Plan 022: Build and calibrate a profile-aware audit model before replacing the legacy score

> **Executor instructions**: Introduce v2 behind an explicit model flag. Do not
> make it the default until the calibration and compatibility gates pass.
>
> **Drift check (run first)**:
> `git diff --stat c6a604a..HEAD -- src/scoring.js src/text.js src/batch.js src/config.js src/index.js bin/cli.js index.d.ts tests .agents/skills/geo-optimization docs README.md CHANGELOG.md`

## Status

- **Priority**: P1
- **Horizon**: mediano plazo, 2–5 meses
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: plans 020 and 021
- **Category**: direction
- **Planned at**: commit `c6a604a`, 2026-06-26
- **Status**: PARTIAL — landed implementation; completion moved to plans 029–034

## Reconciliation — 2026-06-27

Steps 1–5 landed substantially: the fixture corpus, profiles, observations, v2
flag, readiness bands and limitations documentation exist. Do not execute this
plan from step 1 again. Remaining gaps are the finding/report contract, shared
orchestration, public types and an explicit Python capability decision. Plans
029, 030, 031 and 034 now own those outcomes. Mark 022 `DONE` only after those
plans verify its remaining done criteria.

## Why this matters

The 0–100 model assigns equal weight to structure, statistics, quotations,
links, and clarity. A technically excellent API reference can score poorly for
lacking expert quotations; unsupported numbers or decorative quotes can score
well. The research reports agree that recommendations must be contextual, and
current Google guidance explicitly rejects ideal page lengths and mandatory
chunking. The model needs characterization data, applicability profiles, and
versioning before its score can be professionally meaningful.

## Current state

- `src/scoring.js:84-349` hard-codes five 20-point buckets.
- `src/scoring.js:114-129` awards answer-first points only for 40–90 words.
- `src/scoring.js:206-230` awards full statistics/quotation points from counts,
  without validating relevance or attribution.
- `src/scoring.js:351-377` recommends statistics and quotes whenever the bucket
  is below 20.
- Tests at `tests/optimizer.test.js:976-992` assert only broad shape and range,
  not ranking quality or false positives.

## Commands you will need

| Purpose    | Command                 | Expected on success |
| ---------- | ----------------------- | ------------------- |
| Coverage   | `npm run test:coverage` | exit 0              |
| Full check | `npm run check`         | exit 0              |
| Python     | `npm run test:python`   | `OK`                |

## Scope

**In scope**: files in the drift check and new versioned fixtures under
`tests/fixtures/audit-v2/`.

**Out of scope**: claiming correlation with live rankings/citations, calling
external LLMs, or deleting model v1.

## Git workflow

- Branch: `advisor/022-profiled-audit-v2`
- Commit fixtures, model behavior, parity, and docs as reviewable units.
- Do not push or open a PR unless the operator explicitly requests it.

## Steps

### Step 1: Create a labeled characterization corpus

Add at least 30 compact fixtures across documentation/API, open source, blog,
SaaS/commercial, ecommerce, and regulated content. For each fixture, store
human-reviewed expected observations and applicability, not a hand-picked total
score. Include adversarial cases: fabricated-looking stats, unattributed
quotes, link farms, perfect formatting with irrelevant content, and excellent
technical docs without quotes.

**Verify**: a fixture validator confirms every profile and edge case exists.

### Step 2: Define profiles and applicability

Add `auto`, `documentation`, `open-source`, `editorial`, `commercial`,
`ecommerce`, and `regulated` profiles. Auto-detection may recommend a profile
but must report confidence and accept an explicit override. Mark checks
not-applicable rather than scoring them as failures.

**Verify**: profile tests show that quotations are not required for API docs
and commerce-only fields do not affect editorial content.

### Step 3: Implement section-level observations

Use Marked/Cheerio ASTs to check heading sequence, section self-containment,
paragraph length distributions, question/answer structure, visible source
proximity, attribution, dates, and semantic HTML. Treat fixed thresholds as
configurable project heuristics, not platform facts. Preserve content exactly;
the audit never fabricates or auto-rewrites evidence.

**Verify**: fixture expectations pass in Node.js. Python support is governed by
the capability decision in plan 034; do not imply v2 parity before it exists.

### Step 4: Add v2 scoring only after observation quality is stable

Expose `--model v2` and include confidence/applicability in the report. Prefer a
readiness band plus dimension scores over a single pseudo-precise number. If a
total remains, document the formula and version it. Keep v1 as default through
one release and emit a migration note.

**Verify**: v1 golden tests remain unchanged; v2 ranks adversarial fixtures
below their credible counterparts within each profile.

### Step 5: Publish calibration limitations

Document corpus composition, known blind spots, scoring formula, and what the
model cannot predict. Update types, architecture, skill guidance, and changelog.

**Verify**: `npm run check` and `npm run test:coverage` pass.

## Test plan

- Golden v1 compatibility.
- V2 observation matrix across all profiles.
- Auto-profile confidence and explicit override.
- Not-applicable handling and denominator calculation.
- Node v2 fixture coverage plus the explicit Python tier decision from plan 034.
- Mutation-style tests showing that adding irrelevant quotes/numbers does not
  improve the relevant readiness band.

## Done criteria

- [ ] V2 has a documented corpus and formula.
- [ ] Fixed stylistic rules are profiles/heuristics, not universal facts.
- [ ] V1 remains available during migration.
- [ ] No live-engine outcome guarantee appears in output or docs.

## STOP conditions

- Human labels cannot be stated without subjective disagreement; change the
  fixture to objective observations instead of forcing consensus.
- V2 cannot outperform obvious adversarial cases.
- A proposed Python v2 port would require divergent formulas or hidden
  normalization; keep v2 Node-only and report the decision instead.

## Maintenance notes

Recalibrate by adding fixtures, never by tuning against a single customer's
desired score. A default switch requires a separate release decision and
documented migration.
