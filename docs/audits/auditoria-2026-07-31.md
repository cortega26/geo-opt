# Auditoría adversarial de GEO-opt (cortega26/geo-opt v2.3.1)

Fecha: 2026-07-31 · Auditor: Claude Code (red-team, hostile-but-fair)
Idioma del informe: español neutral (preferencia del usuario)

---

## 1. Veredicto ejecutivo

**Calibración de confianza por superficie:**

| Superficie | Veredicto | Confianza |
|---|---|---|
| Contenido local confiable (tus propios archivos) | **Seguro** — sin escrituras fuera de cwd (con una excepción), sin telemetría, sin red en modo local | Alta |
| Repositorio hostil / no confiable | **No completamente seguro** — XSS almacenado vía `report --compare`, inyección markdown en llms.txt, amplificación sin tope en modo sitemap | Media-alta |
| Auditoría remota de URLs (`technical --url/--sitemap`) | **Parcialmente seguro** — DNS-rebinding mitigado por diseño y redirects re-validadas, pero el guard SSRF tiene huecos verificados (169.254.0.0/16, IPv6 mapeado) | Alta para el mecanismo, huecos confirmados |
| Quality gate de CI | **Parcial** — con `--threshold` funciona; sin `--threshold`, fallos parciales de archivo salen con exit 0 y en modo JSON son **silenciosos** | Alta |
| Cumplimiento Free/Pro | **Forma correcta, control comercial forjable** — la clave `tt_pro_` + 20 chars es un regex de código abierto; cualquier usuario puede forjarla. No es una violación de seguridad (no hay boundary), pero la barrera comercial es simbólica | Alta |
| Paridad Node/Python | **Creíble para ASCII, con defectos para no-Latin** — 8/11 fixtures idénticos; 3 divergen en la dimensión estructura (41 vs 44) por `\w` ASCII vs Unicode | Alta |
| Paquete publicado = repositorio | **Sí** — tarball instalado en consumidor limpio funciona; 48 archivos; `npx geo-opt --help` OK | Alta |

**Las cinco razones más importantes del veredicto:**

1. El modo `report --compare` permite **ejecución de script almacenada en el HTML generado** (confirmado end-to-end vía CLI) — superficie de XSS con cobertura de test del 51% de ramas en `html-report.js`.
2. El guard SSRF no bloquea el rango **169.254.0.0/16** (metadata de cloud: 169.254.169.254) ni **IPv6 mapeado IPv4** — el request se intenta (verificado por timeout, no por bloqueo).
3. La licencia Pro es un **regex forjable** (`tt_pro_` + 20 alfanuméricos) — el gate de `report`, `--no-branding` y tipos Pro se cruza con una cadena inventada (verificado).
4. El **modelo de scoring v2 es trivialmente gameable**: contenido fabricado (citas falsas, stats falsos, 5 links falsos) obtiene **93/100 "Production-Ready"**, mientras un documento honesto mínimo obtiene 42 "At Risk"; números de versión/puerto cuentan como estadísticas.
5. El **modo JSON de `audit` oculta fallos**: con un archivo ilegible entre los auditos, exit 0, stderr vacío, y el JSON solo contiene los éxitos — contradice el claim del README "diagnostics on stderr / non-zero exit codes".

**Conclusión calibrada:** geo-opt es un producto de calidad superior a la media (gate `npm run check` completo, 664 tests, cobertura 94.5% líneas/83.9% ramas, honestidad epistémica en evidencia y docs de arquitectura) para su caso principal: auditar contenido propio en local. No debe usarse todavía como gate sobre contenido no confiable (XSS, inyección en llms.txt, DoS de sitemap) ni como barrera comercial efectiva. El modelo v2 debe presentarse con la advertencia de que cualquier score ≥85 es alcanzable sin calidad real.

---

## 2. Alcance y procedencia

| Elemento | Valor |
|---|---|
| Commit exacto | `12c595756ca09478759f44b2a26734cf0d3c5b31` (rama `main`, árbol limpio al inicio y al final) |
| Versión | 2.3.1 (package.json + tarball `geo-opt-2.3.1.tgz`, 181.886 bytes, 48 archivos) |
| Node / npm / Python | v24.15.0 / 11.12.1 / 3.14.3 (Linux 7.0.0-28-generic, Ubuntu 24.04) |
| Lockfile | `package-lock.json` presente; `npm ci` exit 0 |
| Checks ejecutados | `npm ci` ✓ · `npm run check` ✓ (lint, format, 664 tests/112 suites, test-count, python 40 tests, conformance, typecheck ×2, changelog, build, publint, attw) · `npm run test:coverage` ✓ (src: 94.53% líneas, 83.9% ramas) · `npm run knip` ✓ (8 exports sin uso) · `npm pack` ✓ · instalación del tarball en consumidor limpio + `geo-opt --help` ✓ · `npm audit --omit=dev`: 0 vulnerabilidades |
| Artefacto auditado | Código fuente del commit + tarball npm empaquetado (mismo dist/ por build determinista) |
| Excluido/limitado | Red externa bloqueada (no se verificaron los enlaces de la registry de evidencia ni el crawler registry); GitLab real no ejecutado (template analizado estáticamente); Node 22 no ejecutado en vivo (CI lo cubre en matrix 22+24); DNS rebinding dinámico no probable sin control de DNS (mitigación por diseño verificada en código); metadata cloud real no alcanzable en esta máquina |

Artificios creados (todos en `/tmp/geo-audit/`, ninguno en el repo): fixtures adversariales (15), servidores loopback (3), probes (10), reportes de prueba. El tarball del repo se eliminó; `git status` limpio al final.

---

## 3. Resultados base

| Check | Resultado | Evidencia | Interpretación |
|---|---:|---|---|
| `npm ci` | ✅ exit 0 | — | Lockfile reproducible |
| `npm run check` | ✅ exit 0 | salida completa (664 tests, 112 suites, python 40 tests, publint "All good", attw "No problems found") | El gate completo es verde |
| `npm run test:coverage` | ✅ | src 94.53% líneas / 83.9% ramas | Badge README "80%" ✓ (semántica de piso); html-report.js ramas 51.07% (superficie XSS), integrity.js funciones 0% |
| `npm run knip` | ✅ exit 0 | 8 unused exports, 1 duplicate export | Limpieza menor, sin riesgo funcional |
| `npm pack` + consumidor | ✅ | install --ignore-scripts del tgz; `geo-opt --help` OK; auditoría y reporte funcionan desde node_modules | Paquete autocontenido y funcional |
| Determinismo de build | ✅ | `scripts/build.js` copia + hash SHA-256 sin ofuscación; build determinista (fix plan 067 verificado) | Artefacto reproducible |
| `npm audit --omit=dev` | ✅ 0 vulns | — | Sin advisory alcanzable en prod |
| Pruebas adversariales | ⚠ 12 hallazgos | ver sección 7 | El verde del gate no cubre los huecos encontrados |

---

## 4. Mapa de arquitectura y superficie de ataque

- **Entradas**: archivos/directorios (audit, inject, schema, technical, badge, generate-all, sitemap, llmstxt), stdin (no usado), URLs remotas (`technical --url/--sitemap`), `geo_config.json`, `TOOLTICIAN_LICENSE_KEY`/env, frontmatter YAML, `.gitignore`, estado en `~/.config/geo-opt/state.json`.
- **Límites de confianza**: el contenido auditado NO es confiable (repo hostil); el usuario es confiable; la red es hostil.
- **Escrituras**: inject (single+batch), backup `.bak`, report, robots generate, sitemap/llms.txt/generate-all (dirs), `technical -o`, `init`, state file. Guardas cwd en todas **excepto `technical -o`**.
- **Red**: `src/fetcher.js` es la única puerta (URLs explícitas, sitemap index + sub-sitemaps, robots.txt). Sin otras llamadas salientes (telemetry dormant verificado).
- **Artefactos generados**: reportes HTML (XSS surface), llms.txt/llms-full.txt, sitemap.xml, robots.txt, JSON-LD, badges.
- **Límites de licencia**: 3 superficies (report, --no-branding, tipos Pro) tras regex forjable + integrity hash (deterrence).
- **Duplicación Node/Python**: v1 scoring, schema, llms.txt, robots, config, licensing, engagement en Python; v2, technical, fetcher, telemetry, validate, sitemap, html-report solo Node (matriz documentada en docs/architecture.md).

---

## 5. Matriz claim → implementación

| Claim | Fuente | Evidencia de implementación | Evidencia runtime | Veredicto |
|---|---|---|---|---|
| "100% local, zero telemetry, no content uploads" | README:13,76 | telemetry.js dormant (`TELEMETRY_TRANSPORT_ENABLED=false`, allowlist congelada, DO_NOT_TRACK) | Sin red en modo local (código); remoto es opt-in explícito documentado | Confirmado (con matiz: los modos remotos existen y son explícitos) |
| "diagnostics on stderr / non-zero exit codes" | README:79 | cli.js filtra errores en JSON mode | `audit ok bad -f json` → exit 0, stderr 0 bytes | **Contradicho** (JSON mode) |
| "SSRF guards" en technical remoto | README:182,326 | fetcher.js resuelve+valida IP, pinning anti-rebinding, redirects re-validadas, límites | 169.254.0.0/16 y ::ffff:7f00:1 no bloqueados | **Parcial** |
| "Pro gates exactly three surfaces" | docs/free-vs-pro.md:15 | licensing.js + integridad | Gates en forma correcta; clave forjable | Parcial (control comercial forjable) |
| "664 tests / 112 suites" | README:81 | scripts/check-test-count.js | Conteo live 664/112 ✓ | Confirmado |
| Badge cobertura 80% | README | scripts/check-coverage.js (floor semantics) | 83.9% ramas live | Confirmado |
| v2 "experimental, no predictor" | README:130, AGENTS.md | labels EVIDENCE_LABELS, docs architecture | — | Confirmado (honesto) |
| llms.txt "siguiendo la propuesta comunitaria" | README:169 | generateLlmsTxt | Títulos/URLs sin escapar ni encodear | Parcial (defecto) |
| Python "compatible" (tier matrix) | docs/architecture.md:89-93 | test_optimizer.py 40 tests | 3/11 fixtures divergen en no-Latin | Parcial (defecto) |

---

## 6. Resumen de hallazgos

| ID | Sev | Hallazgo | Superficie | Confianza | Reproducción |
|---|---|---|---|---|---|
| F-01 | **Alta** | XSS almacenado en reportes HTML vía `--compare` (baseline sin escapar) | report/html-report.js | confirmado | baseline-evil.json → evil-report.html contiene `<script>` |
| F-02 | **Alta** | SSRF: 169.254.0.0/16 (metadata cloud) no bloqueado | fetcher.js | confirmado | request intentado (timeout, no guard-block) |
| F-03 | **Media** | SSRF: IPv4-mapped IPv6 y link-local IPv6 parcial | fetcher.js | confirmado (guard); exploitabilidad depende del entorno | ::ffff:7f00:1 pasa el guard; net.connect conecta |
| F-04 | **Media** | Licencia Pro forjable (regex) | licensing.js | confirmado | `tt_pro_`+24 A's → hasProEntitlement true |
| F-05 | **Media** | Modo JSON de audit silencia fallos (exit 0, stderr vacío) | cli.js:240 | confirmado | audit ok.md bad.md -f json |
| F-06 | **Media** | Score-gaming v2: 93/100 "Production-Ready" con contenido fabricado | scoring-v2/observations | confirmado | gamed2.md → 93 |
| F-07 | **Media** | Números de versión/puerto/endpoint cuentan como estadísticas | observations.js:576-582 | confirmado | "version 22, endpoint 42, port 8080" → stats 18/20 |
| F-08 | **Media** | `hasSourcesSection` = keyword en cualquier parte del texto | observations.js:856-862 | confirmado | mención de "sources" en prosa → +5 citations |
| F-09 | **Media** | Inyección markdown en llms.txt desde títulos hostiles + URLs sin codificar | llms-txt.js:258 | confirmado | título `Fraud](https://evil.example)` |
| F-10 | **Media** | Paridad Node/Python v1 rota para contenido no-Latin | scoring.js:449 vs geo_optimizer.py:1516 | confirmado | rtl/cjk/cyr: 41 vs 44 |
| F-11 | **Media** | Amplificación sin tope en modo sitemap (sub-sitemaps ilimitados, cross-origin) | cli.js:1733 | confirmado | índice con 200 subs → 200 fetches |
| F-12 | **Baja** | `technical -o` sin guarda de cwd (inconsistente con el resto) | cli.js:1449 | confirmado | `-o ../..` escribió a /tmp |
| F-13 | **Baja** | Template GitLab: `dotenv` apunta a archivo que nadie crea; comentario "recursive (Pro)" falso | ci-templates/gitlab-ci.yml | media (no ejecutado GitLab) | análisis estático |
| F-14 | **Baja** | docs/free-vs-pro.md: "schema por stdout con branding" — runtime sin branding | docs vs cli.js:502 | confirmado | `schema article` → JSON puro |

---

## 7. Hallazgos detallados

### F-01 — XSS almacenado en reportes HTML vía `report --compare` — **ALTA** (confirmado)

- **Superficie**: `src/html-report.js` `renderComparisonHtml` (líneas 561-562, 620-653) + `bin/cli.js:1075-1086`.
- **Invariante esperado**: ningún valor del baseline JSON (archivo externo) debe interpolarse sin escapar en el HTML.
- **Observado**: `before.total_score`/`before.effectiveScore` y `beforeB[k].score`/`afterB[k].score` se interpolan crudos (`${beforeScore}`, `${bv}`, `${av}`), sin `esc()`.
- **Por qué importa**: el baseline es un archivo JSON que el usuario pasa con `--compare`; puede venir de un repo hostil (el mismo contenido que se audita), un artefacto de CI o un atacante. El reporte generado se abre en navegador → ejecución de script.
- **Evidencia**: probe: baseline con `"total_score": "5</div><script>alert(document.domain)</script><div>"` → `renderComparisonHtml` retorna HTML con el `<script>` intacto; CLI end-to-end: `geo-opt report base.md --compare baseline-evil.json -o evil-report.html` → `grep -c "<script>alert(document.domain)</script>"` = **1**. También `breakdown.structure.score` (bv) es interpolable.
- **Reproducción mínima**: crear baseline.json con `total_score: "5</div><script>alert(1)</script>"`, ejecutar `geo-opt report x.md --compare baseline.json`, abrir el HTML.
- **Causa raíz**: solo `findingMsg`, `filepath` y textos estáticos pasan por `esc()`; los valores numéricos del baseline no se tratan como no confiables (el código asume que son números).
- **Alcance/pre-requisitos**: requiere licencia Pro (forjable, F-04) + un baseline controlado por el atacante. 
- **Blast radius**: ejecución de JS en el contexto del archivo local del reporte (acceso a recursos locales si el navegador lo permite; phishing interno; manipulación del reporte).
- **Contraevidencia**: los demás renderers (v1/v2/aggregate) escapan todo; solo la ruta `--compare` es vulnerable. Cobertura de ramas de html-report.js: 51.07% — el modo compare apenas se prueba.
- **Remediación**: `esc()` en `beforeScore`, `afterScore`, `bv`, `av` (o validar que sean números).
- **Test de regresión**: `render-comparison-escapes-malicious-baseline` — fixture `baseline-evil.json` con strings HTML en total_score y breakdown; assert: el HTML no contiene `<script` crudo y sí la entidad `&lt;`.
- **Riesgo del fix**: ninguno (los valores son numéricos; esc de un número es no-op).

### F-02 — SSRF: 169.254.0.0/16 (link-local IPv4) no bloqueado — **ALTA** (confirmado)

- **Superficie**: `src/fetcher.js:88-106` (`isPrivateIPv4`).
- **Invariante**: ninguna IP privada/link-local/metadata debe ser alcanzable con flags por defecto.
- **Observado**: el rango 169.254.0.0/16 no está en la lista (10/8, 172.16/12, 192.168/16, 127/8, 0/8). `fetchUrl("http://169.254.169.254/latest/meta-data/")` con flags default **no** produce un bloqueo del guard: produce timeout de request (4 s) — el request fue intentado.
- **Por qué importa**: 169.254.169.254 es la metadata service de AWS/GCP/Azure/K8s/EKS (169.254.170.2 credenciales EKS). En un runner de CI o VM cloud, un repo hostil con `technical --url` (o sitemap) puede leer credenciales IMDSv1.
- **Evidencia**: `probe-ssrf.mjs` — las 2 URLs 169.254.x.x → "Request total timeout after 4000ms" (no "blocked"). 
- **Reproducción**: `geo-opt technical --url http://169.254.169.254/latest/meta-data/iam/security-credentials/` en una VM cloud (o el probe directo).
- **Causa raíz**: lista de rangos privados incompleta (falta 169.254/16).
- **Blast radius**: exfiltración de credenciales cloud en entornos de CI/cloud; alto impacto donde IMDSv1 está activo.
- **Remediación**: añadir 169.254.0.0/16 (y 100.64.0.0/10 CGNAT por defensa) a `isPrivateIPv4`.
- **Test**: `fetcher-blocks-link-local-metadata` — assert fetchUrl a 169.254.169.254 rechaza con "blocked" antes de conectar.
- **Riesgo del fix**: rompería `--allow-private` a esos rangos si el flag debe permitirlos (decisión de producto; por defecto debe bloquearse).

### F-03 — SSRF: IPv4-mapped IPv6 y link-local IPv6 parcial — **MEDIA** (confirmado como gap de guard; explotabilidad dependiente del entorno)

- **Superficie**: `src/fetcher.js:125-136` (`isPrivateIPv6`).
- **Observado**: `::ffff:7f00:1` (127.0.0.1 en hex mapeado) pasa `detectIpLiteral` y `checkIp` sin bloqueo; `net.connect("::ffff:7f00:1")` **conecta** al loopback en esta plataforma (verificado). El flujo `fetchUrl` completo falla con `getaddrinfo ENOTFOUND [::ffff:7f00:1]` por un quirk de Node (hostname con brackets propagado a la conexión) — por lo que la explotación end-to-end depende de la plataforma/versión. La forma decimal `::ffff:127.0.0.1` se bloquea por accidente (falla la detección, cae a DNS). Link-local IPv6 `fe90::1`–`febf::1` tampoco se bloquean (solo `fe80:`).
- **Clasificación**: gap de cobertura del guard, no explotado end-to-end en este entorno.
- **Remediación**: normalizar IPv4-mapped (detectar `::ffff:` y validar la parte IPv4) y usar `fe80::/10` (prefix match sobre 16 bits) en vez de `startsWith("fe80:")`.
- **Test**: `fetcher-blocks-ipv4-mapped-loopback` y `fetcher-blocks-link-local-v6-range` (fe90::, febf::).

### F-04 — Licencia Pro forjable (control comercial, no security boundary) — **MEDIA** (confirmado)

- **Superficie**: `src/licensing.js:3` — `PRO_LICENSE_PATTERN = /^tt_pro_[A-Za-z0-9_-]{20,}$/`.
- **Observado**: `hasProEntitlement` retorna true con `TOOLTICIAN_LICENSE_KEY="tt_pro_"+24×"A"` (verificado). Sin validación de firma, servidor ni registro.
- **Clasificación correcta**: defecto de control comercial / licenciamiento client-side inherentemente no enforceable (la propia doc dice "La verificación es local"). NO es una vulnerabilidad de seguridad porque no hay boundary de seguridad — cualquiera con la fuente (pública) conoce el patrón. El `integrity.js` anti-tamper es disuasión (un atacante con acceso de escritura a dist/ puede parchear el propio hash).
- **Impacto**: `report`, `--no-branding` y tipos Pro (`course`, `event`, `recipe`, `howto`) están disponibles para cualquiera.
- **Remediación (si se quiere comercial serio)**: firma asimétrica verificable offline (ed25519) + telemetría de activación opcional; o documentar explícitamente que la edición "Pro" es honor-system (hoy lo insinúa sin decirlo).
- **Test**: test de regresión para que el patrón NO admita strings triviales (min length real) — aunque el verdadero fix es firma.

### F-05 — Modo JSON de `audit` silencia fallos de archivo — **MEDIA** (confirmado)

- **Superficie**: `bin/cli.js:235-242` (`results.filter(success)`; el bloque threshold está condicionado a `--threshold`).
- **Observado**: `geo-opt audit ok.md bad.md -f json` con bad.md ilegible → **exit 0, stderr 0 bytes**, JSON solo con el éxito. En modo texto: error en stderr pero igualmente exit 0 (sin `--threshold`).
- **Contradice**: README:79 "diagnostics on stderr" y "non-zero exit codes" (para el gate sin threshold).
- **Impacto**: pipelines que usan `-f json` sin threshold (el modo máquina, el que se redirige a otras herramientas) pasan en verde con archivos fallidos.
- **Remediación**: en JSON mode, incluir los errores en el payload y/o exit 1; al menos, escribir los errores a stderr y exit 1 (consistente con el modo texto). Documentar el contrato exacto.
- **Test**: `audit-json-reports-partial-failures` — 1 archivo OK + 1 ilegible → assert exit ≠ 0 y stderr no vacío.

### F-06 — Score-gaming: 93/100 "Production-Ready" con contenido fabricado — **MEDIA** (confirmado)

- **Superficie**: modelo v2 completo (`scoring-v2.js`, `observations.js`).
- **Observado**: `gamed2.md` (10 minutos de redacción, todo inventado: "According to the Widget Research Institute, 73%...", quotes "— Dr. Sarah Chen, Research Lead", 5 links a example.org, keyword "Sources", fechas publicadas) → **93/100, band "Production-Ready"** (structure 20/20, statistics 15/20, quotations 20/20, citations 20/20, clarity 18/20). Control honesto mínimo → 42 "At Risk".
- **Reglas gamed**: (1) stats falsos con atribución en ventana ±50/+200 chars; (2) quotes falsas con patrón "— Nombre Apellido"; (3) 5+ links externos + keyword "sources" en cualquier parte; (4) fechas publicadas/revisadas; (5) frase intro "X is a ..." de 40-90 palabras; (6) evitar pronombres ambiguos y acrónimos.
- **Interpretación**: el score mide presencia de marcadores estilísticos, no calidad ni veracidad. La banda "Production-Ready" sobre ~90 es alcanzable con contenido semánticamente vacío → **falsa precisión** en el label. Los docs (AGENTS.md, README:130, architecture.md) declaran honestamente que v2 es experimental y no predictor — el defecto está en la banda/label de readiness, no en las claims.
- **Remediación**: suavizar el label de la banda ≥85 ("production-ready" → "strong style markers"), añadir advertencia en el reporte HTML/JSON de que el score no valida veracidad, y documentar los vectores de gaming conocidos (ya existe corpus adversarial en fixtures — ampliarlo con F-07/F-08).
- **Test**: extender `tests/fixtures/audit-v2/adversarial/` con el corpus gamed y un assert de score máximo acotado (< 85) o de detección de fabricación.

### F-07 — Números de versión/puerto/endpoint cuentan como estadísticas — **MEDIA** (confirmado)

- **Superficie**: `observations.js:576-582` — regex `\b\d+(?:\.\d+)?%|\$\d+...|\b\d{2,}(?:,\d{3})*(?:\.\d+)?\b`, filtra solo años 19xx/20xx.
- **Observado**: documento sin una sola estadística real ("version 22", "endpoint 42", "port 8080" + "According to docs") → statistics **18/20** (3 stats atribuidas).
- **Impacto**: false positives masivos en documentación técnica (donde versiones/puertos/IDs abundan) + vector de gaming trivial.
- **Remediación**: excluir contextos de versión/puerto/ID (p. ej., precedidos de "v", "version", "port", "endpoint", "ID", "0x"), o requerir signo %/$/unidad.
- **Test**: `observations-ignores-versions-ports-ids` — fixture con versiones/puertos → totalStats=0.

### F-08 — `hasSourcesSection` por keyword en cualquier parte del texto — **MEDIA** (confirmado)

- **Superficie**: `observations.js:856-862` — `textContent.toLowerCase().includes(keyword)` sobre todo el texto.
- **Observado**: documento sin links ni sección de referencias, con la palabra "sources" mencionada en prosa → `linkSummary.hasSourcesSection = true`, citations 5/20 (en vez de 0/20).
- **Impacto**: +5 puntos de citations por mención casual; gaming trivial ("este texto menciona sources").
- **Remediación**: detectar una sección real (heading "Sources/References" con contenido de links debajo), no la keyword global.
- **Test**: `observations-requires-real-sources-section`.

### F-09 — Inyección markdown en llms.txt + URLs sin codificar — **MEDIA** (confirmado)

- **Superficie**: `src/llms-txt.js:258,269,324,524` — `- [${entry.title}](${entry.url})` y `## [${title}](${url})` sin escapar; `resolvePageUrl` sin encodeURIComponent.
- **Observado**: archivo con H1 `Fraud](https://evil.example)` → llms.txt generado contiene `- [Fraud](https://evil.example)](https://example.com/evil-title/)` — **link inyectado a dominio arbitrario** en un artefacto consumido por LLMs. Archivo `mi página con espacios.md` → `https://example.com/mi página con espacios/` (URL inválida RFC 3986) en llms.txt y `<loc>` de sitemap.
- **Impacto**: un repo hostil auditable inyecta entradas/URLs en llms.txt y sitemap; el artefacto propagado es el vector.
- **Remediación**: escapar `]` y `(` en títulos/descripciones; `encodeURI`/`encodeURIComponent` en la URL construida.
- **Test**: `llms-txt-escapes-hostile-titles` y `sitemap-encodes-urls`.

### F-10 — Paridad Node/Python rota para contenido no-Latin (v1) — **MEDIA** (confirmado)

- **Superficie**: `src/scoring.js:449` (`/^##+\s+\w+/m` — `\w` ASCII en JS) vs `.agents/.../geo_optimizer.py:1516` (`re.search(r'^##+\s+\w+', text, re.MULTILINE)` — `\w` Unicode en Python).
- **Observado** (diferencial con fixtures idénticos): rtl.md (árabe) 41 vs **44**; cjk.md (chino) 41 vs **44**; cyr.md (cirílico) 41 vs **44** — divergencia de 3 puntos en la dimensión estructura (headers). Los otros 8 fixtures (incl. gamed, high, binary, empty) idénticos.
- **Clasificación**: defecto de compatibilidad (Node es canónico; el port Python difiere en contenido no-Latin). La suite de conformance compara un único fixture ASCII (`conformance-basic.md`) → no cubre el caso.
- **Remediación**: usar detección de heading con `^\s{0,3}#{2,6}\s+\S` (cualquier carácter no-espacio) en ambos, o Unicode-aware en JS (`/^##+\s+\S/u` — `\S` no-espacio cubre no-Latin).
- **Test**: `conformance-non-latin-headings` — fixture árabe/chino en tests/conformance.

### F-11 — Amplificación sin tope en modo sitemap — **MEDIA** (confirmado)

- **Superficie**: `bin/cli.js:1733-1783` — bucle `for (const sub of parsed.sitemapUrls)` sin límite.
- **Observado**: índice sitemap con 200 sub-sitemaps → 200 fetches (verificado con servidor loopback; 50 en 38 ms). `--max-urls` solo acota las páginas finales, no los sub-sitemaps. Los `loc` de sub-sitemaps pueden apuntar a **cualquier host público** (cross-origin) y se fetchean sin chequeo de robots. Cada sub-sitemap admite hasta 10 MB y 30 s.
- **Impacto**: DoS en CI (tiempo ilimitado) y uso del CLI como fetch-proxy de URLs públicas arbitrarias.
- **Remediación**: tope (p. ej. 100) en sub-sitemaps y nivel de anidación 1; revalidar robots/origin de sub-sitemaps.
- **Test**: `sitemap-mode-caps-sub-sitemaps`.

### F-12 — `technical -o` sin guarda de cwd — **BAJA** (confirmado)

- **Superficie**: `bin/cli.js:1449-1456`. Todos los demás outputs (report, robots generate, sitemap, llmstxt, generate-all, inject) aplican `assertNewFileParentInsideCwd`/`assertOutputDirInsideCwd`; `technical -o` hace `path.resolve` + `writeFileSync` directo.
- **Observado**: `geo-opt technical x.md -f json -o /tmp/geo-audit/cli/../../escape-me.json` → escribió `/tmp/escape-me.json` (fuera de cwd), exit 0.
- **Clasificación**: inconsistencia del propio modelo de seguridad del producto (el usuario pasa la ruta explícitamente, así que no es explotable por contenido — defensa en profundidad/contrato inconsistente).
- **Remediación**: aplicar la misma guarda.
- **Test**: `technical-output-enforces-cwd`.

### F-13 — Template GitLab: dotenv a archivo inexistente + comentario Pro erróneo — **BAJA** (parcial)

- `ci-templates/gitlab-ci.yml:44-47`: `reports: dotenv: geo-opt-env.env` — ningún paso crea ese archivo → en GitLab, un artifact dotenv ausente suele fallar el job (no verificado en runtime GitLab). 
- Línea 11: `GEO_OPT_RECURSIVE — set to "true" to scan directories recursively (Pro)` — **falso**: `audit --recursive` funciona sin licencia (verificado, exit 0).

### F-14 — docs/free-vs-pro.md: "schema por stdout, con branding" — **BAJA** (confirmado)

- La tabla de free-vs-pro.md (línea 33) afirma que `schema` Community imprime "con branding"; runtime: `geo-opt schema x.md article` imprime JSON puro (verificado). La doc interna se contradice con el README ("Print generated JSON-LD to stdout") y con el runtime.

---

## 8. Hipótesis descartadas (con evidencia)

1. **Prototype pollution vía frontmatter YAML / config JSON** (`__proto__`, `constructor`) — DESCARTADA: yaml v2 y JSON.parse producen claves propias sin tocar Object.prototype (verificado con probe).
2. **`geo-opt validate` falla sobre su propia salida inyectada** — DESCARTADA: el regex de fence exige el cierre ``` tras el `}`, forzando el match completo; validación "Valid JSON-LD" sobre salida inyectada (verificado).
3. **XSS en reportes vía filepath/findings/recomendaciones** — DESCARTADA: `esc()` cubre esos campos en v1/v2/aggregate (verificado por probe; solo la ruta --compare es vulnerable, F-01).
4. **Inyección `</script>` en JSON-LD** — DESCARTADA: `buildInjectedContent` escapa `</` → `<\/` (código).
5. **ReDoS por patrones derivados de contenido** — no encontrado: los acrónimos derivan de `[A-Z]{2,}` (charset seguro) y las regex de observaciones son lineales en la práctica (análisis).
6. **Catastrophic regex / parseo profundo**: HTML anidado 4000 niveles → technical en 0.26 s sin crash; markdown de 58 KB → v2 en 0.2 s.
7. **SSRF en redirects**: cada redirect re-resuelve y re-valida IPs (código); protocolo no-http(s) rechazado.
8. **DNS rebinding**: mitigado por diseño — conexión anclada a la IP pre-resuelta verificada (código).
9. **npm audit**: 0 vulnerabilidades en prod.
10. **Doble inyección de schema**: idempotente (reemplaza el bloque existente; verificado: 1 bloque tras 2 injects).
11. **Guardas de cwd**: sitemap/llmstxt/robots/report/generate-all bloquean escapes `../` (verificado con escapes fallidos).
12. **Exit codes de threshold**: 0/100/101/1e3/-5/1.5 → semántica correcta (verificado).

---

## 9. Evaluación del modelo de scoring

- **Invariantes verificados**: score en 0-100 ✓; eliminación de evidencia no mejora dimensiones de evidencia ✓ (por construcción); perfil estable y explicable ✓ (resolveProfile con reasons); dimensiones no aplicables omitidas ✓; el mismo documento en md vs html es razonablemente consistente ✓ (por código, no re-testado exhaustivamente).
- **Gaming (score-gaming corpus)**: 93/100 con fabricación completa; 90/100 con la primera iteración; v1 también gameable (86/100 con el mismo corpus). Reglas gamed: stats+atribución falsa, quotes falsas, links falsos, keyword sources, fechas, intro 40-90 con "is a", cero pronombres.
- **Falsos positivos**: versiones/puertos/IDs como stats (F-07); "sources" en prosa (F-08); `hasSourcesSection` por keyword global.
- **Falsos negativos (corpus false-negative)**: contenido fuerte pero sin keyword "sources" pierde +5; contenido no-Latin pierde estructura en Node (F-10). El corpus de fixtures de tests es mayoritariamente editorial inglés; hay fixtures por perfil y adversarial, pero sin contenido no-Latin en el test de conformance.
- **Taxonomía de evidencia**: honesta (labels strong/probable/experimental/heuristic con definiciones y registry versionado con fechas de verificación; el registro admite staleEvidenceWarnings y el propio código nota la verificación pendiente de geo-kdd-2024). Limitación: los enlaces externos (arxiv, docs de Google/OpenAI/Anthropic) no pudieron verificarse offline; la claims "strong" sobre atribución de stats/quotes se apoya en 2 papers no verificables aquí.
- **Presentación numérica**: la banda "Production-Ready" ≥85% es falsa precisión dado el gaming; el README y AGENTS.md declaran correctamente que no es predictor de ranking/retrieval — la falla está en el label de readiness, no en las claims.

---

## 10. Evaluación de seguridad

- **Filesystem**: guardas de cwd sólidas (realpath, ancestros symlinked) salvo `technical -o` (F-12); escrituras no atómicas en inject (fallo a mitad = archivo parcial, sin rollback) — aceptable para CLI local; backup `.bak` no es único (sobreescribe) — documentado como limitación; state file con rename atómico ✓.
- **SSRF/red**: gaps F-02/F-03; mitigaciones sólidas (pinning anti-rebinding, revalidación de redirects, timeouts total 30 s / respuesta 15 s, tamaño 2 MB, semáforos 2/10) ✓; sin límite de sub-sitemaps (F-11).
- **Parser/inyección**: sin XSS en los renderers principales ✓; XSS en --compare (F-01); inyección markdown en llms.txt (F-09); fast-xml-parser sin DTD (XXE seguro por configuración) ✓; prototype pollution descartada ✓.
- **HTML report XSS**: F-01 (única ruta vulnerable).
- **Dependencias/supply chain**: 0 advisory en prod; `npm audit --audit-level` con allowlist justificada en CI; Actions fijadas por tag mayor (v7) — práctica estándar, sin pinning por SHA (informativo); release con OIDC/provenance ✓; el job de publish no depende del job CI (riesgo de publicar con tests rotos en main — la validación de package sí corre).
- **Privacidad**: telemetry dormant verificado en código (interruptor false, allowlist congelada, DO_NOT_TRACK); reminders solo TTY + no-CI ✓; state local ✓; el claim "100% local" es cierto para comandos locales.
- **DoS**: F-11 (sitemap); rendimiento general bueno (0.2-0.3 s en cargas grandes); sin límite de archivos en audit batch (lineal, sin problema).

---

## 11. Evaluación del contrato de producto

- **CLI**: ayuda completa ✓; flags inválidos → errores claros exit 1 ✓; `--format json` stdout puro (verificado: JSON parseable, warnings en stderr) ✓; excepción: fallos de archivo silenciosos en JSON (F-05).
- **Exit codes**: threshold correcto (F-12 descartado); errores de usuario exit 1 ✓; parcial-fallo exit 0 sin threshold (F-05).
- **JSON estable**: `REPORT_VERSION 1.0.0` + `MODEL_VERSION` versionados ✓; schema del reporte estable por contract tests ✓.
- **Paquete**: 48 archivos correctos; ESM; `index.d.ts` + attw "no problems" ✓; consumidor limpio funciona ✓; `prepare` instala pre-commit hook (efecto lateral inofensivo, ignorado con `--ignore-scripts`).
- **CI integration**: action composite + template GitLab (F-13); dogfood en CI ✓.
- **Free/Pro**: gating en forma ✓ (3 superficies, mensajes claros); clave forjable (F-04); docs free-vs-pro honestas sobre "verificación local" pero sin declarar forjabilidad; tabla con branding errónea (F-14).
- **Documentación**: claims cuantitativas verificadas (664/112, 80% cobertura); claims cualitativas en su mayoría confirmadas o parciales (F-01 a F-14).

---

## 12. Matriz diferencial Node/Python (v1, fixtures idénticos)

| Comportamiento | Node | Python | Esperado | Clasificación |
|---|---|---|---|---|
| empty.md | 20 | 20 | 20 | ✓ |
| high.md | 86 | 86 | 86 | ✓ |
| gamed.md | 86 | 86 | 86 | ✓ |
| badfm.md (frontmatter malformado) | 20 | 20 | 20 | ✓ |
| binary.md | 19 | 19 | 19 | ✓ |
| hugeline.md | 20 | 20 | 20 | ✓ |
| multilang.md (es/de/fr) | 61 | 61 | 61 | ✓ |
| **rtl.md (árabe)** | **41** | **44** | igual | **Defecto de compatibilidad** (F-10) |
| **cjk.md (chino)** | **41** | **44** | igual | **Defecto de compatibilidad** (F-10) |
| **cyr.md (cirílico)** | **41** | **44** | igual | **Defecto de compatibilidad** (F-10) |
| ctrl.md | 23 | 23 | 23 | ✓ |
| llms.txt (Node `--base-url` vs Python `--site-url`) | flag Node-only | flag distinto | matriz dice "compatible" | Gap de flag (documentado en matriz solo como "frontmatter Node-only") |

v2, technical, fetcher, validate, sitemap, html-report, telemetry: Node-only (matriz honesta).

---

## 13. Matriz de gaps de tests

| Riesgo | Cobertura existente | Caso adversarial faltante | Test propuesto |
|---|---|---|---|
| XSS en --compare | html-report.js ramas 51% | baseline con strings HTML | `render-comparison-escapes-malicious-baseline` |
| SSRF 169.254/16 | fetcher.test.js cubre 127/10/192.168 | metadata service | `fetcher-blocks-link-local-metadata` |
| SSRF IPv6 mapeado/link-local | no cubierto | ::ffff:7f00:1, fe90:: | `fetcher-blocks-ipv4-mapped-loopback` |
| Paridad no-Latin | conformance solo ASCII | fixtures árabe/chino/cirílico | `conformance-non-latin-headings` |
| Fallo parcial JSON | cli-smoke sin caso mixto | 1 OK + 1 ilegible | `audit-json-reports-partial-failures` |
| Score gaming | adversarial/ existe | corpus con stats/links fabricados | `v2-gamed-content-capped` |
| Version/port como stats | no cubierto | "version 22, port 8080" | `observations-ignores-versions-ports-ids` |
| sources keyword global | no cubierto | mención casual de "sources" | `observations-requires-real-sources-section` |
| Sub-sitemaps ilimitados | sitemap.test.js sin red | índice con N subs | `sitemap-mode-caps-sub-sitemaps` |
| llms.txt escaping | sin título hostil | `Fraud](evil)` | `llms-txt-escapes-hostile-titles` |
| URLs con espacios | sin caso | filename con espacios | `sitemap-encodes-urls` |
| technical -o guard | write-guard.test.js sin -o | -o ../.. | `technical-output-enforces-cwd` |

---

## 14. Plan de remediación

### P0 — Bloqueador de release
- **F-01** (XSS --compare): escapar todos los valores del baseline en `renderComparisonHtml`. Archivos: `src/html-report.js:561-562,620-653`. Test de regresión como en §7. Riesgo: ninguno.
- **F-02** (SSRF 169.254/16): añadir el rango a `isPrivateIPv4` (y 100.64/10). Archivo: `src/fetcher.js:88-106`. Riesgo: romper `--allow-private` intencional a ese rango (decisión explícita).
- **F-03** (IPv6 mapeado): detección de `::ffff:` + revalidación IPv4; `fe80::/10` por máscara. Archivo: `src/fetcher.js:125-185`. Test: 2 nuevos en fetcher.test.js.

### P1 — Próximo patch
- **F-05**: errores a stderr + exit 1 en JSON mode (o payload con errores). `bin/cli.js:235-242`.
- **F-07**: filtrar versiones/puertos/IDs en stats. `observations.js:576-582`.
- **F-08**: detectar sección real de sources. `observations.js:856-862`.
- **F-09**: escapar títulos y codificar URLs en llms.txt/sitemap. `llms-txt.js:258,269,324,524`, `resolvePageUrl`, `cli.js:434-437`.
- **F-10**: `\S` en detección de headings (Node y Python) + fixtures no-Latin en conformance.
- **F-11**: tope de sub-sitemaps (100) y anidación 1 nivel. `bin/cli.js:1733-1783`.

### P2 — Siguiente minor
- **F-04**: firma ed25519 offline para claves Pro (o declaración explícita honor-system en docs).
- **F-06**: relabel de banda ≥85 ("production-ready" → neutral), nota en reporte sobre no-veracidad.
- **F-12**: guarda de cwd en `technical -o`.
- **F-13**: template GitLab — crear geo-opt-env.env o quitar dotenv; corregir comentario recursive/Pro.

### P3 — Hardening/backlog
- **F-14**: corregir tabla de free-vs-pro.md.
- Knip: eliminar/exportar los 8 símbolos muertos.
- CRAWLER_REGISTRY: re-verificar tokens con las fuentes oficiales (fecha 2026-06-26).
- Verificación externa de la registry de evidencia (geo-kdd-2024 sin re-verificar desde 2024-08-01).
- Pin por SHA de Actions (opcional).

---

## 15. Riesgo residual

- No se verificó la metadata cloud real (169.254.169.254 no alcanzable en esta máquina); la explotación de F-02 requiere entorno cloud/CI — la evidencia es el request intentado.
- La explotación end-to-end de F-03 no se logró en esta plataforma (quirk de Node) — puede ser explotable en otras versiones/SO.
- Los enlaces externos de la registry de evidencia y del crawler registry no pudieron verificarse (red bloqueada en CI y en este entorno).
- Node 22 no ejecutado en vivo (solo 24); la matrix CI cubre ambos.
- No se ejecutó GitLab real (F-13 es análisis estático de un template).
- El comportamiento de `fast-xml-parser` con XMLs adversariales grandes se probó solo hasta 200 subs.
- No se probó el comportamiento con archivos >10 MB en sitemaps remotos (el límite existe).

Para aumentar la confianza: ejecutar en una VM cloud con IMDSv1 activo; verificar la registry de evidencia con red; añadir los tests P0-P1.

---

## 16. Checklist por dominio

| Dominio | Estado |
|---|---|
| A. Integridad repo/build/release | Verificado (con nota: publish sin dependency del job CI) |
| B. Contrato CLI y semántica de fallos | Verificado (F-05 encontrado) |
| C. Seguridad de filesystem | Verificado (F-12 encontrado) |
| D. SSRF/red | Verificado (F-02, F-03, F-11 encontrados) |
| E. Parsers e inyección | Verificado (F-01, F-09; pollution descartada) |
| F. Validez del scoring | Verificado (F-06, F-07, F-08) |
| G. Taxonomía de evidencia | Verificado (honesta; limitación de verificación externa) |
| H. Schema.org | Verificado (inyección `</script>` descartada; gating F-04) |
| I. robots/llms.txt/sitemap | Verificado (F-09, F-11, F-13) |
| J. Conformidad Node/Python | Verificado (F-10) |
| K. Límites Free/Pro | Verificado (F-04, F-14) |
| L. Privacidad/telemetría | Verificado (dormant, claims confirmadas) |
| M. Dependencias/supply chain | Verificado (0 vulns; Actions por tag mayor) |
| N. Rendimiento/DoS | Verificado (F-11; rendimiento general bueno) |
| O. Configuración/precedencia | Parcialmente verificado (precedencia CLI>config por código; malformed config degrada a defaults con warning) |
| P. Docs vs runtime | Verificado (F-05, F-13, F-14) |
| Q. Calidad de la suite de tests | Verificado (gaps §13) |
| R. API/compatibilidad | Parcialmente verificado (contract tests ✓; knip 8 muertos; duplicación Node/Python documentada) |

---

## Evidencia bruta conservada

Todos los probes, fixtures y salidas: `/tmp/geo-audit/` (probe-*.mjs, fixtures en `fixtures/`, `diff/in/`, reportes `evil-report.html`, `out-*`). No se modificó ningún archivo del repositorio; `git status` limpio al cierre (HEAD `12c5957`).

**Respuesta a la pregunta central del encargo:** *¿Bajo qué condiciones precisas se puede confiar en GEO-opt?*
Confiable para auditar contenido propio en local con `--threshold` en CI; confiable para consumo de biblioteca con contenido de confianza. No confiable aún como gate sobre repositorios hostiles (XSS vía --compare, inyección en llms.txt, DoS de sitemap, score "Production-Ready" alcanzable con fabricación), ni como barrera comercial, ni para contenido no-Latin con paridad byte-a-byte Node/Python. La confianza se rompe en esos puntos concretos, y la evidencia de cada ruptura está en las secciones 7 y 8.

---

## 17. Estado de remediación (2026-08-01)

Todos los hallazgos fueron corregidos en la rama `chore/audit-fixes` (base
`12c5957`), un commit por finding, con tests de regresión. Estado por
hallazgo:

| ID | Fix | Commit | Test de regresión | Estado |
|---|---|---|---|---|
| F-01 | `esc()` + normalización numérica en `renderComparisonHtml` | `8fe33e8` | `render-comparison-escapes-malicious-baseline` | ✅ Cerrado |
| F-02 | 169.254.0.0/16 + 100.64.0.0/10 en `isPrivateIPv4` | `9896b92` | `fetcher-blocks-link-local-metadata`, `-cgnat-range` | ✅ Cerrado |
| F-03 | IPv4-mapped normalizado + fe80::/10 por máscara | `9896b92` | `fetcher-blocks-ipv4-mapped-loopback/-private/-link-local-v6-range` | ✅ Cerrado |
| F-04 | Docs: honor-system declarado + contract del patrón | `b585b12` | `license-pattern-contract` | ✅ Cerrado (documental; firma = backlog) |
| F-05 | JSON mode: stderr + exit 1 en fallos parciales | `7f21fac` | `audit-json-reports-partial-failures` | ✅ Cerrado |
| F-06 | Label "Strong Style Markers" + nota no-veracidad | `e921f79` | `band-label-is-neutral` + fixture `style-markers-gamed` (97/100) | ✅ Cerrado |
| F-07 | Filtro de contextos técnicos en stats | `35d61ab` | `observations-ignores-versions-ports-ids` | ✅ Cerrado |
| F-08 | Sección de sources real (heading + links) | `35d61ab` | `observations-requires-real-sources-section` | ✅ Cerrado |
| F-09 | `escapeLinkText` + encodeURI por segmento | `f7a2bfd` | `llms-txt-escapes-hostile-titles`, `sitemap-encodes-urls` | ✅ Cerrado |
| F-10 | `\S` en headings Node + Python; fixtures no-Latin | `e796126` | `conformance-non-latin-headings` (rtl/cjk/cyr) | ✅ Cerrado |
| F-11 | Tope de 100 fetches de sub-sitemaps (cola, fetch inyectable) | `af8434f` | `sitemap-mode-caps-sub-sitemaps` | ✅ Cerrado |
| F-12 | Guarda de cwd en `technical -o` | `9872ccf` | `technical-output-enforces-cwd` | ✅ Cerrado |
| F-13 | dotenv al job concreto; comentarios corregidos | `98a464a` | ci-assets: claims F-13 | ✅ Cerrado |
| F-14 | Tabla free-vs-pro sin branding | `b585b12` | (docs-claims suite) | ✅ Cerrado |

**Efectos de calibración observados** (intencionados): ningún fixture del repo
supera ya 68/100 en v2 (antes 93 con el corpus gamed) — el modelo premia
menos los marcadores fabricables; `excellent-tech-doc-no-quotes` baja de
"solid" a "needs-work" (58) porque su "+5 citations" venía del bug F-08
("references" como verbo en prosa). El corpus adversarial creció con
`style-markers-gamed.md` (97/100 fabricado — documenta que la banda alta es
alcanzable sin veracidad, de ahí el relabel F-06).

**Gate final**: `npm run check` completo en verde; suite Python 40/40;
712 tests Node / 112 suites. El badge de test-count de los README se
actualizó en cada commit (664 → 712).

**Backlog no cubierto** (del plan P3): firma criptográfica para claves Pro
(F-04, requiere diseño de producto), knip (8 exports sin uso), re-verificación
de CRAWLER_REGISTRY y de la registry de evidencia (requieren red), pin por
SHA de Actions.

> **Supersedido 2026-08-01:** el backlog P3 se cerró en `58c965d` (squash de
> `chore/p3-cleanup`) — knip limpio (8 exports eliminados), Actions pineadas
> a SHA, CRAWLER_REGISTRY (15/15 tokens vigentes) y evidence registry (GEO
> KDD 2024 v3 y What Gets Cited v1 sin retracción) re-verificadas con red.
> Único resto: la firma de claves Pro, convertida en
> [Plan 068 DEFERRED](../plans/068-license-signing.md) (triggers: 059
> CONTINUE + 060 GO + canal de venta). La remediación completa se publicó
> como geo-opt 2.3.2.
