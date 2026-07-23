# Free vs. Pro

`geo-opt` is an AI-discoverability toolkit — GEO (Generative Engine Optimization),
structured data, and technical SEO — that comes in two editions. The **Community**
edition is a complete, functional, local-first toolkit: it audits, generates,
injects, and validates across Markdown and HTML, including recursive/batch
workflows, CI thresholds, and full artifact generation. The **Pro** edition adds
standalone HTML reports, branding-free output, and advanced Schema.org types.

**Verified 2026-07-22** against runtime at `b2e6055`. Runtime and tests outrank
prose; if a claim here disagrees with `bin/cli.js` or `src/`, the source is correct.

## What Pro actually gates

Pro entitlement gates exactly three surfaces:

1. The `report` command (standalone HTML audit reports with charts and
   before/after comparison).
2. The `--no-branding` flag on `inject` (and on `report`).
3. The Pro Schema.org types: `course`, `event`, `recipe`, `howto`.

Everything else in the CLI and library — recursive and multi-file audits, CI
thresholds, `inject`, `robots generate`, `llmstxt generate`, `sitemap generate`,
`generate-all`, `technical`, all read functions, and all write/batch library
functions — runs Community-side without a license key.

## Tabla comparativa — Comandos CLI

| Comando | Community | Pro |
|---|---|---|
| `audit [files...]` | ✅ Incluye `--recursive`, `--summary`, `--threshold`, `--format json`, multi-archivo | ✅ |
| `technical [files...]` | ✅ Local offline; `--url`/`--sitemap` con protecciones SSRF | ✅ |
| `schema <file> <type>` | ✅ Tipos Community (`article`, `news-article`, `faq`, `product`) por stdout, con branding | ✅ |
| `schema <file> <type>` (tipos Pro) | ❌ `course`, `event`, `recipe`, `howto` requieren Pro | ✅ |
| `validate <file>` | ✅ | ✅ |
| `inject <file> <type>` | ✅ Incluye `--dry-run`, `--backup`, `--recursive` | ✅ |
| `inject --no-branding` | ❌ Requiere Pro | ✅ |
| `robots audit <file>` | ✅ | ✅ |
| `robots generate` | ✅ Presets `search-visible` u `open` | ✅ |
| `llmstxt audit <file>` | ✅ | ✅ |
| `llmstxt generate` | ✅ Incluye `--recursive`, `--full`, `--frontmatter-fields` (Node) | ✅ |
| `sitemap generate` | ✅ | ✅ |
| `generate-all [dir]` | ✅ Paquete completo: auditoría, schema, `llms.txt`, `sitemap.xml`, `robots.txt` | ✅ |
| `badge <file>` | ✅ | ✅ |
| `init`, `config get/set` | ✅ | ✅ |
| `report [files...]` | ❌ Requiere Pro | ✅ Reportes HTML con gráficos y `--compare <baseline.json>` |

## API de librería JavaScript

The library exports the full surface; Pro enforcement happens inside specific
function bodies for the three gated surfaces above (`report` rendering,
`--no-branding`, Pro schema types). Write and batch functions are callable from
Community.

| Función | Community | Pro |
|---|---|---|
| `scoreContent`, `scoreContentV2` | ✅ | ✅ |
| `auditContent`, `auditFile` | ✅ | ✅ |
| `auditFiles`, `aggregateReport` | ✅ | ✅ |
| `observeContent`, `observeAndParse` | ✅ | ✅ |
| `observeTechnicalHtml`, `auditTechnicalHtml`, `buildTechnicalFindings` | ✅ | ✅ |
| `generateSchemaData` | ✅ Tipos Community; tipos Pro requieren titularidad | ✅ |
| `injectSchema` | ✅ (con branding) | ✅ `--no-branding` requiere Pro |
| `batchInject` | ✅ (con branding) | ✅ |
| `validateSchemaFile` | ✅ | ✅ |
| `auditRobots`, `checkRobots` | ✅ | ✅ |
| `generateRobotsTxt` | ✅ | ✅ |
| `auditLlmsTxt` | ✅ | ✅ |
| `generateLlmsTxt`, `generateLlmsFullTxt` | ✅ | ✅ |
| `discoverFiles`, `extractPageMetadata`, `resolvePageUrl` | ✅ | ✅ |
| `createFinding`, `buildReportMeta`, `mapLegacyToFindings` | ✅ | ✅ |
| `loadConfig` | ✅ | ✅ |
| `resolveProfile`, `detectProfile`, `isApplicable`, `scoreCeiling` | ✅ | ✅ |
| `calculateReadability`, `preprocessContent`, `extractSections` | ✅ | ✅ |

## ¿Cómo se verifica la titularidad Pro?

`geo-opt` resuelve la clave de licencia desde dos fuentes, en orden:

1. Variable de entorno `TOOLTICIAN_LICENSE_KEY`
2. Campo `license.key` en `geo_config.json`

```json
{
  "license": {
    "key": "tt_pro_tu-clave-de-licencia-aqui"
  }
}
```

La verificación es local. No se envía contenido ni datos a Tooltician.

Cuando una operación Pro se invoca sin titularidad, el comando termina con un
mensaje descriptivo y código de salida distinto de cero.

## Flujo de ejemplo

### Community: audita, genera e inyecta

```bash
# Auditar un directorio completo con umbral de calidad para CI
node bin/cli.js audit content/ --recursive --threshold 70

# Inyectar JSON-LD con backup automático (con branding)
node bin/cli.js inject content/article.md article --backup

# Generar el paquete GEO completo (auditoría + llms.txt + sitemap + robots)
node bin/cli.js generate-all content/ --site-url https://example.com
```

### Pro: reportes HTML y salida sin marca

```bash
# Generar reporte HTML con gráficos y comparación antes/después
node bin/cli.js audit content/ --format json > baseline.json
node bin/cli.js report content/ --compare baseline.json

# Inyectar JSON-LD sin marca Tooltician en todo el sitio
node bin/cli.js inject content/ article --recursive --no-branding

# Generar schema de tipo Pro (course, event, recipe, howto)
node bin/cli.js schema content/course-page.md course
```

## Recordatorios de soporte comunitario

La edición Community muestra recordatorios locales, no intrusivos y
desactivables después de 10 inyecciones exitosas. Estos recordatorios:

- Aparecen como máximo una vez cada 7 días
- Solo se muestran en terminales interactivas
- Se suprimen en CI, pipes y entornos automatizados
- No realizan ninguna solicitud de red
- Se desactivan con `geo-opt config set reminders false`

La edición Pro suprime estos recordatorios automáticamente.

## Cómo obtener una licencia Pro

Las licencias comerciales todavía no están disponibles para compra general. Las
condiciones comerciales están redactadas y pendientes de revisión legal
cualificada.

Para consultas sobre licencias, visita [Tooltician](https://www.tooltician.com).
