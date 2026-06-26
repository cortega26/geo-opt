#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import JavaScriptObfuscator from "javascript-obfuscator";

const LICENSING_SRC = "src/licensing.js";
const INTEGRITY_SRC = "src/integrity.js";
const PLACEHOLDER = "<<<LICENSING_HASH>>>";

// 1. Leer el código fuente original de licensing
const originalSource = readFileSync(LICENSING_SRC, "utf8");

// 2. Ofuscar con configuración agresiva
const result = JavaScriptObfuscator.obfuscate(originalSource, {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.75,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.4,
  debugProtection: false,
  disableConsoleOutput: false,
  identifierNamesGenerator: "hexadecimal",
  renameGlobals: false,
  selfDefending: true,
  stringArray: true,
  stringArrayEncoding: ["base64"],
  stringArrayThreshold: 0.75,
  transformObjectKeys: true,
  unicodeEscapeSequence: false,
});

const obfuscatedSource = result.getObfuscatedCode();

// 3. Escribir el código ofuscado en licensing.js
writeFileSync(LICENSING_SRC, obfuscatedSource, "utf8");

// 4. Calcular SHA256 del código ofuscado
const hash = createHash("sha256").update(obfuscatedSource).digest("hex");

// 5. Reemplazar el placeholder en integrity.js con el hash real
let integritySource = readFileSync(INTEGRITY_SRC, "utf8");
if (!integritySource.includes(PLACEHOLDER)) {
  console.error(`Error: ${INTEGRITY_SRC} debe contener el placeholder ${PLACEHOLDER}`);
  process.exit(1);
}
integritySource = integritySource.replace(PLACEHOLDER, hash);
writeFileSync(INTEGRITY_SRC, integritySource, "utf8");

console.log(`Build completa: licensing.js ofuscado (SHA256: ${hash.substring(0, 16)}...)`);
