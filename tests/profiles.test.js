/**
 * Tests for src/profiles.js — profile definitions, applicability, and auto-detection.
 *
 * Verify (plan 022, step 2):
 *  - Quotations are not required for API docs.
 *  - Commerce-only fields do not affect editorial content.
 *  - Auto-detection reports confidence and accepts overrides.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";

import {
  PROFILES,
  VALID_PROFILES,
  ALL_DIMENSIONS,
  isApplicable,
  notApplicableDimensions,
  scoreCeiling,
  detectProfile,
  resolveProfile,
} from "../src/profiles.js";

// ═══════════════════════════════════════════════════════════════════════════
// Profile definitions
// ═══════════════════════════════════════════════════════════════════════════

describe("PROFILES", () => {
  it("defines all 6 non-auto profiles", () => {
    assert.equal(VALID_PROFILES.length, 6);
    assert.deepEqual(VALID_PROFILES, [
      "documentation",
      "open-source",
      "editorial",
      "commercial",
      "ecommerce",
      "regulated",
    ]);
  });

  it("every profile has id, label, description, and applicableDimensions", () => {
    for (const [key, def] of Object.entries(PROFILES)) {
      assert.equal(def.id, key, `${key}: id mismatch`);
      assert.ok(typeof def.label === "string" && def.label.length > 0, `${key}: missing label`);
      assert.ok(typeof def.description === "string" && def.description.length > 0, `${key}: missing description`);
      assert.ok(Array.isArray(def.applicableDimensions), `${key}: applicableDimensions not array`);
      assert.ok(def.applicableDimensions.length >= 1, `${key}: at least one dimension must be applicable`);
      for (const dim of def.applicableDimensions) {
        assert.ok(ALL_DIMENSIONS.includes(dim), `${key}: unknown dimension "${dim}"`);
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Applicability matrix
// ═══════════════════════════════════════════════════════════════════════════

describe("isApplicable", () => {
  it("quotations are NOT applicable for documentation", () => {
    assert.equal(isApplicable("documentation", "quotations"), false);
  });

  it("quotations are NOT applicable for open-source", () => {
    assert.equal(isApplicable("open-source", "quotations"), false);
  });

  it("quotations are NOT applicable for commercial", () => {
    assert.equal(isApplicable("commercial", "quotations"), false);
  });

  it("quotations are NOT applicable for regulated", () => {
    assert.equal(isApplicable("regulated", "quotations"), false);
  });

  it("quotations ARE applicable for editorial", () => {
    assert.equal(isApplicable("editorial", "quotations"), true);
  });

  it("quotations ARE applicable for ecommerce (customer reviews)", () => {
    assert.equal(isApplicable("ecommerce", "quotations"), true);
  });

  it("statistics are NOT applicable for documentation", () => {
    assert.equal(isApplicable("documentation", "statistics"), false);
  });

  it("statistics are NOT applicable for open-source", () => {
    assert.equal(isApplicable("open-source", "statistics"), false);
  });

  it("statistics ARE applicable for editorial", () => {
    assert.equal(isApplicable("editorial", "statistics"), true);
  });

  it("statistics ARE applicable for regulated", () => {
    assert.equal(isApplicable("regulated", "statistics"), true);
  });

  it("structure and clarity are applicable for all profiles", () => {
    for (const profile of VALID_PROFILES) {
      assert.ok(isApplicable(profile, "structure"), `${profile}: structure must be applicable`);
      assert.ok(isApplicable(profile, "clarity"), `${profile}: clarity must be applicable`);
    }
  });

  it("citations are applicable for all profiles", () => {
    for (const profile of VALID_PROFILES) {
      assert.ok(isApplicable(profile, "citations"), `${profile}: citations must be applicable`);
    }
  });

  it("returns true for unknown profiles (fail-open)", () => {
    assert.equal(isApplicable("nonexistent", "quotations"), true);
  });
});

describe("notApplicableDimensions", () => {
  it("documentation: quotations and statistics are not applicable", () => {
    const na = notApplicableDimensions("documentation");
    assert.deepEqual(na.sort(), ["quotations", "statistics"]);
  });

  it("editorial: all dimensions applicable (none not-applicable)", () => {
    const na = notApplicableDimensions("editorial");
    assert.deepEqual(na, []);
  });

  it("commercial: quotations not applicable", () => {
    const na = notApplicableDimensions("commercial");
    assert.deepEqual(na, ["quotations"]);
  });

  it("regulated: quotations not applicable", () => {
    const na = notApplicableDimensions("regulated");
    assert.deepEqual(na, ["quotations"]);
  });
});

describe("scoreCeiling", () => {
  it("documentation: max 60 (3 dimensions × 20)", () => {
    const { totalMax, dimMax } = scoreCeiling("documentation");
    assert.equal(totalMax, 60);
    assert.equal(dimMax.structure, 20);
    assert.equal(dimMax.clarity, 20);
    assert.equal(dimMax.citations, 20);
    assert.equal(dimMax.statistics, 0);
    assert.equal(dimMax.quotations, 0);
  });

  it("editorial: max 100 (5 dimensions × 20)", () => {
    const { totalMax, dimMax } = scoreCeiling("editorial");
    assert.equal(totalMax, 100);
    for (const dim of ALL_DIMENSIONS) {
      assert.equal(dimMax[dim], 20, `${dim} should be 20 for editorial`);
    }
  });

  it("commercial: max 80 (4 dimensions × 20)", () => {
    const { totalMax } = scoreCeiling("commercial");
    assert.equal(totalMax, 80);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Auto-detection
// ═══════════════════════════════════════════════════════════════════════════

describe("detectProfile", () => {
  it("detects documentation from API reference content", () => {
    const apiRef = `# API Reference\n\nBase URL: https://api.example.com\n\n## Authentication\n\n\`\`\`\nAuthorization: Bearer TOKEN\n\`\`\`\n\n## Endpoints\n\n### GET /users\n\nResponse body:\n\n| Field | Type |\n|-------|------|\n| id    | string |\n\nRate limit: 100 req/h`;
    const result = detectProfile(apiRef, "api-reference.md");
    assert.equal(result.profile, "documentation");
    assert.ok(result.confidence >= 0.7, `confidence ${result.confidence} should be >= 0.7`);
  });

  it("detects open-source from README with badges and npm install", () => {
    const readme = `# Project\n\n[![CI](https://example.com/badge.svg)](https://example.com)\n\n## Quickstart\n\n\`\`\`bash\nnpm install my-pkg\n\`\`\`\n\n## Contributing\n\nSee CONTRIBUTING.md.\n\n## License\n\nMIT`;
    const result = detectProfile(readme, "README.md");
    assert.equal(result.profile, "open-source");
    assert.ok(result.confidence >= 0.5);
  });

  it("detects editorial from blog content with attributed quotes and sources", () => {
    const blog = `# How AI Is Changing Search\n\nSearch is evolving rapidly. According to a KDD 2024 study, optimized content appeared 40% more often.\n\n> "The biggest mistake is writing for humans already on your site." — Dr. Chen\n\n## Sources\n\n- [KDD 2024 Paper](https://arxiv.org)`;
    const result = detectProfile(blog, "blog.md");
    assert.equal(result.profile, "editorial");
  });

  it("detects commercial from landing page with pricing table", () => {
    const landing = `# GeoOpt\n\nStart free — no credit card required.\n\n## Pricing\n\n| Plan | Price |\n|------|-------|\n| Free | $0 |\n| Pro  | $29/mo |\n\nTrusted by Stripe, Vercel, Datadog.`;
    const result = detectProfile(landing, "index.md");
    assert.equal(result.profile, "commercial");
    assert.ok(result.confidence >= 0.7);
  });

  it("detects ecommerce from product page with price and reviews", () => {
    const product = `# Ergonomic Chair\n\n**Price:** $749.00\n\n## Customer reviews\n\n> "Best chair ever" — Verified purchase\n\n## Specifications\n\n| Spec | Detail |\n|------|--------|\n| Weight capacity | 300 lbs |\n\nFree shipping. Add to cart.`;
    const result = detectProfile(product, "product.md");
    assert.equal(result.profile, "ecommerce");
    assert.ok(result.confidence >= 0.7);
  });

  it("detects regulated from privacy policy", () => {
    const privacy = `# Privacy Policy\n\n**Effective date:** January 1, 2026\n\n## Data retention\n\n| Category | Retention period |\n|----------|-----------------|\n| Account  | Duration + 30 days |\n\n## Your rights\n\nUnder GDPR Article 12, we respond within 30 days.\n\n**Data Protection Officer**\nprivacy@example.com`;
    const result = detectProfile(privacy, "privacy.md");
    assert.equal(result.profile, "regulated");
    assert.ok(result.confidence >= 0.8);
  });

  it("detects regulated from financial disclosure", () => {
    const fin = `# Quarterly Earnings Report\n\n## Forward-looking statements\n\nThis report contains forward-looking statements within the meaning of Section 27A of the Securities Act.\n\n## Financial highlights\n\n| Metric | Q1 2026 | Q1 2025 |\n|--------|---------|--------|\n| Revenue | $847M | $712M |`;
    const result = detectProfile(fin, "earnings.md");
    assert.equal(result.profile, "regulated");
    assert.ok(result.confidence >= 0.7);
  });

  it("defaults to editorial with low confidence when no signals match", () => {
    const result = detectProfile("Just a simple paragraph with no special signals.", "note.md");
    assert.equal(result.profile, "editorial");
    assert.ok(result.confidence <= 0.5, `confidence ${result.confidence} should be low`);
  });

  it("returns reasons array explaining the detection", () => {
    const result = detectProfile("# API Reference\n\n```\nGET /users\n```\n\nBase URL: https://api.example.com\n\nRate limit: 100 req/h\n\nAuthorization: Bearer TOKEN", "api.md");
    assert.ok(result.reasons.length >= 1);
    assert.ok(result.reasons[0].includes("documentation"));
  });

  it("detects documentation from content with many code blocks", () => {
    const content = "# CLI Reference\n\n```bash\nnpm install\n```\n\n```bash\nnpm test\n```\n\n```bash\nnpm run build\n```\n\n## Endpoints\n\n### POST /analyze\n\n| Field | Type |\n|-------|------|\n| content | string |";
    const result = detectProfile(content, "cli.md");
    assert.equal(result.profile, "documentation");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Config-aware resolution
// ═══════════════════════════════════════════════════════════════════════════

describe("resolveProfile", () => {
  it("uses explicit override when set to a valid profile", () => {
    const result = resolveProfile(
      { profile: "documentation" },
      "Some generic text.",
      "file.md"
    );
    assert.equal(result.profile, "documentation");
    assert.equal(result.confidence, 1.0);
    assert.equal(result.overridden, true);
  });

  it("detects when config.profile is 'auto'", () => {
    const result = resolveProfile(
      { profile: "auto" },
      "# API Reference\n\n```\nGET /users\n```\n\nBase URL: https://api.example.com\n\n## Authentication\n\n### Endpoints",
      "api.md"
    );
    assert.equal(result.profile, "documentation");
    assert.equal(result.overridden, false);
    assert.ok(result.confidence < 1.0);
  });

  it("detects when config has no profile key", () => {
    const result = resolveProfile(
      {},
      "# Privacy Policy\n\n**Effective date:** 2026\n\n## Data retention\n\n## Your rights\n\nGDPR Article 12\n\nStandard Contractual Clauses\n\n**Data Protection Officer**",
      "privacy.md"
    );
    assert.equal(result.profile, "regulated");
    assert.equal(result.overridden, false);
  });

  it("falls back to detection when override profile is invalid", () => {
    const result = resolveProfile(
      { profile: "nonexistent" },
      "# API Reference\n\n```\nGET /users\n```\n\nBase URL: https://api.example.com\n\n## Authentication\n\n### Endpoints",
      "api.md"
    );
    assert.equal(result.profile, "documentation");
    assert.equal(result.overridden, false);
  });

  it("ignores 'auto' and auto-detects", () => {
    const result = resolveProfile(
      { profile: "auto" },
      "Just some plain text.",
      "note.md"
    );
    assert.equal(result.profile, "editorial");
    assert.equal(result.overridden, false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Fixture-driven profile detection
// ═══════════════════════════════════════════════════════════════════════════

describe("detectProfile on fixtures", () => {
  it("correctly detects profile for all documentation fixtures", () => {
    const fixtures = [
      "api-reference",
      "sdk-readme",
      "cli-reference",
      "config-schema",
      "rest-endpoints",
    ];
    for (const name of fixtures) {
      const content = readFileSync(
        `tests/fixtures/audit-v2/documentation/${name}.md`,
        "utf8"
      );
      const result = detectProfile(content, `${name}.md`);
      // Documentation or open-source are both acceptable for these
      assert.ok(
        result.profile === "documentation" || result.profile === "open-source",
        `${name}: expected documentation or open-source, got ${result.profile}`
      );
    }
  });

  it("detects adversarial fake-stats as commercial or editorial (adversarial content may lack clear commercial patterns)", () => {
    const content = readFileSync(
      "tests/fixtures/audit-v2/adversarial/fake-stats.md",
      "utf8"
    );
    const result = detectProfile(content, "fake-stats.md");
    // Adversarial content with fake stats and quotes will likely fall
    // to editorial if it lacks pricing/trial/case-study signals.
    // Either detection is acceptable — correctness is tested by v2 scoring.
    assert.ok(
      result.profile === "commercial" || result.profile === "editorial",
      `fake-stats profile: ${result.profile}`
    );
  });

  it("detects excellent-tech-doc-no-quotes as documentation", () => {
    const content = readFileSync(
      "tests/fixtures/audit-v2/adversarial/excellent-tech-doc-no-quotes.md",
      "utf8"
    );
    const result = detectProfile(content, "pg17.md");
    assert.equal(
      result.profile,
      "documentation",
      "excellent tech doc MUST be detected as documentation so it isn't penalized for lacking quotes"
    );
  });
});
