🇺🇸 English &nbsp;·&nbsp; [🇪🇸 Español](README.es.md)

---

<div align="center">

# geo-opt

**Score, structure, and signal your content for every AI that reads the web.**

The AI-discoverability toolkit — part of the [Tooltician](https://tooltician.com) ecosystem.

`geo-opt` audits Markdown and HTML for AI discoverability, generates Schema.org JSON-LD structured data, reviews crawler policy, and produces `llms.txt`, `sitemap.xml`, and standalone reports — entirely locally, with zero telemetry and no content uploads.

<!-- Build & quality -->
<p>
  <a href="https://github.com/cortega26/geo-opt/actions"><img src="https://img.shields.io/github/actions/workflow/status/cortega26/geo-opt/ci.yml?branch=main&label=CI&logo=github" alt="CI status"></a>
  <img src="https://img.shields.io/badge/tests-573_passed-16a34a?logo=nodedotjs&logoColor=white" alt="573 tests passed">
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
  <a href="https://tooltician.com"><img src="https://img.shields.io/badge/part_of-Tooltician-ff6b00" alt="Part of the Tooltician ecosystem"></a>
</p>

</div>

```
$ node bin/cli.js audit content/article.md

  Score  76 / 100
  Model  v1 · default

  ┌──────────────────────────┬────────┬──────────────────────┐
  │ Dimension                │  Score │ Evidence             │
  ├──────────────────────────┼────────┼──────────────────────┤
  │ Structure & organization │  17/25 │ experimental         │
  │ Numerical evidence       │  13/20 │ project heuristic    │
  │ Quotations & attribution │   7/15 │ experimental         │
  │ Citations & links        │  17/20 │ probable             │
  │ Semantic clarity         │  22/20 │ project heuristic    │
  └──────────────────────────┴────────┴──────────────────────┘

  Findings
  ⚠  8  experimental · project heuristic
  ✗  3  probable · experimental
  ✔  14 passed
```

Scoring is grounded in the [GEO paper accepted at KDD 2024](https://arxiv.org/abs/2311.09735) and characterized against a 32-fixture regression corpus. It is a content-quality heuristic — not a statistical prediction or guarantee of ranking, retrieval, or citation by any AI system.

---

## Highlights

- **100% local.** Every audit, schema generation, and validation runs in-process. Your content never leaves your machine — zero telemetry, no outbound calls.
- **Research-grounded, honestly labeled.** Scoring derives from the GEO literature; every heuristic carries an explicit evidence label (`strong`, `probable`, `experimental`, `project heuristic`) so you always know how much confidence to place in it.
- **One toolkit, the whole surface.** Audit, Schema.org JSON-LD for 8 types, `robots.txt`, `llms.txt`, `sitemap.xml`, technical SEO checks, and HTML reports — from a single CLI and a typed JavaScript library.
- **CI-native.** Threshold-based quality gates with non-zero exit codes; machine-readable JSON on stdout, diagnostics on stderr. Drop it into GitHub Actions or GitLab CI in one step.
- **Cross-runtime.** Canonical Node.js implementation plus a bundled Python 3 port for agent-driven workflows, kept honest by a shared conformance suite.
- **Engineered to ship.** 573 tests across 97 suites, CI on Node 22 & 24, TypeScript declarations verified by a consumer-compilation fixture, and an enforced changelog policy.

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
    - [Inspect (technical)](#inspect-technical)
    - [Report *(Pro)*](#report-pro)
  - [Quick start](#quick-start)
    - [CI/CD integration](#cicd-integration)
  - [Command reference](#command-reference)
  - [Evidence vocabulary](#evidence-vocabulary)
  - [Free vs. Pro](#free-vs-pro)
  - [Configuration](#configuration)
  - [JavaScript library](#javascript-library)
  - [Privacy guarantees](#privacy-guarantees)
  - [Development](#development)
  - [Research](#research)
  - [License](#license)

---

## Why your content needs GEO

AI-powered search engines — ChatGPT, Perplexity, Gemini, Grok — don't rank links. They *retrieve and cite* passages from the open web, attributing content to its source. The signals that drove traditional SEO (keyword density, backlink count) are necessary but not sufficient: AI systems favor content that is **structured**, **evidence-backed**, **properly attributed**, and **semantically unambiguous**.

**Generative Engine Optimization (GEO)** is the discipline of writing and presenting content that AI systems can confidently understand and cite. `geo-opt` turns that research into a reproducible, locally-computed score with specific, actionable findings.

Unlike cloud-based SEO tools, every audit, schema generation, and validation runs in-process. Your content never leaves your machine.

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

# Inject JSON-LD with automatic backup (Pro)
node bin/cli.js inject content/article.md article --backup

# Validate existing structured data
node bin/cli.js validate content/article.md
```

### Control

Audit `robots.txt` against documented AI crawler policies — search crawlers, training scrapers, and control tokens are each evaluated separately. Generate a `search-visible` preset that allows known search crawlers while blocking training scrapers, or start from `open` and tighten from there.

```bash
node bin/cli.js robots audit public/robots.txt
node bin/cli.js robots generate --preset search-visible  # Pro
```

### Signal

Generate `llms.txt` and `llms-full.txt` following the community proposal, plus a GEO-prioritized `sitemap.xml`. Audit existing files for structural compliance and cross-check coverage against your local content.

```bash
node bin/cli.js llmstxt audit public/llms.txt
node bin/cli.js llmstxt generate content/ --recursive --site-url https://example.com  # Pro
node bin/cli.js sitemap generate content/ --base-url https://example.com               # Pro
```

### Inspect (technical)

Audit HTML — local files offline, or remote URLs and sitemaps with built-in SSRF guards — for technical SEO/GEO fundamentals: titles, meta descriptions, headings, canonical tags, and structured-data presence.

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
node bin/cli.js generate-all content/ --site-url https://example.com  # Pro
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

### CI/CD integration

Drop a single step into any pipeline to enforce a minimum content quality score across your entire site:

```yaml
# GitHub Actions example
- name: Audit content quality
  run: node bin/cli.js audit content/ --recursive --threshold 70
  env:
    TOOLTICIAN_LICENSE_KEY: ${{ secrets.TOOLTICIAN_LICENSE_KEY }}
```

The command exits non-zero when any file falls below the threshold, blocking deploys of under-optimized content. The `--format json` flag emits machine-readable output on stdout for downstream tooling; diagnostics always go to stderr. A ready-to-use GitLab CI template ships in [`ci-templates/gitlab-ci.yml`](ci-templates/gitlab-ci.yml).

---

## Command reference

| Command | Tier | Description |
|---|---|---|
| `audit [files...]` | Free + Pro | Score content; supports `--recursive`, `--format json`, `--summary`, `--threshold <n>`, `--model v2` |
| `technical [files...]` | Free + Pro | Audit HTML for technical SEO/GEO fundamentals; local files offline, `--url`/`--sitemap` for remote with SSRF guards |
| `schema <file> <type>` | Free + Pro | Print generated JSON-LD to stdout |
| `validate <file>` | Free + Pro | Inspect and verify JSON-LD blocks in Markdown or HTML |
| `inject <file> <type>` | Pro | Write JSON-LD into file; supports `--dry-run`, `--backup`, `--recursive`, `--no-branding` |
| `robots audit <file>` | Free + Pro | Evaluate crawler policy; `--format json` for machine output |
| `robots generate` | Pro | Draft `robots.txt` with `search-visible` or `open` preset |
| `llmstxt audit <file>` | Free + Pro | Validate structure and check content coverage |
| `llmstxt generate [files...]` | Pro | Create `llms.txt` and optional `llms-full.txt` |
| `sitemap generate [files...]` | Pro | Generate `sitemap.xml` with GEO-derived priorities |
| `report [files...]` | Pro | Standalone HTML report; `--compare <baseline.json>` for before/after diff |
| `generate-all [dir]` | Pro | One-shot package: audit report, schema, `llms.txt`, and `sitemap.xml` |
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

**Read is Free. Write and scale are Pro.**

| Capability | Free | Pro |
|---|---|---|
| Audit single files | Yes | Yes |
| Audit multiple files / directories | No | Yes |
| Quality thresholds for CI/CD | No | Yes |
| Generate JSON-LD (stdout, with branding) | Yes | Yes |
| Inject JSON-LD into files | No | Yes |
| Batch injection (`--recursive`) | No | Yes |
| Branding-free output (`--no-branding`) | No | Yes |
| Validate JSON-LD | Yes | Yes |
| Technical HTML audit (local files) | Yes | Yes |
| Audit `robots.txt` | Yes | Yes |
| Generate `robots.txt` | No | Yes |
| Audit `llms.txt` | Yes | Yes |
| Generate `llms.txt` | No | Yes |
| Generate `sitemap.xml` | No | Yes |
| HTML audit reports with before/after diff | No | Yes |
| One-shot optimization package (`generate-all`) | No | Yes |
| Schema types | `article`, `news-article`, `faq`, `product` | All Free types + `course`, `event`, `recipe`, `howto` |
| JavaScript library — read functions | Yes | Yes |
| JavaScript library — write / batch functions | No | Yes |

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

**TypeScript** users get full type coverage out of the box:

```bash
npm run typecheck   # compiles tests/consumer.test.ts against index.d.ts
```

Any new root export must update `index.d.ts` and the consumer fixture in the same change to keep the contract in sync.

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
npm test               # 573 tests · 97 suites · 0 failures (Node.js)
npm run test:python    # Python compatibility port test suite (38 tests)
npm run lint           # ESLint + Python py_compile
npm run format:check   # Prettier dry-run
npm run typecheck      # TypeScript consumer compilation
npm run changelog:check  # enforce CHANGELOG.md update policy
```

The JavaScript implementation under `src/` is canonical. A Python 3 compatibility port is bundled for agent-driven workflows; its scope is defined by the capability matrix in [`docs/architecture.md`](docs/architecture.md).

Documentation governance and change triggers are defined in [`docs/documentation-governance.md`](docs/documentation-governance.md). Report bugs via [GitHub Issues](https://github.com/cortega26/geo-opt/issues).

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
