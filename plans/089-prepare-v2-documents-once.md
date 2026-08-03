# Plan 089: Prepare each v2 document once per audit

> **Executor instructions**: Introduce one prepared-document representation and
> preserve all report fields/scores byte-for-byte except timestamps. Do not cache
> across files or calls.
>
> **Drift check (run first)**: `git diff --stat 888d3e7..HEAD -- src/scoring-v2.js src/observations.js src/profiles.js src/text.js index.d.ts tests/scoring-v2.test.js tests/observations.test.js tests/profiles.test.js plans/README.md`

## Status

- **Priority**: P3
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: plans/088-make-stat-attribution-linear.md
- **Category**: performance / architecture
- **Planned at**: commit `0006bb1`, 2026-08-03 (reconciled — line refs verified current)

## Why this matters

One v2 audit preprocesses/parses the same document through scoring, profile
detection, observations, and `observeAndParse`; HTML extraction and Markdown
lexing can happen multiple times. A per-call prepared representation reduces
CPU/allocation cost and gives detectors one consistent view of content.

## Current state

- `scoreContentV2` preprocesses at `src/scoring-v2.js:729-737`, then separately
  calls `resolveProfile` and `observeContent`.
- `observeAndParse` preprocesses/lexes at `src/observations.js:1059-1070`, then
  calls `observeContent` at line 1072, which repeats parsing.
- `observeContent` builds text/tokens/html metadata before calling all detectors
  at `src/observations.js:1020-1049`.
- Public APIs `observeContent` and `observeAndParse` must remain compatible.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| V2 | `node --test tests/scoring-v2.test.js tests/observations.test.js tests/profiles.test.js` | pass |
| Types | `npm run typecheck` | exit 0 |
| Full | `npm run check` | exit 0 |

## Scope

**In scope**: v2 preparation/parsing flow, affected internal/public types and
tests, a deterministic parse-count/perf regression, `CHANGELOG.md`,
`plans/README.md`.

**Out of scope**: changing detectors/thresholds/scores, cross-call caching,
worker threads, or v1/Python parity expansion.

## Git workflow

- Branch: `advisor/089-prepare-v2-once`
- Commit example: `perf(v2): reuse prepared document state`.

## Steps

### Step 1: Characterize reports and parse counts

For representative Markdown and HTML fixtures, normalize generated timestamps
and snapshot/compare complete reports. Add injectable counters around
preprocess, HTML extraction, and lexing to prove current repeated work without
monkey-patching module imports globally.

**Verify**: report characterization passes; counter test records the pre-change
baseline.

### Step 2: Introduce a prepared-document value

Create an internal function returning raw content, normalized visible text,
tokens, HTML metadata/type, filepath, and any load-bearing parse products.
Allow `observeContent`, `observeAndParse`, and profile resolution to consume it
internally while preserving their public raw-string signatures through thin
adapters.

**Verify**: typecheck and focused unit tests pass after each adapter migration.

### Step 3: Route scoreContentV2 through one preparation

Prepare once at entry, then pass the same immutable value to profile detection,
observations, and clarity scoring. Do not retain it after the call or expose raw
content in reports.

**Verify**: parse counters show one relevant preparation per document; normalized
reports and every corpus expectation are unchanged.

### Step 4: Record and run gates

Add an Unreleased Performance/Changed bullet.

**Verify**: focused suites, full check, typecheck, and diff check pass.

## Test plan

- Markdown, HTML, malformed-but-tolerated input, profile override/auto,
  direct `observeContent`, direct `observeAndParse`, and full 32-fixture corpus.
- Parse-count assertions, not brittle wall-time thresholds.

## Done criteria

- [ ] One v2 audit prepares/parses each required representation once.
- [ ] Public observation/profile APIs remain source-compatible.
- [ ] Normalized reports and all fixture scores are identical.
- [ ] No cross-call/raw-content cache is introduced; full checks pass.

## STOP conditions

- A detector depends on a subtly different normalized representation.
- Any report/fixture score changes.
- Sharing requires mutable parse state or raw content retention beyond one call.

## Maintenance notes

The prepared value is an internal per-call boundary, not a public AST. Future
detectors should consume it rather than re-running preprocess/parsers.
