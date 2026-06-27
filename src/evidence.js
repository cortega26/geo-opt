/**
 * Evidence registry for geo-opt scoring rules.
 *
 * Each entry links a rule's claims to their supporting sources so that
 * evidence can be updated independently from rule logic. The registry is
 * versioned to track when sources were last reviewed.
 *
 * @module evidence
 */

/**
 * @typedef {Object} EvidenceEntry
 * @property {string} id - stable registry key (e.g. "geo-kdd-2024")
 * @property {string} title - human-readable source title
 * @property {string} url - primary URL or DOI
 * @property {"paper"|"official-doc"|"community-proposal"|"project-convention"} sourceType
 * @property {string} lastVerified - ISO 8601 date of last review (YYYY-MM-DD)
 */

/** @type {Readonly<Record<string, EvidenceEntry>>} */
export const EVIDENCE_REGISTRY = Object.freeze({
  "geo-kdd-2024": {
    id: "geo-kdd-2024",
    title: "GEO: Generative Engine Optimization (KDD 2024)",
    url: "https://arxiv.org/abs/2311.09735",
    sourceType: "paper",
    // NOTE: verificación externa pendiente (bloqueo de red en CI).
    // El paper fundacional de KDD 2024 sigue siendo la referencia canónica;
    // no se conoce retracción ni versión superadora. Re-verificar con acceso
    // a red externa.
    lastVerified: "2024-08-01",
  },
  "what-gets-cited-2025": {
    id: "what-gets-cited-2025",
    title: "What Gets Cited: Competitive GEO in AI Answer Engines (arXiv 2026)",
    url: "https://arxiv.org/abs/2605.25517",
    sourceType: "paper",
    lastVerified: "2026-06-27",
  },
  "google-ai-guide-2025": {
    id: "google-ai-guide-2025",
    title: "Optimizing your website for generative AI features on Google Search",
    url: "https://developers.google.com/search/docs/fundamentals/ai-optimization-guide",
    sourceType: "official-doc",
    lastVerified: "2026-06-27",
  },
  "google-canonical-2025": {
    id: "google-canonical-2025",
    title: "Google Search: Canonical URLs",
    url: "https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls",
    sourceType: "official-doc",
    lastVerified: "2026-06-27",
  },
  "google-robots-meta-2025": {
    id: "google-robots-meta-2025",
    title: "Google Search: Robots meta tag specifications",
    url: "https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag",
    sourceType: "official-doc",
    lastVerified: "2026-06-27",
  },
  "google-hreflang-2025": {
    id: "google-hreflang-2025",
    title: "Google Search: Localized versions of pages",
    url: "https://developers.google.com/search/docs/specialty/international/localized-versions",
    sourceType: "official-doc",
    lastVerified: "2026-06-27",
  },
  "google-structured-data-2025": {
    id: "google-structured-data-2025",
    title: "Google Search: Structured data general guidelines",
    url: "https://developers.google.com/search/docs/appearance/structured-data/sd-policies",
    sourceType: "official-doc",
    lastVerified: "2026-06-27",
  },
});

/**
 * Evidence levels and their definitions.
 *
 * These labels describe research support, NOT guaranteed outcomes.
 *
 * @readonly
 * @type {Record<string, string>}
 */
export const EVIDENCE_LABELS = Object.freeze({
  strong:
    "Supported by multiple independent, reproducible studies and official platform documentation.",
  probable:
    "Supported by at least one controlled study or consistent platform guidance, but not yet replicated independently across engines.",
  experimental:
    "Supported by a single controlled benchmark under specific conditions; results may not transfer to live engines or different domains.",
  heuristic:
    "A reasonable practice derived from the project's own observations. No external study confirms a causal effect on AI search or retrieval.",
});

/**
 * @readonly
 * @type {string[]}
 */
export const VALID_EVIDENCE_LABELS = Object.freeze(Object.keys(EVIDENCE_LABELS));

/**
 * @readonly
 * @type {string[]}
 */
export const VALID_SOURCE_TYPES = Object.freeze([
  "paper",
  "official-doc",
  "community-proposal",
  "project-convention",
]);

/**
 * Validate that every referenced source exists in the registry.
 *
 * @param {string[]} sourceRefs
 * @returns {{ valid: boolean, missing: string[] }}
 */
export function validateSourceRefs(sourceRefs) {
  const missing = [];
  for (const ref of sourceRefs) {
    if (!EVIDENCE_REGISTRY[ref]) {
      missing.push(ref);
    }
  }
  return { valid: missing.length === 0, missing };
}

/**
 * Check whether any registry entry's lastVerified date is older than
 * `staleDays` (default 180). Returns warnings for stale entries.
 *
 * @param {number} [staleDays=180]
 * @returns {string[]}
 */
export function staleEvidenceWarnings(staleDays = 180) {
  const now = new Date();
  const warnings = [];
  for (const entry of Object.values(EVIDENCE_REGISTRY)) {
    const verified = new Date(entry.lastVerified);
    const ageDays = (now - verified) / (1000 * 60 * 60 * 24);
    if (ageDays > staleDays) {
      warnings.push(
        `${entry.id} ("${entry.title}"): last verified ${entry.lastVerified} (${Math.round(ageDays)} days ago)`
      );
    }
  }
  return warnings;
}
