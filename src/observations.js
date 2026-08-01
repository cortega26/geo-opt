/**
 * Section-level observation engine (plan 022, step 3).
 *
 * Uses marked (Markdown AST) and cheerio (HTML DOM) to produce structured
 * observations about content quality WITHOUT assigning scores. Each
 * observation is a datum that the v2 scoring model consumes.
 *
 * Design invariants:
 *  - Content is NEVER rewritten or auto-generated.
 *  - Fixed thresholds are configurable project heuristics, not platform facts.
 *  - Every observation is traceable to a specific AST node or regex match.
 *  - Observations carry an evidence label reflecting how they were derived.
 */

import { marked } from "marked";
import * as cheerio from "cheerio";
import { preprocessContent, isHtmlContent, extractHtmlVisibleText } from "./text.js";
import {
  hasUnsafeHrefScheme,
  isFragmentHref,
  isHttpHref,
  isWellKnownSafeScheme,
  normalizeHref,
} from "./url-safety.js";

// Returns the index of the (n+1)-th (0-based) occurrence of needle, or -1.
function nthIndexOf(haystack, needle, n) {
  let idx = -1;
  let from = 0;
  for (let k = 0; k <= n; k++) {
    idx = haystack.indexOf(needle, from);
    if (idx === -1) return -1;
    from = idx + needle.length;
  }
  return idx;
}

// ═══════════════════════════════════════════════════════════════════════════
// Observation data types (plain objects, not classes, for portability)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @typedef {Object} HeadingObservation
 * @property {string} kind — "heading_hierarchy"
 * @property {"pass"|"warn"|"fail"} status
 * @property {string} message
 * @property {string[]} [issues] — specific problems found
 */

/**
 * @typedef {Object} SectionObservation
 * @property {string} kind — "section_self_containment"
 * @property {"pass"|"warn"|"fail"} status
 * @property {string} message
 * @property {Array<{header: string, wordCount: number, isEmpty: boolean}>} [details]
 */

/**
 * @typedef {Object} ParagraphObservation
 * @property {string} kind — "paragraph_distribution"
 * @property {"pass"|"warn"|"fail"} status
 * @property {string} message
 * @property {{min: number, max: number, median: number, longCount: number}} [stats]
 */

/**
 * @typedef {Object} AnswerFirstObservation
 * @property {string} kind — "answer_first"
 * @property {"pass"|"warn"|"fail"} status
 * @property {string} message
 * @property {number} [wordCount]
 * @property {boolean} [hasDefinition]
 */

/**
 * @typedef {Object} AttributionObservation
 * @property {string} kind — "attribution_proximity"
 * @property {"pass"|"warn"|"fail"} status
 * @property {string} message
 * @property {number} statsWithNearbySource
 * @property {number} statsWithoutNearbySource
 * @property {number} quotesWithAttribution
 * @property {number} quotesWithoutAttribution
 */

/**
 * @typedef {Object} DateObservation
 * @property {string} kind — "content_freshness"
 * @property {"pass"|"warn"|"fail"} status
 * @property {string} message
 * @property {string|null} publishedDate
 * @property {string|null} reviewedDate
 */

/**
 * @typedef {Object} SemanticHtmlObservation
 * @property {string} kind — "semantic_html"
 * @property {"pass"|"warn"|"fail"} status
 * @property {string} message
 * @property {string[]} foundTags
 * @property {boolean} hasDynamicRendering
 */

/**
 * @typedef {Object} LinkQualityObservation
 * @property {string} kind — "link_quality"
 * @property {"pass"|"warn"|"fail"} status
 * @property {string} message
 * @property {number} externalLinkCount
 * @property {number} internalLinkCount
 * @property {boolean} hasSourcesSection
 * @property {boolean} hasExcessiveLinks
 */

/**
 * @typedef {Object} ContentObservations
 * @property {HeadingObservation} headingHierarchy
 * @property {SectionObservation} sectionSelfContainment
 * @property {ParagraphObservation} paragraphDistribution
 * @property {AnswerFirstObservation} answerFirst
 * @property {AttributionObservation} attributionProximity
 * @property {DateObservation} contentFreshness
 * @property {SemanticHtmlObservation} semanticHtml
 * @property {LinkQualityObservation} linkQuality
 */

// ═══════════════════════════════════════════════════════════════════════════
// Helper: traverse marked tokens
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Walk marked tokens depth-first, calling visitor for each token.
 * @param {any} tokens
 * @param {(token: any, depth: number) => void} visitor
 * @param {number} [depth=0]
 */
function walkTokens(tokens, visitor, depth = 0) {
  if (Array.isArray(tokens)) {
    for (const t of tokens) walkTokens(t, visitor, depth);
  } else if (tokens && typeof tokens === "object") {
    visitor(tokens, depth);
    if (tokens.tokens) walkTokens(tokens.tokens, visitor, depth + 1);
    if (tokens.items) walkTokens(tokens.items, visitor, depth + 1);
  }
}

/**
 * Extract heading tokens from marked AST with their level and text.
 * @param {any[]} tokens
 * @returns {Array<{level: number, text: string, index: number}>}
 */
function extractHeadings(tokens) {
  const headings = [];
  let idx = 0;
  walkTokens(tokens, (token) => {
    if (token.type === "heading") {
      const text = extractTextContent(token);
      headings.push({ level: token.depth, text, index: idx++ });
    }
  });
  return headings;
}

/**
 * Extract plain text from a token tree (strip inline markup).
 * @param {any} token
 * @returns {string}
 */
function extractTextContent(token) {
  if (typeof token === "string") return token;
  if (token.text && !token.tokens) return token.text;
  if (token.tokens) return token.tokens.map(extractTextContent).join("");
  if (token.items) return token.items.map(extractTextContent).join("");
  return token.raw || "";
}

/**
 * Extract section bodies from marked AST.
 * @param {any[]} tokens
 * @returns {Array<{header: string, level: number, wordCount: number, isEmpty: boolean}>}
 */
function extractSections(tokens) {
  const sections = [];
  let currentHeader = "(document start)";
  let currentLevel = 0;
  let currentWords = [];

  walkTokens(tokens, (token) => {
    if (token.type === "heading") {
      if (currentWords.length > 0 || currentHeader !== "(document start)") {
        sections.push({
          header: currentHeader,
          level: currentLevel,
          wordCount: currentWords.length,
          isEmpty: currentWords.length === 0,
        });
      }
      currentHeader = extractTextContent(token);
      currentLevel = token.depth;
      currentWords = [];
    } else if (token.type === "paragraph" || token.type === "text") {
      const text = extractTextContent(token);
      const words = text.match(/\b\w+\b/g) || [];
      currentWords.push(...words);
    } else if (token.type === "list") {
      const text = extractTextContent(token);
      const words = text.match(/\b\w+\b/g) || [];
      currentWords.push(...words);
    }
  });

  // Push final section
  sections.push({
    header: currentHeader,
    level: currentLevel,
    wordCount: currentWords.length,
    isEmpty: currentWords.length === 0,
  });

  return sections;
}

/**
 * Extract paragraph lengths from plain text.
 * @param {string} text
 * @returns {number[]}
 */
function getParagraphLengths(text) {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    // Exclude headings and code blocks
    .filter((p) => !p.startsWith("#") && !p.startsWith("```"));

  return paragraphs.map((p) => {
    const words = p.match(/\b\w+\b/g) || [];
    return words.length;
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Individual observation collectors
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check heading hierarchy: no skipped levels, starts with h1.
 * @param {any[]} tokens
 * @returns {HeadingObservation}
 */
function observeHeadingHierarchy(tokens, htmlMeta = null) {
  let headings;

  if (htmlMeta && htmlMeta.cheerio) {
    // ── HTML: extraer headings del DOM ──
    const $ = htmlMeta.cheerio;
    const body = $("body").length ? $("body") : $.root();
    headings = [];
    body.find("h1, h2, h3, h4, h5, h6").each((_, el) => {
      const tag = (el.tagName || el.name || "").toLowerCase();
      const level = Number(tag.slice(1));
      const text = $(el).text().replace(/\s+/g, " ").trim();
      if (text) headings.push({ level, text, index: headings.length });
    });
  } else {
    // ── Markdown: extraer headings del AST ──
    headings = extractHeadings(tokens);
  }

  const issues = [];

  if (headings.length === 0) {
    return {
      kind: "heading_hierarchy",
      status: "fail",
      message: "No headings found. Content lacks structural organization.",
      issues: ["No headings detected"],
    };
  }

  // Check for h1
  if (headings[0].level !== 1) {
    issues.push(`Document starts with h${headings[0].level} ("${headings[0].text}") instead of h1`);
  }

  // Check for skipped levels
  for (let i = 1; i < headings.length; i++) {
    const prev = headings[i - 1];
    const curr = headings[i];
    if (curr.level > prev.level + 1) {
      issues.push(
        `Heading level skips from h${prev.level} ("${prev.text}") to h${curr.level} ("${curr.text}") — h${prev.level + 1} expected`
      );
    }
  }

  // Check for duplicate headings
  const seen = new Map();
  for (const h of headings) {
    const key = `h${h.level}:${h.text.toLowerCase()}`;
    if (seen.has(key)) {
      issues.push(`Duplicate heading: h${h.level} "${h.text}"`);
    }
    seen.set(key, true);
  }

  if (issues.length === 0) {
    return {
      kind: "heading_hierarchy",
      status: "pass",
      message: `Heading hierarchy is valid (${headings.length} headings, no skipped levels).`,
      issues: [],
    };
  }

  return {
    kind: "heading_hierarchy",
    status: issues.some((i) => i.includes("skips from")) ? "fail" : "warn",
    message: `${issues.length} heading issue(s) found.`,
    issues,
  };
}

/**
 * Check section self-containment: each section should have body content.
 * @param {any[]} tokens
 * @param {Object} [opts]
 * @param {number} [opts.minWordsPerSection=10]
 * @returns {SectionObservation}
 */
function observeSectionSelfContainment(tokens, opts = {}, htmlMeta = null) {
  const minWords = opts.minWordsPerSection ?? 10;
  let sections;

  if (htmlMeta && htmlMeta.cheerio) {
    // ── HTML: extraer secciones del DOM ──
    const $ = htmlMeta.cheerio;
    const body = $("body").length ? $("body") : $.root();
    const rawSections = [];
    let currentHeader = "(document start)";
    let currentLevel = 0;
    let currentWords = [];

    // Recorrer elementos del body en orden de documento
    body.children().each((_, el) => {
      const tag = el.tagName?.toLowerCase();
      if (tag && /^h[1-6]$/.test(tag)) {
        // Guardar sección anterior
        rawSections.push({
          header: currentHeader,
          level: currentLevel,
          wordCount: currentWords.length,
          isEmpty: currentWords.length === 0,
        });
        currentHeader = $(el).text().replace(/\s+/g, " ").trim();
        currentLevel = parseInt(tag[1]);
        currentWords = [];
      } else {
        const text = $(el).text().replace(/\s+/g, " ").trim();
        if (text) {
          const words = text.match(/\b\w+\b/g) || [];
          currentWords.push(...words);
        }
      }
    });
    // Última sección
    rawSections.push({
      header: currentHeader,
      level: currentLevel,
      wordCount: currentWords.length,
      isEmpty: currentWords.length === 0,
    });
    sections = rawSections;
  } else {
    // ── Markdown: extraer secciones del AST ──
    sections = extractSections(tokens);
  }

  if (sections.length === 0) {
    return {
      kind: "section_self_containment",
      status: "fail",
      message: "No content sections found.",
      details: [],
    };
  }

  const emptySections = sections.filter((s) => s.isEmpty || s.wordCount < minWords);
  const details = sections.map((s) => ({
    header: s.header,
    wordCount: s.wordCount,
    isEmpty: s.wordCount < minWords,
  }));

  if (emptySections.length === 0) {
    return {
      kind: "section_self_containment",
      status: "pass",
      message: `All ${sections.length} sections have sufficient body content (≥${minWords} words).`,
      details,
    };
  }

  const emptyHeaders = emptySections.map((s) => s.header).join(", ");
  const ratio = emptySections.length / sections.length;

  return {
    kind: "section_self_containment",
    status: ratio > 0.5 ? "fail" : "warn",
    message: `${emptySections.length} of ${sections.length} sections have insufficient body content (<${minWords} words): ${emptyHeaders}`,
    details,
  };
}

/**
 * Check paragraph length distribution.
 * @param {string} textContent — preprocessed plain text
 * @param {Object} [opts]
 * @param {number} [opts.maxLongParagraph=200]
 * @returns {ParagraphObservation}
 */
function observeParagraphDistribution(textContent, opts = {}) {
  const maxLong = opts.maxLongParagraph ?? 200;
  const lengths = getParagraphLengths(textContent);

  if (lengths.length === 0) {
    return {
      kind: "paragraph_distribution",
      status: "fail",
      message: "No paragraphs detected.",
      stats: { min: 0, max: 0, median: 0, longCount: 0 },
    };
  }

  const sorted = [...lengths].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const median =
    sorted.length % 2 === 0
      ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : sorted[Math.floor(sorted.length / 2)];

  const longCount = lengths.filter((l) => l > maxLong).length;

  if (longCount === 0 && min >= 10) {
    return {
      kind: "paragraph_distribution",
      status: "pass",
      message: `${lengths.length} paragraphs, range ${min}–${max} words, median ${Math.round(median)}.`,
      stats: { min, max, median: Math.round(median), longCount },
    };
  }

  if (min < 10) {
    return {
      kind: "paragraph_distribution",
      status: "warn",
      message: `${lengths.length} paragraphs. Minimum paragraph length is ${min} words — very short paragraphs may indicate thin content.`,
      stats: { min, max, median: Math.round(median), longCount },
    };
  }

  return {
    kind: "paragraph_distribution",
    status: "warn",
    message: `${longCount} paragraphs exceed ${maxLong} words. Long paragraphs reduce scannability for both humans and AI engines.`,
    stats: { min, max, median: Math.round(median), longCount },
  };
}

/**
 * Check answer-first structure: does the opening paragraph define the topic?
 * @param {string} textContent
 * @param {any[]} tokens
 * @returns {AnswerFirstObservation}
 */
function observeAnswerFirst(textContent, _tokens, htmlMeta = null) {
  const lines = textContent
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  let introPara = "";

  if (htmlMeta && htmlMeta.cheerio) {
    // ── HTML: buscar el primer <p> después del <h1> ──
    const $ = htmlMeta.cheerio;
    const h1 = $("h1").first();
    let firstP = null;
    if (h1.length) {
      firstP = h1.nextAll("p").first();
    }
    if (!firstP || !firstP.length) {
      firstP = $("p").first();
    }
    if (firstP && firstP.length) {
      introPara = firstP.text().replace(/\s+/g, " ").trim();
    } else {
      // Fallback: primera línea no-heading con longitud suficiente
      for (const line of lines) {
        if (line.length > 20 && !/^[A-Z][a-z]+(\s+[A-Z][a-z]+)*\s*[\|\-—–]/.test(line)) {
          introPara = line;
          break;
        }
      }
    }
  } else {
    // ── Markdown: buscar la primera línea que no sea heading ──
    for (const line of lines) {
      if (!line.startsWith("#")) {
        introPara = line;
        break;
      }
    }
  }

  if (!introPara) {
    return {
      kind: "answer_first",
      status: "fail",
      message: "No introductory paragraph found after headings.",
      wordCount: 0,
      hasDefinition: false,
    };
  }

  const wordCount = introPara.split(/\s+/).length;
  const definitionMarkers = [
    " is a ",
    " is an ",
    " refers to ",
    " represents ",
    " is the strategic ",
  ];
  const hasDefinition = definitionMarkers.some((m) => introPara.toLowerCase().includes(m));

  if (wordCount >= 40 && wordCount <= 90 && hasDefinition) {
    return {
      kind: "answer_first",
      status: "pass",
      message: `Opening paragraph is ${wordCount} words and contains a clear definition.`,
      wordCount,
      hasDefinition: true,
    };
  }

  if (wordCount >= 40 && wordCount <= 90) {
    return {
      kind: "answer_first",
      status: "warn",
      message: `Opening paragraph is ${wordCount} words (optimal range) but lacks explicit definition markers.`,
      wordCount,
      hasDefinition: false,
    };
  }

  return {
    kind: "answer_first",
    status: "warn",
    message: `Opening paragraph is ${wordCount} words (optimal: 40–90).`,
    wordCount,
    hasDefinition,
  };
}

/**
 * Detecta si el número en `index` es un identificador técnico (versión,
 * puerto, ID de endpoint) en vez de una estadística real (F-07).
 * @param {string} textContent
 * @param {number} index — índice del match numérico en textContent
 * @returns {boolean}
 */
function isContextualIdentifier(textContent, index) {
  const before = textContent.slice(Math.max(0, index - 60), index);
  // "v22", "v3.2" — v pegado al número
  if (/v$/i.test(before)) return true;
  // Palabras clave técnicas como última palabra del contexto precedente
  return /\b(?:v|version|versions|port|endpoint|id|ids|api|node|release|build|branch|commit|issue|status|code)\b\s*:?\s*$/i.test(
    before
  );
}

/**
 * Check attribution proximity: are stats and quotes near their sources?
 * @param {string} textContent
 * @param {any[]} tokens
 * @returns {AttributionObservation}
 */
function observeAttributionProximity(textContent, _tokens, _htmlMeta = null) {
  // ── Para HTML, el textContent ya es texto visible limpio (sin atributos HTML).
  // Find statistics (numbers with % or $) and check if a source reference
  // appears within 150 characters after them.
  const statMatches =
    textContent.match(
      /\b\d+(?:\.\d+)?%|\$\d+(?:\.\d+)?[kKmMbB]?|\b\d{2,}(?:,\d{3})*(?:\.\d+)?\b/g
    ) || [];

  // Filter years y contextos técnicos (versiones, puertos, IDs) — F-07
  const stats = [];
  {
    const seen = new Map();
    for (const raw of statMatches) {
      if (/^(19|20)\d{2}$/.test(raw)) continue;
      const occurrence = seen.get(raw) || 0;
      seen.set(raw, occurrence + 1);
      const idx = nthIndexOf(textContent, raw, occurrence);
      if (idx !== -1 && isContextualIdentifier(textContent, idx)) continue;
      stats.push(raw);
    }
  }

  const sourcePatterns = [
    /according\s+to/i,
    /reported\s+by/i,
    /published\s+(by|in)/i,
    /\[[\d,\s]*\]/, // citation brackets
    /\(\d{4}\)/, // year in parens (academic citation)
    /source:/i,
    /via\s+/i,
    /data\s+from/i,
    /survey\s+by/i,
    /study\s+(by|published)/i,
  ];

  let statsWithNearbySource = 0;
  let statsWithoutNearbySource = 0;

  const statSeen = new Map();
  for (const stat of stats) {
    const occurrence = statSeen.get(stat) || 0;
    statSeen.set(stat, occurrence + 1);
    const idx = nthIndexOf(textContent, stat, occurrence);
    if (idx === -1) continue;
    const window = textContent.slice(Math.max(0, idx - 50), idx + 200);
    const hasSource = sourcePatterns.some((p) => p.test(window));
    if (hasSource) {
      statsWithNearbySource++;
    } else {
      statsWithoutNearbySource++;
    }
  }

  // Check quote attribution. Evaluate attribution over the SAME quotes that
  // totalQuotes counts: blockquote lines + inline quotes (straight OR curly),
  // each located at its own occurrence so repeated quotes get their own window.
  const blockquoteLines = textContent.match(/^>\s*.+$/gm) || [];
  const inlineQuotes = textContent.match(/["“]([^"”]{15,})["”]/g) || [];
  const evaluatedQuotes = [...blockquoteLines, ...inlineQuotes];
  const totalQuotes = evaluatedQuotes.length;

  // Look for attribution patterns near blockquotes.
  // We require either a named person (— Full Name, Title) or an
  // explicit speech verb. "— CEO of a company" is rejected as too vague.
  const attributionPatterns = [
    // Named attribution: "— Sarah Chen, Research Lead" or "— Dr. Smith"
    /[—–-]\s*[A-Z][a-z]+\s+[A-Z][a-z]+/,
    /[—–-]\s*(?:Dr\.|Prof\.|Mr\.|Mrs\.|Ms\.)\s+[A-Z][a-z]+/,
    // Speech verbs with explicit subject
    /said\s+[A-Z][a-z]+\s+[A-Z][a-z]+/,
    /according\s+to\s+[A-Z][a-z]+/i,
    /told\s+the\s+/i,
    /writes?\s+[A-Z][a-z]+\s+[A-Z]/,
    // Organizational attribution
    /(?:according\s+to|reported\s+by|per)\s+(?:the\s+)?[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:Institute|University|Foundation|Association|Corporation|Inc\.?|LLC|Report|Study|Survey)/i,
  ];

  let quotesWithAttribution = 0;
  let quotesWithoutAttribution = 0;
  const quoteSeen = new Map();
  for (const quote of evaluatedQuotes) {
    const needle = quote.trim();
    const occurrence = quoteSeen.get(needle) || 0;
    quoteSeen.set(needle, occurrence + 1);
    const idx = nthIndexOf(textContent, needle, occurrence);
    if (idx === -1) continue;
    const window = textContent.slice(Math.max(0, idx - 80), idx + needle.length + 150);
    const hasAttr = attributionPatterns.some((p) => p.test(window));
    if (hasAttr) {
      quotesWithAttribution++;
    } else {
      quotesWithoutAttribution++;
    }
  }

  // If no quotes AND no stats, nothing to check
  if (totalQuotes === 0 && stats.length === 0) {
    return {
      kind: "attribution_proximity",
      status: "pass",
      message: "No quotes or statistics requiring attribution detected.",
      statsWithNearbySource: 0,
      statsWithoutNearbySource: 0,
      quotesWithAttribution: 0,
      quotesWithoutAttribution: 0,
    };
  }

  const unattributedQuotes = quotesWithoutAttribution;
  const unattributedStats = statsWithoutNearbySource;

  if (unattributedQuotes === 0 && unattributedStats === 0) {
    return {
      kind: "attribution_proximity",
      status: "pass",
      message: `All ${stats.length} statistics and ${totalQuotes} quotes have nearby source attribution.`,
      statsWithNearbySource,
      statsWithoutNearbySource,
      quotesWithAttribution,
      quotesWithoutAttribution,
    };
  }

  const problems = [];
  if (unattributedStats > 0) {
    problems.push(`${unattributedStats} statistics lack nearby source attribution`);
  }
  if (unattributedQuotes > 0) {
    problems.push(`${unattributedQuotes} quotes lack identifiable attribution`);
  }

  return {
    kind: "attribution_proximity",
    status: unattributedQuotes > 0 ? "fail" : "warn",
    message: problems.join("; ") + ".",
    statsWithNearbySource,
    statsWithoutNearbySource,
    quotesWithAttribution,
    quotesWithoutAttribution,
  };
}

/**
 * Check content freshness: does the content have visible dates?
 * @param {string} textContent
 * @returns {DateObservation}
 */
function observeContentFreshness(textContent) {
  // Strip markdown bold/italic markers before matching dates,
  // so "**Published:** June 15, 2026" is seen as "Published: June 15, 2026".
  const stripped = textContent.replace(/\*{1,3}/g, "");

  // Look for published/reviewed dates
  const datePatterns = [
    /(?:published|posted|date)\s*:?\s*(\d{4}-\d{2}-\d{2}|\w+\s+\d{1,2},?\s*\d{4})/i,
    /(?:last\s*(?:updated|reviewed|modified))\s*:?\s*(\d{4}-\d{2}-\d{2}|\w+\s+\d{1,2},?\s*\d{4})/i,
    /(?:effective\s*date)\s*:?\s*(\d{4}-\d{2}-\d{2}|\w+\s+\d{1,2},?\s*\d{4})/i,
    /(?:next\s*review\s*(?:due|date)?)\s*:?\s*(\d{4}-\d{2}-\d{2}|\w+\s+\d{1,2},?\s*\d{4})/i,
  ];

  let publishedDate = null;
  let reviewedDate = null;

  const pubMatch = stripped.match(datePatterns[0]);
  if (pubMatch) publishedDate = pubMatch[1];

  const revMatch = stripped.match(datePatterns[1]);
  if (revMatch) reviewedDate = revMatch[1];

  if (publishedDate && reviewedDate) {
    return {
      kind: "content_freshness",
      status: "pass",
      message: `Published: ${publishedDate}, Last reviewed: ${reviewedDate}.`,
      publishedDate,
      reviewedDate,
    };
  }

  if (publishedDate) {
    return {
      kind: "content_freshness",
      status: "warn",
      message: `Published date found (${publishedDate}) but no review date. Add a "last reviewed" date for time-sensitive content.`,
      publishedDate,
      reviewedDate: null,
    };
  }

  if (reviewedDate) {
    return {
      kind: "content_freshness",
      status: "warn",
      message: `Review date found (${reviewedDate}) but no original publication date.`,
      publishedDate: null,
      reviewedDate,
    };
  }

  return {
    kind: "content_freshness",
    status: "warn",
    message: "No publication or review date detected. Content freshness cannot be assessed.",
    publishedDate: null,
    reviewedDate: null,
  };
}

/**
 * Check semantic HTML structure (HTML files only).
 * @param {string} rawContent — raw HTML (not preprocessed)
 * @param {string} filepath
 * @returns {SemanticHtmlObservation|null} null if not HTML
 */
function observeSemanticHtml(rawContent, filepath) {
  if (!filepath.endsWith(".html") && !rawContent.toLowerCase().includes("<html")) {
    return null;
  }

  const $ = cheerio.load(rawContent);
  const semanticTags = ["article", "main", "header", "footer", "nav", "section"];
  const foundTags = semanticTags.filter((tag) => $(tag).length > 0);

  const hasAppContainer = $('[id="app"], [id="root"]').length > 0;
  const hasFrameworkCode = /createapp\(|reactdom\.render\(/i.test(rawContent);

  if (foundTags.length >= 3) {
    return {
      kind: "semantic_html",
      status: "pass",
      message: `Good HTML5 semantic structure: <${foundTags.join(">, <")}>.`,
      foundTags,
      hasDynamicRendering: hasAppContainer || hasFrameworkCode,
    };
  }

  return {
    kind: "semantic_html",
    status: foundTags.length > 0 ? "warn" : "fail",
    message:
      foundTags.length > 0
        ? `Only ${foundTags.length} semantic HTML5 tag(s) found: <${foundTags.join(">, <")}>. Use <main>, <article>, <nav>, <header>, <footer>, and <section> for better AI crawler parsing.`
        : "No semantic HTML5 tags found. AI crawlers rely on <main>, <article>, <nav>, etc. to understand page structure.",
    foundTags,
    hasDynamicRendering: hasAppContainer || hasFrameworkCode,
  };
}

/**
 * Detecta una sección de fuentes REAL: un heading (Sources/References/...) con
 * links de contenido debajo. Reemplaza la búsqueda por keyword global, que
 * daba +5 puntos de citations por una mención casual de "sources" (F-08).
 * @param {string} textContent
 * @param {object|null} htmlMeta
 * @returns {boolean}
 */
function hasRealSourcesSection(textContent, htmlMeta = null) {
  const sectionKeywords = /(?:sources|references|citations|bibliography|further reading)/i;

  if (htmlMeta && htmlMeta.cheerio) {
    const $ = htmlMeta.cheerio;
    for (const h of $("h1,h2,h3,h4,h5,h6").toArray()) {
      if (sectionKeywords.test($(h).text())) {
        let next = $(h).next();
        for (let i = 0; i < 5 && next.length; i++, next = next.next()) {
          if (next.is("a[href]")) return true;
          if (next.is("ul,ol")) {
            if (next.find("a[href]").length > 0) return true;
            continue;
          }
          // Contenedores (div/section/p/li) con links dentro — el HTML real
          // de CMS suele envolver la lista de referencias (edge case F-08,
          // revisión 2026-08-01).
          if (next.is("div,section,article,main,p,li")) {
            if (next.find("a[href]").length > 0) return true;
            continue;
          }
          if (next.is("h1,h2,h3,h4,h5,h6")) break;
        }
      }
    }
    return false;
  }

  // Markdown/plain: heading con keyword seguido de links (hasta el próximo
  // heading, máx. 40 líneas).
  const lines = textContent.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (/^#{1,6}\s+.*/.test(lines[i]) && sectionKeywords.test(lines[i].replace(/^#{1,6}\s+/, ""))) {
      for (let j = i + 1; j < Math.min(lines.length, i + 40); j++) {
        if (/^#{1,6}\s/.test(lines[j])) break; // siguiente heading termina la sección
        if (/\[[^\]]+\]\([^)]+\)/.test(lines[j]) || /href=["']https?:\/\//i.test(lines[j])) {
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * Check link quality: density, types, and sources section.
 * @param {string} textContent
 * @param {any[]} tokens
 * @returns {LinkQualityObservation}
 */
function observeLinkQuality(textContent, tokens, htmlMeta = null) {
  let externalLinks = 0;
  let internalLinks = 0;

  if (htmlMeta && htmlMeta.cheerio) {
    // ── HTML: contar links vía cheerio ──
    const $ = htmlMeta.cheerio;
    const body = $("body").length ? $("body") : $.root();
    body.find("a[href]").each((_, el) => {
      const href = normalizeHref($(el).attr("href"));
      if (isHttpHref(href)) {
        externalLinks++;
      } else if (
        href &&
        !isFragmentHref(href) &&
        !hasUnsafeHrefScheme(href) &&
        !isWellKnownSafeScheme(href)
      ) {
        internalLinks++;
      }
    });
  } else {
    // ── Markdown: contar links vía marked AST ──
    walkTokens(tokens, (token) => {
      if (token.type === "link" && token.href) {
        if (/^https?:\/\//.test(token.href)) {
          externalLinks++;
        } else {
          internalLinks++;
        }
      } else if (token.type === "image" && token.href && /^https?:\/\//.test(token.href)) {
        externalLinks++;
      }
    });

    // También revisar links HTML embebidos en el texto
    const htmlLinks = textContent.match(/href=["'](https?:\/\/[^"']+)["']/g) || [];
    externalLinks += htmlLinks.length;
  }

  const hasSourcesSection = hasRealSourcesSection(textContent, htmlMeta);

  // Excessive links: more than 30 external links with fewer than 500 words of prose
  const wordCount = (textContent.match(/\b\w+\b/g) || []).length;
  const hasExcessiveLinks = externalLinks > 30 && wordCount < 500;

  if (externalLinks === 0 && internalLinks === 0) {
    return {
      kind: "link_quality",
      status: "warn",
      message:
        "No hyperlinks found. External citations and cross-references improve authority signals.",
      externalLinkCount: 0,
      internalLinkCount: 0,
      hasSourcesSection,
      hasExcessiveLinks: false,
    };
  }

  if (hasExcessiveLinks) {
    return {
      kind: "link_quality",
      status: "fail",
      message: `${externalLinks} external links with only ${wordCount} words of prose — link-farm pattern detected.`,
      externalLinkCount: externalLinks,
      internalLinkCount: internalLinks,
      hasSourcesSection,
      hasExcessiveLinks: true,
    };
  }

  if (externalLinks >= 3 && hasSourcesSection) {
    return {
      kind: "link_quality",
      status: "pass",
      message: `${externalLinks} external links with a dedicated sources section. Good citation structure.`,
      externalLinkCount: externalLinks,
      internalLinkCount: internalLinks,
      hasSourcesSection: true,
      hasExcessiveLinks: false,
    };
  }

  return {
    kind: "link_quality",
    status: externalLinks >= 3 ? "pass" : "warn",
    message:
      externalLinks >= 3
        ? `${externalLinks} external links. Consider adding a dedicated sources/references section.`
        : `Only ${externalLinks} external link(s). Content lacks external citations.`,
    externalLinkCount: externalLinks,
    internalLinkCount: internalLinks,
    hasSourcesSection,
    hasExcessiveLinks: false,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Main observation collector
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Collect all section-level observations for a piece of content.
 *
 * @param {string} rawContent — raw file content (HTML or markdown)
 * @param {string} filepath — file path (used to detect HTML)
 * @param {Object} [opts] — configurable thresholds
 * @returns {ContentObservations}
 */
export function observeContent(rawContent, filepath = "", opts = {}) {
  const isHtml = isHtmlContent(rawContent) || filepath.endsWith(".html");
  let textContent, tokens, htmlMeta;

  if (isHtml) {
    // ── HTML path: extraer texto visible y estructura vía cheerio ──
    const $ = cheerio.load(rawContent);
    const structure = extractHtmlVisibleText(rawContent);
    textContent = structure.textContent;
    // marked se usa solo para inline formatting; la estructura viene de cheerio
    tokens = marked.lexer(textContent);
    htmlMeta = { cheerio: $, structure };
  } else {
    // ── Markdown path ──
    textContent = preprocessContent(rawContent);
    tokens = marked.lexer(textContent);
    htmlMeta = null;
  }

  const headingHierarchy = observeHeadingHierarchy(tokens, htmlMeta);
  const sectionSelfContainment = observeSectionSelfContainment(tokens, opts, htmlMeta);
  const paragraphDistribution = observeParagraphDistribution(textContent, opts);
  const answerFirst = observeAnswerFirst(textContent, tokens, htmlMeta);
  const attributionProximity = observeAttributionProximity(textContent, tokens, htmlMeta);
  const contentFreshness = observeContentFreshness(textContent);
  const semanticHtml = observeSemanticHtml(rawContent, filepath);
  const linkQuality = observeLinkQuality(textContent, tokens, htmlMeta);

  /** @type {ContentObservations} */
  const observations = {
    headingHierarchy,
    sectionSelfContainment,
    paragraphDistribution,
    answerFirst,
    attributionProximity,
    contentFreshness,
    linkQuality,
  };

  // semanticHtml is only present for HTML documents
  if (semanticHtml) {
    observations.semanticHtml = semanticHtml;
  }

  return observations;
}

/**
 * Collect observations and also return the raw tokens for downstream use.
 * @param {string} rawContent
 * @param {string} filepath
 * @param {Object} [opts]
 * @returns {{ observations: ContentObservations, tokens: any, textContent: string }}
 */
export function observeAndParse(rawContent, filepath = "", opts = {}) {
  const isHtml = isHtmlContent(rawContent) || filepath.endsWith(".html");
  let textContent, tokens;

  if (isHtml) {
    const structure = extractHtmlVisibleText(rawContent);
    textContent = structure.textContent;
    tokens = marked.lexer(textContent);
  } else {
    textContent = preprocessContent(rawContent);
    tokens = marked.lexer(textContent);
  }

  const observations = observeContent(rawContent, filepath, opts);
  return { observations, tokens, textContent };
}
