# Spec — Verificación end-to-end de la remediación de la auditoría 2026-07-31

Fuente: [`docs/audits/auditoria-2026-07-31.md`](docs/audits/auditoria-2026-07-31.md) (14
hallazgos F-01…F-14 sobre geo-opt v2.3.1, commit `12c5957`). La remediación se
fusionó a `main` en `dc48b64` (fixes) y `58c965d` (backlog P3), y se publicó
como geo-opt **2.3.2** (`7afd309`); nota de supersesión en `7ebe7cd`.

Este documento define la **pasada de verificación**: reproducir cada probe
adversarial del informe contra el `main` actual (v2.3.2) de forma black-box y
confirmar que el comportamiento corregido se sostiene. Cualquier fix que haya
regresado se corrige de nuevo con su test.

## Objetivo

1. Suite e2e nueva (`tests/audit-2026-07-31.e2e.test.js`) que reproduce los 14
   hallazgos del informe y asserta el comportamiento corregido, ejecutando la
   CLI real como subproceso (y las entradas de red reales del módulo para los
   guards SSRF, cuyas funciones internas no son exports públicos).
2. Correr la suite sobre `main` v2.3.2; corregir cualquier regresión que
   aparezca.
3. Gate completo en verde (`npm run check` + suite e2e nueva) sin tocar
   contratos públicos.

## Decisiones de alcance

| Finding | Verificación e2e | Nota |
|---|---|---|
| F-01 | CLI `report --compare` con baseline malicioso → HTML sin `<script` crudo; la normalización numérica (NaN→0) elimina los scores maliciosos por completo (ni crudo ni entidades), y el `findingMsg` hostil se escapa a entidades `&lt;script&gt;` (camino `esc()` vivo) | Requiere clave Pro (forjada, F-04) |
| F-02 | `fetchUrl("http://169.254.169.254/…")` y `100.64.0.1` rechazan con "blocked" (sin request) | `isPrivateIPv4` no es export; `fetchUrl` es la entrada real |
| F-03 | `fetchUrl` a `[::ffff:7f00:1]`, `[::ffff:127.0.0.1]`, `[fe90::1]`, `[febf::1]` → "blocked" | Idem |
| F-04 | CLI `report` con clave `tt_pro_`+24×A funciona (forja funcional) + docs declaran honor-system | Firma = Plan 068 DEFERRED |
| F-05 | `audit ok bad -f json` → exit ≠ 0, stderr no vacío (texto y JSON); **residual corregido en esta pasada**: path explícito inexistente en modo mixto (`audit ok.md missing.md`) se descartaba en silencio (exit 0, stderr vacío) — ahora `onMissingPath` lo diagnostica y falla el comando | Fixture chmod 0o000 con skip si la suite corre como root (root lee cualquier archivo); el caso inexistente cubre el contrato para todos los usuarios |
| F-06 | `audit` del fixture gamed → `readinessBand: "production-ready"` (id estable) y `readinessLabel: "Strong Style Markers"` (label neutral) | Contract del JSON: el id no cambia |
| F-07 | Documento con "version 22 / endpoint 42 / port 8080 / id 12345" → `dimensions.statistics.score === 0` | |
| F-08 | Prosa con mención casual de "sources" sin links → `dimensions.citations.score === 0`; control positivo con sección real → > 0 | |
| F-09 | `llmstxt generate` y `sitemap generate` sobre título hostil `Fraud](https://evil.example)` y nombre con espacios → sin `](evil)` crudo, URL con `%20` | |
| F-10 | `rtl.md`/`cjk.md`/`cyr.md`: `total_score` Node v1 === Python v1 | Medido hoy: 23=23=23 (fixtures commitados) |
| F-11 | `collectSubSitemapPageUrls` (función real del fix) con fetch inyectable: 150 subs → 100 fetches, 50 descartados; anidación contra el mismo tope | **Desviación de entorno**: TCP loopback entre procesos no funciona en el sandbox actual (servidor http/https en 127.0.0.1 recibe 0 conexiones de un proceso hijo — verificado; mismo patrón que el EPROTO TLS del ciclo previo); además `technical --sitemap` exige `https://` incondicionalmente. El test unitario ejercita la lógica exacta del tope que el CLI delega (`bin/cli.js:1761`) |
| F-12 | `technical -o /tmp/…` (fuera de cwd) → exit ≠ 0, archivo no escrito | |
| F-13 | Template GitLab: sin `dotenv` en el job hidden; `dotenv: geo-opt-env.env` solo en el job concreto; sin "(Pro)" en `GEO_OPT_RECURSIVE` | Análisis estático del artefacto |
| F-14 | `docs/free-vs-pro.md` dice "sin branding" + `schema <f> article` imprime JSON puro | |

Fuera de alcance: firma criptográfica Pro (Plan 068 DEFERRED — triggers de
negocio), re-diseños de producto, cambios de contract JSON.

## Estado de entrada (verificado 2026-08-01)

- `main` en `7ebe7cd`, árbol limpio, versión 2.3.2.
- Gate `npm run check` completo en verde (baseline, exit 0).
- Marcadores de los 14 fixes presentes en `src/` (grep verificado):
  F-01 `esc()` cubre `findingMsg`/filepath/labels (los scores del baseline se
  **normalizan** a número, no se escapan); F-02 `169.254.0.0/16` +
  `100.64.0.0/10` en `fetcher.js:104-107`; F-03 `normalizeIpv4Mapped` (`fetcher.js:132`) +
  `fe80::/10` por máscara (`:177-179`); F-05 comentario-fix en `cli.js:269`;
  F-06 label en `scoring-v2.js:669`; F-07 `isContextualIdentifier`
  (`observations.js:573`); F-08 `hasRealSourcesSection` (`observations.js:846`);
  F-09 `escapeLinkText` (`llms-txt.js:198`) + `encodeURIComponent` por segmento
  (`:163`); F-10 `\S` en `scoring.js:209,450` y `geo_optimizer.py:1517`; F-11
  `maxFetches = 100` (`sitemap.js:565-574`); F-12 `assertNewFileParentInsideCwd`
  en `emitTechnicalResults` (`cli.js:1474`); F-13 dotenv en job concreto
  (`gitlab-ci.yml:90-93`); F-14 "sin branding (JSON puro)" (`free-vs-pro.md:34`).
- Paridad no-Latin medida: node === python (23 = 23 = 23) para rtl/cjk/cyr.
- Band del fixture gamed: `production-ready` / "Strong Style Markers" / 97.

## Archivos de trabajo (no se commitean)

- `spec.md` — este documento.
- `todo.md` — lista de tareas en progreso.
- `tests/audit-2026-07-31.e2e.test.js` — SÍ se commitea (suite de verificación).

## Verificación (cómo se prueba cada pieza)

1. `node --test tests/audit-2026-07-31.e2e.test.js` — los 14 describes, cada uno
   con su probe del informe reproducido black-box.
2. `npm run check` completo — el gate no debe regresar (la suite nueva se
   añade al conteo vía `scripts/check-test-count.js`; si el conteo fijo lo
   exige, se actualiza el número en README/AGENTS).
3. `python3 .agents/skills/geo-optimization/scripts/test_optimizer.py` (cubierto
   por el gate).
4. `git diff --check`.
5. Regla de oro: si un test e2e falla en `main`, es una regresión real — se
   corrige el código (no el test) salvo que el test sea el que esté mal, y en
   ese caso se documenta la desviación en este spec.

## Criterio de terminación

- Suite e2e nueva: 14/14 describes en verde.
- `npm run check` verde con la suite incluida; árbol limpio.
- Informe `docs/audits/auditoria-2026-07-31.md` actualizado con el resultado de
  la pasada de verificación (§17, nota de verificación e2e) si hay correcciones;
  si todo se sostiene, una línea de confirmación.
- Revisión de gaps con sub-agente: 1 loop, sin hallazgos accionables.
