# Suplemento empírico — evidencia y cobertura

**Fecha:** 2026-06-27
**Relación:** complementa [`architecture-audit-2026-06-27.md`](architecture-audit-2026-06-27.md)
**Tipo:** verificación ejecutada (no solo leída)
**Gate T0:** no bloquea; informa los planes 031, 034 y trabajo post-T0

## Hallazgos de evidencia

### E1 — 3 de 7 fuentes vencidas (>180 días)

El registro en `src/evidence.js:21-71` tiene 7 entradas. `staleEvidenceWarnings(180)` retorna:

| ID | Última verificación | Días |
|---|---|---|
| `geo-kdd-2024` | 2024-08-01 | 696 |
| `what-gets-cited-2025` | 2025-05-01 | 423 |
| `google-ai-guide-2025` | 2025-06-01 | 392 |

Las 4 restantes fueron verificadas el 2026-06-27 durante la auditoría de arquitectura.
Ninguna entrada vencida tiene cambios documentados que invaliden sus claims, pero
el proyecto no puede afirmar "evidence up to date" sin re-verificarlas.

**Acción sugerida:** re-verificar `geo-kdd-2024` (paper fundacional — ¿sigue siendo
el estado del arte?), `what-gets-cited-2025` (¿nuevas mediciones?) y
`google-ai-guide-2025` (¿actualizaciones de Google?). Actualizar `lastVerified` o
documentar por qué el contenido sigue siendo válido. Esfuerzo: S (30 min).

### E2 — Los scorers no referencian el registro de evidencia

`src/scoring.js` y `src/scoring-v2.js` no contienen ninguna referencia a
`EVIDENCE_REGISTRY`. Solo `src/findings.js` y `src/technical.js` sí lo usan.

Como resultado, los 11 findings generados tienen `evidenceSources: []` (vacío).
El campo existe en el contrato pero nunca se pobla.

### E3 — Distribución de niveles de evidencia

```
heuristic     ██████ 6  (tables, lists, headings, semantic_html, pronoun, acronym, statistics)
experimental  ██ 2     (intro_definition, quotation_density)
probable      ██ 2     (citation_links, references_section)
strong        ░ 0      — nunca usado
```

El 55% de las reglas de scoring se apoya en el nivel más débil ("No external study
confirms a causal effect"). El nivel `strong` no se usa nunca. Esto no es un bug
— refleja el estado real de la investigación GEO — pero debe documentarse para no
sobre-vender la confianza de las recomendaciones.

**Acción sugerida:** para cada finding, decidir si `evidenceSources` debe poblarse
con entradas del registry o si el contrato debe hacer el campo opcional cuando el
label es `heuristic`. Esfuerzo: S (15 min de decisión + implementación).

### E4 — Riesgo de las fuentes vencidas sobre el plan 034

El plan 034 define la matriz de compatibilidad Python. Si las fuentes base están
vencidas, la matriz hereda esa deuda: los golden tests cross-runtime validarían
contra reglas cuyo respaldo externo no ha sido re-verificado.

**Acción sugerida:** ejecutar E1 antes de cerrar 034, o documentar en la matriz
que las reglas `heuristic`/`experimental` se basan en la mejor evidencia disponible
pero no verificada en >180 días.

---

## Hallazgos de cobertura

### C1 — `scoring.js` (v1) sin tests dedicados

| Métrica | Valor |
|---|---|
| Archivo de test | **no existe** (`tests/scoring.test.js`) |
| Cobertura reportada | 86.63% stmts, 83.43% branches, 100% funcs |
| Tipo de cobertura | incidental — ejercida por imports transitivos desde otros tests |

No hay assertions que verifiquen que `scoreContent()` produce outputs correctos.
La cobertura transitoria da falsa seguridad: el código corre, pero nadie comprueba
sus resultados. Esto materializa el riesgo CORRECTNESS-01 del audit de arquitectura.

**Acción sugerida:** crear `tests/scoring.test.js` con al menos:
- 3 fixtures calibrados (HTML bueno, HTML pobre, Markdown mixto)
- assertions sobre score, breakdown y recommendations
- los mismos edge cases que ya cubre `scoring-v2.test.js`
Esfuerzo: M (1 sesión). No bloquea T0 pero debería hacerse antes del primer release.

### C2 — `integrity.js`: 0% funciones, 20% branches en src/

```
Statements:  88.09%
Branches:    20.00%  ← el path tampered === true no se prueba desde src/
Functions:    0.00%  ← hasProEntitlement, getNoBrandingError nunca se invocan desde src/
```

Los tests en `tests/integrity.test.js` solo ejercen `dist/integrity.js` (post-build).
Las líneas `src/integrity.js:26-28` (catch de archivo ilegible) y `:40-41`
(mensaje de getNoBrandingError cuando tampered) nunca se ejecutan en tests.

El plan 032 (reproducible package) asume que integrity funciona. Un refactor que
cambie la estructura de `src/integrity.js` podría romper la verificación sin que
los tests lo detecten — porque los tests no tocan `src/`.

**Acción sugerida:** el test de "licensing.js ilegible" (`integrity.test.js:88-115`)
ya cubre el caso. El problema es puramente de medición: los tests corren contra
`dist/`. Si se acepta que integrity solo se valida en el artefacto construido,
documentarlo explícitamente y suprimir el warning de cobertura para ese archivo.
Si no, añadir un test unitario contra `src/integrity.js` mockeando el placeholder.
Esfuerzo: S.

### C3 — `validate.js`: 5 edge cases sin cobertura

Líneas no cubiertas en `src/validate.js`:
- `:22-23` — `readFileSync` lanza error (archivo sin permisos / corrupto)
- `:56-59` — bloque contiene JSON inválido
- `:65-66` — `@context` != "https://schema.org"
- `:70-71` — `@graph` vacío o ausente
- `:76-78` — nodo sin `@type`

El plan 033 agregó `validate.test.js` (6 tests, cobertura 11.6% → 88.18%).
Añadir 5 tests más llevaría la cobertura a ~98% y cubriría todos los branches.

**Acción sugerida:** añadir los 5 tests faltantes. Esfuerzo: S (20 min).

### C4 — `bin/cli.js`: branches al 58.26%

Es el archivo con peor cobertura de branches del proyecto. El plan 030 extrajo
la orquestación del core, pero el CLI sigue teniendo condicionales de formato,
output, threshold y errores que no se prueban unitariamente.

**Acción sugerida:** no añadir tests unitarios al CLI — no es el approach correcto.
En su lugar, el plan 031 (API/types) debería incluir smoke tests de CLI que
verifiquen los 3 flujos principales (audit, schema, inject) con fixtures. Esfuerzo: M.

---

## Relación con T0

| Hallazgo | Plan informado | ¿Bloquea? |
|---|---|---|
| E1 (evidencia vencida) | 034 (Python tier) | No — documentar en la matriz |
| E2 (sources vacíos) | 031 (API/types) | No — poblar o hacer opcional |
| E3 (heuristic dominante) | Documentación | No — transparencia |
| C1 (scoring.js sin tests) | 031 + pre-release | No para T0, sí para release |
| C2 (integrity 0% funcs) | 032 (release) | No — documentar o testear |
| C3 (validate edge cases) | 033 (quality gates) | No — low-hanging fruit |
| C4 (CLI branches) | 031 (API/types) | No — smoke tests post-T0 |

---

## Verificación ejecutada

```
$ node -e "import { staleEvidenceWarnings } from './src/evidence.js'; ..."
→ 3 stale entries

$ npm run test:coverage
→ exit 0; 92.94% stmts / 83.75% branches (src/); integrity 0% funcs

$ ls tests/
→ scoring.test.js NO EXISTE; scoring-v2.test.js SÍ (24k líneas)
```
