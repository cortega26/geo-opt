# Plan 092: Harden the shared-deadline edges (audit follow-up of 077)

> **Executor instructions**: Base your work on commit `27472a8` (branch
> `advisor/077-total-redirect-timeout`) — create your branch FROM that commit,
> not from origin/main. The reviewer diffs against `27472a8`. Do NOT update
> `plans/README.md` — the reviewer maintains the index.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: 077 (APPROVED at `27472a8` on `advisor/077-total-redirect-timeout`)
- **Category**: tests / robustness
- **Planned at**: `92c81f2` (main; audited against `27472a8`), 2026-08-03

## Why this matters

An adversarial audit of the Plan 077 implementation (shared total deadline)
found three small gaps and one documented dead end. This plan closes the
gaps. The dead end is recorded so nobody re-attempts it.

## Findings (all verified empirically on Node v24.15.0 before planning)

### H1 — No test covers the hop-entry `remaining <= 0` check

`src/fetcher.js` throws `Request total timeout after Nms` when a hop starts
with zero or negative remaining budget (the `remaining <= 0` check right
after the hop-policy check). No test exercises it: every existing timeout
test uses budgets ≥ 10ms, where the armed total timer wins. Measured: with a
mute server, budget 10 → elapsed 11ms, budget 200 → 200ms, budget 1000 →
1001ms (elapsed scales with budget ⇒ the timer fires). With budget 1ms the
entry check throws instead (elapsed ~5ms).

**Fix**: new test with `timeoutMs: 1` asserting the canonical message and
`elapsed < 50ms`. The assertion is robust under both paths (entry throw or a
1ms timer) — both produce the same message and a sub-50ms elapsed.

### H2 — The "aborts during DNS/connect" test overstates its coverage

The test `presupuesto mínimo aborta durante DNS/conexión` uses the IP literal
`127.0.0.1` — there is no DNS phase at all, and its only assert
(`elapsed < 1000`) does not discriminate where the abort came from.

**Fix**: budget 10 → 200ms, add a lower bound `elapsed >= 150` (measured:
budget 200 → elapsed 200ms; budget 150 → 152ms, so ≥150 is safe against
CI jitter), and rename the test to the phase it actually covers: "aborta
antes de recibir headers (timer armado, sin respuesta del server)". Update
the comment accordingly.

### H3 — Timer leak if `httpMod.request` throws synchronously

The total timer is armed BEFORE `return new Promise(...)`. If
`httpMod.request(...)` throws synchronously (invalid internal options —
unlikely but possible if a future change passes bad values), the promise
rejects automatically but `totalTimer` stays armed until the deadline: a
pending-timer leak. The reject path inside the promise cannot clean it up
because the throw happens before the promise body starts.

**Fix**: wrap the request creation in `try { ... } catch (err) {
clearTimeout(totalTimer); throw err; }`. `responseTimer` does not exist yet
at that point (it is armed on `socket` connect), so only `totalTimer` needs
clearing. Not directly testable through the public API — verified by
inspection and the full suite.

### H4 — REJECTED: making DNS resolution abortable

The Plan 077 STOP condition (an indefinitely hanging DNS query cannot be
cut short) is **not closable with Node's DNS API**. Verified empirically on
Node v24.15.0:

- `dns.promises.resolve4('localhost', { signal })` resolves normally with an
  already-aborted signal (the `signal` option is ignored by resolve4).
- `dns.promises.lookup('localhost', { signal })` AND
  `dns.promises.lookup('example.com', { signal })` (real external hostname)
  both resolve normally with an already-aborted signal.

Node's name-resolution APIs do not honor AbortSignal reliably in this
runtime. Closing the gap would require running resolution in a killable
worker process — disproportionate cost for the use case. The Plan 077 STOP
#1 stays accepted as documented. Do NOT re-attempt passing a signal into
`resolveAndValidateHost`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Timeout/redirect tests | `node --test --test-name-pattern="timeout|redirect" tests/fetcher.test.js` | pass |
| Full fetcher | `node --test tests/fetcher.test.js` | pass |
| Full check | `npm run check` | exit 0 |

## Scope

**In scope**: `src/fetcher.js`, `tests/fetcher.test.js`, `CHANGELOG.md`,
`README.md`, `README.es.md` (badge count only — see Step 3; the established
convention from Plan 076/077 is to sync the test-count badge in all three
places per locale).

**Out of scope**: `resolveAndValidateHost` / DNS behavior (H4 rejected),
timeout constants, redirect/origin policy, anything else.

## Git workflow

- Base: `27472a8` (`advisor/077-total-redirect-timeout`). If that branch no
  longer exists and `27472a8` is an ancestor of HEAD (077 was merged), branch
  from HEAD instead. Verify with `git merge-base --is-ancestor 27472a8 HEAD`.
- Branch: `advisor/092-harden-deadline-edges`
- Commit example: `fix(fetcher): harden shared-deadline edges (coverage, timer cleanup)`.

## Steps

### Step 1: Add the H1 entry-check test

In `tests/fetcher.test.js`, inside `describe("fetchUrl — timeouts")`, add a
test following the pattern of the neighboring tests (`startServer` with a
handler that never responds, `stopServer` in `finally`, `assert.rejects`
with the canonical message regex, `Date.now()` elapsed):

- `fetchUrl(..., { allowLocalhost: true, timeoutMs: 1 })` rejects with
  `/Request total timeout after 1ms/` and `elapsed < 50`.

Name it to describe the phase: e.g. `"timeout total: presupuesto agotado antes de entrar lanza de inmediato"`.
Comment: the 1ms budget is consumed by the rate-limiter acquisition, so the
hop-entry `remaining <= 0` check throws without arming a timer or connecting.

**Verify**: `node --test --test-name-pattern="timeout" tests/fetcher.test.js` passes.

### Step 2: Adjust the H2 test

Modify the existing test `presupuesto mínimo aborta durante DNS/conexión`:

- `timeoutMs: 10` → `timeoutMs: 200`.
- Add `assert.ok(elapsed >= 150, ...)` before the existing `< 1000` bound.
- Rename the `it(...)` string to cover the real phase (IP literal — no DNS):
  e.g. `"timeout total: el timer armado aborta antes de recibir headers"`.
- Update the comment: the budget is large enough to pass the entry check
  (measured overhead ~5ms), so the abort must come from the armed timer, not
  from the entry throw. If this test ever reports `elapsed < 150`, the abort
  is coming from the wrong path — do NOT loosen the bound, report instead.

**Verify**: the focused command passes; `elapsed` observed in the 195–210ms
range on the current machine.

### Step 3: H3 timer-cleanup fix

In `src/fetcher.js`, wrap the `httpMod.request(...)` creation (the whole
call including the response callback and the trailing listeners section —
from `const req = httpMod.request(` through `req.end();`) in
`try { ... } catch (err) { clearTimeout(totalTimer); throw err; }`.
Keep the existing `let responseTimer;` declaration outside. Comment in
Spanish matching the file's style: the timer is armed before the promise, so
a synchronous throw must not leave it pending.

**Verify**: full fetcher suite passes; by inspection, every early throw
between timer arming and promise body now clears `totalTimer`.

### Step 4: CHANGELOG and badges

- Add an Unreleased → Fixed bullet: the shared deadline (Plan 077) no longer
  leaks a pending timer if request creation throws synchronously (Plan 092).
- The test count goes 822 → 823 (one new test in Step 1). Sync the badges
  and dev-section counts in `README.md` and `README.es.md` exactly as done
  for Plan 077 (three lines per file: badge, highlights, `npm test` comment).

**Verify**: `npm run check` exits 0, including `scripts/check-test-count.js`.

## Test plan

- H1: entry-check throw with `timeoutMs: 1` (new).
- H2: armed-timer abort with `timeoutMs: 200` + lower bound (adjusted).
- Regression guards already present: slow redirect chain (shared budget),
  exhausted-budget-before-next-hop, fast 5-redirect chain, 6-redirect
  rejection, cleanup on success/policy rejection/body error.

## Done criteria

- [ ] New H1 test passes (canonical message, `elapsed < 50`).
- [ ] Adjusted H2 test passes with `elapsed >= 150` and `timeoutMs: 200`.
- [ ] `src/fetcher.js` clears `totalTimer` on any synchronous throw between
      timer arming and the promise body (inspection).
- [ ] Test count 823 with badges synced in both README locales.
- [ ] `npm run check` exits 0; only the scoped files changed.

## STOP conditions

- The H2 lower bound flakes under CI load → report the observed elapsed
  range instead of loosening the assertion.
- The H3 try/catch changes any existing error message asserted by the suite
  → revert and report.
- The test count differs from 823 → report before touching badges.

## Maintenance notes

The two termination paths of the shared deadline — hop-entry throw and armed
timer abort — are now both pinned by tests (H1, H2). The H2 lower bound is
also a regression guard: a per-hop budget renewal would blow past the total
deadline and fail it. Do not re-attempt DNS abortability (H4) without
changing the resolution API (e.g. a worker process); record new evidence in
the plan if one ever surfaces. Any future phase that joins a documented
fetch transaction (proxy, retry) must consume the same `deadlineMs` — see
the Plan 077 maintenance note.
