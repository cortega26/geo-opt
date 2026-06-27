/**
 * Versioned finding contract for geo-opt audit reports.
 *
 * Every finding carries a stable `ruleId`, severity, evidence label,
 * applicability, source references, observed facts, and remediation.
 * Findings are additive — legacy scores and recommendations are preserved.
 *
 * @module findings
 */

import { VALID_EVIDENCE_LABELS, validateSourceRefs } from "./evidence.js";

/** Current report contract version. */
export const REPORT_VERSION = "1.0.0";

/** Scoring model version (matches package.json). */
export const MODEL_VERSION = "2.0.0";

/**
 * @typedef {"pass"|"warn"|"fail"|"not_applicable"} FindingStatus
 */

/**
 * @typedef {Object} Finding
 * @property {string} ruleId - stable, namespaced identifier (e.g. "content.answer_first")
 * @property {string} category - grouping key matching a breakdown dimension
 * @property {FindingStatus} severity
 * @property {FindingStatus} status - alias for severity
 * @property {string} message - human-readable description of what was observed
 * @property {string} evidenceLabel - one of VALID_EVIDENCE_LABELS
 * @property {string|string[]} applicability - "common" or array of engine IDs
 * @property {string[]} sourceRefs - keys into the evidence registry
 * @property {Record<string, unknown>} observedFacts - measured values
 * @property {string|null} remediation - suggested fix, or null if pass/not_applicable
 */

/**
 * @typedef {Object} ReportMeta
 * @property {string} reportVersion
 * @property {string} modelVersion
 * @property {string} generatedAt - ISO 8601 timestamp
 */

/**
 * Create a single finding. Validates required fields and normalizes values.
 *
 * @param {Object} params
 * @param {string} params.ruleId
 * @param {string} params.category
 * @param {FindingStatus} params.severity
 * @param {string} params.message
 * @param {string} params.evidenceLabel
 * @param {string|string[]} [params.applicability="common"]
 * @param {string[]} [params.sourceRefs=[]]
 * @param {Record<string, unknown>} [params.observedFacts={}]
 * @param {string|null} [params.remediation=null]
 * @returns {Finding}
 */
export function createFinding({
  ruleId,
  category,
  severity,
  message,
  evidenceLabel,
  applicability = "common",
  sourceRefs = [],
  observedFacts = {},
  remediation = null,
}) {
  // Validate evidence label
  if (!VALID_EVIDENCE_LABELS.includes(evidenceLabel)) {
    throw new Error(
      `Invalid evidenceLabel "${evidenceLabel}" for rule ${ruleId}. Must be one of: ${VALID_EVIDENCE_LABELS.join(", ")}`
    );
  }

  // Validate source refs
  if (sourceRefs.length > 0) {
    const { valid, missing } = validateSourceRefs(sourceRefs);
    if (!valid) {
      throw new Error(`Unknown source refs for rule ${ruleId}: ${missing.join(", ")}`);
    }
  }

  return {
    ruleId,
    category,
    severity,
    status: severity,
    message,
    evidenceLabel,
    applicability,
    sourceRefs,
    observedFacts,
    remediation,
  };
}

/**
 * Build report metadata for the current model version.
 *
 * @returns {ReportMeta}
 */
export function buildReportMeta() {
  return {
    reportVersion: REPORT_VERSION,
    modelVersion: MODEL_VERSION,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Map legacy scoring observations to structured findings.
 *
 * This function produces an additive `findings` array from the same data
 * used to compute the legacy breakdown. Scores and recommendations are
 * NOT changed — findings are emitted alongside them.
 *
 * @param {Object} params
 * @param {number} params.introWordCount
 * @param {boolean} params.introHasDefinition
 * @param {boolean} params.hasTable
 * @param {boolean} params.hasList
 * @param {boolean} params.hasHeaders
 * @param {boolean} params.hasSemanticHtml
 * @param {boolean} params.hasDynamicRendering
 * @param {number} params.totalStatCount
 * @param {number} params.quoteCount
 * @param {number} params.linkCount
 * @param {boolean} params.hasSourcesSection
 * @param {number} params.pronounDensity
 * @param {number} params.pronounLimit
 * @param {string[]} params.unexplainedAcronyms
 * @returns {Finding[]}
 */
export function mapLegacyToFindings({
  introWordCount,
  introHasDefinition,
  hasTable,
  hasList,
  hasHeaders,
  hasSemanticHtml,
  hasDynamicRendering,
  totalStatCount,
  quoteCount,
  linkCount,
  hasSourcesSection,
  pronounDensity,
  pronounLimit,
  unexplainedAcronyms,
}) {
  /** @type {Finding[]} */
  const findings = [];

  // --- Structure ---

  if (introWordCount > 0) {
    const inRange = introWordCount >= 40 && introWordCount <= 90;
    findings.push(
      createFinding({
        ruleId: "content.intro_definition",
        category: "structure",
        severity: inRange ? "pass" : "warn",
        message: inRange
          ? `Intro paragraph is ${introWordCount} words${introHasDefinition ? " and contains definition markers" : ""}.`
          : `Intro paragraph has ${introWordCount} words (heuristic range: 40–90).`,
        evidenceLabel: "experimental",
        sourceRefs: ["geo-kdd-2024"],
        observedFacts: { wordCount: introWordCount, hasDefinition: introHasDefinition },
        remediation: inRange
          ? null
          : "Lead with a direct, self-contained definition of the main topic. The 40–90 word range was observed in one controlled benchmark and is not a universal requirement.",
      })
    );
  } else {
    findings.push(
      createFinding({
        ruleId: "content.intro_definition",
        category: "structure",
        severity: "fail",
        message: "No intro paragraph found.",
        evidenceLabel: "experimental",
        sourceRefs: ["geo-kdd-2024"],
        observedFacts: { wordCount: 0, hasDefinition: false },
        remediation:
          "Add a direct, self-contained opening paragraph that defines the main topic or entity.",
      })
    );
  }

  findings.push(
    createFinding({
      ruleId: "content.tables",
      category: "structure",
      severity: hasTable ? "pass" : "warn",
      message: hasTable ? "Structured data tables present." : "No tables found.",
      evidenceLabel: "heuristic",
      observedFacts: { hasTable },
      remediation: hasTable
        ? null
        : "Use tables for feature comparisons, pricing, or structured reference data where appropriate.",
    })
  );

  findings.push(
    createFinding({
      ruleId: "content.lists",
      category: "structure",
      severity: hasList ? "pass" : "warn",
      message: hasList ? "Bulleted or numbered lists present." : "No lists found.",
      evidenceLabel: "heuristic",
      observedFacts: { hasList },
      remediation: hasList ? null : "Use bulleted or numbered lists to break up dense paragraphs.",
    })
  );

  findings.push(
    createFinding({
      ruleId: "content.headings",
      category: "structure",
      severity: hasHeaders ? "pass" : "warn",
      message: hasHeaders ? "Clean H2/H3 heading hierarchy found." : "No H2/H3 headers found.",
      evidenceLabel: "heuristic",
      observedFacts: { hasHeaders },
      remediation: hasHeaders
        ? null
        : "Add H2 and H3 section headings to organize content for both readers and retrieval systems.",
    })
  );

  // HTML-only checks
  if (hasSemanticHtml !== undefined) {
    findings.push(
      createFinding({
        ruleId: "content.semantic_html",
        category: "structure",
        severity: hasSemanticHtml ? "pass" : "warn",
        message: hasSemanticHtml
          ? "Good HTML5 semantic layout tags present."
          : "Lacks HTML5 structural tags (e.g. <main>, <article>).",
        evidenceLabel: "heuristic",
        observedFacts: { hasSemanticHtml },
        remediation: hasSemanticHtml
          ? null
          : "Use HTML5 semantic elements (<main>, <article>, <nav>, <section>) to help parsers identify content regions.",
      })
    );
  }

  if (hasDynamicRendering) {
    findings.push(
      createFinding({
        ruleId: "content.dynamic_rendering",
        category: "structure",
        severity: "warn",
        message:
          "Detected client-side JS references. Ensure content is pre-rendered / SSR for AI crawler searchability.",
        evidenceLabel: "heuristic",
        observedFacts: { hasDynamicRendering: true },
        remediation:
          "Pre-render or server-side render (SSR) content so that AI crawlers can access it without executing JavaScript.",
      })
    );
  }

  // --- Statistics ---

  if (totalStatCount >= 3) {
    findings.push(
      createFinding({
        ruleId: "content.statistics_density",
        category: "statistics",
        severity: "pass",
        message: `High numerical evidence density (${totalStatCount} data points found).`,
        evidenceLabel: "heuristic",
        observedFacts: { totalStatCount },
        remediation: null,
      })
    );
  } else if (totalStatCount > 0) {
    findings.push(
      createFinding({
        ruleId: "content.statistics_density",
        category: "statistics",
        severity: "warn",
        message: `Moderate numerical evidence density (${totalStatCount} data points found).`,
        evidenceLabel: "heuristic",
        observedFacts: { totalStatCount },
        remediation:
          "Where accurate data is available, add specific metrics, percentages, or numerical evidence. Do not fabricate statistics.",
      })
    );
  } else {
    findings.push(
      createFinding({
        ruleId: "content.statistics_density",
        category: "statistics",
        severity: "warn",
        message: "No statistics or numerical evidence found.",
        evidenceLabel: "heuristic",
        observedFacts: { totalStatCount: 0 },
        remediation:
          "Where accurate data is available, add specific metrics, percentages, or numerical evidence. Do not fabricate statistics.",
      })
    );
  }

  // --- Quotations ---

  if (quoteCount >= 2) {
    findings.push(
      createFinding({
        ruleId: "content.quotation_density",
        category: "quotations",
        severity: "pass",
        message: `High quotation density (${quoteCount} quotes found).`,
        evidenceLabel: "experimental",
        sourceRefs: ["geo-kdd-2024"],
        observedFacts: { quoteCount },
        remediation: null,
      })
    );
  } else if (quoteCount > 0) {
    findings.push(
      createFinding({
        ruleId: "content.quotation_density",
        category: "quotations",
        severity: "warn",
        message: `Moderate quotation density (${quoteCount} quotes found).`,
        evidenceLabel: "experimental",
        sourceRefs: ["geo-kdd-2024"],
        observedFacts: { quoteCount },
        remediation:
          "Include attributed quotes from named sources with verifiable credentials where they strengthen the content. Do not fabricate quotes.",
      })
    );
  } else {
    findings.push(
      createFinding({
        ruleId: "content.quotation_density",
        category: "quotations",
        severity: "warn",
        message: "No expert quotes or direct attributions found.",
        evidenceLabel: "experimental",
        sourceRefs: ["geo-kdd-2024"],
        observedFacts: { quoteCount: 0 },
        remediation:
          "Include attributed quotes from named sources with verifiable credentials where they strengthen the content. Do not fabricate quotes.",
      })
    );
  }

  // --- Citations ---

  if (linkCount >= 3) {
    findings.push(
      createFinding({
        ruleId: "content.citation_links",
        category: "citations",
        severity: "pass",
        message: `High authority link density (${linkCount} external links found).`,
        evidenceLabel: "probable",
        sourceRefs: ["geo-kdd-2024", "what-gets-cited-2025"],
        observedFacts: { linkCount },
        remediation: null,
      })
    );
  } else if (linkCount > 0) {
    findings.push(
      createFinding({
        ruleId: "content.citation_links",
        category: "citations",
        severity: "warn",
        message: `Moderate link density (${linkCount} external links found).`,
        evidenceLabel: "probable",
        sourceRefs: ["geo-kdd-2024", "what-gets-cited-2025"],
        observedFacts: { linkCount },
        remediation:
          "Link key claims to reputable primary sources. Do not add citations to unverified or irrelevant material.",
      })
    );
  } else {
    findings.push(
      createFinding({
        ruleId: "content.citation_links",
        category: "citations",
        severity: "warn",
        message: "No external hyperlinks found.",
        evidenceLabel: "probable",
        sourceRefs: ["geo-kdd-2024", "what-gets-cited-2025"],
        observedFacts: { linkCount: 0 },
        remediation:
          "Link key claims to reputable primary sources. Do not add citations to unverified or irrelevant material.",
      })
    );
  }

  findings.push(
    createFinding({
      ruleId: "content.references_section",
      category: "citations",
      severity: hasSourcesSection ? "pass" : "warn",
      message: hasSourcesSection
        ? "Dedicated citation/sources section found."
        : "No dedicated citation section found.",
      evidenceLabel: "probable",
      sourceRefs: ["what-gets-cited-2025"],
      observedFacts: { hasSourcesSection },
      remediation: hasSourcesSection
        ? null
        : "Consider adding a '# Sources' or '# References' section listing cited resources.",
    })
  );

  // --- Clarity ---

  findings.push(
    createFinding({
      ruleId: "content.pronoun_density",
      category: "clarity",
      severity: pronounDensity > pronounLimit ? "warn" : "pass",
      message:
        pronounDensity > pronounLimit
          ? `Ambiguous pronoun density is ${(pronounDensity * 100).toFixed(1)}% (project threshold: ${(pronounLimit * 100).toFixed(0)}%).`
          : `Ambiguous pronoun density is ${(pronounDensity * 100).toFixed(1)}% (within project threshold).`,
      evidenceLabel: "heuristic",
      observedFacts: {
        pronounDensity: Math.round(pronounDensity * 1000) / 1000,
        pronounLimit,
      },
      remediation:
        pronounDensity > pronounLimit
          ? "Replace ambiguous pronouns ('it', 'they', 'this') with specific entity names where clarity is at risk. The percentage threshold is a project-internal benchmark, not a platform requirement."
          : null,
    })
  );

  findings.push(
    createFinding({
      ruleId: "content.acronym_clarity",
      category: "clarity",
      severity: unexplainedAcronyms.length > 0 ? "warn" : "pass",
      message:
        unexplainedAcronyms.length > 0
          ? `Unexplained acronyms found: ${unexplainedAcronyms.join(", ")}.`
          : "All acronyms are defined or none detected.",
      evidenceLabel: "heuristic",
      observedFacts: {
        unexplainedCount: unexplainedAcronyms.length,
        unexplained: unexplainedAcronyms,
      },
      remediation:
        unexplainedAcronyms.length > 0
          ? "Spell out acronyms on first occurrence (e.g., 'SaaS (Software as a Service)')."
          : null,
    })
  );

  return findings;
}

export default {
  REPORT_VERSION,
  MODEL_VERSION,
  createFinding,
  buildReportMeta,
  mapLegacyToFindings,
};
