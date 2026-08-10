# Plan 078: Combine repeated robots groups and match query strings

> **Executor instructions**: Apply the same robots semantics in `src/robots.js`
> and fetcher integration. Preserve longest-match and Allow tie-breaking.
>
> **Drift check (run first)**: `git diff --stat d144741..HEAD -- src/robots.js src/fetcher.js tests/optimizer.test.js tests/fetcher.test.js index.d.ts plans/README.md`

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/073-make-fetcher-tests-hermetic.md
- **Category**: bug
- **Planned at**: commit `d144741`, 2026-08-03 (reconciled at `0006bb1`; 073 DONE; 092/093 landed since, shifting fetcher line numbers only)

## Why this matters

When a robots file contains multiple groups with the same most-specific user
agent, current selection uses only the first group and ignores later rules.
Remote matching also drops the URL query string, although robots patterns may
target it. Local and remote audits can therefore disagree with published rules.

## Current state

- `src/robots.js:182-196` (`selectGroup`) returns a single selected group.
- `src/fetcher.js:774-825` (`checkRobotsRule`) duplicates that single-group
  algorithm — group selection at 786-798, rule matching at 805-822.
- `src/fetcher.js:781` matches only `URL.pathname` (no `search`).
- Longest rule and Allow tie behavior live at `src/robots.js:198-232` and
  `src/fetcher.js:805-822`.
- `fetchRobotsTxt` (`src/fetcher.js:733-761`) changed with 075 (ERR_HOP_POLICY
  re-throw at 749-751); its matching semantics are unaffected.
- Existing patterns: `tests/optimizer.test.js:2031-2045` and
  `tests/fetcher.test.js:1070+` (`describe("checkRobotsRule")` at 1070, group
  fixture at 1072-1092).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Robots unit | `node --test --test-name-pattern="robots|Robots" tests/optimizer.test.js tests/fetcher.test.js` | pass |
| Full check | `npm run check` | exit 0 |
| Diff | `git diff --check` | exit 0 |

## Scope

**In scope**: both robots implementations or a shared pure helper, their tests,
types only if public shape changes, `CHANGELOG.md`, `plans/README.md`.

**Out of scope**: crawler registry contents, robots generation policy, cache
semantics, or remote origin policy.

## Git workflow

- Branch: `advisor/078-robots-matching`
- Commit example: `fix(robots): combine groups and match queries`.

## Steps

### Step 1: Add parity regressions

Create a robots file with two separated `User-agent: GPTBot` groups whose rules
must both apply, plus a wildcard group. Add query-sensitive Allow/Disallow
rules and run them through both `auditRobots` and `checkRobotsRule`.

**Verify**: focused tests expose the current first-group/pathname-only behavior.

### Step 2: Centralize group selection/evaluation

Determine the longest matching user-agent token, then combine rules from all
groups containing a token at that same specificity. Evaluate
`pathname + search`; retain longest matching rule and Allow-on-equal-length.
Have both local and fetcher paths use one shared pure implementation if it does
not create a circular import.

**Verify**: both APIs return identical decisions and matchedRule values for the
new table.

### Step 3: Document and run gates

Add an Unreleased Fixed bullet. Update JSDoc to state query inclusion and
repeated-group semantics.

**Verify**: `npm run check && git diff --check` -> exit 0.

## Test plan

- Repeated exact agent groups; repeated wildcard groups; different specificity;
  query-only rule; path+query rule; Allow tie; empty Disallow.
- Assert local/remote parity for every case.

## Done criteria

- [ ] All equally specific matching groups contribute rules.
- [ ] Query strings participate in rule matching.
- [ ] Longest match and Allow ties remain correct.
- [ ] Full checks pass; scoped files only.

## STOP conditions

- Sharing logic introduces a circular dependency.
- A proposed behavior contradicts a pinned robots standard/test; document the
  source and report rather than improvising.
- Public report shape must change.

## Maintenance notes

Keep one semantic implementation if architecture permits. Any future pattern
feature (`$`, `*`, percent encoding) needs parity tests for both APIs.
