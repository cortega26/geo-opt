# Architecture and runtime parity

The modular JavaScript implementation under `src/` is the canonical runtime for
the `geo-opt` command-line interface and library. A Python 3 implementation is
bundled with the GEO agent skill for agent-driven workflows. Shared behavior
must remain functionally aligned unless a documented language or deployment
constraint requires a difference.

## Runtime responsibilities

| Area                                   | Canonical JavaScript module               |
| -------------------------------------- | ----------------------------------------- |
| CLI orchestration                      | `bin/cli.js` using Commander              |
| Configuration and validation           | `src/config.js`                           |
| Content discovery and ignore rules     | `src/discovery.js`                        |
| Text extraction and normalization      | `src/text.js`                             |
| Heuristic scoring                      | `src/scoring.js`                          |
| Batch audits and injection             | `src/batch.js`                            |
| Schema generation and injection        | `src/schema.js`                           |
| JSON-LD validation                     | `src/validate.js`                         |
| Crawler policy audit                   | `src/robots.js`                           |
| `llms.txt` and `robots.txt` generation | `src/llms-txt.js`                         |
| Commercial entitlement checks          | `src/licensing.js` and `src/integrity.js` |
| Local support preferences              | `src/engagement.js`                       |
| Public library exports                 | `src/index.js` and `index.d.ts`           |

The Python parity implementation lives at
`.agents/skills/geo-optimization/scripts/geo_optimizer.py`.

## Why JavaScript is canonical

1. `bin/cli.js` is the package CLI entry point.
2. `src/index.js` is the public JavaScript API entry point.
3. `npm run check` verifies lint, formatting, JavaScript tests, Python parity,
   and changelog policy in one command.
4. The npm package allowlist includes only runtime code, type declarations,
   public documentation, and license files.

## Parity contract

Changes in the following areas require an explicit JavaScript/Python parity
decision:

- configuration search paths and validation;
- Markdown and HTML normalization;
- all five scoring dimensions and report fields;
- file discovery, ignore behavior, and recursive workflows;
- `robots.txt` parsing and crawler registry changes;
- schema generation, metadata opt-in rules, and safe injection;
- batch behavior, aggregate reports, and machine-readable output;
- `llms.txt` generation and audit behavior;
- branding and commercial entitlement policy.

Parity means equivalent observable behavior, not identical internal code.

## Intentional differences

- JavaScript uses Commander; Python uses `argparse`.
- JavaScript returns objects where Python may use tuples or dictionaries that
  better fit Python conventions.
- JavaScript resolves the bundled skill directory as a configuration fallback;
  Python resolves paths relative to its script location.
- The JavaScript package exposes a typed library API. The Python script is a
  CLI-oriented parity port rather than a separately supported package.

## Verification

```bash
npm run check
npm pack --dry-run --json
git diff --check
```

For changes that affect shared behavior, add equivalent regression coverage to
`tests/optimizer.test.js` and
`.agents/skills/geo-optimization/scripts/test_optimizer.py`.
