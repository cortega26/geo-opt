# Plan 074: Cover HTTPS certificate and IP-pinning behavior deterministically

> **Executor instructions**: Add local TLS coverage without weakening
> `rejectUnauthorized`, hostname verification, or DNS-rebinding defenses. Update
> the plan index when complete.
>
> **Drift check (run first)**: `git diff --stat 888d3e7..HEAD -- src/fetcher.js tests/fetcher.test.js tests/fixtures plans/README.md`

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/073-make-fetcher-tests-hermetic.md
- **Category**: security / tests
- **Planned at**: commit `888d3e7`, 2026-08-02
- **Executed at**: commits `ff4fdbd` + `56d3464` + `afa7ebd` + `e9257c3`
  (2026-08-03) on branch `advisor/074-test-https-pinning`, approved by
  reviewer, squash-merged to main as `e6e418d` (2026-08-03). Notes: test-only CA/certs fixtures under
  `tests/fixtures/tls/` (TEST-ONLY-*, expiry 2036-07-31, regeneration
  documented; never trusted outside the NODE_EXTRA_CA_CERTS child process).
  Positive case runs the real `fetchUrl` in a child with the CA trusted and
  asserts Host header, SNI, and socket target 127.0.0.1 separately; negative
  hostname-mismatch runs WITH the CA trusted to isolate the altname
  dimension (ERR_TLS_CERT_ALTNAME_INVALID); untrusted self-signed fails
  closed in the main process; source-contract test pins rejectUnauthorized:
  true, servername: hostname, host: resolvedIp, and resolution-before-agent
  ordering. No production change; src/fetcher.js untouched. Reviewer
  revision: the concurrent-build read-during-write window (EACCES in this
  sandbox, partial content in CI) was still flaking — the build lock
  serializes builds, not test reads; `readDist` and the staging `cpSync` now
  retry on EACCES/ENOENT and on content violating the build's deterministic
  invariants (verified: the 4x `npm test` loop that reproduced the flake at
  1/4 now passes 4/4). Reviewer round 2 (`afa7ebd`): fixtures README
  generation date corrected to 2026-08-03 (verified against the PEM
  notBefore). Reviewer round 3 (`e9257c3`): the completeness predicate's
  fallback only required non-empty content, leaving a partial-read window
  for `dist/bin/cli.js`/`dist/index.js`; the generic predicate now requires
  the snapshot to end with `}` (verified both built files end with `}`);
  3x `npm test` + gate green after.

## Why this matters

The fetcher's most security-sensitive positive property—connect to the vetted
IP while verifying TLS for the original hostname—has no deterministic test.
A refactor could silently bypass SNI, certificate validation, or the pinned IP
agent while all HTTP-only tests remain green.

## Current state

- `src/fetcher.js:363-376` creates an HTTPS agent with `host: resolvedIp`,
  `servername: hostname`, and `rejectUnauthorized: true`.
- `performRequest` selects that agent at lines 426-464.
- `tests/fetcher.test.js` starts only `node:http` servers and contains no local
  certificate fixture.
- Keep test dependencies at zero and follow the local-server lifecycle pattern
  at `tests/fetcher.test.js:28-72`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| TLS tests | `node --test --test-name-pattern="HTTPS|TLS|pin" tests/fetcher.test.js` | pass |
| Full fetcher | `node --test tests/fetcher.test.js` | pass |
| Full check | `npm run check` | exit 0 |
| Diff | `git diff --check` | exit 0 |

## Scope

**In scope**: `tests/fetcher.test.js`, dedicated non-secret test certificate
fixtures under `tests/fixtures/tls/` if needed, and the smallest internal seam
in `src/fetcher.js` needed for deterministic DNS/CA control, `CHANGELOG.md`,
`plans/README.md`.

**Out of scope**: accepting self-signed certificates in production, exposing a
public `rejectUnauthorized` option, changing redirect policy, or contacting a
live HTTPS host.

## Git workflow

- Branch: `advisor/074-test-https-pinning`
- Commit example: `test(fetcher): cover TLS IP pinning`.

## Steps

### Step 1: Create local, reviewable TLS fixtures

Use a clearly labeled test-only CA/key/certificate for `localhost` with no real
identity. Prefer spawning a child Node process with `NODE_EXTRA_CA_CERTS` so
production APIs remain unchanged. Document the fixture regeneration command
and expiry assumptions without adding a runtime dependency.

**Verify**: a plain Node HTTPS request to the local server succeeds for
`localhost` and fails for a hostname not present in the certificate.

### Step 2: Exercise the real `fetchUrl` secure-agent path

Run `fetchUrl("https://localhost:<port>", { allowLocalhost: true })` through the
trusted test CA. Assert the server sees the original Host/SNI identity and the
request reaches the pre-resolved loopback IP. Add negative cases for hostname
mismatch and untrusted certificate.

**Verify**: focused TLS command -> positive case passes; both negative cases
reject with certificate/hostname errors.

### Step 3: Protect the security invariants

Add assertions or source-contract coverage that `rejectUnauthorized` remains
true and resolution occurs before connection. Record the coverage in the
Unreleased Security section.

**Verify**: full fetcher suite and `npm run check` -> exit 0.

## Test plan

- Trusted local CA + matching hostname succeeds.
- Wrong hostname and untrusted cert fail closed.
- Host header and SNI retain the original hostname while the socket target is
  the vetted IP.
- No public network or production trust-store mutation.

## Done criteria

- [ ] The real HTTPS agent path has deterministic positive and negative tests.
- [ ] Production still enforces certificate and hostname validation.
- [ ] No runtime dependency or insecure public option is added.
- [ ] Full checks pass and only scoped files changed.

## STOP conditions

- The only passing approach disables TLS verification.
- Test certificates would be mistaken for production credentials or lack a
  documented regeneration path.
- Deterministic resolution requires a new public API rather than an internal or
  subprocess test seam.

## Maintenance notes

Reviewers should scrutinize socket target, SNI, Host, and trust validation as
separate assertions. Regenerate test certificates before expiry; never reuse
their key outside tests.
