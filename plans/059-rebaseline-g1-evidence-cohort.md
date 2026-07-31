# Plan 059: Run a 90-day product-led adoption validation loop

> **Executor instructions:** Run one small, low-touch product experiment—not a
> LinkedIn cohort, sales process, or feature roadmap. The owner may spend at
> most one focused day per week for 90 calendar days. Permit only durable,
> owner-approved discoverability assets and replies to genuine inbound
> feedback. Do not cold-message prospects, require sales calls, add telemetry,
> solicit service work, or store personal/customer data in this repository.
>
> **Drift check (run first):** `git diff --stat b2e6055..HEAD -- README.md
> README.es.md docs/free-vs-pro.md docs/architecture.md
> .agents/skills/geo-optimization/SKILL.md plans/058-relaunch-community-validation.md
> plans/business/funnel-and-metrics.md plans/business/strategy.md
> plans/business/offers-and-packaging.md plans/README.md`

## Status

- **Priority:** P1
- **Effort:** M (capped at one day/week for 90 calendar days)
- **Risk:** LOW
- **Depends on:** Plan 058 complete; an owner-approved start date and at least
  one available discoverability surface
- **Category:** product-led validation / distribution
- **Planned against:** `b2e6055`, revised 2026-07-22
- **Status:** TODO

## Decision to test

For one tightly defined job, can independent technical teams discover, adopt,
and value `geo-opt` without founder-led sales?

> **Local, version-controlled quality checks for Markdown, HTML, and
> static-site content before merge — without uploading proprietary content.**

The initial audience is people who maintain repository-managed documentation,
content, or static sites and can use local tooling or CI. Agencies, general
publishers, a public Pro SKU, and a human Diagnostic are not the primary
motion for this experiment.

## Why this replaces G1

The previous G1 was a dated 28-day LinkedIn-led observation model. It measured
public issues, social posts, and unsolicited Pro inquiries while prohibiting
the distribution work that could create a valid cohort. That systematically
undercounts a privacy-first local CLI and conflates social reach with product
use or willingness to pay.

This plan keeps public downloads, stars, impressions, and issues as contextual
signals only. It separates real adoption, repeated pain, and a named paid
workflow. It does not claim that absence of public activity is product failure
when the promised discoverability assets were never actually available.

## Scope

### In scope

- A single canonical reference/product page or README section for the selected
  job, using the factual copy prepared in Plan 058.
- One copy-paste CI/pre-merge example using currently supported behavior.
- One public, non-sensitive sample repository, fixture-based walkthrough, or
  equivalent durable example, if the owner approves a publication surface.
- Up to three evergreen technical use cases that explain the same narrow job;
  each must be useful without a sales conversation.
- Replies to genuine inbound questions and aggregate/redacted evidence logging
  in `plans/business/funnel-and-metrics.md`.
- A single end-of-window continuation decision and roadmap reconciliation.

### Out of scope

- Mandatory LinkedIn activity, cold outreach, direct selling, demos, sales
  calls, paid ads, a service funnel, or an expectation that the founder become
  a salesperson.
- A checkout, public price, Pro launch, Diagnostic offer, implementation,
  monitoring, Workspace, CRM, support SLA, or new feature work.
- Hidden telemetry, individual-level tracking, private URLs/content, customer
  repositories, credentials, or copying inbound messages into Git.
- Treating downloads, clones, stars, impressions, maintainer activity, generic
  praise, or a public issue by itself as commercial evidence.

## Work plan

1. **Open the experiment honestly.** Record a start date, owner, selected job,
   available discoverability surface, and the exact entry asset in the funnel
   record. If no public/durable surface can be used, record `DISTRIBUTION NOT
   STARTED`; do not begin the 90-day clock or infer no demand.

2. **Ship the smallest durable entry path.** Make one canonical asset and one
   CI/pre-merge example available through an owner-approved product surface.
   A public sample/walkthrough and up to three supporting technical use cases
   may follow, but every item must reinforce the same job rather than broaden
   the promise. Social posting is optional context, never the decisive channel.

3. **Maintain a privacy-safe evidence log.** Every two weeks, record only
   aggregate counts and redacted evidence class/source. A link may be retained
   only for already-public evidence and only if it contains no customer
   content. Do not identify users or reconstruct their private workflows.

4. **Separate the decision signals.** Count only the following:

   | Signal | Minimum continuation evidence | Does not count |
   | --- | --- | --- |
   | A1 — independent adoption | 3 independent external adopters using a real repository, CI, or equivalent production workflow | Downloads, installs, stars, an unverified claim, or a maintainer demo |
   | A2 — repeated job/pain | 2 independent people describing the same recurring job or obstacle | A broad feature wish, generic praise, or one person's repeated comments |
   | A3 — named willingness to pay | 1–2 people identify a specific workflow they would pay to save time on | “Interesting,” “I would use it,” or a request for free help |
   | Context / quality | Documentation visits, public issues, or feedback may guide copy and correctness | A substitute for A1, A2, or A3 |

5. **Make one hard decision at day 90.**

   - **CONTINUE:** A1 ≥ 3, A2 ≥ 2, and A3 ≥ 1 are all evidenced. Reassess one
     self-service paid workflow through Plan 060; do not automatically launch
     Pro or services.
   - **PARTIAL:** A real entry path existed, but not all signals are met. Make
     one narrowly evidenced positioning, onboarding, or documentation change;
     do not build product, payment, or service infrastructure.
   - **MAINTENANCE:** After a real distribution effort, the thresholds are not
     met. Put commercial development and feature expansion in six-month
     maintenance mode. Keep the package useful and supported within normal
     maintainer capacity, but stop treating it as an emerging business.
   - **DISTRIBUTION INCOMPLETE:** The assets were never actually published or
     reachable. Name the missing prerequisite and reschedule distribution; this
     is not an adoption verdict.

6. **Reconcile only the next allowed work.** Update the funnel, Plan 018, the
   Pro dossier status note, and `plans/README.md`. A CONTINUE result is evidence
   to consider Plan 060, not authorization for payment, legal, service, or
   feature work. Freeze Plans 061–064 unless their own evidence triggers are
   independently met.

## Verification

| Check | Command | Expected result |
| --- | --- | --- |
| Confirm current entry path remains executable | `node bin/cli.js audit tests/fixtures/sample.md --format json` | Exit 0; documentation does not point to a broken first run |
| Find forbidden legacy gate language in active sections | `rg -n "28-day|2026-07-27|M1|M2|M3|LinkedIn.*primary|Pro inquiry" plans/business/funnel-and-metrics.md plans/README.md` | Matches appear only in clearly historical/superseded material |
| Confirm evidence safeguards | `rg -n "A1|A2|A3|aggregate|redacted|telemetry|private" plans/business/funnel-and-metrics.md` | Active definitions and privacy limits are present |
| Check plan changes | `git diff --check` | Exit 0 |

## Done when

- [ ] A truthful entry asset and CI/pre-merge path were available before the
      observation clock began, or the record states why distribution did not
      start.
- [ ] The experiment stayed within one day/week and did not rely on founder
      LinkedIn reach, direct sales, or hidden telemetry.
- [ ] A1, A2, and A3 are logged separately using aggregate/redacted evidence.
- [ ] The 90-day outcome is CONTINUE, PARTIAL, MAINTENANCE, or DISTRIBUTION
      INCOMPLETE, with the reason and owner/date recorded.
- [ ] The roadmap permits only the next work justified by that outcome.
- [ ] No checkout, paid offer, service, CRM, customer data, or speculative
      feature was introduced.

## Stop conditions

Stop and request an owner decision if:

- The experiment cannot be run without cold outreach, a sales call, LinkedIn as
  the sole channel, or a promise of support/service.
- The only way to measure a signal is silent CLI telemetry, private data, or
  individual-level tracking.
- Someone proposes counting a non-user metric as adoption or generic interest
  as willingness to pay.
- A proposed next step requires price, checkout, legal authority, or source
  changes outside this plan.

## Maintenance notes

This is the sole active commercial-learning experiment. AI assistance may lower
documentation and support cost, but it does not create a customer, channel, or
reason to pay. If the continuation threshold is missed, honour the six-month
maintenance rule rather than replacing this loop with more feature planning.
