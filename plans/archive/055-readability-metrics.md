# Plan 055: Add real readability metrics (`text-readability`), language-aware

> **Executor instructions**: Follow this plan step by step. This plan has a
> **decision gate (Step 0)** that must be resolved before any dependency is
> added. Run every verification command and confirm the expected result before
> moving on. If a "STOP conditions" item occurs, stop and report. When done,
> update the status row in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 13fb3bf..HEAD -- src/text.js src/scoring.js src/observations.js src/index.js index.d.ts`
> If any changed since this plan was written, compare against the live code.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: MED (a naive English readability formula on Spanish content reports a
  *misleading* grade — worse than no metric; the language decision is mandatory)
- **Horizon**: medium term (reevaluate when there is demand for richer clarity
  signals and the language strategy is settled)
- **Depends on**: none, but interacts with the v2 clarity observations
- **Category**: feature (GEO signal quality)
- **Planned at**: commit `13fb3bf`, 2026-06-29

## Why this matters

Reading ease is a genuine GEO signal: AI answer engines extract and quote
content that is clear and well-structured. Today the project's readability
utility is shallow:

```js
// src/text.js:81
export function calculateReadability(text) {
  const sentences = text.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean);
  const words = text.match(/\b\w+\b/g) || [];
  if (sentences.length === 0 || words.length === 0) {
    return { wordCount: 0, avgSentenceLen: 0 };
  }
  return { wordCount: words.length, avgSentenceLen: words.length / sentences.length };
}
```

It returns only word count and average sentence length. Real indices
(Flesch–Kincaid grade, Gunning fog, SMOG, etc.) add a defensible, well-known
reading-grade signal. [`text-readability`](https://www.npmjs.com/package/text-readability)
is a focused, low-cost library that computes these.

**The honest tradeoff** — and why this is medium-term, not a quick win: the
project's real audits include Spanish content (e.g. monedario.cl), and the
classic indices in `text-readability` are **English-tuned** (English
syllable-counting and word-length constants). Applying English Flesch to Spanish
text yields a confident-but-wrong grade, which is worse than reporting nothing.
So this plan must first decide a language strategy; the dependency only earns
its place if the output is correct for the content actually being audited.

## Current state

- `calculateReadability` (`src/text.js:81`) — public export, declared in
  `index.d.ts`, re-exported from `src/index.js:19`, directly tested
  (`tests/optimizer.test.js:85`, `tests/consumer.test.ts:219`). Its return shape
  `{ wordCount, avgSentenceLen }` is a **public contract** — extend it
  additively, do not break it.
- It is a standalone utility: the v1 "Semantic Clarity & Readability" scoring
  block (`src/scoring.js:334`) and the v2 clarity observations compute their own
  paragraph/sentence metrics and do **not** consume `calculateReadability`'s
  output. So adding indices here does not automatically change any score — wiring
  them into scoring is a separate, explicit decision (and, for v2, a
  recalibration governed by `docs/architecture.md`).
- There is no language detection in the pipeline today.

## Commands you will need

| Purpose       | Command                         | Expected |
|---------------|---------------------------------|----------|
| Install       | `npm install text-readability`  | exit 0; in `dependencies` |
| Tests         | `npm test`                      | all pass |
| Typecheck     | `npm run typecheck`             | exit 0   |
| Full check    | `npm run check`                 | exit 0   |

## Step 0 — Decision gate (resolve before installing anything)

Pick ONE and record the choice in the PR description:

- **(A) English-only indices, gated by language.** Add a lightweight language
  signal (frontmatter `lang`, HTML `lang` attribute, or a tiny heuristic) and
  compute `text-readability` indices **only** when the content is English.
  For non-English content, return the existing `{ wordCount, avgSentenceLen }`
  and a `readingGrade: null` with a reason. Honest and safe.
- **(B) Language-appropriate indices.** Use the Spanish-tuned analog
  (Fernández-Huerta / Szigriszt-Pazos) for Spanish and Flesch family for
  English. Larger scope; only choose if there is demand and a tested formula
  source. May not be fully covered by `text-readability` alone.
- **(C) Defer.** If neither demand nor a clean language strategy exists yet,
  keep this plan `DEFERRED` and do not add the dependency. This is an acceptable
  outcome — record it and stop.

If you choose (C), update `plans/README.md` to keep 055 `DEFERRED` and stop here.
Steps 1+ assume (A) (the recommended minimal path) unless the maintainer
selected (B).

## Scope (for path A)

**In scope**:
- `src/text.js` — extend `calculateReadability` **additively** with reading-grade
  fields, computed only for the supported language; add language gating.
- `index.d.ts` + `src/index.js` — update the declared return type additively.
- `tests/` — tests for English grade output and the non-English null path.
- `CHANGELOG.md`.

**Out of scope**:
- Changing any **score**. Wiring new indices into v1/v2 scoring is a separate
  plan; for v2 it is a recalibration requiring maintainer sign-off per
  `docs/architecture.md`. This plan only enriches the utility's output.
- Breaking the existing `{ wordCount, avgSentenceLen }` fields.
- Python port.

## Git workflow

- Branch: `advisor/055-readability-metrics`
- Commit: `feat(text): add language-gated reading-grade metrics to calculateReadability`
- Do NOT push or open a PR unless instructed.

## Steps (path A)

### Step 1: Install `text-readability`

```bash
npm install text-readability
```

**Verify**: import works; package is under `dependencies`.

### Step 2: Extend `calculateReadability` additively

Keep `wordCount` and `avgSentenceLen`. Add an optional language argument (or a
detected signal) and, when the content is English, add fields such as
`fleschReadingEase`, `fleschKincaidGrade`, and `gunningFog` from
`text-readability`. For non-English (or unknown), set those to `null` with a
short `readingGradeNote`.

```js
import rs from "text-readability";

export function calculateReadability(text, { lang = null } = {}) {
  const sentences = text.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean);
  const words = text.match(/\b\w+\b/g) || [];
  const base = words.length === 0 || sentences.length === 0
    ? { wordCount: 0, avgSentenceLen: 0 }
    : { wordCount: words.length, avgSentenceLen: words.length / sentences.length };

  const isEnglish = lang ? /^en(-|$)/i.test(lang) : null;
  if (isEnglish === true) {
    return {
      ...base,
      fleschReadingEase: rs.fleschReadingEase(text),
      fleschKincaidGrade: rs.fleschKincaidGrade(text),
      gunningFog: rs.gunningFog(text),
      readingGradeNote: null,
    };
  }
  return {
    ...base,
    fleschReadingEase: null,
    fleschKincaidGrade: null,
    gunningFog: null,
    readingGradeNote: isEnglish === false
      ? "Reading-grade indices are English-tuned; omitted for non-English content."
      : "Language unknown; reading-grade indices omitted.",
  };
}
```

The `lang` can be supplied by callers from frontmatter (after plan 051) or the
HTML `lang` attribute. Default `null` keeps backward compatibility.

**Verify**: `npm test` → existing `calculateReadability` tests still pass (the
old fields are unchanged).

### Step 3: Update the public type

In `index.d.ts`, extend the `calculateReadability` return type with the new
optional/nullable fields and the optional `lang` option. Keep the existing
fields required and unchanged.

**Verify**: `npm run typecheck` → exit 0; `tests/consumer.test.ts` still passes.

### Step 4: Tests

- English text → numeric `fleschKincaidGrade` etc.
- Spanish text with `lang: "es"` → grade fields `null`, note present, `wordCount`
  still correct.
- No `lang` → fields `null`, "language unknown" note.
- Empty text → `{ wordCount: 0, avgSentenceLen: 0, ... }` (no throw).

**Verify**: `npm test` → all pass.

### Step 5: Full check + changelog

Under `## [Unreleased]`:

```markdown
### Added
- `calculateReadability` now reports English reading-grade indices
  (Flesch–Kincaid, Gunning fog) via `text-readability`, gated by content
  language; non-English content keeps word/sentence metrics with grade fields
  null and an explanatory note (`src/text.js`).
```

**Verify**: `npm run check` → exit 0.

## Test plan

- Backward-compatible: old fields and old tests unchanged.
- New behavior covered for English (numbers), Spanish (nulls + note), unknown,
  and empty input.
- No score changes (no scoring test deltas).

## Done criteria

- [ ] Decision gate resolved and recorded (A, B, or C)
- [ ] (A/B) `text-readability` in `dependencies`; `calculateReadability` extended
  additively; English path numeric, non-English path null + note
- [ ] `wordCount`/`avgSentenceLen` contract unchanged
- [ ] `index.d.ts` updated additively; `npm run typecheck` passes
- [ ] No v1/v2 score changes
- [ ] `npm run check` exits 0
- [ ] `plans/README.md` status row updated (or kept DEFERRED if path C)

## STOP conditions

- A scoring test changes value — you accidentally wired indices into scoring;
  revert that and keep the utility standalone (score wiring is a separate plan).
- `tests/consumer.test.ts` breaks — the public return type changed
  non-additively; restore the original fields.
- The library reports a grade for Spanish text that the gate should have
  suppressed — fix the language gating; never emit an English grade for
  non-English content.
- Path B turns out to need an unvetted custom formula — STOP and downgrade to
  path A or C.

## Maintenance notes

- Language detection here is intentionally minimal (lang attribute / frontmatter
  / explicit arg). A heavier `franc`-style detector is a separate decision; do
  not add it implicitly.
- If a future plan wires reading grade into v2 scoring, that is a model
  recalibration — flag the PR for maintainer sign-off per `docs/architecture.md`
  and re-baseline fixtures.
- Revisit path B (Spanish-tuned indices) only when Spanish-content readability is
  an explicitly requested feature, with a cited formula and test fixtures.
