# Configuration Schema

GeoOpt looks for `geo_config.json` in the project root. Every key is optional;
defaults are shown below.

## Top-level keys

```json
{
  "license": {
    "key": ""
  },
  "limits": {
    "max_pronoun_density": 0.05,
    "max_acronyms_unexplained": 3
  },
  "acronyms": {
    "GEO": "Generative Engine Optimization",
    "LLM": "Large Language Model"
  },
  "ignore": ["node_modules", ".git"],
  "extensions": [".md", ".html", ".htm"],
  "profile": "auto",
  "output": {
    "format": "text",
    "color": true
  }
}
```

## `license`

| Field | Type   | Default | Description                |
| ----- | ------ | ------- | -------------------------- |
| key   | string | `""`    | Tooltician Pro license key |

Set the `GEO_OPT_LICENSE_KEY` environment variable as an alternative.

## `limits`

Thresholds that trigger warnings during clarity analysis.

- **max_pronoun_density** (0.0–1.0): fraction of words that can be ambiguous
  pronouns before the analyzer deducts points. Default `0.05`.
- **max_acronyms_unexplained**: number of undefined acronyms allowed before
  deductions begin.

## `acronyms`

Dictionary of `ACRONYM: expansion` pairs. The analyzer checks whether each
acronym's expansion appears near its first use. Entries here override the
built-in dictionary.

## `ignore`

Array of glob patterns. Matching files and directories are skipped during
recursive scans. Uses `.gitignore` syntax.

## `extensions`

File extensions to process. Default: `[".md", ".html", ".htm"]`.

## `profile`

Content profile for audit v2. Accepted values: `auto`, `documentation`,
`open-source`, `editorial`, `commercial`, `ecommerce`, `regulated`.
When set to `auto` (default), the engine detects the profile heuristically.

## `output`

| Field  | Type    | Default | Description                      |
| ------ | ------- | ------- | -------------------------------- |
| format | string  | `text`  | `text`, `json`, or `summary`     |
| color  | boolean | `true`  | Whether to emit ANSI color codes |
