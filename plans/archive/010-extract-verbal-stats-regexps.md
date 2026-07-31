# Plan 010: Los regex de estadísticas verbales se extraen al ámbito del módulo en `scoring.js`

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 4dff240..HEAD -- src/scoring.js tests/optimizer.test.js`
> Si alguno de estos archivos cambió desde que este plan fue escrito, compara
> los fragmentos en "Current state" contra el código real; si hay divergencia,
> trátalo como STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `4dff240`, 2026-06-26

## Why this matters

En `src/scoring.js`, la función `scoreContent()` define el array `verbalStats` con 6 expresiones regulares **dentro del cuerpo de la función** (líneas 185-192). `scoreContent()` se llama una vez por archivo durante auditorías batch. En un sitio con 500+ páginas, esto significa 3000+ recompilaciones de regex idénticas. Aunque el costo individual es mínimo, acumula ruido de CPU y GC. Extraer el array al ámbito del módulo elimina esta recompilación sin cambiar el comportamiento.

## Current state

- `src/scoring.js` — 500 líneas. Contiene `scoreContent()` (exported, línea 75) y `auditFile()` (exported, línea 396).
  - Líneas 185-192: array `verbalStats` definido dentro de `scoreContent()`.
- Convención del proyecto: constantes a nivel de módulo cuando no dependen de parámetros. Ver `MAX_PRONOUN_DENSITY` en `src/config.js:6` y `AI_CRAWLER_AGENTS` en `src/robots.js:4-19`.

Fragmento exacto del código actual (`src/scoring.js:183-201`):

```javascript
  let statsBreakdown = "";

  const verbalStats = [
    /\b(?:one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:-|—)\s*(?:third|quarter|fifth|sixth|seventh|eighth|ninth|tenth)s?\b/gi,
    /\b(?:one|two|three|four|five)\s*-?\s*(?:third|quarter|fifth)s?\b/gi,
    /\b\d+\s*(?:out\s*of|in)\s*\d+\b/gi,
    /\b(?:one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:out\s*of|in)\s*(?:two|three|four|five|six|seven|eight|nine|ten)\b/gi,
    /\b(?:double|triple|quadruple|half|twice)\b/gi,
    /\b(?:majority|minority|plurality)\b/gi,
  ];

  let verbalCount = 0;
  const verbalMatches = [];
  for (const pattern of verbalStats) {
    const matches = textContent.match(pattern) || [];
    verbalCount += matches.length;
    if (matches.length > 0) {
      verbalMatches.push(...matches.slice(0, 3));
    }
  }
```

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Full check | `npm run check` | exit 0, all tests pass |
| JS tests only | `npm test` | 59 tests pass |
| Specific test | `node --test --test-name-pattern="verbal" tests/optimizer.test.js` | 1 test passes |
| Lint | `npm run lint` | exit 0 |
| Format check | `npm run format:check` | exit 0 |

## Scope

**In scope** (the only files you should modify):
- `src/scoring.js`

**Out of scope** (do NOT touch):
- `tests/optimizer.test.js` — el test existente `auditFile detects verbal statistics as data points` (línea 753) ya cubre el comportamiento; no necesita cambios.
- Python parity (`geo_optimizer.py`) — no uses el array `verbalStats` de JS como referencia para cambiar Python.
- `src/text.js`, `src/config.js` — no relacionados.

## Git workflow

- Branch: `advisor/010-extract-verbal-regexps`
- Commit: `perf: hoist verbal-stats regexps to module scope in scoring.js`
- Sigue el estilo de commits del repo.
- No hagas push ni abras PR a menos que se te indique explícitamente.

## Steps

### Step 1: Extraer `verbalStats` al ámbito del módulo

En `src/scoring.js`:

1. Corta las líneas 185-192 (la definición de `const verbalStats = [...]`) desde dentro de `scoreContent()`.
2. Pégalas en el ámbito del módulo, después de la línea 7 (`import { MAX_PRONOUN_DENSITY } from "./config.js";`) y antes de la línea 9 (`// Token walking helpers`), dejando una línea en blanco antes y después.

El inicio del archivo debe verse:

```javascript
import fs from "fs";
import * as cheerio from "cheerio";
import { marked } from "marked";
import chalk from "chalk";
import { preprocessContent } from "./text.js";
import { MAX_PRONOUN_DENSITY } from "./config.js";

const VERBAL_STATS_PATTERNS = [
  /\b(?:one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:-|—)\s*(?:third|quarter|fifth|sixth|seventh|eighth|ninth|tenth)s?\b/gi,
  /\b(?:one|two|three|four|five)\s*-?\s*(?:third|quarter|fifth)s?\b/gi,
  /\b\d+\s*(?:out\s*of|in)\s*\d+\b/gi,
  /\b(?:one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:out\s*of|in)\s*(?:two|three|four|five|six|seven|eight|nine|ten)\b/gi,
  /\b(?:double|triple|quadruple|half|twice)\b/gi,
  /\b(?:majority|minority|plurality)\b/gi,
];

// Token walking helpers — traverse the marked AST to count structural elements
// reliably, without regex-based heuristics.
```

3. Dentro de `scoreContent()`, reemplaza la referencia a `verbalStats` (que ya no existe localmente) por `VERBAL_STATS_PATTERNS`. La línea 196 `for (const pattern of verbalStats)` debe cambiar a `for (const pattern of VERBAL_STATS_PATTERNS)`.

**Verifica**: `npm run lint` → exit 0.

### Step 2: Verificar que los tests de estadísticas verbales pasan

**Verifica**: `node --test --test-name-pattern="verbal" tests/optimizer.test.js` → el test `auditFile detects verbal statistics as data points` pasa.

### Step 3: Full check

**Verifica**: `npm run check` → exit 0.

## Test plan

No se requieren tests nuevos. El test existente `auditFile detects verbal statistics as data points` (línea 753 de `tests/optimizer.test.js`) verifica que `score = 20` para contenido con estadísticas verbales como "One third", "Double", "Three out of four". Este test confirma que el comportamiento de detección de estadísticas verbales no cambió.

## Done criteria

- [ ] `npm run check` exits 0
- [ ] `npm test` exits 0; 59 tests pass
- [ ] `grep -n "VERBAL_STATS_PATTERNS" src/scoring.js` muestra la definición cerca del inicio (línea < 20) y el uso dentro de `scoreContent()`
- [ ] `grep -n "const verbalStats" src/scoring.js` no retorna coincidencias
- [ ] `git diff --stat` solo muestra `src/scoring.js`
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- El código en `src/scoring.js:183-201` no coincide con los fragmentos en "Current state".
- `npm run lint` o `npm test` fallan después del cambio.
- El test `auditFile detects verbal statistics as data points` falla con el nuevo código.

## Maintenance notes

- Si en el futuro se agregan más patrones de estadísticas verbales, deben agregarse al array `VERBAL_STATS_PATTERNS` a nivel de módulo, no dentro de `scoreContent()`.
- El nombre `VERBAL_STATS_PATTERNS` sigue la convención de `UPPER_SNAKE_CASE` para constantes de módulo, visible en el resto del proyecto (ej. `MAX_PRONOUN_DENSITY`, `AI_CRAWLER_AGENTS`, `REMINDER_INJECTION_INTERVAL`).
