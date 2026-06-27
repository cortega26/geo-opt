# Documentation governance

**Status:** normative  
**Owner:** repository maintainer  
**Last verified:** 2026-06-27

This document defines how `geo-opt` keeps code, public documentation, plans,
product claims, and historical records aligned. Its purpose is to reduce
documentation drift without creating a documentation bureaucracy that a single
maintainer cannot sustain.

## Principles

1. A fact has one authoritative source. Other documents summarize or link to
   it; they do not redefine it.
2. Runtime behavior outranks prose. When code and documentation disagree, treat
   the discrepancy as a defect and reconcile both deliberately.
3. Public claims require executable behavior, a test, or a named external
   source.
4. Plans describe future work; they never prove that a capability exists.
5. Changelogs and archived plans are historical records. Do not rewrite them to
   look current; add a dated correction or supersession note when necessary.
6. Documentation changes are part of the same change as the contract they
   describe.

## Document classes

| Class                     | Documents                                                            | Purpose                                            | Update policy                                        |
| ------------------------- | -------------------------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------- |
| Normative engineering     | `AGENTS.md`, this document, `docs/architecture.md`                   | Invariants, ownership and engineering contracts    | Update with architectural or workflow decisions      |
| Public user documentation | `README.md`, bundled `SKILL.md`, `docs/commercial-licensing.md`      | Current supported behavior and limitations         | Must match executable and tested behavior            |
| Operational planning      | `plans/README.md`, active numbered plans, `plans/business/`          | Current roadmap, gates and implementation handoffs | Reconcile after material merges and decisions        |
| Product/legal authority   | `LICENSE`, `COMMERCIAL-LICENSE.md`, `plans/business/decision-log.md` | Binding terms and approved product decisions       | Change only through explicit legal/product decisions |
| Historical record         | `CHANGELOG.md`, `LICENSE-HISTORY.md`, `plans/archive/`               | What happened and why                              | Append or annotate; do not modernize retrospectively |
| Research evidence         | `src/evidence.js`, research references named by active plans         | Evidence metadata and experimental context         | Verify dates and source status before making claims  |

## Source-of-truth matrix

| Concern                                              | Source of truth                                                              | Required mirrors                                    |
| ---------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------- |
| Package name, version, files and runtime range       | `package.json`                                                               | README installation/status, CI                      |
| CLI commands, flags, stdout/stderr and exit behavior | `bin/cli.js` plus CLI tests                                                  | README and bundled skill                            |
| JavaScript public exports                            | `src/index.js`                                                               | `index.d.ts`, README library examples               |
| Report and finding contracts                         | `src/findings.js`, scoring modules and contract tests                        | `index.d.ts`, architecture docs                     |
| Node/Python capability support                       | Capability matrix in `docs/architecture.md`, verified by cross-runtime tests | AGENTS and bundled skill                            |
| Scoring behavior and profiles                        | `src/scoring*.js`, `src/profiles.js`, fixtures and tests                     | README, skill and architecture limitations          |
| Crawler/evidence metadata                            | `src/robots.js`, `src/evidence.js`                                           | README/skill explanations                           |
| Structured-data behavior                             | `src/schema.js`, `src/validate.js` and tests                                 | README, skill, schema templates                     |
| Current roadmap and execution order                  | `plans/README.md`                                                            | Status blocks in active plans                       |
| Approved business direction and gates                | `plans/business/decision-log.md` and plan 018                                | `plans/README.md`, public copy after approval       |
| Licensing terms                                      | `LICENSE`, `COMMERCIAL-LICENSE.md`                                           | README and `docs/commercial-licensing.md` summaries |
| Release history                                      | `CHANGELOG.md`                                                               | Release notes when published                        |

The capability matrix is normative for what the project commits to support
across runtimes. A shared function name or similar implementation does not by
itself establish parity.

## Product and architecture invariants

These statements must remain true unless an explicit decision changes them:

- Node.js is the canonical implementation and npm/library runtime.
- Python is a capability-scoped compatibility port, not a second source of
  truth.
- v1 remains the default scoring model until the migration gate in the roadmap
  is complete.
- A report contract version, scoring model version and package version are
  distinct concepts, even where the current implementation still needs
  hardening.
- Core functions should return data or errors. CLI adapters own terminal
  rendering and process exit behavior.
- Processing is local by default. Network access, sharing and telemetry require
  explicit opt-in and documentation.
- Machine-readable stdout must not be contaminated by diagnostics, reminders
  or progress messages.
- Generated structured data must not infer author, publisher, publication date,
  price, currency or availability.
- `robots.txt` communicates crawler preferences; it is not access control.
- `llms.txt` is an optional community proposal and has no positive or negative
  effect on Google Search visibility.
- Scores and findings do not guarantee ranking, retrieval, inclusion, mention
  or citation.
- Community reminders remain local, non-blocking, automation-safe,
  user-disableable and no more frequent than the documented policy.
- A public npm release must be produced and verified without modifying tracked
  source files.

## Public contracts

Treat the following as compatibility-sensitive:

- CLI command names, flags, exit codes and JSON shapes;
- exported JavaScript names and TypeScript declarations;
- finding `ruleId`, status vocabulary and evidence metadata;
- report/model version semantics;
- config keys and validation behavior;
- generated JSON-LD shapes and mutation safety;
- package contents and supported runtime versions;
- capability commitments in the Node/Python matrix.

An incompatible change requires:

1. an explicit migration decision;
2. tests for old and new behavior where a compatibility window exists;
3. an `Unreleased` changelog entry;
4. updates to every required mirror in the source-of-truth matrix;
5. a versioning decision appropriate to the affected contract.

## Change-trigger matrix

| Change                             | Documentation that must be reviewed                                   |
| ---------------------------------- | --------------------------------------------------------------------- |
| CLI command or option              | README, skill, architecture capability matrix, tests, changelog       |
| Public JS export or report field   | `index.d.ts`, README library section, architecture, changelog         |
| Python capability                  | Architecture matrix, skill commands, parity tests, requirements       |
| Scoring/profile rule               | Fixtures, architecture limitations, evidence metadata, skill guidance |
| Schema or validation behavior      | README, skill, template README/files, commercial capability table     |
| Crawler or provider rule           | Registry source/date, README/skill explanations, evidence freshness   |
| Runtime/dependency support         | package manifest, CI, README, AGENTS, skill setup                     |
| Licensing/entitlement              | Legal terms, commercial summary, README, tests, decision log          |
| Plan implementation or abandonment | Active plan status and `plans/README.md` in the same change           |
| External platform claim            | Primary source, verification date and affected public copy            |

## Plan lifecycle

`plans/README.md` is the only current execution index. Active plan files are
self-contained handoffs; archived files are evidence, not backlog.
The `plans/` tree is maintainer-local and excluded from the published npm
package; public users should rely on README, architecture and changelog rather
than internal roadmap files.

Supported statuses:

- `READY`: dependencies satisfied and current-state excerpts verified;
- `TODO`: approved but waiting on dependencies;
- `IN PROGRESS`: an active execution exists;
- `PARTIAL`: useful work landed but done criteria remain;
- `BLOCKED`: cannot continue until a named condition changes;
- `DEFERRED`: intentionally postponed behind a gate or evidence requirement;
- `DONE`: done criteria verified;
- `SUPERSEDED`: replaced by named plans or a different approach;
- `REJECTED`: intentionally abandoned with rationale.

Rules:

- Limit work in progress to one technical plan and one business/discovery
  session.
- A plan written against an older commit must run its drift check before
  execution.
- Material drift requires refreshing evidence and `Planned at`; do not execute
  stale line references.
- When a plan becomes `DONE`, update the index and move it to `plans/archive/`
  in the same change.
- When a plan is split or superseded, name the replacement plan IDs.

## Decision records

Use a short architecture decision record only for choices that are expensive to
reverse or constrain several future plans, for example:

- supported runtime and Python compatibility tiers;
- report/model version semantics;
- public package/export boundaries;
- release artifact layout;
- hosted persistence, tenancy or identity provider.

Store future records under `docs/decisions/NNN-short-title.md` with status,
context, decision, alternatives, consequences and supersession links. Do not
create ADRs for routine refactors or implementation details already contained
inside one plan. Plans 029–034 should create a decision record only where their
final implementation selects among materially different long-term contracts.

## Verification cadence

### Every behavior change

- Run checks required by `AGENTS.md`.
- Review every mirror named by the change-trigger matrix.
- Update `CHANGELOG.md` when code, tests, package behavior or public contracts
  change.

### Every material merge

- Reconcile affected plan statuses and dependencies.
- Confirm README and skill commands still execute.
- Confirm the architecture capability matrix still reflects tests.

### Monthly or before a release

- Review active plans for drift.
- Review external claims with dates or provider-specific behavior.
- Run the package preview and full checks.
- Confirm Node/Python support statements and dependency installation paths.
- Confirm archived documents are not being used as current instructions.

## Lightweight documentation checks

Until automated documentation checks are added, use:

```bash
rg -n "PENDING|PARTIAL|DEFERRED|SUPERSEDED" plans/README.md plans/*.md
rg -n "Node.js 20|identical results|--model v2|--profile" \
  README.md AGENTS.md docs .agents/skills/geo-optimization/SKILL.md
npm run format:check
npm run changelog:check
git diff --check
```

Command examples should also be executed when they describe a newly added or
changed CLI surface.
