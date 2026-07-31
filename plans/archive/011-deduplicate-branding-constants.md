# Plan 011: Las constantes `TOOLTICIAN_BRANDING_*` se definen en un solo lugar

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 4dff240..HEAD -- src/schema.js src/batch.js src/index.js`
> Si alguno de estos archivos cambió desde que este plan fue escrito, compara
> los fragmentos en "Current state" contra el código real; si hay divergencia,
> trátalo como STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `4dff240`, 2026-06-26

## Why this matters

Las constantes `TOOLTICIAN_BRANDING_MARKDOWN` y `TOOLTICIAN_BRANDING_HTML` están definidas con strings idénticos en dos lugares: `src/schema.js:7-9` y `src/batch.js:5-7`. Si el texto de branding cambia (ej. nueva URL, nuevo formato), hay que actualizarlo en ambos lados. Peor aún: `injectSchema` en `schema.js` tiene una función `stripToolticianBranding()` que usa regex para remover el branding antiguo — si las constantes divergen, el stripping falla silenciosamente y deja residuos de branding antiguo en el contenido. La solución canónica es definir las constantes en `schema.js` (donde está la lógica de inyección principal) y que `batch.js` las importe.

## Current state

- `src/schema.js` — lógica de generación e inyección de schema.
  - Líneas 7-9: definición de `TOOLTICIAN_BRANDING_MARKDOWN` y `TOOLTICIAN_BRANDING_HTML`.
  - Líneas 20-29: `stripToolticianBranding()` usa los mismos patrones de texto que las constantes.
- `src/batch.js` — wrappers batch para audit e inyect.
  - Líneas 5-7: definición **duplicada** de `TOOLTICIAN_BRANDING_MARKDOWN` y `TOOLTICIAN_BRANDING_HTML`.
  - Líneas 156-164: stripping de branding inline que replica `stripToolticianBranding()`.
- `src/index.js` — barrel de exports. Ya exporta desde `schema.js` y `batch.js`.

Fragmento `src/schema.js:7-9`:

```javascript
const TOOLTICIAN_BRANDING_MARKDOWN = "Optimized with [Tooltician](https://www.tooltician.com)";
const TOOLTICIAN_BRANDING_HTML =
  '<div class="geo-signature"><p>Optimized with <a href="https://www.tooltician.com">Tooltician</a></p></div>';
```

Fragmento `src/batch.js:5-7`:

```javascript
const TOOLTICIAN_BRANDING_MARKDOWN = "Optimized with [Tooltician](https://www.tooltician.com)";
const TOOLTICIAN_BRANDING_HTML =
  '<div class="geo-signature"><p>Optimized with <a href="https://www.tooltician.com">Tooltician</a></p></div>';
```

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Full check | `npm run check` | exit 0, all tests pass |
| JS tests only | `npm test` | 59 tests pass |
| Specific tests | `node --test --test-name-pattern="branding\|inject\|batchInject" tests/optimizer.test.js` | matching tests pass |
| Lint | `npm run lint` | exit 0 |
| Format check | `npm run format:check` | exit 0 |

## Scope

**In scope** (the only files you should modify):
- `src/schema.js` — agregar `export` a las constantes
- `src/batch.js` — eliminar definiciones duplicadas, importar desde `schema.js`

**Out of scope** (do NOT touch):
- `src/llms-txt.js` — no usa estas constantes
- `bin/cli.js` — no usa estas constantes directamente
- Python parity (`geo_optimizer.py`) — este plan es solo JS; el script Python tiene sus propias constantes que deben mantenerse sincronizadas manualmente según la política de divergencia documentada del proyecto
- `src/index.js` — el barrel ya exporta todo desde `schema.js` y `batch.js`; no necesita cambio

## Git workflow

- Branch: `advisor/011-deduplicate-branding-constants`
- Commit: `refactor: deduplicate TOOLTICIAN_BRANDING_* constants into schema.js`
- Sigue el estilo de commits del repo.
- No hagas push ni abras PR a menos que se te indique explícitamente.

## Steps

### Step 1: Exportar las constantes desde `schema.js`

En `src/schema.js`, agrega la palabra clave `export` a las declaraciones de las constantes en líneas 7-9:

```javascript
export const TOOLTICIAN_BRANDING_MARKDOWN = "Optimized with [Tooltician](https://www.tooltician.com)";
export const TOOLTICIAN_BRANDING_HTML =
  '<div class="geo-signature"><p>Optimized with <a href="https://www.tooltician.com">Tooltician</a></p></div>';
```

**Verifica**: `npm run lint` → exit 0.

### Step 2: Reemplazar definiciones duplicadas en `batch.js`

En `src/batch.js`:

1. Agrega `TOOLTICIAN_BRANDING_MARKDOWN` y `TOOLTICIAN_BRANDING_HTML` al import desde `./schema.js` en línea 3. La línea debe cambiar de:

```javascript
import { generateSchemaData } from "./schema.js";
```

a:

```javascript
import {
  generateSchemaData,
  TOOLTICIAN_BRANDING_MARKDOWN,
  TOOLTICIAN_BRANDING_HTML,
} from "./schema.js";
```

2. Elimina las líneas 5-7 (las definiciones duplicadas de las constantes).

**Verifica**: `npm run lint` → exit 0.

### Step 3: Verificar que todo funciona

**Verifica**: `npm test` → 59 tests pass. Los tests que cubren inyección de branding (`injectSchema writes signature and stacked JSON-LD markup to file`, `CLI requires Pro entitlement for --no-branding`, `batchInject injects schema and branding into markdown files`) deben pasar sin cambios.

### Step 4: Full check

**Verifica**: `npm run check` → exit 0.

## Test plan

No se requieren tests nuevos. Los tests existentes que ejercitan el branding cubren ambos caminos:

- `injectSchema writes signature and stacked JSON-LD markup to file` (línea 139) — verifica que el output contiene "Optimized with [Tooltician]" después de `injectSchema`.
- `batchInject injects schema and branding into markdown files` (línea 1183) — verifica que el output de `batchInject` contiene "Optimized with [Tooltician]".
- `CLI requires Pro entitlement for --no-branding and removes branding when entitled` (línea 433) — verifica el camino `--no-branding`.

Si estos 3 tests pasan, las constantes están sincronizadas correctamente.

## Done criteria

- [ ] `npm run check` exits 0
- [ ] `npm test` exits 0; 59 tests pass
- [ ] `grep -n "TOOLTICIAN_BRANDING" src/batch.js` solo muestra líneas de import/uso, no definiciones
- [ ] `grep -c "TOOLTICIAN_BRANDING_MARKDOWN =" src/batch.js` retorna 0
- [ ] `grep -c "export const TOOLTICIAN_BRANDING_MARKDOWN" src/schema.js` retorna 1
- [ ] `git diff --stat` solo muestra `src/schema.js` y `src/batch.js`
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- El código en `src/schema.js:7-9` o `src/batch.js:5-7` no coincide con los fragmentos en "Current state".
- `npm run lint` o `npm test` fallan después de cualquier paso.
- Algún test de branding/injection falla.
- Las constantes en `src/schema.js` ya están exportadas (alguien ya aplicó este fix).

## Maintenance notes

- Si el texto de branding cambia en el futuro, solo hay que modificar `src/schema.js:7-9`. El cambio se propagará automáticamente a `batch.js` y a cualquier otro consumidor.
- El script Python (`geo_optimizer.py`) tiene sus propias constantes `TOOLTICIAN_BRANDING_MARKDOWN` y `TOOLTICIAN_BRANDING_HTML` (líneas 18-22). Estas deben mantenerse sincronizadas manualmente con JS según la política de divergencia documentada del proyecto. Este plan no aborda la sincronización Python↔JS porque está fuera del scope de la deduplicación intra-JS.
