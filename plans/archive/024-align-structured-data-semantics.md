# Plan 024: Align structured-data generation with visible content and current platform support

> **Executor instructions**: Preserve user-authored JSON-LD unless the command
> explicitly targets it. Do not infer identity, dates, prices, or availability.
>
> **Drift check (run first)**:
> `git diff --stat c6a604a..HEAD -- src/schema.js src/validate.js src/batch.js src/index.js bin/cli.js index.d.ts tests/optimizer.test.js .agents/skills/geo-optimization/scripts/geo_optimizer.py .agents/skills/geo-optimization/scripts/test_optimizer.py README.md .agents/skills/geo-optimization/SKILL.md CHANGELOG.md`

## Status

- **Priority**: P1
- **Horizon**: corto plazo, 3–6 semanas
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans 020, 021, 030, 031 and 034
- **Category**: correctness
- **Planned at**: commit `c6a604a`, 2026-06-26
- **Status**: DONE — implemented 2026-06-27 on branch advisor/024-structured-data-semantics

## Reconciliation — 2026-06-27

The product problem and desired semantics remain valid. The plan overlaps plan
030's pure-core/CLI boundary, plan 031's types and plan 034's Python scope.
Refresh its drift evidence and `Planned at` commit after those dependencies;
do not execute the current line-numbered steps unchanged.

## Why this matters

The `article` mode always emits `NewsArticle` and automatically converts up to
five arbitrary H2 sections into `FAQPage` questions. This can describe content
that is not news and create question markup from non-questions. Google now says
there is no special structured data for generative search and removed FAQ rich
results in May/June 2026. Structured data remains valuable when accurate, but
the product should optimize semantic correctness rather than imply a GEO
multiplier.

## Current state

- `src/schema.js:201-244` maps `article` to `NewsArticle` and appends an FAQ
  graph from any sufficiently long H2 section.
- `src/schema.js:246-273` creates `FAQPage` without requiring question-shaped
  headings or explicit confirmation.
- `src/validate.js:3-11` labels a small local field list as Google's required
  fields and mixes notes with issues.
- Tests explicitly expect “stacked graph schema with FAQ nodes.”
- Google removed the FAQ rich result and says not to overfocus on structured
  data for generative search:
  <https://developers.google.com/search/updates#removing-faq-rich-result> and
  <https://developers.google.com/search/docs/fundamentals/ai-optimization-guide>.

## Commands you will need

| Purpose    | Command               | Expected on success |
| ---------- | --------------------- | ------------------- |
| JS tests   | `npm test`            | all pass            |
| Python     | `npm run test:python` | `OK`                |
| Full check | `npm run check`       | exit 0              |

## Scope

**In scope**: files in the drift check.

**Out of scope**: live Rich Results API calls, automatic schema chosen from
weak NLP guesses, or adding every Schema.org type.

## Git workflow

- Branch: `advisor/024-structured-data-semantics`
- Use conventional commits and isolate the behavior migration from docs.
- Do not push or open a PR unless the operator explicitly requests it.

## Steps

### Step 1: Separate pure validation from terminal behavior

Create a pure validator returning `errors`, `warnings`, `notes`, nodes, and
source locations. Keep `validateSchemaFile` as an I/O wrapper. Distinguish
Schema.org structural validity, geo-opt supported profiles, and
provider-specific eligibility.

**Verify**: malformed JSON, unsupported types, missing supported-profile fields,
and informational notes are separate test cases.

### Step 2: Correct article semantics

Make `article` emit `Article` by default. Add explicit `news-article` only if
the user selects it and provides required factual metadata. Remove implicit FAQ
stacking from article mode. Preserve Organization/Person nodes only when
explicitly configured.

**Verify**: article fixtures no longer contain FAQ nodes or `NewsArticle`;
explicit news mode has a validation gate.

### Step 3: Make FAQ generation explicit and conservative

Keep an explicit FAQ mode for genuinely visible Q&A content, but require
question-shaped headings or an explicit mapping/confirmation. Never transform
ordinary section headings into questions. Explain that Schema.org semantics may
be useful outside Google rich results and make no ranking claim.

**Verify**: “Installation”, “Limitations”, and “Sources” headings are rejected
as automatic FAQ questions; visible “How do I install?” pairs pass.

### Step 4: Update contracts, parity, and migration notes

Update CLI choices, types, docs, tests, the plan-034 Python capability contract,
and changelog. If schema remains shared, update cross-runtime behavior. Treat
removal of implicit FAQ nodes as a documented behavior change.

**Verify**: `npm run check` exits 0.

## Test plan

- Article vs NewsArticle selection.
- No implicit FAQ graph.
- Explicit FAQ visible-content checks.
- Existing JSON-LD replacement and XSS breakout protections remain covered.
- JS/Python schema JSON equality.

## Done criteria

- [ ] Generated types match user intent and visible content.
- [ ] Validator separates errors, warnings, and notes.
- [ ] FAQ is explicit and carries no Google GEO/rich-result promise.
- [ ] Security and capability-appropriate cross-runtime tests remain green.

## STOP conditions

- The migration would silently rewrite existing user JSON-LD.
- A proposed required field cannot be tied to Schema.org or a named provider
  profile.

## Maintenance notes

Provider eligibility changes faster than Schema.org vocabulary. Keep those rule
sets separate and versioned through plan 021's evidence registry.
