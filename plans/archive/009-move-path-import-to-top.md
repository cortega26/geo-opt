# Plan 009: El import de `path` se mueve al bloque superior de `llms-txt.js`

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 4dff240..HEAD -- src/llms-txt.js`
> Si el archivo cambió desde que este plan fue escrito, compara los
> fragmentos en "Current state" contra el código real antes de proceder;
> si hay divergencia, trátalo como STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `4dff240`, 2026-06-26

## Why this matters

En `src/llms-txt.js`, la línea `import path from "path";` está al final del archivo (línea 397), pero el módulo `path` se usa desde la línea 40. Aunque ESM hoistea los imports y el código funciona correctamente, esta ubicación rompe la convención del proyecto (todos los demás módulos importan al inicio), puede confundir a linters e IDEs, y hace que el archivo sea más difícil de leer. El fix es puramente mecánico: mover la línea al bloque de imports inicial.

## Current state

- `src/llms-txt.js` — 398 líneas. Módulo que genera/audita `llms.txt` y `robots.txt`.
  - Líneas 1-3: imports existentes (`cheerio`, `cleanMarkdownToPlainText`, `extractSections`, `preprocessContent`, `AI_CRAWLER_AGENTS`)
  - Línea 397: `import path from "path";` — aislado al final del archivo
- Uso de `path` en el archivo: líneas 40, 75, 81, 83, 304, 308, 313 — todas después de los imports iniciales pero antes de la línea 397.
- Convención del proyecto: imports al inicio del archivo, sin excepciones. Ver `src/scoring.js:1-5`, `src/schema.js:1-5`, `src/batch.js:1-3`, etc.

Fragmento del inicio del archivo (`src/llms-txt.js:1-3`):

```javascript
import * as cheerio from "cheerio";
import { cleanMarkdownToPlainText, extractSections, preprocessContent } from "./text.js";
import { AI_CRAWLER_AGENTS } from "./robots.js";
```

Fragmento del final del archivo (`src/llms-txt.js:395-397`):

```javascript
  return lines.join("\n").trim() + "\n";
}

import path from "path";
```

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Full check | `npm run check` | exit 0, all tests pass |
| JS tests only | `npm test` | 59 tests pass |
| Lint | `npm run lint` | exit 0 |
| Format check | `npm run format:check` | exit 0 |

## Scope

**In scope** (the only files you should modify):
- `src/llms-txt.js`

**Out of scope** (do NOT touch):
- Cualquier otro archivo. Este cambio es puramente de ubicación de una línea.
- No cambies el comportamiento del código, no renombres variables, no refactorices.

## Git workflow

- Branch: `advisor/009-move-path-import`
- Commit: `style: move path import to top of llms-txt.js`
- Sigue el estilo de commits del repo.
- No hagas push ni abras PR a menos que se te indique explícitamente.

## Steps

### Step 1: Mover el import al bloque inicial

En `src/llms-txt.js`:

1. Agrega `import path from "path";` después de la línea 3 (después del import de `AI_CRAWLER_AGENTS`), dejando una línea en blanco entre el bloque de imports del proyecto y el nuevo import de `path`.

2. Elimina la línea `import path from "path";` que está al final del archivo (actualmente línea 397).

El inicio del archivo debe verse así después del cambio:

```javascript
import * as cheerio from "cheerio";
import { cleanMarkdownToPlainText, extractSections, preprocessContent } from "./text.js";
import { AI_CRAWLER_AGENTS } from "./robots.js";
import path from "path";

// ---- HTML helpers (mirrored from schema.js) ----
```

Y el final del archivo debe ser `return lines.join("\n").trim() + "\n";\n}\n` sin ningún import después.

**Verifica**: `npm run lint` → exit 0.

### Step 2: Full check

**Verifica**: `npm run check` → exit 0. Esto confirma que lint, formato, tests JS, tests Python, y changelog pasan. El movimiento del import no debe afectar ningún comportamiento.

## Test plan

No se requieren tests nuevos. El cambio es puramente de estilo/ubicación de código, no de lógica. Los 59 tests existentes confirman que el comportamiento no cambió.

## Done criteria

- [ ] `npm run check` exits 0
- [ ] `npm test` exits 0; 59 tests pass
- [ ] `grep -n "^import path from" src/llms-txt.js` muestra un número de línea menor a 5
- [ ] `grep -c "^import path from" src/llms-txt.js` retorna exactamente `1`
- [ ] `tail -5 src/llms-txt.js` no contiene la palabra `import`
- [ ] `git diff --stat` solo muestra `src/llms-txt.js`
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- El código en `src/llms-txt.js:1-3` o `src/llms-txt.js:395-397` no coincide con los fragmentos en "Current state".
- `npm run lint` o `npm test` fallan después del cambio.
- Hay más de un `import path from "path"` en el archivo (el grep retorna más de 1 coincidencia).

## Maintenance notes

- Ninguna. Este es un cambio puramente cosmético que alinea el archivo con las convenciones del proyecto.
- Si en el futuro se agregan más imports al archivo, deben ir en el bloque inicial siguiendo el mismo orden: imports de paquetes externos primero, luego imports de módulos del proyecto.
