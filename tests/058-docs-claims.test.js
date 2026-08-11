import { describe, it } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, "..");

function read(rel) {
  return readFileSync(path.join(repoRoot, rel), "utf8");
}

// Plan 058 §6.2: documentation must match the runtime gates verified in
// 058-entitlements.test.js. The only Pro gates are `report`, `--no-branding`
// (on inject/report), and the four Pro schema types.

const communityCommands = [
  "audit",
  "technical",
  "schema",
  "validate",
  "inject",
  "robots audit",
  "robots generate",
  "llmstxt audit",
  "llmstxt generate",
  "sitemap generate",
  "generate-all",
  "badge",
  "init",
];

describe("Plan 058 §6.2 — docs no longer mark Community commands as Pro", () => {
  it("docs/free-vs-pro.md: Community commands are not marked Pro-only", () => {
    const text = read("docs/free-vs-pro.md");
    for (const cmd of communityCommands) {
      const cmdPattern = new RegExp(
        "`" + cmd.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "`[^\\n]*❌",
        "u"
      );
      assert.doesNotMatch(
        text,
        cmdPattern,
        `docs/free-vs-pro.md still marks "${cmd}" as Pro-only (Free ❌)`
      );
    }
  });

  it("docs/free-vs-pro.md: does not claim schema --no-branding exists as a Pro option", () => {
    const text = read("docs/free-vs-pro.md");
    assert.doesNotMatch(
      text,
      /schema[^\n]*--no-branding/u,
      "docs should not claim `schema --no-branding` — option not implemented"
    );
  });

  it("docs/commercial-licensing.md: distinction table matches runtime gates", () => {
    const text = read("docs/commercial-licensing.md");
    for (const cap of [
      "Auditoría recursiva",
      "audit --threshold",
      "Inyección JSON-LD",
      "robots.txt y llms.txt generación",
    ]) {
      const pattern = new RegExp(cap.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[^\\n]*❌", "u");
      assert.doesNotMatch(
        text,
        pattern,
        `commercial-licensing.md still marks "${cap}" as Community-❌`
      );
    }
  });
});

describe("Plan 058 §6.2 — architecture.md current-maturity is truthful", () => {
  it("does not claim the npm package is unreleased", () => {
    assert.doesNotMatch(
      read("docs/architecture.md"),
      /public npm package has not been released/u,
      "npm package IS published; remove this claim"
    );
  });

  it("does not claim V1 is the default scoring model", () => {
    assert.doesNotMatch(
      read("docs/architecture.md"),
      /V1 is the default scoring model/u,
      "v2 is now the default"
    );
  });

  it("does not claim v2 is only available via --model v2", () => {
    assert.doesNotMatch(
      read("docs/architecture.md"),
      /available only in Node\.js through `--model v2`/u,
      "v2 is the default; --model v2 is not the entry point"
    );
  });

  it("does not claim there is no supported technical CLI command", () => {
    assert.doesNotMatch(
      read("docs/architecture.md"),
      /no supported `technical` CLI command/u,
      "`technical` is a supported CLI command"
    );
  });

  it("was re-verified on or after 2026-07-22", () => {
    const text = read("docs/architecture.md");
    const match = text.match(/Last verified:.*?(\d{4}-\d{2}-\d{2})/u);
    assert.ok(match, "docs/architecture.md must carry a 'Last verified' date");
    // ISO dates compare lexically; this stays robust to any future month
    // and year instead of pinning the month.
    assert.ok(match[1] >= "2026-07-22", `Last verified date ${match[1]} is before 2026-07-22`);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Plan 091 — v2 is the documented default scoring model
// ═══════════════════════════════════════════════════════════════════════════

describe("Plan 091 — v2 is the documented default scoring model", () => {
  const currentDocs = [
    "docs/architecture.md",
    "docs/documentation-governance.md",
    "README.md",
    "README.es.md",
    ".agents/skills/geo-optimization/SKILL.md",
  ];

  it("architecture, governance and READMEs name v2 as the default", () => {
    assert.match(
      read("docs/architecture.md"),
      /V2 is the default scoring model/u,
      "architecture.md must state v2 is the default"
    );
    assert.match(
      read("docs/documentation-governance.md"),
      /v2 is the default scoring model/u,
      "documentation-governance.md must state v2 is the default"
    );
    assert.match(
      read("README.md"),
      /`v2` \(default, profile-aware\)/u,
      "README.md must document the v2 default"
    );
    assert.match(
      read("README.es.md"),
      /`v2` \(predeterminado, con conciencia de/u,
      "README.es.md must document the v2 default"
    );
  });

  it("no current document claims v1 is the default or a switch is pending", () => {
    const v1DefaultPatterns = [
      /v1\s+remains?\s+the\s+default/u,
      /v1\s+is\s+the\s+default/u,
      /default\s+switch\s+from\s+v1/u,
      /v1\/default/u,
      /v1[^\n]{0,40}default\s+scoring\s+model/u,
    ];
    for (const rel of currentDocs) {
      const text = read(rel);
      for (const pattern of v1DefaultPatterns) {
        assert.doesNotMatch(
          text,
          pattern,
          `${rel} still claims v1 as default or a pending switch (${pattern})`
        );
      }
    }
  });

  it("Python is not documented as v2-capable", () => {
    const architecture = read("docs/architecture.md");
    // The capability matrix scopes Python to the legacy v1 surface and
    // marks the v2 row Node-only.
    const v2Row = architecture.match(/V2 profiles and readiness[^\n]*/u);
    assert.ok(v2Row, "capability matrix must list the v2 row");
    assert.match(
      v2Row[0],
      /Node-only/u,
      "capability matrix must mark v2 profiles/readiness as Node-only"
    );
    assert.doesNotMatch(
      architecture,
      /Python[^\n]{0,60}\bV2\b[^\n]{0,40}(default|full|equivalent)/u,
      "no current doc may imply Python runs v2"
    );
  });

  it("v2 stays characterized as experimental and profile-aware, not a ranking oracle", () => {
    const architecture = read("docs/architecture.md");
    assert.match(
      architecture,
      /experimental and profile-aware/u,
      "v2 experimental characterization must remain"
    );
    assert.doesNotMatch(
      architecture,
      /predicts?\s+(citation|ranking|search)/u,
      "v2 must not be documented as a ranking/citation predictor"
    );
  });
});

describe("Plan 058 §6.2 — README tables match runtime", () => {
  for (const readme of ["README.md", "README.es.md"]) {
    it(`${readme}: command reference does not mark Community commands as Tier=Pro`, () => {
      const text = read(readme);
      for (const cmd of [
        "inject",
        "robots generate",
        "llmstxt generate",
        "sitemap generate",
        "generate-all",
      ]) {
        const rowPattern = new RegExp(
          "\\|\\s*`" + cmd.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[^\\n]*\\|\\s*Pro\\s*\\|",
          "u"
        );
        assert.doesNotMatch(
          text,
          rowPattern,
          `${readme}: "${cmd}" is marked Tier=Pro but runs Community-side`
        );
      }
    });

    it(`${readme}: capability table does not mark Community capabilities as Free=No`, () => {
      const text = read(readme);
      for (const cap of [
        "Audit multiple files",
        "Auditar múltiples archivos",
        "Quality thresholds for CI/CD",
        "Umbrales de calidad para CI/CD",
        "Inject JSON-LD into files",
        "Inyectar JSON-LD en archivos",
        "Generate `robots.txt`",
        "Generar `robots.txt`",
        "Generate `llms.txt`",
        "Generar `llms.txt`",
        "Generate `sitemap.xml`",
        "Generar `sitemap.xml`",
        "One-shot optimization package",
        "Paquete de optimización en un paso",
      ]) {
        const pattern = new RegExp(
          cap.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[^\\n]*\\|\\s*No\\s*\\|",
          "u"
        );
        assert.doesNotMatch(
          text,
          pattern,
          `${readme}: capability "${cap}" is marked Free=No but runs Community-side`
        );
      }
    });
  }
});

describe("Plan 058 §6.2 — README test-count badge is internally consistent", () => {
  // The badge is a moving target. node:test detects recursion and refuses to
  // run `node --test` from inside a test file, so we cannot compare the badge
  // against the live `npm test` count here. Instead:
  //   - This test asserts the badge URL number, the highlights-line number,
  //     and the dev-section number all agree (internal consistency).
  //   - The authoritative badge-vs-actual-count check lives in
  //     `scripts/verify-badges.js`, run standalone as
  //     `npm run test:verify` (NOT inside `npm test`, so no recursion). It is
  //     wired into `npm run check` and CI: one c8 run verifies BOTH the
  //     test-count and branch-coverage badges from the same suite run
  //     (Plan 087).
  // If the badge drifts, the standalone check fails; if the README numbers
  // disagree with each other, this test fails.
  function badgeNumber(text) {
    const m = text.match(/tests-(\d+)_passed/u) || text.match(/tests-(\d+)_pasados/u);
    assert.ok(m, "could not find tests-<n>_passed badge");
    return m[1];
  }

  it("README.md badge, highlights, and dev section agree on the test count", () => {
    const text = read("README.md");
    const n = badgeNumber(text);
    assert.match(
      text,
      new RegExp(`${n} tests across 167 suites`, "u"),
      "highlights line must match badge number"
    );
    assert.match(
      text,
      new RegExp(`${n} tests · 167 suites`, "u"),
      "dev section must match badge number"
    );
  });

  it("README.es.md badge, highlights, and dev section agree on the test count", () => {
    const text = read("README.es.md");
    const n = badgeNumber(text);
    assert.match(
      text,
      new RegExp(`${n} tests en 167 suites`, "u"),
      "highlights line must match badge number"
    );
    assert.match(
      text,
      new RegExp(`${n} tests · 167 suites`, "u"),
      "dev section must match badge number"
    );
  });

  it("README.md and README.es.md badge numbers agree", () => {
    assert.equal(badgeNumber(read("README.md")), badgeNumber(read("README.es.md")));
  });
});

describe("Plan 058 §6.2 — Pro-only surfaces are still documented as Pro", () => {
  it("docs/free-vs-pro.md keeps `report` documented as Pro-gated", () => {
    assert.match(read("docs/free-vs-pro.md"), /report/u);
  });
  for (const t of ["course", "event", "recipe", "howto"]) {
    it(`docs/free-vs-pro.md keeps schema type "${t}" as Pro`, () => {
      assert.match(read("docs/free-vs-pro.md"), new RegExp(t, "u"));
    });
  }
});

describe("Plan 058 §6.2 — schema stdout claim (audit F-14)", () => {
  it("free-vs-pro.md no longer claims schema prints 'con branding'", () => {
    const text = read("docs/free-vs-pro.md");
    const schemaLine = text
      .split("\n")
      .find((l) => l.includes("schema <file> <type>") && l.includes("Community"));
    assert.ok(schemaLine, "tabla comparativa debe tener la fila de schema");
    assert.ok(
      !schemaLine.includes("con branding"),
      "el runtime emite JSON puro por stdout: la tabla no debe decir 'con branding'"
    );
    assert.ok(schemaLine.includes("sin branding"), "debe declarar 'sin branding'");
  });
});
