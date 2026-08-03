import { describe, it } from "node:test";
import assert from "node:assert";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, "..");

const SCRIPT = path.join(repoRoot, "scripts", "check-plan-archive.js");

function runScript(args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

// Governance rule (docs/documentation-governance.md): a plan marked DONE in
// plans/README.md must move to plans/archive/ in the same change. The gate
// script fails any DONE row whose link does not start with archive/.

describe("plans/README.md — DONE plans link to archive/ (governance gate)", () => {
  it("passes against the real plans/README.md (all DONE rows link to archive/)", () => {
    const r = runScript([]);
    assert.strictEqual(r.status, 0, `script should exit 0 on the real README:\n${r.stderr}`);
  });

  it("fails a README whose DONE row links outside archive/ and names the plan", () => {
    const tmp = mkdtempSync(path.join(tmpdir(), "geo-opt-plan-archive-"));
    const fixturePath = path.join(tmp, "README.md");
    writeFileSync(
      fixturePath,
      [
        "| Plan | Title | Status |",
        "|---|---|---|",
        "| [022](022-calibrate-profiled-audit-v2.md) | Calibrate v2 | DONE |",
        "| [075](075-enforce-remote-hop-policy.md) | Hop policy | TODO |",
        "| [091](archive/091-correct-default-model-documentation.md) | Docs | DONE |",
      ].join("\n"),
      "utf8"
    );
    const r = runScript([fixturePath]);
    assert.strictEqual(r.status, 1, "script must exit 1 when a DONE row is not archived");
    assert.match(r.stderr, /022/u, "stderr should name the offending plan number");
    assert.match(r.stderr, /022-calibrate-profiled-audit-v2\.md/u, "stderr should show its link");
  });
});
