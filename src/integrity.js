import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import * as licensing from "./licensing.js";

// ═══ Integrity verification ═══
// La build reemplaza este placeholder con el hash real del licensing.js ofuscado.
// Si el archivo fue manipulado después de la instalación, el hash no coincidirá
// y las funciones Pro se degradan automáticamente.

const EXPECTED_HASH = "<<<LICENSING_HASH>>>";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const licensingPath = join(__dirname, "licensing.js");

let tampered = false;

try {
  const content = readFileSync(licensingPath, "utf8");
  const actualHash = createHash("sha256").update(content).digest("hex");
  tampered = EXPECTED_HASH !== "<<<LICENSING_HASH>>>" && actualHash !== EXPECTED_HASH;
} catch {
  // Si no podemos leer el archivo, asumimos manipulación
  tampered = true;
}

// ═══ Re-export de licensing.js ═══

export const LICENSE_ENV_VAR = licensing.LICENSE_ENV_VAR;

export const resolveLicenseKey = licensing.resolveLicenseKey;

export const hasProEntitlement = tampered ? () => false : licensing.hasProEntitlement;

export const getNoBrandingError = tampered
  ? () =>
      "Integrity verification failed. The licensing module may have been tampered with. " +
      "Please reinstall geo-opt from the official source."
  : licensing.getNoBrandingError;
