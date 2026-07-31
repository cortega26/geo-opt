# Plan 051: Parse YAML frontmatter with a real parser (`yaml`) instead of regex

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan in
> `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 13fb3bf..HEAD -- src/text.js src/observations.js src/scoring.js src/scoring-v2.js src/llms-txt.js`
> If any of these files changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (touches the single content-cleaning chokepoint used by every audit path)
- **Horizon**: short term
- **Depends on**: none
- **Category**: bug + feature (fixes monedario.cl audit findings #4 and #5)
- **Planned at**: commit `13fb3bf`, 2026-06-29

## Why this matters

The monedario.cl audit (`geo-opt-bug-report-2026-06-29.md`, findings #4 and #5)
showed YAML frontmatter leaking into content analysis: glossary files with a
`---` block produced false `statistics` and `quotations` findings (the quoted
strings and numbers inside the frontmatter) and a wrong "Document starts with
h2" heading finding (the frontmatter body parsed as a heading).

The root cause is that frontmatter is handled by a single regex in
[`preprocessContent`](../src/text.js#L108). Regex frontmatter stripping is
fragile: it breaks on `---` sequences inside values, CRLF vs LF endings, a
missing trailing newline at EOF, BOMs, and multi-document YAML. When the regex
fails to match, the **entire** frontmatter block flows downstream as body text,
because every detector consumes `preprocessContent` output (verified callers:
`observations.js:933,982`, `scoring.js:103`, `scoring-v2.js:727`,
`llms-txt.js:23`).

Adopting the **`yaml`** package (eemeli/yaml) fixes the bug class permanently
**and** turns the problem into a capability: once frontmatter is parsed (not
just deleted) we can read `title`, `description`, `datePublished`/`date`, and
similar fields as structured metadata to feed the schema generator and sitemap
`lastmod` instead of inferring them. `yaml` is zero-dependency, pure-JS, ESM,
and the de-facto modern YAML parser — it fits the project's
minimal-dependency, security-first posture (no native bindings, no transitive
deps). `gray-matter` was considered and rejected for this repo because it pulls
`js-yaml` plus extra transitive deps for ergonomics we do not need.

## Current state

### `src/text.js` — `preprocessContent` (the only frontmatter handler)

```js
export function preprocessContent(content) {
  let text = content;

  // Strip YAML frontmatter (--- delimiters at the start of the file).
  // Matches: optional BOM, optional whitespace, ---, any content, ---.
  const frontmatterRegex = /^(?:﻿)?\s*---[\t ]*\r?\n([\s\S]*?)\r?\n---[\t ]*\r?\n/;
  const fmMatch = text.match(frontmatterRegex);
  if (fmMatch) {
    text = text.slice(fmMatch[0].length);
  }

  // Strip markdown code blocks
  text = text.replace(/```[\s\S]*?```/g, "");
  // ... script/style/comment stripping ...
  return text;
}
```

(The BOM literal in the live file is the raw `﻿` character; the snippet
above escapes it for readability.)

`extractSections` (`text.js:192`) also calls `preprocessContent` before running
`marked.lexer`, so the heading-detection bug (#5) is the same root cause.

### Consumers (do not change their call sites; they consume the cleaned string)

- `src/observations.js:933,982` — v2 observations
- `src/scoring.js:103` — v1 scoring
- `src/scoring-v2.js:727` — v2 scoring
- `src/llms-txt.js:23` — artifact generation
- `src/index.js:20` re-exports `preprocessContent`; `index.d.ts` declares it

### Repo conventions

- ESM, double quotes, semicolons (`AGENTS.md`).
- New runtime dependency goes in `dependencies` (not `devDependencies`).
- New exported helpers must be re-exported from `src/index.js` and declared in
  `index.d.ts` if part of the public contract (see documentation governance).
- Changelog policy: every code change needs an `## [Unreleased]` bullet.
- **Never infer author, publisher, publication date, price, or availability for
  generated structured data** (`AGENTS.md`). Reading these from frontmatter the
  *user authored* is allowed; inventing them is not. Only populate schema/sitemap
  fields from frontmatter keys the user explicitly wrote.

## Commands you will need

| Purpose      | Command                 | Expected            |
|--------------|-------------------------|---------------------|
| Install      | `npm install yaml`      | exit 0; in `dependencies` |
| Tests        | `npm test`              | all pass            |
| Coverage     | `npm run test:coverage` | ≥ baseline          |
| Full check   | `npm run check`         | exit 0              |

## Suggested executor toolkit

- `code-review` skill after the refactor — review the diff for any path that
  still treats frontmatter as body text.

## Scope

**In scope**:
- `src/text.js` — add a `parseFrontmatter(content)` helper and use it inside
  `preprocessContent`; optionally export it.
- `src/index.js` + `index.d.ts` — only if `parseFrontmatter` is exported.
- `tests/` — add frontmatter edge-case tests (the failing monedario.cl shapes).
- `CHANGELOG.md`.
- **Optional follow-on (feature half)**: wire parsed frontmatter metadata into
  `extractPageMetadata` (consolidated in plan 048) so schema/sitemap can use
  user-authored `title`/`description`/`date`. Only if it does not balloon the
  diff; otherwise file it as a separate follow-up and keep this plan to the bug
  fix.

**Out of scope**:
- The `preprocessContent` **signature** (string → string) must not change.
- Detector logic in `scoring.js`/`observations.js` — they already consume the
  cleaned string; do not touch them.
- Python port — frontmatter parity in `geo_optimizer.py` is a separate matrix
  decision, not automatic duplication (`AGENTS.md`). Do not touch Python.
- The markdown code-block / script / style / comment stripping in
  `preprocessContent` — leave as is.

## Git workflow

- Branch: `advisor/051-yaml-frontmatter`
- Commit: `fix(text): parse YAML frontmatter with yaml parser (fixes stats/quotes/heading leakage)`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Install `yaml`

```bash
npm install yaml
```

**Verify**: `node -e 'import("yaml").then(m=>console.log(typeof m.parse))'` prints
`function`. `grep '"yaml"' package.json` shows it under `dependencies`.

### Step 2: Add a `parseFrontmatter` helper in `src/text.js`

Add a helper that locates the leading `---`-delimited block, parses it with
`yaml.parse`, and returns both the parsed data and the body with the block
removed. It must be tolerant: if there is no frontmatter, or the YAML is
invalid, return `{ data: {}, body: content }` without throwing.

```js
import { parse as parseYaml } from "yaml";

/**
 * Split leading YAML frontmatter from a document.
 * Tolerant: missing/invalid frontmatter yields { data: {}, body: content }.
 * @param {string} content
 * @returns {{ data: object, body: string }}
 */
export function parseFrontmatter(content) {
  // Normalize a leading BOM only for detection; keep body bytes intact.
  const text = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
  // Frontmatter must be the very first thing in the file.
  if (!/^---[\t ]*\r?\n/.test(text)) {
    return { data: {}, body: content };
  }
  // Find the closing delimiter line: a line that is exactly --- (or ...).
  const close = text.search(/\r?\n(?:---|\.\.\.)[\t ]*(?:\r?\n|$)/);
  if (close === -1) {
    return { data: {}, body: content };
  }
  const rawBlock = text.slice(text.indexOf("\n") + 1, close);
  const afterMatch = text.slice(close).match(/\r?\n(?:---|\.\.\.)[\t ]*(?:\r?\n|$)/);
  const body = text.slice(close + afterMatch[0].length);
  let data = {};
  try {
    const parsed = parseYaml(rawBlock);
    if (parsed && typeof parsed === "object") data = parsed;
  } catch {
    // Invalid YAML — treat as no usable metadata, but still strip the block.
  }
  return { data, body };
}
```

Then use it in `preprocessContent` in place of the regex:

```js
export function preprocessContent(content) {
  let { body: text } = parseFrontmatter(content);
  // ... existing code-block / script / style / comment stripping unchanged ...
  return text;
}
```

**Verify**: `npm test` → all existing tests pass (no detector should change for
files without frontmatter, and the regex behavior is preserved for clean files).

### Step 3: Add edge-case tests

Add tests modeled on the existing `tests/` patterns (use the project's
temp-file or direct-string helpers — search the relevant test file for the idiom
used by `preprocessContent`/`extractSections` tests). Cover the shapes that
broke on monedario.cl:

1. Frontmatter with quoted values containing parentheses and numbers does NOT
   produce body text — `preprocessContent(input)` returns only the post-`---`
   body. (Guards bug #4: no stray quotes/statistics.)
2. `extractSections` on a file whose frontmatter contains a `term:` value does
   NOT emit the frontmatter as a heading. (Guards bug #5.)
3. Frontmatter with a value that itself contains `---` inside a quoted string is
   not truncated early.
4. CRLF line endings and a frontmatter block with no trailing blank line still
   strip correctly.
5. Invalid YAML in the block: `parseFrontmatter` returns `{ data: {}, body }`
   with the block removed and does not throw.

**Verify**: `npm test` → all new tests pass.

### Step 4 (optional, feature half): feed metadata to `extractPageMetadata`

Only attempt if the diff stays small. Where `extractPageMetadata` (plan 048)
infers title/description/date, prefer user-authored frontmatter keys when
present (`title`, `description`/`summary`, `date`/`datePublished`). Do not
invent values; if the key is absent, keep the existing inference. Add a test
that a frontmatter `title` wins over the H1-derived title for schema output.

If this expands the diff meaningfully, STOP and file it as plan 057 instead.

### Step 5: Export decision

If `parseFrontmatter` is used only inside `text.js`, keep it unexported. If Step
4 (or a future plan) needs it elsewhere, export it from `src/text.js`, re-export
from `src/index.js`, and add it to `index.d.ts`. If you export it, run
`npm run typecheck`.

### Step 6: Full check + changelog

Add under `## [Unreleased]`:

```markdown
### Fixed
- Frontmatter is now parsed with the `yaml` library instead of a regex, so YAML
  metadata no longer leaks into statistics, quotation, or heading detection
  (`src/text.js`). Fixes false positives on Markdown files with `---` blocks.
```

(Add an `### Added` bullet too if Step 4 landed.)

**Verify**: `npm run check` → exit 0.

## Test plan

- All existing tests pass unmodified.
- New tests cover findings #4 and #5 shapes plus CRLF / embedded-`---` /
  invalid-YAML edge cases.
- `npm run test:coverage` → `src/text.js` coverage ≥ baseline.

## Done criteria

- [ ] `grep -n "frontmatterRegex" src/text.js` returns nothing (regex removed)
- [ ] `grep -n '"yaml"' package.json` shows it under `dependencies`
- [ ] `npm run check` exits 0
- [ ] New edge-case tests present and passing
- [ ] `preprocessContent` signature unchanged (string → string)
- [ ] If `parseFrontmatter` exported: `index.d.ts` updated and `npm run typecheck` passes
- [ ] Only in-scope files modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- An existing test breaks because a detector's output changed for a file that
  has **no** frontmatter (means the helper altered body bytes — restore exact
  body slicing and report).
- `npm test` fails after Step 2 (revert and report the failing test names).
- Step 4 balloons the diff beyond a small, reviewable change — stop, keep the
  bug fix, and file the metadata wiring as a follow-up plan.
- `yaml` import fails with `ERR_MODULE_NOT_FOUND` — confirm `"type": "module"`
  and that the install landed in `dependencies`.

## Maintenance notes

- `yaml` v2 is ESM and zero-dependency. Pin the major version; on a major bump,
  re-run the edge-case tests before upgrading.
- If the Python port later needs frontmatter parity, that is a capability-matrix
  decision (`docs/architecture.md`), mirrored with `PyYAML`, not an automatic
  duplication.
- The `...` closing delimiter and multi-document YAML are handled defensively
  here; if real content ever uses multi-document frontmatter, only the first
  document is treated as metadata by design.
