import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  scoreToBadgeColor,
  scoreToBadgeGrade,
  generateBadgeUrl,
  generateBadgeMarkdown,
} from "../src/badge.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, "..");
const cli = path.join(repoRoot, "bin", "cli.js");

function runCli(args, { env = {} } = {}) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

describe("badge — pure functions", () => {
  describe("scoreToBadgeColor", () => {
    it("maps 90–100 to brightgreen", () => {
      assert.strictEqual(scoreToBadgeColor(90), "brightgreen");
      assert.strictEqual(scoreToBadgeColor(100), "brightgreen");
    });

    it("maps 76–89 to green", () => {
      assert.strictEqual(scoreToBadgeColor(76), "green");
      assert.strictEqual(scoreToBadgeColor(89), "green");
    });

    it("maps 61–75 to yellow", () => {
      assert.strictEqual(scoreToBadgeColor(61), "yellow");
      assert.strictEqual(scoreToBadgeColor(75), "yellow");
    });

    it("maps 41–60 to orange", () => {
      assert.strictEqual(scoreToBadgeColor(41), "orange");
      assert.strictEqual(scoreToBadgeColor(60), "orange");
    });

    it("maps 0–40 to red", () => {
      assert.strictEqual(scoreToBadgeColor(0), "red");
      assert.strictEqual(scoreToBadgeColor(40), "red");
    });
  });

  describe("scoreToBadgeGrade", () => {
    it("grades A for 90+", () => assert.strictEqual(scoreToBadgeGrade(95), "A"));
    it("grades B for 76–89", () => assert.strictEqual(scoreToBadgeGrade(80), "B"));
    it("grades C for 61–75", () => assert.strictEqual(scoreToBadgeGrade(70), "C"));
    it("grades D for 41–60", () => assert.strictEqual(scoreToBadgeGrade(50), "D"));
    it("grades F for 0–40", () => assert.strictEqual(scoreToBadgeGrade(30), "F"));
  });

  describe("generateBadgeUrl", () => {
    it("returns a shields.io URL", () => {
      const url = generateBadgeUrl(75);
      assert.ok(url.startsWith("https://img.shields.io/badge/"), `URL: ${url}`);
    });

    it("encodes score and label", () => {
      const url = generateBadgeUrl(75);
      assert.ok(url.includes("75%2F100"), `URL: ${url}`);
      assert.ok(url.includes("GEO_Score"), `URL: ${url}`);
    });

    it("uses correct color for score 75 (yellow)", () => {
      assert.ok(generateBadgeUrl(75).includes("yellow"));
    });

    it("uses correct color for score 80 (green)", () => {
      assert.ok(generateBadgeUrl(80).includes("green"));
    });

    it("uses correct color for score 95 (brightgreen)", () => {
      assert.ok(generateBadgeUrl(95).includes("brightgreen"));
    });

    it("accepts custom label", () => {
      const url = generateBadgeUrl(60, { label: "Site Score" });
      assert.ok(url.includes("Site_Score"), `URL: ${url}`);
    });

    it("accepts flat-square style", () => {
      const url = generateBadgeUrl(60, { style: "flat-square" });
      assert.ok(url.includes("flat-square"), `URL: ${url}`);
    });
  });

  describe("generateBadgeMarkdown", () => {
    it("wraps URL in markdown image syntax", () => {
      const md = generateBadgeMarkdown(75);
      assert.ok(md.startsWith("![GEO Score]("), `MD: ${md}`);
      assert.ok(md.endsWith(")"), `MD: ${md}`);
    });

    it("uses custom alt text when provided", () => {
      const md = generateBadgeMarkdown(75, { alt: "Custom Alt" });
      assert.ok(md.startsWith("![Custom Alt]("), `MD: ${md}`);
    });
  });
});

describe("CLI badge command", () => {
  const fixture = path.join(repoRoot, "tests", "fixtures", "sample.md");

  it("exits 0 and outputs markdown badge", () => {
    const result = runCli(["badge", fixture]);
    assert.strictEqual(result.status, 0, `stderr: ${result.stderr}`);
    assert.ok(result.stdout.startsWith("![GEO Score](https://img.shields.io/badge/"), `stdout: ${result.stdout}`);
  });

  it("--format url outputs bare shields.io URL", () => {
    const result = runCli(["badge", fixture, "--format", "url"]);
    assert.strictEqual(result.status, 0, `stderr: ${result.stderr}`);
    const line = result.stdout.trim();
    assert.ok(line.startsWith("https://img.shields.io/badge/"), `stdout: ${line}`);
    assert.ok(!line.startsWith("!["), `should not include markdown: ${line}`);
  });

  it("--format json outputs JSON with score and badge fields", () => {
    const result = runCli(["badge", fixture, "--format", "json"]);
    assert.strictEqual(result.status, 0, `stderr: ${result.stderr}`);
    let parsed;
    assert.doesNotThrow(() => { parsed = JSON.parse(result.stdout); }, `stdout: ${result.stdout}`);
    assert.ok(typeof parsed.score === "number", "score must be a number");
    assert.ok(typeof parsed.grade === "string", "grade must be a string");
    assert.ok(typeof parsed.badge_url === "string", "badge_url must be a string");
    assert.ok(typeof parsed.badge_markdown === "string", "badge_markdown must be a string");
    assert.ok(parsed.badge_url.startsWith("https://img.shields.io/badge/"), `badge_url: ${parsed.badge_url}`);
  });

  it("--label changes the badge label", () => {
    const result = runCli(["badge", fixture, "--format", "url", "--label", "Site Quality"]);
    assert.strictEqual(result.status, 0, `stderr: ${result.stderr}`);
    assert.ok(result.stdout.includes("Site_Quality"), `stdout: ${result.stdout}`);
  });

  it("rejects invalid --format", () => {
    const result = runCli(["badge", fixture, "--format", "xml"]);
    assert.notStrictEqual(result.status, 0, "should exit non-zero");
    assert.ok(result.stderr.includes("--format"), `stderr: ${result.stderr}`);
  });

  it("exits with error for missing file", () => {
    const result = runCli(["badge", "nonexistent-file.md"]);
    assert.notStrictEqual(result.status, 0, "should exit non-zero");
  });
});
