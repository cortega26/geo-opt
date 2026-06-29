# Informe de bugs y comportamientos incorrectos — geo-opt v2.0.0

**Fecha**: 2026-06-29
**Entorno**: Node.js v24.15.0, Linux 6.17.0, geo-opt commit `f40602a9` (estimado)
**Contexto**: Auditoría completa del sitio monedario.cl (Astro 7, ~166 URLs, contenido
en Markdown + HTML). Se ejecutaron los comandos `technical`, `audit`, `robots audit`,
`schema`, `validate`, `badge`, `generate-all`, `config`, `llmstxt audit`.

---

## 1. Falla en test suite

**Test**: `tests/artifact.test.js:75` — `dist/integrity.js contiene el hash SHA256 real, no el placeholder`

**Error**:
```
AssertionError [ERR_ASSERTION]: El placeholder de asignación no fue reemplazado en dist/integrity.js
```

**Causa**: El script `scripts/build.js` no está reemplazando el literal
`"<<<LICENSING_HASH>>>"` en `dist/integrity.js` durante la build. El placeholder
permanece como string literal en el artefacto final.

**Para reproducir**:
```bash
cd geo-opt
npm run build
node --test tests/artifact.test.js
```

**Fix sugerido**: Revisar `scripts/build.js` — probablemente la regex o el path de
reemplazo no coincide con la estructura actual del archivo `integrity.js`. Verificar
que el build busque exactamente el patrón `const EXPECTED_HASH = "<<<LICENSING_HASH>>>"`.

---

## 2. Bug: `--sitemap` no recorre sitemap indexes

**Severidad**: Alta
**Archivo**: `bin/cli.js`, función `handleRemoteTechnical`, bloque `--sitemap`
**Comando**: `geo-opt technical --sitemap https://monedario.cl/sitemap-index.xml`

**Comportamiento observado**:
El sitemap-index contiene:
```xml
<sitemapindex>
  <sitemap><loc>https://monedario.cl/sitemap-0.xml</loc></sitemap>
</sitemapindex>
```

La herramienta extrae correctamente `sitemap-0.xml` como sub-sitemap, pero luego
trata esa URL como una página HTML para auditar. El resultado es una "página" con
1 palabra visible (el XML crudo), 0 headings, 0 enlaces.

**Output real**:
```json
{
  "target": "https://monedario.cl/sitemap-0.xml",
  "observations": {
    "visibleText": { "wordCount": 1 },
    "headings": { "values": [], "issues": ["missing_h1"] },
    "title": { "empty": true }
  }
}
```

**Comportamiento esperado**: La herramienta debería:
1. Detectar que es un sitemap index
2. Recuperar cada sub-sitemap
3. Extraer las URLs de página de cada sub-sitemap
4. Auditar esas URLs de página, no los archivos XML

**Fix sugerido**: En el bloque `if (urls.length === 0 && parsed.sitemapUrls.length > 0)`:
- Opción A (completa): para cada `parsed.sitemapUrls`, hacer fetch del sub-sitemap,
  parsearlo con `parseSitemapXml`, y acumular `parsed.urls` de todos ellos.
- Opción B (informativa): si se detecta un sitemap index, mostrar error claro:
  "Este es un sitemap index. Usa --sitemap con la URL de un sitemap directo
  (ej. https://example.com/sitemap-0.xml)."

**Nota**: El código actual ya advierte "Only direct URLs are processed" pero luego
igualmente procesa los sub-sitemaps como HTML. El warning y el comportamiento son
contradictorios.

---

## 3. Bug: Acrónimos ya expandidos se marcan como no explicados

**Severidad**: Media
**Archivos**: `src/scoring.js` (v1), `src/scoring-v2.js` (v2), `src/text.js`

**Comportamiento observado**:
Cuando el texto contiene `AFP (Administradora de Fondos de Pensiones)`, la
herramienta reporta:
- v1: `"Unexplained acronyms found: AFP ('Administradora de Fondos de Pensiones')"`
- v2: `"Unexplained: AFP ('Administradora de Fondos de Pensiones'), SIS"`

El acrónimo YA está expandido (la expansión está en paréntesis), pero el detector
lo está tratando como un solo token `AFP ('Administradora...')` en lugar de
reconocer que `AFP` ya tiene su expansión a continuación.

**Para reproducir**:
Crear un archivo con:
```markdown
# Test

La AFP (Administradora de Fondos de Pensiones) administra los fondos.
```
Ejecutar: `geo-opt audit test.md --model v1`

**Fix sugerido**: En la función de detección de acrónimos (probablemente en
`src/text.js` o en los módulos de scoring), después de identificar un aparente
acrónimo no explicado, verificar si el texto inmediatamente siguiente contiene
una expansión entre paréntesis. Si el token capturado incluye el paréntesis
(`AFP ('Administradora...')`), separar el acrónimo de su expansión antes de
evaluar.

---

## 4. Bug: Sobre-detección de "quotes" y "statistics" en frontmatter YAML

**Severidad**: Media
**Archivos**: `src/scoring.js`, `src/scoring-v2.js`, `src/text.js`

**Comportamiento observado**:
Archivos con frontmatter YAML:
```markdown
---
term: "Administradora de Fondos de Cesantía (AFC)"
shortDefinition: "Institución privada fiscalizada por..."
relatedTerms: ["afp", "renta-imponible"]
---

Contenido real del glosario...
```

La herramienta reporta:
- 4–5 "statistics" sin atribución (números en el contenido)
- 4–5 "quotes" sin atribución (los strings entre comillas del frontmatter)

El contenido entre `---` del frontmatter se está tratando como texto de página,
inflando falsos positivos en las dimensiones `statistics` y `quotations`.

**Fix sugerido**: La función `preprocessContent` (o equivalente en `src/text.js`)
debería recortar el bloque de frontmatter YAML (delimitado por `---`) antes de
analizar estadísticas y citas. Esto ya se hace parcialmente para otros aspectos
(la detección de `term:` como heading lo sugiere), pero las estadísticas y citas
parecen analizarse sobre el texto completo incluyendo el frontmatter.

Alternativa: si `extractSections` o `cleanMarkdownToPlainText` ya remueven el
frontmatter, verificar por qué los contadores de stats/quotes aún lo incluyen.

---

## 5. Bug: Detección de headings interfiere con contenido del frontmatter YAML

**Severidad**: Media
**Archivos**: `src/text.js` (probablemente `extractSections`)

**Comportamiento observado**:
En `afc.md`, la herramienta reporta:
```
Document starts with h2 ("term: \"Administradora de Fondos de Cesantía (AFC)\"
shortDefinition: \"Institución privada...\"") instead of h1
```

El contenido del frontmatter YAML se está interpretando como headings Markdown.
Posiblemente alguna línea dentro del YAML contiene `##` o el parser de secciones
no está saltando correctamente el bloque delimitado por `---`.

**Fix sugerido**: En `extractSections` o la función que analiza la jerarquía de
headings, hacer un strip completo del bloque de frontmatter (todo el contenido
entre el primer `---` y el siguiente `---`) antes de buscar headings Markdown
(`^#+\s`). Verificar que el índice de inicio para el análisis de headings sea
`content.indexOf('---', 4) + 3` o equivalente robusto.

---

## 6. Comportamiento inesperado: `hreflang missing_self_reference` en sitio monolingüe

**Severidad**: Baja
**Archivos**: `src/technical.js`

**Comportamiento observado**:
Sitio en español únicamente, sin hreflangs. La herramienta reporta:
```
Language alternate issues observed: missing_self_reference.
```

**Problema**: Para un sitio monolingüe, no tener hreflangs es correcto. El mensaje
asume incorrectamente que todo sitio debe tener hreflangs con auto-referencia.

**Fix sugerido**: El finding `technical.language_alternates` debería tener 3 estados:
- `pass`: sitio multilingüe con hreflangs correctos y auto-referencia
- `warn`: sitio multilingüe sin auto-referencia
- `not_applicable` o `pass`: sitio monolingüe sin hreflangs (comportamiento esperado)

Agregar una verificación: si `hreflang.length === 0`, no emitir el warning a menos
que el sitio tenga atributos `lang` alternativos en el HTML.

---

## 7. Comportamiento inesperado: Profile confidence 0.2 sin feedback accionable

**Severidad**: Baja
**Archivos**: `src/profiles.js`

**Comportamiento observado**:
En archivos de glosario, todas las auditorías muestran:
```json
"profile": {
  "confidence": 0.2,
  "reasons": ["no specific profile signals detected; defaulting to editorial"]
}
```

**Problema**: El mensaje no le dice al usuario QUÉ señales buscaría la herramienta
para aumentar la confianza. Es opaco.

**Fix sugerido**: Agregar al mensaje una lista de señales que la herramienta busca
para mejorar la confianza, por ejemplo:
```
"No specific profile signals detected (looked for: product price/offer markup,
FAQ question-answer pairs, course syllabus structure, step-by-step instructions,
recipe ingredients). Defaulting to editorial profile."
```

---

## 8. Comportamiento inesperado: `generate-all` produce URLs incorrectas para rutas de contenido

**Severidad**: Media
**Archivos**: `bin/cli.js` (comando `generate-all`)

**Comportamiento observado**:
Ejecutando desde el directorio del proyecto monedario:
```bash
geo-opt generate-all src/data/glossary/ --site-url https://monedario.cl
```

Las URLs generadas son:
```
https://monedario.cl/src/data/glossary/afc
https://monedario.cl/src/data/glossary/afp
```

En lugar de las URLs públicas reales:
```
https://monedario.cl/glosario/afc
https://monedario.cl/glosario/afp
```

**Problema**: La herramienta usa `path.relative(process.cwd(), fp)` para construir la
URL, sin considerar que `src/data/glossary/` es una ruta de fuente que mapea a
`/glosario/` en el sitio renderizado. Esto es esperable (la herramienta no conoce las
rutas de Astro), pero el resultado es que las URLs en `llms.txt` y `sitemap.xml` son
incorrectas.

**Fix sugerido**: Agregar una opción `--path-map` o `--content-base` al comando
`generate-all` y `llmstxt generate`:
```
--path-map "src/data/glossary:/glosario,src/content/blog:/posts"
```
O más simple: `--strip-prefix "src/data"` que remueva ese prefijo de las URLs generadas.

---

## 9. Posible bug: múltiples `--url` no se acumulan correctamente

**Severidad**: Baja (requiere confirmación)
**Archivos**: `bin/cli.js`, comando `technical`

**Comportamiento observado**:
```bash
geo-opt technical --url https://monedario.cl/calculadoras/sueldo-liquido/ \
  --url https://monedario.cl/posts/como-calcular-sueldo-liquido/ --format json
```

Solo se obtuvo 1 resultado (la segunda URL). La primera parece haberse perdido.

**Hipótesis**: Commander podría no estar acumulando múltiples valores `--url` en un
array. La línea:
```javascript
const rawUrls = options.url;
const remoteUrls = Array.isArray(rawUrls) ? rawUrls : rawUrls ? [rawUrls] : [];
```
asume que Commander entrega un array para opciones repetibles, pero si `options.url`
es un string con el último valor, se pierden las URLs anteriores.

**Para verificar**: Agregar `console.error('rawUrls:', JSON.stringify(rawUrls))` en
`handleRemoteTechnical` y ejecutar con múltiples `--url`.

**Fix sugerido si se confirma**: Usar la sintaxis de Commander para opciones
acumulativas o configurar `--url` con una función de procesamiento que haga push a
un array. En Commander, las opciones con `--url <url>` deberían acumularse
automáticamente, pero podría haber un cambio de comportamiento en v15.

---

## Resumen

| # | Tipo | Severidad | Requiere cambio de código |
|---|------|-----------|--------------------------|
| 1 | Test failure | Media | `scripts/build.js` |
| 2 | Bug | **Alta** | `bin/cli.js` (sitemap handling) |
| 3 | Bug | Media | `src/text.js` (acronym detection) |
| 4 | Bug | Media | `src/text.js` (frontmatter stripping) |
| 5 | Bug | Media | `src/text.js` (heading parsing) |
| 6 | False positive | Baja | `src/technical.js` (hreflang rule) |
| 7 | UX | Baja | `src/profiles.js` (confidence message) |
| 8 | Feature gap | Media | `bin/cli.js` (path mapping) |
| 9 | Posible bug | Baja | `bin/cli.js` (Commander --url) |

Los hallazgos 2, 3, 4, y 5 son los de mayor prioridad porque afectan la precisión
de las auditorías en sitios reales con contenido estructurado y sitemaps modernos.

---

## Archivos de referencia en el repositorio

Todos los paths son relativos a la raíz de `geo-opt`:

| Módulo | Path |
|--------|------|
| CLI entry | `bin/cli.js` |
| Scoring v1 | `src/scoring.js` |
| Scoring v2 | `src/scoring-v2.js` |
| Text processing | `src/text.js` |
| Engine | `src/engine.js` |
| Technical audit | `src/technical.js` |
| Observations | `src/observations.js` |
| Profiles | `src/profiles.js` |
| Findings | `src/findings.js` |
| Build script | `scripts/build.js` |
| Test artifact | `tests/artifact.test.js` |

---

*Informe generado durante la auditoría GEO de monedario.cl. Los comandos exactos y
outputs completos están disponibles en la sesión de Claude Code que produjo este
documento.*
