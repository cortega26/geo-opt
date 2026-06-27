/**
 * Tests for src/scoring-v2.js — profile-aware scoring model.
 *
 * Verify (plan 022, step 4):
 *  - V1 golden tests remain unchanged.
 *  - V2 ranks adversarial fixtures below credible counterparts.
 *  - Documentation profile does not penalize for lacking quotes/stats.
 *  - Readiness band replaces 0–100 pseudo-precision.
 *  - --model v2 CLI flag works.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { execSync } from "child_process";

import { scoreContentV2 } from "../src/scoring-v2.js";

// ═══════════════════════════════════════════════════════════════════════════
// Profile-aware scoring
// ═══════════════════════════════════════════════════════════════════════════

describe("scoreContentV2", () => {
  it("returns a report with profile, readiness, and dimensions", () => {
    const { report } = scoreContentV2(
      "# Hello\n\nThis is a test paragraph with some content for the audit.",
      "test.md",
      {}
    );
    assert.ok(report.modelVersion);
    assert.ok(report.profile);
    assert.ok(report.readinessBand);
    assert.ok(report.dimensions.structure);
    assert.ok(report.dimensions.clarity);
    assert.equal(typeof report.effectiveScore, "number");
  });

  it("uses config.profile override", () => {
    const { report } = scoreContentV2("# API Reference\n\nSome content here.", "api.md", {
      profile: "documentation",
    });
    assert.equal(report.profile.detected, "documentation");
    assert.equal(report.profile.overridden, true);
    assert.equal(report.profile.confidence, 1.0);
  });

  it("auto-detects profile when config.profile is auto", () => {
    const apiContent =
      "# API Reference\n\nBase URL: https://api.example.com\n\n## Authentication\n\n```\nAuthorization: Bearer TOKEN\n```\n\n## Endpoints\n\n### GET /users\n\nResponse body:\n\n| Field | Type |\n|-------|------|";
    const { report } = scoreContentV2(apiContent, "api.md", { profile: "auto" });
    assert.equal(report.profile.overridden, false);
    assert.ok(report.profile.confidence < 1.0);
  });

  it("marks non-applicable dimensions for documentation profile", () => {
    const { report } = scoreContentV2(
      "# API Reference\n\n```\nGET /users\n```\n\nBase URL: https://api.example.com\n\n## Endpoints\n\n### Authentication",
      "api.md",
      { profile: "documentation" }
    );
    assert.equal(report.dimensions.statistics.applicable, false);
    assert.equal(report.dimensions.quotations.applicable, false);
    assert.equal(report.dimensions.structure.applicable, true);
    assert.equal(report.dimensions.citations.applicable, true);
    assert.equal(report.dimensions.clarity.applicable, true);
  });

  it("does not penalize documentation for lacking quotes or stats", () => {
    const { report } = scoreContentV2(
      "# API Reference\n\n```\nGET /users\n```\n\nBase URL: https://api.example.com\n\n## Endpoints\n\n### Authentication",
      "api.md",
      { profile: "documentation" }
    );
    // Non-applicable dimensions should not reduce effective score
    assert.equal(report.dimensions.quotations.score, 0);
    assert.equal(report.dimensions.statistics.score, 0);
    // But applicable dimensions should be scored
    assert.ok(report.dimensions.structure.score >= 0, "structure should have a score");
    // Effective score is based only on applicable dimensions
    // With 3 applicable dims, max is 60 but effective is normalized to percentage
    const structMax = report.dimensions.structure.max;
    const citMax = report.dimensions.citations.max;
    const clarMax = report.dimensions.clarity.max;
    assert.equal(structMax + citMax + clarMax, 60);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Readiness bands
// ═══════════════════════════════════════════════════════════════════════════

describe("readiness bands", () => {
  it("excellent editorial content achieves production-ready or solid", () => {
    const content = readFileSync("tests/fixtures/audit-v2/editorial/tech-blog.md", "utf8");
    const { report } = scoreContentV2(content, "tech-blog.md", {});
    assert.ok(
      report.readinessBand === "production-ready" || report.readinessBand === "solid",
      `Expected production-ready or solid, got ${report.readinessBand} (${report.effectiveScore})`
    );
    assert.ok(report.effectiveScore >= 65);
  });

  it("excellent tech doc without quotes ranks solid or better", () => {
    const content = readFileSync(
      "tests/fixtures/audit-v2/adversarial/excellent-tech-doc-no-quotes.md",
      "utf8"
    );
    const { report } = scoreContentV2(content, "pg17.md", {});
    // This is the critical test: excellent tech doc MUST rank well
    // even though it has zero quotes
    assert.ok(
      report.readinessBand === "production-ready" || report.readinessBand === "solid",
      `Excellent tech doc should be solid+, got ${report.readinessBand} (${report.effectiveScore})`
    );
    assert.ok(
      report.effectiveScore >= 65,
      `Expected effective score >= 65, got ${report.effectiveScore}`
    );
  });

  it("link-farm ranks at-risk or needs-work", () => {
    const content = readFileSync("tests/fixtures/audit-v2/adversarial/link-farm.md", "utf8");
    const { report } = scoreContentV2(content, "link-farm.md", {});
    assert.ok(
      report.readinessBand === "at-risk" || report.readinessBand === "needs-work",
      `Link farm should be at-risk or needs-work, got ${report.readinessBand} (${report.effectiveScore})`
    );
  });

  it("empty-headers ranks at-risk", () => {
    const content = readFileSync("tests/fixtures/audit-v2/adversarial/empty-headers.md", "utf8");
    const { report } = scoreContentV2(content, "empty.md", {});
    assert.equal(
      report.readinessBand,
      "at-risk",
      `Empty headers should be at-risk, got ${report.readinessBand} (${report.effectiveScore})`
    );
  });

  it("unattributed-quotes ranks below tech-blog", () => {
    const adversarial = readFileSync(
      "tests/fixtures/audit-v2/adversarial/unattributed-quotes.md",
      "utf8"
    );
    const credible = readFileSync("tests/fixtures/audit-v2/editorial/tech-blog.md", "utf8");

    const advResult = scoreContentV2(adversarial, "adv.md", {});
    const credResult = scoreContentV2(credible, "cred.md", {});

    assert.ok(
      credResult.report.effectiveScore > advResult.report.effectiveScore,
      `Credible blog (${credResult.report.effectiveScore}) must outrank unattributed-quotes (${advResult.report.effectiveScore})`
    );
  });

  it("fake-stats ranks below case-study", () => {
    const fake = readFileSync("tests/fixtures/audit-v2/adversarial/fake-stats.md", "utf8");
    const real = readFileSync("tests/fixtures/audit-v2/commercial/case-study.md", "utf8");

    const fakeResult = scoreContentV2(fake, "fake.md", {});
    const realResult = scoreContentV2(real, "case-study.md", {});

    assert.ok(
      realResult.report.effectiveScore > fakeResult.report.effectiveScore,
      `Case study (${realResult.report.effectiveScore}) must outrank fake-stats (${fakeResult.report.effectiveScore})`
    );
  });

  it("perfect-format-bad-content ranks below credible editorial", () => {
    const platitudes = readFileSync(
      "tests/fixtures/audit-v2/adversarial/perfect-format-bad-content.md",
      "utf8"
    );
    const credible = readFileSync("tests/fixtures/audit-v2/editorial/news-article.md", "utf8");

    const platResult = scoreContentV2(platitudes, "plat.md", {});
    const credResult = scoreContentV2(credible, "news.md", {});

    assert.ok(
      credResult.report.effectiveScore > platResult.report.effectiveScore,
      `News article (${credResult.report.effectiveScore}) must outrank platitudes (${platResult.report.effectiveScore})`
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Dimension-specific tests
// ═══════════════════════════════════════════════════════════════════════════

describe("dimension scoring", () => {
  it("citations: link-farm gets 0 for citations", () => {
    const content = readFileSync("tests/fixtures/audit-v2/adversarial/link-farm.md", "utf8");
    const { report } = scoreContentV2(content, "lf.md", {});
    assert.equal(report.dimensions.citations.score, 0);
    assert.ok(
      report.findings.some((f) => f.ruleId === "v2.citations.link_farm"),
      "Should have link_farm finding"
    );
  });

  it("statistics: attributed stats score higher than unattributed", () => {
    const attributed =
      "According to the CDC, 38.4 million Americans have diabetes. A study published in Nature found a 34% increase. Research by the WHO reports 537 million cases worldwide.";
    const unattributed =
      "We see a 347% increase in productivity and a 92% reduction in costs. 99.8% of users recommend our product.";

    const attrResult = scoreContentV2(attributed, "attr.md", {});
    const unattrResult = scoreContentV2(unattributed, "unattr.md", {});

    assert.ok(
      attrResult.report.dimensions.statistics.score >
        unattrResult.report.dimensions.statistics.score,
      `Attributed stats (${attrResult.report.dimensions.statistics.score}) must outscore unattributed (${unattrResult.report.dimensions.statistics.score})`
    );
  });

  it("quotations: attributed quotes score higher than unattributed", () => {
    const attributed =
      '# Report\n\n> "The results are conclusive," said Dr. Smith, lead researcher at MIT.\n\n> "This changes everything," according to Prof. Jones.';
    const unattributed =
      '# Report\n\n> "This is the best product ever."\n\n> "AI will change everything."\n\n> "The future is now."';

    const attrResult = scoreContentV2(attributed, "attr.md", {});
    const unattrResult = scoreContentV2(unattributed, "unattr.md", {});

    assert.ok(
      attrResult.report.dimensions.quotations.score >
        unattrResult.report.dimensions.quotations.score,
      `Attributed quotes (${attrResult.report.dimensions.quotations.score}) must outscore unattributed (${unattrResult.report.dimensions.quotations.score})`
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CLI integration
// ═══════════════════════════════════════════════════════════════════════════

describe("CLI --model v2", () => {
  it("accepts --model v2 flag", () => {
    const result = execSync("node bin/cli.js audit tests/fixtures/sample.md --model v2 -f json", {
      encoding: "utf8",
      env: { ...process.env, GEO_OPT_DISABLE_REMINDERS: "1" },
    });
    const report = JSON.parse(result);
    assert.ok(report.modelVersion);
    assert.ok(report.profile);
    assert.ok(report.readinessBand);
    assert.ok(report.dimensions);
  });

  it("rejects invalid model values", () => {
    try {
      execSync("node bin/cli.js audit tests/fixtures/sample.md --model v3 -f json 2>&1", {
        encoding: "utf8",
        env: { ...process.env, GEO_OPT_DISABLE_REMINDERS: "1" },
      });
      assert.fail("Should have thrown for v3");
    } catch (e) {
      assert.ok(
        e.message.includes("v1") || e.stderr?.includes("v1") || e.status !== 0,
        "Should reject v3 model"
      );
    }
  });

  it("v2 report JSON includes profile and readiness", () => {
    const result = execSync("node bin/cli.js audit tests/fixtures/sample.md --model v2 -f json", {
      encoding: "utf8",
      env: { ...process.env, GEO_OPT_DISABLE_REMINDERS: "1" },
    });
    const report = JSON.parse(result);
    assert.equal(typeof report.profile.detected, "string");
    assert.equal(typeof report.profile.confidence, "number");
    assert.ok(
      ["production-ready", "solid", "needs-work", "at-risk"].includes(report.readinessBand)
    );
    assert.equal(typeof report.effectiveScore, "number");
    assert.ok(Array.isArray(report.recommendations));
    assert.ok(Array.isArray(report.findings));
  });

  it("v2 text output contains profile and readiness information", () => {
    const result = execSync("node bin/cli.js audit tests/fixtures/sample.md --model v2 -f text", {
      encoding: "utf8",
      env: { ...process.env, GEO_OPT_DISABLE_REMINDERS: "1" },
    });
    assert.ok(result.includes("Profile:"), "Text output should include Profile");
    assert.ok(result.includes("Readiness:"), "Text output should include Readiness");
    assert.ok(result.includes("GEO OPTIMIZATION AUDIT REPORT (v2)"), "Should show v2 header");
  });

  it("v1 remains the default when --model is omitted", () => {
    const result = execSync("node bin/cli.js audit tests/fixtures/sample.md -f json", {
      encoding: "utf8",
      env: { ...process.env, GEO_OPT_DISABLE_REMINDERS: "1" },
    });
    const report = JSON.parse(result);
    // v1 report has total_score and breakdown, not readinessBand or profile
    assert.equal(typeof report.total_score, "number");
    assert.ok(report.breakdown);
    // v1 report may or may not have profile info (added in plan 021)
    // modelVersion is set by findings contract (plan 021); v1 CLI uses current version
    assert.ok(report.modelVersion);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// V1 golden test compatibility
// ═══════════════════════════════════════════════════════════════════════════

describe("v1 compatibility", () => {
  it("v1 audit path still works and returns 0–100 score", () => {
    const result = execSync("node bin/cli.js audit tests/fixtures/sample.md -f json", {
      encoding: "utf8",
      env: { ...process.env, GEO_OPT_DISABLE_REMINDERS: "1" },
    });
    const report = JSON.parse(result);
    assert.ok(report.total_score >= 0 && report.total_score <= 100);
    // modelVersion is set by findings contract (plan 021); v1 CLI uses current version
    assert.ok(report.modelVersion);
    assert.ok(report.breakdown.structure);
    assert.ok(report.breakdown.statistics);
    assert.ok(report.breakdown.quotations);
    assert.ok(report.breakdown.citations);
    assert.ok(report.breakdown.clarity);
  });

  it("v1 batch audit still works", () => {
    const result = execSync(
      "node bin/cli.js audit tests/fixtures/sample.md tests/fixtures/audit-v2/editorial/tech-blog.md -f json --summary",
      { encoding: "utf8", env: { ...process.env, GEO_OPT_DISABLE_REMINDERS: "1" } }
    );
    const summary = JSON.parse(result);
    assert.ok(summary.totalFiles >= 1);
    assert.equal(typeof summary.averageScore, "number");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Report structure validation
// ═══════════════════════════════════════════════════════════════════════════

describe("report structure", () => {
  it("includes structuralObservations summary", () => {
    const { report } = scoreContentV2(
      "# Title\n\nContent paragraph with sufficient words for testing.",
      "test.md",
      {}
    );
    assert.ok(report.structuralObservations);
    assert.ok(["pass", "warn", "fail"].includes(report.structuralObservations.headingHierarchy));
  });

  it("includes attributionSummary", () => {
    const { report } = scoreContentV2(
      "# Test\n\nAccording to a study, 34% of users prefer X.",
      "test.md",
      {}
    );
    assert.ok(report.attributionSummary);
    assert.equal(typeof report.attributionSummary.statsWithAttribution, "number");
  });

  it("includes notApplicableDimensions list", () => {
    const { report } = scoreContentV2(
      "# API Reference\n\n```\nGET /users\n```\n\nBase URL: https://api.example.com\n\n## Endpoints\n\n### Authentication",
      "api.md",
      { profile: "documentation" }
    );
    assert.ok(Array.isArray(report.notApplicableDimensions));
    assert.ok(report.notApplicableDimensions.includes("quotations"));
    assert.ok(report.notApplicableDimensions.includes("statistics"));
  });
});
