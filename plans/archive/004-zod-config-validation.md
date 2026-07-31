# Plan 004: Add Zod schema validation for geo_config.json

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 4dff240..HEAD -- src/config.js tests/optimizer.test.js package.json`
> If any of these files changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (can execute in parallel with any other plan)
- **Category**: dx (robustness)
- **Planned at**: commit `4dff240`, 2026-06-26

## Why this matters

`geo_config.json` is the primary user-facing configuration file. It
controls author/publisher metadata for schema generation, acronym
definitions for the clarity check, product offer details, license keys, and
threshold overrides. Today, `loadConfig()` (`src/config.js:10-43`) does a
raw `JSON.parse()` with zero validation. Malformed configs — a number where
a string is expected, a list where an object is needed, a missing required
field — fail silently or produce confusing downstream errors deep in
`scoring.js` or `schema.js`.

**zod** (v4) is ~14KB gzipped with zero dependencies. It validates at
runtime and produces clear, localized error messages. For this project's
scale, a single schema definition (~40 lines) catches every config class
error before any business logic runs.

## Current state

### File: `src/config.js` — config loading with no validation

```js
export function loadConfig(configPath = null) {
  const searchPaths = [];
  if (configPath) {
    if (!fs.existsSync(configPath)) {
      console.error(`Error: Specified config file ${configPath} not found.`);
      process.exit(1);
      return;
    }
    searchPaths.push(configPath);
  } else {
    searchPaths.push(path.join(process.cwd(), "geo_config.json"));
    searchPaths.push(
      path.resolve(__dirname, "..", ".agents", "skills", "geo-optimization", "geo_config.json")
    );
  }

  for (const p of searchPaths) {
    if (fs.existsSync(p)) {
      try {
        const raw = fs.readFileSync(p, { encoding: "utf8", flag: "r" });
        return { config: JSON.parse(raw), configPath: p };
      } catch (e) {
        const message = `Failed to parse config at ${p}: ${e.message}`;
        if (configPath) {
          console.error(`Error: ${message}`);
          process.exit(1);
          return;
        }
        console.warn(`Warning: ${message}`);
      }
    }
  }

  return { config: {}, configPath: null };
}
```

After `JSON.parse(raw)` succeeds, the returned `config` object is passed
directly to every module. Downstream code assumes fields are the right
type:

- `src/scoring.js:228` — `config.limits?.max_pronoun_density` must be a
  number if present.
- `src/scoring.js:262` — `config.acronyms` is iterated with
  `for (const acr of filteredAcronyms)` and `acronymDict[acr]` is assumed
  to be a string.
- `src/schema.js:153-154` — `config.author` and `config.publisher` are
  assumed to be objects with `.name`, `.url`, etc. as strings.
- `src/schema.js:276` — `config.product?.offer` is assumed to have
  `.price` and `.priceCurrency` as strings/numbers.
- `src/licensing.js:6` — `config.license?.key` is assumed to be a string.

### File: `tests/optimizer.test.js` — test config fixture

The test config at lines 30-52 is valid and comprehensive. The test suite
does not currently exercise malformed config paths.

### Repo conventions

- ESM, double quotes, semicolons. (`AGENTS.md:107`)
- New source files go in `src/` and are re-exported from `src/index.js` if
  they are part of the public API.
- Config module is `src/config.js`; it exports `loadConfig` and
  `MAX_PRONOUN_DENSITY`.
- Error handling: `process.exit(1)` for fatal errors, `console.error` for
  the message, `console.warn` for non-fatal parse errors from fallback
  paths.
- Changelog policy enforced.

## Commands you will need

| Purpose       | Command                    | Expected on success                    |
|---------------|----------------------------|----------------------------------------|
| Install       | `npm install`              | exit 0                                 |
| Tests         | `npm test`                 | exit 0, all tests pass                 |
| Coverage      | `npm run test:coverage`    | exit 0                                 |
| Lint          | `npm run lint`             | exit 0                                 |
| Format check  | `npm run format:check`     | exit 0                                 |
| Full check    | `npm run check`            | exit 0                                 |

## Scope

**In scope** (the only files you should modify):
- `src/config.js` — add zod schema and validation call in `loadConfig()`
- `src/index.js` — optionally re-export the schema (useful for consumers of
  the library API)
- `tests/optimizer.test.js` — add tests for valid and invalid configs
- `CHANGELOG.md` — add Unreleased entry

**Out of scope** (do NOT touch, even though they look related):
- `src/scoring.js`, `src/schema.js`, `src/licensing.js` — these consume
  the validated config. Do not re-validate there; trust the config module.
- `bin/cli.js` — no changes to CLI.
- `.agents/skills/geo-optimization/geo_config.json` — the bundled config
  fixture is already valid. Leave it alone.
- TypeScript types — zod can infer TypeScript types, but this project is
  JavaScript. Do not add `.d.ts` files in this plan.

## Git workflow

- Branch: `advisor/004-zod-config-validation`
- Commit style: conventional commits. Example: `feat: add zod validation
  for geo_config.json`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 0: Baseline

```bash
npm run test:coverage
```

**Verify**: exits 0.

### Step 1: Install zod

```bash
npm install zod
```

**Verify**: `node -e 'import { z } from "zod"; console.log(typeof z.object)'` →
prints `function`. `grep '"zod"' package.json` returns a line in
`dependencies`.

### Step 2: Create the config schema

Add a new internal file `src/config-schema.js` (or add the schema directly
in `src/config.js` — the choice is yours; a separate file is cleaner but
adds a new module). For this plan, add it in `src/config.js` to keep the
config surface in one file.

At the top of `src/config.js`, add the zod import:

```js
import { z } from "zod";
```

Add the schema definition, placed after the `MAX_PRONOUN_DENSITY` export
and before `loadConfig()`:

```js
const offerSchema = z.object({
  price: z.union([z.string(), z.number()]).optional(),
  priceCurrency: z.string().optional(),
  availability: z.string().optional(),
});

const configSchema = z.object({
  author: z
    .object({
      name: z.string(),
      jobTitle: z.string().optional(),
      sameAs: z.string().optional(),
    })
    .optional(),
  publisher: z
    .object({
      name: z.string().optional(),
      url: z.string().optional(),
      logo: z.string().optional(),
    })
    .optional(),
  acronyms: z.record(z.string()).optional(),
  product: z
    .object({
      offer: offerSchema.optional(),
    })
    .optional(),
  license: z
    .object({
      key: z.string().optional(),
    })
    .optional(),
  licenseKey: z.string().optional(),
  datePublished: z.string().optional(),
  limits: z
    .object({
      max_pronoun_density: z.number().optional(),
    })
    .optional(),
});
```

Key validations:
- `author.name` must be a string if the `author` object is present.
- `acronyms` must be a flat `{string: string}` record — arrays or nested
  objects are rejected.
- `product.offer.price` accepts both string and number (users may write
  `"49.00"` or `49.00`).
- `license.key` and `licenseKey` are both accepted (the codebase checks
  both).
- Unknown top-level keys are allowed (zod strips them by default with
  `.passthrough()`? Actually, `z.object()` strips unknown keys. Add
  `.passthrough()` to allow forward-compat:

```js
const configSchema = z.object({...}).passthrough();
```

### Step 3: Add validation call in `loadConfig()`

In `loadConfig()`, after the successful `JSON.parse(raw)` (line 30), add
validation:

```js
const raw = fs.readFileSync(p, { encoding: "utf8", flag: "r" });
const parsed = JSON.parse(raw);
const result = configSchema.safeParse(parsed);
if (!result.success) {
  const issues = result.error.issues
    .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("\n");
  const message = `Invalid config at ${p}:\n${issues}`;
  if (configPath) {
    console.error(`Error: ${message}`);
    process.exit(1);
    return;
  }
  console.warn(`Warning: ${message}`);
  return { config: {}, configPath: null };
}
return { config: result.data, configPath: p };
```

Key behavior:
- When the user explicitly passes `--config`, invalid config is fatal
  (`process.exit(1)`) — they asked for this file, so errors must be fixed.
- When using the default search path, invalid config is a warning — the
  tool falls back to empty config (preserving existing behavior for the
  fallback path).
- `result.data` contains the validated and stripped config object. Unknown
  keys are preserved via `.passthrough()`.

**Verify**: `npm test` → all existing tests pass (the test config fixture
is valid and passes validation).

### Step 4: Add validation tests

Add these tests to `tests/optimizer.test.js`:

**Test 1**: Valid config passes:

```js
test("loadConfig validates a correct config without warnings", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "geo-test-"));
  const configPath = path.join(tmpDir, "geo_config.json");
  const validConfig = {
    author: { name: "Test Author", jobTitle: "Writer" },
    publisher: { name: "Test Corp", url: "https://example.com" },
    acronyms: { "API": "Application Programming Interface" },
    product: { offer: { price: "49.00", priceCurrency: "USD" } },
  };
  fs.writeFileSync(configPath, JSON.stringify(validConfig));
  const { config } = loadConfig(configPath);
  assert.strictEqual(config.author.name, "Test Author");
  assert.strictEqual(config.acronyms["API"], "Application Programming Interface");
  fs.rmSync(tmpDir, { recursive: true });
});
```

**Test 2**: Invalid config with explicit path exits:

```js
test("loadConfig exits on invalid config when path is explicit", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "geo-test-"));
  const configPath = path.join(tmpDir, "geo_config.json");
  const invalidConfig = {
    author: { name: 12345 },  // name must be a string
  };
  fs.writeFileSync(configPath, JSON.stringify(invalidConfig));
  // loadConfig calls process.exit(1) on explicit invalid config.
  // We test by spawning a subprocess.
  const result = spawnSync("node", ["-e", `
    import { loadConfig } from "./src/config.js";
    loadConfig("${configPath}");
  `], { cwd: repoRoot, encoding: "utf8" });
  assert.notStrictEqual(result.status, 0);
  fs.rmSync(tmpDir, { recursive: true });
});
```

**Test 3**: Invalid config on fallback path warns but does not exit:

```js
test("loadConfig returns empty config on invalid fallback file", () => {
  // This test verifies the warning path: by placing an invalid config in
  // cwd and not passing --config explicitly, loadConfig should warn and
  // return empty config.
  const originalCwd = process.cwd;
  // ... (complex to test due to cwd dependency; skip if too invasive)
  // Focus on Test 1 and Test 2 as the primary coverage.
});
```

(If the cwd manipulation for Test 3 is too invasive, skip it. The two
tests above provide sufficient coverage.)

**Verify**: `npm test` → all tests pass, including the new validation
tests.

### Step 5: Run full check

```bash
npm run check
```

**Verify**: exit 0.

### Step 6: Update changelog

Under `## [Unreleased]` / `### Added`:

```markdown
- Config validation: `geo_config.json` is validated with zod on load,
  producing clear error messages for type mismatches and missing fields.
```

**Verify**: `npm run changelog:check` → exit 0.

## Test plan

- Test 1: Valid comprehensive config passes validation and returns parsed
  data.
- Test 2: Invalid config (wrong type for a field) with `--config` causes
  process exit.
- Structural pattern: use `fs.mkdtempSync` + `fs.writeFileSync` to create
  temporary config files, then `fs.rmSync` for cleanup. Follow the patterns
  in `tests/optimizer.test.js` (search for `mkdtempSync` in the file to
  find the convention).
- Verification: `npm test` → exit 0.

## Done criteria

- [ ] `npm run check` exits 0
- [ ] `node -e 'import {z} from "zod"'` loads without error
- [ ] `grep "configSchema.safeParse" src/config.js` returns one match
- [ ] `npm test` exits 0; new validation tests pass
- [ ] Invalid config with explicit `--config` path produces stderr message
  and exits non-zero (verified via subprocess test)
- [ ] No files outside in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `npm install zod` fails or zod does not load as ESM.
- Adding validation to `loadConfig()` breaks any existing test that relies
  on an unvalidated config shape — the test fixture at
  `tests/optimizer.test.js:30-52` must pass validation. If it does not, the
  schema definition needs adjustment, not the test.
- The subprocess test for invalid config exits 0 instead of non-zero
  (validation is not being enforced).
- The code at `src/config.js:10-43` does not match the excerpt in "Current
  state" (codebase drifted).

## Maintenance notes

- If new top-level config fields are added (e.g., a `settings` section in a
  future feature), the zod schema must be updated in the same PR. The
  `.passthrough()` call ensures unknown fields don't break parsing, but
  known fields get validated.
- Zod v4 is ESM-first. This project is `"type": "module"`, so the import
  works natively. If the project ever adds a CommonJS entry point, zod
  would need a dynamic `import()` wrapper there.
- The schema is intentionally defined in `src/config.js` rather than a
  separate file. If it grows beyond ~50 lines, extract it to
  `src/config-schema.js` and re-export from `src/index.js` for library
  consumers who want to validate their own configs programmatically.
- Validation error messages are user-facing. Keep them in English (matching
  the existing CLI language). If i18n is ever added, zod error messages can
  be customized via the `errorMap` option.
