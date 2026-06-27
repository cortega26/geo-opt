# AGENTS.md — geo-opt

Canonical instructions for AI coding agents working in this repository.
`CLAUDE.md` is intentionally kept as a compatibility pointer to this file.

## Project

`geo-opt` is a source-available CLI tool for Generative Engine Optimization
(GEO). It provides a legacy 0–100 heuristic and an experimental,
profile-aware v2 model characterized against repository fixtures. Neither is a
ranking or citation predictor. The project also generates, injects, and
validates JSON-LD Schema.org structured data; audits `robots.txt`; and supports
`llms.txt`, batch, and CI workflows.

Current releases are source-available under the Tooltician Community License
1.0, with separate commercial licensing for branding-free use.

## Architecture

- `src/` contains the JavaScript/Node.js ESM implementation published as the
  npm package `geo-opt`.
  - `scoring.js` handles legacy v1 scoring.
  - `scoring-v2.js`, `profiles.js`, and `observations.js` implement the
    experimental profile-aware model.
  - `findings.js` and `evidence.js` define report findings and evidence metadata.
  - `technical.js` exposes the pure local technical HTML audit.
  - `schema.js` generates Schema.org JSON-LD.
  - `text.js` extracts and normalizes content.
  - `robots.js` audits AI crawler access.
  - `config.js` loads local configuration.
  - `licensing.js` handles Community/Pro entitlement checks.
  - `engagement.js` handles local, non-blocking support reminders.
  - `index.js` exports the public API.
- `bin/cli.js` is the CLI entry point and uses Commander.
- `.agents/skills/geo-optimization/` contains the bundled GEO optimization
  agent skill.
- `.agents/skills/geo-optimization/scripts/geo_optimizer.py` is the Python 3
  compatibility port used by the bundled skill.
- `tests/` contains Node.js tests using `node:test`.
- `.agents/skills/geo-optimization/scripts/test_optimizer.py` contains Python
  compatibility and cross-runtime tests using `unittest`.

Node.js is canonical. The capability matrix in `docs/architecture.md` defines
which behavior is equivalent, compatible or Node-only. A new Node capability
requires an explicit matrix decision, not automatic duplication in Python.

## Commands

| Purpose          | Command                                                             |
| ---------------- | ------------------------------------------------------------------- |
| Test JavaScript  | `npm test`                                                          |
| Test Python port | `python3 .agents/skills/geo-optimization/scripts/test_optimizer.py` |
| Lint             | `npm run lint`                                                      |
| Format check     | `npm run format:check`                                              |
| Format apply     | `npm run format`                                                    |
| Changelog policy | `npm run changelog:check`                                           |
| Full check       | `npm run check`                                                     |
| Run CLI          | `node bin/cli.js <command> [args]`                                  |
| Package preview  | `npm pack --dry-run --json`                                         |

Before handing off code changes, run checks proportional to the risk. For most
changes, prefer `npm run check`, the Python port test, and `git diff --check`.

The manifest still accepts Node.js 20, but that runtime is EOL. Use Node.js 22
or 24 LTS for development until plan 033 updates the supported range and CI.

## CodeGraph

This project has a CodeGraph MCP server (`codegraph_*` tools) configured.
CodeGraph is a tree-sitter-parsed knowledge graph of every symbol, edge, and
file. Reads are sub-millisecond and return structural information grep cannot.

### When to prefer CodeGraph over native search

Use CodeGraph for structural questions: what calls what, what would break,
where a symbol is defined, and a symbol's signature. Use native search only for
literal text queries, comments, log messages, or after a specific file is
already open.

| Question                                      | Tool                |
| --------------------------------------------- | ------------------- |
| Where is `X` defined? / Find symbol named `X` | `codegraph_search`  |
| What calls function `Y`?                      | `codegraph_callers` |
| What does `Y` call?                           | `codegraph_callees` |
| How does `X` reach or become `Y`?             | `codegraph_trace`   |
| What would break if I changed `Z`?            | `codegraph_impact`  |
| Show me `Y`'s signature/source/docstring      | `codegraph_node`    |
| Give me focused context for a task/area       | `codegraph_context` |
| See related symbols' source together          | `codegraph_explore` |
| What files exist under `path/`?               | `codegraph_files`   |
| Is the index healthy?                         | `codegraph_status`  |

Rules of thumb:

- Answer directly; do not delegate CodeGraph exploration to another agent.
- For architecture or "how does this work?" questions, start with
  `codegraph_context`, then use one focused `codegraph_explore` call for the
  relevant source.
- For flow questions, start with `codegraph_trace` from source to destination,
  then use one focused `codegraph_explore` call for the bodies.
- Do not rebuild call paths with `codegraph_search` plus manual caller loops
  when `codegraph_trace` can answer the path.
- Trust CodeGraph results for structural lookup. Do not re-check the same
  symbol discovery with grep.
- Do not grep first when looking up symbols by name.
- Do not loop `codegraph_node` over many symbols; use `codegraph_explore`.
- The index can lag file edits by about a second. Avoid immediate re-querying
  after edits in the same turn.

If `.codegraph/` does not exist or CodeGraph reports "not initialized," ask:
"I notice this project doesn't have CodeGraph initialized. Want me to run
`codegraph init -i` to build the index?"

## Conventions

- JavaScript: ESM, camelCase, double quotes, semicolons.
- Python: snake_case, `sys.exit(1)` on fatal CLI errors, and
  `print(..., file=sys.stderr)` for diagnostics.
- CLI errors should write to stderr and exit non-zero.
- Output functions write user-requested data to stdout; core functions return
  data instead of printing.
- Config loads from `geo_config.json` in the current working directory, with a
  neutral `.agents/` fallback for skill usage.
- Free injection includes neutral Tooltician branding; `--no-branding` requires
  a locally configured Pro key.
- Community support reminders must stay local-only, non-blocking,
  automation-safe, no more than weekly, and user-disableable through
  `geo-opt config set reminders false`.
- Never infer author, publisher, publication date, price, or availability for
  generated structured data.
- Preserve unrelated working-tree changes. Do not stage or commit files that are
  outside the user's requested scope.

## Changelog policy

Every code, test, or package-behavior change must update the `Unreleased`
section of `CHANGELOG.md`. CI and `npm run check` enforce this through
`npm run changelog:check`.

Use concise bullets grouped under Keep a Changelog-style sections such as
`Added`, `Changed`, `Fixed`, `Security`, and `Docs`.

## Documentation governance

`docs/documentation-governance.md` defines document classes, sources of truth,
invariants, public contracts and update triggers. Apply it to every behavior or
documentation change.

Key rules:

- `plans/README.md` is the maintainer-local source of truth for current
  execution order; active plan files are handoffs and `plans/archive/` is
  historical evidence.
- Runtime behavior and tests outrank prose when they disagree.
- CLI changes require review of README, bundled skill, capability matrix, tests
  and changelog.
- Public export/report changes require synchronized `src/index.js`,
  `index.d.ts`, contract tests and architecture documentation.
- Python support claims must match the capability matrix and executable tests.
- Do not modernize archived plans or changelog entries as if they were current;
  add a dated correction or supersession note instead.

## Licensing and product policy

- Community use is source-available under `LICENSE`.
- Commercial terms live in `COMMERCIAL-LICENSE.md`.
- Historical MIT context lives in `LICENSE-HISTORY.md` and
  `LEGACY-MIT-LICENSE`.
- Be careful not to reintroduce silent personal attribution for unconfigured
  users.
- Paid/Pro positioning should focus on professional value: branding-free output,
  stronger validation, reporting, workflow integrations, and support.
