# Architecture, contracts and runtime capabilities

**Status:** normative current-state document
**Last verified:** 2026-08-03 (Plan 075 hop policy)

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

- The public npm package is published as [`geo-opt`](https://www.npmjs.com/package/geo-opt).
- V2 is the default scoring model. V1 is available via `--model v1` and is
  deprecated (a migration note and deprecation warning are emitted when used).
- The v2 *model* is experimental and profile-aware: it is characterized against
  a 32-fixture regression corpus, not calibrated against live retrieval or
  citation outcomes. The v2 *contract* (finding/version/type shapes) is
  stabilized through roadmap gate T0 (closed 2026-06-27).
- The `technical` CLI command audits HTML for technical SEO/GEO fundamentals,
  locally offline or against remote URLs/sitemaps with SSRF guards. Remote
  mode applies one scheme/origin policy to every network hop (root URL,
  redirects, `robots.txt`, nested sitemaps, discovered pages): HTTPS-only and
  root-origin-only by default, with `--allow-http` and `--allow-cross-origin`
  as the explicit opt-ins (Plan 075).
- Supported runtimes are Node.js 22 LTS and Node.js 24 LTS. Node.js 20 reached
  EOL on 2026-03-24 and is no longer a supported target.

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

The `.agents/skills/geo-optimization/` directory is the bundled agent
skill: `SKILL.md` is the entry point, backed by the canonical Node CLI
(`bin/cli.js`) and the Python port above. It is distributed with the
repository checkout only — it is not part of the npm package. Its
capability boundaries follow the matrix below (v2 and the technical HTML
audit are `Node-only`).

## Why JavaScript is canonical

1. `bin/cli.js` is the package CLI entry point.
2. `src/index.js` is the public JavaScript API entry point.
3. `npm run check` verifies lint, formatting, JavaScript tests, the Python test
   suite, and changelog policy in one command.
4. The npm package allowlist includes only runtime code, type declarations,
   public documentation, and license files.

## Runtime capability matrix

Every public capability is assigned one of four formal tiers:

| Tier            | Meaning                                                                                 |
| --------------- | --------------------------------------------------------------------------------------- |
| `equivalent`    | Observable output contract must match. Tested with shared golden fixtures.              |
| `compatible`    | Same user outcome; documented shape/CLI differences allowed. Cross-runtime smoke-tested. |
| `Node-only`     | Intentionally unsupported in Python. No port planned without demonstrated demand.        |
| `deprecated`    | Python surface scheduled for removal. Migration notice required before deletion.        |

| Capability                                               | Node.js   | Python | Tier          | Rationale                                                                 |
| -------------------------------------------------------- | --------- | ------ | ------------- | ------------------------------------------------------------------------- |
| V1 single/batch audit and threshold                      | CLI + API | CLI    | `equivalent`  | Shared finding contract validated on reference fixture; cross-runtime JSON |
| V1 finding/report contract                               | Yes       | Yes    | `equivalent`  | Same JSON structure tested in `test_optimizer.py:157`                     |
| V2 profiles and readiness                                | CLI + API | No     | `Node-only`   | Experimental; no Python user demand; requires observation engine          |
| Pure technical HTML audit                                | API       | No     | `Node-only`   | Node-only by design; requires cheerio DOM traversal                       |
| Schema generation and injection                          | CLI + API | CLI    | `compatible`  | Same output shape; Python uses BeautifulSoup vs cheerio; shared safety invariants |
| JSON-LD validation                                       | CLI + API | No     | `Node-only`   | Not implemented in Python; no port requested                              |
| robots audit and generation                              | CLI + API | CLI    | `compatible`  | Shared registry; Python path resolution differs; purpose-aware semantics align |
| `llms.txt` generation and audit                          | CLI + API | CLI    | `compatible`  | Same proposal format; Python uses mistune vs marked for parsing           |
| `llms.txt` custom frontmatter-field extraction           | CLI + API | No     | `Node-only`   | Schema-driven source collections; no demonstrated demand for a Python port |
| Config, reminders, licensing convenience gate            | CLI + API | CLI    | `compatible`  | Policy-equivalent where implemented; Python path/env resolution differs   |
| Typed library API                                        | Yes       | No     | `Node-only`   | Python is a CLI-oriented port, not a separately supported package         |

No capability is currently `deprecated`.

### Tier decision rules

- New Node.js features default to `Node-only` unless Python solves a demonstrated
  environment constraint.
- Promoting a capability to `equivalent` requires shared golden fixtures and
  cross-runtime conformance tests.
- Moving a `compatible` capability to `equivalent` requires normalizing any
  documented divergence.
- Changing a tier is a contract change — update this matrix and the
  cross-runtime tests in the same pull request.

This matrix is the source of truth. Similar filenames, test names, or function
names do not establish parity. Blanket claims of "identical results" or
"full parity" are forbidden in user-facing documentation.

## Intentional and known divergences

### Design differences (by choice)

- JavaScript uses Commander; Python uses `argparse`.
- JavaScript returns objects where Python may use tuples or dictionaries that
  better fit Python conventions.
- JavaScript resolves the bundled skill directory as a configuration fallback;
  Python resolves paths relative to its script location.
- The JavaScript package exposes a typed library API. The Python script is a
  CLI-oriented compatibility port rather than a separately supported package.
- Python uses `mistune` and `BeautifulSoup` for parsing; JavaScript uses
  `marked` and `cheerio`. Output shapes match; internal parse trees differ.

### Known behavioral divergences (compatible tier)

These are verified differences that do not break the compatible-tier contract
(same user outcome, documented shape differences allowed):

| Divergence | Node.js | Python | Impact |
|---|---|---|---|
| Acronym ordering in clarity details | Iteration-dependent | Iteration-dependent | Detail strings may list unexplained acronyms in different order; both detect the same set |
| Path resolution in error messages | Absolute path from CWD | Path relative to script location | Error text differs; exit codes match |
| Dry-run output format | Structured preview | Compressed preview | Both communicate the intended change |
| Engagement state directory default | `$XDG_STATE_HOME` or `~/.local/state` | `$GEO_OPT_STATE_DIR` or script directory | Different default, same env-var override |
| Frontmatter title/description fallback (metadata) | Full YAML parse (quoted, typed values) | Flat `key: value` lines; single-line quoted strings | Same precedence chain (H1 → HTML h1 → frontmatter → basename); only H1-less frontmatter pages can differ, on exotic YAML only |

None of these divergences affect audit scores, findings, schema output, robots
policy, or `llms.txt` content — the committed contracts for `equivalent` and
`compatible` tiers.

### Forbidden in documentation

- "Identical results" or "full parity" between Node.js and Python.
- Python commands for capabilities marked `Node-only` (e.g., `--model v2`).
- CLI flags in examples before the parser accepts them.
- Python v2 or technical HTML audit examples.

## Architecture invariants

- Core analyzers return data; CLI adapters own terminal output and process exit.
  Existing violations are tracked by plan 030 and should not be copied.
- JSON stdout is one machine-readable document and diagnostics stay on stderr.
- Processing is local by default; network behavior requires explicit opt-in.
- Every remote hop flows through the same scheme/origin policy before DNS or
  connection; HTTP and cross-origin hops need their explicit opt-ins
  (`--allow-http`, `--allow-cross-origin`), and no opt-in weakens IP
  validation or TLS verification (Plan 075).
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
| JS exports       | `src/index.js`                                  | Export map + consumer fixture in plan 031     |
| Types            | `index.d.ts` + `tests/consumer.test.ts`         | All 63 runtime exports declared; typecheck gate active |
| Findings/reports | `src/findings.js`, scoring modules, tests       | Normalization/version identity in plan 029    |
| Python support   | Capability matrix + `tests/conformance.test.js` | Formal tiers + golden conformance in plan 034 |
| Release artifact | `package.json`, build/pack tests                | Staged reproducible build in plan 032         |

## Verification

```bash
npm run check            # lint + format + tests + python + conformance + typecheck + changelog
npm run test:conformance # cross-runtime golden fixture comparison
npm run typecheck        # consumer fixture type verification
npm pack --dry-run --json
git diff --check
```

For changes to capabilities marked equivalent, add shared conformance coverage.
For compatible or Node-only behavior, update this matrix and the relevant
runtime tests instead of silently duplicating or omitting behavior.

## Parity decision gate (change-review checklist)

Every pull request that adds a Node.js capability MUST answer:

- [ ] What is the tier for this capability? (`equivalent`, `compatible`, `Node-only`, `deprecated`)
- [ ] If `equivalent`: where are the shared golden fixtures and cross-runtime tests?
- [ ] If `compatible`: what documented divergence justifies not being `equivalent`?
- [ ] If `Node-only`: is there demonstrated demand for a Python port? If not, defer.
- [ ] If `deprecated`: where is the migration notice and retirement timeline?

A missing or unverifiable tier status blocks merge. The capability matrix in
this document is the source of truth — update it in the same pull request.

This gate is enforced by code review, not by an automated check. A future
automation (e.g., a PR template or lint rule) may formalize it further.

## Python compatibility port: retirement criteria

The Python port is a compatibility convenience for agent-driven workflows that
cannot yet run Node.js. It is not a permanent product commitment. Python MAY be
reduced or retired when:

1. **Environment constraint removed**: Node.js is available in the target agent
   environments where Python is currently the only option.
2. **Negligible usage**: fewer than 2 distinct workflows rely on Python-specific
   behavior after Node.js is available.
3. **Maintenance cost exceeds value**: Python-specific bugs or divergences
   consume more than 10% of total maintenance time over a rolling 3-month window.

Retirement requires:
- A documented migration notice in the SKILL.md and CHANGELOG.
- At least one release cycle (current + next) with a `deprecated` tier marker
  before deletion.
- Confirmation that no `equivalent` capability is lost — all `equivalent` and
  `compatible` capabilities must have a Node.js implementation.

Do NOT retire Python in this plan (034) without evidence and a migration notice.
The retirement criteria are forward-looking policy, not an immediate action.

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
