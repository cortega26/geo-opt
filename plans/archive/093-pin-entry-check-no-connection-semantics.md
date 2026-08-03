# Plan 093: Pin the entry-check test's "no connection" semantics

> **Executor instructions**: Base your work on commit `e2211d9` (branch
> `advisor/092-harden-deadline-edges`) — create your branch FROM that commit,
> not from origin/main. The reviewer diffs against `e2211d9`. Do NOT update
> `plans/README.md` — the reviewer maintains the index.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: 092 (APPROVED at `e2211d9` on `advisor/092-harden-deadline-edges`)
- **Category**: tests
- **Planned at**: `92c81f2` (main; audited against `e2211d9`), 2026-08-03

## Why this matters

The H1 test added by Plan 092 (`timeout total: presupuesto agotado antes de
entrar lanza de inmediato`) comments that the entry-check throw fires
"without arming a timer or connecting", but its only assert (`elapsed < 50`)
does not verify that claim: a 1ms armed timer would produce the same message
and elapsed while still initiating a connection. The "does not touch the
network" property is the security-relevant half of the entry check (an
exhausted budget must not start connections) and it is currently unpinned.

## Finding (verified empirically against e2211d9 — the real 092 code)

Measured against `src/fetcher.js` at `e2211d9` with a mute local server:

- `timeoutMs: 1` → "Request total timeout after 1ms", elapsed 5ms,
  **0 connections registered** — the entry check throws, but the test does
  not assert the 0-connections fact.
- `timeoutMs: 0` → "Request total timeout after 0ms", elapsed 0ms,
  **0 connections** — deterministic: `deadlineMs = Date.now() + 0`, and the
  entry check runs at `Date.now() >= deadlineMs`, so `remaining <= 0`
  always. The check throws before DNS, agent creation, and request
  creation — no timer is armed, no connection is started, no
  `TimeoutNegativeWarning` (verified: none).

With `timeoutMs: 1` there is a theoretical nondeterminism window: on a very
fast machine the rate-limiter overhead could be < 1ms, letting the entry
check pass and the 1ms timer win — the connection would start and a
`sockets.size === 0` assert would flake. `timeoutMs: 0` eliminates the
window entirely (remaining is 0 or negative by construction).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Timeout/redirect tests | `node --test --test-name-pattern="timeout|redirect" tests/fetcher.test.js` | pass |
| Full fetcher | `node --test tests/fetcher.test.js` | pass |
| Full check | `npm run check` | exit 0 |

## Scope

**In scope**: `tests/fetcher.test.js` (the H1 test body, inside
`describe("fetchUrl — timeouts")`) and `CHANGELOG.md` (one Unreleased
bullet — REQUIRED by the repo's changelog policy: `CODE_PATH_PATTERNS` in
`scripts/check-changelog.js` includes `/^tests\/.*\.js$/`, enforced by
`npm run check` and the pre-commit hook; every prior test-touching commit —
073 `92af2d9`, 074 `e6e418d`, 092 `e2211d9` — carried a CHANGELOG.md
bullet).

**Out of scope**: `src/fetcher.js` (no behavior change — the entry check
already works), README badges (the test count does not change: 823 stays
823).

## Git workflow

- Base: `e2211d9` (`advisor/092-harden-deadline-edges`). If that branch no
  longer exists and `e2211d9` is an ancestor of HEAD (092 was merged), branch
  from HEAD instead.
- Branch: `advisor/093-pin-entry-check-semantics`
- Commit example: `test(fetcher): pin entry-check no-connection semantics`.

## Steps

### Step 1: Adjust the H1 test

In `tests/fetcher.test.js`, modify the test
`timeout total: presupuesto agotado antes de entrar lanza de inmediato`:

- `timeoutMs: 1` → `timeoutMs: 0`.
- Assertion regex `/Request total timeout after 1ms/` →
  `/Request total timeout after 0ms/`.
- Keep `assert.ok(elapsed < 50, ...)`.
- Add, after the elapsed assert:
  `assert.equal(s.sockets.size, 0, "el check de entrada no debe iniciar conexiones");`
  (`startServer` returns a handle whose `sockets` property is the Set of
  active server sockets — see the `startServer` definition at the top of the
  file).
- Update the comment: `timeoutMs: 0` makes the entry check deterministic —
  `deadlineMs = Date.now() + 0`, so `remaining <= 0` at entry always (same
  millisecond or one past it); the check throws before arming the timer or
  starting any connection. The `sockets.size === 0` assert pins the
  "exhausted budget does not touch the network" semantics (relevant to
  SSRF/resource-hold), which the elapsed assert alone cannot distinguish
  from a 1ms armed-timer abort.

**Verify**: `node --test --test-name-pattern="agotado antes de entrar" tests/fetcher.test.js` passes.

### Step 2: Add the required CHANGELOG bullet

Under `## [Unreleased]`, in the section holding the 077/092 bullets
(`### Fixed`), add one bullet in the repo's established style:
`- **test:** pin the entry-check no-connection semantics (Plan 093)`.

**Verify**: `npm run changelog:check` passes.

### Step 3: Verify the whole fetcher surface

**Verify**: `node --test tests/fetcher.test.js` passes (71 tests); then
`npm run check` exits 0 (823 tests — count unchanged; the CHANGELOG bullet
is what satisfies `check-changelog.js` for the `tests/` change).

## Test plan

- Adjusted H1: `timeoutMs: 0` → canonical message, `elapsed < 50`, and
  `sockets.size === 0` (new — the actual subject of this plan).
- All other 092 tests unchanged (H2 bounds, slow-chain, fast-chain).

## Done criteria

- [ ] H1 test asserts `sockets.size === 0` and passes with `timeoutMs: 0`.
- [ ] Test count stays 823; `npm run check` exits 0.
- [ ] Only `tests/fetcher.test.js` and `CHANGELOG.md` changed (one bullet).

## STOP conditions

- The message with `timeoutMs: 0` is not `Request total timeout after 0ms`
  (contract changed) → report before adjusting the regex.
- The `sockets.size === 0` assert flakes (something else connects to the
  test server) → report with the observed evidence; do not loosen it
  without a documented reason.

## Maintenance notes

This test pins the two observable halves of the entry check: timing
(sub-50ms — no timer survived) and connectivity (zero server-side
connections — no network attempt). A future change that moves the deadline
computation or adds work between the check and the request will break one of
the two asserts, which is the intent. Keep `timeoutMs: 0` (not 1) — it is
the deterministic regime; 1ms depends on the rate-limiter overhead being
larger than the budget, which is machine-dependent.
