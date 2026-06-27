/**
 * Profile-aware audit model definitions.
 *
 * Each profile declares which dimensions are applicable and provides
 * heuristics for auto-detection. The detection function returns a profile
 * recommendation with a confidence score and accepts explicit overrides.
 *
 * Rationale (plan 022): a documentation page should not be penalized for
 * lacking expert quotations, and a privacy policy should not be nudged to
 * add decorative stats. Profiles encode these domain expectations as
 * explicit applicability rules rather than hidden scoring hacks.
 */

// ═══════════════════════════════════════════════════════════════════════════
// Profile definitions
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @typedef {Object} ProfileDefinition
 * @property {string} id
 * @property {string} label — human-readable name
 * @property {string} description
 * @property {string[]} applicableDimensions — dimensions scored for this profile
 */

/** @type {Readonly<Record<string, ProfileDefinition>>} */
export const PROFILES = Object.freeze({
  documentation: {
    id: "documentation",
    label: "API / Technical Documentation",
    description:
      "Reference material, SDK docs, CLI help, configuration schemas. " +
      "Valued for structure, clarity, and correct citations. " +
      "Not expected to contain expert quotes or marketing statistics.",
    applicableDimensions: ["structure", "citations", "clarity"],
  },

  "open-source": {
    id: "open-source",
    label: "Open-Source Project",
    description:
      "README files, contributing guides, changelogs, ADRs. " +
      "Valued for discoverability, contribution clarity, and " +
      "linked governance documents. Quotes and stats are optional.",
    applicableDimensions: ["structure", "citations", "clarity"],
  },

  editorial: {
    id: "editorial",
    label: "Editorial / Blog / News",
    description:
      "Articles, tutorials, opinion pieces, news reports. " +
      "All five dimensions apply: structure, attributed stats, " +
      "named quotes, external citations, and clear prose.",
    applicableDimensions: ["structure", "statistics", "quotations", "citations", "clarity"],
  },

  commercial: {
    id: "commercial",
    label: "Commercial / SaaS",
    description:
      "Landing pages, pricing, case studies, feature lists. " +
      "Valued for structure, attributed claims, and citations. " +
      "Quotations from customer testimonials are accepted but " +
      "not required for a strong score.",
    applicableDimensions: ["structure", "statistics", "citations", "clarity"],
  },

  ecommerce: {
    id: "ecommerce",
    label: "E-Commerce",
    description:
      "Product pages, category listings, buying guides. " +
      "Valued for structured specs, customer reviews, and " +
      "cross-sell links. Stats come from product attributes; " +
      "quotes from verified reviews carry evidentiary weight.",
    applicableDimensions: ["structure", "statistics", "quotations", "citations", "clarity"],
  },

  regulated: {
    id: "regulated",
    label: "Regulated / Legal / Medical / Financial",
    description:
      "Privacy policies, financial disclosures, medical guides. " +
      "Valued for dated authorship, attributed data, authoritative " +
      "sources, and unambiguous language. Quotes are neither " +
      "expected nor encouraged for this content type.",
    applicableDimensions: ["structure", "statistics", "citations", "clarity"],
  },
});

/** All valid profile ids. */
export const VALID_PROFILES = Object.freeze(Object.keys(PROFILES));

/** Every dimension the audit engine can measure. */
export const ALL_DIMENSIONS = Object.freeze([
  "structure",
  "statistics",
  "quotations",
  "citations",
  "clarity",
]);

// ═══════════════════════════════════════════════════════════════════════════
// Dimension applicability
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Returns true if `dimension` is applicable for `profile`.
 * @param {string} profile
 * @param {string} dimension
 * @returns {boolean}
 */
export function isApplicable(profile, dimension) {
  const def = PROFILES[profile];
  if (!def) return true; // unknown profile → score everything
  return def.applicableDimensions.includes(dimension);
}

/**
 * Returns the list of dimensions that are NOT applicable for `profile`.
 * @param {string} profile
 * @returns {string[]}
 */
export function notApplicableDimensions(profile) {
  const def = PROFILES[profile];
  if (!def) return [];
  return ALL_DIMENSIONS.filter((d) => !def.applicableDimensions.includes(d));
}

/**
 * Returns the maximum achievable total for a profile, normalized to 100.
 * Each applicable dimension contributes 20 points; non-applicable
 * dimensions contribute 0.
 *
 * @param {string} profile
 * @returns {{ totalMax: number, dimensionMax: Record<string, number> }}
 */
export function scoreCeiling(profile) {
  const applicable = PROFILES[profile]?.applicableDimensions ?? ALL_DIMENSIONS;
  const dimMax = Object.fromEntries(
    ALL_DIMENSIONS.map((d) => [d, applicable.includes(d) ? 20 : 0])
  );
  const totalMax = applicable.length * 20;
  return { totalMax, dimMax };
}

// ═══════════════════════════════════════════════════════════════════════════
// Auto-detection
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Auto-detect a content profile based on heuristics.
 *
 * Returns the recommended profile id and a confidence score (0–1).
 * Explicit user overrides always take precedence.
 *
 * Heuristics are ordered from most to least specific. The first
 * strong signal wins; if no signal is strong enough, defaults to
 * "editorial" with low confidence.
 *
 * @param {string} content — raw file content
 * @param {string} filepath — file path (used for extension check)
 * @returns {{ profile: string, confidence: number, reasons: string[] }}
 */
export function detectProfile(content, filepath = "") {
  const reasons = [];
  const lower = content.toLowerCase();
  const ext = filepath.split(".").pop()?.toLowerCase() ?? "";

  // ── Strong signals for regulated ──
  const regulatedSignals = [
    /privacy\s*policy/i,
    /terms\s*(of|and)\s*(service|use|conditions)/i,
    /forward[-\s]looking\s*statements/i,
    /securities\s*(and|&)\s*exchange\s*commission/i,
    /securities\s*(act|exchange\s*act)/i,
    /medical\s*review/i,
    /last\s*reviewed\s*:/i,
    /data\s*protection\s*officer/i,
    /gdpr\s*article/i,
    /standard\s*contractual\s*clauses/i,
    /subprocessors/i,
    /legal\s*basis\s*(for|:|—)/i,
    /retention\s*period/i,
    /\b(earnings\s*report|quarterly\s*report|fiscal\s*(year|quarter))\b/i,
  ];

  const regulatedCount = regulatedSignals.filter((re) => re.test(content)).length;
  if (regulatedCount >= 3) {
    reasons.push(`matched ${regulatedCount} regulated-content patterns`);
    return {
      profile: "regulated",
      confidence: Math.min(0.95, 0.6 + regulatedCount * 0.1),
      reasons,
    };
  }

  // ── Strong signals for ecommerce ──
  const ecommerceSignals = [
    /\b(add\s*to\s*(cart|bag|basket)|buy\s*now|shop\s*now)\b/i,
    /\$\d+(?:\.\d{2})?\b/,
    /\b(verified\s*purchase|verified\s*buyer|verified\s*owner)\b/i,
    /customer\s*reviews/i,
    /frequently\s*bought\s*together/i,
    /shipping\s*(&|and)\s*returns/i,
    /weight\s*capacity/i,
  ];

  const ecomCount = ecommerceSignals.filter((re) => re.test(content)).length;
  if (ecomCount >= 3 && ext === "md") {
    reasons.push(`matched ${ecomCount} ecommerce patterns`);
    return { profile: "ecommerce", confidence: Math.min(0.9, 0.5 + ecomCount * 0.1), reasons };
  }
  if (ecomCount >= 2 && ext === "html") {
    reasons.push(`matched ${ecomCount} ecommerce patterns on HTML page`);
    return { profile: "ecommerce", confidence: 0.7, reasons };
  }

  // ── Strong signals for documentation ──
  const docSignals = [
    /\b(endpoint|api\s*reference|sdk|cli\s*reference|configuration\s*schema)\b/i,
    /```[a-z]*\n[\s\S]*?```/,
    /\b(authorization|authentication)\s*:/i,
    /\b(response|request)\s*(body|headers|code):/i,
    /base\s*url/i,
    /rate\s*limit/i,
    // Additional patterns for technical reference docs (PG docs, language specs, etc.)
    /\b(query\s*planner|execution\s*plan|query\s*optimization)\b/i,
    /\b(backward\s*compatibility|regression\s*suite|minor\s*release)\b/i,
    /\b(syntax|deprecated|removed|added|changed|fixed)\s*(in|since)\s*(v|version)\s*\d/i,
    /\b(return\s*type|parameter|throws|since)\s*:/i, // JSDoc-style
  ];

  const codeBlockCount = (content.match(/```/g) || []).length / 2;
  const docCount = docSignals.filter((re) => re.test(content)).length;

  if (docCount >= 3 || (codeBlockCount >= 1 && docCount >= 2)) {
    reasons.push(`matched ${docCount} documentation patterns, ${codeBlockCount} code blocks`);
    return { profile: "documentation", confidence: Math.min(0.95, 0.5 + docCount * 0.1), reasons };
  }

  // ── Signals for open-source ──
  const ossSignals = [
    /\b(changelog|contributing|architecture\s*decision|license)\b/i,
    /\[!\[.*\]\(.*\)\]\(.*\)/, // badge pattern
    /npm\s+(install|i)\s+/,
    /pip\s+install\s+/,
    /\b(contributing\.md|code\s*of\s*conduct)\b/i,
    /\b(conventional\s*commits|commit\s*conventions)\b/i,
    /\b(quickstart|getting\s*started)\b/i,
    /pull\s*request\s*(checklist|process)/i,
  ];

  const ossCount = ossSignals.filter((re) => re.test(content)).length;
  if (ossCount >= 3) {
    reasons.push(`matched ${ossCount} open-source patterns`);
    return { profile: "open-source", confidence: Math.min(0.9, 0.5 + ossCount * 0.1), reasons };
  }

  // ── Signals for commercial ──
  const commercialSignals = [
    /\b(pricing|price|plan|enterprise|pro\s*plan)\b/i,
    /(start\s*free|free\s*trial|no\s*credit\s*card)/i,
    /\b(case\s*study|customer\s*story|testimonial)\b/i,
    /trusted\s*by/i,
    /(monthly|annual)\s*billing/i,
    /\b(soc\s*2|certified|compliance)\b/i,
  ];

  const commercialCount = commercialSignals.filter((re) => re.test(content)).length;
  if (commercialCount >= 3) {
    reasons.push(`matched ${commercialCount} commercial patterns`);
    return {
      profile: "commercial",
      confidence: Math.min(0.85, 0.5 + commercialCount * 0.1),
      reasons,
    };
  }

  // ── Weak signals → default to editorial ──
  // Editorial is the broadest profile — it applies all dimensions, so it's
  // the safe default when nothing specific is detected.
  if (reasons.length === 0) {
    reasons.push("no specific profile signals detected; defaulting to editorial");
  }
  return { profile: "editorial", confidence: reasons.length > 0 ? 0.4 : 0.2, reasons };
}

/**
 * Resolve the effective profile considering explicit config override.
 *
 * @param {Object} config — geo_config.json contents
 * @param {string} content — raw file content
 * @param {string} filepath — file path
 * @returns {{ profile: string, confidence: number, overridden: boolean, reasons: string[] }}
 */
export function resolveProfile(config, content, filepath = "") {
  const explicit = config?.profile;
  if (explicit && explicit !== "auto" && PROFILES[explicit]) {
    return {
      profile: explicit,
      confidence: 1.0,
      overridden: true,
      reasons: [`explicit config override: "${explicit}"`],
    };
  }

  const detected = detectProfile(content, filepath);
  return {
    ...detected,
    overridden: false,
  };
}
