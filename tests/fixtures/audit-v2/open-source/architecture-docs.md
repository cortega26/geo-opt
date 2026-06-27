# Architecture Decision Records

This directory contains Architecture Decision Records (ADRs) for the GeoOpt
project. We use the format described by Michael Nygard in
[Documenting Architecture Decisions](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions).

## Active records

| ID  | Title                                               | Status   | Date       |
| --- | --------------------------------------------------- | -------- | ---------- |
| 001 | Use marked + cheerio for content parsing            | Accepted | 2026-01-15 |
| 002 | Keep JS and Python implementations in sync manually | Accepted | 2026-02-01 |
| 003 | Version the scoring model from day one              | Accepted | 2026-04-10 |

## ADR-001: Use marked + cheerio for content parsing

### Context

The initial implementation used regex for all content parsing. This caused
false positives in HTML (matching tag text as content), false negatives in
Markdown (counting code-block contents as prose), and was fragile against
nested structures.

### Decision

Replace regex-based parsing with:

- **marked** for Markdown → AST extraction (links, blockquotes, tables, lists).
- **cheerio** for HTML → DOM queries (semantic tags, SPA detection, structured
  data).

### Consequences

- **Positive**: Parsing accuracy improved measurably. HTML false positives
  dropped to zero in our fixture suite.
- **Negative**: Two additional dependencies. Marked's AST format may change
  across major versions, requiring pinning.
- **Neutral**: Performance is equivalent for files under 100 KB.

## ADR-002: Keep JS and Python implementations in sync manually

### Context

The project ships both a Node.js CLI and a Python skill for AI assistants.
Both implement the same audit logic.

### Decision

Maintain them as ports, not generated code. A single developer ports changes
between languages. Tests use the same fixtures to enforce parity.

### Consequences

- **Positive**: Each language uses idiomatic libraries (mistune vs marked,
  BeautifulSoup vs cheerio).
- **Negative**: Manual sync creates a latency window between JS and Python
  releases.
- **Neutral**: Fixture-based testing catches divergence before release.

## ADR-003: Version the scoring model from day one

### Context

The v1 scoring model assigns equal 20-point buckets regardless of content type.
We know this is wrong for documentation, API references, and regulated content.

### Decision

Every audit report carries `modelVersion` and `reportVersion`. When we
introduce v2, v1 remains available with `--model v1`. Scoring changes are
documented as semver bumps: MAJOR for formula changes that re-rank, MINOR for
new checks, PATCH for bug fixes.

### Consequences

- **Positive**: Users can pin to a model version. CI pipelines don't break on
  model updates.
- **Negative**: Maintaining two models in parallel adds complexity.
- **Neutral**: Migration timeline is user-driven.
