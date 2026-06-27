/**
 * Pure, local technical-discovery checks for supplied HTML.
 *
 * This module does not read files or access the network. It reports only what
 * is observable in the supplied HTML and does not infer whether client-side
 * rendering will later add content.
 *
 * @module technical
 */

import * as cheerio from "cheerio";

import { buildReportMeta, createFinding } from "./findings.js";

const ROBOTS_TOKENS = new Set([
  "all",
  "none",
  "index",
  "noindex",
  "follow",
  "nofollow",
  "nosnippet",
  "noarchive",
  "noimageindex",
  "notranslate",
  "max-snippet",
  "max-image-preview",
  "max-video-preview",
  "unavailable_after",
]);

const LANGUAGE_TAG_PATTERN = /^(?:[a-z]{2,3})(?:-[a-z0-9]{2,8})*$/i;
const NON_CONTENT_ELEMENTS =
  "script, style, template, noscript, svg, canvas, iframe, nav, footer, header";

function normalizeSpace(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function wordCount(value) {
  const text = normalizeSpace(value);
  return text ? text.split(" ").length : 0;
}

function parseAbsoluteHttpUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url : null;
  } catch {
    return null;
  }
}

function resolveHttpUrl(value, sourceUrl) {
  try {
    const url = sourceUrl ? new URL(value, sourceUrl) : new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url : null;
  } catch {
    return null;
  }
}

function isInternalUrl(url, sourceUrl) {
  if (!url || !sourceUrl) return null;
  const source = parseAbsoluteHttpUrl(sourceUrl);
  return source ? url.origin === source.origin : null;
}

function extractRobotsDirectives($) {
  const declarations = [];
  $('meta[name="robots" i], meta[name="googlebot" i]').each((_, element) => {
    const agent = String($(element).attr("name") ?? "").toLowerCase();
    const content = String($(element).attr("content") ?? "");
    const directives = content
      .split(",")
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean);
    declarations.push({ agent, content, directives });
  });

  const directives = declarations.flatMap((entry) => entry.directives);
  const unknown = directives.filter((directive) => {
    const name = directive.split(":")[0].trim();
    return !ROBOTS_TOKENS.has(name);
  });
  const conflicts = [];
  for (const [positive, negative] of [
    ["index", "noindex"],
    ["follow", "nofollow"],
    ["all", "none"],
  ]) {
    if (directives.includes(positive) && directives.includes(negative)) {
      conflicts.push(`${positive}/${negative}`);
    }
  }

  return {
    declarations,
    directives: [...new Set(directives)],
    unknown: [...new Set(unknown)],
    conflicts,
    noindex: directives.includes("noindex") || directives.includes("none"),
    nofollow: directives.includes("nofollow") || directives.includes("none"),
  };
}

function extractJsonLd($) {
  const blocks = [];
  $('script[type="application/ld+json" i]').each((index, element) => {
    const raw = $(element).html() ?? "";
    try {
      const value = JSON.parse(raw);
      blocks.push({ index, valid: true, value });
    } catch (error) {
      blocks.push({ index, valid: false, error: error.message });
    }
  });
  return blocks;
}

function flattenJsonLdNodes(value) {
  if (Array.isArray(value)) return value.flatMap(flattenJsonLdNodes);
  if (!value || typeof value !== "object") return [];
  const graph = Array.isArray(value["@graph"]) ? value["@graph"].flatMap(flattenJsonLdNodes) : [];
  return [value, ...graph];
}

function observeStructuredDataConsistency(blocks, title, visibleText) {
  const nodes = blocks
    .filter((block) => block.valid)
    .flatMap((block) => flattenJsonLdNodes(block.value));
  const claims = [];
  const mismatches = [];
  const normalizedTitle = title.toLocaleLowerCase();
  const normalizedText = visibleText.toLocaleLowerCase();

  for (const node of nodes) {
    for (const property of ["headline", "name", "description"]) {
      if (typeof node[property] !== "string") continue;
      const value = normalizeSpace(node[property]);
      if (!value) continue;
      claims.push({ property, value });
      const normalizedValue = value.toLocaleLowerCase();
      const present =
        (property === "headline" || property === "name") && normalizedTitle
          ? normalizedTitle.includes(normalizedValue) || normalizedValue.includes(normalizedTitle)
          : normalizedText.includes(normalizedValue);
      if (!present) mismatches.push({ property, value });
    }
  }

  return { claims, mismatches };
}

/**
 * Extract engine-neutral technical observations from a supplied HTML string.
 *
 * @param {string} html
 * @param {{sourceUrl?: string, minVisibleWords?: number}} [options]
 * @returns {Object}
 */
export function observeTechnicalHtml(html, options = {}) {
  if (typeof html !== "string") {
    throw new TypeError("HTML input must be a string.");
  }

  const sourceUrl = options.sourceUrl ?? null;
  if (sourceUrl && !parseAbsoluteHttpUrl(sourceUrl)) {
    throw new TypeError("sourceUrl must be an absolute http or https URL.");
  }
  const minVisibleWords = options.minVisibleWords ?? 20;
  const $ = cheerio.load(html);

  const titles = $("head > title")
    .map((_, element) => normalizeSpace($(element).text()))
    .get();

  const visibleRoot = $("main").first().length
    ? $("main").first()
    : $("article").first().length
      ? $("article").first()
      : $("body").first();
  const visibleClone = visibleRoot.clone();
  visibleClone.find(NON_CONTENT_ELEMENTS).remove();
  const visibleText = normalizeSpace(visibleClone.text());

  const canonicals = $('link[rel~="canonical" i]')
    .map((_, element) => normalizeSpace($(element).attr("href")))
    .get();
  const canonicalDetails = canonicals.map((href) => ({
    href,
    absolute: Boolean(parseAbsoluteHttpUrl(href)),
    validHttpUrl: Boolean(resolveHttpUrl(href, sourceUrl)),
  }));

  const headings = $("h1, h2, h3, h4, h5, h6")
    .map((_, element) => ({
      level: Number(element.tagName.slice(1)),
      text: normalizeSpace($(element).text()),
    }))
    .get();
  const headingIssues = [];
  if (!headings.some((heading) => heading.level === 1)) {
    headingIssues.push("missing_h1");
  }
  if (headings.filter((heading) => heading.level === 1).length > 1) {
    headingIssues.push("multiple_h1");
  }
  for (let index = 1; index < headings.length; index += 1) {
    if (headings[index].level > headings[index - 1].level + 1) {
      headingIssues.push(`skipped_h${headings[index - 1].level}_to_h${headings[index].level}`);
    }
  }
  if (headings.some((heading) => !heading.text)) headingIssues.push("empty_heading");

  const documentLanguage = normalizeSpace($("html").attr("lang")).toLowerCase();
  const hreflang = $('link[rel~="alternate" i][hreflang]')
    .map((_, element) => {
      const language = normalizeSpace($(element).attr("hreflang")).toLowerCase();
      const href = normalizeSpace($(element).attr("href"));
      return {
        language,
        href,
        validLanguage: language === "x-default" || LANGUAGE_TAG_PATTERN.test(language),
        absolute: Boolean(parseAbsoluteHttpUrl(href)),
      };
    })
    .get();
  const duplicateHreflang = [
    ...new Set(
      hreflang
        .map((entry) => entry.language)
        .filter((language, index, languages) => language && languages.indexOf(language) !== index)
    ),
  ];
  const hasSelfHreflang = sourceUrl
    ? hreflang.some(
        (entry) => resolveHttpUrl(entry.href, sourceUrl)?.href === new URL(sourceUrl).href
      )
    : null;

  const links = $("a[href]")
    .map((_, element) => {
      const href = normalizeSpace($(element).attr("href"));
      const resolved = resolveHttpUrl(href, sourceUrl);
      const invalid =
        !href ||
        /^javascript:/i.test(href) ||
        (!href.startsWith("#") && sourceUrl !== null && !resolved);
      const rel = String($(element).attr("rel") ?? "")
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean);
      return {
        href,
        text: normalizeSpace($(element).text()),
        resolvedUrl: resolved?.href ?? null,
        internal: invalid ? null : isInternalUrl(resolved, sourceUrl),
        nofollow: rel.includes("nofollow"),
        invalid,
      };
    })
    .get();

  const robots = extractRobotsDirectives($);
  const jsonLd = extractJsonLd($);
  const structuredData = observeStructuredDataConsistency(jsonLd, titles[0] ?? "", visibleText);
  const visibleWords = wordCount(visibleText);
  const appRoots = $("#root, #app, [data-reactroot], [data-react-root], [data-v-app], #__next");
  const scriptCount = $("script[src]").length + $("script:not([src])").length;

  return {
    title: {
      values: titles,
      count: titles.length,
      empty: titles.length === 0 || titles.every((title) => !title),
    },
    visibleText: {
      text: visibleText,
      wordCount: visibleWords,
      root: visibleRoot.get(0)?.tagName ?? null,
      minimumWords: minVisibleWords,
    },
    canonical: {
      values: canonicalDetails,
      count: canonicals.length,
      conflicts: new Set(canonicals).size > 1,
    },
    robots,
    headings: { values: headings, issues: [...new Set(headingIssues)] },
    language: {
      documentLanguage,
      validDocumentLanguage: !documentLanguage || LANGUAGE_TAG_PATTERN.test(documentLanguage),
      hreflang,
      duplicateHreflang,
      hasSelfHreflang,
    },
    links: {
      values: links,
      invalidCount: links.filter((link) => link.invalid).length,
      nofollowCount: links.filter((link) => link.nofollow).length,
      internalCount: links.filter((link) => link.internal === true).length,
    },
    structuredData: {
      blockCount: jsonLd.length,
      invalidBlocks: jsonLd
        .filter((block) => !block.valid)
        .map(({ index, error }) => ({
          index,
          error,
        })),
      claims: structuredData.claims,
      mismatches: structuredData.mismatches,
    },
    appShell: {
      detected:
        visibleWords < minVisibleWords &&
        scriptCount > 0 &&
        (appRoots.length > 0 || visibleWords === 0),
      appRootCount: appRoots.length,
      scriptCount,
      visibleWordCount: visibleWords,
    },
  };
}

function finding(params) {
  return createFinding({
    category: "technical_discovery",
    applicability: "common",
    ...params,
  });
}

/**
 * Convert technical observations into versioned findings.
 *
 * @param {ReturnType<typeof observeTechnicalHtml>} observations
 * @returns {import("./findings.js").Finding[]}
 */
export function buildTechnicalFindings(observations) {
  const findings = [];
  const {
    title,
    visibleText,
    canonical,
    robots,
    headings,
    language,
    links,
    structuredData,
    appShell,
  } = observations;

  findings.push(
    finding({
      ruleId: "technical.title",
      severity: title.count === 1 && !title.empty ? "pass" : title.count > 1 ? "fail" : "warn",
      message:
        title.count === 1 && !title.empty
          ? "The supplied HTML has one non-empty title."
          : title.count > 1
            ? "The supplied HTML has multiple title elements."
            : "No non-empty title is present in the supplied HTML.",
      evidenceLabel: "strong",
      sourceRefs: ["google-ai-guide-2025"],
      observedFacts: { count: title.count, values: title.values },
      remediation:
        title.count === 1 && !title.empty
          ? null
          : "Provide exactly one descriptive, non-empty title element.",
    })
  );

  findings.push(
    finding({
      ruleId: "technical.visible_main_text",
      severity: visibleText.wordCount >= visibleText.minimumWords ? "pass" : "warn",
      message:
        visibleText.wordCount >= visibleText.minimumWords
          ? `The supplied HTML contains ${visibleText.wordCount} visible main-text words.`
          : `Only ${visibleText.wordCount} visible main-text words are present in the supplied HTML.`,
      evidenceLabel: "strong",
      sourceRefs: ["google-ai-guide-2025"],
      observedFacts: {
        wordCount: visibleText.wordCount,
        root: visibleText.root,
        minimumWords: visibleText.minimumWords,
      },
      remediation:
        visibleText.wordCount >= visibleText.minimumWords
          ? null
          : "Ensure critical page content is present as accessible text in the delivered HTML.",
    })
  );

  const validCanonical =
    canonical.count === 1 && canonical.values[0].absolute && !canonical.conflicts;
  findings.push(
    finding({
      ruleId: "technical.canonical",
      severity: validCanonical ? "pass" : canonical.count > 1 ? "fail" : "warn",
      message: validCanonical
        ? "The supplied HTML has one absolute HTTP(S) canonical URL."
        : canonical.count === 0
          ? "No canonical link is present in the supplied HTML."
          : canonical.count > 1
            ? "The supplied HTML has conflicting canonical links."
            : "The canonical link is not an absolute HTTP(S) URL.",
      evidenceLabel: "strong",
      sourceRefs: ["google-canonical-2025"],
      observedFacts: canonical,
      remediation: validCanonical
        ? null
        : "Provide one absolute HTTP(S) canonical URL that represents this page.",
    })
  );

  findings.push(
    finding({
      ruleId: "technical.meta_robots",
      severity:
        robots.conflicts.length > 0
          ? "fail"
          : robots.noindex
            ? "warn"
            : robots.unknown.length > 0
              ? "warn"
              : "pass",
      message:
        robots.conflicts.length > 0
          ? `Conflicting robots directives are present: ${robots.conflicts.join(", ")}.`
          : robots.noindex
            ? "A noindex directive is present in the supplied HTML."
            : robots.unknown.length > 0
              ? `Unrecognized robots directives are present: ${robots.unknown.join(", ")}.`
              : "No conflicting or noindex robots directives were observed.",
      evidenceLabel: "strong",
      sourceRefs: ["google-robots-meta-2025"],
      observedFacts: robots,
      remediation:
        robots.conflicts.length === 0 && !robots.noindex && robots.unknown.length === 0
          ? null
          : "Review meta robots directives against the page's intended indexing policy.",
    })
  );

  findings.push(
    finding({
      ruleId: "technical.heading_order",
      severity: headings.issues.length === 0 ? "pass" : "warn",
      message:
        headings.issues.length === 0
          ? "Heading levels form a coherent hierarchy."
          : `Heading hierarchy issues observed: ${headings.issues.join(", ")}.`,
      evidenceLabel: "heuristic",
      observedFacts: headings,
      remediation:
        headings.issues.length === 0
          ? null
          : "Use one descriptive H1 and avoid skipping heading levels.",
    })
  );

  const languageIssues = [
    ...(language.validDocumentLanguage ? [] : ["invalid_document_language"]),
    ...language.hreflang.filter((entry) => !entry.validLanguage).map(() => "invalid_hreflang"),
    ...language.hreflang.filter((entry) => !entry.absolute).map(() => "non_absolute_hreflang_url"),
    ...language.duplicateHreflang.map((value) => `duplicate_${value}`),
    ...(language.hasSelfHreflang === false ? ["missing_self_reference"] : []),
  ];
  findings.push(
    finding({
      ruleId: "technical.language_alternates",
      severity: languageIssues.length === 0 ? "pass" : "warn",
      message:
        languageIssues.length === 0
          ? "No invalid language or hreflang declarations were observed."
          : `Language alternate issues observed: ${[...new Set(languageIssues)].join(", ")}.`,
      evidenceLabel: "strong",
      sourceRefs: ["google-hreflang-2025"],
      observedFacts: language,
      remediation:
        languageIssues.length === 0
          ? null
          : "Use valid language tags, absolute alternate URLs, and include the current page in each hreflang set.",
    })
  );

  findings.push(
    finding({
      ruleId: "technical.internal_links",
      severity: links.invalidCount > 0 ? "warn" : "pass",
      message:
        links.invalidCount > 0
          ? `${links.invalidCount} invalid or unusable link target(s) were observed.`
          : "No invalid link targets were observed in the supplied HTML.",
      evidenceLabel: "probable",
      sourceRefs: ["google-ai-guide-2025"],
      observedFacts: {
        invalidCount: links.invalidCount,
        nofollowCount: links.nofollowCount,
        internalCount: links.internalCount,
        invalidLinks: links.values.filter((link) => link.invalid),
      },
      remediation:
        links.invalidCount > 0
          ? "Replace empty, JavaScript-only, or malformed link targets with crawlable URLs."
          : null,
    })
  );

  findings.push(
    finding({
      ruleId: "technical.structured_data_text_consistency",
      severity:
        structuredData.invalidBlocks.length > 0
          ? "fail"
          : structuredData.mismatches.length > 0
            ? "warn"
            : structuredData.blockCount === 0
              ? "not_applicable"
              : "pass",
      message:
        structuredData.invalidBlocks.length > 0
          ? `${structuredData.invalidBlocks.length} JSON-LD block(s) could not be parsed.`
          : structuredData.mismatches.length > 0
            ? `${structuredData.mismatches.length} structured-data text claim(s) were not found in visible text or the title.`
            : structuredData.blockCount === 0
              ? "No JSON-LD blocks are present; text consistency is not applicable."
              : "Checked structured-data text claims are consistent with supplied HTML text.",
      evidenceLabel: "probable",
      sourceRefs: ["google-structured-data-2025"],
      observedFacts: structuredData,
      remediation:
        structuredData.invalidBlocks.length > 0 || structuredData.mismatches.length > 0
          ? "Keep JSON-LD parseable and ensure its user-facing claims match visible page content."
          : null,
    })
  );

  findings.push(
    finding({
      ruleId: "technical.empty_app_shell",
      severity: appShell.detected ? "warn" : "pass",
      message: appShell.detected
        ? "The supplied HTML has app-shell signals but little or no visible text; client-rendered content was not evaluated."
        : "The supplied HTML does not match the empty app-shell heuristic.",
      evidenceLabel: "heuristic",
      observedFacts: appShell,
      remediation: appShell.detected
        ? "Verify that critical content is available in the HTML delivered to crawlers; this finding does not determine whether the application is broken."
        : null,
    })
  );

  return findings;
}

/**
 * Audit supplied HTML without filesystem or network access.
 *
 * @param {string} html
 * @param {{sourceUrl?: string, minVisibleWords?: number}} [options]
 * @returns {Object}
 */
export function auditTechnicalHtml(html, options = {}) {
  const observations = observeTechnicalHtml(html, options);
  return {
    ...buildReportMeta(),
    target: options.sourceUrl ?? null,
    observations,
    findings: buildTechnicalFindings(observations),
  };
}
