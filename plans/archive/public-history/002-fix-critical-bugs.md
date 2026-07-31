# Plan 002: Corregir 4 bugs críticos

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat HEAD -- src/optimizer.js`
> If `src/optimizer.js` changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/001-git-and-tooling.md
- **Category**: bug
- **Planned at**: 2025-06-25 (no git SHA — project not yet initialized)

## Why this matters

Cuatro bugs de alta confianza afectan la funcionalidad principal:

1. El flag `--config` está **completamente roto**: usa `Array.prototype.append()`
   que no existe en JavaScript, causando un crash.
2. Configurar `max_pronoun_density: 0` (tolerancia cero) es **ignorado
   silenciosamente** por un bug clásico de falsy `||`.
3. El tipo de schema `faq` genera entradas **inválidas** (secciones vacías,
   secciones de fuentes) porque le faltan los filtros que el tipo `article`
   sí aplica.
4. La fecha de publicación en todos los schemas es **hardcodeada** a
   `2026-06-25T12:00:00+00:00`.

Cada bug se corrige en 1–3 líneas. El plan completo toma ~30 minutos.

## Current state

### Bug 1: `searchPaths.append()` no existe (`src/optimizer.js:18`)

```javascript
// Línea 18 — .append() es un método de Python, no de JavaScript
searchPaths.append(configPath);
```

Esto crasha con `TypeError: searchPaths.append is not a function` cada vez
que se pasa `--config <path>`.

### Bug 2: `max_pronoun_density: 0` ignorado (`src/optimizer.js:283`)

```javascript
// Línea 283 — el operador || trata 0 como falsy
const pronounLimit = (config.limits && config.limits.max_pronoun_density) || MAX_PRONOUN_DENSITY;
```

Cuando `config.limits.max_pronoun_density === 0`, la expresión `0 || 0.02`
evalúa a `0.02`, ignorando la configuración del usuario.

### Bug 3: FAQ schema sin filtros (`src/optimizer.js:597-606`)

```javascript
// Líneas 597–606 — sin filtros de calidad de sección
} else if (schemaType === "faq") {
  const sections = extractSections(content);
  const qaList = [];
  for (const section of sections.slice(0, 5)) {
    qaList.push({
      "@type": "Question",
      "name": section.header,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": cleanMarkdownToPlainText(section.body)
      }
    });
  }
```

Comparar con el branch `"article"` (líneas 569–580) que SÍ aplica filtros:

```javascript
// Líneas 572–575 — filtros presentes en article, ausentes en faq
if (section.body.length < 15 || ["sources", "references", "citations", "bibliography"].includes(section.header.toLowerCase())) {
  continue;
}
```

### Bug 4: Fecha hardcodeada (`src/optimizer.js:562`)

```javascript
// Línea 562 — fecha estática, igual para todo contenido
"datePublished": "2026-06-25T12:00:00+00:00",
```

Esto también existe en Python: `geo_optimizer.py:495`.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Full check | `npm run check` | exit 0 |
| Node tests | `npm test` | 5 pass, 0 fail |
| Python tests | `python3 .agents/skills/geo-optimization/scripts/test_optimizer.py` | 6 OK |
| Lint | `npm run lint` | exit 0 |

## Scope

**In scope** (único archivo a modificar):
- `src/optimizer.js` — los 4 bugs están todos en este archivo

**Out of scope** (no tocar):
- `bin/cli.js` — no tiene bugs en este plan
- `tests/optimizer.test.js` — no se añaden tests en este plan (eso es plan 003)
- `.agents/skills/geo-optimization/scripts/geo_optimizer.py` — la versión
  Python no tiene el bug 1 (usa `list.append` correctamente), pero sí el bug 4.
  **Sin embargo**, la versión Python está fuera de scope para este plan porque
  el plan 006 decidirá su futuro. No la modifiques.
- `geo_config.json` — no se modifica

## Git workflow

- Branch: `advisor/002-fix-critical-bugs` (crear desde `advisor/001-git-and-tooling`
  si ya está mergeado, o desde `main`/`master` si 001 no existe aún)
- Commits: un commit por bug, o uno solo con los 4
- Formato de mensaje: `fix: <descripción>`

## Steps

### Step 1: Corregir `searchPaths.append` → `searchPaths.push`

En `src/optimizer.js`, línea 18, cambiar:

```javascript
searchPaths.append(configPath);
```

por:

```javascript
searchPaths.push(configPath);
```

**Verify**: `grep -n "\.append(" src/optimizer.js` no debe encontrar
resultados. `grep -n "\.push(" src/optimizer.js` debe mostrar línea 18
(y posiblemente otras líneas como la 20).

### Step 2: Corregir `||` → `??` para `max_pronoun_density`

En `src/optimizer.js`, línea 283, cambiar:

```javascript
const pronounLimit = (config.limits && config.limits.max_pronoun_density) || MAX_PRONOUN_DENSITY;
```

por:

```javascript
const pronounLimit = config.limits?.max_pronoun_density ?? MAX_PRONOUN_DENSITY;
```

**Verify**: `grep "MAX_PRONOUN_DENSITY" src/optimizer.js` muestra la línea
con `??` (nullish coalescing operator). `node -e "console.log(0 ?? 0.02)"`
imprime `0` (confirma que `??` trata `0` como valor válido).

### Step 3: Añadir filtros de sección al branch `"faq"`

En `src/optimizer.js`, dentro del bloque `else if (schemaType === "faq")`,
reemplazar el loop (líneas 597–606) con este código que incluye los mismos
filtros que el branch `"article"`:

```javascript
} else if (schemaType === "faq") {
  const sections = extractSections(content);
  const qaList = [];
  for (const section of sections.slice(0, 5)) {
    if (section.body.length < 15 || ["sources", "references", "citations", "bibliography"].includes(section.header.toLowerCase())) {
      continue;
    }
    qaList.push({
      "@type": "Question",
      "name": section.header,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": cleanMarkdownToPlainText(section.body)
      }
    });
  }
```

**Verify**: `grep -A3 "schemaType === \"faq\"" src/optimizer.js` debe mostrar
el bloque incluyendo `section.body.length < 15`. Verifica visualmente que el
filtro es idéntico al del branch `"article"` en líneas ~572–575.

### Step 4: Reemplazar fecha hardcodeada con fecha dinámica

En `src/optimizer.js`, línea 562, cambiar:

```javascript
"datePublished": "2026-06-25T12:00:00+00:00",
```

por:

```javascript
"datePublished": new Date().toISOString(),
```

**Verify**: `grep "datePublished" src/optimizer.js` muestra
`new Date().toISOString()`. `node -e "console.log(new Date().toISOString())"`
imprime la fecha actual en formato ISO 8601.

### Step 5: Ejecutar formateo Prettier

```bash
npx prettier --write src/optimizer.js
```

Esto asegura que los cambios de los pasos 1–4 cumplen con el estilo del proyecto.

**Verify**: `npx prettier --check src/optimizer.js` → sin diferencias.

### Step 6: Ejecutar verificaciones completas

```bash
npm run check
```

**Verify**: lint (`eslint`) exit 0, format (`prettier --check`) exit 0,
tests (`npm test`) 5 pass, 0 fail.

### Step 7: Ejecutar tests de Python (para verificar que no hay regresión cruzada)

```bash
python3 .agents/skills/geo-optimization/scripts/test_optimizer.py
```

**Verify**: 6 tests OK. Si algún test falla, reporta cuál — pero no modifiques
el código Python (está fuera de scope).

### Step 8: Commit

```bash
git add src/optimizer.js
git commit -m "fix: correct 4 critical bugs in optimizer.js

- Fix .append() -> .push() (--config flag was crashing)
- Fix || -> ?? for max_pronoun_density (0 was silently ignored)
- Add section quality filters to FAQ schema type (mirrors article branch)
- Replace hardcoded datePublished with dynamic Date().toISOString()

Co-Authored-By: Claude <noreply@anthropic.com>"
```

**Verify**: `git log --oneline -1` muestra el commit. `git status` clean.

## Test plan

Este plan no añade nuevos tests (eso corresponde al plan 003). Los tests
existentes deben seguir pasando:

- `npm test` → 5 pass, 0 fail
- `python3 .agents/skills/geo-optimization/scripts/test_optimizer.py` → 6 OK

## Done criteria

- [ ] `grep "\.append(" src/optimizer.js` no encuentra resultados
- [ ] `grep "?? MAX_PRONOUN_DENSITY" src/optimizer.js` encuentra la línea 283
- [ ] `grep -A8 "schemaType === \"faq\"" src/optimizer.js` muestra el filtro `section.body.length < 15`
- [ ] `grep "datePublished" src/optimizer.js` muestra `new Date().toISOString()`
- [ ] `grep "2026-06-25T12:00:00" src/optimizer.js` no encuentra resultados
- [ ] `npm run check` → exit 0 (lint + format + tests)
- [ ] `npm test` → 5 pass, 0 fail
- [ ] `python3 .agents/skills/geo-optimization/scripts/test_optimizer.py` → 6 OK
- [ ] `git status` está clean
- [ ] `plans/README.md` status row actualizado a DONE

## STOP conditions

Stop and report back (do not improvise) if:

- La línea 18 de `src/optimizer.js` NO contiene `.append(configPath)` (el
  código ya fue corregido o cambió). Reporta qué hay en su lugar.
- La línea 283 de `src/optimizer.js` ya usa `??` o una estructura diferente
  a la documentada en "Current state".
- `npm test` falla después de cualquier paso (deshacer el último cambio y
  reportar el error).
- `npm run lint` reporta errores que no son de formato (ej. variables no
  definidas introducidas por los cambios).
- El archivo `geo_optimizer.py` tiene diferencias semánticas relevantes que
  deberían reflejar los mismos fixes — repórtalo pero NO modifiques el
  archivo Python (el plan 006 se encarga de la consolidación).

## Maintenance notes

- **Bug 2 (`??` operator)**: el nullish coalescing operator (`??`) existe
  desde Node.js 14. Dado que `engines.node` es ahora `>=20.0.0` (plan 001),
  es seguro usarlo.
- **Bug 3 (FAQ filters)**: si en el futuro se añaden más tipos de schema,
  extraer los filtros de sección a una función helper para no duplicarlos.
  El plan 007 (split god module) puede abordar esto.
- **Bug 4 (fecha dinámica)**: `new Date().toISOString()` usa la fecha/hora
  actual del sistema. Si se necesita una fecha específica (ej. fecha del
  artículo original), añadir un parámetro `datePublished` al config en el
  futuro. La versión Python en `geo_optimizer.py:495` también tiene la fecha
  hardcodeada — el plan 006 (consolidación) debe abordarlo si Python sigue
  como implementación canónica.
