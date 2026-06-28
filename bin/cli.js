#!/usr/bin/env node
import { Command } from "commander";
import fs from "fs";
import chalk from "chalk";
import path from "path";
import {
  auditFiles,
  aggregateReport,
  auditContent,
  auditLlmsTxt,
  batchInject,
  assertNewFileParentInsideCwd,
  assertWritableTargetInsideCwd,
  checkRobots,
  discoverFiles,
  extractPageMetadata,
  generateLlmsTxt,
  generateLlmsFullTxtFiles,
  suggestSection,
  generateRobotsTxt,
  generateSchemaData,
  COMMUNITY_SCHEMA_TYPES,
  PRO_SCHEMA_TYPES,
  hasProEntitlement,
  LICENSE_ENV_VAR,
  loadConfig,
  getNoBrandingError,
  recordSuccessfulFreeInjection,
  remindersAreEnabled,
  setRemindersEnabled,
  validateSchemaFile,
  generateSitemapXml,
} from "../src/index.js";
import { assertOutputDirInsideCwd } from "../src/schema.js";
import {
  renderV1Report,
  renderV2Report,
  renderV1Summary,
  renderV2Summary,
} from "../src/renderer.js";
import {
  renderV1ReportHtml,
  renderV2ReportHtml,
  renderAggregateReportHtml,
  renderComparisonHtml,
} from "../src/html-report.js";
import { generateBadgeUrl, generateBadgeMarkdown, scoreToBadgeGrade } from "../src/badge.js";
import { CONSENT_GRANTED, resolveTelemetryStatus, setTelemetryConsent } from "../src/telemetry.js";

// --- Global --config option ---
function resolveConfig(cmd) {
  try {
    const { config } = loadConfig(cmd.optsWithGlobals().config);
    return config;
  } catch (e) {
    console.error(`Error: ${e.message}`);
    process.exit(1);
  }
}

const program = new Command();

program
  .name("geo-opt")
  .description("Generative Engine Optimization CLI")
  .option("--config <path>", "Path to geo_config.json")
  .version("2.0.0");

// --- Audit ---
program
  .command("audit [files...]")
  .description("Audit content for GEO score")
  .option("-f, --format <type>", "Output format: text or json", "text")
  .option("-t, --threshold <n>", "Exit with code 1 if score is below n")
  .option("-r, --recursive", "Recursively scan directories")
  .option("--ignore <patterns...>", "Additional ignore patterns (gitignore syntax)")
  .option("-s, --summary", "Show aggregate site report (JSON only)")
  .option("--explain", "Show evidence labels and sources alongside findings")
  .option("-m, --model <version>", "Scoring model: v1 (default) or v2 (profile-aware)", "v1")
  .action((files, options, cmd) => {
    const config = resolveConfig(cmd);

    if (!files || files.length === 0) {
      if (options.recursive) {
        files = ["."];
      } else {
        console.error("Error: Missing file path for audit command.");
        process.exit(1);
      }
    }

    const format = options.format;
    if (!["text", "json"].includes(format)) {
      console.error(`Error: --format must be "text" or "json", got "${format}".`);
      process.exit(1);
    }

    const model = options.model || "v1";
    if (!["v1", "v2"].includes(model)) {
      console.error(`Error: --model must be "v1" or "v2", got "${model}".`);
      process.exit(1);
    }

    // Config-driven model override (config.profile implies v2 compatibility)
    if (model === "v1" && config.profile && config.profile !== "auto") {
      console.error(
        chalk.yellow(
          `Note: config.profile is set to "${config.profile}". Profile-aware scoring requires --model v2.`
        )
      );
    }

    let threshold = null;
    if (options.threshold !== undefined) {
      const raw = options.threshold;
      if (!/^\d+$/.test(raw)) {
        console.error(`Error: --threshold must be an integer, got "${raw}".`);
        process.exit(1);
      }
      threshold = parseInt(raw, 10);
    }

    // File discovery
    const allowedExts = new Set(
      Array.isArray(config.allowedExtensions) && config.allowedExtensions.length > 0
        ? config.allowedExtensions
        : [".md", ".html", ".htm"]
    );
    let discovered;
    try {
      discovered = discoverFiles(files, {
        recursive: options.recursive || false,
        ignorePatterns: options.ignore || [],
        allowedExtensions: allowedExts,
        cwd: process.cwd(),
        config,
      });
    } catch (e) {
      console.error(`Error: ${e.message}`);
      process.exit(1);
    }

    if (discovered.length === 0) {
      console.error("No matching files found.");
      process.exit(1);
    }

    // ── Unified audit: one path for v1 and v2 ──
    const showProgress = format !== "json" && discovered.length > 1;
    const results = auditFiles(
      discovered,
      config,
      model,
      showProgress
        ? (i, total, _fp) => {
            const pct = Math.round(((i + 1) / total) * 100);
            process.stderr.write(`\r  Auditing... ${i + 1}/${total} (${pct}%)`);
            if (i + 1 === total) process.stderr.write("\n");
          }
        : undefined
    );

    if (format === "json") {
      if (options.summary) {
        const summary = aggregateReport(results);
        console.log(JSON.stringify(summary, null, 2));
      } else {
        const reports = results.filter((r) => r.status === "success").map((r) => r.report);
        console.log(JSON.stringify(reports.length === 1 ? reports[0] : reports, null, 2));
      }
    } else {
      // Text output — one report per file
      for (const r of results) {
        if (r.status === "success") {
          if (model === "v2") {
            console.log(renderV2Report(r.report, r.file));
          } else {
            console.log(renderV1Report(r.report, r.file, { explain: options.explain || false }));
          }
        } else {
          console.error(`\nError auditing ${r.file}: ${r.error}`);
        }
      }

      // Site summary for multi-file
      if (results.length > 1) {
        const summary = aggregateReport(results);
        if (model === "v2") {
          console.log(renderV2Summary(summary));
        } else {
          console.log(renderV1Summary(summary));
        }
      }
    }

    // Unified threshold check
    if (threshold !== null) {
      const failures = results.filter((r) => r.status === "success" && r.score < threshold);
      const errors = results.filter((r) => r.status === "error");
      if (failures.length > 0 || errors.length > 0) {
        if (failures.length > 0) {
          console.error(`\nThreshold not met for ${failures.length} file(s):`);
          for (const f of failures) {
            console.error(`  ${f.file}: ${f.score}/100 (threshold: ${threshold})`);
          }
        }
        if (errors.length > 0) {
          console.error(`\n${errors.length} file(s) could not be audited.`);
        }
        process.exit(1);
      }
      if (format !== "json") {
        console.log(
          `\nAll ${results.filter((r) => r.status === "success").length} file(s) meet threshold ${threshold}/100.`
        );
      }
    }
  });

// --- Robots ---
const robotsCmd = program.command("robots").description("Audit or generate robots.txt");

robotsCmd
  .command("audit <file>")
  .description("Audit robots.txt for AI crawler blocking rules")
  .option("-f, --format <format>", "Output format (text|json)", "text")
  .action((file, options, cmd) => {
    resolveConfig(cmd);
    if (!["text", "json"].includes(options.format)) {
      console.error(`Error: Unsupported robots audit format "${options.format}".`);
      process.exitCode = 1;
      return;
    }
    try {
      checkRobots(file, { format: options.format });
    } catch (e) {
      console.error(`Error: ${e.message}`);
      process.exit(1);
    }
  });

robotsCmd
  .command("generate")
  .description("Generate a reviewable robots.txt draft for configured AI agents")
  .option("--preset <preset>", "Policy preset (search-visible|open)", "search-visible")
  .option("--disallow <paths...>", "Paths to disallow in broadly allowed groups")
  .option("--sitemap <url>", "URL of the sitemap")
  .option("--output <path>", "Output file path", "robots.txt")
  .option("--dry-run", "Preview without writing")
  .action((options) => {
    if (!["search-visible", "open"].includes(options.preset)) {
      console.error(`Error: Unknown robots.txt policy preset "${options.preset}".`);
      process.exitCode = 1;
      return;
    }
    const content = generateRobotsTxt({
      disallowPaths: options.disallow || [],
      sitemapUrl: options.sitemap || "",
      preset: options.preset,
    });

    if (options.dryRun) {
      console.log(content);
      console.log("[dry-run] Would write to:", options.output);
    } else {
      const outPath = path.resolve(options.output);
      try {
        assertNewFileParentInsideCwd(outPath);
        fs.writeFileSync(outPath, content, { encoding: "utf8" });
      } catch (e) {
        console.error(`Error: ${e.message}`);
        process.exit(1);
      }
      console.log(`robots.txt written to ${outPath}`);
    }
  });

// --- Sitemap ---
const sitemapCmd = program.command("sitemap").description("Generate sitemap.xml from content tree");

sitemapCmd
  .command("generate [files...]")
  .description("Generate sitemap.xml with GEO-derived priorities")
  .option("-r, --recursive", "Recursively scan directories")
  .option("--ignore <patterns...>", "Additional ignore patterns (gitignore syntax)")
  .option("--output <dir>", "Output directory", ".")
  .option("--base-url <url>", "Base URL for site (e.g. https://example.com)")
  .option("--audit", "Run GEO audit to compute score-based priorities")
  .option("--dry-run", "Preview without writing files")
  .action((files, options, cmd) => {
    const config = resolveConfig(cmd);

    if (!files || files.length === 0) files = ["."];

    const allowedExts = new Set(
      Array.isArray(config.allowedExtensions) && config.allowedExtensions.length > 0
        ? config.allowedExtensions
        : [".md", ".html", ".htm"]
    );

    let discovered;
    try {
      discovered = discoverFiles(files, {
        recursive: options.recursive || false,
        ignorePatterns: options.ignore || [],
        allowedExtensions: allowedExts,
        cwd: process.cwd(),
        config,
      });
    } catch (e) {
      console.error(`Error: ${e.message}`);
      process.exit(1);
    }

    if (discovered.length === 0) {
      console.error("No matching files found.");
      process.exit(1);
    }

    const baseUrl = options.baseUrl || config.siteUrl || "";

    // Build sitemap entries from discovered files
    const entries = [];
    for (const fp of discovered) {
      // Resolve URL relative to site base
      const rel = path.relative(process.cwd(), fp).split(path.sep).join("/");
      const ext = path.extname(rel);
      let urlPath = rel.slice(0, -ext.length);
      if (path.basename(urlPath) === "index") {
        urlPath = path.dirname(urlPath);
      }
      if (urlPath === "." || urlPath === "") {
        urlPath = "/";
      } else if (!urlPath.startsWith("/")) {
        urlPath = "/" + urlPath;
      }

      const entry = {
        url: baseUrl ? baseUrl.replace(/\/+$/, "") + urlPath : urlPath,
        filePath: fp,
      };

      // Optionally run GEO audit for score-based priority
      if (options.audit) {
        try {
          const content = fs.readFileSync(fp, { encoding: "utf8" });
          const { score } = auditContent(content, fp, config, "v2");
          entry.score = score;
        } catch {
          // Skip scoring if audit fails for this file
        }
      }

      entries.push(entry);
    }

    const sitemapXml = generateSitemapXml(entries, { baseUrl });

    if (options.dryRun) {
      console.log("=== sitemap.xml preview ===");
      console.log(sitemapXml.substring(0, 3000));
      if (sitemapXml.length > 3000) {
        console.log(`\n... (${sitemapXml.length - 3000} more chars)`);
      }
      console.log(
        `\n[dry-run] Would write sitemap.xml with ${entries.length} URL(s) to ${path.resolve(options.output)}`
      );
    } else {
      const outDir = path.resolve(options.output);
      try {
        assertOutputDirInsideCwd(outDir);
      } catch (e) {
        console.error(`Error: ${e.message}`);
        process.exit(1);
      }
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.join(outDir, "sitemap.xml"), sitemapXml, {
        encoding: "utf8",
      });
      console.log(
        `✓ sitemap.xml written (${entries.length} URL(s)) → ${path.join(outDir, "sitemap.xml")}`
      );
    }
  });

// --- Schema ---
program
  .command("schema <file> <type>")
  .description(
    "Generate JSON-LD structured data.\n" +
      `  Community types: ${[...COMMUNITY_SCHEMA_TYPES].join(", ")}\n` +
      `  Pro types:       ${[...PRO_SCHEMA_TYPES].join(", ")} (requires Pro license)\n` +
      "  Multi-type:      comma-separated, e.g. course,howto"
  )
  .action((file, type, options, cmd) => {
    const config = resolveConfig(cmd);
    try {
      const schema = generateSchemaData(file, type, config);
      console.log(JSON.stringify(schema, null, 2));
    } catch (e) {
      console.error(`Error: ${e.message}`);
      process.exit(1);
    }
  });

// --- Validate ---
program
  .command("validate <file>")
  .description("Validate existing JSON-LD structured data in a file")
  .action((file, _options, _cmd) => {
    try {
      validateSchemaFile(file);
    } catch (e) {
      console.error(`Error: ${e.message}`);
      process.exit(1);
    }
  });

// --- LlmsTxt ---
const llmstxtCmd = program
  .command("llmstxt")
  .description("Generate or audit llms.txt for LLM-friendly site documentation");

llmstxtCmd
  .command("generate [files...]")
  .description("Generate llms.txt (and llms-full.txt) from content files")
  .option("-r, --recursive", "Recursively scan directories")
  .option("--ignore <patterns...>", "Additional ignore patterns (gitignore syntax)")
  .option("--output <dir>", "Output directory", ".")
  .option("--site-url <url>", "Base URL of the site (e.g. https://example.com)")
  .option("--title <name>", "Site name (default: from config or directory name)")
  .option("--description <text>", "Site description (default: from config)")
  .option("--full", "Also generate llms-full.txt with complete page content")
  .option("--max-chars <number>", "Max characters per llms-full file before splitting", "500000")
  .option("--dry-run", "Preview without writing files")
  .action((files, options, cmd) => {
    const config = resolveConfig(cmd);

    if (!files || files.length === 0) files = ["."];

    // File discovery
    const allowedExts = new Set(
      Array.isArray(config.allowedExtensions) && config.allowedExtensions.length > 0
        ? config.allowedExtensions
        : [".md", ".html", ".htm"]
    );
    let discovered;
    try {
      discovered = discoverFiles(files, {
        recursive: options.recursive || false,
        ignorePatterns: options.ignore || [],
        allowedExtensions: allowedExts,
        cwd: process.cwd(),
        config,
      });
    } catch (e) {
      console.error(`Error: ${e.message}`);
      process.exit(1);
    }

    if (discovered.length === 0) {
      console.error("No matching files found.");
      process.exit(1);
    }

    // Extract metadata from each file
    const siteUrl = options.siteUrl || config.siteUrl || "";
    const siteTitle = options.title || config.publisher?.name || path.basename(process.cwd());
    const siteDescription = options.description || config.siteDescription || "";

    const entries = [];
    const errors = [];
    for (const fp of discovered) {
      try {
        const content = fs.readFileSync(fp, { encoding: "utf8" });
        const { title, description } = extractPageMetadata(content, fp);

        // Determine section from content signals or directory context
        const section = suggestSection(fp, content);

        // Resolve URL
        let url = "";
        if (siteUrl) {
          const rel = path.relative(process.cwd(), fp).split(path.sep).join("/");
          const ext = path.extname(rel);
          let withoutExt = rel.slice(0, -ext.length);
          if (path.basename(withoutExt) === "index") {
            withoutExt = path.dirname(withoutExt);
          }
          if (withoutExt === "." || withoutExt === "") {
            url = siteUrl.replace(/\/+$/, "") + "/";
          } else {
            url = siteUrl.replace(/\/+$/, "") + "/" + withoutExt;
          }
        } else {
          const relDir = path.relative(process.cwd(), path.dirname(fp));
          url = relDir + "/" + path.basename(fp);
        }

        entries.push({
          path: fp,
          url,
          title,
          description,
          section,
          content: options.full ? content : undefined,
        });
      } catch (err) {
        errors.push({ file: fp, error: err.message });
      }
    }

    // Generate llms.txt
    const llmsContent = generateLlmsTxt(entries, {
      siteTitle,
      siteDescription,
    });

    if (options.dryRun) {
      console.log("=== llms.txt preview ===");
      console.log(llmsContent);
      if (options.full) {
        const maxChars = parseInt(options.maxChars) || 500_000;
        const fullFiles = generateLlmsFullTxtFiles(
          entries.filter((e) => e.content),
          { siteTitle, maxChars }
        );
        console.log("\n=== llms-full.txt preview ===");
        for (const file of fullFiles) {
          console.log(`\n--- ${file.name} ---`);
          console.log(file.content.substring(0, 2000));
          if (file.content.length > 2000) {
            console.log(`\n... (${file.content.length - 2000} more chars in ${file.name})`);
          }
        }
        if (fullFiles.length > 1) {
          console.log(`\n[dry-run] Full content split into ${fullFiles.length} files.`);
        }
      }
      console.log(
        `\n[dry-run] Would write ${entries.length} page(s) to ${path.resolve(options.output)}/llms.txt`
      );
    } else {
      const outDir = path.resolve(options.output);
      try {
        assertOutputDirInsideCwd(outDir);
      } catch (e) {
        console.error(`Error: ${e.message}`);
        process.exit(1);
      }
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.join(outDir, "llms.txt"), llmsContent, {
        encoding: "utf8",
      });
      console.log(
        `✓ llms.txt written (${entries.length} pages, ${new Set(entries.map((e) => e.section)).size} sections) → ${path.join(outDir, "llms.txt")}`
      );

      if (options.full) {
        const maxChars = parseInt(options.maxChars) || 500_000;
        const fullEntries = entries.filter((e) => e.content);
        const fullFiles = generateLlmsFullTxtFiles(fullEntries, {
          siteTitle,
          maxChars,
        });
        for (const file of fullFiles) {
          fs.writeFileSync(path.join(outDir, file.name), file.content, {
            encoding: "utf8",
          });
        }
        if (fullFiles.length === 1) {
          console.log(
            `✓ llms-full.txt written (${fullEntries.length} pages) → ${path.join(outDir, "llms-full.txt")}`
          );
        } else {
          console.log(
            `✓ llms-full.txt written as ${fullFiles.length} files (${fullEntries.length} pages, max ${maxChars.toLocaleString()} chars each) → ${outDir}/`
          );
        }
      }
    }

    if (errors.length > 0) {
      console.error(`\n${errors.length} file(s) could not be processed:`);
      for (const e of errors.slice(0, 5)) {
        console.error(`  ${e.file}: ${e.error}`);
      }
      if (errors.length > 0) process.exit(1);
    }
  });

llmstxtCmd
  .command("audit <file>")
  .description("Audit an existing llms.txt for spec compliance and coverage")
  .option("-r, --recursive", "Check coverage against all site files")
  .action((file, options, cmd) => {
    const config = resolveConfig(cmd);

    if (!fs.existsSync(file)) {
      console.error(`Error: File ${file} not found.`);
      process.exit(1);
    }

    const content = fs.readFileSync(file, { encoding: "utf8" });

    let discoveredFiles = [];
    if (options.recursive) {
      try {
        discoveredFiles = discoverFiles(["."], {
          recursive: true,
          cwd: process.cwd(),
          config,
        });
      } catch {
        // Coverage check is optional
      }
    }

    const report = auditLlmsTxt(content, discoveredFiles, {
      siteUrl: config.siteUrl,
      baseDir: process.cwd(),
    });

    console.log(chalk.bold.blue("══════════════════════════════════════════════════"));
    console.log(chalk.bold.blue("              LLMS.TXT AUDIT REPORT               "));
    console.log(chalk.bold.blue("══════════════════════════════════════════════════"));

    if (report.valid) {
      console.log(chalk.green.bold("✓ llms.txt is valid (H1 present, no hard errors)."));
    } else {
      console.log(chalk.red.bold(`${report.issues.length} error(s) found:`));
      for (const issue of report.issues) {
        console.log(chalk.red(`  ✗ ${issue}`));
      }
    }

    if (report.warnings && report.warnings.length > 0) {
      console.log(chalk.yellow.bold(`\n${report.warnings.length} warning(s):`));
      for (const warn of report.warnings) {
        console.log(chalk.yellow(`  ⚠ ${warn}`));
      }
    }

    if (report.notes && report.notes.length > 0) {
      console.log(chalk.cyan.bold(`\n${report.notes.length} recommendation(s):`));
      for (const note of report.notes) {
        console.log(chalk.cyan(`  ℹ ${note}`));
      }
    }

    if (report.coverage) {
      console.log(chalk.bold("\nCoverage:"));
      console.log(
        `  Listed: ${chalk.green(report.coverage.listed)} | Missing: ${chalk.red(report.coverage.missing)} | Total: ${report.coverage.total}`
      );
      if (report.coverage.missingFiles.length > 0) {
        console.log(chalk.bold("\nMissing from llms.txt:"));
        for (const mf of report.coverage.missingFiles) {
          console.log(`  ${mf}`);
        }
        if (report.coverage.missing > 10) {
          console.log(`  ... and ${report.coverage.missing - 10} more`);
        }
      }
    }

    console.log(chalk.bold.blue("══════════════════════════════════════════════════"));

    if (!report.valid) process.exit(1);
  });

// --- Inject ---
program
  .command("inject <file> <type>")
  .description("Generate and inject JSON-LD schema into file(s)")
  .option("--dry-run", "Preview changes without writing")
  .option("--backup", "Create .bak file before modifying")
  .option("--no-branding", "Remove Tooltician branding (Pro license required)")
  .option("-r, --recursive", "Treat <file> as a directory and inject all files within")
  .option("--ignore <patterns...>", "Additional ignore patterns (gitignore syntax)")
  .action((file, type, options, cmd) => {
    const config = resolveConfig(cmd);
    const dryRun = options.dryRun || false;
    const backup = options.backup || false;
    const noBranding = options.branding === false;

    if (noBranding) {
      const entitlementError = getNoBrandingError(config);
      if (entitlementError) {
        console.error(`Error: ${entitlementError}`);
        process.exit(1);
      }
    }

    // If --recursive, discover files; otherwise single-file mode
    let fileList;
    if (options.recursive) {
      const allowedExts = new Set(
        Array.isArray(config.allowedExtensions) && config.allowedExtensions.length > 0
          ? config.allowedExtensions
          : [".md", ".html", ".htm"]
      );
      try {
        fileList = discoverFiles([file], {
          recursive: true,
          ignorePatterns: options.ignore || [],
          allowedExtensions: allowedExts,
          cwd: process.cwd(),
          config,
        });
      } catch (e) {
        console.error(`Error: ${e.message}`);
        process.exit(1);
      }
      if (fileList.length === 0) {
        console.error("No matching files found.");
        process.exit(1);
      }
    } else {
      // Single-file mode: preserve backward-compatible behavior
      try {
        assertWritableTargetInsideCwd(file);
      } catch (e) {
        console.error(`Error: ${e.message}`);
        process.exit(1);
      }
      if (backup && !dryRun) {
        const backupPath = file + ".bak";
        try {
          assertNewFileParentInsideCwd(backupPath);
        } catch (e) {
          console.error(`Error: ${e.message}`);
          process.exit(1);
        }
        try {
          fs.copyFileSync(file, backupPath);
          console.log(`Backup created: ${backupPath}`);
        } catch (e) {
          console.error(`Error: Failed to create backup ${backupPath}: ${e.message}`);
          process.exit(1);
        }
      }
      fileList = [file];
    }

    const result = batchInject(fileList, type, config, { dryRun, noBranding });

    if (result.failCount > 0) {
      for (const err of result.errors) {
        console.error(`Error injecting ${err.file}: ${err.error}`);
      }
    }

    if (dryRun) {
      console.log(
        `[dry-run] Would inject ${type} schema into ${result.successCount} file(s)${result.failCount > 0 ? ` (${result.failCount} skipped)` : ""}.`
      );
    } else {
      if (options.recursive) {
        console.log(
          `Injected ${result.successCount} file(s)${result.failCount > 0 ? `, ${result.failCount} failed` : ""}.`
        );
      }
      if (result.successCount > 0) {
        recordSuccessfulFreeInjection(config);
      }
    }

    if (result.failCount > 0) process.exit(1);
  });

// --- Config ---
program
  .command("config <action> <setting> [value]")
  .description("Manage local geo-opt preferences (get|set reminders|telemetry true|false)")
  .action((action, setting, value, _options, _cmd) => {
    if (!["reminders", "telemetry"].includes(setting) || !["get", "set"].includes(action)) {
      console.error("Error: Usage: geo-opt config <get|set> <reminders|telemetry> [true|false]");
      process.exit(1);
    }

    if (action === "get") {
      if (setting === "telemetry") {
        console.log(resolveTelemetryStatus().decision === CONSENT_GRANTED ? "true" : "false");
        return;
      }
      console.log(remindersAreEnabled() ? "true" : "false");
      return;
    }

    if (!["true", "false"].includes(value)) {
      console.error(`Error: ${setting} must be true or false.`);
      process.exit(1);
    }

    const enabled = value === "true";

    if (setting === "telemetry") {
      if (!setTelemetryConsent(enabled ? "granted" : "denied")) {
        console.error("Error: Could not save the local telemetry preference.");
        process.exit(1);
      }
      console.log(`Anonymous telemetry ${enabled ? "enabled" : "disabled"}.`);
      return;
    }

    if (!setRemindersEnabled(enabled)) {
      console.error("Error: Could not save the local reminder preference.");
      process.exit(1);
    }
    console.log(`Support reminders ${enabled ? "enabled" : "disabled"}.`);
  });

// --- Init ---
program
  .command("init")
  .description("Scaffold a geo_config.json template in the current directory")
  .option("--force", "Overwrite if geo_config.json already exists")
  .action((options) => {
    const targetPath = path.join(process.cwd(), "geo_config.json");
    if (fs.existsSync(targetPath) && !options.force) {
      console.error(`Error: ${targetPath} already exists. Use --force to overwrite.`);
      process.exit(1);
    }

    const template = {
      author: {
        name: "Your Name",
        jobTitle: "Your Job Title",
        sameAs: "https://www.linkedin.com/in/yourprofile/",
      },
      publisher: {
        name: "Your Organization",
        url: "https://www.example.com",
        logo: "https://www.example.com/logo.png",
      },
      acronyms: {
        AWS: "Amazon Web Services",
        GDPR: "General Data Protection Regulation",
        ROI: "Return on Investment",
      },
      product: {
        offer: {
          price: "0",
          priceCurrency: "USD",
          availability: "https://schema.org/InStock",
        },
      },
      limits: {
        max_pronoun_density: 0.02,
      },
      allowedExtensions: [".md", ".html", ".htm"],
    };

    try {
      fs.writeFileSync(targetPath, JSON.stringify(template, null, 2) + "\n", {
        encoding: "utf8",
      });
      console.log(`Created ${targetPath}`);
      console.log("Edit this file to customize author, publisher, acronyms, and product details.");
    } catch (e) {
      console.error(`Error: Failed to write ${targetPath}: ${e.message}`);
      process.exit(1);
    }
  });

// --- Report (Pro): HTML audit reports with charts and comparison mode ---
program
  .command("report <files...>")
  .description(
    "Generate a Pro HTML audit report with charts (requires Pro license).\n" +
      "  Open the output file in a browser; use File > Print > Save as PDF for PDF export."
  )
  .option("-o, --output <file>", "Output HTML file", "geo-report.html")
  .option("-m, --model <version>", "Scoring model: v1 or v2", "v1")
  .option("-r, --recursive", "Recursively scan directories")
  .option("--ignore <patterns...>", "Additional ignore patterns")
  .option("--compare <file>", "Compare against a previous JSON report (before/after mode)")
  .option("--no-branding", "Remove Tooltician branding (Pro only)")
  .action((files, options, cmd) => {
    const config = resolveConfig(cmd);
    if (!hasProEntitlement(config)) {
      console.error(
        "Error: 'geo-opt report' requires a Tooltician Pro license.\n" +
          `Set ${LICENSE_ENV_VAR} or license.key in geo_config.json.`
      );
      process.exit(1);
    }

    const noBranding = options.branding === false;
    if (noBranding) {
      const err = getNoBrandingError(config);
      if (err) {
        console.error(`Error: ${err}`);
        process.exit(1);
      }
    }

    const model = options.model || "v1";
    if (!["v1", "v2"].includes(model)) {
      console.error(`Error: --model must be "v1" or "v2", got "${model}".`);
      process.exit(1);
    }

    const allowedExts = new Set([".md", ".html", ".htm"]);
    let discovered;
    try {
      discovered = discoverFiles(files, {
        recursive: options.recursive || false,
        ignorePatterns: options.ignore || [],
        allowedExtensions: allowedExts,
        cwd: process.cwd(),
        config,
      });
    } catch (e) {
      console.error(`Error: ${e.message}`);
      process.exit(1);
    }

    if (discovered.length === 0) {
      console.error("No matching files found.");
      process.exit(1);
    }

    const results = auditFiles(discovered, config, model);
    const summary = aggregateReport(results);
    const successResults = results.filter((r) => r.status === "success");

    let html;
    if (options.compare) {
      // Comparison mode: single file vs saved baseline JSON
      if (discovered.length !== 1) {
        console.error("Error: --compare requires exactly one input file.");
        process.exit(1);
      }
      let baseline;
      try {
        baseline = JSON.parse(fs.readFileSync(options.compare, { encoding: "utf8" }));
      } catch (e) {
        console.error(`Error: Failed to read baseline report "${options.compare}": ${e.message}`);
        process.exit(1);
      }
      const current = successResults[0]?.report;
      if (!current) {
        console.error(`Error: Could not audit ${discovered[0]}.`);
        process.exit(1);
      }
      html = renderComparisonHtml(baseline, current, discovered[0], { noBranding });
    } else if (successResults.length === 1) {
      // Single-file report
      const r = successResults[0];
      html =
        model === "v2"
          ? renderV2ReportHtml(r.report, r.file, { noBranding })
          : renderV1ReportHtml(r.report, r.file, { noBranding });
    } else {
      // Multi-file aggregate report
      html = renderAggregateReportHtml(results, summary, { noBranding });
    }

    const outPath = path.resolve(options.output);
    try {
      assertNewFileParentInsideCwd(outPath);
      fs.writeFileSync(outPath, html, { encoding: "utf8" });
    } catch (e) {
      console.error(`Error: ${e.message}`);
      process.exit(1);
    }

    const rel = path.relative(process.cwd(), outPath);
    console.log(`✓ Report written → ${rel}`);
    if (successResults.length > 1) {
      console.log(
        `  ${successResults.length} files · avg score: ${summary.averageScore ?? "N/A"}/100`
      );
    } else if (successResults.length === 1) {
      console.log(`  Score: ${successResults[0].score ?? "N/A"}/100`);
    }
    console.log("  Open in a browser. Use File > Print > Save as PDF for PDF export.");
  });

// --- Generate-All: complete GEO optimization package ---
program
  .command("generate-all [dir]")
  .description("Generate a complete GEO optimization package from a content directory")
  .option("-r, --recursive", "Recursively scan subdirectories")
  .option("--ignore <patterns...>", "Additional ignore patterns")
  .option("--output <dir>", "Output directory", "geo-package")
  .option("--site-url <url>", "Base URL of the site (e.g. https://example.com)")
  .option("--title <name>", "Site name")
  .option("--description <text>", "Site description")
  .option("--model <version>", "Audit scoring model (v1 or v2)", "v2")
  .option("--dry-run", "Preview files without writing to disk")
  .action((dir, options, cmd) => {
    const config = resolveConfig(cmd);
    const inputDirs = dir ? [dir] : ["."];
    const outDir = path.resolve(options.output);
    const siteUrl = options.siteUrl || config.siteUrl || "";
    const siteTitle = options.title || config.publisher?.name || path.basename(process.cwd());
    const siteDescription = options.description || config.siteDescription || "";
    const model = options.model === "v2" ? "v2" : "v1";

    // 1. Discover files
    const allowedExts = new Set(
      Array.isArray(config.allowedExtensions) && config.allowedExtensions.length > 0
        ? config.allowedExtensions
        : [".md", ".html", ".htm"]
    );

    let files;
    try {
      files = discoverFiles(inputDirs, {
        recursive: options.recursive || true,
        ignorePatterns: options.ignore || [],
        allowedExtensions: allowedExts,
        cwd: process.cwd(),
        config,
      });
    } catch (e) {
      console.error(`Error discovering files: ${e.message}`);
      process.exit(1);
    }

    if (files.length === 0) {
      console.error("No content files found in the specified directory.");
      console.error("Supported formats: " + [...allowedExts].join(", "));
      process.exit(1);
    }

    const total = files.length;
    if (!options.dryRun) {
      console.log(`\n🔍 Generating GEO package for ${total} file(s)...\n`);
    }

    // 2. Run audit on all files
    let auditResults = [];
    try {
      auditResults = auditFiles(files, config, model);
    } catch (e) {
      console.error(`Audit error: ${e.message}`);
    }

    const scoreEntries = [];
    const fullEntries = [];
    for (const r of auditResults) {
      if (r.status === "success" && r.report) {
        const score = r.score ?? r.report.total_score ?? r.report.effectiveScore;
        scoreEntries.push({ file: r.file, score });
      }
      // Read content for full-text generation
      try {
        const content = r.content ?? fs.readFileSync(r.file, { encoding: "utf8" });
        const { title } = extractPageMetadata(content, r.file);
        const rel = path.relative(process.cwd(), r.file).split(path.sep).join("/");
        const ext = path.extname(rel);
        let urlPath = rel.slice(0, -ext.length);
        if (path.basename(urlPath) === "index") urlPath = path.dirname(urlPath);
        if (urlPath === ".") urlPath = "/";
        else if (!urlPath.startsWith("/")) urlPath = "/" + urlPath;
        const url = siteUrl ? siteUrl.replace(/\/+$/, "") + urlPath : urlPath;
        const section = suggestSection(r.file, content);
        const score = r.score ?? r.report?.total_score ?? r.report?.effectiveScore ?? undefined;
        fullEntries.push({ file: r.file, title, url, section, content, score });
      } catch {
        // Skip files that can't be read
      }
    }

    // 3. Generate aggregate audit report
    const aggregate = aggregateReport(auditResults);
    const reportJson = JSON.stringify(aggregate, null, 2);

    // 4. Generate llms.txt
    const llmsTxtEntries = fullEntries.map((e) => ({
      title: e.title,
      url: e.url,
      description: "", // CLI extracts this; for generate-all we keep it concise
      section: e.section,
      score: e.score,
    }));
    const llmsContent = generateLlmsTxt(llmsTxtEntries, {
      siteTitle,
      siteDescription,
    });

    // 5. Generate llms-full.txt
    const llmsFullFiles = generateLlmsFullTxtFiles(
      fullEntries.map((e) => ({ title: e.title, url: e.url, content: e.content })),
      { siteTitle }
    );

    // 6. Generate sitemap.xml
    const sitemapEntries = fullEntries.map((e) => ({
      url: e.url,
      score: e.score,
      filePath: path.resolve(e.file || path.join(process.cwd(), e.url)),
    }));
    const sitemapContent = generateSitemapXml(sitemapEntries, { baseUrl: siteUrl });

    // 7. Generate robots.txt
    const robotsContent = generateRobotsTxt({
      preset: "search-visible",
      sitemapUrl: siteUrl ? `${siteUrl.replace(/\/+$/, "")}/sitemap.xml` : "",
    });

    // 8. Write or preview
    if (options.dryRun) {
      console.log("=== DRY RUN — No files will be written ===\n");
      console.log(`Would create package in: ${outDir}/`);
      console.log(
        `  • audit-report.json (${files.length} files, avg score: ${aggregate.averageScore ?? "N/A"})`
      );
      console.log(
        `  • llms.txt (${fullEntries.length} pages, ${new Set(fullEntries.map((e) => e.section)).size} sections)`
      );
      console.log(`  • llms-full.txt (${llmsFullFiles.length} file(s))`);
      console.log(`  • sitemap.xml (${sitemapEntries.length} URLs)`);
      console.log("  • robots.txt");
      console.log("");
      console.log("Preview — llms.txt:");
      console.log(llmsContent.substring(0, 500));
      console.log("...");
    } else {
      try {
        assertOutputDirInsideCwd(outDir);
      } catch (e) {
        console.error(`Error: ${e.message}`);
        process.exit(1);
      }
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.join(outDir, "audit-report.json"), reportJson, { encoding: "utf8" });
      fs.writeFileSync(path.join(outDir, "llms.txt"), llmsContent, { encoding: "utf8" });
      for (const file of llmsFullFiles) {
        fs.writeFileSync(path.join(outDir, file.name), file.content, { encoding: "utf8" });
      }
      fs.writeFileSync(path.join(outDir, "sitemap.xml"), sitemapContent, { encoding: "utf8" });
      fs.writeFileSync(path.join(outDir, "robots.txt"), robotsContent, { encoding: "utf8" });

      console.log("");
      console.log("✅ GEO optimization package generated:");
      console.log(
        `   📊 audit-report.json  (${files.length} files, avg: ${aggregate.averageScore ?? "N/A"})`
      );
      console.log(`   📋 llms.txt           (${fullEntries.length} pages)`);
      for (const file of llmsFullFiles) {
        console.log(`   📄 ${file.name.padEnd(20)} (full content)`);
      }
      console.log(`   🗺️  sitemap.xml        (${sitemapEntries.length} URLs)`);
      console.log("   🤖 robots.txt");
      console.log(`\n   Output: ${outDir}/`);
    }

    if (!options.dryRun) {
      // Show top-level summary
      const topIssues = (aggregate.topFindings || []).slice(0, 3);
      if (topIssues.length > 0) {
        console.log("\n📝 Top issues to fix:");
        for (const issue of topIssues) {
          console.log(`   • ${issue.message} (${issue.fileCount} files)`);
        }
      }
    }
  });

// --- Badge: generate a shields.io badge for a file's GEO score ---
program
  .command("badge <file>")
  .description("Generate a GEO score badge for a content file")
  .option("-f, --format <type>", "Output format: markdown, url, or json", "markdown")
  .option("-m, --model <version>", "Scoring model: v1 (default) or v2", "v1")
  .option("--label <text>", "Badge label text", "GEO Score")
  .option("--style <style>", "Badge style: flat, flat-square, plastic, social", "flat")
  .action((file, options, cmd) => {
    const config = resolveConfig(cmd);
    const model = options.model || "v1";
    if (!["v1", "v2"].includes(model)) {
      console.error(`Error: --model must be "v1" or "v2", got "${model}".`);
      process.exit(1);
    }
    const validFormats = ["markdown", "url", "json"];
    if (!validFormats.includes(options.format)) {
      console.error(
        `Error: --format must be one of: ${validFormats.join(", ")}, got "${options.format}".`
      );
      process.exit(1);
    }
    const validStyles = ["flat", "flat-square", "plastic", "social"];
    if (!validStyles.includes(options.style)) {
      console.error(
        `Error: --style must be one of: ${validStyles.join(", ")}, got "${options.style}".`
      );
      process.exit(1);
    }

    let score;
    try {
      const results = auditFiles([file], config, model);
      const result = results[0];
      if (result.status === "error") {
        console.error(`Error: ${result.error}`);
        process.exit(1);
      }
      score = result.score ?? 0;
    } catch (e) {
      console.error(`Error: ${e.message}`);
      process.exit(1);
    }
    const badgeUrl = generateBadgeUrl(score, { label: options.label, style: options.style });
    const grade = scoreToBadgeGrade(score);

    if (options.format === "url") {
      console.log(badgeUrl);
    } else if (options.format === "json") {
      console.log(
        JSON.stringify(
          {
            score,
            grade,
            badge_url: badgeUrl,
            badge_markdown: generateBadgeMarkdown(score, {
              label: options.label,
              style: options.style,
            }),
          },
          null,
          2
        )
      );
    } else {
      console.log(generateBadgeMarkdown(score, { label: options.label, style: options.style }));
    }
  });

// Preserve original behavior: no args → help with exit 0.
if (process.argv.length === 2) {
  program.outputHelp();
  process.exit(0);
}

program.parse();
