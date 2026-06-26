# Implementation Plans

Generado por el skill `improve` el 2026-06-26. La primera tanda (001-007, modernización de dependencias) se ejecutó exitosamente. La segunda tanda (008-017, consolidación post-modernización) se ejecutó completamente el 2026-06-26.

## Execution order & status — Fase 1: Modernización (COMPLETADA)

| Plan | Título | Prioridad | Esfuerzo | Depende de | Estado |
|------|--------|-----------|----------|------------|--------|
| 001 | Add test coverage measurement with c8 | P1 | S | — | DONE |
| 002 | Replace regex-based HTML parsing with cheerio | P1 | M | 001 | DONE |
| 003 | Replace regex-based Markdown parsing with marked | P1 | M | 002 | DONE |
| 004 | Add Zod schema validation for geo_config.json | P2 | S | — | DONE |
| 005 | Replace manual CLI parsing with commander | P2 | M | 004 | DONE |
| 006 | Add BeautifulSoup4 and mistune to Python skill | P2 | M | 002, 003 | DONE |
| 007 | Improve CLI output formatting with chalk | P3 | S | 005 | DONE |

## Execution order & status — Fase 2: Consolidación (Quick Wins)

| Plan | Título | Prioridad | Esfuerzo | Depende de | Estado |
|------|--------|-----------|----------|------------|--------|
| 008 | Fix dotfile skipping in directory walker | P1 | S | — | DONE |
| 009 | Move `path` import to top of llms-txt.js | P2 | S | — | DONE |
| 010 | Extract verbal-stats regexps to module scope | P3 | S | — | DONE |
| 011 | Deduplicate TOOLTICIAN_BRANDING_* constants | P1 | S | — | DONE |
| 012 | Deduplicate cleanHtmlText + truncateDescription | P1 | S | — | DONE |

## Execution order & status — Fase 3: Consolidación (Improvements)

| Plan | Título | Prioridad | Esfuerzo | Depende de | Estado |
|------|--------|-----------|----------|------------|--------|
| 013 | Add CI/CD pipeline with GitHub Actions | P1 | S-M | — | DONE |
| 014 | Add symlink path traversal check to batchInject | P1 | S-M | — | DONE |
| 015 | Deduplicate injection logic (schema.js ↔ batch.js) | P1 | M | 011, 012, 014 | DONE |
| 016 | Increase CLI test coverage to 80%+ | P2 | M | — | DONE |
| 017 | Add TypeScript type declarations (index.d.ts) | P2 | M | — | DONE |

## Dependency notes

- **008–012** son independientes entre sí y pueden ejecutarse en paralelo. Son todos de esfuerzo S (~15-30 min cada uno).
- **013** es independiente (solo crea un archivo YAML nuevo).
- **014** debe ejecutarse antes de **015** (015 asume que `validateWritableTargetInsideCwd` ya existe).
- **011** y **012** deben ejecutarse antes de **015** (015 asume que las constantes de branding y los helpers de texto ya no están duplicados).
- **015** es el plan más grande (esfuerzo M, ~1 día). Toca `schema.js` y `batch.js` significativamente. No ejecutar sin haber completado 011, 012, y 014.
- **016** y **017** son independientes de todo lo demás.
- **016** (tests) es seguro ejecutar en cualquier momento — no modifica código fuente.
- **017** (tipos) debe ejecutarse después de que los otros planes hayan estabilizado los exports (si 015 cambia la API, 017 debe reflejarlo).

## Orden de ejecución recomendado

```
Fase A (paralelizable, quick wins):
  008 → 009 → 010 → 011 → 012

Fase B (independientes, improvements):
  013 (CI/CD) y 014 (seguridad)

Fase C (depende de Fase A + 014):
  015 (deduplicar inyección)

Fase D (independientes, cierre):
  016 (tests) y 017 (tipos)
```

## Resultados de Fase 2 (008-017)

| Métrica | Antes | Después |
|---------|-------|---------|
| Tests JS | 59 | **74** (+15) |
| Tests Python | 28 | 28 |
| Cobertura `src/` | 86.59% | **86.10%** |
| Cobertura `bin/cli.js` | 61.02% | **79.80%** (+18.78pp) |
| Cobertura total | 81.51% | **84.81%** (+3.30pp) |
| Duplicación `batch.js` ↔ `schema.js` | ~45 líneas | **0 líneas** |
| Funciones duplicadas (`cleanHtmlText`, `truncateDescription`) | 2 copias c/u | **1 copia canónica** |
| Constantes branding duplicadas | 2 lugares | **1 lugar** |
| Validación symlink en batch | ❌ inexistente | ✅ batch-safe |
| CI/CD pipeline | Solo changelog | **Lint + Format + JS + Python + Audit** |
| Tipos TypeScript | ❌ | ✅ `index.d.ts` (27 exports) |
| `npm run check` | ✅ | ✅ |

## Resultados de Fase 1

| Métrica | Antes | Después |
|---------|-------|---------|
| Tests JS | 27 | 34 |
| Tests Python | 14 | 14 |
| Cobertura `src/` | 87.58% | 87.73% |
| Líneas `bin/cli.js` | 402 | 206 (-49%) |
| Dependencias runtime | 0 | 6 |
| `npm run check` | ✅ | ✅ |

## Hallazgos considerados y rechazados (Fase 1 + Fase 2)

- **cli-table3**: Diferido. El reporte no usa tablas para output principal.
- **jsdom**: Demasiado pesado (~5MB). Cheerio cubre el mismo caso con ~30KB.
- **yargs**: Commander es más ligero (12KB vs ~100KB).
- **lodash / underscore**: Overkill.
- **axios / node-fetch**: `fetch` es built-in en Node 20+.
- **TypeScript migration**: Cambio de lenguaje, requiere decisión del maintainer. Las declaraciones de tipo (plan 017) son el paso incremental correcto.
- **`generateSchemaData` llama `process.exit`**: Es por diseño para CLI. El path batch usa `batchInject` que maneja errores sin `process.exit`. No es un bug.
- **`marked.lexer`**: La API estable de marked usa `marked.parse`, pero `lexer` sigue funcionando sin anuncio de deprecación. Monitorear.
