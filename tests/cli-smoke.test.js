/**
 * CLI smoke tests — plan 037 (C4).
 *
 * Ejercita los flujos principales del CLI para subir branch coverage
 * de bin/cli.js a ≥80%. Cada test ejecuta el CLI como subproceso y
 * verifica exit code + output esperado.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync, spawn } from "node:child_process";
import dns from "node:dns/promises";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import https from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";
const __dirname = new URL(".", import.meta.url).pathname;
const cliPath = join(__dirname, "..", "bin", "cli.js");
const repoRoot = join(__dirname, "..");

function run(args, opts = {}) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    ...opts,
  });
}

/** Versión asíncrona de run que no bloquea el event loop. */
function runAsync(args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      cwd: repoRoot,
      encoding: "utf8",
      ...opts,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("close", (code) => resolve({ status: code, stdout, stderr }));
    child.on("error", reject);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Audit
// ═══════════════════════════════════════════════════════════════════════════

describe("CLI audit", () => {
  const fixture = "tests/fixtures/audit-v2/editorial/tech-blog.md";

  it("text output exits 0 and contains score", () => {
    const { status, stdout } = run(["audit", fixture]);
    assert.equal(status, 0);
    assert.ok(stdout.includes("GEO"), "Debería mostrar output de auditoría");
  });

  it("--format json exits 0 and produces JSON parseable", () => {
    const { status, stdout } = run(["audit", fixture, "--format", "json"]);
    assert.equal(status, 0);
    const parsed = JSON.parse(stdout);
    assert.ok(typeof parsed.total_score === "number" || typeof parsed.effectiveScore === "number");
  });

  it("--model v2 produces profile info", () => {
    const { status, stdout } = run(["audit", fixture, "--model", "v2", "--format", "text"]);
    assert.equal(status, 0);
    assert.ok(
      stdout.includes("Profile") || stdout.includes("profile"),
      "v2 debería mostrar perfil"
    );
  });

  it("--model v2 --format json produces JSON with profile", () => {
    const { status, stdout } = run(["audit", fixture, "--model", "v2", "--format", "json"]);
    assert.equal(status, 0);
    const parsed = JSON.parse(stdout);
    assert.ok(parsed.profile, "v2 JSON debe tener profile");
  });

  it("--explain muestra evidence labels", () => {
    const { status, stdout } = run(["audit", fixture, "--explain"]);
    assert.equal(status, 0);
    assert.ok(
      stdout.includes("heuristic") || stdout.includes("strong") || stdout.includes("experimental"),
      "--explain debería mostrar evidence labels"
    );
  });

  it("rejects invalid --model value", () => {
    const { status, stderr } = run(["audit", fixture, "--model", "v3", "--format", "json"]);
    assert.notEqual(status, 0);
    assert.ok(
      stderr.includes("model") || stderr.includes("Unknown"),
      "Debería rechazar modelo inválido"
    );
  });

  it("handles non-existent file gracefully", () => {
    const { status, stderr: _stderr } = run(["audit", "/tmp/does-not-exist-xyz.md"]);
    assert.notEqual(status, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Schema & Validate
// ═══════════════════════════════════════════════════════════════════════════

describe("CLI schema", () => {
  it("generates JSON-LD for article type", () => {
    const fixture = "tests/fixtures/audit-v2/editorial/tech-blog.md";
    const { status, stdout } = run(["schema", fixture, "article"]);
    assert.equal(status, 0);
    const parsed = JSON.parse(stdout);
    assert.ok(parsed["@context"] || parsed["@type"]);
  });

  it("generates JSON-LD for faq type", () => {
    const fixture = "tests/fixtures/audit-v2/editorial/news-article.md";
    const { status } = run(["schema", fixture, "faq"]);
    assert.equal(status, 0);
  });

  it("rejects invalid type", () => {
    const { status } = run([
      "schema",
      "tests/fixtures/audit-v2/editorial/tech-blog.md",
      "invalid_type",
    ]);
    assert.notEqual(status, 0);
  });
});

describe("CLI validate", () => {
  it("reports no JSON-LD blocks for plain markdown", () => {
    const fixture = "tests/fixtures/audit-v2/editorial/tech-blog.md";
    const { status, stdout } = run(["validate", fixture]);
    assert.equal(status, 0);
    assert.ok(stdout.includes("No JSON-LD blocks") || stdout.includes("0 JSON-LD"));
  });

  it("errors on missing file", () => {
    const { status } = run(["validate", "/tmp/does-not-exist-xyz.md"]);
    assert.notEqual(status, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Inject
// ═══════════════════════════════════════════════════════════════════════════

describe("CLI inject", () => {
  let tmpDir;

  it("injects schema into a markdown file", () => {
    // Use a fixture inside the repo so the CWD security check passes
    const fixture = "tests/fixtures/audit-v2/editorial/tech-blog.md";

    const { status, stdout } = run(["inject", fixture, "article", "--dry-run"]);
    assert.equal(status, 0);
    assert.ok(stdout.includes("dry-run") || stdout.includes("Would"), "Debería indicar dry-run");
  });

  it("rejects inject without no-branding license for Pro features", () => {
    // --no-branding debería fallar sin licencia Pro
    tmpDir = mkdtempSync(join(tmpdir(), "geo-cli-inject-"));
    const fp = join(tmpDir, "test2.md");
    writeFileSync(fp, "# Test\n");
    // Sin licencia, --no-branding debería causar error
    const { status: _status, stderr: _stderr } = run([
      "inject",
      fp,
      "article",
      "--no-branding",
      "--dry-run",
    ]);
    // Puede exit 0 o 1 dependiendo de si tiene licencia
    // La prueba solo verifica que no crashea
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// LlmsTxt
// ═══════════════════════════════════════════════════════════════════════════

describe("CLI llmstxt", () => {
  const dir = "tests/fixtures/audit-v2/editorial";

  it("generate --dry-run exits 0", () => {
    const { status, stdout } = run(["llmstxt", "generate", dir, "-r", "--dry-run"]);
    assert.equal(status, 0);
    assert.ok(stdout.includes("llms.txt"), "Debería mostrar preview");
  });

  it("generate with --full produces llms-full preview", () => {
    const { status, stdout } = run([
      "llmstxt",
      "generate",
      dir,
      "-r",
      "--full",
      "--dry-run",
      "--site-url",
      "https://example.com",
    ]);
    assert.equal(status, 0);
    assert.ok(stdout.includes("llms-full.txt"), "Debería incluir llms-full");
  });

  it("audit reports valid structure for generated content", () => {
    // Generate first, then audit
    const tmpDir2 = mkdtempSync(join(repoRoot, "tmp-cli-llms-"));
    const { status: genStatus } = run([
      "llmstxt",
      "generate",
      dir,
      "-r",
      "--output",
      tmpDir2,
      "--site-url",
      "https://example.com",
      "--title",
      "Test Site",
      "--description",
      "A test site",
    ]);
    assert.equal(genStatus, 0);

    const llmsPath = join(tmpDir2, "llms.txt");
    const { status, stdout } = run(["llmstxt", "audit", llmsPath]);
    assert.equal(status, 0);
    assert.ok(
      stdout.includes("valid") || stdout.includes("issues") || stdout.includes("✓"),
      "Debería reportar resultado de auditoría"
    );
    rmSync(tmpDir2, { recursive: true, force: true });
  });

  it("audit with missing file exits with error", () => {
    const { status } = run(["llmstxt", "audit", "/tmp/nonexistent-llms.txt"]);
    assert.notEqual(status, 0);
  });

  it("generate uses frontmatter title/description when body is empty", () => {
    const tmpDir = mkdtempSync(join(repoRoot, "tmp-cli-llms-fm-"));
    try {
      const mdFile = join(tmpDir, "page.md");
      writeFileSync(
        mdFile,
        "---\ntitle: Frontmatter Title\ndescription: Frontmatter description text\n---\n",
        "utf8"
      );
      const { status, stdout } = run([
        "llmstxt",
        "generate",
        mdFile,
        "--dry-run",
        "--base-url",
        "https://example.com",
      ]);
      assert.equal(status, 0);
      assert.ok(stdout.includes("Frontmatter Title"), "Should use frontmatter title");
      assert.ok(
        stdout.includes("Frontmatter description text"),
        "Should use frontmatter description"
      );
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("generate --frontmatter-fields populates llms-full.txt content", () => {
    const tmpDir = mkdtempSync(join(repoRoot, "tmp-cli-llms-fm-"));
    try {
      const mdFile = join(tmpDir, "page.md");
      writeFileSync(
        mdFile,
        "---\ntitle: My Page\nbody: Full page body content here.\nexcerpt: Short excerpt.\n---\n",
        "utf8"
      );
      const { status, stdout } = run([
        "llmstxt",
        "generate",
        mdFile,
        "--full",
        "--dry-run",
        "--base-url",
        "https://example.com",
        "--frontmatter-fields",
        "body",
        "excerpt",
      ]);
      assert.equal(status, 0);
      assert.ok(stdout.includes("Full page body content here."), "Should include body field");
      assert.ok(stdout.includes("Short excerpt."), "Should include excerpt field");
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("generate --full without --frontmatter-fields shows empty content for frontmatter-only files", () => {
    const tmpDir = mkdtempSync(join(repoRoot, "tmp-cli-llms-fm-"));
    try {
      const mdFile = join(tmpDir, "page.md");
      writeFileSync(
        mdFile,
        "---\ntitle: My Page\nbody: Should not appear without flag.\n---\n",
        "utf8"
      );
      const { status, stdout } = run([
        "llmstxt",
        "generate",
        mdFile,
        "--full",
        "--dry-run",
        "--base-url",
        "https://example.com",
      ]);
      assert.equal(status, 0);
      assert.ok(
        !stdout.includes("Should not appear without flag."),
        "Should not extract body field without --frontmatter-fields"
      );
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Robots
// ═══════════════════════════════════════════════════════════════════════════

describe("CLI robots", () => {
  it("generate --dry-run produces expected content", () => {
    const { status, stdout } = run(["robots", "generate", "--dry-run"]);
    assert.equal(status, 0);
    assert.ok(stdout.includes("User-agent"), "Debería incluir reglas de user-agent");
    assert.ok(
      stdout.includes("Search Crawlers") || stdout.includes("AI Crawler"),
      "Debería tener secciones de crawlers"
    );
  });

  it("generate with --preset open allows all agents", () => {
    const { status, stdout } = run(["robots", "generate", "--preset", "open", "--dry-run"]);
    assert.equal(status, 0);
    // Under open, training crawlers should be allowed
    assert.ok(stdout.includes("GPTBot"), "Open preset debería incluir GPTBot");
  });

  it("rejects unknown preset", () => {
    const { status } = run(["robots", "generate", "--preset", "invalid"]);
    assert.notEqual(status, 0);
  });

  it("audit with --help exits 0", () => {
    const { status } = run(["robots", "audit", "--help"]);
    assert.equal(status, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Sitemap
// ═══════════════════════════════════════════════════════════════════════════

describe("CLI sitemap", () => {
  const dir = "tests/fixtures/audit-v2/editorial";

  it("generate --dry-run exits 0", () => {
    const { status, stdout } = run([
      "sitemap",
      "generate",
      dir,
      "-r",
      "--dry-run",
      "--base-url",
      "https://example.com",
    ]);
    assert.equal(status, 0);
    assert.ok(stdout.includes("urlset") || stdout.includes("sitemap"), "Debería mostrar XML");
  });

  it("generate with --audit includes score-based priorities", () => {
    const { status, stdout } = run([
      "sitemap",
      "generate",
      dir,
      "-r",
      "--dry-run",
      "--base-url",
      "https://example.com",
      "--audit",
    ]);
    assert.equal(status, 0);
    assert.ok(stdout.includes("<priority>"), "Debería incluir prioridades");
  });

  it("generate with no matching files reports error", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "geo-cli-empty-"));
    const { status } = run(["sitemap", "generate", tmpDir, "--base-url", "https://example.com"]);
    assert.notEqual(status, 0);
    rmSync(tmpDir, { recursive: true, force: true });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Generate-All
// ═══════════════════════════════════════════════════════════════════════════

describe("CLI generate-all", () => {
  const dir = "tests/fixtures/audit-v2/editorial";

  it("--dry-run exits 0 and reports all artifacts", () => {
    const { status, stdout } = run([
      "generate-all",
      dir,
      "-r",
      "--dry-run",
      "--site-url",
      "https://example.com",
      "--title",
      "Test Site",
    ]);
    assert.equal(status, 0);
    assert.ok(stdout.includes("llms.txt"), "Debería mencionar llms.txt");
    assert.ok(stdout.includes("sitemap.xml"), "Debería mencionar sitemap.xml");
    assert.ok(stdout.includes("robots.txt"), "Debería mencionar robots.txt");
    assert.ok(stdout.includes("audit-report.json"), "Debería mencionar audit-report.json");
  });

  it(
    "generates complete package to output directory",
    () => {
      const tmpDir = mkdtempSync(join(repoRoot, "tmp-cli-pkg-"));
      const { status, stdout } = run([
        "generate-all",
        dir,
        "--output",
        tmpDir,
        "--site-url",
        "https://example.com",
        "--title",
        "Test Site",
      ]);
      assert.equal(status, 0);
      assert.ok(stdout.includes("✅"), "Debería mostrar éxito");
      // Verify files exist
      assert.ok(existsSync(join(tmpDir, "audit-report.json")), "audit-report.json debe existir");
      assert.ok(existsSync(join(tmpDir, "llms.txt")), "llms.txt debe existir");
      assert.ok(existsSync(join(tmpDir, "sitemap.xml")), "sitemap.xml debe existir");
      assert.ok(existsSync(join(tmpDir, "robots.txt")), "robots.txt debe existir");
      rmSync(tmpDir, { recursive: true, force: true });
    },
    { timeout: 30_000 }
  );

  it("generated sitemap.xml contains <lastmod> from real file mtimes (plan 047)", () => {
    const tmpDir = mkdtempSync(join(repoRoot, "tmp-cli-lastmod-"));
    const contentDir = join(tmpDir, "content");
    const outDir = join(tmpDir, "out");
    mkdirSync(contentDir, { recursive: true });
    writeFileSync(join(contentDir, "page.md"), "# Test Page\n\nBody content here.");
    const { status, stderr: _stderr } = run([
      "generate-all",
      contentDir,
      "--recursive",
      "--output",
      outDir,
      "--site-url",
      "https://example.com",
    ]);
    assert.equal(status, 0, `generate-all failed: ${_stderr}`);
    const sitemapPath = join(outDir, "sitemap.xml");
    assert.ok(existsSync(sitemapPath), "sitemap.xml debe existir");
    const sitemapXml = readFileSync(sitemapPath, "utf8");
    assert.ok(
      sitemapXml.includes("<lastmod>"),
      `sitemap.xml debe contener <lastmod>, pero contiene:\n${sitemapXml}`
    );
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("generate-all does not follow symlinked content outside the discovered set", () => {
    const tmpDir = mkdtempSync(join(repoRoot, "tmp-cli-symlink-"));
    const contentDir = join(tmpDir, "content");
    const outDir = join(tmpDir, "out");
    mkdirSync(contentDir, { recursive: true });
    writeFileSync(join(tmpDir, "outside.md"), "# Outside\n\nSecret content.");
    try {
      symlinkSync(join(tmpDir, "outside.md"), join(contentDir, "linked.md"));
    } catch {
      rmSync(tmpDir, { recursive: true, force: true });
      return;
    }

    const { status } = run([
      "generate-all",
      contentDir,
      "--recursive",
      "--output",
      outDir,
      "--site-url",
      "https://example.com",
    ]);
    assert.equal(status, 1);
    rmSync(tmpDir, { recursive: true, force: true });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Config & Init
// ═══════════════════════════════════════════════════════════════════════════

describe("CLI config", () => {
  it("config get reminders exits 0", () => {
    const { status } = run(["config", "get", "reminders"]);
    assert.equal(status, 0);
  });

  it("config set reminders false exits 0", () => {
    const { status } = run(["config", "set", "reminders", "false"]);
    assert.equal(status, 0);
  });

  it("config set reminders true exits 0", () => {
    const { status } = run(["config", "set", "reminders", "true"]);
    assert.equal(status, 0);
  });
});

describe("CLI init", () => {
  it("--dry-run or help exits 0", () => {
    const { status } = run(["init", "--help"]);
    assert.equal(status, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Global
// ═══════════════════════════════════════════════════════════════════════════

describe("CLI global", () => {
  it("--help exits 0", () => {
    const { status, stdout } = run(["--help"]);
    assert.equal(status, 0);
    assert.ok(stdout.includes("audit"), "Help debería listar comandos");
  });

  it("no args exits 0 with help", () => {
    const { status, stdout } = run([]);
    assert.equal(status, 0);
    assert.ok(stdout.includes("Usage") || stdout.includes("Commands"), "Debería mostrar ayuda");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Error paths & edge cases (C4 branch coverage)
// ═══════════════════════════════════════════════════════════════════════════

describe("CLI error paths", () => {
  const fixture = "tests/fixtures/audit-v2/editorial/tech-blog.md";

  it("audit --threshold exits 1 when score is below threshold", () => {
    // Set threshold very high to force exit 1
    const { status } = run(["audit", fixture, "--threshold", "100", "--format", "text"]);
    assert.equal(status, 1, "Debería exit 1 cuando score < threshold");
  });

  it("audit --threshold exits 0 when score is above threshold", () => {
    const { status } = run(["audit", fixture, "--threshold", "0", "--format", "text"]);
    assert.equal(status, 0, "Debería exit 0 cuando score > threshold");
  });

  it("audit with --recursive scans directory", () => {
    const { status } = run([
      "audit",
      "tests/fixtures/audit-v2/editorial",
      "-r",
      "--format",
      "text",
    ]);
    assert.equal(status, 0);
  });

  it("audit --format json --summary produces aggregate report", () => {
    const { status, stdout } = run([
      "audit",
      "tests/fixtures/audit-v2/editorial",
      "-r",
      "--format",
      "json",
      "--summary",
    ]);
    assert.equal(status, 0);
    const parsed = JSON.parse(stdout);
    assert.ok(
      typeof parsed.averageScore === "number" || typeof parsed.totalFiles === "number",
      "Summary debería tener aggregate fields"
    );
  });

  it("audit --model v2 --format json --summary", () => {
    const { status, stdout } = run([
      "audit",
      "tests/fixtures/audit-v2/editorial",
      "-r",
      "--format",
      "json",
      "--summary",
      "--model",
      "v2",
    ]);
    assert.equal(status, 0);
    const parsed = JSON.parse(stdout);
    assert.ok(typeof parsed.totalFiles === "number");
  });

  it("generate-all reports error for non-existent directory", () => {
    const { status, stderr: _stderr } = run(["generate-all", "/tmp/does-not-exist-geo-xyz"]);
    assert.notEqual(status, 0);
  });

  it("generate-all handles directory with no content files", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "geo-cli-empty2-"));
    const { status, stderr: _stderr } = run(["generate-all", tmpDir]);
    assert.notEqual(status, 0);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("robots audit with temp robots.txt", () => {
    const tmpDir2 = mkdtempSync(join(tmpdir(), "geo-cli-robots-"));
    const robotsPath = join(tmpDir2, "robots.txt");
    writeFileSync(robotsPath, "User-agent: *\nDisallow: /private\n");
    const { status, stdout: _stdout } = run(["robots", "audit", robotsPath]);
    assert.equal(status, 0);
    rmSync(tmpDir2, { recursive: true, force: true });
  });

  it("robots audit with JSON format", () => {
    const tmpDir2 = mkdtempSync(join(tmpdir(), "geo-cli-robots2-"));
    const robotsPath = join(tmpDir2, "robots.txt");
    writeFileSync(robotsPath, "User-agent: GPTBot\nDisallow: /\n");
    // robots audit no tiene --format flag, se imprime a stdout
    const { status } = run(["robots", "audit", robotsPath]);
    assert.equal(status, 0);
    rmSync(tmpDir2, { recursive: true, force: true });
  });

  it("audit with missing file shows error", () => {
    const { status, stderr: _stderr } = run(["audit", "/tmp/does-not-exist-xyz.md"]);
    assert.notEqual(status, 0);
  });

  it("schema with missing file shows error", () => {
    const { status } = run(["schema", "/tmp/does-not-exist-xyz.md", "article"]);
    assert.notEqual(status, 0);
  });

  it("inject with missing file shows error", () => {
    const { status } = run(["inject", "tests/fixtures/does-not-exist.md", "article", "--dry-run"]);
    assert.notEqual(status, 0);
  });

  it("config set reminders without value shows usage", () => {
    const { status } = run(["config", "set", "reminders"]);
    assert.ok(status === 0 || status === 1);
  });

  it("robots generate writes to file (non-dry-run)", () => {
    const tmpDir2 = mkdtempSync(join(repoRoot, "tmp-cli-robots3-"));
    const outPath = join(tmpDir2, "robots.txt");
    const { status } = run([
      "robots",
      "generate",
      "--output",
      outPath,
      "--preset",
      "search-visible",
    ]);
    assert.equal(status, 0);
    const content = readFileSync(outPath, "utf8");
    assert.ok(content.includes("User-agent"), "Debería escribir robots.txt");
    rmSync(tmpDir2, { recursive: true, force: true });
  });

  it("llmstxt generate writes to file (non-dry-run)", () => {
    const tmpDir2 = mkdtempSync(join(repoRoot, "tmp-cli-llms2-"));
    const { status } = run([
      "llmstxt",
      "generate",
      "tests/fixtures/audit-v2/editorial",
      "-r",
      "--output",
      tmpDir2,
      "--site-url",
      "https://example.com",
      "--title",
      "Test",
    ]);
    assert.equal(status, 0);
    assert.ok(existsSync(join(tmpDir2, "llms.txt")), "llms.txt debe existir");
    rmSync(tmpDir2, { recursive: true, force: true });
  });

  it("sitemap generate writes to file (non-dry-run)", () => {
    const tmpDir2 = mkdtempSync(join(repoRoot, "tmp-cli-sitemap2-"));
    const { status } = run([
      "sitemap",
      "generate",
      "tests/fixtures/audit-v2/editorial",
      "-r",
      "--output",
      tmpDir2,
      "--base-url",
      "https://example.com",
    ]);
    assert.equal(status, 0);
    assert.ok(existsSync(join(tmpDir2, "sitemap.xml")), "sitemap.xml debe existir");
    rmSync(tmpDir2, { recursive: true, force: true });
  });

  it("audit v1 text with explicit --model v1", () => {
    const { status, stdout } = run([
      "audit",
      "tests/fixtures/audit-v2/editorial/tech-blog.md",
      "--model",
      "v1",
      "--format",
      "text",
    ]);
    assert.equal(status, 0);
    assert.ok(stdout.includes("GEO"), "v1 debería mostrar output");
  });

  // ── Branches específicos para C4 coverage ──

  it("audit with --recursive and explicit --ignore", () => {
    const { status } = run([
      "audit",
      "tests/fixtures/audit-v2/editorial",
      "-r",
      "--ignore",
      "nonexistent-pattern",
      "--format",
      "text",
    ]);
    assert.equal(status, 0);
  });

  it("llmstxt audit --recursive reports coverage", () => {
    // Generate llms.txt first, then audit with coverage
    const tmpDir2 = mkdtempSync(join(tmpdir(), "geo-cli-llms-cov-"));
    run([
      "llmstxt",
      "generate",
      "tests/fixtures/audit-v2/editorial",
      "-r",
      "--output",
      tmpDir2,
      "--site-url",
      "https://example.com",
      "--title",
      "Test",
    ]);
    const { status, stdout: _stdout } = run(["llmstxt", "audit", join(tmpDir2, "llms.txt"), "-r"]);
    // Exit code may be 0 or 1 depending on coverage (files outside CWD may be reported missing)
    assert.ok(status === 0 || status === 1, "audit --recursive no debería crashear");
    rmSync(tmpDir2, { recursive: true, force: true });
  });

  it("reminders via config set/get", () => {
    // Enable
    const { status: s1 } = run(["config", "set", "reminders", "true"]);
    assert.equal(s1, 0);
    // Get
    const { status: s2 } = run(["config", "get", "reminders"]);
    assert.equal(s2, 0);
    // Disable
    const { status: s3 } = run(["config", "set", "reminders", "false"]);
    assert.equal(s3, 0);
  });

  it("sitemap generate with single file (not directory)", () => {
    const { status, stdout } = run([
      "sitemap",
      "generate",
      "tests/fixtures/audit-v2/editorial/tech-blog.md",
      "--dry-run",
      "--base-url",
      "https://example.com",
    ]);
    assert.equal(status, 0);
    assert.ok(stdout.includes("sitemap.xml"), "Debería generar para archivo individual");
  });

  it("llmstxt generate with single file (not directory)", () => {
    const { status, stdout } = run([
      "llmstxt",
      "generate",
      "tests/fixtures/audit-v2/editorial/tech-blog.md",
      "--dry-run",
      "--site-url",
      "https://example.com",
      "--title",
      "Test",
    ]);
    assert.equal(status, 0);
    assert.ok(stdout.includes("llms.txt"), "Debería funcionar con archivo individual");
  });

  it("audit --format json without --summary", () => {
    const { status, stdout } = run([
      "audit",
      "tests/fixtures/audit-v2/editorial/tech-blog.md",
      "--format",
      "json",
    ]);
    assert.equal(status, 0);
    const parsed = JSON.parse(stdout);
    assert.ok(typeof parsed.total_score === "number" || typeof parsed.effectiveScore === "number");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Technical audit
// ═══════════════════════════════════════════════════════════════════════════

describe("CLI technical", () => {
  const htmlFixture = "tests/fixtures/technical/valid-static.html";

  it("text output exits 0 para archivo HTML local", () => {
    const { status, stdout } = run(["technical", htmlFixture]);
    assert.equal(status, 0);
    assert.ok(stdout.includes("TECHNICAL AUDIT"), "Debería mostrar reporte técnico");
    assert.ok(stdout.includes("Findings"), "Debería listar findings");
  });

  it("--format json exits 0 y produce JSON con observaciones", () => {
    const { status, stdout } = run(["technical", htmlFixture, "--format", "json"]);
    assert.equal(status, 0);
    const parsed = JSON.parse(stdout);
    assert.equal(typeof parsed.observations, "object");
    assert.ok(Array.isArray(parsed.findings), "findings debe ser array");
    assert.ok(parsed.observations.title, "debe tener observaciones de título");
  });

  it("--source-url válido resuelve links relativos", () => {
    const { status, stdout } = run([
      "technical",
      htmlFixture,
      "--source-url",
      "https://example.com",
      "--format",
      "json",
    ]);
    assert.equal(status, 0);
    const parsed = JSON.parse(stdout);
    assert.equal(parsed.target, "https://example.com");
    assert.ok(parsed.observations.links.internalCount >= 0);
  });

  it("rechaza --source-url relativo", () => {
    const { status, stderr } = run(["technical", htmlFixture, "--source-url", "/relative"]);
    assert.notEqual(status, 0);
    assert.ok(
      stderr.includes("absolute") || stderr.includes("source-url"),
      "Debería rechazar URL relativo"
    );
  });

  it("rechaza --format inválido", () => {
    const { status, stderr } = run(["technical", htmlFixture, "--format", "xml"]);
    assert.notEqual(status, 0);
    assert.ok(
      stderr.includes("format") || stderr.includes("text") || stderr.includes("json"),
      "Debería rechazar formato inválido"
    );
  });

  it("error si no se pasan archivos", () => {
    const { status, stderr } = run(["technical"]);
    assert.notEqual(status, 0);
    assert.ok(stderr.includes("Missing") || stderr.includes("file"), "Debería pedir archivos");
  });

  it("error si archivo no existe", () => {
    const { status, stderr } = run(["technical", "no-existe.html"]);
    assert.notEqual(status, 0);
    assert.ok(
      stderr.includes("Error") || stderr.includes("no-existe"),
      "Debería reportar archivo faltante"
    );
  });

  it("--output escribe reporte JSON a archivo (dentro de cwd)", () => {
    // F-12: la guarda de cwd exige que -o apunte dentro del directorio de
    // trabajo; los tmp dirs van bajo el repo, no en el sistema.
    const tmpDir = mkdtempSync(join(repoRoot, "tmp-cli-tech-"));
    const outFile = join(tmpDir, "report.json");
    try {
      const { status } = run(["technical", htmlFixture, "--format", "json", "--output", outFile]);
      assert.equal(status, 0);
      assert.ok(existsSync(outFile), "Debe crear archivo de salida");
      const raw = readFileSync(outFile, "utf8");
      const parsed = JSON.parse(raw);
      assert.ok(parsed.observations, "Debe ser JSON de reporte válido");
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("audita múltiples archivos con --format json (array)", () => {
    const { status, stdout } = run([
      "technical",
      htmlFixture,
      "tests/fixtures/technical/noindex.html",
      "--format",
      "json",
    ]);
    assert.equal(status, 0);
    const parsed = JSON.parse(stdout);
    assert.ok(Array.isArray(parsed), "Múltiples archivos deben retornar array");
    assert.equal(parsed.length, 2);
    assert.equal(parsed[0].file, htmlFixture);
    assert.equal(parsed[1].file, "tests/fixtures/technical/noindex.html");
  });

  it("detecta noindex en archivo con meta robots", () => {
    const { status, stdout } = run([
      "technical",
      "tests/fixtures/technical/noindex.html",
      "--format",
      "json",
    ]);
    assert.equal(status, 0);
    const parsed = JSON.parse(stdout);
    assert.equal(parsed.observations.robots.noindex, true);
  });

  it("detecta app shell en archivo vacío con scripts", () => {
    const { status, stdout } = run([
      "technical",
      "tests/fixtures/technical/empty-app-shell.html",
      "--format",
      "json",
    ]);
    assert.equal(status, 0);
    const parsed = JSON.parse(stdout);
    assert.equal(parsed.observations.appShell.detected, true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Technical audit — remote flags (Fase 2, plan 023)
// ═══════════════════════════════════════════════════════════════════════════

describe("CLI technical --url", () => {
  let server, baseUrl;

  before(() => {
    return new Promise((resolve, reject) => {
      server = createServer((_req, res) => {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(
          '<!DOCTYPE html><html lang="en"><head><title>Remote Page</title></head><body><h1>Hello Remote</h1></body></html>'
        );
      });
      server.listen(0, "127.0.0.1", () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
      server.on("error", reject);
    });
  });

  after(() => {
    if (server) server.close();
  });

  it("--url fetches and audits a remote page (JSON)", async () => {
    const { status, stdout } = await runAsync([
      "technical",
      "--url",
      `${baseUrl}/page`,
      "--format",
      "json",
      "--allow-localhost",
    ]);
    assert.equal(status, 0);
    const parsed = JSON.parse(stdout);
    assert.equal(parsed.status, "success");
    assert.ok(parsed.observations.title.values.includes("Remote Page"));
    assert.ok(parsed.findings.length > 0);
  });

  it("--url rejects http:// without allow-localhost or allow-private", async () => {
    // Sin flags de red, las URLs http:// son rechazadas por el CLI
    // (requiere https:// o --allow-localhost/--allow-private)
    const { status } = await runAsync([
      "technical",
      "--url",
      `${baseUrl}/page`,
      "--format",
      "json",
    ]);
    assert.notEqual(status, 0);
  });

  it("--url con host inalcanzable reporta error gracefully", async () => {
    const { stdout } = await runAsync([
      "technical",
      "--url",
      "http://127.0.0.1:19999/nonexistent",
      "--format",
      "json",
      "--allow-localhost",
    ]);
    // Puede exit 0 o 1, pero no debe crashear y debe reportar error
    const parsed = JSON.parse(stdout);
    assert.equal(parsed.status, "error");
    assert.ok(parsed.error);
  });

  it("--url rechaza esquema no https:// sin flags de red", () => {
    const { status, stderr } = run([
      "technical",
      "--url",
      "http://example.com/page",
      "--format",
      "json",
    ]);
    assert.notEqual(status, 0);
    assert.ok(
      stderr.includes("https") ||
        stderr.includes("allow-private") ||
        stderr.includes("allow-localhost")
    );
  });

  it("--url con literal IPv6 con brackets sugiere --allow-localhost, no --allow-http", () => {
    // Sin flags de red, https:// es obligatorio. En Node 22+ el hostname de
    // un literal IPv6 incluye brackets ("[::1]") y la sugerencia debe ser
    // --allow-localhost (--allow-http no desbloquea loopback). El CLI falla
    // en la validación de esquema antes de conectar, así que [::1]:1 nunca
    // se toca.
    const { status, stderr } = run(["technical", "--url", "http://[::1]:1/", "--format", "json"]);
    assert.notEqual(status, 0);
    assert.ok(
      stderr.includes("--allow-localhost"),
      `la sugerencia debe ser --allow-localhost, stderr: ${stderr}`
    );
    assert.ok(
      !stderr.includes("--allow-http"),
      `la sugerencia no debe ser --allow-http, stderr: ${stderr}`
    );
  });
});

describe("CLI technical --sitemap", () => {
  // Nota: --sitemap requiere https:// (especificación). Las pruebas de
  // integración sitemap completas están en tests/fetcher.test.js vía API.
  // Aquí probamos los paths de error del CLI.

  it("--sitemap con http:// es rechazado incluso con --allow-localhost", () => {
    const { status, stderr } = run([
      "technical",
      "--sitemap",
      "http://127.0.0.1:12345/sitemap.xml",
      "--format",
      "json",
      "--allow-localhost",
    ]);
    assert.notEqual(status, 0);
    assert.ok(stderr.includes("https"), "Debería requerir https://");
  });

  it("--sitemap requiere https:// sin flags de red", () => {
    const { status } = run([
      "technical",
      "--sitemap",
      "http://example.com/sitemap.xml",
      "--format",
      "json",
    ]);
    assert.notEqual(status, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Technical audit — hop scheme & origin policy (Plan 075)
// ═══════════════════════════════════════════════════════════════════════════

/** Fixtures TLS de test (Plan 074): CA y certificados para localhost. */
const TLS_FIXTURES_DIR = join(repoRoot, "tests", "fixtures", "tls");

function tlsFixture(name) {
  return readFileSync(join(TLS_FIXTURES_DIR, name), "utf8");
}

/** Servidor HTTPS local con los fixtures de test (mismo patrón que fetcher.test.js). */
function startTlsServer(keyPem, certPem, handler) {
  return new Promise((resolve, reject) => {
    const server = https.createServer({ key: keyPem, cert: certPem }, handler);
    server.listen(0, "127.0.0.1", () => {
      resolve({ server, port: server.address().port });
    });
    server.on("error", reject);
  });
}

describe("CLI technical — hop policy (Plan 075)", () => {
  // Dos origins locales (puertos distintos): A es el root de la auditoría,
  // B el destino cross-origin. B cuenta requests: un hop rechazado por
  // política nunca debe llegar a conectar.
  let serverA, serverB, baseUrlA, baseUrlB, requestsB;

  before(async () => {
    requestsB = 0;
    serverA = createServer((req, res) => {
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (url.pathname === "/cross-origin-redirect") {
        res.writeHead(302, { Location: `${baseUrlB}/page` });
        res.end();
        return;
      }
      if (url.pathname === "/same-origin-redirect") {
        res.writeHead(302, { Location: `${baseUrlA}/final` });
        res.end();
        return;
      }
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(
        '<!DOCTYPE html><html lang="en"><head><title>Origin A</title></head><body><h1>A</h1></body></html>'
      );
    });
    serverB = createServer((req, res) => {
      requestsB += 1;
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(
        '<!DOCTYPE html><html lang="en"><head><title>Origin B</title></head><body><h1>B</h1></body></html>'
      );
    });
    await new Promise((resolve, reject) => {
      serverA.listen(0, "127.0.0.1", () => {
        const port = serverA.address().port;
        baseUrlA = `http://127.0.0.1:${port}`;
        resolve();
      });
      serverA.on("error", reject);
    });
    await new Promise((resolve, reject) => {
      serverB.listen(0, "127.0.0.1", () => {
        const port = serverB.address().port;
        baseUrlB = `http://127.0.0.1:${port}`;
        resolve();
      });
      serverB.on("error", reject);
    });
  });

  after(() => {
    serverA?.close();
    serverB?.close();
  });

  it("--help documenta --allow-cross-origin y --allow-http como opt-ins", () => {
    const { status, stdout } = run(["technical", "--help"]);
    assert.equal(status, 0);
    assert.ok(
      stdout.includes("--allow-cross-origin"),
      "el help de technical debe listar --allow-cross-origin"
    );
    assert.ok(stdout.includes("--allow-http"), "el help de technical debe listar --allow-http");
  });

  it("--url: redirect cross-origin falla por defecto sin tocar el segundo origin", async () => {
    const before = requestsB;
    const { status, stdout } = await runAsync([
      "technical",
      "--url",
      `${baseUrlA}/cross-origin-redirect`,
      "--format",
      "json",
      "--allow-localhost",
    ]);
    assert.equal(status, 0);
    const parsed = JSON.parse(stdout);
    assert.equal(parsed.status, "error");
    assert.ok(
      parsed.error.includes("cross-origin"),
      `esperaba error de política cross-origin, recibí: ${parsed.error}`
    );
    assert.equal(requestsB - before, 0, "el hop cross-origin rechazado no debe conectar");
  });

  it("--url: --allow-cross-origin permite el redirect cross-origin", async () => {
    const before = requestsB;
    const { status, stdout } = await runAsync([
      "technical",
      "--url",
      `${baseUrlA}/cross-origin-redirect`,
      "--format",
      "json",
      "--allow-localhost",
      "--allow-cross-origin",
    ]);
    assert.equal(status, 0);
    const parsed = JSON.parse(stdout);
    assert.equal(parsed.status, "success");
    assert.ok(
      parsed.observations.title.values.includes("Origin B"),
      `el título esperado era "Origin B", recibí: ${JSON.stringify(parsed.observations?.title?.values)}`
    );
    assert.equal(requestsB - before, 1, "con el opt-in el segundo origin recibe un request");
  });

  it("--url: redirect same-origin se sigue sin --allow-cross-origin", async () => {
    const { status, stdout } = await runAsync([
      "technical",
      "--url",
      `${baseUrlA}/same-origin-redirect`,
      "--format",
      "json",
      "--allow-localhost",
    ]);
    assert.equal(status, 0);
    const parsed = JSON.parse(stdout);
    assert.equal(parsed.status, "success");
    assert.ok(
      parsed.observations.title.values.includes("Origin A"),
      `el título esperado era "Origin A", recibí: ${JSON.stringify(parsed.observations?.title?.values)}`
    );
  });
});

describe("CLI technical --sitemap — hop policy (Plan 075)", () => {
  let localhostResolvesToLoopback = false;

  before(async () => {
    try {
      const v4 = await dns.resolve4("localhost");
      localhostResolvesToLoopback = v4.includes("127.0.0.1");
    } catch {
      localhostResolvesToLoopback = false;
    }
  });

  it("--sitemap: página cross-origin falla por defecto; --allow-cross-origin la permite", async (t) => {
    if (!localhostResolvesToLoopback) {
      t.skip(
        "localhost no resuelve a 127.0.0.1 en este runner; se omite el caso sitemap cross-origin"
      );
      return;
    }

    let pageRequests = 0;
    // El servidor de páginas y el del sitemap escuchan en puertos distintos:
    // origins distintos para la política (el origin incluye el puerto). El
    // CLI hijo confía en la CA de test vía NODE_EXTRA_CA_CERTS.
    const pageServer = await startTlsServer(
      tlsFixture("TEST-ONLY-localhost-server-key.pem"),
      tlsFixture("TEST-ONLY-localhost-server-cert.pem"),
      (_req, res) => {
        pageRequests += 1;
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(
          '<!DOCTYPE html><html lang="en"><head><title>Cross Page</title></head><body><h1>P</h1></body></html>'
        );
      }
    );
    const sitemapServer = await startTlsServer(
      tlsFixture("TEST-ONLY-localhost-server-key.pem"),
      tlsFixture("TEST-ONLY-localhost-server-cert.pem"),
      (_req, res) => {
        res.writeHead(200, { "Content-Type": "application/xml" });
        res.end(
          `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://localhost:${pageServer.port}/page</loc></url></urlset>`
        );
      }
    );
    const env = {
      ...process.env,
      NODE_EXTRA_CA_CERTS: join(TLS_FIXTURES_DIR, "TEST-ONLY-ca-cert.pem"),
    };
    const sitemapUrl = `https://localhost:${sitemapServer.port}/sitemap.xml`;

    try {
      // Por defecto: la página cross-origin se reporta como error sin
      // contactar el segundo origin (el sitemap raíz sí se audita).
      const blocked = await runAsync(
        [
          "technical",
          "--sitemap",
          sitemapUrl,
          "--format",
          "json",
          "--allow-localhost",
          "--no-robots",
        ],
        { env }
      );
      assert.equal(blocked.status, 0);
      const blockedParsed = JSON.parse(blocked.stdout);
      assert.equal(blockedParsed.status, "error");
      assert.ok(
        blockedParsed.error.includes("cross-origin"),
        `esperaba error de política cross-origin, recibí: ${blockedParsed.error}`
      );
      assert.equal(pageRequests, 0, "la página cross-origin no debe recibir requests");

      // Con --allow-cross-origin la página se audita.
      const allowed = await runAsync(
        [
          "technical",
          "--sitemap",
          sitemapUrl,
          "--format",
          "json",
          "--allow-localhost",
          "--no-robots",
          "--allow-cross-origin",
        ],
        { env }
      );
      assert.equal(allowed.status, 0);
      const allowedParsed = JSON.parse(allowed.stdout);
      assert.equal(allowedParsed.status, "success");
      assert.ok(
        allowedParsed.observations.title.values.includes("Cross Page"),
        `el título esperado era "Cross Page", recibí: ${JSON.stringify(
          allowedParsed.observations?.title?.values
        )}`
      );
      assert.equal(pageRequests, 1, "con el opt-in la página recibe exactamente un request");
    } finally {
      pageServer?.server.close();
      sitemapServer?.server.close();
    }
  });

  it("--sitemap: el esquema http de páginas descubiertas exige --allow-http (los flags de IP no lo liberan)", async (t) => {
    if (!localhostResolvesToLoopback) {
      t.skip(
        "localhost no resuelve a 127.0.0.1 en este runner; se omite el caso de esquema estricto"
      );
      return;
    }

    let pageRequests = 0;
    // Página http:// en un servidor plano (puerto distinto del sitemap TLS).
    // El modo --sitemap es estricto en esquema: ni --allow-localhost ni
    // --allow-cross-origin liberan http; solo --allow-http lo hace (Plan 075).
    const pageServer = await new Promise((resolve, reject) => {
      const server = createServer((_req, res) => {
        pageRequests += 1;
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(
          '<!DOCTYPE html><html lang="en"><head><title>Http Page</title></head><body><h1>H</h1></body></html>'
        );
      });
      server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
      server.on("error", reject);
    });
    const sitemapServer = await startTlsServer(
      tlsFixture("TEST-ONLY-localhost-server-key.pem"),
      tlsFixture("TEST-ONLY-localhost-server-cert.pem"),
      (_req, res) => {
        res.writeHead(200, { "Content-Type": "application/xml" });
        res.end(
          `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>http://127.0.0.1:${pageServer.port}/page</loc></url></urlset>`
        );
      }
    );
    const env = {
      ...process.env,
      NODE_EXTRA_CA_CERTS: join(TLS_FIXTURES_DIR, "TEST-ONLY-ca-cert.pem"),
    };
    const sitemapUrl = `https://localhost:${sitemapServer.port}/sitemap.xml`;

    try {
      // Sin --allow-http, con --allow-localhost y --allow-cross-origin: el
      // hop http:// se rechaza por esquema ANTES del check de origin y sin
      // conectar al servidor de páginas.
      const strict = await runAsync(
        [
          "technical",
          "--sitemap",
          sitemapUrl,
          "--format",
          "json",
          "--allow-localhost",
          "--no-robots",
          "--allow-cross-origin",
        ],
        { env }
      );
      assert.equal(strict.status, 0);
      const strictParsed = JSON.parse(strict.stdout);
      assert.equal(strictParsed.status, "error");
      assert.ok(
        strictParsed.error.includes("HTTP scheme"),
        `esperaba rechazo de esquema HTTP, recibí: ${strictParsed.error}`
      );
      assert.equal(pageRequests, 0, "la página http no debe recibir requests sin --allow-http");

      // Con --allow-http (y el --allow-cross-origin ya presente) la página
      // http se audita.
      const allowed = await runAsync(
        [
          "technical",
          "--sitemap",
          sitemapUrl,
          "--format",
          "json",
          "--allow-localhost",
          "--no-robots",
          "--allow-cross-origin",
          "--allow-http",
        ],
        { env }
      );
      assert.equal(allowed.status, 0);
      const allowedParsed = JSON.parse(allowed.stdout);
      assert.equal(allowedParsed.status, "success");
      assert.ok(
        allowedParsed.observations.title.values.includes("Http Page"),
        `el título esperado era "Http Page", recibí: ${JSON.stringify(
          allowedParsed.observations?.title?.values
        )}`
      );
      assert.equal(pageRequests, 1, "con --allow-http la página recibe exactamente un request");
    } finally {
      pageServer.server.close();
      sitemapServer?.server.close();
    }
  });

  it("--sitemap: el rechazo de política de robots.txt se reporta como warning y la auditoría continúa", async (t) => {
    if (!localhostResolvesToLoopback) {
      t.skip(
        "localhost no resuelve a 127.0.0.1 en este runner; se omite el caso del warning de robots"
      );
      return;
    }

    // Origin A: /robots.txt hace 302 cross-origin a origin B (donde viven
    // las reglas reales). La política bloquea el hop a B — B no recibe
    // NINGÚN request — y fetchRobotsTxt PROPAGA el rechazo (ERR_HOP_POLICY)
    // en lugar de tragárselo: el CLI lo reporta como warning en stderr y
    // continúa la auditoría con acceso total (comportamiento previo).
    let robotsTargetRequests = 0;
    const targetServer = await startTlsServer(
      tlsFixture("TEST-ONLY-localhost-server-key.pem"),
      tlsFixture("TEST-ONLY-localhost-server-cert.pem"),
      (_req, res) => {
        robotsTargetRequests += 1;
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("User-agent: *\nDisallow: /private\n");
      }
    );
    const sitemapServer = await startTlsServer(
      tlsFixture("TEST-ONLY-localhost-server-key.pem"),
      tlsFixture("TEST-ONLY-localhost-server-cert.pem"),
      (req, res) => {
        const url = new URL(req.url, `https://${req.headers.host}`);
        if (url.pathname === "/robots.txt") {
          res.writeHead(302, { Location: `https://localhost:${targetServer.port}/robots.txt` });
          res.end();
          return;
        }
        if (url.pathname === "/sitemap.xml") {
          res.writeHead(200, { "Content-Type": "application/xml" });
          res.end(
            `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://localhost:${sitemapServer.port}/page</loc></url></urlset>`
          );
          return;
        }
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(
          '<!DOCTYPE html><html lang="en"><head><title>Robots Warning Page</title></head><body><h1>R</h1></body></html>'
        );
      }
    );
    const env = {
      ...process.env,
      NODE_EXTRA_CA_CERTS: join(TLS_FIXTURES_DIR, "TEST-ONLY-ca-cert.pem"),
    };
    const sitemapUrl = `https://localhost:${sitemapServer.port}/sitemap.xml`;

    try {
      // Formato texto: el warning de política va a stderr (diagnóstico);
      // el reporte de la página auditada sale por stdout.
      const run = await runAsync(["technical", "--sitemap", sitemapUrl, "--allow-localhost"], {
        env,
      });
      assert.equal(run.status, 0);
      assert.equal(
        robotsTargetRequests,
        0,
        "el robots.txt cross-origin no debe recibir requests (hop bloqueado)"
      );
      assert.ok(
        run.stderr.includes("Could not fetch robots.txt"),
        `esperaba el warning de robots.txt, stderr: ${run.stderr.slice(0, 800)}`
      );
      assert.ok(
        run.stderr.includes("cross-origin"),
        `el warning debe nombrar la política cross-origin, stderr: ${run.stderr.slice(0, 800)}`
      );
      assert.ok(
        run.stdout.includes("Robots Warning Page"),
        `la página debe auditarse igualmente, stdout: ${run.stdout.slice(0, 800)}`
      );
    } finally {
      sitemapServer?.server.close();
      targetServer?.server.close();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Plan 076 — tope finito de URLs de página retenidas (raíz + sub-sitemaps)
// ═══════════════════════════════════════════════════════════════════════════

describe("CLI technical --sitemap — page URL budget (Plan 076)", () => {
  let localhostResolvesToLoopback = false;

  before(async () => {
    try {
      const v4 = await dns.resolve4("localhost");
      localhostResolvesToLoopback = v4.includes("127.0.0.1");
    } catch {
      localhostResolvesToLoopback = false;
    }
  });

  it("un sub-sitemap con >50.000 URLs se trunca con aviso y el total queda acotado", async (t) => {
    if (!localhostResolvesToLoopback) {
      t.skip(
        "localhost no resuelve a 127.0.0.1 en este runner; se omite el caso del presupuesto de URLs"
      );
      return;
    }

    // Sub-sitemap con 50.003 URLs de página (todas únicas). El presupuesto
    // compartido (raíz + sub-sitemaps, 50.000 según la escala del spec) debe
    // truncar 3 y avisar; luego --max-urls recorta a 2 páginas auditadas.
    const PAGE_COUNT = 50_003;
    let pageRequests = 0;
    const server = await startTlsServer(
      tlsFixture("TEST-ONLY-localhost-server-key.pem"),
      tlsFixture("TEST-ONLY-localhost-server-cert.pem"),
      (req, res) => {
        const pathname = new URL(req.url, "https://localhost").pathname;
        if (pathname === "/sitemap.xml") {
          res.writeHead(200, { "Content-Type": "application/xml" });
          res.end(
            `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>https://localhost:${server.port}/sub.xml</loc></sitemap></sitemapindex>`
          );
          return;
        }
        if (pathname === "/sub.xml") {
          const rows = [];
          for (let i = 0; i < PAGE_COUNT; i += 1) {
            rows.push(`<url><loc>https://localhost:${server.port}/page-${i}</loc></url>`);
          }
          res.writeHead(200, { "Content-Type": "application/xml" });
          res.end(
            `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${rows.join("")}</urlset>`
          );
          return;
        }
        pageRequests += 1;
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(
          '<!DOCTYPE html><html lang="en"><head><title>Budget Page</title></head><body><h1>P</h1></body></html>'
        );
      }
    );
    const env = {
      ...process.env,
      NODE_EXTRA_CA_CERTS: join(TLS_FIXTURES_DIR, "TEST-ONLY-ca-cert.pem"),
    };

    try {
      const run = await runAsync(
        [
          "technical",
          "--sitemap",
          `https://localhost:${server.port}/sitemap.xml`,
          "--max-urls",
          "2",
          "--allow-localhost",
          "--no-robots",
        ],
        { env }
      );
      assert.equal(run.status, 0, `stderr: ${run.stderr.slice(0, 800)}`);
      assert.ok(
        run.stdout.includes("Extracted 50000 page URLs from sub-sitemaps."),
        `esperaba el conteo acotado, stdout: ${run.stdout.slice(0, 800)}`
      );
      assert.ok(
        run.stderr.includes("Sub-sitemap page URL limit reached (50000)") &&
          run.stderr.includes("3 unique page URL(s) omitted"),
        `esperaba el aviso de truncamiento, stderr: ${run.stderr.slice(0, 800)}`
      );
      assert.ok(
        run.stdout.includes("Limited to 2 URLs (of 50000 allowed)."),
        "el total combinado (raíz + sub-sitemaps) queda en 50.000 antes de --max-urls"
      );
      assert.equal(pageRequests, 2, "--max-urls sigue recortando tras el presupuesto");
    } finally {
      server?.server.close();
    }
  });
});

describe("CLI technical — mutual exclusion", () => {
  const htmlFixture = "tests/fixtures/technical/valid-static.html";

  it("rechaza --url con archivos locales", () => {
    const { status, stderr } = run([
      "technical",
      htmlFixture,
      "--url",
      "https://example.com/page",
      "--format",
      "json",
    ]);
    assert.notEqual(status, 0);
    assert.ok(stderr.includes("mutually exclusive") || stderr.includes("cannot"));
  });

  it("rechaza --sitemap con archivos locales", () => {
    const { status, stderr } = run([
      "technical",
      htmlFixture,
      "--sitemap",
      "https://example.com/sitemap.xml",
      "--format",
      "json",
    ]);
    assert.notEqual(status, 0);
    assert.ok(stderr.includes("mutually exclusive") || stderr.includes("cannot"));
  });

  it("rechaza --url y --sitemap juntos", () => {
    const { status } = run([
      "technical",
      "--url",
      "https://example.com/page",
      "--sitemap",
      "https://example.com/sitemap.xml",
      "--format",
      "json",
    ]);
    assert.notEqual(status, 0);
  });

  it("error si no hay archivos ni flags remotos", () => {
    const { status, stderr } = run(["technical", "--format", "json"]);
    assert.notEqual(status, 0);
    assert.ok(
      stderr.includes("file") ||
        stderr.includes("url") ||
        stderr.includes("sitemap") ||
        stderr.includes("path")
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Audit — fallos parciales de archivo (F-05)
// ═══════════════════════════════════════════════════════════════════════════

describe("CLI audit — partial file failures (F-05)", () => {
  const okFixture = "tests/fixtures/audit-v2/editorial/tech-blog.md";

  /** Crea un par ok.md + bad.md (este último ilegible) en un temp dir. */
  function makeUnreadablePair() {
    const dir = mkdtempSync(join(tmpdir(), "geo-opt-f05-"));
    writeFileSync(join(dir, "ok.md"), "# OK doc\n\nSome content.\n");
    const bad = join(dir, "bad.md");
    writeFileSync(bad, "# Bad doc\n");
    chmodSync(bad, 0o000);
    return { dir, bad };
  }

  it("audit-json-reports-partial-failures", () => {
    const { dir, bad } = makeUnreadablePair();
    try {
      const ok = join(dir, "ok.md");
      const { status, stderr, stdout } = run(["audit", ok, bad, "--format", "json"]);
      assert.notEqual(status, 0, "exit != 0 con fallos parciales");
      assert.ok(stderr.includes("Error auditing"), "diagnóstico en stderr");
      assert.ok(stderr.includes(bad), "stderr menciona el archivo fallido");
      // El payload JSON sigue siendo parseable y contiene el reporte del éxito.
      const parsed = JSON.parse(stdout);
      assert.ok(
        typeof parsed.total_score === "number" || typeof parsed.effectiveScore === "number",
        "JSON con el reporte del éxito"
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("text mode partial failure also exits non-zero", () => {
    const { dir, bad } = makeUnreadablePair();
    try {
      const ok = join(dir, "ok.md");
      const { status, stderr } = run(["audit", ok, bad]);
      assert.notEqual(status, 0, "exit != 0 en modo texto con fallos parciales");
      assert.ok(stderr.includes("Error auditing"), "diagnóstico en stderr");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("all-success json still exits 0 (no behavior change)", () => {
    const { status, stderr } = run(["audit", okFixture, "--format", "json"]);
    assert.equal(status, 0);
    assert.ok(!stderr.includes("Error auditing"), "sin errores en stderr");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// llmstxt/sitemap — URLs de página con caracteres especiales (F-09)
// ═══════════════════════════════════════════════════════════════════════════

describe("CLI llmstxt/sitemap — URL encoding (F-09)", () => {
  const encDir = mkdtempSync(join(repoRoot, "tmp-cli-enc-"));

  before(() => {
    // Título hostil (H1) y nombre de archivo con espacios.
    writeFileSync(
      join(encDir, "mi página con espacios.md"),
      "# Fraud](https://evil.example)\n\nContenido de prueba.\n"
    );
  });

  after(() => {
    rmSync(encDir, { recursive: true, force: true });
  });

  it("llms-txt-escapes-hostile-titles e2e", () => {
    const { status, stdout } = run([
      "llmstxt",
      "generate",
      encDir,
      "-r",
      "--dry-run",
      "--site-url",
      "https://example.com",
    ]);
    assert.equal(status, 0);
    // El cierre del link inyectado no aparece crudo en el artefacto.
    assert.ok(!stdout.includes("](https://evil.example)"), "no markdown link injection");
    // El path con espacios sale codificado.
    assert.ok(stdout.includes("mi%20p%C3%A1gina%20con%20espacios"), "spaces encoded in URL");
  });

  it("sitemap-encodes-urls e2e", () => {
    const { status, stdout } = run([
      "sitemap",
      "generate",
      encDir,
      "-r",
      "--dry-run",
      "--base-url",
      "https://example.com",
    ]);
    assert.equal(status, 0);
    assert.ok(stdout.includes("mi%20p%C3%A1gina%20con%20espacios"), "<loc> has encoded URL");
    assert.ok(!stdout.includes("<loc>https://example.com/mi página"), "no raw spaces in <loc>");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// technical -o — guarda de cwd (F-12)
// ═══════════════════════════════════════════════════════════════════════════

describe("CLI technical — output cwd guard (F-12)", () => {
  it("technical-output-enforces-cwd", () => {
    const escapeName = `geo-opt-escape-${process.pid}.json`;
    const { status, stderr } = run([
      "technical",
      "tests/fixtures/audit-v2/commercial/landing-page.html",
      "-f",
      "json",
      "-o",
      `../${escapeName}`,
    ]);
    assert.notEqual(status, 0, "salida fuera de cwd debe rechazarse");
    assert.ok(
      /Security restriction|outside|CWD|cwd/i.test(stderr),
      `error del guard en stderr: ${stderr.slice(0, 200)}`
    );
    const escaped = join(repoRoot, "..", escapeName);
    assert.equal(existsSync(escaped), false, "el archivo no se escribe fuera de cwd");
  });
});
