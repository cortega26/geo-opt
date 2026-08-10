import { describe, it } from "node:test";
import assert from "node:assert";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, "..");

function read(rel) {
  return readFileSync(path.join(repoRoot, rel), "utf8");
}

function fixture(name) {
  return path.join(__dirname, "fixtures", name);
}

// Plan 065: harden the CI entry assets. Pins the GitLab include org, the
// effectiveScore JSON field, the v2 model defaults, and the README action
// reference so the entry assets cannot silently drift again.

const pkg = JSON.parse(read("package.json"));
const org = pkg.repository.url.match(/github\.com\/([^/]+)\//u)?.[1];

describe("Plan 065 — CI entry assets", () => {
  it("package.json repository.url is a GitHub URL and yields an org", () => {
    assert.ok(org, `no GitHub org extracted from ${pkg.repository.url}`);
  });

  it("GitLab template include URL uses the repository org", () => {
    const template = read("ci-templates/gitlab-ci.yml");
    assert.ok(
      template.includes(`raw.githubusercontent.com/${org}/`),
      `GitLab include URL should point at raw.githubusercontent.com/${org}/`
    );
  });

  it("GitLab template and GitHub action parse averageScore from summary JSON (Plan 072)", () => {
    const template = read("ci-templates/gitlab-ci.yml");
    const helper = read(".github/actions/geo-opt-audit/run-audit.sh");
    assert.ok(template.includes("averageScore"), "GitLab template should read averageScore");
    assert.ok(helper.includes("averageScore"), "action helper should read averageScore");
    assert.ok(
      !template.includes("?.score "),
      "GitLab template should not access the broken score field"
    );
    assert.ok(
      !helper.includes("?.score "),
      "action helper should not access the broken score field"
    );
    // The summary contract is one aggregate object, never a per-file list
    // pick: file zero's effectiveScore described only one file of the set.
    assert.ok(!template.includes("d[0]"), "GitLab template must not select the first report");
    assert.ok(!helper.includes("d[0]"), "action helper must not select the first report");
    // A missing aggregate score is an error, not a fabricated zero.
    assert.ok(!template.includes("?? 0"), "GitLab template must not fabricate score 0");
    assert.ok(!helper.includes("?? 0"), "action helper must not fabricate score 0");
  });

  it("both wrappers request aggregate summary JSON (--summary)", () => {
    const template = read("ci-templates/gitlab-ci.yml");
    const helper = read(".github/actions/geo-opt-audit/run-audit.sh");
    assert.ok(
      template.includes("--summary --format json"),
      "GitLab template should audit with --summary --format json"
    );
    assert.ok(
      helper.includes("--summary --format json"),
      "action helper should audit with --summary --format json"
    );
  });

  it("GitLab template propagates the audit exit status instead of masking it behind tee", () => {
    // `eval ... | tee` would end with tee's exit (0) and pass a failed audit
    // (threshold breach, per-file error). The template must capture the CLI
    // exit code and end with it (POSIX-portable: no bash-only PIPESTATUS).
    const template = read("ci-templates/gitlab-ci.yml");
    assert.ok(template.includes("GEO_OPT_EXIT=$?"), "template should capture the audit exit code");
    assert.ok(
      template.includes("exit $GEO_OPT_EXIT"),
      "template should end with the audit exit code"
    );
    assert.ok(
      !template.includes("| tee geo-opt-audit.json"),
      "template must not audit through a bare tee pipeline"
    );
  });

  it("GitHub action forces JSON mode and isolates stderr from the repo", () => {
    const action = read(".github/actions/geo-opt-audit/action.yml");
    const helper = read(".github/actions/geo-opt-audit/run-audit.sh");
    assert.ok(
      helper.includes("--format json"),
      "action helper should audit in JSON mode so the score parse has machine-readable stdout"
    );
    assert.ok(
      !action.includes("inputs.format"),
      "action should not declare or use a dead format input"
    );
    assert.ok(
      helper.includes("$RUNNER_TEMP"),
      "action helper should capture stderr outside the repo working directory"
    );
    assert.ok(
      !helper.includes("2>audit-stderr.txt"),
      "action helper should not write stderr into the repository"
    );
  });

  it("GitHub action builds argv as a Bash array from env data, never shell source", () => {
    const action = read(".github/actions/geo-opt-audit/action.yml");
    const helper = read(".github/actions/geo-opt-audit/run-audit.sh");
    assert.ok(
      action.includes("run-audit.sh"),
      "action should delegate to the shared runner script"
    );
    assert.ok(!action.includes("$ARGS"), "action should not expand a scalar ARGS string");
    assert.ok(helper.includes("args=("), "helper should build argv as a Bash array");
    assert.ok(
      helper.includes('"${args[@]}"'),
      "helper should expand the array with quotes so hostile input stays inert"
    );
    assert.ok(
      !helper.includes("${{ inputs."),
      "helper must never interpolate input values into shell source"
    );
  });

  it("GitLab template and GitHub action default the model to v2", () => {
    const template = read("ci-templates/gitlab-ci.yml");
    const action = read(".github/actions/geo-opt-audit/action.yml");
    assert.ok(
      template.includes('GEO_OPT_MODEL: "v2"'),
      "GitLab template should default GEO_OPT_MODEL to v2"
    );
    const modelBlock = action.match(/^\s{2}model:\n(?:.*\n)*?^\s{2}\w+:/mu)?.[0];
    assert.ok(modelBlock, "GitHub action should declare a model input block");
    assert.ok(
      modelBlock.includes('default: "v2"'),
      "GitHub action model input should default to v2"
    );
  });

  it("READMEs pin the action reference to the repository org and a version tag", () => {
    for (const rel of ["README.md", "README.es.md"]) {
      const text = read(rel);
      assert.ok(
        text.includes(`${org}/geo-opt/.github/actions/geo-opt-audit@v`),
        `${rel} action reference should use the repository org ${org}`
      );
      assert.match(
        text,
        /geo-opt-audit@v\d+\.\d+\.\d+/u,
        `${rel} should pin the action to a version tag`
      );
    }
  });
});

describe("Plan 065 — GitLab template claims (audit F-13)", () => {
  const template = read("ci-templates/gitlab-ci.yml");

  it("does not claim Pro for --recursive (Community feature)", () => {
    assert.ok(
      template.includes("scan directories recursively\n"),
      "GEO_OPT_RECURSIVE comment must not claim Pro"
    );
    const recursiveLine = template.split("\n").find((l) => l.includes("GEO_OPT_RECURSIVE"));
    assert.ok(!recursiveLine.includes("Pro"), "recursive is Community, not Pro");
  });

  it("licenses comment describes the real Pro gates", () => {
    const licenseLine = template.split("\n").find((l) => l.includes("TOOLTICIAN_LICENSE_KEY"));
    assert.ok(!licenseLine.includes("recursive"), "license key not needed for recursive");
    assert.ok(licenseLine.includes("--no-branding") || licenseLine.includes("report"));
  });

  it("dotenv artifact is declared on the job that creates the file", () => {
    // El job hidden (.geo-opt-audit) no puede declarar dotenv: un artifact
    // ausente falla el job en GitLab y el archivo solo lo crea el job
    // concreto geo-opt-audit (echo ... >> geo-opt-env.env).
    const hiddenBlock = template.slice(
      template.indexOf(".geo-opt-audit:"),
      template.indexOf("geo-opt-audit:\n  extends")
    );
    assert.ok(
      !hiddenBlock.includes("dotenv:"),
      "hidden job must not declare a dotenv artifact it never creates"
    );
    const concreteJob = template.slice(template.indexOf("geo-opt-audit:\n  extends"));
    assert.ok(concreteJob.includes("dotenv: geo-opt-env.env"), "concrete job owns the dotenv");
  });
});

describe("Plan 072 — wrapper entitlement copy matches docs/free-vs-pro.md", () => {
  // Normative Community boundary: recursive audits, multi-file audits,
  // --summary, and CI thresholds are Community; only reports, --no-branding,
  // and the four Pro schema types are Pro.
  const action = read(".github/actions/geo-opt-audit/action.yml");

  function inputBlock(name) {
    return action.match(new RegExp(`^\\s{2}${name}:\\n(?:.*\\n)*?^\\s{2}\\w+:`, "mu"))?.[0];
  }

  it("GitHub action threshold input does not claim Pro", () => {
    const block = inputBlock("threshold");
    assert.ok(block, "action should declare a threshold input block");
    assert.ok(!/Pro/i.test(block), "threshold is a Community gate, not Pro");
  });

  it("GitHub action recursive input does not claim Pro", () => {
    const block = inputBlock("recursive");
    assert.ok(block, "action should declare a recursive input block");
    assert.ok(!/Pro/i.test(block), "recursive audits are Community, not Pro");
  });

  it("GitHub action license-key input describes only the real Pro gates", () => {
    const block = inputBlock("license-key");
    assert.ok(block, "action should declare a license-key input block");
    assert.ok(
      /--no-branding/.test(block),
      "license-key should mention --no-branding (a real Pro gate)"
    );
    assert.ok(!/recursive/i.test(block), "license-key must not imply recursive audits need Pro");
  });
});

describe("Plan 072 — aggregate score semantics", () => {
  // Runs the exact helper the GitHub action executes against a probe CLI that
  // mimics the audit --summary --format json contract: one aggregate object
  // with averageScore, exit 1 on per-file errors or threshold breaches.
  // Fixtures are tests/fixtures/ci-summary-*.json (shapes captured from the
  // real CLI, src/batch.js aggregateReport).
  const helper = path.join(repoRoot, ".github/actions/geo-opt-audit/run-audit.sh");

  const PROBE = [
    `import { readFileSync } from "node:fs";`,
    `const args = process.argv.slice(2);`,
    `process.stderr.write("probe-stderr-line\\n");`,
    `const raw = process.env.GEO_OPT_PROBE_RAW_STDOUT;`,
    `if (raw !== undefined) {`,
    `  process.stdout.write(raw);`,
    `  process.exit(0);`,
    `}`,
    `const summary = JSON.parse(readFileSync(process.env.GEO_OPT_PROBE_SUMMARY_FILE, "utf8"));`,
    `process.stdout.write(JSON.stringify(summary));`,
    `const thresholdIndex = args.indexOf("--threshold");`,
    `const threshold = thresholdIndex === -1 ? NaN : Number(args[thresholdIndex + 1]);`,
    `let fail = false;`,
    `for (const f of summary.perFile ?? []) {`,
    `  if (f.status === "error") fail = true;`,
    `  else if (!Number.isNaN(threshold) && f.score < threshold) fail = true;`,
    `}`,
    `process.exit(fail ? 1 : 0);`,
  ].join("\n");

  function runHelper({ summaryFile, rawStdout, threshold = "", label = "GEO Score" }) {
    const tmp = mkdtempSync(path.join(tmpdir(), "geo-opt-summary-"));
    const outputsFile = path.join(tmp, "outputs.txt");
    writeFileSync(path.join(tmp, "summary-probe.mjs"), PROBE, "utf8");
    const env = {
      ...process.env,
      GEO_OPT_CLI_PATH: path.join(tmp, "summary-probe.mjs"),
      GEO_OPT_INPUT_PATH: "docs/readme.md",
      GEO_OPT_INPUT_MODEL: "v2",
      GEO_OPT_INPUT_RECURSIVE: "false",
      GEO_OPT_INPUT_THRESHOLD: threshold,
      GEO_OPT_INPUT_LABEL: label,
      GEO_OPT_PROBE_SUMMARY_FILE: summaryFile,
      RUNNER_TEMP: tmp,
      GITHUB_OUTPUT: outputsFile,
    };
    if (rawStdout !== undefined) env.GEO_OPT_PROBE_RAW_STDOUT = rawStdout;
    const result = spawnSync("bash", [helper], { env, encoding: "utf8" });
    return {
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
      outputs: readFileSync(outputsFile, "utf8"),
      stderrLog: readFileSync(path.join(tmp, "geo-opt-audit-stderr.txt"), "utf8"),
    };
  }

  it("multi-file audit reports the aggregate average, not file zero", () => {
    // Two materially different fixture scores (55 and 90): a per-file pick
    // would claim 55, the truthful aggregate average is 72.5 -> 73.
    const r = runHelper({ summaryFile: fixture("ci-summary-two-files.json") });
    assert.strictEqual(r.status, 0);
    assert.match(r.outputs, /score=73/m, "score must be the rounded aggregate average");
    assert.match(r.outputs, /passed=true/m);
    assert.match(
      r.outputs,
      /badge-url=.*73%2F100.*yellow/m,
      "badge must carry the aggregate score"
    );
  });

  it("single-file audit reports that file's score from the summary", () => {
    const r = runHelper({ summaryFile: fixture("ci-summary-single.json") });
    assert.strictEqual(r.status, 0);
    assert.match(r.outputs, /score=88/m);
    assert.match(r.outputs, /passed=true/m);
  });

  it("partial failure reports the aggregate of succeeded files and fails via exit code", () => {
    const r = runHelper({ summaryFile: fixture("ci-summary-partial.json") });
    assert.strictEqual(r.status, 1, "audit exit 1 (file error) must propagate");
    assert.match(r.outputs, /score=55/m, "score must still cover the succeeded set");
    assert.match(r.outputs, /passed=false/m);
  });

  it("threshold breach fails the wrapper with the aggregate score still reported", () => {
    const r = runHelper({ summaryFile: fixture("ci-summary-two-files.json"), threshold: "80" });
    assert.strictEqual(r.status, 1, "audit exit 1 (threshold) must propagate");
    assert.match(r.outputs, /score=73/m, "the score is not fabricated or zeroed on failure");
    assert.match(r.outputs, /passed=false/m);
  });

  it("malformed audit JSON fails the wrapper instead of reporting score 0", () => {
    const r = runHelper({ rawStdout: "not-json{{{" });
    assert.notStrictEqual(r.status, 0, "unparseable output must fail the step");
    // The wrapper's parse error goes to the step's stderr (visible in the job
    // log); the CLI-stderr capture file only ever holds the probe's line.
    assert.match(r.stderr, /not valid JSON/, "must explain the parse failure");
    assert.ok(!/score=/.test(r.outputs), "must not emit a fabricated score");
    assert.match(r.outputs, /passed=false/m);
  });

  it("summary without averageScore fails the wrapper instead of reporting score 0", () => {
    // aggregateReport's zero-success branch has no averageScore; the CLI also
    // exits non-zero then, and the wrapper must not invent a score either.
    const r = runHelper({ summaryFile: fixture("ci-summary-no-score.json") });
    assert.notStrictEqual(r.status, 0, "missing aggregate score must fail the step");
    assert.match(r.stderr, /averageScore/, "must explain the missing aggregate score");
    assert.ok(!/score=/.test(r.outputs), "must not emit a fabricated score");
    assert.match(r.outputs, /passed=false/m);
  });

  it("null averageScore fails the wrapper instead of coercing to 0", () => {
    // Number(null) === 0, and JSON.stringify of NaN yields null, so a
    // coercion-based guard would silently emit score=0 (Plan 072).
    const r = runHelper({ rawStdout: '{"averageScore": null}' });
    assert.notStrictEqual(r.status, 0, "null averageScore must fail the step");
    assert.match(r.stderr, /averageScore/, "must explain the non-numeric aggregate score");
    assert.ok(!/score=/.test(r.outputs), "must not emit a fabricated zero");
    assert.match(r.outputs, /passed=false/m);
  });

  it("string averageScore fails the wrapper instead of being coerced", () => {
    const r = runHelper({ rawStdout: '{"averageScore": "72.5"}' });
    assert.notStrictEqual(r.status, 0, "string averageScore must fail the step");
    assert.match(r.stderr, /averageScore/, "must explain the non-numeric aggregate score");
    assert.ok(!/score=/.test(r.outputs), "must not emit a coerced score");
    assert.match(r.outputs, /passed=false/m);
  });

  it("badge colors honor the 40/41, 60/61, 75/76, and 89/90 boundaries after rounding", () => {
    const cases = [
      { avg: 40.6, score: 41, color: "orange" },
      { avg: 60.6, score: 61, color: "yellow" },
      { avg: 75.6, score: 76, color: "green" },
      { avg: 89.6, score: 90, color: "brightgreen" },
    ];
    for (const { avg, score, color } of cases) {
      const tmp = mkdtempSync(path.join(tmpdir(), "geo-opt-boundary-"));
      const fixturePath = path.join(tmp, "summary.json");
      writeFileSync(
        fixturePath,
        JSON.stringify({
          totalFiles: 1,
          succeeded: 1,
          failed: 0,
          averageScore: avg,
          perFile: [{ file: "x.md", status: "success", score: avg }],
        })
      );
      const r = runHelper({ summaryFile: fixturePath });
      assert.strictEqual(r.status, 0, `average ${avg} must pass`);
      assert.match(r.outputs, new RegExp(`score=${score}`), `average ${avg} rounds to ${score}`);
      assert.match(
        r.outputs,
        new RegExp(`badge-url=.*${score}%2F100-${color}`),
        `average ${avg} (score ${score}) must be ${color}`
      );
    }
  });

  it("package.json lint script covers tests/ (Plan 080)", () => {
    // Tests were linted ad hoc but excluded from `npm run lint`; appending
    // tests/ here pins the scope so stray coverage cannot silently regress.
    const lint = pkg.scripts.lint;
    assert.ok(
      /(^|\s)(eslint[^\s]*\s+.*tests\/|eslint[^\s]*\s+src\/[\s\S]*tests\/)/u.test(lint) ||
        lint.includes("tests/"),
      `lint script should lint tests/: ${lint}`
    );
    assert.ok(
      !/--ignore-pattern/u.test(lint) || !/tests\//u.test(lint),
      "lint script should not add tests/ then ignore it"
    );
  });
});
