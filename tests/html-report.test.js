/**
 * Tests para src/html-report.js — renderers de reportes HTML.
 *
 * F-01: el baseline JSON de `report --compare` es un archivo externo no
 * confiable; ningún valor debe interpolarse sin escapar.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { renderComparisonHtml } from "../src/html-report.js";

// ═══════════════════════════════════════════════════════════════════════════════
// F-01 — XSS almacenado vía baseline malicioso
// ═══════════════════════════════════════════════════════════════════════════════

describe("renderComparisonHtml (F-01)", () => {
  const EVIL = "5</div><script>alert(1)</script><div>";

  it("render-comparison-escapes-malicious-baseline", () => {
    const before = {
      total_score: EVIL,
      breakdown: {
        structure: { score: EVIL, max: 20 },
        statistics: { score: "18</td><script>alert(2)</script>", max: 20 },
      },
      findings: [{ ruleId: "r1", severity: "fail", message: EVIL }],
    };
    const after = {
      total_score: 85,
      breakdown: {
        structure: { score: 17, max: 20 },
        statistics: { score: 15, max: 20 },
      },
      findings: [{ ruleId: "r1", status: "pass", message: "ok" }],
      recommendations: [EVIL],
    };

    const html = renderComparisonHtml(before, after, "report.md", { noBranding: true });

    // Ningún <script> crudo del baseline sobrevive al render.
    assert.ok(!html.includes("<script"), "no raw <script in output");
    assert.ok(!html.includes("<script>alert(1)</script>"), "no raw script tag");
    // La entidad escapada debe estar presente (evidencia del escape).
    assert.ok(html.includes("&lt;script&gt;"), "escaped script entity present");
  });

  it("render-comparison-normalizes-non-numeric-scores", () => {
    const before = {
      total_score: "not-a-number",
      breakdown: { structure: { score: "x", max: "y" } },
      findings: [],
    };
    const after = {
      total_score: 80,
      breakdown: { structure: { score: 16, max: 20 } },
      findings: [],
      recommendations: [],
    };

    const html = renderComparisonHtml(before, after, "a.md", { noBranding: true });

    // Valores no numéricos caen a 0/20 en vez de emitir NaN o strings crudos.
    assert.ok(!html.includes("NaN"), "no NaN in output");
    assert.ok(!html.includes("not-a-number"), "raw non-numeric string not interpolated");
  });

  it("render-comparison-survives-null-reports", () => {
    // before null (baseline inexistente/corrupto) no debe lanzar.
    const html = renderComparisonHtml(null, { total_score: 70, findings: [] }, "b.md", {
      noBranding: true,
    });
    assert.ok(html.includes("GEO Comparison"), "renders despite null baseline");
  });
});
