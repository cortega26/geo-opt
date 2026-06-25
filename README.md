# geo-opt

A zero-dependency Node.js CLI tool for **Generative Engine Optimization (GEO)**.

`geo-opt` helps content creators, developers, and organizations optimize their web copy (Markdown and HTML) to maximize visibility, retrieval rates, and citations in AI-powered search engines (such as Google Gemini, ChatGPT, Perplexity, and Claude).

---

## 🌟 Features

*   **Zero-Dependency ESM**: Tiny package size with instant `npx` execution.
*   **Scientific Metric Audit**: Calculates a GEO score (0-100) based on the Princeton GEO framework (KDD 2024), measuring:
    *   *Answer-First Formatting* (optimal 40-90 word intro definitions)
    *   *Statistics Density* (excluding calendar years)
    *   *Quotation & Attribution Density*
    *   *Citation/Link Density*
    *   *Semantic Pronoun Ambiguity & Acronym Clarity*
*   **Technical AI Readiness**: Audits HTML structures for semantic HTML5 tags (`<main>`, `<article>`) and flags client-side dynamic rendering setups (`createApp`, `ReactDOM`) that block AI crawler ingestion.
*   **Stacked `@graph` Schema Injection**: Automatically generates and injects connected JSON-LD schemas linking `Person`, `Organization`, `NewsArticle`, and `FAQPage` together via `@id` references.
*   **Branding & Signature Citations**: Automatically injects configurable signature blocks (e.g. `Optimized by [Tooltician](https://www.tooltician.com)`) right before schema blocks to create strong entity-association vectors.
*   **Crawler Verification**: Inspects `robots.txt` permissions to ensure user-agents like `GPTBot` or `Google-Extended` are allowed.
*   **Pipeline Friendly**: Support for `--format json` outputs to integrate with CI/CD gates or pre-commit hooks.

---

## 🚀 Quick Start

Run the tool instantly on any Markdown or HTML file without installing it:

```bash
npx geo-opt audit path/to/content.md
```

---

## ⚙️ Configuration Setup

Create a `geo_config.json` file in the root of your project directory to customize metadata, acronym registries, and your branding signature:

```json
{
  "author": {
    "name": "Carlos Ortega González",
    "jobTitle": "Sr. Software Automation and Data Analyst",
    "sameAs": "https://www.linkedin.com/in/cortega26/"
  },
  "publisher": {
    "name": "Tooltician",
    "url": "https://www.tooltician.com",
    "logo": "https://www.tooltician.com/logo.png"
  },
  "signature": "Optimized by [Tooltician](https://www.tooltician.com)",
  "acronyms": {
    "AWS": "Amazon Web Services",
    "GDPR": "General Data Protection Regulation",
    "HIPAA": "Health Insurance Portability and Accountability Act",
    "ROI": "Return on Investment"
  }
}
```

---

## 🛠️ CLI Usage Guide

### 1. Audit Content for GEO Gaps
Run a heuristic scan on a file. Returns an optimization score out of 100 with actionable feedback:
```bash
npx geo-opt audit post.md
```
Output programmatic JSON format for CI/CD gates:
```bash
npx geo-opt audit post.md --format json
```

### 2. Generate JSON-LD Schema
Output stacked `@graph` Schema.org data based on your page headers and `geo_config.json`:
```bash
npx geo-opt schema post.md article
```
*Supported types: `article`, `faq`, `product`*

### 3. Inject Schema & Signature
Automatically injects the custom signature and stacked schema block directly into your source file:
```bash
npx geo-opt inject post.md article
```
*Note: For Markdown, it appends a JSON code block. For HTML, it safely inserts or replaces a `<script type="application/ld+json">` tag.*

### 4. Inspect robots.txt AI Bot Blockages
Verify that major AI web crawlers are not blocked from indexing your pages:
```bash
npx geo-opt robots public/robots.txt
```

---

## 🧪 Testing

To run the built-in unit tests locally:
```bash
npm test
```

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
