#!/usr/bin/env node
// Verifies the README branch-coverage badges (a floor claim) against a real
// `c8` measurement. Run standalone as `node scripts/check-coverage.js` (NOT
// inside `npm test` — node:test refuses to run recursively, so this must be a
// standalone script invoked separately).
//
// Floor semantics are deliberate: the badge says "branch coverage is at least
// N%", not "exactly N%", so test additions that RAISE coverage must not break
// the check — only coverage dropping below the claimed value fails.
// Exits non-zero if the measured branch coverage is below either badge.
//
// The `--reporter=text-summary` flag is required: c8's default `text`
// reporter prints a table, and this script parses the summary block.
// If the project ever switches coverage tooling away from c8, the parser
// below (the `Branches` regex) is the only place that needs to change.

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, "..");

function read(rel) {
  return readFileSync(path.join(repoRoot, rel), "utf8");
}

const r = spawnSync("npx", ["c8", "--reporter=text-summary", "node", "--test", "tests/*.test.js"], {
  cwd: repoRoot,
  encoding: "utf8",
  timeout: 300_000,
});

const out = (r.stdout || "") + (r.stderr || "");
const m = out.match(/Branches\s*:\s*([\d.]+)%/u);
if (!m) {
  console.error(`✖ could not parse branch coverage from c8 output:\n${out.slice(-800)}`);
  process.exit(1);
}
const measured = Number(m[1]);

const badges = [
  { file: "README.md", token: /branch_coverage-(\d+)%25/u },
  { file: "README.es.md", token: /cobertura_de_ramas-(\d+)%25/u },
];

let failed = 0;
for (const { file, token } of badges) {
  const text = read(file);
  const badgeMatch = text.match(token);
  if (!badgeMatch) {
    console.error(`✖ ${file}: no branch-coverage badge found`);
    failed++;
    continue;
  }
  const badge = Number(badgeMatch[1]);
  if (measured < badge) {
    console.error(
      `✖ ${file}: badge claims ${badge}% branch coverage, but the measured ` +
        `value is ${measured}%. Correct the badge to the measured floor ` +
        `(${Math.floor(measured)}%).`
    );
    failed++;
  } else {
    console.log(`✔ ${file}: badge (${badge}) verified — measured branch coverage is ${measured}%`);
  }
}

if (failed > 0) {
  process.exit(1);
}
