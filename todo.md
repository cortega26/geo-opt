# Todo — Verificación e2e de la remediación (auditoría 2026-07-31)

Spec: `spec.md`. Base: `main` @ `7ebe7cd` (v2.3.2). Ciclo previo (fixes F-01..F-14
+ P3) ya fusionado; esta pasada verifica que los fixes se sostienen black-box.

## Preparación

- [x] Leer informe de auditoría y estado del repo (main limpio, v2.3.2)
- [x] Gate `npm run check` baseline en verde
- [x] Verificar marcadores de los 14 fixes en src/ (grep)
- [x] Confirmar shapes: JSON v2 (readinessBand/Label, dimensions), baseline
      --compare, flags CLI (llmstxt generate, sitemap generate, technical
      --sitemap/--allow-localhost)
- [x] Reescibir spec.md para la pasada de verificación
- [x] Escribir tests/audit-2026-07-31.e2e.test.js

## Suite e2e (tests/audit-2026-07-31.e2e.test.js)

- [x] F-01 report --compare escapa baseline malicioso (CLI, clave forjada)
- [x] F-02 fetchUrl bloquea 169.254.0.0/16 y 100.64.0.0/10
- [x] F-03 fetchUrl bloquea ::ffff:7f00:1, ::ffff:127.0.0.1, fe90::1, febf::1
- [x] F-04 forja funcional (report exit 0) + docs honor-system
- [x] F-05 audit -f json/texto con fallo parcial → exit ≠ 0, stderr no vacío
- [x] F-06 banda gamed: id "production-ready" + label "Strong Style Markers"
- [x] F-07 versiones/puertos/IDs → statistics.score === 0
- [x] F-08 "sources" casual → citations.score === 0; control positivo > 0
- [x] F-09 llms.txt + sitemap escapan título hostil y codifican URL (%20)
- [x] F-10 paridad no-Latin node === python (rtl/cjk/cyr)
- [x] F-11 tope 100 sub-sitemaps (collectSubSitemapPageUrls; e2e CLI loopback no viable: sandbox rompe TCP cross-process)
- [x] F-12 technical -o fuera de cwd → rechazado, sin escritura
- [x] F-13 template GitLab: dotenv solo en job concreto, sin "(Pro)" falso
- [x] F-14 free-vs-pro.md "sin branding" + schema → JSON puro

## Cierre

- [x] `node --test tests/audit-2026-07-31.e2e.test.js` en verde (25/25)
- [x] `npm run check` completo en verde (742 tests, incluye suite nueva)
- [x] Race de build encontrada y corregida (scripts/build.js filter + test invariante artifact.test.js + CHANGELOG + README badges)
- [x] Actualizar informe §18 con resultado de la pasada (14/14 sostienen + hallazgo nuevo build race)
- [x] Revisión de gaps con sub-agente (1 loop): 5 huecos accionables corregidos (F-04 negativo, F-12 positivo, F-01 esc(), F-10 valores absolutos, F-13 bloque robusto) + **residual F-05 real** corregido en producto (discoverFiles onMissingPath + audit exit 1) + root-skip + timeout 30s en spawns
- [x] Gate final en verde (745 tests/112 suites)
- [ ] git status limpio; resumen al usuario
