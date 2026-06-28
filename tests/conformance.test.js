/**
 * Cross-runtime conformance tests (plan 034).
 *
 * Validates equivalent and compatible capability tiers by executing both
 * Node.js and Python runtimes against shared fixtures and comparing
 * normalized output.
 *
 * Maintenance: changing a committed report field in either runtime MUST
 * fail a test here. Add golden fixtures when promoting a capability to
 * equivalent.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const FIXTURES = path.join(__dirname, "fixtures");
const PYTHON = "python3";
const PY_SCRIPT = path.join(REPO_ROOT, ".agents/skills/geo-optimization/scripts/geo_optimizer.py");
const NODE_CLI = path.join(REPO_ROOT, "bin/cli.js");

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

/** Run the Node.js CLI and return parsed JSON stdout. */
function nodeAudit(fixtureName, args = []) {
  const filepath = path.join(FIXTURES, fixtureName);
  const result = execFileSync("node", [NODE_CLI, "audit", filepath, "--format", "json", ...args], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return JSON.parse(result);
}

/** Run the Python CLI and return parsed JSON stdout. */
function pythonAudit(fixtureName, args = []) {
  const filepath = path.join(FIXTURES, fixtureName);
  const result = execFileSync(PYTHON, [PY_SCRIPT, "audit", filepath, "--format", "json", ...args], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return JSON.parse(result);
}

// ═══════════════════════════════════════════════════════════════════════════
// Tier: equivalent — V1 audit
// ═══════════════════════════════════════════════════════════════════════════

describe("V1 audit equivalence (tier: equivalent)", () => {
  const FIXTURE = "sample.md";

  it("produces identical total_score for shared fixture", () => {
    const node = nodeAudit(FIXTURE);
    const python = pythonAudit(FIXTURE);
    assert.equal(node.total_score, python.total_score);
  });

  it("produces identical breakdown scores", () => {
    const node = nodeAudit(FIXTURE);
    const python = pythonAudit(FIXTURE);
    assert.deepEqual(node.breakdown, python.breakdown);
  });

  it("produces identical recommendations", () => {
    const node = nodeAudit(FIXTURE);
    const python = pythonAudit(FIXTURE);
    assert.deepEqual(node.recommendations, python.recommendations);
  });

  it("produces identical findings array", () => {
    const node = nodeAudit(FIXTURE);
    const python = pythonAudit(FIXTURE);
    assert.deepEqual(node.findings, python.findings);
  });

  it("reports identical contract versions", () => {
    const node = nodeAudit(FIXTURE);
    const python = pythonAudit(FIXTURE);
    assert.equal(node.reportVersion, python.reportVersion);
    assert.equal(node.modelVersion, python.modelVersion);
  });

  it("generatedAt is a valid ISO timestamp in both runtimes", () => {
    const isoRe = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
    const node = nodeAudit(FIXTURE);
    const python = pythonAudit(FIXTURE);
    assert.match(node.generatedAt, isoRe);
    assert.match(python.generatedAt, isoRe);
  });

  it("conformance-basic.md produces matching total_score", () => {
    const node = nodeAudit("conformance-basic.md");
    const python = pythonAudit("conformance-basic.md");
    assert.equal(node.total_score, python.total_score);
    // Breakdown detail arrays may differ in acronym ordering (known
    // compatible-tier divergence: both find the same unexplained acronyms
    // but may list them in a different iteration order).
    assert.equal(node.breakdown.structure.score, python.breakdown.structure.score);
    assert.equal(node.breakdown.statistics.score, python.breakdown.statistics.score);
    assert.equal(node.breakdown.quotations.score, python.breakdown.quotations.score);
    assert.equal(node.breakdown.citations.score, python.breakdown.citations.score);
    assert.equal(node.breakdown.clarity.score, python.breakdown.clarity.score);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Tier: equivalent — V1 finding contract
// ═══════════════════════════════════════════════════════════════════════════

describe("V1 finding contract (tier: equivalent)", () => {
  it("every finding has required fields in both runtimes", () => {
    const REQUIRED = [
      "ruleId",
      "category",
      "severity",
      "status",
      "message",
      "evidenceLabel",
      "applicability",
      "sourceRefs",
      "observedFacts",
      "remediation",
    ];
    const node = nodeAudit("sample.md");
    const python = pythonAudit("sample.md");

    for (const [label, findings] of [
      ["node", node.findings],
      ["python", python.findings],
    ]) {
      for (const f of findings) {
        for (const field of REQUIRED) {
          assert.ok(field in f, `${label} finding ${f.ruleId} missing field: ${field}`);
        }
      }
    }
  });

  it("evidence labels are valid in both runtimes", () => {
    const VALID = ["strong", "probable", "experimental", "heuristic"];
    const node = nodeAudit("sample.md");
    const python = pythonAudit("sample.md");

    for (const [label, findings] of [
      ["node", node.findings],
      ["python", python.findings],
    ]) {
      for (const f of findings) {
        assert.ok(
          VALID.includes(f.evidenceLabel),
          `${label} finding ${f.ruleId} has invalid evidenceLabel: ${f.evidenceLabel}`
        );
      }
    }
  });

  it("severity values are valid in both runtimes", () => {
    const VALID = ["pass", "warn", "fail", "not_applicable"];
    const node = nodeAudit("sample.md");
    const python = pythonAudit("sample.md");

    for (const [label, findings] of [
      ["node", node.findings],
      ["python", python.findings],
    ]) {
      for (const f of findings) {
        assert.ok(
          VALID.includes(f.severity),
          `${label} finding ${f.ruleId} has invalid severity: ${f.severity}`
        );
        assert.ok(
          VALID.includes(f.status),
          `${label} finding ${f.ruleId} has invalid status: ${f.status}`
        );
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Tier: Node-only — verifications that Python does NOT implement
// ═══════════════════════════════════════════════════════════════════════════

describe("Node-only capabilities (tier: Node-only)", () => {
  it("Python CLI rejects --model v2 flag", () => {
    assert.throws(
      () =>
        execFileSync(
          PYTHON,
          [
            PY_SCRIPT,
            "audit",
            path.join(FIXTURES, "sample.md"),
            "--format",
            "json",
            "--model",
            "v2",
          ],
          { cwd: REPO_ROOT, encoding: "utf8", stdio: "pipe" }
        ),
      undefined,
      "Python should reject --model v2"
    );
  });

  it("Python CLI has no 'validate' subcommand", () => {
    assert.throws(
      () =>
        execFileSync(PYTHON, [PY_SCRIPT, "validate", path.join(FIXTURES, "sample.md")], {
          cwd: REPO_ROOT,
          encoding: "utf8",
          stdio: "pipe",
        }),
      undefined,
      "Python should have no validate subcommand"
    );
  });

  it("Python CLI has no 'technical' subcommand", () => {
    assert.throws(
      () =>
        execFileSync(PYTHON, [PY_SCRIPT, "technical", path.join(FIXTURES, "sample.md")], {
          cwd: REPO_ROOT,
          encoding: "utf8",
          stdio: "pipe",
        }),
      undefined,
      "Python should have no technical subcommand"
    );
  });

  it("Node.js v2 produces profile info that Python v1 does not", () => {
    const nodeV2 = nodeAudit("sample.md", ["--model", "v2"]);
    assert.ok(nodeV2.profile, "Node v2 report should have profile info");
    assert.ok(nodeV2.readinessBand, "Node v2 report should have readinessBand");

    const pythonV1 = pythonAudit("sample.md");
    assert.equal(pythonV1.profile, undefined, "Python v1 report should NOT have profile info");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Tier: compatible — CLI smoke tests for documented Python commands
// ═══════════════════════════════════════════════════════════════════════════

describe("Python CLI smoke tests (tier: compatible)", () => {
  function py(args, opts = {}) {
    return execFileSync(PYTHON, [PY_SCRIPT, ...args], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: "pipe",
      ...opts,
    });
  }

  it("robots audit with a temp file exits 0", () => {
    // Create a minimal robots.txt for audit
    const tmpFile = path.join(REPO_ROOT, `conformance-robots-${Date.now()}.txt`);
    execFileSync("bash", ["-c", `echo 'User-agent: *\nAllow: /' > ${tmpFile}`], {
      cwd: REPO_ROOT,
    });
    try {
      const out = py(["robots", "audit", tmpFile]);
      assert.ok(out.length > 0);
    } finally {
      execFileSync("rm", ["-f", tmpFile], { stdio: "ignore" });
    }
  });

  it("robots generate --help exits 0", () => {
    const out = py(["robots", "generate", "--help"]);
    assert.ok(out.includes("usage:") || out.includes("--dry-run"));
  });

  it("llmstxt generate --help exits 0", () => {
    const out = py(["llmstxt", "generate", "--help"]);
    assert.ok(out.includes("usage:") || out.includes("--dry-run"));
  });

  it("llmstxt audit --help exits 0", () => {
    const out = py(["llmstxt", "audit", "--help"]);
    assert.ok(out.includes("usage:") || out.includes("--dry-run"));
  });

  it("config get reminders exits 0", () => {
    const out = py(["config", "get", "reminders"]);
    assert.ok(
      out.includes("true") ||
        out.includes("false") ||
        out.includes("enabled") ||
        out.includes("disabled")
    );
  });

  it("audit --help shows supported flags only (no v2)", () => {
    const out = py(["audit", "--help"]);
    assert.ok(out.includes("--format"));
    assert.ok(out.includes("--threshold"));
    assert.ok(out.includes("--recursive"));
    assert.ok(!out.includes("--model"), "Python audit help should NOT mention --model");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Tier: compatible — schema, robots, llms cross-runtime shape
// ═══════════════════════════════════════════════════════════════════════════

describe("Compatible capability shape checks", () => {
  it("Python robots audit JSON has expected fields", () => {
    const tmpFile = path.join(REPO_ROOT, `conformance-robots2-${Date.now()}.txt`);
    execFileSync(
      "bash",
      ["-c", `echo 'User-agent: GPTBot\nDisallow: /\nUser-agent: *\nAllow: /' > ${tmpFile}`],
      {
        cwd: REPO_ROOT,
      }
    );
    try {
      const pythonOut = execFileSync(
        PYTHON,
        [PY_SCRIPT, "robots", "audit", tmpFile, "--format", "json"],
        { cwd: REPO_ROOT, encoding: "utf8", stdio: "pipe" }
      );
      const parsed = JSON.parse(pythonOut);
      assert.ok(parsed.registryVersion);
      assert.ok(Array.isArray(parsed.agents));
    } finally {
      execFileSync("rm", ["-f", tmpFile], { stdio: "ignore" });
    }
  });

  it("Python llms.txt dry-run produces output for a single file", () => {
    const fixtureFile = path.join(FIXTURES, "sample.md");
    const pythonOut = execFileSync(
      PYTHON,
      [
        PY_SCRIPT,
        "llmstxt",
        "generate",
        fixtureFile,
        "--site-url",
        "https://example.com",
        "--dry-run",
      ],
      { cwd: REPO_ROOT, encoding: "utf8", stdio: "pipe" }
    );
    assert.ok(pythonOut.includes("llms.txt") || pythonOut.includes("# "));
  });
});
