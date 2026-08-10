/**
 * Tests for src/renderer.js — plain-English summary wording.
 *
 * Verify (plan 085, step 1): plain-English summaries describe observed style
 * markers and never promise ranking, discovery, readiness, or citation
 * outcomes.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { plainEnglishSummary } from "../src/renderer.js";

describe("Plan 085 — plain-English summaries describe observed markers", () => {
  // Same banned-outcome phrasing as the scoring-v2 band invariants: the
  // heuristic measures style markers, not engine outcomes (AGENTS.md
  // truthfulness warning, audit F-06).
  const PREDICTIVE = new RegExp(
    [
      "production[- ]?ready",
      "unlikely to cite",
      "likelihood of being cited",
      "reliably discovered",
      "well-optimized for ai",
      "ai-discoverable",
      "decent ai discoverability",
    ].join("|"),
    "i"
  );

  function report(score, readinessBand) {
    return {
      effectiveScore: score,
      readinessBand,
      profile: { label: "documentation" },
      dimensions: {
        structure: { applicable: true, score: 20 },
        statistics: { applicable: false, score: 0 },
        quotations: { applicable: false, score: 0 },
        citations: { applicable: true, score: 20 },
        clarity: { applicable: true, score: 20 },
      },
    };
  }

  it("high/mid/low branches never promise discovery or citation outcomes", () => {
    const cases = [
      [90, "production-ready"],
      [60, "needs-work"],
      [30, "at-risk"],
    ];
    for (const [score, band] of cases) {
      const lines = plainEnglishSummary(report(score, band)).join(" ");
      assert.doesNotMatch(lines, PREDICTIVE, `band ${band} (${score}): ${lines}`);
    }
  });
});
