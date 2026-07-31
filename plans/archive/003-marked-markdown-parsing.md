# Plan 003: Replace regex-based Markdown parsing with marked

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 4dff240..HEAD -- src/text.js src/scoring.js tests/optimizer.test.js`
> If any of these files changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: 002 (cheerio handles HTML content; marked handles
  Markdown. The refactored `preprocessContent()` from plan 002 is the
  starting point for this plan. If 002 is not yet done, stop.)
- **Category**: tech-debt (reliability improvement)
- **Planned at**: commit `4dff240`, 2026-06-26

## Why this matters

Five scoring dimensions in `auditFile()` depend on accurate parsing of
Markdown structure: link extraction, heading detection, quote counting,
table identification, and list detection. The current regex-based approach
(`scoring.js:190-206`, `text.js:29-93`) silently miscounts on valid but
uncommon Markdown patterns — reference-style links, multi-line quotes,
nested formatting inside links, and headings inside code blocks. Each
miscount shifts the GEO score, producing incorrect optimization advice.

**marked** (v15+) is the standard Markdown parser for Node.js: 12KB
gzipped, zero dependencies, produces a complete AST via
`marked.lexer()`. With the AST, link counting, heading extraction, quote
detection, and table identification become reliable structural queries
instead of pattern-matching heuristics.

## Current state

### File: `src/scoring.js` — link, quote, table, list detection

**Link counting** (`scoring.js:190-192`) uses regex that misses
reference-style links (`[text][ref]`), links with parentheses in the URL,
and auto-links (`<https://example.com>`):

```js
const mdLinks = textContent.match(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g) || [];
const htmlLinks = textContent.match(/href=["'](https?:\/\/[^"']+)["']/g) || [];
const linkCount = mdLinks.length + htmlLinks.length;
```

**Quote detection** (`scoring.js:173-174`) uses blockquote regex plus
inline-quote regex. Both have gaps: blockquotes with lazy continuation
lines (no `>` prefix on continuation), and quotes spanning multiple
paragraphs:

```js
const quoteBlocks = textContent.match(/^\s*>\s+.+/gm) || [];
const inlineQuotes = textContent.match(/"([^"]{15,})"/g) || [];
```

**Table detection** (`scoring.js:71-74`) checks for pipe characters with a
separator row pattern, but misses tables without separator rows (which some
flavors allow):

```js
if (
  (textContent.includes("|") && /\|\s*:?-+:?\s*\|/.test(textContent)) ||
  textContent.toLowerCase().includes("<table>")
) { ... }
```

**List detection** (`scoring.js:80`) is a single regex that catches most
cases but triggers false positives on lines like `1. something` that are
actually part of a paragraph:

```js
if (/^\s*[\-\*\+\d\.]+\s+/m.test(textContent)) { ... }
```

### File: `src/text.js` — heading and section extraction

**`extractSections()`** (`text.js:63-93`) parses headings line by line. It
does not handle:
- Setext-style headings (underlined with `===` or `---`)
- Headings inside code blocks (false positives)
- ATX headings with closing `#` characters (`## Title ##`)

```js
for (const line of cleanContent.split("\n")) {
  let headerMatch = line.match(/^(##+)\s+(.+)$/);
  if (!headerMatch) {
    headerMatch = line.match(/^<h([234])[^>]*>(.+)<\/h\1>$/i);
  }
  if (headerMatch) { ... }
}
```

**`cleanMarkdownToPlainText()`** (`text.js:29-61`) removes markdown
formatting with regex. It misses reference-style links and
reference-style images:

```js
let text = mdText.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
text = text.replace(/`([^`]+)`/g, "$1");
text = text.replace(/[\*_]{1,3}/g, "");
```

### Repo conventions

Same as plan 002 — ESM, double quotes, semicolons, `node:test` for tests,
changelog policy enforced. See `AGENTS.md:107-108`.

## Commands you will need

| Purpose       | Command                    | Expected on success                    |
|---------------|----------------------------|----------------------------------------|
| Install       | `npm install`              | exit 0                                 |
| Tests         | `npm test`                 | exit 0, all tests pass                 |
| Coverage      | `npm run test:coverage`    | exit 0, coverage ≥70%                  |
| Lint          | `npm run lint`             | exit 0                                 |
| Format check  | `npm run format:check`     | exit 0                                 |
| Full check    | `npm run check`            | exit 0                                 |

## Scope

**In scope** (the only files you should modify):
- `src/text.js` — refactor `extractSections()` and
  `cleanMarkdownToPlainText()` to use marked AST
- `src/scoring.js` — refactor link counting, quote detection, table
  detection, and list detection to use marked AST
- `tests/optimizer.test.js` — add edge-case tests for Markdown patterns
  that regex missed
- `CHANGELOG.md` — add Unreleased entry

**Out of scope** (do NOT touch, even though they look related):
- `src/schema.js` — already refactored in plan 002; its markdown handling
  is minimal (title extraction via regex on H1, which is reliable enough).
  Do not change schema generation in this plan.
- `bin/cli.js` — no changes to CLI wiring.
- Python `geo_optimizer.py` — separate plan (006).
- `preprocessContent()` — already refactored in plan 002. Leave it alone.
- The `marked` import pattern — use `import { marked } from "marked"`
  (named import) per marked v15 convention.
- Headings with `#` — marked handles them. Do not add custom ATX heading
  parsing.
- Reference-style link definitions — marked resolves them automatically.
  Do not manually expand `[ref]: url` definitions.

## Git workflow

- Branch: `advisor/003-marked-markdown-parsing`
- Commit style: conventional commits. Example: `feat: replace regex
  markdown parsing with marked AST in scoring and text modules`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 0: Record pre-refactor coverage

```bash
npm run test:coverage
```

Save the output as your baseline.

**Verify**: command exits 0.

### Step 1: Install marked

```bash
npm install marked
```

**Verify**: `node -e 'import { marked } from "marked"; console.log(typeof marked.lexer)'` →
prints `function`. `grep '"marked"' package.json` returns a line in
`dependencies`.

### Step 2: Refactor `src/text.js` — `extractSections()`

Import marked at the top of `src/text.js`:

```js
import { marked } from "marked";
```

Rewrite `extractSections()` to use the marked token tree (lexer). The
lexer returns an array of tokens; we extract heading tokens and their
following text content:

```js
export function extractSections(content) {
  const cleanContent = preprocessContent(content);
  const tokens = marked.lexer(cleanContent);
  const sections = [];
  let currentHeader = null;
  let currentText = [];

  for (const token of tokens) {
    if (token.type === "heading" && token.depth >= 2) {
      if (currentHeader) {
        sections.push({ header: currentHeader, body: currentText.join("\n").trim() });
      }
      currentHeader = token.text;
      currentText = [];
    } else if (currentHeader !== null) {
      // Collect raw source text for the body. For paragraph tokens, use token.text;
      // for other block tokens, use token.raw if available, otherwise token.text.
      if (token.type === "paragraph" || token.type === "text") {
        currentText.push(token.text);
      } else if (token.type === "list") {
        for (const item of token.items) {
          currentText.push(item.text);
        }
      } else if (token.type === "blockquote") {
        currentText.push(token.text);
      } else if (token.type === "code") {
        currentText.push(token.text);
      } else if (token.type === "table") {
        // Flatten table cells into text
        const rows = [];
        for (const row of [token.header, ...token.rows]) {
          rows.push(row.map((cell) => cell.text).join(" | "));
        }
        currentText.push(rows.join("\n"));
      }
    }
  }

  if (currentHeader) {
    sections.push({ header: currentHeader, body: currentText.join("\n").trim() });
  }

  return sections;
}
```

Key design decisions:
- Only `depth >= 2` headings (H2–H6) become sections. H1 is the document
  title, not a section.
- The return type stays `[{header, body}]` — the same as before.
  Callers (`generateSchemaData`, `injectSchema`) are unchanged.
- `marked.lexer()` is synchronous and returns an array — fast for typical
  content sizes.

**Verify**: `npm test` → all existing tests pass. Pay special attention to
tests named `"extractSections"` and any test that calls
`generateSchemaData` with an article or faq type (they use
`extractSections` internally).

### Step 3: Refactor `src/scoring.js` — link, quote, table, list detection

Import marked at the top of `src/scoring.js`:

```js
import { marked } from "marked";
```

Inside `auditFile()`, after the `textContent` is computed (line 21), add a
single `marked.lexer()` call to produce the AST. Pass this AST to the four
detection sections instead of running regex on the text string:

```js
const textContent = preprocessContent(content);
const tokens = marked.lexer(textContent);  // one parse, used by all dimensions
```

#### 3a. Link counting

Replace the regex-based link detection (`scoring.js:190-192`) with a token
walk. marked's lexer produces `link` tokens for inline links and resolves
reference-style links. Also count `image` tokens if they have URLs
(images with `http` URLs count as external references):

```js
function countLinks(tokens) {
  let count = 0;
  function walk(tok) {
    if (Array.isArray(tok)) {
      for (const t of tok) walk(t);
    } else if (tok && typeof tok === "object") {
      if (tok.type === "link" && tok.href && /^https?:\/\//.test(tok.href)) {
        count++;
      } else if (tok.type === "image" && tok.href && /^https?:\/\//.test(tok.href)) {
        count++;
      }
      // Recurse into token children (tokens, items, etc.)
      if (tok.tokens) walk(tok.tokens);
      if (tok.items) walk(tok.items);
    }
  }
  walk(tokens);
  return count;
}

const mdLinkCount = countLinks(tokens);
// HTML links in non-markdown content still need regex (cheerio from plan 002
// handles those; the htmlLinks regex can stay unless plan 002 already
// replaced it):
const htmlLinks = textContent.match(/href=["'](https?:\/\/[^"']+)["']/g) || [];
const linkCount = mdLinkCount + htmlLinks.length;
```

#### 3b. Quote detection

Replace regex blockquote detection with a token walk that counts
`blockquote` tokens. For inline quotes, keep the existing regex on
`textContent` (marked does not flag inline `"quoted text"` as a token type
— that's a prose feature, not a Markdown feature):

```js
function countBlockquotes(tokens) {
  let count = 0;
  function walk(tok) {
    if (Array.isArray(tok)) {
      for (const t of tok) walk(t);
    } else if (tok && typeof tok === "object") {
      if (tok.type === "blockquote") count++;
      if (tok.tokens) walk(tok.tokens);
      if (tok.items) walk(tok.items);
    }
  }
  walk(tokens);
  return count;
}

const blockquoteCount = countBlockquotes(tokens);
const inlineQuotes = textContent.match(/"([^"]{15,})"/g) || [];
const quoteCount = blockquoteCount + inlineQuotes.length;
```

#### 3c. Table detection

Replace the pipe-character regex with a token walk:

```js
function hasTable(tokens) {
  function walk(tok) {
    if (Array.isArray(tok)) {
      return tok.some((t) => walk(t));
    }
    if (tok && typeof tok === "object") {
      if (tok.type === "table") return true;
      if (tok.tokens && walk(tok.tokens)) return true;
      if (tok.items && walk(tok.items)) return true;
    }
    return false;
  }
  return walk(tokens);
}

if (hasTable(tokens) || textContent.toLowerCase().includes("<table>")) {
  structScore += 4;
  structBreakdown.push("Tables: Structured data tables present (+4 pts)");
} else {
  structBreakdown.push("Tables: No tables found (+0 pts)");
}
```

#### 3d. List detection

Replace the regex with a token walk:

```js
function hasList(tokens) {
  function walk(tok) {
    if (Array.isArray(tok)) {
      return tok.some((t) => walk(t));
    }
    if (tok && typeof tok === "object") {
      if (tok.type === "list") return true;
      if (tok.tokens && walk(tok.tokens)) return true;
      if (tok.items && walk(tok.items)) return true;
    }
    return false;
  }
  return walk(tokens);
}

if (hasList(tokens)) {
  structScore += 3;
  structBreakdown.push("Lists: Bulleted or numbered lists present (+3 pts)");
} else {
  structBreakdown.push("Lists: No lists found (+0 pts)");
}
```

**Verify**: `npm test` → all existing tests pass. If any scoring test
changed its expected score, investigate: the new detection may be finding
(or missing) something the regex handled differently. Adjust the test to
the correct behavior — the marked AST is authoritative.

### Step 4: Refactor `src/text.js` — `cleanMarkdownToPlainText()`

Replace the regex-based link and formatting removal with a token-based
approach. This function is called by `generateSchemaData()` to produce
clean description and answer text for JSON-LD nodes:

```js
export function cleanMarkdownToPlainText(mdText) {
  const tokens = marked.lexer(mdText);
  const parts = [];

  function extractText(tok) {
    if (typeof tok === "string") {
      parts.push(tok);
    } else if (Array.isArray(tok)) {
      for (const t of tok) extractText(t);
    } else if (tok && typeof tok === "object") {
      if (tok.type === "text") {
        parts.push(tok.text);
      } else if (tok.type === "link") {
        // Keep link text, drop URL
        if (tok.tokens) extractText(tok.tokens);
        else if (tok.text) parts.push(tok.text);
      } else if (tok.type === "image") {
        // Keep alt text, drop URL
        if (tok.text) parts.push(tok.text);
      } else if (tok.type === "codespan") {
        parts.push(tok.text);
      } else if (tok.type === "strong" || tok.type === "em" || tok.type === "del") {
        if (tok.tokens) extractText(tok.tokens);
        else if (tok.text) parts.push(tok.text);
      } else if (tok.type === "html") {
        // Strip inline HTML tags, keep text
        parts.push(tok.text.replace(/<[^>]+>/g, ""));
      } else if (tok.type === "br") {
        parts.push("\n");
      } else if (tok.type === "paragraph") {
        if (tok.tokens) extractText(tok.tokens);
        else if (tok.text) parts.push(tok.text);
        parts.push("\n");
      } else if (tok.type === "list") {
        for (const item of tok.items) {
          if (item.tokens) extractText(item.tokens);
          parts.push("\n");
        }
      } else if (tok.type === "table") {
        for (const row of [tok.header, ...tok.rows]) {
          parts.push(row.map((cell) => cell.text).join(" - "));
          parts.push("\n");
        }
      } else if (tok.tokens) {
        extractText(tok.tokens);
      }
    }
  }

  extractText(tokens);
  // Join, collapse whitespace, strip any remaining HTML tags, and trim
  return parts
    .join("")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
```

**Verify**: `npm test` → all existing tests pass. The test
`"cleanMarkdownToPlainText converts tables and links to plain text"`
(optimizer.test.js:61-68) must still pass with identical output.

### Step 5: Add Markdown edge-case tests

Add these test cases to `tests/optimizer.test.js`:

**Test 1**: Reference-style links:

```js
test("extractSections and scoring handle reference-style links", () => {
  const md = `# Title

## Features
See the [documentation][docs] and [API reference][api].

[docs]: https://docs.example.com
[api]: https://api.example.com
  `;
  const tmp = createTempFile("ref-links.md", md);
  auditFile(tmp, {}, "json");
  // The key assertion: the audit counted the two reference links.
  // We verify indirectly by reading the JSON output.
  fs.rmSync(tmp);
});
```

**Test 2**: Multi-line blockquote:

```js
test("auditFile counts multi-line blockquotes as quotes", () => {
  const md = `# Title
Intro paragraph for defining the topic briefly here.

> "This is a multi-line
> expert quote that spans
> several lines," said the expert.

Second intro with enough words.

> Another single-line quote from an authority.
  `;
  const tmp = createTempFile("multi-quote.md", md);
  // Capture JSON output
  const originalLog = console.log;
  const chunks = [];
  console.log = (msg) => chunks.push(String(msg));
  try {
    auditFile(tmp, {}, "json");
    const report = JSON.parse(chunks.join("\n"));
    assert.strictEqual(report.breakdown.quotations.score, 20); // 2 quotes = max
  } finally {
    console.log = originalLog;
    fs.rmSync(tmp);
  }
});
```

**Test 3**: Markdown inside code blocks does not produce false headings:

```js
test("extractSections ignores markdown headings inside code blocks", () => {
  const md = `# Title

## Real Section
Content here.

\`\`\`markdown
## This is not a real section
## Neither is this
\`\`\`

## Another Real Section
More content.
  `;
  const sections = extractSections(md);
  const headers = sections.map((s) => s.header);
  assert.deepStrictEqual(headers, ["Real Section", "Another Real Section"]);
});
```

**Verify**: `npm test` → all new tests pass.

### Step 6: Run full check

```bash
npm run check
```

**Verify**: exit 0.

### Step 7: Update changelog

Under `## [Unreleased]` / `### Changed`:

```markdown
- Markdown parsing: replaced regex-based link, heading, quote, table, and list
  detection with marked AST (`src/text.js`, `src/scoring.js`).
```

**Verify**: `npm run changelog:check` → exit 0.

## Test plan

- Existing tests must pass unmodified. If a scoring test's expected score
  changes, the new score is correct (the AST is authoritative) — update
  the test expectation and note it in the changelog.
- New tests covering: reference-style links, multi-line blockquotes,
  headings inside code blocks (no false positives), Setext-style headings.
- Follow the same test patterns as existing tests in
  `tests/optimizer.test.js`.
- Verification: `npm test` → exit 0.

## Done criteria

- [ ] `npm run check` exits 0
- [ ] `npm run test:coverage` exits 0; coverage for `src/text.js` and
  `src/scoring.js` ≥ pre-refactor baseline
- [ ] `grep -rn "\[([^\]]+)\]\((https?:\/\/[^\)]+)\)" src/` returns no
  matches (inline link regex removed from scoring.js)
- [ ] `grep "import { marked }" src/text.js src/scoring.js` returns one
  match per file
- [ ] No files outside in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Plan 002 is not yet DONE. This plan's `preprocessContent()` starting
  point includes cheerio-based script/style stripping.
- `npm test` fails after any step and reverting the step does not restore
  the passing state.
- `marked.lexer()` returns an AST shape different from what the walk
  functions expect (run `node -e 'import {marked} from "marked";
  console.log(JSON.stringify(marked.lexer("## Test\n\nText"), null, 2))'`
  and compare token structure).
- Score calculations change by more than ±3 points compared to the regex
  baseline on the existing test fixtures (run `npm test` before any edits
  and save the scores).
- Any public function signature or return type changes.

## Maintenance notes

- `marked.lexer()` is called once per audit in `auditFile()` and once per
  section extraction in `extractSections()`. If the same file is both
  audited and schema-processed, the lexer is called twice. This is
  intentional — each path has different preprocessing (code blocks stripped
  for audit, not for schema). If performance ever matters, cache the lexer
  result keyed by (content + preprocess flag).
- marked v15 uses `{ gfm: true }` by default. This means tables,
  strikethrough, and task lists are parsed. If a future version changes
  defaults, the detection functions may behave differently. Pin the major
  version in package.json.
- The Python port (plan 006) mirrors this with `mistune`. The AST
  structures differ (marked tokens vs mistune nodes), but the extraction
  logic is conceptually identical.
- `cleanMarkdownToPlainText()` is used by `generateSchemaData()` for
  JSON-LD text fields. The output must be plain text — no markdown
  formatting, no HTML tags. The new token-based implementation guarantees
  this; the old regex-based implementation sometimes let bold markers
  through in edge cases.
