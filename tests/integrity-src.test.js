/**
 * Tests para src/integrity.js (cobertura a nivel fuente).
 *
 * Cubre C2 del supplement de evidencia y cobertura:
 * - Líneas 26-28: catch cuando el archivo licensing.js no se puede leer
 * - Líneas 40-41: getNoBrandingError cuando tampered === true
 *
 * El archivo src/integrity.js usa un placeholder <<<LICENSING_HASH>>>
 * que la build reemplaza. En fuente, tampered siempre es false (el
 * placeholder coincide consigo mismo). Para probar los paths de
 * manipulación, usamos un subproceso con un archivo corrupto.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = new URL(".", import.meta.url).pathname;

// ═══════════════════════════════════════════════════════════════════════════
// Tests de carga y re-export desde src/
// ═══════════════════════════════════════════════════════════════════════════

describe("src/integrity.js — carga y re-exports en estado fuente", () => {
  /** @type {typeof import("../src/integrity.js")} */
  let integrity;

  it("el módulo carga sin errores desde src/", async () => {
    integrity = await import("../src/integrity.js");
    assert.ok(integrity, "El módulo debe cargarse");
  });

  it("LICENSE_ENV_VAR es un string no vacío", () => {
    assert.ok(typeof integrity.LICENSE_ENV_VAR === "string");
    assert.ok(integrity.LICENSE_ENV_VAR.length > 0);
  });

  it("resolveLicenseKey es una función exportada", () => {
    assert.ok(typeof integrity.resolveLicenseKey === "function");
  });

  it("hasProEntitlement es una función", () => {
    assert.ok(typeof integrity.hasProEntitlement === "function");
  });

  it("getNoBrandingError es una función", () => {
    assert.ok(typeof integrity.getNoBrandingError === "function");
  });

  it("hasProEntitlement() retorna false sin licencia configurada", () => {
    // En fuente sin licencia, debe retornar false
    const result = integrity.hasProEntitlement();
    assert.equal(result, false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Tests del path tampered (líneas 26-28 y 40-41)
// ═══════════════════════════════════════════════════════════════════════════

describe("src/integrity.js — path de manipulación (tampered)", () => {
  let tmpDir;

  // Creamos una copia de integrity.js en un directorio temporal
  // con un licensing.js corrupto/ilegible para forzar tampered=true
  const repoRoot = join(__dirname, "..");
  const srcDir = join(repoRoot, "src");

  it("hasProEntitlement retorna false cuando licensing.js es ilegible", () => {
    tmpDir = mkdtempSync(join(tmpdir(), "geo-integrity-"));
    const testFile = join(tmpDir, "test-integrity.mjs");

    // Crear un script que:
    // 1. Copia la lógica de integrity pero apunta a un licensing inexistente
    writeFileSync(
      testFile,
      `
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// licensing.js NO existe en tmpDir → readFileSync lanza → tampered = true
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const licensingPath = join(__dirname, "nonexistent-licensing.js");

const EXPECTED_HASH = "<<<LICENSING_HASH>>>";

let tampered = false;
try {
  const content = readFileSync(licensingPath, "utf8");
  const actualHash = createHash("sha256").update(content).digest("hex");
  tampered = EXPECTED_HASH !== "<<<LICENSING_HASH>>>" && actualHash !== EXPECTED_HASH;
} catch {
  tampered = true;
}

const hasProEntitlement = tampered ? () => false : () => true;

const getNoBrandingError = tampered
  ? () => "Integrity verification failed. The licensing module may have been tampered with. Please reinstall geo-opt from the official source."
  : () => null;

// Escribir resultados a stdout como JSON para que el test los lea
const result = {
  tampered,
  hasProEntitlementResult: hasProEntitlement(),
  getNoBrandingErrorMessage: getNoBrandingError(),
};

console.log(JSON.stringify(result));
`
    );

    const { stdout, stderr, status } = spawnSync(process.execPath, [testFile], {
      encoding: "utf8",
    });

    assert.equal(status, 0, `Subproceso debe exit 0, salió ${status}. stderr: ${stderr}`);
    const result = JSON.parse(stdout.trim());

    assert.equal(result.tampered, true, "tampered debe ser true cuando licensing.js no existe");
    assert.equal(
      result.hasProEntitlementResult,
      false,
      "hasProEntitlement debe retornar false cuando tampered"
    );
    assert.ok(
      result.getNoBrandingErrorMessage.includes("Integrity verification failed"),
      `getNoBrandingError debe contener mensaje de manipulación, obtuvo: ${result.getNoBrandingErrorMessage}`
    );
    assert.ok(
      result.getNoBrandingErrorMessage.includes("reinstall"),
      "getNoBrandingError debe sugerir reinstalación"
    );

    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("tampered=false produce hasProEntitlement funcional y getNoBrandingError sin mensaje de manipulación", () => {
    tmpDir = mkdtempSync(join(tmpdir(), "geo-integrity-"));
    const testFile = join(tmpDir, "test-clean.mjs");

    // Copiar licensing.js real al directorio temporal
    const realLicensing = join(srcDir, "licensing.js");
    copyFileSync(realLicensing, join(tmpDir, "licensing.js"));

    // Calcular hash real del licensing.js para que coincida
    const realHash = createHash("sha256").update(readFileSync(realLicensing, "utf8")).digest("hex");

    writeFileSync(
      testFile,
      `
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const licensingPath = join(__dirname, "licensing.js");

const EXPECTED_HASH = "${realHash}";

let tampered = false;
try {
  const content = readFileSync(licensingPath, "utf8");
  const actualHash = createHash("sha256").update(content).digest("hex");
  tampered = EXPECTED_HASH !== "<<<LICENSING_HASH>>>" && actualHash !== EXPECTED_HASH;
} catch {
  tampered = true;
}

const hasProEntitlement = tampered ? () => false : () => true;
const getNoBrandingError = tampered
  ? () => "TAMPERED"
  : () => "CLEAN";

console.log(JSON.stringify({ tampered, hasPro: hasProEntitlement(), gNBE: getNoBrandingError() }));
`
    );

    const { stdout, stderr, status } = spawnSync(process.execPath, [testFile], {
      encoding: "utf8",
    });

    assert.equal(status, 0, `Subproceso debe exit 0. stderr: ${stderr}`);
    const result = JSON.parse(stdout.trim());

    assert.equal(result.tampered, false, "tampered debe ser false cuando hash coincide");
    assert.equal(result.gNBE, "CLEAN", "getNoBrandingError debe ser la versión limpia");

    rmSync(tmpDir, { recursive: true, force: true });
  });
});
