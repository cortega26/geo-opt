# Plan 058: Reconcile factual product claims and prepare a narrow product-led entry point

> **Executor instructions:** This is a truth-and-onboarding plan, not a launch
> campaign. Work only on repository documentation and local planning records.
> Do not publish to LinkedIn or another social network, change Tooltician.com,
> send outreach, add telemetry, offer a service, or change licensing behavior.
> Every public capability claim must be traced to current tested behavior. If
> the correct claim cannot be established, stop rather than preserving a
> persuasive but uncertain statement.
>
> **Drift check (run first):** `git diff --stat b2e6055..HEAD -- README.md
> README.es.md docs/architecture.md docs/free-vs-pro.md
> docs/commercial-licensing.md package.json bin/cli.js src/licensing.js tests
> plans/018-build-tooltician-ai-discoverability-business.md
> plans/business/launch-content plans/business/funnel-and-metrics.md
> plans/README.md CHANGELOG.md`

## Status

- **Priority:** P1
- **Effort:** S
- **Risk:** LOW
- **Depends on:** none
- **Category:** product truth / onboarding / docs
- **Planned at:** commit `b2e6055`, revised 2026-07-22
- **Status:** READY

## Why this matters

The product has strong local-first and CI-oriented capabilities, but several
documents still describe a Community/Pro split that the current runtime does
not enforce. That is a trust defect, not a future commercial decision.

The active acquisition message is deliberately narrower than the product
umbrella:

> **Local, version-controlled quality checks for Markdown, HTML, and
> static-site content before merge — without uploading proprietary content.**

The three-pillar AI-discoverability framing remains accurate product context.
It is not the first-screen promise for this 90-day validation effort. The old
LinkedIn launch material is historical preparation, not an approved operating
channel or a campaign to polish.

## Current state to reconcile

- Runtime and tests show that Community currently permits recursive/batch
  audits, thresholds, injection, artifact generation, `generate-all`,
  technical audit, and library write APIs. `report`, advanced schema types,
  and some CLI branding behavior are the known gated surface.
- `docs/free-vs-pro.md` still states that several of those Community
  capabilities are Pro-only. Factual documentation must be corrected now;
  this does not decide a future paid offer.
- The README already contains a package-first local audit path and CI-related
  material. It needs one clear route from first run to a pre-merge workflow,
  without ranking, retrieval, or citation promises.
- The stored LinkedIn/follow-up drafts contain stale URLs and broad claims.
  They must be labelled historical/not approved for publication rather than
  treated as the active validation asset.

## Scope

### In scope

- Claim-to-runtime reconciliation in `README.md`, `README.es.md`,
  `docs/architecture.md`, `docs/free-vs-pro.md`, and, only where directly
  affected, `docs/commercial-licensing.md`.
- One truthful, copy-paste local-to-CI onboarding route using already supported
  commands and templates; update the bundled skill only if it repeats a
  corrected public claim.
- Marking `plans/business/launch-content/` material as historical/not approved
  where necessary, without turning it into a social campaign.
- A dated reconciliation note in Plan 018, the funnel record, and
  `plans/README.md` that separates historical hypotheses from current work.
- An `Unreleased` documentation note only if a public behavior claim changes.

### Out of scope

- External publication, LinkedIn, cold outreach, paid advertising, a sales
  funnel, a service CTA, or founder-led persuasion as a required channel.
- Prices, checkout, legal terms, entitlement changes, source code, new product
  features, telemetry, or customer-data collection.
- Calling an existing Pro dossier a product launch or inventing customer
  evidence, testimonials, screenshots, or use.

## Work plan

1. **Build a claim-to-runtime matrix.** Confirm the package identity, first
   local audit, existing CI path, and each Free/Pro assertion against source
   and tests. Classify every claim as `Community now`, `gated now`, `proposed`,
   or `unsupported`. Runtime and tests win over prose.

2. **Correct documentation truth before distribution.** Repair the affected
   Community/Pro table and current-maturity wording. Preserve the fact that a
   public paid offer is unapproved; do not disguise available Community
   capability as an artificial upgrade trigger.

3. **Make the entry job concrete.** Keep the broader three-pillar explanation
   in context, but make the first practical route a local audit followed by a
   copy-paste pre-merge/CI check for repository-managed Markdown, HTML, or a
   static site. State local/no-upload behavior only where verified. Explain
   results as QA findings and remediation, never as a ranking or citation
   prediction.

4. **Quarantine the obsolete campaign artifacts.** Correct stale repository
   URLs and unsafe causal language only as needed to label the old social and
   follow-up drafts as historical/not approved. Do not write a new campaign,
   CTA, price, or social calendar.

5. **Record the handoff honestly.** Update the roadmap and funnel record to
   show that Plan 059—not the old June/July G1 cohort—is the active 90-day
   product-led validation. Record only factual publication state; a missing
   public surface is a distribution prerequisite, not evidence of no demand.

## Verification

| Check | Command | Expected result |
| --- | --- | --- |
| Confirm package and first run | `node bin/cli.js --version && node bin/cli.js audit tests/fixtures/sample.md --format json` | Both commands exit 0; audit emits valid JSON |
| Find entitlement claims | `rg -n "Free|Community|Pro|recursive|threshold|inject|generate-all|report" README.md README.es.md docs/free-vs-pro.md docs/commercial-licensing.md` | Each claim is classified in the matrix or corrected |
| Find stale social positioning | `rg -n "GEO-skill|LinkedIn|out of 25|out of 15|rank|citation" plans/business/launch-content` | Drafts are historical/not approved and contain no unsafe active CTA |
| Governing checks after public-doc edits | `npm run check` | Exit 0 |
| Markdown safety | `git diff --check` | Exit 0 |

## Done when

- [ ] The public Community/Pro documentation matches tested current behavior.
- [ ] The first-run documentation has one truthful local-to-CI path for the
      selected technical audience.
- [ ] The three-pillar statement is retained as product context, while the
      narrow pre-merge job is the entry message.
- [ ] Historical LinkedIn assets are not presented as an active campaign.
- [ ] Plan 018, the funnel record, and roadmap no longer describe the old G1
      period as current evidence.
- [ ] No paid, service, source, telemetry, or external-account change occurred.

## Stop conditions

Stop and ask for a separate decision if:

- A truthful first-run route requires a missing feature or an entitlement
  change.
- A proposed statement promises ranking, retrieval, inclusion, or citation.
- Correcting an offer claim requires choosing a price, checkout, legal term,
  or support commitment.
- The only proposed distribution path is founder LinkedIn or cold sales.

## Maintenance notes

Plan 059 owns the time-boxed adoption experiment. Plan 060 may not turn these
factual corrections into a commercial decision. Re-run the claim-to-runtime
matrix whenever entitlement behavior changes.
