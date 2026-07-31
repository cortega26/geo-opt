# Plan 047: Fix `generate-all` sitemap `lastmod` and stop re-reading every file from disk

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If a
> "STOP conditions" item occurs, stop and report. When done, update the status
> row in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat b09a5f8..HEAD -- bin/cli.js src/batch.js index.d.ts tests CHANGELOG.md`
> If `bin/cli.js` or `src/batch.js` changed since this plan was written, compare
> the "Current state" excerpts against the live code first.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `b09a5f8`, 2026-06-28

## Why this matters

The `generate-all` command produces a full GEO package (audit + llms.txt +
llms-full + sitemap + robots). Two issues:

1. **Bug: sitemap entries have no real `lastmod` (correctness).** Each
   `fullEntries` object is built **without a `file` field**
   (`bin/cli.js:1043`), but the sitemap step reads `e.file` to derive the
   source path (`bin/cli.js:1076`): `filePath: path.resolve(e.file ||
   path.join(process.cwd(), e.url))`. Because `e.file` is always `undefined`,
   `filePath` becomes `cwd + url` — a path that does not exist — so
   `fileLastmod()` returns `null` and the generated sitemap omits/garbles
   `<lastmod>` for every URL. Single-file `sitemap generate` is unaffected; only
   `generate-all` has this.
2. **Perf: every file is read from disk twice (and re-parsed).** `auditFiles()`
   already reads each file (`src/batch.js:28`), then `generate-all` re-reads the
   same file with `fs.readFileSync(r.file)` (`bin/cli.js:1032`) for metadata
   extraction. On a large content tree this doubles file I/O for the one command
   that processes the whole site at once.

## Current state

**`auditFiles`, `src/batch.js:19-44`** — reads content at line 28, returns
`{ file, status, score, report }` on success (no `content`):
```js
      const { score, report } = auditContent(content, filepath, config, model);
      results.push({ file: filepath, status: "success", score, report });
```

**`generate-all` loop, `bin/cli.js:1030-1047`**:
```js
      // Read content for full-text generation
      try {
        const content = fs.readFileSync(r.file, { encoding: "utf8" });
        const { title } = extractPageMetadata(content, r.file);
        const rel = path.relative(process.cwd(), r.file).split(path.sep).join("/");
        const ext = path.extname(rel);
        let urlPath = rel.slice(0, -ext.length);
        if (path.basename(urlPath) === "index") urlPath = path.dirname(urlPath);
        if (urlPath === ".") urlPath = "/";
        else if (!urlPath.startsWith("/")) urlPath = "/" + urlPath;
        const url = siteUrl ? siteUrl.replace(/\/+$/, "") + urlPath : urlPath;
        const section = suggestSection(r.file, content);
        const score = r.score ?? r.report?.total_score ?? r.report?.effectiveScore ?? undefined;
        fullEntries.push({ title, url, section, content, score });
      } catch {
        // Skip files that can't be read
      }
```

**Sitemap step, `bin/cli.js:1073-1077`**:
```js
    const sitemapEntries = fullEntries.map((e) => ({
      url: e.url,
      score: e.score,
      filePath: path.resolve(e.file || path.join(process.cwd(), e.url)),
    }));
```

**`AuditResult` type, `index.d.ts:602-608`**:
```ts
  export interface AuditResult {
    file: string;
    status: "success" | "error";
    score?: number;
    report?: AuditReport;
    error?: string;
  }
```
`tests/consumer.test.ts:430-431` uses `AuditResult` (an optional field is
backward-compatible).

**Conventions**: ESM, double quotes, semicolons. CLI smoke tests live in
`tests/cli-smoke.test.js` (use this as the pattern for a `generate-all` test).

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| CLI smoke tests | `node --test tests/cli-smoke.test.js` | all pass |
| Typecheck (contract) | `npm run typecheck` | exit 0 |
| Full suite | `npm test` | all pass |
| Lint / format | `npm run lint` / `npm run format:check` | exit 0 |

## Scope

**In scope**: `bin/cli.js`, `src/batch.js`, `index.d.ts`,
`tests/cli-smoke.test.js`, `CHANGELOG.md`.

**Out of scope**: the parsing functions (`extractPageMetadata`, `suggestSection`,
`generateLlmsFullTxtFiles`) — re-parsing for distinct artifacts is inherent and
not addressed here; only the redundant disk *read* is removed. The Python port.

## Git workflow

- Branch: `advisor/047-fix-generate-all-sitemap-and-reread`
- Commit style: `fix(cli): set sitemap source file in generate-all; reuse audited content`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Fix the sitemap `lastmod` bug (required, standalone)

In `bin/cli.js:1043`, add `file: r.file` to the pushed object so the sitemap
step can resolve the real source path:
```js
        fullEntries.push({ file: r.file, title, url, section, content, score });
```

**Verify**: `node --test tests/cli-smoke.test.js` → still green; proceed to the
test in Step 4 to confirm the fix.

### Step 2: Have `auditFiles` return the content it read

In `src/batch.js`, include `content` on the success result (line 38):
```js
      const { score, report } = auditContent(content, filepath, config, model);
      results.push({ file: filepath, status: "success", score, report, content });
```
This is additive; error results are unchanged.

In `index.d.ts`, add the optional field to `AuditResult`:
```ts
    report?: AuditReport;
    content?: string;
    error?: string;
```

**Verify**: `npm run typecheck` → exit 0.

### Step 3: Reuse the audited content instead of re-reading

In the `generate-all` loop (`bin/cli.js:1031-1032`), replace the re-read with the
content `auditFiles` already returned, falling back to a read only if absent
(e.g. for an error result that still needs content — keep the `try/catch`):
```js
      try {
        const content = r.content ?? fs.readFileSync(r.file, { encoding: "utf8" });
```
Leave the rest of the loop body unchanged.

**Verify**: `npm run lint` → exit 0.

### Step 4: Test the sitemap fix

In `tests/cli-smoke.test.js`, add a test (modeled on the existing CLI smoke
tests) that:
- Creates a temp dir with one Markdown file (e.g. `# Title\n\nBody.`).
- Runs `generate-all <tmp> --recursive --output <tmp>/out` (use the same
  child-process/`spawnSync` or in-process invocation the other smoke tests use),
  with a `--site-url https://example.com` if the command requires it for URLs.
- Reads `<tmp>/out/sitemap.xml` and asserts it contains a `<lastmod>` element.
  (On the buggy code, `filePath` points to a nonexistent path, so no `<lastmod>`
  is emitted; the fix makes it resolve to the real temp file's mtime.)

**Verify**: `node --test tests/cli-smoke.test.js` → new test passes; confirm it
FAILS if Step 1 is reverted (sanity-check locally, then restore Step 1).

### Step 5: Confirm artifacts are otherwise unchanged

The read-dedup must not change any generated output. Run `generate-all` on
`docs/` (the repo's own docs) before and after Steps 2–3 and diff the produced
package; outputs must be byte-identical except where `<lastmod>` is now present
(Step 1). If anything else differs, STOP.

**Verify**: outputs identical apart from added `<lastmod>` values.

### Step 6: Changelog

Under `## [Unreleased]`:
- `### Fixed`:
  `- \`generate-all\` now emits correct \`<lastmod>\` values in the generated sitemap (previously every URL pointed at a nonexistent path, so \`<lastmod>\` was dropped).`
- `### Changed`:
  `- \`auditFiles\` results now include the audited file \`content\`; \`generate-all\` reuses it instead of re-reading each file from disk.`

**Verify**: `npm run changelog:check` → exit 0.

## Test plan

- New `generate-all` smoke test asserting the sitemap has `<lastmod>` (proves
  Step 1).
- Existing suite unchanged otherwise; `npm run typecheck` validates the
  `AuditResult.content` addition against `tests/consumer.test.ts`.
- `npm test` → all pass.

## Done criteria

ALL must hold:

- [ ] `grep -n "file: r.file" bin/cli.js` shows the fix in the `fullEntries` push
- [ ] `grep -n "content }" src/batch.js` (or equivalent) shows `content` on the
      success result; `index.d.ts` `AuditResult` has `content?: string`
- [ ] `bin/cli.js` no longer unconditionally re-reads in the loop (uses
      `r.content ??`)
- [ ] New smoke test passes and fails when Step 1 is reverted
- [ ] `npm test`, `npm run typecheck`, `npm run lint`, `npm run format:check`,
      `npm run changelog:check` all exit 0
- [ ] `generate-all` output is unchanged except for added `<lastmod>` (Step 5)
- [ ] Only in-scope files modified
- [ ] `plans/README.md` status row for 047 updated

## STOP conditions

Stop and report if:

- Step 5 shows any generated-artifact difference beyond added `<lastmod>`.
- Adding `content` to `AuditResult` breaks `npm run typecheck` in a way not
  fixable by the additive optional field (re-read Step 2).
- The "Current state" excerpts don't match live code (drift).

## Maintenance notes

- The deeper redundancy — `generate-all` re-parsing each file (cheerio/marked)
  in `extractPageMetadata`, `suggestSection`, and `generateLlmsFullTxtFiles` —
  is intentionally left: those produce different artifacts and sharing a parse
  would require threading parsed structures through several functions. Revisit
  only if profiling shows it dominates on real large-site runs.
- `AuditResult.content` is now public; keep it populated for success results so
  consumers can rely on it.
- A reviewer should confirm Step 5 (no output drift) was actually performed.
