# Plan 015: La lógica de inyección se unifica entre `injectSchema` y `batchInject`

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 4dff240..HEAD -- src/schema.js src/batch.js tests/optimizer.test.js`
> Si alguno de estos archivos cambió desde que este plan fue escrito, compara
> los fragmentos en "Current state" contra el código real; si hay divergencia,
> trátalo como STOP condition. Si los planes 011, 012, o 014 ya se aplicaron,
> los imports y la estructura de estos archivos pueden ser diferentes —
> adapta los pasos manteniendo la intención.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MEDIUM
- **Depends on**: 011 (branding constants dedup), 012 (html helpers dedup), 014 (symlink check)
- **Category**: tech-debt
- **Planned at**: commit `4dff240`, 2026-06-26

## Why this matters

`src/schema.js` (función `injectSchema`) y `src/batch.js` (función `batchInject`) contienen ~40 líneas de lógica de inyección duplicada: detección de HTML vs Markdown, construcción del payload con branding, regex para reemplazar schema/script tags existentes, y escape de `</script>`. Esta duplicación es el resultado de que `batchInject` no podía llamar a `injectSchema` porque esta última llama `process.exit(1)` en errores. Ahora que el plan 014 introduce `validateWritableTargetInsideCwd` (batch-safe), podemos extraer la lógica de inyección pura (construcción del contenido modificado) a una función compartida y que ambos caminos la usen. El resultado: un solo lugar donde corregir bugs de inyección, y `batchInject` se simplifica drásticamente.

## Current state

- `src/schema.js` — contiene `injectSchema` (líneas 295-383) con la lógica completa de inyección:
  - Líneas 334-336: regex `schemaPattern` (Markdown) y `scriptPattern` (HTML)
  - Líneas 338-340: stripping de branding + selección de firma
  - Líneas 342-367: construcción de `injectedCode` y reemplazo/inserción en `content`
- `src/batch.js` — contiene `batchInject` (líneas 116-207) que replica la misma lógica:
  - Líneas 153: escape `</script>`
  - Líneas 156-164: stripping de branding inline (mismos regex)
  - Líneas 166-196: construcción de `injectedCode` y reemplazo/inserción (misma lógica, mismos regex patterns)
- Ambos archivos ya comparten `generateSchemaData` (la generación del objeto schema).
- Con los planes 011 y 014 aplicados, `batch.js` ya importa constantes y validación desde `schema.js`.

Fragmentos clave de la duplicación:

`src/schema.js:332-367`:

```javascript
  const schemaJson = JSON.stringify(schema, null, 2).replace(/<\//g, "<\\/");

  const schemaPattern = /```json\s*\{\s*"@context":\s*"https:\/\/schema\.org"[\s\S]*?\}\s*```/;
  const scriptPattern =
    /<script\b(?=[^>]*\btype\s*=\s*(["']?)application\/ld\+json\1)[^>]*>[\s\S]*?<\/script>/i;

  content = stripToolticianBranding(content);
  const sigMd = noBranding ? "" : `\n\n${TOOLTICIAN_BRANDING_MARKDOWN}\n`;
  const sigHtml = noBranding ? "" : `\n${TOOLTICIAN_BRANDING_HTML}\n`;

  let injectedCode = `${sigMd}\n\`\`\`json\n${schemaJson}\n\`\`\`\n`;

  if (filepath.endsWith(".html") || content.toLowerCase().includes("<html")) {
    injectedCode = `${sigHtml}\n<script type="application/ld+json">\n${schemaJson}\n</script>\n`;
    if (scriptPattern.test(content)) {
      content = content.replace(scriptPattern, injectedCode.trim());
      console.log(`Successfully replaced existing JSON-LD script tag in ${filepath}.`);
    } else {
      if (/<\/head>/i.test(content)) {
        content = content.replace(/<\/head>/i, `${injectedCode}</head>`);
      } else if (/<\/body>/i.test(content)) {
        content = content.replace(/<\/body>/i, `${injectedCode}</body>`);
      } else {
        content += injectedCode;
      }
      console.log(`Successfully injected JSON-LD script tag into ${filepath}.`);
    }
  } else {
    if (schemaPattern.test(content)) {
      content = content.replace(schemaPattern, injectedCode.trim());
      console.log(`Successfully updated existing Schema.org block in markdown file ${filepath}.`);
    } else {
      content += injectedCode;
      console.log(`Successfully appended Schema.org block to markdown file ${filepath}.`);
    }
  }
```

`src/batch.js:153-196` (lógica equivalente, con `console.log` omitidos):

```javascript
      const schemaJson = JSON.stringify(schema, null, 2).replace(/<\//g, "<\\/");

      // Strip existing branding before re-injecting
      content = content
        .replace(/\n{0,2}Optimized (?:by|with) \[Tooltician\]\(https?:\/\/(?:www\.)?tooltician\.com\/?\)\s*/gi, "\n")
        .replace(/\s*<div[^>]*class=["'][^"']*\bgeo-signature\b[^"']*["'][^>]*>[\s\S]*?<\/div>\s*/gi, "\n");

      const sigMd = options.noBranding ? "" : `\n\n${TOOLTICIAN_BRANDING_MARKDOWN}\n`;
      const sigHtml = options.noBranding ? "" : `\n${TOOLTICIAN_BRANDING_HTML}\n`;

      const isHtml = filepath.endsWith(".html") || content.toLowerCase().includes("<html");

      if (isHtml) {
        const injectedCode = `${sigHtml}\n<script type="application/ld+json">\n${schemaJson}\n</script>\n`;
        const scriptPattern = /<script\b(?=[^>]*\btype\s*=\s*(["']?)application\/ld\+json\1)[^>]*>[\s\S]*?<\/script>/i;
        if (scriptPattern.test(content)) {
          content = content.replace(scriptPattern, injectedCode.trim());
        } else if (/<\/head>/i.test(content)) {
          content = content.replace(/<\/head>/i, `${injectedCode}</head>`);
        } else if (/<\/body>/i.test(content)) {
          content = content.replace(/<\/body>/i, `${injectedCode}</body>`);
        } else {
          content += injectedCode;
        }
      } else {
        const injectedCode = `${sigMd}\n\`\`\`json\n${schemaJson}\n\`\`\`\n`;
        const schemaPattern = /```json\s*\{\s*"@context":\s*"https:\/\/schema\.org"[\s\S]*?\}\s*```/;
        if (schemaPattern.test(content)) {
          content = content.replace(schemaPattern, injectedCode.trim());
        } else {
          content += injectedCode;
        }
      }
```

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Full check | `npm run check` | exit 0, all tests pass |
| JS tests only | `npm test` | 59 tests pass |
| Tests de inyección | `node --test --test-name-pattern="inject\|batchInject\|branding\|xss\|backup\|recursive" tests/optimizer.test.js` | matching tests pass |
| Lint | `npm run lint` | exit 0 |
| Format check | `npm run format:check` | exit 0 |

## Scope

**In scope** (the only files you should modify):
- `src/schema.js` — extraer función `buildInjectedContent()`, refactorizar `injectSchema` para usarla
- `src/batch.js` — refactorizar `batchInject` para usar `buildInjectedContent()`

**Out of scope** (do NOT touch):
- `src/index.js` — no es necesario exportar `buildInjectedContent` (es interna)
- `bin/cli.js` — el CLI llama a `injectSchema` (single) o `batchInject` (recursive); no debería notar el cambio
- `tests/optimizer.test.js` — los tests existentes cubren el comportamiento; no deberían necesitar cambios
- Python parity — no tiene batch inject
- Comportamiento de `console.log` — los mensajes de "Successfully injected/replaced..." deben preservarse exactamente igual en el output

## Git workflow

- Branch: `advisor/015-deduplicate-injection-logic`
- Commit: `refactor: extract shared buildInjectedContent from injectSchema and batchInject`
- Sigue el estilo de commits del repo.
- No hagas push ni abras PR a menos que se te indique explícitamente.

## Steps

### Step 1: Extraer `buildInjectedContent` en `schema.js`

En `src/schema.js`, crea una nueva función **antes** de `injectSchema` (aproximadamente línea 294) que contenga la lógica pura de construcción del contenido inyectado — sin I/O, sin `console.log`, sin `process.exit`:

```javascript
/**
 * Build the injected content by merging schema JSON-LD and optional branding
 * into the file body. Pure function — no I/O, no process.exit.
 *
 * @param {string} content - raw file content
 * @param {string} filepath - used to detect HTML vs Markdown
 * @param {object} schema - generated schema data object
 * @param {object} options
 * @param {boolean} [options.noBranding=false]
 * @returns {{ content: string, replaced: boolean }} modified content and whether an existing tag was replaced
 */
export function buildInjectedContent(content, filepath, schema, options = {}) {
  const noBranding = options.noBranding ?? false;
  const schemaJson = JSON.stringify(schema, null, 2).replace(/<\//g, "<\\/");

  const schemaPattern = /```json\s*\{\s*"@context":\s*"https:\/\/schema\.org"[\s\S]*?\}\s*```/;
  const scriptPattern =
    /<script\b(?=[^>]*\btype\s*=\s*(["']?)application\/ld\+json\1)[^>]*>[\s\S]*?<\/script>/i;

  content = stripToolticianBranding(content);
  const sigMd = noBranding ? "" : `\n\n${TOOLTICIAN_BRANDING_MARKDOWN}\n`;
  const sigHtml = noBranding ? "" : `\n${TOOLTICIAN_BRANDING_HTML}\n`;

  const isHtml = filepath.endsWith(".html") || content.toLowerCase().includes("<html");
  let replaced = false;

  if (isHtml) {
    const injectedCode = `${sigHtml}\n<script type="application/ld+json">\n${schemaJson}\n</script>\n`;
    if (scriptPattern.test(content)) {
      content = content.replace(scriptPattern, injectedCode.trim());
      replaced = true;
    } else if (/<\/head>/i.test(content)) {
      content = content.replace(/<\/head>/i, `${injectedCode}</head>`);
    } else if (/<\/body>/i.test(content)) {
      content = content.replace(/<\/body>/i, `${injectedCode}</body>`);
    } else {
      content += injectedCode;
    }
  } else {
    const injectedCode = `${sigMd}\n\`\`\`json\n${schemaJson}\n\`\`\`\n`;
    if (schemaPattern.test(content)) {
      content = content.replace(schemaPattern, injectedCode.trim());
      replaced = true;
    } else {
      content += injectedCode;
    }
  }

  return { content, replaced };
}
```

**Verifica**: `npm run lint` → exit 0.

### Step 2: Refactorizar `injectSchema` para usar `buildInjectedContent`

En `src/schema.js`, reemplaza las líneas 329-367 de `injectSchema` (desde la generación de `schemaJson` hasta el final del bloque if/else de inyección) con una llamada a `buildInjectedContent`. Conserva los `console.log` con los mensajes exactos.

El código actual (líneas 329-367) se reemplaza por:

```javascript
  const { content: modifiedContent, replaced } = buildInjectedContent(content, filepath, schema, {
    noBranding,
  });

  if (filepath.endsWith(".html") || content.toLowerCase().includes("<html")) {
    if (replaced) {
      console.log(`Successfully replaced existing JSON-LD script tag in ${filepath}.`);
    } else {
      console.log(`Successfully injected JSON-LD script tag into ${filepath}.`);
    }
  } else {
    if (replaced) {
      console.log(`Successfully updated existing Schema.org block in markdown file ${filepath}.`);
    } else {
      console.log(`Successfully appended Schema.org block to markdown file ${filepath}.`);
    }
  }
```

Luego, en las líneas 369-382, cambia todas las referencias a `content` por `modifiedContent`:

```javascript
  if (dryRun) {
    console.log("=== DRY RUN: The following would be injected ===");
    console.log(injectedCode);  // ← esto era la variable local; cámbiala por el schema JSON directo
```

**Cuidado**: La variable `injectedCode` ya no existe en el scope. Para el dry run, reconstruye el preview así:

```javascript
  if (dryRun) {
    // Rebuild the injected snippet for preview (already computed inside buildInjectedContent;
    // we reconstruct it here to avoid returning it from the function)
    const previewJson = JSON.stringify(schema, null, 2).replace(/<\//g, "<\\/");
    const previewSig = noBranding ? "" : `\n\n${TOOLTICIAN_BRANDING_MARKDOWN}\n`;
    const preview = `${previewSig}\n\`\`\`json\n${previewJson}\n\`\`\`\n`;
    console.log("=== DRY RUN: The following would be injected ===");
    console.log(preview);
    console.log("=== End of dry run preview ===");
    return;
  }
```

Y:

```javascript
  try {
    fs.writeFileSync(filepath, modifiedContent, { encoding: "utf8" });
  } catch (e) {
```

**Verifica**: `node --test --test-name-pattern="injectSchema writes|injectSchema injects|injectSchema extracts|injectSchema escapes" tests/optimizer.test.js` → todos los tests de `injectSchema` pasan.

### Step 3: Refactorizar `batchInject` para usar `buildInjectedContent`

En `src/batch.js`, reemplaza las líneas 144-196 (desde `const schema = generateSchemaData(...)` hasta `fs.writeFileSync`) con una llamada a `buildInjectedContent`.

Primero, actualiza el import desde `./schema.js` para incluir `buildInjectedContent`:

```javascript
import {
  generateSchemaData,
  TOOLTICIAN_BRANDING_MARKDOWN,
  TOOLTICIAN_BRANDING_HTML,
  validateWritableTargetInsideCwd,
  buildInjectedContent,
} from "./schema.js";
```

(Si los planes 011 y 014 no se han aplicado aún, los imports de constantes y `validateWritableTargetInsideCwd` no estarán presentes — ajusta según el estado real de los imports.)

Luego, reemplaza el bloque de lógica de inyección:

```javascript
      // Generate the schema (no I/O side effects)
      const schema = generateSchemaData(filepath, schemaType, config, content);

      if (options.dryRun) {
        successCount++;
        continue;
      }

      // Build the injected content using the shared pure function
      const { content: modifiedContent } = buildInjectedContent(content, filepath, schema, {
        noBranding: options.noBranding,
      });

      fs.writeFileSync(filepath, modifiedContent, { encoding: "utf8" });
      successCount++;
```

Esto reemplaza ~45 líneas de lógica duplicada (153-196) por ~5 líneas.

Elimina también las líneas de stripping de branding inline (156-164) y las definiciones locales de `sigMd`, `sigHtml`, `injectedCode`, `scriptPattern`, `schemaPattern` que ya no se usan.

**Verifica**: `node --test --test-name-pattern="batchInject" tests/optimizer.test.js` → el test `batchInject injects schema and branding into markdown files` pasa.

### Step 4: Verificar todos los tests de inyección

**Verifica**: `node --test --test-name-pattern="inject|batchInject|branding|xss|backup|recursive" tests/optimizer.test.js` → todos los tests pasan. Esto incluye:
- `injectSchema writes signature and stacked JSON-LD markup to file`
- `injectSchema injects JSON-LD script tag into HTML file`
- `injectSchema extracts HTML descriptions and replaces single-quoted JSON-LD`
- `injectSchema escapes </script> in JSON-LD to prevent XSS breakout (SEC-03)`
- `batchInject injects schema and branding into markdown files`
- `CLI requires Pro entitlement for --no-branding and removes branding when entitled`
- `CLI inject --recursive processes multiple files`

### Step 5: Full check

**Verifica**: `npm run check` → exit 0.

## Test plan

No se requieren tests nuevos. Los 59 tests existentes cubren exhaustivamente los caminos de inyección:

- **Single-file Markdown**: `injectSchema writes signature and stacked JSON-LD markup to file`
- **Single-file HTML**: `injectSchema injects JSON-LD script tag into HTML file`
- **HTML replacement**: `injectSchema extracts HTML descriptions and replaces single-quoted JSON-LD`
- **XSS protection**: `injectSchema escapes </script> in JSON-LD to prevent XSS breakout (SEC-03)`
- **Branding**: `CLI requires Pro entitlement for --no-branding and removes branding when entitled`
- **Batch**: `batchInject injects schema and branding into markdown files`
- **Recursive**: `CLI inject --recursive processes multiple files`
- **Dry run**: `CLI inject --recursive processes multiple files` (usa `--dry-run`)

Si TODOS estos tests pasan, la refactorización es correcta.

## Done criteria

- [ ] `npm run check` exits 0
- [ ] `npm test` exits 0; 59 tests pass
- [ ] `grep -n "export function buildInjectedContent" src/schema.js` retorna exactamente 1 coincidencia
- [ ] `grep -c "const schemaPattern = \/\\\`\`\`json" src/batch.js` retorna 0 (los regex patterns duplicados ya no existen en batch.js)
- [ ] `grep -c "const scriptPattern = \/<script" src/batch.js` retorna 0
- [ ] `grep -c "stripToolticianBranding\|sigMd\|sigHtml\|injectedCode" src/batch.js` retorna 0
- [ ] `grep -n "buildInjectedContent" src/schema.js` muestra definición + uso en `injectSchema`
- [ ] `grep -n "buildInjectedContent" src/batch.js` muestra import + uso en `batchInject`
- [ ] `git diff --stat` solo muestra `src/schema.js` y `src/batch.js`
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- El código en las ubicaciones indicadas en "Current state" no coincide con los fragmentos.
- `npm run lint` o `npm test` fallan después de cualquier paso.
- Cualquier test de inyección falla (especialmente los de XSS, branding, y reemplazo HTML).
- `buildInjectedContent` ya existe en `src/schema.js` (el plan ya fue aplicado).
- La eliminación de `injectedCode` rompe el dry-run preview en `injectSchema` — verifica que `--dry-run` sigue mostrando output correcto.
- Los imports en `batch.js` no resuelven porque los planes previos (011, 012, 014) no se han aplicado — si es el caso, adapta los imports al estado actual sin romper nada.

## Maintenance notes

- `buildInjectedContent` es ahora la **única** función que sabe cómo construir el contenido inyectado. Cualquier fix a la inyección (nuevos patrones de reemplazo, cambios en el formato de branding, soporte para nuevos tipos de archivo) debe hacerse aquí.
- `injectSchema` sigue siendo responsable de I/O (leer archivo, escribir archivo, dry run) y validación de seguridad (path confinement). `batchInject` es responsable del bucle y la colección de errores.
- La función `stripToolticianBranding` se mantiene privada en `schema.js` porque solo se usa dentro de `buildInjectedContent`. Si en el futuro otro módulo necesita hacer stripping, muévela a `text.js`.
- Si se detecta que `buildInjectedContent` reconstruye `schemaJson` internamente pero `generateSchemaData` ya lo generó, considera pasar el schema pre-serializado como optimización en un plan futuro.
