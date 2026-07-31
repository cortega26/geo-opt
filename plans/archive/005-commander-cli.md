# Plan 005: Replace manual CLI parsing with commander

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 4dff240..HEAD -- bin/cli.js tests/optimizer.test.js package.json`
> If any of these files changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: 004 (commander should receive validated config. While
  not a hard dependency, executing 004 first reduces the risk of wiring
  unvalidated config into the new CLI structure.)
- **Category**: dx (maintainability)
- **Planned at**: commit `4dff240`, 2026-06-26

## Why this matters

`bin/cli.js` is 402 lines. ~80 lines are hardcoded help text duplicated in
`printHelp()`. ~90 lines are repetitive `parseArgs` boilerplate (four
nearly identical blocks for audit, robots, schema, inject — each with
manual validation of options). The `--config` flag is extracted manually
before subcommand dispatch (lines 130-136), which is fragile and
non-standard. Adding a new option to any command requires touching three
places: the `parseArgs` config, the manual validation, and the help text.

**commander** (v13+) is the standard CLI framework for Node.js: 12KB
gzipped, zero dependencies. It auto-generates `--help` from option
definitions, validates types and choices natively, supports subcommands
with separate option scopes, and adds `--version` for free. The refactored
CLI will be ~150 lines — half the current size — and adding a new flag
becomes a one-line change.

## Current state

### File: `bin/cli.js` — 402 lines, manual argument parsing

The current structure:

- Lines 18-32: `auditFileJson()` helper wraps stdout capture.
- Lines 34-119: `printHelp()` with 80 lines of hardcoded help text,
  duplicated across subcommands.
- Lines 121-129: initial `process.argv` check, no `--version` support.
- Lines 130-136: manual `--config` extraction before dispatch.
- Lines 143-225: `audit` command — 83 lines with `parseArgs`, manual
  validation, file loop, threshold check, JSON output.
- Lines 226-253: `robots` command — 28 lines, same parseArgs pattern.
- Lines 255-284: `schema` command — 30 lines.
- Lines 286-351: `inject` command — 65 lines with backup logic.
- Lines 353-386: `config` command — 34 lines, manual sub-action parsing.

The `parseArgs` blocks are all structurally identical:

```js
let parsed;
try {
  parsed = parseArgs({
    args: rest,
    options: { /* ... */ },
    allowPositionals: true,
  });
} catch (e) {
  console.error(`Error: ${e.message}`);
  process.exit(1);
}
```

Each command manually validates option values (format, threshold, type)
after parsing. Commander handles this automatically via `.choices()` and
type coercion.

### Repo conventions

- The CLI entry point is `#!/usr/bin/env node` (`bin/cli.js:1`).
- ESM throughout (`package.json:20`).
- Error messages go to `stderr`, start with `Error:`, and precede
  `process.exit(1)` (`AGENTS.md:109-110`).
- Help text uses indentation with 2 spaces per level.
- All function calls are synchronous — no async/await needed.
- The CLI module imports from `../src/index.js`.
- Changelog policy enforced.

### Existing CLI behavior that must be preserved

1. `geo-opt` with no args → prints main help, exits 0.
2. `geo-opt --help` / `-h` → main help.
3. `geo-opt <command> --help` → command-specific help.
4. `geo-opt audit file.md` → text report, exits 0.
5. `geo-opt audit file.md --format json` → JSON to stdout, exits 0.
6. `geo-opt audit file.md --threshold 70` → exits 1 if score < 70.
7. `geo-opt audit file1.md file2.md --format json` → JSON array to stdout.
8. `geo-opt schema file.md article` → JSON-LD to stdout.
9. `geo-opt inject file.md article` → modifies file, prints success.
10. `geo-opt inject file.md article --dry-run` → preview only.
11. `geo-opt inject file.md article --backup` → creates .bak.
12. `geo-opt inject file.md article --no-branding` → requires Pro key or
    exits with error.
13. `geo-opt robots robots.txt` → audit output.
14. `geo-opt config get reminders` → prints "true" or "false".
15. `geo-opt config set reminders true` → enables, prints confirmation.
16. `--config <path>` flag accepted globally before subcommand.
17. Unknown subcommand → error + help, exits 1.

## Commands you will need

| Purpose       | Command                    | Expected on success                    |
|---------------|----------------------------|----------------------------------------|
| Install       | `npm install`              | exit 0                                 |
| Tests         | `npm test`                 | exit 0, all tests pass                 |
| Coverage      | `npm run test:coverage`    | exit 0                                 |
| Lint          | `npm run lint`             | exit 0                                 |
| Format check  | `npm run format:check`     | exit 0                                 |
| Python tests  | `npm run test:python`      | exit 0 (Python parity unaffected)      |
| Full check    | `npm run check`            | exit 0                                 |
| CLI smoke     | `node bin/cli.js --help`   | prints help, exits 0                   |

## Scope

**In scope** (the only files you should modify):
- `bin/cli.js` — full rewrite of CLI dispatch using commander
- `tests/optimizer.test.js` — update any tests that invoke the CLI
  directly (search for `cliPath` in the test file)
- `CHANGELOG.md` — add Unreleased entry

**Out of scope** (do NOT touch, even though they look related):
- `src/*.js` — no changes to library code. The CLI refactor only changes
  how functions are called, not the functions themselves.
- Python `geo_optimizer.py` — separate plan.
- Adding new CLI commands — this plan is a refactor, not a feature
  addition. Do not add `--version` handling manually; commander provides it
  automatically.
- The `scripts/` directory.
- Error message wording — preserve the exact error text for existing
  validation errors (e.g., `"Error: --format must be \"text\" or
  \"json\""`). These are part of the public CLI contract.

## Git workflow

- Branch: `advisor/005-commander-cli`
- Commit style: conventional commits. Example: `refactor: replace manual
  CLI parsing with commander in bin/cli.js`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 0: Capture CLI behavior baseline

Run each of the 17 behaviors listed in "Existing CLI behavior that must be
preserved" and save the exact stdout/stderr for each. You will verify
against these after the refactor.

**Verify**: all 17 commands produce expected output with exit codes as
listed. Record any surprises.

### Step 1: Install commander

```bash
npm install commander
```

**Verify**: `node -e 'import { Command } from "commander"; console.log(typeof Command)'` →
prints `function`. `grep '"commander"' package.json` returns a line in
`dependencies`.

### Step 2: Rewrite `bin/cli.js` with commander

Replace the entire file content. The new structure:

```js
#!/usr/bin/env node
import { Command } from "commander";
import fs from "fs";
import {
  auditFile,
  assertNewFileParentInsideCwd,
  assertWritableTargetInsideCwd,
  checkRobots,
  generateSchemaData,
  injectSchema,
  loadConfig,
  getNoBrandingError,
  recordSuccessfulFreeInjection,
  remindersAreEnabled,
  setRemindersEnabled,
} from "../src/index.js";

const program = new Command();

program
  .name("geo-opt")
  .description("Generative Engine Optimization CLI")
  .option("--config <path>", "Path to geo_config.json")
  .version("2.0.0"); // Keep in sync with package.json manually or read it.

// --- Audit subcommand ---
program
  .command("audit <files...>")
  .description("Audit content for GEO optimization score")
  .option("-f, --format <type>", "Output format", "text")
  .option("-t, --threshold <n>", "Exit with code 1 if score is below n")
  .action((files, options, cmd) => {
    const { config } = loadConfig(cmd.parent.opts().config);
    const format = options.format;
    if (!["text", "json"].includes(format)) {
      console.error(`Error: --format must be "text" or "json", got "${format}".`);
      process.exit(1);
    }

    let threshold = null;
    if (options.threshold !== undefined) {
      const raw = options.threshold;
      if (!/^\d+$/.test(raw)) {
        console.error(`Error: --threshold must be an integer, got "${raw}".`);
        process.exit(1);
      }
      threshold = parseInt(raw, 10);
    }

    const results = [];
    const jsonReports = [];
    for (const fp of files) {
      if (format === "json") {
        const { score, report } = auditFileJson(fp, config);
        results.push({ file: fp, score });
        jsonReports.push(report);
      } else {
        const score = auditFile(fp, config, format);
        results.push({ file: fp, score });
      }
    }

    if (format === "json") {
      console.log(JSON.stringify(jsonReports.length === 1 ? jsonReports[0] : jsonReports, null, 2));
    }

    if (threshold !== null && !isNaN(threshold)) {
      const failures = results.filter((r) => r.score < threshold);
      if (failures.length > 0) {
        console.error(`\nThreshold not met for ${failures.length} file(s):`);
        for (const f of failures) {
          console.error(`  ${f.file}: ${f.score}/100 (threshold: ${threshold})`);
        }
        process.exit(1);
      }
      if (format !== "json") {
        console.log(`\nAll ${results.length} file(s) meet threshold ${threshold}/100.`);
      }
    }
  });

// --- Robots subcommand ---
program
  .command("robots <file>")
  .description("Audit robots.txt for AI crawler rules")
  .action((file, options, cmd) => {
    const { config } = loadConfig(cmd.parent.opts().config);
    checkRobots(file);
  });

// --- Schema subcommand ---
program
  .command("schema <file> <type>")
  .description("Generate JSON-LD structured data (article|faq|product)")
  .action((file, type, options, cmd) => {
    const { config } = loadConfig(cmd.parent.opts().config);
    const schema = generateSchemaData(file, type, config);
    console.log(JSON.stringify(schema, null, 2));
  });

// --- Inject subcommand ---
program
  .command("inject <file> <type>")
  .description("Generate and inject JSON-LD schema into file")
  .option("--dry-run", "Preview changes without writing")
  .option("--backup", "Create .bak file before modifying")
  .option("--no-branding", "Remove Tooltician branding (Pro license required)")
  .action((file, type, options, cmd) => {
    const { config } = loadConfig(cmd.parent.opts().config);
    const dryRun = options.dryRun || false;
    const backup = options.backup || false;
    const noBranding = options.noBranding || false;

    if (noBranding) {
      const entitlementError = getNoBrandingError(config);
      if (entitlementError) {
        console.error(`Error: ${entitlementError}`);
        process.exit(1);
      }
    }

    if (!assertWritableTargetInsideCwd(file)) {
      process.exit(1);
    }

    if (backup && !dryRun) {
      const backupPath = file + ".bak";
      if (!assertNewFileParentInsideCwd(backupPath)) {
        process.exit(1);
      }
      try {
        fs.copyFileSync(file, backupPath);
        console.log(`Backup created: ${backupPath}`);
      } catch (e) {
        console.error(`Error: Failed to create backup ${backupPath}: ${e.message}`);
        process.exit(1);
      }
    }

    injectSchema(file, type, config, { dryRun, noBranding });
    if (!dryRun) {
      recordSuccessfulFreeInjection(config);
    }
  });

// --- Config subcommand ---
const configCmd = program
  .command("config <action> <setting> [value]")
  .description("Manage local geo-opt preferences");

// Commander doesn't natively support action+setting+value as positional args
// with choices, so we handle validation in the action.
configCmd.action((action, setting, value, options, cmd) => {
  if (setting !== "reminders" || !["get", "set"].includes(action)) {
    console.error("Error: Usage: geo-opt config <get|set> reminders [true|false]");
    process.exit(1);
  }

  if (action === "get") {
    console.log(remindersAreEnabled() ? "true" : "false");
    return;
  }

  if (!["true", "false"].includes(value)) {
    console.error("Error: reminders must be true or false.");
    process.exit(1);
  }

  const enabled = value === "true";
  if (!setRemindersEnabled(enabled)) {
    console.error("Error: Could not save the local reminder preference.");
    process.exit(1);
  }
  console.log(`Support reminders ${enabled ? "enabled" : "disabled"}.`);
});

// --- Audit helper (stdout capture for JSON mode) ---
function auditFileJson(filepath, config) {
  const originalLog = console.log;
  const chunks = [];
  console.log = (message = "") => {
    chunks.push(String(message));
  };

  try {
    const score = auditFile(filepath, config, "json");
    const report = JSON.parse(chunks.join("\n"));
    return { score, report };
  } finally {
    console.log = originalLog;
  }
}

program.parse();
```

Key differences from the original:
- `--help` and `-h` are free — commander generates help from the option
  definitions and `.description()` calls.
- `--version` is free — commander adds `-V, --version`.
- `--config` is declared once on the program, accessed via
  `cmd.parent.opts().config` in each action.
- Option validation for `format` and `threshold` is kept manual to
  preserve the exact error messages (commander's built-in validation
  messages differ). This is intentional — it preserves the CLI contract.
- The `config` subcommand uses positional arguments for `action`,
  `setting`, and `value` — commander doesn't have native "nested
  subcommand with positional choices," so the validation stays in the
  action handler.

**Verify**: `node bin/cli.js --help` → prints auto-generated help text
listing all 5 subcommands and the `--config` option. `node bin/cli.js
--version` → prints `2.0.0`.

### Step 3: Verify all 17 CLI behaviors

Run each command from the Step 0 baseline and compare output:

```bash
# Behavior 1
node bin/cli.js

# Behavior 2
node bin/cli.js --help

# Behavior 3
node bin/cli.js audit --help

# Behavior 4-7: audit variations (use a real test file)
node bin/cli.js audit tests/fixtures/sample.md
node bin/cli.js audit tests/fixtures/sample.md --format json
node bin/cli.js audit tests/fixtures/sample.md --threshold 100  # expect exit 1 if score < 100

# Behavior 8-12: schema, inject variations
node bin/cli.js schema tests/fixtures/sample.md article
node bin/cli.js inject tests/fixtures/sample.md article --dry-run
# etc.

# Behavior 14-15: config
node bin/cli.js config get reminders
node bin/cli.js config set reminders true
```

**Verify**: All 17 commands produce output matching the baseline (modulo
cosmetic differences in help text formatting — commander's auto-generated
help looks different from the original hand-written help. That's expected
and acceptable. The key behaviors — exit codes, error messages, data output
— must match exactly.)

### Step 4: Update tests that invoke the CLI

Search `tests/optimizer.test.js` for references to `cliPath` or
`spawnSync` with `cli.js`. The existing tests likely invoke the CLI as a
subprocess. After the refactor, the subcommand flags may have different
parsing behavior. Run the tests:

```bash
npm test
```

If any test fails due to CLI flag parsing changes, investigate: the test
may be passing flags in a way that commander interprets differently than
`parseArgs`. Adjust the test — not the CLI behavior — to match the new
flag syntax, as long as the public CLI contract is preserved.

**Verify**: `npm test` → all tests pass.

### Step 5: Run full check

```bash
npm run check
```

**Verify**: exit 0.

### Step 6: Update changelog

Under `## [Unreleased]` / `### Changed`:

```markdown
- CLI: replaced manual argument parsing with commander (`bin/cli.js`).
  Auto-generated --help, --version support, and cleaner subcommand dispatch.
```

**Verify**: `npm run changelog:check` → exit 0.

## Test plan

- No new test file needed. The existing tests in `tests/optimizer.test.js`
  that exercise the CLI via subprocess spawning serve as regression tests.
- If any CLI subprocess test uses `parseArgs`-specific option syntax that
  commander handles differently, update the test to use the equivalent
  commander syntax.
- Manual smoke test: run all 17 behaviors from the baseline and confirm
  output matches.
- Verification: `npm test` → exit 0, `npm run test:python` → exit 0
  (Python parity unaffected).

## Done criteria

- [ ] `npm run check` exits 0
- [ ] `node bin/cli.js --help` prints help text with all 5 subcommands
- [ ] `node bin/cli.js --version` prints `2.0.0`
- [ ] `node bin/cli.js audit --help` prints audit-specific help
- [ ] All 17 CLI behaviors from the baseline produce equivalent output
  (same data, same exit codes)
- [ ] `wc -l bin/cli.js` reports fewer lines than the original 402
- [ ] `grep "from \"commander\"" bin/cli.js` returns one match
- [ ] `grep "parseArgs" bin/cli.js` returns no matches (commander replaces
  all `node:util.parseArgs` usage)
- [ ] No files outside in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `npm install commander` fails or commander does not load.
- Any of the 17 CLI behavior tests produces a different exit code than the
  baseline (cosmetic help text differences are fine; error messages, data
  output, and exit codes must match).
- `npm test` fails with a test that cannot be fixed by adjusting the
  subprocess invocation flags.
- The code at `bin/cli.js:1-402` does not match the structure described in
  "Current state" — the file may have been refactored since this plan was
  written.
- A test depends on `printHelp()` being callable as a function (it is
  removed in the refactor). If any test imports `printHelp`, it needs
  updating. Stop and note the test name.

## Maintenance notes

- The version string `"2.0.0"` in the `.version()` call must be kept in
  sync with `package.json`. Consider reading it dynamically:
  ```js
  import { readFileSync } from "fs";
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  program.version(pkg.version);
  ```
  This is optional — the plan uses the hardcoded version for simplicity.
- Commander's auto-generated help text uses a different format than the
  hand-written help. This is the expected trade-off: consistency and
  maintainability over custom formatting. If pixel-perfect help text
  formatting is required, commander's `.helpInformation()` can be
  overridden.
- The `--config` flag is accessed via `cmd.parent.opts().config` in each
  action. Commander v13 guarantees this pattern works across subcommand
  nesting. If a future major version changes the API, all action handlers
  need updating.
- New subcommands should follow the pattern established in this refactor:
  `.command("name <required> [optional]")`, `.description("...")`,
  `.option("--flag <val>", "...")`, `.action((reqd, opt, options, cmd) => {
  ... })`. Do not mix manual `parseArgs` with commander in the same file.
