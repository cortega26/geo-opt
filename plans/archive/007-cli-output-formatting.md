# Plan 007: Improve CLI output formatting with chalk

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 4dff240..HEAD -- src/scoring.js src/robots.js bin/cli.js`
> If any of these files changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: 005 (commander refactor may change how CLI output flows;
  apply this plan on top of the commander-based CLI. If 005 is not done,
  this plan can still execute but will need adjustment when 005 lands.)
- **Category**: dx (user experience)
- **Planned at**: commit `4dff240`, 2026-06-26

## Why this matters

The GEO audit report in text mode (`scoring.js:372-408`) and the robots
audit (`robots.js:118-151`) use ASCII-only formatting with `===` and
`---` separator lines, monochrome output, and no visual hierarchy. On a
modern terminal, colored output dramatically improves scanability: scores
can be green/yellow/red based on thresholds, section headers can be bold,
and warnings can be yellow. The JSON output path is unaffected — this
plan only changes the human-readable text mode.

**chalk** (v5) is the standard terminal coloring library for Node.js: ESM
native, zero dependencies, chainable API. At ~10KB gzipped, it adds
minimal weight.

## Current state

### File: `src/scoring.js` — text-mode audit report (lines 372-408)

```js
console.log("==================================================");
console.log("            GEO OPTIMIZATION AUDIT REPORT         ");
console.log("==================================================");
console.log(`File: ${filepath}`);
console.log(`Total GEO Score: ${totalScore}/100`);
console.log("--------------------------------------------------");
console.log(`1. Answer-First & Structure: ${structScore}/20`);
for (const item of structBreakdown) {
  console.log(`   - ${item}`);
}
console.log("--------------------------------------------------");
console.log(`2. Statistics Density: ${statsScore}/20`);
console.log(`   - ${statsBreakdown}`);
// ... (repeats for all 5 dimensions)
console.log("==================================================");

console.log("\nActionable Recommendations:");
if (recs.length === 0) {
  console.log("Excellent! This page is fully optimized for generative search engine indexing.");
} else {
  for (const r of recs) {
    console.log(`- ${r}`);
  }
}
console.log("==================================================");
```

### File: `src/robots.js` — robots audit output (lines 118-151)

```js
console.log("==================================================");
console.log("            ROBOTS.TXT CRAWLER AUDIT             ");
console.log("==================================================");
// ... SUCCESS or WARNING message with ASCII formatting
console.log("==================================================");
```

### Key constraint: JSON mode must remain machine-readable

`auditFile()` already branches on `outputFormat` at line 337:
`if (outputFormat === "json") { ... } else { ... }`. The text-mode branch
(lines 372-408) is the only target for colorization. JSON output must be
unchanged — no ANSI codes in JSON output.

### Non-TTY / CI environments

chalk automatically detects non-TTY environments (piped output, CI) and
disables colors. This means `geo-opt audit file.md | cat` and `CI=true
geo-opt audit file.md` will produce plain text automatically. No extra
logic needed.

### Repo conventions

- ESM, double quotes, semicolons.
- Console output functions write to stdout; core functions return data
  instead of printing (`AGENTS.md:111`).
- The `auditFile()` function mixes return value (`totalScore`) with
  side-effect console.log. This plan does not change that architecture —
  it only wraps the existing `console.log` calls with chalk styling.
- Changelog policy enforced.

## Commands you will need

| Purpose       | Command                    | Expected on success                    |
|---------------|----------------------------|----------------------------------------|
| Install       | `npm install`              | exit 0                                 |
| Tests         | `npm test`                 | exit 0, all tests pass                 |
| Full check    | `npm run check`            | exit 0                                 |
| Visual check  | `node bin/cli.js audit tests/fixtures/sample.md` | colored output in TTY |
| JSON purity   | `node bin/cli.js audit tests/fixtures/sample.md --format json \| python3 -c "import sys,json; json.load(sys.stdin)"` | no parse error |

(Note: `tests/fixtures/sample.md` — confirm the path exists by looking at
existing test fixtures. If no fixture file is present, create
`tests/fixtures/sample.md` with minimal content for the smoke test.)

## Scope

**In scope** (the only files you should modify):
- `src/scoring.js` — colorize text-mode audit report
- `src/robots.js` — colorize robots audit output
- `CHANGELOG.md` — add Unreleased entry

**Out of scope** (do NOT touch, even though they look related):
- `bin/cli.js` — no output changes at the CLI level.
- JSON output path in `auditFile()` — must remain plain, machine-readable
  text.
- `src/schema.js`, `src/text.js`, `src/config.js` — no output changes.
- Python `geo_optimizer.py` — Python doesn't have chalk. If the Python
  skill wants colors later, it can use `rich` or ANSI codes directly. Out
  of scope for this JS-only plan.
- Adding progress spinners, loading indicators, or interactive prompts.
  This plan is purely about colorizing existing text output.
- `cli-table3` — the original finding mentioned cli-table3 for ASCII
  tables, but the audit report doesn't use tables for its main output.
  Table formatting for the scoring breakdown would be a separate design
  decision. This plan focuses on color only.

## Git workflow

- Branch: `advisor/007-cli-output-formatting`
- Commit style: conventional commits. Example: `feat: add terminal color
  output for audit and robots reports via chalk`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 0: Check for test fixture

```bash
ls tests/fixtures/sample.md 2>/dev/null || echo "no fixture"
```

If no fixture exists, create a minimal one:

```bash
mkdir -p tests/fixtures
cat > tests/fixtures/sample.md << 'EOF'
# Sample Article Title

This is a sample introduction paragraph that defines the topic. It is designed to be between forty and ninety words long to test the answer-first formatting dimension of the GEO scoring algorithm properly.

## Key Features

- Feature one with 42% improvement
- Feature two saving $10M annually
- Feature three: "Industry-leading performance" per Gartner

## Statistics

The platform processes 1.5M requests per second with 99.9% uptime.

> "This is the most reliable platform we have ever tested." — Jane Doe, CTO at Example Corp

## Sources

- [Official Documentation](https://example.com/docs)
- [Case Study](https://example.com/case-study)
EOF
```

**Verify**: `node bin/cli.js audit tests/fixtures/sample.md` → prints a
text audit report, exits 0.

### Step 1: Install chalk

```bash
npm install chalk
```

**Verify**: `node -e 'import chalk from "chalk"; console.log(chalk.green("ok"))'` →
prints "ok" in green. `grep '"chalk"' package.json` returns a line in
`dependencies`.

### Step 2: Colorize `src/scoring.js` audit report

Import chalk at the top of `src/scoring.js`:

```js
import chalk from "chalk";
```

In the text-mode branch (the `else` block at line 371), apply chalk to the
`console.log` calls. The JSON branch must remain completely unchanged.

#### Color rules

| Element | Style | Rationale |
|---------|-------|-----------|
| Report header banner | `chalk.bold.blue` | Visual anchor at top of output |
| Total score (≥80) | `chalk.green.bold` | Excellent score |
| Total score (50–79) | `chalk.yellow.bold` | Moderate score |
| Total score (<50) | `chalk.red.bold` | Poor score |
| Dimension headers | `chalk.bold` | Section hierarchy |
| Individual scores (≥16/20) | `chalk.green` | Good dimension |
| Individual scores (10–15) | `chalk.yellow` | Needs work |
| Individual scores (<10) | `chalk.red` | Critical gap |
| Breakdown details | no color (plain) | Readability for long text |
| Recommendations header | `chalk.bold.cyan` | Call to action |
| Recommendations | `chalk.cyan` | Distinct from report data |
| "Excellent!" message | `chalk.green.bold` | Positive reinforcement |
| Section separators | `chalk.dim("─".repeat(50))` | Subtle visual breaks |

Example of the refactored text output block:

```js
} else {
  // --- Color helpers ---
  const scoreColor = (s, max) => {
    const pct = s / max;
    if (pct >= 0.8) return chalk.green;
    if (pct >= 0.5) return chalk.yellow;
    return chalk.red;
  };
  const totalColor = (s) => {
    if (s >= 80) return chalk.green.bold;
    if (s >= 50) return chalk.yellow.bold;
    return chalk.red.bold;
  };

  console.log(chalk.bold.blue("══════════════════════════════════════════════════"));
  console.log(chalk.bold.blue("            GEO OPTIMIZATION AUDIT REPORT         "));
  console.log(chalk.bold.blue("══════════════════════════════════════════════════"));
  console.log(`${chalk.white.bold("File:")} ${filepath}`);
  console.log(`${chalk.white.bold("Total GEO Score:")} ${totalColor(totalScore)(`${totalScore}/100`)}`);
  console.log(chalk.dim("──────────────────────────────────────────────────"));
  console.log(`${chalk.bold(`1. Answer-First & Structure: ${scoreColor(structScore, 20)(`${structScore}/20`)}`)}`);
  for (const item of structBreakdown) {
    console.log(`   - ${item}`);
  }
  console.log(chalk.dim("──────────────────────────────────────────────────"));
  console.log(`${chalk.bold(`2. Statistics Density: ${scoreColor(statsScore, 20)(`${statsScore}/20`)}`)}`);
  console.log(`   - ${statsBreakdown}`);
  // ... (same pattern for remaining 3 dimensions)
  console.log(chalk.bold.blue("══════════════════════════════════════════════════"));

  console.log(chalk.bold.cyan("\nActionable Recommendations:"));
  if (recs.length === 0) {
    console.log(chalk.green.bold("Excellent! This page is fully optimized for generative search engine indexing."));
  } else {
    for (const r of recs) {
      console.log(chalk.cyan(`- ${r}`));
    }
  }
  console.log(chalk.bold.blue("══════════════════════════════════════════════════"));
}
```

Key design choice: chalk styling is applied inline in `console.log` calls,
not precomputed into strings. This ensures that when output is piped
(chalk's auto-detection kicks in), ANSI codes are stripped and the plain
text is identical to the original format.

#### Dimension coloring logic

Replace each dimension's `console.log` with the colored version:

```js
// Dimension 1
console.log(chalk.bold(`1. Answer-First & Structure: ${scoreColor(structScore, 20)(`${structScore}/20`)}`));

// Dimension 2
console.log(chalk.bold(`2. Statistics Density: ${scoreColor(statsScore, 20)(`${statsScore}/20`)}`));

// Dimension 3
console.log(chalk.bold(`3. Quotation Density: ${scoreColor(quotesScore, 20)(`${quotesScore}/20`)}`));

// Dimension 4
console.log(chalk.bold(`4. Citation & Authority: ${scoreColor(citationScore, 20)(`${citationScore}/20`)}`));

// Dimension 5
console.log(chalk.bold(`5. Semantic Clarity: ${scoreColor(clarityScore, 20)(`${clarityScore}/20`)}`));
```

**Verify**: `node bin/cli.js audit tests/fixtures/sample.md` → colored
output in terminal. `node bin/cli.js audit tests/fixtures/sample.md |
cat` → plain text output (no ANSI codes — chalk auto-disables on pipe).

### Step 3: Colorize `src/robots.js` robots audit

Import chalk at the top of `src/robots.js`:

```js
import chalk from "chalk";
```

Apply the same styling pattern:

```js
console.log(chalk.bold.blue("══════════════════════════════════════════════════"));
console.log(chalk.bold.blue("            ROBOTS.TXT CRAWLER AUDIT             "));
console.log(chalk.bold.blue("══════════════════════════════════════════════════"));

// ...

if (blockedAgents.length > 0 || wildcardBlocksRoot) {
  console.log(chalk.yellow.bold("WARNING: The following AI agents are blocked from crawling your root directory:"));
  if (wildcardBlocksRoot) {
    console.log(chalk.yellow("  - User-agent: * (root access blocked for crawlers without a specific allow)"));
  }
  for (const b of blockedAgents) {
    console.log(chalk.yellow(`  - User-agent: ${b.agent} (root access blocked)`));
  }
  console.log(chalk.dim("\nNote: Blocking these crawlers prevents AI engines from indexing your content and citing your pages."));
} else {
  console.log(chalk.green.bold("SUCCESS: No major AI agents or wildcard directives are blocking root access."));
  console.log(chalk.green("Your content is crawler-friendly for generative search engine indexing."));
}
console.log(chalk.bold.blue("══════════════════════════════════════════════════"));
```

**Verify**: `node bin/cli.js robots <path-to-robots.txt>` → colored output.

### Step 4: Run tests and verify JSON purity

```bash
npm test
```

All tests must pass. Pay special attention to:
- Tests that capture stdout from `auditFile()` and parse it — if any test
  captures text-mode output and asserts on exact string content, the
  assertion may fail because of ANSI codes. Update the test to either:
  1. Use JSON mode (preferred): `auditFile(fp, config, "json")`
  2. Strip ANSI codes before asserting: `.replace(/\x1B\[[0-9;]*m/g, "")`

Verify JSON output is clean:

```bash
node bin/cli.js audit tests/fixtures/sample.md --format json | python3 -c "import sys,json; json.load(sys.stdin); print('JSON valid')"
```

Expected: prints "JSON valid", no errors.

Verify piped output has no ANSI codes:

```bash
node bin/cli.js audit tests/fixtures/sample.md | cat | grep -q $'\x1B' && echo "HAS ANSI" || echo "NO ANSI"
```

Expected: "NO ANSI" (chalk auto-disables color on non-TTY).

### Step 5: Run full check

```bash
npm run check
```

**Verify**: exit 0.

### Step 6: Update changelog

Under `## [Unreleased]` / `### Added`:

```markdown
- Terminal color output for audit and robots reports via chalk. Scores and
  warnings use green/yellow/red for visual scanability. JSON mode and piped
  output remain plain text.
```

**Verify**: `npm run changelog:check` → exit 0.

## Test plan

- All existing tests must pass. If any test captures text-mode stdout and
  asserts on exact string content, update it to use JSON mode or strip ANSI
  codes.
- Manual verification:
  1. `node bin/cli.js audit tests/fixtures/sample.md` in a TTY → colored
     output.
  2. `node bin/cli.js audit tests/fixtures/sample.md | cat` → plain text,
     no ANSI codes.
  3. `node bin/cli.js audit tests/fixtures/sample.md --format json` →
     valid JSON, no ANSI codes.
- No new automated tests needed — chalk's auto-detection is tested in its
  own test suite. The project tests confirm the output contract is
  preserved.

## Done criteria

- [ ] `npm run check` exits 0
- [ ] `node bin/cli.js audit tests/fixtures/sample.md --format json | python3 -c "import sys,json; json.load(sys.stdin)"` → no parse error (JSON is clean)
- [ ] `node bin/cli.js audit tests/fixtures/sample.md | cat | grep -c $'\x1B'` returns 0 (no ANSI codes when piped)
- [ ] `grep "import chalk from" src/scoring.js src/robots.js` returns one match per file
- [ ] `grep "chalk\." src/scoring.js src/robots.js` returns at least 5 matches total
- [ ] No files outside in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `npm install chalk` fails or chalk does not load as ESM.
- Any test fails and cannot be fixed by switching the test to JSON mode or
  stripping ANSI codes.
- `node bin/cli.js audit tests/fixtures/sample.md --format json` output
  contains ANSI escape codes (the JSON branch must NOT be colorized).
- The code at `src/scoring.js:372-408` does not match the excerpt in
  "Current state" (codebase drifted, possibly due to plan 002 or 003).

## Maintenance notes

- Chalk v5 is ESM-only, matching this project's `"type": "module"`. If a
  future version introduces breaking changes, the import style (`import
  chalk from "chalk"`) may need updating.
- The dimension-level score colors use thresholds of 80% and 50% (≥16/20 =
  green, 10–15 = yellow, <10 = red). These thresholds are hardcoded. If a
  future plan makes scoring dimensions configurable, the color thresholds
  could become configurable too.
- If `cli-table3` is added later for table formatting, the chalk styling in
  this plan composes naturally — cli-table3 supports chalk instances for
  cell-level coloring.
- ANSI code testing: `grep -c $'\x1B'` is a bash-ism. In cross-platform
  scripts, use `node -e '...'` to detect ANSI codes instead.
