# Todo — Remediación auditoría 2026-07-31

Spec: `spec.md`. Rama: `chore/audit-fixes`. Un commit por finding.

## Preparación

- [x] Leer informe de auditoría y localizar superficies
- [x] Escribir spec.md
- [x] Crear rama `chore/audit-fixes`

## P0

- [x] **F-01** XSS `--compare`: normalizar + esc() en renderComparisonHtml; test html-report — `8fe33e8`
- [x] **F-02** SSRF 169.254/16 + 100.64/10 en isPrivateIPv4; test fetcher — `9896b92`
- [x] **F-03** IPv4-mapped + fe80::/10 en fetcher; 2 tests fetcher — `9896b92`

## P1

- [x] **F-05** JSON mode: errores a stderr + exit 1 sin threshold; test cli-smoke — `7f21fac`
- [x] **F-07** Filtrar versiones/puertos/IDs en stats; test observations — `35d61ab`
- [x] **F-08** hasSourcesSection por sección real; test observations — `35d61ab`
- [x] **F-09** escapeLinkText + encodeURI (llms-txt, cli entry.url); tests — `f7a2bfd`
- [x] **F-10** `\S` en headings Node+Python; fixtures no-Latin + conformance — `e796126`
- [x] **F-11** Tope 100 sub-sitemaps; test unitario en sitemap.test.js (e2e TLS loopback no viable: entorno roto, ver spec) — `af8434f`

## P2

- [x] **F-04** Docs honor-system + test contract de patrón — `b585b12`
- [x] **F-06** Relabel banda + nota reporte + docs; tests scoring-v2 — `e921f79`
- [x] **F-12** Guarda cwd en `technical -o`; test write-guard/cli-smoke — `9872ccf`
- [x] **F-13** Template GitLab: dotenv al job concreto + comentarios; test — `98a464a`

## P3

- [x] **F-14** free-vs-pro.md: schema sin branding + nota de verificación — `b585b12`
- [x] CHANGELOG.md `Unreleased` con todos los fixes (por commit)

## Cierre

- [x] `npm run check` completo en verde (716 tests, exit 0)
- [x] `python3 test_optimizer.py` en verde (verificado en F-10)
- [x] Anexo de estado de remediación en docs/audits/auditoria-2026-07-31.md (§17)
- [x] Nota "Verified" de free-vs-pro.md actualizada
- [x] Revisión de gaps con sub-agente (1 loop, alineada)
- [x] Commit final (anexo §17 `a4d06a4` + correcciones de revisión `3344456`)
- [x] git status limpio; resumen al usuario (spec.md/todo.md no commiteados salvo petición)

## Revisión de gaps (sub-agente) — completada 2026-08-01

- [x] 1 defecto medio (F-09 llms-full files) + 6 menores corregidos en `3344456`
- [x] `npm run check` re-corro en verde tras las correcciones (712 tests)
- [x] Anexo §17 actualizado a 712 tests
- [x] spec.md documenta el resultado de la revisión

## Pasada de edge cases (2026-08-01) — completada en `1cfdf17`

- [x] F-08: contenedores HTML (div/section/p/li) con links detectados (falso negativo real)
- [x] F-09: escape de `[` por defensa + test de parse real sin links inyectados
- [x] Probes sin acción: JSON corrupto en --compare, summary+errores, YAML template, paridad tab/emoji, CGNAT mapeado
- [x] `npm run check` final en verde (716 tests)
