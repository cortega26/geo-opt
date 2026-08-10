# Plan 077: Make timeoutMs cover the complete redirect transaction

> **Executor instructions**: Measure one deadline from public `fetchUrl` entry
> through the final body. Do not reset it per redirect. Update the index when done.
>
> **Drift check (run first)**: `git diff --stat 888d3e7..HEAD -- src/fetcher.js index.d.ts tests/fetcher.test.js plans/README.md`

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/073-make-fetcher-tests-hermetic.md
- **Category**: bug / security
- **Planned at**: commit `0006bb1`, 2026-08-03 (reconciled; 073 DONE)

## Why this matters

`timeoutMs` is documented as total request timeout, but every recursive
redirect creates a fresh timer. A chain can consume roughly `(redirects + 1) *
timeoutMs`, violating user expectations and allowing avoidable resource hold.

## Current state

- `performRequest` defaults `totalTimeoutMs` at `src/fetcher.js:477-483`.
- It starts a new timer at lines 522-525.
- Redirect handling clears that timer and recursively calls `performRequest` at
  lines 586-594 (`...options` spread re-applies `totalTimeoutMs`), resetting the
  full budget. The 075 hop-policy check at 494-505 runs per hop but does not
  change the timeout semantics.
- `index.d.ts:948` promises a total request timeout.
- Hermetic timeout tests are established by Plan 073.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Timeout tests | `node --test --test-name-pattern="timeout|redirect" tests/fetcher.test.js` | pass |
| Full fetcher | `node --test tests/fetcher.test.js` | pass |
| Full check | `npm run check` | exit 0 |

## Scope

**In scope**: `src/fetcher.js`, declarations/comments if clarified,
`tests/fetcher.test.js`, `CHANGELOG.md`, `plans/README.md`.

**Out of scope**: changing the default 30-second value, response-size limits,
redirect count, or origin policy from Plan 075.

## Git workflow

- Branch: `advisor/077-total-redirect-timeout`
- Commit example: `fix(fetcher): share timeout across redirects`.

## Steps

### Step 1: Characterize a slow redirect chain

Use one local server whose successive redirects each delay less than
`timeoutMs` but whose sum exceeds it. Assert the old implementation exceeds the
budget and the target behavior rejects near the original deadline.

**Verify**: the focused regression fails before implementation.

### Step 2: Propagate one deadline

Create the absolute deadline once in `fetchUrl`; pass it through recursive
calls. For each hop compute positive remaining time, abort immediately when
exhausted, and ensure all timers/listeners are cleared on resolve, reject, and
redirect. Keep response timeout subordinate to remaining total time.

**Verify**: slow chain rejects within a generous tolerance of one `timeoutMs`;
a fast chain succeeds.

### Step 3: Cover cleanup and release record

Add tests for timeout during DNS/connect, before headers, mid-body, and across
redirects. Add an Unreleased Fixed bullet.

**Verify**: full fetcher suite and `npm run check` pass without open-handle warnings.

## Test plan

- Fast redirects under budget.
- Individually-fast but cumulatively-slow redirects.
- Zero remaining budget before next hop.
- Timer cleanup on success, policy rejection, max redirects, and body error.

## Done criteria

- [ ] One public call has one total deadline across all redirects/body work.
- [ ] Fast redirect behavior and maxRedirects stay unchanged.
- [ ] No leaked timers/sockets; focused and full checks pass.
- [ ] Only scoped files changed.

## STOP conditions

- DNS resolution cannot be bounded without a broader API redesign; report the
  uncovered phase rather than claiming a total timeout.
- Tests require unsupported internal option names.
- The fix changes redirect/origin policy.

## Maintenance notes

Future hops (proxy, retry, robots fetch) must consume the same deadline if they
are part of one documented transaction. Review elapsed-time tests with tolerant
upper bounds to avoid CI flakes.
