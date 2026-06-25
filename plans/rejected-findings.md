# Rejected & Deferred Findings

Findings considered during the deep audit of 2025-06-25 and not promoted to
implementation plans. Each entry records the original evidence, why it was
rejected or deferred, and under what conditions it should be reconsidered.

Revisit this file before each new audit run to avoid re-auditing the same
issues and to check whether deferred conditions have been met.

---

## Rejected — by design

### BUG-08: Stat-density regex counts bare dollar amounts as statistics

- **Original finding**: `src/optimizer.js:209` — the regex alternative
  `\$\d+(?:\.\d+)?[kKmMbB]?` makes the magnitude suffix optional. A price
  like `$12` matches. The heuristic counts e-commerce pricing as "statistics."
- **Reason rejected**: By-design. In GEO context, dollar amounts ARE legitimate
  statistics/data points. The Princeton GEO framework values concrete numerical
  evidence over qualitative claims, and pricing is concrete.
- **Reconsider if**: The scoring category is renamed from "Statistics Density"
  to something narrower (e.g., "Research Data Density") where prices don't
  qualify. Or if user feedback indicates inflated scores on e-commerce pages.

### BUG-09: Empty `Disallow:` value silently skipped in robots.txt parser

- **Original finding**: `src/optimizer.js:478` — `/^Disallow:\s*(.+)$/i`
  requires at least one character after `Disallow:`. A line like `Disallow:`
  (valid robots.txt meaning "allow all") is silently skipped.
- **Reason rejected**: Edge case too rare to justify code change + test. The
  tool's purpose is flagging blocked crawlers, not parsing every robots.txt
  nuance. An empty `Disallow:` is functionally equivalent to "not blocked"
  for the tool's use case.
- **Reconsider if**: The robots.txt parser is extracted as a reusable module
  (plan 007) and needs to handle full robots.txt semantics. Or if users report
  false positives/negatives caused by empty Disallow directives.

### BUG-07: Leading newline accumulates on repeated schema injections

- **Original finding**: `src/optimizer.js:671` — `${sigMd}\n\`\`\`json...`
  always emits a leading newline before the code fence. When no signature is
  configured (`sigMd = ""`), each re-injection adds a blank line.
- **Reason rejected**: Cosmetic only. The replace path (line 690) applies
  `.trim()` which strips the leading newline. The append path (line 693)
  intentionally adds spacing. The "accumulation on re-injection" scenario
  requires multiple manual `inject` commands on the same file, which is rare
  in practice.
- **Reconsider if**: An automated pipeline runs `inject` repeatedly on the
  same file (e.g., CI/CD regenerating schema on every build). In that case,
  the whitespace growth becomes a diff noise problem.

---

## Rejected — premature / wrong scale

### PERF-04: Large-file memory risk in `auditFile`

- **Original finding**: `src/optimizer.js:129-340` — `auditFile` holds the
  entire `textContent` in memory while running 8+ independent regex scans
  over it. A 2 MB file would be processed with at least two full copies
  (raw + stripped) and 8-10 regex passes.
- **Reason rejected**: Current use case is single-file CLI processing of
  articles (typically 5-50 KB). The tool is not a batch processor at scale.
  Premature optimization before the bottleneck is demonstrated.
- **Reconsider if**: Plan 008 (batch audit) is implemented AND users report
  slowness on directories with many large files. A streaming or single-pass
  architecture would be justified then.

### PERF-02 / PERF-03: Acronym loop O(N×M) and duplicate file reads

- **Original finding**: `src/optimizer.js:302-328` — acronym checking iterates
  ALL occurrences for each unexplained acronym. `injectSchema` reads the file
  twice (once in `generateSchemaData`, once directly).
- **Reason rejected**: The acronym loop early-breaks on first match near any
  occurrence, so the worst case only triggers for unexplained acronyms (which
  should be rare in well-written content). The duplicate file read in
  `injectSchema` is a ~0.1ms `readFileSync` on a local file — not measurable
  in end-to-end CLI latency.
- **Reconsider if**: Profiling shows these as bottlenecks. Unlikely for the
  acronym loop; possible for `injectSchema` if operating on network mounts.

---

## Deferred — merged into other plans

### DEBT-08: JS `loadConfig` searches fragile relative path into `.agents/`

- **Original finding**: `src/optimizer.js:21` — hardcoded fallback to
  `path.resolve(__dirname, "..", ".agents", "skills", "geo-optimization",
  "geo_config.json")`. This path only exists in the development repo, not
  when geo-opt is installed as an npm dependency.
- **Deferred to**: Plan 006 (JS/Python consolidation). The `.agents/` fallback
  is a symptom of the dual-implementation architecture. If Python is deprecated
  or the config loading is unified, this path becomes irrelevant.
- **Reconsider independently if**: Plan 006 decides to keep both implementations
  but users report `loadConfig` silently returning empty config when installed
  via npm.

### DOC-05: `schema_templates/` has no README explaining purpose

- **Original finding**: `.agents/skills/geo-optimization/resources/schema_templates/`
  contains 3 JSON files never referenced by code with no explanation.
- **Deferred to**: Plan 001 (Step 5) — adds a README.md to the directory.
  Not an independent plan; handled as part of tooling baseline.
- **Reconsider independently if**: The directory grows more files or someone
  tries to delete it, indicating confusion about its purpose.

### TEST-07: Python tests missing for `load_config`, `clean_markdown_to_plain_text`, `extract_sections`, `preprocess_content`

- **Original finding**: `test_optimizer.py:11` imports `load_config` but never
  tests it. `clean_markdown_to_plain_text`, `extract_sections`, and
  `preprocess_content` are not imported at all.
- **Deferred to**: Plan 006 (JS/Python consolidation). If Python remains
  canonical, these gaps must be closed. If Python is deprecated, adding tests
  is wasted effort.
- **Reconsider independently if**: Plan 006 decides to keep Python as an
  active implementation AND the Python code diverges from JS in these functions.

---

## Deferred — low priority, not worth a plan now

### BUG-04: `async main()` without `.catch()` — unhandled rejection on throw

- **Original finding**: `bin/cli.js:92` — `main()` is declared `async` but
  called without `.catch()`. All functions it calls are synchronous and use
  `process.exit(1)` on errors, so this hasn't caused issues. But if a future
  maintainer adds an `await` to a rejecting promise, it becomes an
  unhandled rejection.
- **Reason deferred**: The `async` keyword is vestigial (no `await` exists).
  Trivial to fix (remove `async` or add `.catch()`) but has caused zero
  production issues. Not worth a dedicated plan.
- **Reconsider if**: A future change adds `await` calls to `main()`, OR the
  CLI is refactored (plan 008 Step 1 rewrites `bin/cli.js` entirely, which
  will naturally resolve this).

### DEBT-06 (partial): Inconsistent CLI argument parsing

- **Original finding**: JS CLI uses manual `process.argv` parsing; Python
  uses `argparse`. Inconsistency across implementations.
- **Partially addressed by**: Plan 008 Step 1 rewrites `bin/cli.js` with
  cleaner parsing. Plan 006 documents this as an intentional difference
  (CLI layer is not duplicated logic).
- **What's deferred**: Full parity with Python's `argparse` (sub-command
  validation, automatic help generation, type checking). Plan 008 improves
  the JS CLI significantly but doesn't use a proper argument parser library.
- **Reconsider if**: Adding more commands/flags makes manual parsing
  unsustainable, OR Node.js `util.parseArgs` gains sub-command support.

### DIR-05: Generate HTML audit reports

- **Original finding**: The tool outputs text (console) or JSON (raw data).
  No HTML report for sharing with non-technical stakeholders. The JSON
  already contains all data needed to render a report.
- **Reason deferred**: Lower priority than the other four direction findings.
  "Stakeholder reports" is a secondary workflow compared to CLI-first usage
  and CI/CD gates. The SKILL.md workflow is agent-directed, not stakeholder-directed.
- **Reconsider if**: Users request shareable reports, OR the agent skill
  (SKILL.md) is updated to include a "generate stakeholder report" phase,
  OR an HTML template already exists from another project that can be adapted.

---

## Summary

| Status | Count | Category breakdown |
|--------|-------|--------------------|
| Rejected (by-design) | 3 | 2 correctness, 1 cosmetic |
| Rejected (premature) | 3 | 3 performance |
| Deferred (merged) | 3 | 1 tech-debt, 1 docs, 1 tests |
| Deferred (low priority) | 3 | 1 bug, 1 tech-debt, 1 direction |

**12 findings total** documented for future reevaluation.

---

## Reevaluation triggers

Review this file and reconsider findings when:

1. **Before each new audit run** — check if any rejected finding's conditions
   have changed.
2. **After plan 006 completes** — the Python consolidation decision affects
   TEST-07 and DEBT-08.
3. **After plan 008 completes** — batch audit at scale may surface PERF-04.
4. **On user feedback** — if users report scoring issues (BUG-08), robots.txt
   edge cases (BUG-09), or request HTML reports (DIR-05).
5. **When adding async operations to the CLI** — BUG-04 becomes relevant if
   `await` is introduced.
