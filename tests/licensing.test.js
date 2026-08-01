/**
 * Tests para src/licensing.js — entitulación Community/Pro.
 *
 * F-04: la clave Pro es un formato público verificable localmente, sin firma
 * criptográfica ni servidor: la edición Pro es honor-system por diseño
 * (control comercial simbólico, NO un boundary de seguridad). Estos tests
 * documentan el CONTRATO ACTUAL del patrón — si un futuro fix criptográfico
 * (firma asimétrica) cambia el comportamiento, deben revisarse a propósito.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  LICENSE_ENV_VAR,
  resolveLicenseKey,
  hasProEntitlement,
  getNoBrandingError,
} from "../src/index.js";

// ═══════════════════════════════════════════════════════════════════════════════
// Contract del patrón (F-04): formato público, sin firma
// ═══════════════════════════════════════════════════════════════════════════════

describe("license-pattern-contract (F-04)", () => {
  it("any tt_pro_ key with 20+ alphanumerics passes (honor system)", () => {
    // Documenta el comportamiento actual: el patrón es público y forjable;
    // cualquier cadena de formato válido otorga entitulación Pro.
    const env = { [LICENSE_ENV_VAR]: "tt_pro_" + "A".repeat(24) };
    assert.equal(hasProEntitlement({}, env), true);
  });

  it("short keys are rejected by the format", () => {
    const env = { [LICENSE_ENV_VAR]: "tt_pro_short" };
    assert.equal(hasProEntitlement({}, env), false);
  });

  it("no key means no entitlement", () => {
    assert.equal(hasProEntitlement({}, {}), false);
    assert.equal(resolveLicenseKey({}, {}), "");
  });

  it("config license.key is honored as a fallback source", () => {
    const config = { license: { key: "tt_pro_" + "B".repeat(20) } };
    assert.equal(resolveLicenseKey(config, {}), "tt_pro_" + "B".repeat(20));
    assert.equal(hasProEntitlement(config, {}), true);
  });

  it("env var wins over config", () => {
    const config = { license: { key: "tt_pro_" + "C".repeat(20) } };
    const env = { [LICENSE_ENV_VAR]: "tt_pro_" + "D".repeat(20) };
    assert.equal(resolveLicenseKey(config, env), "tt_pro_" + "D".repeat(20));
  });

  it("getNoBrandingError is null only with a valid-format key", () => {
    assert.ok(getNoBrandingError({}, {}).includes("Pro license key"));
    const env = { [LICENSE_ENV_VAR]: "tt_pro_" + "E".repeat(20) };
    assert.equal(getNoBrandingError({}, env), null);
  });
});
