# CLAUDE.md — geo-opt

## Project

`geo-opt` is a zero-dependency CLI tool for Generative Engine Optimization
(GEO). It audits Markdown/HTML content and scores it 0–100 based on the
Princeton GEO framework (KDD 2024). It also generates and injects JSON-LD
Schema.org structured data and audits robots.txt for AI crawler access.

## Architecture

- **Two implementations** of the same logic:
  - `src/optimizer.js` (705 lines) — JavaScript/Node.js ESM, published as npm
    package `geo-opt`
  - `.agents/skills/geo-optimization/scripts/geo_optimizer.py` (672 lines) —
    Python 3, used by the agent skill defined in `SKILL.md`
- **CLI entry point**: `bin/cli.js` (90 lines) — manual argv parsing
- **Tests**: `tests/optimizer.test.js` (5 tests, node:test) +
  `.agents/skills/geo-optimization/scripts/test_optimizer.py` (6 tests,
  unittest)

## Commands

| Purpose | Command |
|---------|---------|
| Test (JS) | `npm test` |
| Test (Python) | `python3 .agents/skills/geo-optimization/scripts/test_optimizer.py` |
| Lint | `npm run lint` |
| Format check | `npm run format:check` |
| Format apply | `npm run format` |
| Full check | `npm run check` |
| Run CLI | `node bin/cli.js <command> [args]` |

## Conventions

- JS: ESM, camelCase, double quotes, semicolons, `process.exit(1)` on errors
- Python: snake_case, `sys.exit(1)` on errors, `print(..., file=sys.stderr)`
- Error pattern: `console.error`/`print(stderr)` + `process.exit(1)`/`sys.exit(1)`
- Output functions write to stdout; core functions return data
- Config loaded from `geo_config.json` in CWD or `.agents/` fallback

## Implementation plans

See `plans/README.md` for the current improvement roadmap. Execute plans in
order. All plans are authored for executor models with zero context — read
each plan fully before starting.
