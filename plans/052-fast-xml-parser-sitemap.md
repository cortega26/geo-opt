# Plan 052: Parse sitemaps with `fast-xml-parser` instead of regex

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan in
> `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 13fb3bf..HEAD -- src/sitemap.js bin/cli.js src/index.js index.d.ts tests/sitemap.test.js`
> If any of these files changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (changes a parser used by the remote technical-audit path)
- **Horizon**: short term
- **Depends on**: none (complements the remote technical audit from plan 023)
- **Category**: reliability + bug (relates to monedario.cl finding #2)
- **Planned at**: commit `13fb3bf`, 2026-06-29

## Why this matters

`parseSitemapXml` and `validateSitemapXml` parse sitemap XML with hand-written
regular expressions. Regex XML parsing is fragile and is the kind of problem
that already produced the monedario.cl finding #2 (a `<sitemapindex>` not being
walked into its child sitemaps). The current regexes assume a fixed element
order and whitespace, plain `<loc>` with no attributes, no namespaced children
(`<image:loc>`, `<xhtml:link>`), and no CDATA. Real-world sitemaps violate all
of these.

[`fast-xml-parser`](https://www.npmjs.com/package/fast-xml-parser) is a fast,
zero-dependency, pure-JS parser. It is safe by default for this use: it does
**not** resolve external entities or DTDs, so it is not vulnerable to XXE /
billion-laughs the way a naive XML parser would be (keep `processEntities` at its
safe default and do not enable DTD parsing). Adopting it makes sitemap reading
robust against the structures above and gives a clean tree to walk for
`<sitemapindex>` → child `<sitemap>` → `<urlset>`.

This plan covers the **parsing/validation (read) side only**. Sitemap
**generation** already uses safe string building with `xmlEscape`
(`src/sitemap.js`); leave generation untouched.

## Current state

### `src/sitemap.js` — `parseSitemapXml` (regex-based)

```js
export function parseSitemapXml(xml) {
  // ...
  const isUrlset = xml.includes("<urlset");
  const isSitemapIndex = xml.includes("<sitemapindex");
  // ...
  const entryRegex = isSitemapIndex
    ? /<sitemap>\s*<loc>([^<]+)<\/loc>\s*(?:<lastmod>([^<]+)<\/lastmod>\s*)?<\/sitemap>/gi
    : /<url>\s*<loc>([^<]+)<\/loc>\s*(?:<lastmod>([^<]+)<\/lastmod>)?[^<]*<\/url>/gi;
  // ... plus a fallback /<loc>([^<]+)<\/loc>/gi at line ~352
  return { urls, sitemapUrls, valid: issues.length === 0, issues };
}
```

Returns `{ urls, sitemapUrls, valid, issues }`. `urls` are page URLs (from
`<urlset>`); `sitemapUrls` are child sitemap locations (from `<sitemapindex>`).

### `src/sitemap.js` — `validateSitemapXml` (regex-based, line ~397)

Checks XML declaration, required namespace, and validates each `<loc>` URL with
a `/<loc>([^<]+)<\/loc>/g` scan.

### Consumers

- `bin/cli.js:1559` — `const parsed = parseSitemapXml(sitemapResult.html);`
  in the `--sitemap` technical-audit path. **Finding #2 lives here**: when the
  input is a sitemap index, `parsed.sitemapUrls` is populated but the CLI then
  audits those child-sitemap URLs as if they were HTML pages.
- `src/index.js:90` re-exports `parseSitemapXml`; `index.d.ts` declares the
  return shape. The shape is a public contract — **preserve it exactly**.

## Commands you will need

| Purpose      | Command                        | Expected                  |
|--------------|--------------------------------|---------------------------|
| Install      | `npm install fast-xml-parser`  | exit 0; in `dependencies` |
| Sitemap test | `node --test tests/sitemap.test.js` | all pass             |
| Full check   | `npm run check`                | exit 0                    |

## Scope

**In scope**:
- `src/sitemap.js` — reimplement `parseSitemapXml` and `validateSitemapXml`
  on top of `fast-xml-parser`, **keeping their exported signatures and return
  shapes byte-for-byte compatible**.
- `tests/sitemap.test.js` — add cases for the structures regex missed.
- `CHANGELOG.md`.
- **Optional, recommended**: in `bin/cli.js`, resolve finding #2 — when
  `parseSitemapXml` reports a sitemap index (`sitemapUrls.length > 0` and no
  `urls`), either fetch each child sitemap and accumulate their page `urls`
  (preferred), or emit the clear error the bug report's Option B describes. If
  this expands the diff much, file the CLI behavior change as a separate plan
  and keep this one to the parser swap.

**Out of scope**:
- Sitemap **generation** (`generateSitemapXml`, `generateSitemapIndex`,
  `scoreToPriority`, `determineChangefreq`, `xmlEscape`) — unchanged.
- The fetcher (`src/fetcher.js`) — its zero-dependency security design stays.
  If the optional CLI fix fetches child sitemaps, reuse the existing `fetchUrl`;
  do not add a new fetch path.
- Python port.

## Git workflow

- Branch: `advisor/052-fast-xml-parser-sitemap`
- Commit: `refactor(sitemap): parse sitemaps with fast-xml-parser (robust index/namespace handling)`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Install `fast-xml-parser`

```bash
npm install fast-xml-parser
```

**Verify**: `node -e 'import("fast-xml-parser").then(m=>console.log(typeof m.XMLParser))'`
prints `function`. `grep '"fast-xml-parser"' package.json` shows it under
`dependencies`.

### Step 2: Reimplement `parseSitemapXml`

Construct an `XMLParser` with safe, explicit options and walk the tree. Keep the
return shape identical (`{ urls, sitemapUrls, valid, issues }`).

```js
import { XMLParser } from "fast-xml-parser";

const SITEMAP_PARSER = new XMLParser({
  ignoreAttributes: true,
  trimValues: true,
  // processEntities defaults to true but only expands the 5 predefined XML
  // entities; DTD/external entities are NOT processed — safe against XXE.
  parseTagValue: false,
  isArray: (name) => name === "url" || name === "sitemap",
});

export function parseSitemapXml(xml) {
  const issues = [];
  const urls = [];
  const sitemapUrls = [];

  let tree;
  try {
    tree = SITEMAP_PARSER.parse(xml);
  } catch (e) {
    return { urls, sitemapUrls, valid: false, issues: [`XML parse error: ${e.message}`] };
  }

  const urlset = tree.urlset;
  const index = tree.sitemapindex;
  if (!urlset && !index) {
    issues.push("Missing <urlset> or <sitemapindex> root element.");
    return { urls, sitemapUrls, valid: false, issues };
  }

  if (index) {
    for (const entry of index.sitemap ?? []) {
      if (entry?.loc) sitemapUrls.push({ loc: String(entry.loc).trim(), lastmod: entry.lastmod ? String(entry.lastmod).trim() : null });
    }
  }
  if (urlset) {
    for (const entry of urlset.url ?? []) {
      if (entry?.loc) urls.push({ loc: String(entry.loc).trim(), lastmod: entry.lastmod ? String(entry.lastmod).trim() : null });
    }
  }

  if (urls.length === 0 && sitemapUrls.length === 0) {
    issues.push("No <loc> entries found.");
  }
  return { urls, sitemapUrls, valid: issues.length === 0, issues };
}
```

Confirm against the live code whether `urls`/`sitemapUrls` elements are
**objects** (`{ loc, lastmod }`) or **strings**. The docstring at
`src/sitemap.js:303` says objects with `loc`/`lastmod`. Match the live shape
exactly — read the current return statements and the consuming code in
`bin/cli.js:1559` before finalizing. If callers expect plain strings, return
strings; do not change the contract.

**Verify**: `node --test tests/sitemap.test.js` → all existing tests pass.

### Step 3: Reimplement `validateSitemapXml`

Reuse the parser. Validate: root element present, each `<loc>` is a parseable
absolute URL (via `new URL(...)`), and the count is within
`MAX_URLS_PER_SITEMAP`. Preserve the existing `issues` strings where tests assert
them — grep `tests/sitemap.test.js` for asserted substrings (e.g.
`"Invalid URL in <loc>"`, `"Missing <urlset>"`) and keep those exact messages.

**Verify**: `node --test tests/sitemap.test.js` → all pass.

### Step 4: Add tests for previously-broken structures

Add to `tests/sitemap.test.js`:

1. `<sitemapindex>` with two children → `sitemapUrls.length === 2`, `urls` empty.
2. `<urlset>` where `<url>` children are in a different element order
   (`<lastmod>` before `<loc>`) → still parsed.
3. `<loc>` value wrapped in CDATA → URL extracted.
4. A urlset containing namespaced `<image:image><image:loc>` children → page
   `<loc>` still parsed and image locs ignored (not counted as page URLs).
5. Malformed XML → `{ valid: false, issues: [...] }`, no throw.

**Verify**: `node --test tests/sitemap.test.js` → new tests pass.

### Step 5 (optional, recommended): fix finding #2 in `bin/cli.js`

At `bin/cli.js:1559`, after `parseSitemapXml`, branch on a detected index:

- If `parsed.sitemapUrls.length > 0` and `parsed.urls.length === 0`: this is a
  sitemap index. Fetch each child sitemap with the existing `fetchUrl`, run
  `parseSitemapXml` on each, accumulate their `urls`, then audit those page
  URLs. Cap the number of child sitemaps and total URLs to keep runtime bounded
  (reuse any existing limit constant; if none, cap conservatively and document
  it). Remove or correct the contradictory "Only direct URLs are processed"
  warning noted in the bug report.

If this is more than a small change, STOP and file it as plan 057; keep this
plan to Steps 1–4.

**Verify**: a smoke test with a sitemap-index fixture audits page URLs, not XML
files (add a `tests/cli-smoke.test.js` case or a `tests/fixtures` sample).

### Step 6: Full check + changelog

Under `## [Unreleased]`:

```markdown
### Changed
- Sitemap parsing/validation now uses `fast-xml-parser` instead of regex,
  correctly handling sitemap indexes, attribute/element-order variation,
  namespaced children, and CDATA (`src/sitemap.js`).
```

(Add a `### Fixed` bullet for the `--sitemap` index handling if Step 5 landed.)

**Verify**: `npm run check` → exit 0.

## Test plan

- All existing `tests/sitemap.test.js` cases pass unmodified (contract preserved).
- New cases cover index, element order, CDATA, namespaces, malformed input.
- If Step 5 landed: a CLI smoke test proves sitemap-index input audits page URLs.

## Done criteria

- [ ] `grep -n "entryRegex\|locRegex" src/sitemap.js` returns nothing
- [ ] `grep -n '"fast-xml-parser"' package.json` shows it under `dependencies`
- [ ] `parseSitemapXml` / `validateSitemapXml` return shapes unchanged (consumers
  and `index.d.ts` untouched, or updated only if the live shape was already
  different from the docstring)
- [ ] `node --test tests/sitemap.test.js` passes (old + new)
- [ ] `npm run check` exits 0
- [ ] Generation code paths untouched (`git diff src/sitemap.js` shows no change
  to `generateSitemapXml`/`xmlEscape`)
- [ ] Only in-scope files modified
- [ ] `plans/README.md` status row updated

## STOP conditions

- An existing sitemap test fails because the return shape changed — restore the
  exact contract (objects vs strings, field names) and report.
- `index.d.ts` would need a breaking change to the public `parseSitemapXml` type
  — STOP and report; a public-contract change needs the documentation-governance
  synchronized-update review.
- Step 5 expands the diff beyond a small, reviewable change — keep the parser
  swap and file the CLI behavior change separately.
- `fast-xml-parser` parse throws on a fixture the regex previously tolerated —
  wrap in try/catch returning `valid: false` (do not crash the audit).

## Maintenance notes

- Keep `fast-xml-parser` on its safe defaults: do **not** enable DTD processing
  or external-entity resolution. Document this next to the `XMLParser` config so
  a future contributor does not loosen it.
- `isArray` normalizes single-child sitemaps/urls to arrays so the walk code is
  uniform; if a future option changes that, the `?? []` guards still hold.
- This parser can be reused later for RSS/Atom feed discovery (a candidate
  `llms.txt` enhancement) — note it there rather than adding a second XML parser.
