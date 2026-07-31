# Plan 064: Specify a three-pillar preflight only after repeated user demand

> **Executor instructions:** This is a cold-backlog design spike, not a broad
> platform initiative. Keep it frozen during Plan 059. Reopen it only when the
> product-led continuation result exists and at least two independent adopters
> specifically need a combined preflight/manual workaround across the existing
> pillars.

**Status:** DEFERRED  
**Priority:** P3  
**Size:** L  
**Depends on:** Plan 059 `CONTINUE` and two independent reports of a combined
GEO/structured-data/technical-SEO preflight job  
**Planned against:** `b2e6055`, revised 2026-07-22

## Why this is parked

The three-pillar product umbrella is accurate, but a combined preflight is not
yet an evidenced user workflow. It risks becoming a broad platform feature,
new composite score, or hidden hosted service. It does not earn priority merely
because every underlying capability already exists.

## Scope after the trigger

- Inventory current local GEO, schema, technical HTML, robots, sitemap, and
  llms artifact contracts with source-backed limits.
- Specify a local, review-first manifest and at least two UX alternatives.
- Define explicit user-confirmed schema handling, partial/skipped states,
  no-network behavior, and fixture-driven acceptance criteria.
- End in `GO`, `ADAPT`, or `STOP`; on GO, write a separate implementation plan.

## Out of scope

- New CLI/source behavior, automatic schema/type/identity inference, mutation
  without explicit action, cloud persistence, provider adapters, telemetry,
  pricing, tiering, or citation/ranking promises.

## Work plan after the trigger

1. Cite the two independent combined-workflow reports without recording private
   customer material.
2. Inventory the current contracts and identify exactly where the manual
   handoff occurs.
3. Specify a local manifest that represents `completed`, `skipped`, `blocked`,
   and `failed` work separately—not one new prediction score.
4. Compare an orchestration wrapper with a manifest-producing review path for
   local-first safety, explicit schema inputs, compatibility, and fixture tests.
5. Record the decision; do not build the feature in the spike.

## Verification

| Check | Command | Expected result |
| --- | --- | --- |
| Confirm repeated demand | `rg -n "A1|preflight|combined|manual workaround" plans/business/funnel-and-metrics.md` | Two independent reports are recorded |
| Locate existing entry points | `rg -n "generate-all|technical|schema|validate|robots|sitemap|llmstxt" bin src tests` | Each inventory claim has a source |
| Preserve the spike boundary | `git diff --name-only && git diff --check` | Only planning artifacts; clean whitespace |

## Done when

- [ ] The repeated user job is evidenced before design begins.
- [ ] The design retains explicit schema control and local-first privacy.
- [ ] The spike concludes with a decision and any implementation is separate.

## Stop conditions

- Fewer than two independent reports of the combined job.
- The proposal requires an automatic identity/schema choice, cloud collection,
  telemetry, or a new marketing claim.
- The output cannot clearly represent partial/non-applicable results.

## Maintenance notes

The umbrella is product context; it is not evidence that users need a unified
command.
