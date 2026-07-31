🇺🇸 English &nbsp;·&nbsp; [🇪🇸 Español](README.es.md)

---

<div align="center">

# geo-opt

**Score, structure, and signal your content for every AI that reads the web.**

The AI-discoverability toolkit — part of the [Tooltician](https://tooltician.com) ecosystem.

`geo-opt` is an AI-discoverability toolkit spanning three pillars — **GEO** content quality, **Schema.org** structured data, and **technical SEO**. It audits Markdown and HTML, generates JSON-LD, reviews crawler policy, and produces `llms.txt`, `sitemap.xml`, and standalone reports — entirely locally, with zero telemetry and no content uploads.

<!-- Build & quality -->
<p>
  <a href="https://github.com/cortega26/geo-opt/actions"><img src="https://img.shields.io/github/actions/workflow/status/cortega26/geo-opt/ci.yml?branch=main&label=CI&logo=github" alt="CI status"></a>
  <img src="https://img.shields.io/badge/tests-664_passed-16a34a?logo=nodedotjs&logoColor=white" alt="664 tests passed">
  <img src="https://img.shields.io/badge/branch_coverage-80%25-16a34a" alt="Branch coverage 80%">
  <img src="https://img.shields.io/badge/node-%E2%89%A522_LTS-brightgreen?logo=nodedotjs&logoColor=white" alt="Node.js >= 22 LTS">
  <img src="https://img.shields.io/badge/TypeScript-types_included-3178C6?logo=typescript&logoColor=white" alt="TypeScript types included">
  <a href="https://www.npmjs.com/package/geo-opt"><img src="https://img.shields.io/npm/v/geo-opt?logo=npm&color=cb3837" alt="npm version"></a>
</p>

<!-- Positioning & ecosystem -->
<p>
  <img src="https://img.shields.io/badge/license-source--available-lightgrey" alt="Source-available">
  <a href="https://arxiv.org/abs/2311.09735"><img src="https://img.shields.io/badge/grounded_in-GEO_·_KDD_2024-8A2BE2" alt="Grounded in GEO, KDD 2024"></a>
  <img src="https://img.shields.io/badge/100%25_local-zero_telemetry-0a7d33" alt="100% local, zero telemetry">
  <img src="https://img.shields.io/badge/runtime-Node_+_Python-5a67d8" alt="Cross-runtime: Node and Python">
  <a href="https://tooltician.com"><img src="https://img.shields.io/badge/Part_of-Tooltician.com-6C47FF?v=2" alt="Part of the Tooltician ecosystem"></a>
</p>

</div>

```
$ node bin/cli.js audit content/article.md

══════════════════════════════════════════════════
       GEO OPTIMIZATION AUDIT REPORT (v2)        
══════════════════════════════════════════════════
File: docs/architecture.md
Profile: Editorial / Blog / News (confidence: 20%)
Readiness: At Risk
  Content shows multiple quality issues.
Effective score: 39 (5 applicable dimensions)

──────────────────────────────────────────────────
1. Structure: 12/20
   Headings: Clean, no skipped levels (+7 pts)
   Answer-First: Opening paragraph is 21 words (optimal 40–90) (+2 pts)
2. Statistics: 2/20
   Statistics: 2 stat(s) found (+2 pts)
3. Quotations: 2/20
   Quotations: 2 quotes with no attribution (+0 pts)
4. Citations: 10/20
   Citations: 1 external link(s) (+5 pts)
   Sources/references section (+5 pts)
5. Clarity: 13/20
   Pronouns: High density (4.3%) (-2 pts)
──────────────────────────────────────────────────
Findings: 8 warnings, 0 failures
  ⚠  2 of 2 quotes lack identifiable attribution. [strong]
  ⚠  Ambiguous pronoun density of 4.3% exceeds limit. [heuristic]
  ⚠  Opening paragraph is 21 words (optimal 40–90). [experimental]
  ⚠  Only 1 external link(s). [strong]
══════════════════════════════════════════════════
```

Scoring is grounded in the [GEO paper accepted at KDD 2024](https://arxiv.org/abs/2311.09735) and characterized against a 32-fixture regression corpus. It is a content-quality heuristic — not a statistical prediction or guarantee of ranking, retrieval, or citation by any AI system.

---

## Highlights

- **100% local.** Every audit, schema generation, and validation runs in-process. Your content never leaves your machine — zero telemetry, no outbound calls.
- **Research-grounded, honestly labeled.** Scoring derives from the GEO literature; every heuristic carries an explicit evidence label (`strong`, `probable`, `experimental`, `project heuristic`) so you always know how much confidence to place in it.
- **One toolkit, the whole surface.** Audit, Schema.org JSON-LD for 8 types, `robots.txt`, `llms.txt`, `sitemap.xml`, technical SEO checks, and HTML reports — from a single CLI and a typed JavaScript library.
- **CI-native.** Threshold-based quality gates with non-zero exit codes; machine-readable JSON on stdout, diagnostics on stderr. Drop it into GitHub Actions or GitLab CI in one step.
- **Cross-runtime.** Canonical Node.js implementation plus a bundled Python 3 port for agent-driven workflows, kept honest by a shared conformance suite.
- **Engineered to ship.** 664 tests across 112 suites, CI on Node 22 & 24, TypeScript declarations verified by a consumer-compilation fixture, and an enforced changelog policy.

---

## Table of contents

- [geo-opt](#geo-opt)
  - [Highlights](#highlights)
  - [Table of contents](#table-of-contents)
  - [Why your content needs GEO](#why-your-content-needs-geo)
  - [What geo-opt does](#what-geo-opt-does)
    - [Audit](#audit)
    - [Structure](#structure)
    - [Control](#control)
    - [Signal](#signal)
    - [Technical SEO](#technical-seo)
    - [Report *(Pro)*](#report-pro)
  - [Quick start](#quick-start)
    - [CI/CD integration](#cicd-integration)
      - [GitHub Actions composite action](#github-actions-composite-action)
  - [Command reference](#command-reference)
  - [Evidence vocabulary](#evidence-vocabulary)
  - [Free vs. Pro](#free-vs-pro)
  - [Configuration](#configuration)
  - [JavaScript library](#javascript-library)
  - [Agent skill](#agent-skill)
  - [Privacy guarantees](#privacy-guarantees)
  - [Development](#development)
  - [Research](#research)
  - [License](#license)

---

## Why your content needs GEO

AI-powered search engines — ChatGPT, Perplexity, Gemini, Grok — don't rank links. They *retrieve and cite* passages from the open web, attributing content to its source. The signals that drove traditional SEO (keyword density, backlink count) are necessary but not sufficient: AI systems favor content that is **structured**, **evidence-backed**, **properly attributed**, and **semantically unambiguous**.

**Generative Engine Optimization (GEO)** is the discipline of writing and presenting content that AI systems can confidently understand and cite. `geo-opt` turns that research into a reproducible, locally-computed score with specific, actionable findings.

Unlike cloud-based SEO tools, every audit, schema generation, and validation runs in-process. Your content never leaves your machine.

**Three pillars, one toolkit.** `geo-opt` treats AI discoverability as three first-class pillars: **GEO** — the content-quality core this tool is named for; **structured data** — Schema.org JSON-LD; and **technical SEO** — `robots.txt`, `sitemap.xml`, hreflang, canonical, and crawler policy. GEO is the headline and the differentiator; structured data and technical SEO are the foundations that AI engines — and traditional search — depend on.

---

## What geo-opt does

### Audit

Score content across five evidence-backed dimensions using the stable v1 model or the experimental profile-aware v2 model. Audit a single file, a list of files, or an entire directory tree. Set a minimum score threshold and let the CLI exit code gate your CI/CD pipeline automatically.

```bash
# Single file, default model
node bin/cli.js audit content/article.md

# Full site audit with summary and JSON output
node bin/cli.js audit content/ --recursive --summary --format json

# CI quality gate — exits non-zero if any file scores below 70
node bin/cli.js audit content/ --recursive --threshold 70
```

### Structure

Generate Schema.org JSON-LD for `Article`, `NewsArticle`, `FAQ`, `Product`, `Course`, `Event`, `Recipe`, and `HowTo` types. Preview injections before modifying any file. Apply changes with automatic backups. Validate existing structured data blocks for syntax, context-appropriateness, and required fields — without ever inventing author, publisher, dates, prices, or availability.

```bash
# Preview JSON-LD without writing to disk
node bin/cli.js schema content/article.md article

# Inject JSON-LD with automatic backup
node bin/cli.js inject content/article.md article --backup

# Validate existing structured data
node bin/cli.js validate content/article.md
```

### Control

Audit `robots.txt` against documented AI crawler policies — search crawlers, training scrapers, and control tokens are each evaluated separately. Generate a `search-visible` preset that allows known search crawlers while blocking training scrapers, or start from `open` and tighten from there.

```bash
node bin/cli.js robots audit public/robots.txt
node bin/cli.js robots generate --preset search-visible
```

### Signal

Generate `llms.txt` and `llms-full.txt` following the community proposal, plus a GEO-prioritized `sitemap.xml`. Audit existing files for structural compliance and cross-check coverage against your local content.

```bash
node bin/cli.js llmstxt audit public/llms.txt
node bin/cli.js llmstxt generate content/ --recursive --site-url https://example.com
# Node-only: extract selected YAML fields when a collection keeps content in frontmatter
node bin/cli.js llmstxt generate content/ --recursive --site-url https://example.com \
  --full --frontmatter-fields body excerpt
node bin/cli.js sitemap generate content/ --base-url https://example.com
```

### Technical SEO

Audit HTML — local files offline, or remote URLs and sitemaps with built-in SSRF guards — for the technical-SEO fundamentals AI and search crawlers rely on: titles, meta descriptions, headings, canonical tags, hreflang, and structured-data presence.

```bash
# Local HTML, no network access
node bin/cli.js technical public/index.html

# Remote URL audit with private-IP and DNS-rebinding protection
node bin/cli.js technical --url https://example.com/article
```

### Report *(Pro)*

Generate standalone HTML audit reports with SVG score gauges, dimension bar charts, and print-ready CSS. Compare before/after snapshots to quantify the concrete impact of content changes. Or produce a complete optimization package — audit, schema, `llms.txt`, and `sitemap.xml` — in one command with `generate-all`.

```bash
# Capture a baseline, make changes, then diff
node bin/cli.js audit content/ --format json > baseline.json
# ... edit content ...
node bin/cli.js report content/ --compare baseline.json

# One-shot optimization package
node bin/cli.js generate-all content/ --site-url https://example.com
```

---

## Quick start

Requires **Node.js 22 LTS** or **Node.js 24 LTS**. Published on npm as [`geo-opt`](https://www.npmjs.com/package/geo-opt).

Run it instantly with `npx` — no install required:

```bash
npx geo-opt audit path/to/content.md
```

Or install it as a global CLI or a project dependency (the package also ships the typed JavaScript library):

```bash
npm install -g geo-opt          # global `geo-opt` command
npm install --save-dev geo-opt  # project dependency + library
```

<details>
<summary>From source (for development)</summary>

```bash
git clone https://github.com/cortega26/geo-opt.git
cd geo-opt
npm install
node bin/cli.js audit path/to/content.md
```
</details>

Once installed, run the examples below as `geo-opt <command>` (or `npx geo-opt <command>`); the `node bin/cli.js <command>` form shown throughout this README is the equivalent invocation from a source checkout. Append `--help` to any command for full argument details and defaults.

### From first run to a pre-merge quality gate

The canonical job is **local, version-controlled quality checks for Markdown,
HTML, and static-site content before merge — without uploading proprietary
content.** Five commands take you from first run to a CI gate:

```bash
# 1. Install (or use npx geo-opt … for no install)
npm install -g geo-opt

# 2. First local audit on a single file — no network, no signup
geo-opt audit path/to/content.md

# 3. Batch audit of a content directory with a CI quality gate
geo-opt audit content/ --recursive --threshold 70

# 4. Machine-readable output for downstream tooling
geo-opt audit content/ --recursive --format json > geo-audit.json

# 5. One-shot optimization package (audit report + llms.txt + sitemap + robots)
geo-opt generate-all content/ --site-url https://example.com
```

These commands find content-quality issues and produce remediation guidance.
They are **QA findings**, never a ranking or citation prediction.

### CI/CD integration

Drop a single step into any pipeline to enforce a minimum content quality score
across your entire site. No license key is required for audit/threshold gates;
`TOOLTICIAN_LICENSE_KEY` is only needed for the Pro `report` command or
`--no-branding`.

```yaml
# .github/workflows/geo-opt.yml
name: Content quality gate
on: [pull_request]
jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm install -g geo-opt
      - run: geo-opt audit content/ --recursive --threshold 70
```

The command exits non-zero when any file falls below the threshold, blocking
deploys of under-optimized content. The `--format json` flag emits
machine-readable output on stdout for downstream tooling; diagnostics always go
to stderr.

#### GitHub Actions composite action

A ready-made composite action
([`geo-opt-audit`](.github/actions/geo-opt-audit/action.yml)) wraps the CLI for
GitHub pipelines:

```yaml
- uses: cortega26/geo-opt/.github/actions/geo-opt-audit@v2.3.0
  with:
    path: content/
    threshold: 70
```

- `path` — file or directory to audit (default: `.`).
- `threshold` — exit with code 1 when the score is below this value, gating
  the pipeline (e.g. `70`).
- `model` — scoring model: `v2` (default, profile-aware) or `v1` (legacy).

Outputs: `score` (0–100), `passed` (`true`/`false` — whether the threshold was
met), `badge-url` (a shields.io badge URL for embedding in READMEs or PR
comments), and `badge-markdown` (a ready-to-embed shields.io badge). The action
audits content and gates on the CLI's exit code; it does not modify the
repository.

A ready-to-use GitLab CI template ships in
[`ci-templates/gitlab-ci.yml`](ci-templates/gitlab-ci.yml).

---

## Command reference

| Command | Tier | Description |
|---|---|---|
| `audit [files...]` | Free + Pro | Score content; supports `--recursive`, `--format json`, `--summary`, `--threshold <n>`, `--model v2` |
| `technical [files...]` | Free + Pro | Audit HTML for technical SEO/GEO fundamentals; local files offline, `--url`/`--sitemap` for remote with SSRF guards |
| `schema <file> <type>` | Free + Pro | Print generated JSON-LD to stdout. Community types: `article`, `news-article`, `faq`, `product`. Pro types: `course`, `event`, `recipe`, `howto` |
| `validate <file>` | Free + Pro | Inspect and verify JSON-LD blocks in Markdown or HTML |
| `inject <file> <type>` | Free + Pro | Write JSON-LD into file(s); supports `--dry-run`, `--backup`, `--recursive`. `--no-branding` is Pro |
| `robots audit <file>` | Free + Pro | Evaluate crawler policy; `--format json` for machine output |
| `robots generate` | Free + Pro | Draft `robots.txt` with `search-visible` or `open` preset |
| `llmstxt audit <file>` | Free + Pro | Validate structure and check content coverage |
| `llmstxt generate [files...]` | Free + Pro | Create `llms.txt` and optional `llms-full.txt`; Node also supports `--frontmatter-fields` |
| `sitemap generate [files...]` | Free + Pro | Generate `sitemap.xml` with GEO-derived priorities |
| `report [files...]` | Pro | Standalone HTML report; `--compare <baseline.json>` for before/after diff |
| `generate-all [dir]` | Free + Pro | One-shot package: audit report, schema, `llms.txt`, and `sitemap.xml` |
| `badge <file>` | Free + Pro | Generate a GEO score badge for a file |
| `init` | Free + Pro | Create a starter `geo_config.json` |
| `config get\|set` | Free + Pro | Manage local preferences (reminders, telemetry) |

---

## Evidence vocabulary

Every heuristic and recommendation carries a label describing the quality of research support behind it. These labels communicate epistemic confidence — none constitutes a guaranteed outcome.

| Label | Research basis |
|---|---|
| **Strong** | Multiple independent, reproducible studies and official platform documentation |
| **Probable** | At least one controlled study or consistent platform guidance; not yet independently replicated across engines |
| **Experimental** | A single controlled benchmark under specific conditions; may not transfer to live engines or different content domains |
| **Project heuristic** | Derived from this project's own observations; no external study confirms a causal effect on AI search or retrieval |

---

## Free vs. Pro

**Community is complete. Pro adds reports, branding-free output, and advanced schema types.**

Pro entitlement gates exactly three surfaces: the `report` command, the `--no-branding` flag (on `inject` and `report`), and the Pro Schema.org types (`course`, `event`, `recipe`, `howto`). Every other CLI command and library function — recursive and multi-file audits, CI thresholds, `inject`, `robots generate`, `llmstxt generate`, `sitemap generate`, `generate-all`, `technical`, and all read/write/batch library functions — runs Community-side without a license key.

| Capability | Free | Pro |
|---|---|---|
| Audit single files | Yes | Yes |
| Audit multiple files / directories | Yes | Yes |
| Quality thresholds for CI/CD | Yes | Yes |
| Generate JSON-LD (stdout, with branding) | Yes | Yes |
| Inject JSON-LD into files | Yes | Yes |
| Batch injection (`--recursive`) | Yes | Yes |
| Branding-free output (`--no-branding`) | No | Yes |
| Validate JSON-LD | Yes | Yes |
| Technical HTML audit (local + remote) | Yes | Yes |
| Audit `robots.txt` | Yes | Yes |
| Generate `robots.txt` | Yes | Yes |
| Audit `llms.txt` | Yes | Yes |
| Generate `llms.txt` | Yes | Yes |
| Generate `sitemap.xml` | Yes | Yes |
| One-shot optimization package (`generate-all`) | Yes | Yes |
| HTML audit reports with before/after diff | No | Yes |
| Schema types | `article`, `news-article`, `faq`, `product` | All Free types + `course`, `event`, `recipe`, `howto` |
| JavaScript library — read, write and batch functions | Yes | Yes |

The full feature matrix, including the complete JavaScript API surface, is at [`docs/free-vs-pro.md`](docs/free-vs-pro.md).

Pro entitlement is resolved locally from the `TOOLTICIAN_LICENSE_KEY` environment variable or a `license.key` field in `geo_config.json`. No content or data is sent to Tooltician during verification. Commercial licenses are not yet available for general purchase; see [`docs/commercial-licensing.md`](docs/commercial-licensing.md) for details and licensing inquiries.

---

## Configuration

```bash
node bin/cli.js init        # creates geo_config.json in the current directory
node bin/cli.js config get  # inspect current preferences
node bin/cli.js config set reminders false  # disable support reminders
```

Supply only metadata you can verify. `geo-opt` never infers author, publisher, dates, prices, or availability on its own.

<details>
<summary>Example <code>geo_config.json</code></summary>

```json
{
  "author": {
    "name": "Content Author",
    "sameAs": "https://example.com/author"
  },
  "publisher": {
    "name": "Content Publisher",
    "url": "https://example.com"
  },
  "acronyms": {
    "GEO": "Generative Engine Optimization",
    "RAG": "Retrieval-Augmented Generation"
  },
  "license": {
    "key": "tt_pro_your-license-key-here"
  }
}
```
</details>

An alternate config path can be specified per-run:

```bash
node bin/cli.js audit content/ --config path/to/other-config.json
```

---

## JavaScript library

All exports are typed in [`index.d.ts`](index.d.ts) and verified by a consumer compilation fixture. Always import from the root entry point; internal paths are blocked by the exports map.

```javascript
import { loadConfig, scoreContent, scoreContentV2 } from "geo-opt";

const { config } = loadConfig();
const { score, report } = scoreContent(markdown, "article.md", config);

console.log(score);
// 76

console.log(report.dimensionScores);
// { structure: 17, evidence: 13, quotations: 7, citations: 17, clarity: 22 }
```

For schema-driven Markdown collections, `extractFrontmatterContent(markdown,
["body", "excerpt"])` exposes the same Node-only extraction used by
`llmstxt generate --frontmatter-fields`.

**TypeScript** users get full type coverage out of the box:

```bash
npm run typecheck   # compiles tests/consumer.test.ts against index.d.ts
```

Any new root export must update `index.d.ts` and the consumer fixture in the same change to keep the contract in sync.

---

## Agent skill

**For AI coding agents.** The repository bundles an agent skill at
[`.agents/skills/geo-optimization/`](.agents/skills/geo-optimization/) —
[`SKILL.md`](.agents/skills/geo-optimization/SKILL.md) is the entry point.
It walks an agent through the same three pillars as a workflow: audit →
analyze → apply → inject schema → verify. Run the audit, review the
scorecard, apply the content rules, inject the JSON-LD, and re-audit to
confirm.

**Two implementations.** Mirroring the skill's own docs: the canonical
Node CLI (`node bin/cli.js`) and a capability-scoped Python port
(`python3 scripts/geo_optimizer.py`). The Python port supports the legacy
v1 audit and selected schema, robots, `llms.txt`, batch, config, and
injection workflows; it does not currently support the v2 model or the
technical HTML audit. See [`docs/architecture.md`](docs/architecture.md)
for the normative capability matrix.

**Distribution.** The skill ships with the repository checkout and is not
part of the npm package.

**Use it.** Copy the skill directory into your agent's skills path —
`.claude/skills/` for Claude Code, or your agent's equivalent — and point
the agent at `SKILL.md`. The skill's commands assume a `geo-opt`
repository checkout — `node bin/cli.js` is the canonical CLI path; the
Python port's scripts work from the copied directory.

---

## Privacy guarantees

| Guarantee | How it is implemented |
|---|---|
| Content never leaves your machine | Every audit, schema generation, and validation runs entirely in-process |
| No telemetry by default | The transport switch is hard-disabled; no prompt appears and nothing is sent |
| No silent network calls | Outbound requests happen only when you explicitly opt in with `technical --url`/`--sitemap`, and are guarded against SSRF, DNS rebinding, and private-IP access |
| `DO_NOT_TRACK` respected | The CLI checks the environment variable and stays silent when set |
| Reminders are local and disableable | `node bin/cli.js config set reminders false` — permanent and immediate |
| Machine output on stdout, diagnostics on stderr | Safe to pipe `--format json` output to other tools without noise |

The full opt-in telemetry design (currently dormant) is documented in [`docs/telemetry.md`](docs/telemetry.md), including the frozen event schema that limits what could ever be collected.

---

## Development

```bash
npm run check          # full suite: lint + format + JS tests + Python tests + conformance + typecheck + changelog
npm test               # 664 tests · 112 suites · 0 failures (Node.js)
npm run test:python    # Python compatibility port test suite (38 tests)
npm run lint           # ESLint + Python py_compile
npm run format:check   # Prettier dry-run
npm run typecheck      # TypeScript consumer compilation
npm run changelog:check  # enforce CHANGELOG.md update policy
```

The JavaScript implementation under `src/` is canonical. A Python 3 compatibility port is bundled for agent-driven workflows; its scope is defined by the capability matrix in [`docs/architecture.md`](docs/architecture.md).

Documentation governance and change triggers are defined in [`docs/documentation-governance.md`](docs/documentation-governance.md). Report bugs via [GitHub Issues](https://github.com/cortega26/geo-opt/issues) — see [`docs/reporting-issues.md`](docs/reporting-issues.md) for what to include (and what to redact).

---

## Research

- [GEO: Generative Engine Optimization](https://arxiv.org/abs/2311.09735) — Singh et al., KDD 2024
- [What Gets Cited: Measuring the Impact of GEO on LLM Citations](https://arxiv.org/abs/2605.25517)
- [Google AI optimization guide](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide)
- [Schema.org](https://schema.org/)
- [`llms.txt` proposal](https://llmstxt.org/)
- [OpenAI crawler documentation](https://developers.openai.com/api/docs/bots)
- [Google crawler documentation](https://developers.google.com/crawling/docs/crawlers-fetchers/google-common-crawlers)
- [Anthropic crawler documentation](https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler)
- [Perplexity crawler documentation](https://docs.perplexity.ai/docs/resources/perplexity-crawlers)

---

## License

- [Tooltician Community License 1.0](LICENSE) — source-available use with branding and redistribution conditions
- [Tooltician Commercial License](COMMERCIAL-LICENSE.md) — issued commercial entitlements

This project is source-available, not OSI-approved open source. Historical versions through commit `67f18be` remain available under [MIT](LICENSE-HISTORY.md). `geo-opt` is part of the [Tooltician](https://tooltician.com) AI-discoverability toolkit.
