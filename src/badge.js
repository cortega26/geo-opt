// Badge generation for GEO scores — shields.io URL format.

const GRADE_THRESHOLDS = [
  { min: 90, color: "brightgreen", grade: "A" },
  { min: 76, color: "green", grade: "B" },
  { min: 61, color: "yellow", grade: "C" },
  { min: 41, color: "orange", grade: "D" },
  { min: 0, color: "red", grade: "F" },
];

export function scoreToBadgeColor(score) {
  for (const { min, color } of GRADE_THRESHOLDS) {
    if (score >= min) return color;
  }
  return "red";
}

export function scoreToBadgeGrade(score) {
  for (const { min, grade } of GRADE_THRESHOLDS) {
    if (score >= min) return grade;
  }
  return "F";
}

export function generateBadgeUrl(score, { label = "GEO Score", style = "flat" } = {}) {
  const color = scoreToBadgeColor(score);
  const encodedLabel = encodeURIComponent(label).replace(/%20/g, "_");
  const encodedMessage = encodeURIComponent(`${score}/100`);
  const base = `https://img.shields.io/badge/${encodedLabel}-${encodedMessage}-${color}`;
  return style === "flat" ? base : `${base}?style=${style}`;
}

export function generateBadgeMarkdown(score, { label = "GEO Score", alt, style } = {}) {
  const url = generateBadgeUrl(score, { label, style });
  return `![${alt ?? label}](${url})`;
}
