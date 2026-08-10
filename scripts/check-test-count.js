#!/usr/bin/env node
// Verifies the README test-count badge matches the actual `node --test` count.
// Wired into `npm run check` and CI right after `npm test` (node:test refuses
// to run recursively from inside a test file, so this stays a standalone
// script).
// Exits non-zero if the badge has drifted from the real count.
//
// Preferred invocation: `--from-log <file>` pointing at the stdout/stderr of a
// just-completed `node --test tests/*.test.js` run. The count is read from that
// log, so the suite is NOT re-run. Without `--from-log` the script falls back
// to running the suite itself. (The runner prints the spec summary "ℹ tests N"
// on a TTY and the TAP summary "# tests N" when stdout is piped — parse both.)

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

function testCountFrom(text, source) {
  const m = text.match(/ℹ tests\s+(\d+)/u) || text.match(/^#\s+tests\s+(\d+)/mu);
  if (!m) {
    console.error(
      `✖ could not parse test count from ${source} (looked for the "ℹ tests N" ` +
        `spec-reporter or "# tests N" TAP summary):\n${text.slice(-800)}`
    );
    process.exit(1);
  }
  return m[1];
}

function countFromLog(logPath) {
  return testCountFrom(readFileSync(logPath, "utf8"), `log ${logPath}`);
}

function countFromSpawn() {
  const r = spawnSync(process.execPath, ["--test", "tests/*.test.js"], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 300_000,
    maxBuffer: 256 * 1024 * 1024,
  });
  if (r.signal) {
    console.error(
      `✖ node --test terminated early (signal ${r.signal}) — cannot verify the badge. ` +
        `Pass --from-log <npm test log> to skip the in-process rerun.`
    );
    process.exit(1);
  }
  return testCountFrom((r.stdout || "") + (r.stderr || ""), "node --test output");
}

const fromLogIdx = process.argv.indexOf("--from-log");
const actual = fromLogIdx !== -1 ? countFromLog(process.argv[fromLogIdx + 1]) : countFromSpawn();

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
