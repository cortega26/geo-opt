# Plan 079: Honor the public fetcher userAgent option

> **Executor instructions**: Thread the option through every redirect and
> robots fetch. Preserve the default constant for callers that omit it.
>
> **Drift check (run first)**: `git diff --stat 888d3e7..HEAD -- src/fetcher.js index.d.ts tests/fetcher.test.js plans/README.md`

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/073-make-fetcher-tests-hermetic.md
- **Category**: bug / public-api
- **Planned at**: commit `888d3e7`, 2026-08-02

## Why this matters

The public API declares `userAgent`, but runtime destructuring ignores it and
all requests send the constant `USER_AGENT`. Consumers cannot identify their
auditor or align the HTTP header with robots evaluation as promised.

## Current state

- `index.d.ts:933-934` and `src/fetcher.js:697` document `userAgent`.
- `fetchUrl` destructures only allow flags, timeout, and size at lines 700-706.
- `performRequest` hard-codes `USER_AGENT` at line 463.
- `fetchRobotsTxt` forwards its options to `fetchUrl` at lines 594-604.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused | `node --test --test-name-pattern="User-Agent|userAgent|redirect" tests/fetcher.test.js` | pass |
| Types | `npm run typecheck` | exit 0 |
| Full | `npm run check` | exit 0 |

## Scope

**In scope**: `src/fetcher.js`, tests, declaration/JSDoc only if clarification
is needed, `CHANGELOG.md`, `plans/README.md`.

**Out of scope**: changing the default user-agent string, robots selection API,
or adding arbitrary headers.

## Git workflow

- Branch: `advisor/079-fetcher-user-agent`
- Commit example: `fix(fetcher): honor custom user agent`.

## Steps

### Step 1: Add local header regressions

Have a local server echo/request-record the header. Cover default, custom value,
redirect chain, and `fetchRobotsTxt`.

**Verify**: focused tests fail for custom values before implementation.

### Step 2: Thread and validate the option

Destructure `userAgent = USER_AGENT` in `fetchUrl`, pass it into every
`performRequest` hop, and use it for the header. Reject CR/LF or invalid header
values with a clear error before connection; do not permit header injection.

**Verify**: focused tests pass; CR/LF value is rejected and server request count
remains zero.

### Step 3: Record and run gates

Add an Unreleased Fixed bullet.

**Verify**: `npm run typecheck && npm run check && git diff --check` -> exit 0.

## Test plan

- Default constant; custom header; redirect preservation; robots fetch;
  malicious newline; empty string policy.

## Done criteria

- [ ] Every hop sends the requested valid user-agent.
- [ ] Omitted option sends the existing default.
- [ ] Header injection is rejected before network I/O.
- [ ] Type/full checks pass; scoped files only.

## STOP conditions

- Node accepts an unsafe header value that cannot be validated consistently.
- Honoring the option would require exposing arbitrary headers.
- Redirect propagation conflicts with Plan 075's policy object; coordinate the
  internal option shape instead of duplicating it.

## Maintenance notes

Future retry/redirect helpers must preserve request identity. Review the value
as an HTTP header, not as a robots user-agent token parser.
