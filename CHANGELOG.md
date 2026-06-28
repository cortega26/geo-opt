# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `geo-opt report` command (Pro): generates standalone HTML audit reports with SVG score
  gauges, dimension bar charts, and print-ready styling (open in browser, use File > Print >
  Save as PDF). Supports single-file, multi-file aggregate, and before/after comparison mode
  (`--compare <baseline.json>`). License-gated: exits non-zero without a Pro key.
- `renderV1ReportHtml`, `renderV2ReportHtml`, `renderAggregateReportHtml`, `renderComparisonHtml`
  pure renderer functions in `src/html-report.js`. Exported from `src/index.js` and typed
  in `index.d.ts` (`HtmlReportOptions` interface).
- 7 new tests in `tests/optimizer.test.js` covering HTML structure, branding suppression, SVG
  gauge presence, V2 profile display, aggregate site report, comparison delta rendering, and CLI
  Pro gate.

- Pro-only schema types: `course`, `event`, `recipe`, `howto` in `generateSchemaData`. Pro types
  require a valid Tooltician Pro license key; Community users receive a descriptive upgrade error.
  Multi-type support via comma-separated values (e.g. `course,howto` in one `@graph`).
- Exported `COMMUNITY_SCHEMA_TYPES` and `PRO_SCHEMA_TYPES` sets from `src/schema.js` and the
  public API (`src/index.js`, `index.d.ts`). New `CommunitySchemaType`, `ProSchemaType`, and
  `SchemaType` type aliases in `index.d.ts`.
- `validate.js` `REQUIRED_FIELDS` extended with Course, Event, Recipe, and HowTo required fields
  per Schema.org guidelines.
- Schema CLI description now lists Community and Pro types with multi-type example.
- 12 new tests in `tests/optimizer.test.js` covering Pro type generation, entitlement gating, recipe
  ingredient/step extraction, HowTo section and numbered-list extraction, and multi-type combos.

- Behavior tests for JSON-LD validation outcomes (`tests/validate.test.js`):
  file-not-found exits 1, no-block info message, valid schema, missing required
  fields, HTML script-tag extraction, multi-block count, and unknown-type note.
- Integrity staging tests (`tests/integrity.test.js`): post-build success
  (hash matches), mismatch degrades `hasProEntitlement` to the fallback, and
  missing `licensing.js` activates the tamper guard.
- Python syntax gate in `npm run lint`: `python3 -m py_compile` now runs
  against both Python source files as part of the standard lint step.

### Fixed

- Coerced `hasTable`, `hasList`, and `hasHeaders` boolean findings to avoid `null` outputs for Markdown documents when HTML structure is absent.
- Preserved caught errors in exceptions by attaching the original `cause` inside catch blocks.
- Fixed a broken CLI import of `scoreContentV2` and removed unused imports in `bin/cli.js`.
- Fixed JavaScript unit tests for `auditFile` and `validateSchemaFile` to assert exception throwing instead of `process.exit(1)`.
- Prefixed unused `htmlMeta` parameter with `_` in `observeAttributionProximity` in `src/observations.js` to resolve ESLint `no-unused-vars` error.

### Changed

- Minimum supported Node.js raised from 20 to **22**. Node.js 20 reached EOL
  on 2026-03-24. Supported LTS lines are Node.js 22 and Node.js 24.
- CI matrix updated to test Node.js 22 and Node.js 24 (previously Node.js 20
  only).
- CI now installs Python dependencies from the canonical
  `.agents/skills/geo-optimization/scripts/requirements.txt` file instead of
  listing package names directly.
- `no-unused-vars` ESLint rule changed from `warn` to `error`; previously
  tolerated six warnings are resolved. Lint now fails on any new unused symbol.
- Removed unused imports/assignments in `src/scoring-v2.js` (`marked`,
  `EVIDENCE_REGISTRY`, orphaned `textContent` and `tokens` assignments) and
  prefixed intentionally-unused function parameters with `_` in
  `src/observations.js`. Removed unused `lower` local in `src/profiles.js`.

- Dormant, opt-in telemetry scaffold (`src/telemetry.js`): a consent gate and a
  frozen, content-free event schema (`schemaVersion: 1`). The transport is
  disabled (`TELEMETRY_TRANSPORT_ENABLED = false`), so no prompt is shown and no
  network activity occurs — "no telemetry by default" stays literally true. New
  `geo-opt config get|set telemetry true|false` preference, `GEO_OPT_TELEMETRY`
  override, and `DO_NOT_TRACK` support. Design and activation checklist in
  `docs/telemetry.md`. Covered by `tests/telemetry.test.js`.
- Reproducible publish artifact: `npm run build` now stages `src/` and `bin/`
  into `dist/` without touching tracked source files. The published package
  ships `dist/` exclusively; `npm pack` and `npm publish` both use `prepack`
  so they inspect and release the same artifact.
- Artifact test suite (`tests/artifact.test.js`) covering: build idempotency,
  source-file purity, deterministic hash embedding, patched CLI imports, CLI
  help smoke-test, and library entry-point exports from the staged layout.

### Changed

- Replaced the source-mutating `prepublishOnly` + `git checkout` `postpublish`
  lifecycle pair with a single `prepack` hook that writes only to `dist/`.
- Removed the `javascript-obfuscator` devDependency: the obfuscator is
  non-deterministic under its current configuration (dead-code injection and
  self-defending vary per run), which violates the reproducible-artifact
  requirement of plan 032. Licensing integrity is preserved through SHA-256
  hash verification of the unobfuscated `dist/licensing.js`.
- `package.json#main` updated to `dist/index.js`; `bin.geo-opt` updated to
  `./dist/bin/cli.js`. Local development and tests continue to use `src/` and
  `bin/cli.js` directly.



- Pure local technical-discovery audits for supplied HTML, covering titles,
  visible text, canonical links, meta robots, heading order, language and
  hreflang declarations, link targets, JSON-LD/text consistency, and cautious
  empty app-shell signals with versioned evidence-labeled findings.
- **Profile-aware audit model v2** (opt-in via `--model v2`):
  - Seven content profiles (documentation, open-source, editorial, commercial,
    ecommerce, regulated) with explicit dimension applicability.
  - Section-level observation engine using marked AST and cheerio DOM for
    heading hierarchy, section self-containment, paragraph distribution,
    answer-first structure, attribution proximity, content freshness, semantic
    HTML, and link quality.
  - Readiness bands (production-ready, solid, needs-work, at-risk) replacing
    the 0–100 pseudo-precise total.
  - Auto-detection with confidence scores and explicit `config.profile` override.
  - Profile-aware: documentation and open-source are not penalized for lacking
    quotes or statistics. Regulated content is not penalized for lacking quotes.
  - V1 remains the default. Migration path is user-driven.
- A characterization corpus of 32 fixtures across 7 categories including
  adversarial cases (fake stats, unattributed quotes, link farms, empty
  headers, keyword stuffing, auto-generated content).
- Fixture validator confirming every profile and edge case is represented.
- Evidence-labeled findings bridge (`mapObservationsToFindings`) mapping
  structural observations to the versioned finding contract.
- A versioned finding contract (`src/findings.js`) with stable namespaced
  `ruleId`s, severity levels, evidence labels, source references, observed
  facts, and remediation hints. Every audit report now includes machine-readable
  `findings` alongside legacy scores and recommendations.
- An evidence registry (`src/evidence.js`) that links scoring rules to their
  supporting sources (papers, official docs, community proposals) with
  verification dates and staleness warnings.
- `topFindings` aggregation by `ruleId` in site-level summary reports,
  complementing the existing prose-based `topRecommendations`.
- `--explain` flag for `geo-opt audit` that displays evidence labels and
  primary source references alongside findings in text output.
- A versioned, purpose-aware crawler registry and structured `robots.txt`
  audits with JSON CLI output.
- Explicit `search-visible` and `open` crawler-policy presets with JavaScript
  and Python compatibility.
- `geo-opt validate` for inspecting JSON-LD blocks, required Schema.org fields,
  and malformed structured data.
- A prepublish obfuscation and runtime-integrity mechanism for the Pro licensing
  module. The current source-mutating release workflow is documented as a
  pre-release hardening item rather than a security boundary.

### Changed

- Scoring thresholds are now documented as configurable project heuristics,
  not platform facts.
- Recommendations are profile-aware: documentation is no longer told to add
  quotes; legal content is no longer told to add decorative statistics.
- Python compatibility for legacy audits, batch injection, aggregate reports,
  `llms.txt`, and purpose-aware `robots.txt` generation. V2 and technical HTML
  audits remain Node-only.
- TypeScript declarations (`index.d.ts`) for the public API available before
  the experimental v2 export; complete export/type conformance remains a
  pre-release gate.
- CI/CD pipeline (`.github/workflows/ci.yml`) running lint, format, JS tests,
  Python compatibility tests, changelog policy, and npm audit on PRs and pushes
  to main.

- Audit reports now include `reportVersion`, `modelVersion`, and `generatedAt`
  metadata fields alongside the existing breakdown and recommendations.
- Migrated CLI parsing and terminal output to Commander and Chalk, HTML parsing
  to Cheerio, Markdown parsing to Marked, and config validation to Zod.
- Refined the public documentation around local-first operation, current
  capabilities, commercial availability, and evidence-backed limitations.
- Expanded package metadata for JSON-LD, crawler policy, `llms.txt`, and AI
  discoverability use cases.
- Deduplicated `TOOLTICIAN_BRANDING_*` constants: defined canonically in
  `src/schema.js`, imported by `src/batch.js`.
- Moved `cleanHtmlText` and `truncateDescription` to `src/text.js` as the
  canonical home; both `src/schema.js` and `src/llms-txt.js` import them.
- Extracted `buildInjectedContent()` from `injectSchema` and `batchInject`,
  eliminating ~45 lines of duplicated injection logic.
- Hoisted verbal-statistics RegExp patterns to module scope in
  `src/scoring.js` to avoid recompilation per file during batch audits.
- Moved `import path from "path"` to the top of `src/llms-txt.js`.

### Fixed

- Normalized every model v2 finding through the `createFinding` factory so all
  published findings carry the complete contract (`category`, `severity`,
  `evidenceLabel`, `applicability`, `sourceRefs`, `observedFacts`,
  `remediation`). Dimension scorers and the observation bridge no longer emit
  reduced or `status`-only shapes, and the factory now rejects an invalid
  `severity` or missing `category` at its boundary.
- Gave the v1 and v2 scoring models distinct, unambiguous model identities
  while keeping a single shared report-contract version (`REPORT_VERSION`). The
  default v1 model keeps its established `modelVersion` `2.0.0`; the profile-aware
  v2 model now reports a distinct `2.1.0`. Both models previously reported
  `2.0.0`, so persisted reports could not identify which algorithm produced them.
- Site summaries aggregate only validated findings, so no `topFindings` entry
  can omit `category` or `evidenceLabel`.
- A model v2 audit no longer records a successful free injection, so audits can
  no longer advance the support-reminder engagement state; only a real schema
  injection does.
- Completed Python compatibility for the legacy versioned, evidence-labeled
  audit report on a shared cross-runtime fixture, with aligned Markdown
  blockquote counting.
- Ensured the main CI workflow fetches pull-request base history before running
  the changelog policy check.
- Generated crawler-specific groups now preserve sensitive `Disallow` paths,
  preventing broad `Allow: /` rules from bypassing the wildcard policy.
- Corrected the JSON-LD validator's suggested schema command.
- Aligned TypeScript declarations with the runtime API by documenting
  `validateSchemaFile` and removing two internal-only helpers.
- Reworded audit and crawler output to distinguish search, training, and
  user-directed agents and to avoid guarantees of indexing or citation.
- Dot-prefixed entries (`.git`, `node_modules`, etc.) are now correctly
  skipped during recursive directory walking when no `.gitignore` is present.
- `batchInject` now validates path confinement via
  `validateWritableTargetInsideCwd`, closing the symlink security gap that
  single-file `injectSchema` already enforced.
- Test coverage for `bin/cli.js` raised from 61% to 80%, covering error
  paths in `audit`, `inject`, `llmstxt`, `config`, and `init` commands.

### Docs

- Added a documentation-governance model defining sources of truth,
  invariants, public contracts, plan lifecycle and change-triggered reviews.
- Reconciled the architecture guide and bundled skill with the actual
  Node/Python capability matrix, including Node-only v2 and technical audits.
- Clarified that the v2 corpus provides regression characterization rather than
  statistical calibration against live retrieval or citation outcomes.
- Documented Node.js 20's EOL status while preserving the current manifest as
  the implementation source of truth until the runtime migration lands.

### Security

- Added `validateWritableTargetInsideCwd()` as a batch-safe alternative to
  `assertWritableTargetInsideCwd()` that returns a result object instead of
  calling `process.exit`, enabling path traversal checks in batch operations.
  `.gitignore`-aware file discovery, aggregate site-level reports (`--summary`),
  and multi-file schema injection (`inject --recursive`).
- `scoreContent()` pure function for scoring without I/O side effects, enabling
  batch-safe audit loops (`src/scoring.js`).
- `discoverFiles()` for directory walking with ignore-pattern support via
  `.gitignore`, `geo_config.json` ignore list, and CLI `--ignore` flags
  (`src/discovery.js`).
- `auditFiles()` batch wrapper collecting per-file results without
  `process.exit` on errors; `aggregateReport()` computing site-level statistics
  (average, median, std deviation, score distribution, top recommendations,
  worst pages); `batchInject()` for safe multi-file schema injection
  (`src/batch.js`).
- Config schema extended with optional `ignore` and `allowedExtensions` fields.
- `llms.txt` generation and audit (`geo-opt llmstxt generate`, `geo-opt llmstxt audit`)
  following the llmstxt.org community proposal: automatic H1 title + blockquote summary,
  directory-based H2 sections, `## Optional` for low-score pages, and
  `llms-full.txt` full-content compilation via `--full`.
- `robots.txt` generation (`geo-opt robots generate`) producing a reviewable
  draft that explicitly allows all 14 configured AI agents with customizable
  `--disallow` paths and `--sitemap` URL.
- `extractPageMetadata()` for H1 title, intro description, and section extraction
  from Markdown and HTML (`src/llms-txt.js`).
- `auditLlmsTxt()` for checking llms.txt spec compliance and site coverage
  (`src/llms-txt.js`).

- Test coverage measurement via `npm run test:coverage` (c8).
- Added an enforced changelog policy for code changes, with local verification
  and GitHub Actions coverage.
- Added CLI contract and Python compatibility coverage for JSON output, robots
  semantics, config failures, HTML schema replacement, and symlink write guards.

### Changed

- Changed `npm run check` to include the Python compatibility test suite.
- Reframed the GEO score documentation as an uncalibrated heuristic inspired by
  the GEO framework.

### Fixed

- Fixed injection write authorization to resolve symlinks before allowing
  writes or backups outside the working directory.
- Fixed JSON audit mode so batch and thresholded runs emit a single parseable
  JSON object or array on stdout while diagnostics stay on stderr.
- Fixed explicitly supplied malformed config files to fail closed.
- Fixed HTML schema descriptions and replacement of existing JSON-LD script tags
  with quoted or unquoted `type` attributes.
- Fixed robots audits to focus on AI crawlers and wildcard groups while honoring
  root-level `Allow`/`Disallow` precedence.

### Docs

- Added `AGENTS.md` as the canonical AI-agent instruction file and reduced
  `CLAUDE.md` to a compatibility pointer.
- Introduced an evidence vocabulary (`strong`, `probable`, `experimental`,
  `project heuristic`) in README, the bundled GEO skill, and architecture docs
  so that every recommendation carries a verifiable research-support label.
- Reframed prescriptive GEO heuristics (fixed word counts, quote counts,
  statistics counts, and pronoun thresholds) as observable heuristics with
  audience and context checks, and added explicit prohibitions against
  fabricating evidence.
- Corrected platform-specific positioning: `llms.txt` is an inference-time
  community proposal not used by Google Search, Schema.org structured data
  powers supported Search features rather than a special GEO mechanism, and
  MCP is agent integration rather than web ranking.

## [2.0.0] - 2026-06-25

### Added

- Added source-available Community and Commercial licensing, preserving the
  historical MIT grant through commit `67f18be`.
- Added Tooltician Pro entitlement support and the `--no-branding` option.
- Added neutral `Optimized with Tooltician` branding for Community injections.
- Added local, non-blocking support reminders after sustained interactive use,
  limited to once per week and permanently user-disableable.
- Added `geo-opt config get|set reminders` in both JavaScript and Python.
- Added batch auditing, score thresholds, dry runs, backups, enhanced verbal
  statistic detection, and HTML/Markdown structured-data injection.
- Added maintained engineering findings and paid-offering roadmap documents.

### Changed

- Split the JavaScript implementation into focused domain modules.
- Changed unconfigured schema generation to omit author, publisher,
  publication date, price, availability, and other unsupported claims.
- Restricted npm package contents to runtime, product documentation, and
  licensing files.
- Updated the package version to 2.0.0 for the licensing and behavior changes.

### Security

- Added injection path restrictions, signature sanitization, and JSON-LD
  `</script>` breakout protection.

## [1.0.0] - 2026-06-25

### Added

- Initial zero-dependency GEO audit CLI.
- Markdown and HTML scoring, Schema.org generation, schema injection, and
  robots.txt auditing.
- JavaScript and Python implementations with baseline tests and tooling.

[Unreleased]: https://github.com/cortega26/GEO-skill/compare/v2.0.0...HEAD
[2.0.0]: https://github.com/cortega26/GEO-skill/compare/67f18be...v2.0.0
[1.0.0]: https://github.com/cortega26/GEO-skill/commits/67f18be
