import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  auditTechnicalHtml,
  buildTechnicalFindings,
  observeTechnicalHtml,
} from "../src/technical.js";

const FIXTURES = new URL("./fixtures/technical/", import.meta.url);
const fixture = (name) => readFileSync(new URL(name, FIXTURES), "utf8");
const finding = (report, ruleId) => report.findings.find((entry) => entry.ruleId === ruleId);

describe("technical HTML audit", () => {
  it("passes the observable fundamentals in a valid static document", () => {
    const report = auditTechnicalHtml(fixture("valid-static.html"), {
      sourceUrl: "https://example.com/guide",
    });
    assert.equal(report.observations.title.count, 1);
    assert.ok(report.observations.visibleText.wordCount >= 20);
    assert.deepEqual(report.observations.headings.issues, []);
    assert.equal(report.observations.language.hasSelfHreflang, true);
    assert.equal(report.observations.links.internalCount, 1);
    assert.deepEqual(report.observations.structuredData.mismatches, []);
    assert.equal(report.observations.appShell.detected, false);
    assert.equal(finding(report, "technical.canonical").status, "pass");
  });

  it("validates the pure function boundary", () => {
    assert.throws(
      () => observeTechnicalHtml("<html></html>", { sourceUrl: "/relative" }),
      /absolute http or https/
    );
    assert.throws(() => observeTechnicalHtml(null), /must be a string/);
  });

  it("detects conflicting canonicals", () => {
    const report = auditTechnicalHtml(fixture("conflicting-canonicals.html"));
    assert.equal(finding(report, "technical.canonical").status, "fail");
    assert.equal(report.observations.canonical.conflicts, true);
  });

  it("records noindex as an observed policy", () => {
    const report = auditTechnicalHtml(fixture("noindex.html"));
    const result = finding(report, "technical.meta_robots");
    assert.equal(result.status, "warn");
    assert.equal(result.observedFacts.noindex, true);
    assert.match(result.message, /noindex/);
  });

  it("detects invalid and duplicate hreflang declarations", () => {
    const report = auditTechnicalHtml(fixture("invalid-hreflang.html"), {
      sourceUrl: "https://example.com/page",
    });
    assert.equal(finding(report, "technical.language_alternates").status, "warn");
    assert.deepEqual(report.observations.language.duplicateHreflang, ["es"]);
    assert.equal(report.observations.language.hreflang[0].validLanguage, false);
    assert.equal(report.observations.language.hreflang[0].absolute, false);
  });

  it("detects unusable links and reports nofollow separately", () => {
    const report = auditTechnicalHtml(fixture("blocked-links.html"), {
      sourceUrl: "https://example.com/links",
    });
    assert.equal(finding(report, "technical.internal_links").status, "warn");
    assert.equal(report.observations.links.invalidCount, 2);
    assert.equal(report.observations.links.nofollowCount, 1);
    assert.equal(report.observations.links.internalCount, 2);
  });

  it("describes an empty app shell without declaring it broken", () => {
    const report = auditTechnicalHtml(fixture("empty-app-shell.html"), {
      sourceUrl: "https://example.com/app",
    });
    const result = finding(report, "technical.empty_app_shell");
    assert.equal(result.status, "warn");
    assert.match(result.message, /supplied HTML/);
    assert.match(result.message, /client-rendered content was not evaluated/);
    assert.doesNotMatch(result.message, /broken/i);
  });

  it("reports malformed and inconsistent JSON-LD", () => {
    const malformed = auditTechnicalHtml(`
      <html><head><title>Visible title</title>
      <script type="application/ld+json">{invalid}</script></head>
      <body><main><h1>Visible title</h1><p>Visible body copy.</p></main></body></html>
    `);
    assert.equal(finding(malformed, "technical.structured_data_text_consistency").status, "fail");

    const inconsistent = auditTechnicalHtml(`
      <html><head><title>Visible title</title>
      <script type="application/ld+json">
        {"@context":"https://schema.org","@type":"Article","headline":"Different claim"}
      </script></head>
      <body><main><h1>Visible title</h1><p>Visible body copy.</p></main></body></html>
    `);
    assert.equal(
      finding(inconsistent, "technical.structured_data_text_consistency").status,
      "warn"
    );
  });

  it("emits nine versioned, evidence-labeled findings", () => {
    const observations = observeTechnicalHtml(fixture("valid-static.html"), {
      sourceUrl: "https://example.com/guide",
    });
    const findings = buildTechnicalFindings(observations);
    assert.equal(findings.length, 9);
    for (const entry of findings) {
      assert.match(entry.ruleId, /^technical\./);
      assert.equal(entry.category, "technical_discovery");
      assert.equal(entry.status, entry.severity);
      assert.ok(entry.evidenceLabel);
      assert.ok(Array.isArray(entry.sourceRefs));
    }
  });
});
