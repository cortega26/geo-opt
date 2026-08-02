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
// Allowlist entries are keyed by stable GHSA identity (url + package), never by
// npm's numeric advisory `source` or its version-range spelling: npm renumbers
// sources and respells ranges without the underlying advisory changing (the
// brace-expansion entry already saw source 1124334 -> 1130591 and range
// `<=5.0.7` -> `>=4.0.0 <5.0.8`). What stays strict is the installed surface:
// every reported vulnerable node must be a reviewed path whose installed
// version in package-lock.json is exactly the reviewed one.
//
// Run standalone as `node scripts/check-audit.js` (or `npm run audit:check`).
// Deliberately NOT part of `npm run check`: it stays a CI-only step, matching
// where the previous `npm audit --audit-level=high` lived, so a local `check`
// does not depend on the advisory database being reachable.

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
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
 * Identity keys are `url` (the stable GHSA) and `package`. `source` and
 * `range` are diagnostic only: npm renumbers sources and respells ranges, so
 * matching on them would re-open the gate on registry metadata churn. `nodes`
 * and `version` are the reviewed installed surface and MUST match exactly —
 * any other path or installed version means a fresh security decision.
 *
 * @type {Array<{
 *   package: string, url: string, nodes: string[], version: string,
 *   source: number, range: string,
 *   added: string, recheck: string, reason: string
 * }>}
 */
const ALLOWLIST = [
  {
    package: "brace-expansion",
    url: "https://github.com/advisories/GHSA-mh99-v99m-4gvg",
    nodes: ["node_modules/npm/node_modules/brace-expansion"],
    version: "5.0.7",
    source: 1130591, // diagnostic only (was 1124334 at allowlist time)
    range: ">=4.0.0 <5.0.8", // diagnostic only (was "<=5.0.7")
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

/**
 * Verify that a reported vulnerable entry sits exactly on the reviewed
 * installed surface. Fails closed: any unexpected node, or any node whose
 * package-lock version is not the reviewed one, is a mismatch.
 *
 * @param {{ nodes?: string[] }} entry vulnerability entry from the audit report
 * @param {Record<string, { version?: string }>} packages package-lock `packages`
 * @param {{ nodes: string[], version: string }} allow allowlist entry
 * @returns {string | null} mismatch description, or null when the surface matches
 */
function verifyInstalledSurface(entry, packages, allow) {
  const nodes = entry.nodes ?? [];
  if (nodes.length === 0) {
    return "report lists no vulnerable node to verify";
  }
  for (const node of nodes) {
    if (!allow.nodes.includes(node)) {
      return `installed at un-reviewed path ${node}`;
    }
    const installed = packages[node]?.version;
    if (installed !== allow.version) {
      return `installed version ${installed ?? "unknown"} at ${node} is not the reviewed ${allow.version}`;
    }
  }
  return null;
}

/**
 * Pure decision core, exported for the hermetic tests in
 * tests/check-audit.test.js (which must not call the advisory registry).
 *
 * @param {any} report parsed `npm audit --json`
 * @param {{ packages?: Record<string, { version?: string }> }} lockfile parsed package-lock.json
 * @param {typeof ALLOWLIST} [allowlist]
 * @returns {{ suppressed: Array<{ advisory: any, entry: any }>, blocking: any[], stale: any[] }}
 */
export function evaluateAuditReport(report, lockfile, allowlist = ALLOWLIST) {
  const packages = lockfile.packages ?? {};
  const allowedByUrl = new Map(allowlist.map((e) => [e.url, e]));
  // Urls seen anywhere in the report's object `via` entries, at any severity.
  // "Stale" means the GHSA did not appear in this report at all: an advisory
  // that merely sits below the blocking threshold, or appears under a
  // different package name, must not be reported as "likely fixed upstream".
  const appearedUrls = new Set();
  const suppressed = [];
  const blocking = [];
  const stale = [];

  for (const entry of Object.values(report.vulnerabilities ?? {})) {
    for (const advisory of entry.via ?? []) {
      // String `via` entries are just parent packages pulling a vulnerable
      // child in; only object entries describe an advisory.
      if (typeof advisory !== "object" || advisory == null) continue;
      if (typeof advisory.url === "string") appearedUrls.add(advisory.url);
      if (!BLOCKING.has(advisory.severity)) continue;
      const allow = allowedByUrl.get(advisory.url);
      if (!allow || allow.package !== advisory.name) {
        blocking.push({ advisory });
        continue;
      }
      const mismatch = verifyInstalledSurface(entry, packages, allow);
      if (mismatch) {
        blocking.push({ advisory, mismatch });
        continue;
      }
      suppressed.push({ advisory, entry: allow });
    }
  }

  for (const allow of allowlist) {
    if (!appearedUrls.has(allow.url)) stale.push(allow);
  }

  return { suppressed, blocking, stale };
}

function main() {
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

  let lockfile;
  try {
    lockfile = JSON.parse(readFileSync(path.join(repoRoot, "package-lock.json"), "utf8"));
  } catch {
    console.error(
      "✖ could not read package-lock.json — the allowlisted installed surface cannot be verified"
    );
    process.exit(1);
  }

  const { suppressed, blocking, stale } = evaluateAuditReport(report, lockfile);
  const today = new Date().toISOString().slice(0, 10);

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

  for (const entry of stale) {
    console.warn(
      `⚠ allowlist entry for ${entry.package} (${entry.url}) no longer matches any advisory — ` +
        `it was likely fixed upstream. Remove it from scripts/check-audit.js.`
    );
  }

  if (blocking.length > 0) {
    console.error(
      `\n✖ ${blocking.length} unapproved high/critical advisor${blocking.length === 1 ? "y" : "ies"}:`
    );
    for (const { advisory, mismatch } of blocking) {
      console.error(
        `  - ${advisory.severity}: ${advisory.name} ${advisory.range} — ${advisory.title}`
      );
      console.error(`    ${advisory.url}`);
      if (mismatch) {
        console.error(`    not the reviewed installed surface: ${mismatch}`);
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
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
