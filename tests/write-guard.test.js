/**
 * Tests para los guards de directorio de salida (CWD write boundary).
 *
 * Cubre:
 * - validateOutputDirInsideCwd(".") → válido (directorio actual)
 * - validateOutputDirInsideCwd("geo-package") → válido (subdirectorio nuevo)
 * - validateOutputDirInsideCwd("/tmp/escape-...") → rechazado (fuera de CWD)
 * - validateOutputDirInsideCwd("../escape") → rechazado (escape hacia arriba)
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import { validateOutputDirInsideCwd } from "../src/schema.js";
import { writeFileAtomic, copyFileAtomic } from "../src/safe-write.js";

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

// ═══════════════════════════════════════════════════════════════════════════
// writeFileAtomic / copyFileAtomic (Plan 083)
// ═══════════════════════════════════════════════════════════════════════════

describe("writeFileAtomic — boundary atómica symlink-safe", () => {
  let prevCwd;
  let workDir;
  let outsideDir;

  beforeEach(() => {
    prevCwd = process.cwd();
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), "geo-safe-"));
    outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "geo-outside-"));
    process.chdir(workDir);
  });

  afterEach(() => {
    process.chdir(prevCwd);
    fs.rmSync(workDir, { recursive: true, force: true });
    fs.rmSync(outsideDir, { recursive: true, force: true });
  });

  const tmpFiles = () =>
    fs
      .readdirSync(workDir, { withFileTypes: true })
      .filter((d) => d.isFile() && d.name.endsWith(".tmp"));

  it("escribe un archivo nuevo y no deja temporales", () => {
    writeFileAtomic("out.txt", "hola");
    assert.equal(fs.readFileSync(path.join(workDir, "out.txt"), "utf8"), "hola");
    assert.deepEqual(tmpFiles(), []);
  });

  it("reemplaza un archivo regular existente", () => {
    writeFileAtomic("out.txt", "v1");
    writeFileAtomic("out.txt", "v2");
    assert.equal(fs.readFileSync(path.join(workDir, "out.txt"), "utf8"), "v2");
    assert.deepEqual(tmpFiles(), []);
  });

  it("preserva el modo de un archivo existente", () => {
    writeFileAtomic("out.txt", "v1");
    fs.chmodSync(path.join(workDir, "out.txt"), 0o600);
    writeFileAtomic("out.txt", "v2");
    assert.equal(fs.statSync(path.join(workDir, "out.txt")).mode & 0o777, 0o600);
  });

  it("rechaza un destino cuyo directorio real queda fuera del CWD", () => {
    assert.throws(
      () => writeFileAtomic(path.join(outsideDir, "escaped.txt"), "x"),
      /Security restriction/
    );
    assert.equal(fs.existsSync(path.join(outsideDir, "escaped.txt")), false);
  });

  it("rechaza un padre symlink que apunta fuera del CWD", () => {
    const linkDir = path.join(workDir, "link-out");
    fs.symlinkSync(outsideDir, linkDir);
    const sentinel = path.join(outsideDir, "sentinel.txt");
    fs.writeFileSync(sentinel, "original");
    assert.throws(
      () => writeFileAtomic(path.join(linkDir, "escaped.txt"), "x"),
      /Security restriction/
    );
    assert.equal(fs.readFileSync(sentinel, "utf8"), "original");
    assert.equal(fs.existsSync(path.join(outsideDir, "escaped.txt")), false);
  });

  it("rechaza un destino final que ya es symlink y no toca el sentinel", () => {
    const sentinel = path.join(outsideDir, "sentinel.txt");
    fs.writeFileSync(sentinel, "original");
    fs.symlinkSync(sentinel, path.join(workDir, "out.txt"));
    assert.throws(() => writeFileAtomic("out.txt", "x"), /refusing to write through symlink/);
    assert.equal(fs.readFileSync(sentinel, "utf8"), "original");
  });

  it("rechaza un destino que es un directorio", () => {
    fs.mkdirSync(path.join(workDir, "adir"));
    assert.throws(() => writeFileAtomic("adir", "x"), /is a directory/);
  });

  it("escribe a través de un padre symlink que apunta dentro del CWD, en su destino real", () => {
    const realDir = path.join(workDir, "real-dir");
    fs.mkdirSync(realDir);
    const linkDir = path.join(workDir, "link-in");
    fs.symlinkSync(realDir, linkDir);
    writeFileAtomic(path.join(linkDir, "out.txt"), "hola");
    assert.equal(fs.readFileSync(path.join(realDir, "out.txt"), "utf8"), "hola");
    assert.equal(fs.readFileSync(path.join(linkDir, "out.txt"), "utf8"), "hola");
    const realDirTemps = fs.readdirSync(realDir).filter((n) => n.endsWith(".tmp"));
    assert.deepEqual(realDirTemps, []);
    assert.deepEqual(tmpFiles(), []);
  });

  it("no escapa si se recoloca el padre symlink entre validación y rename (audit 083)", () => {
    const realDir = path.join(workDir, "real-dir");
    fs.mkdirSync(realDir);
    const linkDir = path.join(workDir, "link-race");
    fs.symlinkSync(realDir, linkDir);
    const realRenameSync = fs.renameSync;
    let swapped = false;
    fs.renameSync = (from, to) => {
      if (!swapped) {
        swapped = true;
        fs.rmSync(linkDir);
        fs.symlinkSync(outsideDir, linkDir);
      }
      return realRenameSync.call(fs, from, to);
    };
    try {
      writeFileAtomic(path.join(linkDir, "escaped.txt"), "x");
    } finally {
      fs.renameSync = realRenameSync;
    }
    assert.equal(
      fs.existsSync(path.join(outsideDir, "escaped.txt")),
      false,
      "el rename nunca puede caer fuera del CWD"
    );
    assert.equal(fs.existsSync(path.join(realDir, "escaped.txt")), true);
    assert.deepEqual(tmpFiles(), []);
  });

  it("rechaza un directorio de destino inexistente con error claro y sin temporales", () => {
    assert.throws(
      () => writeFileAtomic(path.join(workDir, "no-such-dir", "out.txt"), "x"),
      /Output directory does not exist/
    );
    assert.equal(fs.existsSync(path.join(workDir, "no-such-dir")), false);
    assert.deepEqual(tmpFiles(), []);
  });

  it("sustituye un symlink que se cuela entre la comprobación y el rename (race)", () => {
    const sentinel = path.join(outsideDir, "sentinel.txt");
    fs.writeFileSync(sentinel, "original");
    const realRenameSync = fs.renameSync;
    let raced = false;
    fs.renameSync = (from, to) => {
      if (!raced) {
        raced = true;
        fs.symlinkSync(sentinel, to);
      }
      return realRenameSync.call(fs, from, to);
    };
    try {
      writeFileAtomic(path.join(workDir, "race.txt"), "nuevo");
    } finally {
      fs.renameSync = realRenameSync;
    }
    assert.equal(fs.readFileSync(sentinel, "utf8"), "original", "el sentinel nunca cambia");
    const finalStat = fs.lstatSync(path.join(workDir, "race.txt"));
    assert.equal(finalStat.isSymbolicLink(), false, "el rename sustituye el symlink, no lo sigue");
    assert.equal(fs.readFileSync(path.join(workDir, "race.txt"), "utf8"), "nuevo");
    assert.deepEqual(tmpFiles(), []);
  });

  it("limpia el temporal si el rename falla", () => {
    const realRenameSync = fs.renameSync;
    fs.renameSync = () => {
      throw new Error("rename exploded");
    };
    try {
      assert.throws(() => writeFileAtomic(path.join(workDir, "boom.txt"), "x"), /rename exploded/);
    } finally {
      fs.renameSync = realRenameSync;
    }
    assert.deepEqual(tmpFiles(), [], "no quedan temporales tras el fallo");
    assert.equal(fs.existsSync(path.join(workDir, "boom.txt")), false);
  });
});

describe("copyFileAtomic — copias/backups symlink-safe", () => {
  let prevCwd;
  let workDir;
  let outsideDir;

  beforeEach(() => {
    prevCwd = process.cwd();
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), "geo-copy-"));
    outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "geo-outside-copy-"));
    process.chdir(workDir);
  });

  afterEach(() => {
    process.chdir(prevCwd);
    fs.rmSync(workDir, { recursive: true, force: true });
    fs.rmSync(outsideDir, { recursive: true, force: true });
  });

  it("copia contenido y modo desde una fuente dentro del CWD", () => {
    fs.writeFileSync(path.join(workDir, "src.md"), "contenido");
    fs.chmodSync(path.join(workDir, "src.md"), 0o640);
    copyFileAtomic("src.md", "src.md.bak");
    assert.equal(fs.readFileSync(path.join(workDir, "src.md.bak"), "utf8"), "contenido");
    assert.equal(fs.statSync(path.join(workDir, "src.md.bak")).mode & 0o777, 0o640);
  });

  it("rechaza fuentes que resuelven fuera del CWD", () => {
    const outside = path.join(outsideDir, "src.md");
    fs.writeFileSync(outside, "x");
    assert.throws(() => copyFileAtomic(outside, "escaped.bak"), /Security restriction/);
  });

  it("rechaza un destino final symlink sin tocar el sentinel", () => {
    fs.writeFileSync(path.join(workDir, "src.md"), "contenido");
    const sentinel = path.join(outsideDir, "sentinel.txt");
    fs.writeFileSync(sentinel, "original");
    fs.symlinkSync(sentinel, path.join(workDir, "src.md.bak"));
    assert.throws(
      () => copyFileAtomic("src.md", "src.md.bak"),
      /refusing to write through symlink/
    );
    assert.equal(fs.readFileSync(sentinel, "utf8"), "original");
  });
});
