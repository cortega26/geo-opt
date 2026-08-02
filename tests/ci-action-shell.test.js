import { describe, it } from "node:test";
import assert from "node:assert";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, "..");
const helper = path.join(repoRoot, ".github/actions/geo-opt-audit/run-audit.sh");

// Plan 071: the composite action must hand user input to `node` as argv
// data, never as shell source. The action runs run-audit.sh with inputs
// delivered through env vars, so this suite executes the exact helper the
// action runs and observes the argument boundary with a probe CLI that
// records its argv and mimics the audit JSON/exit contract.

const PROBE = [
  `import { writeFileSync } from "node:fs";`,
  `const args = process.argv.slice(2);`,
  `if (process.env.GEO_OPT_PROBE_ARGV_FILE) {`,
  `  writeFileSync(process.env.GEO_OPT_PROBE_ARGV_FILE, JSON.stringify(args), "utf8");`,
  `}`,
  `process.stderr.write("probe-stderr-line\\n");`,
  `const score = 88;`,
  `const thresholdIndex = args.indexOf("--threshold");`,
  `const threshold = thresholdIndex === -1 ? NaN : Number(args[thresholdIndex + 1]);`,
  `process.stdout.write(JSON.stringify({ effectiveScore: score }));`,
  `if (!Number.isNaN(threshold) && score < threshold) process.exit(1);`,
  `process.exit(0);`,
].join("\n");

function runAction({
  path: pathInput,
  model = "v2",
  recursive = "false",
  threshold = "",
  label = "GEO Score",
}) {
  const tmp = mkdtempSync(path.join(tmpdir(), "geo-opt-action-"));
  const argvFile = path.join(tmp, "argv.json");
  const outputsFile = path.join(tmp, "outputs.txt");
  const sentinel = path.join(tmp, "pwned");
  writeFileSync(path.join(tmp, "argv-probe.mjs"), PROBE, "utf8");
  const result = spawnSync("bash", [helper], {
    env: {
      ...process.env,
      GEO_OPT_CLI_PATH: path.join(tmp, "argv-probe.mjs"),
      GEO_OPT_INPUT_PATH: pathInput,
      GEO_OPT_INPUT_MODEL: model,
      GEO_OPT_INPUT_RECURSIVE: recursive,
      GEO_OPT_INPUT_THRESHOLD: threshold,
      GEO_OPT_INPUT_LABEL: label,
      GEO_OPT_PROBE_ARGV_FILE: argvFile,
      RUNNER_TEMP: tmp,
      GITHUB_OUTPUT: outputsFile,
    },
    encoding: "utf8",
  });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    tmp,
    argv: JSON.parse(readFileSync(argvFile, "utf8")),
    outputs: readFileSync(outputsFile, "utf8"),
    stderrLog: readFileSync(path.join(tmp, "geo-opt-audit-stderr.txt"), "utf8"),
    sentinel,
  };
}

describe("Plan 071 — composite action argument boundary", () => {
  it("passes a plain path as one argv element and emits score/passed outputs", () => {
    const plain = "docs/readme.md";
    const r = runAction({ path: plain });
    assert.strictEqual(r.status, 0);
    assert.deepStrictEqual(r.argv, ["audit", plain, "--format", "json", "--model", "v2"]);
    assert.match(r.outputs, /score=88/m);
    assert.match(r.outputs, /passed=true/m);
    assert.match(r.outputs, /badge-url=/m);
  });

  it("keeps a spaced, quoted, metacharacter path one inert argv element", () => {
    const tmp = mkdtempSync(path.join(tmpdir(), "geo-opt-action-hostile-"));
    const sentinel = path.join(tmp, "pwned");
    const hostile = `docs/My File's $(touch ${sentinel}) ; [x].md`;
    const r = runAction({ path: hostile });
    assert.strictEqual(r.status, 0);
    assert.ok(!existsSync(sentinel), "command-substitution payload must not execute");
    assert.deepStrictEqual(r.argv, ["audit", hostile, "--format", "json", "--model", "v2"]);
    assert.match(r.outputs, /score=88/m);
    assert.match(r.outputs, /passed=true/m);
    assert.match(r.stderrLog, /probe-stderr-line/m, "stderr must stay on the stderr channel");
    assert.ok(!r.stdout.includes("probe-stderr-line"), "stderr must not pollute parsed stdout");
  });

  it("keeps hostile threshold and label values inert single argv/data elements", () => {
    const tmp = mkdtempSync(path.join(tmpdir(), "geo-opt-action-hostile-"));
    const sentinel = path.join(tmp, "pwned");
    const hostileThreshold = `95; touch ${sentinel}`;
    const hostileLabel = `My" Label ) $(touch ${sentinel})`;
    const r = runAction({
      path: "docs/readme.md",
      threshold: hostileThreshold,
      label: hostileLabel,
    });
    assert.strictEqual(r.status, 0);
    assert.ok(!existsSync(sentinel), "command-substitution payload must not execute");
    // Threshold must arrive as its own element with the literal hostile value
    assert.strictEqual(r.argv[r.argv.length - 2], "--threshold");
    assert.strictEqual(r.argv[r.argv.length - 1], hostileThreshold);
    assert.match(r.outputs, /score=88/m);
    assert.match(r.outputs, /passed=true/m);
  });

  it("appends --recursive as its own element when requested", () => {
    const r = runAction({ path: "docs/readme.md", recursive: "true" });
    assert.strictEqual(r.status, 0);
    assert.deepStrictEqual(r.argv, [
      "audit",
      "docs/readme.md",
      "--format",
      "json",
      "--model",
      "v2",
      "--recursive",
    ]);
  });

  it("passes the threshold as its own element and propagates its exit status", () => {
    const r = runAction({ path: "docs/readme.md", threshold: "95" });
    assert.strictEqual(r.status, 1, "score 88 below threshold 95 must exit 1");
    assert.deepStrictEqual(r.argv, [
      "audit",
      "docs/readme.md",
      "--format",
      "json",
      "--model",
      "v2",
      "--threshold",
      "95",
    ]);
    assert.match(r.outputs, /score=88/m);
    assert.match(r.outputs, /passed=false/m);
    assert.match(r.stderrLog, /probe-stderr-line/m);
    assert.ok(!r.stdout.includes("probe-stderr-line"));
  });
});
