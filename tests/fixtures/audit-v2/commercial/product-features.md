# Product Features — GeoOpt Pro

## Content auditing

GeoOpt analyzes every page against 15 structural and semantic checks. The
audit completes in under 2 seconds for pages up to 5 000 words.

- Markdown and HTML support.
- Batch audit up to 500 pages in a single command.
- JSON, text, and summary output formats.
- Line-item breakdowns for every dimension.

## Profile-aware scoring

The v2 model understands what kind of content you're writing and adjusts
expectations accordingly. API docs aren't penalized for lacking quotes.
Blog posts get credit for attributed statistics.

| Profile       | Structure | Stats | Quotes | Citations | Clarity |
| ------------- | --------- | ----- | ------ | --------- | ------- |
| documentation | ✓         | —     | —      | ✓         | ✓       |
| editorial     | ✓         | ✓     | ✓      | ✓         | ✓       |
| commercial    | ✓         | ✓     | —      | ✓         | ✓       |
| ecommerce     | ✓         | ✓     | —      | ✓         | ✓       |
| regulated     | ✓         | ✓     | —      | ✓         | ✓       |

## CI/CD integration

Run GEO audits on every pull request. Set minimum score thresholds that
block merges until content quality improves.

```yaml
- name: GEO audit
  run: npx geo-opt audit -r docs/ -f json --model v2 > report.json
```

## API access

REST API with rate limits from 100 req/h (free) to 10 000 req/h (pro).
Interactive documentation at [api.geoopt.example.com](https://api.geoopt.example.com).

## Security

- SOC 2 Type II certified (June 2026).
- Zero-retention mode: content is discarded after audit.
- SSO/SAML for Enterprise plans.
- All data encrypted at rest (AES-256) and in transit (TLS 1.3).
