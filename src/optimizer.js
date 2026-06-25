import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const MAX_PRONOUN_DENSITY = 0.02;

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function loadConfig(configPath = null) {
  const searchPaths = [];
  if (configPath) {
    if (!fs.existsSync(configPath)) {
      console.error(`Error: Specified config file ${configPath} not found.`);
      process.exit(1);
    }
    searchPaths.push(configPath);
  } else {
    searchPaths.push(path.join(process.cwd(), "geo_config.json"));
    searchPaths.push(
      path.resolve(__dirname, "..", ".agents", "skills", "geo-optimization", "geo_config.json")
    );
  }

  for (const p of searchPaths) {
    if (fs.existsSync(p)) {
      try {
        const raw = fs.readFileSync(p, { encoding: "utf8", flag: "r" });
        return { config: JSON.parse(raw), configPath: p };
      } catch (e) {
        console.warn(`Warning: Failed to parse config at ${p}: ${e.message}`);
      }
    }
  }

  return { config: {}, configPath: null };
}

export function calculateReadability(text) {
  const sentences = text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const words = text.match(/\b\w+\b/g) || [];

  if (sentences.length === 0 || words.length === 0) {
    return { wordCount: 0, avgSentenceLen: 0 };
  }

  return {
    wordCount: words.length,
    avgSentenceLen: words.length / sentences.length,
  };
}

export function preprocessContent(content) {
  // Strip markdown code blocks
  let text = content.replace(/```[\s\S]*?```/g, "");
  // Strip HTML script and style tags
  text = text.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "");
  // Strip HTML comments
  text = text.replace(/<!--[\s\S]*?-->/g, "");
  return text;
}

export function cleanMarkdownToPlainText(mdText) {
  // Remove markdown links, keeping text: [text](url) -> text
  let text = mdText.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  // Remove bold/italic markup
  text = text.replace(/[\*_]{1,3}/g, "");

  const lines = [];
  for (let line of text.split("\n")) {
    line = line.trim();
    if (line.startsWith("|") && line.endsWith("|")) {
      // Skip divider rows e.g. |---|
      if (/^\|[\s\-\:\+\|]+$/.test(line)) {
        continue;
      }
      const cells = line
        .split("|")
        .slice(1, -1)
        .map((c) => c.trim());
      lines.push(cells.filter(Boolean).join(" - "));
    } else {
      lines.push(line);
    }
  }

  return lines.join("\n").trim();
}

export function extractSections(content) {
  const cleanContent = preprocessContent(content);
  const sections = [];
  let currentHeader = null;
  let currentText = [];

  for (const line of cleanContent.split("\n")) {
    const headerMatch = line.match(/^(##+)\s+(.+)$/);
    if (headerMatch) {
      if (currentHeader) {
        sections.push({ header: currentHeader, body: currentText.join("\n").trim() });
      }
      currentHeader = headerMatch[2].trim();
      currentText = [];
    } else {
      if (currentHeader !== null) {
        currentText.push(line);
      }
    }
  }

  if (currentHeader) {
    sections.push({ header: currentHeader, body: currentText.join("\n").trim() });
  }

  return sections;
}

export function auditFile(filepath, config, outputFormat = "text") {
  if (!fs.existsSync(filepath)) {
    console.error(`Error: File ${filepath} not found.`);
    process.exit(1);
  }

  let content = "";
  try {
    content = fs.readFileSync(filepath, { encoding: "utf8", flag: "r" });
  } catch (e) {
    console.error(`Error: Failed to read file ${filepath}: ${e.message}`);
    process.exit(1);
  }

  const textContent = preprocessContent(content);

  // 1. Answer-First & Structure (Max 20 pts)
  let structScore = 0;
  const structBreakdown = [];

  const lines = textContent
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  let introPara = "";
  for (const line of lines) {
    if (!line.startsWith("#")) {
      introPara = line;
      break;
    }
  }

  if (introPara) {
    const wordCount = introPara.split(/\s+/).length;
    const isDefinition = [
      " is a ",
      " is an ",
      " refers to ",
      " represents ",
      " is the strategic ",
    ].some((verb) => introPara.toLowerCase().includes(verb));

    if (wordCount >= 40 && wordCount <= 90) {
      if (isDefinition) {
        structScore += 10;
        structBreakdown.push(
          "Answer-First: Optimal length (40-90 words) and contains definition markers (+10 pts)"
        );
      } else {
        structScore += 7;
        structBreakdown.push(
          "Answer-First: Optimal length but lacks clear definition markers (+7 pts)"
        );
      }
    } else {
      structBreakdown.push(
        `Answer-First: Intro paragraph has ${wordCount} words (optimal is 40-90) (+0 pts)`
      );
    }
  } else {
    structBreakdown.push("Answer-First: No intro paragraph found (+0 pts)");
  }

  if (
    (textContent.includes("|") && /\|\s*:?-+:?\s*\|/.test(textContent)) ||
    textContent.toLowerCase().includes("<table>")
  ) {
    structScore += 4;
    structBreakdown.push("Tables: Structured data tables present (+4 pts)");
  } else {
    structBreakdown.push("Tables: No tables found (+0 pts)");
  }

  if (/^\s*[\-\*\+\d\.]+\s+/m.test(textContent)) {
    structScore += 3;
    structBreakdown.push("Lists: Bulleted or numbered lists present (+3 pts)");
  } else {
    structBreakdown.push("Lists: No lists found (+0 pts)");
  }

  if (/^##+\s+\w+/m.test(textContent) || /<h[234]>/i.test(textContent)) {
    structScore += 3;
    structBreakdown.push("Headers: Clean H2/H3 hierarchy found (+3 pts)");
  } else {
    structBreakdown.push("Headers: No H2/H3 headers found (+0 pts)");
  }

  // HTML semantic tag audits
  if (filepath.endsWith(".html") || content.toLowerCase().includes("<html")) {
    const htmlLower = content.toLowerCase();
    const semanticTags = ["<article", "<main", "<header", "<footer", "<nav", "<section"];
    const foundTags = semanticTags.filter((t) => htmlLower.includes(t));
    if (foundTags.length >= 3) {
      structBreakdown.push(
        `Semantic HTML: Good HTML5 layout tags used (${foundTags.join(", ")}) (+0 pts)`
      );
    } else {
      const deduction = 4;
      structScore = Math.max(0, structScore - deduction);
      structBreakdown.push(
        `Semantic HTML: Lacks HTML5 structural tags (e.g. <main>, <article>). Found only: ${foundTags.join(", ")} (-${deduction} pts)`
      );
    }

    const dynamicIndicators = ['id="app"', 'id="root"', "createapp(", "reactdom.render("];
    const foundDynamic = dynamicIndicators.filter((ind) => htmlLower.includes(ind));
    if (foundDynamic.length > 0) {
      structBreakdown.push(
        "Dynamic Rendering Warning: Detects client-side JS references. Ensure content is pre-rendered / SSR for AI crawler searchability."
      );
    }
  }

  // 2. Statistics Density (Max 20 pts)
  let statsScore = 0;
  // Match percentages (82%), currencies ($24M), metrics (3.2x), decimals (1.5), or large numbers (10,000)
  const statMatches =
    textContent.match(
      /\b\d+(?:\.\d+)?%|\$\d+(?:\.\d+)?[kKmMbB]?|\b\d+(?:\.\d+)?[xX]\b|\b\d{2,}(?:,\d{3})*(?:\.\d+)?\b/g
    ) || [];

  // Filter out calendar years (1900-2099)
  const filteredStats = statMatches.filter((s) => !/^(19|20)\d{2}$/.test(s));
  const statCount = filteredStats.length;
  let statsBreakdown = "";

  if (statCount >= 3) {
    statsScore = 20;
    statsBreakdown = `High density (${statCount} stats found): ${filteredStats.slice(0, 5).join(", ")}... (+20 pts)`;
  } else if (statCount > 0) {
    statsScore = 10;
    statsBreakdown = `Moderate density (${statCount} stats found): ${filteredStats.join(", ")} (+10 pts)`;
  } else {
    statsBreakdown = "No statistics or numerical evidence found (+0 pts)";
  }

  // 3. Quotation Density (Max 20 pts)
  let quotesScore = 0;
  const quoteBlocks = textContent.match(/^\s*>\s+.+/gm) || [];
  const inlineQuotes = textContent.match(/"([^"]{15,})"/g) || [];
  const quoteCount = quoteBlocks.length + inlineQuotes.length;
  let quotesBreakdown = "";

  if (quoteCount >= 2) {
    quotesScore = 20;
    quotesBreakdown = `High density (${quoteCount} quotes found) (+20 pts)`;
  } else if (quoteCount > 0) {
    quotesScore = 10;
    quotesBreakdown = `Moderate density (${quoteCount} quotes found) (+10 pts)`;
  } else {
    quotesBreakdown = "No expert quotes or direct attributions found (+0 pts)";
  }

  // 4. Citation & Authority (Max 20 pts)
  let citationScore = 0;
  const mdLinks = textContent.match(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g) || [];
  const htmlLinks = textContent.match(/href=["'](https?:\/\/[^"']+)["']/g) || [];
  const linkCount = mdLinks.length + htmlLinks.length;

  const hasSourcesHeader = ["sources", "references", "citations", "bibliography"].some((keyword) =>
    textContent.toLowerCase().includes(keyword)
  );

  let citationBreakdown = "";
  if (linkCount >= 3) {
    citationScore += 15;
    citationBreakdown = `Links: High authority link density (${linkCount} links found) (+15 pts)`;
  } else if (linkCount > 0) {
    citationScore += 8;
    citationBreakdown = `Links: Moderate link density (${linkCount} links found) (+8 pts)`;
  } else {
    citationBreakdown = "Links: No external hyperlinks found (+0 pts)";
  }

  if (hasSourcesHeader) {
    citationScore += 5;
    citationBreakdown += "\nReferences: Dedicated citation/sources section found (+5 pts)";
  } else {
    citationBreakdown += "\nReferences: No dedicated citation section found (+0 pts)";
  }

  // 5. Semantic Clarity & Readability (Max 20 pts)
  let clarityScore = 20;
  const clarityBreakdown = [];

  const words = textContent.toLowerCase().match(/\b\w+\b/g) || [];
  const totalWordCount = words.length;

  if (totalWordCount > 0) {
    const pronouns = ["it", "they", "them", "this", "these", "those"];
    const pronounCount = words.filter((w) => pronouns.includes(w)).length;
    const pronounDensity = pronounCount / totalWordCount;

    const pronounLimit = config.limits?.max_pronoun_density ?? MAX_PRONOUN_DENSITY;
    if (pronounDensity > pronounLimit) {
      const deduction = Math.min(15, Math.floor((pronounDensity - pronounLimit) * 100));
      clarityScore -= deduction;
      clarityBreakdown.push(
        `Pronoun Ambiguity: High density of ambiguous pronouns (${(pronounDensity * 100).toFixed(1)}%). Limit use of 'it', 'they', etc. (-${deduction} pts)`
      );
    } else {
      clarityBreakdown.push(
        `Pronoun Ambiguity: Low density of ambiguous pronouns (${(pronounDensity * 100).toFixed(1)}%) (+0 pts)`
      );
    }

    // Acronym analysis - strip headers first
    const noHeaders = textContent.replace(/^##+.*$/gm, "");
    const foundAcronyms = new Set(noHeaders.match(/\b[A-Z]{2,}\b/g) || []);

    const stopwords = new Set([
      "THE",
      "AND",
      "FOR",
      "BUT",
      "YOU",
      "NOT",
      "YES",
      "OUT",
      "OFF",
      "HOW",
      "WHY",
      "OUR",
      "WHO",
    ]);
    const filteredAcronyms = Array.from(foundAcronyms).filter((acr) => !stopwords.has(acr));

    const acronymDict = config.acronyms || {};
    const unexplained = [];

    for (const acr of filteredAcronyms) {
      if (acronymDict[acr]) {
        const expansion = acronymDict[acr];
        // Match occurrences
        const regex = new RegExp(`\\b${acr}\\b`, "g");
        let isExplained = false;
        let match;
        while ((match = regex.exec(textContent)) !== null) {
          const pos = match.index;
          const startLook = Math.max(0, pos - 120);
          const endLook = Math.min(textContent.length, pos + 120);
          const window = textContent.slice(startLook, endLook).toLowerCase();
          if (window.includes(expansion.toLowerCase())) {
            isExplained = true;
            break;
          }
        }
        if (!isExplained) {
          unexplained.push(`${acr} ('${expansion}')`);
        }
      } else {
        const pattern = new RegExp(`(${acr}\\s*\\([^)]+\\)|\\([^)]+\\)\\s*${acr})`, "i");
        if (!pattern.test(textContent) && acr.length > 2) {
          unexplained.push(acr);
        }
      }
    }

    if (unexplained.length > 0) {
      const deductPts = Math.min(5, unexplained.length);
      clarityScore -= deductPts;
      clarityBreakdown.push(
        `Acronym Clarity: Unexplained acronyms found: ${unexplained.join(", ")}. Spell them out on first mention (-${deductPts} pts)`
      );
    } else {
      clarityBreakdown.push("Acronym Clarity: All acronyms are defined or none detected (+0 pts)");
    }
  } else {
    clarityBreakdown.push("Empty file or no words found.");
  }

  const totalScore = structScore + statsScore + quotesScore + citationScore + clarityScore;

  const recs = [];
  if (structScore < 15) {
    recs.push(
      "Format the opening paragraph to be a self-contained definition/summary of 40-90 words (Answer-First)."
    );
    recs.push("Use markdown tables, headers, and bulleted lists to break up dense blocks of text.");
  }
  if (statsScore < 20) {
    recs.push(
      "Add specific metrics, percentages, dollar values, or dates from studies or reports to support your claims."
    );
  }
  if (quotesScore < 20) {
    recs.push("Include direct quotes from experts or industry leaders to increase authority.");
  }
  if (citationScore < 20) {
    recs.push(
      "Add external hyperlinks to reputable sources and include a 'References' or 'Sources' list."
    );
  }
  if (clarityScore < 18) {
    recs.push(
      "Replace ambiguous pronouns ('it', 'they', 'this') with specific nouns (e.g. 'the database', 'this setup')."
    );
    recs.push(
      "Spell out acronyms when they are first used (e.g., 'SaaS (Software as a Service)')."
    );
  }

  if (outputFormat === "json") {
    const reportData = {
      file: filepath,
      total_score: totalScore,
      breakdown: {
        structure: {
          score: structScore,
          max: 20,
          details: structBreakdown,
        },
        statistics: {
          score: statsScore,
          max: 20,
          details: [statsBreakdown],
        },
        quotations: {
          score: quotesScore,
          max: 20,
          details: [quotesBreakdown],
        },
        citations: {
          score: citationScore,
          max: 20,
          details: citationBreakdown.split("\n"),
        },
        clarity: {
          score: clarityScore,
          max: 20,
          details: clarityBreakdown,
        },
      },
      recommendations: recs,
    };
    console.log(JSON.stringify(reportData, null, 2));
  } else {
    console.log("==================================================");
    console.log("            GEO OPTIMIZATION AUDIT REPORT         ");
    console.log("==================================================");
    console.log(`File: ${filepath}`);
    console.log(`Total GEO Score: ${totalScore}/100`);
    console.log("--------------------------------------------------");
    console.log(`1. Answer-First & Structure: ${structScore}/20`);
    for (const item of structBreakdown) {
      console.log(`   - ${item}`);
    }
    console.log("--------------------------------------------------");
    console.log(`2. Statistics Density: ${statsScore}/20`);
    console.log(`   - ${statsBreakdown}`);
    console.log("--------------------------------------------------");
    console.log(`3. Quotation Density: ${quotesScore}/20`);
    console.log(`   - ${quotesBreakdown}`);
    console.log("--------------------------------------------------");
    console.log(`4. Citation & Authority: ${citationScore}/20`);
    for (const item of citationBreakdown.split("\n")) {
      console.log(`   - ${item}`);
    }
    console.log("--------------------------------------------------");
    console.log(`5. Semantic Clarity: ${clarityScore}/20`);
    for (const item of clarityBreakdown) {
      console.log(`   - ${item}`);
    }
    console.log("==================================================");

    console.log("\nActionable Recommendations:");
    if (recs.length === 0) {
      console.log("Excellent! This page is fully optimized for generative search engine indexing.");
    } else {
      for (const r of recs) {
        console.log(`- ${r}`);
      }
    }
    console.log("==================================================");
  }

  return totalScore;
}

export function checkRobots(robotsPath) {
  if (!fs.existsSync(robotsPath)) {
    console.error(`Error: robots.txt not found at ${robotsPath}`);
    process.exit(1);
  }

  let content = "";
  try {
    content = fs.readFileSync(robotsPath, { encoding: "utf8", flag: "r" });
  } catch (e) {
    console.error(`Error: Failed to read robots.txt: ${e.message}`);
    process.exit(1);
  }

  const aiAgents = [
    "GPTBot",
    "Google-Extended",
    "ClaudeBot",
    "PerplexityBot",
    "Applebot-Extended",
    "Anthropic-AI",
  ];

  console.log("==================================================");
  console.log("            ROBOTS.TXT CRAWLER AUDIT             ");
  console.log("==================================================");

  const blockedAgents = [];
  const lines = content.split("\n");
  let currentAgent = null;

  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const agentMatch = line.match(/^User-agent:\s*(.+)$/i);
    if (agentMatch) {
      currentAgent = agentMatch[1].trim();
      continue;
    }

    const disallowMatch = line.match(/^Disallow:\s*(.+)$/i);
    if (disallowMatch && currentAgent) {
      const disallowedPath = disallowMatch[1].trim();
      if (
        disallowedPath === "/" ||
        disallowedPath === "/*" ||
        (currentAgent === "*" && (disallowedPath === "/" || disallowedPath === "/*"))
      ) {
        blockedAgents.push({ agent: currentAgent, path: disallowedPath });
      }
    }
  }

  if (blockedAgents.length > 0) {
    console.log("WARNING: The following AI agents are blocked from crawling your root directory:");
    for (const b of blockedAgents) {
      console.log(`  - User-agent: ${b.agent} (Disallow: ${b.path})`);
    }
    console.log(
      "\nNote: Blocking these crawlers prevents AI engines from indexing your content and citing your pages."
    );
  } else {
    console.log("SUCCESS: No major AI agents or wildcard directives are blocking root access.");
    console.log("Your content is crawler-friendly for generative search engine indexing.");
  }
  console.log("==================================================");
}

export function generateSchemaData(filepath, schemaType, config) {
  if (!fs.existsSync(filepath)) {
    console.error(`Error: File ${filepath} not found.`);
    process.exit(1);
  }

  let content = "";
  try {
    content = fs.readFileSync(filepath, { encoding: "utf8", flag: "r" });
  } catch (e) {
    console.error(`Error: Failed to read file ${filepath}: ${e.message}`);
    process.exit(1);
  }

  const cleanText = preprocessContent(content);

  const titleMatch = cleanText.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1].trim() : "Untitled Document";

  const introMatch = cleanText.match(/^#\s+.+?\n\n([^#\n]+)/s);
  let description = introMatch ? introMatch[1].trim() : "";
  if (description.length > 150) {
    description = description.slice(0, 147) + "...";
  }

  const authorInfo = config.author || {};
  const pubInfo = config.publisher || {};

  const pubUrl = (pubInfo.url || "https://example.com").replace(/\/+$/, "");
  const orgId = `${pubUrl}/#organization`;
  const orgNode = {
    "@type": "Organization",
    "@id": orgId,
    name: pubInfo.name || "Publisher Name",
    url: pubUrl,
  };
  if (pubInfo.logo) {
    orgNode.logo = {
      "@type": "ImageObject",
      url: pubInfo.logo,
    };
  }

  const authorId = `${pubUrl}/#author`;
  const authorNode = {
    "@type": "Person",
    "@id": authorId,
    name: authorInfo.name || "Author Name",
    jobTitle: authorInfo.jobTitle || "Job Title",
  };
  if (authorInfo.sameAs) {
    authorNode.sameAs = authorInfo.sameAs;
  }

  const graphNodes = [orgNode, authorNode];

  if (schemaType === "article") {
    const articleNode = {
      "@type": "NewsArticle",
      "@id": `${pubUrl}/#article`,
      headline: title,
      description: description,
      datePublished: new Date().toISOString(),
      author: { "@id": authorId },
      publisher: { "@id": orgId },
    };
    graphNodes.push(articleNode);

    // FAQ extraction
    const sections = extractSections(content);
    if (sections.length > 0) {
      const qaList = [];
      for (const section of sections.slice(0, 5)) {
        if (
          section.body.length < 15 ||
          ["sources", "references", "citations", "bibliography"].includes(
            section.header.toLowerCase()
          )
        ) {
          continue;
        }
        qaList.push({
          "@type": "Question",
          name: section.header,
          acceptedAnswer: {
            "@type": "Answer",
            text: cleanMarkdownToPlainText(section.body),
          },
        });
      }
      if (qaList.length > 0) {
        const faqNode = {
          "@type": "FAQPage",
          "@id": `${pubUrl}/#faq`,
          mainEntity: qaList,
        };
        graphNodes.push(faqNode);
      }
    }
  } else if (schemaType === "faq") {
    const sections = extractSections(content);
    const qaList = [];
    for (const section of sections.slice(0, 5)) {
      if (
        section.body.length < 15 ||
        ["sources", "references", "citations", "bibliography"].includes(
          section.header.toLowerCase()
        )
      ) {
        continue;
      }
      qaList.push({
        "@type": "Question",
        name: section.header,
        acceptedAnswer: {
          "@type": "Answer",
          text: cleanMarkdownToPlainText(section.body),
        },
      });
    }
    const faqNode = {
      "@type": "FAQPage",
      "@id": `${pubUrl}/#faq`,
      mainEntity: qaList,
    };
    graphNodes.push(faqNode);
  } else if (schemaType === "product") {
    const productNode = {
      "@type": "Product",
      "@id": `${pubUrl}/#product`,
      name: title,
      description: description,
      brand: { "@id": orgId },
      offers: {
        "@type": "Offer",
        priceCurrency: "USD",
        availability: "https://schema.org/InStock",
        seller: { "@id": orgId },
      },
    };
    graphNodes.push(productNode);
  }

  return {
    "@context": "https://schema.org",
    "@graph": graphNodes,
  };
}

export function injectSchema(filepath, schemaType, config) {
  if (!fs.existsSync(filepath)) {
    console.error(`Error: File ${filepath} not found.`);
    process.exit(1);
  }

  const schema = generateSchemaData(filepath, schemaType, config);
  const schemaJson = JSON.stringify(schema, null, 2);

  let content = "";
  try {
    content = fs.readFileSync(filepath, { encoding: "utf8", flag: "r" });
  } catch (e) {
    console.error(`Error: Failed to read file ${filepath}: ${e.message}`);
    process.exit(1);
  }

  const schemaPattern = /```json\s*\{\s*"@context":\s*"https:\/\/schema\.org"[\s\S]*?\}\s*```/;
  const scriptPattern =
    /<script[^>]*type="application\/ld\+json"[^>]*>[\s\S]*?https:\/\/schema\.org[\s\S]*?<\/script>/i;

  const signature = config.signature;
  let sigMd = "";
  let sigHtml = "";

  if (signature) {
    // Check if signature is already present by stripping markdown link markers
    const sigRaw = signature.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
    if (!content.includes(sigRaw)) {
      sigMd = `\n\n${signature}\n`;
      sigHtml = `\n<div class="geo-signature"><p>${signature}</p></div>\n`;
    }
  }

  let injectedCode = `${sigMd}\n\`\`\`json\n${schemaJson}\n\`\`\`\n`;

  if (filepath.endsWith(".html") || content.toLowerCase().includes("<html")) {
    injectedCode = `${sigHtml}\n<script type="application/ld+json">\n${schemaJson}\n</script>\n`;
    if (scriptPattern.test(content)) {
      content = content.replace(scriptPattern, injectedCode.trim());
      console.log(`Successfully replaced existing JSON-LD script tag in ${filepath}.`);
    } else {
      if (/<\/head>/i.test(content)) {
        content = content.replace(/<\/head>/i, `${injectedCode}</head>`);
      } else if (/<\/body>/i.test(content)) {
        content = content.replace(/<\/body>/i, `${injectedCode}</body>`);
      } else {
        content += injectedCode;
      }
      console.log(`Successfully injected JSON-LD script tag into ${filepath}.`);
    }
  } else {
    if (schemaPattern.test(content)) {
      content = content.replace(schemaPattern, injectedCode.trim());
      console.log(`Successfully updated existing Schema.org block in markdown file ${filepath}.`);
    } else {
      content += injectedCode;
      console.log(`Successfully appended Schema.org block to markdown file ${filepath}.`);
    }
  }

  try {
    fs.writeFileSync(filepath, content, { encoding: "utf8" });
  } catch (e) {
    console.error(`Error: Failed to write to file ${filepath}: ${e.message}`);
    process.exit(1);
  }
}
