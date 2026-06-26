import fs from "fs";
import { scoreContent } from "./scoring.js";
import {
  generateSchemaData,
  TOOLTICIAN_BRANDING_MARKDOWN,
  TOOLTICIAN_BRANDING_HTML,
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

  // Collect recommendation frequency across all files
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

      // Build the injection payload — replicate injectSchema output logic
      const schemaJson = JSON.stringify(schema, null, 2).replace(/<\//g, "<\\/");

      // Strip existing branding before re-injecting
      content = content
        .replace(
          /\n{0,2}Optimized (?:by|with) \[Tooltician\]\(https?:\/\/(?:www\.)?tooltician\.com\/?\)\s*/gi,
          "\n"
        )
        .replace(
          /\s*<div[^>]*class=["'][^"']*\bgeo-signature\b[^"']*["'][^>]*>[\s\S]*?<\/div>\s*/gi,
          "\n"
        );

      const sigMd = options.noBranding ? "" : `\n\n${TOOLTICIAN_BRANDING_MARKDOWN}\n`;
      const sigHtml = options.noBranding ? "" : `\n${TOOLTICIAN_BRANDING_HTML}\n`;

      // Determine if HTML or markdown
      const isHtml = filepath.endsWith(".html") || content.toLowerCase().includes("<html");

      if (isHtml) {
        const injectedCode = `${sigHtml}\n<script type="application/ld+json">\n${schemaJson}\n</script>\n`;
        const scriptPattern =
          /<script\b(?=[^>]*\btype\s*=\s*(["']?)application\/ld\+json\1)[^>]*>[\s\S]*?<\/script>/i;

        if (scriptPattern.test(content)) {
          content = content.replace(scriptPattern, injectedCode.trim());
        } else if (/<\/head>/i.test(content)) {
          content = content.replace(/<\/head>/i, `${injectedCode}</head>`);
        } else if (/<\/body>/i.test(content)) {
          content = content.replace(/<\/body>/i, `${injectedCode}</body>`);
        } else {
          content += injectedCode;
        }
      } else {
        const injectedCode = `${sigMd}\n\`\`\`json\n${schemaJson}\n\`\`\`\n`;
        const schemaPattern =
          /```json\s*\{\s*"@context":\s*"https:\/\/schema\.org"[\s\S]*?\}\s*```/;

        if (schemaPattern.test(content)) {
          content = content.replace(schemaPattern, injectedCode.trim());
        } else {
          content += injectedCode;
        }
      }

      fs.writeFileSync(filepath, content, { encoding: "utf8" });
      successCount++;
    } catch (err) {
      errors.push({ file: filepath, error: err.message });
      failCount++;
    }
  }

  return { successCount, failCount, errors };
}
