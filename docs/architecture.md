# Architecture and runtime parity

The modular JavaScript implementation under `src/` is the canonical runtime for
the `geo-opt` command-line interface and library. A Python 3 implementation is
bundled with the GEO agent skill for agent-driven workflows. Shared behavior
must remain functionally aligned unless a documented language or deployment
constraint requires a difference.

## Runtime responsibilities

| Area                                   | Canonical JavaScript module               |
| -------------------------------------- | ----------------------------------------- |
| CLI orchestration                      | `bin/cli.js` using Commander              |
| Configuration and validation           | `src/config.js`                           |
| Content discovery and ignore rules     | `src/discovery.js`                        |
| Text extraction and normalization      | `src/text.js`                             |
| Heuristic scoring (v1)                 | `src/scoring.js`                          |
| Profile-aware scoring (v2)             | `src/scoring-v2.js`                       |
| Content profiles and auto-detection    | `src/profiles.js`                         |
| Section-level observation engine       | `src/observations.js`                     |
| Finding contract and evidence registry | `src/findings.js` and `src/evidence.js`   |
| Batch audits and injection             | `src/batch.js`                            |
| Schema generation and injection        | `src/schema.js`                           |
| JSON-LD validation                     | `src/validate.js`                         |
| Crawler policy audit                   | `src/robots.js`                           |
| `llms.txt` and `robots.txt` generation | `src/llms-txt.js`                         |
| Commercial entitlement checks          | `src/licensing.js` and `src/integrity.js` |
| Local support preferences              | `src/engagement.js`                       |
| Public library exports                 | `src/index.js` and `index.d.ts`           |

The Python parity implementation lives at
`.agents/skills/geo-optimization/scripts/geo_optimizer.py`.

## Why JavaScript is canonical

1. `bin/cli.js` is the package CLI entry point.
2. `src/index.js` is the public JavaScript API entry point.
3. `npm run check` verifies lint, formatting, JavaScript tests, Python parity,
   and changelog policy in one command.
4. The npm package allowlist includes only runtime code, type declarations,
   public documentation, and license files.

## Parity contract

Changes in the following areas require an explicit JavaScript/Python parity
decision:

- configuration search paths and validation;
- Markdown and HTML normalization;
- all five scoring dimensions and report fields;
- file discovery, ignore behavior, and recursive workflows;
- `robots.txt` parsing and crawler registry changes;
- schema generation, metadata opt-in rules, and safe injection;
- batch behavior, aggregate reports, and machine-readable output;
- `llms.txt` generation and audit behavior;
- branding and commercial entitlement policy.

Parity means equivalent observable behavior, not identical internal code.

## Intentional differences

- JavaScript uses Commander; Python uses `argparse`.
- JavaScript returns objects where Python may use tuples or dictionaries that
  better fit Python conventions.
- JavaScript resolves the bundled skill directory as a configuration fallback;
  Python resolves paths relative to its script location.
- The JavaScript package exposes a typed library API. The Python script is a
  CLI-oriented parity port rather than a separately supported package.

## Verification

```bash
npm run check
npm pack --dry-run --json
git diff --check
```

For changes that affect shared behavior, add equivalent regression coverage to
`tests/optimizer.test.js` and
`.agents/skills/geo-optimization/scripts/test_optimizer.py`.

## Scoring model v2 — calibration limitations

The v2 model (`--model v2`) is calibrated against a 32-fixture characterization
corpus covering documentation, open-source, editorial, commercial, ecommerce,
regulated, and adversarial content. The following limitations apply:

### Known blind spots

- **Attribution proximity** uses pattern-based heuristics (e.g., "according to",
  "published in") within a 150-character window. Stats attributed through
  document-level context rather than sentence-level proximity may be
  undercounted.
- **Auto-detection confidence** is derived from signal density, not a trained
  classifier. Content at the boundary between two profiles (e.g., a tutorial
  that is also a product page) may receive low confidence.
- **Keyword stuffing** is not directly measured. The v2 model detects it
  indirectly through thin-content and paragraph-distribution signals.
- **Factual accuracy** of statistics and quotations is not verified. The model
  checks whether claims have _nearby_ attribution, not whether the attribution
  is truthful.
- **Non-English content** is not represented in the calibration corpus. Scores
  for non-English text may be unreliable.
- **Multimodal content** (images, video, audio) is not analyzed. Only text and
  HTML structure are evaluated.

### What the model cannot predict

- **Live search-engine rankings or citation rates.** The model scores
  structural quality and attribution hygiene, which correlate with citation
  likelihood in published research, but it does not claim to predict specific
  engine behavior.
- **User engagement or conversion.** GEO scores reflect content structure, not
  business outcomes.
- **Future engine algorithm changes.** Scoring heuristics are versioned and
  documented so users can pin to a specific model version.

### Recalibration policy

- Add fixtures to the corpus; never tune thresholds against a single customer's
  desired score.
- A default switch from v1 to v2 requires a separate release decision,
  documented migration guide, and deprecation notice period.
- Threshold values in `src/observations.js` and `src/scoring-v2.js` are
  configurable heuristics. Changes that affect ranking order constitute a
  MAJOR model version bump.
