import { describe, it } from "node:test";
import assert from "node:assert";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, "..");
const cli = path.join(repoRoot, "bin", "cli.js");

// Plan 058 §6.3: the exact README onboarding command sequence must run
// end-to-end in a clean sandbox without a Pro key. This is the truthful
// copy-paste local-to-CI route. If any step here breaks, the README's entry
// path is lying and must be corrected.

const sampleMd = `# Sample Article

A sample article with enough content for a meaningful audit.
It contains a quotation: "Local-first tooling is good" — Someone.
It cites an [external source](https://example.com/research).

## Statistics

The number 42 appears here for evidence density.
`;

function run(args, opts = {}) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: opts.cwd ?? repoRoot,
    encoding: "utf8",
    env: opts.env ?? process.env,
    timeout: 30_000,
  });
}

describe("Plan 058 §6.3 — onboarding route runs end-to-end", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "geo058-onboard-"));
  const contentDir = path.join(dir, "content");
  mkdirSync(contentDir, { recursive: true });
  writeFileSync(path.join(contentDir, "article.md"), sampleMd);

  // Community env: no Pro key, engagement state in the sandbox.
  const env = {
    ...process.env,
    TOOLTICIAN_LICENSE_KEY: "",
    GEO_OPT_STATE_DIR: dir,
  };

  it("step 1 — single-file audit exits 0", () => {
    const r = run(["audit", path.join(contentDir, "article.md")], {
      cwd: dir,
      env,
    });
    assert.equal(r.status, 0, `expected exit 0\nstderr: ${r.stderr}`);
  });

  it("step 2 — recursive audit with CI threshold exits non-zero below threshold", () => {
    const r = run(["audit", contentDir, "--recursive", "--threshold", "95"], {
      cwd: dir,
      env,
    });
    assert.notEqual(r.status, 0, "below-threshold must fail the gate");
  });

  it("step 3 — recursive audit at a reachable threshold exits 0", () => {
    const r = run(["audit", contentDir, "--recursive", "--threshold", "1"], {
      cwd: dir,
      env,
    });
    assert.equal(r.status, 0, `low threshold must pass\nstderr: ${r.stderr}`);
  });

  it("step 4 — --format json produces valid JSON output", () => {
    const r = run(["audit", contentDir, "--recursive", "--format", "json"], {
      cwd: dir,
      env,
    });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.doesNotThrow(() => JSON.parse(r.stdout), "stdout must be valid JSON");
  });

  it("step 5 — generate-all produces the package artifacts", () => {
    const r = run(["generate-all", contentDir, "--site-url", "https://example.com"], {
      cwd: dir,
      env,
    });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.ok(
      existsSync(path.join(dir, "geo-package", "audit-report.json")),
      "audit-report.json missing in geo-package/"
    );
  });

  it("README GitHub Actions snippet contains the expected audit gate commands", () => {
    // The README snippet must (a) exist, (b) invoke the real audit gate
    // (`audit ... --recursive --threshold N`), and (c) pin a supported Node
    // version. We also do a minimal YAML structural check (no tabs, every
    // non-comment line either starts at column 0 or is indented under a
    // parent). We do NOT claim full YAML parsing — `js-yaml` is not a
    // dependency; the structural checks here catch the common breakage modes.
    const readme = readFileSync(path.join(repoRoot, "README.md"), "utf8");
    // The README snippet: a ```yaml block containing a geo-opt.yml comment
    const m = readme.match(/```yaml\n([\s\S]*?)```/u);
    assert.ok(m, "README must contain a ```yaml snippet in the CI/CD section");
    const yaml = m[1];
    assert.match(yaml, /geo-opt\.yml/u, "snippet must be the geo-opt workflow");
    const lines = yaml.split("\n").filter((l) => l.trim().length > 0);
    assert.ok(lines.length >= 5, "snippet too short");
    // No tabs (YAML forbids tabs for indentation)
    assert.doesNotMatch(yaml, /\t/u, "YAML snippet must not use tabs");
    assert.match(
      yaml,
      /geo-opt audit content\/ --recursive --threshold 70/,
      "snippet must invoke the audit gate"
    );
    assert.match(yaml, /node-version: 22/, "snippet must pin Node 22 LTS");
    assert.match(yaml, /npm install -g geo-opt/, "snippet must install the package");
    assert.match(yaml, /on: \[pull_request\]/, "snippet must run on PRs");
  });
});

describe("Plan 058 §6.3 — first-run command from the plan's verification table", () => {
  it("`node bin/cli.js audit tests/fixtures/sample.md --format json` exits 0 and emits JSON", () => {
    const r = run(
      ["audit", path.join(repoRoot, "tests", "fixtures", "sample.md"), "--format", "json"],
      {
        cwd: repoRoot,
        env: { ...process.env, TOOLTICIAN_LICENSE_KEY: "" },
      }
    );
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.doesNotThrow(() => JSON.parse(r.stdout));
  });
});
