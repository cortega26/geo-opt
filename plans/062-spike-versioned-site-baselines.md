# Plan 062: Spike a versioned multi-page baseline workflow only after repeated adopter need

> **Executor instructions:** This is a cold-backlog design spike. Keep it
> frozen during Plan 059. Do not add CLI flags, storage, reports, or a paid
> tier. Reopen it only when independent product-led adopters specifically
> report repeat-site regression/baseline pain; technical plausibility is not a
> trigger.

**Status:** DEFERRED  
**Priority:** P3  
**Size:** M  
**Depends on:** Plan 059 `CONTINUE` and at least two independent adopters
describing the same repeat-site regression/baseline job  
**Planned against:** `b2e6055`, revised 2026-07-22

## Why this is parked

The current one-report comparison path may be enough. A versioned multi-page
baseline adds artifact identity, lifecycle, compatibility, and support surface
without proving a buyer or even a repeated user job. It is neither a default
Pro differentiator nor a growth tactic.

## Scope

### In scope after the trigger

- Characterize the present local one-page report/compare workflow with fixtures.
- Write a decision document for a possible local, versioned multi-page artifact:
  identity, version/model compatibility, rename/delete behavior, and test plan.
- Evaluate at least two local UX options and end with `GO`, `ADAPT`, or `STOP`
  for a separate implementation plan.

### Out of scope

- Production source, CLI, schema, storage, cloud sync, telemetry, dashboard,
  customer data, Community/Pro decision, or implementation.

## Work plan after the trigger

1. Cite the two independent adopter reports and describe their common workflow
   without recording private content, paths, or identities.
2. Characterize the current manual/local comparison contract from source, help,
   fixtures, and tests.
3. Specify a candidate local artifact: format/tool/model version, normalized
   user-controlled identity, score/findings summary, generated timestamp, and
   no-network rule.
4. Define page rename, deletion, duplicates, root relocation, version mismatch,
   malformed artifacts, and backwards-compatibility behavior.
5. Compare candidate UX paths without reserving any option for a paid tier; use
   fixture-driven acceptance criteria and issue one decision.

## Verification

| Check | Command | Expected result |
| --- | --- | --- |
| Confirm demand trigger | `rg -n "A1|baseline|regression|repeat-site" plans/business/funnel-and-metrics.md` | Two independent, product-led reports are cited |
| Characterize current behavior | `node bin/cli.js report --help` | Existing comparison contract is visible |
| Preserve a plans-only spike | `git diff --name-only && git diff --check` | No production files; clean whitespace |

## Done when

- [ ] The trigger is evidenced before design begins.
- [ ] A local-only artifact/UX decision is source-backed and ends in GO, ADAPT,
      or STOP.
- [ ] Any implementation is a separate plan.

## Stop conditions

- Fewer than two independent reports of the same job.
- The design needs cloud collection, hidden telemetry, or a paid-tier decision.
- The desired workflow breaks the current public contract without a migration
  and compatibility story.

## Maintenance notes

Do not reopen this merely because baselines look like a marketable feature.
