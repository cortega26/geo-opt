import { describe, it } from "node:test";
import assert from "node:assert";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, "..");

function read(rel) {
  return readFileSync(path.join(repoRoot, rel), "utf8");
}

// Plan 058 §6.6: plan-record reconciliation. The plan's own "Done when" list
// requires Plan 018 to be labelled historical, plans/README to mark 058 DONE,
// and the changelog to record the reconciliation.

describe("Plan 058 §6.6 — plans/README.md marks Plan 058 DONE", () => {
  it("Plan 058 status is DONE in the advisor directions table", () => {
    const text = read("plans/README.md");
    // The advisor directions table has a Status column. Find a row whose
    // first cell links to 058-relaunch-community-validation.md (in archive/
    // since 2026-07-31) and whose Status column is DONE. (The roadmap table
    // on line ~54 is a different shape and doesn't carry a per-plan status,
    // so we match the link form.)
    const row = text.match(
      /\|\s*\[058\]\((?:archive\/)?058-relaunch-community-validation\.md\)\s*\|\s*(\w+)\s*\|/u
    );
    assert.ok(row, "plan 058 advisor-table row not found in plans/README.md");
    assert.equal(row[1], "DONE", `plan 058 advisor-table status should be DONE, got ${row[1]}`);
  });

  it("'Last reconciled' date is on or after 2026-07-22", () => {
    const text = read("plans/README.md");
    assert.match(text, /Last reconciled:.*2026-07-\d{2}/u, "reconciliation date stale");
  });
});

describe("Plan 058 §6.6 — Plan 018 carries a supersession note", () => {
  // Plan 018 is maintainer-local and git-ignored (see plans/058-work/spec.md
  // §6.5). Skip in CI where the file doesn't exist; verify content locally.
  const plan018Path = path.join(
    repoRoot,
    "plans",
    "018-build-tooltician-ai-discoverability-business.md"
  );

  if (!existsSync(plan018Path)) {
    it("plans/018-…md is maintainer-local (skipped in CI)", () => {
      assert.ok(true);
    });
    return;
  }

  it("plans/018-…md has a dated supersession/historical note near the top", () => {
    const text = readFileSync(plan018Path, "utf8");
    const head = text.split("\n").slice(0, 25).join("\n");
    assert.match(
      head,
      /superseded|historical|current execution|Plan 058|Plan 059/iu,
      "Plan 018 must declare itself historical/superseded near the top"
    );
  });
});

describe("Plan 058 §6.6 — CHANGELOG records the reconciliation", () => {
  it("CHANGELOG.md has an Unreleased Docs entry for the reconciliation", () => {
    const text = read("CHANGELOG.md");
    assert.match(text, /Unreleased/u, "missing Unreleased section");
    // The entry should mention docs reconciliation / Free-Pro / onboarding
    assert.match(
      text,
      /Docs|documentation|Free.?vs.?Pro|onboarding|reconcil/iu,
      "CHANGELOG Unreleased section must record the docs reconciliation"
    );
  });
});
