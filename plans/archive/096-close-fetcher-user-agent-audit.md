# Plan 096: Close the fetcher user-agent audit (propagate validation errors, reject all control chars, key robots cache by user-agent)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. Do NOT update `plans/README.md` — a reviewer
> maintains the index.
>
> **Base**: create your branch FROM commit `912f525` (the Plan 079 branch
> `advisor/079-fetcher-user-agent`), not from `origin/main`. The reviewer
> diffs against `912f525`.
>
> **Drift check (run first)**: `git diff --stat 912f525..HEAD -- src/fetcher.js index.d.ts tests/fetcher.test.js CHANGELOG.md README.md README.es.md plans/README.md` — must print nothing before you start. If it prints changes, STOP and report.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/archive/079-honor-fetcher-user-agent.md (APPROVED at `912f525` on `advisor/079-fetcher-user-agent`)
- **Category**: bug / tests
- **Planned at**: commit `912f525`, 2026-08-03

## Why this matters

Plan 079 threaded the `userAgent` option through the fetcher, but an
adversarial audit of that implementation found three real gaps that break the
plan's own done criteria:

1. **The validation error is swallowed by `fetchRobotsTxt`.** It catches every
   error from `fetchUrl` except `ERR_HOP_POLICY` and silently returns
   `{ groups: [], raw: "" }` — and permanently poisons the origin-keyed cache
   (a `Map` with no TTL). Empirically confirmed: a CR/LF `userAgent` via
   `fetchRobotsTxt` returns empty groups with zero requests ever reaching the
   server, and every later valid call returns that same poisoned empty result,
   so robots rules (`Disallow: /private`) are never evaluated. The code's own
   comment says degradation is for network/HTTP failures only — a validation
   error is neither.
2. **Only CR/LF is rejected before network I/O.** Other control characters
   (`\x00`, `\x0b`, `\x0c`, `\x0e`, `\x1f`, `\x7f` …) pass the regex; DNS
   resolution runs first (empirically confirmed: a `\x00` UA against an
   unresolvable host fails with ENOTFOUND, proving DNS happened before any
   rejection), and Node's own `ERR_INVALID_CHAR` then fires deep inside
   `httpMod.request` — late, and swallowed by `fetchRobotsTxt`.
3. **The robots cache is keyed by origin only.** A `fetchRobotsTxt(origin,
   { userAgent: A })` primes the cache; a later `fetchRobotsTxt(origin,
   { userAgent: B })` returns data fetched under A. Sites may legitimately
   serve different robots content per agent, so "every hop sends the requested
   valid user-agent" is not actually true for the robots path.

## Current state

All excerpts from the Plan 079 implementation (commit `912f525`):

- `src/fetcher.js:502-505` — the validation, inside `performRequest`:

  ```js
  const effectiveUserAgent = userAgent || USER_AGENT;
  if (typeof effectiveUserAgent !== "string" || /[\r\n]/.test(effectiveUserAgent)) {
    throw new Error("Invalid User-Agent value: expected a single-line string without CR/LF");
  }
  ```

  This is the single choke point: `fetchUrl` (line 846 destructures
  `userAgent = USER_AGENT` and passes it in the explicit `performRequest`
  call), `fetchRobotsTxt` via `fetchUrl`, and every recursive redirect hop
  (which forwards `...options`) all pass through it. The error has **no
  `code`**.

- `src/fetcher.js:748-776` — `fetchRobotsTxt`; the catch at 759-770 rethrows
  only `ERR_HOP_POLICY` and otherwise caches+returns empty:

  ```js
  } catch (error) {
    // Degradación silenciosa SOLO para fallos de red/HTTP. ...
    if (error?.code === "ERR_HOP_POLICY") {
      throw error;
    }
    const empty = { groups: [], raw: "" };
    robotsCache.set(origin, empty);
    return empty;
  }
  ```

- `src/fetcher.js:730` — `const robotsCache = new Map();` — plain map, no TTL;
  keyed by `origin` at lines 749 (get), 768 (set empty), 774 (set entry).
  `clearRobotsCache()` (line 900) clears all.

- `index.d.ts:957` — `/** User-Agent header (default: geo-opt/2.0.0; empty string falls back to the default). */`

- Tests: the describe block `fetchUrl — opción userAgent (Plan 079)` at the
  end of `tests/fetcher.test.js` covers default/custom/redirect/robots/CR-LF/
  empty-string. Its CR/LF test asserts the error with `/user-agent/i` (the new
  message below still matches). Its robots test calls `clearRobotsCache()`
  first (still valid under the new cache key).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused (new + prior plan tests) | `node --test --test-name-pattern="Plan 079|Plan 096" tests/fetcher.test.js` | all pass |
| Types | `npm run typecheck` | exit 0 |
| Full | `npm run check` | exit 0 |
| Whitespace | `git diff --check` | exit 0 |

## Scope

**In scope**:
- `src/fetcher.js` — validation error code + extended control-char rejection
  (lines 502-505), `fetchRobotsTxt` cache key + rethrow (lines 748-776), the
  JSDoc of `performRequest` and `fetchUrl` (the userAgent param notes).
- `tests/fetcher.test.js` — one new describe block (see Test plan).
- `index.d.ts` — one-line `userAgent` doc clarification (line 957).
- `CHANGELOG.md` — 2 Unreleased `Fixed` bullets (fix + test, Plan 096).
- `README.md` / `README.es.md` — ONLY the test-count badge updates
  (854 → 862): the badge URL, the highlights line, and the dev section, per
  `scripts/check-test-count.js`'s own error instructions (it is wired into
  `npm run check` and fails on any mismatch). Do NOT touch the "155 suites"
  prose — `tests/058-docs-claims.test.js` hard-codes that string and only
  checks README-internal consistency; reality is 156 suites.

**Out of scope** (do NOT touch):
- A `--user-agent` CLI flag in `bin/cli.js` (the CLI passes no `userAgent`
  today; noted as a follow-up, not part of this plan).
- Changing the default user-agent string, the robots selection API, the
  network-failure empty-cache degradation (behavior pinned by a new test), or
  adding arbitrary headers.
- Any other file, including `plans/README.md`.

## Git workflow

- Branch: `advisor/096-fetcher-user-agent-closure`, created FROM `912f525`.
- One commit at the end. Message style follows `git log`:
  `fix(fetcher): propagate user-agent validation and key robots cache (Plan 096)`
- Do NOT push or open a PR.

## Steps

### Step 1: Add the regression tests (red)

Append a new describe block at the end of `tests/fetcher.test.js`, after the
`fetchUrl — opción userAgent (Plan 079)` block. Structure it after that block
and the existing hermetic pattern (`startServer`/`stopServer` helpers,
`LOCALHOST_OPTS`, a `seenUserAgents`-style recorder, Spanish descriptions).
Tests:

1. `fetchRobotsTxt` with a CR/LF `userAgent` **rejects** with code
   `ERR_INVALID_USER_AGENT` (assert via `assert.rejects(fn, (err) => err.code === "ERR_INVALID_USER_AGENT")`) and the server's request counter stays at 0.
2. After that rejection, a valid `fetchRobotsTxt(origin)` (no option) makes a
   **real request** and returns the parsed rules (server responds
   `User-agent: *\nDisallow: /private\n`; assert `groups` length and that the
   request counter incremented) — proves the cache was NOT poisoned.
3. Loop over `["\x00", "\x0b", "\x0c", "\x0e", "\x1f", "\x7f"]`: each
   `userAgent` value rejects with `ERR_INVALID_USER_AGENT` and 0 requests.
4. A `userAgent` containing a tab (`"AuditBot\t1.0"`) is allowed: fetch
   succeeds, request counter increments (Node permits HTAB in header values).
5. A non-string `userAgent` (`42`) rejects with `ERR_INVALID_USER_AGENT`
   before any request.
6. Cache keyed by agent: fetch with `userAgent: "UA-A"` → 1 request; then
   with `userAgent: "UA-B"` → 2 requests (a refetch happened); then again with
   `"UA-A"` → still 2 (cache hit).
7. Empty-string and omitted share the default key: fetch with `userAgent: ""`
   → 1 request; fetch without the option → still 1 request (cache hit).
8. Network-failure degradation is unchanged: `fetchRobotsTxt` against a
   closed port (start a server, get its port, close it) resolves to
   `{ groups: [], raw: "" }` — no throw (this pins the existing behavior at
   lines 767-769, currently untested).

**Verify**: `node --test --test-name-pattern="Plan 096" tests/fetcher.test.js`
— tests 1, 2, 3, 5, 6 fail; tests 4, 7, 8 pass. (1/2 fail because the error is
swallowed today; 3/5 fail because the code is missing; 6 fails because the
cache is origin-keyed.)

### Step 2: Fix the validation error (code + control chars)

In `src/fetcher.js:502-505`, replace the check with:

```js
const effectiveUserAgent = userAgent || USER_AGENT;
if (
  typeof effectiveUserAgent !== "string" ||
  /[\x00-\x08\x0a-\x1f\x7f]/u.test(effectiveUserAgent)
) {
  const err = new Error(
    "Invalid User-Agent value: expected a single-line string without control characters"
  );
  err.code = "ERR_INVALID_USER_AGENT";
  throw err;
}
```

Notes: the regex is exactly Node's rejected header-value set minus HTAB
(`\x09`), which HTTP permits — CR (`\x0d`), LF (`\x0a`) and every other C0
control plus DEL (`\x7f`) are rejected here, before DNS, at the single choke
point. Update the Spanish comment above it accordingly (it currently mentions
only CR/LF). Update the `userAgent` JSDoc param of `performRequest` and of
`fetchUrl` (both say "el string vacío cae al default (Plan 079)") to add:
valores con caracteres de control se rechazan con `code = "ERR_INVALID_USER_AGENT"`.
Also update `index.d.ts:957` to: `User-Agent header (default: geo-opt/2.0.0; empty string falls back to the default; control characters are rejected before any network I/O).`

**Verify**: `node --test --test-name-pattern="Plan 096" tests/fetcher.test.js`
→ all 8 tests pass.

### Step 3: Fix `fetchRobotsTxt` (rethrow + UA-aware cache key)

In `src/fetcher.js:748-776`:

1. After the opening brace of `fetchRobotsTxt`, add the same normalization the
   validation uses, so the cache key is stable:

   ```js
   const { userAgent = USER_AGENT } = options;
   const effectiveUserAgent = userAgent || USER_AGENT; // mismo normalizado que performRequest (línea 502)
   const cacheKey = `${origin}\u0000${effectiveUserAgent}`;
   ```

   (Safe by construction: origins come from URL parsing and the UA is
   guaranteed control-character-free by the validation, so `\u0000` cannot
   occur in either component.)
2. Replace `robotsCache.get(origin)` (line 749) with `robotsCache.get(cacheKey)`.
3. In the catch, extend the rethrow (line 764) to propagate validation errors
   too, and update the comment:

   ```js
   if (
     error?.code === "ERR_HOP_POLICY" ||
     error?.code === "ERR_INVALID_USER_AGENT"
   ) {
     throw error;
   }
   ```
4. Replace `robotsCache.set(origin, empty)` (line 768) and
   `robotsCache.set(origin, entry)` (line 774) with `cacheKey`.
5. `clearRobotsCache` stays as-is.

**Verify**: `node --test --test-name-pattern="Plan 096|Plan 079" tests/fetcher.test.js` → all pass (the Plan 079 robots test calls `clearRobotsCache()` first, so the key change does not break it).

### Step 4: Record and run gates

Add 2 Unreleased `Fixed` bullets to `CHANGELOG.md` (fix + test, Plan 096) and
update the README test-count badges 854 → 862 (3 locations per README: badge
URL, highlights line, dev section — the check script will name any miss).

**Verify**: `npm run typecheck && npm run check && git diff --check` → exit 0
(check reports 862 tests / 0 failures; `check-test-count` prints
`✔ README.md: badge (862) matches actual test count` for both READMEs).

## Test plan

All new tests live in one describe block
`fetchUrl — validación userAgent y caché de robots (Plan 096)` at the end of
`tests/fetcher.test.js`, modeled on the existing `Plan 079` block (same
`startServer`/`stopServer`/`LOCALHOST_OPTS`/recorder conventions). Coverage
targets: the `typeof` disjunct of the validation (untested today), the
`fetchRobotsTxt` catch's rethrow path and its network-degradation path (lines
767-769, untested today), the extended control-char regex, and the UA-aware
cache key.

## Done criteria

- [ ] `node --test --test-name-pattern="Plan 079|Plan 096" tests/fetcher.test.js` → all pass
- [ ] `npm run typecheck` exits 0
- [ ] `npm run check` exits 0 with 862 tests / 0 failures; `check-test-count` passes for both READMEs
- [ ] `git diff --check` exits 0
- [ ] `grep -n "expected a single-line string without CR/LF" src/fetcher.js` → no match (old message gone)
- [ ] `grep -c "ERR_INVALID_USER_AGENT" src/fetcher.js` → ≥ 3 (definition + 2 rethrow/tag sites as applicable)
- [ ] No files outside the in-scope list are modified (`git status`)

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the cited locations doesn't match the excerpts (drift since
  `912f525`).
- A step's verification fails twice after a reasonable fix attempt.
- An existing test fails because a caller depended on origin-keyed caching in
  a way not covered here — report the caller before changing this plan's
  approach.
- Node itself rejects a tab character in a header value in your run (test 4
  would be wrong) — verify against the actual runtime behavior.

## Maintenance notes

- The robots cache is now keyed by origin + effective user-agent; any future
  cache feature (TTL, size bound) must preserve both components.
- The CLI (`bin/cli.js:1657`) still builds `fetchOptions` without `userAgent`;
  a future `--user-agent` flag should add it there — out of scope here.
- The network-failure degradation (empty result cached under the failing
  key) is pinned by a test; revisit it together with Plan 075's policy intent
  if robots fetch semantics change.
- Reviewers should scrutinize: the cache key construction, that the rethrow
  whitelist stays exactly `ERR_HOP_POLICY | ERR_INVALID_USER_AGENT`, and that
  the badge updates touch nothing but the three canonical locations.
