#!/usr/bin/env node
// Enforces the plans/README.md governance rule that a plan marked DONE links
// to plans/archive/: any table row whose last cell starts with `DONE` must
// link its plan file under `archive/`. Run standalone as
// `node scripts/check-plan-archive.js` (defaults to plans/README.md, or pass a
// path argument). Exits 1 listing every offending plan number and link.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, "..");

const target = process.argv[2] || path.join(repoRoot, "plans", "README.md");

/** Table rows of the form `| [NNN](LINK) | ... | <status> |`. */
function planRows(text) {
  const rows = [];
  for (const line of text.split("\n")) {
    if (!line.trim().startsWith("|")) continue;
    const cells = line
      .split("|")
      .map((cell) => cell.trim())
      .filter(Boolean);
    const link = cells[0]?.match(/^\[(\d+)\]\(([^)]+)\)$/u);
    if (!link) continue;
    rows.push({ number: link[1], link: link[2], status: cells[cells.length - 1] });
  }
  return rows;
}

let text;
try {
  text = readFileSync(target, "utf8");
} catch (error) {
  console.error(`✖ cannot read ${target}: ${error.message}`);
  process.exit(1);
}

const violations = planRows(text).filter(
  (row) => /^DONE/u.test(row.status) && !row.link.startsWith("archive/")
);

if (violations.length > 0) {
  console.error(`✖ ${target}: DONE plans must link to plans/archive/:`);
  for (const violation of violations) {
    console.error(`  - plan ${violation.number}: ${violation.link} (${violation.status})`);
  }
  console.error("Move each plan file to plans/archive/ and update its link in plans/README.md.");
  process.exit(1);
}

console.log(`✔ ${target}: all DONE plans link to plans/archive/`);
