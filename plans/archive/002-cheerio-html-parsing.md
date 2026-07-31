# Plan 002: Replace regex-based HTML parsing with cheerio

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 4dff240..HEAD -- src/schema.js src/scoring.js src/text.js tests/optimizer.test.js`
> If any of these files changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: 001 (needs coverage baseline to confirm no regressions)
- **Category**: tech-debt (reliability improvement)
- **Planned at**: commit `4dff240`, 2026-06-26

## Why this matters

The current codebase uses regex to parse, clean, and manipulate HTML in six
different locations across three files. Regex-based HTML parsing is
inherently fragile: it breaks on malformed markup, nested tags, attributes
containing `>`, comments that look like tags, and HTML entities in
unexpected positions. Each of these edge cases silently produces wrong
scores, wrong schema data, or corrupted injected output.

**cheerio** (v1.0+) provides a jQuery-like API over an htmlparser2
backend. It is ~30KB gzipped, has zero transitive dependencies outside
htmlparser2, and is the standard lightweight HTML parser in the Node.js
ecosystem. It handles all the edge cases regex misses: attribute quoting,
self-closing tags, HTML entities, comments, and deeply nested structures.

## Current state

### File: `src/schema.js` — HTML cleaning and meta extraction

**`cleanHtmlText()`** (`schema.js:82-95`) uses 7 chained regex replacements
to strip tags and decode entities. It will miss entities not in its small
hardcoded table (`&copy;`, `&reg;`, `&#xHH;`), and a stray unescaped `>`
inside an attribute value will leak through as text:

```js
function cleanHtmlText(value) {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}
```

**Meta description extraction** (`schema.js:141-149`) uses a carefully
crafted regex lookahead pattern for `<meta name="description">`. It fails
if `content` appears before `name` in the tag's attribute order (which is
valid HTML):

```js
const metaMatch = cleanText.match(
  /<meta\b(?=[^>]*\bname=["']description["'])(?=[^>]*\bcontent=(["'])([\s\S]*?)\1)[^>]*>/i
);
```

### File: `src/scoring.js` — Semantic HTML and SPA detection

**Semantic tag detection** (`scoring.js:99`) uses `.includes()` on the
lowercased text, which triggers false positives when tag names appear in
plain text, code samples inside `<pre>`, or comments:

```js
const semanticTags = ["<article", "<main", "<header", "<footer", "<nav", "<section"];
const foundTags = semanticTags.filter((t) => htmlLower.includes(t));
```

**SPA detection** (`scoring.js:113`) uses the same fragile `.includes()`,
which can't distinguish `<div id="app">` from a sentence like "the div
id='app' component":

```js
const dynamicIndicators = ['id="app"', 'id="root"', "createapp(", "reactdom.render("];
```

### File: `src/text.js` — Script/style stripping

**`preprocessContent()`** (`text.js:18-27`) strips `<script>` and `<style>`
blocks with regex. The regex `[\s\S]*?` is non-greedy but will still match
incorrectly if a script tag contains a string literal with `</script>`:

```js
export function preprocessContent(content) {
  let text = content.replace(/```[\s\S]*?```/g, "");
  text = text.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "");
  text = text.replace(/<!--[\s\S]*?-->/g, "");
  return text;
}
```

### Repo conventions

- ESM with double quotes and semicolons (`AGENTS.md:107`).
- Public API re-exported via `src/index.js`. New internal functions
  exported from `src/schema.js` or `src/text.js` must be re-exported there
  if tested directly.
- Tests in `tests/optimizer.test.js` use `node:test` + `node:assert`.
  Named subtests via `test("descriptive name", () => { ... })`.
- Config objects follow the shape in `tests/optimizer.test.js:30-52`.
- Changelog policy: every code change needs a bullet under
  `## [Unreleased]` in `CHANGELOG.md`.

## Commands you will need

| Purpose       | Command                    | Expected on success                    |
|---------------|----------------------------|----------------------------------------|
| Install       | `npm install`              | exit 0                                 |
| Tests         | `npm test`                 | exit 0, all tests pass                 |
| Coverage      | `npm run test:coverage`    | exit 0, report printed, coverage ≥70%  |
| Lint          | `npm run lint`             | exit 0                                 |
| Format check  | `npm run format:check`     | exit 0                                 |
| Full check    | `npm run check`            | exit 0                                 |

## Suggested executor toolkit

- `vercel-react-best-practices` or `nodejs-best-practices` — pattern
  reference for clean module structure, if available.
- `code-review` skill — run after step 4 to review the diff for missed edge
  cases.

## Scope

**In scope** (the only files you should modify):
- `src/text.js` — replace regex-based stripping in `preprocessContent()`
- `src/schema.js` — replace `cleanHtmlText()` and meta extraction with
  cheerio-based implementation
- `src/scoring.js` — replace semantic tag detection and SPA detection
  with cheerio-based DOM queries
- `tests/optimizer.test.js` — add new test cases for edge cases that cheerio
  now handles correctly
- `CHANGELOG.md` — add Unreleased entry

**Out of scope** (do NOT touch, even though they look related):
- `src/robots.js` — does not parse HTML; regex is correct for
  robots.txt format.
- `bin/cli.js` — CLI wiring stays the same; all function signatures
  exported from src/ remain identical.
- Python `geo_optimizer.py` — Python HTML parsing improvement is a separate
  plan (006). Do not touch Python files.
- `preprocessContent()` function signature — must remain identical (takes
  string, returns string). Same for `cleanHtmlText()` and all exported
  functions.
- The `cheerio` import pattern — use `import * as cheerio from "cheerio"`
  (namespace import) per cheerio v1 convention. Do not use default import.

## Git workflow

- Branch: `advisor/002-cheerio-html-parsing`
- Commit style: conventional commits. Example: `feat: replace regex HTML
  parsing with cheerio in schema, scoring, and text modules`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 0: Record pre-refactor coverage

Before touching any source files, capture the coverage baseline:

```bash
npm run test:coverage
```

Save the full output — you will compare against it after the refactor to
confirm coverage did not drop.

**Verify**: command exits 0 and prints coverage ≥ 70%.

### Step 1: Install cheerio

```bash
npm install cheerio
```

**Verify**: `node -e 'import * as cheerio from "cheerio"; console.log(typeof cheerio.load)'` →
prints `function`. `grep '"cheerio"' package.json` returns a line in
`dependencies` (not devDependencies — cheerio is a runtime dependency).

### Step 2: Refactor `src/text.js` — `preprocessContent()`

Replace the script/style/comment regex in `preprocessContent()` with
cheerio-based stripping while keeping the markdown code-block regex (cheerio
doesn't parse markdown).

The new implementation:

```js
import * as cheerio from "cheerio";

export function preprocessContent(content) {
  // Strip markdown code blocks first (cheerio doesn't parse markdown)
  let text = content.replace(/```[\s\S]*?```/g, "");
  // Strip HTML comments (cheerio preserves comment nodes, so handle before parsing)
  text = text.replace(/<!--[\s\S]*?-->/g, "");
  // Use cheerio to strip <script> and <style> elements reliably
  const $ = cheerio.load(text);
  $("script, style").remove();
  return $.html();
}
```

Important: `$.html()` returns the DOM serialized back to a string. The
function's contract is "return preprocessed text content" — callers
(`auditFile`, `generateSchemaData`, `extractSections`) work on strings
and apply their own further parsing. Confirm the test
`"preprocessContent strips scripts and styles"` (search for it in
`tests/optimizer.test.js`; if absent, add it) still passes.

**Verify**: `npm test` → all existing tests pass. No test failures.

### Step 3: Refactor `src/schema.js` — `cleanHtmlText()` and `generateSchemaData()`

#### 3a. Replace `cleanHtmlText()`

Replace the 7-regex chain with a single cheerio invocation:

```js
import * as cheerio from "cheerio";

function cleanHtmlText(value) {
  const $ = cheerio.load(value);
  return $.text().replace(/\s+/g, " ").trim();
}
```

`$.text()` already decodes ALL HTML entities (not just the 6 hardcoded
ones) and strips all tags. No changes to the function signature or callers.

#### 3b. Replace meta description regex in `generateSchemaData()`

Replace the fragile lookahead regex (`schema.js:142-146`) with a cheerio
DOM query. Inside `generateSchemaData()`, in the block that computes
`description` (around line 139-150), replace the meta regex fallback with:

```js
if (!description && (filepath.endsWith(".html") || cleanText.toLowerCase().includes("<html"))) {
  // Use cheerio for reliable <meta name="description"> extraction
  const $desc = cheerio.load(content);
  const metaDesc = $desc('meta[name="description"]').attr("content");
  if (metaDesc) {
    description = cleanHtmlText(metaDesc);
  }
  if (!description) {
    const firstParagraph = $desc("p").first().text();
    if (firstParagraph) {
      description = cleanHtmlText(firstParagraph);
    }
  }
}
```

This replaces the paragraph regex fallback too — `$("p").first().text()`
handles all valid `<p>` variants including multi-line and attributed tags.

**Verify**: `npm test` → all existing tests pass. Specifically confirm
tests named `"generateSchemaData"` and `"injectSchema"` still pass.

### Step 4: Refactor `src/scoring.js` — semantic tag and SPA detection

Import cheerio at the top of `src/scoring.js`:

```js
import * as cheerio from "cheerio";
```

#### 4a. Replace semantic tag detection

In `auditFile()`, around line 97-119 (the HTML path block), replace the
`.includes()`-based detection with:

```js
if (filepath.endsWith(".html") || textContent.toLowerCase().includes("<html")) {
  const $html = cheerio.load(content);
  const semanticTags = ["article", "main", "header", "footer", "nav", "section"];
  const foundTags = semanticTags.filter((tag) => $html(tag).length > 0);
  // ... rest of the scoring logic (penalties, breakdown messages) stays identical
```

Note: the cheerio selectors are bare tag names (`"article"`) not angle-bracket
prefixed strings (`"<article"`) — cheerio uses CSS selector syntax.

#### 4b. Replace SPA detection

Replace the `.includes()` check with DOM attribute queries:

```js
const dynamicSelectors = [
  '[id="app"]',
  '[id="root"]',
  // createApp and ReactDOM are still string searches — they appear in
  // inline <script> bodies, not DOM attributes. These stay as-is but
  // are applied to the full content for completeness.
];
const foundDynamicSelectors = dynamicSelectors.filter((sel) => $html(sel).length > 0);
const hasScriptFrameworks = /createapp\(|reactdom\.render\(/i.test(htmlLower);
const foundDynamic = [...foundDynamicSelectors.map(() => "client-side container"), ...(hasScriptFrameworks ? ["JS framework"] : [])];
if (foundDynamic.length > 0) {
  structBreakdown.push(
    "Dynamic Rendering Warning: Detects client-side JS references. Ensure content is pre-rendered / SSR for AI crawler searchability."
  );
}
```

**Verify**: `npm test` → all existing tests pass. Coverage for
`src/scoring.js` is at or above the baseline from Step 0.

### Step 5: Add test cases for cheerio-fixed edge cases

Add the following test cases to `tests/optimizer.test.js`. Model them after
existing tests like `test("extractSections structurally parses headings
and bodies", ...)` at line 71.

**Test 1**: `cleanHtmlText` handles arbitrary HTML entities:

```js
test("cleanHtmlText decodes all standard HTML entities", () => {
  // Re-import or inline test — cleanHtmlText is internal to schema.js.
  // Test via generateSchemaData on an HTML fixture instead.
  const tmp = createTempFile("entity-test.html", `<html><body>
    <h1>Test</h1>
    <p>Price: &euro;50 &mdash; &copy; 2026 &reg;</p>
  </body></html>`);
  const schema = generateSchemaData(tmp, "article", {});
  assert.ok(schema["@graph"].some((n) => n["@type"] === "NewsArticle"));
  // The description should contain decoded entities, not raw &euro; etc.
  const article = schema["@graph"].find((n) => n["@type"] === "NewsArticle");
  assert.ok(!article.description.includes("&euro;"));
  assert.ok(!article.description.includes("&mdash;"));
  fs.rmSync(tmp);
});
```

(Follow the pattern of `createTempFile` used elsewhere in
`tests/optimizer.test.js` — search for its definition and replicate it.)

**Test 2**: `<meta name="description">` with `content` before `name`:

```js
test("generateSchemaData extracts meta description regardless of attribute order", () => {
  const html = `<html><head>
    <meta content="A description here" name="description">
  </head><body>
    <h1>Article Title</h1>
    <p>First paragraph.</p>
  </body></html>`;
  const tmp = createTempFile("meta-order.html", html);
  const schema = generateSchemaData(tmp, "article", {});
  const article = schema["@graph"].find((n) => n["@type"] === "NewsArticle");
  assert.strictEqual(article.description, "A description here");
  fs.rmSync(tmp);
});
```

**Test 3**: Semantic HTML detection ignores tag names in plain text:

```js
test("auditFile does not count tag names in text as semantic HTML", () => {
  const html = `<html><body>
    <h1>Test</h1>
    <p>Use the <main> tag and <article> element for semantics.</p>
  </body></html>`;
  const tmp = createTempFile("text-tags.html", html);
  // Capture stdout to inspect the breakdown messages
  const originalLog = console.log;
  const chunks = [];
  console.log = (msg) => chunks.push(String(msg));
  try {
    auditFile(tmp, {}, "text");
    const output = chunks.join("\n");
    // Should NOT say "Good HTML5 layout tags used" for <main> and <article>
    // because they only appear in text, not as actual DOM elements
    assert.ok(!output.includes("Good HTML5 layout tags used") || output.includes("Found only:"));
  } finally {
    console.log = originalLog;
    fs.rmSync(tmp);
  }
});
```

**Verify**: `npm test` → all new tests pass. `npm run test:coverage` →
coverage for `src/schema.js` and `src/scoring.js` is at or above baseline.

### Step 6: Run full check

```bash
npm run check
```

This runs lint → format:check → test → test:python → changelog:check.

**Verify**: exit 0. All gates pass.

### Step 7: Update changelog

Add one bullet under `## [Unreleased]` / `### Changed`:

```markdown
### Changed
- HTML parsing: replaced regex-based tag/entity handling with cheerio for
  robust HTML5 parsing (`src/schema.js`, `src/scoring.js`, `src/text.js`).
```

**Verify**: `npm run changelog:check` → exit 0.

## Test plan

- Existing tests in `tests/optimizer.test.js` must all pass without
  modification (the refactor preserves all public function contracts).
- New test cases (Step 5):
  1. HTML entity decoding beyond the hardcoded 6
  2. Meta description extraction with reversed attribute order
  3. Semantic tag detection ignoring tag names in text nodes
- Structural pattern: follow the createTempFile + cleanup idiom used
  throughout `tests/optimizer.test.js`. Search for `createTempFile` in the
  test file for the exact helper signature.
- Verification: `npm test` → exit 0, all tests (old + new) pass.

## Done criteria

- [ ] `npm run check` exits 0 (all gates)
- [ ] `npm run test:coverage` exits 0; `src/schema.js`, `src/scoring.js`,
  `src/text.js` coverage ≥ pre-refactor baseline
- [ ] `grep -rn "cleanHtmlText\|<meta\b.*name.*description" src/` shows no
  remaining regex-based HTML entity or meta extraction (cheerio-based
  implementations are the only ones)
- [ ] No files outside in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated
- [ ] `npm run changelog:check` exits 0

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the locations referenced in "Current state" doesn't match the
  excerpts (codebase drifted since this plan was written).
- `npm test` fails after any step (revert the step and report the test
  names that broke).
- `npm run test:coverage` shows a coverage drop ≥5% in any refactored file
  compared to the Step 0 baseline.
- `cheerio` import fails with "ERR_MODULE_NOT_FOUND" — cheerio v1 is ESM,
  confirm the package.json `"type": "module"` is set (it is, line 20).
- Any public function signature or return type changes (a test breaks
  because the return value shape changed — STOP and restore the original
  contract).

## Maintenance notes

- Cheerio v1 uses `import * as cheerio from "cheerio"`. If a future major
  version changes the export shape, the three import sites (text.js,
  schema.js, scoring.js) need updating together.
- `preprocessContent()` is called on every audit and schema operation. The
  `cheerio.load()` call is fast (~1ms for typical content) but if
  performance ever becomes a concern, cache the cheerio parse result across
  `preprocessContent` and subsequent DOM queries in the same request.
- The Python port (plan 006) will mirror these changes with BeautifulSoup4.
  After both plans land, the HTML entity handling logic will be identical
  across languages.
- `cleanHtmlText` is an internal function in `src/schema.js` (not exported
  from `src/index.js`). If a future plan needs it elsewhere, export it.
  For now, test it indirectly through `generateSchemaData()`.
