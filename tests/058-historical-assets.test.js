import { describe, it } from "node:test";
import assert from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
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

function read(rel) {
  return readFileSync(path.join(launchDir, rel), "utf8");
}

describe("Plan 058 §6.4 — stale campaign assets are quarantined", () => {
  const files = readdirSync(launchDir).filter((f) => f.endsWith(".md"));
  assert.ok(files.length >= 4, `expected ≥4 launch-content files, found ${files.length}`);

  for (const f of files) {
    it(`${f}: starts with a HISTORICAL / NOT APPROVED banner`, () => {
      const text = read(f);
      // Allow the banner to live in the first ~15 lines (after any frontmatter/title)
      const head = text.split("\n").slice(0, 15).join("\n");
      assert.match(
        head,
        /HISTORICAL|NOT APPROVED|not approved for publication|HISTÓRIC[OA]/iu,
        `${f} must declare itself historical/not-approved near the top`
      );
    });

    it(`${f}: does not reference the stale cortega26/GEO-skill.git URL`, () => {
      const text = read(f);
      assert.doesNotMatch(
        text,
        /cortega26\/GEO-skill\.git/u,
        `${f} still references the stale repo URL cortega26/GEO-skill.git`
      );
    });

    it(`${f}: does not carry an actionable live publish date`, () => {
      const text = read(f);
      // Old drafts had hard "Publish: 2026-06-30" / "Publicar: 2026-07-03" lines
      // as actionable schedules. After quarantining, no live publish date should
      // remain in the actionable **Publish:** / **Publicar:** format. A date
      // explicitly labelled historical (e.g. **Fecha histórica**) is allowed.
      assert.doesNotMatch(
        text,
        /\*\*(Publish|Publicar):\*\*\s*2026-0[67]-\d{2}/u,
        `${f} still schedules a live publication in **Publish:**/**Publicar:** format`
      );
    });
  }
});

describe("Plan 058 §6.4 — funnel record acknowledges the quarantine", () => {
  it("plans/business/funnel-and-metrics.md notes launch-content is quarantined", () => {
    const text = readFileSync(
      path.join(repoRoot, "plans", "business", "funnel-and-metrics.md"),
      "utf8"
    );
    assert.match(
      text,
      /launch-content|quarantin|historical/iu,
      "funnel-and-metrics.md should acknowledge the launch-content quarantine"
    );
  });
});
