# Plan 080: Keep audited source bodies out of aggregate summaries

> **Executor instructions**: Preserve internal content reuse for `generate-all`
> while ensuring every serialized aggregate omits source bodies. Update the plan
> index when complete.
>
> **Drift check (run first)**: `git diff --stat 888d3e7..HEAD -- src/batch.js bin/cli.js index.d.ts tests/optimizer.test.js tests/cli-smoke.test.js plans/README.md`

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: MED
- **Depends on**: none
- **Category**: security / privacy / bug
- **Planned at**: commit `888d3e7`, 2026-08-02

## Why this matters

Batch results retain each full source body so `generate-all` can avoid rereads.
`aggregateReport` returns those same objects under `perFile`, causing
`audit --summary --format json` and `audit-report.json` to embed proprietary
content unexpectedly. Reports should contain findings/metadata, not raw input.

## Current state

- `src/batch.js:37-38` stores `{ ..., report, content }` for success results.
- `aggregateReport` returns `perFile: results` at lines 77-84 and 134-155.
- `bin/cli.js:241-245` serializes the summary directly.
- `bin/cli.js:1226-1237` intentionally consumes `r.content` for llms-full
  generation, then serializes the aggregate at lines 1243-1245.
- `AuditResult.content?: string` is public at `index.d.ts:615-621`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Batch/CLI | `node --test --test-name-pattern="summary|generate-all|auditFiles" tests/optimizer.test.js tests/cli-smoke.test.js` | pass |
| Types | `npm run typecheck` | exit 0 |
| Full | `npm run check` | exit 0 |

## Scope

**In scope**: batch aggregation, CLI serialization tests, declarations if the
public result contract is intentionally narrowed, `CHANGELOG.md`,
`plans/README.md`.

**Out of scope**: rescoring/rereading files, removing content needed by
`generate-all`, changing report findings, or adding telemetry.

## Git workflow

- Branch: `advisor/080-redact-summary-content`
- Commit example: `fix(report): omit audited bodies from summaries`.

## Steps

### Step 1: Pin serialization boundaries

Use a unique secret-like sentinel as audited content. Assert it is absent from
`JSON.stringify(aggregateReport(results))`, CLI `--summary` stdout, and generated
`audit-report.json`, while llms-full still contains the intended page content.

**Verify**: focused tests expose the current leak.

### Step 2: Sanitize aggregate per-file data

Build public per-file objects explicitly or strip `content` before returning an
aggregate. Apply the same sanitization in the zero-success branch. Do not mutate
the original `auditFiles` results because `generate-all` still consumes them.

**Verify**: unit test proves aggregate lacks `content` and original result still
retains it for internal reuse.

### Step 3: Clarify the public contract and release note

If `AggregateReport.perFile` needs a redacted subtype, declare it. Add an
Unreleased Security/Fixed bullet stating summaries no longer contain inputs.

**Verify**: typecheck, focused CLI tests, full check, and diff check pass.

## Test plan

- Success, mixed success/error, zero success, CLI summary, generate-all report,
  and llms-full reuse.
- Assert keys and serialized sentinel absence, not only object identity.

## Done criteria

- [ ] No aggregate/report JSON contains raw audited source bodies.
- [ ] `generate-all` still creates llms-full without rereading source files.
- [ ] Error metadata and findings remain present.
- [ ] Type/full checks pass; scoped files only.

## STOP conditions

- Removing serialized content would break a documented public contract relied
  on by a test/README; report the compatibility decision.
- The only fix rereads every file or mutates input result objects.
- A second serialization path still exposes the sentinel.

## Maintenance notes

Treat audited bodies as transient internal data. Future report fields should be
allowlisted rather than serializing internal work objects wholesale.
