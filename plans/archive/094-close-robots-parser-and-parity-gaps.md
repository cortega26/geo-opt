# Plan 094: Close robots parser and Node/Python parity gaps (audit follow-up of 078)

> **Executor instructions**: Base your work on commit `674b1bc` (branch
> `advisor/078-robots-matching`) — create your branch FROM that commit,
> not from origin/main. The reviewer diffs against `674b1bc`. Do NOT update
> `plans/README.md` — the reviewer maintains the index.
>
> **Drift check (run first)**: `git diff --stat 674b1bc..HEAD -- src/robots.js src/fetcher.js tests/optimizer.test.js tests/fetcher.test.js index.d.ts .agents/skills/geo-optimization/scripts/geo_optimizer.py .agents/skills/geo-optimization/scripts/test_optimizer.py tests/conformance.test.js README.md README.es.md CHANGELOG.md` — must print nothing before you start. If it prints changes, STOP and report.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: 078 (APPROVED at `674b1bc` on `advisor/078-robots-matching`)
- **Category**: bug / parity / tests
- **Planned at**: `674b1bc` (advisor/078-robots-matching), 2026-08-03

## Why this matters

An adversarial audit of the Plan 078 implementation (combine equally specific
robots groups, query-string matching) found five gaps and one documented
behavior worth pinning. Two are real correctness bugs in `parseRobotsGroups`
that silently drop or ignore rules; one is a Node/Python semantic divergence
that breaks the documented "compatible" capability contract; two are small
reporting/consistency issues. None were introduced by 078 itself — they are
pre-existing in the parser layer that 078 rewired — but they live exactly in
the semantics 078 promised to fix (rules that never apply), so closing them
now keeps the area coherent.

## Findings (all verified empirically on the 078 worktree before planning)

### H1 — Comma-separated `User-agent:` tokens never match (rules silently ignored)

A robots file with `User-agent: GPTBot, Googlebot` produces ONE group whose
agents array contains the single string `"GPTBot, Googlebot"`. `agentApplies`
substring-matches the whole token, so the group applies to neither `GPTBot`
nor `Googlebot` and its rules are silently ignored — `checkRobotsRule` and
`auditRobots` both return `allowed: true` for paths the site intends blocked.

The Google de-facto spec (which the RFC 9309 ABNF does not cover — it defines
`product-token = identifier / "*"`, one per line) explicitly permits
comma-separated product tokens, and real-world robots.txt files use them.
Measured: `checkRobotsRule("https://x.com/private/d", groups, "GPTBot")` →
`{allowed: true}` with `User-agent: GPTBot, Googlebot\nDisallow: /private`.

### H2 — A comment-only line inside a group ends the group and drops following rules

`parseRobotsGroups` strips `#...` then treats any empty line as a group
terminator (`current = null`). A comment line inside a group therefore ends
the group, and the next rule line is dropped (rules before any
`User-agent:` are ignored by design). Measured:
`User-agent: GPTBot\n# nota\nDisallow: /private` → group has `rules: []` and
`checkRobotsRule(..., "GPTBot")` → `{allowed: true}`. RFC 9309 treats comment
lines as ignorable, not as group separators; only blank lines end a group.

### H3 — Python port keeps pre-078 single-group semantics (capability contract broken)

The Python port (`geo_optimizer.py`) duplicates the OLD algorithm:
`select_robots_group` returns a single group and `evaluate_robots_group`
evaluates one. The capability matrix (`docs/architecture.md`) declares robots
audit as `compatible`; after 078, Node and Python can disagree on the same
file — e.g. two `User-agent: GPTBot` groups: Node combines their rules,
Python uses only the first. `parse_robots_groups` in Python also carries H1
and H2. The Python side also lacks query participation only if callers pass
a query-less path (its `target_path` is caller-supplied; the Node fetcher
builds `pathname + search` — but the Python CLI has no remote fetch, so the
parity fix is confined to group selection and parsing).

### H4 — `matchedGroup` dedup is case-sensitive

`collectMatchedAgents` dedups with a case-sensitive `Set`. Two groups with
`User-agent: GPTBot` / `User-agent: gptbot` (the matching itself is
case-insensitive) report `matchedGroup: ["GPTBot", "gptbot"]` instead of one
token. Measured. Cosmetic but inconsistent with matching semantics.

### H5 — Percent-encoding is matched byte-for-byte; pin, do not change

Current behavior (both APIs, verified): rule `/mi%20carpeta` blocks URI
`/mi%20carpeta/a`; a rule written with a literal space does not block the
`%20` form. RFC 9309 §2.2.2 specifies percent-encoded octets in the URI be
unencoded prior to comparison except reserved characters; the byte-for-byte
practice is what major implementations (and this repo) do. **Do NOT change
this behavior** — the risk/benefit is negative. Pin it with tests and a
maintenance note instead.

### H6 — `$`-anchored rules do not match a query; pin the current (correct) behavior

`Disallow: /page$` matches `/page` but not `/page?x=1` — correct per RFC 9309
§2.2.3 (`$` = end of match pattern; query participates in the path being
matched). This is the desired post-078 semantics and is currently untested.
Pin it.

## Current state

### Node — `src/robots.js`

- `parseRobotsGroups` at lines 142-173. The two buggy lines:
  ```js
  const agentMatch = rawLine.match(/^User-agent:\s*(.+)$/i);
  if (agentMatch) {
    if (!current || current.rules.length > 0) {
      current = { agents: [], rules: [] };
      groups.push(current);
    }
    current.agents.push(agentMatch[1].trim());   // H1: whole comma string
    continue;
  }
  ```
  and the terminator logic at 146-151:
  ```js
  rawLine = rawLine.replace(/#.*/, "").trim();   // H2: comment becomes ""
  if (!rawLine) {
    current = null;                              // H2: ends the group
    continue;
  }
  ```
- `agentApplies` at 175-180 (`agentPattern === "*"` → true, else case-insensitive substring).
- `collectMatchedAgents` at ~266-286 (case-sensitive `Set` dedup — H4).
- Shared helpers `selectGroups` (195-215) and `evaluateSelectedGroups`
  (242-264) already implement the correct combined semantics — no change there.

### Python — `.agents/skills/geo-optimization/scripts/geo_optimizer.py`

- `parse_robots_groups` at 1816-1849 — same H1/H2 bugs (comment strip at 1819-1821, `current = None` at 1820, whole-token push at 1828).
- `select_robots_group` at 1852-1863 — single-group selection (H3).
- `evaluate_robots_group` at 1876-1900 — single-group evaluation (H3).
- `audit_robots` at 1918-1943 — calls `select_robots_group` + `evaluate_robots_group` per registry entry and for the wildcard.
- Python's `robots_rule_matches_path` (1865-1874) already handles `$` and `*` correctly; leave it as-is.

### Existing test patterns

- Node robots unit tests: `tests/optimizer.test.js` `test("auditRobots combines rules from repeated equally specific groups")` at ~2046, and `tests/fetcher.test.js` `describe("checkRobotsRule")` at 1070.
- Python unit tests: `.agents/skills/geo-optimization/scripts/test_optimizer.py` — class-based `unittest`; robots tests at lines 78-113 (`test_check_robots_*`). Import style: `from geo_optimizer import (..., audit_robots, generate_robots_txt, check_robots, ...)`.
- Conformance: `tests/conformance.test.js` — `py(["robots", "audit", tmpFile])` smoke tests at 290-302; `node()`/`py()` helpers parse JSON at lines 44/55.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Node robots unit | `node --test --test-name-pattern="robots|Robots|parseRobots" tests/optimizer.test.js tests/fetcher.test.js` | pass |
| Python unit | `python3 .agents/skills/geo-optimization/scripts/test_optimizer.py` | pass (all) |
| Conformance | `npm run test:conformance` | pass |
| Full check | `npm run check` | exit 0 |
| Diff hygiene | `git diff --check` | exit 0 |

Note: the worktree is a fresh checkout — run `npm install` first. The test
count will grow; the README badges are gated by `scripts/check-test-count.js`
inside `npm run check`, so updating the badges in `README.md`/`README.es.md`
is REQUIRED in scope (see Step 5).

## Scope

**In scope**: `src/robots.js` (parser + dedup only), the Python port
(`geo_optimizer.py`), their tests (`tests/optimizer.test.js`,
`tests/fetcher.test.js`, `test_optimizer.py`), a conformance parity case,
`README.md`/`README.es.md` (test-count badges only), `CHANGELOG.md`.

**Out of scope**: `src/fetcher.js` (its `checkRobotsRule` already delegates
to the shared helpers — no change needed; do not touch it), the crawler
registry, robots generation, cache semantics, remote origin policy, `$`/`*`
pattern semantics, percent-encoding behavior (H5 — pin only), and
`src/index.js`/`index.d.ts` (no public shape change).

## Git workflow

- Branch: `advisor/094-robots-parser-parity` — create FROM `674b1bc` (the
  078 worktree commit), not from origin/main.
- Commit example: `fix(robots): parse comma agents, keep groups across comments, align Python`.

## Steps

### Step 1: Fix H1 in the Node parser — split comma-separated user-agent tokens

In `src/robots.js` `parseRobotsGroups`, replace the single push with a split:

```js
for (const token of agentMatch[1].split(",").map((t) => t.trim()).filter(Boolean)) {
  current.agents.push(token);
}
```

The empty-filter drops a trailing comma (`User-agent: GPTBot,`). The
wildcard in a comma list (`User-agent: *, GPTBot`) now yields `["*", "GPTBot"]`,
so the group applies to everyone via `agentApplies("*", ...)` — which is the
Google-spec intent.

**Verify**: add unit tests to `tests/optimizer.test.js` and
`tests/fetcher.test.js` (see Test plan) — the new tests pass and previously
they failed with `allowed: true` (write them first to confirm the red).

### Step 2: Fix H2 in the Node parser — comment-only lines do not end a group

In `src/robots.js` `parseRobotsGroups`, distinguish a true blank line from a
comment-only line before the terminator decision:

```js
for (const rawLine of content.split("\n")) {
  const trimmed = rawLine.trim();
  const withoutComment = trimmed.replace(/#.*/, "").trim();
  if (!withoutComment) {
    if (!trimmed) {
      current = null;   // real blank line ends the group
    }
    continue;           // comment-only line: keep current group open
  }
  rawLine = withoutComment;
  // ... rest unchanged (agentMatch / ruleMatch)
}
```

Careful: keep the existing behavior that a rule before any `User-agent:`
line is dropped (`ruleMatch && current`), and that consecutive `User-agent:`
lines without rules in between merge into one group.

**Verify**: the H2 regression tests pass (rule after a mid-group comment now
applies); blank-line separation behavior is unchanged (existing tests cover
it).

### Step 3: Fix H3 — port combined-group semantics to Python

In `geo_optimizer.py`:

1. Apply the H1 and H2 parser fixes to `parse_robots_groups` (same logic,
   Python syntax: `re.sub(r"#.*", "", line)` already exists; split with
   `[t.strip() for t in group(1).split(",") if t.strip()]`; comment-only
   lines skip without setting `current = None`, blank lines still do).
2. Replace `select_robots_group` with a plural `select_robots_groups(groups,
   target_agent)` that returns ALL equally specific groups (mirror the Node
   `selectGroups` logic: track `best_length = -1`, per group take the max
   agent length among applicable agents, collect groups with `== best_length`,
   reset when a longer one appears).
3. Replace `evaluate_robots_group` with `evaluate_robots_groups(groups,
   target_path)` that evaluates the merged rules of all selected groups
   (same longest-match + Allow-on-equal-length logic, loop over groups then
   rules). Empty list → `{"allowed": True, "matchedRule": None}`.
4. Update `audit_robots` (1918-1943) to call the new plural functions for
   both the wildcard and each registry entry. Keep `robots_rule_matches_path`
   untouched.
5. Keep the report shape identical (`matchedGroup`, `allowed`, `matchedRule`).

**Verify**: Python unit tests in `test_optimizer.py` mirroring the Node test
table pass; `python3 .../test_optimizer.py` all green.

### Step 4: Fix H4 — case-insensitive matchedGroup dedup (both runtimes)

- Node `collectMatchedAgents` in `src/robots.js`: dedup with
  `seen` keyed on `agent.toLowerCase()`, but keep the first-seen original
  casing in the output array.
- Python: same dedup in the code that builds `matchedGroup` inside
  `audit_robots` (it currently uses `group["agents"]` of the single selected
  group — now `None` when no groups, else the deduped union of agents across
  the selected groups, document order).

**Verify**: a test with `User-agent: GPTBot` / `User-agent: gptbot` in
separate groups reports `matchedGroup` with one entry.

### Step 5: Pin H5/H6 behaviors, update changelog and badges

1. Add pin tests (no behavior change):
   - H5: rule `/mi%20carpeta` blocks `/mi%20carpeta/a`; rule written with a
     literal space does NOT block the `%20` form (assert `allowed: true`).
   - H6: rule `/page$` blocks `/page`, does NOT block `/page?x=1`.
   Add the H6 pin to both Node APIs (auditRobots + checkRobotsRule parity).
2. Add one CHANGELOG.md Unreleased Fixed bullet covering the whole plan
   (commas, comments, Python parity, pins) and one `test:` bullet if the
   policy requires a separate tests bullet (check how 078/092 bullets look).
3. Update the test-count badges in `README.md` and `README.es.md` to the
   actual number measured by `node scripts/check-test-count.js` (or run
   `npm run check` and read its failure output — it prints the expected
   number). Update every occurrence of the old count in both files
   (3 spots each, as 078 did). Do NOT change suite count unless it changed.

**Verify**: `node scripts/check-test-count.js` passes; `npm run check` exit 0.

### Step 6: Conformance parity smoke

Add one conformance case in `tests/conformance.test.js` following the
existing pattern at lines 290-302: write a robots.txt with two separated
`User-agent: GPTBot` groups plus a wildcard, run `py(["robots", "audit",
tmpFile])`, and assert the output reflects the combined decision (e.g. the
path blocked only by the second group appears blocked). Keep it a smoke
assertion on the Python CLI output, not a byte-exact comparison.

**Verify**: `npm run test:conformance` passes.

## Test plan

Node (`tests/optimizer.test.js` + `tests/fetcher.test.js`), following the
existing `describe("checkRobotsRule")` and `test("auditRobots ...")` patterns:

- H1: comma list with two agents blocks each agent; comma list with `*`
  applies to a third agent; trailing comma is tolerated; spaces around
  commas tolerated; parity auditRobots ↔ checkRobotsRule for each.
- H2: rule after a mid-group comment applies; comment between two
  `User-agent:` lines keeps them in ONE group (agents merged); blank line
  still separates groups (existing behavior preserved).
- H3 parity: the Node test table (repeated exact agent, repeated wildcard,
  Allow tie, query-only rule, path+query, different specificity) has Python
  mirrors in `test_optimizer.py` with identical inputs/assertions.
- H4: mixed-case duplicate tokens → single deduped entry in `matchedGroup`.
- H5 pin: percent-encoding byte-for-byte cases (both Node APIs).
- H6 pin: `$` rule vs plain and query-bearing URLs (both Node APIs + parity).

Assert both `allowed` and `matchedRule` where meaningful — do not assert
only `allowed`.

## Done criteria

- [ ] `User-agent: A, B` groups apply to both A and B (and `*` in a comma
      list applies to everyone) in `auditRobots` and `checkRobotsRule`.
- [ ] Comment-only lines inside a group no longer drop following rules; real
      blank lines still end a group.
- [ ] Python `audit_robots` returns the same decisions as Node `auditRobots`
      for the combined-group test table; Python unit suite green.
- [ ] `matchedGroup` dedup is case-insensitive in both runtimes; report shape
      unchanged (`string[] | null`).
- [ ] H5/H6 behaviors pinned by tests; percent-encoding behavior NOT changed.
- [ ] `npm run check` exit 0; `git diff --check` exit 0; only scoped files
      changed; README badges updated to the real count.

## STOP conditions

- If `git diff --stat 674b1bc..HEAD -- <drift files>` prints anything before
  you start, STOP and report (the base moved).
- If the conformance CLI (`py(...)`) cannot run in the worktree environment
  (missing python3), report it and proceed with the unit tests — do not
  improvise a different parity mechanism.
- If any existing test that asserts comma-agent or comment behavior
  contradicts H1/H2 as specified, STOP and report with the test name — do
  not "fix" the specification.
- If the Python report shape would change beyond `matchedGroup` content,
  STOP and report — the capability matrix contract must stay compatible.

## Maintenance notes

- The Node parser and the Python port must stay in semantic lockstep: any
  future pattern feature (`$`, `*`, percent encoding, comments) needs parity
  tests for both APIs. This plan pins percent-encoding byte-for-byte on
  purpose — revisit H5 only with an explicit product decision, citing RFC
  9309 §2.2.2 (unencoded prior to comparison except reserved chars) versus
  the de-facto byte-wise practice.
- `agentApplies` substring matching is inherited behavior — the RFC 9309
  token semantics are exact-match; do not "fix" substring matching without
  an explicit decision and regression corpus.
- The README badge policy: any plan that adds JS tests must scope the badge
  update in from the start (the repo's changelog policy also requires a
  CHANGELOG bullet for `tests/*.js` commits).
- The `*`-in-comma-list group now applies to every crawler — a file that
  previously ignored that group entirely will now enforce it. That is the
  intent (rules were silently ignored), but it can flip `allowed` for files
  in the wild; watch for reports of that in review.
