import fs from "fs";
import * as cheerio from "cheerio";
import { marked } from "marked";
import chalk from "chalk";
import { preprocessContent } from "./text.js";
import { MAX_PRONOUN_DENSITY } from "./config.js";

const VERBAL_STATS_PATTERNS = [
  /\b(?:one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:-|—)\s*(?:third|quarter|fifth|sixth|seventh|eighth|ninth|tenth)s?\b/gi,
  /\b(?:one|two|three|four|five)\s*-?\s*(?:third|quarter|fifth)s?\b/gi,
  /\b\d+\s*(?:out\s*of|in)\s*\d+\b/gi,
  /\b(?:one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:out\s*of|in)\s*(?:two|three|four|five|six|seven|eight|nine|ten)\b/gi,
  /\b(?:double|triple|quadruple|half|twice)\b/gi,
  /\b(?:majority|minority|plurality)\b/gi,
];

// Token walking helpers — traverse the marked AST to count structural elements
// reliably, without regex-based heuristics.

function countMdLinks(tokens) {
  let count = 0;
  function walk(tok) {
    if (Array.isArray(tok)) {
      for (const t of tok) walk(t);
    } else if (tok && typeof tok === "object") {
      if (tok.type === "link" && tok.href && /^https?:\/\//.test(tok.href)) {
        count++;
      } else if (tok.type === "image" && tok.href && /^https?:\/\//.test(tok.href)) {
        count++;
      }
      if (tok.tokens) walk(tok.tokens);
      if (tok.items) walk(tok.items);
    }
  }
  walk(tokens);
  return count;
}

function countBlockquotes(tokens) {
  let count = 0;
  function walk(tok) {
    if (Array.isArray(tok)) {
      for (const t of tok) walk(t);
    } else if (tok && typeof tok === "object") {
      if (tok.type === "blockquote") count++;
      if (tok.tokens) walk(tok.tokens);
      if (tok.items) walk(tok.items);
    }
  }
  walk(tokens);
  return count;
}

function hasMdTable(tokens) {
  function walk(tok) {
    if (Array.isArray(tok)) {
      return tok.some((t) => walk(t));
    }
    if (tok && typeof tok === "object") {
      if (tok.type === "table") return true;
      if (tok.tokens && walk(tok.tokens)) return true;
      if (tok.items && walk(tok.items)) return true;
    }
    return false;
  }
  return walk(tokens);
}

function hasMdList(tokens) {
  function walk(tok) {
    if (Array.isArray(tok)) {
      return tok.some((t) => walk(t));
    }
    if (tok && typeof tok === "object") {
      if (tok.type === "list") return true;
      if (tok.tokens && walk(tok.tokens)) return true;
      if (tok.items && walk(tok.items)) return true;
    }
    return false;
  }
  return walk(tokens);
}

export function scoreContent(content, filepath, config) {
  const textContent = preprocessContent(content);
  const tokens = marked.lexer(textContent); // AST for reliable structural queries

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

  if (hasMdTable(tokens) || textContent.toLowerCase().includes("<table>")) {
    structScore += 4;
    structBreakdown.push("Tables: Structured data tables present (+4 pts)");
  } else {
    structBreakdown.push("Tables: No tables found (+0 pts)");
  }

  if (hasMdList(tokens)) {
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
  if (filepath.endsWith(".html") || textContent.toLowerCase().includes("<html")) {
    const $html = cheerio.load(content);
    const htmlLower = textContent.toLowerCase();
    const semanticTags = ["article", "main", "header", "footer", "nav", "section"];
    const foundTags = semanticTags.filter((tag) => $html(tag).length > 0);
    if (foundTags.length >= 3) {
      structBreakdown.push(
        `Semantic HTML: Good HTML5 layout tags used (<${foundTags.join(">, <")}>) (+0 pts)`
      );
    } else {
      const deduction = 4;
      structScore = Math.max(0, structScore - deduction);
      structBreakdown.push(
        `Semantic HTML: Lacks HTML5 structural tags (e.g. <main>, <article>). Found only: ${foundTags.length > 0 ? "<" + foundTags.join(">, <") + ">" : "none"} (-${deduction} pts)`
      );
    }

    const hasAppContainer = $html('[id="app"], [id="root"]').length > 0;
    const hasFrameworkCode = /createapp\(|reactdom\.render\(/i.test(htmlLower);
    if (hasAppContainer || hasFrameworkCode) {
      structBreakdown.push(
        "Dynamic Rendering Warning: Detects client-side JS references. Ensure content is pre-rendered / SSR for AI crawler searchability."
      );
    }
  }

  // 2. Statistics Density (Max 20 pts)
  let statsScore = 0;
  const statMatches =
    textContent.match(
      /\b\d+(?:\.\d+)?%|\$\d+(?:\.\d+)?[kKmMbB]?|\b\d+(?:\.\d+)?[xX]\b|\b\d{2,}(?:,\d{3})*(?:\.\d+)?\b/g
    ) || [];

  const filteredStats = statMatches.filter((s) => !/^(19|20)\d{2}$/.test(s));
  const statCount = filteredStats.length;
  let statsBreakdown = "";

  let verbalCount = 0;
  const verbalMatches = [];
  for (const pattern of VERBAL_STATS_PATTERNS) {
    const matches = textContent.match(pattern) || [];
    verbalCount += matches.length;
    if (matches.length > 0) {
      verbalMatches.push(...matches.slice(0, 3));
    }
  }

  const totalStatCount = statCount + verbalCount;

  if (totalStatCount >= 3) {
    statsScore = 20;
    statsBreakdown = `High density (${totalStatCount} stats found: ${filteredStats.slice(0, 3).join(", ")}${verbalMatches.length > 0 ? (filteredStats.length > 0 ? ", " : "") + verbalMatches.slice(0, 3).join(", ") : ""}...) (+20 pts)`;
  } else if (totalStatCount > 0) {
    statsScore = 10;
    statsBreakdown = `Moderate density (${totalStatCount} stats found: ${filteredStats.concat(verbalMatches).join(", ")}) (+10 pts)`;
  } else {
    statsBreakdown = "No statistics or numerical evidence found (+0 pts)";
  }

  // 3. Quotation Density (Max 20 pts)
  let quotesScore = 0;
  const blockquoteCount = countBlockquotes(tokens);
  const inlineQuotes = textContent.match(/"([^"]{15,})"/g) || [];
  const quoteCount = blockquoteCount + inlineQuotes.length;
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
  const mdLinkCount = countMdLinks(tokens);
  const htmlLinks = textContent.match(/href=["'](https?:\/\/[^"']+)["']/g) || [];
  const linkCount = mdLinkCount + htmlLinks.length;

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

  const report = {
    file: filepath,
    total_score: totalScore,
    breakdown: {
      structure: { score: structScore, max: 20, details: structBreakdown },
      statistics: { score: statsScore, max: 20, details: [statsBreakdown] },
      quotations: { score: quotesScore, max: 20, details: [quotesBreakdown] },
      citations: { score: citationScore, max: 20, details: citationBreakdown.split("\n") },
      clarity: { score: clarityScore, max: 20, details: clarityBreakdown },
    },
    recommendations: recs,
  };

  return { score: totalScore, report };
}

export function auditFile(filepath, config, outputFormat = "text") {
  if (!fs.existsSync(filepath)) {
    console.error(`Error: File ${filepath} not found.`);
    process.exit(1);
    return;
  }

  let content = "";
  try {
    content = fs.readFileSync(filepath, { encoding: "utf8", flag: "r" });
  } catch (e) {
    console.error(`Error: Failed to read file ${filepath}: ${e.message}`);
    process.exit(1);
    return;
  }

  const { score: totalScore, report } = scoreContent(content, filepath, config);
  const structScore = report.breakdown.structure.score;
  const structBreakdown = report.breakdown.structure.details;
  const statsScore = report.breakdown.statistics.score;
  const statsBreakdown = report.breakdown.statistics.details[0];
  const quotesScore = report.breakdown.quotations.score;
  const quotesBreakdown = report.breakdown.quotations.details[0];
  const citationScore = report.breakdown.citations.score;
  const citationBreakdown = report.breakdown.citations.details.join("\n");
  const clarityScore = report.breakdown.clarity.score;
  const clarityBreakdown = report.breakdown.clarity.details;
  const recs = report.recommendations;

  if (outputFormat === "json") {
    console.log(JSON.stringify(report, null, 2));
  } else {
    const scoreColor = (s, max) => {
      const pct = s / max;
      if (pct >= 0.8) return chalk.green;
      if (pct >= 0.5) return chalk.yellow;
      return chalk.red;
    };
    const totalColor = (s) => {
      if (s >= 80) return chalk.green.bold;
      if (s >= 50) return chalk.yellow.bold;
      return chalk.red.bold;
    };

    const sep = chalk.dim("─".repeat(50));
    const banner = chalk.bold.blue("═".repeat(50));

    console.log(banner);
    console.log(chalk.bold.blue("            GEO OPTIMIZATION AUDIT REPORT         "));
    console.log(banner);
    console.log(`${chalk.white.bold("File:")} ${filepath}`);
    console.log(
      `${chalk.white.bold("Total GEO Score:")} ${totalColor(totalScore)(`${totalScore}/100`)}`
    );
    console.log(sep);
    console.log(
      `${chalk.bold(`1. Answer-First & Structure: ${scoreColor(structScore, 20)(`${structScore}/20`)}`)}`
    );
    for (const item of structBreakdown) {
      console.log(`   - ${item}`);
    }
    console.log(sep);
    console.log(
      `${chalk.bold(`2. Statistics Density: ${scoreColor(statsScore, 20)(`${statsScore}/20`)}`)}`
    );
    console.log(`   - ${statsBreakdown}`);
    console.log(sep);
    console.log(
      `${chalk.bold(`3. Quotation Density: ${scoreColor(quotesScore, 20)(`${quotesScore}/20`)}`)}`
    );
    console.log(`   - ${quotesBreakdown}`);
    console.log(sep);
    console.log(
      `${chalk.bold(`4. Citation & Authority: ${scoreColor(citationScore, 20)(`${citationScore}/20`)}`)}`
    );
    for (const item of citationBreakdown.split("\n")) {
      console.log(`   - ${item}`);
    }
    console.log(sep);
    console.log(
      `${chalk.bold(`5. Semantic Clarity: ${scoreColor(clarityScore, 20)(`${clarityScore}/20`)}`)}`
    );
    for (const item of clarityBreakdown) {
      console.log(`   - ${item}`);
    }
    console.log(banner);

    console.log(chalk.bold.cyan("\nActionable Recommendations:"));
    if (recs.length === 0) {
      console.log(
        chalk.green.bold("Excellent! This page meets all checks in the current geo-opt heuristic.")
      );
    } else {
      for (const r of recs) {
        console.log(chalk.cyan(`- ${r}`));
      }
    }
    console.log(banner);
  }

  return totalScore;
}
