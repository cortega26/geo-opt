# Plan 041: Glob ignore patterns (`**`, `*`, `?`) translate correctly and never silently discard `.gitignore`

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan in
> `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat b09a5f8..HEAD -- src/discovery.js tests CHANGELOG.md`
> If `src/discovery.js` changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `b09a5f8`, 2026-06-28

## Why this matters

`src/discovery.js` translates `.gitignore`/`--ignore`/`config.ignore` glob
patterns into `RegExp`. The translation is broken in two ways, both verified
end-to-end:

1. A pattern containing `**` (e.g. `**/node_modules/`, one of the most common
   gitignore idioms — this repo's own `.gitignore` has five such lines)
   produces an **invalid regex** (`Invalid regular expression: Nothing to
   repeat`). In the `.gitignore` path the resulting throw is swallowed by a
   bare `catch {}`, so **every** `.gitignore` rule is silently dropped and a
   recursive/batch audit then walks into `node_modules`, `dist`, and vendored
   directories, scoring files the user meant to exclude. In the `--ignore` /
   `config.ignore` path the throw is **uncaught** and aborts the whole command
   with a `SyntaxError`.
2. The escape step omits `*` and `?` from its character class, so the
   subsequent "un-escape into glob" conversions never fire. `*` only appears to
   work because `.test()` does a substring search; `?` (single-char wildcard)
   and mid-string `*` are simply wrong.

After this plan, glob patterns translate to correct regexes, `**` matches at
any depth (including zero leading directories), and a malformed/unreadable
`.gitignore` can never silently discard all ignore rules.

## Current state

- `src/discovery.js` — content discovery and ignore-rule compilation.
  - `patternToRegex(pattern)` (the broken translator) — lines ~20–75.
  - `compileGitignorePatterns(...)` maps each line through `patternToRegex`; if
    one line throws, the whole `compileGitignorePatterns(...)` call throws.
  - `discoverFiles(...)` reads `.gitignore` inside a bare `catch {}` — lines
    156–170.

The broken translation block, **`src/discovery.js:40-50`** (exact current
text):

```js
  // Escape regex specials, then convert glob tokens
  let r = p
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    // ** matches any number of directories
    .replace(/\\\*\\\*/g, ".__DOUBLESTAR__.")
    // * matches anything except /
    .replace(/\\\*/g, "[^/]*")
    // ? matches single char except /
    .replace(/\\\?/g, "[^/]")
    // Restore ** placeholder
    .replace(/\.__DOUBLESTAR__\./g, ".*");
```

The `.gitignore` read, **`src/discovery.js:156-170`** (exact current text):

```js
  const gitignorePath = path.join(cwd, ".gitignore");
  try {
    const content = fs.readFileSync(gitignorePath, "utf8");
    const raw = content.split("\n").filter((l) => l.trim() && !l.trim().startsWith("#"));
    rules.push(...compileGitignorePatterns(raw));
  } catch {
    // No .gitignore found — that's fine
  }

  if (Array.isArray(config.ignore)) {
    rules.push(...compileGitignorePatterns(config.ignore));
  }
  if (ignorePatterns.length > 0) {
    rules.push(...compileGitignorePatterns(ignorePatterns));
  }
```

**Repo conventions**: ESM, double quotes, semicolons, camelCase. Tests use
`node:test` (`describe`/`it`, `node:assert/strict`). There is currently **no**
`tests/discovery.test.js`. Use `tests/sitemap.test.js` as the structural
exemplar for a fresh test file that creates temp directories with
`mkdtempSync`/`rmSync`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Run the new test alone | `node --test tests/discovery.test.js` | all pass |
| Full JS test suite | `npm test` | all pass (≥470 + your new tests) |
| Lint | `npm run lint` | exit 0 |
| Format check | `npm run format:check` | exit 0 |
| Changelog policy | `npm run changelog:check` | exit 0 |

## Scope

**In scope** (the only files you should modify):
- `src/discovery.js`
- `tests/discovery.test.js` (create)
- `CHANGELOG.md` (add an entry under `## [Unreleased]`)

**Out of scope** (do NOT touch):
- `bin/cli.js` and the rest of `src/` — the bug and fix are self-contained.
- The Python port (`.agents/skills/geo-optimization/scripts/geo_optimizer.py`).
  Its discovery is a separate implementation; do not change it here.
- Gitignore semantics beyond `**`/`*`/`?` — do NOT try to also implement
  middle-slash root-anchoring or negation edge cases. Keep the change minimal.

## Git workflow

- Branch: `advisor/041-fix-glob-ignore-translation`
- Commit message style follows the repo's conventional commits, e.g.
  `fix(discovery): translate ** / * / ? glob patterns correctly`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Replace the glob translation with the verified-correct version

In `src/discovery.js`, replace the translation block at lines 40–50 (shown in
"Current state") with this exact logic. It adds `*` and `?` to the escape class
and distinguishes a leading/standalone `**/` (zero-or-more directories) from a
standalone `**` (across-slash wildcard):

```js
  // Escape regex specials (including * and ?), then convert glob tokens.
  let r = p
    .replace(/[.+^${}()|[\]\\*?]/g, "\\$&")
    // "**/" matches zero or more directories
    .replace(/\\\*\\\*\//g, "__GLOBSTAR_SLASH__")
    // standalone "**" matches across path separators
    .replace(/\\\*\\\*/g, "__GLOBSTAR__")
    // "*" matches anything except /
    .replace(/\\\*/g, "[^/]*")
    // "?" matches a single char except /
    .replace(/\\\?/g, "[^/]")
    .replace(/__GLOBSTAR_SLASH__/g, "(?:.*/)?")
    .replace(/__GLOBSTAR__/g, ".*");
```

This translation was validated against a matrix including `*.md`, `*.log`,
`**/node_modules/` (root and nested), `node_modules/`, `draft-?.md`,
`docs/*.md`, `a/**/b`, `/root.md`, and `logs/**`.

**Verify**: `node --input-type=module -e '...'` is not required here; proceed —
Step 3's tests are the gate.

### Step 2: Stop the `.gitignore` path from silently discarding all rules

Replace the `.gitignore` read block at `src/discovery.js:156-163` so that a
**read** failure (no file / unreadable) is tolerated, but a **compile** failure
surfaces instead of being swallowed. Change:

```js
  const gitignorePath = path.join(cwd, ".gitignore");
  try {
    const content = fs.readFileSync(gitignorePath, "utf8");
    const raw = content.split("\n").filter((l) => l.trim() && !l.trim().startsWith("#"));
    rules.push(...compileGitignorePatterns(raw));
  } catch {
    // No .gitignore found — that's fine
  }
```

to:

```js
  const gitignorePath = path.join(cwd, ".gitignore");
  let gitignoreContent = null;
  try {
    gitignoreContent = fs.readFileSync(gitignorePath, "utf8");
  } catch {
    // No readable .gitignore — proceed without it.
  }
  if (gitignoreContent !== null) {
    const raw = gitignoreContent
      .split("\n")
      .filter((l) => l.trim() && !l.trim().startsWith("#"));
    rules.push(...compileGitignorePatterns(raw));
  }
```

Leave the `config.ignore` and `ignorePatterns` blocks (lines 165–170)
unchanged — after Step 1 they no longer throw on `**`.

**Verify**: `npm run lint` → exit 0.

### Step 3: Add `tests/discovery.test.js`

Create `tests/discovery.test.js` modeled on `tests/sitemap.test.js`'s structure
(node:test `describe`/`it`, temp dirs via `mkdtempSync`/`rmSync`). Import
`discoverFiles` from `../src/discovery.js`. Each test builds a temp tree, writes
`.md` files and a `.gitignore`, calls `discoverFiles(["."], { recursive: true,
cwd: tmp, ignorePatterns: [...] })`, and asserts on the returned relative paths.

Cover at minimum:
- **`**` in `.gitignore` excludes at root and nested**: a `.gitignore`
  containing `**/node_modules/` plus files `src/real.md`,
  `node_modules/pkg/README.md`, `a/node_modules/b.md` → result contains
  `src/real.md` and excludes both `node_modules` files. (This is the headline
  regression — it returns all three files on the buggy code.)
- **`--ignore "**/dist/"` does not throw and excludes**: passing
  `ignorePatterns: ["**/dist/"]` over a tree with `dist/x.md` and `keep.md`
  returns only `keep.md` and does not throw. (Throws `SyntaxError` on buggy
  code.)
- **`*` and `?` wildcards**: `.gitignore` with `*.log` (irrelevant to `.md`
  collection, so instead test via allowedExtensions or use `draft-?.md`):
  prefer a focused unit-style assertion — e.g. `.gitignore` line `draft-?.md`
  excludes `draft-1.md` but keeps `draft.md` and `draft-12.md`.
- **Plain `node_modules/` still works** (no regression): a `.gitignore` with
  `node_modules/` excludes nested `node_modules` files.

**Verify**: `node --test tests/discovery.test.js` → all your new tests pass.

### Step 4: Update the changelog

Add a bullet under `## [Unreleased]` → `### Fixed` in `CHANGELOG.md`:

```
- `discoverFiles` now correctly translates `**`, `*`, and `?` glob patterns in
  `.gitignore`, `--ignore`, and `config.ignore`. Previously a `**` pattern
  produced an invalid regex that silently discarded all `.gitignore` rules (or
  crashed `--ignore`), causing recursive audits to scan ignored directories.
```

**Verify**: `npm run changelog:check` → exit 0.

## Test plan

- New file `tests/discovery.test.js`, patterned on `tests/sitemap.test.js`,
  with the four cases above (headline `**` regression, `--ignore` no-throw,
  `?` wildcard, plain-pattern non-regression).
- Verification: `npm test` → all pass including the new discovery tests.

## Done criteria

ALL must hold:

- [ ] `node --test tests/discovery.test.js` passes with ≥4 new tests
- [ ] `npm test` exits 0 (≥470 prior tests + new ones)
- [ ] `npm run lint` exits 0
- [ ] `npm run format:check` exits 0
- [ ] `npm run changelog:check` exits 0
- [ ] Manual check: in a temp dir with `.gitignore` containing `**/node_modules/`,
      `node bin/cli.js audit . --recursive` does not score any
      `node_modules/**` file
- [ ] Only `src/discovery.js`, `tests/discovery.test.js`, and `CHANGELOG.md`
      are modified (`git status`)
- [ ] `plans/README.md` status row for 041 updated

## STOP conditions

Stop and report back (do not improvise) if:

- The "Current state" excerpts don't match the live `src/discovery.js` (drift).
- After Step 1, any existing test in `npm test` that previously passed now
  fails — this would indicate the translation change altered behavior the suite
  depends on; report which test and its diff.
- Implementing the tests reveals that `discoverFiles` does not accept a `cwd`
  option the way described — re-read its signature and report.

## Maintenance notes

- The `__GLOBSTAR_SLASH__` / `__GLOBSTAR__` placeholders carry the same
  (negligible, pre-existing) theoretical collision risk as the old
  `__DOUBLESTAR__`: a literal `.gitignore` line containing that exact token.
  Not worth guarding.
- This plan intentionally does **not** implement full gitignore semantics
  (middle-slash root anchoring, `!` negation precedence beyond what exists).
  If a user later reports those, that is a separate, larger plan.
- A reviewer should confirm the new test asserts the *headline* behavior (a
  `**/node_modules/` line actually excludes node_modules), not just that
  `discoverFiles` runs without throwing.
