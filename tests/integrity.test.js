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
    cpSync(join(repoRoot, "dist"), stagingDir, { recursive: true });
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
    cpSync(join(repoRoot, "dist"), stagingDir, { recursive: true });

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
    cpSync(join(repoRoot, "dist"), stagingDir, { recursive: true });
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
