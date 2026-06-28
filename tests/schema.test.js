/**
 * Tests para generación de JSON-LD schema.
 *
 * Cubre:
 * - Título desde filename para archivos sin H1 (consolidación extractPageMetadata)
 * - "Untitled Document" nunca aparece como título
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "path";

import { generateSchemaData } from "../src/index.js";

describe("generateSchemaData — title fallback", () => {
  it("usa el filename como título para archivos sin H1", () => {
    const content = "No heading here.\n\nJust body text.";
    const filepath = path.join(process.cwd(), "my-article.md");
    const result = generateSchemaData(filepath, "article", {}, content);
    // Title should come from the filename, not "Untitled Document"
    const node = Array.isArray(result["@graph"]) ? result["@graph"][0] : result;
    const title = node.headline || node.name;
    assert.ok(title === "my-article", `Expected "my-article", got "${title}"`);
  });

  it('nunca retorna "Untitled Document" como título', () => {
    const content = "No heading here.";
    const filepath = path.join(process.cwd(), "page.md");
    const result = generateSchemaData(filepath, "article", {}, content);
    const node = Array.isArray(result["@graph"]) ? result["@graph"][0] : result;
    const title = node.headline || node.name;
    assert.notStrictEqual(title, "Untitled Document");
  });
});
