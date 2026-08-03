#!/usr/bin/env node
import { createHash } from "node:crypto";
import {
  closeSync,
  cpSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

const SRC_DIR = "src";
const BIN_DIR = "bin";
const DIST_DIR = "dist";
const PLACEHOLDER = "<<<LICENSING_HASH>>>";

// Lock exclusivo de build: node --test corre archivos de test en paralelo y
// builds concurrentes sobre el mismo dist/ corrompen artefactos (EACCES al
// leer, copias a medio escribir). El lock serializa los builds.
const LOCK_PATH = join(DIST_DIR, ".build.lock");
const LOCK_RETRY_MS = 50;
const LOCK_TIMEOUT_MS = 15_000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Lee el PID del dueño del lock; null si el lock no existe o el PID es inválido. */
function readLockOwner() {
  try {
    const pid = Number.parseInt(readFileSync(LOCK_PATH, "utf8").trim(), 10);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

/** Quita el lock; ignora ENOENT (otro build pudo liberarlo antes). */
function removeLock() {
  try {
    unlinkSync(LOCK_PATH);
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
}

/**
 * Adquiere el lock exclusivo de build. Reintenta cada ~50ms hasta 15s y
 * recupera locks stale: dueño muerto (ESRCH) o PID inválido tras un ciclo de
 * reintento. Si expira el plazo, falla con un error claro y exit no-cero —
 * mejor un build rojo que un dist/ corrupto.
 */
async function acquireBuildLock() {
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  let invalidPidSeen = false;

  for (;;) {
    try {
      const fd = openSync(LOCK_PATH, "wx");
      writeFileSync(fd, String(process.pid));
      closeSync(fd);
      return;
    } catch (err) {
      if (err.code !== "EEXIST") throw err;

      const owner = readLockOwner();
      if (owner !== null) {
        invalidPidSeen = false;
        try {
          process.kill(owner, 0);
        } catch (killErr) {
          if (killErr.code === "ESRCH") {
            // Dueño muerto: lock stale — quitar y reintentar ya.
            removeLock();
            continue;
          }
          // EPERM/EACCES: el dueño existe — esperar abajo.
        }
      } else if (invalidPidSeen) {
        // Segunda observación consecutiva de PID inválido: lock stale.
        removeLock();
        continue;
      } else {
        invalidPidSeen = true;
      }

      if (Date.now() >= deadline) {
        console.error(
          `Error: no se pudo adquirir ${LOCK_PATH} en ${LOCK_TIMEOUT_MS}ms — ` +
            `lo mantiene el PID ${owner ?? "<inválido/ilegible>"}.`
        );
        process.exit(1);
      }
      await sleep(LOCK_RETRY_MS);
    }
  }
}

// Crear dist/ antes del lock: el lock vive dentro de dist/.
mkdirSync(DIST_DIR, { recursive: true });

await acquireBuildLock();
try {
  // 1. Asegurar que dist/bin/ existe (sin borrar dist/ para evitar condiciones de
  //    carrera cuando los tests ejecutan builds concurrentes — el build es
  //    determinista, así que el overwrite en-place produce el mismo artefacto).
  mkdirSync(join(DIST_DIR, "bin"), { recursive: true });

  // 2. Copiar src/ directamente en dist/ (estructura plana idéntica a src/),
  //    excluyendo integrity.js: su placeholder no debe quedar expuesto en
  //    dist/, ni siquiera momentáneamente. Los tests ejecutan builds
  //    concurrentes sobre el mismo dist/ (node --test corre archivos en
  //    paralelo) y, en la ventana entre este cp y la inyección del hash
  //    (paso 5), un build vecino podía copiar el placeholder encima del hash
  //    recién escrito — race observada en artifact.test.js. El paso 5 escribe
  //    dist/integrity.js una sola vez, con el hash real.
  cpSync(SRC_DIR, DIST_DIR, { recursive: true, filter: (src) => src !== "src/integrity.js" });

  // 3. Copiar bin/ a dist/bin/ y parchear rutas de importación relativas.
  //    bin/cli.js usa "../src/" para desarrollo local; en dist/bin/ los módulos
  //    ya están en el nivel padre ("../"), así que ajustamos las rutas.
  cpSync(BIN_DIR, join(DIST_DIR, "bin"), { recursive: true });
  const distCli = join(DIST_DIR, "bin", "cli.js");
  const cliContent = readFileSync(distCli, "utf8");
  writeFileSync(
    distCli,
    cliContent.replace(/from "\.\.\/src\//g, 'from "../').replace(/from '\.\.\/src\//g, "from '../")
  );

  // 4. Calcular SHA256 de dist/licensing.js sin ofuscar.
  //    La ofuscación con javascript-obfuscator es no-determinista (dead-code
  //    injection + self-defending varían por ejecución), lo que viola el
  //    criterio de artefacto reproducible del plan 032.
  const licensingDist = join(DIST_DIR, "licensing.js");
  const licensingContent = readFileSync(licensingDist, "utf8");
  const hash = createHash("sha256").update(licensingContent).digest("hex");

  // 5. Reemplazar el placeholder en dist/integrity.js con el hash real.
  //    Leer desde src/integrity.js (solo-lectura) garantiza que la plantilla
  //    siempre tiene el placeholder en la posición correcta, incluso cuando
  //    varios builds se ejecutan concurrentemente sobre el mismo dist/.
  const integritySrc = join(SRC_DIR, "integrity.js");
  const integrityDist = join(DIST_DIR, "integrity.js");
  let integritySource = readFileSync(integritySrc, "utf8");
  if (!integritySource.includes(PLACEHOLDER)) {
    // Lanzar (no process.exit) para que el finally libere el lock.
    throw new Error(`Error: ${integritySrc} debe contener el placeholder ${PLACEHOLDER}`);
  }
  integritySource = integritySource.replace(PLACEHOLDER, hash);
  writeFileSync(integrityDist, integritySource, "utf8");

  console.log(`Build completa: dist/ preparado (SHA256 licensing: ${hash.substring(0, 16)}...)`);
} finally {
  removeLock();
}
