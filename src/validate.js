import fs from "fs";

// Required fields per Schema.org type as specified by Google's structured
// data guidelines. Types not listed here still pass basic structure checks.
const REQUIRED_FIELDS = {
  // Content types
  Article: ["headline"],
  NewsArticle: ["headline", "datePublished"],
  BlogPosting: ["headline"],
  TechArticle: ["headline"],
  DiscussionForumPosting: ["headline"],
  SocialMediaPosting: ["headline"],
  // Structured data containers
  FAQPage: ["mainEntity"],
  QAPage: ["mainEntity"],
  ItemList: ["itemListElement"],
  BreadcrumbList: ["itemListElement"],
  // Entities
  Organization: ["name"],
  Person: ["name"],
  Product: ["name"],
  Service: ["name"],
  ProfessionalService: ["name"],
  LocalBusiness: ["name"],
  Corporation: ["name"],
  EducationalOrganization: ["name"],
  // Web objects
  WebPage: ["name"],
  WebSite: ["name"],
  ImageObject: ["url"],
  VideoObject: ["name", "description"],
  SoftwareApplication: ["name", "applicationCategory"],
  // Contact/location
  PostalAddress: ["streetAddress"],
  ContactPoint: ["telephone"],
  // Pro types
  Course: ["name", "description"],
  Event: ["name", "startDate"],
  Recipe: ["name", "recipeIngredient", "recipeInstructions"],
  HowTo: ["name", "step"],
};

/**
 * Validate a parsed JSON-LD value. Pure function — no I/O, no process.exit.
 * Total over JSON values: null, primitives, and arrays return structured
 * errors instead of throwing.
 *
 * @param {unknown} parsed - already-parsed JSON-LD value
 * @returns {{ errors: string[], warnings: string[], notes: string[], nodes: object[] }}
 */
export function validateSchema(parsed) {
  const errors = [];
  const warnings = [];
  const notes = [];

  // Total over JSON values: nothing here may throw on arbitrary input.
  if (parsed === null || parsed === undefined) {
    errors.push("Root value is null/undefined — expected an object");
    return { errors, warnings, notes, nodes: [] };
  }
  if (typeof parsed !== "object") {
    errors.push(`Root value is a ${typeof parsed} — expected an object`);
    return { errors, warnings, notes, nodes: [] };
  }
  if (Array.isArray(parsed)) {
    errors.push("Root value is an array — expected an object");
    return { errors, warnings, notes, nodes: [] };
  }

  if (parsed["@context"] !== "https://schema.org") {
    errors.push(`@context should be "https://schema.org", got "${parsed["@context"]}"`);
  }

  const nodes = Array.isArray(parsed["@graph"]) ? parsed["@graph"] : [parsed].filter(Boolean);
  if (nodes.length === 0) {
    errors.push("No @graph array or root type found");
    return { errors, warnings, notes, nodes };
  }

  for (const node of nodes) {
    const rawType = node["@type"];
    if (!rawType) {
      errors.push("Node without @type found — all schema.org nodes require @type");
      continue;
    }

    // Split multi-value types like "Person,ProfessionalService" and check each
    const types = String(rawType)
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    for (const type of types) {
      const required = REQUIRED_FIELDS[type];
      if (required) {
        for (const field of required) {
          if (node[field] === undefined || node[field] === null || node[field] === "") {
            errors.push(`${type} is missing required field "${field}"`);
          }
        }
      } else {
        notes.push(
          `"${type}" is not in the known-types list (${Object.keys(REQUIRED_FIELDS).join(", ")})`
        );
      }
    }
  }

  return { errors, warnings, notes, nodes };
}

/**
 * Extract top-level balanced JSON values from a fence/script body. Walks the
 * string with brace-depth, string-literal and escape awareness so a value is
 * captured whole — never truncated at the first "}" — and multiple values in
 * one body split into separate blocks. Returns only values that begin with
 * "{" or "[". A body whose first non-whitespace character is anything else
 * yields nothing (the legacy extractor required the fence to start with "{").
 *
 * @param {string} body
 * @returns {string[]}
 */
function extractBalancedValues(body) {
  const values = [];
  let i = 0;
  let seenValue = false;
  while (i < body.length) {
    const ch = body[i];
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      i++;
      continue;
    }
    if (ch !== "{" && ch !== "[") {
      if (!seenValue) break; // non-JSON text first: legacy "no match" behavior
      i++;
      continue;
    }
    seenValue = true;
    let depth = 0;
    let inString = false;
    let escaped = false;
    const start = i;
    for (; i < body.length; i++) {
      const c = body[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (c === "\\") escaped = true;
        else if (c === '"') inString = false;
        continue;
      }
      if (c === '"') inString = true;
      else if (c === "{" || c === "[") depth++;
      else if (c === "}" || c === "]") {
        depth--;
        if (depth === 0) {
          i++;
          break;
        }
      }
    }
    values.push(body.slice(start, i));
  }
  return values;
}

/**
 * Validate every JSON-LD block in a file and return a structured result.
 * Human-readable diagnostics are printed to stdout; the caller (e.g. the CLI)
 * enforces `valid` for exit status. Operational failures (missing file,
 * unreadable file) still throw.
 *
 * @param {string} filepath
 * @returns {{
 *   valid: boolean,
 *   blockCount: number,
 *   errors: string[],
 *   warnings: string[],
 *   notes: string[],
 *   blocks: Array<{
 *     source: string,
 *     valid: boolean,
 *     errors: string[],
 *     warnings: string[],
 *     notes: string[]
 *   }>
 * }} — aggregated diagnostics; per-block records never contain source content.
 */
export function validateSchemaFile(filepath) {
  if (!fs.existsSync(filepath)) {
    throw new Error(`File ${filepath} not found.`);
  }

  let content;
  try {
    content = fs.readFileSync(filepath, { encoding: "utf8", flag: "r" });
  } catch (e) {
    throw new Error(`Failed to read file ${filepath}: ${e.message}`, { cause: e });
  }

  // Extract JSON-LD from markdown code fences or HTML script tags
  const blocks = [];
  const mdPattern = /```(?:jsonld|json-ld|json)\s*([\s\S]*?)\s*```/gi;
  const scriptPattern =
    /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  let match;
  while ((match = mdPattern.exec(content)) !== null) {
    for (const json of extractBalancedValues(match[1])) {
      // Match the legacy fence semantics: only values that carry a "@context"
      // member are treated as JSON-LD; other ```json fences are skipped.
      if (json.includes('"@context"')) {
        blocks.push({ source: "markdown code fence", json });
      }
    }
  }
  while ((match = scriptPattern.exec(content)) !== null) {
    blocks.push({ source: "HTML script tag", json: match[1] });
  }

  if (blocks.length === 0) {
    console.log("No JSON-LD blocks found in this file.");
    console.log(
      'Run "geo-opt schema <file> <type>" to create one, or "geo-opt inject <file> <type>" to add it to the file.'
    );
    return {
      valid: false,
      blockCount: 0,
      errors: ["No JSON-LD blocks found in this file."],
      warnings: [],
      notes: [],
      blocks: [],
    };
  }

  console.log(`Found ${blocks.length} JSON-LD block(s):\n`);

  const blockResults = [];
  const errors = [];
  const warnings = [];
  const notes = [];

  for (let i = 0; i < blocks.length; i++) {
    const { source, json } = blocks[i];
    console.log(`── Block ${i + 1} (${source}) ──`);

    let parsed;
    let blockErrors = [];
    let blockWarnings = [];
    let blockNotes = [];
    let nodes = [];

    try {
      parsed = JSON.parse(json);
    } catch (e) {
      blockErrors.push(`Invalid JSON: ${e.message}`);
      console.log(`  ❌ Invalid JSON: ${e.message}`);
      console.log();
      blockResults.push({
        source,
        valid: false,
        errors: blockErrors,
        warnings: blockWarnings,
        notes: blockNotes,
      });
      errors.push(...blockErrors);
      continue;
    }

    const result = validateSchema(parsed);
    blockErrors = result.errors;
    blockWarnings = result.warnings;
    blockNotes = result.notes;
    nodes = result.nodes;

    if (blockErrors.length === 0 && blockWarnings.length === 0) {
      console.log(`  ✅ Valid JSON-LD with ${nodes.length} node(s):`);
      for (const node of nodes) {
        const type = node["@type"] || "UnknownType";
        const label = node.headline || node.name || node["@id"] || "(unnamed)";
        console.log(`     • ${type}: ${label}`);
      }
    } else {
      if (blockErrors.length > 0) {
        console.log("  ❌ Errors:");
        for (const err of blockErrors) {
          console.log(`     • ${err}`);
        }
      }
      if (blockWarnings.length > 0) {
        console.log("  ⚠️  Warnings:");
        for (const w of blockWarnings) {
          console.log(`     • ${w}`);
        }
      }
    }

    if (blockNotes.length > 0) {
      console.log("  ℹ️  Notes:");
      for (const n of blockNotes) {
        console.log(`     • ${n}`);
      }
    }

    console.log();

    blockResults.push({
      source,
      valid: blockErrors.length === 0 && blockWarnings.length === 0,
      errors: blockErrors,
      warnings: blockWarnings,
      notes: blockNotes,
    });
    errors.push(...blockErrors);
    warnings.push(...blockWarnings);
    notes.push(...blockNotes);
  }

  // Unknown-type notes are informational and never invalidate the file.
  return {
    valid: errors.length === 0,
    blockCount: blocks.length,
    errors,
    warnings,
    notes,
    blocks: blockResults,
  };
}
