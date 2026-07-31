# Plan 026: Add an open-source and API documentation readiness audit

> **Executor instructions**: Audit observable repository artifacts. Never infer
> maintainers, authors, citation metadata, or release status.
>
> **Drift check (run first)**:
> `git diff --stat c6a604a..HEAD -- src bin index.d.ts tests .agents/skills/geo-optimization README.md package.json CHANGELOG.md docs`

## Status

- **Priority**: P2
- **Horizon**: mediano plazo, 3–5 meses
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plan 021
- **Category**: direction
- **Planned at**: commit `c6a604a`, 2026-06-26
- **Status**: SUPERSEDED — redesign after T0 as a common-engine rule pack

## Reconciliation — 2026-06-27

Do not implement the proposed standalone `src/open-source.js` audit engine.
Profiles and the observation architecture now exist, so repository readiness
must be redesigned as applicable rules/observations on the common engine.
Create a replacement plan only after T0 and customer evidence that repository
readiness belongs in the product.

## Why this matters

Both reports identify public Markdown, reproducible examples, package metadata,
OpenAPI, releases/changelogs, licenses, and `CITATION.cff` as especially useful
for software and agent workflows. The current product can audit prose but does
not inspect whether a software repository exposes these machine-readable
surfaces. This is a natural adjacent capability and can be dogfooded on
`geo-opt` itself.

## Current state

The repository has README, package metadata, license history, changelog, type
declarations, tests, and architecture docs, but no `CITATION.cff`, OpenAPI
applicability decision, examples directory, or readiness command. GitHub
documents `CITATION.cff` at
<https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-citation-files>.
Package metadata is already centralized in `package.json`.

## Commands you will need

| Purpose         | Command                     | Expected on success |
| --------------- | --------------------------- | ------------------- |
| Package preview | `npm pack --dry-run --json` | parseable JSON      |
| JS tests        | `npm test`                  | all pass            |
| Full check      | `npm run check`             | exit 0              |

## Scope

**In scope**: new `src/open-source.js`, CLI/public API/types, tests, docs, Python
parity where repository inspection is available, changelog, and optional
dogfood fixes in a separate commit.

**Out of scope**: GitHub API writes, creating releases/topics, inventing
`CITATION.cff` authors, or requiring OpenAPI for a CLI/library with no HTTP API.

## Git workflow

- Branch: `advisor/026-open-source-readiness`
- Keep generic audit support separate from optional geo-opt dogfood changes.
- Do not push or open a PR unless the operator explicitly requests it.

## Steps

### Step 1: Define repository profiles

Support library/CLI, HTTP API, documentation site, and data project profiles.
Auto-detection must be explainable and overridable. Define applicability so
OpenAPI is not a failure for this CLI.

**Verify**: profile fixtures choose expected applicable checks.

### Step 2: Audit authoritative artifacts

Check README quickstart, license, changelog/releases evidence, package metadata,
repository/homepage/bugs links, public types, examples/tests, architecture,
security/support docs, `CITATION.cff`, OpenAPI when applicable, and stable docs
URLs. Return plan-021 findings with exact paths.

**Verify**: fixtures cover complete, incomplete, and not-applicable repos.

### Step 3: Offer safe generators

Generate reviewable templates only when all factual fields are supplied.
`CITATION.cff`, OpenAPI, authors, DOI, version, and dates must never be inferred.
Default to dry-run and path-confinement protections.

**Verify**: missing factual metadata blocks generation; supplied fixture
round-trips through a validator.

### Step 4: Dogfood without gaming

Run the audit on this repository and fix only objective gaps approved in the
plan scope. Do not add files solely to make a score green. Record
not-applicable decisions.

**Verify**: report is reproducible and `npm pack --dry-run --json` contains only
intended public assets.

## Test plan

- Profile/applicability matrix.
- Metadata consistency and broken links represented as deterministic fixtures.
- Safe generation requiring explicit facts.
- Path confinement.
- Self-audit golden report.

## Done criteria

- [ ] Software-specific readiness is distinct from editorial scoring.
- [ ] Not-applicable checks do not penalize projects.
- [ ] No identity/citation metadata is inferred.
- [ ] Package and full checks pass.

## STOP conditions

- A check requires authenticated GitHub state; report it as an external/manual
  check instead.
- A generator would need to guess a person, DOI, release, or license.

## Maintenance notes

Keep registry/package-specific adapters small. Repository readiness should
remain useful even if `llms.txt` adoption disappears.
