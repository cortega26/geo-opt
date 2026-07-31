# Plan 063: Normalize explicit frontmatter fields in `generate-all` only when a real workflow is blocked

> **Executor instructions:** This is a maintenance/DX improvement, not a
> commercial milestone. Freeze it during Plan 059 unless a real external user
> reports the inconsistency in the selected workflow, or a critical correctness
> defect requires an earlier fix. Do not treat product-led interest or a
> non-commercial continuation decision as authorization by itself.

**Status:** DEFERRED  
**Priority:** P3  
**Size:** M  
**Depends on:** a documented real-user workflow block, or a separately recorded
critical correctness priority  
**Planned against:** `b2e6055`, revised 2026-07-22

## Why this is parked

`llmstxt generate` can include explicitly named frontmatter fields while
`generate-all` does not expose the matching option. The inconsistency is real,
but it does not create distribution, adoption, or willingness to pay. It should
be fixed when it removes actual friction, not because the roadmap needs a
feature.

## Scope after the trigger

- Reconfirm the exact standalone `extractFrontmatterContent` semantics.
- Add the existing opt-in `--frontmatter-fields <fields...>` behavior to
  `generate-all`, preserving default output and Node-only capability status.
- Add focused CLI tests, synchronized governed documentation, and an
  `Unreleased` changelog entry.

## Out of scope

- Automatic metadata/schema inference, changed defaults, Python parity,
  commercial terms, new product packaging, or unrelated aggregate artifacts.

## Work plan after the trigger

1. Record the anonymized workflow block and verify that it is the existing
   frontmatter inconsistency rather than an unsupported expectation.
2. Reuse the existing helper and standalone option semantics; do not create a
   second parser.
3. Thread the option only to `llms-full.txt` content, preserving the no-option
   path byte-for-byte where practical.
4. Add fixture tests for explicit fields, arrays, absent/unrequested fields,
   Markdown body, unchanged defaults, and unaffected adjacent artifacts.
5. Update only relevant Node-only docs/skill references and run governed checks.

## Verification

| Check | Command | Expected result |
| --- | --- | --- |
| Confirm trigger | `rg -n "frontmatter|generate-all|workflow" plans/business/funnel-and-metrics.md` | A real workflow block or correctness rationale is recorded |
| Focused behavior | `node --test tests/cli-smoke.test.js` | Existing and new CLI smoke tests pass |
| Full governed suite | `npm run check && python3 .agents/skills/geo-optimization/scripts/test_optimizer.py` | Exit 0; no unsupported parity claim |
| Change quality | `git diff --check` | Exit 0 |

## Done when

- [ ] A real workflow block or critical correctness need justified the work.
- [ ] The option is explicit, Node-only, and preserves defaults.
- [ ] Tests, documentation, and changelog are synchronized.

## Stop conditions

- The request implies metadata inference or a changed default.
- The evidence is only roadmap interest, not a blocked workflow.
- Python parity or a commercial tier boundary is required.

## Maintenance notes

Correctness can outrank this freeze. Commercial validation cannot.
