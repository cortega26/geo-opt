import test from "node:test";
import assert from "node:assert";
import fs from "fs";
import os from "os";
import path from "path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "url";
import {
  aggregateReport,
  AI_CRAWLER_AGENTS,
  AI_CRAWLER_REGISTRY,
  auditFile,
  auditFiles,
  auditLlmsTxt,
  auditRobots,
  batchInject,
  buildReportMeta,
  calculateReadability,
  checkRobots,
  cleanMarkdownToPlainText,
  COMMUNITY_SCHEMA_TYPES,
  createFinding,
  discoverFiles,
  extractPageMetadata,
  extractSections,
  generateLlmsTxt,
  generateLlmsFullTxt,
  generateRobotsTxt,
  generateSchemaData,
  getNoBrandingError,
  hasProEntitlement,
  injectSchema,
  loadConfig,
  MODEL_VERSION,
  preprocessContent,
  isHtmlContent,
  extractHtmlVisibleText,
  PRO_SCHEMA_TYPES,
  readEngagementState,
  recordSuccessfulFreeInjection,
  remindersAreEnabled,
  REPORT_VERSION,
  scoreContent,
  scoreContentV2,
  setRemindersEnabled,
  staleEvidenceWarnings,
  validateSchema,
  validateSourceRefs,
  renderV1ReportHtml,
  renderV2ReportHtml,
  renderAggregateReportHtml,
  renderComparisonHtml,
} from "../src/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, "..");
const cliPath = path.join(repoRoot, "bin", "cli.js");

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
  acronyms: {
    AWS: "Amazon Web Services",
    GDPR: "General Data Protection Regulation",
  },
  product: {
    offer: {
      price: "49.00",
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
    },
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

test("generateSchemaData generates Article schema without implicit FAQ nodes", () => {
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

    const article = schema["@graph"].find((x) => x["@type"] === "Article");
    assert.ok(article, "article type should be Article");
    assert.strictEqual(article.headline, "Test Headline");
    assert.strictEqual(article.author["@id"], "https://www.tooltician.com/#author");

    const faq = schema["@graph"].find((x) => x["@type"] === "FAQPage");
    assert.strictEqual(faq, undefined, "article type should not produce implicit FAQ nodes");
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

    assert.ok(content.includes("Optimized with [Tooltician]"));
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

test("isHtmlContent detects HTML by doctype, html tag, or structural elements", () => {
  assert.ok(isHtmlContent("<!DOCTYPE html><html><head></head><body></body></html>"));
  assert.ok(isHtmlContent('<html lang="en"><head></head><body></body></html>'));
  assert.ok(isHtmlContent("<div><p>Hello</p></div>"));
  assert.ok(isHtmlContent("<article><h1>Title</h1><p>Body</p></article>"));
  assert.ok(!isHtmlContent("# Heading\n\nThis is **markdown**."));
  assert.ok(!isHtmlContent("Plain text without any HTML tags."));
  assert.ok(!isHtmlContent("console.log('hello'); // just code"));
});

test("extractHtmlVisibleText extracts clean text and structure from minified HTML", () => {
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Test</title><style>body{color:red}</style><script>console.log('x')</script></head><body><main><h1>Page Title</h1><p>First paragraph with some content here.</p><h2>Section A</h2><p>Section paragraph text.</p><ul><li>Item one</li><li>Item two</li></ul><h2>Section B</h2><table><tr><td>Cell 1</td><td>Cell 2</td></tr></table><p>Final paragraph.</p></main></body></html>`;
  const result = extractHtmlVisibleText(html);

  // Texto visible: sin CSS, sin JS, sin meta
  assert.ok(!result.textContent.includes("color"), "no debe contener CSS");
  assert.ok(!result.textContent.includes("console"), "no debe contener JS");
  assert.ok(!result.textContent.includes("UTF-8"), "no debe contener meta charset");
  assert.ok(result.textContent.includes("Page Title"), "debe contener el h1");
  assert.ok(result.textContent.includes("First paragraph"), "debe contener el primer párrafo");
  assert.ok(result.textContent.includes("Section A"), "debe contener h2");
  assert.ok(result.textContent.includes("Item one"), "debe contener items de lista");
  assert.ok(result.textContent.includes("Cell 1"), "debe contener celdas de tabla");
  assert.ok(result.textContent.includes("Final paragraph"), "debe contener el último párrafo");

  // Estructura detectada
  assert.ok(
    result.headingCount >= 3,
    `debe detectar al menos 3 headings (detectó ${result.headingCount})`
  );
  assert.ok(result.h2h3Count >= 2, `debe detectar al menos 2 h2/h3 (detectó ${result.h2h3Count})`);
  assert.equal(result.listCount, 1, "debe detectar 1 lista");
  assert.equal(result.tableCount, 1, "debe detectar 1 tabla");
});

test("extractHtmlVisibleText handles minified HTML (single-line)", () => {
  // Simula la salida minificada de Astro: todo en una línea
  const minified =
    '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="description" content="Scheduled, reproducible Python automation: ETL pipelines, scrapers, and reporting flows built to keep running."><link rel="canonical" href="https://tooltician.com/en/services/python-automation/"><style>.card{display:flex;width:1200px;height:630px}</style></head><body><main><h1>Python Automation</h1><p>Scheduled, reproducible Python automation that runs $290/month.</p><h2>Service Details</h2><ul><li>ETL pipeline design</li><li>Web scraping</li></ul><h3>Pricing</h3><table><tr><td>Basic</td><td>$290</td></tr></table></main></body></html>';
  const result = extractHtmlVisibleText(minified);

  // No debe contener atributos HTML como "quotes"
  assert.ok(
    !result.textContent.includes("Scheduled, reproducible Python automation: ETL pipelines"),
    "no debe contener texto del meta description"
  );

  // No debe contener CSS
  assert.ok(!result.textContent.includes("1200px"), "no debe contener dimensiones CSS");
  assert.ok(!result.textContent.includes("display:flex"), "no debe contener reglas CSS");

  // Debe contener texto visible
  assert.ok(result.textContent.includes("Python Automation"), "debe contener el h1");
  assert.ok(result.textContent.includes("$290"), "debe contener texto del cuerpo");
  assert.ok(result.textContent.includes("ETL pipeline design"), "debe contener items de lista");
  assert.ok(result.textContent.includes("Basic"), "debe contener texto de tabla");

  // Estructura correcta
  assert.equal(result.h2h3Count, 2, "debe detectar h2 + h3");
  assert.equal(result.listCount, 1, "debe detectar 1 lista");
  assert.equal(result.tableCount, 1, "debe detectar 1 tabla");
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

test("checkRobots ignores unrelated bots and honors Allow precedence", () => {
  const unrelatedFile = path.join(__dirname, "temp_robots_unrelated.txt");
  const allowedFile = path.join(__dirname, "temp_robots_allowed.txt");
  fs.writeFileSync(unrelatedFile, "User-agent: TotallyUnrelatedBot\nDisallow: /\n", {
    encoding: "utf8",
  });
  fs.writeFileSync(allowedFile, "User-agent: GPTBot\nDisallow: /\nAllow: /\n", {
    encoding: "utf8",
  });

  const originalLog = console.log;
  const logs = [];
  console.log = (message = "") => logs.push(String(message));

  try {
    checkRobots(unrelatedFile);
    checkRobots(allowedFile);
    const output = logs.join("\n");
    assert.match(output, /SUCCESS/);
    assert.doesNotMatch(output, /TotallyUnrelatedBot/);
    assert.doesNotMatch(output, /root access blocked/);
  } finally {
    console.log = originalLog;
    for (const file of [unrelatedFile, allowedFile]) {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
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

test("auditFile throws error on missing file", () => {
  assert.throws(() => {
    auditFile("/nonexistent/path/file.md", config, "text");
  }, /not found/);
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

test("generateSchemaData generates NewsArticle for news-article type with datePublished", () => {
  const tempFile = path.join(__dirname, "temp_news_article.md");
  fs.writeFileSync(tempFile, "# Breaking News\n\nSomething important happened today.", {
    encoding: "utf8",
  });
  try {
    const schema = generateSchemaData(tempFile, "news-article", {
      datePublished: "2026-06-27",
    });
    const news = schema["@graph"].find((x) => x["@type"] === "NewsArticle");
    assert.ok(news, "news-article type should emit NewsArticle");
    assert.strictEqual(news.headline, "Breaking News");
    assert.strictEqual(news.datePublished, "2026-06-27");
    const plain = schema["@graph"].find((x) => x["@type"] === "Article");
    assert.strictEqual(plain, undefined, "news-article should not emit Article");
  } finally {
    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
  }
});

test("generateSchemaData throws for news-article without datePublished", () => {
  const tempFile = path.join(__dirname, "temp_news_no_date.md");
  fs.writeFileSync(tempFile, "# Dateless News\n\nBody.", { encoding: "utf8" });
  try {
    assert.throws(
      () => generateSchemaData(tempFile, "news-article", {}),
      /news-article.*datePublished/i
    );
  } finally {
    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
  }
});

test("generateSchemaData faq mode filters non-question headings", () => {
  const tempFile = path.join(__dirname, "temp_faq_filter.md");
  fs.writeFileSync(
    tempFile,
    `# Docs

## Installation
Follow these steps to install.

## How do I install?
Run npm install in your project directory to get started.

## Limitations
This tool has some limitations worth knowing.
  `,
    { encoding: "utf8" }
  );
  try {
    const schema = generateSchemaData(tempFile, "faq", {});
    const faq = schema["@graph"].find((x) => x["@type"] === "FAQPage");
    assert.ok(faq);
    assert.strictEqual(
      faq.mainEntity.length,
      1,
      "only question-shaped headings should be included"
    );
    assert.strictEqual(faq.mainEntity[0].name, "How do I install?");
  } finally {
    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
  }
});

test("validateSchema separates errors, warnings, and notes", () => {
  // Valid Article
  const validResult = validateSchema({
    "@context": "https://schema.org",
    "@graph": [{ "@type": "Article", headline: "Test" }],
  });
  assert.deepStrictEqual(validResult.errors, []);
  assert.deepStrictEqual(validResult.warnings, []);
  assert.strictEqual(validResult.nodes.length, 1);

  // Missing required field → error
  const missingField = validateSchema({
    "@context": "https://schema.org",
    "@graph": [{ "@type": "Article" }],
  });
  assert.ok(missingField.errors.some((e) => e.includes("headline")));

  // Unknown type → note, not error
  const unknownType = validateSchema({
    "@context": "https://schema.org",
    "@graph": [{ "@type": "UnknownThing", name: "x" }],
  });
  assert.deepStrictEqual(unknownType.errors, []);
  assert.ok(unknownType.notes.some((n) => n.includes("UnknownThing")));

  // Wrong @context → error
  const badContext = validateSchema({
    "@context": "http://schema.org",
    "@graph": [{ "@type": "Article", headline: "x" }],
  });
  assert.ok(badContext.errors.some((e) => e.includes("@context")));
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
    assert.strictEqual(product.offers.price, "49.00");
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

test("generateSchemaData omits identity and commerce claims when unconfigured", () => {
  const tempFile = path.join(__dirname, "temp_unconfigured.md");
  fs.writeFileSync(tempFile, "# Independent Article\n\nIndependent body text.", {
    encoding: "utf8",
  });

  try {
    const articleSchema = generateSchemaData(tempFile, "article", {});
    const article = articleSchema["@graph"].find((node) => node["@type"] === "Article");

    assert.deepStrictEqual(
      articleSchema["@graph"].map((node) => node["@type"]),
      ["Article"]
    );
    assert.strictEqual(article.author, undefined);
    assert.strictEqual(article.publisher, undefined);
    assert.strictEqual(article.datePublished, undefined);

    const productSchema = generateSchemaData(tempFile, "product", {});
    const product = productSchema["@graph"].find((node) => node["@type"] === "Product");
    assert.strictEqual(product.brand, undefined);
    assert.strictEqual(product.offers, undefined);
  } finally {
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
  }
});

test("Tooltician Pro entitlement uses the documented local key sources", () => {
  const validKey = "tt_pro_1234567890abcdefghij";
  assert.strictEqual(hasProEntitlement({}, {}), false);
  assert.strictEqual(hasProEntitlement({ license: { key: validKey } }, {}), true);
  assert.strictEqual(hasProEntitlement({}, { TOOLTICIAN_LICENSE_KEY: validKey }), true);
  assert.match(getNoBrandingError({}, {}), /requires a Tooltician Pro license key/);
});

test("CLI requires Pro entitlement for --no-branding and removes branding when entitled", () => {
  const tempFile = path.join(__dirname, "temp_no_branding.md");
  const original = "# Independent Article\n\nIndependent body text.\n";
  fs.writeFileSync(tempFile, original, { encoding: "utf8" });

  const cleanEnv = { ...process.env };
  delete cleanEnv.TOOLTICIAN_LICENSE_KEY;

  try {
    const rejected = spawnSync(
      process.execPath,
      [cliPath, "inject", tempFile, "article", "--no-branding"],
      { cwd: path.join(__dirname, ".."), env: cleanEnv, encoding: "utf8" }
    );
    assert.strictEqual(rejected.status, 1);
    assert.match(rejected.stderr, /requires a Tooltician Pro license key/);
    assert.strictEqual(fs.readFileSync(tempFile, "utf8"), original);

    const branded = spawnSync(process.execPath, [cliPath, "inject", tempFile, "article"], {
      cwd: path.join(__dirname, ".."),
      env: cleanEnv,
      encoding: "utf8",
    });
    assert.strictEqual(branded.status, 0, branded.stderr);
    assert.ok(fs.readFileSync(tempFile, "utf8").includes("Optimized with [Tooltician]"));

    const accepted = spawnSync(
      process.execPath,
      [cliPath, "inject", tempFile, "article", "--no-branding"],
      {
        cwd: path.join(__dirname, ".."),
        env: {
          ...cleanEnv,
          TOOLTICIAN_LICENSE_KEY: "tt_pro_1234567890abcdefghij",
        },
        encoding: "utf8",
      }
    );
    assert.strictEqual(accepted.status, 0, accepted.stderr);

    const content = fs.readFileSync(tempFile, "utf8");
    assert.ok(content.includes("```json"));
    assert.strictEqual(content.includes("Tooltician"), false);
    assert.strictEqual(content.includes("Carlos Ortega"), false);
  } finally {
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
  }
});

test("CLI audit JSON remains parseable for batches and threshold failures", () => {
  const firstFile = path.join(__dirname, "temp_cli_json_one.md");
  const secondFile = path.join(__dirname, "temp_cli_json_two.md");
  fs.writeFileSync(firstFile, "# One\n\nTiny page with 42 percent evidence.\n", {
    encoding: "utf8",
  });
  fs.writeFileSync(secondFile, "# Two\n\nTiny page with 43 percent evidence.\n", {
    encoding: "utf8",
  });

  try {
    const batch = spawnSync(
      process.execPath,
      [cliPath, "audit", firstFile, secondFile, "--format", "json"],
      { cwd: repoRoot, encoding: "utf8" }
    );
    assert.strictEqual(batch.status, 0, batch.stderr);
    const batchPayload = JSON.parse(batch.stdout);
    assert.ok(Array.isArray(batchPayload));
    assert.strictEqual(batchPayload.length, 2);

    const threshold = spawnSync(
      process.execPath,
      [cliPath, "audit", firstFile, "--format", "json", "--threshold", "999"],
      { cwd: repoRoot, encoding: "utf8" }
    );
    assert.strictEqual(threshold.status, 1);
    const thresholdPayload = JSON.parse(threshold.stdout);
    assert.strictEqual(thresholdPayload.file, firstFile);
    assert.match(threshold.stderr, /Threshold not met/);
  } finally {
    for (const file of [firstFile, secondFile]) {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
    }
  }
});

test("CLI rejects explicitly malformed config files", () => {
  const tempFile = path.join(__dirname, "temp_bad_config_target.md");
  const configFile = path.join(__dirname, "temp_bad_config.json");
  fs.writeFileSync(tempFile, "# Target\n\nBody text.\n", { encoding: "utf8" });
  fs.writeFileSync(configFile, "{ invalid json", { encoding: "utf8" });

  try {
    const result = spawnSync(
      process.execPath,
      [cliPath, "audit", tempFile, "--config", configFile],
      { cwd: repoRoot, encoding: "utf8" }
    );
    assert.strictEqual(result.status, 1);
    assert.match(result.stderr, /Failed to parse config/);
    assert.strictEqual(result.stdout, "");
  } finally {
    for (const file of [tempFile, configFile]) {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
    }
  }
});

test("CLI rejects symlink targets that resolve outside the working directory", () => {
  const outsideDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "geo-opt-outside-"));
  const outsideFile = path.join(outsideDirectory, "outside.md");
  const linkPath = path.join(__dirname, "temp_outside_link.md");
  fs.writeFileSync(outsideFile, "# Outside\n\nOriginal content.\n", { encoding: "utf8" });

  try {
    fs.symlinkSync(outsideFile, linkPath);
    const result = spawnSync(process.execPath, [cliPath, "inject", linkPath, "article"], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    assert.strictEqual(result.status, 1);
    assert.match(result.stderr, /resolves outside/);
    assert.strictEqual(fs.readFileSync(outsideFile, "utf8"), "# Outside\n\nOriginal content.\n");
  } finally {
    if (fs.existsSync(linkPath)) {
      fs.unlinkSync(linkPath);
    }
    fs.rmSync(outsideDirectory, { recursive: true, force: true });
  }
});

test("support reminders are infrequent, automation-safe, and user-disableable", () => {
  const stateDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "geo-opt-state-"));
  const statePath = path.join(stateDirectory, "state.json");
  const writes = [];
  const stderr = {
    isTTY: true,
    write(message) {
      writes.push(message);
    },
  };
  const env = {};
  const firstRun = new Date("2026-01-01T00:00:00.000Z");

  try {
    for (let index = 0; index < 9; index += 1) {
      const result = recordSuccessfulFreeInjection({}, { statePath, stderr, env, now: firstRun });
      assert.strictEqual(result.shown, false);
    }
    assert.strictEqual(writes.length, 0);

    const tenth = recordSuccessfulFreeInjection({}, { statePath, stderr, env, now: firstRun });
    assert.strictEqual(tenth.shown, true);
    assert.strictEqual(writes.length, 1);
    assert.match(writes[0], /config set reminders false/);

    for (let index = 0; index < 10; index += 1) {
      recordSuccessfulFreeInjection(
        {},
        {
          statePath,
          stderr,
          env,
          now: new Date("2026-01-02T00:00:00.000Z"),
        }
      );
    }
    assert.strictEqual(writes.length, 1);

    const afterCooldown = recordSuccessfulFreeInjection(
      {},
      {
        statePath,
        stderr,
        env,
        now: new Date("2026-01-08T00:00:01.000Z"),
      }
    );
    assert.strictEqual(afterCooldown.shown, true);
    assert.strictEqual(writes.length, 2);

    assert.strictEqual(setRemindersEnabled(false, { statePath, env }), true);
    assert.strictEqual(remindersAreEnabled({ statePath, env }), false);
    const disabled = recordSuccessfulFreeInjection(
      {},
      {
        statePath,
        stderr,
        env,
        now: new Date("2026-03-15T00:00:00.000Z"),
      }
    );
    assert.strictEqual(disabled.reason, "disabled");

    assert.strictEqual(setRemindersEnabled(true, { statePath, env }), true);
    const automated = recordSuccessfulFreeInjection(
      {},
      {
        statePath,
        stderr,
        env: { CI: "true" },
        now: new Date("2026-03-15T00:00:00.000Z"),
      }
    );
    assert.strictEqual(automated.reason, "suppressed");

    const piped = recordSuccessfulFreeInjection(
      {},
      {
        statePath,
        stderr: { isTTY: false, write() {} },
        env,
        now: new Date("2026-03-15T00:00:00.000Z"),
      }
    );
    assert.strictEqual(piped.reason, "suppressed");

    const pro = recordSuccessfulFreeInjection(
      { license: { key: "tt_pro_1234567890abcdefghij" } },
      {
        statePath,
        stderr,
        env,
        now: new Date("2026-03-15T00:00:00.000Z"),
      }
    );
    assert.strictEqual(pro.reason, "suppressed");
    assert.strictEqual(readEngagementState({ statePath, env }).remindersEnabled, true);
  } finally {
    fs.rmSync(stateDirectory, { recursive: true, force: true });
  }
});

test("CLI config command persists the reminder preference", () => {
  const stateDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "geo-opt-config-"));
  const cliPath = path.join(__dirname, "..", "bin", "cli.js");
  const env = { ...process.env, GEO_OPT_STATE_DIR: stateDirectory };

  try {
    const disabled = spawnSync(process.execPath, [cliPath, "config", "set", "reminders", "false"], {
      cwd: path.join(__dirname, ".."),
      env,
      encoding: "utf8",
    });
    assert.strictEqual(disabled.status, 0, disabled.stderr);
    assert.match(disabled.stdout, /disabled/);

    const readBack = spawnSync(process.execPath, [cliPath, "config", "get", "reminders"], {
      cwd: path.join(__dirname, ".."),
      env,
      encoding: "utf8",
    });
    assert.strictEqual(readBack.status, 0, readBack.stderr);
    assert.strictEqual(readBack.stdout.trim(), "false");
  } finally {
    fs.rmSync(stateDirectory, { recursive: true, force: true });
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

test("injectSchema extracts HTML descriptions and replaces single-quoted JSON-LD", () => {
  const tempFile = path.join(__dirname, "temp_html_replace.html");
  fs.writeFileSync(
    tempFile,
    `<!DOCTYPE html>
<html>
<head><title>Test</title></head>
<body>
<h1>HTML Title</h1>
<p>This HTML paragraph should become the structured-data description.</p>
<script type='application/ld+json'>{"@context":"https://schema.org","@type":"Thing"}</script>
</body>
</html>`,
    { encoding: "utf8" }
  );

  try {
    injectSchema(tempFile, "article", config);
    const content = fs.readFileSync(tempFile, { encoding: "utf8" });
    assert.strictEqual((content.match(/application\/ld\+json/g) || []).length, 1);
    assert.match(content, /"headline": "HTML Title"/);
    assert.match(content, /"description": "This HTML paragraph should become/);
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

  const originalLog = console.log;
  const logs = [];
  try {
    console.log = (message = "") => logs.push(String(message));
    const score = auditFile(tempFile, config, "json");
    const report = JSON.parse(logs.join("\n"));
    assert.ok(typeof score === "number");
    assert.strictEqual(report.breakdown.statistics.score, 20);
  } finally {
    console.log = originalLog;
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
  }
});

test("injectSchema escapes </script> in JSON-LD to prevent XSS breakout (SEC-03)", () => {
  const tempFile = path.join(__dirname, "temp_xss.md");
  const xssTitle = "# Test </script><img src=x onerror=alert(1)>";
  fs.writeFileSync(tempFile, `${xssTitle}\n\nBody text.`, { encoding: "utf8" });

  try {
    injectSchema(tempFile, "article", config);
    const content = fs.readFileSync(tempFile, { encoding: "utf8" });

    // Extract the JSON-LD block from the markdown code fence
    const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/);
    assert.ok(jsonMatch, "JSON-LD code block should exist");
    const jsonLd = jsonMatch[1];

    assert.strictEqual(
      jsonLd.includes("</script>"),
      false,
      "JSON-LD must not contain raw </script>"
    );
    assert.strictEqual(jsonLd.includes("<img"), false, "JSON-LD must not preserve injected tags");
  } finally {
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
  }
});

test("cleanHtmlText decodes all standard HTML entities via cheerio", () => {
  const tempFile = path.join(__dirname, "temp_entity.html");
  fs.writeFileSync(
    tempFile,
    `<html><body>
    <h1>Test &amp; Price</h1>
    <p>Cost: &euro;50 &mdash; &copy; 2026 &reg;</p>
  </body></html>`,
    { encoding: "utf8" }
  );
  try {
    const schema = generateSchemaData(tempFile, "article", {});
    const article = schema["@graph"].find((x) => x["@type"] === "Article");
    assert.ok(article.description.includes("Cost: €50"));
    assert.ok(!article.description.includes("&euro;"));
    assert.ok(!article.description.includes("&mdash;"));
  } finally {
    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
  }
});

test("generateSchemaData extracts meta description regardless of attribute order", () => {
  const tempFile = path.join(__dirname, "temp_meta_order.html");
  fs.writeFileSync(
    tempFile,
    `<html><head>
    <meta content="Description first" name="description">
  </head><body>
    <h1>Article Title</h1>
    <p>First paragraph text here.</p>
  </body></html>`,
    { encoding: "utf8" }
  );
  try {
    const schema = generateSchemaData(tempFile, "article", {});
    const article = schema["@graph"].find((x) => x["@type"] === "Article");
    assert.strictEqual(article.description, "Description first");
  } finally {
    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
  }
});

test("auditFile does not count tag names in text as semantic HTML elements", () => {
  const tempFile = path.join(__dirname, "temp_text_tags.html");
  fs.writeFileSync(
    tempFile,
    `<html><body>
    <h1>Test</h1>
    <p>Use the main tag and article element for semantics in your HTML.</p>
  </body></html>`,
    { encoding: "utf8" }
  );
  const originalLog = console.log;
  const logs = [];
  console.log = (message = "") => logs.push(String(message));
  try {
    auditFile(tempFile, {}, "text");
    const output = logs.join("\n");
    // Should flag LACK of semantic tags, not find them in text
    assert.ok(
      output.includes("Lacks HTML5 structural tags") || output.includes("Found only:"),
      "Should not credit tag names appearing in plain text as semantic HTML"
    );
  } finally {
    console.log = originalLog;
    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
  }
});

test("loadConfig validates a correct config without warnings", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "geo-test-"));
  const configPath = path.join(tmpDir, "geo_config.json");
  const validConfig = {
    author: { name: "Test Author", jobTitle: "Writer" },
    publisher: { name: "Test Corp", url: "https://example.com" },
    acronyms: { API: "Application Programming Interface" },
    product: { offer: { price: "49.00", priceCurrency: "USD" } },
  };
  fs.writeFileSync(configPath, JSON.stringify(validConfig));
  try {
    const { config } = loadConfig(configPath);
    assert.strictEqual(config.author.name, "Test Author");
    assert.strictEqual(config.acronyms.API, "Application Programming Interface");
  } finally {
    fs.rmSync(tmpDir, { recursive: true });
  }
});

test("loadConfig exits on invalid config when path is explicit", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "geo-test-"));
  const configPath = path.join(tmpDir, "geo_config.json");
  const invalidConfig = {
    author: { name: 12345 }, // name must be string
  };
  fs.writeFileSync(configPath, JSON.stringify(invalidConfig));
  // loadConfig calls process.exit(1) on explicit invalid config.
  const result = spawnSync(
    "node",
    [
      "-e",
      `import { loadConfig } from "./src/config.js";
loadConfig("${configPath}");`,
    ],
    { cwd: repoRoot, encoding: "utf8" }
  );
  assert.notStrictEqual(result.status, 0, "Invalid explicit config should exit non-zero");
  assert.ok(
    result.stderr.includes("Invalid config"),
    `Expected validation error, got: ${result.stderr}`
  );
  fs.rmSync(tmpDir, { recursive: true });
});

test("extractSections ignores markdown headings inside code blocks", () => {
  const md = `# Title

## Real Section
Content here.

\`\`\`markdown
## Not a real section
## Neither is this
\`\`\`

## Another Real Section
More content.
  `;
  const sections = extractSections(md);
  const headers = sections.map((s) => s.header);
  assert.deepStrictEqual(headers, ["Real Section", "Another Real Section"]);
});

test("auditFile counts multi-line blockquotes via marked AST", () => {
  const tempFile = path.join(__dirname, "temp_multi_quote.md");
  fs.writeFileSync(
    tempFile,
    `# Title
Intro paragraph for defining the topic briefly here, enough words to pass.

> "This is a multi-line
> expert quote that spans
> several lines," said the expert.

Second paragraph with more substantial content and text here.

> Another single-line quote from an authority on the matter.
  `,
    { encoding: "utf8" }
  );
  const originalLog = console.log;
  const logs = [];
  console.log = (message = "") => logs.push(String(message));
  try {
    auditFile(tempFile, {}, "json");
    const report = JSON.parse(logs.join("\n"));
    assert.strictEqual(report.breakdown.quotations.score, 20); // 2 blockquotes = max
  } finally {
    console.log = originalLog;
    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
  }
});

// ═══════════════════════════════════════════════════════════════════
// Whole-website batch capabilities (plans/quizzical-hugging-lollipop)
// ═══════════════════════════════════════════════════════════════════

test("scoreContent returns score and full report object", () => {
  const content =
    "# Test\n\nThis is an introduction paragraph with enough words to reach forty characters easily here yes.\n\n## Section\nBody with 42% evidence.";
  const result = scoreContent(content, "/tmp/test.md", {});
  assert.strictEqual(typeof result.score, "number");
  assert.ok(result.score >= 0 && result.score <= 100);
  assert.ok(typeof result.report, "object");
  assert.ok(result.report.total_score !== undefined);
  assert.ok(Array.isArray(result.report.recommendations));
  assert.ok(result.report.breakdown.structure.score <= 20);
});

test("scoreContent handles empty content gracefully", () => {
  const result = scoreContent("", "/tmp/empty.md", {});
  assert.strictEqual(typeof result.score, "number");
  assert.ok(result.report);
});

test("discoverFiles finds files in directory tree", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "geo-test-"));
  try {
    fs.writeFileSync(path.join(tmpDir, "a.md"), "# A");
    fs.mkdirSync(path.join(tmpDir, "sub"));
    fs.writeFileSync(path.join(tmpDir, "sub", "b.html"), "<h1>B</h1>");
    fs.writeFileSync(path.join(tmpDir, "sub", "c.txt"), "text"); // excluded

    const files = discoverFiles([tmpDir], { recursive: true });
    assert.strictEqual(files.length, 2);
    assert.ok(files.some((f) => f.endsWith("a.md")));
    assert.ok(files.some((f) => f.endsWith("b.html")));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("discoverFiles throws on directory without --recursive", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "geo-test-"));
  try {
    assert.throws(() => discoverFiles([tmpDir], { recursive: false }), /directory/i);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("discoverFiles respects ignore patterns", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "geo-test-"));
  try {
    fs.writeFileSync(path.join(tmpDir, "keep.md"), "# K");
    fs.writeFileSync(path.join(tmpDir, "draft.md"), "# D");
    const files = discoverFiles([tmpDir], {
      recursive: true,
      ignorePatterns: ["draft.md"],
    });
    assert.strictEqual(files.length, 1);
    assert.ok(files[0].endsWith("keep.md"));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("discoverFiles loads .gitignore automatically", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "geo-test-"));
  try {
    fs.writeFileSync(path.join(tmpDir, ".gitignore"), "secret.md\nbuild/\n");
    fs.writeFileSync(path.join(tmpDir, "secret.md"), "# S");
    fs.writeFileSync(path.join(tmpDir, "public.md"), "# P");
    fs.mkdirSync(path.join(tmpDir, "build"));
    fs.writeFileSync(path.join(tmpDir, "build", "out.html"), "<h1>B</h1>");
    const files = discoverFiles([tmpDir], { recursive: true, cwd: tmpDir });
    assert.strictEqual(files.length, 1);
    assert.ok(files[0].endsWith("public.md"));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("discoverFiles skips dot-prefixed entries without .gitignore", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "geo-test-"));
  try {
    // Archivos dot-prefixed deben ser excluidos
    fs.writeFileSync(path.join(tmpDir, ".secret.md"), "# Secret\n\nHidden content here.\n");
    fs.writeFileSync(path.join(tmpDir, "public.md"), "# Public\n\nVisible content here.\n");
    // Subdirectorio dot-prefixed también debe ser excluido
    fs.mkdirSync(path.join(tmpDir, ".hidden"));
    fs.writeFileSync(
      path.join(tmpDir, ".hidden", "inside.md"),
      "# Inside\n\nContent inside hidden dir.\n"
    );
    const files = discoverFiles([tmpDir], { recursive: true });
    assert.strictEqual(files.length, 1, "Only public.md should be discovered");
    assert.ok(files[0].endsWith("public.md"), `Expected public.md, got ${files[0]}`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("aggregateReport computes correct statistics", () => {
  const results = [
    { file: "a.md", status: "success", score: 80, report: { recommendations: ["Add links"] } },
    {
      file: "b.md",
      status: "success",
      score: 60,
      report: { recommendations: ["Add links", "Add quotes"] },
    },
    { file: "c.md", status: "error", error: "not found" },
  ];
  const summary = aggregateReport(results);
  assert.strictEqual(summary.totalFiles, 3);
  assert.strictEqual(summary.succeeded, 2);
  assert.strictEqual(summary.failed, 1);
  assert.strictEqual(summary.averageScore, 70);
  assert.strictEqual(summary.minScore, 60);
  assert.strictEqual(summary.maxScore, 80);
  assert.strictEqual(summary.topRecommendations.length, 2);
  assert.strictEqual(summary.worstFiles.length, 2);
  assert.strictEqual(summary.worstFiles[0].file, "b.md");
});

test("aggregateReport handles zero successes", () => {
  const results = [{ file: "a.md", status: "error", error: "bad" }];
  const summary = aggregateReport(results);
  assert.strictEqual(summary.succeeded, 0);
  assert.strictEqual(summary.failed, 1);
  assert.ok(summary.message);
});

test("auditFiles collects errors without crashing", () => {
  const results = auditFiles(["/nonexistent/file.md"], {});
  assert.strictEqual(results.length, 1);
  assert.strictEqual(results[0].status, "error");
});

test("auditFiles mixes successes and failures", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "geo-test-"));
  try {
    const goodFile = path.join(tmpDir, "good.md");
    fs.writeFileSync(
      goodFile,
      "# Test\n\nIntro paragraph with over forty words of content to reach minimum for scoring here.\n"
    );
    const results = auditFiles([goodFile, "/nonexistent/bad.md"], {});
    assert.strictEqual(results.length, 2);
    const good = results.find((r) => r.status === "success");
    const bad = results.find((r) => r.status === "error");
    assert.ok(good, "should have one success");
    assert.ok(bad, "should have one error");
    assert.strictEqual(typeof good.score, "number");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("CLI audit --recursive finds files in directory", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "geo-test-"));
  try {
    fs.writeFileSync(
      path.join(tmpDir, "test.md"),
      "# Test\n\nContent with 42% evidence and enough words for scoring here.\n"
    );
    const result = spawnSync(
      process.execPath,
      [cliPath, "audit", tmpDir, "--recursive", "--format", "json"],
      { cwd: repoRoot, encoding: "utf8" }
    );
    assert.strictEqual(result.status, 0, result.stderr);
    const payload = JSON.parse(result.stdout);
    // Single file returns object, multiple returns array (legacy behavior)
    const reports = Array.isArray(payload) ? payload : [payload];
    assert.strictEqual(reports.length, 1);
    assert.strictEqual(typeof reports[0].total_score, "number");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("CLI audit --summary produces aggregate report", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "geo-test-"));
  try {
    fs.writeFileSync(
      path.join(tmpDir, "a.md"),
      "# A\n\nIntro paragraph with forty plus words of content for scoring minimum here.\n"
    );
    fs.writeFileSync(
      path.join(tmpDir, "b.md"),
      "# B\n\nAnother intro paragraph with enough words now for scoring requirements.\n"
    );
    const result = spawnSync(
      process.execPath,
      [cliPath, "audit", tmpDir, "--recursive", "--summary", "--format", "json"],
      { cwd: repoRoot, encoding: "utf8" }
    );
    assert.strictEqual(result.status, 0, result.stderr);
    const summary = JSON.parse(result.stdout);
    assert.strictEqual(summary.totalFiles, 2);
    assert.strictEqual(summary.succeeded, 2);
    assert.strictEqual(typeof summary.averageScore, "number");
    assert.strictEqual(typeof summary.medianScore, "number");
    assert.ok(Array.isArray(summary.topRecommendations));
    assert.ok(Array.isArray(summary.worstFiles));
    assert.ok(Array.isArray(summary.perFile));
    assert.ok("distribution" in summary);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("CLI inject --recursive processes multiple files", () => {
  const tmpDir = fs.mkdtempSync(path.join(__dirname, "geo-test-"));
  try {
    fs.writeFileSync(path.join(tmpDir, "page1.md"), "# Page 1\n\nContent.\n");
    fs.writeFileSync(path.join(tmpDir, "page2.md"), "# Page 2\n\nContent.\n");
    const result = spawnSync(
      process.execPath,
      [cliPath, "inject", tmpDir, "article", "--recursive", "--dry-run"],
      { cwd: repoRoot, encoding: "utf8" }
    );
    assert.strictEqual(result.status, 0, result.stderr);
    assert.ok(
      result.stdout.includes("2 file(s)"),
      `Expected 2 files in dry-run output, got: ${result.stdout}`
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("batchInject injects schema and branding into markdown files", () => {
  const tmpDir = fs.mkdtempSync(path.join(__dirname, "geo-test-"));
  try {
    const goodFile = path.join(tmpDir, "test.md");
    fs.writeFileSync(goodFile, "# Test\n\nBody content here.\n");
    const result = batchInject([goodFile], "article", {});
    assert.strictEqual(result.successCount, 1);
    assert.strictEqual(result.failCount, 0);
    const content = fs.readFileSync(goodFile, "utf8");
    assert.ok(content.includes("```json"), "Should contain JSON-LD block");
    assert.ok(content.includes("Optimized with [Tooltician]"), "Should contain branding");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ═══════════════════════════════════════════════════════════════════
// CLI error-path coverage (plan 016)
// ═══════════════════════════════════════════════════════════════════

test("CLI audit without files and without --recursive exits with error", () => {
  const result = spawnSync(process.execPath, [cliPath, "audit"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  assert.strictEqual(result.status, 1);
  assert.match(result.stderr, /Missing file path/);
});

test("CLI audit with invalid --format exits with error", () => {
  const tmpDir = fs.mkdtempSync(path.join(__dirname, "geo-test-"));
  const testFile = path.join(tmpDir, "test.md");
  fs.writeFileSync(testFile, "# Test\n\nContent.\n");
  try {
    const result = spawnSync(process.execPath, [cliPath, "audit", testFile, "--format", "xml"], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    assert.strictEqual(result.status, 1);
    assert.match(result.stderr, /--format must be/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("CLI audit with invalid --threshold exits with error", () => {
  const tmpDir = fs.mkdtempSync(path.join(__dirname, "geo-test-"));
  const testFile = path.join(tmpDir, "test.md");
  fs.writeFileSync(testFile, "# Test\n\nContent.\n");
  try {
    const result = spawnSync(process.execPath, [cliPath, "audit", testFile, "--threshold", "abc"], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    assert.strictEqual(result.status, 1);
    assert.match(result.stderr, /--threshold must be an integer/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("CLI audit --summary without --format json shows text output", () => {
  const tmpDir = fs.mkdtempSync(path.join(__dirname, "geo-test-"));
  try {
    fs.writeFileSync(
      path.join(tmpDir, "a.md"),
      "# A\n\nIntro paragraph with over forty words of content to score properly here.\n"
    );
    const result = spawnSync(
      process.execPath,
      [cliPath, "audit", tmpDir, "--recursive", "--summary"],
      { cwd: repoRoot, encoding: "utf8" }
    );
    assert.strictEqual(result.status, 0, result.stderr);
    assert.ok(
      result.stdout.includes("SITE SUMMARY") || result.stdout.includes("GEO OPTIMIZATION"),
      "Should output text report"
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("CLI inject --backup creates .bak file", () => {
  const tmpDir = fs.mkdtempSync(path.join(__dirname, "geo-test-"));
  const testFile = path.join(tmpDir, "original.md");
  const backupFile = testFile + ".bak";
  fs.writeFileSync(testFile, "# Original\n\nContent here.\n");
  try {
    const result = spawnSync(
      process.execPath,
      [cliPath, "inject", testFile, "article", "--backup"],
      { cwd: repoRoot, encoding: "utf8" }
    );
    assert.strictEqual(result.status, 0, result.stderr);
    assert.ok(fs.existsSync(backupFile), "Backup file should exist");
    assert.strictEqual(fs.readFileSync(backupFile, "utf8"), "# Original\n\nContent here.\n");
    assert.ok(
      fs.readFileSync(testFile, "utf8").includes("```json"),
      "Original should contain injected schema"
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("CLI inject --recursive without --dry-run writes files", () => {
  const tmpDir = fs.mkdtempSync(path.join(__dirname, "geo-test-"));
  try {
    fs.writeFileSync(path.join(tmpDir, "page1.md"), "# Page 1\n\nContent here.\n");
    fs.writeFileSync(path.join(tmpDir, "page2.md"), "# Page 2\n\nContent here.\n");
    const result = spawnSync(
      process.execPath,
      [cliPath, "inject", tmpDir, "article", "--recursive"],
      { cwd: repoRoot, encoding: "utf8" }
    );
    assert.strictEqual(result.status, 0, result.stderr);
    assert.ok(
      result.stdout.includes("Injected 2 file"),
      `Expected success message, got: ${result.stdout}`
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("CLI llmstxt audit with missing file exits with error", () => {
  const result = spawnSync(
    process.execPath,
    [cliPath, "llmstxt", "audit", "/nonexistent/llms.txt"],
    { cwd: repoRoot, encoding: "utf8" }
  );
  assert.strictEqual(result.status, 1);
  assert.match(result.stderr, /not found/);
});

test("CLI llmstxt audit --recursive reports coverage", () => {
  const tmpDir = fs.mkdtempSync(path.join(__dirname, "geo-test-"));
  try {
    const llmsContent = `# Test Site

> A test.

## Pages

- [Home](https://example.com/): The homepage.
`;
    fs.writeFileSync(path.join(tmpDir, "llms.txt"), llmsContent);
    fs.writeFileSync(
      path.join(tmpDir, "index.md"),
      "# Home\n\nWelcome to the test site with enough words for description.\n"
    );
    fs.writeFileSync(
      path.join(tmpDir, "about.md"),
      "# About\n\nAbout page with enough words here for description text.\n"
    );

    const result = spawnSync(
      process.execPath,
      [cliPath, "llmstxt", "audit", path.join(tmpDir, "llms.txt"), "--recursive"],
      { cwd: tmpDir, encoding: "utf8" }
    );
    assert.ok(
      result.stdout.includes("Missing") || result.stdout.includes("not listed"),
      "Should report missing files from coverage"
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("CLI config with invalid action exits with error", () => {
  const result = spawnSync(process.execPath, [cliPath, "config", "delete", "reminders"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  assert.strictEqual(result.status, 1);
  assert.match(result.stderr, /Usage:|Error:/);
});

test("CLI config set with invalid value exits with error", () => {
  const result = spawnSync(process.execPath, [cliPath, "config", "set", "reminders", "maybe"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  assert.strictEqual(result.status, 1);
  assert.match(result.stderr, /true or false/);
});

test("CLI init creates geo_config.json", () => {
  const tmpDir = fs.mkdtempSync(path.join(__dirname, "geo-test-"));
  try {
    const result = spawnSync(process.execPath, [cliPath, "init"], {
      cwd: tmpDir,
      encoding: "utf8",
    });
    assert.strictEqual(result.status, 0, result.stderr);
    assert.ok(fs.existsSync(path.join(tmpDir, "geo_config.json")), "Config file should exist");
    const config = JSON.parse(fs.readFileSync(path.join(tmpDir, "geo_config.json"), "utf8"));
    assert.ok(config.author, "Should have author section");
    assert.ok(config.publisher, "Should have publisher section");
    assert.ok(config.acronyms, "Should have acronyms section");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("CLI init without --force when file exists exits with error", () => {
  const tmpDir = fs.mkdtempSync(path.join(__dirname, "geo-test-"));
  try {
    fs.writeFileSync(path.join(tmpDir, "geo_config.json"), "{}");
    const result = spawnSync(process.execPath, [cliPath, "init"], {
      cwd: tmpDir,
      encoding: "utf8",
    });
    assert.strictEqual(result.status, 1);
    assert.match(result.stderr, /already exists/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("CLI init --force overwrites existing file", () => {
  const tmpDir = fs.mkdtempSync(path.join(__dirname, "geo-test-"));
  try {
    fs.writeFileSync(path.join(tmpDir, "geo_config.json"), "{}");
    const result = spawnSync(process.execPath, [cliPath, "init", "--force"], {
      cwd: tmpDir,
      encoding: "utf8",
    });
    assert.strictEqual(result.status, 0, result.stderr);
    const config = JSON.parse(fs.readFileSync(path.join(tmpDir, "geo_config.json"), "utf8"));
    assert.ok(config.author, "Should have overwritten with template");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("CLI with no arguments shows help and exits 0", () => {
  const result = spawnSync(process.execPath, [cliPath], { cwd: repoRoot, encoding: "utf8" });
  assert.strictEqual(result.status, 0);
  assert.ok(
    result.stdout.includes("Usage:") || result.stdout.includes("Commands:"),
    "Should show help"
  );
});

// ═══════════════════════════════════════════════════════════════════
// llms.txt generation, audit, and robots.txt generation
// ═══════════════════════════════════════════════════════════════════

test("extractPageMetadata extracts title and description from markdown", () => {
  const md = `# My Test Page

This is an introduction paragraph that describes what the page is about in sufficient detail.

## Section One
Content here.

## Section Two
More content.`;
  const meta = extractPageMetadata(md, "/tmp/test.md");
  assert.strictEqual(meta.title, "My Test Page");
  assert.ok(meta.description.length > 10);
  assert.strictEqual(meta.sections.length, 2);
});

test("extractPageMetadata handles missing title gracefully", () => {
  const md = "Just some content without a heading.\n\nMore text here.";
  const meta = extractPageMetadata(md, "/tmp/notitle.md");
  assert.strictEqual(meta.title, "notitle");
});

test("generateLlmsTxt produces valid structure with all sections", () => {
  const entries = [
    { title: "Home", description: "Welcome page", url: "https://example.com/", section: "Main" },
    {
      title: "API",
      description: "API reference",
      url: "https://example.com/docs/api",
      section: "Docs",
    },
    { title: "Old Archive", description: "2024 posts", url: "https://example.com/archive" },
  ];
  const result = generateLlmsTxt(entries, {
    siteTitle: "Test Site",
    siteDescription: "A test site.",
  });
  assert.ok(result.startsWith("# Test Site"));
  assert.ok(result.includes("> A test site."));
  assert.ok(result.includes("## Main"));
  assert.ok(result.includes("## Docs"));
  assert.ok(result.includes("[Home](https://example.com/)"));
  assert.ok(result.includes("[API](https://example.com/docs/api)"));
  assert.ok(result.includes("[Old Archive](https://example.com/archive)"));
});

test("generateLlmsTxt puts explicit optional entries in Optional section", () => {
  const entries = [
    { title: "Good", url: "https://example.com/good", description: "x" },
    { title: "Supplemental", url: "https://example.com/extra", description: "x", optional: true },
  ];
  const result = generateLlmsTxt(entries, { siteTitle: "Test" });
  assert.ok(result.includes("## Optional"), "Should have Optional section");
  assert.ok(result.includes("[Supplemental]"), "Optional entry should appear");
  const mainStart = result.indexOf("## ");
  const optionalStart = result.indexOf("## Optional");
  assert.ok(optionalStart > mainStart, "Optional should come after main sections");
});

test("generateLlmsTxt without optionalThreshold does not move low-score pages", () => {
  const entries = [
    { title: "Good", url: "https://example.com/good", description: "x", score: 80 },
    { title: "Weak", url: "https://example.com/weak", description: "x", score: 30 },
  ];
  // No optionalThreshold — score should not influence section placement
  const result = generateLlmsTxt(entries, { siteTitle: "Test" });
  assert.ok(!result.includes("## Optional"), "Should not have Optional section when no threshold");
  assert.ok(result.includes("[Weak]"), "Low-score entry should appear in normal section");
});

test("generateLlmsTxt optionalThreshold still works as deprecated opt-in", () => {
  const entries = [
    { title: "Good", url: "https://example.com/good", description: "x", score: 80 },
    { title: "Weak", url: "https://example.com/weak", description: "x", score: 30 },
  ];
  const result = generateLlmsTxt(entries, { siteTitle: "Test", optionalThreshold: 50 });
  assert.ok(result.includes("## Optional"), "Deprecated opt-in should still work");
  assert.ok(result.includes("[Weak]"), "Low-score entry should be in Optional");
});

test("generateLlmsFullTxt compiles full page content", () => {
  const entries = [
    {
      title: "Page One",
      url: "https://example.com/one",
      content: "# Page One\n\nFirst paragraph here.\n\nSecond paragraph.",
    },
  ];
  const result = generateLlmsFullTxt(entries, { siteTitle: "Test" });
  assert.ok(result.includes("# Test — Full Content"));
  assert.ok(result.includes("## [Page One](https://example.com/one)"));
  assert.ok(result.includes("First paragraph here."));
  assert.ok(result.includes("Second paragraph."));
});

test("auditLlmsTxt reports valid llms.txt as valid", () => {
  const content = `# My Site

> A sample site.

## Pages

- [Home](https://example.com/): The homepage.
- [About](https://example.com/about): About us.
`;
  const report = auditLlmsTxt(content);
  assert.strictEqual(report.valid, true);
  assert.strictEqual(report.issues.length, 0);
});

test("auditLlmsTxt detects missing H1 (hard error) and blockquote as note", () => {
  const content = `## Pages

- [Home](https://example.com/): Homepage.
`;
  const report = auditLlmsTxt(content);
  // Missing H1 is the only hard error per the llmstxt.org proposal
  assert.strictEqual(report.valid, false);
  assert.ok(
    report.issues.some((i) => i.includes("H1")),
    "Should report missing H1 as an issue"
  );
  // Missing blockquote is informational, not an error
  assert.ok(Array.isArray(report.notes), "Should have notes array");
  assert.ok(
    report.notes.some((n) => n.includes("blockquote")),
    "Should note missing blockquote as a recommendation"
  );
  assert.ok(
    !report.issues.some((i) => i.includes("blockquote")),
    "Missing blockquote should not be a hard issue"
  );
});

test("auditLlmsTxt returns notes and warnings fields", () => {
  const content = `# My Site

> A sample site.

## Pages

- [Home](https://example.com/): The homepage.
- [Home](https://example.com/): Duplicate link.
- [Admin](https://example.com/admin): Admin panel.
`;
  const report = auditLlmsTxt(content);
  assert.ok(Array.isArray(report.notes), "Should have notes array");
  assert.ok(Array.isArray(report.warnings), "Should have warnings array");
  assert.ok(
    report.warnings.some((w) => w.includes("Duplicate")),
    "Should warn about duplicate URL"
  );
  assert.ok(
    report.warnings.some((w) => w.includes("private")),
    "Should warn about private-looking path"
  );
});

test("auditLlmsTxt: H1-only content is valid with notes", () => {
  const content = `# My Minimal Site\n`;
  const report = auditLlmsTxt(content);
  // H1 is the only hard requirement; missing blockquote/H2 are notes only
  assert.strictEqual(report.valid, true, "H1-only content should be valid");
  assert.strictEqual(report.issues.length, 0, "Should have no hard issues");
  assert.ok(report.notes.length > 0, "Should have informational notes");
});

test("generateRobotsTxt includes all AI crawlers and disallow paths", () => {
  const result = generateRobotsTxt({
    disallowPaths: ["/admin", "/api"],
    sitemapUrl: "https://example.com/sitemap.xml",
  });
  assert.ok(result.includes("GPTBot"));
  assert.ok(result.includes("ClaudeBot"));
  assert.ok(result.includes("Google-Extended"));
  assert.ok(result.includes("PerplexityBot"));
  assert.ok(result.includes("Disallow: /admin"));
  assert.ok(result.includes("Disallow: /api"));
  assert.ok(result.includes("Sitemap: https://example.com/sitemap.xml"));
});

test("generateRobotsTxt uses default disallow when none provided", () => {
  const result = generateRobotsTxt();
  assert.ok(result.includes("Disallow: /admin"));
  assert.ok(result.includes("Disallow: /api"));
  assert.ok(result.includes("Disallow: /private"));
});

test("crawler registry is purpose-aware and retains the compatibility export", () => {
  const byToken = new Map(AI_CRAWLER_REGISTRY.map((entry) => [entry.token, entry]));
  assert.strictEqual(byToken.get("OAI-SearchBot").purpose, "search");
  assert.strictEqual(byToken.get("GPTBot").purpose, "training");
  assert.strictEqual(byToken.get("Claude-User").purpose, "user");
  assert.strictEqual(byToken.get("Perplexity-User").robotsApplicable, false);
  assert.strictEqual(byToken.get("Google-Extended").purpose, "control");
  assert.deepStrictEqual(
    AI_CRAWLER_AGENTS,
    AI_CRAWLER_REGISTRY.map(({ token }) => token)
  );
  for (const entry of AI_CRAWLER_REGISTRY) {
    assert.ok(entry.officialSource);
    assert.match(entry.lastVerified, /^\d{4}-\d{2}-\d{2}$/);
  }
});

test("search-visible preset preserves sensitive paths in every specific allow group", () => {
  const content = generateRobotsTxt();
  const root = auditRobots(content);
  const admin = auditRobots(content, { path: "/admin/settings" });

  for (const token of ["OAI-SearchBot", "Claude-SearchBot", "PerplexityBot"]) {
    assert.strictEqual(
      root.agents.find((entry) => entry.token === token).allowed,
      true,
      `${token} should be allowed at root`
    );
  }
  assert.strictEqual(
    root.agents.find((entry) => entry.token === "GPTBot").allowed,
    false,
    "training crawler should be blocked by default"
  );
  for (const entry of admin.agents.filter(({ matchedGroup }) => matchedGroup?.[0] !== "*")) {
    assert.strictEqual(entry.allowed, false, `${entry.token} should not bypass /admin`);
  }
});

test("open preset is explicit, preserves disallows, and rejects unknown presets", () => {
  const content = generateRobotsTxt({ preset: "open", disallowPaths: ["private"] });
  assert.ok(auditRobots(content).agents.every(({ allowed }) => allowed));
  assert.ok(
    auditRobots(content, { path: "/private/record" }).agents.every(({ allowed }) => !allowed)
  );
  assert.throws(() => generateRobotsTxt({ preset: "invalid" }), /Unknown robots\.txt/);
});

test("auditRobots applies longest-rule precedence and grouped user agents", () => {
  const content = `User-agent: OAI-SearchBot
User-agent: Claude-SearchBot
Disallow:
Disallow: /private
Allow: /private/public
`;
  const publicReport = auditRobots(content, { path: "/private/public/article" });
  const privateReport = auditRobots(content, { path: "/private/draft" });
  for (const token of ["OAI-SearchBot", "Claude-SearchBot"]) {
    assert.strictEqual(publicReport.agents.find((entry) => entry.token === token).allowed, true);
    assert.strictEqual(privateReport.agents.find((entry) => entry.token === token).allowed, false);
  }
});

// CLI integration tests
test("CLI robots generate --dry-run outputs expected content", () => {
  const result = spawnSync(process.execPath, [cliPath, "robots", "generate", "--dry-run"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  assert.strictEqual(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes("GPTBot"), "Should include GPTBot");
  assert.ok(result.stdout.includes("Allow: /"), "Should allow root");
  assert.ok(result.stdout.includes("[dry-run]"), "Should mark as dry-run");
});

test("CLI robots audit JSON distinguishes crawler purposes", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "geo-robots-"));
  const robotsPath = path.join(tmpDir, "robots.txt");
  fs.writeFileSync(robotsPath, generateRobotsTxt(), "utf8");
  try {
    const result = spawnSync(
      process.execPath,
      [cliPath, "robots", "audit", robotsPath, "--format", "json"],
      { cwd: repoRoot, encoding: "utf8" }
    );
    assert.strictEqual(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.deepStrictEqual(
      new Set(report.agents.map(({ purpose }) => purpose)),
      new Set(["search", "training", "user", "control", "legacy"])
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("CLI llmstxt generate --dry-run outputs expected content", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "geo-test-"));
  try {
    fs.writeFileSync(
      path.join(tmpDir, "index.md"),
      "# Home\n\nWelcome to our test site with enough words to describe the project here.\n"
    );
    fs.writeFileSync(
      path.join(tmpDir, "about.md"),
      "# About\n\nAbout our company with sufficient detail for the description text.\n"
    );
    const result = spawnSync(
      process.execPath,
      [
        cliPath,
        "llmstxt",
        "generate",
        tmpDir,
        "--recursive",
        "--site-url",
        "https://example.com",
        "--title",
        "Test Site",
        "--description",
        "A test site for GEO.",
        "--dry-run",
      ],
      { cwd: repoRoot, encoding: "utf8" }
    );
    assert.strictEqual(result.status, 0, result.stderr);
    assert.ok(result.stdout.includes("# Test Site"), "Should have site title");
    assert.ok(result.stdout.includes("> A test site for GEO."), "Should have description");
    assert.ok(
      result.stdout.includes("Welcome to our test site"),
      "Should include page description"
    );
    assert.ok(result.stdout.includes("[dry-run]"), "Should mark as dry-run");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ── Plan 021: Finding contract and evidence registry ──

test("createFinding returns a valid finding with required fields", () => {
  const f = createFinding({
    ruleId: "content.answer_first",
    category: "structure",
    severity: "warn",
    message: "Intro paragraph has 26 words.",
    evidenceLabel: "experimental",
    sourceRefs: ["geo-kdd-2024"],
    observedFacts: { wordCount: 26 },
    remediation: "Consider a longer intro.",
  });
  assert.strictEqual(f.ruleId, "content.answer_first");
  assert.strictEqual(f.category, "structure");
  assert.strictEqual(f.severity, "warn");
  assert.strictEqual(f.status, "warn");
  assert.strictEqual(f.evidenceLabel, "experimental");
  assert.deepStrictEqual(f.sourceRefs, ["geo-kdd-2024"]);
  assert.deepStrictEqual(f.observedFacts, { wordCount: 26 });
  assert.strictEqual(f.remediation, "Consider a longer intro.");
  assert.strictEqual(f.applicability, "common");
});

test("createFinding throws on invalid evidence label", () => {
  assert.throws(
    () =>
      createFinding({
        ruleId: "test.rule",
        category: "structure",
        severity: "warn",
        message: "test",
        evidenceLabel: "invalid-label",
      }),
    /Invalid evidenceLabel/
  );
});

test("createFinding throws on unknown source ref", () => {
  assert.throws(
    () =>
      createFinding({
        ruleId: "test.rule",
        category: "structure",
        severity: "warn",
        message: "test",
        evidenceLabel: "heuristic",
        sourceRefs: ["nonexistent-ref"],
      }),
    /Unknown source refs/
  );
});

test("validateSourceRefs detects missing entries", () => {
  const { valid, missing } = validateSourceRefs(["geo-kdd-2024", "fake-ref"]);
  assert.strictEqual(valid, false);
  assert.deepStrictEqual(missing, ["fake-ref"]);
});

test("validateSourceRefs returns valid for known entries", () => {
  const { valid, missing } = validateSourceRefs(["geo-kdd-2024", "what-gets-cited-2025"]);
  assert.strictEqual(valid, true);
  assert.deepStrictEqual(missing, []);
});

test("staleEvidenceWarnings returns warnings for old entries", () => {
  const warnings = staleEvidenceWarnings(1); // all entries are stale after 1 day
  assert.ok(warnings.length > 0);
  assert.ok(warnings.some((w) => w.includes("geo-kdd-2024")));
});

test("scoreContent report includes findings with stable ruleIds", () => {
  const content =
    "# Test\n\nThis is a test document with enough words to form a reasonable intro paragraph for scoring purposes here.\n\n## Section\n\nMore content goes here with additional details.\n\n> A quote from an expert.\n\nSee https://example.com for more.\n\n## Sources\n\n- Source 1";
  const { report } = scoreContent(content, "test.md", {});
  assert.ok(Array.isArray(report.findings), "report must include findings array");
  assert.ok(report.findings.length >= 8, "should have at least 8 findings");
  // Verify stable ruleIds exist
  const ruleIds = report.findings.map((f) => f.ruleId);
  assert.ok(ruleIds.includes("content.intro_definition"));
  assert.ok(ruleIds.includes("content.tables"));
  assert.ok(ruleIds.includes("content.lists"));
  assert.ok(ruleIds.includes("content.headings"));
  assert.ok(ruleIds.includes("content.statistics_density"));
  assert.ok(ruleIds.includes("content.quotation_density"));
  assert.ok(ruleIds.includes("content.citation_links"));
  assert.ok(ruleIds.includes("content.references_section"));
  assert.ok(ruleIds.includes("content.pronoun_density"));
  assert.ok(ruleIds.includes("content.acronym_clarity"));
  // Every finding has required fields
  for (const f of report.findings) {
    assert.ok(typeof f.ruleId === "string", `ruleId must be string, got ${typeof f.ruleId}`);
    assert.ok(typeof f.category === "string");
    assert.ok(["pass", "warn", "fail", "not_applicable"].includes(f.severity));
    assert.ok(typeof f.message === "string");
    assert.ok(["strong", "probable", "experimental", "heuristic"].includes(f.evidenceLabel));
    assert.ok(typeof f.remediation === "string" || f.remediation === null);
  }
});

test("scoreContent report preserves legacy scores with additive findings", () => {
  const content = "# Test\n\nShort intro.\n\n## Section\n\nContent here.";
  const { report } = scoreContent(content, "test.md", {});
  // Legacy fields untouched
  assert.ok(typeof report.total_score === "number");
  assert.ok(typeof report.breakdown === "object");
  assert.ok(Array.isArray(report.recommendations));
  assert.ok(typeof report.breakdown.structure.score === "number");
  // New additive fields
  assert.ok(report.reportVersion === REPORT_VERSION);
  assert.ok(report.modelVersion === MODEL_VERSION);
  assert.ok(typeof report.generatedAt === "string");
  // ISO 8601 timestamp
  assert.ok(!isNaN(Date.parse(report.generatedAt)));
});

test("aggregateReport includes topFindings by ruleId", () => {
  const results = [
    {
      file: "a.md",
      status: "success",
      score: 50,
      report: {
        findings: [
          {
            ruleId: "content.tables",
            category: "structure",
            severity: "warn",
            evidenceLabel: "heuristic",
            message: "No tables found.",
          },
          {
            ruleId: "content.lists",
            category: "structure",
            severity: "pass",
            evidenceLabel: "heuristic",
            message: "Lists present.",
          },
        ],
        recommendations: ["Add tables."],
      },
    },
    {
      file: "b.md",
      status: "success",
      score: 70,
      report: {
        findings: [
          {
            ruleId: "content.tables",
            category: "structure",
            severity: "warn",
            evidenceLabel: "heuristic",
            message: "No tables found.",
          },
          {
            ruleId: "content.lists",
            category: "structure",
            severity: "warn",
            evidenceLabel: "heuristic",
            message: "No lists found.",
          },
        ],
        recommendations: ["Add tables.", "Add lists."],
      },
    },
  ];
  const agg = aggregateReport(results);
  assert.ok(agg.topRecommendations, "legacy topRecommendations preserved");
  assert.ok(agg.topFindings, "topFindings must exist");
  assert.ok(agg.topFindings.length >= 1);
  // "content.tables" should appear in 2 files (warn in both), "content.lists" in 1 (only b is warn)
  const tablesFinding = agg.topFindings.find((f) => f.ruleId === "content.tables");
  assert.ok(tablesFinding);
  assert.strictEqual(tablesFinding.fileCount, 2);
  // Pass findings are excluded
  assert.ok(!agg.topFindings.some((f) => f.ruleId === "content.lists" && f.fileCount === 0));
});

test("buildReportMeta returns current versions and timestamp", () => {
  const meta = buildReportMeta();
  assert.strictEqual(meta.reportVersion, REPORT_VERSION);
  assert.strictEqual(meta.modelVersion, MODEL_VERSION);
  assert.ok(!isNaN(Date.parse(meta.generatedAt)));
});

test("CLI audit JSON output includes findings and report metadata", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "geo-test-"));
  try {
    const testFile = path.join(tmpDir, "test.md");
    fs.writeFileSync(
      testFile,
      "# Test\n\nThis is a test document with enough words to form a reasonable intro paragraph for scoring.\n\n## Section\n\nMore content."
    );
    const result = spawnSync(process.execPath, [cliPath, "audit", testFile, "--format", "json"], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    assert.strictEqual(result.status, 0, result.stderr);
    const parsed = JSON.parse(result.stdout);
    assert.ok(Array.isArray(parsed.findings), "JSON output includes findings");
    assert.ok(parsed.reportVersion, "reportVersion present in JSON output");
    assert.ok(parsed.modelVersion, "modelVersion present in JSON output");
    assert.ok(parsed.generatedAt, "generatedAt present in JSON output");
    // Verify finding structure in CLI output
    for (const f of parsed.findings) {
      assert.ok(typeof f.ruleId === "string");
      assert.ok(typeof f.evidenceLabel === "string");
      assert.ok(typeof f.severity === "string");
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("CLI audit --explain shows evidence labels in text output", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "geo-test-"));
  try {
    const testFile = path.join(tmpDir, "test.md");
    fs.writeFileSync(testFile, "# Test\n\nShort.\n\n## Section\n\nContent.");
    const result = spawnSync(process.execPath, [cliPath, "audit", testFile, "--explain"], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    assert.strictEqual(result.status, 0, result.stderr);
    // --explain output should include the evidence header
    assert.ok(
      result.stdout.includes("Evidence & Sources"),
      "Should show evidence header with --explain"
    );
    assert.ok(
      result.stdout.includes("[experimental]") || result.stdout.includes("[heuristic]"),
      "Should show evidence labels with --explain"
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ═══ Plan 038 — Pro schema types ═══

const PRO_KEY = "tt_pro_AAAAAAAAAAAAAAAAAAAA";
const proConfig = { license: { key: PRO_KEY } };

test("COMMUNITY_SCHEMA_TYPES and PRO_SCHEMA_TYPES are disjoint sets", () => {
  for (const type of PRO_SCHEMA_TYPES) {
    assert.ok(
      !COMMUNITY_SCHEMA_TYPES.has(type),
      `"${type}" must not appear in COMMUNITY_SCHEMA_TYPES`
    );
  }
  for (const type of COMMUNITY_SCHEMA_TYPES) {
    assert.ok(!PRO_SCHEMA_TYPES.has(type), `"${type}" must not appear in PRO_SCHEMA_TYPES`);
  }
  assert.deepStrictEqual([...COMMUNITY_SCHEMA_TYPES].sort(), [
    "article",
    "faq",
    "news-article",
    "product",
  ]);
  assert.deepStrictEqual([...PRO_SCHEMA_TYPES].sort(), ["course", "event", "howto", "recipe"]);
});

test("generateSchemaData blocks Pro type without Pro license", () => {
  const tempFile = path.join(os.tmpdir(), "pro-gate-test.md");
  fs.writeFileSync(tempFile, "# Test\n\nContent.\n");
  try {
    for (const type of PRO_SCHEMA_TYPES) {
      assert.throws(
        () => generateSchemaData(tempFile, type, {}),
        (err) => {
          assert.ok(
            err.message.includes("Pro license"),
            `Expected Pro license error for "${type}"`
          );
          return true;
        }
      );
    }
  } finally {
    fs.unlinkSync(tempFile);
  }
});

test("generateSchemaData rejects unknown schema type with helpful message", () => {
  const tempFile = path.join(os.tmpdir(), "unknown-type-test.md");
  fs.writeFileSync(tempFile, "# Test\n\nContent.\n");
  try {
    assert.throws(
      () => generateSchemaData(tempFile, "blogpost", {}),
      (err) => {
        assert.ok(err.message.includes("Community types"), "Should list community types");
        assert.ok(err.message.includes("Pro types"), "Should list Pro types");
        return true;
      }
    );
  } finally {
    fs.unlinkSync(tempFile);
  }
});

test("generateSchemaData generates Course schema (Pro)", () => {
  const tempFile = path.join(os.tmpdir(), "course-test.md");
  fs.writeFileSync(
    tempFile,
    "# Introduction to Machine Learning\n\nLearn the fundamentals of ML from scratch.\n\n## What you will learn\nNeural networks and deep learning basics.\n"
  );
  try {
    const schema = generateSchemaData(tempFile, "course", {
      ...proConfig,
      course: { provider: "Tooltician Academy" },
    });
    assert.strictEqual(schema["@context"], "https://schema.org");
    const course = schema["@graph"].find((n) => n["@type"] === "Course");
    assert.ok(course, "Should contain a Course node");
    assert.strictEqual(course.name, "Introduction to Machine Learning");
    assert.ok(course.description, "Should have a description");
    assert.deepStrictEqual(course.provider, {
      "@type": "Organization",
      name: "Tooltician Academy",
    });
  } finally {
    fs.unlinkSync(tempFile);
  }
});

test("generateSchemaData generates Course schema using publisher as provider fallback (Pro)", () => {
  const tempFile = path.join(os.tmpdir(), "course-publisher-test.md");
  fs.writeFileSync(tempFile, "# Advanced CSS\n\nMaster modern CSS techniques.\n");
  try {
    const schema = generateSchemaData(tempFile, "course", {
      ...proConfig,
      publisher: { name: "Tooltician", url: "https://tooltician.com" },
    });
    const course = schema["@graph"].find((n) => n["@type"] === "Course");
    assert.ok(course, "Should contain a Course node");
    assert.ok(course.provider, "Should have provider from publisher");
  } finally {
    fs.unlinkSync(tempFile);
  }
});

test("generateSchemaData generates Event schema with startDate and location (Pro)", () => {
  const tempFile = path.join(os.tmpdir(), "event-test.md");
  fs.writeFileSync(
    tempFile,
    "# GEO Summit 2026\n\nThe premier event for AI discoverability professionals.\n"
  );
  try {
    const schema = generateSchemaData(tempFile, "event", {
      ...proConfig,
      event: { startDate: "2026-09-15", endDate: "2026-09-16", location: "San Francisco, CA" },
    });
    const event = schema["@graph"].find((n) => n["@type"] === "Event");
    assert.ok(event, "Should contain an Event node");
    assert.strictEqual(event.name, "GEO Summit 2026");
    assert.strictEqual(event.startDate, "2026-09-15");
    assert.strictEqual(event.endDate, "2026-09-16");
    assert.deepStrictEqual(event.location, { "@type": "Place", name: "San Francisco, CA" });
  } finally {
    fs.unlinkSync(tempFile);
  }
});

test("generateSchemaData generates Event schema without optional fields when unconfigured (Pro)", () => {
  const tempFile = path.join(os.tmpdir(), "event-minimal-test.md");
  fs.writeFileSync(tempFile, "# Webinar: GEO Basics\n\nA free online webinar.\n");
  try {
    const schema = generateSchemaData(tempFile, "event", proConfig);
    const event = schema["@graph"].find((n) => n["@type"] === "Event");
    assert.ok(event, "Should contain an Event node");
    assert.strictEqual(event.startDate, undefined);
    assert.strictEqual(event.location, undefined);
    assert.strictEqual(event.endDate, undefined);
  } finally {
    fs.unlinkSync(tempFile);
  }
});

test("generateSchemaData generates Recipe schema with extracted ingredients and steps (Pro)", () => {
  const tempFile = path.join(os.tmpdir(), "recipe-test.md");
  fs.writeFileSync(
    tempFile,
    `# Classic Banana Bread

Moist and delicious banana bread recipe.

## Ingredients
- 3 ripe bananas
- 1/3 cup melted butter
- 3/4 cup sugar

## Instructions
1. Preheat oven to 175°C
2. Mash bananas in a bowl
3. Mix in butter and sugar
4. Pour into loaf pan and bake 60 minutes
`
  );
  try {
    const schema = generateSchemaData(tempFile, "recipe", {
      ...proConfig,
      recipe: { totalTime: "PT1H15M", recipeYield: "1 loaf" },
    });
    const recipe = schema["@graph"].find((n) => n["@type"] === "Recipe");
    assert.ok(recipe, "Should contain a Recipe node");
    assert.strictEqual(recipe.name, "Classic Banana Bread");
    assert.ok(Array.isArray(recipe.recipeIngredient), "Should have recipeIngredient array");
    assert.strictEqual(recipe.recipeIngredient.length, 3);
    assert.ok(recipe.recipeIngredient.includes("3 ripe bananas"));
    assert.ok(Array.isArray(recipe.recipeInstructions), "Should have recipeInstructions array");
    assert.strictEqual(recipe.recipeInstructions.length, 4);
    assert.strictEqual(recipe.recipeInstructions[0]["@type"], "HowToStep");
    assert.strictEqual(recipe.recipeInstructions[0].text, "Preheat oven to 175°C");
    assert.strictEqual(recipe.totalTime, "PT1H15M");
    assert.strictEqual(recipe.recipeYield, "1 loaf");
  } finally {
    fs.unlinkSync(tempFile);
  }
});

test("generateSchemaData generates Recipe with empty arrays when no structured content found (Pro)", () => {
  const tempFile = path.join(os.tmpdir(), "recipe-minimal-test.md");
  fs.writeFileSync(tempFile, "# Simple Recipe\n\nA quick and easy dish.\n");
  try {
    const schema = generateSchemaData(tempFile, "recipe", proConfig);
    const recipe = schema["@graph"].find((n) => n["@type"] === "Recipe");
    assert.ok(recipe, "Should contain a Recipe node");
    assert.deepStrictEqual(recipe.recipeIngredient, []);
    assert.deepStrictEqual(recipe.recipeInstructions, []);
  } finally {
    fs.unlinkSync(tempFile);
  }
});

test("generateSchemaData generates HowTo schema from H2 sections (Pro)", () => {
  const tempFile = path.join(os.tmpdir(), "howto-test.md");
  fs.writeFileSync(
    tempFile,
    `# How to Deploy a Node.js App

Step-by-step guide to deploying on any cloud provider.

## Install dependencies
Run npm install to install all required packages.

## Configure environment
Set environment variables for your deployment target.

## Deploy
Push your code and trigger the CI/CD pipeline.
`
  );
  try {
    const schema = generateSchemaData(tempFile, "howto", {
      ...proConfig,
      howto: { totalTime: "PT30M" },
    });
    const howto = schema["@graph"].find((n) => n["@type"] === "HowTo");
    assert.ok(howto, "Should contain a HowTo node");
    assert.strictEqual(howto.name, "How to Deploy a Node.js App");
    assert.ok(Array.isArray(howto.step), "Should have step array");
    assert.ok(howto.step.length >= 3, "Should have at least 3 steps");
    assert.strictEqual(howto.step[0]["@type"], "HowToStep");
    assert.strictEqual(howto.step[0].name, "Install dependencies");
    assert.strictEqual(howto.totalTime, "PT30M");
  } finally {
    fs.unlinkSync(tempFile);
  }
});

test("generateSchemaData generates HowTo from numbered list when no sections (Pro)", () => {
  const tempFile = path.join(os.tmpdir(), "howto-numbered-test.md");
  fs.writeFileSync(
    tempFile,
    `# How to Boil an Egg

1. Fill a pot with water
2. Bring to a boil
3. Add egg and cook 8 minutes
`
  );
  try {
    const schema = generateSchemaData(tempFile, "howto", proConfig);
    const howto = schema["@graph"].find((n) => n["@type"] === "HowTo");
    assert.ok(howto, "Should contain a HowTo node");
    assert.ok(Array.isArray(howto.step), "Should have step array");
    assert.ok(howto.step.length === 3, "Should extract 3 numbered steps");
    assert.strictEqual(howto.step[0].text, "Fill a pot with water");
  } finally {
    fs.unlinkSync(tempFile);
  }
});

test("generateSchemaData supports multi-type (course,howto) in one @graph (Pro)", () => {
  const tempFile = path.join(os.tmpdir(), "multitype-test.md");
  fs.writeFileSync(
    tempFile,
    `# Learn Git in 30 Minutes

A hands-on course with step-by-step instructions.

## Setup
Install Git on your machine.

## First commit
Create your first repository and commit.
`
  );
  try {
    const schema = generateSchemaData(tempFile, "course,howto", {
      ...proConfig,
      course: { provider: "Tooltician Academy" },
    });
    assert.strictEqual(schema["@context"], "https://schema.org");
    const course = schema["@graph"].find((n) => n["@type"] === "Course");
    const howto = schema["@graph"].find((n) => n["@type"] === "HowTo");
    assert.ok(course, "Should contain a Course node");
    assert.ok(howto, "Should contain a HowTo node");
    assert.strictEqual(course.name, "Learn Git in 30 Minutes");
    assert.strictEqual(howto.name, "Learn Git in 30 Minutes");
  } finally {
    fs.unlinkSync(tempFile);
  }
});

// ═══ Plan 039 — Pro HTML reports ═══

const SAMPLE_CONTENT = `# Cloud Architecture Best Practices

Hybrid cloud architecture integrates private and public cloud resources.

## Scalability
Auto-scaling reduces costs by 40% according to AWS benchmarks.

## Security
End-to-end encryption protects all data in transit and at rest.
`;

test("renderV1ReportHtml returns valid HTML structure", () => {
  const tempFile = path.join(os.tmpdir(), "html-report-v1.md");
  fs.writeFileSync(tempFile, SAMPLE_CONTENT);
  try {
    const { report } = scoreContent(SAMPLE_CONTENT, tempFile, {});
    const html = renderV1ReportHtml(report, tempFile);
    assert.ok(html.startsWith("<!DOCTYPE html>"), "Should start with DOCTYPE");
    assert.ok(html.includes("<html"), "Should have html tag");
    assert.ok(html.includes("<head>"), "Should have head tag");
    assert.ok(html.includes("<body>"), "Should have body tag");
    assert.ok(html.includes("GEO Optimization Audit Report"), "Should contain report title");
    assert.ok(html.includes("/100"), "Should show score");
    assert.ok(html.includes("Tooltician"), "Should include branding by default");
  } finally {
    fs.unlinkSync(tempFile);
  }
});

test("renderV1ReportHtml with noBranding omits Tooltician", () => {
  const tempFile = path.join(os.tmpdir(), "html-report-v1-nobrand.md");
  fs.writeFileSync(tempFile, SAMPLE_CONTENT);
  try {
    const { report } = scoreContent(SAMPLE_CONTENT, tempFile, {});
    const html = renderV1ReportHtml(report, tempFile, { noBranding: true });
    assert.ok(
      !html.includes("tooltician.com"),
      "Should not include Tooltician URL with noBranding"
    );
  } finally {
    fs.unlinkSync(tempFile);
  }
});

test("renderV1ReportHtml shows score in SVG gauge", () => {
  const tempFile = path.join(os.tmpdir(), "html-report-gauge.md");
  fs.writeFileSync(tempFile, SAMPLE_CONTENT);
  try {
    const { report } = scoreContent(SAMPLE_CONTENT, tempFile, {});
    const html = renderV1ReportHtml(report, tempFile);
    assert.ok(html.includes("<svg"), "Should include SVG gauge");
    assert.ok(html.includes("stroke-dashoffset"), "Should include gauge animation");
    assert.ok(html.includes("Dimension Breakdown"), "Should include dimension chart");
  } finally {
    fs.unlinkSync(tempFile);
  }
});

test("renderV2ReportHtml returns valid HTML with profile info", () => {
  const tempFile = path.join(os.tmpdir(), "html-report-v2.md");
  fs.writeFileSync(tempFile, SAMPLE_CONTENT);
  try {
    const { report: v2report } = scoreContentV2(SAMPLE_CONTENT, tempFile, {});
    const html = renderV2ReportHtml(v2report, tempFile);
    assert.ok(html.startsWith("<!DOCTYPE html>"), "Should start with DOCTYPE");
    assert.ok(html.includes("v2"), "Should mention v2");
    assert.ok(html.includes("Profile"), "Should include profile section");
    assert.ok(html.includes("Effective Score"), "Should show effective score");
  } finally {
    fs.unlinkSync(tempFile);
  }
});

test("renderAggregateReportHtml returns valid HTML with summary stats", () => {
  const tempFile = path.join(os.tmpdir(), "html-agg-report.md");
  fs.writeFileSync(tempFile, SAMPLE_CONTENT);
  try {
    const results = auditFiles([tempFile], {});
    const summary = aggregateReport(results);
    const html = renderAggregateReportHtml(results, summary);
    assert.ok(html.startsWith("<!DOCTYPE html>"), "Should start with DOCTYPE");
    assert.ok(html.includes("Site Audit Report"), "Should include site audit title");
    assert.ok(html.includes("files audited"), "Should mention files audited");
    assert.ok(html.includes("Average GEO Score"), "Should include average score");
  } finally {
    fs.unlinkSync(tempFile);
  }
});

test("renderComparisonHtml shows before/after scores and delta", () => {
  const tempFile = path.join(os.tmpdir(), "html-comparison.md");
  fs.writeFileSync(tempFile, SAMPLE_CONTENT);
  try {
    const { report: beforeReport } = scoreContent(
      "# Simple\n\nShort content without much structure.",
      tempFile,
      {}
    );
    const { report: afterReport } = scoreContent(SAMPLE_CONTENT, tempFile, {});
    const html = renderComparisonHtml(beforeReport, afterReport, tempFile);
    assert.ok(html.startsWith("<!DOCTYPE html>"), "Should start with DOCTYPE");
    assert.ok(html.includes("Before / After Comparison"), "Should include comparison title");
    assert.ok(html.includes("Before"), "Should show Before label");
    assert.ok(html.includes("After"), "Should show After label");
    assert.ok(html.includes("Net change"), "Should show net change");
    assert.ok(html.includes("Dimension Changes"), "Should show dimension comparison table");
  } finally {
    fs.unlinkSync(tempFile);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// HTML-report XSS escaping (plan 046, F8)
// ═══════════════════════════════════════════════════════════════════════════

test("renderV1ReportHtml escapes hostile input in filepath and findings", () => {
  const tempFile = path.join(os.tmpdir(), "xss-v1.md");
  const xssContent = "# Test\n\nSome content.";
  fs.writeFileSync(tempFile, xssContent);
  try {
    const { report } = scoreContent(xssContent, tempFile, {});
    // Inject hostile strings into filepath and findings
    const xssPath = '/tmp/<script>alert("xss")</script>.md';
    // Give a finding a hostile message
    if (report.findings.length > 0) {
      report.findings[0].message = "<img src=x onerror=alert(1)>";
    }
    if (report.recommendations.length > 0) {
      report.recommendations[0] = "<script>alert('xss')</script>";
    }
    const html = renderV1ReportHtml(report, xssPath);
    assert.ok(!html.includes("<script>alert("), "Should not contain unescaped script tag");
    assert.ok(html.includes("&lt;script&gt;"), "Should contain escaped script tag");
  } finally {
    fs.unlinkSync(tempFile);
  }
});

test("renderAggregateReportHtml escapes hostile input", () => {
  const tempFile = path.join(os.tmpdir(), "xss-agg.md");
  fs.writeFileSync(tempFile, "# Aggregate test\n\nContent.");
  try {
    const { report } = scoreContent("# Aggregate test\n\nContent.", tempFile, {});
    const results = [{ report, filepath: tempFile }];
    const summary = {
      totalFiles: 1,
      averageScore: 50,
      medianScore: 50,
      minScore: 50,
      maxScore: 50,
      succeeded: 1,
      scores: [50],
      topFindings: [
        {
          message: "<img src=x onerror=alert(1)>",
          category: "test",
          fileCount: 1,
          evidenceLabel: "heuristic",
        },
      ],
      worstFiles: [{ file: "<script>alert('xss')</script>", score: 30 }],
    };
    const html = renderAggregateReportHtml(results, summary);
    assert.ok(!html.includes("<img src=x onerror="), "Should not contain unescaped img tag");
    assert.ok(html.includes("&lt;img"), "Should contain escaped img tag");
    assert.ok(!html.includes("<script>alert("), "Should not contain unescaped script");
  } finally {
    fs.unlinkSync(tempFile);
  }
});

test("esc function escapes single quotes", () => {
  const tempFile = path.join(os.tmpdir(), "xss-quote.md");
  fs.writeFileSync(tempFile, "# Quote test\n\nContent with 'quotes'.");
  try {
    const { report } = scoreContent("# Quote test\n\nContent with 'quotes'.", tempFile, {});
    // Use a filepath containing both single and double quotes
    const html = renderV1ReportHtml(report, "/tmp/test's file.md");
    assert.ok(html.includes("&#39;"), "Should escape single quotes");
  } finally {
    fs.unlinkSync(tempFile);
  }
});

test("geo-opt report command is blocked without Pro license", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "report-gate-"));
  const sampleFile = path.join(tmpDir, "sample.md");
  fs.writeFileSync(sampleFile, SAMPLE_CONTENT);
  try {
    const result = spawnSync(
      "node",
      [cliPath, "report", sampleFile, "--output", path.join(tmpDir, "out.html")],
      {
        encoding: "utf8",
        env: { ...process.env, TOOLTICIAN_LICENSE_KEY: "" },
      }
    );
    assert.ok(result.status !== 0, "Should exit non-zero without Pro license");
    assert.ok(result.stderr.includes("Pro license"), "Should mention Pro license requirement");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
