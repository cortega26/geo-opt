/**
 * Tests para los guards de directorio de salida (CWD write boundary).
 *
 * Cubre:
 * - validateOutputDirInsideCwd(".") → válido (directorio actual)
 * - validateOutputDirInsideCwd("geo-package") → válido (subdirectorio nuevo)
 * - validateOutputDirInsideCwd("/tmp/escape-...") → rechazado (fuera de CWD)
 * - validateOutputDirInsideCwd("../escape") → rechazado (escape hacia arriba)
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { validateOutputDirInsideCwd } from "../src/schema.js";

describe("validateOutputDirInsideCwd", () => {
  it("acepta el directorio actual (.)", () => {
    const result = validateOutputDirInsideCwd(".");
    assert.equal(result.valid, true);
  });

  it("acepta un subdirectorio nuevo bajo CWD (geo-package)", () => {
    const result = validateOutputDirInsideCwd("geo-package");
    assert.equal(result.valid, true);
  });

  it("rechaza una ruta absoluta fuera de CWD (/tmp/...)", () => {
    const result = validateOutputDirInsideCwd("/tmp/escape-" + Date.now());
    assert.equal(result.valid, false);
    assert.ok(result.error.includes("Security restriction"));
  });

  it("rechaza un escape relativo hacia arriba (../escape)", () => {
    const result = validateOutputDirInsideCwd("../escape");
    assert.equal(result.valid, false);
    assert.ok(result.error.includes("Security restriction"));
  });
});
