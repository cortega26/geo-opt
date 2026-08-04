# Plan 095: Close robots ghost groups and pin CLI parity (audit follow-up of 094)

> **Executor instructions**: Base your work on commit `01cf260` (branch
> `advisor/094-robots-parser-parity`) — create your branch FROM that commit,
> not from origin/main. The reviewer diffs against `01cf260`. Do NOT update
> `plans/README.md` — the reviewer maintains the index.
>
> **Drift check (run first)**: `git diff --stat 01cf260..HEAD -- src/robots.js src/fetcher.js tests/optimizer.test.js tests/fetcher.test.js index.d.ts .agents/skills/geo-optimization/scripts/geo_optimizer.py .agents/skills/geo-optimization/scripts/test_optimizer.py tests/conformance.test.js README.md README.es.md CHANGELOG.md` — must print nothing before you start. If it prints changes, STOP and report.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: 094 (APPROVED at `01cf260` on `advisor/094-robots-parser-parity`)
- **Category**: bug / parity / tests
- **Planned at**: `01cf260` (advisor/094-robots-parser-parity), 2026-08-03

## Why this matters

An adversarial audit of the Plan 094 fixes (comma-split agents, comment-line
group continuity, Python combined-group parity, case-insensitive dedup)
found one small correctness bug in the new comma-splitting — a
`User-agent:` line whose tokens are all empty produces a "ghost group" that
silently swallows the following rules — plus two behaviors worth pinning
(CRLF/BOM tolerance, end-to-end CLI parity) that currently work but have no
test coverage. The ghost group is exactly the "rules that never apply" class
of bug the previous plans were closing.

## Findings (all verified empirically on the 094 worktree before planning)

### G1 — `User-agent:` with an all-empty comma list creates a ghost group (rules swallowed)

`parseRobotsGroups("User-agent: ,\nDisallow: /x\nUser-agent: GPTBot\nDisallow: /y")`
produces:

```json
[
  { "agents": [], "rules": [{ "directive": "disallow", "path": "/x" }] },
  { "agents": ["GPTBot"], "rules": [{ "directive": "disallow", "path": "/y" }] }
]
```

The first group has `agents: []` — it can never be selected (`selectGroups`
skips groups with no applicable agents), so its rule `/x` is silently lost,
and the public `parseRobotsGroups` shape emits an invalid group. The same
holds in Python. Verified in both runtimes.

Root cause: the 094 comma-split runs inside the "create group" branch
regardless of whether any token survived the filter.

### G2 — CRLF works in both runtimes but is unpinned; BOM is a REAL Python bug

CRLF (`\r\n`) works in both runtimes (JS and Python `trim`/`strip` handle it)
but has no test — pin it.

**BOM (revised after executor STOP, verified on the worktree):** Node handles
a UTF-8 BOM correctly (`String.prototype.trim` treats U+FEFF as whitespace),
but Python does NOT — `"﻿".isspace()` is `False` in Python, so
`parse_robots_groups` silently drops every line of a BOM-prefixed file and
`audit_robots` reports every path `allowed: True`. Verified end-to-end: the
Python CLI audits a BOM-prefixed robots.txt as fully open. This is the exact
"rules that never apply" class this plan exists to close. So: pin BOM in
Node (behavior is correct), FIX BOM in Python (new finding, folded into G2 —
see Step 2). The plan's original claim "trim handles both" was only true for
Node; the executor correctly stopped on the contradiction.

### G3 — Node↔Python CLI JSON parity is correct today but untested

Running `geo-opt robots audit file -f json` and the Python port's
`robots audit file --format json` on the same file yields identical top-level
keys (`registryVersion,path,wildcard,agents`) and identical `allowed`,
`matchedGroup`, `matchedRule` for every entry (verified empirically with a
comma list + mid-group comment + repeated groups fixture). The existing
conformance smoke (094) only asserts the Python CLI output. Pin the parity
field-by-field so a future port drift fails the gate.

## Current state

### Node — `src/robots.js` `parseRobotsGroups` (~lines 142-180)

After 094, the `User-agent:` branch reads:

```js
const agentMatch = rawLine.match(/^User-agent:\s*(.+)$/i);
if (agentMatch) {
  if (!current || current.rules.length > 0) {
    current = { agents: [], rules: [] };
    groups.push(current);
  }
  // Google's de-facto spec permits comma-separated product tokens on one
  // line; each token is a separate agent (RFC 9309 ABNF only covers one
  // token per line). A trailing comma drops the empty last token.
  for (const token of agentMatch[1]
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)) {
    current.agents.push(token);
  }
  continue;
}
```

### Python — `.agents/skills/geo-optimization/scripts/geo_optimizer.py` `parse_robots_groups` (~lines 1818-1850)

Same structure after 094:

```python
if agent_match:
    if current is None or current["rules"]:
        current = {"agents": [], "rules": []}
        groups.append(current)
    # Google's de-facto spec permits comma-separated product tokens on one
    # line; each token is a separate agent (RFC 9309 ABNF only covers one
    # token per line). A trailing comma drops the empty last token.
    for token in [t.strip() for t in agent_match.group(1).split(",") if t.strip()]:
        current["agents"].append(token)
    continue
```

### Test patterns

- Node parser tests: `tests/optimizer.test.js` — `test("trailing commas and
  stray spaces in User-agent lists are tolerated")` (~line 2227) is the
  closest pattern.
- Python parser tests: `.agents/skills/geo-optimization/scripts/test_optimizer.py`
  — `test_parse_robots_groups_splits_comma_agents` (class-based unittest).
- Conformance: `tests/conformance.test.js` — the `node()` helper (line ~44,
  JSON-parse) and `py()` helper (line ~281) plus the 094 parity smoke case
  "robots audit reflects combined rules of separated equally specific groups"
  (~line 304). The CLI Node robots audit supports `-f, --format json`
  (verified: `node bin/cli.js robots audit --help`).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Node robots unit | `node --test --test-name-pattern="robots|Robots|parseRobots" tests/optimizer.test.js tests/fetcher.test.js` | pass |
| Python unit | `python3 .agents/skills/geo-optimization/scripts/test_optimizer.py` | pass (all) |
| Conformance | `npm run test:conformance` | pass |
| Full check | `npm run check` | exit 0 |
| Diff hygiene | `git diff --check` | exit 0 |

Note: the worktree is a fresh checkout — run `npm install` first. The test
count will grow by 2-3 JS tests (the conformance case and Node pins); the
README badges are gated by `scripts/check-test-count.js` inside `npm run
check`, so update the badges in `README.md`/`README.es.md` to the measured
count (Step 4) — this is REQUIRED in scope, not a deviation.

## Scope

**In scope**: `src/robots.js` (G1 fix only), the Python port
(`geo_optimizer.py`, G1 fix + G2 BOM fix), their tests
(`tests/optimizer.test.js`, `tests/fetcher.test.js`, `test_optimizer.py`),
`tests/conformance.test.js` (G3 pin), `README.md`/`README.es.md`
(test-count badges only), `CHANGELOG.md`.

**Out of scope**: `src/fetcher.js`, the crawler registry, robots generation,
cache semantics, remote origin policy, pattern semantics (`$`, `*`,
percent-encoding — pinned by 094, do not touch), `src/index.js`/`index.d.ts`
(no public shape change), and any behavior beyond the three findings above.

## Git workflow

- Branch: `advisor/095-robots-ghost-groups` — create FROM `01cf260` (the 094
  worktree commit), not from origin/main.
- Commit example: `fix(robots): skip empty User-agent token lists; pin CRLF/BOM and CLI parity`.

## Steps

### Step 1: Fix G1 — do not create a group when the comma split yields no tokens

In `src/robots.js` `parseRobotsGroups`, compute the tokens BEFORE the group
creation, and skip the line entirely when none survive:

```js
const agentMatch = rawLine.match(/^User-agent:\s*(.+)$/i);
if (agentMatch) {
  // Google's de-facto spec permits comma-separated product tokens on one
  // line; each token is a separate agent (RFC 9309 ABNF only covers one
  // token per line). An all-empty list (e.g. "User-agent: ,") is an
  // invalid line: it must not create a ghost group that swallows rules.
  const tokens = agentMatch[1].split(",").map((t) => t.trim()).filter(Boolean);
  if (tokens.length === 0) {
    continue;
  }
  if (!current || current.rules.length > 0) {
    current = { agents: [], rules: [] };
    groups.push(current);
  }
  current.agents.push(...tokens);
  continue;
}
```

Note the rule-swallow consequence: with the fix, `Disallow: /x` right after
`User-agent: ,` is dropped by the existing `ruleMatch && current` guard
(rules outside a group are ignored by design) instead of being captured by a
ghost group — the rule still never applies, but the invalid group no longer
appears in the public `parseRobotsGroups` shape.

In `geo_optimizer.py` `parse_robots_groups`, mirror it:

```python
if agent_match:
    tokens = [t.strip() for t in agent_match.group(1).split(",") if t.strip()]
    if not tokens:
        continue
    if current is None or current["rules"]:
        current = {"agents": [], "rules": []}
        groups.append(current)
    current["agents"].extend(tokens)
    continue
```

**Verify**: G1 tests pass (see Test plan). Existing comma tests
(`trailing commas and stray spaces ...`, `test_parse_robots_groups_splits_comma_agents`)
must still pass unchanged.

### Step 2: Pin CRLF (both) and BOM (Node); FIX BOM in Python

**CRLF pins (both runtimes, no code change):**
`"User-agent: GPTBot\r\nDisallow: /private\r\n"` parses to one group with
one rule whose path is `/private`, and `auditRobots`/`checkRobotsRule`
block `/private/x` for GPTBot (Node API assertions). Mirror in
`test_optimizer.py` on `parse_robots_groups`.

**BOM pin (Node, no code change):** a UTF-8 BOM prefix (`﻿` in JS)
before the first line parses to the same groups as the BOM-less input —
Node's `String.prototype.trim` already treats U+FEFF as whitespace.

**BOM FIX (Python, code change — this is the G2 revision):**

1. In `geo_optimizer.py` `parse_robots_groups`, strip a leading BOM before
   the parse loop:
   ```python
   content = content.lstrip("﻿")
   ```
   placed right after the `groups = []` / `current = None` initialization.
2. The CLI reads robots files at `geo_optimizer.py:1988` with
   `encoding="utf-8"` — change to `encoding="utf-8-sig"` so a BOM-prefixed
   file is decoded correctly end-to-end (the parser fix alone covers direct
   API calls; the CLI fix covers the file-read path; both are one-liners).

**BOM pin (Python, now passes after the fix):** a BOM-prefixed input parses
to the same groups as the BOM-less input, and the CLI JSON audit of a
BOM-prefixed file reports `allowed: false` for a blocked path (this was
`allowed: true` before the fix — confirm the red first by running the probe
against the un-fixed code if you want, but the executor already verified it).

**Verify**: new pins pass in both runtimes; the Python BOM pin FAILS on the
un-fixed parser (already verified by the executor) and passes after the fix;
`node --test --test-name-pattern="robots|Robots|parseRobots" ...` and the
Python suite stay green.

### Step 3: Pin G3 — conformance CLI parity field-by-field

In `tests/conformance.test.js`, add one case (next to the 094 smoke case,
~line 304): write a temp robots.txt with a comma list, a mid-group comment,
and two separated `User-agent: GPTBot` groups (plus a wildcard), then run
BOTH `py(["robots", "audit", tmpFile, "--format", "json"])` and the Node
CLI. NOTE (verified by the executor): the helper is `nodeAudit(fixtureName,
args)` at line ~31 (audit-command-specific, expects a fixture name), NOT a
generic `node()`. Adapt minimally: add a local `node(args)` helper mirroring
`py()` next to it (same pattern: execFileSync of the Node CLI binary with
`--format json`, parse stdout), or reuse `nodeAudit` with a fixture placed
under the fixtures directory if that fits its signature — pick whichever the
existing suite makes easiest and report it in NOTES. Then assert:

- both top-level key sets are equal (sorted) to `registryVersion,path,wildcard,agents`;
- for the `GPTBot` entry and the `wildcard` object, `allowed`, `matchedGroup`
  and `matchedRule` are deep-equal between the two runtimes.

Follow the try/finally temp-file cleanup pattern of the existing cases.

**Verify**: `npm run test:conformance` passes.

### Step 4: Update changelog, badges, and run gates

1. Add one CHANGELOG.md Unreleased Fixed bullet for G1 plus a `test:` bullet
   for G2/G3 pins (follow the 094 bullet wording style).
2. Update the test-count badges in `README.md` and `README.es.md` to the
   measured count (run `node scripts/check-test-count.js` or `npm run check`
   and read its expected number). Update every occurrence (3 spots per file,
   as 094 did). Suite count stays 155.
3. Run `npm run check` (exit 0) and `git diff --check` (exit 0).

**Verify**: `npm run check` exit 0; `git diff --check` exit 0; `git diff --stat 01cf260..HEAD` touches only the scoped files.

## Test plan

Node (`tests/optimizer.test.js` + `tests/fetcher.test.js`):

- G1: `User-agent: ,` + rule → `parseRobotsGroups` returns NO group for that
  line; the rule is not captured by any group; a following valid
  `User-agent:` group parses normally. Also `User-agent: , ,` and
  `User-agent:   ,  ` variants. Assert the full groups array shape.
- G2: CRLF parse pin (agents + rules + a `checkRobotsRule` allowed:false
  assertion); BOM parse pin (groups identical to the BOM-less input).
- G1 parity: same ghost-group fixtures through `checkRobotsRule` — the
  ghost line must not block any agent (no group selected) and must not break
  the following valid group's blocking.

Python (`test_optimizer.py`, mirroring):

- G1: `User-agent: ,` produces no group; subsequent group intact.
- G2: CRLF and BOM pins on `parse_robots_groups`.

Assert real shapes (`groups`, `agents`, `rules[0].path`), not only `allowed`.

## Done criteria

- [ ] `User-agent:` lines with an all-empty comma list create no group and
      swallow no rules, in `parseRobotsGroups` (Node) and
      `parse_robots_groups` (Python); public shape emits no `agents: []`
      groups.
- [ ] CRLF and BOM inputs pinned by tests in both runtimes; behavior unchanged.
- [ ] Conformance case asserts field-by-field CLI JSON parity
      (keys, `allowed`, `matchedGroup`, `matchedRule`) between Node and
      Python for a mixed fixture.
- [ ] `npm run check` exit 0; `git diff --check` exit 0; only scoped files
      changed; README badges updated to the measured count.

## STOP conditions

- If `git diff --stat 01cf260..HEAD -- <drift files>` prints anything before
  you start, STOP and report (the base moved).
- If neither `nodeAudit` nor a local `node()` helper works for the parity
  case (e.g. the Node CLI audit output shape differs from the Python one in
  a way that breaks the field comparison), STOP and report with the actual
  outputs — do not weaken the parity assertion.
- If G1's `continue` breaks any existing test that asserts a group IS created
  for `User-agent: ,`-style input, STOP and report with the test name — do
  not "fix" the specification.

## Maintenance notes

- The parser's group-creation invariant is now: a group only exists with at
  least one agent token. Future parser work must keep that invariant — ghost
  groups silently drop rules, the exact failure class 078/094 closed.
- G2 pins the de-facto tolerance (trim handles CRLF/BOM); if a stricter
  parser is ever wanted, it is a deliberate behavior change, not a bug fix.
- G3 pins end-to-end parity at the CLI boundary; the conformance suite is the
  right home for it — unit-level parity lives in the mirrored test tables.
- Badge policy reminder: any plan adding JS tests must scope the README badge
  update in from the start; the changelog policy requires a CHANGELOG bullet
  for `tests/*.js` commits.
