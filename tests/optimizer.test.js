import test from "node:test";
import assert from "node:assert";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  calculateReadability,
  cleanMarkdownToPlainText,
  extractSections,
  generateSchemaData,
  injectSchema,
} from "../src/optimizer.js";

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
