# Todo — Plan 058 execution

> Spec: [`spec.md`](./spec.md). Check items off in real time as work completes.
> Run `npm test` after each meaningful change; run `npm run check` before declaring done.

## Phase 0 — Setup
- [x] Read `plans/README.md` and identify implementable plans (058 only; 059 is owner-run, 060–064 DEFERRED).
- [x] Run Plan 058 drift check (`git diff --stat b2e6055..HEAD …`) — clean at HEAD `b2e6055`.
- [x] Build claim-to-runtime matrix by running each command in a clean sandbox.
- [x] Write `spec.md`.
- [x] Write `todo.md` (this file).
- [ ] Write end-to-end test scaffolds in `tests/`.

## Phase 1 — Test scaffolds (write first; they will fail until docs change)
- [x] `tests/058-entitlements.test.js` — asserts Community commands run ungated + Pro commands are gated. **PASSING** (runtime is truthful).
- [x] `tests/058-docs-claims.test.js` — asserts docs no longer mark Community commands as Pro. **FAILING** (docs work to do).
- [x] `tests/058-onboarding-route.test.js` — runs the exact README onboarding sequence in a sandbox. **PASSING**.
- [x] `tests/058-historical-assets.test.js` — asserts launch-content has quarantine banners + no stale URL. **FAILING** (quarantine work to do).
- [x] `tests/058-plan-records.test.js` — asserts plans/README, plan 018, and CHANGELOG are reconciled. **FAILING** (reconciliation to do).
- [x] Wired into `npm test` automatically (node:test glob). Confirmed they fail informatively.

## Phase 2 — Fix docs (run tests after each file)
- [x] `docs/free-vs-pro.md` — rewrote both tables + removed `schema --no-branding` row. **§6.2 PASSING**.
- [x] `docs/commercial-licensing.md` — fixed "Current distinction" table + "Last verified". **§6.2 PASSING**.
- [x] `docs/architecture.md` — fixed "Current maturity" (4 wrong claims) + "Last verified" + stale plan refs. **§6.2 PASSING**.
- [x] `README.md` — fixed Command reference + Free/Pro tables; updated test badge (573→610); added "From first run to a pre-merge quality gate" onboarding subsection; removed misleading `# Pro` comments and `TOOLTICIAN_LICENSE_KEY` from the audit CI snippet. **§6.2 + §6.3 PASSING**.
- [x] `README.es.md` — mirrored all changes in Spanish. **§6.2 PASSING**.

## Phase 3 — Quarantine stale campaign assets
- [x] Added "HISTORICAL / NOT APPROVED FOR PUBLICATION" banner + fixed repo URL (`cortega26/GEO-skill.git` → `cortega26/geo-opt`) + neutralized actionable publish date in all four `plans/business/launch-content/*.md`.
- [x] Added one line to `plans/business/funnel-and-metrics.md` noting launch-content is quarantined. **§6.4 PASSING**.

## Phase 4 — Plan-record reconciliation
- [x] `plans/018-build-tooltician-ai-discoverability-business.md` — dated supersession note added at top (historical, points to 058/059).
- [x] `plans/README.md` — Plan 058 `READY → DONE`, "Last reconciled" updated to 2026-07-22, dependency-flow block updated.
- [x] `CHANGELOG.md` — `Unreleased` → `Docs` entry describing the reconciliation. **§6.6 PASSING**.

## Phase 5 — Final verification
- [x] `node --test tests/058-*.test.js` — 56 tests, 56 pass.
- [x] `npm run check` — exit 0 (lint + format + JS tests + Python + conformance + typecheck + changelog + package validation).
- [x] `node scripts/check-test-count.js` — exit 0 (standalone drift detector; catches badge-vs-actual-count drift).
- [x] `git diff --check` — exit 0.
- [x] `node bin/cli.js audit tests/fixtures/sample.md --format json` — exit 0, valid JSON.
- [x] `git diff b2e6055 -- src/ bin/ index.d.ts package.json` — **empty** (no source/behavior changes; plan §scope honored).

## Phase 6 — Review loop (two passes)
- [x] **Pass 1**: fresh sub-agent reviewed spec vs implementation. Found 6 gaps (stale badge 610 vs 664 actual, self-referential badge test, architecture.md v2 contradiction, YAML test overclaim, plans/ git-ignored governance gap, scope-1 057 edit). All addressed.
- [x] **Pass 2**: fresh sub-agent re-reviewed. Confirmed 4 of 5 prior gaps RESOLVED; found 4 new gaps (spec §3 factual error about 057 commit, dangling `npm run check:test-count` refs, untracked script, §6.5 overstatement about plans/ git-ignore). All addressed.
- [x] Spec, tests, and comments now aligned with implementation. **ALIGNED**.

## Notes for the owner (commit-time)
- The following new files must be `git add`ed when committing Plan 058:
  - `tests/058-*.test.js` (5 test files)
  - `scripts/check-test-count.js`
  - `plans/058-work/spec.md`, `plans/058-work/todo.md`, `plans/058-work/tests/`
- The badge count (currently 666) will drift again whenever tests are added.
  Run `node scripts/check-test-count.js` after test changes, or wire it into
  CI in a future plan (requires a `package.json` edit, out of scope here).
- Plan 059 is the next plan but is owner-run (90-day adoption experiment),
  not agent-implementable.
