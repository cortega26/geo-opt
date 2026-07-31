# Plan 040 — Pro CI/CD Integration

**Track:** Pro differentiation (P0 gate)  
**Status:** DONE  
**Depends on:** 039 (done)  
**Priority:** P1 | **Effort:** M

## Outcome

A developer with geo-opt can drop a native GitHub Actions action or a GitLab CI
template into their pipeline and get threshold-based quality gates, a GEO score
badge for their README, and clear upgrade prompts when Pro features are invoked
without a license. At least one CI platform has a first-class native integration.

## Deliverables

| Deliverable | Location | Pro gate |
|---|---|---|
| `generateBadgeUrl`, `generateBadgeMarkdown`, `scoreToBadgeColor` | `src/badge.js` | Community |
| `geo-opt badge <file>` CLI command | `bin/cli.js` | Community |
| GitHub Actions composite action | `.github/actions/geo-opt-audit/action.yml` | Community/Pro (recursive + threshold require Pro in docs) |
| GitLab CI template | `ci-templates/gitlab-ci.yml` | Community/Pro |
| Badge tests | `tests/badge.test.js` | — |
| Type declarations | `index.d.ts` | — |
| Public export | `src/index.js` | — |

## Design decisions

### Badge generation (Community)

Pure function: `generateBadgeUrl(score, { label? })` → shields.io URL.
Color mapping matches GEO score semantics:

| Score | Color | Grade |
|---|---|---|
| 90–100 | `brightgreen` | A |
| 76–89 | `green` | B |
| 61–75 | `yellow` | C |
| 41–60 | `orange` | D |
| 0–40 | `red` | F |

`geo-opt badge <file>` runs the audit and outputs the badge markdown. Default
output is markdown; `--format url` outputs the bare URL; `--format json` outputs
all fields. Community feature: knowing your score is free.

### GitHub Actions composite action

Located at `.github/actions/geo-opt-audit/action.yml`. Works as a reusable
action when referenced as `tooltician-ai/geo-opt/.github/actions/geo-opt-audit@v1`.
The action checks out and installs the geo-opt dependencies from the action path.

Inputs: `path`, `threshold`, `recursive`, `model`, `format`, `license-key`.  
Outputs: `score`, `passed`, `badge-url`.

The action exits non-zero if a threshold is specified and not met. The `badge-url`
output allows the calling workflow to update a README or post a PR comment.

### GitLab CI template

Located at `ci-templates/gitlab-ci.yml`. Users include it with:

```yaml
include:
  - remote: 'https://raw.githubusercontent.com/tooltician-ai/geo-opt/main/ci-templates/gitlab-ci.yml'
```

Defines a `geo-opt-audit` job that installs geo-opt, runs the audit, and produces
a badge artifact. Variables: `GEO_OPT_PATH`, `GEO_OPT_THRESHOLD`,
`TOOLTICIAN_LICENSE_KEY`.

### Threshold gating

`--threshold` is already implemented and works for all users at the CLI level.
The Pro differentiation is in the *features that make threshold meaningful at
scale*: `--recursive` (audit entire site) and `--summary` (aggregate report).
Community users can use `--threshold` on a single file; Pro users can gate entire
directories.

## Acceptance criteria

- [ ] `generateBadgeUrl(75)` returns a valid shields.io URL with `green` color
- [ ] `geo-opt badge <file>` outputs badge markdown, exits 0
- [ ] `geo-opt badge <file> --format url` outputs bare URL
- [ ] `geo-opt badge <file> --format json` outputs JSON with score and badge fields
- [ ] `.github/actions/geo-opt-audit/action.yml` is valid YAML with correct `using: composite`
- [ ] `ci-templates/gitlab-ci.yml` is valid YAML with the `geo-opt-audit` job
- [ ] Badge functions are exported from `src/index.js` and typed in `index.d.ts`
- [ ] `npm run check` passes clean
