# Plan 012: `cleanHtmlText` y `truncateDescription` se unifican en `text.js`

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 4dff240..HEAD -- src/schema.js src/llms-txt.js src/text.js src/index.js`
> Si alguno de estos archivos cambió desde que este plan fue escrito, compara
> los fragmentos en "Current state" contra el código real; si hay divergencia,
> trátalo como STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (independiente del plan 011, aunque ambos tocan `src/schema.js`)
- **Category**: tech-debt
- **Planned at**: commit `4dff240`, 2026-06-26

## Why this matters

Dos funciones utilitarias están definidas con implementaciones idénticas en dos módulos distintos:

- `cleanHtmlText(value)` — `src/schema.js:83-85` y `src/llms-txt.js:7-10`
- `truncateDescription(description)` — `src/schema.js:88-90` y `src/llms-txt.js:12-15`

La versión en `llms-txt.js` de `truncateDescription` acepta un segundo parámetro `maxLen` con default 150, mientras que la de `schema.js` usa 150 hardcodeado. La versión de `llms-txt.js` es estrictamente más general. Si un bug se corrige en una copia, la otra permanece rota. `text.js` ya es el módulo canónico para manipulación de texto; estas funciones pertenecen allí.

## Current state

- `src/schema.js` — generación e inyección de schema JSON-LD.
  - Líneas 83-85: `cleanHtmlText(value)` — usa cheerio para extraer texto plano y normalizar whitespace.
  - Líneas 88-90: `truncateDescription(description)` — trunca a 150 caracteres con `...`.
- `src/llms-txt.js` — generación y auditoría de `llms.txt`.
  - Líneas 7-10: `cleanHtmlText(value)` — idéntica a la de `schema.js`.
  - Líneas 12-15: `truncateDescription(description, maxLen = 150)` — misma lógica pero con parámetro configurable.
- `src/text.js` — módulo canónico de procesamiento de texto. Contiene `preprocessContent`, `cleanMarkdownToPlainText`, `extractSections`, `calculateReadability`. Es el hogar natural para estas funciones.
- `src/index.js` — barrel de exports. Ya exporta desde `text.js`.

Fragmento `src/schema.js:83-90`:

```javascript
function cleanHtmlText(value) {
  const $ = cheerio.load(value);
  return $.text().replace(/\s+/g, " ").trim();
}

function truncateDescription(description) {
  return description.length > 150 ? `${description.slice(0, 147)}...` : description;
}
```

Fragmento `src/llms-txt.js:7-15`:

```javascript
function cleanHtmlText(value) {
  const $ = cheerio.load(value);
  return $.text().replace(/\s+/g, " ").trim();
}

function truncateDescription(description, maxLen = 150) {
  if (!description) return "";
  return description.length > maxLen ? `${description.slice(0, maxLen - 3)}...` : description;
}
```

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Full check | `npm run check` | exit 0, all tests pass |
| JS tests only | `npm test` | 59 tests pass |
| Specific tests | `node --test --test-name-pattern="entity|meta order|extractPageMetadata|cleanHtmlText" tests/optimizer.test.js` | matching tests pass |
| Lint | `npm run lint` | exit 0 |
| Format check | `npm run format:check` | exit 0 |

## Scope

**In scope** (the only files you should modify):
- `src/text.js` — agregar las dos funciones como exports
- `src/schema.js` — eliminar definiciones locales, importar desde `text.js`
- `src/llms-txt.js` — eliminar definiciones locales, importar desde `text.js`

**Out of scope** (do NOT touch):
- `src/index.js` — el barrel exporta `cleanMarkdownToPlainText` y `extractSections` desde `text.js` pero no exporta `cleanHtmlText` ni `truncateDescription`. No las agregues al barrel a menos que sean parte de la API pública documentada. Solo son utilidades internas.
- `tests/optimizer.test.js` — no necesita cambios; los tests ejercitan las funciones a través de la API pública (`generateSchemaData`, `extractPageMetadata`, etc.).
- Python parity.

## Git workflow

- Branch: `advisor/012-deduplicate-html-text-helpers`
- Commit: `refactor: move cleanHtmlText and truncateDescription to text.js`
- Sigue el estilo de commits del repo.
- No hagas push ni abras PR a menos que se te indique explícitamente.

## Steps

### Step 1: Agregar las funciones a `src/text.js`

En `src/text.js`, agrega las siguientes dos funciones después de los imports existentes y antes de `calculateReadability`. Ubicación sugerida: después de la línea 1 (`import { marked } from "marked";`) y antes de la línea 3 (`export function calculateReadability`).

Necesitarás agregar el import de cheerio al inicio de `text.js`:

```javascript
import { marked } from "marked";
import * as cheerio from "cheerio";
```

Luego agrega las funciones (usa la versión más completa de `llms-txt.js`):

```javascript
export function cleanHtmlText(value) {
  const $ = cheerio.load(value);
  return $.text().replace(/\s+/g, " ").trim();
}

export function truncateDescription(description, maxLen = 150) {
  if (!description) return "";
  return description.length > maxLen ? `${description.slice(0, maxLen - 3)}...` : description;
}
```

**Verifica**: `npm run lint` → exit 0. Si hay error de unused import en `text.js`, verifica que las funciones estén exportadas.

### Step 2: Actualizar `src/schema.js`

En `src/schema.js`:

1. Agrega `cleanHtmlText` y `truncateDescription` al import desde `./text.js` (línea 4). Cambia:

```javascript
import { preprocessContent, cleanMarkdownToPlainText, extractSections } from "./text.js";
```

a:

```javascript
import { preprocessContent, cleanMarkdownToPlainText, extractSections, cleanHtmlText, truncateDescription } from "./text.js";
```

2. Elimina las definiciones locales de `cleanHtmlText` (líneas 83-85) y `truncateDescription` (líneas 88-90).

**Verifica**: `npm run lint` → exit 0.

### Step 3: Actualizar `src/llms-txt.js`

En `src/llms-txt.js`:

1. Agrega `cleanHtmlText` y `truncateDescription` al import desde `./text.js` (línea 2). Cambia:

```javascript
import { cleanMarkdownToPlainText, extractSections, preprocessContent } from "./text.js";
```

a:

```javascript
import { cleanMarkdownToPlainText, extractSections, preprocessContent, cleanHtmlText, truncateDescription } from "./text.js";
```

2. Elimina las definiciones locales de `cleanHtmlText` (líneas 7-10) y `truncateDescription` (líneas 12-15).

**Verifica**: `npm run lint` → exit 0.

### Step 4: Verificar que los tests pasan

**Verifica**: `npm test` → 59 tests pass. Tests clave que validan el comportamiento de estas funciones:
- `cleanHtmlText decodes all standard HTML entities via cheerio` (línea 810)
- `generateSchemaData extracts meta description regardless of attribute order` (línea 831)
- `extractPageMetadata extracts title and description from markdown` (línea 1203)

### Step 5: Full check

**Verifica**: `npm run check` → exit 0.

## Test plan

No se requieren tests nuevos. Los tests existentes cubren el comportamiento de estas funciones indirectamente a través de la API pública:

- `cleanHtmlText` se prueba en `cleanHtmlText decodes all standard HTML entities via cheerio` (schema test) y `extractPageMetadata` (llms-txt test).
- `truncateDescription` se prueba en `generateSchemaData extracts meta description regardless of attribute order` (verifica que description se trunca a 150 chars).

## Done criteria

- [ ] `npm run check` exits 0
- [ ] `npm test` exits 0; 59 tests pass
- [ ] `grep -n "function cleanHtmlText" src/schema.js` no retorna coincidencias
- [ ] `grep -n "function truncateDescription" src/schema.js` no retorna coincidencias
- [ ] `grep -n "function cleanHtmlText" src/llms-txt.js` no retorna coincidencias
- [ ] `grep -n "function truncateDescription" src/llms-txt.js` no retorna coincidencias
- [ ] `grep -n "export function cleanHtmlText" src/text.js` retorna exactamente 1 coincidencia
- [ ] `grep -n "export function truncateDescription" src/text.js` retorna exactamente 1 coincidencia
- [ ] `git diff --stat` solo muestra `src/text.js`, `src/schema.js`, y `src/llms-txt.js`
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Los fragmentos en "Current state" no coinciden con el código real.
- `npm run lint` o `npm test` fallan después de cualquier paso.
- Algún test existente falla, especialmente los de schema generation, HTML entity decoding, o page metadata extraction.
- `src/text.js` ya tiene definiciones de `cleanHtmlText` o `truncateDescription` (alguien ya aplicó este fix).
- `cheerio` no está disponible en `src/text.js` (debería estarlo porque es una dependencia directa del proyecto).

## Maintenance notes

- La versión canónica de `truncateDescription` acepta `maxLen` opcional con default 150. Si en el futuro se necesita truncar a otra longitud (ej. 300 para meta descriptions), el parámetro ya existe.
- La función `cleanHtmlText` ahora vive en `text.js` junto con las demás utilidades de procesamiento de texto (`cleanMarkdownToPlainText`, `preprocessContent`), formando un módulo cohesivo de manipulación de contenido.
- Si se agregan más funciones de utilidad de texto en el futuro, `text.js` es el lugar correcto.
