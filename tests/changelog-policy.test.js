import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const checkerPath = path.join(__dirname, "..", "scripts", "check-changelog.js");

function run(command, args, cwd) {
  return spawnSync(command, args, {
    cwd,
    encoding: "utf8",
  });
}

test("changelog policy rejects code-only changes and accepts documented changes", () => {
  const repository = fs.mkdtempSync(path.join(os.tmpdir(), "geo-opt-changelog-"));

  try {
    fs.mkdirSync(path.join(repository, "scripts"));
    fs.mkdirSync(path.join(repository, "src"));
    fs.copyFileSync(checkerPath, path.join(repository, "scripts", "check-changelog.js"));
    fs.writeFileSync(path.join(repository, "package.json"), '{\n  "type": "module"\n}\n', "utf8");
    fs.writeFileSync(
      path.join(repository, "CHANGELOG.md"),
      "# Changelog\n\n## [Unreleased]\n\n### Added\n\n- Initial entry.\n",
      "utf8"
    );
    fs.writeFileSync(path.join(repository, "src", "example.js"), "export const value = 1;\n");

    assert.strictEqual(run("git", ["init"], repository).status, 0);
    assert.strictEqual(
      run("git", ["config", "user.email", "test@example.com"], repository).status,
      0
    );
    assert.strictEqual(run("git", ["config", "user.name", "Changelog Test"], repository).status, 0);
    assert.strictEqual(run("git", ["add", "."], repository).status, 0);
    assert.strictEqual(run("git", ["commit", "-m", "baseline"], repository).status, 0);

    fs.writeFileSync(path.join(repository, "src", "example.js"), "export const value = 2;\n");
    const rejected = run(process.execPath, ["scripts/check-changelog.js"], repository);
    assert.strictEqual(rejected.status, 1);
    assert.match(rejected.stderr, /code changes require an update to CHANGELOG\.md/);

    fs.appendFileSync(
      path.join(repository, "CHANGELOG.md"),
      "\n- Documented example change.\n",
      "utf8"
    );
    const accepted = run(process.execPath, ["scripts/check-changelog.js"], repository);
    assert.strictEqual(accepted.status, 0, accepted.stderr);
    assert.match(accepted.stdout, /Changelog check passed/);
  } finally {
    fs.rmSync(repository, { recursive: true, force: true });
  }
});
