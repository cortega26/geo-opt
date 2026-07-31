# Plan 033: Modernize supported runtimes and make quality gates risk-focused

> **Executor instructions**: Keep dependency changes minimal. Do not combine
> unrelated package upgrades with runtime support and gate hardening.
>
> **Drift check (run first)**:
> `git diff --stat f91fae7..HEAD -- package.json package-lock.json .github/workflows eslint.config.js tests src/validate.js src/integrity.js .agents/skills/geo-optimization/scripts/requirements.txt README.md AGENTS.md docs CHANGELOG.md`

## Status

- **Priority**: P1
- **Effort**: S–M
- **Risk**: LOW
- **Depends on**: none
- **Category**: dependencies / CI / tests
- **Planned at**: commit `f91fae7`, 2026-06-27
- **Status**: DONE

## Why this matters

The manifest and CI still target Node.js 20, which reached EOL on 2026-03-24.
Node 22 and 24 are supported LTS lines. Python dependencies are declared in
`requirements.txt`, but CI bypasses that file and installs unrestricted package
names directly. Global coverage is high while validation/integrity paths and
lint warnings remain weak gates.

## Current state

- `package.json:36-38` accepts Node `>=20`.
- `.github/workflows/ci.yml:23-27` tests only Node 20.
- `.agents/skills/geo-optimization/scripts/requirements.txt` declares
  `beautifulsoup4>=4.12` and `mistune>=3.0`.
- `.github/workflows/ci.yml:46-52` does not install from that file.
- `src/validate.js` has 11.6% statement coverage; `src/integrity.js` reports 0%
  function coverage.
- ESLint reports six warnings while `npm run check` succeeds.

## Commands

| Purpose    | Command                        | Expected                      |
| ---------- | ------------------------------ | ----------------------------- |
| Full check | `npm run check`                | exit 0, no lint warnings      |
| Coverage   | `npm run test:coverage`        | critical-path thresholds pass |
| Python     | `npm run test:python`          | 35+ tests pass                |
| Security   | `npm audit --audit-level=high` | exit 0                        |

## Scope

**In scope:** files in the drift check.

**Out of scope:** broad dependency modernization, Python packaging for PyPI,
runtime behavior redesign, scoring changes or release staging from plan 032.

## Steps

### 1. Set supported Node lines

Raise the minimum to Node 22 and test Node 22 plus Node 24 in CI. Keep one
canonical full-check job and use matrix jobs only where they add compatibility
evidence.

**Verify:** tests pass on both supported LTS lines.

### 2. Use one Python dependency declaration

Install CI dependencies from `requirements.txt`. Define compatible upper bounds
only where needed to prevent known breaking majors; do not freeze arbitrary
patch versions without a repeatability requirement.

**Verify:** a clean Python environment installs from the file and passes tests.

### 3. Cover validation and integrity behavior

Add behavior tests for JSON-LD validation outcomes and staged integrity success,
mismatch and unreadable-file failure. Prefer pure-result tests where plan 030
has landed; otherwise characterize current wrappers without expanding them.

**Verify:** critical functions execute in coverage and failure behavior is
asserted.

### 4. Make lint warnings actionable

Remove the six-warning baseline, configure lint to fail on new warnings, and
include Python syntax/compile checking without introducing a large tooling
stack.

**Verify:** `npm run lint` has zero warnings and non-zero exit on an intentional
unused-variable fixture/config test.

### 5. Update runtime documentation

Update README, AGENTS, architecture capability matrix, skill setup and
changelog.

**Verify:** no active documentation presents Node 20 as supported.

## Test plan

- Node 22 and 24 CI.
- Clean Python requirements install.
- JSON-LD validator valid, invalid and no-block cases.
- Integrity expected hash, mismatch and read failure.
- Zero-warning lint gate.

## Done criteria

- [ ] Node 20 is absent from active support declarations and CI.
- [ ] CI installs Python dependencies from the canonical requirements file.
- [ ] Validation and integrity critical behavior is tested.
- [ ] Lint passes with zero warnings and fails on new warnings.
- [ ] Full checks pass on supported runtimes.

## STOP conditions

- A production dependency requires Node 20 compatibility for a named consumer.
- Python upper bounds cannot be justified by compatibility evidence.
- Integrity testing requires the source-mutating build; coordinate with plan
  032 rather than reproducing that behavior.

## Maintenance notes

Review runtime support before each release and at least quarterly. Prefer
supported LTS lines over indefinitely broad engine ranges.
