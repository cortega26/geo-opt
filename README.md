# geo-opt

**Make your content discoverable by AI-powered search.** `geo-opt` audits
Markdown and HTML, scores it against evidence-backed heuristics, generates
validated Schema.org JSON-LD, reviews crawler policy, and produces `llms.txt`
files — all locally, with no telemetry and no content uploads.

```bash
$ node bin/cli.js audit content/article.md

  Score  76 / 100
  Model  v1 · default

  ┌──────────────────────────┬────────┬──────────┐
  │ Dimension                │  Score │ Evidence  │
  ├──────────────────────────┼────────┼──────────┤
  │ Structure & organization │  17/25 │ experimental
  │ Numerical evidence       │  13/20 │ project heuristic
  │ Quotations & attribution │   7/15 │ experimental
  │ Citations & links        │  17/20 │ probable
  │ Semantic clarity         │  22/20 │ project heuristic
  └──────────────────────────┴────────┴──────────┘

  Findings
  ⚠  8  experimental · project heuristic
  ✗  3  probable · experimental
  ✔  14 passed
```

<p align="center">
  <a href="https://github.com/cortega26/GEO-skill/actions"><img src="https://img.shields.io/github/actions/workflow/status/cortega26/GEO-skill/ci.yml?branch=main" alt="CI"></a>
  <img src="https://img.shields.io/badge/node-%3E%3D22.0.0-brightgreen" alt="Node.js >=22.0.0">
  <img src="https://img.shields.io/badge/tests-437_passed-16a34a" alt="437 tests passed">
  <img src="https://img.shields.io/badge/license-source--available-lightgrey" alt="Source-available">
</p>

The scoring model draws from the [GEO paper accepted at KDD 2024](https://arxiv.org/abs/2311.09735)
and is characterized against a 32-fixture regression corpus. It is a content
quality heuristic — not a statistical prediction or guarantee of ranking,
retrieval, or citation by any AI system.

---

## Quick start

Requires **Node.js 22 LTS** or **Node.js 24 LTS**.

```bash
git clone https://github.com/cortega26/GEO-skill.git
cd GEO-skill
npm install
node bin/cli.js audit path/to/content.md
```

Append `--help` to any command to inspect arguments, flags, and defaults.

## What geo-opt does

### Audit

Score content across five evidence-backed dimensions. Use the default v1 model
or the experimental profile-aware v2 model. Run against a single file, a list of
files, or an entire directory tree. Set a minimum threshold and use the exit
code to gate CI/CD pipelines.

### Structure

Generate Schema.org `Article`, `FAQ`, `Product`, `Course`, `Event`, `Recipe`,
and `HowTo` JSON-LD without inventing author, publisher, dates, prices, or
availability. Preview injections before touching files, apply with automatic
backups, and validate existing blocks for syntax, context, and required fields.

### Control

Audit `robots.txt` against documented crawler policies — search, training, and
control tokens are evaluated separately. Generate a `search-visible` preset that
allows known search crawlers while blocking training scrapers, or start from
`open` and constrain from there.

### Signal

Generate `llms.txt` and `llms-full.txt` files following the community proposal.
Audit existing files for structure and cross-check coverage against local content.

### Report (Pro)

Generate standalone HTML audit reports with SVG score gauges, dimension bar
charts, and print-ready CSS. Compare before/after snapshots to quantify the
impact of content changes.

## Command reference

| Command | Scope | Description |
|---|---|---|
| `audit [files...]` | Free + Pro | Score content; supports `--recursive`, `--format json`, `--summary`, `--threshold`, `--model v2` |
| `report [files...]` | Pro | HTML audit report; supports `--compare <baseline.json>` for before/after |
| `schema <file> <type>` | Free + Pro | Print generated JSON-LD to stdout |
| `inject <file> <type>` | Pro | Inject JSON-LD with `--dry-run`, `--backup`, `--recursive`, `--no-branding` |
| `validate <file>` | Free + Pro | Inspect JSON-LD blocks in Markdown or HTML |
| `robots audit <file>` | Free + Pro | Evaluate crawler policy; `--format json` for machine output |
| `robots generate` | Pro | Draft `robots.txt` with `search-visible` or `open` preset |
| `llmstxt generate [files...]` | Pro | Create `llms.txt` and optional `llms-full.txt` |
| `llmstxt audit <file>` | Free + Pro | Validate structure and check content coverage |
| `init` | Free + Pro | Create a starter `geo_config.json` |
| `config get\|set` | Free + Pro | Manage local preferences (reminders, telemetry) |

## Evidence vocabulary

Every heuristic and recommendation carries a label describing the quality of
research support behind it. None of these labels constitutes a guaranteed
outcome.

| Label | Research basis |
|---|---|
| **Strong** | Multiple independent, reproducible studies and official platform documentation |
| **Probable** | At least one controlled study or consistent platform guidance; not yet replicated independently across engines |
| **Experimental** | A single controlled benchmark under specific conditions; may not transfer to live engines or different domains |
| **Project heuristic** | Derived from this project's own observations; no external study confirms a causal effect on AI search or retrieval |

## Free vs. Pro

| | Free | Pro |
|---|---|---|
| Audit single files | Yes | Yes |
| Audit multiple files / directories | No | Yes |
| Quality thresholds for CI/CD | No | Yes |
| Generate JSON-LD (stdout) | Yes, with branding | Yes |
| Inject JSON-LD into files | No | Yes |
| Batch injection (`--recursive`) | No | Yes |
| Branding-free output (`--no-branding`) | No | Yes |
| Validate JSON-LD | Yes | Yes |
| Audit `robots.txt` | Yes | Yes |
| Generate `robots.txt` | No | Yes |
| Audit `llms.txt` | Yes | Yes |
| Generate `llms.txt` | No | Yes |
| HTML audit reports | No | Yes |
| Schema types available | `article`, `faq`, `product` | All Free types + `course`, `event`, `recipe`, `howto` |
| JavaScript library (read functions) | Yes | Yes |
| JavaScript library (write/batch functions) | No | Yes |

**Read is Free. Write and scale are Pro.** The full feature matrix, including
the JavaScript API surface, is at [`docs/free-vs-pro.md`](docs/free-vs-pro.md).

Pro entitlement is verified locally via the `TOOLTICIAN_LICENSE_KEY` environment
variable or a `license.key` field in `geo_config.json`. No content or data is
sent to Tooltician during verification. Commercial licenses are not yet
available for general purchase; see
[`docs/commercial-licensing.md`](docs/commercial-licensing.md).

## Configuration

```bash
node bin/cli.js init        # creates geo_config.json
node bin/cli.js audit ... --config path/to/other-config.json
```

Supply only metadata you can verify. `geo-opt` never infers author, publisher,
dates, prices, or availability on its own.

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
  }
}
```
</details>

## JavaScript library

All exports are typed in [`index.d.ts`](index.d.ts) and verified by a consumer
compilation fixture. Import only from the root entry point; internal paths are
blocked by the exports map.

```javascript
import { loadConfig, scoreContent, scoreContentV2 } from "geo-opt";

const { config } = loadConfig();
const { score, report } = scoreContent(markdown, "article.md", config);

console.log(score);  // 76
console.log(report.dimensionScores);
// { structure: 17, evidence: 13, quotations: 7, citations: 17, clarity: 22 }
```

### TypeScript

```bash
npm run typecheck   # compiles tests/consumer.test.ts against index.d.ts
```

Any new root export must update `index.d.ts` and the consumer fixture in the
same change.

## Why local-first matters

| Guarantee | Implementation |
|---|---|
| Content never leaves your machine | Every audit, schema, and validation runs in-process |
| No telemetry by default | Transport switch is hard-disabled; no consent prompt appears |
| No silent network calls | Zero outbound requests in audit, schema, validate, or config paths |
| `DO_NOT_TRACK` respected | CLI checks the environment variable and stays silent when set |
| Reminders are local and disableable | `node bin/cli.js config set reminders false` — permanent, immediate |
| Machine output on stdout, diagnostics on stderr | Safe to pipe `--format json` without noise |

See [`docs/telemetry.md`](docs/telemetry.md) for the activation checklist that
must be completed before any telemetry transport is ever enabled.

## Development

```bash
npm run check          # lint + format + JS tests + Python tests + conformance + typecheck + changelog
npm test               # 437 tests · 67 suites · 0 failures (Node.js)
npm run test:python    # Python compatibility port test suite
npm run lint           # ESLint + Python py_compile
npm run format:check   # Prettier dry-run
npm run typecheck      # TypeScript consumer compilation
npm run changelog:check  # Enforce CHANGELOG.md update policy
```

The JavaScript implementation under `src/` is canonical. A Python 3
compatibility port is bundled for agent-driven workflows; its scope is defined
by the capability matrix in [`docs/architecture.md`](docs/architecture.md).

Documentation governance and change triggers are defined in
[`docs/documentation-governance.md`](docs/documentation-governance.md).
Maintainers use the local `plans/README.md` as the execution index; archived
plans and dated audits are evidence, not current instructions.

Report bugs via [GitHub Issues](https://github.com/cortega26/GEO-skill/issues).

## License

- [Tooltician Community License 1.0](LICENSE) — source-available use with
  branding and redistribution conditions
- [Tooltician Commercial License](COMMERCIAL-LICENSE.md) — issued commercial
  entitlements

This project is source-available, not OSI-approved. Historical versions through
commit `67f18be` remain available under [MIT](LICENSE-HISTORY.md).

## References

- [GEO: Generative Engine Optimization](https://arxiv.org/abs/2311.09735) (KDD 2024)
- [What Gets Cited: Measuring the Impact of GEO on LLM Citations](https://arxiv.org/abs/2605.25517)
- [Google AI optimization guide](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide)
- [Schema.org](https://schema.org/)
- [`llms.txt` proposal](https://llmstxt.org/)
- [OpenAI crawler docs](https://developers.openai.com/api/docs/bots)
- [Google crawler docs](https://developers.google.com/crawling/docs/crawlers-fetchers/google-common-crawlers)
- [Anthropic crawler docs](https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler)
- [Perplexity crawler docs](https://docs.perplexity.ai/docs/resources/perplexity-crawlers)
