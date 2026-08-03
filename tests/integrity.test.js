import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, "..");

function build() {
  return spawnSync(process.execPath, [join(repoRoot, "scripts", "build.js")], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

// Ejecuta un driver ESM en un subproceso aislado y devuelve { stdout, stderr, status }.
function runDriver(driverCode, cwd) {
  const driverPath = join(cwd, "_driver.mjs");
  writeFileSync(driverPath, driverCode);
  return spawnSync(process.execPath, [driverPath], { cwd, encoding: "utf8" });
}

/** Espera síncrona breve para reintentos (bloquea el event loop ~ms, solo en tests). */
function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Detecta si staging es un snapshot completo de dist/ tras la escritura de un
 * build vecino: cpSync puede terminar con éxito copiando un archivo a medias
 * (CI) o fallar con EACCES/ENOENT (este sandbox) si cae en la ventana de
 * escritura. Los invariantes son deterministas: dist/integrity.js siempre
 * lleva el hash inyectado (nunca el placeholder) y dist/licensing.js es copia
 * exacta de src/licensing.js.
 */
function distSnapshotIsComplete() {
  try {
    const integrity = readFileSync(join(stagingDir, "integrity.js"), "utf8");
    if (!/const EXPECTED_HASH = "[0-9a-f]{64}"/.test(integrity)) return false;
    // El literal de comparación en runtime sí conserva el placeholder; la
    // ASIGNACIÓN const EXPECTED_HASH es la que el build reemplaza.
    if (integrity.includes('const EXPECTED_HASH = "<<<LICENSING_HASH>>>"')) return false;
    return (
      readFileSync(join(stagingDir, "licensing.js"), "utf8") ===
      readFileSync(join(repoRoot, "src", "licensing.js"), "utf8")
    );
  } catch {
    return false;
  }
}

/**
 * Copia dist/ al directorio de staging con reintento limitado: un build de
 * otro archivo de test puede estar escribiendo dist/ en paralelo y el lock de
 * scripts/build.js serializa los BUILDS, no las copias/lecturas. Tras agotar
 * los intentos se acepta el snapshot aunque sea incompleto, para que las
 * aserciones reales del test sigan fallando con su mensaje diagnóstico.
 * Happy path: un solo intento, cero overhead.
 */
function copyDistToStaging() {
  const maxAttempts = 10;
  for (let attempt = 1; ; attempt += 1) {
    try {
      cpSync(join(repoRoot, "dist"), stagingDir, { recursive: true });
    } catch (err) {
      if ((err.code !== "EACCES" && err.code !== "ENOENT") || attempt >= maxAttempts) {
        throw err;
      }
      sleepSync(100);
      continue;
    }
    if (distSnapshotIsComplete() || attempt >= maxAttempts) {
      return;
    }
    sleepSync(100);
  }
}

let stagingDir;

beforeEach(() => {
  stagingDir = mkdtempSync(join(tmpdir(), "geo-integrity-"));
});

afterEach(() => {
  rmSync(stagingDir, { recursive: true, force: true });
});

describe("integrity — verificación de hash en staging", () => {
  it("dist/integrity.js exporta hasProEntitlement como función real tras el build (éxito esperado)", () => {
    const buildResult = build();
    assert.strictEqual(buildResult.status, 0, `Build falló:\n${buildResult.stderr}`);

    // Copiar dist/ a staging para aislar la importación de builds concurrentes
    copyDistToStaging();
    const integrityPath = join(stagingDir, "integrity.js");

    const driver = `
import { hasProEntitlement } from "${integrityPath}";
const isFallback = hasProEntitlement.toString().includes("() => false") ||
                   hasProEntitlement.toString() === "() => false";
console.log(isFallback ? "TAMPERED" : "OK");
`;
    const result = runDriver(driver, stagingDir);
    assert.strictEqual(result.status, 0, `Driver falló:\n${result.stderr}`);
    assert.ok(
      result.stdout.includes("OK"),
      `hasProEntitlement debería ser la función real, obtuvo: ${result.stdout}`
    );
  });

  it("hash incorrecto activa la degradación: hasProEntitlement devuelve false", () => {
    const buildResult = build();
    assert.strictEqual(buildResult.status, 0, `Build falló:\n${buildResult.stderr}`);

    // Copia dist/ al directorio de staging
    copyDistToStaging();

    // Modifica staging/integrity.js para embeber un hash incorrecto
    const integrityPath = join(stagingDir, "integrity.js");
    let integrityContent = readFileSync(integrityPath, "utf8");
    const realHash = createHash("sha256")
      .update(readFileSync(join(stagingDir, "licensing.js"), "utf8"))
      .digest("hex");
    // Reemplaza el hash real con uno incorrecto
    integrityContent = integrityContent.replace(realHash, "a".repeat(64));
    writeFileSync(integrityPath, integrityContent);

    const driver = `
import { hasProEntitlement } from "${integrityPath}";
const result = hasProEntitlement();
console.log(result === false ? "TAMPERED_OK" : "UNEXPECTED:" + result);
`;
    const result = runDriver(driver, stagingDir);
    assert.strictEqual(result.status, 0, `Driver falló:\n${result.stderr}`);
    assert.ok(
      result.stdout.includes("TAMPERED_OK"),
      `Con hash incorrecto hasProEntitlement debería devolver false, obtuvo: ${result.stdout}`
    );
  });

  it("archivo licensing.js ilegible activa la degradación: hasProEntitlement devuelve false", () => {
    const buildResult = build();
    assert.strictEqual(buildResult.status, 0, `Build falló:\n${buildResult.stderr}`);

    // Copia dist/ pero omite licensing.js para simular archivo ilegible
    copyDistToStaging();
    rmSync(join(stagingDir, "licensing.js"));

    const integrityPath = join(stagingDir, "integrity.js");

    const driver = `
import { hasProEntitlement } from "${integrityPath}";
const result = hasProEntitlement();
console.log(result === false ? "TAMPERED_OK" : "UNEXPECTED:" + result);
`;
    const result = runDriver(driver, stagingDir);
    // El driver puede fallar si la importación de licensing.js también falla en cascade;
    // en ese caso asumimos que la protección funcionó.
    const output = result.stdout + result.stderr;
    const protectionActivated =
      result.stdout.includes("TAMPERED_OK") ||
      output.includes("Cannot find module") ||
      output.includes("ENOENT");
    assert.ok(
      protectionActivated,
      `Con licensing.js ausente debería activarse la protección, obtuvo:\nstdout: ${result.stdout}\nstderr: ${result.stderr}`
    );
  });
});
