import { describe, it } from "node:test";
import assert from "node:assert";
import { spawnSync, execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, "..");

function build() {
  return spawnSync(process.execPath, [path.join(repoRoot, "scripts", "build.js")], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

function readSrc(name) {
  return readFileSync(path.join(repoRoot, "src", name), "utf8");
}

function readDist(name) {
  return readFileSync(path.join(repoRoot, "dist", name), "utf8");
}

// Los tests se agrupan en describe porque sus subtests son secuenciales por defecto,
// lo que evita la race condition en dist/ cuando Node 22+ ejecuta top-level tests en paralelo.
describe("artifact invariants", () => {
  it("build exits 0 and produces dist/", () => {
    const result = build();
    assert.strictEqual(result.status, 0, `Build falló:\n${result.stderr}`);
    assert.ok(existsSync(path.join(repoRoot, "dist")), "dist/ no existe tras el build");
  });

  it("build no modifica src/licensing.js ni src/integrity.js", () => {
    const licenseBefore = readSrc("licensing.js");
    const integrityBefore = readSrc("integrity.js");

    const result = build();
    assert.strictEqual(result.status, 0, `Build falló:\n${result.stderr}`);

    assert.strictEqual(readSrc("licensing.js"), licenseBefore, "src/licensing.js fue modificado");
    assert.strictEqual(readSrc("integrity.js"), integrityBefore, "src/integrity.js fue modificado");
  });

  it("build es determinista: dos ejecuciones producen dist/integrity.js idéntico", () => {
    build();
    const integrity1 = readDist("integrity.js");

    build();
    const integrity2 = readDist("integrity.js");

    assert.strictEqual(
      integrity1,
      integrity2,
      "dist/integrity.js difiere entre builds consecutivos"
    );
  });

  // La ventana exacta de la race (un build vecino copiando el placeholder
  // sobre el hash recién escrito mientras otro build corre) no es
  // reproducible de forma determinista en un test — depende del interleaving
  // de node --test. El invariante que el fix de scripts/build.js garantiza
  // por construcción es este: la asignación de EXPECTED_HASH en dist es
  // SIEMPRE el hash inyectado, nunca el placeholder del template (el
  // cpSync excluye src/integrity.js; el paso 5 escribe la versión con hash).
  it("dist/integrity.js nunca expone el placeholder en la asignación", () => {
    build();
    const integrity = readDist("integrity.js");
    assert.match(
      integrity,
      /const EXPECTED_HASH = "[0-9a-f]{64}"/,
      "la asignación de EXPECTED_HASH en dist es el hash SHA-256 inyectado"
    );
    assert.ok(
      !integrity.includes('const EXPECTED_HASH = "<<<LICENSING_HASH>>>"'),
      "el template placeholder no se filtra a dist/"
    );
  });

  it("dist/licensing.js es copia exacta de src/licensing.js (sin ofuscación)", () => {
    build();
    assert.strictEqual(
      readDist("licensing.js"),
      readSrc("licensing.js"),
      "dist/licensing.js difiere de src/licensing.js"
    );
  });

  it("dist/integrity.js contiene el hash SHA256 real, no el placeholder", () => {
    build();
    const integrityContent = readDist("integrity.js");
    // La asignación debe tener el hash real. La comparación de runtime
    // EXPECTED_HASH !== "<<<LICENSING_HASH>>>" permanece como literal — solo
    // se reemplaza la primera ocurrencia (la asignación const).
    assert.ok(
      !integrityContent.includes('const EXPECTED_HASH = "<<<LICENSING_HASH>>>"'),
      "El placeholder de asignación no fue reemplazado en dist/integrity.js"
    );
    const expected = sha256(readDist("licensing.js"));
    assert.ok(
      integrityContent.includes(expected),
      "El hash embebido en dist/integrity.js no coincide con dist/licensing.js"
    );
  });

  it("builds concurrentes sobre dist/ terminan íntegros", async () => {
    // Dos builds simultáneos sobre el mismo dist/ (execFile con Promise.all:
    // spawnSync los serializaría en el mismo proceso y no ejercitaría la
    // carrera). El lock exclusivo de scripts/build.js los serializa; sin él,
    // un build vecino puede pisar artefactos a medio escribir (EACCES,
    // licensing.js a medias, placeholder sobre el hash).
    const buildScript = path.join(repoRoot, "scripts", "build.js");
    await Promise.all([
      execFileAsync(process.execPath, [buildScript], { cwd: repoRoot, encoding: "utf8" }),
      execFileAsync(process.execPath, [buildScript], { cwd: repoRoot, encoding: "utf8" }),
    ]);
    // execFile promisificado rechaza si algún build sale con status != 0:
    // ambos terminaron íntegros.

    const integrity = readDist("integrity.js");
    assert.match(
      integrity,
      /const EXPECTED_HASH = "[0-9a-f]{64}"/,
      "la asignación de EXPECTED_HASH en dist es el hash SHA-256 inyectado"
    );
    assert.ok(
      !integrity.includes('const EXPECTED_HASH = "<<<LICENSING_HASH>>>"'),
      "el template placeholder no se filtró a dist/ tras builds concurrentes"
    );
    // El hash embebido debe ser el SHA256 real de dist/licensing.js, que a su
    // vez debe ser legible y copia exacta de src/licensing.js.
    const expected = sha256(readDist("licensing.js"));
    assert.ok(
      integrity.includes(expected),
      "El hash embebido en dist/integrity.js no coincide con dist/licensing.js"
    );
    assert.strictEqual(
      readDist("licensing.js"),
      readSrc("licensing.js"),
      "dist/licensing.js difiere de src/licensing.js tras builds concurrentes"
    );
  });

  it("dist/bin/cli.js no importa de '../src/' (rutas parcheadas)", () => {
    build();
    const cliContent = readDist("bin/cli.js");
    assert.ok(
      !cliContent.includes('"../src/'),
      'dist/bin/cli.js contiene import con "../src/" sin parchear'
    );
    assert.ok(
      !cliContent.includes("'../src/"),
      "dist/bin/cli.js contiene import con '../src/' sin parchear"
    );
  });

  it("CLI help ejecuta correctamente desde dist/bin/cli.js", () => {
    build();
    const result = spawnSync(
      process.execPath,
      [path.join(repoRoot, "dist", "bin", "cli.js"), "--help"],
      { cwd: repoRoot, encoding: "utf8" }
    );
    assert.strictEqual(result.status, 0, `CLI help falló:\n${result.stderr}`);
    assert.ok(result.stdout.includes("geo-opt"), "La ayuda del CLI no menciona 'geo-opt'");
  });

  it("CLI version coincide con package.json desde bin/ y dist/bin/", () => {
    build();
    const expectedVersion = JSON.parse(
      readFileSync(path.join(repoRoot, "package.json"), "utf8")
    ).version;

    for (const cliPath of [
      path.join(repoRoot, "bin", "cli.js"),
      path.join(repoRoot, "dist", "bin", "cli.js"),
    ]) {
      const result = spawnSync(process.execPath, [cliPath, "--version"], {
        cwd: repoRoot,
        encoding: "utf8",
      });
      assert.strictEqual(result.status, 0, `CLI version falló desde ${cliPath}:\n${result.stderr}`);
      assert.strictEqual(result.stdout.trim(), expectedVersion);
    }
  });

  it("dist/index.js exporta los símbolos principales de la librería", async () => {
    build();
    const distIndex = path.join(repoRoot, "dist", "index.js");
    const mod = await import(`${distIndex}?t=${Date.now()}`);
    assert.strictEqual(
      typeof mod.auditFile,
      "function",
      "auditFile no se exporta desde dist/index.js"
    );
    assert.strictEqual(
      typeof mod.loadConfig,
      "function",
      "loadConfig no se exporta desde dist/index.js"
    );
    assert.strictEqual(
      typeof mod.hasProEntitlement,
      "function",
      "hasProEntitlement no se exporta desde dist/index.js"
    );
    assert.ok(
      typeof mod.REPORT_VERSION === "string",
      "REPORT_VERSION no se exporta desde dist/index.js"
    );
  });
});
