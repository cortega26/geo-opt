/**
 * Profile-aware scoring model v2 (plan 022, step 4).
 *
 * Consumes observations from src/observations.js and profile definitions
 * from src/profiles.js to produce dimension-level scores, a readiness
 * band, and structured findings.
 *
 * Design invariants (from plan 022):
 *  - V2 is opt-in behind --model v2. V1 remains default.
 *  - Profile-aware: non-applicable dimensions are omitted, not penalized.
 *  - Readiness band replaces the 0–100 pseudo-precise total.
 *  - Findings carry evidence labels and source refs.
 *  - Adversarial fixtures must rank below credible counterparts.
 */

import { marked } from "marked";
import { preprocessContent } from "./text.js";
import { PROFILES, isApplicable, notApplicableDimensions, resolveProfile } from "./profiles.js";
import { observeContent } from "./observations.js";
import { buildReportMeta, mapObservationsToFindings } from "./findings.js";
import { EVIDENCE_REGISTRY } from "./evidence.js";

// ═══════════════════════════════════════════════════════════════════════════
// Dimension scoring helpers
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Score the structure dimension from observations.
 * @param {import("./observations.js").ContentObservations} obs
 * @returns {{ score: number, max: number, details: string[], findings: Array<{ruleId: string, status: string, message: string}> }}
 */
function scoreStructure(obs) {
  let score = 0;
  const max = 20;
  const details = [];
  const findings = [];

  // Heading hierarchy (0–7 pts)
  if (obs.headingHierarchy.status === "pass") {
    score += 7;
    details.push("Headings: Clean, no skipped levels (+7 pts)");
  } else if (obs.headingHierarchy.status === "warn") {
    score += 4;
    details.push(`Headings: Minor issues — ${obs.headingHierarchy.message} (+4 pts)`);
    findings.push({
      ruleId: "v2.structure.headings",
      status: "warn",
      message: obs.headingHierarchy.message,
    });
  } else {
    details.push(`Headings: ${obs.headingHierarchy.message} (+0 pts)`);
    findings.push({
      ruleId: "v2.structure.headings",
      status: "fail",
      message: obs.headingHierarchy.message,
    });
  }

  // Section self-containment (0–5 pts)
  if (obs.sectionSelfContainment.status === "pass") {
    score += 5;
    details.push("Sections: All sections have adequate body content (+5 pts)");
  } else if (obs.sectionSelfContainment.status === "warn") {
    score += 2;
    details.push(`Sections: ${obs.sectionSelfContainment.message} (+2 pts)`);
    findings.push({
      ruleId: "v2.structure.empty_sections",
      status: "warn",
      message: obs.sectionSelfContainment.message,
    });
  } else {
    details.push(`Sections: ${obs.sectionSelfContainment.message} (+0 pts)`);
    findings.push({
      ruleId: "v2.structure.empty_sections",
      status: "fail",
      message: obs.sectionSelfContainment.message,
    });
  }

  // Answer-first (0–5 pts)
  if (obs.answerFirst.status === "pass") {
    score += 5;
    details.push("Answer-First: Clear definition in opening paragraph (+5 pts)");
  } else if (obs.answerFirst.status === "warn") {
    score += 2;
    details.push(`Answer-First: ${obs.answerFirst.message} (+2 pts)`);
  } else {
    details.push(`Answer-First: ${obs.answerFirst.message} (+0 pts)`);
    findings.push({
      ruleId: "v2.structure.answer_first",
      status: "fail",
      message: obs.answerFirst.message,
    });
  }

  // Tables, lists, code blocks (0–3 pts) — structural richness
  const textContent = obs.answerFirst.message; // not useful, need raw. We'll compute inline.
  // Structural richness is derived from paragraph stats
  const hasRichStructure =
    obs.paragraphDistribution.stats &&
    obs.paragraphDistribution.stats.median >= 10 &&
    obs.paragraphDistribution.stats.longCount === 0;
  if (hasRichStructure) {
    score += 3;
    details.push("Paragraphs: Well-distributed, scannable structure (+3 pts)");
  } else if (obs.paragraphDistribution.status === "pass") {
    score += 2;
    details.push("Paragraphs: Adequate distribution (+2 pts)");
  } else {
    score += 1;
    details.push(`Paragraphs: ${obs.paragraphDistribution.message} (+1 pt)`);
  }

  return { score: Math.min(score, max), max, details, findings };
}

/**
 * Score the statistics dimension from observations.
 * @param {import("./observations.js").ContentObservations} obs
 * @returns {{ score: number, max: number, details: string[], findings: Array<{ruleId: string, status: string, message: string}> }}
 */
function scoreStatistics(obs) {
  let score = 0;
  const max = 20;
  const details = [];
  const findings = [];

  const attr = obs.attributionProximity;
  const totalStats = attr.statsWithNearbySource + attr.statsWithoutNearbySource;

  if (totalStats === 0) {
    details.push("Statistics: No numerical evidence found (+0 pts)");
    return { score: 0, max, details, findings };
  }

  // Attribution quality (0–15 pts)
  const attributionRatio = totalStats > 0 ? attr.statsWithNearbySource / totalStats : 0;

  if (attributionRatio >= 0.8 && totalStats >= 3) {
    score += 15;
    details.push(
      `Statistics: ${totalStats} stats, ${Math.round(attributionRatio * 100)}% with nearby source attribution (+15 pts)`
    );
  } else if (attributionRatio >= 0.5 && totalStats >= 2) {
    score += 10;
    details.push(
      `Statistics: ${totalStats} stats, ${Math.round(attributionRatio * 100)}% attributed (+10 pts)`
    );
  } else if (attributionRatio > 0 && totalStats >= 3) {
    score += 6;
    details.push(
      `Statistics: ${totalStats} stats but only ${Math.round(attributionRatio * 100)}% have nearby source attribution (+6 pts)`
    );
    findings.push({
      ruleId: "v2.statistics.attribution",
      status: "warn",
      message: `${attr.statsWithoutNearbySource} of ${totalStats} statistics lack nearby source attribution.`,
    });
  } else if (totalStats >= 3) {
    // Zero attribution — strongly penalized
    score += 2;
    details.push(
      `Statistics: ${totalStats} stats with NO source attribution (+2 pts — attribution required for full credit)`
    );
    findings.push({
      ruleId: "v2.statistics.attribution",
      status: "fail",
      message: `All ${totalStats} statistics lack nearby source attribution. Add sources and methodology.`,
    });
  } else {
    score += 2;
    details.push(`Statistics: ${totalStats} stat(s) found (+2 pts)`);
  }

  // Density bonus (0–5 pts): only for well-attributed stats
  if (totalStats >= 5 && attributionRatio >= 0.7) {
    score += 5;
    details.push("Statistics: High density with strong attribution (+5 pts)");
  } else if (totalStats >= 3 && attributionRatio >= 0.5) {
    score += 3;
    details.push("Statistics: Good density with adequate attribution (+3 pts)");
  } else if (attributionRatio >= 0.5) {
    score += 1;
    details.push("Statistics: Adequate attribution (+1 pt)");
  }
  // Zero-attribution stats get no density bonus

  // Flag unattributed stats as adversarial signal
  if (attr.statsWithoutNearbySource >= 5 && attributionRatio < 0.3) {
    findings.push({
      ruleId: "v2.statistics.implausible",
      status: "fail",
      message: `${attr.statsWithoutNearbySource} statistics without attribution — possible fabricated or unverified claims.`,
    });
  }

  return { score: Math.min(score, max), max, details, findings };
}

/**
 * Score the quotations dimension from observations.
 * @param {import("./observations.js").ContentObservations} obs
 * @returns {{ score: number, max: number, details: string[], findings: Array<{ruleId: string, status: string, message: string}> }}
 */
function scoreQuotations(obs) {
  let score = 0;
  const max = 20;
  const details = [];
  const findings = [];

  const attr = obs.attributionProximity;
  const totalQuotes = attr.quotesWithAttribution + attr.quotesWithoutAttribution;

  if (totalQuotes === 0) {
    details.push("Quotations: No quotes present (+0 pts)");
    return { score: 0, max, details, findings };
  }

  const attributionRatio = totalQuotes > 0 ? attr.quotesWithAttribution / totalQuotes : 0;

  // Attribution quality (0–12 pts)
  if (attributionRatio === 1.0 && totalQuotes >= 2) {
    score += 12;
    details.push(`Quotations: All ${totalQuotes} quotes have identifiable attribution (+12 pts)`);
  } else if (attributionRatio >= 0.7) {
    score += 8;
    details.push(
      `Quotations: ${Math.round(attributionRatio * 100)}% of ${totalQuotes} quotes attributed (+8 pts)`
    );
  } else if (totalQuotes > 0 && attributionRatio > 0) {
    score += 4;
    details.push(
      `Quotations: Some quotes attributed but ${attr.quotesWithoutAttribution} lack sources (+4 pts)`
    );
    findings.push({
      ruleId: "v2.quotations.attribution",
      status: "warn",
      message: `${attr.quotesWithoutAttribution} of ${totalQuotes} quotes lack identifiable attribution.`,
    });
  } else {
    details.push(`Quotations: ${totalQuotes} quotes with no attribution (+0 pts)`);
    findings.push({
      ruleId: "v2.quotations.attribution",
      status: "fail",
      message: `All ${totalQuotes} quotes lack attribution. Add speaker name, title, and context.`,
    });
  }

  // Density bonus (0–8 pts)
  if (totalQuotes >= 3 && attributionRatio >= 0.8) {
    score += 8;
    details.push("Quotations: Rich use of attributed expert voices (+8 pts)");
  } else if (totalQuotes >= 2 && attributionRatio >= 0.7) {
    score += 5;
    details.push("Quotations: Good use of attributed quotes (+5 pts)");
  } else if (totalQuotes >= 1) {
    score += 2;
    details.push("Quotations: Present (+2 pts)");
  }

  // Flag unattributed quotes as adversarial
  if (attr.quotesWithoutAttribution >= 3 && attributionRatio < 0.3) {
    findings.push({
      ruleId: "v2.quotations.unattributed",
      status: "fail",
      message: `${attr.quotesWithoutAttribution} unattributed quotes — possible fabricated quotations.`,
    });
  }

  return { score: Math.min(score, max), max, details, findings };
}

/**
 * Score the citations dimension from observations.
 * @param {import("./observations.js").ContentObservations} obs
 * @returns {{ score: number, max: number, details: string[], findings: Array<{ruleId: string, status: string, message: string}> }}
 */
function scoreCitations(obs) {
  let score = 0;
  const max = 20;
  const details = [];
  const findings = [];

  const link = obs.linkQuality;

  // Link-farm detection (automatic fail for this dimension)
  if (link.hasExcessiveLinks) {
    details.push(`Citations: ${link.message} (+0 pts)`);
    findings.push({
      ruleId: "v2.citations.link_farm",
      status: "fail",
      message: link.message,
    });
    return { score: 0, max, details, findings };
  }

  // External link count (0–12 pts)
  if (link.externalLinkCount >= 5) {
    score += 12;
    details.push(
      `Citations: ${link.externalLinkCount} external links — strong citation network (+12 pts)`
    );
  } else if (link.externalLinkCount >= 3) {
    score += 9;
    details.push(`Citations: ${link.externalLinkCount} external links (+9 pts)`);
  } else if (link.externalLinkCount >= 1) {
    score += 5;
    details.push(`Citations: ${link.externalLinkCount} external link(s) (+5 pts)`);
  } else {
    details.push("Citations: No external links (+0 pts)");
    findings.push({
      ruleId: "v2.citations.no_links",
      status: "warn",
      message: "No external hyperlinks found. Citations improve authority signals.",
    });
  }

  // Sources section (0–5 pts)
  if (link.hasSourcesSection) {
    score += 5;
    details.push("Citations: Dedicated sources/references section (+5 pts)");
  } else if (link.externalLinkCount >= 3) {
    score += 3;
    details.push("Citations: No dedicated sources section, but external links present (+3 pts)");
  }

  // Content freshness bonus (0–3 pts) — dated content with review date
  if (obs.contentFreshness.status === "pass") {
    score += 3;
    details.push("Freshness: Dated and reviewed content (+3 pts)");
  } else if (obs.contentFreshness.publishedDate || obs.contentFreshness.reviewedDate) {
    score += 1;
    details.push("Freshness: Partial date information (+1 pt)");
  }

  return { score: Math.min(score, max), max, details, findings };
}

/**
 * Score the clarity dimension from observations.
 * @param {import("./observations.js").ContentObservations} obs
 * @param {string} textContent
 * @param {Object} config
 * @returns {{ score: number, max: number, details: string[], findings: Array<{ruleId: string, status: string, message: string}> }}
 */
function scoreClarity(obs, textContent, config) {
  let score = 20; // Start full, deduct for issues
  const max = 20;
  const details = [];
  const findings = [];

  // Paragraph distribution (0–5 pt deduction)
  if (obs.paragraphDistribution.status === "warn") {
    const st = obs.paragraphDistribution.stats;
    if (st && st.min < 10) {
      const deduct = Math.min(5, (10 - st.min) * 2);
      score -= deduct;
      details.push(
        `Paragraph length: Minimum paragraph is ${st.min} words — thin content signal (-${deduct} pts)`
      );
    }
    if (st && st.longCount > 0) {
      const deduct = Math.min(3, st.longCount);
      score -= deduct;
      details.push(
        `Paragraph length: ${st.longCount} very long paragraph(s) — reduces scannability (-${deduct} pts)`
      );
    }
  } else if (obs.paragraphDistribution.status === "fail") {
    score -= 8;
    details.push(`Paragraph distribution: ${obs.paragraphDistribution.message} (-8 pts)`);
  }

  // Pronoun density check (carried from v1, kept for all profiles)
  const words = textContent.toLowerCase().match(/\b\w+\b/g) || [];
  const totalWordCount = words.length;
  if (totalWordCount > 0) {
    const pronouns = ["it", "they", "them", "this", "these", "those"];
    const pronounCount = words.filter((w) => pronouns.includes(w)).length;
    const pronounDensity = pronounCount / totalWordCount;
    const pronounLimit = config?.limits?.max_pronoun_density ?? 0.05;

    if (pronounDensity > pronounLimit) {
      const deduct = Math.min(5, Math.floor((pronounDensity - pronounLimit) * 100));
      score -= deduct;
      details.push(
        `Pronouns: High ambiguous pronoun density (${(pronounDensity * 100).toFixed(1)}%) (-${deduct} pts)`
      );
      findings.push({
        ruleId: "v2.clarity.pronouns",
        status: "warn",
        message: `Ambiguous pronoun density of ${(pronounDensity * 100).toFixed(1)}% exceeds limit of ${(pronounLimit * 100).toFixed(0)}%.`,
      });
    } else {
      details.push(
        `Pronouns: Low ambiguous pronoun density (${(pronounDensity * 100).toFixed(1)}%) (+0 pts)`
      );
    }

    // Acronym check
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
    const filtered = Array.from(foundAcronyms).filter((a) => !stopwords.has(a));
    const acronymDict = config?.acronyms || {};
    const unexplained = [];

    for (const acr of filtered) {
      if (acronymDict[acr]) {
        const expansion = acronymDict[acr];
        const regex = new RegExp(`\\b${acr}\\b`, "gi");
        let explained = false;
        let match;
        while ((match = regex.exec(textContent)) !== null) {
          const win = textContent
            .slice(Math.max(0, match.index - 120), match.index + 120)
            .toLowerCase();
          if (win.includes(expansion.toLowerCase())) {
            explained = true;
            break;
          }
        }
        if (!explained) unexplained.push(`${acr} ('${expansion}')`);
      } else {
        const pat = new RegExp(`(${acr}\\s*\\([^)]+\\)|\\([^)]+\\)\\s*${acr})`, "i");
        if (!pat.test(textContent) && acr.length > 2) {
          unexplained.push(acr);
        }
      }
    }

    if (unexplained.length > 0) {
      const deduct = Math.min(3, unexplained.length);
      score -= deduct;
      details.push(`Acronyms: Unexplained: ${unexplained.join(", ")} (-${deduct} pts)`);
    } else {
      details.push("Acronyms: All defined or none detected (+0 pts)");
    }
  }

  return { score: Math.max(0, Math.min(score, max)), max, details, findings };
}

// ═══════════════════════════════════════════════════════════════════════════
// Readiness band
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Map a total percentage to a readiness band.
 * @param {number} pct — 0–100
 * @returns {{ band: string, label: string, description: string }}
 */
function readinessBand(pct) {
  if (pct >= 85) {
    return {
      band: "production-ready",
      label: "Production-Ready",
      description:
        "Content is well-structured, well-attributed, and clear. Ready for AI-engine indexing.",
    };
  }
  if (pct >= 65) {
    return {
      band: "solid",
      label: "Solid",
      description:
        "Content meets most quality thresholds. A few targeted improvements will raise it to production-ready.",
    };
  }
  if (pct >= 45) {
    return {
      band: "needs-work",
      label: "Needs Work",
      description:
        "Content has structural or attribution gaps that reduce its likelihood of being cited by AI engines.",
    };
  }
  return {
    band: "at-risk",
    label: "At Risk",
    description:
      "Content shows multiple quality issues. AI engines are unlikely to cite this page.",
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Main v2 scoring entry point
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Score content using the profile-aware v2 model.
 *
 * @param {string} rawContent — raw file content
 * @param {string} filepath — file path
 * @param {Object} config — geo_config.json contents
 * @returns {{ score: number, report: Object }}
 */
export function scoreContentV2(rawContent, filepath, config = {}) {
  const textContent = preprocessContent(rawContent);
  const tokens = marked.lexer(textContent);

  // 1. Resolve profile — use RAW content for detection so code blocks
  //    and HTML structure are visible to the profile heuristics.
  const profileInfo = resolveProfile(config, rawContent, filepath);

  // 2. Collect observations
  const observations = observeContent(rawContent, filepath);

  // 3. Score each applicable dimension
  const dimensions = {};
  const allFindings = [];

  const dimScorers = {
    structure: () => scoreStructure(observations),
    statistics: () => scoreStatistics(observations),
    quotations: () => scoreQuotations(observations),
    citations: () => scoreCitations(observations),
    clarity: () => scoreClarity(observations, textContent, config),
  };

  let applicableCount = 0;
  let totalScore = 0;
  let totalMax = 0;

  for (const [dim, scorer] of Object.entries(dimScorers)) {
    if (isApplicable(profileInfo.profile, dim)) {
      const result = scorer();
      dimensions[dim] = {
        score: result.score,
        max: result.max,
        applicable: true,
        details: result.details,
      };
      allFindings.push(...result.findings);
      totalScore += result.score;
      totalMax += result.max;
      applicableCount++;
    } else {
      dimensions[dim] = {
        score: 0,
        max: 20,
        applicable: false,
        details: [`Not applicable for ${profileInfo.profile} profile.`],
      };
    }
  }

  // 4. Compute readiness
  const pct = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0;
  const band = readinessBand(pct);

  // 5. Build report
  const meta = buildReportMeta("v2");

  // Map observations to findings using the v2 bridge
  const observationFindings = mapObservationsToFindings
    ? mapObservationsToFindings(observations, profileInfo.profile)
    : [];

  const report = {
    file: filepath,
    modelVersion: "2.0.0",
    reportVersion: meta.reportVersion,
    generatedAt: meta.generatedAt,
    profile: {
      detected: profileInfo.profile,
      label: PROFILES[profileInfo.profile]?.label ?? profileInfo.profile,
      confidence: profileInfo.confidence,
      overridden: profileInfo.overridden,
      reasons: profileInfo.reasons,
    },
    readinessBand: band.band,
    readinessLabel: band.label,
    readinessDescription: band.description,
    applicableDimensions: applicableCount,
    effectiveScore: pct,
    dimensions,
    structuralObservations: {
      headingHierarchy: observations.headingHierarchy.status,
      sectionSelfContainment: observations.sectionSelfContainment.status,
      answerFirst: observations.answerFirst.status,
    },
    attributionSummary: {
      statsWithAttribution: observations.attributionProximity.statsWithNearbySource,
      statsWithoutAttribution: observations.attributionProximity.statsWithoutNearbySource,
      quotesWithAttribution: observations.attributionProximity.quotesWithAttribution,
      quotesWithoutAttribution: observations.attributionProximity.quotesWithoutAttribution,
    },
    linkSummary: {
      externalLinks: observations.linkQuality.externalLinkCount,
      hasSourcesSection: observations.linkQuality.hasSourcesSection,
      hasExcessiveLinks: observations.linkQuality.hasExcessiveLinks,
    },
    contentFreshness: {
      publishedDate: observations.contentFreshness.publishedDate,
      reviewedDate: observations.contentFreshness.reviewedDate,
    },
    findings: [...allFindings, ...observationFindings],
    notApplicableDimensions: notApplicableDimensions(profileInfo.profile),
    recommendations: generateRecommendationsV2(dimensions, profileInfo.profile, observations),
  };

  return { score: pct, report };
}

/**
 * Generate profile-aware recommendations from scored dimensions.
 * @param {Object} dimensions
 * @param {string} profile
 * @param {import("./observations.js").ContentObservations} observations
 * @returns {string[]}
 */
function generateRecommendationsV2(dimensions, profile, observations) {
  const recs = [];

  // Structure
  const struct = dimensions.structure;
  if (struct?.applicable && struct.score < 12) {
    recs.push(
      "Improve content structure: ensure heading hierarchy is valid, sections have adequate body content, and the opening paragraph defines the topic."
    );
  }

  // Statistics — only if applicable
  const stats = dimensions.statistics;
  if (stats?.applicable && stats.score < 12) {
    const attr = observations.attributionProximity;
    if (attr.statsWithoutNearbySource > 0) {
      recs.push(
        "Add source attribution near statistics. Cite specific studies, reports, or official data."
      );
    } else if (attr.statsWithNearbySource === 0) {
      recs.push(
        `For ${profile} content, include specific metrics or data points from authoritative sources.`
      );
    }
  }

  // Quotations — only if applicable
  const quotes = dimensions.quotations;
  if (quotes?.applicable && quotes.score < 12) {
    const attr = observations.attributionProximity;
    if (attr.quotesWithoutAttribution > 0) {
      recs.push("Attribute every quotation to a named person with their title and context.");
    } else if (attr.quotesWithAttribution === 0) {
      recs.push("Include attributed quotes from recognized experts or verified customers.");
    }
  }

  // Citations
  const citations = dimensions.citations;
  if (citations?.applicable && citations.score < 12) {
    if (observations.linkQuality.externalLinkCount === 0) {
      recs.push(
        "Add external hyperlinks to authoritative sources and include a references section."
      );
    } else if (!observations.linkQuality.hasSourcesSection) {
      recs.push("Add a dedicated 'Sources' or 'References' section to make citations explicit.");
    }
  }

  // Clarity
  const clarity = dimensions.clarity;
  if (clarity?.applicable && clarity.score < 16) {
    recs.push(
      "Improve clarity: reduce ambiguous pronouns, explain acronyms on first use, and ensure paragraph lengths are balanced."
    );
  }

  return recs;
}
