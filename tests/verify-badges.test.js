import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Writable } from "node:stream";
import { setTimeout as sleep } from "node:timers/promises";
import {
  parseTestCount,
  parseBranchCoverage,
  verifyRun,
  verifyFromSpawn,
  spawnSuiteOnce,
} from "../scripts/verify-badges.js";

function runText({ count = 940, coverage = 94.23 } = {}) {
  return [
    "# Subtest: some test",
    "# pass 1",
    "# tests " + count,
    "---------- coverage ----------",
    "Statements : " + coverage + "%",
    "Branches : " + coverage + "%",
    "Functions : " + coverage + "%",
    "Lines : " + coverage + "%",
    "------------------------------",
  ].join("\n");
}

function readmeText({ count = 940, coverage = 94 } = {}) {
  return [
    `<img src="https://img.shields.io/badge/tests-${count}_passed-16a34a" alt="${count} tests passed">`,
    `<img src="https://img.shields.io/badge/branch_coverage-${coverage}%25-..." alt="...">`,
  ].join("\n");
}

function readmeEsText({ count = 940, coverage = 94 } = {}) {
  return [
    `<img src="https://img.shields.io/badge/tests-${count}_pasados-16a34a" alt="${count} tests pasados">`,
    `<img src="https://img.shields.io/badge/cobertura_de_ramas-${coverage}%25-..." alt="...">`,
  ].join("\n");
}

const fixtureRead = (files) => (rel) => files[rel];

describe("Plan 087 — verify-badges parsers", () => {
  it("parses the piped TAP count summary", () => {
    assert.equal(parseTestCount("# tests 940\n", "tap"), 940);
  });

  it("parses the TTY spec count summary", () => {
    assert.equal(parseTestCount("ℹ tests 940\n", "spec"), 940);
  });

  it("parses branch coverage from the c8 text-summary block", () => {
    assert.equal(parseBranchCoverage("Branches : 94.23%\n", "c8"), 94.23);
  });

  it("rejects malformed count output", () => {
    assert.throws(() => parseTestCount("no summary here\n", "log"), /could not parse test count/u);
  });

  it("rejects malformed coverage output", () => {
    assert.throws(
      () => parseBranchCoverage("no coverage block\n", "log"),
      /could not parse branch coverage/u
    );
  });
});

describe("Plan 087 — badge verification", () => {
  it("passes when both badges match the run (count equal, coverage above floor)", () => {
    const readFile = fixtureRead({
      "README.md": readmeText({ count: 940, coverage: 94 }),
      "README.es.md": readmeEsText({ count: 940, coverage: 94 }),
    });
    const result = verifyRun(runText({ count: 940, coverage: 94.23 }), { readFile });
    assert.equal(result.count, 940);
    assert.equal(result.coverage, 94.23);
    assert.ok(result.ok);
  });

  it("fails when the count badge drifts from the actual count", () => {
    const readFile = fixtureRead({
      "README.md": readmeText({ count: 939 }),
      "README.es.md": readmeEsText({ count: 939 }),
    });
    const result = verifyRun(runText({ count: 940 }), { readFile });
    assert.equal(result.ok, false);
    assert.deepEqual(
      result.files.map((f) => f.file),
      ["README.md", "README.es.md"]
    );
    assert.ok(
      result.files[0].messages[0].includes("badge says 939, but actual test count is 940"),
      result.files[0].messages[0]
    );
  });

  it("passes when measured coverage rises above the badge floor", () => {
    const readFile = fixtureRead({
      "README.md": readmeText({ coverage: 90 }),
      "README.es.md": readmeEsText({ coverage: 90 }),
    });
    const result = verifyRun(runText({ coverage: 95.5 }), { readFile });
    assert.ok(result.ok, "raised coverage must not break the floor claim");
  });

  it("fails when measured coverage drops below the badge", () => {
    const readFile = fixtureRead({
      "README.md": readmeText({ coverage: 94 }),
      "README.es.md": readmeEsText({ coverage: 94 }),
    });
    const result = verifyRun(runText({ coverage: 88.5 }), { readFile });
    assert.equal(result.ok, false);
    assert.ok(result.files[0].messages[0].includes("88.5%"), result.files[0].messages[0]);
    assert.ok(result.files[0].messages[0].includes("88"), result.files[0].messages[0]);
  });

  it("fails when a file has no count badge at all", () => {
    const readFile = fixtureRead({
      "README.md": readmeText({ count: 940 }),
      "README.es.md": "no badges here\n",
    });
    const result = verifyRun(runText({ count: 940 }), { readFile });
    assert.equal(result.ok, false);
    assert.ok(
      result.files[1].messages[0].includes("no tests-<n>_passed badge"),
      result.files[1].messages[0]
    );
  });
});

describe("Plan 087 — canonical single-suite run", () => {
  it("launches the suite exactly once and verifies badges from that run", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "geo-opt-verify-test-"));
    const logPath = path.join(dir, "run.log");
    try {
      let spawnCalls = 0;
      const spawnSuite = async ({ logPath: target }) => {
        spawnCalls += 1;
        writeFileSync(target, runText({ count: 940, coverage: 94.23 }));
        return { status: 0, signal: null };
      };
      const readFile = fixtureRead({
        "README.md": readmeText({ count: 940, coverage: 94 }),
        "README.es.md": readmeEsText({ count: 940, coverage: 94 }),
      });
      const { status } = await verifyFromSpawn({ spawnSuite, readFile, logPath });
      assert.equal(spawnCalls, 1, "the canonical command must invoke the suite once");
      assert.equal(status, 0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("propagates a failing suite status without verifying badges", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "geo-opt-verify-test-"));
    const logPath = path.join(dir, "run.log");
    try {
      const spawnSuite = async () => ({ status: 7, signal: null });
      const { status } = await verifyFromSpawn({ spawnSuite, logPath });
      assert.equal(status, 7, "the suite's own exit status must be preserved");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects malformed run output cleanly instead of crashing", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "geo-opt-verify-test-"));
    const logPath = path.join(dir, "run.log");
    try {
      const spawnSuite = async ({ logPath: target }) => {
        writeFileSync(target, "no summary lines here\n");
        return { status: 0, signal: null };
      };
      const { status } = await verifyFromSpawn({ spawnSuite, logPath });
      assert.equal(status, 1, "a successful suite with unparseable output must fail the gate");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("never resolves before the run log has flushed (deterministic regression)", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "geo-opt-verify-flush-"));
    const logPath = path.join(dir, "run.log");
    try {
      // A log stream that swallows writes and only flushes when released:
      // resolving on the child's `close` instead of the log stream's
      // `close` would make the gate read a still-incomplete file. This pins
      // the flush-wait contract deterministically (real fs flushes on tmpfs
      // are too fast for the old race to reproduce reliably).
      let releaseFlush;
      const flushed = new Promise((resolve) => {
        releaseFlush = resolve;
      });
      const buffered = [];
      const fakeLog = new Writable({
        write(chunk, _enc, cb) {
          buffered.push(chunk);
          cb();
        },
        final(cb) {
          flushed.then(() => {
            writeFileSync(logPath, Buffer.concat(buffered));
            cb();
          });
        },
      });
      let resolved = false;
      const p = spawnSuiteOnce({
        logPath,
        bin: process.execPath,
        cmd: ["-e", "console.log('# tests 9')"],
        quiet: true,
        logStream: fakeLog,
      });
      p.then(({ status }) => {
        resolved = true;
        assert.equal(status, 0);
      });
      await sleep(300);
      assert.equal(resolved, false, "must wait for the run log to flush before resolving");
      releaseFlush();
      await p;
      assert.match(readFileSync(logPath, "utf8"), /# tests 9\n/u);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("streams a real child's output into the run log", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "geo-opt-verify-flush-"));
    const logPath = path.join(dir, "run.log");
    try {
      const { status } = await spawnSuiteOnce({
        logPath,
        bin: process.execPath,
        cmd: [
          "-e",
          "for (let i = 0; i < 1000; i++) console.log('line', i); console.log('# tests 7');",
        ],
        quiet: true,
      });
      assert.equal(status, 0);
      const text = readFileSync(logPath, "utf8");
      assert.ok(text.includes("line 999"), "bulk output must reach the run log");
      assert.ok(text.includes("# tests 7"), "finishing output must reach the run log");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
