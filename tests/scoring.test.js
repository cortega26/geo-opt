/**
 * Tests dedicados para scoreContent (v1).
 *
 * Cubre C1 del supplement de evidencia y cobertura:
 * - Contenido bueno puntúa alto, contenido malo puntúa bajo.
 * - Verifica estructura del breakdown (5 dimensiones).
 * - Verifica que los findings cumplen el contrato.
 * - Edge cases: HTML semántico, Markdown rico, contenido vacío,
 *   contenido con stats y citas, contenido sin estructura.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { scoreContent } from "../src/scoring.js";

// ═══════════════════════════════════════════════════════════════════════════
// Fixtures inline
// ═══════════════════════════════════════════════════════════════════════════

const GOOD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <title>Complete Guide to Kubernetes Pod Security Policies</title>
</head>
<body>
  <main>
    <article>
      <h1>Complete Guide to Kubernetes Pod Security Policies</h1>
      <p>Kubernetes Pod Security Policies (PSPs) are a cluster-level resource that controls security-sensitive aspects of pod specification. A PodSecurityPolicy is a set of conditions that must be met for a pod to be admitted into the cluster, according to the official Kubernetes documentation. PSPs define the security context under which a pod can run, covering privileges, host namespaces, volumes, and Linux capabilities.</p>

      <h2>What Are Pod Security Policies?</h2>
      <p>Pod Security Policies define a set of conditions that pods must meet to be accepted by the admission controller. When you create a PSP, you're establishing a security baseline that applies cluster-wide. According to Red Hat's 2024 Kubernetes Security Report, 78% of production clusters now enforce PSPs or their successor, Pod Security Admission (PSA). The Cloud Native Computing Foundation reports that security misconfigurations account for 42% of Kubernetes incidents.</p>

      <h2>Key Features</h2>
      <p>The three most important features of PSPs are privilege escalation prevention, host namespace isolation, and filesystem group management. As noted by Kelsey Hightower, Staff Developer Advocate at Google Cloud: "Pod Security Policies are not optional for production Kubernetes — they're the minimum bar every cluster must meet." A 2024 survey by StackRox found that 64% of organizations delayed Kubernetes adoption due to security concerns.</p>

      <h3>Privilege Escalation Prevention</h3>
      <p>PSPs prevent containers from escalating privileges through the <code>allowPrivilegeEscalation</code> flag. When set to false, even if a process runs as root inside the container, it cannot gain more capabilities than its parent. The Center for Internet Security (CIS) Kubernetes Benchmark v1.7 recommends this setting for all workloads.</p>

      <h3>Host Namespace Isolation</h3>
      <p>By default, PSPs block containers from using host namespaces for PID, IPC, and network. This prevents a compromised container from seeing processes on the host node. Research published in the Journal of Cloud Computing (2023) showed that namespace isolation reduces lateral movement risk by 81% in multi-tenant clusters.</p>

      <table>
        <tr><th>Policy Feature</th><th>Risk Without It</th><th>Compliance Standard</th></tr>
        <tr><td>Privilege Escalation</td><td>Container breakout</td><td>CIS 5.2.3</td></tr>
        <tr><td>Host Namespace</td><td>Process snooping</td><td>CIS 5.2.4</td></tr>
        <tr><td>Filesystem Groups</td><td>Volume permission errors</td><td>CIS 5.2.5</td></tr>
      </table>

      <h2>Implementation Best Practices</h2>
      <ul>
        <li>Start with a restrictive default policy and selectively relax it</li>
        <li>Use Pod Security Admission (PSA) as a simpler alternative for new clusters</li>
        <li>Audit all existing pods before enforcing a PSP</li>
        <li>Test policies in a staging cluster before production rollout</li>
      </ul>

      <h2>References</h2>
      <ul>
        <li><a href="https://kubernetes.io/docs/concepts/security/pod-security-policy/">Kubernetes PSP Documentation</a></li>
        <li><a href="https://www.redhat.com/en/resources/kubernetes-security-report-2024">Red Hat Kubernetes Security Report 2024</a></li>
        <li><a href="https://www.stackrox.com/kubernetes-security-survey-2024">StackRox Kubernetes Security Survey</a></li>
      </ul>

      <footer>Published: 2024-09-15 | Last reviewed: 2025-03-01</footer>
    </article>
  </main>
</body>
</html>`;

const POOR_HTML = `<!DOCTYPE html>
<html>
<head><title>page</title></head>
<body>
  <div id="app">
    <h3>stuff</h3>
    <p>it is good</p>
    <h5>more things</h5>
    <p>they work well for this and that. it does things. they help with stuff.</p>
    <p>this is great for everyone. it makes things better. they say it works. this is the best.</p>
    <a href="javascript:void(0)">click</a>
  </div>
  <script>createApp({ data() { return {} } })</script>
</body>
</html>`;

const GOOD_MD = `# Comprehensive Guide to Terraform Infrastructure as Code

Terraform is an Infrastructure as Code (IaC) tool developed by HashiCorp that allows you to define, provision, and manage cloud infrastructure using a declarative configuration language called HCL (HashiCorp Configuration Language). It supports over 3,000 providers across AWS, Azure, GCP, and more, making it the most widely adopted IaC tool with 41% market share according to the 2024 CNCF Technology Radar.

## How Terraform Works

Terraform works through a three-step workflow: **write**, **plan**, and **apply**. You first write configuration files that describe your desired infrastructure state. The \`terraform plan\` command then compares your configuration against the current state and shows you exactly what will change — without making any modifications. Finally, \`terraform apply\` executes the planned changes.

According to Mitchell Hashimoto, co-founder of HashiCorp: "Terraform's greatest strength is its plan phase — knowing what will change before it changes is the foundation of infrastructure confidence."

## State Management

Terraform maintains a **state file** (\`terraform.tfstate\`) that maps real-world resources to your configuration. This file is critical — it's how Terraform knows what exists and what needs to change. HashiCorp's 2024 State of Cloud Strategy reported that 67% of organizations now use remote state backends with locking to prevent concurrent modification conflicts.

| Backend Type | Locking | Encryption | Best For |
|---|---|---|---|
| Local | No | No | Development |
| S3 + DynamoDB | Yes | Server-side | AWS workloads |
| Terraform Cloud | Yes | Always | Teams |
| Consul | Yes | Optional | Multi-cloud |

## Module Architecture

Terraform modules encapsulate groups of resources into reusable components. A well-designed module:

- Accepts input variables for configuration flexibility
- Exposes output values for consumption by other modules
- Hides implementation details from consumers
- Follows semantic versioning for change management

Research by Gruntwork (2024) found that teams using modules reduced configuration errors by 53% and deployment time by 38%. As noted in the Terraform Best Practices Guide: "Modules are not just code reuse — they're contracts between infrastructure authors and consumers."

## Best Practices

1. **Use remote state** — Never store state files locally for team projects
2. **Version-lock providers** — Pin provider versions to prevent unexpected changes
3. **Apply least privilege** — Give Terraform service accounts only the permissions they need
4. **Run plan in CI** — Always run \`terraform plan\` in your CI pipeline before merge
5. **Tag everything** — Consistent resource tagging enables cost tracking and auditing

## References

- [Terraform Documentation](https://developer.hashicorp.com/terraform/docs)
- [CNCF Technology Radar 2024](https://www.cncf.io/reports/technology-radar-2024/)
- [Gruntwork Terraform Module Study](https://www.gruntwork.io/research/terraform-modules-2024)
- [HashiCorp State of Cloud Strategy 2024](https://www.hashicorp.com/state-of-cloud-strategy-2024)
`;

const POOR_MD = `# stuff

it is good

## more

they work well for this and that. it does things. they help with stuff.

### even more

this is great for everyone. it makes things better. they say it works. this is the best.

click here http://example.com

## also

yes`;

const EMPTY_CONTENT = "";

const MINIMAL_MD = "# Hello";

const STATS_HEAVY_MD = `# Q3 2024 Performance Report

Revenue grew 23% year-over-year to $45.2 million. Operating margin improved from 12% to 18.5% during the same period. Customer acquisition cost decreased by 15% to $240 per customer.

According to the annual report published by Deloitte in January 2025, the industry average growth rate was 8.3%.

## Key Metrics

- Monthly active users: 2.4 million (+12%)
- Churn rate: 2.1% (down from 3.4%)
- NPS score: 72 (industry average: 41)
- Customer lifetime value: $3,200
- Support tickets resolved: 98.7%

"We've seen the strongest retention numbers in company history," said Sarah Chen, VP of Customer Success.

Source: Internal Analytics Dashboard, accessed 2024-10-01
`;

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Assert that a report has the required contract shape.
 * @param {object} report
 * @param {string} file
 */
function assertReportContract(report, file) {
  // Top-level fields
  assert.ok(typeof report.file === "string", `report.file debe ser string, obtuvo ${typeof report.file}`);
  assert.ok(typeof report.total_score === "number", `total_score debe ser number`);
  assert.ok(report.total_score >= 0 && report.total_score <= 100, `total_score debe estar entre 0 y 100, obtuvo ${report.total_score}`);

  // Breakdown
  const dims = ["structure", "statistics", "quotations", "citations", "clarity"];
  assert.ok(report.breakdown, "report.breakdown debe existir");
  for (const dim of dims) {
    const b = report.breakdown[dim];
    assert.ok(b, `breakdown.${dim} debe existir`);
    assert.ok(typeof b.score === "number", `${dim}.score debe ser number`);
    assert.ok(typeof b.max === "number", `${dim}.max debe ser number`);
    assert.ok(Array.isArray(b.details), `${dim}.details debe ser array`);
    assert.ok(b.score <= b.max, `${dim}.score (${b.score}) no debe exceder ${dim}.max (${b.max})`);
  }

  // Recommendations
  assert.ok(Array.isArray(report.recommendations), "recommendations debe ser array");

  // Findings
  assert.ok(Array.isArray(report.findings), "findings debe ser array");
  for (const f of report.findings) {
    assert.ok(typeof f.ruleId === "string", "finding.ruleId debe ser string");
    assert.ok(typeof f.category === "string", "finding.category debe ser string");
    assert.ok(["pass", "warn", "fail", "not_applicable"].includes(f.severity),
      `severity inválida: ${f.severity}`);
    assert.ok(typeof f.message === "string", "finding.message debe ser string");
    assert.ok(["strong", "probable", "experimental", "heuristic"].includes(f.evidenceLabel),
      `evidenceLabel inválido: ${f.evidenceLabel}`);
    assert.ok(Array.isArray(f.sourceRefs), "sourceRefs debe ser array");
    assert.ok(typeof f.observedFacts === "object", "observedFacts debe ser object");
  }

  // Versions
  assert.ok(typeof report.reportVersion === "string", "reportVersion debe ser string");
  assert.ok(typeof report.modelVersion === "string", "modelVersion debe ser string");
  assert.ok(typeof report.generatedAt === "string", "generatedAt debe ser string");
}

// ═══════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════

describe("scoreContent — diferenciación buena calidad vs mala calidad", () => {
  it("contenido HTML bueno obtiene puntuación alta (≥70)", () => {
    const { score, report } = scoreContent(GOOD_HTML, "good.html", {});
    assert.ok(score >= 70, `HTML bueno debería puntuar ≥70, obtuvo ${score}`);
    assertReportContract(report, "good.html");
    // Debe tener H1, headings, tablas, listas, stats, citas, links externos
    assert.ok(report.breakdown.structure.score >= 10, "Estructura debería ser ≥10");
    assert.ok(report.breakdown.statistics.score >= 10, "Stats deberían ser ≥10");
  });

  it("contenido HTML pobre obtiene puntuación baja (<50)", () => {
    const { score, report } = scoreContent(POOR_HTML, "poor.html", {});
    assert.ok(score < 50, `HTML pobre debería puntuar <50, obtuvo ${score}`);
    assertReportContract(report, "poor.html");
  });

  it("contenido Markdown bueno obtiene puntuación alta (≥65)", () => {
    const { score, report } = scoreContent(GOOD_MD, "good.md", {});
    assert.ok(score >= 65, `Markdown bueno debería puntuar ≥65, obtuvo ${score}`);
    assertReportContract(report, "good.md");
    // Debe tener tabla (estructura), links, stats verbales, citas
    assert.ok(report.breakdown.structure.score >= 8, "Estructura debería ser ≥8 para MD con tabla+H2");
  });

  it("contenido Markdown pobre obtiene puntuación baja (<45)", () => {
    const { score, report } = scoreContent(POOR_MD, "poor.md", {});
    assert.ok(score < 45, `Markdown pobre debería puntuar <45, obtuvo ${score}`);
    assertReportContract(report, "poor.md");
  });

  it("contenido vacío obtiene puntuación muy baja (≤20)", () => {
    const { score, report } = scoreContent(EMPTY_CONTENT, "empty.md", {});
    // Vacío recibe 20 de claridad (sin problemas que deducir) pero 0 en las
    // otras 4 dimensiones. Es un artefacto conocido del diseño v1: la
    // claridad arranca en 20 y deduce, pero sin contenido no hay qué deducir.
    assert.ok(score <= 20, `Contenido vacío debería puntuar ≤20, obtuvo ${score}`);
    assertReportContract(report, "empty.md");
    // Verificar que las dimensiones de contenido están en 0
    assert.equal(report.breakdown.structure.score, 0, "Estructura debe ser 0 para vacío");
    assert.equal(report.breakdown.statistics.score, 0, "Stats debe ser 0 para vacío");
    assert.equal(report.breakdown.quotations.score, 0, "Quotes debe ser 0 para vacío");
    assert.equal(report.breakdown.citations.score, 0, "Citations debe ser 0 para vacío");
  });

  it("contenido mínimo (solo un heading) puntúa muy bajo (≤20)", () => {
    const { score, report } = scoreContent(MINIMAL_MD, "minimal.md", {});
    // "# Hello" tiene un heading pero nada más — la claridad arranca en 20
    // y no hay contenido que deducir. Las otras dimensiones están en 0.
    assert.ok(score <= 20, `Contenido mínimo debería puntuar ≤20, obtuvo ${score}`);
    assertReportContract(report, "minimal.md");
  });

  it("contenido con stats densos y citas atribuidas puntúa alto (≥50)", () => {
    const { score, report } = scoreContent(STATS_HEAVY_MD, "stats.md", {});
    assert.ok(score >= 50, `Contenido con stats+quotes debería puntuar ≥50, obtuvo ${score}`);
    assertReportContract(report, "stats.md");
    // Debe reconocer las stats numéricas
    assert.ok(report.breakdown.statistics.score > 0, "Stats deberían ser >0 para contenido con números");
  });
});

describe("scoreContent — estructura del breakdown", () => {
  it("cada dimensión tiene score, max y details", () => {
    const { report } = scoreContent(GOOD_MD, "test.md", {});
    const dims = ["structure", "statistics", "quotations", "citations", "clarity"];
    for (const dim of dims) {
      const b = report.breakdown[dim];
      assert.ok(typeof b.score === "number", `${dim}.score ausente`);
      assert.ok(typeof b.max === "number", `${dim}.max ausente`);
      assert.ok(Array.isArray(b.details), `${dim}.details no es array`);
    }
  });

  it("la suma de scores de dimensiones == total_score (dentro de tolerancia)", () => {
    const { score, report } = scoreContent(GOOD_MD, "test.md", {});
    const dimSum = Object.values(report.breakdown).reduce((s, b) => s + b.score, 0);
    // El total_score puede ser diferente del dimSum porque:
    // - scoring.js tiene lógica de ajuste con MAX_TOTAL_SCORE
    // - HTML content puede tener penalizaciones específicas
    // Sin embargo, para Markdown deberían ser cercanos
    assert.ok(Math.abs(dimSum - score) <= 20 || score === 100,
      `Suma de dimensiones (${dimSum}) vs total_score (${score}) divergen demasiado`);
  });

  it("cada dimensión tiene max=20", () => {
    const { report } = scoreContent(GOOD_MD, "test.md", {});
    for (const dim of ["structure", "statistics", "quotations", "citations", "clarity"]) {
      assert.equal(report.breakdown[dim].max, 20, `${dim}.max debería ser 20`);
    }
  });
});

describe("scoreContent — findings cumplen el contrato", () => {
  it("todos los findings tienen los campos requeridos", () => {
    const { report } = scoreContent(GOOD_MD, "test.md", {});
    assert.ok(report.findings.length > 0, "Debería haber al menos 1 finding");
    const requiredFields = [
      "ruleId", "category", "severity", "status", "message",
      "evidenceLabel", "applicability", "sourceRefs", "observedFacts", "remediation",
    ];
    for (const f of report.findings) {
      for (const field of requiredFields) {
        assert.ok(field in f, `finding.${field} debe existir en ${f.ruleId}`);
      }
    }
  });

  it("los evidenceLabels de los findings son válidos", () => {
    const valid = ["strong", "probable", "experimental", "heuristic"];
    const { report } = scoreContent(GOOD_MD, "test.md", {});
    for (const f of report.findings) {
      assert.ok(valid.includes(f.evidenceLabel),
        `evidenceLabel "${f.evidenceLabel}" no es válido para ${f.ruleId}`);
    }
  });

  it("los severities de los findings son válidos", () => {
    const valid = ["pass", "warn", "fail", "not_applicable"];
    const { report } = scoreContent(GOOD_MD, "test.md", {});
    for (const f of report.findings) {
      assert.ok(valid.includes(f.severity),
        `severity "${f.severity}" no es válido para ${f.ruleId}`);
      assert.equal(f.status, f.severity, `status debe reflejar severity para ${f.ruleId}`);
    }
  });

  it("los findings 'warn' tienen remediation no vacía", () => {
    const { report } = scoreContent(POOR_MD, "poor.md", {});
    const warnFindings = report.findings.filter((f) => f.severity === "warn");
    // Puede haber 0 warn findings en contenido pobre, OK
    for (const f of warnFindings) {
      assert.ok(f.remediation && f.remediation.length > 0,
        `Finding warn ${f.ruleId} debería tener remediation`);
    }
  });

  it("los findings 'pass' no requieren remediation (puede ser null)", () => {
    const { report } = scoreContent(GOOD_MD, "test.md", {});
    const passFindings = report.findings.filter((f) => f.severity === "pass");
    for (const f of passFindings) {
      // pass findings: remediation puede ser null o string vacío
      assert.ok(f.remediation === null || typeof f.remediation === "string",
        `Finding pass ${f.ruleId} remediation debe ser null o string`);
    }
  });
});

describe("scoreContent — diferenciación por tipo de contenido", () => {
  it("HTML semántico no penaliza estructura", () => {
    const { report } = scoreContent(GOOD_HTML, "good.html", {});
    // GOOD_HTML usa <main>, <article>, <footer> — al menos 3 tags semánticos
    const structDetails = report.breakdown.structure.details.join(" ");
    const hasSemanticBonus = !structDetails.includes("Lacks HTML5 structural tags");
    assert.ok(hasSemanticBonus, "HTML con tags semánticos no debería tener penalización");
  });

  it("HTML sin tags semánticos recibe penalización de estructura", () => {
    const { report } = scoreContent(POOR_HTML, "poor.html", {});
    const structDetails = report.breakdown.structure.details.join(" ");
    const hasSemanticPenalty = structDetails.includes("Lacks HTML5 structural tags");
    assert.ok(hasSemanticPenalty, "HTML sin tags semánticos debería recibir penalización");
  });

  it("Markdown con tabla recibe puntos de estructura", () => {
    const { report } = scoreContent(GOOD_MD, "good.md", {});
    const structDetails = report.breakdown.structure.details.join(" ");
    assert.ok(structDetails.includes("Tables"), "Debería detectar la tabla en el Markdown");
  });

  it("Markdown con links externos recibe puntos de citación", () => {
    const { report } = scoreContent(GOOD_MD, "good.md", {});
    assert.ok(report.breakdown.citations.score > 0,
      `Contenido con 4 links externos debería recibir puntos de citación, obtuvo ${report.breakdown.citations.score}`);
  });

  it("contenido con stats y fuentes cercanas recibe puntuación alta de stats", () => {
    const { report } = scoreContent(STATS_HEAVY_MD, "stats.md", {});
    assert.ok(report.breakdown.statistics.score >= 10,
      `Contenido con múltiples stats debería puntuar ≥10 en stats, obtuvo ${report.breakdown.statistics.score}`);
  });
});

describe("scoreContent — generación de recommendations", () => {
  it("contenido excelente tiene pocas o ninguna recomendación", () => {
    const { report } = scoreContent(GOOD_HTML, "good.html", {});
    // El HTML bueno tiene buena estructura, stats, citas, links
    // Puede tener recomendaciones menores, pero no masivas
    assert.ok(report.recommendations.length < 8,
      `Contenido bueno debería tener <8 recomendaciones, obtuvo ${report.recommendations.length}`);
  });

  it("contenido pobre tiene múltiples recomendaciones", () => {
    const { report } = scoreContent(POOR_MD, "poor.md", {});
    assert.ok(report.recommendations.length >= 2,
      `Contenido pobre debería tener ≥2 recomendaciones, obtuvo ${report.recommendations.length}`);
  });

  it("cada recomendación es un string no vacío", () => {
    const { report } = scoreContent(GOOD_MD, "good.md", {});
    for (const rec of report.recommendations) {
      assert.ok(typeof rec === "string" && rec.length > 0, "Cada recomendación debe ser string no vacío");
    }
  });
});

describe("scoreContent — edge cases de HTML", () => {
  it("detecta dynamic rendering en HTML con app container", () => {
    const { report } = scoreContent(POOR_HTML, "poor.html", {});
    // POOR_HTML tiene <div id="app"> y createApp()
    const hasDynamicWarning = report.findings.some(
      (f) => f.ruleId === "content.dynamic_rendering" && f.severity === "warn"
    );
    assert.ok(hasDynamicWarning, "Debería detectar dynamic rendering en HTML con app container");
  });

  it("HTML bueno no debería tener finding de dynamic_rendering", () => {
    const { report } = scoreContent(GOOD_HTML, "good.html", {});
    const dynFinding = report.findings.find((f) => f.ruleId === "content.dynamic_rendering");
    // GOOD_HTML no tiene app container ni createApp/ReactDOM.render
    assert.ok(!dynFinding || dynFinding.severity === "pass",
      "HTML bueno sin JS dinámico no debería tener dynamic_rendering warn/fail");
  });
});

describe("scoreContent — metadata del reporte", () => {
  it("reportVersion y modelVersion son strings con formato de versión", () => {
    const { report } = scoreContent(GOOD_MD, "test.md", {});
    assert.ok(/^\d+\.\d+\.\d+/.test(report.reportVersion),
      `reportVersion debe ser semver-like, obtuvo ${report.reportVersion}`);
    assert.ok(/^\d+\.\d+\.\d+/.test(report.modelVersion),
      `modelVersion debe ser semver-like, obtuvo ${report.modelVersion}`);
  });

  it("generatedAt es una fecha ISO 8601 válida", () => {
    const { report } = scoreContent(GOOD_MD, "test.md", {});
    const d = new Date(report.generatedAt);
    assert.ok(!isNaN(d.getTime()), `generatedAt debe ser fecha ISO8601 válida, obtuvo ${report.generatedAt}`);
  });

  it("file en el reporte coincide con el filepath pasado", () => {
    const { report } = scoreContent(GOOD_MD, "custom-path/article.md", {});
    assert.equal(report.file, "custom-path/article.md");
  });
});
