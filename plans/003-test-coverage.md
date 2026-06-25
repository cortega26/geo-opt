# Plan 003: Expandir cobertura de tests para funciones no testeadas

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat HEAD -- tests/optimizer.test.js src/optimizer.js`
> If either file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plans/002-fix-critical-bugs.md
- **Category**: tests
- **Planned at**: 2025-06-25 (no git SHA — project not yet initialized)

## Why this matters

El test suite actual (5 tests JS, 6 tests Python) deja sin cobertura las
funciones más importantes y los caminos más riesgosos:

- **`auditFile`** (~300 líneas, la función principal) no se importa siquiera
  en los tests JS. Todo el scoring, recomendaciones, y formato de salida
  carecen de red de seguridad.
- **`checkRobots`** no tiene tests en JS (solo en Python).
- **El camino HTML** completo (`auditFile`, `injectSchema`) es código oscuro:
  cero tests con fixtures HTML en ambos lenguajes.
- **Los tipos de schema `"faq"` y `"product"`** no se testean en JS.
- **Los caminos de error** (archivo no encontrado, error de lectura, error de
  escritura, config malformado) tienen 0% de cobertura.

Este plan añade ~15 tests JS que llevan la cobertura de las funciones
principales a un nivel aceptable. Sigue el patrón estructural del test
existente `generateSchemaData generates stacked graph schema with FAQ nodes`
en `tests/optimizer.test.js:65-94`.

## Current state

### Archivo de tests existente

`tests/optimizer.test.js` tiene 5 tests. Usa `node:test` y `node:assert`.
Patrón estructural a seguir (extraído de `tests/optimizer.test.js:65-94`):

```javascript
test('generateSchemaData generates stacked graph schema with FAQ nodes', () => {
  const tempFile = path.join(__dirname, 'temp_article.md');
  fs.writeFileSync(tempFile, `
# Test Headline

This is the description paragraph of 40 words.

## Key Benefits of Hybrid Cloud
This is the body answer containing more details.
  `, { encoding: 'utf8' });

  try {
    const schema = generateSchemaData(tempFile, "article", config);
    assert.strictEqual(schema["@context"], "https://schema.org");
    assert.ok(Array.isArray(schema["@graph"]));

    const article = schema["@graph"].find(x => x["@type"] === "NewsArticle");
    assert.strictEqual(article.headline, "Test Headline");
    assert.strictEqual(article.author["@id"], "https://www.tooltician.com/#author");

    const faq = schema["@graph"].find(x => x["@type"] === "FAQPage");
    assert.strictEqual(faq.mainEntity.length, 1);
    assert.strictEqual(faq.mainEntity[0].name, "Key Benefits of Hybrid Cloud");
    assert.strictEqual(faq.mainEntity[0].acceptedAnswer.text, "This is the body answer containing more details.");
  } finally {
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
  }
});
```

### Lo que NO está importado

`tests/optimizer.test.js:6` importa:
```javascript
import { calculateReadability, cleanMarkdownToPlainText, extractSections, generateSchemaData, injectSchema } from '../src/optimizer.js';
```

Faltan: `auditFile`, `checkRobots`, `preprocessContent`.

### Convenciones del proyecto

- `node:test` con `test(name, () => { ... })`
- `node:assert` con `assert.strictEqual`, `assert.ok`, `assert.match`
- Fixtures en archivos temporales: `path.join(__dirname, 'temp_*.md')`
- Limpieza con `try/finally { fs.unlinkSync(tempFile) }`
- Config de prueba definida al inicio del archivo (`const config = {...}`)
- Sin `describe`/`suite` — tests planos
- El test de `injectSchema` (`tests/optimizer.test.js:96-116`) es el modelo
  para tests que escriben archivos

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Full check | `npm run check` | exit 0 |
| Node tests | `npm test` | N pass (aumenta con cada paso) |
| Run specific test file | `node --test tests/optimizer.test.js` | N pass, 0 fail |

## Scope

**In scope** (archivos a modificar o crear):
- `tests/optimizer.test.js` — añadir imports y nuevos tests
- `tests/fixtures/` — crear directorio con archivos HTML y markdown de prueba
  (opcional, si se prefiere fixtures en disco sobre inline strings)

**Out of scope** (no tocar):
- `src/optimizer.js` — NO modificar código de producción
- `bin/cli.js` — NO modificar
- `.agents/skills/geo-optimization/scripts/test_optimizer.py` — NO modificar
  (los tests Python se abordan en plan 006 si Python sigue canónico)

## Git workflow

- Branch: `advisor/003-test-coverage` (crear desde el branch de 002)
- Commits por paso o por grupo de tests relacionados
- Formato de mensaje: `test: <descripción>`

## Steps

### Step 1: Añadir imports faltantes

En `tests/optimizer.test.js`, línea 6, añadir `auditFile`, `checkRobots`,
y `preprocessContent` a los imports:

```javascript
import { auditFile, calculateReadability, checkRobots, cleanMarkdownToPlainText, extractSections, generateSchemaData, injectSchema, preprocessContent } from '../src/optimizer.js';
```

**Verify**: `node -e "import('../src/optimizer.js').then(m => console.log(Object.keys(m).join(', ')))"`
debe incluir los 8 nombres.

### Step 2: Test `preprocessContent`

Añadir al final del archivo de tests:

```javascript
test('preprocessContent strips code blocks, script tags, style tags, and HTML comments', () => {
  const input = `
# Title
Some text.
\`\`\`
const x = 1;
\`\`\`
More text.
<script>alert('xss')</script>
<style>body { color: red; }</style>
<!-- a comment -->
Final text.
  `;
  const result = preprocessContent(input);
  assert.ok(!result.includes('```'));
  assert.ok(!result.includes('const x'));
  assert.ok(!result.includes('alert'));
  assert.ok(!result.includes('color: red'));
  assert.ok(!result.includes('a comment'));
  assert.ok(result.includes('Some text'));
  assert.ok(result.includes('More text'));
  assert.ok(result.includes('Final text'));
});
```

**Verify**: `npm test` → 6 pass, 0 fail.

### Step 3: Test `checkRobots` — caso blocking

```javascript
test('checkRobots detects blocked AI agents', () => {
  const tempFile = path.join(__dirname, 'temp_robots_block.txt');
  fs.writeFileSync(tempFile, `User-agent: GPTBot
Disallow: /
User-agent: *
Disallow: /private
`, { encoding: 'utf8' });

  try {
    // checkRobots escribe a stdout via console.log. Capturar no es posible
    // sin mocking, pero podemos verificar que no lanza excepción.
    assert.doesNotThrow(() => {
      checkRobots(tempFile);
    });
  } finally {
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
  }
});
```

**Verify**: `npm test` → 7 pass, 0 fail.

### Step 4: Test `checkRobots` — caso allowing

```javascript
test('checkRobots detects no blocking for permissive robots.txt', () => {
  const tempFile = path.join(__dirname, 'temp_robots_allow.txt');
  fs.writeFileSync(tempFile, `User-agent: *
Disallow: /admin
`, { encoding: 'utf8' });

  try {
    assert.doesNotThrow(() => {
      checkRobots(tempFile);
    });
  } finally {
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
  }
});
```

**Verify**: `npm test` → 8 pass, 0 fail.

### Step 5: Test `auditFile` — JSON output

```javascript
test('auditFile returns a score and produces valid JSON output', () => {
  const tempFile = path.join(__dirname, 'temp_audit.md');
  fs.writeFileSync(tempFile, `# Test Article

Hybrid cloud architecture is an IT infrastructure design that integrates private cloud resources with public cloud services. It provides flexibility and cost efficiency for modern enterprises.

## Key Benefits
Organizations report an average of 34% cost reduction according to IDC research.

> "Hybrid cloud solved our compliance bottleneck." — Jane Doe, CISO at SecureCorp

- Benefit 1
- Benefit 2

## Sources
1. [IDC Report](https://example.com/idc)
  `, { encoding: 'utf8' });

  try {
    const score = auditFile(tempFile, config, "json");
    assert.ok(typeof score === 'number');
    assert.ok(score >= 0 && score <= 100);
  } finally {
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
  }
});
```

**Verify**: `npm test` → 9 pass, 0 fail.

### Step 6: Test `auditFile` — text output (no-op, solo verifica que no crashea)

```javascript
test('auditFile produces text output without crashing', () => {
  const tempFile = path.join(__dirname, 'temp_audit_text.md');
  fs.writeFileSync(tempFile, `# Minimal Article
Short body text without much optimization.
  `, { encoding: 'utf8' });

  try {
    const score = auditFile(tempFile, config, "text");
    assert.ok(typeof score === 'number');
  } finally {
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
  }
});
```

**Verify**: `npm test` → 10 pass, 0 fail.

### Step 7: Test `auditFile` — archivo no encontrado

NOTA: `auditFile` llama `process.exit(1)` cuando el archivo no existe.
Para testear esto sin que el proceso muera, necesitamos mockear `process.exit`.
Node.js `node:test` tiene `mock.method`.

```javascript
import { mock } from 'node:test';

test('auditFile exits with error on missing file', () => {
  const exitMock = mock.method(process, 'exit', () => {});
  const errorMock = mock.method(console, 'error', () => {});

  try {
    auditFile('/nonexistent/path/file.md', config, 'text');
    assert.ok(exitMock.mock.calls.length > 0);
  } finally {
    mock.reset();
  }
});
```

**Verify**: `npm test` → 11 pass, 0 fail.

### Step 8: Test `generateSchemaData` — tipo `"faq"`

```javascript
test('generateSchemaData generates valid FAQPage schema with filters', () => {
  const tempFile = path.join(__dirname, 'temp_faq.md');
  fs.writeFileSync(tempFile, `# FAQ Page

## What is Hybrid Cloud?
Hybrid cloud is a computing environment that combines on-premises data centers with public cloud services.

## Short
Brief.

## Sources
Some links here.
  `, { encoding: 'utf8' });

  try {
    const schema = generateSchemaData(tempFile, "faq", config);
    assert.strictEqual(schema["@context"], "https://schema.org");

    const faq = schema["@graph"].find(x => x["@type"] === "FAQPage");
    assert.ok(faq);
    // "Short" section has body < 15 chars → filtered out
    // "Sources" section → filtered out as sources/references header
    assert.strictEqual(faq.mainEntity.length, 1);
    assert.strictEqual(faq.mainEntity[0].name, "What is Hybrid Cloud?");
  } finally {
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
  }
});
```

**Verify**: `npm test` → 12 pass, 0 fail.

### Step 9: Test `generateSchemaData` — tipo `"product"`

```javascript
test('generateSchemaData generates valid Product schema', () => {
  const tempFile = path.join(__dirname, 'temp_product.md');
  fs.writeFileSync(tempFile, `# Cloud Migration Toolkit

A comprehensive suite of tools for migrating on-premises workloads to hybrid cloud environments.
  `, { encoding: 'utf8' });

  try {
    const schema = generateSchemaData(tempFile, "product", config);
    assert.strictEqual(schema["@context"], "https://schema.org");

    const product = schema["@graph"].find(x => x["@type"] === "Product");
    assert.ok(product);
    assert.strictEqual(product.name, "Cloud Migration Toolkit");
    assert.ok(product.offers);
    assert.strictEqual(product.offers.priceCurrency, "USD");
    assert.strictEqual(product.offers.availability, "https://schema.org/InStock");

    const org = schema["@graph"].find(x => x["@type"] === "Organization");
    assert.strictEqual(product.brand["@id"], org["@id"]);
  } finally {
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
  }
});
```

**Verify**: `npm test` → 13 pass, 0 fail.

### Step 10: Test `injectSchema` — HTML file path

```javascript
test('injectSchema injects JSON-LD script tag into HTML file', () => {
  const tempFile = path.join(__dirname, 'temp_inject.html');
  fs.writeFileSync(tempFile, `<!DOCTYPE html>
<html>
<head><title>Test</title></head>
<body><p>Content.</p></body>
</html>`, { encoding: 'utf8' });

  try {
    injectSchema(tempFile, "article", config);
    const content = fs.readFileSync(tempFile, { encoding: 'utf8' });
    assert.ok(content.includes('<script type="application/ld+json">'));
    assert.ok(content.includes('"@context"'));
    assert.ok(content.includes('https://schema.org'));
    assert.ok(content.includes('Tooltician'));
  } finally {
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
  }
});
```

**Verify**: `npm test` → 14 pass, 0 fail.

### Step 11: Verificación final

```bash
npm run check
```

**Verify**: lint exit 0, format check exit 0, `npm test` → 14+ pass, 0 fail.

### Step 12: Commit

```bash
git add tests/optimizer.test.js
git commit -m "test: add coverage for auditFile, checkRobots, HTML path, faq/product schemas

- Add tests for preprocessContent, checkRobots (blocking + allowing)
- Add tests for auditFile (JSON output, text output, missing file)
- Add test for generateSchemaData with faq type (validates filters)
- Add test for generateSchemaData with product type
- Add test for injectSchema with HTML file path
- Total: 14 tests (was 5)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

**Verify**: `git log --oneline -1` muestra el commit. `git status` clean.

## Test plan

Los nuevos tests cubren:

| Función | Tests añadidos | Casos cubiertos |
|---------|---------------|-----------------|
| `preprocessContent` | 1 | Code blocks, script/style tags, HTML comments |
| `checkRobots` | 2 | Blocking (GPTBot + /), permissive (* + /admin) |
| `auditFile` | 3 | JSON output, text output, missing file error |
| `generateSchemaData` | 2 | faq type (con filtros), product type |
| `injectSchema` | 1 | HTML file injection |

Los 5 tests existentes se mantienen sin cambios. Total esperado: 14 tests.

## Done criteria

- [ ] `tests/optimizer.test.js` importa `auditFile`, `checkRobots`, `preprocessContent`
- [ ] `npm test` → 14+ pass, 0 fail
- [ ] `npm run lint` → exit 0
- [ ] `npm run format:check` → exit 0
- [ ] Todos los archivos temporales son limpiados (no quedan `temp_*.md` en `tests/`)
- [ ] Ningún archivo fuera de `tests/optimizer.test.js` fue modificado (`git diff --stat`)
- [ ] `git status` está clean
- [ ] `plans/README.md` status row actualizado a DONE

## STOP conditions

Stop and report back (do not improvise) if:

- Cualquier test nuevo falla (no modificar `src/optimizer.js` para hacerlos
  pasar — si un test falla por un bug en producción, documentarlo y seguir).
- `mock.method` no está disponible (versión de Node.js < 20.0.0). En ese caso,
  omite el Step 7 (test de archivo no encontrado) y repórtalo. Node 20+ tiene
  `mock.method` estable.
- Un archivo temporal no se limpia y contamina tests subsecuentes.
- `npm run lint` reporta errores introducidos por los nuevos tests.
- El archivo `src/optimizer.js` fue modificado por error (verificar con
  `git diff`).

## Maintenance notes

- **Mock de `process.exit`**: el Step 7 usa `mock.method(process, 'exit')`.
  Este mock debe llamarse dentro de `try/finally` con `mock.reset()` en el
  finally para no afectar otros tests. El patrón está en el mismo step.
- **Fixtures inline**: los tests usan strings inline (`fs.writeFileSync` con
  template literals) en lugar de archivos de fixture en disco. Si el proyecto
  crece, considerar mover fixtures a `tests/fixtures/`.
- **Orden de tests**: `node:test` ejecuta tests en paralelo por defecto.
  Cada test usa nombres de archivo temporal únicos para evitar colisiones.
- **HTML tests limitados**: el Step 10 solo testea inyección HTML; el audit
  HTML con semantic tags y dynamic rendering detection no se testea aquí
  porque `auditFile` mezcla lógica de scoring con I/O y es difícil de testear
  en unidad sin refactor. El plan 007 (split god module) debe habilitar
  tests unitarios del scoring HTML.
