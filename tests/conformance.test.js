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
  // Default to v1 for conformance testing against Python's v1 output.
  // Pass --model v2 to override (Commander takes the last --model value).
  const result = execFileSync(
    "node",
    [NODE_CLI, "audit", filepath, "--format", "json", "--model", "v1", ...args],
    {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }
  );
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

  it("Python llmstxt generate rejects Node-only --frontmatter-fields", () => {
    assert.throws(
      () =>
        execFileSync(
          PYTHON,
          [
            PY_SCRIPT,
            "llmstxt",
            "generate",
            path.join(FIXTURES, "sample.md"),
            "--frontmatter-fields",
            "body",
            "--dry-run",
          ],
          { cwd: REPO_ROOT, encoding: "utf8", stdio: "pipe" }
        ),
      undefined,
      "Python should reject --frontmatter-fields"
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

  // Local mirror of py() for the Node CLI (Plan 095): the module-level
  // nodeAudit() helper is audit-command-specific and cannot run robots.
  function node(args, opts = {}) {
    return execFileSync("node", [NODE_CLI, ...args], {
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

  it("robots audit reflects combined rules of separated equally specific groups", () => {
    // Two separated GPTBot groups: only the SECOND blocks the root. The
    // Python port must combine both groups (Plan 094 parity), so GPTBot ends
    // up blocked — a single-group port would only see the first group's
    // /first rule and report allowed.
    const tmpFile = path.join(REPO_ROOT, `conformance-robots-combined-${Date.now()}.txt`);
    execFileSync(
      "bash",
      [
        "-c",
        `printf 'User-agent: GPTBot\\nDisallow: /first\\nUser-agent: GPTBot\\nDisallow: /\\nUser-agent: *\\nAllow: /' > ${tmpFile}`,
      ],
      { cwd: REPO_ROOT }
    );
    try {
      const out = py(["robots", "audit", tmpFile, "--format", "json"]);
      const parsed = JSON.parse(out);
      const gpt = parsed.agents.find((entry) => entry.token === "GPTBot");
      assert.ok(gpt, "GPTBot entry present in the Python report");
      assert.equal(
        gpt.allowed,
        false,
        "the second group's root Disallow must apply through the combined decision"
      );
      assert.deepEqual(gpt.matchedGroup, ["GPTBot"]);
    } finally {
      execFileSync("rm", ["-f", tmpFile], { stdio: "ignore" });
    }
  });

  it("robots audit CLI JSON parity is field-by-field identical (Plan 095)", () => {
    // Comma list + mid-group comment + two blank-separated GPTBot groups +
    // wildcard: both runtimes must emit identical top-level keys and
    // identical allowed/matchedGroup/matchedRule for every entry.
    const tmpFile = path.join(REPO_ROOT, `conformance-robots-parity-${Date.now()}.txt`);
    execFileSync(
      "bash",
      [
        "-c",
        `printf 'User-agent: GPTBot, Googlebot\\n# mid-group comment\\nDisallow: /private\\n\\nUser-agent: GPTBot\\nDisallow: /restricted\\n\\nUser-agent: *\\nAllow: /' > ${tmpFile}`,
      ],
      { cwd: REPO_ROOT }
    );
    try {
      const nodeParsed = JSON.parse(node(["robots", "audit", tmpFile, "-f", "json"]));
      const pyParsed = JSON.parse(py(["robots", "audit", tmpFile, "--format", "json"]));
      assert.deepEqual(
        Object.keys(nodeParsed).sort(),
        ["agents", "path", "registryVersion", "wildcard"],
        "Node top-level key set"
      );
      assert.deepEqual(
        Object.keys(pyParsed).sort(),
        ["agents", "path", "registryVersion", "wildcard"],
        "Python top-level key set"
      );
      const nodeGpt = nodeParsed.agents.find((entry) => entry.token === "GPTBot");
      const pyGpt = pyParsed.agents.find((entry) => entry.token === "GPTBot");
      assert.ok(nodeGpt && pyGpt, "GPTBot entry present in both runtimes");
      assert.deepEqual(
        [nodeGpt.allowed, nodeGpt.matchedGroup, nodeGpt.matchedRule],
        [pyGpt.allowed, pyGpt.matchedGroup, pyGpt.matchedRule],
        "GPTBot allowed/matchedGroup/matchedRule parity"
      );
      assert.deepEqual(
        [
          nodeParsed.wildcard.allowed,
          nodeParsed.wildcard.matchedGroup,
          nodeParsed.wildcard.matchedRule,
        ],
        [pyParsed.wildcard.allowed, pyParsed.wildcard.matchedGroup, pyParsed.wildcard.matchedRule],
        "wildcard allowed/matchedGroup/matchedRule parity"
      );
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

// ═══════════════════════════════════════════════════════════════════════════
// Tier: compatible — Python artifact output parity (Plan 084)
// ═══════════════════════════════════════════════════════════════════════════

describe("Python artifact output parity (Plan 084)", () => {
  function run(cli, args, opts = {}) {
    return execFileSync(cli[0], [...cli.slice(1), ...args], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: "pipe",
      ...opts,
    });
  }

  const NODE = ["node", NODE_CLI];
  const PY = [PYTHON, PY_SCRIPT];

  /** Extract the llms.txt content from a `llmstxt generate --dry-run` run. */
  function llmsDryRun(cli, fixtureName) {
    const out = run(cli, [
      "llmstxt",
      "generate",
      path.join(FIXTURES, fixtureName),
      "--site-url",
      "https://example.com",
      "--title",
      "Test Site",
      "--description",
      "Test description.",
      "--dry-run",
    ]);
    const match = out.match(/=== llms\.txt preview ===\n([\s\S]*?)\n\n\[dry-run\]/);
    assert.ok(match, `no llms.txt preview section found in: ${out.slice(0, 300)}`);
    return match[1].trimEnd() + "\n";
  }

  /** Normalize llms.txt content into a comparable structure (semantic, order-preserving). */
  function normalizeLlms(content) {
    const result = { sections: [], optional: [], lines: content.split("\n") };
    let current = null;
    for (const line of result.lines) {
      if (line.startsWith("## ")) {
        current = line.slice(3);
        if (current === "Optional") result.optional = [];
        else result.sections.push({ name: current, entries: [] });
      } else if (line.startsWith("- [") && current) {
        const label = line.slice(3).split("](")[0];
        const target = current === "Optional" ? result.optional : result.sections.at(-1).entries;
        target.push(label);
      }
    }
    return result;
  }

  it("llms.txt content is semantically identical for an H1-less fixture", () => {
    const node = normalizeLlms(llmsDryRun(NODE, "h1-less.md"));
    const python = normalizeLlms(llmsDryRun(PY, "h1-less.md"));
    assert.deepEqual(
      node.sections.map((s) => s.name),
      python.sections.map((s) => s.name),
      "sections must match"
    );
    assert.deepEqual(node.optional, python.optional, "optional placement must match");
    for (let i = 0; i < node.sections.length; i++) {
      assert.deepEqual(
        node.sections[i].entries,
        python.sections[i].entries,
        `titles in section ${node.sections[i].name} must match`
      );
    }
  });

  it("llms.txt title and description are identical for an .htm fixture", () => {
    const parsed = [];
    for (const [label, cli] of [
      ["node", NODE],
      ["python", PY],
    ]) {
      const content = llmsDryRun(cli, "page-basic.htm");
      const entry = content.split("\n").find((line) => line.startsWith("- ["));
      assert.ok(entry, `${label} must emit a llms.txt entry for the .htm fixture`);
      const parts = entry.match(/^- \[([^\]]*)\]\([^)]*\)(?:: (.*))?$/);
      assert.ok(parts, `${label} entry must parse as label + optional description: ${entry}`);
      parsed.push({ label: parts[1], description: parts[2] ?? "" });
    }
    assert.equal(
      parsed[0].label,
      "Page Title",
      `Node must use the HTML h1 as title for .htm files, got ${parsed[0].label}`
    );
    assert.equal(parsed[1].label, parsed[0].label, "Python title must match Node for .htm files");
    assert.equal(
      parsed[1].description,
      parsed[0].description,
      "Python description must match Node for .htm files"
    );
  });

  it("no score-based Optional section by default in either runtime", () => {
    for (const [label, cli] of [
      ["node", NODE],
      ["python", PY],
    ]) {
      const normalized = normalizeLlms(llmsDryRun(cli, "hostile.md"));
      assert.deepEqual(
        normalized.optional,
        [],
        `${label} must not demote pages to ## Optional without an explicit threshold`
      );
    }
  });

  it("hostile titles cannot inject links into either runtime's output", () => {
    for (const [label, cli] of [
      ["node", NODE],
      ["python", PY],
    ]) {
      const normalized = normalizeLlms(llmsDryRun(cli, "hostile.md"));
      for (const line of normalized.lines) {
        if (!line.startsWith("- [") && !line.startsWith("## ")) continue;
        if (line.startsWith("## ")) {
          assert.equal(
            (line.match(/\]\(/g) || []).length,
            0,
            `${label} section heading must not contain an unescaped link closer: ${line}`
          );
          continue;
        }
        const closers = line.match(/[^\\]\]\(/g) || [];
        assert.equal(
          closers.length,
          1,
          `${label} link line must contain exactly one real ]( closer: ${line}`
        );
        assert.ok(
          /[^\\]\[/.test(line.slice(3, line.lastIndexOf("]("))) === false,
          `${label} label must not contain a raw [ : ${line}`
        );
      }
    }
  });

  it("schema title falls back to the basename for H1-less files in both runtimes", () => {
    const fixtureFile = path.join(FIXTURES, "h1-less.md");
    const headlines = [];
    for (const cli of [NODE, PY]) {
      const out = run(cli, ["schema", fixtureFile, "article"]);
      const match = out.match(/"headline"\s*:\s*"([^"]*)"/);
      assert.ok(match, "schema generate must embed the Article headline");
      headlines.push(match[1]);
    }
    assert.equal(
      headlines[0],
      "h1-less",
      `Node headline should be the basename, got ${headlines[0]}`
    );
    assert.equal(
      headlines[1],
      "h1-less",
      `Python headline should be the basename, got ${headlines[1]}`
    );
  });

  it("schema headline comes from the HTML h1 for an .htm fixture in both runtimes", () => {
    const fixtureFile = path.join(FIXTURES, "page-basic.htm");
    const headlines = [];
    for (const cli of [NODE, PY]) {
      const out = run(cli, ["schema", fixtureFile, "article"]);
      const match = out.match(/"headline"\s*:\s*"([^"]*)"/);
      assert.ok(match, "schema generate must embed the Article headline");
      headlines.push(match[1]);
    }
    assert.equal(
      headlines[0],
      "Page Title",
      `Node headline should come from the HTML h1, got ${headlines[0]}`
    );
    assert.equal(headlines[1], headlines[0], "Python headline must match Node for .htm files");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Tier: equivalent — V1 audit, headings no-Latin (F-10)
// ═══════════════════════════════════════════════════════════════════════════

describe("V1 audit equivalence — non-Latin headings (audit F-10)", () => {
  // El regex de headings usaba \w (ASCII en JS): Node no detectaba headers
  // árabes/chinos/cirílicos (20 pts) mientras Python sí (23 pts). Con \S en
  // ambos, la paridad debe ser byte-a-byte en la dimensión estructura.
  const FIXTURES = ["rtl.md", "cjk.md", "cyr.md"];

  for (const fixture of FIXTURES) {
    it(`conformance-non-latin-headings ${fixture}`, () => {
      const node = nodeAudit(fixture);
      const python = pythonAudit(fixture);
      assert.equal(
        node.total_score,
        python.total_score,
        `${fixture}: total_score diverge (${node.total_score} vs ${python.total_score})`
      );
      assert.equal(
        node.breakdown.structure.score,
        python.breakdown.structure.score,
        `${fixture}: structure score diverge`
      );
    });
  }
});
