# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.3.10](https://github.com/cortega26/geo-opt/compare/v2.3.9...v2.3.10) (2026-08-04)


### Bug Fixes

* **fetcher:** honor custom user agent (Plan 079) ([428372b](https://github.com/cortega26/geo-opt/commit/428372ba95d1fc4ad0cd7a840a5942a5663a578d))
* **fetcher:** propagate UA validation and key robots cache (Plan 096) ([cee5383](https://github.com/cortega26/geo-opt/commit/cee538324110f8cf4b21994682dd7ae5202a138f))

## [2.3.9](https://github.com/cortega26/geo-opt/compare/v2.3.8...v2.3.9) (2026-08-04)


### Bug Fixes

* **robots:** combine groups and match queries (Plan 078) ([c85ee5d](https://github.com/cortega26/geo-opt/commit/c85ee5d58a67675a9620a26e2aeb86a322852281))
* **robots:** parse comma agents, keep groups across comments, align Python (Plan 094) ([529dd3b](https://github.com/cortega26/geo-opt/commit/529dd3b0a530c0d8d17a843737bba383fac8cad2))
* **robots:** skip empty User-agent token lists; pin CRLF/BOM and CLI parity (Plan 095) ([3a08151](https://github.com/cortega26/geo-opt/commit/3a081511230aa82f1062ca62dd912548b6a71315))

## [2.3.8](https://github.com/cortega26/geo-opt/compare/v2.3.7...v2.3.8) (2026-08-03)


### Bug Fixes

* **fetcher:** harden shared-deadline edges (coverage, timer cleanup) ([0a7844b](https://github.com/cortega26/geo-opt/commit/0a7844b00913934c5ce56afd8cb5b5264113b2b6))
* **fetcher:** share timeout across redirects ([7f29992](https://github.com/cortega26/geo-opt/commit/7f29992d8a9dc0e256d376f19daaeb9d8ba68809))

## [2.3.7](https://github.com/cortega26/geo-opt/compare/v2.3.6...v2.3.7) (2026-08-03)


### Bug Fixes

* **sitemap:** cap collected page URLs ([aa7738a](https://github.com/cortega26/geo-opt/commit/aa7738a0666f9072e099bd2a5d86cc3c8e8322ad))

## [2.3.6](https://github.com/cortega26/geo-opt/compare/v2.3.5...v2.3.6) (2026-08-02)


### Bug Fixes

* **ci:** report aggregate audit scores and truthful entitlements in CI wrappers (Plan 072) ([8b2c3ad](https://github.com/cortega26/geo-opt/commit/8b2c3ad4abf1439a4ac72e2dea06367bec71d76c))

## [Unreleased]

### Fixed

- **fix:** user-agent validation errors now propagate out of `fetchRobotsTxt` with `code = "ERR_INVALID_USER_AGENT"` instead of silently caching an empty result — a control-character `userAgent` previously poisoned the origin-keyed robots cache so later valid calls never fetched real rules; the rejection now covers all control characters except HTAB and happens before any network I/O, and the robots cache is keyed by origin + effective user-agent so different agents refetch (Plan 096)
- **test:** pin the validation-error propagation, the extended control-character rejection (incl. non-string values) with zero requests, the user-agent-aware robots cache key, the HTAB-allowed case, and the unchanged network-failure degradation (Plan 096)
- **fix:** `fetchUrl`/`fetchRobotsTxt` now honor the public `userAgent` option on every request: redirect hops inherit it, omitting the option keeps the default user agent, an empty string falls back to the default, and CR/LF values are rejected with a clear error before any network I/O (header-injection guard) (Plan 079)
- **test:** pin the default/custom user agent, redirect-hop preservation, robots fetch, and CR/LF rejection with zero requests (Plan 079)
- **fix:** `User-agent:` lines with comma-separated tokens now split into separate agents (Google de-facto spec), comment-only lines no longer end a group (dropping following rules), and the Python port matches Node's combined-group semantics — equally specific groups merge their rules, `matchedGroup` dedup is case-insensitive in both runtimes, and percent-encoding byte-for-byte matching plus `$`-anchored query exclusion are pinned by tests (Plan 094)
- **test:** pin comma-agent splitting, comment-line group continuity, Node↔Python combined-group parity, case-insensitive `matchedGroup` dedup, percent-encoding byte-for-byte matching and `$`-anchor query exclusion (Plan 094)
- **fix:** a `User-agent:` line whose comma-separated token list is entirely empty (e.g. `User-agent: ,`) no longer creates a ghost group with zero agents that silently swallows the following rules; the Python port strips a leading UTF-8 BOM in `parse_robots_groups` and reads robots files as `utf-8-sig`, so BOM-prefixed files audit the same as plain ones (Plan 095)
- **test:** pin the no-ghost-group invariant, CRLF/BOM parser tolerance in both runtimes, and field-by-field Node↔Python CLI JSON parity for `robots audit` (top-level keys plus `allowed`, `matchedGroup`, `matchedRule`) (Plan 095)
- **fix:** robots.txt groups with equally specific user-agent tokens now combine their rules (RFC 9309 §2.2.1) in both `auditRobots` and `checkRobotsRule`, and rule matching includes the URL query string as part of the path (Plan 078)
- **fix:** the shared total deadline (Plan 077) no longer leaks a pending timer when request creation throws synchronously — the timer armed before the promise is now cleared before rethrowing (Plan 092)
- **test:** pin the entry-check no-connection semantics (Plan 093)
- **fix:** `timeoutMs` is now one shared total deadline for the whole fetch transaction — DNS/connect, headers, body, and every redirect hop consume the same budget, so a redirect chain can no longer hold the process for (hops + 1) × `timeoutMs` (Plan 077)
- **docs:** enforce the DONE-to-`plans/archive/` governance rule via scripts/check-plan-archive.js in `npm run check` and CI, covered by tests/plan-archive.test.js (plan 022 archived)
- **fix:** concurrent builds over the shared dist/ are serialized via an exclusive lock (was corrupting dist/ under parallel test runners — EACCES/half-written artifacts)
- **fix:** fetcher connects IPv6-literal URLs via the vetted address (was getaddrinfo ENOTFOUND on Node 22+ because the bracketed hostname leaked into the request)
- **test:** bracket IPv6 hosts in fetcher test server URLs (Plan 073)
- **test:** make fetcher tests hermetic (local servers only) and behavior-specific (Plan 073)
- **test:** retry dist/ reads and staging copies when a neighbor test build is mid-write (the build lock serializes builds, not reads; EACCES/ENOENT and partial-content flake)
- **test:** close the partial-read window for the remaining dist/ modules (bin/cli.js, index.js) with a closing-brace completeness predicate
- **ci:** report truthful aggregate scores and entitlements in CI wrappers (Plan 072)
- **ci:** propagate the audit exit status through the GitLab template so failed audits fail the job (Plan 072)
- **ci:** reject non-numeric averageScore in CI wrappers instead of coercing it to a fabricated score (Plan 072)

### Security

- **fix:** bound total page-URL retention during sub-sitemap traversal to a finite hard cap (50,000 unique URLs, the sitemap-spec scale) — deduplication while collecting, first-seen ordering, exactly one truncation warning, and a machine-checkable `truncatedPageUrls`/`urlLimitReached` result; root and collected URLs share the budget before robots evaluation; independent from the 100-fetch cap and the final `--max-urls` (Plan 076)
- **feat:** enforce one scheme/origin policy on every remote hop — root URL, redirects, `robots.txt`, nested sitemaps, and discovered pages are HTTPS-only and root-origin-only by default, rejected before DNS/connect; `--allow-http` is the only HTTP opt-in for sitemap-discovered hops and `--allow-cross-origin` the only cross-origin opt-in (the legacy `--url` exception where IP flags also admit HTTP remains unchanged); SSRF/IP guards and TLS verification are never weakened (Plan 075)
- **fix:** a `robots.txt` hop rejected by the hop policy is now reported via the CLI warning (with the policy reason) instead of being silently swallowed as "no robots.txt"; 404/network failures still degrade to full access (Plan 075)
- **test:** deterministic local-TLS coverage for the HTTPS agent path — trusted test CA, SNI/Host identity, vetted-IP socket target, and fail-closed hostname-mismatch/untrusted-cert cases (Plan 074)

## [2.3.5](https://github.com/cortega26/geo-opt/compare/v2.3.4...v2.3.5) (2026-08-02)


### Bug Fixes

* **ci:** execute composite action arguments safely (Plan 071) ([eca2aa4](https://github.com/cortega26/geo-opt/commit/eca2aa4fea73c41cc23e82d35f62dad93f208575))

## [2.3.4](https://github.com/cortega26/geo-opt/compare/v2.3.3...v2.3.4) (2026-08-02)


### Bug Fixes

* **test:** inject deterministic evidence clock and repair date-pinned gates (Plan 070) ([04fcd49](https://github.com/cortega26/geo-opt/commit/04fcd4936adc8524674c9f1124c91fa0c24b6ff2))

## [2.3.3](https://github.com/cortega26/geo-opt/compare/v2.3.2...v2.3.3) (2026-08-02)


### Bug Fixes

* **audit:** match allowlist exceptions by stable GHSA identity (Plan 069) ([db423ac](https://github.com/cortega26/geo-opt/commit/db423ac66a90bb92e5ae91de96bade65293bcd7e))

## [2.3.2](https://github.com/cortega26/geo-opt/compare/v2.3.1...v2.3.2) (2026-08-01)


### Bug Fixes

* remediate adversarial audit 2026-07-31 (F-01..F-14) ([dc48b64](https://github.com/cortega26/geo-opt/commit/dc48b64f0ed0d433efd0fdf4a7af0533408ed5e1))

## [2.3.1](https://github.com/cortega26/geo-opt/compare/v2.3.0...v2.3.1) (2026-07-31)


### Bug Fixes

* **ci:** harden CI entry assets (GitLab include org, effectiveScore, action docs) ([d550d08](https://github.com/cortega26/geo-opt/commit/d550d08644f01ef007c6d932b66cf4798ee4530a))

# [2.3.0](https://github.com/cortega26/geo-opt/compare/v2.2.3...v2.3.0) (2026-07-31)


### Features

* **schema:** type JSON-LD output with schema-dts (compile-time vocabulary guard) ([#39](https://github.com/cortega26/geo-opt/issues/39)) ([296b60f](https://github.com/cortega26/geo-opt/commit/296b60f5577b6fdab543a448b17461de21728aba))

## [Unreleased]

### Security
- `report --compare` now escapes and normalizes every baseline JSON value
  (audit F-01): malicious `total_score`/breakdown strings can no longer inject
  raw `<script>` markup into the generated HTML report.
- The SSRF guard now blocks `169.254.0.0/16` (cloud metadata service) and
  `100.64.0.0/10` (CGNAT) in `isPrivateIPv4`, and IPv4-mapped IPv6 literals
  (`::ffff:127.0.0.1`, `::ffff:7f00:1`) are re-validated as their underlying
  IPv4; IPv6 link-local now covers the full `fe80::/10` range (audit F-02/F-03).
- The audit gate (`npm run audit:check`) now matches allowlisted advisories by
  stable GHSA identity (advisory URL + package name) instead of npm's
  renumbered numeric `source` and respelled version `range`, which churn
  without the advisory changing (brace-expansion: source 1124334 → 1130591,
  range `<=5.0.7` → `>=4.0.0 <5.0.8`). The installed-surface checks stay
  strict: every reported vulnerable node must be a reviewed path whose version
  in `package-lock.json` is exactly the reviewed one, so a different GHSA,
  package, installed version, or dependency path still blocks CI. The
  stale-entry warning fires only when the GHSA is absent from the report
  entirely — an advisory that merely appears below the blocking threshold is
  never reported as "likely fixed upstream" (Plan 069).

### Fixed
- The GitHub composite action (`geo-opt-audit`) now delivers every input to
  the CLI through environment variables and builds `argv` as a quoted Bash
  array: paths with spaces, quotes, or shell metacharacters arrive as one
  inert argument instead of being word-split, and `model`, `threshold`, and
  `label` values can no longer inject shell syntax through `run:`
  interpolation. The exact helper the action executes is covered by a new
  argument-boundary regression suite (`tests/ci-action-shell.test.js`) that
  observes the argv the CLI actually receives (Plan 071).
- `audit` now writes per-file read errors to stderr in `--format json` too and
  exits non-zero on partial file failures even without `--threshold` (audit
  F-05): JSON mode was silent (exit 0, empty stderr) while dropping failed
  files, contradicting the README "diagnostics on stderr / non-zero exit
  codes" contract. Residual closed 2026-08-01 (verification pass): an explicit
  path that does not exist was silently dropped when other files matched
  (`audit ok.md missing.md` exited 0 with empty stderr); `discoverFiles` now
  reports missing explicit paths via `onMissingPath` and `audit` diagnoses
  them on stderr and exits non-zero, in both text and JSON modes.
- The v2 observation engine no longer counts technical identifiers
  (versions, ports, endpoint IDs, `v22`) as statistics, and `hasSourcesSection`
  now requires a real heading with links below it instead of a global keyword
  match — a casual "references" in prose no longer earns citations points
  (audit F-07/F-08).
- `llms.txt` and `llms-full.txt` (both the single-string and multi-file
  variants) now escape titles, descriptions, and section names inside
  markdown links (a hostile `Fraud](https://evil.example)` title can no
  longer close the link and inject an arbitrary URL; `[` is also escaped for
  parsers with stricter link-label semantics), and page URLs are
  percent-encoded per segment (RFC 3986) in `resolvePageUrl` and the sitemap/
  llmstxt CLI entry builder — filenames with spaces no longer produce invalid
  `<loc>` URLs (audit F-09).
- HTML sources-section detection (v2) now recognizes lists wrapped in
  containers (`div`/`section`/`p`/`li`) under the heading, not only bare
  `ul`/`ol` — CMS-generated HTML wrapped the reference list and lost the
  citations credit (edge case, review 2026-08-01).
- Markdown heading detection uses `\S` (any non-space) instead of `\w`
  (ASCII-only in JavaScript) in the v1 scorer and the Python port, so
  headings in Arabic, CJK, and Cyrillic are detected identically by both
  runtimes — Node previously scored non-Latin documents 3 points lower in
  structure (audit F-10).
- Sitemap mode now caps total sub-sitemap fetches (100, across all nesting
  levels) so a hostile sitemap index cannot amplify work into unbounded
  requests; the traversal logic moved to `collectSubSitemapPageUrls` in
  `src/sitemap.js` with an injectable fetch (audit F-11).
- `technical -o` now applies the same CWD write guard as every other CLI
  output (report, robots, sitemap, llmstxt): `-o ../..` can no longer write
  outside the working directory (audit F-12).
- The GitLab CI template no longer declares a `dotenv` artifact on the hidden
  job (it failed jobs whose `extends` never created the file) and corrected
  the comments claiming `--recursive` needs a Pro license (audit F-13).
- `staleEvidenceWarnings(staleDays, now)` now accepts an optional explicit
  `Date` clock so tests no longer depend on the machine's current date;
  callers that omit it still use the real current time (Plan 070).
- The plan-records gate now accepts any reconciliation date on or after
  2026-07-22 (was pinned to the 2026-07 month).
- The docs-claims gate now accepts any "Last verified" date on or after
  2026-07-22 (was pinned to the 2026-07/08 months).

### Build
- `scripts/build.js` no longer copies `src/integrity.js` into `dist/` during
  the copy step: the placeholder template is never exposed in `dist/`, not
  even transiently, and the real SHA-256 hash is written exactly once. Test
  files run builds concurrently over the same `dist/` (node --test parallel
  files), and a concurrent copy of the placeholder could land on top of a
  freshly written hash, making the artifact determinism test flaky
  (observed 2026-08-01 verification pass).

### Tests
- `tests/ci-action-shell.test.js` also pins hostile `threshold` and `label`
  values as inert single argv/data elements — a future unquoted
  `--threshold` expansion would corrupt both the argument boundary and the
  gate exit status (Plan 071 follow-up).
- New `tests/audit-2026-07-31.e2e.test.js`: black-box verification of the
  14 audit findings (F-01…F-14) against the CLI as a subprocess (and the
  real `fetchUrl`/`collectSubSitemapPageUrls` module entries for the SSRF
  guards and the sitemap cap), reproducing each probe from
  `docs/audits/auditoria-2026-07-31.md` and asserting the corrected
  behavior holds on main. Review pass 2026-08-01 added: F-04 negative
  control (Pro gate active without a key), F-12 positive control (in-CWD
  writes still work), F-01 `esc()` path via a hostile finding message,
  F-10 pinned absolute values (23/3), F-13 order-independent hidden-job
  block extraction, the F-05 missing-file residual case, a root-safe skip
  for the chmod-0 fixture, and a 30 s timeout on CLI spawns.
- `artifact.test.js` pins the invariant that `dist/integrity.js` always
  carries the injected SHA-256 hash in the `EXPECTED_HASH` assignment,
  never the `<<<LICENSING_HASH>>>` template placeholder.

### Docs
- `docs/free-vs-pro.md` now states the Pro verification model explicitly:
  the license key is a public, locally-checked format with no cryptographic
  signature — Pro is honor-system by design, not a security boundary
  (audit F-04), and the CLI table no longer claims `schema` prints Community
  output "con branding" (audit F-14: stdout is pure JSON).

### Changed
- The v2 readiness band ≥85 is relabeled from "Production-Ready" to
  "Strong Style Markers" with a description stating the score measures
  formatting signals, not factual accuracy or ranking; the band id
  (`production-ready`) stays stable in the JSON contract (audit F-06).
  README documents the known gaming vectors and the new
  `style-markers-gamed` adversarial fixture joins the regression corpus.
- `CRAWLER_REGISTRY` re-verified against official sources (2026-08-01): all
  15 tokens confirmed; `Meta-ExternalAgent` token normalized to the official
  lowercase form (`meta-externalagent`); `anthropic-ai` documented as a
  legacy token no longer listed in Anthropic's docs.
- Evidence registry re-verified (2026-08-01): GEO KDD 2024 (arXiv
  2311.09735, v3) and "What Gets Cited" (arXiv 2605.25517, v1) are both
  live and unretracted; stale-evidence warnings reflect the fresh dates.

### Chore
- Removed 8 unused exports (knip): `VALID_FINDING_STATUSES`, the findings
  `default` export, `TOOLTICIAN_BRANDING_MARKDOWN`/`HTML`,
  `TELEMETRY_ENV_VAR`/`DO_NOT_TRACK_ENV_VAR`,
  `maybePromptForTelemetryConsent`, `hasUriScheme` — none part of the
  public barrel; knip config hints applied. The
  `MODEL_VERSION_V2|MODEL_VERSION` duplicate is an intentional public
  alias, now documented in code.
- GitHub Actions pinned to commit SHAs (with tag comments) instead of
  moving major tags: `checkout`, `setup-node`, `setup-python` v7 and
  `semantic-release-action` v6.0.0.

### Fixed
- Fixed the GitLab CI template include URL (wrong org in the `remote:`
  reference) and the GitHub Actions composite action score parsing — the JSON
  field is `effectiveScore`, so the score output and shields badge are no
  longer always `0` — and documented the action in the README.

### Changed
- CI now verifies the README test-count and branch-coverage badges against
  live runs (new scripts/check-coverage.js; check-test-count.js wired into
  npm run check; 058 test registration count-deterministic; README test
  badges corrected to the live count).
- JSON-LD output in `src/schema.js` is now typed against `schema-dts`
  (Google's Schema.org type definitions), so property-name and `@type`
  mistakes are caught at compile time. Type-only; no runtime or dependency
  change to the published package.

## [2.2.3](https://github.com/cortega26/geo-opt/compare/v2.2.2...v2.2.3) (2026-07-31)


### Bug Fixes

* **ci:** exempt pure dependency bumps from the changelog policy ([#37](https://github.com/cortega26/geo-opt/issues/37)) ([eeba6ce](https://github.com/cortega26/geo-opt/commit/eeba6ce87bf503d0cacb8bd80053d51814539083)), closes [#33](https://github.com/cortega26/geo-opt/issues/33)

## [2.2.2](https://github.com/cortega26/geo-opt/compare/v2.2.1...v2.2.2) (2026-07-31)


### Bug Fixes

* **ci:** gate security audit on an allowlist instead of a bare npm audit ([#36](https://github.com/cortega26/geo-opt/issues/36)) ([b5e0835](https://github.com/cortega26/geo-opt/commit/b5e0835c32d98926e1c776f511c7879db14b5e80))

## [2.2.1](https://github.com/cortega26/geo-opt/compare/v2.2.0...v2.2.1) (2026-07-23)


### Bug Fixes

* **deps:** patch high-severity advisories in brace-expansion and fast-xml-parser ([#32](https://github.com/cortega26/geo-opt/issues/32)) ([ccca80f](https://github.com/cortega26/geo-opt/commit/ccca80f0cf216eea7ec264ecf4df45a35c990ce2)), closes [hi#severity](https://github.com/hi/issues/severity) [hi#severity](https://github.com/hi/issues/severity)

# [2.2.0](https://github.com/cortega26/geo-opt/compare/v2.1.3...v2.2.0) (2026-07-05)


### Features

* **cli:** support frontmatter content and dynamic version ([#19](https://github.com/cortega26/geo-opt/issues/19)) ([fa274ac](https://github.com/cortega26/geo-opt/commit/fa274acfc61b525c2881441f33d012687f462871)), closes [#18](https://github.com/cortega26/geo-opt/issues/18) [#20](https://github.com/cortega26/geo-opt/issues/20)

## [2.1.3](https://github.com/cortega26/geo-opt/compare/v2.1.2...v2.1.3) (2026-06-30)


### Bug Fixes

* P22, P23, O24 — hreflang trailing-slash, mailto: link safety, Spanish service profile ([b8cd937](https://github.com/cortega26/geo-opt/commit/b8cd937187febefe02ac48219f1c0666f261766a)), closes [#16](https://github.com/cortega26/geo-opt/issues/16) [#15](https://github.com/cortega26/geo-opt/issues/15) [#17](https://github.com/cortega26/geo-opt/issues/17)

## [Unreleased]

### Build

- **CI security audit is no longer red on an unfixable advisory.** The
  `Security audit` step ran `npm audit --audit-level=high`, which failed on
  `main` (and blocked every open Dependabot PR) because of
  [GHSA-mh99-v99m-4gvg](https://github.com/advisories/GHSA-mh99-v99m-4gvg)
  in `brace-expansion`. That copy is bundled inside the npm CLI tarball
  (`semantic-release` → `@semantic-release/npm` → `npm`), so `overrides`
  cannot reach it, and npm 11.19.0 / 12.0.2 both still bundle the vulnerable
  5.0.7. The step now runs `npm run audit:check`
  (`scripts/check-audit.js`), which keeps blocking on every high/critical
  advisory except a dated, justified allowlist. This deliberately avoids
  `--omit=dev`, which would have suppressed the advisory by blinding the gate
  to the whole dev toolchain. Dev-only; no runtime or published-package change.
- **Changelog policy no longer fails every dependency bump.** Because
  `package.json` is a tracked code path, the `Changelog policy` CI step failed
  on every Dependabot PR — which is what trained the habit of merging those PRs
  red, and is why a broken `main` went unnoticed for five days.
  `scripts/check-changelog.js` now exempts a change whose files are exactly
  `package.json` / `package-lock.json` **and** whose `package.json` differs from
  the base only in its dependency blocks; semantic-release already records such
  bumps in the released notes from the `build(deps):` commit message. The check
  fails closed — if the base manifest cannot be read, or anything outside the
  dependency blocks changed, a hand-written entry is still required.

### Tests

- Plan 058 §6.4/§6.6 tests now skip gracefully when maintainer-local
  `plans/business/` and `plans/018-…md` files are absent (e.g. in CI or a
  fresh clone), since `plans/` is git-ignored by design. They still verify
  content when the files are present locally.

### Docs

- Reconciled public Free/Pro capability claims with current runtime behavior
  (Plan 058). `docs/free-vs-pro.md`, `docs/commercial-licensing.md`,
  `docs/architecture.md`, `README.md`, and `README.es.md` no longer mark
  Community commands (`inject`, `robots generate`, `llmstxt generate`,
  `sitemap generate`, `generate-all`, recursive audit, CI thresholds) as Pro-only.
  Only `report`, `--no-branding`, and the Pro schema types (`course`, `event`,
  `recipe`, `howto`) are actually Pro-gated. Corrected stale `architecture.md`
  maturity claims (npm package is published; v2 is the default scoring model;
  `technical` is a supported CLI command). Updated test-count badge from 573 to
  666 and added a standalone `scripts/check-test-count.js` to catch future badge
  drift (run manually; not yet wired into `npm run check` to avoid a package.json
  change outside this plan's scope). Added a truthful copy-paste local-to-CI onboarding route. Quarantined the
  historical `plans/business/launch-content/` drafts as not-approved-for-
  publication and fixed their stale `cortega26/GEO-skill.git` repo URL. Marked
  Plan 018 as superseded; updated `plans/README.md` to record Plan 058 DONE.

### Fixed

- Allow lockfile-only dependency resolution updates to pass the changelog policy
  while continuing to require entries for package manifest changes
- `geo-opt -V` / `--version` now reads the version dynamically from
  `package.json` instead of returning a hardcoded string (closes #20)

### Added

- `llmstxt generate --frontmatter-fields <fields...>` option: extract named YAML
  frontmatter fields (e.g. `body`, `excerpt`) as page content for
  `llms-full.txt`, fixing empty content blocks for schema-driven collections
  (Astro and similar frameworks) where the markdown body is empty and all
  content lives in structured frontmatter. This option is Node-only; the Python
  compatibility CLI remains unchanged. (Closes #18)
- `extractFrontmatterContent(content, fields)` exported API function that
  concatenates specified frontmatter field values and the markdown body into a
  single content string for use in full-text generation
- `extractPageMetadata` now falls back to frontmatter `title` and `description`
  fields when the markdown body contains no H1 or opening paragraph, improving
  `llms.txt` entries for frontmatter-only source files

### Docs

- Reposition the project as a three-pillar AI-discoverability toolkit (GEO +
  structured data + technical SEO); clarify GEO as the umbrella term across
  `README.md`, `README.es.md`, `AGENTS.md`, the bundled skill, the package
  description, `docs/free-vs-pro.md`, and the CLI/Python `--help` descriptions
- Add an optional, privacy-safe agent defect-reporting protocol
  (`docs/reporting-issues.md`, bundled skill section, linked from the README
  Development sections) plus a redaction notice and an agent-origin checkbox to
  the bug-report issue template
- Correct the bundled skill's stale "npm package not released" note (`geo-opt`
  is published on npm) and expand `package.json` keywords for the three-pillar
  positioning (`technical-seo`, `structured-data`, `sitemap`, `aeo`,
  `generative-engine-optimization`)

## [2.1.2](https://github.com/cortega26/geo-opt/compare/v2.1.1...v2.1.2) (2026-06-30)


### Bug Fixes

* P5, P12, P13, P16 — remaining issues from v2.1.1 verification ([f0d1a00](https://github.com/cortega26/geo-opt/commit/f0d1a000c79abb7518a732aff5f2e665b301839d))

## [2.1.1](https://github.com/cortega26/geo-opt/compare/v2.1.0...v2.1.1) (2026-06-30)


### Bug Fixes

* 18 bugs from geo-opt v2.1.0 audit report ([e3f953e](https://github.com/cortega26/geo-opt/commit/e3f953ef455b898fe0c056cce3efab1d7d656b63))
* remove preinstall hook and tmp-cli-lastmod gitignore pattern ([e3e1968](https://github.com/cortega26/geo-opt/commit/e3e1968ab2777cc9be175408071c67d678f770ce))

# [2.1.0](https://github.com/cortega26/geo-opt/compare/v2.0.0...v2.1.0) (2026-06-29)


### Bug Fixes

* **ci:** publish to npm via OIDC provenance instead of bundled semantic-release plugin ([8a1d14e](https://github.com/cortega26/geo-opt/commit/8a1d14e5f0003a7da483a1e784ac9c1bdb26fb1e))
* update actions to latest versions, add workflow_dispatch trigger ([3402e35](https://github.com/cortega26/geo-opt/commit/3402e356dd800527199babca2c74064d1bc6b385))


### Features

* integrate semantic-release for automatic versioning ([d5dca89](https://github.com/cortega26/geo-opt/commit/d5dca89bf9f3b80bf1c935ded0fffe81593cd0d9))
* v2 default switch, knip, and bilingual readability metrics ([e0e9ca8](https://github.com/cortega26/geo-opt/commit/e0e9ca8671b47080805fcead1a37d644f91b7401))

## [Unreleased]

### Bug Fixes

- **P1 — npm install desde GitHub roto.** El script `prepare` ahora tolera la
  ausencia de `.git/hooks/` (ocurre en instalaciones desde URL de GitHub que
  clonan sin `.git/`). Se agregó `scripts/` al campo `files` del `package.json`
  para que `prepack` pueda ejecutar `build.js`.
- **CI — `npm ci` bloqueado.** El guardia `preinstall` que verificaba `dist/`
  fue removido porque bloqueaba `npm ci` en CI (el directorio `dist/` no existe
  en un checkout limpio). El script `prepare` y el try/catch de P2 ya cubren
  el caso de `dist/` faltante.
- **CI — `discoverFiles` filtraba tests.** El patrón `tmp-cli-lastmod-*/` en
  `.gitignore` fue removido porque `discoverFiles()` aplica los patrones de
  `.gitignore` del CWD a todos los paths, filtrando directorios temporales
  creados por los tests.
- **P5 — `--site-url` visible en `--help`.** Se usó `new Option(...).hideHelp()`
  para ocultar el alias `--site-url` del help de `llmstxt generate` y
  `generate-all`. Solo `--base-url` aparece ahora.
- **P12 — Falsos positivos con `ProfessionalService` y otros.** Se agregaron
  10 tipos adicionales de Schema.org a `REQUIRED_FIELDS`: `QAPage`, `ItemList`,
  `Service`, `ProfessionalService`, `LocalBusiness`, `Corporation`,
  `EducationalOrganization`, `WebSite`, `PostalAddress`, `ContactPoint`.
- **P13 — `--audit` no diferenciaba prioridades cercanas.** `scoreToPriority`
  ahora usa 10 buckets (0.1–1.0 en incrementos de 0.1) en vez de 5, lo que
  permite diferenciar scores como 57 y 55 que antes caían en el mismo bucket.
- **P16 — "Missing file path" sin hint sobre `--ignore`.** El mensaje de error
  cuando no se pasan archivos ahora incluye la explicación sobre el orden
  correcto de `--ignore`. Anteriormente solo aparecía en el error de
  `discoverFiles`, no en la validación temprana de Commander.js.
- **P2 — --help sin output cuando falta dist/.** Se agregó un bloque try/catch
  alrededor de `program.parse()` que detecta errores `ENOENT`/`MODULE_NOT_FOUND`
  y muestra un mensaje amigable sugiriendo ejecutar `npm run build`.
- **P3 — Resolución de URLs dependiente del CWD.** Se creó `findCommonBaseDir()`
  en `src/llms-txt.js` que encuentra el prefijo común de todos los archivos de
  entrada. Los comandos `sitemap generate`, `llmstxt generate` y `generate-all`
  ahora usan este directorio base en vez de `process.cwd()` para generar URLs.
- **P5 — Nombres de flags inconsistentes para URL base.** `--base-url` es ahora
  el flag canónico en `llmstxt generate` y `generate-all`. `--site-url` se
  mantiene como alias oculto para retrocompatibilidad. `sitemap generate` ya
  usaba `--base-url`. `--source-url` en `technical` se mantiene por tener
  semántica distinta.
- **P6 — JSON-LD "not applicable" se muestra como ✗.** El icono para hallazgos
  con status `not_applicable` ahora es `○` (neutro) en vez de `✗` (fallo).
- **P7 — Perfil "Service / Consulting".** Nuevo perfil `service` para sitios de
  consultoría y servicios profesionales, con dimensiones `structure, statistics,
  citations, clarity`. Se agregó flag `--profile` al comando `audit` para forzar
  un perfil manualmente.
- **P9 — `technical` con directorio muestra error EISDIR crudo.** Se agregó
  flag `-r/--recursive` al comando `technical`. Sin `-r`, pasar un directorio
  produce un mensaje amigable. Con `-r`, se expande el directorio buscando
  archivos `.html`/`.htm`.
- **P10 — `--url http://` sugiere flags incorrectos.** La validación de URLs
  ahora distingue entre `localhost`, IPs privadas y HTTP público, sugiriendo
  `--allow-localhost`, `--allow-private` o `--allow-http` según corresponda.
  Se agregó el flag `--allow-http`.
- **P11 — `technical` duplica línea "Target:" con URLs remotas.** Corregida
  la condición para mostrar la segunda línea "Target:" — ahora solo aparece
  cuando existe `file` y `target` y son distintos.
- **P12 — `validate` falsos positivos con tipos multi-value y tipos no
  listados.** Se agregó soporte para tipos compuestos separados por coma
  (`Person,ProfessionalService`). Se amplió `REQUIRED_FIELDS` con 8 tipos
  adicionales de Schema.org (`BlogPosting`, `TechArticle`, `WebPage`,
  `BreadcrumbList`, `SoftwareApplication`, `ImageObject`, `VideoObject`,
  `DiscussionForumPosting`, `SocialMediaPosting`).
- **P13 — Tip para `sitemap generate --audit`.** Cuando no se usa `--audit`,
  se muestra un tip sugiriendo usarlo para prioridades basadas en GEO score.
- **P14/P21 — URLs sin trailing slash para directorios.** `resolvePageUrl()` y
  los comandos de generación ahora añaden trailing slash a URLs que representan
  directorios (archivos `index.*` resueltos a su directorio padre).
- **P15 — 404.html incluido en el sitemap.** `sitemap generate` ahora filtra
  archivos con nombres `404.html`, `404.md`, `404.htm` y `500.html`.
- **P16 — Error confuso con `--ignore` después de archivos.** El mensaje "No
  matching files found" ahora incluye una explicación de cómo ordenar
  correctamente los argumentos con `--ignore`.
- **P17 — Fallback de `--title` incluye `config.siteName`.** Se agregó
  `config.siteName` como opción adicional en la cadena de fallback del título
  en `llmstxt generate` y `generate-all`.
- **P18 — Ruta de output con `../../..`.** `emitTechnicalResults` ahora muestra
  la ruta absoluta (`path.resolve()`) en vez de la relativa.
- **P19 — Error de seguridad sin sugerencia.** Los mensajes de restricción de
  seguridad en `src/schema.js` ahora incluyen una sugerencia para resolver el
  problema.
- **P20 — `badge --format` acepta `text` como alias.** El flag `--format text`
  ahora es equivalente a `--format markdown` para consistencia con
  `audit`/`technical`.
- **P8e — `init --dry-run`.** El comando `init` ahora soporta `--dry-run` para
  previsualizar el archivo de configuración sin escribirlo.

### Changed

- **v2 is now the default scoring model.** `--model v2` is no longer needed for
  profile-aware scoring. The legacy v1 model remains available via `--model v1`
  (deprecated; emits a migration warning). Updated all CLI commands (`audit`,
  `report`, `badge`, `generate-all`) to default to v2, and the `MODEL_VERSION`
  constant reflects `"2.1.0"` (`src/findings.js`, `bin/cli.js`).
  ([Plan 022](plans/022-calibrate-profiled-audit-v2.md))
- Added `knip` (dev-only) for project-wide unused-file, unused-export, and
  unused/missing-dependency detection (`npm run knip`). Non-blocking in CI
  until the baseline is clean.
  ([Plan 054](plans/054-knip-dead-code-detection.md))
- `calculateReadability` now reports bilingual reading-grade indices:
  English (Flesch–Kincaid, Gunning fog via `text-readability`) and Spanish
  (Fernández-Huerta, Szigriszt-Pazos via a custom Spanish syllable counter),
  gated by the `lang` option. Non-English/non-Spanish content returns grade
  fields as `null` with an explanatory note (`src/text.js`).
  ([Plan 055](plans/055-readability-metrics.md))

- Integrated semantic-release v25 for automatic version management using
  conventional commits: auto-bumps version, generates changelog, publishes
  to npm via OIDC/Trusted Publishing, creates GitHub release, and pushes git
  tag. Replaced manual npm publish workflow. GitHub Packages publishing
  continues as a dependent job when a new release is created.
- Added `workflow_dispatch` trigger to publish workflow for manual releases.
- Added `.releaserc.json` configuration and semantic-release dev dependencies.

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
