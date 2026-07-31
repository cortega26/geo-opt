# Engineering audit findings

This register preserves the findings from the deep repository audit performed
on June 25, 2026. It describes the current working tree, including changes
made after the original audit.

Status meanings:

- **Resolved**: the audited problem has been addressed and covered by tests or
  package verification.
- **Partial**: meaningful work landed, but part of the original risk remains.
- **Open**: the finding still needs implementation.

## Findings

| # | Finding | Impact | Status | Current position |
|---|---|---:|---|---|
| 1 | Silent Tooltician/Carlos identity attribution for unconfigured users | High | Resolved | Unconfigured schema omits author and publisher claims. Free injected output uses neutral, disclosed Tooltician branding instead. |
| 2 | Lexical path checks allow symlink writes outside the working directory | High | Resolved | JS and Python now authorize filesystem real paths before injection writes and backup creation, with regression tests for symlink targets outside the working directory. |
| 3 | Generated structured data invents publication dates, product prices, availability, and identity placeholders | High | Resolved | These properties are now opt-in and are emitted only when configured. |
| 4 | Batch and thresholded `--format json` output is not one valid JSON document | High | Resolved | CLI JSON mode now emits one parseable object or array on `stdout`; threshold diagnostics stay on `stderr`, including failing threshold exits. |
| 5 | Invalid schema types and malformed explicit configuration can fail silently | Medium–High | Resolved | Unsupported schema types are rejected, and explicitly supplied malformed configs now fail closed in both runtimes. |
| 6 | HTML metadata extraction and JSON-LD replacement are incomplete | Medium–High | Resolved | HTML descriptions are extracted from meta descriptions or paragraphs, and JSON-LD replacement accepts normal quoted or unquoted `type` attributes. |
| 7 | The robots audit reports unrelated crawlers and does not implement rule precedence | Medium | Resolved | Robots parsing now evaluates known AI crawlers plus wildcard groups and applies root-level `Allow`/`Disallow` precedence. |
| 8 | Public CLI contracts and JS/Python parity lack sufficient automated coverage | High | Resolved | Added CLI contract tests, robots assertions, scoring assertions, symlink security tests, HTML replacement tests, malformed-config tests, and Python parity in `npm run check`. |
| 9 | npm publishes development and unrelated repository content | Medium | Resolved | `package.json#files` now limits the package to runtime code, README, and license documents. Dry-run packaging verifies the allowlist. |
| 10 | The 0–100 score is presented more scientifically than its calibration supports | High | Resolved | Public docs now describe the score as an uncalibrated heuristic inspired by the GEO framework, not a guaranteed ranking or citation predictor. |
| 11 | Architecture, roadmap, and licensing documentation drift from repository state | Medium | Resolved | Verification and implementation docs now reflect the current modular JS/Python setup, and roadmap files are no longer ignored as disposable local artifacts. |

## Recommended execution order

All tracked findings in this register have been resolved in the current working
tree. Future audits should start from new evidence rather than this historical
execution order.

## Verification baseline

The repository currently provides:

- `npm run check` for JavaScript lint, formatting, and tests;
- `python3 .agents/skills/geo-optimization/scripts/test_optimizer.py` for the
  Python port;
- `npm pack --dry-run --json` for package-content verification.

This file should be updated when a finding changes status. New findings should
include reproducible evidence, impact, effort, fix risk, and verification
criteria.
