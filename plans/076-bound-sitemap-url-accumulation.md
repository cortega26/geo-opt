# Plan 076: Bound total sitemap URL accumulation

> **Executor instructions**: Bound memory independently from the existing fetch
> cap and final page-fetch cap. Preserve deterministic ordering and diagnostics.
>
> **Drift check (run first)**: `git diff --stat 888d3e7..HEAD -- src/sitemap.js bin/cli.js index.d.ts tests/sitemap.test.js tests/audit-2026-07-31.e2e.test.js plans/README.md`

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/075-enforce-remote-hop-policy.md
- **Category**: security / performance
- **Planned at**: commit `0006bb1`, 2026-08-03 (reconciled; 075 DONE)

## Why this matters

Traversal fetches at most 100 sub-sitemaps, but each can contribute tens of
thousands of page URLs. `pageUrls.push(...)` can therefore retain millions of
strings before the CLI later slices to `--max-urls`. The collection layer needs
its own hard total and truncation report.

## Current state

- `src/sitemap.js:565-568` documents only `maxFetches`.
- `src/sitemap.js:583-603` appends all parsed page URLs to an unbounded array
  (`pageUrls.push(...)` at 603).
- `bin/cli.js:1814-1826` combines root and sub-sitemap URLs (`urls = [...urls, ...pageUrls]`
  at 1826); `collectSubSitemapPageUrls` is called at 1814-1819 with the 075 policy
  options (`sitemapFetchOptions`).
- `bin/cli.js:1852-1856` applies `--max-urls` only after robots filtering.
- Existing cap tests are in `tests/sitemap.test.js:634-700`; match their injected
  `fetchFn` pattern.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Sitemap tests | `node --test tests/sitemap.test.js` | pass |
| Audit regression | `node --test --test-name-pattern="F-11|sitemap" tests/audit-2026-07-31.e2e.test.js` | pass |
| Full | `npm run check` | exit 0 |
| Diff | `git diff --check` | exit 0 |

## Scope

**In scope**: sitemap collector, CLI wiring, public declarations if the helper
contract changes, focused tests, `CHANGELOG.md`, `plans/README.md`.

**Out of scope**: changing XML's per-file 50,000-URL validation, fetch timeout,
or replacing `--max-urls` semantics.

## Git workflow

- Branch: `advisor/076-bound-sitemap-urls`
- Commit example: `fix(sitemap): cap collected page URLs`.

## Steps

### Step 1: Add a collector-level URL budget

Add `maxPageUrls` with a conservative finite default (50,000 is the existing
sitemap-spec scale) and validate it as a positive integer. Dedupe while
collecting so duplicates do not consume downstream work; stop appending at the
budget and track truncated count/state.

**Verify**: focused unit test with multiple large synthetic sub-sitemaps never
returns more than the configured cap.

### Step 2: Return and surface truncation metadata

Extend the collector result with a machine-checkable field such as
`truncatedPageUrls`/`urlLimitReached`. Emit one warning and preserve first-seen
ordering. Wire the CLI so root URLs and collected URLs share one total budget
before robots evaluation.

**Verify**: CLI/helper test asserts the warning and bounded result; no enormous
fixture file is committed.

### Step 3: Preserve existing caps and document the fix

Keep `maxFetches` and final `--max-urls` as separate controls. Add an Unreleased
Security or Fixed bullet.

**Verify**: sitemap tests, full check, and diff check all pass.

## Test plan

- Exact limit, limit+1, duplicates, nested indexes, root+child combined budget,
  invalid option, and no-limit-hit path.
- Assert fetch count and returned URL count separately.

## Done criteria

- [ ] Total retained page URLs have a finite hard cap.
- [ ] Limit state is visible and deterministic; ordering is preserved.
- [ ] Existing 100-sub-sitemap and `--max-urls` behaviors remain covered.
- [ ] Full checks pass; scoped files only.

## STOP conditions

- Bounding URLs would silently omit them without a diagnostic.
- The implementation allocates the full unbounded list before slicing.
- The policy chosen conflicts with sitemap spec claims in current docs/tests.

## Maintenance notes

Keep fetch count, collected URL count, and audited page count as distinct
budgets. Review any future streaming parser against all three.
