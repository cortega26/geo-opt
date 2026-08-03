# Plan 073: Make fetcher tests hermetic and behavior-specific

> **Executor instructions**: Eliminate all reliance on public network services.
> Tests must fail for the intended fetcher behavior, not merely eventually time
> out. Update the plan index when complete.
>
> **Drift check (run first)**: `git diff --stat 888d3e7..HEAD -- tests/fetcher.test.js src/fetcher.js index.d.ts plans/README.md`

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plans/069-match-audit-advisories-by-stable-identity.md and plans/070-make-evidence-freshness-tests-deterministic.md
- **Category**: tests
- **Planned at**: commit `888d3e7`, 2026-08-02
- **Executed at**: commits `dbd6df7` + `f73c748` + `8daf3f6` + `578e890` +
  `60bf411` (2026-08-02) on branch `advisor/073-hermetic-fetcher-tests`,
  approved by reviewer, squash-merged to main as `92af2d9` (2026-08-02,
  after release 2.3.6 `e4c2ab2`). Notes: suite duration
  75.5s → ~2.5s (hermeticity evidence); the allow-private case ran (runner
  exposes 192.168.100.8) with a documented skip path when no private
  interface exists. Out-of-scope residual: `tests/audit-2026-07-31.e2e.test.js`
  still contains the literal `169.254.169.254` (guard-block assertion only,
  no outbound attempt) — candidate for a future cleanup. Reviewer revision
  rounds (all verified live):
  - `f73c748`: `startServer` brackets IPv6 hosts in `baseUrl` (was
    `http://::1:8080` → ERR_INVALID_URL; latent footgun for Plans 074–079).
  - `8daf3f6` (production fix, maintainer-authorized): the fetcher could not
    fetch IPv6-literal URLs on Node 22+ — `parsed.hostname` for IPv6 carries
    brackets (`"[::1]"`) and was passed to `http.request`, so `getaddrinfo`
    failed with `ENOTFOUND [::1]` (the custom agent's createConnection is
    bypassed for IP literals). `performRequest` now connects via the vetted
    `resolvedIp` (unbracketed) with explicit `servername` for https; this
    also removes the second resolution for names (strengthens the
    DNS-rebinding mitigation). New ::1 tests: fetch 200 + correct bracketed
    Host header; guard rejects `[::1]` pre-connection. Verified e2e via
    `technical --url http://[::1]:<port>/`.
  - `578e890` (gate-flake root cause, maintainer-authorized): the recurring
    full-check red was a concurrent-build race — `node --test` runs
    `artifact.test.js` and `integrity.test.js` in parallel, both building the
    shared `dist/`; observed as `EACCES` reading `dist/licensing.js` and
    half-written staging copies (reproduced 1/12 parallel runs).
    `scripts/build.js` now serializes builds via an exclusive
    `dist/.build.lock` (wx-open, 50ms retry to 15s, stale-PID recovery via
    ESRCH, try/finally release, deadline error). New test: two concurrent
    builds produce an integral dist/. Verified 6× parallel runs + full gate.
  The earlier unexplained single gate red is attributed to this race class,
  now eliminated.
  - `60bf411` (reviewer round 4): the CLI's `--url` suggestion compared
    `host === "::1"` but Node 22+ returns the bracketed `"[::1]"`, so
    IPv6-literal URLs got the wrong suggestion (`--allow-http`, which does
    not unblock loopback); both forms now match, with a regression test in
    cli-smoke. Notes without action: https-to-IPv6-literal SNI
    characterization belongs to Plan 074; build-lock PID-reuse edge accepted
    by design; redirect-to-IPv6 covered by the shared performRequest path.

## Why this matters

Fetcher tests currently pass unsupported option names and attempt a request to
the link-local cloud metadata address. Those tests can be slow, environment
dependent, or pass for the wrong reason. Network hardening plans 074-079 need a
trustworthy local characterization suite first.

## Current state

- Public `FetcherOptions` defines `timeoutMs` and `maxSize`
  (`index.d.ts:924-935`).
- `tests/fetcher.test.js:323-349` passes internal-only
  `responseTimeoutMs`/`totalTimeoutMs`; `fetchUrl` ignores them.
- `tests/fetcher.test.js:755-765` calls `169.254.169.254` to infer that
  `allowPrivate` changed the guard.
- The file already uses local `node:http` servers via `startServer` at lines
  28-49; keep that zero-dependency pattern.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused tests | `node --test tests/fetcher.test.js` | all pass without internet |
| Repeatability | `for i in 1 2 3 4 5; do node --test tests/fetcher.test.js || exit 1; done` | all five exit 0 |
| Full check | `npm run check` | exit 0 |
| Diff | `git diff --check` | exit 0 |

## Scope

**In scope**: `tests/fetcher.test.js`, minimal test seams in `src/fetcher.js`
only if local servers cannot express a case, `index.d.ts` only if an intentional
public option changes, `CHANGELOG.md`, `plans/README.md`.

**Out of scope**: changing redirect/origin policy, production timeouts, TLS
pinning, or calling any public DNS/HTTP endpoint.

## Git workflow

- Branch: `advisor/073-hermetic-fetcher-tests`
- Commit example: `test(fetcher): remove external network dependencies`.

## Steps

### Step 1: Inventory and correct option use

Replace unsupported timeout option names with `timeoutMs`. Assert elapsed time
within a generous range and match the specific total-timeout error. Ensure
server sockets are destroyed in cleanup so a failed assertion cannot hang.

**Verify**: focused tests -> timeout cases finish within their declared budget.

### Step 2: Replace metadata-address probing with local private networking

Start a server on a local non-loopback interface obtained from
`os.networkInterfaces()` and prove `allowPrivate: false` blocks it while
`allowPrivate: true` reaches the local server. If the runner exposes no private
interface, skip only this case with an explicit reason; do not use an external
address as fallback.

**Verify**: focused tests with network access disabled -> pass or one explicit
environmental skip, never an outbound attempt.

### Step 3: Tighten assertions and cleanup

For each guard test, distinguish policy rejection from connection refusal.
Centralize server/socket cleanup and clear the robots cache between cases.
Add an Unreleased test-quality bullet only if repository policy requires it.

**Verify**: run the focused suite five consecutive times, then `npm run check`.

## Test plan

- Hanging before headers; hanging after headers; allowed/block private address;
  redirect to private; max size; robots cache isolation.
- Every test uses loopback/private interfaces owned by the test process.
- Assert specific errors and measured request counts where possible.

## Done criteria

- [ ] No fetcher test references `169.254.169.254` or another public/external service.
- [ ] No test passes unsupported `totalTimeoutMs`/`responseTimeoutMs` to `fetchUrl`.
- [ ] Five repeated focused runs and the full check pass.
- [ ] Only scoped files changed.

## STOP conditions

- Hermetic coverage would require exporting a test-only public API.
- The runner has no usable local network interface and no dependency-injection
  seam can be added without changing runtime behavior.
- A test exposes a real credential, proxy, or internal address.

## Maintenance notes

Use this suite as the characterization base for Plans 074-079. New fetcher tests
must own their server and DNS behavior and must never assume internet access.
