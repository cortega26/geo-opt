# Plan 050: Core layering and deduplication — extract evidence-section helper, silence `injectSchema` console output

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If a
> "STOP conditions" item occurs, stop and report. When done, update the status
> row in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat b09a5f8..HEAD -- src/scoring.js src/renderer.js src/schema.js tests CHANGELOG.md`
> If any of those files changed since this plan was written, compare the
> "Current state" excerpts against the live code first.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: MED for Step 2 (`injectSchema` is a public export — its return value changes)
- **Depends on**: none
- **Category**: tech debt / layering
- **Planned at**: commit `b09a5f8`, 2026-06-28

## Why this matters

Two layering problems:

### F18 — Evidence-section rendering duplicated in two places

The `--explain` output block (which lists evidence labels and source-reference
URLs per finding) is implemented **twice** with near-identical code:

1. **`src/scoring.js:602-631`** — inside `auditFile()`, uses direct
   `console.log` calls + chalk.
2. **`src/renderer.js:133-160`** — inside `renderV1Report()`, pushes onto a
   `lines` array + chalk (the lines are later printed by the caller).

Both blocks:
- filter findings to `warn` + `fail` severity
- pick a chalk color based on `f.evidenceLabel` (`strong` → green, `probable`
  → blue, `experimental` → yellow, unknown → gray)
- `console.log`/`lines.push` the `ruleId + [label]` header
- look up each `f.sourceRefs[n]` in `EVIDENCE_REGISTRY` and emit
  `← title (url)` lines

Any future change to explain output (new label color, URL format) must be made
in two places and is easy to forget.

The fix: extract `buildExplainLines(findings)` — a function that takes the
findings array and returns a `string[]` of formatted lines — into `renderer.js`
(which already builds such arrays). Both callers then use the helper.

### DEBT-04 — `injectSchema` prints success messages directly

`injectSchema` is a public export (`src/index.js:63-64`) that currently
`console.log`s its own success/dry-run messages (lines 583-603). Core functions
should return data; callers decide what to print. This prevents programmatic
callers from suppressing or redirecting the output, and makes unit-testing
`injectSchema` without capturing stdout awkward.

The fix: make `injectSchema` return a result object instead of printing, and
update the one caller in `bin/cli.js` to handle the result and print.

**Scoped out deliberately**:

- `src/validate.js` (`validateSchemaFile`) already has a clean pure/print
  split: `validateSchema()` is pure and exported, `validateSchemaFile()` is the
  print wrapper. No change needed.
- The HTML-report evidence-label rendering in `src/html-report.js` (lines
  265-270, 407-410) produces HTML `<span>` elements — a fundamentally different
  output format; sharing with the chalk-based text helper would require a
  template parameter and is not worth the abstraction.

## Current state

**`auditFile` explain block, `src/scoring.js:602-631`**:
```js
    // Explain mode: show evidence labels and source refs per finding
    if (explain && report.findings) {
      console.log(chalk.bold.magenta("\nEvidence & Sources (--explain):"));
      const warnFailFindings = report.findings.filter(
        (f) => f.severity === "warn" || f.severity === "fail"
      );
      if (warnFailFindings.length === 0) {
        console.log(chalk.green("  All checks passed — no evidence notes needed."));
      } else {
        for (const f of warnFailFindings) {
          const labelColor =
            f.evidenceLabel === "strong"
              ? chalk.green
              : f.evidenceLabel === "probable"
                ? chalk.blue
                : f.evidenceLabel === "experimental"
                  ? chalk.yellow
                  : chalk.gray;
          console.log(`  ${chalk.bold(f.ruleId)} ${labelColor(`[${f.evidenceLabel}]`)}`);
          if (f.sourceRefs.length > 0) {
            for (const ref of f.sourceRefs) {
              const entry = EVIDENCE_REGISTRY[ref];
              if (entry) {
                console.log(`    ← ${entry.title} (${entry.url})`);
              }
            }
          }
        }
      }
    }
```

**`renderV1Report` explain block, `src/renderer.js:133-160`**:
```js
  // Explain mode
  if (explain && report.findings) {
    lines.push(chalk.bold.magenta("\nEvidence & Sources (--explain):"));
    const warnFail = report.findings.filter((f) => f.severity === "warn" || f.severity === "fail");
    if (warnFail.length === 0) {
      lines.push(chalk.green("  All checks passed — no evidence notes needed."));
    } else {
      for (const f of warnFail) {
        const labelColor =
          f.evidenceLabel === "strong"
            ? chalk.green
            : f.evidenceLabel === "probable"
              ? chalk.blue
              : f.evidenceLabel === "experimental"
                ? chalk.yellow
                : chalk.gray;
        lines.push(`  ${chalk.bold(f.ruleId)} ${labelColor(`[${f.evidenceLabel}]`)}`);
        if (f.sourceRefs && f.sourceRefs.length > 0) {
          for (const ref of f.sourceRefs) {
            const entry = EVIDENCE_REGISTRY[ref];
            if (entry) {
              lines.push(`    ← ${entry.title} (${entry.url})`);
            }
          }
        }
      }
    }
  }
```

The only structural difference: `scoring.js` uses `console.log` and checks
`f.sourceRefs.length > 0`; `renderer.js` uses `lines.push` and checks
`f.sourceRefs && f.sourceRefs.length > 0` (guards against undefined).

**`injectSchema`, `src/schema.js:549-612`** — currently `console.log`s four
success messages (lines 584, 586, 590, 592) and three dry-run messages (lines
601-603), then returns `undefined`:

```js
export function injectSchema(filepath, schemaType, config, options = {}) {
  // ...
  if (isHtml) {
    if (replaced) {
      console.log(`Successfully replaced existing JSON-LD script tag in ${filepath}.`);
    } else {
      console.log(`Successfully injected JSON-LD script tag into ${filepath}.`);
    }
  } else {
    if (replaced) {
      console.log(`Successfully updated existing Schema.org block in markdown file ${filepath}.`);
    } else {
      console.log(`Successfully appended Schema.org block to markdown file ${filepath}.`);
    }
  }

  if (dryRun) {
    // ...
    console.log("=== DRY RUN: The following would be injected ===");
    console.log(preview);
    console.log("=== End of dry run preview ===");
    return;
  }

  try {
    fs.writeFileSync(filepath, modifiedContent, { encoding: "utf8" });
  } catch (e) {
    throw new Error(`Failed to write to file ${filepath}: ${e.message}`, { cause: e });
  }
}
```

**`bin/cli.js` inject caller** (find the call with `grep -n "injectSchema" bin/cli.js`):
The CLI calls `injectSchema(filepath, type, config, options)` and currently relies
on the function to print its own success/dry-run messages. After the change the
CLI must print them itself.

**`index.d.ts`** — `injectSchema` return type. Check its current signature and
update to reflect the new return type (Step 2 defines the shape).

**`src/renderer.js` exports** — `renderV1Report` is already exported and
publicly available. `buildExplainLines` will be a new named export.

**Conventions**: ESM, double quotes, semicolons. Test files live under
`tests/`; the renderer test file is `tests/optimizer.test.js` (the
`renderV1ReportText` / `renderReport` tests live there around lines
2400–2590). The schema test file is `tests/schema.test.js`.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Schema tests | `node --test tests/schema.test.js` | all pass |
| Optimizer/renderer tests | `node --test tests/optimizer.test.js` | all pass |
| Full suite | `npm test` | all pass |
| Typecheck (contract) | `npm run typecheck` | exit 0 |
| Lint / format | `npm run lint` / `npm run format:check` | exit 0 |

## Scope

**In scope**: `src/renderer.js`, `src/scoring.js`, `src/schema.js`,
`bin/cli.js` (inject caller only), `index.d.ts` (`injectSchema` signature),
`tests/schema.test.js`, `tests/optimizer.test.js`, `CHANGELOG.md`.

**Out of scope**: `src/html-report.js` (HTML evidence labels use a different
output format), `src/validate.js` (pure/print split already exists),
any file not listed above, the Python port.

## Git workflow

- Branch: `advisor/050-core-layering-and-deduplication`
- Commit style: `refactor(core): extract explain-section helper; injectSchema returns result instead of printing`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Extract `buildExplainLines` helper

In `src/renderer.js`, add a new **exported** function just before the
`renderV1Report` function:

```js
/**
 * Builds the --explain evidence section as an array of chalk-formatted lines.
 * Returns an empty array when there are no findings.
 */
export function buildExplainLines(findings) {
  if (!findings || !findings.length) return [];
  const lines = [];
  lines.push(chalk.bold.magenta("\nEvidence & Sources (--explain):"));
  const warnFail = findings.filter((f) => f.severity === "warn" || f.severity === "fail");
  if (warnFail.length === 0) {
    lines.push(chalk.green("  All checks passed — no evidence notes needed."));
  } else {
    for (const f of warnFail) {
      const labelColor =
        f.evidenceLabel === "strong"
          ? chalk.green
          : f.evidenceLabel === "probable"
            ? chalk.blue
            : f.evidenceLabel === "experimental"
              ? chalk.yellow
              : chalk.gray;
      lines.push(`  ${chalk.bold(f.ruleId)} ${labelColor(`[${f.evidenceLabel}]`)}`);
      if (f.sourceRefs && f.sourceRefs.length > 0) {
        for (const ref of f.sourceRefs) {
          const entry = EVIDENCE_REGISTRY[ref];
          if (entry) {
            lines.push(`    ← ${entry.title} (${entry.url})`);
          }
        }
      }
    }
  }
  return lines;
}
```

**Replace** the explain block in `renderV1Report` (`src/renderer.js:133-160`)
with:
```js
  // Explain mode
  if (explain && report.findings) {
    lines.push(...buildExplainLines(report.findings));
  }
```

**Add** `buildExplainLines` to the import in `src/scoring.js`:
```js
import { renderV1Report, buildExplainLines } from "./renderer.js";
```
(Check the existing import line in scoring.js — add `buildExplainLines` to it.)

**Replace** the explain block in `auditFile` (`src/scoring.js:602-631`) with:
```js
    // Explain mode: show evidence labels and source refs per finding
    if (explain && report.findings) {
      for (const line of buildExplainLines(report.findings)) {
        console.log(line);
      }
    }
```

**Verify**: `node --test tests/optimizer.test.js` → all pass.

### Step 2: Make `injectSchema` return a result object

The new return shape (define it clearly for the TypeScript update):

```ts
{
  replaced: boolean;   // true if an existing block was overwritten
  dryRun: boolean;     // true if no file was written
  preview?: string;    // present only when dryRun is true
  message: string;     // the success/dry-run string the CLI would print
}
```

In `src/schema.js:549-612`, replace the direct `console.log` calls so the
function builds the message string and returns the result object instead of
printing:

```js
export function injectSchema(filepath, schemaType, config, options = {}) {
  const normalizedOptions = typeof options === "boolean" ? { dryRun: options } : options;
  const dryRun = normalizedOptions.dryRun ?? false;
  const noBranding = normalizedOptions.noBranding ?? false;

  if (noBranding) {
    const entitlementError = getNoBrandingError(config);
    if (entitlementError) {
      throw new Error(entitlementError);
    }
  }

  if (!fs.existsSync(filepath)) {
    throw new Error(`File ${filepath} not found.`);
  }

  assertWritableTargetInsideCwd(filepath);

  let content = "";
  try {
    content = fs.readFileSync(filepath, { encoding: "utf8", flag: "r" });
  } catch (e) {
    throw new Error(`Failed to read file ${filepath}: ${e.message}`, { cause: e });
  }

  const schema = generateSchemaData(filepath, schemaType, config, content);

  const { content: modifiedContent, replaced } = buildInjectedContent(content, filepath, schema, {
    noBranding,
  });

  const isHtml = filepath.endsWith(".html") || content.toLowerCase().includes("<html");
  let message;
  if (isHtml) {
    message = replaced
      ? `Successfully replaced existing JSON-LD script tag in ${filepath}.`
      : `Successfully injected JSON-LD script tag into ${filepath}.`;
  } else {
    message = replaced
      ? `Successfully updated existing Schema.org block in markdown file ${filepath}.`
      : `Successfully appended Schema.org block to markdown file ${filepath}.`;
  }

  if (dryRun) {
    const previewJson = JSON.stringify(schema, null, 2).replace(/<\//g, "<\\/");
    const previewSig = noBranding ? "" : `\n\n${TOOLTICIAN_BRANDING_MARKDOWN}\n`;
    const preview = `${previewSig}\n\`\`\`json\n${previewJson}\n\`\`\`\n`;
    const dryRunMessage = `=== DRY RUN: The following would be injected ===\n${preview}\n=== End of dry run preview ===`;
    return { replaced, dryRun: true, preview, message: dryRunMessage };
  }

  try {
    fs.writeFileSync(filepath, modifiedContent, { encoding: "utf8" });
  } catch (e) {
    throw new Error(`Failed to write to file ${filepath}: ${e.message}`, { cause: e });
  }

  return { replaced, dryRun: false, message };
}
```

**Update `bin/cli.js`** — find the `injectSchema` call(s) in the inject
command (around line 700+). The caller currently relies on `injectSchema` to
print. After the change, add `console.log(result.message)` (or the equivalent
chalk-wrapped version that was already there):

```js
const result = injectSchema(filepath, type, config, opts);
console.log(result.message);
```

Check whether the dry-run path in `bin/cli.js` also needs updating (if it had
separate `console.log` calls that were proxying through `injectSchema`, remove
the duplicates). The CLI's existing dry-run message (the `[dry-run] Would
inject...` line) is separate from `injectSchema`'s own dry-run preview and
should remain.

**Update `index.d.ts`** — find the `injectSchema` declaration and update its
return type from `void` to:
```ts
export interface InjectSchemaResult {
  replaced: boolean;
  dryRun: boolean;
  preview?: string;
  message: string;
}

export function injectSchema(
  filepath: string,
  schemaType: string,
  config?: GeoConfig,
  options?: { dryRun?: boolean; noBranding?: boolean } | boolean
): InjectSchemaResult;
```

**Verify**: `npm run typecheck` → exit 0.

### Step 3: Add tests

**For `buildExplainLines`** — in `tests/optimizer.test.js`, add a test near the
existing renderer tests (around line 2400+):

```js
it("buildExplainLines returns formatted lines for warn/fail findings", () => {
  const findings = [
    { severity: "fail", ruleId: "missing_h1", evidenceLabel: "strong", sourceRefs: [] },
    { severity: "pass", ruleId: "keyword_density", evidenceLabel: "probable", sourceRefs: [] },
  ];
  // Import buildExplainLines (check top-of-file imports first)
  const lines = buildExplainLines(findings);
  assert.ok(lines.length >= 2, "should have header + at least one finding line");
  assert.ok(lines.some((l) => l.includes("missing_h1")));
  assert.ok(!lines.some((l) => l.includes("keyword_density")), "pass findings excluded");
});

it("buildExplainLines returns all-passed message when no warn/fail", () => {
  const findings = [{ severity: "pass", ruleId: "ok", evidenceLabel: "strong", sourceRefs: [] }];
  const lines = buildExplainLines(findings);
  assert.ok(lines.some((l) => l.includes("All checks passed")));
});
```

If `buildExplainLines` is not yet imported in `optimizer.test.js`, add it to
the import from `../src/renderer.js`.

**For `injectSchema` return value** — in `tests/schema.test.js`, add:
```js
it("injectSchema returns a result object with replaced and message fields", () => {
  // Use a temp file so we don't touch repo files
  const tmpFile = path.join(os.tmpdir(), `injectSchema-test-${Date.now()}.md`);
  fs.writeFileSync(tmpFile, "# Test\n\nContent.\n");
  try {
    const result = injectSchema(tmpFile, "article", {});
    assert.strictEqual(typeof result, "object");
    assert.strictEqual(typeof result.replaced, "boolean");
    assert.strictEqual(typeof result.message, "string");
    assert.ok(result.message.length > 0);
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  }
});

it("injectSchema dryRun returns result without writing file", () => {
  const tmpFile = path.join(os.tmpdir(), `injectSchema-dry-${Date.now()}.md`);
  fs.writeFileSync(tmpFile, "# Test\n\nContent.\n");
  const before = fs.readFileSync(tmpFile, "utf8");
  try {
    const result = injectSchema(tmpFile, "article", {}, { dryRun: true });
    assert.strictEqual(result.dryRun, true);
    assert.ok(typeof result.preview === "string");
    assert.strictEqual(fs.readFileSync(tmpFile, "utf8"), before, "file must be unchanged");
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  }
});
```

Check that `injectSchema` is imported in `schema.test.js`. If the test file
uses `os.tmpdir()`, import `os` at the top.

**Verify**: `node --test tests/schema.test.js` and
`node --test tests/optimizer.test.js` → all pass including new tests.

### Step 4: Confirm no console output from `injectSchema` in tests

Run:
```
node -e "
import('./src/schema.js').then(m => {
  const fs = await import('fs'); const os = await import('os'); const path = await import('path');
  // can't easily do async here in one line — use the test instead
})
"
```

Actually, just confirm: the new `tests/schema.test.js` test that calls
`injectSchema` does NOT produce any `console.log` output. If you see output,
the console.log removal in Step 2 was incomplete.

**Verify**: running `node --test tests/schema.test.js` shows no extra log lines
between test results.

### Step 5: Changelog

Under `## [Unreleased]`:
- `### Changed`:
  - `- \`injectSchema\` now returns a \`{ replaced, dryRun, message, preview? }\` object instead of printing directly. The CLI still prints the message; programmatic callers can inspect or suppress it.`
  - `- Extracted shared \`buildExplainLines(findings)\` helper from the \`--explain\` rendering path (was duplicated in \`scoring.js\` and \`renderer.js\`).`

**Verify**: `npm run changelog:check` → exit 0.

## Test plan

- New unit tests for `buildExplainLines` (header, finding filtering,
  all-passed message).
- New unit tests for `injectSchema` return value (normal and dry-run).
- Full suite: `npm test` → all pass.
- `npm run typecheck` validates the `InjectSchemaResult` type.

## Done criteria

ALL must hold:

- [ ] `grep -n "console.log" src/schema.js` returns nothing in the
      `injectSchema` function body (lines 549–612 range)
- [ ] `grep -n "buildExplainLines" src/renderer.js` shows the definition and
      the export
- [ ] `grep -n "buildExplainLines" src/scoring.js` shows the import and the
      usage
- [ ] `grep -n "buildExplainLines" tests/optimizer.test.js` shows the test
- [ ] `injectSchema` return type in `index.d.ts` is no longer `void`
- [ ] New `schema.test.js` tests for `injectSchema` result shape pass
- [ ] Running `node --test tests/schema.test.js` produces no unexpected
      console output lines
- [ ] `npm test`, `npm run typecheck`, `npm run lint`, `npm run format:check`,
      `npm run changelog:check` all exit 0
- [ ] Only in-scope files modified
- [ ] `plans/README.md` status row for 050 updated

## STOP conditions

Stop and report if:

- Any existing test in `tests/schema.test.js` or `tests/optimizer.test.js`
  breaks after Steps 1 or 2 (the changes are meant to be behavior-preserving
  for callers that relied on the old API).
- The `bin/cli.js` inject caller is more complex than a simple `injectSchema`
  call — if it already wraps the result in branching logic, read that section
  carefully before changing it, and report what you find.
- `npm run typecheck` fails with a type error in a consumer of `injectSchema`
  beyond the one call site in `bin/cli.js` — list the callers and stop.
- The "Current state" excerpts don't match live code (drift).

## Maintenance notes

- `injectSchema` is part of the public API (`src/index.js:64`). The new return
  type is a **breaking change** for any consumer that previously assigned
  `const result = injectSchema(...)` and expected `undefined` — in practice
  that's unlikely, but note it in the PR description.
- `buildExplainLines` is exported so that future renderers (e.g. a JSON
  renderer) can call it without going through `renderV1Report`. Keep it
  dependency-free beyond chalk + EVIDENCE_REGISTRY.
- The v2 renderer path (`renderV2Report` in `renderer.js`) has its own explain
  logic. If it mirrors the same pattern, it is a future candidate for the same
  helper but is NOT in scope here.
