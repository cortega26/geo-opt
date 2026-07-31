# Plan 043: All artifact writers honor the "writes stay inside CWD" boundary

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If a
> "STOP conditions" item occurs, stop and report. When done, update the status
> row for this plan in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat b09a5f8..HEAD -- bin/cli.js src/schema.js tests CHANGELOG.md`
> If `bin/cli.js` or `src/schema.js` changed since this plan was written,
> compare the "Current state" excerpts against the live code first.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `b09a5f8`, 2026-06-28

## Why this matters

The CLI enforces a "generated/written files stay inside the current working
directory" boundary via two guards in `src/schema.js`
(`assertWritableTargetInsideCwd`, `assertNewFileParentInsideCwd`). The `inject`
and `report` commands use them. But four other commands that write files from a
user-supplied `--output` do **not**:

- `robots generate` writes `options.output` directly (`bin/cli.js:265`).
- `sitemap generate` `mkdirSync` + writes into `path.resolve(options.output)`
  (`bin/cli.js:361-363`).
- `llmstxt generate` writes `llms.txt` + full files into the resolved output
  dir (`bin/cli.js:530-547`).
- `generate-all` writes five files into the resolved output dir
  (`bin/cli.js:1104-1111`).

So `geo-opt sitemap generate --output /etc` or `--output ../../somewhere`
writes generated files outside the project — the exact boundary `inject` and
`report` enforce. These are generated (not attacker-controlled) bytes, so this
is "write known content to an arbitrary path", not RCE; but it is an
inconsistent, surprising security boundary. This plan makes all writers
enforce it.

## Current state

The existing guards in `src/schema.js` (lines 41–114) — `isInsideDirectory`
(internal), `validateWritableTargetInsideCwd`/`assertWritableTargetInsideCwd`,
`validateNewFileParentInsideCwd`/`assertNewFileParentInsideCwd`. The last is
exported and re-exported publicly via `src/index.js`. Their realpath-based
checks require the target's parent to **already exist**, which is fine for
`inject`/`report` (existing files) but not for the dir-creating writers below,
which `mkdirSync` a possibly-new output dir.

The guarded exemplar — `report`, **`bin/cli.js:941-948`** (the pattern to
mirror):

```js
    const outPath = path.resolve(options.output);
    try {
      assertNewFileParentInsideCwd(outPath);
      fs.writeFileSync(outPath, html, { encoding: "utf8" });
    } catch (e) {
      console.error(`Error: ${e.message}`);
      process.exit(1);
    }
```

The unguarded writers (exact current text):

`robots generate` — **`bin/cli.js:261-267`**:
```js
    if (options.dryRun) {
      console.log(content);
      console.log("[dry-run] Would write to:", options.output);
    } else {
      fs.writeFileSync(options.output, content, { encoding: "utf8" });
      console.log(`robots.txt written to ${options.output}`);
    }
```

`sitemap generate` — **`bin/cli.js:360-365`**:
```js
    } else {
      const outDir = path.resolve(options.output);
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.join(outDir, "sitemap.xml"), sitemapXml, {
        encoding: "utf8",
      });
```

`llmstxt generate` — **`bin/cli.js:529-534`** (same `outDir`/`mkdirSync`
shape, then more `writeFileSync` into `outDir` at 547).

`generate-all` — **`bin/cli.js:1104-1111`** (`mkdirSync(outDir)` then 5
`writeFileSync` into `outDir`).

`--output` defaults: robots `"robots.txt"`, sitemap `"."`, llmstxt `"."`,
generate-all `"geo-package"` — all inside CWD, so default behavior is
unchanged; only escaping paths get rejected.

**Conventions**: ESM, double quotes, semicolons. CLI errors go to stderr and
exit non-zero (see the `report` pattern and the robots preset check at
`bin/cli.js:250-254`).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Run new guard test | `node --test tests/write-guard.test.js` | all pass |
| Full suite | `npm test` | all pass |
| Lint | `npm run lint` | exit 0 |
| Format check | `npm run format:check` | exit 0 |
| Manual reject check | `node bin/cli.js sitemap generate docs/ --output /tmp/escape` | prints a "Security restriction" error, exit 1, writes nothing to /tmp/escape |

## Scope

**In scope**:
- `src/schema.js` (add the dir guard helper)
- `bin/cli.js` (wire guards into the four writers)
- `tests/write-guard.test.js` (create)
- `CHANGELOG.md`

**Out of scope** (do NOT modify):
- `src/index.js`, `index.d.ts`, `tests/consumer.test.ts` — the new helper stays
  internal to schema.js/cli.js; do NOT add it to the public API. (The existing
  guards are public, but expanding the public surface is a separate decision and
  would pull in the public-contract sync workflow.)
- `inject` / `report` writers — already guarded; leave them.
- The Python port.

## Git workflow

- Branch: `advisor/043-guard-all-artifact-writers`
- Commit message: `fix(cli): enforce CWD write boundary on robots/sitemap/llmstxt/generate-all`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Add an output-directory guard to `src/schema.js`

Add these two functions immediately after `assertNewFileParentInsideCwd`
(after `src/schema.js:114`). They validate a directory that may not exist yet by
realpath-resolving the nearest existing ancestor. This implementation was
verified against `.`, `geo-package`, `a/b/c`, `/etc`, `/tmp/elsewhere`,
`../escape`, `../../x`:

```js
/**
 * Validate that an output directory (which may not exist yet) resolves inside
 * the current working directory. Realpath-resolves the nearest existing
 * ancestor so symlinked parents cannot escape. Batch-safe: returns a result.
 *
 * @param {string} dirPath
 * @returns {{ valid: true } | { valid: false, error: string }}
 */
export function validateOutputDirInsideCwd(dirPath) {
  const resolved = path.resolve(dirPath);
  let probe = resolved;
  while (!fs.existsSync(probe)) {
    const parent = path.dirname(probe);
    if (parent === probe) break;
    probe = parent;
  }
  let ancestorRealPath;
  let cwdRealPath;
  try {
    ancestorRealPath = fs.realpathSync(probe);
    cwdRealPath = fs.realpathSync(process.cwd());
  } catch (e) {
    return { valid: false, error: `Failed to resolve real path for ${dirPath}: ${e.message}` };
  }
  const suffix = path.relative(probe, resolved);
  const target = suffix ? path.join(ancestorRealPath, suffix) : ancestorRealPath;
  if (!isInsideDirectory(target, cwdRealPath)) {
    return {
      valid: false,
      error: `Security restriction — output directory ${dirPath} resolves outside the current working directory.`,
    };
  }
  return { valid: true };
}

export function assertOutputDirInsideCwd(dirPath) {
  const result = validateOutputDirInsideCwd(dirPath);
  if (!result.valid) {
    throw new Error(result.error);
  }
}
```

**Verify**: `npm run lint` → exit 0.

### Step 2: Import the new guard in `bin/cli.js`

In the import block at the top of `bin/cli.js` that already pulls
`assertNewFileParentInsideCwd, assertWritableTargetInsideCwd` from
`../src/schema.js`, add `assertOutputDirInsideCwd` to that named import list.

### Step 3: Guard `robots generate` (single file)

Replace the `else` branch at `bin/cli.js:264-267` so the write is guarded with
the existing single-file helper, mirroring `report`:

```js
    } else {
      const outPath = path.resolve(options.output);
      try {
        assertNewFileParentInsideCwd(outPath);
        fs.writeFileSync(outPath, content, { encoding: "utf8" });
      } catch (e) {
        console.error(`Error: ${e.message}`);
        process.exit(1);
      }
      console.log(`robots.txt written to ${outPath}`);
    }
```

### Step 4: Guard the three directory-creating writers

For `sitemap generate`, `llmstxt generate`, and `generate-all`, insert a guard
**before** the `fs.mkdirSync(outDir, ...)` call in each non-dry-run branch.
Pattern (apply to each of the three; the `outDir = path.resolve(options.output)`
line already exists immediately above the `mkdirSync`):

```js
      const outDir = path.resolve(options.output);
      try {
        assertOutputDirInsideCwd(outDir);
      } catch (e) {
        console.error(`Error: ${e.message}`);
        process.exit(1);
      }
      fs.mkdirSync(outDir, { recursive: true });
```

Do not change anything else in those branches.

**Verify**: `npm run lint` → exit 0; `npm test` → all prior tests still pass.

### Step 5: Add `tests/write-guard.test.js`

Create the file (node:test, `describe`/`it`, `node:assert/strict`). Import
`validateOutputDirInsideCwd` from `../src/schema.js`. Cover:
- `validateOutputDirInsideCwd(".")` → `valid: true`
- `validateOutputDirInsideCwd("geo-package")` (nonexistent under cwd) → `valid: true`
- `validateOutputDirInsideCwd("/tmp/escape-" + Date.now())` → `valid: false`,
  error includes "Security restriction"
- `validateOutputDirInsideCwd("../escape")` → `valid: false`

Optionally add a CLI-level assertion modeled on `tests/cli-smoke.test.js`: run
`sitemap generate` with `--output` pointing outside a temp cwd and assert a
non-zero exit and no file written. Keep it only if the smoke-test harness in
`tests/cli-smoke.test.js` makes this straightforward; otherwise the unit tests
above are sufficient.

**Verify**: `node --test tests/write-guard.test.js` → all pass.

### Step 6: Changelog

Add under `## [Unreleased]` → `### Security`:

```
- `robots generate`, `sitemap generate`, `llmstxt generate`, and `generate-all`
  now reject `--output` paths that resolve outside the current working
  directory, matching the existing boundary enforced by `inject` and `report`.
```

**Verify**: `npm run changelog:check` → exit 0.

## Test plan

- New `tests/write-guard.test.js` with the four unit cases (+ optional CLI
  reject case), modeled structurally on `tests/sitemap.test.js`.
- Manual: `node bin/cli.js sitemap generate docs/ --output /tmp/escape-test`
  prints "Security restriction", exits 1, creates nothing at the target.
- `npm test` → all pass including new tests.

## Done criteria

ALL must hold:

- [ ] `node --test tests/write-guard.test.js` passes (≥4 cases)
- [ ] `npm test` exits 0
- [ ] `npm run lint` and `npm run format:check` exit 0
- [ ] `npm run changelog:check` exits 0
- [ ] `grep -n "assertOutputDirInsideCwd\|assertNewFileParentInsideCwd" bin/cli.js`
      shows a guard in each of robots/sitemap/llmstxt/generate-all branches
- [ ] `validateOutputDirInsideCwd` is NOT present in `src/index.js` or
      `index.d.ts` (stayed internal)
- [ ] Only `src/schema.js`, `bin/cli.js`, `tests/write-guard.test.js`,
      `CHANGELOG.md` modified
- [ ] `plans/README.md` status row for 043 updated

## STOP conditions

Stop and report if:

- The "Current state" excerpts don't match live code (drift).
- A guard rejects a default invocation (e.g. `sitemap generate` with no
  `--output`, which defaults to `.`) — that means the helper or wiring is wrong;
  the default `.` MUST pass.
- Wiring the guard requires touching `src/index.js`/`index.d.ts` to compile —
  it should not; if it does, re-read Step 1 (the helper belongs in schema.js
  where `isInsideDirectory` is defined).

## Maintenance notes

- For API consistency, `assertOutputDirInsideCwd` could later be promoted to the
  public guard family (re-export from `src/index.js`, declare in `index.d.ts`,
  add a `tests/consumer.test.ts` line). Deliberately deferred here to keep the
  change minimal and avoid the public-contract sync workflow.
- If a future command writes artifacts from a user path, add the same guard; a
  reviewer should check new writers for it.
- The guard intentionally allows `outDir === cwd` (default `.`).
