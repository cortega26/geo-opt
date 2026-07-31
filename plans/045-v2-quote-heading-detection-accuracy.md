# Plan 045: Correct v2 quote/heading detection (changes v2 scores — maintainer re-baseline required)

> **Executor instructions**: Follow this plan step by step. This plan
> **intentionally changes v2 audit scores** on some fixtures because it fixes
> under-counting bugs. Run every verification command. Where an existing v2
> characterization assertion changes, follow Step 5 carefully — do NOT blindly
> re-baseline; confirm the change is a correction and report deltas. Honor every
> STOP condition. When done, update the status row in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat b09a5f8..HEAD -- src/observations.js tests CHANGELOG.md docs/architecture.md`
> If `src/observations.js` changed since this plan was written, compare the
> "Current state" excerpts against the live code first.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (changes v2 scores; needs fixture re-baseline + maintainer review)
- **Depends on**: none (independent of plan 044, but if both run, do 044 first)
- **Category**: bug
- **Planned at**: commit `b09a5f8`, 2026-06-28

## Why this matters

Three verified defects in the v2 observation engine cause it to **under-detect**
real signals, silently zeroing or mis-scoring dimensions:

1. **Quotes not at end-of-line score 0 (F10).** Attribution is evaluated over an
   end-anchored regex `…(?:\n|$)`, while `totalQuotes` is counted from all inline
   quotes. `scoreQuotations` then recomputes `totalQuotes` from the attribution
   counts, so two mid-line inline quotes (the common case) yield
   `quotesWithAttribution = quotesWithoutAttribution = 0` → the 20-point
   quotation dimension scores 0.
2. **Only ASCII straight quotes are detected (F13).** `"…"` is matched but
   typographic `“…”` (U+201C/201D), routinely emitted by CMSs and word
   processors, is not — so professionally typeset editorial content (where
   quotes matter most) is under-counted.
3. **HTML heading hierarchy is read level-by-level, not in document order (F9).**
   The HTML branch collects all `h1`s, then all `h2`s, etc., so a DOM order of
   `h2, h1, h3` is reordered to `h1, h2, h3` before the "starts with h1?" and
   "skipped level?" checks — defeating both checks for HTML inputs.

The same block also re-locates each repeated stat/quote at its **first**
occurrence's window (F6), so duplicated figures all share one attribution
verdict. This plan fixes that too while it is in the same code.

Because these change v2 scores, the plan carries the project's recalibration
workflow (see `docs/architecture.md` → "Recalibration policy"): score-affecting
changes to v2 are a model-version concern and require maintainer review of the
baseline deltas.

## Current state

All in `src/observations.js`.

**F9 — HTML heading collection, lines 240–245** (inside `observeHeadingHierarchy`):
```js
    headings = [];
    for (let i = 1; i <= 6; i++) {
      body.find(`h${i}`).each((_, el) => {
        const text = $(el).text().replace(/\s+/g, " ").trim();
        if (text) headings.push({ level: i, text, index: headings.length });
      });
    }
```

**F6 (stats) — attribution loop, lines 578–591** (inside `observeAttributionProximity`):
```js
  let statsWithNearbySource = 0;
  let statsWithoutNearbySource = 0;

  for (const stat of stats) {
    const idx = textContent.indexOf(stat);
    if (idx === -1) continue;
    const window = textContent.slice(Math.max(0, idx - 50), idx + 200);
    const hasSource = sourcePatterns.some((p) => p.test(window));
    if (hasSource) {
      statsWithNearbySource++;
    } else {
      statsWithoutNearbySource++;
    }
  }
```

**F10 + F13 + F6 (quotes) — quote attribution, lines 593–628**:
```js
  // Check quote attribution
  const blockquoteCount = (textContent.match(/^>\s+/gm) || []).length;
  const inlineQuotes = textContent.match(/"([^"]{15,})"/g) || [];
  const totalQuotes = blockquoteCount + inlineQuotes.length;

  // ... attributionPatterns array (lines 598-612, KEEP unchanged) ...

  const quoteRegions = textContent.match(/(?:^>\s*.+|"[^"]{15,}")(?:\n|$)/gm) || [];

  let quotesWithAttribution = 0;
  let quotesWithoutAttribution = 0;

  for (const quote of quoteRegions) {
    const idx = textContent.indexOf(quote.trim());
    if (idx === -1) continue;
    const window = textContent.slice(Math.max(0, idx - 80), idx + quote.length + 150);
    const hasAttr = attributionPatterns.some((p) => p.test(window));
    if (hasAttr) {
      quotesWithAttribution++;
    } else {
      quotesWithoutAttribution++;
    }
  }
```

`scoreQuotations` (`src/scoring-v2.js:321-322`) consumes the result as
`totalQuotes = attr.quotesWithAttribution + attr.quotesWithoutAttribution`, which
is why the attribution set and the count must be the *same* set.

**Conventions**: ESM, double quotes, semicolons. v2 tests:
`tests/scoring-v2.test.js`, `tests/observations.test.js`. The v2 model is
characterized against a 32-fixture corpus under `tests/fixtures/audit-v2/`.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| v2 + observation tests | `node --test tests/scoring-v2.test.js tests/observations.test.js` | see Step 5 |
| Full suite | `npm test` | all pass after justified baseline updates |
| Lint / format | `npm run lint` / `npm run format:check` | exit 0 |

## Scope

**In scope**: `src/observations.js`, `tests/observations.test.js`,
`tests/scoring-v2.test.js`, fixture/baseline files under `tests/` that change as
a *justified correction*, `CHANGELOG.md`, and a one-line note in
`docs/architecture.md` "Known blind spots" if any wording becomes inaccurate.

**Out of scope** (do NOT touch):
- `src/scoring-v2.js` math — only `observations.js` changes; the score moves
  because the inputs are corrected, not because thresholds change.
- The v1 path (`src/scoring.js`) — its quote regex has the same ASCII-only
  limitation, but changing v1 is a separate decision; leave it.
- The Python port.
- Any v2 *threshold* value.

## Git workflow

- Branch: `advisor/045-v2-quote-heading-detection-accuracy`
- Commit style: `fix(v2): detect mid-line and typographic quotes, read HTML headings in DOM order`
- Do NOT push or open a PR unless instructed. This plan changes scores; the PR
  needs maintainer review per the recalibration policy.

## Steps

### Step 1: F9 — read HTML headings in document order

Replace lines 240–245 with a single DOM-ordered selector (verified to preserve
order and extract the level from the tag name):
```js
    headings = [];
    body.find("h1, h2, h3, h4, h5, h6").each((_, el) => {
      const tag = (el.tagName || el.name || "").toLowerCase();
      const level = Number(tag.slice(1));
      const text = $(el).text().replace(/\s+/g, " ").trim();
      if (text) headings.push({ level, text, index: headings.length });
    });
```

**Verify**: `node --test tests/observations.test.js` — the existing HTML heading
tests should still pass; if a previously-passing HTML heading test now fails,
inspect whether the OLD expectation was masking this bug (see Step 5).

### Step 2: F6 (stats) — locate each occurrence at its own position

Add a small helper near the top of `src/observations.js` (after the imports):
```js
// Returns the index of the (n+1)-th (0-based) occurrence of needle, or -1.
function nthIndexOf(haystack, needle, n) {
  let idx = -1;
  let from = 0;
  for (let k = 0; k <= n; k++) {
    idx = haystack.indexOf(needle, from);
    if (idx === -1) return -1;
    from = idx + needle.length;
  }
  return idx;
}
```
Replace the stats loop (lines 581–591) so repeated values map to distinct
positions:
```js
  const statSeen = new Map();
  for (const stat of stats) {
    const occurrence = statSeen.get(stat) || 0;
    statSeen.set(stat, occurrence + 1);
    const idx = nthIndexOf(textContent, stat, occurrence);
    if (idx === -1) continue;
    const window = textContent.slice(Math.max(0, idx - 50), idx + 200);
    const hasSource = sourcePatterns.some((p) => p.test(window));
    if (hasSource) {
      statsWithNearbySource++;
    } else {
      statsWithoutNearbySource++;
    }
  }
```

### Step 3: F10 + F13 + F6(quotes) — evaluate attribution over the same quote set, with curly quotes and per-occurrence windows

Replace the quote-attribution code. Keep the `attributionPatterns` array exactly
as-is. Change the count/loop to:
```js
  // Check quote attribution. Evaluate attribution over the SAME quotes that
  // totalQuotes counts: blockquote lines + inline quotes (straight OR curly),
  // each located at its own occurrence so repeated quotes get their own window.
  const blockquoteLines = textContent.match(/^>\s*.+$/gm) || [];
  const inlineQuotes = textContent.match(/["“]([^"”]{15,})["”]/g) || [];
  const evaluatedQuotes = [...blockquoteLines, ...inlineQuotes];
  const totalQuotes = evaluatedQuotes.length;

  // ... attributionPatterns array stays here, unchanged ...

  let quotesWithAttribution = 0;
  let quotesWithoutAttribution = 0;
  const quoteSeen = new Map();
  for (const quote of evaluatedQuotes) {
    const needle = quote.trim();
    const occurrence = quoteSeen.get(needle) || 0;
    quoteSeen.set(needle, occurrence + 1);
    const idx = nthIndexOf(textContent, needle, occurrence);
    if (idx === -1) continue;
    const window = textContent.slice(Math.max(0, idx - 80), idx + needle.length + 150);
    const hasAttr = attributionPatterns.some((p) => p.test(window));
    if (hasAttr) {
      quotesWithAttribution++;
    } else {
      quotesWithoutAttribution++;
    }
  }
```
Delete the now-unused `blockquoteCount` and `quoteRegions` lines. Ensure
`totalQuotes`, `quotesWithAttribution`, `quotesWithoutAttribution` are still
returned by `observeAttributionProximity` exactly as before (same field names).

**Verify**: `npm run lint` → exit 0.

### Step 4: Add crafted-input tests that prove the corrections

In `tests/observations.test.js` (and/or `tests/scoring-v2.test.js`), add:
- **F10**: content with two mid-line inline quotes (≥15 chars each, not at line
  end) → `observeAttributionProximity(...).totalQuotes >= 2` (was 0).
- **F13**: content using typographic `“…”` quotes → counted in `totalQuotes`.
- **F9**: HTML input `"<h2>First</h2><h1>Second</h1>"` →
  `observeHeadingHierarchy` reports an issue containing `"instead of h1"`
  (DOM-first heading is the h2). Was `status: "pass"`.
- **F6**: content with the same stat value repeated where the first occurrence is
  attributed and a later one is not → counts split across
  `statsWithNearbySource`/`statsWithoutNearbySource` (not all-or-nothing).

**Verify**: `node --test tests/observations.test.js` → new tests pass.

### Step 5: Reconcile fixture baselines (maintainer-reviewed)

Run `npm test`. Expect some `tests/scoring-v2.test.js` / characterization
assertions to change because the corrected detection raises quote/heading
signal on real fixtures. For EACH changed assertion:
1. Identify the fixture and dimension that moved.
2. Confirm the move is a **correction in the right direction** — e.g. a fixture
   with mid-line or curly quotes should now score the **quotation** dimension
   *higher*; an HTML fixture starting with a non-h1 should now surface a heading
   issue. If a score moves in a way you cannot explain as a correction, **STOP**.
3. Update the baseline/expected value, and record the old→new delta in the PR
   description and the CHANGELOG entry.

**Verify**: `npm test` → all pass with documented baseline updates only.

### Step 6: Changelog + docs

Under `## [Unreleased]` → `### Fixed`:
```
- v2 quotation scoring now detects mid-line inline quotes and typographic
  (“ ”) quotes, and reads HTML heading hierarchy in document order. Previously
  mid-line quotes scored the quotation dimension as 0, curly quotes were
  ignored, and HTML heading order/skip checks were defeated. This changes v2
  scores on affected content (model patch — see PR for per-fixture deltas).
- v2 attribution proximity now evaluates each repeated statistic/quote at its
  own position instead of always the first occurrence.
```
If `docs/architecture.md` "Known blind spots" claims curly quotes or HTML
heading order are limitations, update that wording.

**Verify**: `npm run changelog:check` → exit 0.

## Test plan

- New crafted-input tests for F9, F10, F13, F6 (Step 4) — these must pass
  independent of fixture baselines.
- Full suite green after justified, documented baseline updates.
- Verification: `npm test` → all pass; new tests assert the corrected behavior.

## Done criteria

ALL must hold:

- [ ] `grep -n "quoteRegions\|blockquoteCount" src/observations.js` returns
      nothing (old logic removed)
- [ ] `grep -n "“" src/observations.js` shows the curly-quote class is present
- [ ] New tests for F9/F10/F13/F6 exist and pass
- [ ] `npm test` exits 0; every changed baseline is documented with an old→new
      delta in the PR description / CHANGELOG
- [ ] `npm run lint`, `npm run format:check`, `npm run changelog:check` exit 0
- [ ] Only in-scope files modified
- [ ] `plans/README.md` status row for 045 updated, and the PR is flagged for
      maintainer review (score-affecting v2 change)

## STOP conditions

Stop and report (do not improvise) if:

- A fixture score moves in a direction you cannot explain as a correction
  (e.g. a quotation dimension *drops* after enabling more quote detection).
- More than a handful of fixtures change, or any change is large (>10 points on
  one fixture) — this suggests a logic error in the rewrite, not a correction.
- The "Current state" excerpts don't match live code (drift).
- `el.tagName`/`el.name` is undefined for headings in the F9 path (cheerio
  version change) — report so the level extraction can be adjusted.

## Maintenance notes

- This is a v2 model patch. The maintainer should decide whether it warrants a
  v2 model-version bump per `docs/architecture.md` "Recalibration policy" before
  release. Do not flip the v1→v2 default as part of this.
- The v1 path (`src/scoring.js:284`) has the same ASCII-only quote limitation,
  intentionally left untouched. If v1 should match, that is a separate plan.
- `nthIndexOf` assumes non-overlapping needles; statistics/quotes are
  non-overlapping tokens, so this holds.
