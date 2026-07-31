# Plan 048: Consolidate `extractPageMetadata` — eliminate title/description divergence between JSON-LD and llms.txt

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If a
> "STOP conditions" item occurs, stop and report. When done, update the status
> row in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat b09a5f8..HEAD -- src/schema.js src/llms-txt.js tests CHANGELOG.md`
> If `src/schema.js` or `src/llms-txt.js` changed since this plan was written,
> compare the "Current state" excerpts against the live code first.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: MED (changes the generated JSON-LD title for H1-less files — see Why)
- **Depends on**: none
- **Category**: bug / correctness
- **Planned at**: commit `b09a5f8`, 2026-06-28

## Why this matters

`generateSchemaData` (`src/schema.js:276`) contains an inline reimplementation
of page-metadata extraction (title + description) that is functionally
equivalent to the exported `extractPageMetadata` in `src/llms-txt.js`, but with
one key difference in the fallback title:

| Location | Fallback title for H1-less files |
|---|---|
| `src/llms-txt.js:35` | `path.basename(filepath, path.extname(filepath)) \|\| "Untitled"` |
| `src/schema.js:322` | `"Untitled Document"` (literal) |

This means the JSON-LD schema injected into a file without a markdown/HTML H1
will say `"name": "Untitled Document"`, while the same file's entry in
`llms.txt` shows its real filename. An AI crawling both artifacts sees
conflicting metadata for the same page.

The fix: make `generateSchemaData` call the canonical `extractPageMetadata`
and remove the duplicate inline code.

## Current state

**`extractPageMetadata`, `src/llms-txt.js:22-59`** (canonical implementation):
```js
export function extractPageMetadata(content, filepath) {
  const cleanText = preprocessContent(content);

  // H1 title
  let titleMatch = cleanText.match(/^#\s+(.+)$/m);
  let title = titleMatch ? titleMatch[1].trim() : "";
  if (!title) {
    const h1Match = cleanText.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
    if (h1Match) {
      title = cleanHtmlText(h1Match[1]);
    }
  }
  if (!title) {
    title = path.basename(filepath, path.extname(filepath)) || "Untitled";
  }

  // Description: first paragraph after H1
  let description = "";
  const introMatch = cleanText.match(/^#\s+.+?\n\n([^#\n]+)/s);
  if (introMatch) {
    description = cleanMarkdownToPlainText(introMatch[1].trim());
  }
  if (!description && (filepath.endsWith(".html") || /<html/i.test(cleanText))) {
    const $desc = cheerio.load(content);
    const metaDesc = $desc('meta[name="description"]').attr("content");
    if (metaDesc) description = cleanHtmlText(metaDesc);
    if (!description) {
      const firstP = $desc("p").first().text();
      if (firstP) description = cleanHtmlText(firstP);
    }
  }
  description = truncateDescription(description);

  // Sections (H2+)
  const sections = extractSections(content);

  return { title, description, sections };
}
```

**Inline reimplementation in `generateSchemaData`, `src/schema.js:315-341`**:
```js
  const cleanText = preprocessContent(content);

  // Try markdown H1 first, then HTML <h1>
  let titleMatch = cleanText.match(/^#\s+(.+)$/m);
  if (!titleMatch) {
    titleMatch = cleanText.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  }
  const title = titleMatch ? cleanHtmlText(titleMatch[1]) : "Untitled Document";

  const introMatch = cleanText.match(/^#\s+.+?\n\n([^#\n]+)/s);
  let description = introMatch ? cleanMarkdownToPlainText(introMatch[1].trim()) : "";
  if (!description && (filepath.endsWith(".html") || content.toLowerCase().includes("<html"))) {
    // Use cheerio for reliable <meta name="description"> extraction
    // regardless of attribute order, and fall back to the first <p>.
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
  description = truncateDescription(description);
```

**`src/schema.js` current imports (lines 1-10)**:
```js
import fs from "fs";
import path from "path";
import * as cheerio from "cheerio";
import {
  preprocessContent,
  cleanMarkdownToPlainText,
  extractSections,
  cleanHtmlText,
  truncateDescription,
} from "./text.js";
```

After the change, `preprocessContent`, `cleanHtmlText`, `truncateDescription`
and the `cheerio` import are no longer used in `schema.js`. `extractSections`
and `cleanMarkdownToPlainText` ARE still needed elsewhere in the file (lines
240, 255, 416, 432).

**`src/index.js:63-64`** exports both `generateSchemaData` and `injectSchema`.
Both call `generateSchemaData`, so both benefit from the fix.

**Conventions**: ESM, double quotes, semicolons. Tests live under `tests/`;
the pattern for schema tests is `tests/schema.test.js`.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Schema tests | `node --test tests/schema.test.js` | all pass |
| Full suite | `npm test` | all pass |
| Lint / format | `npm run lint` / `npm run format:check` | exit 0 |

## Scope

**In scope**: `src/schema.js`, `tests/schema.test.js`, `CHANGELOG.md`.

**Out of scope**: `src/llms-txt.js` (no changes — it is the canonical
source), any other `src/*.js` file, the Python port.

## Git workflow

- Branch: `advisor/048-consolidate-extract-page-metadata`
- Commit style: `fix(schema): consolidate page-metadata extraction, use filename fallback for H1-less files`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Add `extractPageMetadata` import to schema.js

In `src/schema.js`, add an import for `extractPageMetadata` from `llms-txt.js`
after the existing `./text.js` import:

```js
import { extractPageMetadata } from "./llms-txt.js";
```

### Step 2: Remove now-unused imports from schema.js

In `src/schema.js`, update the `./text.js` import to remove the three helpers
that will no longer be used directly, and remove the `cheerio` import:

```js
import fs from "fs";
import path from "path";
import {
  cleanMarkdownToPlainText,
  extractSections,
} from "./text.js";
import { extractPageMetadata } from "./llms-txt.js";
import { getNoBrandingError, hasProEntitlement, LICENSE_ENV_VAR } from "./integrity.js";
```

`cleanMarkdownToPlainText` stays because it is used at lines 255 and 432
(inside `buildHowToNodes` and `buildRecipeNodes`). `extractSections` stays
because it is used at lines 240 and 416.

**Verify**: `npm run lint` → exit 0 (no `no-unused-vars` errors on imports).

### Step 3: Replace the inline extraction block

In `src/schema.js:315-341`, replace all 27 lines of the inline reimplementation
with a single destructuring call:

```js
  const { title, description } = extractPageMetadata(content, filepath);
```

This line replaces everything from `const cleanText = preprocessContent(content);`
through `description = truncateDescription(description);` (inclusive). The
`title` and `description` variables are then used by the existing downstream
code exactly as before.

**Verify**: `node --test tests/schema.test.js` → all existing tests pass.

### Step 4: Add a golden-fixture test for H1-less files

In `tests/schema.test.js`, add a test (following the existing test pattern in
that file) that asserts the new title fallback behavior:

```js
it("generateSchemaData uses filename as title for H1-less files", () => {
  const content = "No heading here.\n\nJust body text.";
  const filepath = path.join(process.cwd(), "my-article.md");
  const result = generateSchemaData(filepath, "article", {}, content);
  // Title should come from the filename, not "Untitled Document"
  const node = Array.isArray(result["@graph"]) ? result["@graph"][0] : result;
  assert.ok(
    node.name === "my-article",
    `Expected "my-article", got "${node.name}"`
  );
});
```

Adjust the import at the top of the test file if `generateSchemaData` is not
already imported (check what the file imports from `../src/schema.js` or
`../src/index.js`).

**Verify**: `node --test tests/schema.test.js` → new test passes.

Also add a test that confirms the PREVIOUS behavior (`"Untitled Document"`) does
NOT appear:

```js
it("generateSchemaData never returns 'Untitled Document' as title", () => {
  const content = "No heading here.";
  const filepath = path.join(process.cwd(), "page.md");
  const result = generateSchemaData(filepath, "article", {}, content);
  const node = Array.isArray(result["@graph"]) ? result["@graph"][0] : result;
  assert.notStrictEqual(node.name, "Untitled Document");
});
```

**Verify**: both new tests pass; the second would FAIL on the old code (good
sanity check — test it locally against the pre-Step-3 code, then restore).

### Step 5: Changelog

Under `## [Unreleased]` → `### Fixed`:
```
- `generateSchemaData` now derives the page title from the filename when no
  H1 heading is present (previously used the literal string "Untitled Document",
  mismatching `llms.txt` which already used the filename). Consolidates
  duplicate metadata-extraction logic.
```

**Verify**: `npm run changelog:check` → exit 0.

## Test plan

- Two new assertions in `tests/schema.test.js`: H1-less file yields
  filename-based title; "Untitled Document" is never returned.
- Full suite green: `npm test`.
- `npm run lint` confirms no residual unused-import errors.

## Done criteria

ALL must hold:

- [ ] `grep -n "Untitled Document" src/schema.js` returns nothing
- [ ] `grep -n "extractPageMetadata" src/schema.js` shows the import and the
      call in `generateSchemaData`
- [ ] `grep -n "preprocessContent\|cheerio\|truncateDescription\|cleanHtmlText" src/schema.js`
      returns nothing (removed unused imports — verify each before removing)
- [ ] New golden-fixture tests pass; the "Untitled Document" test FAILS without
      Step 3 and passes with it
- [ ] `npm test`, `npm run lint`, `npm run format:check`, `npm run changelog:check`
      all exit 0
- [ ] Only in-scope files modified
- [ ] `plans/README.md` status row for 048 updated

## STOP conditions

Stop and report if:

- Any existing `tests/schema.test.js` test fails after Step 3 — this means a
  caller expects the "Untitled Document" literal and the change is not purely
  additive; report the failing test case and stop.
- `npm run lint` reports `preprocessContent` or `cleanHtmlText` still used
  somewhere in `schema.js` after Step 2 — re-check for other call sites before
  removing.
- The "Current state" excerpts don't match live code (drift — re-read the file
  and adjust).

## Maintenance notes

- `extractPageMetadata` is now the single source of truth for title/description
  extraction across JSON-LD schema, llms.txt, and llms-full.txt. Any future
  change to metadata extraction (e.g. Open Graph fallback) goes in
  `src/llms-txt.js` only.
- `extractPageMetadata` returns a `sections` field too; the destructure only
  takes `{ title, description }` — the sections are correctly unused here.
- If `src/llms-txt.js` is ever split or moved, update the import path in
  `schema.js` and check there are no circular imports (llms-txt → text;
  schema → integrity, text; no cycle as long as llms-txt does not import schema).
