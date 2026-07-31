# Plan 046: Cover the untested sitemap split/validation paths and lock the HTML-report escaping

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If a
> "STOP conditions" item occurs, stop and report. When done, update the status
> row in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat b09a5f8..HEAD -- src/sitemap.js src/html-report.js tests CHANGELOG.md`
> If `src/sitemap.js` or `src/html-report.js` changed since this plan was
> written, compare the "Current state" excerpts against the live code first.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `b09a5f8`, 2026-06-28

## Why this matters

Two dangerous, public surfaces have no real test coverage:

1. **Sitemap splitting + spec validation (F4).** When a site exceeds
   `MAX_URLS_PER_SITEMAP = 50_000`, `generateSitemapXml`/`generateSitemapFiles`
   switch to a sitemap-index + split-file layout (`src/sitemap.js:206-282`).
   The test named "genera sitemap index cuando hay >50k entradas"
   (`tests/sitemap.test.js:198`) explicitly tests only the *non*-split case (its
   own comment: "verificamos que con pocas entradas NO genera índice"). And
   `validateSitemapXml` — an exported, public spec-compliance checker
   (`src/index.js:89`) — has **zero** test references. The hardest-to-eyeball
   code (chunking, per-chunk latest-`lastmod`, index generation, regex-based
   validation) is unguarded.
2. **HTML report escaping (F8).** `esc()` in `src/html-report.js:14` escapes
   audited content (filepaths, finding messages, recommendations) before it goes
   into a standalone HTML report a user opens in a browser. The four render
   functions are tested, but **every assertion checks for the presence of
   expected strings**; none feeds hostile input and asserts it is escaped. A
   future refactor that drops an `esc()` call would produce a stored-XSS-capable
   report and the suite would stay green. `esc()` also does not escape `'`,
   a latent footgun if any attribute is ever single-quoted.

## Current state

**`generateSitemapFiles`, `src/sitemap.js:235-282`** — splits when
`resolved.length > MAX_URLS_PER_SITEMAP`, returning
`[{name:"sitemap.xml", content:<index>}, {name:"sitemap-1.xml",...}, ...]`.
`generateSitemapXml` (`src/sitemap.js:202-223`) returns a `<sitemapindex>` for
>50k entries, otherwise a `<urlset>`.

**`validateSitemapXml`, `src/sitemap.js:298-362`** — returns
`{ valid: boolean, issues: string[] }`. Checks: XML declaration, `<urlset>`/
`<sitemapindex>` root, sitemap.org namespace, `<loc>` URL protocol, `changefreq`
values, `priority` in [0,1], `lastmod` parseable.

**`esc`, `src/html-report.js:14-20`** (current):
```js
function esc(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
```
Exported render functions: `renderV1ReportHtml(report, filepath, options)`,
`renderV2ReportHtml(...)`, `renderAggregateReportHtml(results, summary, options)`,
`renderComparisonHtml(before, after, filepath, options)`. Hostile strings reach
HTML via `esc(filepath)`, `esc(f.message)`, `esc(r)` (recommendations), and the
page title.

**Conventions**: node:test. `tests/sitemap.test.js` uses `describe`/`it`. The
existing HTML-report tests live in `tests/optimizer.test.js:2490-2588` and
import the render functions at lines 50–53; reuse their report-construction
shape.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Sitemap tests | `node --test tests/sitemap.test.js` | all pass |
| HTML-report tests | `node --test tests/optimizer.test.js` | all pass |
| Full suite | `npm test` | all pass |
| Lint / format | `npm run lint` / `npm run format:check` | exit 0 |

## Scope

**In scope**: `src/html-report.js` (one-line `esc()` change only),
`tests/sitemap.test.js`, `tests/optimizer.test.js` (or a new
`tests/html-report.test.js`), `CHANGELOG.md`.

**Out of scope**: sitemap/report rendering logic (only `esc()` changes); the
CLI; the Python port. Do NOT change `MAX_URLS_PER_SITEMAP`.

## Git workflow

- Branch: `advisor/046-cover-sitemap-and-report-escaping`
- Commit style: `test(sitemap,report): cover split/validate paths; escape ' in report`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Escape single quotes in `esc()`

In `src/html-report.js`, add one line to `esc()`:
```js
function esc(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
```

**Verify**: `node --test tests/optimizer.test.js` → existing report tests still
pass (more escaping only; the assertions check for entities/expected text).

### Step 2: HTML-report escaping regression tests (F8)

Add tests near the existing HTML-report tests (or in a new
`tests/html-report.test.js`). Reuse the `report` object construction from
`tests/optimizer.test.js:2490` (the working `renderV1ReportHtml` test). For at
least `renderV1ReportHtml` and `renderAggregateReportHtml`:
- Pass a `filepath` containing `<script>` and a finding whose `message` is
  `"<script>alert('xss')</script>"`.
- Assert the returned HTML **does not contain** the literal substring
  `<script>alert(` (i.e. `assert.ok(!html.includes("<script>alert("))`).
- Assert it **does contain** the escaped form `&lt;script&gt;`.
- Add one assertion that a value containing `'` and `"` comes out as `&#39;`
  / `&quot;`.

**Verify**: `node --test <the test file>` → new tests pass.

### Step 3: Sitemap split-path tests (F4)

In `tests/sitemap.test.js`, add a `describe("generateSitemapFiles split", ...)`:
- Build `51000` minimal entries: `Array.from({length: 51000}, (_, i) => ({ url:
  "/p" + i, score: 50 }))`.
- `const files = generateSitemapFiles(entries, { baseUrl: "https://example.com" })`.
- Assert `files[0].name === "sitemap.xml"` and its content includes
  `<sitemapindex`.
- Assert the presence of `sitemap-1.xml` and `sitemap-2.xml` entries in `files`
  (51000 / 50000 → 2 chunks).
- Assert each split file's content includes `<urlset`.
- Also assert `generateSitemapXml(entries, { baseUrl })` returns a string
  containing `<sitemapindex` (the >50k branch).

(51k tiny objects build in well under a second; no I/O.)

### Step 4: `validateSitemapXml` tests (F4)

Add a `describe("validateSitemapXml", ...)`:
- **Valid**: `validateSitemapXml(generateSitemapXml([{ url: "/a", score: 80 }],
  { baseUrl: "https://example.com" }))` → `valid: true`, `issues` empty.
- **Bad protocol**: a hand-written `<urlset>` doc with
  `<loc>ftp://example.com/x</loc>` → `valid: false`, an issue mentioning
  "invalid protocol".
- **Bad changefreq**: a doc with `<changefreq>often</changefreq>` → invalid.
- **Priority out of range**: `<priority>2.0</priority>` → invalid.
- **Bad lastmod**: `<lastmod>not-a-date</lastmod>` → invalid.
- **Missing namespace/declaration**: a doc without the sitemap.org namespace →
  invalid.

Each hand-written doc only needs the minimal `<?xml ...?><urlset ...>…</urlset>`
shell with the one bad field; assert `result.valid === false` and that
`result.issues` contains a matching message.

**Verify**: `node --test tests/sitemap.test.js` → all new tests pass.

### Step 5: Changelog

Under `## [Unreleased]`:
- `### Security`:
  `- The Pro HTML report now escapes single quotes (\`'\`) in addition to \`& < > "\`.`
- `### Tests` (create if absent):
  `- Added coverage for sitemap index/splitting (>50k URLs) and \`validateSitemapXml\` spec checks, and XSS-escaping regression tests for the HTML report renderers.`

**Verify**: `npm run changelog:check` → exit 0.

## Test plan

- F8: hostile-input escaping assertions on ≥2 render functions.
- F4: `generateSitemapFiles`/`generateSitemapXml` split-path + 6
  `validateSitemapXml` cases.
- `npm test` → all pass; coverage of `src/sitemap.js` split/validate lines and
  `src/html-report.js` `esc` increases.

## Done criteria

ALL must hold:

- [ ] `node --test tests/sitemap.test.js` passes with the new split + validate tests
- [ ] The HTML-report escaping tests pass and would FAIL if an `esc()` call were
      removed (sanity-check by temporarily deleting one `esc()` wrapper locally,
      confirming a red test, then reverting — do NOT commit the deletion)
- [ ] `grep -n "&#39;" src/html-report.js` shows the single-quote escape
- [ ] `npm test`, `npm run lint`, `npm run format:check`, `npm run changelog:check`
      all exit 0
- [ ] Only in-scope files modified
- [ ] `plans/README.md` status row for 046 updated

## STOP conditions

Stop and report if:

- `validateSitemapXml` reports a hand-written "valid" control document as
  invalid — that would indicate a real validator bug; report it (it becomes a
  separate fix, not something to paper over by weakening the test).
- The split-path test shows a chunk count other than 2 for 51000 entries, or the
  index `lastmod` reduce throws — report the actual output.
- The "Current state" excerpts don't match live code (drift).

## Maintenance notes

- If `MAX_URLS_PER_SITEMAP` is ever made configurable, lower it in the test to
  avoid building 51k entries.
- The single-quote escape closes a latent (not currently exploitable) gap; a
  reviewer should still require that all HTML attributes in `html-report.js` use
  double quotes so `esc()` output is always attribute-safe.
- These tests are characterization guards: they should fail loudly if the
  escaping or splitting behavior regresses.
