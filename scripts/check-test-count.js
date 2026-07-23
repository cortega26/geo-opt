#!/usr/bin/env node
// Verifies the README test-count badge matches the actual `node --test` count.
// Run standalone as `node scripts/check-test-count.js` (NOT inside `npm test`
// — node:test refuses to run recursively, so this must be a standalone script
// invoked separately). It is not yet wired into `npm run check` because that
// would require a `package.json` edit outside Plan 058's scope.
// Exits non-zero if the badge has drifted from the real count.

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

function badgeNumber(text, label) {
  const m = text.match(/tests-(\d+)_(?:passed|pasados)/u);
  if (!m) {
    console.error(`✖ ${label}: no tests-<n>_passed badge found`);
    process.exit(1);
  }
  return m[1];
}

const r = spawnSync(process.execPath, ["--test", "tests/*.test.js"], {
  cwd: repoRoot,
  encoding: "utf8",
  timeout: 120_000,
});

const out = (r.stdout || "") + (r.stderr || "");
const m = out.match(/ℹ tests\s+(\d+)/);
if (!m) {
  console.error(`✖ could not parse test count from node --test output:\n${out.slice(-800)}`);
  process.exit(1);
}
const actual = m[1];

let failed = 0;
for (const readme of ["README.md", "README.es.md"]) {
  const text = read(readme);
  const badge = badgeNumber(text, readme);
  if (badge !== actual) {
    console.error(
      `✖ ${readme}: badge says ${badge}, but actual test count is ${actual}. ` +
        `Update the badge URL, the highlights line, and the dev section.`
    );
    failed++;
  } else {
    console.log(`✔ ${readme}: badge (${badge}) matches actual test count`);
  }
}

if (failed > 0) {
  process.exit(1);
}
