import { describe, it } from "node:test";
import assert from "node:assert";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, "..");
const cli = path.join(repoRoot, "bin", "cli.js");

// Plan 058 §6.1: runtime still behaves as the new docs claim.
// Verified empirically at HEAD b2e6055: the only Pro gates are `report`,
// `--no-branding` (on inject/report), and Pro schema types. Everything else
// marked "Pro" in the docs actually runs Community-side.

const sampleMd = `# Sample Article

This is a sample article with enough content to audit meaningfully.
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

// Shared sandbox created once at module load so the dir survives for the tests
// to actually use it (node:test runs `it` callbacks after describe returns).
const sandbox = mkdtempSync(path.join(tmpdir(), "geo058-ent-"));
const file = path.join(sandbox, "sample.md");
writeFileSync(file, sampleMd);
const contentDir = path.join(sandbox, "content");
mkdirSync(contentDir, { recursive: true });
writeFileSync(path.join(contentDir, "a.md"), sampleMd);

// Community env: no Pro key, engagement state redirected into the sandbox.
// Inherits PATH/HOME/etc. from process.env so node + the CLI still work.
const env = {
  ...process.env,
  TOOLTICIAN_LICENSE_KEY: "",
  GEO_OPT_STATE_DIR: sandbox,
};

// Clean up after the process exits (tests will have run by then).
process.on("exit", () => {
  try {
    rmSync(sandbox, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
});

describe("Plan 058 §6.1 — Community commands run without a Pro key", () => {
  it("audit --recursive runs without a Pro key", () => {
    const r = run(["audit", contentDir, "--recursive"], { cwd: sandbox, env });
    assert.equal(r.status, 0, `expected exit 0, got ${r.status}\nstderr: ${r.stderr}`);
  });

  it("audit --threshold runs and exits non-zero when below threshold", () => {
    const r = run(["audit", contentDir, "--recursive", "--threshold", "95"], { cwd: sandbox, env });
    assert.notEqual(r.status, 0, "threshold breach must exit non-zero");
  });

  it("audit --format json produces valid JSON without a Pro key", () => {
    const r = run(["audit", file, "--format", "json"], { cwd: sandbox, env });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.doesNotThrow(() => JSON.parse(r.stdout), "stdout must be valid JSON");
  });

  it("inject --dry-run runs without a Pro key", () => {
    const r = run(["inject", file, "article", "--dry-run"], { cwd: sandbox, env });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
  });

  it("inject actually writes without a Pro key", () => {
    const r = run(["inject", file, "article"], { cwd: sandbox, env });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
  });

  it("robots generate runs without a Pro key", () => {
    const r = run(["robots", "generate", "--preset", "open"], { cwd: sandbox, env });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
  });

  it("llmstxt generate runs without a Pro key", () => {
    const r = run(
      ["llmstxt", "generate", contentDir, "--recursive", "--site-url", "https://example.com"],
      { cwd: sandbox, env }
    );
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
  });

  it("sitemap generate runs without a Pro key", () => {
    const r = run(
      ["sitemap", "generate", contentDir, "--recursive", "--base-url", "https://example.com"],
      { cwd: sandbox, env }
    );
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
  });

  it("generate-all runs without a Pro key", () => {
    const r = run(["generate-all", contentDir, "--site-url", "https://example.com"], {
      cwd: sandbox,
      env,
    });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
  });
});

describe("Plan 058 §6.1 — Pro-only surfaces are actually gated", () => {
  it("schema <file> course is Pro-gated", () => {
    const r = run(["schema", file, "course"], { cwd: sandbox, env });
    assert.notEqual(r.status, 0, "course schema must require Pro");
    assert.match(r.stderr || "", /Pro license/, "must explain the Pro requirement");
  });

  it("report is Pro-gated", () => {
    const r = run(["report", file], { cwd: sandbox, env });
    assert.notEqual(r.status, 0, "report must require Pro");
    assert.match(r.stderr || "", /Pro license/);
  });

  it("inject --no-branding is Pro-gated", () => {
    const r = run(["inject", file, "article", "--no-branding"], { cwd: sandbox, env });
    assert.notEqual(r.status, 0, "--no-branding must require Pro");
    assert.match(r.stderr || "", /Pro license|--no-branding/);
  });
});
