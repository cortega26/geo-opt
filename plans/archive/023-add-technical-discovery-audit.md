# Plan 023: Add a technical discovery audit for indexable web assets

> **Executor instructions**: Keep local files the default. Network access must
> require an explicit URL target and have strict limits.
>
> **Drift check (run first)**:
> `git diff --stat c6a604a..HEAD -- src bin index.d.ts tests .agents/skills/geo-optimization docs README.md CHANGELOG.md package.json`

## Status

- **Priority**: P1
- **Horizon**: mediano plazo, 2–4 meses
- **Effort**: L
- **Risk**: MED
- **Depends on**: plan 021
- **Category**: direction
- **Planned at**: commit `c6a604a`, 2026-06-26
- **Status**: DONE — Phase 1 (CLI technical + parseSitemapXml) and Phase 2
  (remote fetching with SSRF guards) are implemented and covered

## Reconciliation — 2026-06-29 (Phase 2)

Phase 2 is no longer deferred. The current tree contains the network boundary
and remote technical audit work that this plan originally scoped:

- `src/fetcher.js` is the single outbound HTTP entry point for `geo-opt
  technical`, with SSRF guards, DNS/private-range checks, redirects, timeouts,
  response-size limits, robots helpers and rate-limiting coverage.
- `bin/cli.js` exposes `geo-opt technical [files...]` with local files as the
  default and explicit remote mode through `--url` or `--sitemap`. Remote mode
  supports `--max-urls`, `--timeout`, `--max-size`, `--allow-private`,
  `--allow-localhost` and `--no-robots`.
- `tests/fetcher.test.js` covers SSRF blocking, localhost opt-in, unsupported
  protocols, redirects, timeouts, max-size handling, DNS failures, robots
  helpers, sitemap integration and rate limiting.
- `tests/cli-smoke.test.js` covers `technical --url`, remote/local mutual
  exclusion, scheme restrictions and `technical --sitemap` validation.
- `src/index.js` and `index.d.ts` export and type `fetchUrl`,
  `fetchRobotsTxt` and `checkRobotsRule`.

The remaining documentation drift is outside this plan file:
`docs/architecture.md` still contains stale wording saying there is no supported
`technical` CLI command. Update that public documentation in a separate docs
change with the repo's normal changelog policy.

## Reconciliation — 2026-06-28 (Phase 1)

The pure local HTML observation/finding core and its tests landed in
`src/technical.js`. Phase 1 of the CLI integration is now complete:

- **`geo-opt technical [files...]`**: new CLI command that runs the local HTML
  technical audit. Supports `--format` (text|json), `--source-url` (for relative
  link resolution in local files), and `--output` (JSON file output). Zero
  network access.
- **`parseSitemapXml(xml)`**: new pure function in `src/sitemap.js` that parses
  existing sitemap XML (urlset or sitemapindex) into `{ urls, sitemapUrls,
  valid, issues }`. Exported from `src/index.js` and typed in `index.d.ts`.
  No network access — parsing only. This is the foundation for Phase 2 sitemap
  input.
- CLI smoke tests (11 new tests) and parseSitemapXml unit tests (6 new tests)
  pass; total suite at 521 tests.

Phase 2 was completed after this Phase 1 note; see the 2026-06-29
reconciliation above.

The original 2026-06-27 reconciliation note is preserved below.

## Reconciliation — 2026-06-27

The pure local HTML observation/finding core and its tests landed in
`src/technical.js`. Sitemap support, CLI integration, remote URL fetching and
Python support did not. Do not execute this stale all-in-one plan. Preserve the
local core; create separate future plans for sitemap and remote audit only after
T0, customer evidence and a remote-fetch threat model.

## Why this matters

Both reports place crawlability, indexability, canonicalization, sitemaps, and
textual accessibility above speculative GEO tactics. The current product audits
content files and `robots.txt` but has no checks for canonical links, meta
robots, sitemap validity, status/redirect behavior, hreflang consistency, or
whether critical content exists in the fetched HTML. This is the largest gap
between the product name and the strongest available evidence.

## Current state

- `src/technical.js` provides `observeTechnicalHtml()`, `buildTechnicalFindings()`,
  and `auditTechnicalHtml()` — pure local HTML audit with cheerio (landed pre-2026-06-28).
- `bin/cli.js` exposes `geo-opt technical [files...]` with `--source-url`,
  `--format`, and `--output` flags (landed 2026-06-28, Phase 1).
- `src/sitemap.js` now includes `parseSitemapXml()` for parsing existing sitemap
  XML (urlset and sitemapindex) into structured data (landed 2026-06-28, Phase 1).
- `src/fetcher.js` provides the remote fetch boundary for `geo-opt technical`,
  including SSRF guards, robots helpers, timeouts, size limits and sitemap
  integration tests.
- `bin/cli.js` exposes explicit remote audit through `technical --url` and
  `technical --sitemap`; local files remain the default and are mutually
  exclusive with remote mode.

## Commands you will need

| Purpose     | Command               | Expected on success                       |
| ----------- | --------------------- | ----------------------------------------- |
| JS tests    | `npm test`            | all pass                                  |
| Python port | `npm run test:python` | existing compatibility suite remains `OK` |
| Audit       | `npm audit --json`    | zero high/critical                        |
| Full check  | `npm run check`       | exit 0                                    |

## Scope

**In scope**: new `src/technical.js`, optional `src/sitemap.js`, CLI/public API,
types, config, tests with a local HTTP fixture server, docs, an explicit Python
capability decision, and changelog.

**Out of scope**: browser automation, Search Console credentials, WAF mutation,
unbounded crawling, or automatic publication.

## Git workflow

- Branch: `advisor/023-technical-discovery`
- Separate pure local checks from remote-fetch support in commits/PRs.
- Do not push or open a PR unless the operator explicitly requests it.

## Steps

### Step 1: Implement pure local HTML checks

Return findings for title, visible main text, canonical URL shape, meta robots,
heading order, language/hreflang pairs, internal links, structured-data/text
consistency hooks, and signs of an empty app shell. Do not declare every SPA
broken; report only what is absent from the supplied HTML.

**Verify**: fixtures cover valid static HTML, noindex, conflicting canonicals,
invalid hreflang, blocked links, and empty app shell.

### Step 2: Implement sitemap audit and deterministic generation

Parse XML sitemap and sitemap index files; enforce UTF-8, absolute URLs,
50,000-URL/50MB limits, canonical-only inclusion, meaningful `lastmod`, and
same-host rules. Generate from explicit URL mappings, never by guessing a
production hostname.

**Verify**: round-trip tests and malformed/oversized fixtures pass.

### Step 3: Add bounded remote audit

Add `geo-opt technical audit <file-or-url>`. For URLs, enforce http/https,
redirect/response-size/time limits, a small same-host page cap, user-agent
identification, and clear SSR/CSR wording based on returned HTML. Never access
private network ranges by default; implement SSRF guards before enabling URLs.

**Verify**: local server tests cover redirects, timeout, oversized body, robots
headers, and blocked private destinations.

### Step 4: Integrate reports and capability contracts

Emit plan-021 findings, support JSON/text, expose types, mirror safe behavior
in Python only if plan 034 marks the capability shared, and document that remote
audit is explicit and networked.

**Verify**: full checks pass and local file audits make no network calls.

## Test plan

- Pure HTML fixture matrix.
- Sitemap and sitemap-index limits/round trips.
- SSRF, redirects, timeout, and response-size boundaries.
- CLI error routing to stderr and non-zero exit.
- Node local-fixture coverage; add cross-runtime fixtures only for capabilities
  explicitly marked equivalent by plan 034.

## Done criteria

- [x] Strong-evidence technical fundamentals are auditable.
- [x] Local operation remains the default.
- [x] Remote audit is bounded and SSRF-resistant.
- [x] No output equates technical eligibility with guaranteed indexing.

## STOP conditions

- Remote fetching cannot be made SSRF-safe without a reviewed dependency or
  threat model; ship local checks first and stop before URL support.
- Sitemap generation would need to infer canonical URLs.
- The capability matrix would claim Python support while silently omitting a
  check.

## Maintenance notes

Keep engine-neutral technical observations separate from engine adapters. Most
checks here should remain valid even when individual AI products change.
