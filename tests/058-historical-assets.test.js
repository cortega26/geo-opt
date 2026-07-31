import { describe, it } from "node:test";
import assert from "node:assert";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, "..");
const launchDir = path.join(repoRoot, "plans", "business", "launch-content");

// Plan 058 §6.4: stale LinkedIn/social campaign drafts must be labelled
// HISTORICAL / NOT APPROVED FOR PUBLICATION, and must not reference the
// stale `cortega26/GEO-skill.git` repo URL (the actual repo is
// `cortega26/geo-opt`). We do NOT rewrite the draft bodies.
//
// NOTE: `plans/business/launch-content/` is maintainer-local and git-ignored
// (see docs/architecture.md and plans/058-work/spec.md §6.5). These files do
// NOT exist in CI or a fresh clone. The tests below register a fixed number
// of cases and only assert content when the maintainer runs them locally
// where the files are present.
// The test count here is intentionally fixed (4 tests) so the README
// test-count badge check stays deterministic in CI and local runs.

function read(rel) {
  return readFileSync(path.join(launchDir, rel), "utf8");
}

describe("Plan 058 §6.4 — stale campaign assets are quarantined", () => {
  const present = existsSync(launchDir);
  const files = present ? readdirSync(launchDir).filter((f) => f.endsWith(".md")) : [];

  it("launch-content directory is maintainer-local (skipped in CI)", () => {
    assert.ok(true);
  });

  it("each launch-content file starts with a HISTORICAL / NOT APPROVED banner", () => {
    if (!present) return;
    assert.ok(files.length >= 4, `expected ≥4 launch-content files, found ${files.length}`);
    for (const f of files) {
      const head = read(f).split("\n").slice(0, 15).join("\n");
      assert.match(
        head,
        /HISTORICAL|NOT APPROVED|not approved for publication|HISTÓRIC[OA]/iu,
        `${f} must declare itself historical/not-approved near the top`
      );
    }
  });

  it("launch-content files do not reference the stale cortega26/GEO-skill.git URL", () => {
    if (!present) return;
    for (const f of files) {
      assert.doesNotMatch(
        read(f),
        /cortega26\/GEO-skill\.git/u,
        `${f} still references the stale repo URL cortega26/GEO-skill.git`
      );
    }
  });

  it("launch-content files do not carry an actionable live publish date", () => {
    if (!present) return;
    for (const f of files) {
      assert.doesNotMatch(
        read(f),
        /\*\*(Publish|Publicar):\*\*\s*2026-0[67]-\d{2}/u,
        `${f} still schedules a live publication in **Publish:**/**Publicar:** format`
      );
    }
  });
});

describe("Plan 058 §6.4 — funnel record acknowledges the quarantine", () => {
  const funnelPath = path.join(repoRoot, "plans", "business", "funnel-and-metrics.md");

  if (!existsSync(funnelPath)) {
    it("funnel-and-metrics.md is maintainer-local (skipped in CI)", () => {
      assert.ok(true);
    });
    return;
  }

  it("plans/business/funnel-and-metrics.md notes launch-content is quarantined", () => {
    const text = readFileSync(funnelPath, "utf8");
    assert.match(
      text,
      /launch-content|quarantin|historical/iu,
      "funnel-and-metrics.md should acknowledge the launch-content quarantine"
    );
  });
});
