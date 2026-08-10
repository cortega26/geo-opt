#!/usr/bin/env node
import { Command, Option } from "commander";
import fs from "fs";
import chalk from "chalk";
import path from "path";

import { copyFileAtomic, writeFileAtomic } from "../src/safe-write.js";

import {
  auditFiles,
  aggregateReport,
  auditContent,
  auditLlmsTxt,
  auditTechnicalHtml,
  batchInject,
  assertWritableTargetInsideCwd,
  checkRobots,
  discoverFiles,
  extractPageMetadata,
  extractFrontmatterContent,
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
  resolvePageUrl,
  findCommonBaseDir,
  fetchUrl,
  fetchRobotsTxt,
  checkRobotsRule,
  clearRobotsCache,
  parseSitemapXml,
  MAX_RESPONSE_SIZE,
  TOTAL_TIMEOUT_MS,
} from "../src/index.js";
import { assertOutputDirInsideCwd } from "../src/schema.js";
import { collectSubSitemapPageUrls } from "../src/sitemap.js";
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

function resolvePackageVersion() {
  for (const relativePath of ["../package.json", "../../package.json"]) {
    try {
      const packageJson = JSON.parse(
        fs.readFileSync(new URL(relativePath, import.meta.url), { encoding: "utf8" })
      );
      if (typeof packageJson.version !== "string" || packageJson.version.length === 0) {
        throw new Error(`Missing package version in ${relativePath}`);
      }
      return packageJson.version;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }

  throw new Error("Unable to locate geo-opt package.json");
}

const packageVersion = resolvePackageVersion();

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

/**
 * Resolve and validate the scoring model from CLI options.
 * v2 is the default since 2026-06-29. v1 is deprecated but still available.
 */
function resolveModel(optModel) {
  const model = (optModel || "v2").toLowerCase();
  if (!["v1", "v2"].includes(model)) {
    console.error(`Error: --model must be "v1" or "v2", got "${optModel}".`);
    process.exit(1);
  }
  if (model === "v1") {
    console.error(
      chalk.yellow(
        "Warning: --model v1 is deprecated. v2 is now the default (profile-aware scoring).\n" +
          "         Use --model v1 only if you need the legacy heuristic scoring model."
      )
    );
  }
  return model;
}

const program = new Command();

program
  .name("geo-opt")
  .description("AI-discoverability CLI: GEO, structured data, and technical SEO")
  .option("--config <path>", "Path to geo_config.json")
  .version(packageVersion);

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
  .option(
    "--profile <name>",
    "Force a specific profile for scoring (e.g. service, commercial, editorial)"
  )
  .option(
    "-m, --model <version>",
    "Scoring model: v2 (default, profile-aware) or v1 (legacy)",
    "v2"
  )
  .action((files, options, cmd) => {
    const config = resolveConfig(cmd);

    // CLI --profile overrides config.profile
    if (options.profile) {
      config.profile = options.profile;
    }

    if (!files || files.length === 0) {
      if (options.recursive) {
        files = ["."];
      } else {
        console.error(
          "Error: Missing file path for audit command.\n" +
            "If you used --ignore, place file paths BEFORE --ignore patterns:\n" +
            '  geo-opt audit <files...> --ignore "pattern"   ✅\n' +
            '  geo-opt audit --ignore "pattern" <files...>   ❌ (file consumed as pattern)'
        );
        process.exit(1);
      }
    }

    const format = options.format;
    if (!["text", "json"].includes(format)) {
      console.error(`Error: --format must be "text" or "json", got "${format}".`);
      process.exit(1);
    }

    const model = resolveModel(options.model);

    // Config-driven model override (config.profile implies v2 compatibility)
    if (model === "v1" && config.profile && config.profile !== "auto") {
      console.error(
        chalk.yellow(
          `Warning: config.profile is set to "${config.profile}" but --model v1 uses the legacy heuristic model. Profile-aware scoring requires v2. Remove --model v1 or --model v1 from your command.`
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
    const missingPaths = [];
    try {
      discovered = discoverFiles(files, {
        recursive: options.recursive || false,
        ignorePatterns: options.ignore || [],
        allowedExtensions: allowedExts,
        cwd: process.cwd(),
        config,
        // F-05 residual: un path explícito inexistente en modo mixto (con
        // otros archivos válidos) se descartaba en silencio — gate en verde
        // con archivos fallidos. Se reporta a stderr y falla el comando.
        onMissingPath: (p) => missingPaths.push(p),
      });
    } catch (e) {
      console.error(`Error: ${e.message}`);
      process.exit(1);
    }

    if (discovered.length === 0) {
      console.error(
        "No matching files found.\n" +
          "If you used --ignore, place file paths BEFORE --ignore patterns:\n" +
          '  geo-opt <command> <files...> --ignore "pattern"   ✅\n' +
          '  geo-opt <command> --ignore "pattern" <files...>   ❌ (file consumed as pattern)'
      );
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

    // Fallos de archivo: diagnósticos a stderr en JSON mode, que antes los
    // silenciaba por completo (F-05). El modo texto ya imprime cada error en
    // su propio loop, no se duplica.
    const fileErrors = results.filter((r) => r.status === "error");
    if (format === "json") {
      for (const r of fileErrors) {
        console.error(`\nError auditing ${r.file}: ${r.error}`);
      }
    }

    // Paths explícitos inexistentes (F-05 residual): el discovery los
    // descartaba en silencio en modo mixto; ahora se diagnostican igual que
    // los errores de lectura, en ambos formatos.
    for (const p of missingPaths) {
      console.error(`\nError auditing ${p}: file does not exist`);
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

    // Sin --threshold, los fallos parciales también deben fallar el comando
    // (F-05): restaura el claim "non-zero exit codes" del README para el gate
    // sin threshold. Los paths inexistentes cuentan como fallos (residual).
    if (fileErrors.length > 0 || missingPaths.length > 0) {
      process.exit(1);
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
        writeFileAtomic(outPath, content);
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
      console.error(
        "No matching files found.\n" +
          "If you used --ignore, place file paths BEFORE --ignore patterns:\n" +
          '  geo-opt <command> <files...> --ignore "pattern"   ✅\n' +
          '  geo-opt <command> --ignore "pattern" <files...>   ❌ (file consumed as pattern)'
      );
      process.exit(1);
    }

    const baseUrl = options.baseUrl || config.siteUrl || "";
    // Encontrar el directorio base común de todos los archivos
    const commonBase = findCommonBaseDir(discovered);

    // Build sitemap entries from discovered files
    const entries = [];
    for (const fp of discovered) {
      // Filtrar páginas de error
      const basename = path.basename(fp).toLowerCase();
      if (
        basename === "404.html" ||
        basename === "404.md" ||
        basename === "404.htm" ||
        basename === "500.html"
      ) {
        continue;
      }

      // Resolve URL relative to common base (not CWD)
      const rel = path.relative(commonBase, fp).split(path.sep).join("/");
      const ext = path.extname(rel);
      let urlPath = rel.slice(0, -ext.length);
      if (path.basename(urlPath) === "index") {
        urlPath = path.dirname(urlPath);
      }
      if (urlPath === "." || urlPath === "") {
        urlPath = "/";
      } else {
        if (!urlPath.startsWith("/")) {
          urlPath = "/" + urlPath;
        }
        // Asegurar trailing slash para rutas de directorio (P14/P21)
        if (!urlPath.endsWith("/") && !path.extname(urlPath)) {
          urlPath += "/";
        }
      }

      // Codificar cada segmento del path (RFC 3986): espacios y caracteres
      // especiales no pueden aparecer crudos en llms.txt ni sitemap (F-09).
      const encodedUrlPath = urlPath.split("/").map(encodeURIComponent).join("/");
      const entry = {
        url: baseUrl ? baseUrl.replace(/\/+$/, "") + encodedUrlPath : encodedUrlPath,
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

    // Tip: usar --audit para prioridades basadas en GEO score (P13)
    if (!options.audit && !options.dryRun && entries.length > 0) {
      console.warn(
        chalk.dim("Tip: Use --audit to compute GEO score-based priorities instead of defaults.")
      );
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
      writeFileAtomic(path.join(outDir, "sitemap.xml"), sitemapXml);
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
      const result = validateSchemaFile(file);
      if (!result.valid) {
        process.exitCode = 1;
      }
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
  .option("--base-url <url>", "Base URL of the site (e.g. https://example.com)")
  .addOption(new Option("--site-url <url>").hideHelp()) // backward-compat alias
  .option("--title <name>", "Site name (default: from config or directory name)")
  .option("--description <text>", "Site description (default: from config)")
  .option("--full", "Also generate llms-full.txt with complete page content")
  .option("--max-chars <number>", "Max characters per llms-full file before splitting", "500000")
  .option("--strip-prefix <prefix>", "Remove this prefix from generated URLs (e.g. 'src/data')")
  .option(
    "--frontmatter-fields <fields...>",
    "YAML frontmatter fields to use as page content for llms-full.txt (e.g. body excerpt)"
  )
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
      console.error(
        "No matching files found.\n" +
          "If you used --ignore, place file paths BEFORE --ignore patterns:\n" +
          '  geo-opt <command> <files...> --ignore "pattern"   ✅\n' +
          '  geo-opt <command> --ignore "pattern" <files...>   ❌ (file consumed as pattern)'
      );
      process.exit(1);
    }

    // Extract metadata from each file
    const siteUrl = options.baseUrl || options.siteUrl || config.siteUrl || "";
    const siteTitle =
      options.title || config.siteName || config.publisher?.name || path.basename(process.cwd());
    const siteDescription = options.description || config.siteDescription || "";

    const entries = [];
    const errors = [];
    const frontmatterFields = options.frontmatterFields || [];
    for (const fp of discovered) {
      try {
        const content = fs.readFileSync(fp, { encoding: "utf8" });
        const { title, description } = extractPageMetadata(content, fp);

        // Determine section from content signals or directory context
        const section = suggestSection(fp, content);

        // Resolve URL — usa el directorio base común para evitar rutas ../ (P3)
        const stripPrefix = options.stripPrefix || "";
        const commonBase = findCommonBaseDir(discovered);
        let url = "";
        if (siteUrl) {
          url = resolvePageUrl(fp, commonBase, siteUrl, { stripPrefix });
        } else {
          url = resolvePageUrl(fp, commonBase, "", { stripPrefix });
        }

        // Build content for llms-full.txt. When --frontmatter-fields is
        // specified, extract those YAML fields (plus the markdown body) so
        // that schema-driven collections with empty bodies are represented.
        let entryContent;
        if (options.full) {
          entryContent =
            frontmatterFields.length > 0
              ? extractFrontmatterContent(content, frontmatterFields) || content
              : content;
        }

        entries.push({
          path: fp,
          url,
          title,
          description,
          section,
          content: options.full ? entryContent : undefined,
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
      writeFileAtomic(path.join(outDir, "llms.txt"), llmsContent);
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
          writeFileAtomic(path.join(outDir, file.name), file.content);
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
        console.error(
          "No matching files found.\n" +
            "If you used --ignore, place file paths BEFORE --ignore patterns:\n" +
            '  geo-opt <command> <files...> --ignore "pattern"   ✅\n' +
            '  geo-opt <command> --ignore "pattern" <files...>   ❌ (file consumed as pattern)'
        );
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
          copyFileAtomic(file, backupPath);
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
  .option("--dry-run", "Preview the config file without writing it")
  .action((options) => {
    const targetPath = path.join(process.cwd(), "geo_config.json");

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

    // --dry-run: mostrar el template sin escribir
    if (options.dryRun) {
      if (fs.existsSync(targetPath)) {
        console.warn(
          chalk.yellow(`Note: ${targetPath} already exists (would be overwritten with --force).`)
        );
      }
      console.log("=== geo_config.json preview (--dry-run) ===");
      console.log(JSON.stringify(template, null, 2));
      return;
    }

    if (fs.existsSync(targetPath) && !options.force) {
      console.error(`Error: ${targetPath} already exists. Use --force to overwrite.`);
      process.exit(1);
    }

    try {
      writeFileAtomic(targetPath, JSON.stringify(template, null, 2) + "\n");
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
  .option("-m, --model <version>", "Scoring model: v2 (default) or v1", "v2")
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

    const model = resolveModel(options.model);

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
      console.error(
        "No matching files found.\n" +
          "If you used --ignore, place file paths BEFORE --ignore patterns:\n" +
          '  geo-opt <command> <files...> --ignore "pattern"   ✅\n' +
          '  geo-opt <command> --ignore "pattern" <files...>   ❌ (file consumed as pattern)'
      );
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
      // Multi-file aggregate report: use the redacted per-file view, never
      // the raw audit results so source bodies cannot reach the HTML output.
      html = renderAggregateReportHtml(summary.perFile ?? [], summary, { noBranding });
    }

    const outPath = path.resolve(options.output);
    try {
      writeFileAtomic(outPath, html);
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
  .option("--base-url <url>", "Base URL of the site (e.g. https://example.com)")
  .addOption(new Option("--site-url <url>").hideHelp()) // backward-compat alias
  .option("--title <name>", "Site name")
  .option("--description <text>", "Site description")
  .option("--model <version>", "Audit scoring model: v2 (default) or v1", "v2")
  .option("--strip-prefix <prefix>", "Remove this prefix from generated URLs (e.g. 'src/data')")
  .option("--dry-run", "Preview files without writing to disk")
  .action((dir, options, cmd) => {
    const config = resolveConfig(cmd);
    const inputDirs = dir ? [dir] : ["."];
    const outDir = path.resolve(options.output);
    const siteUrl = options.baseUrl || options.siteUrl || config.siteUrl || "";
    const siteTitle =
      options.title || config.siteName || config.publisher?.name || path.basename(process.cwd());
    const siteDescription = options.description || config.siteDescription || "";
    const model = resolveModel(options.model);

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
    // Encontrar el directorio base común para URLs limpias (P3)
    const commonBase = findCommonBaseDir(files);
    for (const r of auditResults) {
      if (r.status === "success" && r.report) {
        const score = r.score ?? r.report.total_score ?? r.report.effectiveScore;
        scoreEntries.push({ file: r.file, score });
      }
      // Read content for full-text generation
      try {
        if (typeof r.content !== "string") continue;
        const content = r.content;
        const { title } = extractPageMetadata(content, r.file);
        const stripPrefix = options.stripPrefix || "";
        const url = siteUrl
          ? resolvePageUrl(r.file, commonBase, siteUrl, { stripPrefix })
          : resolvePageUrl(r.file, commonBase, "", { stripPrefix });
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
      writeFileAtomic(path.join(outDir, "audit-report.json"), reportJson);
      writeFileAtomic(path.join(outDir, "llms.txt"), llmsContent);
      for (const file of llmsFullFiles) {
        writeFileAtomic(path.join(outDir, file.name), file.content);
      }
      writeFileAtomic(path.join(outDir, "sitemap.xml"), sitemapContent);
      writeFileAtomic(path.join(outDir, "robots.txt"), robotsContent);

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

// --- Technical: audit HTML for technical SEO/GEO fundamentals ---
program
  .command("technical [files...]")
  .description(
    "Audit HTML files or remote URLs for technical SEO/GEO fundamentals.\n" +
      "  Checks: title, canonical, meta robots, headings, hreflang,\n" +
      "  links, structured data consistency, and app-shell detection.\n" +
      "  Local files: no network access. Remote mode: --url or --sitemap."
  )
  .option("-r, --recursive", "Recursively scan directories for HTML files")
  .option("--source-url <url>", "Base URL for resolving relative links in local HTML")
  .option("-f, --format <type>", "Output format: text or json", "text")
  .option("-o, --output <file>", "Write JSON report to file (json format only)")
  .option("--url <url>", "Audit a remote URL (repeatable; https: required)", (val, prev) =>
    prev ? [].concat(prev, val) : [val]
  )
  .option("--sitemap <url>", "Audit pages discovered from a remote sitemap.xml (https: required)")
  .option("--max-urls <n>", "Max URLs to fetch in sitemap mode", "50")
  .option("--timeout <seconds>", "Request timeout in seconds", String(TOTAL_TIMEOUT_MS / 1000))
  .option("--max-size <bytes>", "Max response size in bytes", String(MAX_RESPONSE_SIZE))
  .option("--allow-private", "Allow connections to private IP ranges")
  .option("--allow-localhost", "Allow connections to loopback addresses")
  .option("--allow-http", "Allow connections to public HTTP URLs (not recommended)")
  .option(
    "--allow-cross-origin",
    "Allow redirects, sub-sitemaps, and pages to leave the root origin (not recommended)"
  )
  .option("--no-robots", "Skip robots.txt check in sitemap mode")
  .action((files, options, cmd) => {
    const config = resolveConfig(cmd);

    // Commander retorna string para --url único, array para múltiples
    const remoteUrls = options.url || [];
    const sitemapUrl = options.sitemap || null;
    const hasLocalFiles = Array.isArray(files) && files.length > 0;
    const hasRemote = remoteUrls.length > 0 || sitemapUrl;

    // Validación de exclusión mutua
    if (hasLocalFiles && hasRemote) {
      console.error(
        "Error: Local files and --url/--sitemap are mutually exclusive. Use one or the other."
      );
      process.exit(1);
    }

    // Sin archivos ni URLs remotas
    if (!hasLocalFiles && !hasRemote) {
      console.error("Error: Provide local file path(s), --url, or --sitemap for technical audit.");
      process.exit(1);
    }

    if (!["text", "json"].includes(options.format)) {
      console.error(`Error: --format must be "text" or "json", got "${options.format}".`);
      process.exit(1);
    }

    // ── Modo local ──
    if (hasLocalFiles) {
      // Expandir directorios si --recursive está activo
      if (options.recursive) {
        files = discoverFiles(files, {
          recursive: true,
          ignorePatterns: [],
          allowedExtensions: new Set([".html", ".htm"]),
          cwd: process.cwd(),
          config,
        });
      }

      // Verificar que no se pasaron directorios sin --recursive
      for (const file of files) {
        try {
          if (fs.statSync(file).isDirectory()) {
            console.error(`Error: "${file}" is a directory. Use --recursive to scan directories.`);
            process.exit(1);
          }
        } catch {
          // Se capturará abajo como error de lectura
        }
      }

      // --url y --sitemap flags no deberían estar presentes con archivos locales
      if (remoteUrls.length > 0) {
        console.error("Error: --url cannot be used with local files.");
        process.exit(1);
      }
      if (sitemapUrl) {
        console.error("Error: --sitemap cannot be used with local files.");
        process.exit(1);
      }

      // Los flags de red no aplican a modo local
      if (
        options.allowPrivate ||
        options.allowLocalhost ||
        options.allowHttp ||
        options.allowCrossOrigin ||
        options.noRobots
      ) {
        console.warn(
          chalk.yellow(
            "Warning: --allow-private, --allow-localhost, --allow-http, --allow-cross-origin, and --no-robots have no effect in local file mode."
          )
        );
      }

      if (options.sourceUrl && !/^https?:\/\//i.test(options.sourceUrl)) {
        console.error("Error: --source-url must be an absolute http(s) URL.");
        process.exit(1);
      }

      const results = [];
      for (const file of files) {
        let html;
        try {
          html = fs.readFileSync(file, { encoding: "utf8" });
        } catch (e) {
          results.push({ file, status: "error", error: `Read failed: ${e.message}` });
          continue;
        }
        try {
          const report = auditTechnicalHtml(html, { sourceUrl: options.sourceUrl || null });
          results.push({ file, status: "success", ...report });
        } catch (e) {
          results.push({ file, status: "error", error: e.message });
        }
      }

      emitTechnicalResults(results, options);
      return;
    }

    // ── Modo remoto ──
    handleRemoteTechnical(options).catch((err) => {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    });
  });

// ─────────────────────────────────────────────────────────────────────────────
// Technical audit helpers (used by the technical command)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Emite los resultados de la auditoría técnica (texto o JSON).
 * @param {Array} results — array de resultados de auditoría
 * @param {object} options — opciones del CLI
 */
function emitTechnicalResults(results, options) {
  if (options.format === "json") {
    const payload = results.length === 1 ? results[0] : results;
    const output = JSON.stringify(payload, null, 2);
    if (options.output) {
      const outPath = path.resolve(options.output);
      try {
        // Misma guarda de cwd que report/robots/sitemap/llmstxt (F-12): el
        // resto de escrituras del CLI la aplican; -o no podía escapar.
        writeFileAtomic(outPath, output);
      } catch (e) {
        console.error(`Error: Failed to write ${outPath}: ${e.message}`);
        process.exit(1);
      }
      console.log(`✓ Technical audit report written → ${path.resolve(outPath)}`);
    } else {
      console.log(output);
    }
    return;
  }

  // Text output
  for (const r of results) {
    if (r.status === "error") {
      console.error(`\nError auditing ${r.file || r.target}: ${r.error}`);
      continue;
    }
    console.log(chalk.bold.blue("══════════════════════════════════════════════════"));
    console.log(chalk.bold.blue("            TECHNICAL AUDIT REPORT                "));
    console.log(chalk.bold.blue("══════════════════════════════════════════════════"));
    const label = r.file ? `File:   ${r.file}` : `Target: ${r.target}`;
    console.log(chalk.bold(label));
    if (r.file && r.target && r.target !== r.file) {
      console.log(chalk.dim(`Target: ${r.target}`));
    }
    console.log(chalk.bold.blue("──────────────────────────────────────────────────"));

    if (r.findings && r.findings.length > 0) {
      console.log(chalk.bold(`\nFindings (${r.findings.length}):\n`));
      for (const f of r.findings) {
        const icon =
          f.status === "pass"
            ? chalk.green("✓")
            : f.status === "warn"
              ? chalk.yellow("⚠")
              : f.status === "not_applicable"
                ? chalk.dim("○")
                : chalk.red("✗");
        console.log(`  ${icon} [${f.ruleId}] ${f.message}`);
        if (f.remediation) {
          console.log(chalk.dim(`     Fix: ${f.remediation}`));
        }
      }
    } else {
      console.log(chalk.green("\nNo issues found."));
    }

    if (r.observations) {
      console.log(chalk.bold.blue("\n──────────────────────────────────────────────────"));
      console.log(chalk.bold("Observations:"));
      const obs = r.observations;
      console.log(chalk.dim(`  Title:          ${obs.title?.values?.join(", ") || "(none)"}`));
      console.log(
        chalk.dim(
          `  Visible words:  ${obs.visibleText?.wordCount ?? 0} (min: ${obs.visibleText?.minimumWords ?? 20})`
        )
      );
      console.log(
        chalk.dim(
          `  Canonical:      ${obs.canonical?.count ?? 0} URL(s)${obs.canonical?.conflicts ? " ⚠ conflicts" : ""}`
        )
      );
      console.log(
        chalk.dim(
          `  Meta robots:    noindex=${obs.robots?.noindex ?? false}, nofollow=${obs.robots?.nofollow ?? false}`
        )
      );
      console.log(
        chalk.dim(
          `  Headings:       ${obs.headings?.values?.length ?? 0} (issues: ${obs.headings?.issues?.join(", ") || "none"})`
        )
      );
      console.log(
        chalk.dim(
          `  Language:       ${obs.language?.documentLanguage || "(not set)"} (hreflang: ${obs.language?.hreflang?.length ?? 0})`
        )
      );
      console.log(
        chalk.dim(
          `  Links:          ${obs.links?.values?.length ?? 0} total, ${obs.links?.internalCount ?? 0} internal, ${obs.links?.invalidCount ?? 0} invalid`
        )
      );
      console.log(
        chalk.dim(
          `  StructuredData: ${obs.structuredData?.blockCount ?? 0} blocks, ${obs.structuredData?.invalidBlocks?.length ?? 0} invalid`
        )
      );
      console.log(
        chalk.dim(
          `  App shell:      ${obs.appShell?.detected ? "⚠ detected" : "not detected"} (scripts: ${obs.appShell?.scriptCount ?? 0})`
        )
      );
    }

    console.log(chalk.bold.blue("══════════════════════════════════════════════════\n"));
  }

  // Summary line
  const succeeded = results.filter((r) => r.status !== "error").length;
  const failed = results.filter((r) => r.status === "error").length;
  if (results.length > 1) {
    const summary = `${succeeded} audited` + (failed > 0 ? `, ${failed} failed` : "");
    console.log(chalk.dim(summary));
  }

  if (failed > 0) process.exit(1);
}

/**
 * Maneja la auditoría técnica en modo remoto (--url o --sitemap).
 *
 * Es una función async que retorna una promesa. Los errores se manejan
 * en el caller (el .action() de Commander).
 *
 * @param {object} options — opciones del CLI
 * @returns {Promise<void>}
 */
async function handleRemoteTechnical(options) {
  // Commander retorna string para --url único, array para múltiples
  const rawUrls = options.url;
  const remoteUrls = Array.isArray(rawUrls) ? rawUrls : rawUrls ? [rawUrls] : [];
  const sitemapUrl = options.sitemap || null;
  const format = options.format || "text";

  // Validar flags de red
  if (options.recursive) {
    console.warn(chalk.yellow("Warning: --recursive has no effect in remote mode."));
  }

  const maxUrls = parseInt(options.maxUrls, 10);
  if (isNaN(maxUrls) || maxUrls < 1) {
    console.error(`Error: --max-urls must be a positive integer, got "${options.maxUrls}".`);
    process.exit(1);
  }

  const timeoutSecs = parseFloat(options.timeout);
  if (isNaN(timeoutSecs) || timeoutSecs <= 0) {
    console.error(`Error: --timeout must be a positive number, got "${options.timeout}".`);
    process.exit(1);
  }

  const maxSize = parseInt(options.maxSize, 10);
  if (isNaN(maxSize) || maxSize < 1) {
    console.error(`Error: --max-size must be a positive integer, got "${options.maxSize}".`);
    process.exit(1);
  }

  const allowPrivate = options.allowPrivate || false;
  const allowLocalhost = options.allowLocalhost || false;
  const allowHttp = options.allowHttp || false;
  const allowCrossOrigin = options.allowCrossOrigin || false;
  const checkRobots = options.robots !== false;

  // Política de hop única para TODOS los hops remotos (Plan 075): esquema y
  // origin. El opt-in de HTTP es --allow-http; el de cross-origin es
  // --allow-cross-origin. Por compatibilidad, --allow-private y
  // --allow-localhost siguen liberando también el esquema en modo --url
  // (comportamiento previo); en modo --sitemap el esquema de los URLs
  // descubiertos solo se libera con --allow-http explícito.
  const fetchOptions = {
    allowPrivate,
    allowLocalhost,
    allowHttp: allowHttp || allowPrivate || allowLocalhost,
    allowCrossOrigin,
    timeoutMs: timeoutSecs * 1000,
    maxSize,
  };

  // ── Modo --url ──
  if (remoteUrls.length > 0 && !sitemapUrl) {
    // Requerir https:// para URLs explícitas, salvo que el usuario
    // haya levantado restricciones con los flags correspondientes.
    if (!allowPrivate && !allowLocalhost && !allowHttp) {
      for (const url of remoteUrls) {
        if (!url.startsWith("https://")) {
          let suggestion;
          try {
            const host = new URL(url).hostname;
            // En Node 22+ el hostname de un literal IPv6 incluye brackets
            // ("[::1]"); comparar ambas formas para sugerir el flag correcto.
            if (
              host === "localhost" ||
              host === "127.0.0.1" ||
              host === "::1" ||
              host === "[::1]"
            ) {
              suggestion = "--allow-localhost";
            } else if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) {
              suggestion = "--allow-private";
            } else {
              suggestion = "--allow-http";
            }
          } catch {
            suggestion = "--allow-private, --allow-localhost, or --allow-http";
          }
          console.error(
            `Error: --url requires https:// scheme: "${url}". Use ${suggestion} for http://.`
          );
          process.exit(1);
        }
      }
    }

    const results = [];
    for (const url of remoteUrls) {
      if (format !== "json") {
        console.log(chalk.dim(`Fetching ${url}...`));
      }
      try {
        const { html, statusCode, finalUrl } = await fetchUrl(url, fetchOptions);
        const report = auditTechnicalHtml(html, { sourceUrl: finalUrl });
        results.push({
          target: url,
          finalUrl,
          statusCode,
          status: "success",
          ...report,
        });
      } catch (e) {
        results.push({ target: url, status: "error", error: e.message });
      }
    }

    emitTechnicalResults(results, options);
    return;
  }

  // ── Modo --sitemap ──
  if (sitemapUrl) {
    if (remoteUrls.length > 0) {
      console.error("Error: --url and --sitemap are mutually exclusive.");
      process.exit(1);
    }

    if (!sitemapUrl.startsWith("https://")) {
      console.error(`Error: --sitemap requires https:// scheme: "${sitemapUrl}".`);
      process.exit(1);
    }

    const sitemapParsed = new URL(sitemapUrl);
    const origin = sitemapParsed.origin;

    // El origin del sitemap raíz rige TODOS los hops de este modo: robots.txt,
    // sitemap raíz (incluidos sus redirects), sub-sitemaps anidados y páginas
    // descubiertas. Cualquier salto a otro origin se rechaza salvo
    // --allow-cross-origin (Plan 075).
    //
    // Esquema estricto en este modo: allowHttp se fija SOLO con --allow-http
    // explícito. fetchOptions (modo --url) conserva la compatibilidad
    // histórica de que --allow-private/--allow-localhost liberan también el
    // esquema; aquí no se propaga: los URLs descubiertos (sub-sitemaps y
    // páginas) requieren el opt-in de HTTP nombrado.
    const sitemapFetchOptions = {
      ...fetchOptions,
      allowHttp,
      rootOrigin: origin,
      // El sitemap puede ser grande
      maxSize: Math.max(fetchOptions.maxSize, 10_485_760), // 10 MB para sitemaps
    };
    const pageFetchOptions = { ...fetchOptions, allowHttp, rootOrigin: origin };

    // 1. Fetch y parsear robots.txt
    let robotsGroups = [];
    if (checkRobots) {
      if (format !== "json") {
        console.log(chalk.dim(`Fetching robots.txt from ${origin}...`));
      }
      try {
        const robots = await fetchRobotsTxt(origin, sitemapFetchOptions);
        robotsGroups = robots.groups;
        if (format !== "json") {
          console.log(chalk.dim(`  Parsed ${robotsGroups.length} robots.txt group(s).`));
        }
      } catch (e) {
        if (format !== "json") {
          console.warn(chalk.yellow(`  Warning: Could not fetch robots.txt: ${e.message}`));
        }
      }
    }

    // 2. Fetch sitemap
    if (format !== "json") {
      console.log(chalk.dim(`Fetching sitemap ${sitemapUrl}...`));
    }
    clearRobotsCache(); // Limpiar caché del robots.txt para no interferir
    const sitemapResult = await fetchUrl(sitemapUrl, sitemapFetchOptions);

    // 3. Parsear sitemap
    const parsed = parseSitemapXml(sitemapResult.html);
    if (!parsed.valid && parsed.urls.length === 0 && parsed.sitemapUrls.length === 0) {
      console.error(`Error: Sitemap parse failed: ${parsed.issues.join("; ")}`);
      process.exit(1);
    }

    if (parsed.issues.length > 0 && format !== "json") {
      console.warn(chalk.yellow(`  Sitemap issues: ${parsed.issues.join("; ")}`));
    }

    // Si es un sitemap index, seguir los sub-sitemaps para extraer
    // las URLs de página reales (soporta hasta 2 niveles de anidación).
    let urls = parsed.urls.map((u) => u.loc);

    if (parsed.sitemapUrls.length > 0) {
      if (format !== "json") {
        console.log(
          chalk.dim(
            `  Sitemap index with ${parsed.sitemapUrls.length} sub-sitemap(s). Fetching page URLs...`
          )
        );
      }

      // Tope total de fetches de sub-sitemaps en todos los niveles de
      // anidación: un índice hostil con sub-sitemaps ilimitados (posiblemente
      // cross-origin) no puede amplificar el trabajo del CLI (F-11). La
      // lógica vive en src/sitemap.js con fetch inyectable para poder
      // testearse sin red.
      //
      // Las URLs retenidas tienen además su propio tope finito (Plan 076):
      // cada sub-sitemap puede aportar hasta 50.000 URLs (escala del spec),
      // así que 100 fetches retendrían millones de strings antes de que
      // --max-urls recorte. El presupuesto es COMPARTIDO entre las URLs
      // directas del índice y las de los sub-sitemaps: la lista combinada
      // nunca supera las 50.000 entradas antes de la evaluación de robots.
      // El collector des-duplica, conserva el orden de primer avistamiento y
      // advierte (una vez) si omite URLs por el tope.
      const { pageUrls } = await collectSubSitemapPageUrls(parsed.sitemapUrls, {
        fetchFn: (url, opts) => fetchUrl(url, opts),
        fetchOptions: sitemapFetchOptions,
        maxPageUrls: Math.max(1, 50_000 - urls.length),
        onInfo: format !== "json" ? (m) => console.log(chalk.dim(m)) : undefined,
        onWarn: format !== "json" ? (m) => console.warn(chalk.yellow(m)) : undefined,
      });

      if (format !== "json") {
        console.log(chalk.dim(`  Extracted ${pageUrls.length} page URLs from sub-sitemaps.`));
      }

      // Incluir tanto las URLs directas del índice como las extraídas de sub-sitemaps
      urls = [...urls, ...pageUrls];
    }

    // 4. Aplicar robots.txt
    const skipped = [];
    const allowed = [];

    if (robotsGroups.length > 0) {
      for (const url of urls) {
        const rule = checkRobotsRule(url, robotsGroups, "geo-opt/2.0 Technical Audit");
        if (rule.allowed) {
          allowed.push(url);
        } else {
          skipped.push({ url, matchedRule: rule.matchedRule });
        }
      }
    } else {
      allowed.push(...urls);
    }

    if (format !== "json") {
      console.log(
        chalk.dim(`  ${allowed.length} URLs allowed, ${skipped.length} skipped by robots.txt.`)
      );
    }

    // 5. Limitar a --max-urls
    const toFetch = allowed.slice(0, maxUrls);
    if (allowed.length > maxUrls && format !== "json") {
      console.log(chalk.dim(`  Limited to ${maxUrls} URLs (of ${allowed.length} allowed).`));
    }

    // 6. Fetch y auditar cada página
    const results = [];
    let fetched = 0;
    for (const url of toFetch) {
      fetched += 1;
      if (format !== "json") {
        process.stderr.write(`\r  Fetching ${fetched}/${toFetch.length}...`);
      }
      try {
        const { html, statusCode, finalUrl } = await fetchUrl(url, pageFetchOptions);
        const report = auditTechnicalHtml(html, { sourceUrl: finalUrl });
        results.push({
          target: url,
          finalUrl,
          statusCode,
          status: "success",
          ...report,
        });
      } catch (e) {
        results.push({ target: url, status: "error", error: e.message });
      }
    }

    if (format !== "json") {
      process.stderr.write("\n");
    }

    // Añadir URLs skippedas
    for (const s of skipped) {
      results.push({
        target: s.url,
        status: "skipped",
        reason: s.matchedRule
          ? `Disallowed by robots.txt: ${s.matchedRule.directive}: ${s.matchedRule.path}`
          : "Disallowed by robots.txt",
      });
    }

    emitTechnicalResults(results, options);
    return;
  }

  // No debería llegar aquí
  console.error("Error: No remote URLs specified.");
  process.exit(1);
}

// --- Badge: generate a shields.io badge for a file's GEO score ---
program
  .command("badge <file>")
  .description("Generate a GEO score badge for a content file")
  .option("-f, --format <type>", "Output format: markdown, url, or json", "markdown")
  .option("-m, --model <version>", "Scoring model: v2 (default) or v1", "v2")
  .option("--label <text>", "Badge label text", "GEO Score")
  .option("--style <style>", "Badge style: flat, flat-square, plastic, social", "flat")
  .action((file, options, cmd) => {
    const config = resolveConfig(cmd);
    const model = resolveModel(options.model);
    // Alias: --format text → markdown (consistencia con audit/technical)
    if (options.format === "text") {
      options.format = "markdown";
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

try {
  program.parse();
} catch (e) {
  if (e.code === "ENOENT" || e.code === "MODULE_NOT_FOUND") {
    console.error(
      "Error: geo-opt is not properly built. The dist/ directory is missing.\n" +
        "Run 'npm run build' first, or install from the npm registry."
    );
  } else {
    console.error(`Error: ${e.message}`);
  }
  process.exit(1);
}
