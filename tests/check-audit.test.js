import { describe, it } from "node:test";
import assert from "node:assert";
import { evaluateAuditReport } from "../scripts/check-audit.js";

// Plan 069: the audit-gate allowlist must be keyed by stable GHSA identity, not
// by npm's renumbered advisory `source` or respelled `range`. These tests are
// hermetic — no advisory-registry calls — and model the report shapes the real
// gate saw on 2026-07-31 (source 1124334, range "<=5.0.7") and on 2026-08-02
// (source 1130591, range ">=4.0.0 <5.0.8").

const GHSA_URL = "https://github.com/advisories/GHSA-mh99-v99m-4gvg";
const REVIEWED_PATH = "node_modules/npm/node_modules/brace-expansion";

// Stale-detection semantics depend on the *entire* allowlist (every entry
// whose GHSA does not appear in the report is stale), so those tests run
// against a dedicated one-entry fixture list instead of the real ALLOWLIST,
// which grows as new unfixable bundled advisories get documented.
const FIXTURE_ALLOWLIST = [
  {
    package: "brace-expansion",
    url: GHSA_URL,
    nodes: [REVIEWED_PATH],
    version: "5.0.7",
    source: 1130591,
    range: ">=4.0.0 <5.0.8",
    added: "2026-07-31",
    recheck: "2026-10-31",
    reason: "fixture allowlist entry for Plan 069 hermetic tests",
  },
];

function advisory(overrides = {}) {
  return {
    source: 1130591,
    name: "brace-expansion",
    dependency: "brace-expansion",
    title: "brace-expansion: DoS via unbounded expansion length",
    url: GHSA_URL,
    severity: "high",
    range: ">=4.0.0 <5.0.8",
    ...overrides,
  };
}

function entry(overrides = {}) {
  const via = Array.isArray(overrides.via) ? overrides.via : [advisory(overrides.via ?? {})];
  return {
    name: "brace-expansion",
    severity: "high",
    isDirect: false,
    via,
    effects: [],
    range: "4.0.0 - 5.0.7",
    nodes: [REVIEWED_PATH],
    fixAvailable: false,
    ...overrides,
    via,
  };
}

function report(entries) {
  return {
    metadata: { vulnerabilities: { critical: 0, high: 1, moderate: 0, low: 0 } },
    vulnerabilities: entries,
  };
}

function lockfile(packages = { [REVIEWED_PATH]: { version: "5.0.7" } }) {
  return { lockfileVersion: 3, packages };
}

describe("Plan 069 — audit allowlist matches by GHSA identity", () => {
  it("accepts the historical npm spelling (source 1124334, range <=5.0.7)", () => {
    const { suppressed, blocking } = evaluateAuditReport(
      report({
        "brace-expansion": entry({ via: advisory({ source: 1124334, range: "<=5.0.7" }) }),
      }),
      lockfile()
    );
    assert.strictEqual(blocking.length, 0);
    assert.strictEqual(suppressed.length, 1);
    assert.strictEqual(suppressed[0].advisory.url, GHSA_URL);
  });

  it("accepts the current npm spelling (source 1130591, range >=4.0.0 <5.0.8)", () => {
    const { suppressed, blocking } = evaluateAuditReport(
      report({ "brace-expansion": entry() }),
      lockfile()
    );
    assert.strictEqual(blocking.length, 0);
    assert.strictEqual(suppressed.length, 1);
    // Recheck metadata stays attached to the suppressed decision.
    assert.strictEqual(suppressed[0].entry.recheck, "2026-10-31");
    assert.match(suppressed[0].entry.reason, /Dev-only/);
  });

  it("blocks a different GHSA for the same package", () => {
    const { blocking } = evaluateAuditReport(
      report({
        "brace-expansion": entry({
          via: advisory({ url: "https://github.com/advisories/GHSA-other-xxxx-yyyy" }),
        }),
      }),
      lockfile()
    );
    assert.strictEqual(blocking.length, 1);
  });

  it("blocks a different package under the allowlisted GHSA URL", () => {
    const { blocking } = evaluateAuditReport(
      report({
        minimatch: entry({
          name: "minimatch",
          via: advisory({ name: "minimatch", dependency: "minimatch" }),
        }),
      }),
      lockfile()
    );
    assert.strictEqual(blocking.length, 1);
    assert.strictEqual(blocking[0].advisory.name, "minimatch");
  });

  it("blocks when the installed version at the reviewed path is no longer 5.0.7", () => {
    const { blocking } = evaluateAuditReport(
      report({ "brace-expansion": entry() }),
      lockfile({ [REVIEWED_PATH]: { version: "5.0.8" } })
    );
    assert.strictEqual(blocking.length, 1);
    assert.match(blocking[0].mismatch, /5\.0\.8/);
  });

  it("blocks an un-reviewed second dependency path", () => {
    const { blocking } = evaluateAuditReport(
      report({
        "brace-expansion": entry({ nodes: [REVIEWED_PATH, "node_modules/brace-expansion"] }),
      }),
      lockfile()
    );
    assert.strictEqual(blocking.length, 1);
    assert.match(blocking[0].mismatch, /un-reviewed path node_modules\/brace-expansion/);
  });

  it("fails closed when the lockfile cannot confirm the reviewed path", () => {
    const { blocking } = evaluateAuditReport(report({ "brace-expansion": entry() }), lockfile({}));
    assert.strictEqual(blocking.length, 1);
    assert.match(blocking[0].mismatch, /unknown/);
  });

  it("fails closed when the report lists no vulnerable node", () => {
    const { blocking } = evaluateAuditReport(
      report({ "brace-expansion": entry({ nodes: [] }) }),
      lockfile()
    );
    assert.strictEqual(blocking.length, 1);
    assert.match(blocking[0].mismatch, /no vulnerable node/);
  });

  it("reports the allowlist entry as stale when its GHSA no longer appears", () => {
    const { suppressed, blocking, stale } = evaluateAuditReport(
      report({}),
      lockfile(),
      FIXTURE_ALLOWLIST
    );
    assert.strictEqual(suppressed.length, 0);
    assert.strictEqual(blocking.length, 0);
    assert.strictEqual(stale.length, 1);
    assert.strictEqual(stale[0].url, GHSA_URL);
  });

  it("does not warn stale when the advisory is present at sub-blocking severity", () => {
    const { suppressed, blocking, stale } = evaluateAuditReport(
      report({ "brace-expansion": entry({ via: advisory({ severity: "moderate" }) }) }),
      lockfile(),
      FIXTURE_ALLOWLIST
    );
    assert.strictEqual(suppressed.length, 0);
    assert.strictEqual(blocking.length, 0);
    assert.strictEqual(stale.length, 0);
  });

  it("does not warn stale when the allowlisted url appears under a different package", () => {
    const { suppressed, blocking, stale } = evaluateAuditReport(
      report({
        minimatch: entry({
          name: "minimatch",
          via: advisory({ name: "minimatch", dependency: "minimatch" }),
        }),
      }),
      lockfile(),
      FIXTURE_ALLOWLIST
    );
    assert.strictEqual(suppressed.length, 0);
    assert.strictEqual(blocking.length, 1);
    assert.strictEqual(stale.length, 0);
  });

  it("blocks an un-reviewed second entry while suppressing the reviewed one", () => {
    const { suppressed, blocking, stale } = evaluateAuditReport(
      report({
        "brace-expansion": entry(),
        "npm-bundled/brace-expansion": entry({ nodes: ["node_modules/other/brace-expansion"] }),
      }),
      lockfile(),
      FIXTURE_ALLOWLIST
    );
    assert.strictEqual(suppressed.length, 1);
    assert.strictEqual(blocking.length, 1);
    assert.match(blocking[0].mismatch, /un-reviewed path node_modules\/other\/brace-expansion/);
    assert.strictEqual(stale.length, 0);
  });

  it("ignores parent-only string via entries and sub-high severities", () => {
    const { suppressed, blocking, stale } = evaluateAuditReport(
      report({
        npm: entry({ via: ["brace-expansion"], severity: "high" }),
        "brace-expansion": entry({ via: advisory({ severity: "moderate" }) }),
      }),
      lockfile(),
      FIXTURE_ALLOWLIST
    );
    assert.strictEqual(suppressed.length, 0);
    assert.strictEqual(blocking.length, 0);
    assert.strictEqual(stale.length, 0);
  });
});
