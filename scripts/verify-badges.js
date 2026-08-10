#!/usr/bin/env node
// One canonical JS quality-gate command (Plan 087): runs the full node:test
// suite under c8 exactly ONCE, streams the output live to the caller, and
// verifies BOTH README badges (test count + branch coverage) against that
// same run.
//
// - `npm run test:verify` (no args): orchestrates the single run itself.
// - `--from-log <file>`: verify badges against an existing run log instead.
//
// The suite exit status is preserved: a failing suite exits with its own
// status and badges are NOT verified against a failed run. Coverage is a
// floor claim: measured >= badge passes; only drops below the badge fail.
// Running inside `npm test` is impossible (node:test refuses recursion), so
// this stays a standalone script invoked by npm scripts and CI.
//
// If the project ever switches coverage tooling away from c8, the
// `Branches` regex below is the only parser that needs to change.

import { spawn } from "node:child_process";
import { createWriteStream, readFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, "..");

function defaultRead(rel) {
  return readFileSync(path.join(repoRoot, rel), "utf8");
}

const BADGE_FILES = [
  {
    file: "README.md",
    count: /tests-(\d+)_(?:passed|pasados)/u,
    coverage: /branch_coverage-(\d+)%25/u,
  },
  {
    file: "README.es.md",
    count: /tests-(\d+)_(?:passed|pasados)/u,
    coverage: /cobertura_de_ramas-(\d+)%25/u,
  },
];

export function parseTestCount(text, source) {
  // The runner prints the spec summary "ℹ tests N" on a TTY and the TAP
  // summary "# tests N" when stdout is piped — parse both.
  const m = text.match(/ℹ tests\s+(\d+)/u) || text.match(/^#\s+tests\s+(\d+)/mu);
  if (!m) {
    throw new Error(
      `could not parse test count from ${source} (looked for the "ℹ tests N" ` +
        `spec-reporter or "# tests N" TAP summary):\n${text.slice(-800)}`
    );
  }
  return Number(m[1]);
}

export function parseBranchCoverage(text, source) {
  const m = text.match(/Branches\s*:\s*([\d.]+)%/u);
  if (!m) {
    throw new Error(
      `could not parse branch coverage from ${source} (c8 text-summary ` +
        `"Branches : NN.NN%" block missing):\n${text.slice(-800)}`
    );
  }
  return Number(m[1]);
}

// Verifies both README badges against one run's output. Returns a result
// object; never exits. `readFile` is an injectable seam for unit tests.
export function verifyRun(runText, { source = "run log", readFile = defaultRead } = {}) {
  const count = parseTestCount(runText, source);
  const coverage = parseBranchCoverage(runText, source);
  const files = BADGE_FILES.map(({ file, count: countRe, coverage: coverageRe }) => {
    const text = readFile(file);
    const countMatch = text.match(countRe);
    const coverageMatch = text.match(coverageRe);
    const messages = [];
    if (!countMatch) {
      messages.push(`✖ ${file}: no tests-<n>_passed badge found`);
    } else if (Number(countMatch[1]) !== count) {
      messages.push(
        `✖ ${file}: badge says ${countMatch[1]}, but actual test count is ${count}. ` +
          `Update the badge URL, the highlights line, and the dev section.`
      );
    }
    if (!coverageMatch) {
      messages.push(`✖ ${file}: no branch-coverage badge found`);
    } else if (coverage < Number(coverageMatch[1])) {
      messages.push(
        `✖ ${file}: badge claims ${coverageMatch[1]}% branch coverage, but the measured ` +
          `value is ${coverage}%. Correct the badge to the measured floor ` +
          `(${Math.floor(coverage)}%).`
      );
    }
    return { file, messages, ok: messages.length === 0 };
  });
  return {
    count,
    coverage,
    files,
    ok: files.every((f) => f.ok),
  };
}

// Spawn seam: launches the full suite under c8 exactly once and tees the
// output to both the caller's stdout/stderr and the run log. Resolves with
// { status, signal } only after the run log has been fully flushed to disk —
// reading it synchronously right after `close` would race the async log
// stream and could miss the trailing summary lines. `bin`/`cmd`/`logStream`
// override the wrapped program and the log stream (testing seams); `quiet`
// skips the live tee (useful for regression tests that would otherwise flood
// the test output).
export function spawnSuiteOnce({
  cwd = repoRoot,
  logPath,
  bin,
  cmd,
  quiet = false,
  logStream,
} = {}) {
  return new Promise((resolve, reject) => {
    const log = logStream || createWriteStream(logPath, { flags: "w" });
    let child;
    let settled = false;
    const settle = (fn) => (value) => {
      if (settled) return;
      settled = true;
      fn(value);
    };
    const onLogError = settle((err) => {
      if (child) child.kill();
      reject(err);
    });
    log.on("error", onLogError);
    const program = bin || path.join(cwd, "node_modules", ".bin", "c8");
    const args = cmd || ["--reporter=text-summary", process.execPath, "--test", "tests/*.test.js"];
    try {
      child = spawn(program, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    } catch (err) {
      log.destroy();
      reject(err);
      return;
    }
    // Every output stream feeds the run log; only a live call also tees it
    // to the caller. quiet mode keeps regression-test output clean.
    const attach = (stream, target) => {
      stream.on("error", () => {});
      stream.pipe(target);
    };
    if (quiet) {
      attach(child.stdout, log);
      attach(child.stderr, log);
    } else {
      attach(child.stdout, process.stdout);
      attach(child.stdout, log);
      attach(child.stderr, process.stderr);
      attach(child.stderr, log);
    }
    child.on(
      "error",
      settle((err) => {
        log.destroy();
        reject(err);
      })
    );
    child.on("close", (status, signal) => {
      // The pipes auto-end the log stream, so its `close` may already have
      // fired before the child's own `close` event — check synchronously
      // instead of attaching a listener to an event that already passed.
      const done = settle(() => resolve({ status, signal }));
      if (log.closed) {
        done();
        return;
      }
      log.once("close", done);
      log.end();
    });
  });
}

function report(result, sourceLabel) {
  for (const file of result.files) {
    for (const message of file.messages) {
      console.error(message);
    }
  }
  if (result.ok) {
    console.log(
      `✔ README badges match: ${result.count} tests, branch coverage ` +
        `${result.coverage}% ${sourceLabel}`
    );
  }
  return result.ok ? 0 : 1;
}

// Canonical verification from a single run: spawns the suite once (via the
// injectable `spawnSuite` seam), then verifies badges from that run's log.
// Never exits; returns { status } where status is the suite's own status.
export async function verifyFromSpawn({
  spawnSuite = spawnSuiteOnce,
  readFile = defaultRead,
  logPath,
} = {}) {
  const tmpDir = logPath ? null : mkdtempSync(path.join(tmpdir(), "geo-opt-verify-"));
  const tmp = logPath || path.join(tmpDir, "run.log");
  const { status, signal } = await spawnSuite({ logPath: tmp });
  if (status !== 0) {
    console.error(
      `✖ JS suite failed (exit ${status}${signal ? `, signal ${signal}` : ""}) — ` +
        `badges not verified. Run log: ${tmp}`
    );
    return { status: status ?? 1 };
  }
  let result;
  try {
    result = verifyRun(readFileSync(tmp, "utf8"), { source: `log ${tmp}`, readFile });
  } catch (err) {
    console.error(`✖ cannot verify badges from the run output: ${err.message}\n  Run log: ${tmp}`);
    return { status: 1 };
  }
  const statusCode = report(result, "(verified from one run)");
  if (!logPath) {
    rmSync(tmpDir, { recursive: true, force: true });
  }
  return { status: statusCode };
}

function isMain() {
  return process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
}

if (isMain()) {
  const fromLogIdx = process.argv.indexOf("--from-log");
  if (fromLogIdx !== -1) {
    const logPath = process.argv[fromLogIdx + 1];
    try {
      const result = verifyRun(readFileSync(logPath, "utf8"), { source: `log ${logPath}` });
      process.exitCode = report(result, `(from ${logPath})`);
    } catch (err) {
      console.error(`✖ ${err.message}`);
      process.exitCode = 1;
    }
  } else {
    verifyFromSpawn()
      .then(({ status }) => {
        process.exitCode = status;
      })
      .catch((err) => {
        console.error(`✖ ${err.message}`);
        if (err.code === "ENOENT") {
          console.error("  Is the c8 binary installed? Run `npm ci` before the gate.");
        }
        process.exitCode = 1;
      });
  }
}
