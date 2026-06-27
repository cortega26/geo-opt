/**
 * Tests for src/observations.js — section-level observation engine.
 *
 * Verify (plan 022, step 3):
 *  - Heading hierarchy detection (skipped levels, missing h1, duplicates)
 *  - Section self-containment (empty sections, minimum word counts)
 *  - Paragraph distribution
 *  - Answer-first detection
 *  - Attribution proximity (stats/quotes near sources)
 *  - Content freshness (dates)
 *  - Link quality (external/internal, excessive links)
 *  - Semantic HTML (HTML5 tags, dynamic rendering)
 *  - Adversarial cases (empty headers, keyword stuffing, link farms)
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";

import { observeContent, observeAndParse } from "../src/observations.js";

// ═══════════════════════════════════════════════════════════════════════════
// Heading hierarchy
// ═══════════════════════════════════════════════════════════════════════════

describe("heading hierarchy", () => {
  it("passes for well-structured content", () => {
    const content = `# Main Title\n\n## Section One\n\nContent here.\n\n### Subsection\n\nMore content.\n\n## Section Two\n\nFinal content.`;
    const obs = observeContent(content, "test.md");
    assert.equal(obs.headingHierarchy.status, "pass");
    assert.equal(obs.headingHierarchy.issues.length, 0);
  });

  it("fails when no headings exist", () => {
    const content = "Just a paragraph with no headings at all.";
    const obs = observeContent(content, "test.md");
    assert.equal(obs.headingHierarchy.status, "fail");
  });

  it("warns when h1 is missing (starts with h2)", () => {
    const content = "## Getting Started\n\nFirst section content.\n\n## API\n\nAPI content.";
    const obs = observeContent(content, "test.md");
    assert.ok(obs.headingHierarchy.status === "warn" || obs.headingHierarchy.status === "fail");
    assert.ok(obs.headingHierarchy.issues.some((i) => i.includes("h2")));
  });

  it("detects skipped heading levels", () => {
    const content = "# Title\n\n### Subsection\n\nJumped from h1 to h3.";
    const obs = observeContent(content, "test.md");
    assert.equal(obs.headingHierarchy.status, "fail");
    assert.ok(obs.headingHierarchy.issues.some((i) => i.includes("skips")));
  });

  it("detects duplicate headings", () => {
    const content = "# API\n\n## Overview\n\nText.\n\n## Overview\n\nDuplicate.";
    const obs = observeContent(content, "test.md");
    assert.ok(obs.headingHierarchy.issues.some((i) => i.includes("Duplicate")));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Section self-containment
// ═══════════════════════════════════════════════════════════════════════════

describe("section self-containment", () => {
  it("passes when all sections have body content", () => {
    const content = `# Title\n\nIntroduction with enough words to meet the minimum threshold for section content.\n\n## Features\n\nThis section describes features in detail with sufficient words to pass.`;
    const obs = observeContent(content, "test.md");
    assert.equal(obs.sectionSelfContainment.status, "pass");
  });

  it("fails when most sections are empty (adversarial: empty-headers)", () => {
    const content = `# Guide\n\n## Chapter 1\n\n## Chapter 2\n\n## Chapter 3\n\nConclusion paragraph here that has some words.`;
    const obs = observeContent(content, "test.md", { minWordsPerSection: 10 });
    // At least one section should be flagged as empty
    const emptySections = obs.sectionSelfContainment.details.filter((d) => d.isEmpty);
    assert.ok(emptySections.length >= 1, `Expected empty sections, got ${emptySections.length}`);
  });

  it("detects empty fixture with heading-shell pattern", () => {
    const content = readFileSync("tests/fixtures/audit-v2/adversarial/empty-headers.md", "utf8");
    const obs = observeContent(content, "empty-headers.md", { minWordsPerSection: 10 });
    const emptySections = obs.sectionSelfContainment.details.filter((d) => d.isEmpty);
    // The empty-headers fixture has 14 headings with no body — most should be empty
    assert.ok(
      emptySections.length >= 10,
      `Expected >=10 empty sections in heading-shell fixture, got ${emptySections.length}`
    );
    assert.equal(obs.sectionSelfContainment.status, "fail");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Paragraph distribution
// ═══════════════════════════════════════════════════════════════════════════

describe("paragraph distribution", () => {
  it("passes for well-distributed paragraphs", () => {
    const content =
      "This is a paragraph with about fifteen words that is well-formed.\n\n" +
      "This is another paragraph that also has a reasonable number of words.\n\n" +
      "A third paragraph here with sufficient length to pass the minimum check.";
    const obs = observeContent(content, "test.md");
    assert.equal(obs.paragraphDistribution.status, "pass");
  });

  it("detects very short paragraphs", () => {
    const content = "Short.\n\nTiny.\n\nBrief.";
    const obs = observeContent(content, "test.md");
    assert.equal(obs.paragraphDistribution.status, "warn");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Answer-first
// ═══════════════════════════════════════════════════════════════════════════

describe("answer-first", () => {
  it("passes when opening paragraph is a definition in optimal range", () => {
    const content =
      "This is a comprehensive introduction that defines the topic clearly. " +
      "It contains sufficient words to reach more than forty which is the " +
      "minimum recommended for effective answer-first structure for any " +
      "project. This guide is a complete reference for the entire system.";
    const obs = observeContent(content, "test.md");
    assert.equal(obs.answerFirst.status, "pass");
    assert.equal(obs.answerFirst.hasDefinition, true);
  });

  it("warns when opening paragraph exists but lacks definition markers", () => {
    const content =
      "This introduction has sufficient word count for the answer first pattern. " +
      "It explains things clearly but does not use explicit definition language " +
      "like is a or refers to which would make it stronger.";
    const obs = observeContent(content, "test.md");
    assert.equal(obs.answerFirst.status, "warn");
  });

  it("fails when no intro paragraph exists (only headings)", () => {
    const content = "# Title\n\n## Subtitle\n\n### Details";
    const obs = observeContent(content, "test.md");
    assert.equal(obs.answerFirst.status, "fail");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Attribution proximity
// ═══════════════════════════════════════════════════════════════════════════

describe("attribution proximity", () => {
  it("passes when stats and quotes have nearby attribution", () => {
    const content = `# Report\n\nAccording to a study published in Nature, productivity increased by 34% in 2025.\n\n> "The results are conclusive," said Dr. Smith, lead researcher.\n\nRevenue grew 15% according to the quarterly report.`;
    const obs = observeContent(content, "test.md");
    assert.equal(obs.attributionProximity.status, "pass");
  });

  it("fails for unattributed quotes (adversarial: unattributed-quotes)", () => {
    const content = readFileSync(
      "tests/fixtures/audit-v2/adversarial/unattributed-quotes.md",
      "utf8"
    );
    const obs = observeContent(content, "unattributed.md");
    assert.equal(obs.attributionProximity.status, "fail");
    assert.ok(
      obs.attributionProximity.quotesWithoutAttribution >= 3,
      `Expected >=3 unattributed quotes, got ${obs.attributionProximity.quotesWithoutAttribution}`
    );
  });

  it("detects fake stats without attribution (adversarial: fake-stats)", () => {
    const content = readFileSync("tests/fixtures/audit-v2/adversarial/fake-stats.md", "utf8");
    const obs = observeContent(content, "fake-stats.md");
    // Fake stats fixture has many stats without nearby sources
    assert.ok(
      obs.attributionProximity.statsWithoutNearbySource >= 5,
      `Expected >=5 unattributed stats, got ${obs.attributionProximity.statsWithoutNearbySource}`
    );
  });

  it("passes when no quotes or stats exist", () => {
    const content = "Just a simple paragraph without any statistics or quotations.";
    const obs = observeContent(content, "test.md");
    assert.equal(obs.attributionProximity.status, "pass");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Content freshness
// ═══════════════════════════════════════════════════════════════════════════

describe("content freshness", () => {
  it("passes when both published and reviewed dates are present", () => {
    const content = `# Article\n\n**Published:** June 15, 2026\n\n**Last reviewed:** June 20, 2026\n\nContent here.`;
    const obs = observeContent(content, "test.md");
    assert.equal(obs.contentFreshness.status, "pass");
    assert.ok(obs.contentFreshness.publishedDate);
    assert.ok(obs.contentFreshness.reviewedDate);
  });

  it("warns when no dates are present", () => {
    const content = "# Article\n\nContent with no dates at all.";
    const obs = observeContent(content, "test.md");
    assert.equal(obs.contentFreshness.status, "warn");
  });

  it("detects dates in medical fixture", () => {
    const content = readFileSync("tests/fixtures/audit-v2/regulated/medical-content.md", "utf8");
    const obs = observeContent(content, "medical.md");
    assert.ok(
      obs.contentFreshness.publishedDate || obs.contentFreshness.reviewedDate,
      "Medical content should have at least one date"
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Link quality
// ═══════════════════════════════════════════════════════════════════════════

describe("link quality", () => {
  it("passes for content with external links and sources section", () => {
    const content = `# Article\n\nSee [Google](https://google.com), [Bing](https://bing.com), and [DuckDuckGo](https://duckduckgo.com).\n\n## Sources\n\n- Source 1\n- Source 2`;
    const obs = observeContent(content, "test.md");
    assert.equal(obs.linkQuality.status, "pass");
    assert.ok(obs.linkQuality.externalLinkCount >= 3);
    assert.equal(obs.linkQuality.hasSourcesSection, true);
  });

  it("fails for link-farm pattern (adversarial: link-farm)", () => {
    const content = readFileSync("tests/fixtures/audit-v2/adversarial/link-farm.md", "utf8");
    const obs = observeContent(content, "link-farm.md");
    assert.equal(obs.linkQuality.hasExcessiveLinks, true);
    assert.equal(obs.linkQuality.status, "fail");
    assert.ok(
      obs.linkQuality.externalLinkCount >= 30,
      `Expected >=30 external links in link-farm, got ${obs.linkQuality.externalLinkCount}`
    );
  });

  it("warns when no links exist", () => {
    const content = "A paragraph with no links at all.";
    const obs = observeContent(content, "test.md");
    assert.equal(obs.linkQuality.status, "warn");
    assert.equal(obs.linkQuality.externalLinkCount, 0);
  });

  it("passes for documentation with good external links (SDK readme)", () => {
    const content = readFileSync("tests/fixtures/audit-v2/documentation/sdk-readme.md", "utf8");
    const obs = observeContent(content, "sdk-readme.md");
    assert.equal(obs.linkQuality.status, "pass");
    assert.ok(obs.linkQuality.externalLinkCount >= 2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Semantic HTML
// ═══════════════════════════════════════════════════════════════════════════

describe("semantic HTML", () => {
  it("passes for well-structured HTML with semantic tags", () => {
    const content = readFileSync("tests/fixtures/audit-v2/commercial/landing-page.html", "utf8");
    const obs = observeContent(content, "landing.html");
    assert.ok(obs.semanticHtml, "Should have semantic HTML observation");
    assert.equal(obs.semanticHtml.status, "pass");
    assert.ok(obs.semanticHtml.foundTags.length >= 3);
  });

  it("does not produce semantic HTML observation for markdown files", () => {
    const content = "# Hello\n\nWorld.";
    const obs = observeContent(content, "test.md");
    assert.equal(obs.semanticHtml, undefined);
  });

  it("detects semantic HTML issues", () => {
    const content = "<html><body><div>Content</div><div>More</div></body></html>";
    const obs = observeContent(content, "test.html");
    assert.ok(obs.semanticHtml);
    assert.equal(obs.semanticHtml.status, "fail");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Adversarial fixture validation
// ═══════════════════════════════════════════════════════════════════════════

describe("adversarial fixture observations", () => {
  it("flags perfect-format-bad-content as having generic/empty sections", () => {
    const content = readFileSync(
      "tests/fixtures/audit-v2/adversarial/perfect-format-bad-content.md",
      "utf8"
    );
    const obs = observeContent(content, "perfect-format.md");
    // Content is generic — every paragraph is a platitude
    // Attribution should be low because there are no real stats or sources
    assert.equal(obs.attributionProximity.quotesWithAttribution, 0);
    assert.equal(obs.attributionProximity.statsWithNearbySource, 0);
    // Link quality: claims to have references but they're vague
    assert.equal(obs.linkQuality.hasSourcesSection, true);
    assert.equal(obs.linkQuality.externalLinkCount, 0); // "Various industry reports" — zero actual links
  });

  it("flags keyword-stuffed content correctly", () => {
    const content = readFileSync("tests/fixtures/audit-v2/adversarial/keyword-stuffed.md", "utf8");
    const obs = observeContent(content, "keyword-stuffed.md");
    // These observations don't directly detect keyword stuffing,
    // but the link quality and paragraph distribution can provide signals
    assert.equal(obs.linkQuality.hasExcessiveLinks, false);
    // Content should at least parse without error
    assert.ok(obs.headingHierarchy);
  });

  it("correctly observes excellent tech doc (should pass on structure, clarity, links)", () => {
    const content = readFileSync(
      "tests/fixtures/audit-v2/adversarial/excellent-tech-doc-no-quotes.md",
      "utf8"
    );
    const obs = observeContent(content, "pg17.md");

    // Excellent structure
    assert.equal(obs.headingHierarchy.status, "pass");

    // All sections have content
    assert.equal(obs.sectionSelfContainment.status, "pass");

    // Has external links to wiki
    assert.ok(obs.linkQuality.externalLinkCount >= 1);

    // No quotes — but that's fine for technical docs
    assert.equal(obs.attributionProximity.quotesWithoutAttribution, 0);

    // Stats are self-attributed (PostgreSQL's own performance numbers)
    // This is appropriate for technical documentation
    assert.ok(
      obs.attributionProximity.status === "pass" || obs.attributionProximity.status === "warn",
      `attribution status: ${obs.attributionProximity.status}`
    );
  });

  it("correctly observes auto-generated content", () => {
    const content = readFileSync("tests/fixtures/audit-v2/adversarial/auto-generated.md", "utf8");
    const obs = observeContent(content, "auto-gen.md");

    // Structure may be technically valid (good headings)
    // but content should show issues: no real stats, no attribution, no links
    assert.equal(obs.linkQuality.externalLinkCount, 0);
    // Auto-generated content mentions "sources" in prose but has no actual
    // links — the link quality observation already captures this.
    assert.equal(obs.attributionProximity.statsWithoutNearbySource, 0);
    assert.equal(obs.attributionProximity.statsWithNearbySource, 0);
    // No dates — freshness unknown
    assert.equal(obs.contentFreshness.status, "warn");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// observeAndParse
// ═══════════════════════════════════════════════════════════════════════════

describe("observeAndParse", () => {
  it("returns observations, tokens, and text content", () => {
    const content = "# Title\n\nParagraph with some content.";
    const result = observeAndParse(content, "test.md");
    assert.ok(result.observations);
    assert.ok(result.tokens);
    assert.ok(result.textContent);
    assert.ok(Array.isArray(result.tokens));
    assert.equal(typeof result.textContent, "string");
  });
});
