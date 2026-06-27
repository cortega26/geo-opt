/**
 * Fixture validator for audit-v2 characterization corpus.
 *
 * Validates that every fixture has:
 *  - A content file (.md or .html)
 *  - An expectations file (.expect.json)
 *  - A valid profile
 *  - Required observation fields
 *  - All expected profiles and adversarial flags present
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = __dirname;

const VALID_PROFILES = new Set([
  "auto",
  "documentation",
  "open-source",
  "editorial",
  "commercial",
  "ecommerce",
  "regulated",
]);

const REQUIRED_OBSERVATION_DIMENSIONS = [
  "structure",
  "statistics",
  "quotations",
  "citations",
  "clarity",
];

const EXPECTED_PROFILES = [
  "documentation",
  "open-source",
  "editorial",
  "commercial",
  "ecommerce",
  "regulated",
];

const EXPECTED_ADVERSARIAL_FLAGS = [
  "fabricated_stats",
  "unattributed_quotes",
  "implausible_precision",
  "vague_claims",
  "link_farm",
  "thin_content",
  "excessive_links",
  "generic_content",
  "no_specific_data",
  "vague_sources",
  "platitudes",
  "keyword_stuffing",
  "circular_content",
  "empty_sections",
  "no_body_content",
  "heading_shell",
  "auto_generated",
  "generic_patterns",
  "no_specifics",
  "filler_content",
  "hedging_language",
];

/**
 * @typedef {Object} ValidationError
 * @property {string} file
 * @property {string} message
 */

/**
 * @typedef {Object} ValidationResult
 * @property {number} totalFixtures
 * @property {string[]} profilesFound
 * @property {string[]} adversarialFlagsFound
 * @property {ValidationError[]} errors
 * @property {string[]} warnings
 */

/**
 * @returns {ValidationResult}
 */
export function validateFixtures() {
  /** @type {ValidationError[]} */
  const errors = [];
  /** @type {string[]} */
  const warnings = [];
  const profilesFound = new Set();
  const adversarialFlagsFound = new Set();
  let totalFixtures = 0;

  const categories = fs.readdirSync(FIXTURES_DIR).filter((name) => {
    const full = path.join(FIXTURES_DIR, name);
    return fs.statSync(full).isDirectory();
  });

  for (const category of categories) {
    const catDir = path.join(FIXTURES_DIR, category);
    const files = fs.readdirSync(catDir);

    // Find content files
    const contentFiles = files.filter((f) => f.endsWith(".md") || f.endsWith(".html"));

    for (const contentFile of contentFiles) {
      const baseName = contentFile.replace(/\.(md|html)$/, "");
      const expectFile = `${baseName}.expect.json`;
      const contentPath = path.join(catDir, contentFile);
      const expectPath = path.join(catDir, expectFile);

      if (!files.includes(expectFile)) {
        errors.push({
          file: path.join(category, contentFile),
          message: `Missing expectations file: ${expectFile}`,
        });
        continue;
      }

      totalFixtures++;

      // Validate expect.json structure
      let expect;
      try {
        const raw = fs.readFileSync(expectPath, "utf8");
        expect = JSON.parse(raw);
      } catch (e) {
        errors.push({
          file: path.join(category, expectFile),
          message: `Invalid JSON: ${e.message}`,
        });
        continue;
      }

      // Profile
      if (!expect.profile) {
        errors.push({
          file: path.join(category, expectFile),
          message: "Missing 'profile' field",
        });
      } else if (!VALID_PROFILES.has(expect.profile)) {
        errors.push({
          file: path.join(category, expectFile),
          message: `Invalid profile '${expect.profile}'. Valid: ${[...VALID_PROFILES].join(", ")}`,
        });
      } else {
        profilesFound.add(expect.profile);
      }

      // Description
      if (!expect.description || typeof expect.description !== "string") {
        errors.push({
          file: path.join(category, expectFile),
          message: "Missing or invalid 'description' field",
        });
      }

      // Observations
      if (!expect.observations || typeof expect.observations !== "object") {
        errors.push({
          file: path.join(category, expectFile),
          message: "Missing 'observations' object",
        });
      } else {
        for (const dim of REQUIRED_OBSERVATION_DIMENSIONS) {
          if (!expect.observations[dim]) {
            errors.push({
              file: path.join(category, expectFile),
              message: `Missing observation dimension: '${dim}'`,
            });
          }
        }
      }

      // notApplicableDimensions
      if (!Array.isArray(expect.notApplicableDimensions)) {
        errors.push({
          file: path.join(category, expectFile),
          message: "Missing or invalid 'notApplicableDimensions' array",
        });
      }

      // adversarialFlags
      if (!Array.isArray(expect.adversarialFlags)) {
        errors.push({
          file: path.join(category, expectFile),
          message: "Missing or invalid 'adversarialFlags' array",
        });
      } else {
        for (const flag of expect.adversarialFlags) {
          adversarialFlagsFound.add(flag);
        }
      }

      // Verify content file exists and is non-empty
      try {
        const content = fs.readFileSync(contentPath, "utf8");
        if (content.trim().length === 0) {
          errors.push({
            file: path.join(category, contentFile),
            message: "Content file is empty",
          });
        }
      } catch (e) {
        errors.push({
          file: path.join(category, contentFile),
          message: `Cannot read content file: ${e.message}`,
        });
      }
    }
  }

  // Check expected profiles
  for (const profile of EXPECTED_PROFILES) {
    if (!profilesFound.has(profile)) {
      warnings.push(`Expected profile '${profile}' not found in any fixture`);
    }
  }

  // Check adversarial category exists and has flags
  if (!fs.existsSync(path.join(FIXTURES_DIR, "adversarial")) || adversarialFlagsFound.size === 0) {
    warnings.push("No adversarial fixtures or flags found");
  }

  return {
    totalFixtures,
    profilesFound: [...profilesFound].sort(),
    adversarialFlagsFound: [...adversarialFlagsFound].sort(),
    errors,
    warnings,
  };
}

// CLI entry point
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = validateFixtures();

  console.log(`\nFixture corpus validation\n${"=".repeat(40)}`);
  console.log(`Total fixtures: ${result.totalFixtures}`);
  console.log(`Profiles found: ${result.profilesFound.join(", ")}`);
  console.log(`Adversarial flags: ${result.adversarialFlagsFound.length} unique flags`);

  if (result.warnings.length > 0) {
    console.log(`\nWarnings (${result.warnings.length}):`);
    for (const w of result.warnings) {
      console.log(`  ⚠  ${w}`);
    }
  }

  if (result.errors.length > 0) {
    console.log(`\nErrors (${result.errors.length}):`);
    for (const e of result.errors) {
      console.log(`  ✗  ${e.file}: ${e.message}`);
    }
    process.exit(1);
  }

  console.log("\n✓ All fixtures valid.\n");
  process.exit(0);
}
