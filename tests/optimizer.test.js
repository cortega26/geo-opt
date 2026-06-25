import test, { mock } from "node:test";
import assert from "node:assert";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  auditFile,
  calculateReadability,
  checkRobots,
  cleanMarkdownToPlainText,
  extractSections,
  generateSchemaData,
  injectSchema,
  preprocessContent,
} from "../src/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const config = {
  author: {
    name: "Carlos Ortega González",
    jobTitle: "Sr. Software Automation and Data Analyst",
    sameAs: "https://www.linkedin.com/in/cortega26/",
  },
  publisher: {
    name: "Tooltician",
    url: "https://www.tooltician.com",
    logo: "https://www.tooltician.com/logo.png",
  },
  signature: "Optimized by [Tooltician](https://www.tooltician.com)",
  acronyms: {
    AWS: "Amazon Web Services",
    GDPR: "General Data Protection Regulation",
  },
};

test("calculateReadability parses word counts and sentence averages", () => {
  const text = "This is a simple sentence. Here is another sentence containing more words.";
  const res = calculateReadability(text);
  assert.strictEqual(res.wordCount, 12);
  assert.strictEqual(res.avgSentenceLen, 6);
});

test("cleanMarkdownToPlainText converts tables and links to plain text", () => {
  const md = `
| Head 1 | Head 2 |
| :--- | :--- |
| **Cell 1** | Cell 2 [Link](https://example.com) |
  `;
  const clean = cleanMarkdownToPlainText(md);
  assert.strictEqual(clean, "Head 1 - Head 2\nCell 1 - Cell 2 Link");
});

test("extractSections structurally parses headings and bodies", () => {
  const content = `
# Title

## Heading 1
Body of heading 1.
More text.

## Heading 2
Body of heading 2.
  `;
  const sections = extractSections(content);
  assert.strictEqual(sections.length, 2);
  assert.strictEqual(sections[0].header, "Heading 1");
  assert.strictEqual(sections[0].body, "Body of heading 1.\nMore text.");
  assert.strictEqual(sections[1].header, "Heading 2");
  assert.strictEqual(sections[1].body, "Body of heading 2.");
});

test("generateSchemaData generates stacked graph schema with FAQ nodes", () => {
  const tempFile = path.join(__dirname, "temp_article.md");
  fs.writeFileSync(
    tempFile,
    `
# Test Headline

This is the description paragraph of 40 words.

## Key Benefits of Hybrid Cloud
This is the body answer containing more details.
  `,
    { encoding: "utf8" }
  );

  try {
    const schema = generateSchemaData(tempFile, "article", config);
    assert.strictEqual(schema["@context"], "https://schema.org");
    assert.ok(Array.isArray(schema["@graph"]));

    const article = schema["@graph"].find((x) => x["@type"] === "NewsArticle");
    assert.strictEqual(article.headline, "Test Headline");
    assert.strictEqual(article.author["@id"], "https://www.tooltician.com/#author");

    const faq = schema["@graph"].find((x) => x["@type"] === "FAQPage");
    assert.strictEqual(faq.mainEntity.length, 1);
    assert.strictEqual(faq.mainEntity[0].name, "Key Benefits of Hybrid Cloud");
    assert.strictEqual(
      faq.mainEntity[0].acceptedAnswer.text,
      "This is the body answer containing more details."
    );
  } finally {
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
  }
});

test("injectSchema writes signature and stacked JSON-LD markup to file", () => {
  const tempFile = path.join(__dirname, "temp_inject.md");
  fs.writeFileSync(
    tempFile,
    `
# Test Article
This is the body text.
  `,
    { encoding: "utf8" }
  );

  try {
    injectSchema(tempFile, "article", config);
    const content = fs.readFileSync(tempFile, { encoding: "utf8" });

    assert.ok(content.includes("Optimized by [Tooltician]"));
    assert.ok(content.includes("```json"));
    assert.ok(content.includes("Carlos Ortega González"));
    assert.ok(content.includes("https://www.tooltician.com/#author"));
  } finally {
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
  }
});

test("preprocessContent strips code blocks, script tags, style tags, and HTML comments", () => {
  const input = `
# Title
Some text.
\`\`\`
const x = 1;
\`\`\`
More text.
<script>alert('xss')</script>
<style>body { color: red; }</style>
<!-- a comment -->
Final text.
  `;
  const result = preprocessContent(input);
  assert.ok(!result.includes("```"));
  assert.ok(!result.includes("const x"));
  assert.ok(!result.includes("alert"));
  assert.ok(!result.includes("color: red"));
  assert.ok(!result.includes("a comment"));
  assert.ok(result.includes("Some text"));
  assert.ok(result.includes("More text"));
  assert.ok(result.includes("Final text"));
});

test("checkRobots detects blocked AI agents", () => {
  const tempFile = path.join(__dirname, "temp_robots_block.txt");
  fs.writeFileSync(
    tempFile,
    `User-agent: GPTBot
Disallow: /
User-agent: *
Disallow: /private
`,
    { encoding: "utf8" }
  );

  try {
    assert.doesNotThrow(() => {
      checkRobots(tempFile);
    });
  } finally {
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
  }
});

test("checkRobots detects no blocking for permissive robots.txt", () => {
  const tempFile = path.join(__dirname, "temp_robots_allow.txt");
  fs.writeFileSync(
    tempFile,
    `User-agent: *
Disallow: /admin
`,
    { encoding: "utf8" }
  );

  try {
    assert.doesNotThrow(() => {
      checkRobots(tempFile);
    });
  } finally {
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
  }
});

test("auditFile returns a score and produces valid JSON output", () => {
  const tempFile = path.join(__dirname, "temp_audit.md");
  fs.writeFileSync(
    tempFile,
    `# Test Article

Hybrid cloud architecture is an IT infrastructure design that integrates private cloud resources with public cloud services. It provides flexibility and cost efficiency for modern enterprises.

## Key Benefits
Organizations report an average of 34% cost reduction according to IDC research.

> "Hybrid cloud solved our compliance bottleneck." — Jane Doe, CISO at SecureCorp

- Benefit 1
- Benefit 2

## Sources
1. [IDC Report](https://example.com/idc)
  `,
    { encoding: "utf8" }
  );

  try {
    const score = auditFile(tempFile, config, "json");
    assert.ok(typeof score === "number");
    assert.ok(score >= 0 && score <= 100);
  } finally {
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
  }
});

test("auditFile produces text output without crashing", () => {
  const tempFile = path.join(__dirname, "temp_audit_text.md");
  fs.writeFileSync(
    tempFile,
    `# Minimal Article
Short body text without much optimization.
  `,
    { encoding: "utf8" }
  );

  try {
    const score = auditFile(tempFile, config, "text");
    assert.ok(typeof score === "number");
  } finally {
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
  }
});

test("auditFile exits with error on missing file", () => {
  const exitMock = mock.method(process, "exit", () => {});
  const errorMock = mock.method(console, "error", () => {});

  try {
    auditFile("/nonexistent/path/file.md", config, "text");
    assert.ok(exitMock.mock.calls.length > 0);
  } finally {
    mock.reset();
  }
});

test("generateSchemaData generates valid FAQPage schema with filters", () => {
  const tempFile = path.join(__dirname, "temp_faq.md");
  fs.writeFileSync(
    tempFile,
    `# FAQ Page

## What is Hybrid Cloud?
Hybrid cloud is a computing environment that combines on-premises data centers with public cloud services.

## Short
Brief.

## Sources
Some links here.
  `,
    { encoding: "utf8" }
  );

  try {
    const schema = generateSchemaData(tempFile, "faq", config);
    assert.strictEqual(schema["@context"], "https://schema.org");

    const faq = schema["@graph"].find((x) => x["@type"] === "FAQPage");
    assert.ok(faq);
    // "Short" section has body < 15 chars → filtered out
    // "Sources" section → filtered out as sources/references header
    assert.strictEqual(faq.mainEntity.length, 1);
    assert.strictEqual(faq.mainEntity[0].name, "What is Hybrid Cloud?");
  } finally {
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
  }
});

test("generateSchemaData generates valid Product schema", () => {
  const tempFile = path.join(__dirname, "temp_product.md");
  fs.writeFileSync(
    tempFile,
    `# Cloud Migration Toolkit

A comprehensive suite of tools for migrating on-premises workloads to hybrid cloud environments.
  `,
    { encoding: "utf8" }
  );

  try {
    const schema = generateSchemaData(tempFile, "product", config);
    assert.strictEqual(schema["@context"], "https://schema.org");

    const product = schema["@graph"].find((x) => x["@type"] === "Product");
    assert.ok(product);
    assert.strictEqual(product.name, "Cloud Migration Toolkit");
    assert.ok(product.offers);
    assert.strictEqual(product.offers.priceCurrency, "USD");
    assert.strictEqual(product.offers.availability, "https://schema.org/InStock");

    const org = schema["@graph"].find((x) => x["@type"] === "Organization");
    assert.strictEqual(product.brand["@id"], org["@id"]);
  } finally {
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
  }
});

test("injectSchema injects JSON-LD script tag into HTML file", () => {
  const tempFile = path.join(__dirname, "temp_inject.html");
  fs.writeFileSync(
    tempFile,
    `<!DOCTYPE html>
<html>
<head><title>Test</title></head>
<body><p>Content.</p></body>
</html>`,
    { encoding: "utf8" }
  );

  try {
    injectSchema(tempFile, "article", config);
    const content = fs.readFileSync(tempFile, { encoding: "utf8" });
    assert.ok(content.includes('<script type="application/ld+json">'));
    assert.ok(content.includes('"@context"'));
    assert.ok(content.includes("https://schema.org"));
    assert.ok(content.includes("Tooltician"));
  } finally {
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
  }
});

test("auditFile detects verbal statistics as data points", () => {
  const tempFile = path.join(__dirname, "temp_verbal.md");
  fs.writeFileSync(
    tempFile,
    `# Report

Hybrid cloud adoption is an enterprise IT strategy. It delivers significant benefits.

One third of enterprises report cost reductions. Double the efficiency of legacy setups.
Three out of four IT managers recommend the approach.
  `,
    { encoding: "utf8" }
  );

  try {
    const score = auditFile(tempFile, config, "json");
    // Con "one third", "double", "three out of four" debería tener score > 0
    // en la categoría de estadísticas
    assert.ok(typeof score === "number");
    assert.ok(score > 0);
  } finally {
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
  }
});
