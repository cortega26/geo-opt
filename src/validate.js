import fs from "fs";

// Required fields per Schema.org type as specified by Google's structured
// data guidelines. Types not listed here still pass basic structure checks.
const REQUIRED_FIELDS = {
  NewsArticle: ["headline", "datePublished"],
  FAQPage: ["mainEntity"],
  Product: ["name"],
  Organization: ["name"],
  Person: ["name"],
};

export function validateSchemaFile(filepath) {
  if (!fs.existsSync(filepath)) {
    console.error(`Error: File ${filepath} not found.`);
    process.exit(1);
  }

  let content;
  try {
    content = fs.readFileSync(filepath, { encoding: "utf8", flag: "r" });
  } catch (e) {
    console.error(`Error: Failed to read file ${filepath}: ${e.message}`);
    process.exit(1);
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

    // Basic structure checks
    const issues = [];

    if (parsed["@context"] !== "https://schema.org") {
      issues.push(`@context should be "https://schema.org", got "${parsed["@context"]}"`);
    }

    const graph = Array.isArray(parsed["@graph"]) ? parsed["@graph"] : [parsed].filter(Boolean);
    if (graph.length === 0) {
      issues.push("No @graph array or root type found");
    }

    for (const node of graph) {
      const type = node["@type"];
      if (!type) {
        issues.push("Node without @type found — all schema.org nodes require @type");
        continue;
      }

      const required = REQUIRED_FIELDS[type];
      if (required) {
        for (const field of required) {
          if (node[field] === undefined || node[field] === null || node[field] === "") {
            issues.push(`${type} is missing required field "${field}"`);
          }
        }
      } else {
        // Unknown type — not an error, just note it
        issues.push(
          `Note: "${type}" is not in the known-types list (${Object.keys(REQUIRED_FIELDS).join(", ")})`
        );
      }
    }

    if (issues.length === 0) {
      console.log(`  ✅ Valid JSON-LD with ${graph.length} node(s):`);
      for (const node of graph) {
        const type = node["@type"] || "UnknownType";
        const label = node.headline || node.name || node["@id"] || "(unnamed)";
        console.log(`     • ${type}: ${label}`);
      }
    } else {
      console.log("  ⚠️  Issues found:");
      for (const issue of issues) {
        console.log(`     • ${issue}`);
      }
    }
    console.log();
  }
}
