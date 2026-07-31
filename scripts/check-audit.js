#!/usr/bin/env node
// Security-audit gate. Replaces a bare `npm audit --audit-level=high` so that a
// single unfixable advisory cannot force the alternative of `--omit=dev`, which
// would blind the gate to the entire dev toolchain (semantic-release runs in CI
// with publish credentials — that tree is the highest-value supply-chain
// surface this repo has).
//
// Contract: exits non-zero if and only if there is a high/critical advisory
// that is not in ALLOWLIST below. Stale or past-recheck allowlist entries are
// reported as warnings, never failures, so CI only ever goes red for a real
// unapproved vulnerability.
//
// Run standalone as `node scripts/check-audit.js` (or `npm run audit:check`).
// Deliberately NOT part of `npm run check`: it stays a CI-only step, matching
// where the previous `npm audit --audit-level=high` lived, so a local `check`
// does not depend on the advisory database being reachable.

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Severities this gate blocks on. Mirrors the previous `--audit-level=high`. */
const BLOCKING = new Set(["high", "critical"]);

/**
 * Advisories accepted as unfixable. Each entry must name the advisory, why it
 * cannot be resolved, and when to look again. Remove an entry as soon as an
 * upstream fix lands — the gate warns when one no longer matches.
 *
 * @type {Array<{
 *   source: number, package: string, url: string, range: string,
 *   added: string, recheck: string, reason: string
 * }>}
 */
const ALLOWLIST = [
  {
    source: 1124334,
    package: "brace-expansion",
    url: "https://github.com/advisories/GHSA-mh99-v99m-4gvg",
    range: "<=5.0.7",
    added: "2026-07-31",
    recheck: "2026-10-31",
    reason:
      "Dev-only and unfixable upstream. The vulnerable copy is bundled inside " +
      "the npm CLI tarball (semantic-release > @semantic-release/npm > npm), " +
      "so `overrides` cannot reach it — bundled dependencies ship as-is. " +
      "Verified 2026-07-31: npm 11.19.0 and 12.0.2 both still bundle 5.0.7, " +
      "so no version bump resolves it. Not reachable from published geo-opt " +
      "code; semantic-release executes only in the Release workflow. The " +
      "direct dependency path (eslint > minimatch) is already on 5.0.8.",
  },
];

const result = spawnSync("npm", ["audit", "--json"], {
  cwd: repoRoot,
  encoding: "utf8",
  timeout: 120_000,
  shell: process.platform === "win32",
});

// `npm audit` exits non-zero whenever vulnerabilities exist, so the exit code
// says nothing on its own. Unparseable stdout is the real failure signal.
let report;
try {
  report = JSON.parse(result.stdout);
} catch {
  console.error("✖ could not parse `npm audit --json` output:");
  console.error(((result.stderr || "") + (result.stdout || "")).slice(-800));
  process.exit(1);
}

if (!report.vulnerabilities) {
  console.error("✖ unexpected `npm audit --json` shape: no `vulnerabilities` key");
  process.exit(1);
}

// Advisories appear as objects inside each entry's `via`; string entries are
// just parent packages pulling a vulnerable child in. Dedupe by source id.
/** @type {Map<number, any>} */
const advisories = new Map();
for (const entry of Object.values(report.vulnerabilities)) {
  for (const via of entry.via ?? []) {
    if (typeof via === "object" && via.source != null && !advisories.has(via.source)) {
      advisories.set(via.source, via);
    }
  }
}

const allowed = new Map(ALLOWLIST.map((e) => [e.source, e]));
const today = new Date().toISOString().slice(0, 10);

const blocking = [];
const suppressed = [];

for (const advisory of advisories.values()) {
  if (!BLOCKING.has(advisory.severity)) continue;
  const entry = allowed.get(advisory.source);
  if (!entry) {
    blocking.push(advisory);
    continue;
  }
  if (entry.range !== advisory.range) {
    // The advisory now covers a different version range — the previous
    // "unfixable" analysis no longer necessarily holds.
    blocking.push({ ...advisory, rangeChangedFrom: entry.range });
    continue;
  }
  suppressed.push({ advisory, entry });
}

for (const { advisory, entry } of suppressed) {
  console.log(
    `• accepted ${advisory.severity}: ${advisory.name} ${advisory.range} (${advisory.url})`
  );
  console.log(`  ${entry.reason}`);
  if (today > entry.recheck) {
    console.warn(
      `  ⚠ recheck date ${entry.recheck} has passed — confirm this is still unfixable, ` +
        `then extend or remove the allowlist entry.`
    );
  }
}

for (const entry of ALLOWLIST) {
  if (!advisories.has(entry.source)) {
    console.warn(
      `⚠ allowlist entry for ${entry.package} (source ${entry.source}) no longer matches any ` +
        `advisory — it was likely fixed upstream. Remove it from scripts/check-audit.js.`
    );
  }
}

if (blocking.length > 0) {
  console.error(
    `\n✖ ${blocking.length} unapproved high/critical advisor${blocking.length === 1 ? "y" : "ies"}:`
  );
  for (const advisory of blocking) {
    console.error(
      `  - ${advisory.severity}: ${advisory.name} ${advisory.range} — ${advisory.title}`
    );
    console.error(`    ${advisory.url}`);
    if (advisory.rangeChangedFrom) {
      console.error(
        `    range changed since it was allowlisted (was ${advisory.rangeChangedFrom}) — re-evaluate`
      );
    }
  }
  console.error("\nFix them, or add a justified entry to ALLOWLIST in scripts/check-audit.js.");
  process.exit(1);
}

const counts = report.metadata?.vulnerabilities ?? {};
console.log(
  `\n✔ no unapproved high/critical advisories ` +
    `(${counts.critical ?? 0} critical, ${counts.high ?? 0} high, ${counts.moderate ?? 0} moderate, ${counts.low ?? 0} low in tree)`
);
