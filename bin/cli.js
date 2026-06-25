#!/usr/bin/env node
import { parseArgs } from "node:util";
import fs from "fs";
import {
  auditFile,
  checkRobots,
  generateSchemaData,
  injectSchema,
  loadConfig,
} from "../src/index.js";

function printHelp(command = null) {
  if (command === "audit") {
    console.log(`
geo-opt audit <file...> [options]

Audit content for GEO optimization score.

Options:
  --config <path>     Path to geo_config.json
  --format <type>     Output format: text (default) or json
  --threshold <n>     Exit with code 1 if score is below n
  -f, -t              Short forms of --format, --threshold

Example:
  geo-opt audit post.md --format json --threshold 70
`);
  } else if (command === "inject") {
    console.log(`
geo-opt inject <file> <type> [options]

Generate and inject JSON-LD schema into file.

Options:
  --config <path>     Path to geo_config.json
  --dry-run           Preview changes without writing
  --backup            Create .bak file before modifying

Example:
  geo-opt inject post.md article --dry-run
`);
  } else {
    console.log(`
geo-opt — Generative Engine Optimization CLI

Commands:
  audit    <file...>     Audit content for GEO score
  schema   <file> <type>  Generate JSON-LD schema (article|faq|product)
  inject   <file> <type>  Inject schema into file (article|faq|product)
  robots   <file>         Audit robots.txt for AI crawler rules

Options:
  --config <path>         Path to geo_config.json
  --help                  Show this help

Run 'geo-opt <command> --help' for command-specific options.
`);
  }
}

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    printHelp();
    process.exit(0);
  }

  // Extract --config globally
  let configPath = null;
  const configIndex = args.indexOf("--config");
  if (configIndex !== -1 && configIndex < args.length - 1) {
    configPath = args[configIndex + 1];
    args.splice(configIndex, 2);
  }

  const { config } = loadConfig(configPath);

  const command = args[0];
  const rest = args.slice(1);

  switch (command) {
    case "audit": {
      let parsed;
      try {
        parsed = parseArgs({
          args: rest,
          options: {
            format: { type: "string", short: "f", default: "text" },
            threshold: { type: "string", short: "t" },
            help: { type: "boolean", short: "h" },
          },
          allowPositionals: true,
        });
      } catch (e) {
        console.error(`Error: ${e.message}`);
        printHelp("audit");
        process.exit(1);
      }

      if (parsed.values.help) {
        printHelp("audit");
        process.exit(0);
      }

      const filepaths = parsed.positionals;
      if (filepaths.length === 0) {
        console.error("Error: Missing file path for audit command.");
        process.exit(1);
      }

      const format = parsed.values.format;
      let threshold = null;
      if (parsed.values.threshold !== undefined) {
        threshold = parseInt(parsed.values.threshold, 10);
      }

      const results = [];
      for (const fp of filepaths) {
        const score = auditFile(fp, config, format);
        results.push({ file: fp, score });
      }

      // Batch threshold check
      if (threshold !== null && !isNaN(threshold)) {
        const failures = results.filter((r) => r.score < threshold);
        if (failures.length > 0) {
          console.error(`\nThreshold not met for ${failures.length} file(s):`);
          for (const f of failures) {
            console.error(`  ${f.file}: ${f.score}/100 (threshold: ${threshold})`);
          }
          process.exit(1);
        }
        console.log(`\nAll ${results.length} file(s) meet threshold ${threshold}/100.`);
      }

      break;
    }

    case "robots": {
      let parsed;
      try {
        parsed = parseArgs({
          args: rest,
          options: {
            help: { type: "boolean", short: "h" },
          },
          allowPositionals: true,
        });
      } catch (e) {
        console.error(`Error: ${e.message}`);
        process.exit(1);
      }

      if (parsed.values.help) {
        printHelp();
        process.exit(0);
      }

      const filepath = parsed.positionals[0];
      if (!filepath) {
        console.error("Error: Missing file path for robots command.");
        process.exit(1);
      }
      checkRobots(filepath);
      break;
    }

    case "schema": {
      let parsed;
      try {
        parsed = parseArgs({
          args: rest,
          options: {
            help: { type: "boolean", short: "h" },
          },
          allowPositionals: true,
        });
      } catch (e) {
        console.error(`Error: ${e.message}`);
        process.exit(1);
      }

      if (parsed.values.help) {
        printHelp();
        process.exit(0);
      }

      const filepath = parsed.positionals[0];
      const type = parsed.positionals[1];
      if (!filepath || !type) {
        console.error("Error: Missing arguments for schema command. Usage: schema <file> <type>");
        process.exit(1);
      }
      const schema = generateSchemaData(filepath, type, config);
      console.log(JSON.stringify(schema, null, 2));
      break;
    }

    case "inject": {
      let parsed;
      try {
        parsed = parseArgs({
          args: rest,
          options: {
            "dry-run": { type: "boolean" },
            backup: { type: "boolean" },
            help: { type: "boolean", short: "h" },
          },
          allowPositionals: true,
        });
      } catch (e) {
        console.error(`Error: ${e.message}`);
        printHelp("inject");
        process.exit(1);
      }

      if (parsed.values.help) {
        printHelp("inject");
        process.exit(0);
      }

      const filepath = parsed.positionals[0];
      const type = parsed.positionals[1];
      if (!filepath || !type) {
        console.error("Error: Missing arguments for inject command. Usage: inject <file> <type>");
        process.exit(1);
      }

      const dryRun = parsed.values["dry-run"] || false;
      const backup = parsed.values.backup || false;

      if (backup) {
        const backupPath = filepath + ".bak";
        try {
          fs.copyFileSync(filepath, backupPath);
          console.log(`Backup created: ${backupPath}`);
        } catch (e) {
          console.error(`Error: Failed to create backup ${backupPath}: ${e.message}`);
          process.exit(1);
        }
      }

      injectSchema(filepath, type, config, dryRun);
      break;
    }

    case "--help":
    case "-h":
      printHelp();
      process.exit(0);
      break;

    default:
      console.error(`Error: Unknown command "${command}"`);
      printHelp();
      process.exit(1);
  }
}

main();
