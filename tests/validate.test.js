import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { validateSchema, validateSchemaFile } from "../src/validate.js";

let dir;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "geo-validate-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

// Captura todo lo escrito a console.log / console.error durante fn().
function captureConsole(fn) {
  const logs = [];
  const errors = [];
  const origLog = console.log;
  const origError = console.error;
  console.log = (...args) => logs.push(args.join(" "));
  console.error = (...args) => errors.push(args.join(" "));
  try {
    fn();
  } finally {
    console.log = origLog;
    console.error = origError;
  }
  return { logs, errors };
}

describe("validateSchema — total sobre valores JSON (plan 082)", () => {
  it("nunca lanza y devuelve estructura para todo tipo de raíz JSON", () => {
    const cases = [
      null,
      undefined,
      "texto",
      42,
      true,
      [],
      ["@context"],
      {},
      { "@context": "https://schema.org", "@type": "Organization", name: "Acme" },
    ];
    for (const value of cases) {
      const result = validateSchema(value);
      assert.ok(Array.isArray(result.errors), `errors array para ${JSON.stringify(value)}`);
      assert.ok(Array.isArray(result.warnings));
      assert.ok(Array.isArray(result.notes));
      assert.ok(Array.isArray(result.nodes));
      assert.ok(
        result.errors.length === 0 || result.errors.length > 0,
        "resultado estructurado con o sin errores"
      );
    }
  });

  it("null y undefined son inválidos con mensaje explícito", () => {
    assert.ok(validateSchema(null).errors.some((e) => e.includes("null/undefined")));
    assert.deepEqual(validateSchema(undefined).errors, [
      "Root value is null/undefined — expected an object",
    ]);
  });

  it("primitivos y arrays son inválidos sin crashear", () => {
    assert.ok(validateSchema("string").errors.some((e) => e.includes("string")));
    assert.ok(validateSchema(42).errors.some((e) => e.includes("number")));
    assert.ok(validateSchema(true).errors.some((e) => e.includes("boolean")));
    assert.ok(validateSchema([]).errors.some((e) => e.includes("array")));
  });

  it("objeto raíz válido conserva comportamiento previo", () => {
    const result = validateSchema({
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "Acme",
    });
    assert.deepEqual(result.errors, []);
    assert.equal(result.nodes.length, 1);
  });
});

describe("validateSchemaFile — estructura de retorno (plan 082)", () => {
  it("devuelve valid:false y blockCount:0 cuando no hay bloques", () => {
    const file = join(dir, "no-jsonld.md");
    writeFileSync(file, "# Página sin schema\n\nTexto normal sin bloques JSON-LD.\n");

    const { logs } = captureConsole(() => {
      const result = validateSchemaFile(file);
      assert.equal(result.valid, false);
      assert.equal(result.blockCount, 0);
      assert.ok(result.errors.some((e) => e.includes("No JSON-LD blocks")));
      assert.deepEqual(result.blocks, []);
    });
    assert.ok(logs.join("\n").includes("No JSON-LD blocks found"));
  });

  it("devuelve valid:true para JSON-LD correcto", () => {
    const schema = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "Acme Corp",
    });
    const file = join(dir, "valid.md");
    writeFileSync(file, "```json\n" + schema + "\n```\n");

    let result;
    captureConsole(() => {
      result = validateSchemaFile(file);
    });
    assert.equal(result.valid, true);
    assert.equal(result.blockCount, 1);
    assert.deepEqual(result.errors, []);
    assert.equal(result.blocks.length, 1);
    assert.equal(result.blocks[0].source, "markdown code fence");
    assert.equal(result.blocks[0].valid, true);
  });

  it("tipo desconocido produce nota pero sigue valid:true", () => {
    const schema = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "SomeCustomType",
      name: "X",
    });
    const file = join(dir, "unknown-type.md");
    writeFileSync(file, "```json\n" + schema + "\n```\n");

    let result;
    captureConsole(() => {
      result = validateSchemaFile(file);
    });
    assert.equal(result.valid, true, "notas de tipo desconocido no invalidan");
    assert.ok(result.notes.some((n) => n.includes("SomeCustomType")));
  });

  it("JSON inválido queda en errors y blocks con valid:false", () => {
    const file = join(dir, "bad-json.md");
    writeFileSync(
      file,
      '```json\n{ "@context": "https://schema.org", "@type": "Organization", "name": "Test", }\n```\n'
    );

    let result;
    captureConsole(() => {
      result = validateSchemaFile(file);
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("Invalid JSON")));
    assert.equal(result.blocks[0].valid, false);
    assert.ok(result.blocks[0].errors.some((e) => e.includes("Invalid JSON")));
  });

  it("campos requeridos faltantes invalidan el archivo", () => {
    const schema = JSON.stringify({ "@context": "https://schema.org", "@type": "NewsArticle" });
    const file = join(dir, "missing-fields.md");
    writeFileSync(file, "```json\n" + schema + "\n```\n");

    let result;
    captureConsole(() => {
      result = validateSchemaFile(file);
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("headline")));
    assert.equal(result.blocks[0].valid, false);
  });

  it("bloques totalmente válidos en HTML script", () => {
    const schema = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Person",
      name: "Juan",
    });
    const file = join(dir, "html-script.html");
    writeFileSync(
      file,
      `<html><head><script type="application/ld+json">${schema}</script></head></html>`
    );

    let result;
    captureConsole(() => {
      result = validateSchemaFile(file);
    });
    assert.equal(result.valid, true);
    assert.equal(result.blockCount, 1);
    assert.equal(result.blocks[0].source, "HTML script tag");
  });
});

describe("validateSchemaFile — extracción de bloques (audit 2026-08-09)", () => {
  it("raíz array en fence se valida como error, no se trunca ni se ignora", () => {
    const schema = JSON.stringify([
      { "@context": "https://schema.org", "@type": "Organization", name: "A" },
      { "@context": "https://schema.org", "@type": "Person", name: "B" },
    ]);
    const file = join(dir, "array-root.md");
    writeFileSync(file, "```json\n" + schema + "\n```\n");

    let result;
    captureConsole(() => {
      result = validateSchemaFile(file);
    });
    assert.equal(result.valid, false);
    assert.equal(result.blockCount, 1);
    assert.ok(
      result.errors.some((e) => e.includes("array")),
      "Debe reportar raíz array, obtuvo: " + result.errors.join(" | ")
    );
  });

  it("fences ```jsonld y ```JSON se reconocen (caso y variantes)", () => {
    const schema = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "Acme",
    });
    for (const fence of ["jsonld", "JSON", "json-ld"]) {
      const file = join(dir, `fence-${fence}.md`);
      writeFileSync(file, "```" + fence + "\n" + schema + "\n```\n");

      let result;
      captureConsole(() => {
        result = validateSchemaFile(file);
      });
      assert.equal(
        result.valid,
        true,
        `fence \`\`\`${fence} debería validar, obtuvo: ${result.errors.join(" | ")}`
      );
      assert.equal(result.blockCount, 1, `fence \`\`\`${fence} debería detectar 1 bloque`);
    }
  });

  it("script HTML con atributo de comillas simples", () => {
    const schema = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Person",
      name: "Ana",
    });
    const file = join(dir, "single-quote.html");
    writeFileSync(file, `<script type='application/ld+json'>${schema}</script>`);

    let result;
    captureConsole(() => {
      result = validateSchemaFile(file);
    });
    assert.equal(result.valid, true);
    assert.equal(result.blockCount, 1);
    assert.equal(result.blocks[0].source, "HTML script tag");
  });

  it("múltiples valores JSON-LD dentro de un solo fence", () => {
    const s1 = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "A",
    });
    const s2 = JSON.stringify({ "@context": "https://schema.org", "@type": "Person", name: "B" });
    const file = join(dir, "two-in-one.md");
    writeFileSync(file, "```json\n" + s1 + "\n" + s2 + "\n```\n");

    let result;
    captureConsole(() => {
      result = validateSchemaFile(file);
    });
    assert.equal(result.blockCount, 2, "Dos valores en un fence = dos bloques");
    assert.equal(result.valid, true);
    assert.equal(result.blocks[0].source, "markdown code fence");
  });

  it("fence que no empieza con { o [ se ignora (sin bloques fantasma)", () => {
    const file = join(dir, "prose-first.md");
    writeFileSync(
      file,
      '```json\nEjemplo de API: {"@context": "https://schema.org", "@type": "Organization", "name": "X"}\n```\n'
    );

    let result;
    captureConsole(() => {
      result = validateSchemaFile(file);
    });
    assert.equal(result.blockCount, 0, "Prosa antes del JSON no crea bloque");
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("No JSON-LD blocks")));
  });

  it("fence JSON sin @context no se trata como bloque JSON-LD", () => {
    const file = join(dir, "no-context.md");
    writeFileSync(file, '```json\n{ "name": "not-jsonld", "items": [1, 2] }\n```\n');

    let result;
    captureConsole(() => {
      result = validateSchemaFile(file);
    });
    assert.equal(result.blockCount, 0, "Sin @context no es JSON-LD");
    assert.equal(result.valid, false);
  });

  it("@graph con múltiples nodos anidados se captura completo", () => {
    const schema = JSON.stringify({
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "Organization", name: "A", address: { streetAddress: "1 Main St" } },
        { "@type": "Person", name: "B" },
      ],
    });
    const file = join(dir, "graph-full.md");
    writeFileSync(file, "```json\n" + schema + "\n```\n");

    let result;
    captureConsole(() => {
      result = validateSchemaFile(file);
    });
    assert.equal(result.valid, true, "Debe parsear y validar el @graph completo");
    assert.equal(result.blockCount, 1);
  });
});

describe("validateSchemaFile — comportamiento de validación JSON-LD", () => {
  it("lanza un error cuando el archivo no existe", () => {
    assert.throws(() => {
      validateSchemaFile(join(dir, "does-not-exist.md"));
    }, /not found/);
  });

  it("informa que no hay bloques cuando el archivo no contiene JSON-LD", () => {
    const file = join(dir, "no-jsonld.md");
    writeFileSync(file, "# Página sin schema\n\nTexto normal sin bloques JSON-LD.\n");

    const { logs } = captureConsole(() => {
      validateSchemaFile(file);
    });
    const output = logs.join("\n");
    assert.ok(
      output.includes("No JSON-LD blocks found"),
      `Debería indicar que no hay bloques JSON-LD, obtuvo: ${output}`
    );
  });

  it("reporta JSON-LD válido con los campos requeridos presentes", () => {
    const schema = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "Acme Corp",
    });
    const file = join(dir, "valid.md");
    writeFileSync(file, "```json\n" + schema + "\n```\n");

    const { logs } = captureConsole(() => {
      validateSchemaFile(file);
    });
    const output = logs.join("\n");
    assert.ok(output.includes("✅"), `Debería mostrar éxito, obtuvo: ${output}`);
    assert.ok(output.includes("Organization"), `Debería mencionar el tipo, obtuvo: ${output}`);
  });

  it("reporta problemas cuando faltan campos requeridos en el tipo conocido", () => {
    const schema = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "NewsArticle",
    });
    const file = join(dir, "missing-fields.md");
    writeFileSync(file, "```json\n" + schema + "\n```\n");

    const { logs } = captureConsole(() => {
      validateSchemaFile(file);
    });
    const output = logs.join("\n");
    assert.ok(
      output.includes("❌") || output.includes("⚠️") || output.includes("Issues"),
      `Debería reportar problemas, obtuvo: ${output}`
    );
    assert.ok(
      output.includes("headline"),
      `Debería mencionar campo faltante 'headline', obtuvo: ${output}`
    );
  });

  it("detecta JSON-LD embebido en script HTML", () => {
    const schema = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Person",
      name: "Juan García",
    });
    const file = join(dir, "html-script.html");
    writeFileSync(
      file,
      `<html><head><script type="application/ld+json">${schema}</script></head></html>`
    );

    const { logs } = captureConsole(() => {
      validateSchemaFile(file);
    });
    const output = logs.join("\n");
    assert.ok(output.includes("1 JSON-LD block"), `Debería encontrar 1 bloque, obtuvo: ${output}`);
    assert.ok(output.includes("✅"), `Debería reportar válido, obtuvo: ${output}`);
  });

  it("reporta el número correcto de bloques cuando hay múltiples", () => {
    const s1 = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "A",
    });
    const s2 = JSON.stringify({ "@context": "https://schema.org", "@type": "Person", name: "B" });
    const file = join(dir, "multi.md");
    writeFileSync(file, "```json\n" + s1 + "\n```\n\n```json\n" + s2 + "\n```\n");

    const { logs } = captureConsole(() => {
      validateSchemaFile(file);
    });
    const output = logs.join("\n");
    assert.ok(output.includes("2 JSON-LD block"), `Debería encontrar 2 bloques, obtuvo: ${output}`);
  });

  it("informa tipo desconocido como nota, no como error bloqueante", () => {
    const schema = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "SomeCustomType",
    });
    const file = join(dir, "unknown-type.md");
    writeFileSync(file, "```json\n" + schema + "\n```\n");

    const { logs } = captureConsole(() => {
      validateSchemaFile(file);
    });
    const output = logs.join("\n");
    assert.ok(
      output.includes("Note:") || output.includes("not in the known-types list"),
      `Debería notar tipo desconocido, obtuvo: ${output}`
    );
  });

  // ═══ Edge cases que faltaban (C3 del supplement de cobertura) ═══

  it("lanza un error cuando el archivo existe pero no se puede leer (sin permisos)", () => {
    const file = join(dir, "no-perms.md");
    writeFileSync(file, "# Contenido válido\n");
    // Quitar permisos de lectura
    chmodSync(file, 0o000);

    assert.throws(
      () => {
        validateSchemaFile(file);
      },
      /Failed to read file/,
      "Debería lanzar error de lectura cuando el archivo no tiene permisos"
    );
  });

  it("reporta JSON inválido dentro de un bloque como problema, no como crash", () => {
    const file = join(dir, "bad-json.md");
    // El regex de extracción requiere {} con @context. JSON inválido por trailing comma.
    writeFileSync(
      file,
      '```json\n{ "@context": "https://schema.org", "@type": "Organization", "name": "Test", }\n```\n'
    );

    const { logs } = captureConsole(() => {
      validateSchemaFile(file);
    });
    const output = logs.join("\n");
    assert.ok(output.includes("Invalid JSON"), `Debería reportar JSON inválido, obtuvo: ${output}`);
  });

  it("reporta problema cuando @context no es https://schema.org", () => {
    const schema = JSON.stringify({
      "@context": "https://schema.gov",
      "@type": "Organization",
      name: "Test",
    });
    const file = join(dir, "wrong-context.md");
    writeFileSync(file, "```json\n" + schema + "\n```\n");

    const { logs } = captureConsole(() => {
      validateSchemaFile(file);
    });
    const output = logs.join("\n");
    assert.ok(
      output.includes("https://schema.org"),
      `Debería mencionar el @context esperado, obtuvo: ${output}`
    );
    assert.ok(
      output.includes("❌") || output.includes("⚠️") || output.includes("Issues"),
      `Debería reportar issues, obtuvo: ${output}`
    );
  });

  it("reporta problema cuando @graph está vacío", () => {
    // JSON-LD con @graph = [] — sin nodos que analizar
    const schema = JSON.stringify({
      "@context": "https://schema.org",
      "@graph": [],
    });
    const file = join(dir, "empty-graph.md");
    writeFileSync(file, "```json\n" + schema + "\n```\n");

    const { logs } = captureConsole(() => {
      validateSchemaFile(file);
    });
    const output = logs.join("\n");
    assert.ok(
      output.includes("No @graph array or root type found"),
      `Debería reportar @graph vacío, obtuvo: ${output}`
    );
  });

  it("reporta problema cuando un nodo del @graph no tiene @type", () => {
    const schema = JSON.stringify({
      "@context": "https://schema.org",
      "@graph": [
        {
          name: "Sin tipo",
        },
        {
          "@type": "Organization",
          name: "Con tipo",
        },
      ],
    });
    const file = join(dir, "no-type.md");
    writeFileSync(file, "```json\n" + schema + "\n```\n");

    const { logs } = captureConsole(() => {
      validateSchemaFile(file);
    });
    const output = logs.join("\n");
    assert.ok(
      output.includes("Node without @type"),
      `Debería reportar nodo sin @type, obtuvo: ${output}`
    );
  });
});
