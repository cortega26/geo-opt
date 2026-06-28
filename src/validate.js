import fs from "fs";

// Required fields per Schema.org type as specified by Google's structured
// data guidelines. Types not listed here still pass basic structure checks.
const REQUIRED_FIELDS = {
  Article: ["headline"],
  NewsArticle: ["headline", "datePublished"],
  FAQPage: ["mainEntity"],
  Product: ["name"],
  Organization: ["name"],
  Person: ["name"],
  // Pro types
  Course: ["name", "description"],
  Event: ["name", "startDate"],
  Recipe: ["name", "recipeIngredient", "recipeInstructions"],
  HowTo: ["name", "step"],
};

/**
 * Validate a parsed JSON-LD object. Pure function — no I/O, no process.exit.
 *
 * @param {object} parsed - already-parsed JSON-LD object
 * @returns {{ errors: string[], warnings: string[], notes: string[], nodes: object[] }}
 */
export function validateSchema(parsed) {
  const errors = [];
  const warnings = [];
  const notes = [];

  if (parsed["@context"] !== "https://schema.org") {
    errors.push(`@context should be "https://schema.org", got "${parsed["@context"]}"`);
  }

  const nodes = Array.isArray(parsed["@graph"]) ? parsed["@graph"] : [parsed].filter(Boolean);
  if (nodes.length === 0) {
    errors.push("No @graph array or root type found");
    return { errors, warnings, notes, nodes };
  }

  for (const node of nodes) {
    const type = node["@type"];
    if (!type) {
      errors.push("Node without @type found — all schema.org nodes require @type");
      continue;
    }

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

  return { errors, warnings, notes, nodes };
}

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
  const mdPattern = /```json\s*(\{[\s\S]*?"@context"[\s\S]*?\})\s*```/g;
  const scriptPattern = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;

  let match;
  while ((match = mdPattern.exec(content)) !== null) {
    blocks.push({ source: "markdown code fence", json: match[1] });
  }
  while ((match = scriptPattern.exec(content)) !== null) {
    blocks.push({ source: "HTML script tag", json: match[1] });
  }

  if (blocks.length === 0) {
    console.log("No JSON-LD blocks found in this file.");
    console.log(
      'Run "geo-opt schema <file> <type>" to create one, or "geo-opt inject <file> <type>" to add it to the file.'
    );
    return;
  }

  console.log(`Found ${blocks.length} JSON-LD block(s):\n`);

  for (let i = 0; i < blocks.length; i++) {
    const { source, json } = blocks[i];
    console.log(`── Block ${i + 1} (${source}) ──`);

    let parsed;
    try {
      parsed = JSON.parse(json);
    } catch (e) {
      console.log(`  ❌ Invalid JSON: ${e.message}`);
      console.log();
      continue;
    }

    const { errors, warnings, notes, nodes } = validateSchema(parsed);

    if (errors.length === 0 && warnings.length === 0) {
      console.log(`  ✅ Valid JSON-LD with ${nodes.length} node(s):`);
      for (const node of nodes) {
        const type = node["@type"] || "UnknownType";
        const label = node.headline || node.name || node["@id"] || "(unnamed)";
        console.log(`     • ${type}: ${label}`);
      }
    } else {
      if (errors.length > 0) {
        console.log("  ❌ Errors:");
        for (const err of errors) {
          console.log(`     • ${err}`);
        }
      }
      if (warnings.length > 0) {
        console.log("  ⚠️  Warnings:");
        for (const w of warnings) {
          console.log(`     • ${w}`);
        }
      }
    }

    if (notes.length > 0) {
      console.log("  ℹ️  Notes:");
      for (const n of notes) {
        console.log(`     • ${n}`);
      }
    }

    console.log();
  }
}
