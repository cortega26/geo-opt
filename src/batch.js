import fs from "fs";
import { scoreContent } from "./scoring.js";
import {
  buildInjectedContent,
  generateSchemaData,
  validateWritableTargetInsideCwd,
} from "./schema.js";

/**
 * Audit multiple files, collecting results without process.exit.
 * Errors are captured per-file, never abort the batch.
 *
 * @param {string[]} files - absolute file paths
 * @param {object} config - parsed config object
 * @returns {Array<{ file: string, status: string, score?: number, report?: object, error?: string }>}
 */
export function auditFiles(files, config) {
  const results = [];
  for (const filepath of files) {
    try {
      let content;
      try {
        content = fs.readFileSync(filepath, { encoding: "utf8" });
      } catch (readErr) {
        results.push({
          file: filepath,
          status: "error",
          error: `Read failed: ${readErr.message}`,
        });
        continue;
      }
      const { score, report } = scoreContent(content, filepath, config);
      results.push({ file: filepath, status: "success", score, report });
    } catch (err) {
      results.push({ file: filepath, status: "error", error: err.message });
    }
  }
  return results;
}

/**
 * A finding is eligible for summary aggregation only when it carries the
 * complete contract (a ruleId, category and evidence label) and reports an
 * actual issue (non-"pass" severity).
 *
 * @param {object} finding
 * @returns {boolean}
 */
function isValidatedFinding(finding) {
  return Boolean(
    finding &&
    typeof finding.ruleId === "string" &&
    typeof finding.category === "string" &&
    typeof finding.evidenceLabel === "string" &&
    finding.severity !== "pass"
  );
}

/**
 * Aggregate per-file audit results into a site-level summary report.
 *
 * @param {Array} results - output from auditFiles()
 * @returns {object} aggregate report with statistics, top recommendations, and per-file data
 */
export function aggregateReport(results) {
  const successes = results.filter((r) => r.status === "success");
  const scores = successes.map((r) => r.score);
  const total = results.length;
  const succeeded = successes.length;
  const failed = total - succeeded;

  if (succeeded === 0) {
    return {
      totalFiles: total,
      succeeded: 0,
      failed,
      message: "No files could be audited.",
      perFile: results,
    };
  }

  const sorted = [...scores].sort((a, b) => a - b);
  const avg = scores.reduce((s, v) => s + v, 0) / scores.length;
  const variance = scores.reduce((s, v) => s + (v - avg) ** 2, 0) / scores.length;
  const median =
    sorted.length % 2 === 0
      ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : sorted[Math.floor(sorted.length / 2)];

  // Collect recommendation frequency across all files (legacy, prose-based)
  const recCounts = new Map();
  for (const r of successes) {
    for (const rec of r.report.recommendations) {
      recCounts.set(rec, (recCounts.get(rec) || 0) + 1);
    }
  }
  const topRecommendations = [...recCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([recommendation, fileCount]) => ({ recommendation, fileCount }));

  // Collect finding frequency by ruleId (plan 021, additive).
  // Only validated findings (complete contract, non-pass) are aggregated so a
  // summary entry can never omit category or evidenceLabel.
  const findingCounts = new Map();
  for (const r of successes) {
    if (!Array.isArray(r.report.findings)) continue;
    for (const f of r.report.findings) {
      if (!isValidatedFinding(f)) continue;
      const key = f.ruleId;
      const entry = findingCounts.get(key);
      if (entry) {
        entry.fileCount++;
      } else {
        findingCounts.set(key, {
          ruleId: f.ruleId,
          category: f.category,
          evidenceLabel: f.evidenceLabel,
          message: f.message,
          fileCount: 1,
        });
      }
    }
  }
  const topFindings = [...findingCounts.values()]
    .sort((a, b) => b.fileCount - a.fileCount)
    .slice(0, 10);

  return {
    totalFiles: total,
    succeeded,
    failed,
    averageScore: Math.round(avg * 100) / 100,
    medianScore: Math.round(median * 100) / 100,
    minScore: sorted[0],
    maxScore: sorted[sorted.length - 1],
    stdDev: Math.round(Math.sqrt(variance) * 100) / 100,
    distribution: {
      excellent: scores.filter((s) => s >= 80).length,
      good: scores.filter((s) => s >= 50 && s < 80).length,
      needsWork: scores.filter((s) => s < 50).length,
    },
    topRecommendations,
    topFindings,
    worstFiles: [...successes]
      .sort((a, b) => a.score - b.score)
      .slice(0, 5)
      .map((r) => ({ file: r.file, score: r.score })),
    perFile: results,
  };
}

/**
 * Batch inject schema into multiple files. Errors are collected per-file.
 *
 * @param {string[]} files - absolute file paths
 * @param {string} schemaType - "article", "faq", or "product"
 * @param {object} config - parsed config
 * @param {object} [options={}] - inject options (dryRun, noBranding)
 * @returns {{ successCount: number, failCount: number, errors: Array<{file: string, error: string}> }}
 */
export function batchInject(files, schemaType, config, options = {}) {
  let successCount = 0;
  let failCount = 0;
  const errors = [];

  for (const filepath of files) {
    try {
      // Use generateSchemaData + fs.writeFileSync instead of injectSchema
      // to avoid process.exit inside the batch loop. injectSchema calls
      // assertWritableTargetInsideCwd which exits on failure.
      // We replicate the inject logic here with batch-safe error handling.

      if (!fs.existsSync(filepath)) {
        errors.push({ file: filepath, error: "File not found" });
        failCount++;
        continue;
      }

      // Validate path confinement (batch-safe, no process.exit)
      const pathCheck = validateWritableTargetInsideCwd(filepath);
      if (!pathCheck.valid) {
        errors.push({ file: filepath, error: pathCheck.error });
        failCount++;
        continue;
      }

      // Use generateSchemaData + fs.writeFileSync with explicit path validation
      // instead of injectSchema to keep error handling batch-safe (no process.exit).
      let content;
      try {
        content = fs.readFileSync(filepath, { encoding: "utf8" });
      } catch (readErr) {
        errors.push({ file: filepath, error: `Read failed: ${readErr.message}` });
        failCount++;
        continue;
      }

      // Generate the schema (no I/O side effects)
      const schema = generateSchemaData(filepath, schemaType, config, content);

      if (options.dryRun) {
        // In dry-run mode, just verify the schema can be generated
        successCount++;
        continue;
      }

      // Build and inject using the shared pure function
      const { content: modifiedContent } = buildInjectedContent(content, filepath, schema, {
        noBranding: options.noBranding,
      });

      fs.writeFileSync(filepath, modifiedContent, { encoding: "utf8" });
      successCount++;
    } catch (err) {
      errors.push({ file: filepath, error: err.message });
      failCount++;
    }
  }

  return { successCount, failCount, errors };
}
