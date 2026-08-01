/**
 * Tests para src/llms-txt.js — generación de llms.txt y URLs de página.
 *
 * F-09: títulos/descripciones hostiles no deben poder cerrar el link markdown
 * e inyectar una URL arbitraria; los paths de página deben codificarse
 * (RFC 3986) — espacios y unicode no pueden salir crudos.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  generateLlmsTxt,
  generateLlmsFullTxt,
  generateLlmsFullTxtFiles,
  resolvePageUrl,
} from "../src/llms-txt.js";

// ═══════════════════════════════════════════════════════════════════════════════
// F-09 — escape de títulos y descripciones
// ═══════════════════════════════════════════════════════════════════════════════

describe("generateLlmsTxt — markdown escaping (F-09)", () => {
  it("llms-txt-escapes-hostile-titles", () => {
    const out = generateLlmsTxt(
      [{ title: "Fraud](https://evil.example)", url: "https://example.com/x" }],
      { siteTitle: "Site" }
    );
    // El cierre del link del atacante no debe aparecer crudo.
    assert.ok(!out.includes("](https://evil.example)"), "no raw link-close injection");
    // El título escapado sí está presente.
    assert.ok(out.includes("Fraud\\]"), "closing bracket escaped");
    assert.ok(out.includes("\\("), "opening paren escaped");
  });

  it("escapes descriptions too", () => {
    const out = generateLlmsTxt(
      [
        {
          title: "Safe",
          url: "https://example.com/safe",
          description: "see [more](https://evil.example) docs",
        },
      ],
      { siteTitle: "Site" }
    );
    assert.ok(!out.includes("](https://evil.example)"), "description link neutralized");
  });

  it("escapes section names", () => {
    const out = generateLlmsTxt(
      [{ title: "T", url: "https://example.com/t", section: "Pwn](https://evil.example)" }],
      { siteTitle: "Site" }
    );
    assert.ok(!out.includes("Pwn](https://evil.example)"), "section name link neutralized");
  });

  it("llms-full.txt escapes headings", () => {
    // generateLlmsFullTxt usa ## [title](url) en el cuerpo.
    const full = generateLlmsFullTxt(
      [
        {
          title: "Fraud](https://evil.example)",
          url: "https://example.com/x",
          content: "# Body\n",
        },
      ],
      { siteTitle: "Site" }
    );
    assert.ok(!full.includes("](https://evil.example)"), "full txt heading neutralized");
  });

  it("llms-full-txt-files escapes headings (real CLI path)", () => {
    // El CLI (--full, generate-all) usa generateLlmsFullTxtFiles, no
    // generateLlmsFullTxt — el path real del artefacto debe escapar igual.
    const files = generateLlmsFullTxtFiles(
      [
        {
          title: "Fraud](https://evil.example)",
          url: "https://example.com/x",
          content: "# Body\n",
        },
      ],
      { siteTitle: "Site" }
    );
    assert.equal(files.length, 1);
    assert.ok(
      !files[0].content.includes("](https://evil.example)"),
      "files variant neutralizes hostile titles"
    );
    assert.ok(files[0].content.includes("Fraud\\]"), "escaped title present");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// F-09 — codificación de URLs de página
// ═══════════════════════════════════════════════════════════════════════════════

describe("resolvePageUrl — URL encoding (F-09)", () => {
  it("encodes spaces and unicode in page paths", () => {
    const url = resolvePageUrl("/base/mi página con espacios.md", "/base", "https://example.com");
    assert.equal(url, "https://example.com/mi%20p%C3%A1gina%20con%20espacios/");
  });

  it("encodes hash and query characters in file names", () => {
    const url = resolvePageUrl("/base/a#b?c.md", "/base", "https://example.com");
    assert.ok(!url.includes("#"), "hash must be encoded");
    assert.ok(!url.includes("?"), "query must be encoded");
    assert.ok(url.includes("%23"), "hash encoded as %23");
    assert.ok(url.includes("%3F"), "query encoded as %3F");
  });

  it("keeps ASCII paths unchanged", () => {
    const url = resolvePageUrl("/base/about.md", "/base", "https://example.com");
    assert.equal(url, "https://example.com/about/");
  });
});

describe("escapeLinkText — internal brackets (review 2026-08-01)", () => {
  it("titles with '[' are escaped and do not inject links when parsed", async () => {
    const { marked } = await import("marked");
    const out = generateLlmsTxt(
      [{ title: "Fraud[x](https://evil.example)", url: "https://example.com/x" }],
      { siteTitle: "Site" }
    );
    // El corchete interno se escapa en el artefacto.
    assert.ok(out.includes("\\["), "internal bracket escaped");
    // Y un parser markdown real no produce el link inyectado.
    const tokens = marked.lexer(out);
    const hrefs = [];
    (function walk(t) {
      for (const tok of t) {
        if (tok.type === "link") hrefs.push(tok.href);
        if (tok.tokens) walk(tok.tokens);
        if (tok.items) walk(tok.items);
      }
    })(tokens);
    assert.ok(!hrefs.some((h) => h.includes("evil")), "no injected link in parsed output");
    assert.ok(hrefs.includes("https://example.com/x"), "the real URL survives");
  });
});
