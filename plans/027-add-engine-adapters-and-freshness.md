# Plan 027: Add versioned engine adapters and an opt-in freshness workflow

> **Executor instructions**: Engine adapters interpret shared observations; they
> must not duplicate core parsers or promise visibility. Network submission is
> opt-in and dry-run first.
>
> **Drift check (run first)**:
> `git diff --stat c6a604a..HEAD -- src bin index.d.ts tests .agents/skills/geo-optimization docs README.md CHANGELOG.md`

## Status

- **Priority**: P2
- **Horizon**: mediano plazo, 4–8 meses
- **Effort**: L
- **Risk**: MED
- **Depends on**: plans 019, 021, and 023
- **Category**: direction
- **Planned at**: commit `c6a604a`, 2026-06-26
- **Status**: DEFERRED — split into independently gated future plans

## Reconciliation — 2026-06-27

The crawler registry, official source metadata and evidence-staleness helpers
partially satisfy the original premise. Freshness observations, provider
interpretation adapters and IndexNow submission are separate products with
different risk. Do not execute this plan as one unit. Re-plan each slice only
after T0 and evidence of customer demand; IndexNow also requires an explicit
network/security review.

## Why this matters

The reports agree that engines differ and no universal GEO recipe exists.
Google uses core Search; OpenAI, Anthropic, and Perplexity publish distinct
crawler controls; Bing participates in IndexNow. A shared technical audit with
thin, evidence-versioned adapters can explain these differences without
hard-coding marketing claims into core logic.

## Current state

There are no engine profiles. The flat crawler array is the only
provider-specific data, and it lacks sources/dates. No freshness workflow,
IndexNow payload generator, or explicit last-modified audit exists. IndexNow's
official protocol allows up to 10,000 URLs per POST and requires host ownership:
<https://www.indexnow.org/documentation>.

## Commands you will need

| Purpose    | Command               | Expected on success |
| ---------- | --------------------- | ------------------- |
| JS tests   | `npm test`            | all pass            |
| Python     | `npm run test:python` | `OK`                |
| Full check | `npm run check`       | exit 0              |

## Scope

**In scope**: new `src/engines/` adapters and `src/freshness.js`, CLI/public API,
types, tests, docs, parity, changelog.

**Out of scope**: scraping consumer search UIs, prompt tracking, Search Console
OAuth, automatic submissions without confirmation, or ranking simulation.

## Git workflow

- Branch: `advisor/027-engine-adapters`
- Commit adapters, freshness checks, IndexNow, and docs as separate units.
- Do not push or open a PR unless the operator explicitly requests it.

## Steps

### Step 1: Define thin adapter contracts

Create adapters for `common`, `google-search`, `openai-search`,
`anthropic-search`, `perplexity`, and `bing-copilot`. Each maps shared finding
IDs to applicability, rationale, evidence references, and manual checks. It
must not reparse content.

**Verify**: the same core report can be rendered for one or several adapters
without changing observations.

### Step 2: Add evidence freshness gates

Every engine rule must have official source URL and `lastVerified`. CI should
warn at 90 days and fail at a maintainer-selected hard limit only for critical
crawler semantics. Add a documented update workflow.

**Verify**: stale fixture warnings are deterministic.

### Step 3: Add freshness observations

Audit visible update dates, schema dates when present, changelogs/feeds, and
sitemap `lastmod` consistency. Do not reward a newer date by itself or recommend
changing dates without substantive updates.

**Verify**: fake-recent dates with unchanged source evidence produce a warning,
not a benefit.

### Step 4: Implement safe IndexNow support

Generate and validate payloads first. Submission requires an explicit
`--submit`, user-supplied key/keyLocation, same-host validation, batch limits,
redacted logs, timeout/retry bounds, and confirmation. Keep secrets out of
config examples and reports.

**Verify**: mock-server tests cover 200/202/400/403/422/429, key redaction,
host mismatch, dry-run, and 10,000-URL limit.

### Step 5: Document engine limitations

Explain exactly what each adapter knows, what remains opaque, and the
verification date. Update parity and changelog.

**Verify**: `npm run check` exits 0.

## Test plan

- Adapter applicability matrix.
- Stale evidence lifecycle.
- Date/lastmod consistency.
- IndexNow payload, secret handling, and response codes.
- No network in default or dry-run execution.

## Done criteria

- [ ] Engine variation is data-driven and source-backed.
- [ ] Core parsers are not duplicated.
- [ ] Freshness never encourages cosmetic date changes.
- [ ] Network submission is explicit, bounded, and secret-safe.

## STOP conditions

- An engine rule lacks official documentation; label it experimental/manual or
  omit it.
- IndexNow secrets would appear in logs, state, or reports.
- An adapter begins assigning unsupported ranking weights.

## Maintenance notes

Adapters are a maintenance liability. Prefer fewer high-confidence rules over a
large speculative catalog.
