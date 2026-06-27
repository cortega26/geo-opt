# Architecture, contracts and runtime capabilities

**Status:** normative current-state document
**Last verified:** 2026-06-27 at commit `f91fae7`

The modular JavaScript implementation under `src/` is the canonical runtime for
the `geo-opt` command-line interface and library. A Python 3 compatibility port
is bundled with the GEO agent skill for agent-driven workflows. Python
compatibility is capability-scoped: only behavior named `equivalent` in the
matrix below is a cross-runtime contract.

Documentation ownership, invariants and change triggers are defined in
[`documentation-governance.md`](documentation-governance.md). Maintainers keep
the current execution roadmap and architecture gate in the local
`plans/README.md`, which is not part of the published npm package.

## Current maturity

- The public npm package has not been released.
- V1 is the default scoring model.
- V2 is experimental and available only in Node.js through `--model v2`.
- The pure technical HTML audit is available through the JavaScript API; there
  is no supported `technical` CLI command yet.
- The v2 finding/version/type contracts are being stabilized by roadmap gate
  T0. Do not treat experimental JSON as frozen until that gate closes.
- The manifest currently accepts Node.js 20, but Node.js 20 reached EOL on
  2026-03-24. Plan 033 owns migration to supported LTS lines.

## Runtime responsibilities

| Area                                    | Canonical JavaScript module               |
| --------------------------------------- | ----------------------------------------- |
| CLI orchestration                       | `bin/cli.js` using Commander              |
| Configuration and validation            | `src/config.js`                           |
| Content discovery and ignore rules      | `src/discovery.js`                        |
| Text extraction and normalization       | `src/text.js`                             |
| Legacy heuristic scoring (v1/default)   | `src/scoring.js`                          |
| Profile-aware scoring (v2/experimental) | `src/scoring-v2.js`                       |
| Content profiles and auto-detection     | `src/profiles.js`                         |
| Section-level observation engine        | `src/observations.js`                     |
| Finding contract and evidence registry  | `src/findings.js` and `src/evidence.js`   |
| Batch audits and injection              | `src/batch.js`                            |
| Schema generation and injection         | `src/schema.js`                           |
| JSON-LD validation                      | `src/validate.js`                         |
| Crawler policy audit                    | `src/robots.js`                           |
| `llms.txt` and `robots.txt` generation  | `src/llms-txt.js`                         |
| Commercial entitlement checks           | `src/licensing.js` and `src/integrity.js` |
| Local support preferences               | `src/engagement.js`                       |
| Public library exports                  | `src/index.js` and `index.d.ts`           |

The Python compatibility implementation lives at
`.agents/skills/geo-optimization/scripts/geo_optimizer.py`.

## Why JavaScript is canonical

1. `bin/cli.js` is the package CLI entry point.
2. `src/index.js` is the public JavaScript API entry point.
3. `npm run check` verifies lint, formatting, JavaScript tests, the Python test
   suite, and changelog policy in one command.
4. The npm package allowlist includes only runtime code, type declarations,
   public documentation, and license files.

## Runtime capability matrix

| Capability                                               | Node.js   | Python | Current commitment                             |
| -------------------------------------------------------- | --------- | ------ | ---------------------------------------------- |
| V1 single/batch audit and threshold                      | CLI + API | CLI    | Equivalent on committed cross-runtime fixtures |
| V1 finding/report contract                               | Yes       | Yes    | Equivalent on the reference fixture            |
| V2 profiles and readiness                                | CLI + API | No     | Node-only, experimental                        |
| Pure technical HTML audit                                | API       | No     | Node-only, experimental                        |
| Schema generation and injection                          | CLI + API | CLI    | Compatible; shared safety/metadata invariants  |
| JSON-LD validation                                       | CLI + API | No     | Node-only                                      |
| robots audit and generation                              | CLI + API | CLI    | Compatible; registry semantics should align    |
| `llms.txt` generation and audit                          | CLI + API | CLI    | Compatible                                     |
| Config, local reminders and entitlement convenience gate | CLI + API | CLI    | Policy-equivalent where implemented            |
| Typed library API                                        | Yes       | No     | Node-only                                      |

This is a descriptive matrix of verified behavior, not a permanent product
decision. Plan 034 will convert it into explicit `equivalent`, `compatible`,
`Node-only` or `deprecated` tiers with golden conformance tests.

Changes in a shared capability require an explicit matrix decision. New Node
features do not automatically require a Python port.

## Intentional differences

- JavaScript uses Commander; Python uses `argparse`.
- JavaScript returns objects where Python may use tuples or dictionaries that
  better fit Python conventions.
- JavaScript resolves the bundled skill directory as a configuration fallback;
  Python resolves paths relative to its script location.
- The JavaScript package exposes a typed library API. The Python script is a
  CLI-oriented compatibility port rather than a separately supported package.

## Architecture invariants

- Core analyzers return data; CLI adapters own terminal output and process exit.
  Existing violations are tracked by plan 030 and should not be copied.
- JSON stdout is one machine-readable document and diagnostics stay on stderr.
- Processing is local by default; network behavior requires explicit opt-in.
- Node.js is canonical. Cross-runtime guarantees exist only in the capability
  matrix and conformance tests.
- Report-contract, scoring-model and package versions are separate identities.
- Generated metadata never invents identity, publication dates or commercial
  facts.
- Technical observations remain engine-neutral; provider interpretation belongs
  in thin, evidence-backed layers only when justified.

## Public contracts and sources of truth

| Contract         | Source of truth                                 | Known hardening                               |
| ---------------- | ----------------------------------------------- | --------------------------------------------- |
| CLI              | `bin/cli.js` and CLI tests                      | Shared v1/v2 orchestration in plan 030        |
| JS exports       | `src/index.js`                                  | Declaration/export gate in plan 031           |
| Types            | `index.d.ts`                                    | V2 declarations and consumer test in plan 031 |
| Findings/reports | `src/findings.js`, scoring modules, tests       | Normalization/version identity in plan 029    |
| Python support   | This capability matrix plus cross-runtime tests | Formal tier in plan 034                       |
| Release artifact | `package.json`, build/pack tests                | Staged reproducible build in plan 032         |

## Verification

```bash
npm run check
npm pack --dry-run --json
git diff --check
```

For changes to capabilities marked equivalent, add shared conformance coverage.
For compatible or Node-only behavior, update this matrix and the relevant
runtime tests instead of silently duplicating or omitting behavior.

## Scoring model v2 — characterization limitations

The v2 model (`--model v2`) is characterized against a 32-fixture corpus (30
Markdown and 2 HTML inputs) covering documentation, open-source, editorial,
commercial, ecommerce, regulated, and adversarial content. This is regression
characterization, not statistical calibration against live retrieval or
citation outcomes.

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
- **Non-English content** is not represented in the characterization corpus. Scores
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
