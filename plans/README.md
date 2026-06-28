# Implementation roadmap

**Status:** canonical execution index  
**Last reconciled:** 2026-06-27 post T0 + direction shift (quality + Pro differentiation)  
**Architecture gate:** T0 COMPLETE (029–034 done) ✓  
**Business gate:** DEFERRED (018 S02–S07 parked by owner decision 2026-06-27)

This file is the single source of truth for current execution order. Individual
plan files are self-contained handoffs; `plans/archive/` is historical evidence
and must not be interpreted as active backlog.

Documentation ownership, status meanings and reconciliation rules live in
[`docs/documentation-governance.md`](../docs/documentation-governance.md).

## Operating rules

- Work in progress is limited to one active plan. Business plans are deferred;
  technical plans execute sequentially unless explicitly parallelized.
- Dependencies, not plan numbers, determine execution order.
- Run a plan's drift check before execution. Refresh stale evidence instead of
  improvising from old line references.
- Update this index and the plan status in the same change that completes,
  blocks, defers or supersedes work.
- `DONE` plans move to `archive/`; partial and deferred plans remain active.
- No public npm release, v2 default switch or Pro implementation may cross its
  named gate.

Statuses: `READY`, `TODO`, `IN PROGRESS`, `PARTIAL`, `BLOCKED`, `DEFERRED`,
`DONE`, `SUPERSEDED`, `REJECTED`.

## Roadmap

Direction decision (2026-06-27): commercial validation, monetization proposals
and medium/long-term business plans are DEFERRED. The project now focuses on two
parallel tracks — **quality hardening** (actionable audits, optimal artifact
generation, end-to-end polish that measurably improves the user's AI
discoverability) and **Pro differentiation** (advanced features that make the
paid product compelling). Public release, v2 default switch and hosted product
remain gated; Pro features may ship incrementally as they stabilize.

| Horizon   | Track              | Outcome                                              | Plans / slices                  | Gate      |
| --------- | ------------------ | ---------------------------------------------------- | ------------------------------ | --------- |
| Now       | Quality hardening  | Zero known bugs, full coverage on core paths, CI trust | 035–037 + C1–C4 evidence fixes | Q0        |
| Now       | Pro differentiation | Compelling upgrade from Community → Pro              | 038–040                         | P0        |
| Next      | Product correctness | Defensible structured data and `llms.txt` behavior  | refreshed 024–025               | T1        |
| Later     | Technical expansion | Sitemap/remote audit, repository readiness           | split 023, rule-pack 026        | demand    |
| Deferred  | Business validation | Portfolio, offers, paid diagnostic evidence          | 018 S02–S07                     | owner     |
| Deferred  | Pro product suite  | Reports, baselines, CI entitlements                  | 018 S10–S15                     | after Q0   |
| Deferred  | Hosted product     | Workspace, history, monitoring                       | 018 S19+                        | after G4   |
| Deferred  | Evaluation         | Reproducible citation evaluation                     | 028                             | budget     |
| Deferred  | Engine adapters    | Provider adapters, IndexNow, freshness               | 027                             | demand     |

### Dependency flow (current)

```text
T0 (029–034) COMPLETE ✓
        │
        ├── Quality track (035 → 036 → 037)
        │       │
        │       └── Evidence supplement fixes (E1–E4, C1–C4)
        │
        ├── Pro track (038 → 039 → 040)
        │       │
        │       └── Refresh 024 (structured data) ── enables ── Pro schema features
        │               │
        │               └── 025 (llms artifacts) DONE
        │
        └── Deferred: 018 S02–S15, 023 remote, 026–028
```

## Technical execution queue

### Completed (T0 gate, 2026-06-27)

| Plan | Outcome | Status |
|---|---|---|
| [029](archive/029-stabilize-audit-contracts.md) | Valid v2 findings and unambiguous report/model versions | DONE |
| [030](030-unify-audit-core-and-cli-boundaries.md) | One audit flow; core no longer owns process exits | DONE |
| [031](archive/031-verify-public-api-and-types.md) | Runtime exports and declarations stay synchronized | DONE |
| [032](032-build-reproducible-package.md) | Publishable artifact without tracked-source mutation | DONE |
| [033](archive/033-modernize-runtimes-and-quality-gates.md) | Supported runtimes and risk-focused CI gates | DONE |
| [034](archive/034-define-python-compatibility-tier.md) | Explicit, tested Node/Python capability contract | DONE |

### Active — Quality hardening (Q0 gate)

Quality means the tool does real, valuable work for the user. Test coverage,
correctness, usability, and concrete deliverables are all part of it. The free
Community user should walk away with artifacts that measurably improve their
AI discoverability — not just a score, but fixes.

| Plan | Type | Outcome | Priority | Effort | Depends on | Status |
|---|---|---|---|---|---|---|
| 035 | Execution + UX | Audit findings that are specific, truthful, and actionable. Every finding has remediation tied to the actual content (no boilerplate). Evidence sources populated (E2). Zero false positives on `fail` severity across the 32-fixture corpus. `tests/scoring.test.js` asserts that good content scores high and bad content scores low (C1). Validate edge cases (C3). Integrity source test (C2). | P0 | M | T0 | DONE |
| 036 | Execution | `llms.txt` and `llms-full.txt` generation is optimal: intelligent section extraction, smart scoring-based prioritization, efficient handling of large sites. `sitemap.xml` generation from content tree (new capability). `robots.txt` generation that actually improves crawler access patterns — purpose-aware, registry-aligned, with per-agent reasoning. All three artifacts validated for spec compliance. | P0 | M–L | 035 | DONE |
| 037 | Execution + UX | End-to-end polish: a user with a directory of content walks away with a complete GEO package (audit report + llms.txt + llms-full.txt + sitemap.xml + robots.txt + structured data). CLI UX: progress indicators, helpful errors, clear --help, dry-run everywhere. Text report readable by non-technical users. JSON output self-documenting. CLI branch coverage ≥80% (C4). | P1 | M | 036 | DONE |

### Active — Pro differentiation (P0 gate)

| Plan | Type | Outcome | Priority | Effort | Depends on | Status |
|---|---|---|---|---|---|---|
| 038 | Decision + execution | Pro-only structured data: advanced schema types (Course, Event, Recipe, HowTo), multi-type pages, schema validation with Pro-only rules | P0 | M | T0 | DONE |
| 039 | Execution | Pro audit reports: HTML/PDF export, branded Pro reports with charts, comparison mode (before/after), shareable report links | P0 | M–L | 038 | DONE |
| 040 | Execution | Pro CI/CD integration: native GitHub Actions action, GitLab CI template, status badges, threshold-based PR checks | P1 | M | 039 | DONE |

### Maintained (post-Q0)

| Plan | Type | Outcome | Priority | Effort | Depends on | Status |
|---|---|---|---|---|---|---|
| [022](022-calibrate-profiled-audit-v2.md) | Program slice | Profile-aware v2 model | P1 | L | T0 done | PARTIAL |
| [024](024-align-structured-data-semantics.md) | Execution | Accurate structured-data semantics | P1 | M | 030, 031, 034 | DONE |
| [025](archive/025-harden-llms-artifacts.md) | Execution | Proposal-correct, curated artifacts | P2 | M | 024 | DONE |
| [023](023-add-technical-discovery-audit.md) | Program slice | Local technical audit landed; remote/sitemap undecided | P2 | L | T0 | PARTIAL |
| [026](026-add-open-source-readiness.md) | Direction | Rule-pack readiness, not another engine | P3 | M | Q0, demand | SUPERSEDED |

### Deferred (by owner decision 2026-06-27)

| Plan / program | Reason |
|---|---|
| 018 S02–S07 (business validation) | Commercial strategy parked; focus on product quality first |
| 018 S10–S15 (Pro product suite) | Will revisit after Q0+P0 deliver a compelling free→Pro upgrade story |
| 018 S19+ (hosted product) | Requires G4; too far out |
| [027](027-add-engine-adapters-and-freshness.md) | No provider demand yet |
| [028](028-spike-citation-evaluation-loop.md) | Research budget not approved |

### Gate Q0 — quality hardening

Q0 is `GO` when a free Community user with a directory of Markdown/HTML files
can run the tool and receive a complete, polished GEO optimization package that
**measurably improves their AI discoverability**.

Concrete deliverables:

- **Accurate, actionable audit (035):** every finding has specific remediation
  tied to the actual content, not boilerplate. Evidence sources are populated.
  Zero false positives on `fail` across the 32-fixture corpus. Good content scores
  high, bad content scores low. 5 validate edge cases covered. Integrity has
  source-level coverage. Evidence registry re-verified.
- **Optimal artifact generation (036):** `llms.txt` and `llms-full.txt` are
  generated with intelligent section extraction and scoring-based prioritization.
  `sitemap.xml` is generated from the content tree with correct priorities and
  change frequencies. `robots.txt` generation produces purpose-aware,
  registry-aligned rules with per-agent reasoning. All three artifacts pass spec
  compliance validation.
- **Polished end-to-end experience (037):** one command transforms a content
  directory into a complete GEO package. CLI has progress indicators, helpful
  errors, clear --help, and dry-run on every command. Text reports are readable
  by non-technical users. JSON output is self-documenting. CLI branch coverage
  ≥80%. Every documented command has a smoke test.
- **Internal foundation:** 3 evidence sources re-verified (E1). `npm run check`
  passes clean with all new quality gates.

### Gate P0 — Pro differentiation

P0 is `GO` when:

- At least 2 Pro-only schema types are executable and tested;
- Pro HTML/PDF report generation works end-to-end;
- At least one CI platform has a native integration (action/template);
- Community edition shows clear upgrade prompts for Pro features;
- README and docs describe the Community/Pro boundary explicitly.

## Business program (DEFERRED)

[018 Tooltician AI Discoverability](018-build-tooltician-ai-discoverability-business.md)
is parked by owner decision (2026-06-27). Product, discovery, legal, and Pro
implementation sessions (S02–S15) will resume after quality hardening (Q0) and
Pro differentiation (P0) establish a solid free→Pro upgrade story.

## Reconciliation of pre-T0 plans

- **022:** corpus, profiles, observations, v2 flag and characterization docs landed.
  Contract normalization, type coverage, orchestration, conformance, and Python
  scope closed by plans 029–034 (T0 complete 2026-06-27). Remaining: optional
  v2 default switch decision.
- **023:** pure local HTML observations and findings landed. Sitemap, remote URL
  fetching, CLI integration and Python support did not. The old all-in-one scope
  is split; remote work requires demand plus a threat model.
- **024:** refresh after quality track delivers structured-data correctness.
  Overlaps with Pro schema features (plan 038).
- **025:** keep behind 024 or direct user demand. Not on critical path.
- **026:** must become a rule pack on the common engine, not a parallel audit
  architecture. Low priority.
- **027:** crawler metadata and evidence freshness partially landed elsewhere.
  Deferred until provider demand materializes.
- **028:** research spike, not production backlog.

## Completed history

Plans 001–017, 019–021 are completed and stored under
[`archive/`](archive/). The prior audit register is
[`archive/audit-findings-2026-06-25.md`](archive/audit-findings-2026-06-25.md).
Historical pre-current-roadmap plans live under
[`archive/public-history/`](archive/public-history/).

## Current architecture evidence

The evidence and tradeoffs behind T0 are documented in
[`architecture-audit-2026-06-27.md`](architecture-audit-2026-06-27.md).
That report is evidence, not the execution index; when the two differ, this
README contains the current status and the audit retains its dated snapshot.

A complementary empirical supplement — evidence staleness, scoring-to-registry
traceability, and coverage deep-dive — lives in
[`evidence-and-coverage-supplement-2026-06-27.md`](evidence-and-coverage-supplement-2026-06-27.md).
Its findings do not block T0 but inform plans 031, 034 and pre-release quality
gates.

## Considered and intentionally deferred

- Full TypeScript rewrite: contract and consumer tests provide better current
  leverage.
- Immediate Python removal: decide from capability needs and usage evidence in
  plan 034.
- Async rewrite: no measured CLI throughput problem.
- Plugin system: no repeated implementations justify the abstraction.
- Microservices, database, telemetry or Workspace: blocked behind business gate
  G4.
- Automated submissions or remote crawling: require explicit product demand,
  security design and opt-in.
