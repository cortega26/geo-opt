/**
 * Text rendering for audit reports (plan 030).
 *
 * Pure functions — take report data, return formatted strings.
 * Console output and process exit are owned by CLI adapters.
 */

import chalk from "chalk";
import { EVIDENCE_REGISTRY } from "./evidence.js";

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Builds the --explain evidence section as an array of chalk-formatted lines.
 * Returns an empty array when there are no findings.
 * @param {Array} findings
 * @returns {string[]}
 */
export function buildExplainLines(findings) {
  if (!findings || !findings.length) return [];
  const lines = [];
  lines.push(chalk.bold.magenta("\nEvidence & Sources (--explain):"));
  const warnFail = findings.filter((f) => f.severity === "warn" || f.severity === "fail");
  if (warnFail.length === 0) {
    lines.push(chalk.green("  All checks passed — no evidence notes needed."));
  } else {
    for (const f of warnFail) {
      const labelColor =
        f.evidenceLabel === "strong"
          ? chalk.green
          : f.evidenceLabel === "probable"
            ? chalk.blue
            : f.evidenceLabel === "experimental"
              ? chalk.yellow
              : chalk.gray;
      lines.push(`  ${chalk.bold(f.ruleId)} ${labelColor(`[${f.evidenceLabel}]`)}`);
      if (f.sourceRefs && f.sourceRefs.length > 0) {
        for (const ref of f.sourceRefs) {
          const entry = EVIDENCE_REGISTRY[ref];
          if (entry) {
            lines.push(`    ← ${entry.title} (${entry.url})`);
          }
        }
      }
    }
  }
  return lines;
}

function dimColor(score, max) {
  const pct = max > 0 ? score / max : 0;
  if (pct >= 0.8) return chalk.green;
  if (pct >= 0.5) return chalk.yellow;
  return chalk.red;
}

function bandColor(band) {
  switch (band) {
    case "production-ready":
      return chalk.green.bold;
    case "solid":
      return chalk.blue.bold;
    case "needs-work":
      return chalk.yellow.bold;
    default:
      return chalk.red.bold;
  }
}

const SEP = chalk.dim("─".repeat(50));

// ═══════════════════════════════════════════════════════════════════════════
// V1 text report
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Render a v1 audit report as a formatted text string.
 *
 * @param {object} report — report from scoreContent()
 * @param {string} filepath
 * @param {{ explain?: boolean }} [options]
 * @returns {string}
 */
export function renderV1Report(report, filepath, options = {}) {
  const explain = options.explain ?? false;
  const totalScore = report.total_score;
  const recs = report.recommendations || [];

  // Helper: normaliza details (string | string[]) a string[]
  const toLines = (details) =>
    Array.isArray(details) ? details : typeof details === "string" ? [details] : [];

  const b = report.breakdown;
  const structScore = b.structure.score;
  const structBreakdown = toLines(b.structure.details);
  const statsScore = b.statistics.score;
  const statsBreakdown = toLines(b.statistics.details);
  const quotesScore = b.quotations.score;
  const quotesBreakdown = toLines(b.quotations.details);
  const citationScore = b.citations.score;
  const citationBreakdown = toLines(b.citations.details);
  const clarityScore = b.clarity.score;
  const clarityBreakdown = toLines(b.clarity.details);

  const lines = [];

  const totalColorFn =
    totalScore >= 80 ? chalk.green.bold : totalScore >= 50 ? chalk.yellow.bold : chalk.red.bold;

  const banner = chalk.bold.blue("═".repeat(50));

  lines.push(banner);
  lines.push(chalk.bold.blue("            GEO OPTIMIZATION AUDIT REPORT         "));
  lines.push(banner);
  lines.push(`${chalk.white.bold("File:")} ${filepath}`);
  lines.push(`${chalk.white.bold("Total GEO Score:")} ${totalColorFn(`${totalScore}/100`)}`);
  lines.push(SEP);

  // 1. Structure
  lines.push(
    `${chalk.bold(`1. Answer-First & Structure: ${dimColor(structScore, 20)(`${structScore}/20`)}`)}`
  );
  for (const item of structBreakdown) {
    lines.push(`   - ${item}`);
  }
  lines.push(SEP);

  // 2. Statistics
  lines.push(
    `${chalk.bold(`2. Statistics Density: ${dimColor(statsScore, 20)(`${statsScore}/20`)}`)}`
  );
  for (const item of statsBreakdown) {
    lines.push(`   - ${item}`);
  }
  lines.push(SEP);

  // 3. Quotations
  lines.push(
    `${chalk.bold(`3. Quotation Density: ${dimColor(quotesScore, 20)(`${quotesScore}/20`)}`)}`
  );
  for (const item of quotesBreakdown) {
    lines.push(`   - ${item}`);
  }
  lines.push(SEP);

  // 4. Citations
  lines.push(
    `${chalk.bold(`4. Citation & Authority: ${dimColor(citationScore, 20)(`${citationScore}/20`)}`)}`
  );
  for (const item of citationBreakdown) {
    lines.push(`   - ${item}`);
  }
  lines.push(SEP);

  // 5. Clarity
  lines.push(
    `${chalk.bold(`5. Semantic Clarity: ${dimColor(clarityScore, 20)(`${clarityScore}/20`)}`)}`
  );
  for (const item of clarityBreakdown) {
    lines.push(`   - ${item}`);
  }
  lines.push(banner);

  // Recommendations
  lines.push(chalk.bold.cyan("\nActionable Recommendations:"));
  if (recs.length === 0) {
    lines.push(
      chalk.green.bold("Excellent! This page meets all checks in the current geo-opt heuristic.")
    );
  } else {
    for (const r of recs) {
      lines.push(chalk.cyan(`- ${r}`));
    }
  }

  // Explain mode
  if (explain && report.findings) {
    lines.push(...buildExplainLines(report.findings));
  }

  lines.push(banner);
  return lines.join("\n");
}

// ═══════════════════════════════════════════════════════════════════════════
// V2 text report
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Render a v2 audit report as a formatted text string.
 *
 * @param {object} report — report from scoreContentV2()
 * @param {string} filepath
 * @returns {string}
 */
export function renderV2Report(report, filepath) {
  const lines = [];
  const banner = chalk.bold.magenta("═".repeat(50));

  lines.push(banner);
  lines.push(chalk.bold.magenta("       GEO OPTIMIZATION AUDIT REPORT (v2)        "));
  lines.push(banner);
  lines.push(`${chalk.white.bold("File:")} ${filepath}`);
  lines.push(
    `${chalk.white.bold("Profile:")} ${chalk.cyan(report.profile.label)} (confidence: ${(report.profile.confidence * 100).toFixed(0)}%)`
  );
  if (report.profile.overridden) {
    lines.push(chalk.dim("  (explicit override)"));
  }
  lines.push(
    `${chalk.white.bold("Readiness:")} ${bandColor(report.readinessBand)(report.readinessLabel)}`
  );
  lines.push(`  ${chalk.dim(report.readinessDescription)}`);
  lines.push(
    `${chalk.white.bold("Effective score:")} ${chalk.bold(`${report.effectiveScore}`)} (${report.applicableDimensions} applicable dimensions)`
  );

  // Plain-English summary for non-technical users
  lines.push("");
  lines.push(chalk.bold("📋 In plain English:"));
  lines.push(...plainEnglishSummary(report));
  lines.push("");

  lines.push(SEP);

  const dimLabels = {
    structure: "1. Structure",
    statistics: "2. Statistics",
    quotations: "3. Quotations",
    citations: "4. Citations",
    clarity: "5. Clarity",
  };

  for (const [dim, label] of Object.entries(dimLabels)) {
    const d = report.dimensions[dim];
    if (!d) continue;
    if (!d.applicable) {
      lines.push(
        `${chalk.dim(`${label}: N/A (not applicable for ${report.profile.detected} profile)`)}`
      );
    } else {
      lines.push(`${chalk.bold(`${label}: ${dimColor(d.score, d.max)(`${d.score}/${d.max}`)}`)}`);
    }
    for (const detail of d.details) {
      lines.push(`   ${chalk.dim(detail)}`);
    }
  }

  // Attribution summary
  lines.push(SEP);
  const attr = report.attributionSummary;
  if (attr) {
    lines.push(
      chalk.bold(
        `Stats: ${attr.statsWithAttribution} attributed, ${attr.statsWithoutAttribution} unattributed | ` +
          `Quotes: ${attr.quotesWithAttribution} attributed, ${attr.quotesWithoutAttribution} unattributed`
      )
    );
  }
  const link = report.linkSummary;
  if (link) {
    const linkIcon = link.hasExcessiveLinks ? chalk.red("⚠") : "";
    lines.push(
      chalk.bold(
        `Links: ${link.externalLinks} external${linkIcon} | Sources section: ${link.hasSourcesSection ? "yes" : "no"}`
      )
    );
  }
  const fresh = report.contentFreshness;
  if (fresh && (fresh.publishedDate || fresh.reviewedDate)) {
    lines.push(
      chalk.bold(
        `Dates: ${fresh.publishedDate ? `published ${fresh.publishedDate}` : ""}${fresh.publishedDate && fresh.reviewedDate ? ", " : ""}${fresh.reviewedDate ? `reviewed ${fresh.reviewedDate}` : ""}`
      )
    );
  }

  // Recommendations
  if (report.recommendations && report.recommendations.length > 0) {
    lines.push(SEP);
    lines.push(chalk.bold("Recommendations:"));
    for (const rec of report.recommendations) {
      lines.push(`  • ${rec}`);
    }
  }

  // Findings
  if (report.findings && report.findings.length > 0) {
    const warns = report.findings.filter((f) => f.status === "warn").length;
    const fails = report.findings.filter((f) => f.status === "fail").length;
    if (warns + fails > 0) {
      lines.push(SEP);
      lines.push(
        chalk.bold(
          `Findings: ${chalk.yellow(warns + " warnings")}, ${chalk.red(fails + " failures")}`
        )
      );
      for (const f of report.findings.filter((f) => f.status !== "pass")) {
        const icon = f.status === "fail" ? chalk.red("✗") : chalk.yellow("⚠");
        lines.push(`  ${icon} ${f.message} [${f.evidenceLabel}]`);
      }
    }
  }

  lines.push(banner);
  return lines.join("\n");
}

// ═══════════════════════════════════════════════════════════════════════════
// Summary rendering
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Render a v1 site summary as a formatted text string.
 *
 * @param {object} summary — from aggregateReport()
 * @returns {string}
 */
export function renderV1Summary(summary) {
  const lines = [];
  const banner = chalk.bold.blue("═".repeat(50));

  lines.push(`\n${banner}`);
  lines.push(chalk.bold.blue("                 SITE SUMMARY                    "));
  lines.push(banner);
  lines.push(`Files:       ${chalk.bold(summary.succeeded)}/${summary.totalFiles} succeeded`);
  if (summary.failed > 0) {
    lines.push(`             ${chalk.red(summary.failed + " failed")}`);
  }
  lines.push(`Average:     ${chalk.bold(summary.averageScore)}/100`);
  lines.push(`Median:      ${chalk.bold(summary.medianScore)}/100`);
  lines.push(`Range:       ${summary.minScore} – ${summary.maxScore}`);

  if (summary.distribution) {
    const dist = summary.distribution;
    const parts = [];
    if (dist.excellent > 0) parts.push(chalk.green(`${dist.excellent} excellent (≥80)`));
    if (dist.good > 0) parts.push(chalk.blue(`${dist.good} good (50–79)`));
    if (dist.needsWork > 0) parts.push(chalk.yellow(`${dist.needsWork} needs work (<50)`));
    if (parts.length > 0) lines.push(`Distribution: ${parts.join(", ")}`);
  }

  if (summary.worstFiles && summary.worstFiles.length > 0) {
    lines.push(chalk.dim("\nLowest scores:"));
    for (const f of summary.worstFiles.slice(0, 5)) {
      lines.push(chalk.dim(`  ${f.file}: ${f.score}/100`));
    }
  }

  lines.push(banner);
  return lines.join("\n");
}

/**
 * Render a v2 site summary as a formatted text string.
 *
 * @param {object} summary — from aggregateReport()
 * @returns {string}
 */
export function renderV2Summary(summary) {
  const lines = [];
  const banner = chalk.bold.blue("═".repeat(50));

  lines.push(`\n${banner}`);
  lines.push(chalk.bold.blue("           SITE SUMMARY (model v2)               "));
  lines.push(banner);
  lines.push(`Files:       ${chalk.bold(summary.succeeded)}/${summary.totalFiles} succeeded`);
  if (summary.failed > 0) {
    lines.push(`             ${chalk.red(summary.failed + " failed")}`);
  }
  if (summary.averageScore !== undefined) {
    lines.push(`Average:     ${chalk.bold(summary.averageScore)} (effective)`);
    lines.push(`Median:      ${chalk.bold(summary.medianScore)} (effective)`);
    lines.push(`Range:       ${summary.minScore} – ${summary.maxScore}`);
  }
  lines.push(banner);
  return lines.join("\n");
}

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate a plain-English summary of a v2 report for non-technical users.
 * Wording describes observed style markers; it never promises ranking,
 * discovery, readiness, or citation outcomes (plan 085, audit F-06). Branch
 * thresholds mirror the readiness-band boundaries (85/65/45) so the summary
 * line and the band label never contradict each other.
 * @param {object} report - V2Report
 * @returns {string[]} lines for display
 */
export function plainEnglishSummary(report) {
  const lines = [];
  const score = report.effectiveScore;
  const profile = report.profile?.label || "content";
  const band = report.readinessBand;

  if (score >= 85) {
    lines.push(
      `  Your ${profile} page shows strong style markers for structure, attribution, and citations.`
    );
  } else if (score >= 65) {
    lines.push(
      `  Your ${profile} page shows solid style markers — most quality thresholds are met; targeted improvements remain.`
    );
  } else if (score >= 45) {
    lines.push(
      `  Your ${profile} page shows partial style markers — structural or attribution gaps remain.`
    );
  } else {
    lines.push(
      `  Your ${profile} page shows weak style markers — the flagged issues below are the gaps to address.`
    );
  }

  const dims = report.dimensions || {};
  const issues = [];
  if (dims.structure?.applicable && dims.structure.score < 12) {
    issues.push("add clear headings and an introductory paragraph that defines the topic");
  }
  if (dims.statistics?.applicable && dims.statistics.score < 10) {
    issues.push("include specific numbers, percentages, or metrics with named sources");
  }
  if (dims.quotations?.applicable && dims.quotations.score < 10) {
    issues.push("add attributed quotes from named experts or customers");
  }
  if (dims.citations?.applicable && dims.citations.score < 10) {
    issues.push("link your claims to reputable external sources");
  }
  if (dims.clarity?.applicable && dims.clarity.score < 15) {
    issues.push("replace vague pronouns like 'it' and 'they' with specific names");
  }
  if (issues.length > 0) {
    lines.push(`  To improve: ${issues.join("; ")}.`);
  }

  const bandAdvice = {
    "production-ready":
      "Strong style markers. Note: the score reflects formatting signals, not factual accuracy or ranking (audit F-06).",
    solid: "Solid — address the remaining gaps listed below.",
    "at-risk": "At risk — address the flagged issues before publishing widely.",
    "needs-work": "Needs work — address the flagged structural or attribution gaps.",
  };
  if (bandAdvice[band]) {
    lines.push(`  ${bandAdvice[band]}`);
  }

  return lines;
}
