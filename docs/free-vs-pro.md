# Free vs. Pro

**`geo-opt` Free** te permite auditar, validar y evaluar cualquier página individual.
**`geo-opt` Pro** desbloquea la optimización automatizada, la escritura de
archivos y el trabajo a escala de sitio completo.

Si puedes leerlo, es Free. Si lo escribes o lo escalas, es Pro.

## Tabla comparativa

### Comandos CLI

| Comando | Free | Pro |
|---|---|---|
| `audit <file>` | ✅ Un solo archivo | ✅ |
| `audit <file1> <file2> ...` | ❌ | ✅ Multi-archivo |
| `audit --recursive` | ❌ | ✅ Directorios completos |
| `audit --summary` | ❌ | ✅ Agregado de sitio |
| `audit --threshold <n>` | ❌ | ✅ Quality gate de CI/CD |
| `schema <file> <type>` | ✅ Por stdout, con branding | ✅ |
| `validate <file>` | ✅ | ✅ |
| `inject <file> <type>` | ❌ | ✅ Inyección en archivo |
| `inject --recursive` | ❌ | ✅ Inyección por lote |
| `inject --no-branding` | ❌ | ✅ Sin marca Tooltician |
| `robots audit <file>` | ✅ | ✅ |
| `robots generate` | ❌ | ✅ Genera `robots.txt` |
| `llmstxt audit <file>` | ✅ | ✅ |
| `llmstxt audit --recursive` | ❌ | ✅ Coverage de sitio |
| `llmstxt generate` | ❌ | ✅ Genera `llms.txt` |
| `init` | ✅ | ✅ |
| `config get/set` | ✅ | ✅ |
| `badge <file>` | ✅ Single file GEO badge | ✅ |

### API de librería JavaScript

| Función | Free | Pro |
|---|---|---|
| `scoreContent`, `scoreContentV2` | ✅ | ✅ |
| `auditContent`, `auditFile` | ✅ | ✅ |
| `auditFiles`, `aggregateReport` | ❌ | ✅ |
| `observeContent`, `observeAndParse` | ✅ | ✅ |
| `observeTechnicalHtml`, `auditTechnicalHtml`, `buildTechnicalFindings` | ❌ | ✅ |
| `generateSchemaData` | ✅ | ✅ |
| `injectSchema` | ❌ | ✅ |
| `batchInject` | ❌ | ✅ |
| `validateSchemaFile` | ✅ | ✅ |
| `auditRobots`, `checkRobots` | ✅ | ✅ |
| `generateRobotsTxt` | ❌ | ✅ |
| `auditLlmsTxt` | ✅ | ✅ |
| `generateLlmsTxt`, `generateLlmsFullTxt` | ❌ | ✅ |
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

### Free: audita y evalúa

```bash
# Auditar una página individual
node bin/cli.js audit mi-articulo.md

# Ver el JSON-LD que se generaría (con branding)
node bin/cli.js schema mi-articulo.md article

# Validar JSON-LD existente
node bin/cli.js validate mi-articulo.md

# Revisar el robots.txt
node bin/cli.js robots audit public/robots.txt
```

### Pro: optimiza y escala

```bash
# Auditar todo el sitio de una vez
node bin/cli.js audit content/ --recursive --summary --format json

# Fallar en CI si alguna página no alcanza el umbral
node bin/cli.js audit content/ --recursive --threshold 70

# Inyectar JSON-LD sin marca en todo el sitio
node bin/cli.js inject content/ article --recursive --no-branding

# Generar llms.txt con cobertura completa
node bin/cli.js llmstxt generate content/ --recursive --site-url https://example.com --full
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
