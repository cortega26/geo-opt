/**
 * Tests para descubrimiento de archivos y compilación de patrones ignore.
 *
 * Cubre:
 * - ** en .gitignore excluye en raíz y anidado (regresión principal)
 * - --ignore con doble asterisco no lanza excepción y excluye correctamente
 * - Comodines * y ? en patrones glob
 * - Patrón simple node_modules/ sin regresión
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

import { discoverFiles } from "../src/discovery.js";

/**
 * Helper: crea un árbol de archivos temporal a partir de un objeto.
 * Cada clave es una ruta relativa, cada valor es el contenido (string).
 * Los directorios se crean automáticamente.
 */
function createTree(baseDir, files) {
  for (const [relPath, content] of Object.entries(files)) {
    const fullPath = join(baseDir, relPath);
    mkdirSync(join(fullPath, ".."), { recursive: true });
    writeFileSync(fullPath, content, "utf8");
  }
}

/**
 * Helper: ejecuta discoverFiles y devuelve rutas relativas al cwd.
 */
function discoverRelative(inputPaths, options = {}) {
  const cwd = options.cwd;
  const results = discoverFiles(inputPaths, options);
  return results.map((abs) => relative(cwd, abs)).sort();
}

// ═══════════════════════════════════════════════════════════════════════════
// ** en .gitignore — regresión principal
// ═══════════════════════════════════════════════════════════════════════════

describe("discoverFiles — ** en .gitignore", () => {
  it("excluye node_modules en raíz y anidados con patrón **/node_modules/", () => {
    const tmp = mkdtempSync(join(tmpdir(), "geo-discovery-"));
    try {
      createTree(tmp, {
        "src/real.md": "# Real content",
        "node_modules/pkg/README.md": "# Vendored",
        "a/node_modules/b.md": "# Nested vendored",
      });
      writeFileSync(join(tmp, ".gitignore"), "**/node_modules/\n");

      const files = discoverRelative(["."], { recursive: true, cwd: tmp });

      assert.ok(files.includes("src/real.md"), "Debe incluir src/real.md");
      assert.ok(
        !files.some((f) => f.includes("node_modules")),
        "No debe incluir archivos bajo node_modules"
      );
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// --ignore con **/ no lanza excepción
// ═══════════════════════════════════════════════════════════════════════════

describe("discoverFiles — --ignore con **/", () => {
  it("no lanza SyntaxError y excluye archivos correctamente", () => {
    const tmp = mkdtempSync(join(tmpdir(), "geo-discovery-"));
    try {
      createTree(tmp, {
        "dist/bundle.md": "# Built",
        "keep.md": "# Keep me",
      });

      const files = discoverRelative(["."], {
        recursive: true,
        cwd: tmp,
        ignorePatterns: ["**/dist/"],
      });

      assert.ok(files.includes("keep.md"), "Debe incluir keep.md");
      assert.ok(!files.some((f) => f.includes("dist")), "No debe incluir archivos bajo dist/");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Comodines * y ?
// ═══════════════════════════════════════════════════════════════════════════

describe("discoverFiles — comodines * y ?", () => {
  it("excluye draft-?.md pero mantiene draft.md y draft-12.md", () => {
    const tmp = mkdtempSync(join(tmpdir(), "geo-discovery-"));
    try {
      createTree(tmp, {
        "draft.md": "# draft",
        "draft-1.md": "# draft v1",
        "draft-12.md": "# draft v12",
      });
      writeFileSync(join(tmp, ".gitignore"), "draft-?.md\n");

      const files = discoverRelative(["."], { recursive: true, cwd: tmp });

      assert.ok(files.includes("draft.md"), "draft.md sin guion debe permanecer");
      assert.ok(!files.includes("draft-1.md"), "draft-1.md (un dígito) debe excluirse");
      assert.ok(files.includes("draft-12.md"), "draft-12.md (dos dígitos) debe permanecer");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("*.log en .gitignore no interfiere con la colección de .md", () => {
    const tmp = mkdtempSync(join(tmpdir(), "geo-discovery-"));
    try {
      createTree(tmp, {
        "app.log": "error log",
        "readme.md": "# Readme",
        "debug.log": "debug log",
      });
      writeFileSync(join(tmp, ".gitignore"), "*.log\n");

      const files = discoverRelative(["."], { recursive: true, cwd: tmp });

      // discoverFiles solo recoge extensiones permitidas (.md, .html, .htm),
      // así que los .log no aparecerían de todos modos. Pero el patrón
      // *.log no debe romper la compilación ni la colección.
      assert.ok(files.includes("readme.md"), "Debe incluir readme.md");
      assert.equal(files.length, 1, "Solo debe haber un archivo .md");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Patrón simple — sin regresión
// ═══════════════════════════════════════════════════════════════════════════

describe("discoverFiles — patrón simple sin regresión", () => {
  it("node_modules/ excluye archivos bajo node_modules", () => {
    const tmp = mkdtempSync(join(tmpdir(), "geo-discovery-"));
    try {
      createTree(tmp, {
        "src/index.md": "# Index",
        "node_modules/foo/readme.md": "# Pkg readme",
      });
      writeFileSync(join(tmp, ".gitignore"), "node_modules/\n");

      const files = discoverRelative(["."], { recursive: true, cwd: tmp });

      assert.ok(files.includes("src/index.md"), "Debe incluir src/index.md");
      assert.ok(!files.some((f) => f.includes("node_modules")), "No debe incluir node_modules");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
