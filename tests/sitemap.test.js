/**
 * Tests para generación de sitemap.xml.
 *
 * Cubre:
 * - Estructura XML válida conforme a sitemap.org
 * - scoreToPriority: mapeo correcto de score → prioridad
 * - determineChangefreq: frecuencia según frescura
 * - generateSitemapXml: URL set básico, prioridades, lastmod
 * - generateSitemapFiles: splitting en índice para sitios grandes
 * - Edge cases: sin entradas, URLs relativas, fechas inválidas
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, unlinkSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  generateSitemapXml,
  generateSitemapFiles,
  scoreToPriority,
  determineChangefreq,
  validateSitemapXml,
} from "../src/sitemap.js";

// ═══════════════════════════════════════════════════════════════════════════
// scoreToPriority
// ═══════════════════════════════════════════════════════════════════════════

describe("scoreToPriority", () => {
  it("mapea score ≥80 a 1.0", () => {
    assert.equal(scoreToPriority(80), 1.0);
    assert.equal(scoreToPriority(95), 1.0);
    assert.equal(scoreToPriority(100), 1.0);
  });

  it("mapea score 60–79 a 0.8", () => {
    assert.equal(scoreToPriority(60), 0.8);
    assert.equal(scoreToPriority(70), 0.8);
    assert.equal(scoreToPriority(79), 0.8);
  });

  it("mapea score 40–59 a 0.5", () => {
    assert.equal(scoreToPriority(40), 0.5);
    assert.equal(scoreToPriority(50), 0.5);
    assert.equal(scoreToPriority(59), 0.5);
  });

  it("mapea score 20–39 a 0.3", () => {
    assert.equal(scoreToPriority(20), 0.3);
    assert.equal(scoreToPriority(30), 0.3);
    assert.equal(scoreToPriority(39), 0.3);
  });

  it("mapea score <20 a 0.1", () => {
    assert.equal(scoreToPriority(0), 0.1);
    assert.equal(scoreToPriority(10), 0.1);
    assert.equal(scoreToPriority(19), 0.1);
  });

  it("retorna 0.5 para valores no numéricos o NaN", () => {
    assert.equal(scoreToPriority(undefined), 0.5);
    assert.equal(scoreToPriority(null), 0.5);
    assert.equal(scoreToPriority(NaN), 0.5);
    assert.equal(scoreToPriority("abc"), 0.5);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// determineChangefreq
// ═══════════════════════════════════════════════════════════════════════════

describe("determineChangefreq", () => {
  it("retorna 'daily' para contenido de la última semana", () => {
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const result = determineChangefreq({ publishedDate: yesterday });
    assert.equal(result, "daily");
  });

  it("retorna 'weekly' para contenido del último mes", () => {
    const threeWeeksAgo = new Date(Date.now() - 21 * 86_400_000).toISOString().slice(0, 10);
    const result = determineChangefreq({ publishedDate: threeWeeksAgo });
    assert.equal(result, "weekly");
  });

  it("retorna 'monthly' para contenido de los últimos 6 meses", () => {
    const threeMonthsAgo = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
    const result = determineChangefreq({ publishedDate: threeMonthsAgo });
    assert.equal(result, "monthly");
  });

  it("retorna 'yearly' para contenido antiguo", () => {
    const result = determineChangefreq({ publishedDate: "2024-01-01" });
    assert.equal(result, "yearly");
  });

  it("usa reviewedDate sobre publishedDate cuando ambas existen", () => {
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const result = determineChangefreq({
      publishedDate: "2024-01-01",
      reviewedDate: yesterday,
    });
    assert.equal(result, "daily");
  });

  it("retorna 'monthly' sin información de fecha", () => {
    assert.equal(determineChangefreq({}), "monthly");
    assert.equal(determineChangefreq(), "monthly");
    assert.equal(determineChangefreq({ publishedDate: null }), "monthly");
  });

  it("maneja fechas inválidas con gracia", () => {
    assert.equal(determineChangefreq({ publishedDate: "not-a-date" }), "monthly");
  });

  it("usa filePath como fallback para mtime", () => {
    const tmp = mkdtempSync(join(tmpdir(), "geo-sitemap-"));
    const fp = join(tmp, "recent.md");
    writeFileSync(fp, "# test");
    try {
      // Archivo recién creado → daily
      const result = determineChangefreq({ filePath: fp });
      assert.equal(result, "daily");
    } finally {
      unlinkSync(fp);
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// generateSitemapXml
// ═══════════════════════════════════════════════════════════════════════════

describe("generateSitemapXml", () => {
  it("genera XML válido con declaración y namespace", () => {
    const xml = generateSitemapXml([{ url: "https://example.com/", score: 90 }]);
    assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
    assert.ok(xml.includes('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"'));
    assert.ok(xml.includes("<urlset"));
    assert.ok(xml.includes("</urlset>"));
  });

  it("incluye <loc>, <changefreq> y <priority> para cada entrada", () => {
    const xml = generateSitemapXml([
      { url: "https://example.com/page1", score: 75 },
      { url: "https://example.com/page2", score: 45 },
    ]);
    assert.ok(xml.includes("<loc>https://example.com/page1</loc>"));
    assert.ok(xml.includes("<loc>https://example.com/page2</loc>"));
    assert.ok(xml.includes("<changefreq>monthly</changefreq>"));
    assert.ok(xml.includes("<priority>0.8</priority>"));
    assert.ok(xml.includes("<priority>0.5</priority>"));
  });

  it("incluye <lastmod> cuando la fecha está disponible", () => {
    const xml = generateSitemapXml([
      { url: "https://example.com/", lastmod: "2026-06-15", score: 80 },
    ]);
    assert.ok(xml.includes("<lastmod>2026-06-15</lastmod>"));
  });

  it("omite <lastmod> cuando no hay fecha", () => {
    const xml = generateSitemapXml([{ url: "https://example.com/", score: 80 }]);
    assert.equal(xml.includes("<lastmod>"), false);
  });

  it("escapa caracteres XML especiales en URLs", () => {
    const xml = generateSitemapXml([{ url: "https://example.com/?a=1&b=<2>", score: 50 }]);
    assert.ok(xml.includes("&amp;"));
    assert.ok(xml.includes("&lt;"));
    assert.ok(xml.includes("&gt;"));
    // La URL original no debería aparecer sin escapar
    assert.equal(xml.includes("<2>"), false);
  });

  it("devuelve urlset vacío para array de entradas vacío", () => {
    const xml = generateSitemapXml([]);
    assert.ok(xml.includes("<urlset"));
    assert.ok(xml.includes("</urlset>"));
    assert.equal(xml.includes("<url>"), false);
  });

  it("resuelve URLs relativas con baseUrl", () => {
    const xml = generateSitemapXml([{ url: "/about", score: 60 }], {
      baseUrl: "https://example.com",
    });
    assert.ok(xml.includes("<loc>https://example.com/about</loc>"));
  });

  it("no duplica baseUrl cuando la URL ya es absoluta", () => {
    const xml = generateSitemapXml([{ url: "https://example.com/about", score: 60 }], {
      baseUrl: "https://example.com",
    });
    assert.ok(xml.includes("<loc>https://example.com/about</loc>"));
  });

  it("genera sitemap index cuando hay >50k entradas", () => {
    // Simular con el umbral reducido — probamos con generateSitemapFiles
    // que usa el mismo límite de 50k. Para una prueba unitaria rápida,
    // verificamos que con pocas entradas NO genera índice.
    const entries = Array.from({ length: 10 }, (_, i) => ({
      url: `https://example.com/page-${i}`,
      score: 50,
    }));
    const xml = generateSitemapXml(entries);
    assert.ok(xml.includes("<urlset"), "Pocas entradas deben usar urlset, no índice");
    assert.equal(xml.includes("<sitemapindex>"), false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// generateSitemapFiles
// ═══════════════════════════════════════════════════════════════════════════

describe("generateSitemapFiles", () => {
  it("retorna un solo archivo sitemap.xml para sitios pequeños", () => {
    const entries = [
      { url: "https://example.com/", score: 80 },
      { url: "https://example.com/about", score: 60 },
    ];
    const files = generateSitemapFiles(entries);
    assert.equal(files.length, 1);
    assert.equal(files[0].name, "sitemap.xml");
    assert.ok(files[0].content.includes("<urlset"));
  });

  it("cada archivo retornado tiene name y content strings", () => {
    const files = generateSitemapFiles([{ url: "https://example.com/", score: 50 }]);
    for (const f of files) {
      assert.ok(typeof f.name === "string" && f.name.length > 0);
      assert.ok(typeof f.content === "string" && f.content.length > 0);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Integración: prioridades desde scores reales
// ═══════════════════════════════════════════════════════════════════════════

describe("sitemap — integración de prioridades con scoring", () => {
  it("un sitio con contenido de alta calidad tiene prioridades altas", () => {
    const entries = [
      { url: "https://example.com/", score: 92 },
      { url: "https://example.com/guide", score: 85 },
      { url: "https://example.com/reference", score: 78 },
    ];
    const xml = generateSitemapXml(entries);
    assert.ok(xml.includes("<priority>1.0</priority>"));
    assert.ok(xml.includes("<priority>0.8</priority>"));
  });

  it("un sitio con contenido pobre tiene prioridades bajas", () => {
    const entries = [
      { url: "https://example.com/thin", score: 25 },
      { url: "https://example.com/empty", score: 10 },
    ];
    const xml = generateSitemapXml(entries);
    assert.ok(xml.includes("<priority>0.3</priority>"));
    assert.ok(xml.includes("<priority>0.1</priority>"));
  });

  it("entradas sin score obtienen prioridad 0.5 (default)", () => {
    const xml = generateSitemapXml([{ url: "https://example.com/unknown" }]);
    assert.ok(xml.includes("<priority>0.5</priority>"));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// generateSitemapFiles — splitting para sitios grandes (>50k URLs)
// ═══════════════════════════════════════════════════════════════════════════

describe("generateSitemapFiles split", () => {
  it("genera sitemap index + archivos divididos para >50k URLs", () => {
    const entries = Array.from({ length: 51000 }, (_, i) => ({
      url: "/p" + i,
      score: 50,
    }));
    const files = generateSitemapFiles(entries, {
      baseUrl: "https://example.com",
    });

    assert.equal(files[0].name, "sitemap.xml");
    assert.ok(files[0].content.includes("<sitemapindex"), "El índice debe contener sitemapindex");

    // 51000 / 50000 = 1.02 → 2 chunks
    const splitFiles = files.filter((f) => f.name !== "sitemap.xml");
    assert.equal(splitFiles.length, 2, "Debe haber 2 archivos divididos");
    assert.ok(
      splitFiles.some((f) => f.name === "sitemap-1.xml"),
      "Debe existir sitemap-1.xml"
    );
    assert.ok(
      splitFiles.some((f) => f.name === "sitemap-2.xml"),
      "Debe existir sitemap-2.xml"
    );

    for (const f of splitFiles) {
      assert.ok(f.content.includes("<urlset"), "Cada split debe contener urlset");
    }
  });

  it("generateSitemapXml retorna sitemapindex para >50k entradas", () => {
    const entries = Array.from({ length: 51000 }, (_, i) => ({
      url: "/p" + i,
      score: 50,
    }));
    const xml = generateSitemapXml(entries, { baseUrl: "https://example.com" });
    assert.ok(xml.includes("<sitemapindex"), "Debe usar sitemapindex para >50k");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// validateSitemapXml
// ═══════════════════════════════════════════════════════════════════════════

describe("validateSitemapXml", () => {
  it("valida un sitemap URL set correcto", () => {
    const xml = generateSitemapXml([{ url: "/a", score: 80 }], {
      baseUrl: "https://example.com",
    });
    const result = validateSitemapXml(xml);
    assert.equal(result.valid, true);
    assert.equal(result.issues.length, 0);
  });

  it("rechaza protocolo inválido en <loc>", () => {
    const xml =
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      "<url><loc>ftp://example.com/x</loc></url>\n" +
      "</urlset>";
    const result = validateSitemapXml(xml);
    assert.equal(result.valid, false);
    assert.ok(
      result.issues.some((i) => i.toLowerCase().includes("protocol")),
      `Expected protocol issue, got: ${result.issues.join(", ")}`
    );
  });

  it("rechaza changefreq inválido", () => {
    const xml =
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      "<url><loc>https://example.com/</loc><changefreq>often</changefreq></url>\n" +
      "</urlset>";
    const result = validateSitemapXml(xml);
    assert.equal(result.valid, false);
    assert.ok(
      result.issues.some((i) => i.toLowerCase().includes("changefreq")),
      `Expected changefreq issue, got: ${result.issues.join(", ")}`
    );
  });

  it("rechaza priority fuera de rango", () => {
    const xml =
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      "<url><loc>https://example.com/</loc><priority>2.0</priority></url>\n" +
      "</urlset>";
    const result = validateSitemapXml(xml);
    assert.equal(result.valid, false);
    assert.ok(
      result.issues.some((i) => i.toLowerCase().includes("priority")),
      `Expected priority issue, got: ${result.issues.join(", ")}`
    );
  });

  it("rechaza lastmod inválido", () => {
    const xml =
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      "<url><loc>https://example.com/</loc><lastmod>not-a-date</lastmod></url>\n" +
      "</urlset>";
    const result = validateSitemapXml(xml);
    assert.equal(result.valid, false);
    assert.ok(
      result.issues.some((i) => i.toLowerCase().includes("lastmod")),
      `Expected lastmod issue, got: ${result.issues.join(", ")}`
    );
  });

  it("rechaza namespace faltante", () => {
    const xml =
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      "<urlset>\n" +
      "<url><loc>https://example.com/</loc></url>\n" +
      "</urlset>";
    const result = validateSitemapXml(xml);
    assert.equal(result.valid, false);
    assert.ok(
      result.issues.some((i) => i.toLowerCase().includes("namespace")),
      `Expected namespace issue, got: ${result.issues.join(", ")}`
    );
  });
});
