# Spec — Remediación de la auditoría adversarial 2026-07-31

Fuente: [`docs/audits/auditoria-2026-07-31.md`](docs/audits/auditoria-2026-07-31.md) (14
hallazgos F-01…F-14 sobre geo-opt v2.3.1, commit `12c5957`). Este documento define
el alcance, las decisiones y la verificación de cada corrección.

## Objetivo

Corregir los 14 hallazgos con tests de regresión, sin romper el gate completo
(`npm run check` + `python3 test_optimizer.py`) y sin cambiar contratos públicos
que no sean el objeto del hallazgo.

## Decisiones de alcance

| Finding | Enfoque | Justificación |
|---|---|---|
| F-01…F-03, F-05, F-07…F-12 | Fix de código + test de regresión | Confirmados con reproducción |
| F-04 | Documentación del modelo honor-system + test del patrón | La firma ed25519 es un cambio de producto (keypair, distribución de clave pública, activación) que merece su propio plan; el informe permite la opción documental |
| F-06 | Relabel de banda + advertencia en reportes y docs | El band **id** (`production-ready`) es contract estable del JSON (tests existentes lo usan); se cambia el **label** y la **descripción** visibles y se añade advertencia |
| F-13, F-14 | Fix de template y docs | Confirmados / análisis estático |
| Knip (8 exports), registry verification, SHA-pinning | Fuera de alcance | Backlog P3 del informe |

Trabajo en rama `chore/audit-fixes`, un commit por finding. Cada fix corre su
test antes de commitear.

## Archivos de trabajo (no se commitean)

- `spec.md` — este documento.
- `todo.md` — lista de tareas en progreso.
- `tests/` — los tests de regresión SÍ se commitean (son parte del fix).

---

## Fixes por hallazgo

### F-01 — XSS en `report --compare` (Alta)

- **Archivo**: `src/html-report.js` (`renderComparisonHtml`, ~561-653).
- **Cambio**: normalizar a número finito (NaN → 0) los valores del baseline
  (`beforeScore`, `afterScore`, `bv`, `av`, `max`) y pasarlos por `esc()` en
  todas las interpolaciones del HTML. `deltaHtml` ya recibe números.
- **Test**: `tests/html-report.test.js` (nuevo) —
  `render-comparison-escapes-malicious-baseline`: baseline con
  `total_score: "5</div><script>alert(1)</script>"` y `breakdown.*.score` con
  strings HTML → el HTML resultante no contiene `<script` crudo y sí `&lt;`.
- **Verificación**: `node --test tests/html-report.test.js`.

### F-02 — SSRF: 169.254.0.0/16 no bloqueado (Alta)

- **Archivo**: `src/fetcher.js` (`isPrivateIPv4`, ~88-106).
- **Cambio**: añadir `169.254.0.0/16` (link-local/metadata) y `100.64.0.0/10`
  (CGNAT, defensa en profundidad).
- **Test**: `tests/fetcher.test.js` — `fetcher-blocks-link-local-metadata`:
  `isPrivateIPv4("169.254.169.254")` es true; `checkIp` lo bloquea con
  allowPrivate=false.
- **Verificación**: `node --test tests/fetcher.test.js`.

### F-03 — SSRF: IPv4-mapped IPv6 y link-local fe80::/10 (Media)

- **Archivo**: `src/fetcher.js`.
- **Cambio**:
  1. Helper `normalizeIpv4Mapped(ip)` — detecta `::ffff:` seguido de forma
     decimal (`::ffff:127.0.0.1`) o hex (`::ffff:7f00:1`) y devuelve la IPv4
     subyacente (o null).
  2. `isPrivateIPv6` — primero normaliza mapped; si aplica, delega en
     `isPrivateIPv4`.
  3. `checkIp` — normaliza el mapped antes del dispatch por `.` (cubre
     `::ffff:127.0.0.1` que hoy cae por la rama IPv4).
  4. Link-local IPv6: comparar los primeros 16 bits (`0xfe80`–`0xfebf`, =/10)
     en vez de `startsWith("fe80:")`.
- **Tests**: `tests/fetcher.test.js` — `fetcher-blocks-ipv4-mapped-loopback`
  (`::ffff:7f00:1` y `::ffff:127.0.0.1` bloqueados) y
  `fetcher-blocks-link-local-v6-range` (`fe90::1`, `febf::1` bloqueados).
- **Verificación**: `node --test tests/fetcher.test.js`.

### F-04 — Licencia Pro forjable (Media, control comercial)

- **Archivo**: `docs/free-vs-pro.md` (sección "¿Cómo se verifica la titularidad
  Pro?") + `tests/` (patrón).
- **Cambio**: declarar explícitamente que la clave es un **formato público
  verificable localmente** (no criptográfica): la edición Pro es honor-system
  por diseño; no es un boundary de seguridad. Test de regresión del patrón:
  claves triviales/placeholder (`tt_pro_short`, `tt_pro_AAAA…` de 24) pasan el
  formato — el test documenta el comportamiento actual para que un futuro fix
  criptográfico lo cambie con intención.
- **Test**: `tests/licensing.test.js` (nuevo) — `license-pattern-contract`:
  asserts del comportamiento actual (formato mínimo 20 chars, sin firma).
- **Verificación**: `node --test tests/licensing.test.js`.

### F-05 — JSON mode silencia fallos de archivo (Media)

- **Archivo**: `bin/cli.js` (bloque `format === "json"`, ~235-242).
- **Cambio**:
  1. En JSON mode, escribir los errores a stderr (mismo mensaje que modo texto).
  2. Si hay errores de archivo, `process.exit(1)` también sin `--threshold`
     (hoy solo con threshold). El payload JSON no cambia de shape (compatibilidad
     de contrato); el diagnóstico vive en stderr + exit code. Esto restaura el
     claim del README "diagnostics on stderr / non-zero exit codes".
- **Test**: `tests/cli-smoke.test.js` — `audit-json-reports-partial-failures`:
  1 archivo OK + 1 ilegible (directorio) con `-f json` → exit ≠ 0 y stderr no
  vacío; y el mismo caso sin JSON → también exit ≠ 0.
- **Verificación**: `node --test tests/cli-smoke.test.js`.

### F-06 — Score-gaming: banda "Production-Ready" (Media)

- **Archivos**: `src/scoring-v2.js` (`readinessBand`, ~662-693),
  `src/renderer.js` (~427), `src/html-report.js` (~318 usa el band id).
- **Cambio**:
  1. Label de la banda ≥85 → **"Strong Style Markers"**, description → aclara
     que mide marcadores estilísticos, no veracidad. Se mantiene el band id
     `production-ready` (contract JSON estable; se documenta).
  2. Advertencia visible en el reporte HTML de v2 (renderer.js) y en la
     descripción del band emitida en JSON: el score no valida veracidad ni
     ranking.
  3. Docs: README/AGENTS.md — vectores de gaming conocidos.
- **Tests**: `tests/scoring-v2.test.js` — actualizar asserts que dependen del
  label (no del id); añadir `band-label-is-neutral`: label de ≥85 ya no
  contiene "Production-Ready". `tests/renderer` si existe, verificar que la
  nota aparece.
- **Verificación**: `node --test tests/scoring-v2.test.js`.

### F-07 — Versiones/puertos/IDs cuentan como estadísticas (Media)

- **Archivo**: `src/observations.js` (`observeAttributionProximity`, ~576-582).
- **Cambio**: tras extraer los matches, filtrar los que están en contexto de
  identificador técnico: precedidos (≤60 chars) de `version/versions/v/port/
  endpoint/id/ids/api/node/release/build/branch/commit/issue/status/code`
  (`\b` + `\s*:?$`, case-insensitive) o de `0x` hexadecimal. El filtro es una
  función auxiliar `isContextualIdentifier(textContent, index)` testable.
- **Test**: `tests/observations.test.js` — `observations-ignores-versions-ports-ids`:
  documento con "version 22", "endpoint 42", "port 8080", "id 12345" y sin
  stats reales → `statsWithNearbySource + statsWithoutNearbySource === 0`.
- **Verificación**: `node --test tests/observations.test.js` + suite v2
  (`scoring-v2.test.js`, fixtures adversariales no deben cambiar).

### F-08 — `hasSourcesSection` por keyword global (Media)

- **Archivo**: `src/observations.js` (`observeLinkQuality`, ~856-862).
- **Cambio**: helper `hasRealSourcesSection(textContent, htmlMeta)`:
  - Markdown/plain: línea que empieza con `#{1,6}\s+` y contiene
    sources/references/citations/bibliography/further reading; dentro de las
    siguientes líneas hasta el próximo heading (máx. 40) debe haber un link
    `[text](url)` o `href="http`.
  - HTML (htmlMeta.cheerio): heading con keyword, seguido (≤5 hermanos) de
    `ul/ol` con `a[href]` o un `a[href]` directo.
  - Reemplaza el `includes(keyword)` global.
- **Tests**: `tests/observations.test.js` — `observations-requires-real-sources-section`
  (mención casual de "sources" sin links → false) y caso positivo (heading
  "Sources" + lista de links → true).
- **Verificación**: `node --test tests/observations.test.js` + suite completa.

### F-09 — Inyección markdown en llms.txt + URLs sin codificar (Media)

- **Archivos**: `src/llms-txt.js` (~258, 269, 322; `resolvePageUrl` ~134-162),
  `bin/cli.js` (~434-437 entry.url).
- **Cambio**:
  1. Helper `escapeLinkText(text)`: escapa `\`, `]`, `(` en títulos y
     descripciones antes de interpolar en `- [title](url)` y `## [title](url)`.
  2. `resolvePageUrl`: `encodeURI(rel)` en el path devuelto (espacios y
     caracteres especiales → %XX; `/` se conserva).
  3. `bin/cli.js` entry.url (llmstxt/sitemap/generate-all): `encodeURI(urlPath)`.
- **Tests**: `tests/sitemap.test.js` — `sitemap-encodes-urls` (URL con espacios
  → %20) y test de `generateLlmsTxt` (nuevo archivo `tests/llms-txt.test.js` o
  donde viva la cobertura actual): `llms-txt-escapes-hostile-titles` — título
  `Fraud](https://evil.example)` → la salida no contiene `](https://evil.example)`
  crudo como cierre de enlace.
- **Verificación**: `node --test tests/sitemap.test.js tests/llms-txt.test.js`.

### F-10 — Paridad Node/Python para headings no-Latin (Media)

- **Archivos**: `src/scoring.js` (209, 450), `src/observations.js` si tiene el
  mismo patrón (grep `^##+\s+\w`), `.agents/skills/geo-optimization/scripts/
  geo_optimizer.py` (~1515).
- **Cambio**: `/^##+\s+\w+/m` → `/^##+\s+\S/m` en Node y
  `r'^##+\s+\w+'` → `r'^##+\s+\S'` en Python (misma semántica en ambos).
- **Tests**: fixtures nuevos `tests/fixtures/rtl.md` (árabe), `cjk.md` (chino),
  `cyr.md` (cirílico) con headings no-Latin; `tests/conformance.test.js` —
  `conformance-non-latin-headings`: `nodeAudit` === `pythonAudit` para los 3.
- **Verificación**: `node --test tests/conformance.test.js` +
  `python3 .agents/skills/geo-optimization/scripts/test_optimizer.py`.

### F-11 — Amplificación sin tope en modo sitemap (Media)

- **Archivos**: `src/sitemap.js` (nueva `collectSubSitemapPageUrls`),
  `bin/cli.js` (~1723-1791, delega en la función).
- **Cambio**: tope total de fetches de sub-sitemaps = 100 (todos los niveles de
  anidación sumados, vía cola) con warning en stderr cuando se alcanza. El
  fetch es inyectable (`deps.fetchFn`) para testear la lógica sin red.
- **Test**: `tests/sitemap.test.js` — `sitemap-mode-caps-sub-sitemaps` (índice
  con 150 subs → 100 fetches, 50 descartados, warning), anidación contra el
  mismo tope, y `maxFetches` configurable. Nota de desviación: el e2e del CLI
  con servidor loopback **https** no es viable en este entorno (TLS loopback
  roto: `https.get`/`curl` fallan con EPROTO "packet length too long" contra
  un server Node local — bug de entorno, no del código); el test unitario
  cubre la lógica exacta del tope.
- **Verificación**: `node --test tests/sitemap.test.js tests/cli-smoke.test.js`.

### F-12 — `technical -o` sin guarda de cwd (Baja)

- **Archivo**: `bin/cli.js` (`emitTechnicalResults`, ~1448-1456).
- **Cambio**: `assertNewFileParentInsideCwd(outPath)` (mismo helper que report,
  ya importado) antes del `writeFileSync` en el branch `options.output`.
- **Test**: `tests/write-guard.test.js` — `technical-output-enforces-cwd`:
  `technical x.md -f json -o ../escape.json` → exit ≠ 0 y archivo no escrito
  fuera del cwd.
- **Verificación**: `node --test tests/write-guard.test.js`.

### F-13 — Template GitLab: dotenv fantasma + comentario Pro falso (Baja)

- **Archivo**: `ci-templates/gitlab-ci.yml`.
- **Cambio**:
  1. Mover `reports: dotenv: geo-opt-env.env` del job hidden `.geo-opt-audit`
     (heredable sin el script que crea el archivo) al job concreto
     `geo-opt-audit` que sí lo genera.
  2. Línea 11: quitar "(Pro)" de `GEO_OPT_RECURSIVE` (verificado: `--recursive`
     funciona Community).
  3. Línea 15: `TOOLTICIAN_LICENSE_KEY` — describir Pro real (report,
     --no-branding), sin "recursive".
- **Test**: `tests/ci-assets.test.js` (si cubre el template) o test de contenido:
  el template no referencia dotenv en el job hidden y no afirma Pro para
  recursive.
- **Verificación**: `node --test tests/ci-assets.test.js`.

### F-14 — free-vs-pro.md: "schema por stdout con branding" (Baja)

- **Archivo**: `docs/free-vs-pro.md` (línea 33 y nota de verificación).
- **Cambio**: "por stdout, sin branding" (JSON puro, verificado en runtime);
  actualizar la nota "Verified 2026-07-22 against runtime at b2e6055" → fecha
  2026-07-31 y commit tras los fixes.
- **Test**: `tests/058-docs-claims.test.js` (o el que verifique claims de docs).
- **Verificación**: `node --test tests/058-docs-claims.test.js`.

---

## Verificación general (antes de cada commit y al final)

1. Test del fix concreto (columna "Test" de cada finding).
2. `npm run check` completo (lint, format, 664+ tests, test-count, python 40
   tests, conformance, typecheck ×2, changelog, build, publint, attw).
3. `python3 .agents/skills/geo-optimization/scripts/test_optimizer.py`.
4. `git diff --check`.
5. Cada cambio actualiza la sección `Unreleased` de `CHANGELOG.md`
   (changelog:check lo exige).

## Revisión de gaps (sub-agente, 2026-08-01)

La revisión independiente del spec + implementación encontró 1 defecto medio
y varios menores; todos corregidos en `3344456`:

- **F-09 (medio)**: `generateLlmsFullTxtFiles` (el path real del CLI para
  `--full`/`generate-all`) no escapaba títulos — corregido + test sobre la
  función real.
- F-05: error de archivo duplicado en modo texto → el loop JSON solo imprime
  en JSON mode.
- F-07: keyword `model` fuera de la lista del spec → quitada.
- F-06: AGENTS.md ahora documenta los marcadores estilísticos (spec lo
  prometía).
- F-14: assert del claim "sin branding" añadido a 058-docs-claims.
- Cosmético: comentario de sección huérfano eliminado.

No accionables (documentados): asimetría `--allow-localhost` para IPv4-mapped
(comportamiento correcto por diseño: el loopback mapeado se trata como
loopback), y la desviación F-11 (e2e TLS no viable en este entorno).

## Pasada de edge cases / sad paths (2026-08-01, `1cfdf17`)

Segunda revisión adversarial enfocada en casos límite de los fixes:

- **F-08 (fix)**: HTML real de CMS envuelve la lista de referencias en
  `div`/`section`/`p`/`li` → falso negativo confirmado por probe; los
  contenedores con `a[href]` ahora cuentan. 3 tests nuevos.
- **F-09 (fix)**: `escapeLinkText` escapa `[` por defensa — marked no inyecta
  con el escape actual, pero parsers de llms.txt con semántica de label más
  estricta podrían cerrar el label antes; coste cero. Test que verifica el
  parse real (marked) sin links inyectados.
- **Probes sin acción** (comportamiento ya correcto): baseline JSON corrupto
  en `report --compare` (error limpio, no crash); `audit -f json --summary`
  con errores (exit 1, stderr no vacío, payload con `failed: 1`); YAML del
  template GitLab parsea y el dotenv queda solo en el job concreto; paridad
  F-10 con headings de tab y emoji (23 = 23); `::ffff:100.64.0.1` (CGNAT
  mapeado) bloqueado.

## Criterio de terminación

- Los 14 findings cerrados con test de regresión que pasa (F-04 y F-06 son
  documentales + tests de contract/label).
- `npm run check` verde, tests Python verdes, árbol limpio al cerrar la rama.
- El informe `docs/audits/auditoria-2026-07-31.md` se actualiza con una sección
  de estado de remediación (qué se arregló, qué queda abierto).
- Revisión de gaps con sub-agente: alineada (1 loop, sin hallazgos restantes
  accionables).
