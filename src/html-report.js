/**
 * Pro HTML report renderer for audit results (plan 039).
 *
 * Pure functions — take report data, return HTML strings.
 * Entitlement gating is owned by the CLI adapter.
 */

import { EVIDENCE_REGISTRY } from "./evidence.js";

// ═══════════════════════════════════════════════════════════════════════════
// Utilities
// ═══════════════════════════════════════════════════════════════════════════

function esc(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function scoreColor(score, max = 100) {
  const pct = max > 0 ? score / max : 0;
  if (pct >= 0.8) return "#16a34a";
  if (pct >= 0.5) return "#d97706";
  return "#dc2626";
}

function scoreBadgeClass(score, max = 100) {
  const pct = max > 0 ? score / max : 0;
  if (pct >= 0.8) return "badge-green";
  if (pct >= 0.5) return "badge-yellow";
  return "badge-red";
}

function scoreLabel(score) {
  if (score >= 80) return "Excellent";
  if (score >= 50) return "Needs Work";
  return "Poor";
}

function deltaHtml(before, after) {
  const diff = after - before;
  if (diff > 0) return `<span class="delta delta-pos">+${diff}</span>`;
  if (diff < 0) return `<span class="delta delta-neg">${diff}</span>`;
  return '<span class="delta delta-neu">±0</span>';
}

function fmtDate() {
  return new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// SVG components
// ═══════════════════════════════════════════════════════════════════════════

function svgGauge(score) {
  const size = 120;
  const cx = size / 2;
  const cy = size / 2;
  const r = 46;
  const sw = 10;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - Math.min(score / 100, 1));
  const color = scoreColor(score);

  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg" aria-label="Score: ${score}/100">
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#e5e7eb" stroke-width="${sw}"/>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="${sw}"
    stroke-dasharray="${circumference.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}"
    transform="rotate(-90 ${cx} ${cy})" stroke-linecap="round"/>
  <text x="${cx}" y="${cy + 7}" text-anchor="middle" font-size="22" font-weight="700" fill="${color}">${score}</text>
  <text x="${cx}" y="${cy + 22}" text-anchor="middle" font-size="10" fill="#6b7280">/100</text>
</svg>`;
}

function svgBarChart(items) {
  const H = 26;
  const labelW = 110;
  const valueW = 52;
  const barW = 280;
  const gap = 10;
  const totalH = items.length * (H + gap) - gap;
  const W = labelW + barW + valueW;

  const bars = items
    .map((item, i) => {
      const pct = item.max > 0 ? item.value / item.max : 0;
      const fillW = Math.max(2, Math.round(pct * barW));
      const color = scoreColor(item.value, item.max);
      const y = i * (H + gap);
      return `<text x="${labelW - 8}" y="${y + H / 2 + 5}" text-anchor="end" font-size="12" fill="#374151">${esc(item.label)}</text>
    <rect x="${labelW}" y="${y}" width="${barW}" height="${H}" rx="4" fill="#f3f4f6"/>
    <rect x="${labelW}" y="${y}" width="${fillW}" height="${H}" rx="4" fill="${color}"/>
    <text x="${labelW + barW + 8}" y="${y + H / 2 + 5}" font-size="12" fill="#374151">${item.value}/${item.max}</text>`;
    })
    .join("\n");

  return `<svg width="${W}" height="${totalH}" viewBox="0 0 ${W} ${totalH}" xmlns="http://www.w3.org/2000/svg">
${bars}
</svg>`;
}

// ═══════════════════════════════════════════════════════════════════════════
// Shared CSS
// ═══════════════════════════════════════════════════════════════════════════

const CSS = `*,*::before,*::after{box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111827;background:#f9fafb;margin:0;padding:0;line-height:1.5}
.page{max-width:900px;margin:0 auto;padding:24px}
header{background:#1e3a5f;color:#fff;padding:24px;border-radius:8px;margin-bottom:20px}
header h1{margin:0 0 6px;font-size:1.4rem;font-weight:700}
header .meta{font-size:.85rem;opacity:.8}
header .meta span+span::before{content:" · "}
.card{background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:20px;margin-bottom:16px;break-inside:avoid}
.card h2{font-size:.95rem;font-weight:600;margin:0 0 14px;color:#374151;padding-bottom:8px;border-bottom:1px solid #f3f4f6}
.score-block{display:flex;align-items:center;gap:20px;flex-wrap:wrap}
.score-text .label{font-size:.8rem;color:#6b7280;margin-bottom:2px}
.score-text .value{font-size:1.6rem;font-weight:700;line-height:1}
.badge{display:inline-block;padding:2px 10px;border-radius:999px;font-size:.75rem;font-weight:600;margin-top:6px}
.badge-green{background:#dcfce7;color:#15803d}
.badge-yellow{background:#fef9c3;color:#a16207}
.badge-red{background:#fee2e2;color:#b91c1c}
.badge-blue{background:#dbeafe;color:#1d4ed8}
.badge-gray{background:#f3f4f6;color:#6b7280}
.badge-purple{background:#f3e8ff;color:#7c3aed}
.finding{display:flex;align-items:baseline;gap:8px;padding:7px 0;border-bottom:1px solid #f9fafb;font-size:.875rem}
.finding:last-child{border-bottom:none}
.finding .icon-fail{color:#dc2626;font-weight:700;flex-shrink:0}
.finding .icon-warn{color:#d97706;font-weight:700;flex-shrink:0}
.finding .icon-pass{color:#16a34a;font-weight:700;flex-shrink:0}
.rec{padding:6px 0;font-size:.875rem;border-bottom:1px solid #f9fafb}
.rec:last-child{border-bottom:none}
.rec::before{content:"→ ";color:#9ca3af}
.dim-na{color:#9ca3af;font-size:.875rem;font-style:italic;padding:4px 0}
.attr-row{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:8px;font-size:.85rem;color:#6b7280}
.compare-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.compare-score{text-align:center;padding:12px;border-radius:6px;background:#f9fafb}
.compare-score .val{font-size:2rem;font-weight:700}
.compare-score .sub{font-size:.8rem;color:#6b7280}
.compare-finding-improved{background:#f0fdf4;padding:4px 8px;border-radius:4px;margin:2px 0;font-size:.8rem;color:#15803d}
.compare-finding-regressed{background:#fef2f2;padding:4px 8px;border-radius:4px;margin:2px 0;font-size:.8rem;color:#b91c1c}
.compare-finding-unchanged{background:#f9fafb;padding:4px 8px;border-radius:4px;margin:2px 0;font-size:.8rem;color:#6b7280}
.delta{font-weight:600;margin-left:4px}
.delta-pos{color:#16a34a}
.delta-neg{color:#dc2626}
.delta-neu{color:#9ca3af}
table{width:100%;border-collapse:collapse;font-size:.85rem}
th{background:#f9fafb;text-align:left;padding:8px 10px;border-bottom:2px solid #e5e7eb;color:#374151}
td{padding:7px 10px;border-bottom:1px solid #f3f4f6}
tr:last-child td{border-bottom:none}
.dist-bar{display:flex;height:16px;border-radius:4px;overflow:hidden;margin-top:4px}
.dist-bar .green{background:#16a34a}
.dist-bar .yellow{background:#d97706}
.dist-bar .red{background:#dc2626}
footer{margin-top:20px;padding:12px;text-align:center;font-size:.75rem;color:#9ca3af}
footer a{color:#6b7280;text-decoration:none}
@media print{body,header{border-radius:0}header{-webkit-print-color-adjust:exact;print-color-adjust:exact}.page{padding:0;max-width:100%}}`;

// ═══════════════════════════════════════════════════════════════════════════
// HTML shell
// ═══════════════════════════════════════════════════════════════════════════

function htmlShell(title, body, noBranding = false) {
  const footerHtml = noBranding
    ? ""
    : '<footer>Generated with <a href="https://tooltician.com">Tooltician Pro</a> · geo-opt</footer>';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<style>${CSS}</style>
</head>
<body>
<div class="page">
${body}
${footerHtml}
</div>
</body>
</html>`;
}

// ═══════════════════════════════════════════════════════════════════════════
// V1 HTML report
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Render a v1 audit report as a standalone HTML string.
 *
 * @param {object} report — from scoreContent()
 * @param {string} filepath
 * @param {{ noBranding?: boolean }} [options]
 * @returns {string}
 */
export function renderV1ReportHtml(report, filepath, options = {}) {
  const noBranding = options.noBranding ?? false;
  const score = report.total_score;
  const recs = report.recommendations || [];
  const findings = report.findings || [];
  const b = report.breakdown;

  const dimensions = [
    { label: "Structure", value: b.structure.score, max: 20 },
    { label: "Statistics", value: b.statistics.score, max: 20 },
    { label: "Quotations", value: b.quotations.score, max: 20 },
    { label: "Citations", value: b.citations.score, max: 20 },
    { label: "Clarity", value: b.clarity.score, max: 20 },
  ];

  const brandingSpan = noBranding ? "" : "<span>Tooltician Pro</span>";
  const failFindings = findings.filter(
    (f) =>
      f.severity === "fail" || f.status === "fail" || f.severity === "warn" || f.status === "warn"
  );

  const body = `
<header>
  <h1>GEO Optimization Audit Report</h1>
  <div class="meta"><span>${esc(filepath)}</span><span>${fmtDate()}</span>${brandingSpan}</div>
</header>

<div class="card">
  <div class="score-block">
    ${svgGauge(score)}
    <div class="score-text">
      <div class="label">Total GEO Score</div>
      <div class="value" style="color:${scoreColor(score)}">${score}</div>
      <span class="badge ${scoreBadgeClass(score)}">${scoreLabel(score)}</span>
    </div>
  </div>
</div>

<div class="card">
  <h2>Dimension Breakdown</h2>
  ${svgBarChart(dimensions)}
  <div style="margin-top:12px">
    ${dimensions.map((d) => `<div style="font-size:.8rem;color:#6b7280;margin:2px 0">${esc(d.label)}: ${d.value}/${d.max}</div>`).join("")}
  </div>
</div>

${
  recs.length > 0
    ? `<div class="card">
  <h2>Actionable Recommendations</h2>
  ${recs.map((r) => `<div class="rec">${esc(r)}</div>`).join("")}
</div>`
    : '<div class="card"><h2>Recommendations</h2><p style="color:#16a34a;font-weight:600;font-size:.875rem">✓ This page meets all checks in the current geo-opt heuristic.</p></div>'
}

${
  failFindings.length > 0
    ? `<div class="card">
  <h2>Findings</h2>
  ${failFindings
    .map((f) => {
      const isFail = f.severity === "fail" || f.status === "fail";
      const icon = isFail ? "✗" : "⚠";
      const cls = isFail ? "icon-fail" : "icon-warn";
      const evLabel = f.evidenceLabel
        ? `<span class="badge badge-blue">${esc(f.evidenceLabel)}</span>`
        : "";
      const source =
        f.sourceRefs && f.sourceRefs.length > 0 && EVIDENCE_REGISTRY[f.sourceRefs[0]]
          ? `<span style="font-size:.75rem;color:#9ca3af"> — ${esc(EVIDENCE_REGISTRY[f.sourceRefs[0]].title)}</span>`
          : "";
      return `<div class="finding"><span class="${cls}">${icon}</span><span>${esc(f.message)}${source}</span>${evLabel}</div>`;
    })
    .join("")}
</div>`
    : ""
}`;

  return htmlShell(`GEO Audit — ${filepath}`, body, noBranding);
}

// ═══════════════════════════════════════════════════════════════════════════
// V2 HTML report
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Render a v2 audit report as a standalone HTML string.
 *
 * @param {object} report — from scoreContentV2()
 * @param {string} filepath
 * @param {{ noBranding?: boolean }} [options]
 * @returns {string}
 */
export function renderV2ReportHtml(report, filepath, options = {}) {
  const noBranding = options.noBranding ?? false;
  const score = report.effectiveScore;
  const recs = report.recommendations || [];
  const findings = report.findings || [];

  const dimLabels = {
    structure: "Structure",
    statistics: "Statistics",
    quotations: "Quotations",
    citations: "Citations",
    clarity: "Clarity",
  };

  const applicableDims = Object.entries(dimLabels)
    .filter(([key]) => report.dimensions[key]?.applicable)
    .map(([key, label]) => ({
      label,
      value: report.dimensions[key].score,
      max: report.dimensions[key].max,
    }));

  const readinessBadgeClass =
    report.readinessBand === "production-ready"
      ? "badge-green"
      : report.readinessBand === "solid"
        ? "badge-blue"
        : report.readinessBand === "needs-work"
          ? "badge-yellow"
          : "badge-red";

  const brandingSpan = noBranding ? "" : "<span>Tooltician Pro</span>";
  const failFindings = findings.filter((f) => f.status === "fail" || f.status === "warn");

  const attr = report.attributionSummary;
  const link = report.linkSummary;
  const fresh = report.contentFreshness;

  const body = `
<header>
  <h1>GEO Optimization Audit Report <span style="font-size:.85rem;font-weight:400;opacity:.8">(v2 · profile-aware)</span></h1>
  <div class="meta"><span>${esc(filepath)}</span><span>${fmtDate()}</span>${brandingSpan}</div>
</header>

<div class="card">
  <div class="score-block">
    ${svgGauge(score)}
    <div class="score-text">
      <div class="label">Effective Score</div>
      <div class="value" style="color:${scoreColor(score)}">${score}</div>
      <span class="badge ${readinessBadgeClass}">${esc(report.readinessLabel)}</span>
    </div>
    <div style="flex:1;min-width:160px">
      <div style="font-size:.85rem;color:#6b7280;margin-bottom:4px">Profile</div>
      <strong>${esc(report.profile.label)}</strong>
      <span class="badge badge-gray" style="margin-left:6px">${(report.profile.confidence * 100).toFixed(0)}% confidence</span>
      ${report.profile.overridden ? '<span class="badge badge-purple">override</span>' : ""}
      <div style="font-size:.8rem;color:#6b7280;margin-top:6px">${esc(report.readinessDescription)}</div>
    </div>
  </div>
</div>

${
  applicableDims.length > 0
    ? `<div class="card">
  <h2>Dimension Breakdown (${report.applicableDimensions} applicable)</h2>
  ${svgBarChart(applicableDims)}
  <div style="margin-top:10px">
    ${Object.entries(dimLabels)
      .map(([key, label]) => {
        const d = report.dimensions[key];
        if (!d) return "";
        if (!d.applicable)
          return `<div class="dim-na">${esc(label)}: N/A for ${esc(report.profile.detected)} profile</div>`;
        return `<div style="font-size:.8rem;color:#6b7280;margin:2px 0">${esc(label)}: ${d.score}/${d.max}</div>`;
      })
      .join("")}
  </div>
</div>`
    : ""
}

${
  attr || link || fresh
    ? `<div class="card">
  <h2>Content Signals</h2>
  <div class="attr-row">
    ${attr ? `<div><strong>Attribution</strong><br>Stats: ${attr.statsWithAttribution} attributed, ${attr.statsWithoutAttribution} unattributed<br>Quotes: ${attr.quotesWithAttribution} attributed, ${attr.quotesWithoutAttribution} unattributed</div>` : ""}
    ${link ? `<div><strong>Links</strong><br>${link.externalLinks} external links<br>Sources section: ${link.hasSourcesSection ? "yes" : "no"}${link.hasExcessiveLinks ? " <span class='badge badge-yellow'>excessive</span>" : ""}</div>` : ""}
    ${fresh && (fresh.publishedDate || fresh.reviewedDate) ? `<div><strong>Freshness</strong><br>${fresh.publishedDate ? `Published: ${esc(fresh.publishedDate)}<br>` : ""}${fresh.reviewedDate ? `Reviewed: ${esc(fresh.reviewedDate)}` : ""}</div>` : ""}
  </div>
</div>`
    : ""
}

${
  recs.length > 0
    ? `<div class="card">
  <h2>Recommendations</h2>
  ${recs.map((r) => `<div class="rec">${esc(r)}</div>`).join("")}
</div>`
    : ""
}

${
  failFindings.length > 0
    ? `<div class="card">
  <h2>Findings</h2>
  ${failFindings
    .map((f) => {
      const isFail = f.status === "fail";
      const icon = isFail ? "✗" : "⚠";
      const cls = isFail ? "icon-fail" : "icon-warn";
      const evLabel = f.evidenceLabel
        ? `<span class="badge badge-blue">${esc(f.evidenceLabel)}</span>`
        : "";
      return `<div class="finding"><span class="${cls}">${icon}</span><span>${esc(f.message)}</span>${evLabel}</div>`;
    })
    .join("")}
</div>`
    : ""
}`;

  return htmlShell(`GEO Audit (v2) — ${filepath}`, body, noBranding);
}

// ═══════════════════════════════════════════════════════════════════════════
// Aggregate HTML report
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Render an aggregate site report as a standalone HTML string.
 *
 * @param {object[]} results — from auditFiles()
 * @param {object} summary — from aggregateReport()
 * @param {{ noBranding?: boolean }} [options]
 * @returns {string}
 */
export function renderAggregateReportHtml(results, summary, options = {}) {
  const noBranding = options.noBranding ?? false;
  const brandingSpan = noBranding ? "" : "<span>Tooltician Pro</span>";
  const dist = summary.distribution || {};
  const total = summary.succeeded || 1;
  const greenPct = ((dist.excellent || 0) / total) * 100;
  const yellowPct = ((dist.good || 0) / total) * 100;
  const redPct = ((dist.needsWork || 0) / total) * 100;

  const topFindings = summary.topFindings || [];
  const worstFiles = summary.worstFiles || [];
  const successResults = results.filter((r) => r.status === "success");

  const body = `
<header>
  <h1>GEO Site Audit Report</h1>
  <div class="meta"><span>${summary.totalFiles} files audited</span><span>${fmtDate()}</span>${brandingSpan}</div>
</header>

<div class="card">
  <h2>Site Summary</h2>
  <div class="score-block">
    ${svgGauge(summary.averageScore ?? 0)}
    <div class="score-text">
      <div class="label">Average GEO Score</div>
      <div class="value" style="color:${scoreColor(summary.averageScore ?? 0)}">${summary.averageScore ?? "N/A"}</div>
      <div style="font-size:.8rem;color:#6b7280;margin-top:4px">Median: ${summary.medianScore ?? "N/A"} · Range: ${summary.minScore ?? "N/A"}–${summary.maxScore ?? "N/A"}</div>
    </div>
    <div>
      <div style="font-size:.8rem;color:#6b7280;margin-bottom:6px">Score distribution</div>
      <div class="dist-bar" style="width:200px">
        <div class="green" style="width:${greenPct.toFixed(1)}%"></div>
        <div class="yellow" style="width:${yellowPct.toFixed(1)}%"></div>
        <div class="red" style="width:${redPct.toFixed(1)}%"></div>
      </div>
      <div style="font-size:.75rem;color:#6b7280;margin-top:4px">
        <span style="color:#16a34a">■</span> ${dist.excellent || 0} excellent
        <span style="color:#d97706;margin-left:8px">■</span> ${dist.good || 0} good
        <span style="color:#dc2626;margin-left:8px">■</span> ${dist.needsWork || 0} needs work
      </div>
    </div>
  </div>
</div>

${
  topFindings.length > 0
    ? `<div class="card">
  <h2>Top Issues Across Site</h2>
  <table>
    <thead><tr><th>Issue</th><th>Category</th><th>Files</th><th>Evidence</th></tr></thead>
    <tbody>
      ${topFindings
        .slice(0, 10)
        .map(
          (f) => `<tr>
        <td>${esc(f.message)}</td>
        <td>${esc(f.category)}</td>
        <td>${f.fileCount}</td>
        <td><span class="badge badge-blue">${esc(f.evidenceLabel)}</span></td>
      </tr>`
        )
        .join("")}
    </tbody>
  </table>
</div>`
    : ""
}

${
  worstFiles.length > 0
    ? `<div class="card">
  <h2>Lowest-Scoring Pages</h2>
  <table>
    <thead><tr><th>File</th><th>Score</th></tr></thead>
    <tbody>
      ${worstFiles
        .slice(0, 10)
        .map(
          (f) =>
            `<tr><td>${esc(f.file)}</td><td><span class="badge ${scoreBadgeClass(f.score)}">${f.score}/100</span></td></tr>`
        )
        .join("")}
    </tbody>
  </table>
</div>`
    : ""
}

${
  successResults.length > 0
    ? `<div class="card">
  <h2>All Pages</h2>
  <table>
    <thead><tr><th>File</th><th>Score</th></tr></thead>
    <tbody>
      ${successResults
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
        .map(
          (r) =>
            `<tr><td>${esc(r.file)}</td><td><span class="badge ${scoreBadgeClass(r.score ?? 0)}">${r.score ?? "N/A"}/100</span></td></tr>`
        )
        .join("")}
    </tbody>
  </table>
</div>`
    : ""
}`;

  return htmlShell("GEO Site Audit Report", body, noBranding);
}

// ═══════════════════════════════════════════════════════════════════════════
// Comparison HTML report
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Render a before/after comparison as a standalone HTML string.
 *
 * @param {object} before — previous AuditReport (from JSON)
 * @param {object} after — new AuditReport
 * @param {string} filepath
 * @param {{ noBranding?: boolean }} [options]
 * @returns {string}
 */
export function renderComparisonHtml(before, after, filepath, options = {}) {
  const noBranding = options.noBranding ?? false;
  const brandingSpan = noBranding ? "" : "<span>Tooltician Pro</span>";

  const beforeScore = before.total_score ?? before.effectiveScore ?? 0;
  const afterScore = after.total_score ?? after.effectiveScore ?? 0;

  // Dimension comparison (V1 breakdown)
  const beforeB = before.breakdown;
  const afterB = after.breakdown;
  const dimNames = ["structure", "statistics", "quotations", "citations", "clarity"];
  const dimLabels = {
    structure: "Structure",
    statistics: "Statistics",
    quotations: "Quotations",
    citations: "Citations",
    clarity: "Clarity",
  };

  // Findings diff: compare by ruleId
  const beforeFails = new Set(
    (before.findings || [])
      .filter(
        (f) =>
          f.severity === "fail" ||
          f.status === "fail" ||
          f.severity === "warn" ||
          f.status === "warn"
      )
      .map((f) => f.ruleId)
  );
  const afterFails = new Set(
    (after.findings || [])
      .filter(
        (f) =>
          f.severity === "fail" ||
          f.status === "fail" ||
          f.severity === "warn" ||
          f.status === "warn"
      )
      .map((f) => f.ruleId)
  );

  const improved = [...beforeFails].filter((id) => !afterFails.has(id));
  const regressed = [...afterFails].filter((id) => !beforeFails.has(id));
  const unchanged = [...afterFails].filter((id) => beforeFails.has(id));

  const findingMsg = (ruleId, reportObj) => {
    const f = (reportObj.findings || []).find((x) => x.ruleId === ruleId);
    return f ? f.message : ruleId;
  };

  const body = `
<header>
  <h1>GEO Audit — Before / After Comparison</h1>
  <div class="meta"><span>${esc(filepath)}</span><span>${fmtDate()}</span>${brandingSpan}</div>
</header>

<div class="card">
  <h2>Score Comparison</h2>
  <div class="compare-grid">
    <div class="compare-score">
      <div class="sub">Before</div>
      <div class="val" style="color:${scoreColor(beforeScore)}">${beforeScore}</div>
      <div class="sub">/100</div>
      <span class="badge ${scoreBadgeClass(beforeScore)}">${scoreLabel(beforeScore)}</span>
    </div>
    <div class="compare-score">
      <div class="sub">After</div>
      <div class="val" style="color:${scoreColor(afterScore)}">${afterScore}</div>
      <div class="sub">/100 ${deltaHtml(beforeScore, afterScore)}</div>
      <span class="badge ${scoreBadgeClass(afterScore)}">${scoreLabel(afterScore)}</span>
    </div>
  </div>
  <div style="text-align:center;margin-top:12px;font-size:1.1rem;font-weight:600">
    Net change: ${deltaHtml(beforeScore, afterScore)}
  </div>
</div>

${
  beforeB && afterB
    ? `<div class="card">
  <h2>Dimension Changes</h2>
  <table>
    <thead><tr><th>Dimension</th><th>Before</th><th>After</th><th>Change</th></tr></thead>
    <tbody>
      ${dimNames
        .filter((k) => beforeB[k] && afterB[k])
        .map((k) => {
          const bv = beforeB[k].score;
          const av = afterB[k].score;
          const max = beforeB[k].max ?? afterB[k].max ?? 20;
          return `<tr>
          <td>${esc(dimLabels[k])}</td>
          <td><span class="badge ${scoreBadgeClass(bv, max)}">${bv}/${max}</span></td>
          <td><span class="badge ${scoreBadgeClass(av, max)}">${av}/${max}</span></td>
          <td>${deltaHtml(bv, av)}</td>
        </tr>`;
        })
        .join("")}
    </tbody>
  </table>
</div>`
    : ""
}

<div class="card">
  <h2>Findings Changes</h2>
  ${
    improved.length === 0 && regressed.length === 0 && unchanged.length === 0
      ? "<p style='color:#16a34a;font-size:.875rem'>No findings in either report.</p>"
      : ""
  }
  ${improved.map((id) => `<div class="compare-finding-improved">✓ Fixed: ${esc(findingMsg(id, before))}</div>`).join("")}
  ${regressed.map((id) => `<div class="compare-finding-regressed">✗ New issue: ${esc(findingMsg(id, after))}</div>`).join("")}
  ${unchanged.map((id) => `<div class="compare-finding-unchanged">⚠ Still failing: ${esc(findingMsg(id, after))}</div>`).join("")}
</div>

${
  (after.recommendations || []).length > 0
    ? `<div class="card">
  <h2>Current Recommendations</h2>
  ${(after.recommendations || []).map((r) => `<div class="rec">${esc(r)}</div>`).join("")}
</div>`
    : ""
}`;

  return htmlShell(`GEO Comparison — ${filepath}`, body, noBranding);
}
