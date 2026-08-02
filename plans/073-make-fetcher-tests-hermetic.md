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
