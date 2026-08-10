/**
 * Verificación end-to-end de la remediación de la auditoría adversarial
 * 2026-07-31 (F-01…F-14).
 *
 * Reproduce cada probe del informe docs/audits/auditoria-2026-07-31.md contra
 * la build actual de main (v2.3.2+) y asserta el comportamiento corregido.
 * Black-box vía CLI real como subproceso siempre que es posible; para los
 * guards SSRF (F-02/F-03) usa `fetchUrl` (la entrada de red real del módulo),
 * porque las funciones de guard internas no son exports públicos.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync, execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { fetchUrl } from "../src/fetcher.js";
import { collectSubSitemapPageUrls } from "../src/sitemap.js";

const __dirname = new URL(".", import.meta.url).pathname;
const cliPath = join(__dirname, "..", "bin", "cli.js");
const repoRoot = join(__dirname, "..");
const PY_SCRIPT = join(repoRoot, ".agents/skills/geo-optimization/scripts/geo_optimizer.py");
const PRO_FORGED_KEY = "tt_pro_" + "A".repeat(24);

function run(args, opts = {}) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    // Si un comando cuelga (regresión futura), la suite no debe colgar sin
    // límite: el runner de node --test no aplica timeout propio.
    timeout: 30_000,
    ...opts,
  });
}

function tmpDir(prefix) {
  return mkdtempSync(join(tmpdir(), `geo-e2e-${prefix}-`));
}

// ═══════════════════════════════════════════════════════════════════════════
// F-01 — XSS almacenado en `report --compare` (baseline sin escapar)
// ═══════════════════════════════════════════════════════════════════════════

describe("F-01 report --compare escapa el baseline malicioso (e2e)", () => {
  it("el HTML generado no contiene <script> crudo del baseline", () => {
    const dir = tmpDir("f01");
    try {
      writeFileSync(join(dir, "base.md"), "# Base\n\nContenido de prueba.\n");
      const evil = "5</div><script>alert(document.domain)</script><div>";
      const baseline = {
        total_score: evil,
        effectiveScore: "7</div><script>alert(2)</script>",
        // Finding hostil: ejerce el camino `esc()` (findingMsg), que es el
        // único interpolado que NO pasa por la normalización numérica.
        findings: [{ ruleId: "zz-evil", severity: "fail", message: "<script>alert(9)</script>" }],
        breakdown: {
          structure: { score: "1</div><script>alert(3)</script>" },
          statistics: { score: 2 },
          quotations: { score: 3 },
          citations: { score: 4 },
          clarity: { score: 5 },
        },
      };
      writeFileSync(join(dir, "baseline-evil.json"), JSON.stringify(baseline));
      const { status, stderr } = run(
        ["report", "base.md", "--compare", "baseline-evil.json", "-o", "report.html"],
        { cwd: dir, env: { ...process.env, TOOLTICIAN_LICENSE_KEY: PRO_FORGED_KEY } }
      );
      assert.equal(status, 0, `report exit 0 (stderr: ${stderr})`);
      const html = readFileSync(join(dir, "report.html"), "utf8");
      assert.ok(html.includes("GEO Comparison"), "modo compare renderizado");
      // Propiedad de seguridad: ningún tag <script> crudo. La normalización
      // numérica (NaN → 0) elimina los scores maliciosos; el finding pasa
      // por esc() y solo puede aparecer como entidad.
      assert.ok(!html.includes("<script"), "sin tag <script> crudo del baseline");
      assert.ok(html.includes("&lt;script&gt;"), "findingMsg escapado con entidades (esc() vivo)");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// F-02 — SSRF: 169.254.0.0/16 (metadata cloud) y 100.64.0.0/10 (CGNAT)
// ═══════════════════════════════════════════════════════════════════════════

describe("F-02 fetchUrl bloquea link-local IPv4 y CGNAT", () => {
  it("169.254.169.254 (metadata service) se bloquea antes de conectar", async () => {
    await assert.rejects(
      () => fetchUrl("http://169.254.169.254/latest/meta-data/iam/security-credentials/"),
      /blocked/i,
      "el guard bloquea (no timeout de request)"
    );
  });

  it("100.64.0.1 (CGNAT) se bloquea por defensa", async () => {
    await assert.rejects(() => fetchUrl("http://100.64.0.1/"), /blocked/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// F-03 — SSRF: IPv4-mapped IPv6 y link-local IPv6 (fe80::/10)
// ═══════════════════════════════════════════════════════════════════════════

describe("F-03 fetchUrl bloquea IPv4-mapped y link-local IPv6", () => {
  it("::ffff:7f00:1 (loopback hex mapeado) se bloquea", async () => {
    await assert.rejects(() => fetchUrl("http://[::ffff:7f00:1]/"), /blocked/i);
  });

  it("::ffff:127.0.0.1 (loopback decimal mapeado) se bloquea", async () => {
    await assert.rejects(() => fetchUrl("http://[::ffff:127.0.0.1]/"), /blocked/i);
  });

  it("fe90::1 y febf::1 (link-local fe80::/10) se bloquean", async () => {
    await assert.rejects(() => fetchUrl("http://[fe90::1]/"), /blocked/i);
    await assert.rejects(() => fetchUrl("http://[febf::1]/"), /blocked/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// F-04 — Licencia Pro forjable (control comercial honor-system, documentado)
// ═══════════════════════════════════════════════════════════════════════════

describe("F-04 licencia Pro: honor-system declarado y forja funcional", () => {
  it("una clave de formato válido desbloquea report (comportamiento documentado)", () => {
    const dir = tmpDir("f04");
    try {
      writeFileSync(join(dir, "base.md"), "# Base\n\nContenido.\n");
      const { status } = run(["report", "base.md", "-o", "report.html"], {
        cwd: dir,
        env: { ...process.env, TOOLTICIAN_LICENSE_KEY: PRO_FORGED_KEY },
      });
      assert.equal(status, 0, "forja funcional: report corre (honor-system)");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("sin clave Pro el gate sigue activo (control negativo)", () => {
    const dir = tmpDir("f04");
    try {
      writeFileSync(join(dir, "base.md"), "# Base\n\nContenido.\n");
      const env = { ...process.env };
      delete env.TOOLTICIAN_LICENSE_KEY;
      const { status, stderr } = run(["report", "base.md", "-o", "report.html"], {
        cwd: dir,
        env,
      });
      assert.notEqual(status, 0, "report sin clave sale != 0");
      assert.ok(stderr.includes("Pro license"), "mensaje del gate en stderr");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("docs/free-vs-pro.md declara el modelo honor-system", () => {
    const doc = readFileSync(join(repoRoot, "docs/free-vs-pro.md"), "utf8");
    assert.ok(doc.includes("honor system"), "declaración honor-system en docs");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// F-05 — Modo JSON de audit silenciaba fallos de archivo (exit 0, stderr vacío)
// ═══════════════════════════════════════════════════════════════════════════

describe("F-05 audit reporta fallos parciales (JSON y texto)", () => {
  function makeUnreadablePair() {
    const dir = tmpDir("f05");
    writeFileSync(join(dir, "ok.md"), "# OK doc\n\nSome content.\n");
    const bad = join(dir, "bad.md");
    writeFileSync(bad, "# Bad doc\n");
    chmodSync(bad, 0o000);
    return { dir, bad };
  }

  it("audit -f json con fallo parcial → exit != 0 y stderr no vacío", (t) => {
    if (typeof process.getuid === "function" && process.getuid() === 0) {
      // chmod 0o000 no impide la lectura a root: el fixture no aplica.
      // El caso de archivo inexistente (abajo) cubre el contrato para root.
      t.skip("chmod 0o000 no impide la lectura a root");
      return;
    }
    const { dir, bad } = makeUnreadablePair();
    try {
      const ok = join(dir, "ok.md");
      const { status, stderr, stdout } = run(["audit", ok, bad, "--format", "json"]);
      assert.notEqual(status, 0, "exit != 0 con fallos parciales en JSON");
      assert.ok(stderr.includes("Error auditing"), "diagnóstico en stderr");
      const parsed = JSON.parse(stdout);
      assert.ok(
        typeof parsed.total_score === "number" || typeof parsed.effectiveScore === "number",
        "payload JSON con el reporte del éxito"
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("modo texto con fallo parcial también sale != 0", (t) => {
    if (typeof process.getuid === "function" && process.getuid() === 0) {
      t.skip("chmod 0o000 no impide la lectura a root");
      return;
    }
    const { dir, bad } = makeUnreadablePair();
    try {
      const ok = join(dir, "ok.md");
      const { status, stderr } = run(["audit", ok, bad]);
      assert.notEqual(status, 0, "exit != 0 en modo texto");
      assert.ok(stderr.includes("Error auditing"), "diagnóstico en stderr");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("archivo inexistente en modo mixto → exit != 0 y stderr (F-05 residual)", () => {
    // Residual descubierto en la pasada de verificación 2026-08-01: el
    // discovery descartaba en silencio un path explícito inexistente cuando
    // había otros archivos válidos (exit 0, stderr vacío, gate en verde).
    // Funciona para cualquier usuario (no depende de permisos de archivo).
    const dir = tmpDir("f05b");
    try {
      writeFileSync(join(dir, "ok.md"), "# OK doc\n\nSome content.\n");
      const missing = join(dir, "missing.md");
      const { status, stderr } = run(["audit", join(dir, "ok.md"), missing, "--format", "json"]);
      assert.notEqual(status, 0, "exit != 0 con path inexistente en modo mixto");
      assert.ok(stderr.includes(missing), "stderr menciona el archivo inexistente");
      assert.ok(stderr.includes("does not exist"), "diagnóstico claro");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// F-06 — Score-gaming: la banda ≥85 se relabeleó (label neutral, id estable)
// ═══════════════════════════════════════════════════════════════════════════

describe("F-06 banda v2: label neutral con id de contract estable", () => {
  it("contenido fabricado alcanza la banda alta pero con label neutral", () => {
    const { status, stdout } = run([
      "audit",
      "tests/fixtures/audit-v2/adversarial/style-markers-gamed.md",
      "--format",
      "json",
    ]);
    assert.equal(status, 0);
    const report = JSON.parse(stdout);
    assert.equal(report.readinessBand, "production-ready", "id de banda estable (contract JSON)");
    assert.equal(report.readinessLabel, "Strong Style Markers", "label neutral");
    assert.ok(
      !report.readinessLabel.includes("Production-Ready"),
      "sin falsa precisión 'Production-Ready'"
    );
    assert.ok(
      report.effectiveScore >= 85,
      "documenta que la banda alta es alcanzable sin veracidad"
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// F-07 — Números de versión/puerto/endpoint contaban como estadísticas
// ═══════════════════════════════════════════════════════════════════════════

describe("F-07 versiones/puertos/IDs no cuentan como estadísticas (e2e)", () => {
  it("documento solo con identificadores técnicos → statistics.score === 0", () => {
    const dir = tmpDir("f07");
    try {
      writeFileSync(
        join(dir, "tech.md"),
        [
          "# Technical Reference",
          "",
          "According to the docs, version 22 is deployed on endpoint 42,",
          "listening on port 8080 with id 12345.",
          "",
          "The system runs build 101 on release 3.",
          "",
        ].join("\n")
      );
      const { status, stdout } = run(["audit", join(dir, "tech.md"), "--format", "json"]);
      assert.equal(status, 0);
      const report = JSON.parse(stdout);
      assert.equal(report.dimensions.statistics.score, 0, "sin stats por versiones/puertos/IDs");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// F-08 — hasSourcesSection por keyword global sumaba +5 citations
// ═══════════════════════════════════════════════════════════════════════════

describe("F-08 sección de sources real (no keyword casual) (e2e)", () => {
  it("mención casual de 'sources' sin links → citations.score === 0", () => {
    const dir = tmpDir("f08");
    try {
      writeFileSync(
        join(dir, "casual.md"),
        [
          "# Overview",
          "",
          "Many sources agree that this topic is well understood.",
          "",
          "No references section here.",
          "",
        ].join("\n")
      );
      const { status, stdout } = run(["audit", join(dir, "casual.md"), "--format", "json"]);
      assert.equal(status, 0);
      const report = JSON.parse(stdout);
      assert.equal(report.dimensions.citations.score, 0, "sin +5 por keyword en prosa");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("control positivo: sección Sources real con links sí puntúa", () => {
    const dir = tmpDir("f08b");
    try {
      writeFileSync(
        join(dir, "real.md"),
        [
          "# Real document",
          "",
          "## Sources",
          "",
          "- [Example](https://example.com)",
          "- [Another](https://example.org)",
          "",
        ].join("\n")
      );
      const { status, stdout } = run(["audit", join(dir, "real.md"), "--format", "json"]);
      assert.equal(status, 0);
      const report = JSON.parse(stdout);
      assert.ok(
        report.dimensions.citations.score > 0,
        "sección real de sources con links puntúa (el detector sigue vivo)"
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// F-09 — Inyección markdown en llms.txt + URLs sin codificar
// ═══════════════════════════════════════════════════════════════════════════

describe("F-09 llms.txt y sitemap escapan títulos hostiles y codifican URLs (e2e)", () => {
  it("título hostil no inyecta link; URL con espacios se codifica (%20)", () => {
    const dir = tmpDir("f09");
    try {
      const src = join(dir, "src");
      const outLlms = join(dir, "out-llms");
      const outMap = join(dir, "out-sitemap");
      mkdirSync(src);
      mkdirSync(outLlms);
      mkdirSync(outMap);
      writeFileSync(
        join(src, "mi página con espacios.md"),
        [
          "# Fraud](https://evil.example)",
          "",
          "Contenido normal con [un link bueno](https://good.example.org/).",
          "",
        ].join("\n")
      );

      // cwd = dir: los directorios de salida deben vivir dentro del cwd
      // (guarda de escritura F-12-adjacent); las rutas src van absolutas.
      const llms = run(
        [
          "llmstxt",
          "generate",
          join(src, "mi página con espacios.md"),
          "--output",
          "out-llms",
          "--base-url",
          "https://example.com",
        ],
        { cwd: dir }
      );
      assert.equal(llms.status, 0, `llmstxt exit 0 (stderr: ${llms.stderr})`);
      const llmsTxt = readFileSync(join(outLlms, "llms.txt"), "utf8");
      assert.ok(
        !llmsTxt.includes("](https://evil.example)"),
        "sin cierre de link inyectado a dominio arbitrario"
      );
      assert.ok(llmsTxt.includes("%20"), "URL con espacios codificada en llms.txt");

      const sitemap = run(
        [
          "sitemap",
          "generate",
          join(src, "mi página con espacios.md"),
          "--output",
          "out-sitemap",
          "--base-url",
          "https://example.com",
        ],
        { cwd: dir }
      );
      assert.equal(sitemap.status, 0, `sitemap exit 0 (stderr: ${sitemap.stderr})`);
      const sitemapXml = readFileSync(join(outMap, "sitemap.xml"), "utf8");
      assert.ok(sitemapXml.includes("%20"), "URL codificada en sitemap.xml");
      assert.ok(
        !/<loc>[^<]* [^<]*<\/loc>/.test(sitemapXml),
        "ningún <loc> con espacios crudos (RFC 3986)"
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// F-10 — Paridad Node/Python v1 para contenido no-Latin (headings \S)
// ═══════════════════════════════════════════════════════════════════════════

describe("F-10 paridad Node/Python para headings no-Latin (e2e)", () => {
  for (const name of ["rtl", "cjk", "cyr"]) {
    it(`${name}.md: total_score idéntico entre Node y Python`, () => {
      const filepath = join(repoRoot, "tests", "fixtures", `${name}.md`);
      const node = JSON.parse(
        execFileSync(
          process.execPath,
          [cliPath, "audit", filepath, "--format", "json", "--model", "v1"],
          {
            cwd: repoRoot,
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"],
          }
        )
      );
      const python = JSON.parse(
        execFileSync("python3", [PY_SCRIPT, "audit", filepath, "--format", "json"], {
          cwd: repoRoot,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        })
      );
      // Valores absolutos fijados (spec documenta 23=23=23): una paridad que
      // regresa "en conjunto" (p. ej. ambos dejan de detectar headings
      // no-Latin) también debe fallar, no solo la divergencia relativa.
      assert.equal(node.total_score, 23, "total Node v1 = 23 (documentado en spec)");
      assert.equal(node.total_score, python.total_score, "total_score paridad");
      assert.equal(node.breakdown.structure.score, 3, "structure Node v1 = 3 (documentado)");
      assert.equal(
        node.breakdown.structure.score,
        python.breakdown.structure.score,
        "dimensión estructura paridad"
      );
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// F-11 — Amplificación sin tope en modo sitemap (sub-sitemaps ilimitados)
//
// NOTA DE DESVIACIÓN (entorno): el e2e CLI con servidor loopback NO es viable
// en este entorno sandboxed — el TCP loopback entre procesos no entrega
// conexiones (verificado: servidor http/https en 127.0.0.1 recibe 0
// conexiones de un proceso hijo; idéntico al EPROTO TLS documentado en el
// ciclo de remediación). Además, el modo `technical --sitemap` exige https://
// incondicionalmente. Por eso la verificación usa `collectSubSitemapPageUrls`,
// la función real del fix a la que delega el CLI (bin/cli.js), con fetch
// inyectable — la misma técnica del test de regresión commitado.
// ═══════════════════════════════════════════════════════════════════════════

describe("F-11 tope de 100 fetches de sub-sitemaps (collectSubSitemapPageUrls)", () => {
  it("índice con 150 sub-sitemaps → exactamente 100 fetches, 50 descartados", async () => {
    const subs = Array.from({ length: 150 }, (_, i) => ({
      loc: `http://example.test/sub-${i}.xml`,
    }));
    const warnings = [];
    const fetchFn = async (url) => {
      const n = url.match(/sub-(\d+)/)[1];
      return {
        html: `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>http://example.test/page-${n}.html</loc></url></urlset>`,
      };
    };

    const { pageUrls, fetched, skipped } = await collectSubSitemapPageUrls(subs, {
      fetchFn,
      onWarn: (m) => warnings.push(m),
    });

    assert.equal(fetched, 100, "tope de 100 fetches (no 150)");
    assert.equal(skipped, 50, "50 sub-sitemaps restantes descartados");
    assert.equal(pageUrls.length, 100, "una URL de página por sub-sitemap fetcheado");
    assert.ok(
      warnings.some((w) => w.includes("limit reached")),
      "warning de tope emitido"
    );
  });

  it("índices anidados cuentan contra el mismo tope", async () => {
    const level1 = Array.from({ length: 60 }, (_, i) => ({
      loc: `http://example.test/l1-${i}.xml`,
    }));
    const fetchFn = async (url) => {
      const m = url.match(/l1-(\d+)/);
      if (m) {
        const i = Number(m[1]);
        const nested = Array.from({ length: 2 }, (_, k) => ({
          loc: `http://example.test/l2-${i}-${k}.xml`,
        }));
        return {
          html: `<?xml version="1.0"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${nested
            .map((s) => `<sitemap><loc>${s.loc}</loc></sitemap>`)
            .join("")}</sitemapindex>`,
        };
      }
      return {
        html: `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>http://example.test/${url.match(/l2-(.+)/)[1]}.html</loc></url></urlset>`,
      };
    };

    const { fetched, skipped } = await collectSubSitemapPageUrls(level1, { fetchFn });

    assert.ok(fetched <= 100, `fetches totales acotados: ${fetched}`);
    assert.ok(skipped > 0, "el exceso se descarta contra el tope global");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// F-12 — `technical -o` sin guarda de cwd (inconsistencia de contrato)
// ═══════════════════════════════════════════════════════════════════════════

describe("F-12 technical -o fuera de cwd se rechaza (e2e)", () => {
  it("ruta absoluta fuera de cwd → exit != 0 y sin escritura", () => {
    const escapePath = join(tmpdir(), `geo-e2e-escape-${process.pid}.json`);
    try {
      const { status } = run([
        "technical",
        "tests/fixtures/audit-v2/editorial/tech-blog.md",
        "--format",
        "json",
        "-o",
        escapePath,
      ]);
      assert.notEqual(status, 0, "exit != 0 con -o fuera de cwd");
      assert.ok(!existsSync(escapePath), "archivo no escrito fuera de cwd");
    } finally {
      rmSync(escapePath, { force: true });
    }
  });

  it("technical -o dentro de cwd sigue funcionando (control positivo)", () => {
    // Sin este control, el test negativo también pasaría si la guarda se
    // volviera sobre-estricta (rechazar hasta las escrituras legítimas).
    const dir = tmpDir("f12");
    try {
      const { status } = run(
        [
          "technical",
          join(repoRoot, "tests/fixtures/audit-v2/editorial/tech-blog.md"),
          "--format",
          "json",
          "-o",
          "out.json",
        ],
        { cwd: dir }
      );
      assert.equal(status, 0, "escritura dentro de cwd sigue funcionando");
      assert.ok(existsSync(join(dir, "out.json")), "archivo escrito dentro de cwd");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// F-13 — Template GitLab: dotenv fantasma + comentario Pro falso
// ═══════════════════════════════════════════════════════════════════════════

describe("F-13 template GitLab: dotenv en job concreto, sin Pro falso", () => {
  it("el artifact dotenv vive solo en el job concreto que crea el archivo", () => {
    const content = readFileSync(join(repoRoot, "ci-templates/gitlab-ci.yml"), "utf8");
    // Extraer el bloque del job hidden por regex (hasta el siguiente job de
    // nivel superior) — no depende del orden de los jobs en el archivo: si
    // se reordenara, el slicing por posición sería trivialmente verdadero.
    const hiddenBlock = content.match(/^\.geo-opt-audit:[\s\S]*?(?=^[a-zA-Z][\w-]*:)/m)?.[0] ?? "";
    assert.ok(hiddenBlock.length > 0, "bloque hidden .geo-opt-audit presente");
    assert.ok(!hiddenBlock.includes("dotenv"), "job hidden sin artifact dotenv");
    // El dotenv debe declararse en algún lugar fuera del job hidden (el job
    // concreto que genera el archivo) — independiente del orden.
    const outsideHidden = content.replace(hiddenBlock, "");
    assert.ok(
      outsideHidden.includes("dotenv: geo-opt-env.env"),
      "dotenv declarado fuera del job hidden (job concreto)"
    );
  });

  it("GEO_OPT_RECURSIVE no se anuncia como Pro", () => {
    const content = readFileSync(join(repoRoot, "ci-templates/gitlab-ci.yml"), "utf8");
    assert.ok(
      !/GEO_OPT_RECURSIVE[^\n]*\(Pro\)/.test(content),
      "sin '(Pro)' junto a GEO_OPT_RECURSIVE"
    );
    assert.ok(!content.includes("recursive (Pro)"), "sin claim 'recursive (Pro)'");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// F-14 — docs/free-vs-pro.md: "schema por stdout con branding" era falso
// ═══════════════════════════════════════════════════════════════════════════

describe("F-14 schema Community: sin branding (docs y runtime)", () => {
  it("free-vs-pro.md declara 'sin branding' para schema", () => {
    const doc = readFileSync(join(repoRoot, "docs/free-vs-pro.md"), "utf8");
    assert.ok(doc.includes("sin branding"), "docs sin claim de branding");
  });

  it("runtime: schema <f> article imprime JSON puro", () => {
    const { status, stdout, stderr } = run([
      "schema",
      "tests/fixtures/audit-v2/editorial/tech-blog.md",
      "article",
    ]);
    assert.equal(status, 0, `schema exit 0 (stderr: ${stderr})`);
    const parsed = JSON.parse(stdout); // lanza si no es JSON puro
    assert.ok(parsed["@context"], "JSON-LD con @context");
    const types = (parsed["@graph"] || []).map((n) => n["@type"]);
    assert.ok(types.includes("Article"), "JSON-LD con nodo Article");
    assert.ok(!stdout.includes("Tooltician"), "sin branding en stdout");
  });
});
