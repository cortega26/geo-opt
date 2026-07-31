# Plan 044: Fix three v2/profile correctness defects that do NOT change audit scores

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If a
> "STOP conditions" item occurs, stop and report. When done, update the status
> row for this plan in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat b09a5f8..HEAD -- src/scoring-v2.js src/findings.js src/profiles.js src/config.js tests CHANGELOG.md`
> If any of those `src/` files changed since this plan was written, compare the
> "Current state" excerpts against the live code first.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `b09a5f8`, 2026-06-28

## Why this matters

Three small, verified defects in the v2/profile path. Each is corrected here
**without changing any audit score** — they touch remediation text, a named
constant (value unchanged), and a metadata confidence value. (The v2 fixes that
*do* move scores are handled separately in plan 045, which carries the model
re-baseline workflow.)

1. **Dead `missing_h1` remediation branch (F5).** Two consumers gate a
   remediation string on `headingHierarchy.issues.includes("missing_h1")`, but
   `observeHeadingHierarchy` never emits that token — its issue strings are
   human-readable (`Document starts with h2 ("…") instead of h1`). So when the
   real problem is a missing H1, the audit always falls through to the generic
   "fix skipped heading levels" remediation, giving wrong advice.
2. **Silent v2 pronoun-density fork (F7).** v1, `config.js`, and the Python port
   use `MAX_PRONOUN_DENSITY = 0.02`; v2 hardcodes a looser `?? 0.05` inline
   literal. The value is left as-is (changing it is a model-version decision),
   but the magic number is replaced with a documented named constant so the
   divergence is explicit, not hidden.
3. **Unreachable low-confidence branch (F14).** `detectProfile` pushes a default
   reason before computing `confidence: reasons.length > 0 ? 0.4 : 0.2`, so the
   `0.2` ("no signal at all") value is never returned.

## Current state

**F5 — consumer A, `src/scoring-v2.js:73`** (inside the heading-issue finding):
```js
        remediation: obs.headingHierarchy.issues.includes("missing_h1")
          ? "Add a single H1 heading as the page title so parsers can identify the main topic."
          : "Fix skipped heading levels: " +
            obs.headingHierarchy.issues.join(", ") +
            ". Use a sequential H1→H2→H3 hierarchy without gaps.",
```

**F5 — consumer B, `src/findings.js:532`**:
```js
        remediation: observations.headingHierarchy.issues.includes("missing_h1")
          ? "Add a single H1 heading as the page title."
          : "Fix heading hierarchy issues: " +
            (observations.headingHierarchy.issues || []).join(", ") +
            ". Use sequential H1→H2→H3 without skipping levels.",
```

The token is produced nowhere in `observeHeadingHierarchy`; the missing-h1 issue
string is built at **`src/observations.js:264`**:
```js
    issues.push(`Document starts with h${headings[0].level} ("${headings[0].text}") instead of h1`);
```
(`HeadingObservation` in `index.d.ts:204` is a public type; do NOT add a new
field to it — fix on the consumer side instead.)

**F7 — `src/scoring-v2.js:549`**:
```js
    const pronounLimit = config?.limits?.max_pronoun_density ?? 0.05;
```
`src/config.js:6` already exports `export const MAX_PRONOUN_DENSITY = 0.02;`
(used by v1 at `src/scoring.js`).

**F14 — `src/profiles.js:283-286`**:
```js
  if (reasons.length === 0) {
    reasons.push("no specific profile signals detected; defaulting to editorial");
  }
  return { profile: "editorial", confidence: reasons.length > 0 ? 0.4 : 0.2, reasons };
```

**Conventions**: ESM, double quotes, semicolons, camelCase. v2/profile tests live
in `tests/scoring-v2.test.js`, `tests/profiles.test.js`, `tests/observations.test.js`.
No existing test asserts the missing-h1 remediation text or pins `detectProfile`
confidence to exactly `0.4` (verified at plan-writing time).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| v2 tests | `node --test tests/scoring-v2.test.js` | all pass |
| profile tests | `node --test tests/profiles.test.js` | all pass |
| Full suite | `npm test` | all pass |
| Lint / format | `npm run lint` / `npm run format:check` | exit 0 |

## Scope

**In scope**: `src/scoring-v2.js`, `src/findings.js`, `src/profiles.js`,
`src/config.js`, the matching test files, `CHANGELOG.md`.

**Out of scope** (do NOT touch):
- `src/observations.js` heading logic — F5 is fixed on the consumer side; do not
  change the observation or its public `HeadingObservation` type.
- Any v2 scoring *value* — do NOT change `0.05` to `0.02`. That is plan 045 /
  a model-version decision, not this plan.
- The Python port.

## Git workflow

- Branch: `advisor/044-v2-safe-correctness-fixes`
- Commit style: `fix(v2): correct missing-h1 remediation, name v2 pronoun limit, reachable low confidence`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: F5 — detect missing-h1 from the actual issue text

In both consumers, replace `…issues.includes("missing_h1")` with a check that
matches the real issue string. Use `.some((i) => i.includes("instead of h1"))`.

`src/scoring-v2.js:73` → change the condition to:
```js
        remediation: obs.headingHierarchy.issues.some((i) => i.includes("instead of h1"))
```
`src/findings.js:532` → change the condition to:
```js
        remediation: observations.headingHierarchy.issues.some((i) => i.includes("instead of h1"))
```
Leave both ternary branches' text unchanged.

**Verify**: `npm run lint` → exit 0.

### Step 2: F7 — name the v2 pronoun-density default (value unchanged)

In `src/config.js`, immediately after the existing `MAX_PRONOUN_DENSITY` export
(line 6), add:
```js
// v2 intentionally uses a looser pronoun-density ceiling than v1 (0.02).
// Changing this value alters v2 ranking and is a model-version decision
// (see docs/architecture.md "Recalibration policy"); do not retune casually.
export const MAX_PRONOUN_DENSITY_V2 = 0.05;
```
In `src/scoring-v2.js`, import `MAX_PRONOUN_DENSITY_V2` from `./config.js`
(add it to the existing config import if there is one; otherwise add an import),
and change line 549 to:
```js
    const pronounLimit = config?.limits?.max_pronoun_density ?? MAX_PRONOUN_DENSITY_V2;
```
The numeric default is still `0.05`, so no score changes.

**Verify**: `node --test tests/scoring-v2.test.js` → all pass (unchanged scores).

### Step 3: F14 — make the 0.2 confidence reachable

In `src/profiles.js`, capture whether there was any signal BEFORE pushing the
default reason. Replace lines 283–286 with:
```js
  const hadSignal = reasons.length > 0;
  if (!hadSignal) {
    reasons.push("no specific profile signals detected; defaulting to editorial");
  }
  return { profile: "editorial", confidence: hadSignal ? 0.4 : 0.2, reasons };
```

**Verify**: `node --test tests/profiles.test.js` → all pass.

### Step 4: Add targeted tests

- **F5**: in `tests/scoring-v2.test.js`, add a test that audits Markdown
  content whose first heading is an `##` (h2) with no `#` (h1), locates the
  `v2.observations.heading_hierarchy` finding (or the heading finding the v2
  report exposes), and asserts its `remediation` contains `"Add a single H1"`.
  Model it on the existing v2 finding-assertion tests in that file.
- **F14**: in `tests/profiles.test.js`, add a test that calls
  `detectProfile("<some prose with no profile signals>")` and asserts
  `confidence === 0.2`. (Use content that triggers no commercial/doc/etc.
  signals — short neutral prose.)
- **F7**: no behavioral test needed (value unchanged); optionally assert
  `MAX_PRONOUN_DENSITY_V2` is exported and equals `0.05`.

**Verify**: `npm test` → all pass including the new tests.

### Step 5: Changelog

Under `## [Unreleased]` → `### Fixed`:
```
- v2 audit now shows the correct "Add a single H1" remediation when a document's
  first heading is not an H1 (previously always showed the generic
  skipped-levels remediation).
- `detectProfile` now returns confidence 0.2 for content with no profile signals
  (previously unreachable; always returned 0.4).
```
Under `### Changed`:
```
- The v2 pronoun-density ceiling is now the named constant `MAX_PRONOUN_DENSITY_V2`
  (value unchanged at 0.05) to make its intentional divergence from v1 explicit.
```

**Verify**: `npm run changelog:check` → exit 0.

## Test plan

- New F5 test in `tests/scoring-v2.test.js` (missing-h1 → correct remediation).
- New F14 test in `tests/profiles.test.js` (no-signal → confidence 0.2).
- Optional F7 export assertion.
- `npm test` → all pass; **no existing scoring/characterization assertion
  changes** (these fixes are score-neutral).

## Done criteria

ALL must hold:

- [ ] `npm test` exits 0 with the new tests added and **no existing test
      modified to accommodate a score change** (if an existing score assertion
      changes, STOP — see below)
- [ ] `grep -n "missing_h1" src/scoring-v2.js src/findings.js` returns nothing
- [ ] `grep -n "MAX_PRONOUN_DENSITY_V2" src/config.js src/scoring-v2.js` shows
      the constant defined and used
- [ ] `npm run lint`, `npm run format:check`, `npm run changelog:check` exit 0
- [ ] Only the in-scope files modified
- [ ] `plans/README.md` status row for 044 updated

## STOP conditions

Stop and report if:

- Any **existing** test assertion about a v2 score, breakdown, or
  characterization value changes as a result of these edits. These three fixes
  are designed to be score-neutral; a score change means an assumption is wrong
  (e.g. F7's value was silently being overridden somewhere) — report it rather
  than re-baselining.
- The "Current state" excerpts don't match live code (drift).
- Removing the `missing_h1` token reference reveals a third consumer not listed
  here (`grep -rn "missing_h1" src/` should show only `technical.js`, which is
  out of scope and correct as-is).

## Maintenance notes

- F5 now couples to the substring `"instead of h1"` in
  `observations.js:264`. If that message is reworded, update both consumers. A
  cleaner future refactor: have `observeHeadingHierarchy` emit a stable `codes`
  array (e.g. `["missing_h1"]`) alongside `issues` and add `codes?: string[]`
  to `HeadingObservation` in `index.d.ts` — deferred here to avoid a public-type
  change for a text fix.
- `technical.js:206` legitimately emits the literal `"missing_h1"` token in its
  own (separate) heading path; do not "unify" it as part of this plan.
- If the maintainer later decides v2 should match v1's `0.02`, that is a
  separate model-version change (MAJOR v2 bump) handled like plan 045.
