# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Security

- Hardened temporary file names in engagement and telemetry state writes with
  `crypto.randomBytes(8)` suffix to prevent predictable PID-based temp file
  attacks (OWASP audit finding).
- Fixed IPv6 literal detection in `detectIpLiteral`: Node.js 22+ URL parser
  returns bracketed IPv6 addresses (`[::1]`) which were not recognized as IP
  literals, bypassing SSRF guards for loopback and private IPv6 ranges.
- Added 8 SSRF regression tests covering known private IPv4/IPv6 addresses
  (10.0.0.1, 192.168.1.1, 172.16.0.1, 127.0.0.1, 0.0.0.0, ::1, fe80::1,
  fd00::1).

### Added

- Added a release publishing workflow that publishes `geo-opt` to npm through
  Trusted Publishing/OIDC and to GitHub Packages with `GITHUB_TOKEN`.
- `geo-opt technical` now supports remote URL auditing via `--url` and `--sitemap` flags
  (Phase 2 of plan 023). Remote fetching includes DNS rebinding mitigation, private-IP
  blocking (with `--allow-private` and `--allow-localhost` overrides), configurable
  timeouts (`--timeout`), response-size limits (`--max-size`), robots.txt integration
  (`--no-robots` to disable), and per-host/global rate limiting.
- `src/fetcher.js`: new module for network access with SSRF guards — the single
  entry point for all outbound HTTP requests. Uses only Node.js built-in modules.
- `fetchUrl(url, options)` — public API for fetching remote HTML with IP validation,
  DNS rebinding protection (connect to resolved IP, send original Host header),
  redirect tracking with per-hop SSRF re-validation, and timeout/size controls.
- `fetchRobotsTxt(origin, options)` — fetches and parses robots.txt for an origin
  with in-memory caching. Reuses `parseRobotsGroups` from `src/robots.js`.
- `checkRobotsRule(url, groups, userAgent)` — evaluates a URL against parsed
  robots.txt group rules.
- `parseRobotsGroups` is now a public export from `src/robots.js`.
- TypeScript declarations for `FetcherOptions`, `FetchResult`, `RobotsGroup`,
  `RobotsRuleCheck`, and related functions in `index.d.ts`.

### Changed

- HTML link analysis now rejects non-HTTP URI schemes such as `data:`,
  `javascript:`, and `vbscript:` instead of counting them as internal links.
- `geo-opt generate-all` now reuses audited content for full-text generation
  instead of re-reading by path, and file discovery skips symlinked inputs.
- The bundled Python compatibility script now validates its local engagement
  state path before atomic writes.
- `auditLlmsTxt` now returns three separate arrays — `issues` (hard errors), `notes`
  (informational recommendations), and `warnings` (safety concerns) — instead of a single `issues`
  list. Only a missing H1 makes `valid: false`, consistent with the llmstxt.org proposal which
  requires only H1. Missing blockquote and H2 sections are now `notes`.
- `auditLlmsTxt` detects duplicate URLs, unsafe URL schemes, and private-path links and reports
  them as `warnings`.
- `generateLlmsTxt` no longer curates pages into `## Optional` based on GEO score by default.
  Set `entry.optional = true` to explicitly mark a page as optional. The legacy
  `optionalThreshold` option still works as a deprecated opt-in (emits a stderr warning) and will
  be removed in a future release.
- `geo-opt llmstxt audit` output now shows errors in red, warnings in yellow, and recommendations
  in cyan, with separate labelled sections.
- `LlmsAuditReport` TypeScript interface gains `notes: string[]` and `warnings: string[]` fields.
- `LlmsEntry` TypeScript interface gains `optional?: boolean` field.
- `optionalThreshold` in `generateLlmsTxt` options is marked `@deprecated` in types.
- The v2 pronoun-density ceiling is now the named constant `MAX_PRONOUN_DENSITY_V2`
  (value unchanged at 0.05) to make its intentional divergence from v1 explicit.
- ESLint config now allows template literals (removing ~20 false-positive quote
  errors in test files) and recognizes `structuredClone` as a Node 17+ global.
- Pre-commit hook now runs `npm run lint` and `npm run format:check` before the
  changelog check.

- **Breaking:** `geo-opt schema <file> article` and `geo-opt inject <file> article` now emit
  `Article` instead of `NewsArticle`. Use the new `news-article` type for time-sensitive news
  content (requires `datePublished` in config).
- **Breaking:** `article` mode no longer stacks a `FAQPage` node automatically. FAQ markup is
  only generated when the user explicitly selects the `faq` type.
- `faq` mode now filters out section headings that are not phrased as questions (i.e. do not
  end with `?`). Headings like "Installation" or "Limitations" are skipped; headings like
  "How do I install?" are included.
- `validateSchemaFile` output now separates `❌ Errors`, `⚠️ Warnings`, and `ℹ️ Notes`
  into distinct sections instead of a single flat issues list.
- `COMMUNITY_SCHEMA_TYPES` now includes `"news-article"`.
- `auditFiles` results now include the audited file `content`; `generate-all`
  reuses it instead of re-reading each file from disk.
- `injectSchema` now returns a `{ replaced, dryRun, message, preview? }` object
  instead of printing directly. The CLI still prints the message; programmatic
  callers can inspect or suppress it.
- Extracted shared `buildExplainLines(findings)` helper from the `--explain`
  rendering path (was duplicated in `scoring.js` and `renderer.js`).
- Sitemap parsing/validation now uses `fast-xml-parser` instead of regex,
  correctly handling sitemap indexes, attribute/element-order variation,
  namespaced children, and CDATA (`src/sitemap.js`).
- CI now validates the published package shape and type resolution with
  `publint` and `@arethetypeswrong/cli` (`npm run validate:package`).
- Repository metadata, README badges, clone instructions, issue links and the
  technical-audit user agent now point to the `cortega26/geo-opt` repository.
- Normalized npm `bin` metadata so `npm publish` preserves the `geo-opt` executable.

### Added

- New schema type `news-article` (JS and Python): emits `NewsArticle` with a required
  `datePublished` field. Throws an error if `datePublished` is absent, preventing accidental
  `NewsArticle` markup without the required factual metadata.
- `validateSchema(parsed)`: new pure function exported from `src/validate.js` and
  `src/index.js` that validates a parsed JSON-LD object and returns
  `{ errors, warnings, notes, nodes }` without any I/O or side effects.
- `index.d.ts`: `SchemaValidationResult` interface and `validateSchema` export.
- `REQUIRED_FIELDS` in `validate.js` now includes `Article: ["headline"]`.
- New CLI command `geo-opt technical [files...]`: runs a pure local HTML technical
  audit on one or more HTML files. Checks title, canonical URLs, meta robots
  directives, heading hierarchy, hreflang declarations, link validity,
  structured-data consistency and app-shell detection. Supports `--format`
  (text|json), `--source-url` and `--output`. No network access.
- `parseSitemapXml(xml)`: new pure function in `src/sitemap.js` that parses an
  existing sitemap XML string (urlset or sitemapindex) into a structured
  `{ urls, sitemapUrls, valid, issues }` result. Exported from `src/index.js`
  and typed in `index.d.ts`. No network access — parsing only.
- `parseFrontmatter(content)`: new public function in `src/text.js` that splits
  leading YAML frontmatter from a document. Returns `{ data, body }` with parsed
  YAML metadata. Tolerant: missing or invalid YAML yields `{ data: {}, body: content }`.

### Docs

- Rewrote `README.md` with an improved structure, compelling problem statement, CI/CD integration example, expanded command reference, and clarified evidence vocabulary.
- Added `README.es.md`: full Spanish translation of the README, linked bidirectionally with the English version.
- CI now runs `npm run typecheck`, so regressions in the public `index.d.ts`
  type surface fail the build instead of only the local `npm run check`.

### Security

- `robots generate`, `sitemap generate`, `llmstxt generate`, and `generate-all`
  now reject `--output` paths that resolve outside the current working
  directory, matching the existing boundary enforced by `inject` and `report`.
- The Pro HTML report now escapes single quotes (`'`) in addition to `& < > "`.

### Tests

- Added coverage for sitemap index/splitting (>50k URLs) and `validateSitemapXml`
  spec checks, and XSS-escaping regression tests for the HTML report renderers.

### Fixed

- TypeScript configuration now explicitly includes Node types so dependency
  updates continue to typecheck `node:*` imports and `import.meta.url`.
- Removed dead imports and unused variables in test files (`optimizer.test.js`,
  `conformance.test.js`, `cli-smoke.test.js`, `scoring.test.js`).
- `generateSchemaData` now derives the page title from the filename when no
  H1 heading is present (previously used the literal string "Untitled Document",
  mismatching `llms.txt` which already used the filename). Consolidates
  duplicate metadata-extraction logic.
- v2 audit now shows the correct "Add a single H1" remediation when a document's
  first heading is not an H1 (previously always showed the generic
  skipped-levels remediation).
- `detectProfile` now returns confidence 0.2 for content with no profile signals
  (previously unreachable; always returned 0.4).
- `discoverFiles` now correctly translates `**`, `*`, and `?` glob patterns in
  `.gitignore`, `--ignore`, and `config.ignore`. Previously a `**` pattern
  produced an invalid regex that silently discarded all `.gitignore` rules (or
  crashed `--ignore`), causing recursive audits to scan ignored directories.
- `tests/changelog-policy.test.js`: version assertion now matches any `actions/checkout@vN`
- Frontmatter is now parsed with the `yaml` library instead of a regex, so YAML
  metadata no longer leaks into statistics, quotation, or heading detection
  (`src/text.js`). Fixes false positives on Markdown files with `---` blocks.
- `npm run typecheck` now passes: added `@types/node` as a dev dependency so
  the consumer type fixture (`tests/consumer.test.ts`) can resolve `node:test`,
  `node:fs`, `node:path`, and `node:url` module types.
  instead of hardcoding `@v4`, preventing breakage when the workflow action version is bumped.
- Pre-commit hook installed via `npm run prepare` (`hooks/pre-commit`) runs the changelog
  policy check locally before each commit, catching missing entries before CI does.
- `scripts/build.js` now reads `src/integrity.js` as the integrity template instead of
  `dist/integrity.js`, eliminating a race condition where concurrent test builds could
  corrupt the second placeholder occurrence. `dist/` is no longer deleted before each build
  (overwrite-in-place is safe since the build is deterministic).
- `tests/integrity.test.js` happy-path test now copies `dist/` to an isolated staging
  directory before importing, matching the pattern used by the other integrity tests.
- `bin/cli.js` and `tests/badge.test.js` reformatted to Prettier code style.
- v2 quotation scoring now detects mid-line inline quotes and typographic
  (" ") quotes, and reads HTML heading hierarchy in document order. Previously
  mid-line quotes scored the quotation dimension as 0, curly quotes were
  ignored, and HTML heading order/skip checks were defeated. This changes v2
  scores on affected content (model patch — see PR for per-fixture deltas).
- v2 attribution proximity now evaluates each repeated statistic/quote at its
  own position instead of always the first occurrence.
- `generate-all` now emits correct `<lastmod>` values in the generated sitemap
  (previously every URL pointed at a nonexistent path, so `<lastmod>` was dropped).

### Added

- `geo-opt badge <file>` command: audits a content file and outputs a shields.io
  badge URL, Markdown image, or JSON with score, grade, and badge fields. Options:
  `--format` (markdown|url|json), `--label`, `--style`, `--model`.
- `src/badge.js`: pure functions `generateBadgeUrl`, `generateBadgeMarkdown`,
  `scoreToBadgeColor`, `scoreToBadgeGrade`. Exported from `src/index.js` and typed
  in `index.d.ts` (`BadgeColor`, `BadgeGrade`, `BadgeStyle`, `BadgeOptions`,
  `BadgeMarkdownOptions` interfaces).
- `.github/actions/geo-opt-audit/action.yml`: GitHub Actions composite action.
  Inputs: `path`, `threshold`, `recursive`, `model`, `format`, `label`, `license-key`.
  Outputs: `score`, `passed`, `badge-url`, `badge-markdown`. Installs dependencies from
  the action path and runs the CLI; exits non-zero when threshold is not met.
- `ci-templates/gitlab-ci.yml`: GitLab CI template with a `geo-opt-audit` job.
  Include remotely and configure via CI variables (`GEO_OPT_PATH`, `GEO_OPT_THRESHOLD`,
  `GEO_OPT_RECURSIVE`, `GEO_OPT_MODEL`, `TOOLTICIAN_LICENSE_KEY`). Produces
  `geo-opt-audit.json` artifact and `GEO_SCORE` / `GEO_BADGE_URL` dotenv variables.
- 25 tests in `tests/badge.test.js` covering pure badge functions and all CLI badge
  command formats, validation, and error paths.

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

[Unreleased]: https://github.com/cortega26/geo-opt/compare/v2.0.0...HEAD
[2.0.0]: https://github.com/cortega26/geo-opt/compare/67f18be...v2.0.0
[1.0.0]: https://github.com/cortega26/geo-opt/commits/67f18be
