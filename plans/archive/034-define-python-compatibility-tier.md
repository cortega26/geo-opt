# Plan 034: Define and enforce the Python compatibility tier

> **Executor instructions**: Node.js remains canonical. Do not port every Node
> feature by default. First define the supported capability matrix, then enforce
> only the commitments approved by that matrix.
>
> **Drift check (run first)**:
> `git diff --stat f91fae7..HEAD -- docs/architecture.md AGENTS.md README.md .agents/skills/geo-optimization/SKILL.md .agents/skills/geo-optimization/scripts/geo_optimizer.py .agents/skills/geo-optimization/scripts/test_optimizer.py .agents/skills/geo-optimization/scripts/requirements.txt tests/fixtures src/index.js index.d.ts CHANGELOG.md`

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans 029, 031 and 033
- **Category**: architecture / compatibility
- **Planned at**: commit `f91fae7`, 2026-06-27
- **Status**: DONE (landed 2026-06-27)

## Why this matters

Before the 2026-06-27 documentation reconciliation, public guidance claimed
identical results and showed Python v2 flags that the parser rejects. The docs
now describe the observed matrix, but tests and review automation do not yet
enforce a formal tier. Python is a 2,609-line CLI port with 35 tests; Node has
v2, profiles, technical audits and a typed library surface that Python does
not.

## Current state

The current verified matrix is:

| Capability                                      | Node         | Python |
| ----------------------------------------------- | ------------ | ------ |
| Legacy v1 audit, batch and threshold            | yes          | yes    |
| Shared v1 finding contract on reference fixture | yes          | yes    |
| V2 profiles/readiness                           | yes          | no     |
| Pure technical HTML audit                       | yes, library | no     |
| Schema generation/injection                     | yes          | yes    |
| JSON-LD validation command                      | yes          | no     |
| robots audit/generation                         | yes          | yes    |
| llms.txt generation/audit                       | yes          | yes    |
| Config/reminders/licensing convenience gate     | yes          | yes    |
| Typed public library API                        | yes          | no     |

The matrix is descriptive, not an approval of permanent scope.

## Commands

| Purpose       | Command                      | Expected                         |
| ------------- | ---------------------------- | -------------------------------- |
| Python tests  | `npm run test:python`        | all pass                         |
| Cross-runtime | new conformance command      | all committed capabilities match |
| Full check    | `npm run check`              | exit 0                           |
| Docs          | documented commands executed | expected exit/output             |

## Scope

**In scope:** files in the drift check and shared conformance fixtures.

**Out of scope:** PyPI publication, full v2 port without an approved capability
decision, technical remote fetching or maintaining identical internal code.

## Steps

### 1. Approve a capability matrix

For each command/contract choose one of:

- `equivalent`: observable output contract must match;
- `compatible`: same user outcome with documented shape/CLI differences;
- `Node-only`: intentionally unsupported in Python;
- `deprecated`: Python surface scheduled for removal.

Record rationale and expected users. Prefer Node-only for new capabilities
unless Python solves a demonstrated environment constraint.

**Verify:** architecture docs contain no blanket “identical results” claim.

### 2. Build golden conformance fixtures

For `equivalent` capabilities, execute both runtimes against shared fixtures
and compare normalized JSON. Normalize only nondeterministic fields such as
timestamps and absolute paths.

**Verify:** changing a committed report field in one runtime fails conformance.

### 3. Align or explicitly document divergences

Fix high-value mismatches inside the approved tier. Remove unsupported Python
commands from examples; never document flags before executable support exists.

**Verify:** every command in the skill guide is covered by a CLI smoke test.

### 4. Make parity decisions part of change review

Add a checklist/contract test so a new Node capability requires an explicit
matrix decision, not necessarily a Python port.

**Verify:** docs and tests fail review if a capability status is missing.

### 5. Define retirement criteria

Document when Python should be reduced or retired: Node available in target
agent environments, negligible usage, or maintenance cost exceeding measured
portability value. Do not remove it in this plan without evidence and a
migration notice.

## Test plan

- Shared v1 audit/finding JSON.
- Schema, robots and llms representative fixtures.
- Config/error behavior where declared equivalent.
- CLI smoke tests for every documented Python command.
- Node-only v2/technical documentation assertions.

## Done criteria

- [x] Every public capability has one explicit tier status.
- [x] Equivalent capabilities use shared golden conformance tests.
- [x] Skill and README commands match executable parsers.
- [x] New Node features require a parity decision, not automatic duplication.
- [x] Retirement criteria and review cadence are documented.

## STOP conditions

- A runtime difference cannot be normalized without hiding meaningful behavior.
- Porting v2 is proposed without evidence that Python users need it.
- Removing Python would strand a named workflow without migration.

## Maintenance notes

The capability matrix is the source of truth. Similar filenames, tests or
function names do not establish parity.
