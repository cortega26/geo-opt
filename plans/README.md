# Implementation roadmap

**Status:** canonical execution index  
**Last reconciled:** 2026-08-03 — reconcile at `0006bb1`; Plan 079 re-reconciled at `6f90465` and executed in worktree (commit `912f525`, APPROVED); adversarial audit of 079 closed by Plan 096 (executed as `0e59047`, APPROVED). Both squash-merges pending. Plans 069–075 verified DONE (spot-checked at HEAD: GHSA keying, injected clock, safe argv wrapper, aggregate `effectiveScore` semantics, hermetic fetcher suite, TLS pinning fixtures, `checkHopPolicy`/`ERR_HOP_POLICY`). Plan 076 executed, APPROVED, and squash-merged to main as `aa7738a` (page-URL retention hard-capped at 50,000 unique URLs with dedupe, first-seen ordering, one truncation warning, and shared root+child budget before robots evaluation; 818/155 tests green). Plans 077–093 executed, APPROVED, and squash-merged to main (077 `7f29992`: one shared deadline covering DNS/connect, headers, body, and every redirect hop; 092 `0a7844b`: adversarial-audit closure — entry-check test, timer-abort bounds, request-creation timer cleanup; 093 `17708ed`: entry-check "no connection" semantics pinned with `timeoutMs: 0` + sockets assert; 823/155 tests green). Audit notes: DNS abortability rejected with empirical evidence (recorded below); the repo's changelog policy requires a CHANGELOG.md bullet for any `tests/*.js` commit — future test plans must scope it in from the start. All TODOs 076–091 re-verified at HEAD and their "Planned at" refreshed to `0006bb1`; no finding disappeared. Notable refreshes: 085's top v2 band label was already fixed in passing (F-06) — 3 of 4 bands still predict; 086's lint baseline moved to 10 errors in 5 files (Plan 069 added `check-audit.test.js`; 073/075 grew fetcher/sitemap tests) and was re-captured. Prior: 2026-08-02 — deep advisor audit at `888d3e7` documented every selected net-positive finding as Plans 069–091. Plans 069–072 restore green gates and the CI entry path before Plan 059 may start; 073–091 are ordered technical hardening, contract, performance, and documentation handoffs. Plans 065–067 remain DONE; their static contracts did not cover the newly verified action execution bug, aggregate-score semantics, or repeated-suite cost. Plan 068 remains DEFERRED. The Pro public-launch viability dossier does not supersede plan 018 until all four review parts receive GO.
**Reconciled 2026-08-09 (worktree carries 081→082→083→084):** Plan 081 executed + adversarially audited in the working tree (public-surface reconciliation: 33 exports/constants re-declared, `profile` narrowed, `AuditResult.report`/`AggregatePerFile.report` widened to the v2 union, runtime↔d.ts parity and consumer-import gates added; 872→884 tests green; `.gitignore`d fixture dirs cleaned) and Plan 082 executed and adversarially audited in the same worktree (validating JSON-LD: `validate` CLI exits nonzero on invalid, `validateSchemaFile` returns structured results, `validateSchema` total over JSON values; then blocked balanced-brace extraction, ```` ```jsonld ```` fences, single-quoted script attrs, NaN-free `aggregateReport` stats, and hardened `resolveIndexLoc`; 884→911 tests green). Both merged to main as `13bdfeb` (2026-08-09); plan files archived. Plan 083 executed in the same worktree (symlink-safe atomic artifact writes: shared `src/safe-write.js` boundary — real-parent-inside-CWD validation, final-symlink refusal, unique temp file + atomic rename, mode preservation, temp cleanup — migrated across 9 CLI sites plus schema inject/batch and `--backup` copies, ported to Python `write_file_safe`/`copy_file_safe`; 16 write-guard tests, 2 cli-smoke symlink e2e tests, 8 Python boundary tests; 911→925 tests green, 48→56 Python green) and merged to main as `876edbd` (2026-08-09); plan file archived. Adversarial audit of 083 (2026-08-09): closed a parent-symlink swap TOCTOU (rename/os.replace now target the fully resolved real destination path in Node and Python — deterministic regression test proves a re-pointed parent cannot redirect the write), made destination directories strict (clean refusal instead of raw ENOENT, matching the pre-083 CLI guards), made Python copies byte-exact and new-file modes umask-aware `0o644` (Node parity), and collapsed the duplicated containment predicate into one implementation; 19 write-guard tests, 3 cli-smoke write-boundary e2e tests, 60 Python tests green — 928 Node tests total; merged to main as `7576501` (audit) + `372c955` (docs). Plan 084 executed in the same worktree (Python artifact contract alignment: schema titles now use the Node metadata fallback chain — markdown H1 → HTML `<h1>` → frontmatter title → basename — instead of "Untitled Document"; `generate_llms_txt` score-based Optional is opt-in via `optional_threshold` with a deprecation warning, `optional: True` honored by default; titles/descriptions/sections/llms-full headings are Markdown-escaped via `escape_link_text` mirroring Node; matrix gains a precise frontmatter-fallback divergence row; 5 cross-runtime conformance parity tests + 7 Python tests; 928→933 Node tests, 60→67 Python green) and merged to main as `d0414e5` (2026-08-09); plan file archived; 085 (`remove-v2-predictive-wording`) is next in sequence.

Adversarial audit of 084 (2026-08-10): Python `.htm` files now count as HTML exactly like `.html` (Node parity — `<h1>` titles and meta-description fallbacks match); `generate_llms_txt`/`generate_llms_full_txt` tolerate empty section names (default `## Pages`, like Node's falsy fallback) and missing `title`/`url` instead of raising `KeyError`; score-based Optional placement demotes numeric scores only — `None`/non-numeric never demote (Node coerces `null` to 0 and demotes; a deliberate, matrix-documented divergence); 67→70 Python tests green; 933 Node tests unchanged; no Node-source touch. Follow-up close (2026-08-10): a shared `page-basic.htm` conformance fixture pins cross-runtime parity for `.htm` files (llms.txt title/description and schema `headline` byte-identical, 34 conformance tests green) and the Python port is clean under `ruff check` (5 behavior-preserving cleanups). Same day, while merging the queued dependabot PRs, CI red-lighting was diagnosed: `check-test-count.js` re-ran the full JS suite and only parsed the TTY spec summary (`ℹ tests N`) while piped CI output is TAP (`# tests N`) — the gate could never pass in CI. It now reads the count via `--from-log` from the `npm test` output of the same run (no duplicate run; TAP or spec accepted; standalone fallback hardened). Unmasked by that fix, the dogfood gate had also silently gone red since the 2026-07-31 remediation rewrote `docs/documentation-governance.md` (score 30→25; CI never ran the step because the badge step red-lighted first): the doc was remediated back to 44 (answer-first opening, external references, inline citations, acronym expansions) and the archival evidence in `docs/audits/` was excluded from the discoverability gate, restoring the exact scope of the last green dogfood run. That green state then exposed the final masked red: the security-audit gate, which had never run since the badge gate red-lighted first. Five high advisories were triaged on 2026-08-10: the brace-expansion direct toolchain copy was bumped to 5.0.9 (fixing CVE-2026-14257 and its GHSA-rgw5-rvv9-x895 bypass); brace-expansion 5.0.7 and ip-address 10.2.0 bundled inside the npm CLI tarball were re-verified unfixable (npm 11.19.0 max in-range and 12.0.2 latest both still bundle them) and allowlisted with recheck dates; js-yaml and undici were left for the queued dependabot PRs 42 and 41. Plan 085 executed same day (2026-08-10): all four readiness bands were re-checked for status assertions — the three lower bands still predicted ("raise it to production-ready", "reduce its likelihood of being cited by AI engines", "AI engines are unlikely to cite this page") along with the renderer's plain-English summaries ("well-optimized for AI discovery", "decent AI discoverability", "reliably discovered by AI engines") and the bundled skill's "Production-Ready" label — all rewritten to observed style-marker language (strong/partial/weak, specific gaps) with zero score or band-id change; two invariant test blocks (band descriptions via exported `readinessBand`, summary branches via exported `plainEnglishSummary`) pin the wording; 935→937 tests, 165→167 suites green. Bank of remaining technical handoffs: 086 → 087; 088 → 089; 090 (unblocked by 084); 091 (depends on 085 — wording is now consistent). The audit change is recorded as part of Plan 084's scope and merged as `HEAD` after Plan 084's `d0414e5`.
**Strategy update:** 2026-07-22 — the active motion is a capped, product-led 90-day validation for a narrow local CI/pre-merge job; the former LinkedIn-led G1, public Pro, service funnel, and speculative feature sequence are historical or conditional only.
**Architecture gate:** T0 COMPLETE (029–034 done) ✓  
**Quality gate:** Q0 GO (035–037 done, 2026-06-28) ✓  
**Pro gate:** P0 GO (038–040 done, 2026-06-28) ✓  
**Business gate:** ACTIVE (Plan 058 factual truth/onboarding → Plans 071/072 CI entry repair → Plan 059 90-day product-led adoption validation; Plan 018 is historical context, not the execution master)

This file is the single source of truth for current execution order. Individual
plan files are self-contained handoffs; `plans/archive/` is historical evidence
and must not be interpreted as active backlog.

Documentation ownership, status meanings and reconciliation rules live in
[`docs/documentation-governance.md`](../docs/documentation-governance.md).

## Operating rules

- Work in progress is limited to one active plan. Business plans follow their
  explicit gates; technical plans execute sequentially unless explicitly
  parallelized.
- Dependencies, not plan numbers, determine execution order.
- Run a plan's drift check before execution. Refresh stale evidence instead of
  improvising from old line references.
- Update this index and the plan status in the same change that completes,
  blocks, defers or supersedes work.
- `DONE` plans move to `archive/`; partial and deferred plans remain active.
  `npm run check` enforces this via scripts/check-plan-archive.js.
- No public npm release, future scoring-default change, or Pro implementation
  may cross its named gate.

Statuses: `READY`, `TODO`, `IN PROGRESS`, `PARTIAL`, `BLOCKED`, `DEFERRED`,
`DONE`, `SUPERSEDED`, `REJECTED`.

## Roadmap

Historical direction (2026-06-29): LinkedIn + Community was proposed as a
replacement for traditional discovery. It is retained in Plan 018 as a dated
hypothesis, not current execution.

Current direction (2026-07-22): validate one product-led job for a solo
maintainer—local, version-controlled quality checks for Markdown, HTML, and
static-site content before merge, without uploading proprietary content.
Technical tracks are complete. The next work is product truth and durable
onboarding/discoverability, not a LinkedIn campaign, sales funnel, paid tier,
or feature expansion.

| Horizon   | Track              | Outcome                                              | Plans / slices                  | Gate      |
| --------- | ------------------ | ---------------------------------------------------- | ------------------------------ | --------- |
| ~~Now~~   | ~~Quality hardening~~  | ~~Zero known bugs, full coverage on core paths, CI trust~~ | ~~035–037~~ | Q0 ✓ |
| ~~Now~~   | ~~Pro differentiation~~ | ~~Compelling upgrade from Community → Pro~~         | ~~038–040~~                     | P0 ✓      |
| ~~Next~~  | ~~Product correctness~~ | ~~Defensible structured data and `llms.txt` behavior~~ | ~~024–025~~                  | T1 ✓      |
| ~~Now~~   | ~~Technical expansion~~ | ~~Sitemap/remote audit, repository readiness~~    | ~~023~~                         | done ✓    |
| Now       | Product-led validation | Truthful local-to-CI entry, then independent adoption/pain/WTP evidence | [058](archive/058-relaunch-community-validation.md) → 071 → 072 → [059](059-rebaseline-g1-evidence-cohort.md); 018 is historical context | CI entry executable/truthful, then A1/A2/A3 at day 90 |
| Deferred  | Paid workflow / exceptional service | At most one evidenced self-service workflow; a service only on unsolicited inbound | [060](060-decide-community-pro-boundary.md), then [061](061-prepare-bounded-diagnostic-intake.md) only if separately triggered | 059 `CONTINUE`, capacity/economics |
| Deferred  | Product-direction spikes | Baseline, frontmatter, and preflight only on their own real-workflow evidence | [062](062-spike-versioned-site-baselines.md), [063](063-normalize-generate-all-frontmatter.md), [064](064-spike-three-pillar-preflight.md) | independent demand; no sequence |
| Deferred  | License enforcement | Signature-verifiable Pro keys only once a purchase channel exists (honor system documented as the current model) | [068](068-license-signing.md) | 059 `CONTINUE`; 060 GO; purchase channel |
| Deferred  | Pro product suite  | Commercial work only after a viable paid workflow is evidenced | 018 S10–S15                     | after 060 separate decision |
| Deferred  | Hosted product     | Workspace, history, monitoring                       | 018 S19+                        | repeated paid/recurrent workflow |
| Deferred  | Evaluation         | Reproducible citation evaluation                     | 028                             | budget     |
| Deferred  | Engine adapters    | Provider adapters, IndexNow, freshness               | 027                             | demand     |

### Dependency flow (current)

```text
T0 (029–034) COMPLETE ✓
        │
        ├── Quality track (035 → 036 → 037) COMPLETE ✓
        │       │
        │       └── Evidence supplement fixes (E1–E4, C1–C4) DONE
        │
        ├── Pro track (038 → 039 → 040) COMPLETE ✓
        │       │
        │       └── 024 (structured data) DONE ── 025 (llms artifacts) DONE
        │
        ├── Product-led track (058 DONE → 071 → 072 → 059 TODO) ACTIVE
        │       │
        │       ├── historical context: 018 and Pro dossier (parked)
        │       ├── CONTINUE (A1 + A2 + A3) → 060 paid-workflow evaluation
        │       ├── unsolicited inbound + capacity/economics → 061 exception
        │       ├── separate real-workflow triggers → 062 / 063 / 064
        │       └── PARTIAL → one docs/onboarding adjustment
        │           MAINTENANCE → six-month commercial/feature freeze
        │
        └── Deferred: 018 S08–S15, 027–028
                (026 SUPERSEDED)
```

## Technical execution queue

### Completed (T0 gate, 2026-06-27)

| Plan | Outcome | Status |
|---|---|---|
| [029](archive/029-stabilize-audit-contracts.md) | Valid v2 findings and unambiguous report/model versions | DONE |
| [030](archive/030-unify-audit-core-and-cli-boundaries.md) | One audit flow; core no longer owns process exits | DONE |
| [031](archive/031-verify-public-api-and-types.md) | Runtime exports and declarations stay synchronized | DONE |
| [032](archive/032-build-reproducible-package.md) | Publishable artifact without tracked-source mutation | DONE |
| [033](archive/033-modernize-runtimes-and-quality-gates.md) | Supported runtimes and risk-focused CI gates | DONE |
| [034](archive/034-define-python-compatibility-tier.md) | Explicit, tested Node/Python capability contract | DONE |

### Completed — Quality hardening (Q0 gate GO ✓ 2026-06-28)

Quality means the tool does real, valuable work for the user. Test coverage,
correctness, usability, and concrete deliverables are all part of it. The free
Community user should walk away with artifacts that measurably improve their
AI discoverability — not just a score, but fixes.

| Plan | Type | Outcome | Priority | Effort | Depends on | Status |
|---|---|---|---|---|---|---|
| 035 | Execution + UX | Audit findings that are specific, truthful, and actionable. Every finding has remediation tied to the actual content (no boilerplate). Evidence sources populated (E2). Zero false positives on `fail` severity across the 32-fixture corpus. `tests/scoring.test.js` asserts that good content scores high and bad content scores low (C1). Validate edge cases (C3). Integrity source test (C2). | P0 | M | T0 | DONE |
| 036 | Execution | `llms.txt` and `llms-full.txt` generation is optimal: intelligent section extraction, smart scoring-based prioritization, efficient handling of large sites. `sitemap.xml` generation from content tree (new capability). `robots.txt` generation that actually improves crawler access patterns — purpose-aware, registry-aligned, with per-agent reasoning. All three artifacts validated for spec compliance. | P0 | M–L | 035 | DONE |
| 037 | Execution + UX | End-to-end polish: a user with a directory of content walks away with a complete GEO package (audit report + llms.txt + llms-full.txt + sitemap.xml + robots.txt + structured data). CLI UX: progress indicators, helpful errors, clear --help, dry-run everywhere. Text report readable by non-technical users. JSON output self-documenting. CLI branch coverage ≥80% (C4). | P1 | M | 036 | DONE |

### Completed — Pro differentiation (P0 gate GO ✓ 2026-06-28)

| Plan | Type | Outcome | Priority | Effort | Depends on | Status |
|---|---|---|---|---|---|---|
| 038 | Decision + execution | Pro-only structured data: advanced schema types (Course, Event, Recipe, HowTo), multi-type pages, schema validation with Pro-only rules | P0 | M | T0 | DONE |
| 039 | Execution | Pro audit reports: HTML/PDF export, branded Pro reports with charts, comparison mode (before/after), shareable report links | P0 | M–L | 038 | DONE |
| [040](archive/040-pro-ci-cd-integration.md) | Execution | Pro CI/CD integration: native GitHub Actions action, GitLab CI template, status badges, threshold-based PR checks | P1 | M | 039 | DONE |

### Maintained (post-Q0)

| Plan | Type | Outcome | Priority | Effort | Depends on | Status |
|---|---|---|---|---|---|---|
| [022](archive/022-calibrate-profiled-audit-v2.md) | Program slice | Profile-aware v2 model (default switch: v2 is now default, migration note and deprecation warning added) | P1 | L | T0 done | DONE |
| [024](archive/024-align-structured-data-semantics.md) | Execution | Accurate structured-data semantics | P1 | M | 030, 031, 034 | DONE |
| [025](archive/025-harden-llms-artifacts.md) | Execution | Proposal-correct, curated artifacts | P2 | M | 024 | DONE |
| [023](archive/023-add-technical-discovery-audit.md) | Program slice | Phase 1 + 2 done (CLI technical, parseSitemapXml, remote fetch with SSRF guards per security review 2026-06-28) | P2 | L | T0 | DONE |
| [026](archive/026-add-open-source-readiness.md) | Direction | Rule-pack readiness, not another engine | P3 | M | Q0, demand | SUPERSEDED |

### Advisor audit — post-Q0 quality fixes (2026-06-28)

Deep audit at commit `b09a5f8` of `src/` + `bin/cli.js` (470 tests passing, 0
npm-audit vulnerabilities). All findings were verified against the live code
before planning. These are independent, mostly small fixes; execute the quick
cluster (041–043) first. Plans 044/045 touch the experimental v2 model.
Plans 048–050 cover the remaining positive-tradeoff findings from the same audit.

| Plan | Title | Cat | Priority | Effort | Depends on | Status |
|---|---|---|---|---|---|---|
| [041](archive/041-fix-glob-ignore-translation.md) | Glob `**`/`*`/`?` ignore patterns translate correctly; no silent `.gitignore` discard | bug | P1 | S | — | DONE |
| [042](archive/042-add-typecheck-to-ci.md) | CI runs `npm run typecheck` (protect public `index.d.ts`) | dx | P1 | S | — | DONE |
| [043](archive/043-guard-all-artifact-writers.md) | CWD write-guard on robots/sitemap/llmstxt/generate-all writers | security | P2 | S | — | DONE |
| [044](archive/044-v2-safe-correctness-fixes.md) | Score-neutral v2 fixes: missing-h1 remediation, named v2 pronoun limit, reachable low confidence | bug | P2 | S | — | DONE |
| [045](archive/045-v2-quote-heading-detection-accuracy.md) | v2 quote/heading detection (mid-line + curly quotes, HTML DOM order, per-occurrence attribution) — **changes v2 scores** | bug | P2 | M | — | DONE |
| [046](archive/046-cover-sitemap-and-report-escaping.md) | Cover sitemap split/`validateSitemapXml` + HTML-report XSS-escaping regression tests | tests | P2 | S | — | DONE |
| [047](archive/047-fix-generate-all-sitemap-and-reread.md) | Fix `generate-all` sitemap `lastmod`; reuse audited content instead of re-reading | bug | P3 | M | — | DONE |
| [048](archive/048-consolidate-extract-page-metadata.md) | Consolidate `extractPageMetadata` — eliminate title divergence between JSON-LD and llms.txt for H1-less files | bug | P2 | S | — | DONE |
| [049](archive/049-tooling-hygiene.md) | Lint `tests/` (template-literal false positives, dead vars), expand pre-commit hook to lint + format | dx | P2 | S | — | DONE |
| [050](archive/050-core-layering-and-deduplication.md) | Extract `buildExplainLines` helper (scoring.js + renderer.js duplication); `injectSchema` returns result instead of printing | tech-debt | P3 | M | — | DONE |

Recommended execution order and dependency notes:

**Tier 1 — quick, independent, no behavior risk (do first):**
- **041** glob bug (S, P1) — standalone; no dependencies; highest impact
- **042** CI typecheck (S, P1) — standalone; once landed, catches API regressions
  in all subsequent plans
- **043** write-guard (S, P2) — standalone; security fix

**Tier 2 — correctness and coverage (after Tier 1, can run in parallel):**
- **044** v2 score-neutral fixes (S, P2) — standalone; do before 045
- **045** v2 quote/heading accuracy (M, P2) — requires maintainer re-baseline;
  do **after 044**; flag PR for maintainer sign-off per recalibration policy in
  `docs/architecture.md`
- **046** sitemap + XSS tests (S, P2) — standalone; no v2 dependency
- **048** consolidate `extractPageMetadata` (S, P2) — standalone; changes
  JSON-LD title for H1-less files from `"Untitled Document"` to filename;
  **benefits from 042 being done first** (typecheck validates schema.js changes)
- **049** tooling hygiene (S, P2) — standalone; pure tooling, zero behavior
  risk; can run at any time

**Tier 3 — larger refactors, lower priority (do last):**
- **047** generate-all sitemap lastmod (M, P3) — standalone; **benefits from
  042** (adds `AuditResult.content?: string` to `index.d.ts`)
- **050** core layering (M, P3) — standalone; `injectSchema` return-type change
  is a public API change; **benefits from 042** being in CI before the PR lands

Considered and rejected during this audit (do not re-file):

- **`auditFile` is dead code (~128 lines)**: REJECTED. It is a public export
  (`src/index.js:26`) with extensive coverage in `tests/optimizer.test.js` and a
  contract assertion in `tests/artifact.test.js`. The original reporter's
  caller search only covered `src/` and missed the tests. Its rendering+`console`
  mix inside `scoring.js` is real layering debt, tracked under the broader
  "core prints directly" item, not removed.
- **`report --compare` reads an arbitrary JSON path**: by design (the user
  points it at their own baseline report). Not worth a guard.

### Library / dependency adoption — advisor recommendations (2026-06-29)

Positive-tradeoff library adoptions identified while reviewing the dependency
surface at commit `13fb3bf`. The project's posture is deliberate: minimal
dependencies, Node built-ins, security-first (the `src/fetcher.js` zero-dep
SSRF/DNS-rebinding design stays). Each plan below pays its supply-chain cost;
the rejected candidates are listed underneath. Not all will be implemented
immediately — medium/long-term items are reevaluated when the situation
warrants. Short-term items also close monedario.cl audit findings
(`geo-opt-bug-report-2026-06-29.md`).

| Plan | Title | Dep (tier) | Cat | Priority | Effort | Horizon | Depends on | Status |
|---|---|---|---|---|---|---|---|---|
| [051](archive/051-yaml-frontmatter-parsing.md) | Parse YAML frontmatter with `yaml` (fixes stats/quotes/heading leakage #4/#5) | `yaml` (runtime) | bug+feature | P1 | M | short | — | DONE |
| [052](archive/052-fast-xml-parser-sitemap.md) | Parse sitemaps with `fast-xml-parser` (robust index/namespace/CDATA; relates to #2) | `fast-xml-parser` (runtime) | reliability+bug | P2 | M | short | — | DONE |
| [053](archive/053-package-publish-validation.md) | Validate published package with `publint` + `@arethetypeswrong/cli` in CI | both (dev) | dx/release | P2 | S | short | — | DONE |
| [054](archive/054-knip-dead-code-detection.md) | Add `knip` for unused file/export/dependency detection (non-blocking first) | `knip` (dev) | dx/tech-debt | P3 | S | medium | — | DONE |
| [055](archive/055-readability-metrics.md) | Bilingual reading-grade metrics via `text-readability` + custom Spanish formulas (Fernández-Huerta, Szigriszt-Pazos), gated by `lang` option | `text-readability` (runtime) | feature | P3 | M | medium | — | DONE |
| [056](archive/056-schema-dts-typed-jsonld.md) | Type JSON-LD output with `schema-dts` (compile-time vocabulary guard) | `schema-dts` (dev/type-only) | tech-debt | P3 | M | near | — | DONE (2026-07-31) |

Recommended execution order:

**Short term (do first; close real audit findings):**
- **051** `yaml` (P1, M) — highest impact; permanently fixes the frontmatter
  leakage class and unlocks structured-metadata reuse.
- **052** `fast-xml-parser` (P2, M) — robust sitemap reading; pairs with the
  remote technical audit (plan 023). Optional CLI step resolves finding #2.
- **053** `publint` + `attw` (P2, S) — near-zero-cost release-quality gate;
  dev-only; protects the hand-maintained export surface.

**Medium term (reevaluate on demand):**
- **054** `knip` (P3, S) — added non-blocking; promote to a CI gate later once
  the baseline is clean. Triage findings against the "Considered and rejected"
  note above (`auditFile` is NOT dead).
- **055** `text-readability` (P3, M) — has a mandatory language decision gate;
  English-tuned indices must not be emitted for the Spanish content the tool
  audits. May stay DEFERRED if neither demand nor a language strategy exists.

**Near term (unblocked 2026-07-31):**
- **056** `schema-dts` (P3, M) — **DONE** (2026-07-31). Per-file
  `tsconfig.schema.json` (`strict: false`) with JSDoc annotations on the
  JSON-LD builders; `typecheck:schema` wired into `npm run check` and CI.
  `headLine`-style typos now fail the gate (TS2561, verified). Type-only, zero
  runtime cost. Pairs with 053's `attw`.

Considered and intentionally NOT planned (do not re-file without new evidence):

- **`axios` / `got` / `undici` in the fetcher**: REJECTED. `src/fetcher.js`'s
  IP-pinning, per-redirect SSRF re-validation, and DNS-rebinding mitigation are
  not provided out-of-the-box by these clients; swapping would weaken the
  project's strongest security asset. Keep it on Node built-ins.
- **NLP library (`compromise` / `retext`) for acronym/quote/statistic
  detection**: NOT a clear positive tradeoff. `compromise` is English-centric
  while the tool audits Spanish content; the false positives (findings #3/#4)
  are better fixed by improving the detectors directly (acronym/expansion split)
  than by adopting a heavy, language-mismatched dependency. Revisit only if
  multilingual linguistic analysis becomes a requested feature.
- **Vitest/Jest replacing `node:test` + `c8`**: REJECTED. `node:test` is a
  deliberate zero-runtime-test-dependency choice; the DX gain does not justify
  the churn.
- **Biome replacing ESLint + Prettier**: REJECTED. Just upgraded to ESLint 10 /
  Prettier 3.8; no pain to fix.
- **`remark`/`unified` replacing `marked`**: REJECTED for now. `marked` covers
  current needs; revisit only if plugin extensibility becomes necessary.

### Positioning & defect-reporting DX (2026-06-30)

Owner-requested initiative: reframe the product as a three-pillar AI
discoverability toolkit (GEO + structured data + technical SEO) without renaming
the package, and add an opt-in, privacy-safe protocol for the agent to offer a
GitHub Issue when it hits a real `geo-opt` defect.

| Plan | Title | Cat | Priority | Effort | Depends on | Status |
|---|---|---|---|---|---|---|
| [057](057-positioning-and-defect-reporting.md) | Three-pillar umbrella + optional defect-reporting protocol; not the active acquisition message | positioning / dx | P3 | M | 058 for positioning | DEFERRED |

### Accepted security advisories

Advisories that the CI gate (`scripts/check-audit.js`) blocks on are listed
here whenever one is accepted rather than fixed, so a suppression is never
silent. The gate itself carries the full justification.

| Advisory | Package | Sev | Accepted | Recheck | Why unfixable |
|---|---|---|---|---|---|
| [GHSA-mh99-v99m-4gvg](https://github.com/advisories/GHSA-mh99-v99m-4gvg) | `brace-expansion` `<=5.0.7` | high | 2026-07-31 | 2026-10-31 | Bundled inside the npm CLI tarball via `semantic-release` → `@semantic-release/npm` → `npm`; `overrides` cannot reach bundled deps and npm 11.19.0 / 12.0.2 both still ship 5.0.7. Dev-only — `semantic-release` runs only in the Release workflow and is not reachable from published code. |
| [GHSA-rgw5-rvv9-x895](https://github.com/advisories/GHSA-rgw5-rvv9-x895) | `brace-expansion` `5.0.7` (npm-bundled) | high | 2026-08-10 | 2026-10-31 | CVE-2026-14257 bypass (unbounded intermediate arrays). Same bundled-copy class as GHSA-mh99: re-verified 2026-08-10 that npm 11.19.0 (max in-range) and 12.0.2 (latest) still bundle 5.0.7. The direct toolchain copy is fixed at 5.0.9. Dev-only (Release workflow). |
| [GHSA-mwp4-54f8-5fhr](https://github.com/advisories/GHSA-mwp4-54f8-5fhr) | `ip-address` `10.2.0` (npm-bundled) | high | 2026-08-10 | 2026-11-30 | Leading-zero octet parsing (octal vs decimal) enables SSRF/trust-boundary bypass. Bundled inside the npm CLI tarball; `overrides` cannot reach bundled deps and npm 11.19.0 / 12.0.2 both still ship 10.2.0. Dev-only — reachable only from the Release workflow's npm publish path. |

### Deferred (by owner decision 2026-06-27)

| Plan / program | Reason |
|---|---|
| 018 S02–S07 (business validation) | Commercial strategy parked; focus on product quality first |
| 018 S10–S15 (Pro product suite) | Will revisit after Q0+P0 deliver a compelling free→Pro upgrade story |
| 018 S19+ (hosted product) | Requires G4; too far out |
| [027](027-add-engine-adapters-and-freshness.md) | No provider demand yet |
| [028](028-spike-citation-evaluation-loop.md) | Research budget not approved |

### Gate Q0 — quality hardening — GO ✓ 2026-06-28

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

### Gate P0 — Pro differentiation — GO ✓ 2026-06-28

P0 is `GO` when:

- At least 2 Pro-only schema types are executable and tested;
- Pro HTML/PDF report generation works end-to-end;
- At least one CI platform has a native integration (action/template);
- Community edition shows clear upgrade prompts for Pro features;
- README and docs describe the Community/Pro boundary explicitly.

## Business program (ACTIVE — product-led validation)

The active program is [Plan 058](archive/058-relaunch-community-validation.md) followed
by [Plan 059](059-rebaseline-g1-evidence-cohort.md). It is deliberately aligned
with one solo maintainer who prefers quality-led, asynchronous adoption over
selling: truthful documentation, a copy-paste CI/pre-merge path, durable
technical examples, and replies to real inbound feedback.

The current audience is repository-based Markdown/HTML/static-site maintainers,
not agencies as a default sales motion. Do not make the founder's LinkedIn reach
the experiment, solicit consulting, or create a paid funnel. Quality is not a
distribution strategy by itself, so the experiment permits discoverable assets
that remain valuable even if nobody buys.

[Plan 018](018-build-tooltician-ai-discoverability-business.md), the old G1
funnel, and the Community/Pro re-audit are historical business context. They do
not authorize a public Pro launch, Diagnostic, Monitoring, Workspace, or a
feature roadmap. Plan 059's A1/A2/A3 continuation threshold is the only active
commercial gate.

### Pro public-launch viability review (DRAFT)

[`pro-viability/README.md`](pro-viability/README.md) is a parked decision
dossier, not a launch program. It cannot advance during Plan 059. It preserves
four reviewable parts for a future, evidence-backed single-workflow evaluation:

| Part | Decision | Status |
|---|---|---|
| [Community/Pro boundary and offer](pro-viability/01-product-boundary-and-offer.md) | What is paid and whether the US$49 Individual SKU is credible | DRAFT |
| [Entitlement architecture](pro-viability/02-entitlement-architecture.md) | Polar activation, offline grace, API/CLI and Python scope | DRAFT |
| [Commercial, legal and operations](pro-viability/03-commercial-legal-operations.md) | Chilean seller, MoR, terms, tax, refund and support readiness | DRAFT |
| [Launch economics and gates](pro-viability/04-launch-economics-and-gates.md) | Costs, rollout, metrics, rollback and 60-day decision | DRAFT |

Do not review the parts merely because 90 days pass. Reopen them only after
Plan 059 `CONTINUE`, a repeated job, a named paid workflow, and a realistic
solo-maintainer support/economics model. No checkout, public price, licensing
implementation, or broad plan-018 revival is authorized while they remain
DRAFT or ADAPT.

### Selected advisor directions (2026-07-22)

The maintainer selected the net-positive directions and then applied a
solo-founder operating-fit filter. The repository first establishes factual
product truth, then runs one small product-led experiment; it does not treat a
dated social draft, passive metrics, or technical completeness as a business.

| Plan | Status | Decision / outcome | Dependency |
| --- | --- | --- | --- |
| [057](057-positioning-and-defect-reporting.md) | DEFERRED | Keep the three-pillar umbrella factual; keep defect reporting separate | 058 for positioning; actual DX need for Part B |
| [058](archive/058-relaunch-community-validation.md) | DONE | Corrected runtime/documentation truth and established a narrow local-to-CI entry (2026-07-22) | none |
| [059](059-rebaseline-g1-evidence-cohort.md) | TODO | Run a capped 90-day product-led test and record A1/A2/A3 decision | 058; 071 and 072 DONE; owner start date and discoverability surface |
| [060](060-decide-community-pro-boundary.md) | DEFERRED | Evaluate one paid workflow only if product-led evidence and economics justify it | 059 `CONTINUE`; named WTP; capacity model |
| [061](061-prepare-bounded-diagnostic-intake.md) | DEFERRED | Consider a bounded human service only as unsolicited-inbound exception | 059 `CONTINUE`; inbound; owner choice/capacity/economics |
| [062](062-spike-versioned-site-baselines.md) | DEFERRED | Design a baseline only after two independent reports of that job | 059 `CONTINUE`; specific repeated baseline pain |
| [063](063-normalize-generate-all-frontmatter.md) | DEFERRED | Maintenance/DX correction only if a real workflow is blocked | documented workflow block or correctness priority |
| [064](064-spike-three-pillar-preflight.md) | DEFERRED | Design a unified preflight only after two independent combined-workflow reports | 059 `CONTINUE`; specific repeated demand |
| [068](068-license-signing.md) | DEFERRED | Signature-verifiable Pro keys (Ed25519) only once a purchase channel exists; honor system stays until then (audit F-04) | 059 `CONTINUE`; 060 GO; purchase channel |

Only one plan may be in progress. Plan 058 is complete; the immediate product
execution order is 071, then 072, then 059. At the end of a real 90-day
distribution effort, `CONTINUE` permits only
the narrow review in 060; `PARTIAL` permits one evidence-backed onboarding or
positioning adjustment; `MAINTENANCE` freezes commercial and feature expansion
for six months. `DISTRIBUTION INCOMPLETE` is not a market verdict. These plans
retain Plan 018 and the Pro dossier as history without treating them as current
evidence.

### Advisor directions — 2026-07-31 (entry assets, skill discoverability, quality badges)

Direction audit at commit `296b60f` (2026-07-31), `next` variant. All three
plans serve the Plan 059 window (first-run friction, correctness of the
entry surface, durable discoverability) without feature expansion; none
requires product, pricing, or telemetry changes. Execute in order 065 →
066 → 067; they are independent (no cross-dependencies) and the
one-active-plan rule applies.

| Plan | Title | Cat | Priority | Effort | Depends on | Status |
|---|---|---|---|---|---|---|
| [065](archive/065-harden-ci-entry-assets.md) | Fix and test the CI entry assets (GitLab template include URL org 404; GitHub Action + GitLab score parse reads nonexistent `score` field — real field is `effectiveScore`, verified; document the action in README; contract test pins org/field/model default) | dx/docs | P1 | S | — | DONE (2026-07-31; squash-merged as `d550d08`) |
| [066](archive/066-make-agent-skill-discoverable.md) | Make the bundled `geo-optimization` agent skill discoverable: README section (en+es), architecture-doc pointer; packaging note stays repo-only (skill paths are repo-layout-relative; npm `files` inclusion is a separate decision) | docs/direction | P2 | S | — | DONE (2026-07-31; squash-merged as `e4a680c`) |
| [067](archive/067-verify-and-wire-quality-badges.md) | Verify quality badges against live runs: wire existing `check-test-count.js` into `npm run check` + CI; new `check-coverage.js` (c8 text-summary, floor semantics — measured branch coverage 80.88% ≥ badge 80, verified 2026-07-31) | dx | P3 | S | — | DONE (2026-07-31; squash-merged as `3a0444f`) |

Recommended order rationale: 065 first — it repairs the copy-paste CI
surface that Plan 059 will point users at (a broken GitLab include 404s
before the user runs anything; the action's score/badge always report 0);
do it before the 90-day observation clock starts if possible. 066 and 067
are cheap truth/discoverability wins that fit the one-day-per-week budget.

Considered and rejected during this audit (do not re-file without new
evidence):

- **`tmp-cli-*` files and `deep-research/` in the repo root**: REJECTED —
  both are locally ignored (`.git/info/exclude`, `.gitignore`); not public
  hygiene issues.
- **`README.es.md` out of sync**: REJECTED — heading parity verified.
- **Stale `docs/architecture.md` wording about the `technical` CLI**:
  REJECTED — already reconciled (2026-07-22).
- **Python port removal / v2-parity expansion**: REJECTED — documented
  capability-boundary decision (plan 034, capability matrix); no new
  demand evidence.
- **GitHub Action end-to-end smoke test in a scratch public repo**:
  deferred to post-065 execution; out of scope for the plan itself.
- **Aborting DNS resolution via AbortSignal** (post-077 audit, 2026-08-03):
  REJECTED with empirical evidence — `dns.promises.resolve4(hostname,
  { signal })` ignores the signal and `dns.promises.lookup` resolves
  normally even with an already-aborted signal (verified on Node v24.15.0
  for `localhost` and `example.com`). Node's name-resolution APIs do not
  honor AbortSignal in this runtime; closing the Plan 077 STOP #1 gap would
  need a worker-process resolver (disproportionate). See plan 092.

### Advisor deep audit — 2026-08-02 (implementation handoffs 069–091)

Deep whole-repository audit at commit `888d3e7`. The maintainer selected every
net-positive finding for implementation planning. These 23 plans are
self-contained handoffs; none authorizes source changes merely by existing.
Dependencies, not numeric order alone, determine readiness. The one-active-plan
operating rule still applies unless the maintainer explicitly parallelizes
independent work.

| Plan | Title | Cat | Priority | Effort | Depends on | Status |
|---|---|---|---|---|---|---|
| [069](archive/069-match-audit-advisories-by-stable-identity.md) | Match accepted npm advisories by stable GHSA plus reviewed installed surface | security/dx | P1 | S | — | DONE (2026-08-02; squash-merged to main as `db423ac`) |
| [070](archive/070-make-evidence-freshness-tests-deterministic.md) | Inject a deterministic clock into evidence-freshness tests | tests/bug | P1 | S | — | DONE (2026-08-02; squash-merged to main as `04fcd49`) |
| [071](archive/071-repair-github-composite-action.md) | Execute GitHub Action inputs as safe argv | bug/dx | P1 | S | 069, 070 | DONE (2026-08-02; squash-merged to main as `eca2aa4`) |
| [072](archive/072-correct-ci-wrapper-score-and-entitlements.md) | Report aggregate CI scores and truthful Community/Pro semantics | bug/docs | P1 | M | 071 | DONE (2026-08-02; squash-merged to main as `8b2c3ad`) |
| [073](archive/073-make-fetcher-tests-hermetic.md) | Make fetcher tests local, deterministic, and behavior-specific | tests | P1 | M | 069, 070 | DONE (2026-08-02; squash-merged to main as `92af2d9`) |
| [074](archive/074-cover-https-ip-pinning.md) | Deterministically cover TLS hostname verification and vetted-IP pinning | security/tests | P1 | M | 073 | DONE (2026-08-03; squash-merged to main as `e6e418d`) |
| [075](archive/075-enforce-remote-hop-policy.md) | Apply HTTPS/origin policy to roots, redirects, robots, sitemaps, and pages | security | P1 | L | 073, 074 | DONE (2026-08-03; squash-merged to main as `2ab56ed`) |
| [076](archive/076-bound-sitemap-url-accumulation.md) | Bound total retained sitemap page URLs | security/perf | P1 | M | 075 | DONE (2026-08-03; squash-merged to main as `aa7738a`) |
| [077](archive/077-enforce-total-redirect-timeout.md) | Share one timeout deadline across redirects and body reads | bug/security | P1 | M | 073 | DONE (2026-08-03; squash-merged to main as `7f29992`) |
| [078](archive/078-fix-robots-group-and-query-matching.md) | Combine equally specific robots groups and include query strings | bug | P2 | M | 073 | DONE (2026-08-03; squash-merged to main as `c85ee5d`) |
| [079](archive/079-honor-fetcher-user-agent.md) | Honor and validate the public fetcher user-agent option | bug/api | P2 | S | 073 | DONE (2026-08-03; executed in worktree as `912f525`, reviewed and APPROVED — squash-merge to main pending) |
| [080](archive/080-redact-source-content-from-summaries.md) | Remove audited source bodies from serialized summaries | privacy/bug | P1 | S | — | DONE (2026-08-09; squash-merged to main as `b240a24`) |
| [081](archive/081-reconcile-public-types-and-exports.md) | Synchronize runtime exports, declarations, profiles, and batch signatures | api/types | P1 | M | — | DONE (2026-08-09; merged to main as `13bdfeb`) |
| [082](archive/082-enforce-jsonld-validation-results.md) | Return structured validation results and fail invalid JSON-LD | bug/api | P1 | M | 081 | DONE (2026-08-09; merged to main as `13bdfeb`) |
| [083](archive/083-close-symlink-write-escapes.md) | Route every Node/Python artifact destination through atomic symlink-safe writes | security | P1 | L | — | DONE (2026-08-09; merged to main as `876edbd`; audited 2026-08-09 — parent-swap TOCTOU closed, strict dest-dir, binary-exact Python copies, mode parity — as `HEAD`) |
| [084](archive/084-align-python-artifact-contracts.md) | Align documented Python schema/llms artifact outcomes with Node | bug/docs | P2 | M | 083 | DONE (2026-08-09; merged to main as `d0414e5`; audited 2026-08-10 — `.htm` parity, empty-section/missing-field tolerance, numeric-only score demotion — as `HEAD`) |
| [085](archive/085-remove-v2-predictive-wording.md) | Remove remaining ranking/citation/discovery predictions from v2 copy | product-truth | P1 | M | — | DONE (2026-08-10; merged to main as `232f981`) |
| [086](archive/086-lint-javascript-tests.md) | Restore JavaScript test files to the ESLint gate | dx/tests | P2 | S | 069, 070 | DONE (2026-08-10; executed in worktree; lint gate covers all `tests/` incl. a `setImmediate` test-only global; check-audit dup-key and 11 dead `fetches` counters removed; merged to main as `7de61d8`) |
| [087](archive/087-run-the-js-suite-once-per-gate.md) | Verify tests and badges from one suite/coverage run | perf/dx | P2 | M | 073, 086 | DONE (2026-08-10; executed as `npm run test:verify` — one c8 suite run verifies the count and coverage badges, wired into `check` and both CI legs; `check-test-count.js`/`check-coverage.js` superseded by `verify-badges.js`; adversarial audit same day: flush-wait before parsing, clean malformed-output and missing-c8 handling, 15 unit tests; merged to main as `4f767b2`) |
| [088](archive/088-make-stat-attribution-linear.md) | Retain statistic offsets and remove quadratic rescans | perf | P3 | S | — | DONE (2026-08-10; executed in worktree — one `matchAll` scan captures every stat occurrence index for filtering and windows, quotes resolve via one indexOf pass per distinct needle; adversarial audit same day: A/B-verified identical output vs pre-refactor code on 33 cases, 11 tests incl. scan-work counter + window-boundary clip pins; corpus scores unchanged; merged to main as `1e70be8`) |
| [089](archive/089-prepare-v2-documents-once.md) | Reuse one prepared document across v2 profile/observation/scoring | perf/architecture | P3 | L | 088 | DONE (2026-08-10; executed as `b1ca805` — `prepareDocument` built once per call and shared by profile detection, observations and clarity; `observeAndParse` no longer re-parses; public APIs unchanged; A/B-verified byte-identical reports on 33 corpus fixtures × 2 configs + 13 edge/malformed inputs; 12 parse-count/opts tests pin one preprocess/extract/lex per call, no cross-call caching) |
| [090](archive/090-render-python-audits-without-rescoring.md) | Render stored Python reports instead of rereading/rescoring | perf/architecture | P3 | M | 084 | DONE (2026-08-10; executed as `06d16d2` — pure `_render_text_report` consumes batch reports, CLI text mode scores each file once (call-count regression, proven to fail pre-fix), text byte-identical to `audit_file` across 10 fixtures; direct `audit_file`, JSON/summary/threshold unchanged; 74 Python tests green) |
| [091](091-correct-default-model-documentation.md) | Make normative current docs consistently name v2 as default | docs | P2 | S | 085 | TODO |
| [092](archive/092-harden-shared-deadline-edges.md) | Close audit gaps of 077: entry-check test, timer-abort test bounds, request-creation timer cleanup | tests/robustness | P2 | S | 077 (DONE `7f29992`) | DONE (2026-08-03; squash-merged to main as `0a7844b`) |
| [093](archive/093-pin-entry-check-no-connection-semantics.md) | Pin the entry-check test's "no connection" semantics with timeoutMs 0 + sockets assert | tests | P3 | S | 092 (DONE `0a7844b`) | DONE (2026-08-03; squash-merged to main as `17708ed`) |
| [094](archive/094-close-robots-parser-and-parity-gaps.md) | Close robots parser and Node/Python parity gaps (audit follow-up of 078: comma agents, comment group-breaks, Python single-group semantics, matchedGroup case dedup, H5/H6 pins) | bug/parity | P2 | M | 078 (DONE `c85ee5d`) | DONE (2026-08-03; squash-merged to main as `529dd3b`) |
| [095](archive/095-close-robots-ghost-groups-and-cli-parity.md) | Close robots ghost groups and pin CLI parity (audit follow-up of 094: empty comma lists create no group, CRLF/BOM pins, Node↔Python CLI JSON parity pin) | bug/parity/tests | P3 | S | 094 (DONE `529dd3b`) | DONE (2026-08-03; squash-merged to main as `3a08151`) |
| [096](archive/096-close-fetcher-user-agent-audit.md) | Close the fetcher user-agent audit (adversarial follow-up of 079: propagate `ERR_INVALID_USER_AGENT` out of `fetchRobotsTxt` without cache poisoning, reject all header control chars except HTAB before any I/O, key the robots cache by origin + effective UA) | bug/tests | P2 | S | 079 (DONE `912f525`) | DONE (2026-08-03; executed as `0e59047` on `advisor/096-fetcher-user-agent-closure`, APPROVED — squash-merge pending) |

Recommended execution waves:

1. **Restore trust in gates and entry path:** 069 → 070 → 071 → 072. Plan 059
   must not start before 071 and 072 are DONE.
2. **Characterize before network hardening:** 073 → 074 → 075, then 076;
   after 073, 077–079 are independent of one another except for overlaps that
   must be rebased through the one-active-plan rule.
3. **High-value independent contracts/security:** 080, 081 → 082, 083 → 084,
   and 085. These can be scheduled around the network chain by leverage.
4. **Tooling and performance:** 086 → 087; 088 → 089; 084 → 090; 085 → 091.

Dependency summary:

```text
069 + 070 ──┬──> 071 ──> 072 ──> 059
            ├──> 073 ──> 074 ──> 075 ──> 076
            │       ├──> 077
            │       ├──> 078
            │       ├──> 079 ──> 096
            │       └──> 087 <── 086
            └──> 086

081 ──> 082          083 ──> 084 ──> 090
088 ──> 089          085 ──> 091
080 independent
```

Reconciliation with completed history:

- Archived Plan 065 pinned static CI asset fields; 071/072 cover executable
  argv behavior and aggregate semantics it did not test.
- Archived Plan 031 synchronized the then-current API; 081 adds a durable
  runtime/declaration parity gate after new exports and `service` drifted.
- Archived Plan 043 and audit F-12 guarded parents/known targets; 083 closes
  final-destination symlink and backup gaps across all Node/Python writers.
- Archived Plan 049 intended to lint tests, but `package.json` no longer does;
  086 restores that executable gate against the verified 15-error baseline.
- Archived Plan 067 established badge checks; 087 reuses one run rather than
  removing either badge invariant.

All 23 current findings were selected and planned. No finding from this audit
was rejected. Historical rejected/deferred decisions elsewhere in this index
remain in force unless a plan explicitly presents new evidence.

### Solo-founder operating guardrails

- Cap Plan 059 at one focused day per week for 90 calendar days.
- Spend that time only on correctness, first-run friction, one integration
  path, durable documentation/examples, and real inbound feedback.
- Do not build or sell Pro, services, Workspace, Monitoring, or speculative
  features during the window; do not make personal LinkedIn reach the channel.
- If the hard continuation threshold is missed after real distribution, keep
  the package healthy in six-month maintenance mode rather than inventing a new
  commercial program.

## Reconciliation of pre-T0 plans

- **022:** corpus, profiles, observations, v2 flag and characterization docs landed.
  Contract normalization, type coverage, orchestration, conformance, and Python
  scope closed by plans 029–034 (T0 complete 2026-06-27). v2 is now the default
  scoring model; v1 remains available via `--model v1` (deprecated).
- **023:** DONE. Pure local HTML observations, CLI `technical`, sitemap parsing,
  remote URL/sitemap audit and `src/fetcher.js` SSRF-guarded network boundary
  landed. Python intentionally has no `technical` subcommand per the capability
  matrix. The former stale architecture wording about no supported `technical`
  CLI was reconciled on 2026-07-22.
- **024:** DONE (Q0+P0 delivered structured-data correctness; archived).
- **025:** DONE (artifact hardening completed after 024; archived).
- **026:** SUPERSEDED — became rule-pack direction but low demand; archived.
- **027:** crawler metadata and evidence freshness partially landed elsewhere.
  Deferred until provider demand materializes.
- **028:** research spike, not production backlog.

## Completed history

Plans 001–017, 019–021, 023–026, 029–056, 058, 065–067, 069–076 are
completed and stored under [`archive/`](archive/). The prior audit register is
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
