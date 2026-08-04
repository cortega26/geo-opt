[🇺🇸 English](README.md) &nbsp;·&nbsp; 🇪🇸 Español

---

<div align="center">

# geo-opt

**Puntúa, estructura y señala tu contenido para cada IA que lee la web.**

El toolkit de descubribilidad por IA — parte del ecosistema [Tooltician](https://tooltician.com).

`geo-opt` es un toolkit de descubribilidad por IA que abarca tres pilares — calidad de contenido **GEO**, datos estructurados **Schema.org** y **SEO técnico**. Audita Markdown y HTML, genera JSON-LD, revisa la política de crawlers y produce archivos `llms.txt`, `sitemap.xml` y reportes independientes — todo de forma local, sin telemetría y sin subir tu contenido a ningún servidor.

<!-- Build & quality -->
<p>
  <a href="https://github.com/cortega26/geo-opt/actions"><img src="https://img.shields.io/github/actions/workflow/status/cortega26/geo-opt/ci.yml?branch=main&label=CI&logo=github" alt="Estado de CI"></a>
  <img src="https://img.shields.io/badge/tests-854_pasados-16a34a?logo=nodedotjs&logoColor=white" alt="854 tests pasados">
  <img src="https://img.shields.io/badge/cobertura_de_ramas-80%25-16a34a" alt="Cobertura de ramas 80%">
  <img src="https://img.shields.io/badge/node-%E2%89%A522_LTS-brightgreen?logo=nodedotjs&logoColor=white" alt="Node.js >= 22 LTS">
  <img src="https://img.shields.io/badge/TypeScript-tipos_incluidos-3178C6?logo=typescript&logoColor=white" alt="Tipos TypeScript incluidos">
  <a href="https://www.npmjs.com/package/geo-opt"><img src="https://img.shields.io/npm/v/geo-opt?logo=npm&color=cb3837" alt="Versión en npm"></a>
</p>

<!-- Positioning & ecosystem -->
<p>
  <img src="https://img.shields.io/badge/licencia-source--available-lightgrey" alt="Source-available">
  <a href="https://arxiv.org/abs/2311.09735"><img src="https://img.shields.io/badge/fundamentado_en-GEO_·_KDD_2024-8A2BE2" alt="Fundamentado en GEO, KDD 2024"></a>
  <img src="https://img.shields.io/badge/100%25_local-cero_telemetría-0a7d33" alt="100% local, cero telemetría">
  <img src="https://img.shields.io/badge/runtime-Node_+_Python-5a67d8" alt="Multirruntime: Node y Python">
  <a href="https://tooltician.com"><img src="https://img.shields.io/badge/Parte_de-Tooltician.com-6C47FF?v=2" alt="Parte del ecosistema Tooltician"></a>
</p>

</div>

```
$ node bin/cli.js audit contenido/articulo.md

══════════════════════════════════════════════════
       INFORME DE AUDITORÍA GEO (v2)        
══════════════════════════════════════════════════
Archivo: docs/architecture.md
Perfil: Editorial / Blog / News (confianza: 20%)
Madurez: En riesgo
  El contenido presenta múltiples problemas de calidad.
Puntuación efectiva: 39 (5 dimensiones aplicables)

──────────────────────────────────────────────────
1. Estructura: 12/20
   Encabezados: limpios, sin niveles saltados (+7 pts)
2. Estadísticas: 2/20
   2 estadística(s) encontrada(s) (+2 pts)
3. Citas: 2/20
   2 citas sin atribución (+0 pts)
4. Referencias: 10/20
   1 enlace(s) externo(s) (+5 pts)
   Sección de fuentes/referencias (+5 pts)
5. Claridad: 13/20
   Pronombres: densidad alta (4,3 %) (-2 pts)
──────────────────────────────────────────────────
Hallazgos: 8 advertencias, 0 errores
  ⚠  2 de 2 citas sin atribución identificable. [strong]
  ⚠  Densidad de pronombres 4,3 % supera el límite. [heuristic]
  ⚠  Solo 1 enlace(s) externo(s). [strong]
══════════════════════════════════════════════════
```

El modelo de puntuación está fundamentado en el [artículo GEO aceptado en KDD 2024](https://arxiv.org/abs/2311.09735) y caracterizado contra un corpus de 32 casos de regresión. Es una heurística de calidad de contenido — no es una predicción estadística ni una garantía de posicionamiento, recuperación o citación por parte de ningún sistema de IA.

---

## Lo más destacado

- 🔒 **100% local.** Cada auditoría, generación de schema y validación se ejecuta en proceso. Tu contenido nunca sale de tu máquina — cero telemetría, sin llamadas salientes.
- 📚 **Fundamentado en investigación y etiquetado con honestidad.** La puntuación deriva de la literatura GEO; cada heurística lleva una etiqueta de evidencia explícita (`fuerte`, `probable`, `experimental`, `heurística propia`) para que siempre sepas cuánta confianza depositar en ella.
- 🧩 **Un solo toolkit, toda la superficie.** Auditoría, Schema.org JSON-LD para 8 tipos, `robots.txt`, `llms.txt`, `sitemap.xml`, comprobaciones técnicas de SEO y reportes HTML — desde una única CLI y una librería JavaScript tipada.
- 🚦 **Nativo para CI.** Quality gates por umbral con códigos de salida distintos de cero; JSON legible por máquinas en stdout, diagnósticos en stderr. Se integra en GitHub Actions o GitLab CI en un solo paso.
- 🤖 **Multirruntime.** Implementación canónica en Node.js más un port de Python 3 incluido para flujos de trabajo impulsados por agentes, mantenidos coherentes por una suite de conformance compartida.
- ✅ **Diseñado para producción.** 854 tests en 155 suites, CI en Node 22 y 24, declaraciones TypeScript verificadas por una prueba de compilación de consumidor y una política de changelog aplicada automáticamente.

---

## Tabla de contenidos

- [Por qué tu contenido necesita GEO](#por-qué-tu-contenido-necesita-geo)
- [Qué hace geo-opt](#qué-hace-geo-opt)
- [Inicio rápido](#inicio-rápido)
- [Referencia de comandos](#referencia-de-comandos)
- [Vocabulario de evidencia](#vocabulario-de-evidencia)
- [Free vs. Pro](#free-vs-pro)
- [Configuración](#configuración)
- [Librería JavaScript](#librería-javascript)
- [Habilidad para agentes](#habilidad-para-agentes)
- [Garantías de privacidad](#garantías-de-privacidad)
- [Desarrollo](#desarrollo)
- [Investigación](#investigación)
- [Licencia](#licencia)

---

## Por qué tu contenido necesita GEO

Los motores de búsqueda impulsados por IA — ChatGPT, Perplexity, Gemini, Grok — no ordenan enlaces. *Recuperan y citan* fragmentos de la web abierta, atribuyendo el contenido a su fuente. Las señales que impulsaban el SEO tradicional (densidad de palabras clave, cantidad de backlinks) son necesarias pero no suficientes: los sistemas de IA favorecen contenido que es **estructurado**, **respaldado por evidencia**, **correctamente atribuido** y **semánticamente inequívoco**.

La **Optimización para Motores Generativos (GEO)** es la disciplina de escribir y presentar contenido que los sistemas de IA puedan comprender y citar con confianza. `geo-opt` convierte esa investigación en una puntuación reproducible y calculada localmente, con hallazgos específicos y accionables.

A diferencia de las herramientas SEO en la nube, cada auditoría, generación de schema y validación se ejecuta en tu máquina. Tu contenido nunca sale de ella.

**Tres pilares, un solo toolkit.** `geo-opt` trata la descubribilidad por IA como tres pilares de primera clase: **GEO** — el núcleo de calidad de contenido que da nombre a la herramienta; **datos estructurados** — Schema.org JSON-LD; y **SEO técnico** — `robots.txt`, `sitemap.xml`, hreflang, canonical y política de crawlers. GEO es el titular y el diferenciador; los datos estructurados y el SEO técnico son los cimientos de los que dependen los motores de IA — y la búsqueda tradicional.

---

## Qué hace geo-opt

### Auditar

Puntúa el contenido en cinco dimensiones respaldadas por evidencia usando el modelo estable v1 o el modelo experimental v2 con conciencia de perfil. Audita un único archivo, una lista de archivos o un árbol de directorios completo. Establece un umbral mínimo de puntuación y deja que el código de salida de la CLI actúe como gate en tu pipeline de CI/CD.

```bash
# Archivo individual con el modelo por defecto
node bin/cli.js audit contenido/articulo.md

# Auditoría completa del sitio con resumen y salida JSON
node bin/cli.js audit contenido/ --recursive --summary --format json

# Gate de calidad en CI — sale con error si algún archivo no alcanza 70
node bin/cli.js audit contenido/ --recursive --threshold 70

# Los fallos parciales (archivos ilegibles o rutas inexistentes) también
# salen con error, tanto en modo texto como JSON (auditoría F-05)
node bin/cli.js audit ok.md inexistente.md --format json
```

### Estructurar

Genera JSON-LD Schema.org para tipos `Article`, `NewsArticle`, `FAQ`, `Product`, `Course`, `Event`, `Recipe` y `HowTo`. Previsualiza las inyecciones antes de modificar cualquier archivo. Aplica los cambios con copias de seguridad automáticas. Valida los bloques de datos estructurados existentes por sintaxis, adecuación al contexto y campos requeridos — sin inventar jamás autor, editor, fechas, precios ni disponibilidad.

```bash
# Previsualizar JSON-LD sin escribir en disco
node bin/cli.js schema contenido/articulo.md article

# Inyectar JSON-LD con copia de seguridad automática
node bin/cli.js inject contenido/articulo.md article --backup

# Validar datos estructurados existentes
node bin/cli.js validate contenido/articulo.md
```

### Controlar

Audita `robots.txt` contra las políticas documentadas de crawlers de IA — crawlers de búsqueda, scrapers de entrenamiento y tokens de control se evalúan por separado. Genera un preset `search-visible` que permite los crawlers de búsqueda conocidos mientras bloquea los scrapers de entrenamiento, o empieza desde `open` y ajusta desde ahí.

```bash
node bin/cli.js robots audit public/robots.txt
node bin/cli.js robots generate --preset search-visible
```

### Señalar

Genera archivos `llms.txt` y `llms-full.txt` siguiendo la propuesta de la comunidad, además de un `sitemap.xml` priorizado según GEO. Audita archivos existentes para verificar cumplimiento estructural y comprueba la cobertura respecto al contenido local.

```bash
node bin/cli.js llmstxt audit public/llms.txt
node bin/cli.js llmstxt generate contenido/ --recursive --site-url https://ejemplo.com
# Solo Node: extrae campos YAML cuando una colección guarda el contenido en el frontmatter
node bin/cli.js llmstxt generate contenido/ --recursive --site-url https://ejemplo.com \
  --full --frontmatter-fields body excerpt
node bin/cli.js sitemap generate contenido/ --base-url https://ejemplo.com
```

### SEO técnico

Audita HTML — archivos locales sin red, o URLs remotas y sitemaps con protecciones SSRF integradas — buscando los fundamentos de SEO técnico de los que dependen los crawlers de IA y de búsqueda: títulos, meta descripciones, encabezados, etiquetas canónicas, hreflang y presencia de datos estructurados.

```bash
# HTML local, sin acceso a red
node bin/cli.js technical public/index.html

# Auditoría de URL remota con protección contra IPs privadas y DNS rebinding
node bin/cli.js technical --url https://ejemplo.com/articulo
```

El modo remoto aplica una única política de hops a cada petición de red — la URL raíz, cada redirect, `robots.txt`, los sub-sitemaps anidados y las páginas descubiertas:

- **Solo HTTPS** por defecto; `--allow-http` es el opt-in para HTTP intencional.
- **Solo mismo origin** por defecto: redirects, sub-sitemaps y páginas deben mantenerse en el sitio raíz; `--allow-cross-origin` es el opt-in para crawling cross-origin válido.
- El rechazo de política ocurre **antes** de cualquier resolución DNS o conexión, y los guards SSRF/IP siempre ganan — ningún opt-in debilita la validación de IPs ni la verificación TLS.

### Reportar *(Pro)*

Genera reportes HTML independientes con medidores SVG de puntuación, gráficos de barras por dimensión y CSS listo para imprimir. Compara instantáneas antes/después para cuantificar el impacto concreto de los cambios en el contenido. O produce un paquete de optimización completo — auditoría, schema, `llms.txt` y `sitemap.xml` — en un solo comando con `generate-all`.

```bash
# Captura una línea base, realiza cambios y compara
node bin/cli.js audit contenido/ --format json > base.json
# ... edita el contenido ...
node bin/cli.js report contenido/ --compare base.json

# Paquete de optimización en un solo paso
node bin/cli.js generate-all contenido/ --site-url https://ejemplo.com
```

---

## Inicio rápido

Requiere **Node.js 22 LTS** o **Node.js 24 LTS**. Publicado en npm como [`geo-opt`](https://www.npmjs.com/package/geo-opt).

Ejecútalo al instante con `npx` — sin instalación:

```bash
npx geo-opt audit ruta/al/contenido.md
```

O instálalo como CLI global o como dependencia del proyecto (el paquete también incluye la librería JavaScript tipada):

```bash
npm install -g geo-opt          # comando global `geo-opt`
npm install --save-dev geo-opt  # dependencia del proyecto + librería
```

<details>
<summary>Desde el código fuente (para desarrollo)</summary>

```bash
git clone https://github.com/cortega26/geo-opt.git
cd geo-opt
npm install
node bin/cli.js audit ruta/al/contenido.md
```
</details>

Una vez instalado, ejecuta los ejemplos de abajo como `geo-opt <comando>` (o `npx geo-opt <comando>`); la forma `node bin/cli.js <comando>` que aparece en este README es la invocación equivalente desde una copia del código fuente. Añade `--help` a cualquier comando para ver todos los argumentos y valores por defecto.

### Del primer uso al gate de pre-merge

El trabajo canónico es **checks locales y versionados para contenido Markdown,
HTML y de sitios estáticos antes de merge, sin subir contenido propietario.**
Cinco comandos te llevan del primer uso al gate de CI:

```bash
# 1. Instalar (o usa npx geo-opt … sin instalar nada)
npm install -g geo-opt

# 2. Primera auditoría local en un único archivo — sin red, sin registro
geo-opt audit ruta/al/contenido.md

# 3. Auditoría por lote de un directorio con gate de calidad para CI
geo-opt audit content/ --recursive --threshold 70

# 4. Salida legible por máquinas para tooling downstream
geo-opt audit content/ --recursive --format json > geo-audit.json

# 5. Paquete de optimización en un solo paso (auditoría + llms.txt + sitemap + robots)
geo-opt generate-all content/ --site-url https://example.com
```

Estos comandos encuentran problemas de calidad de contenido y producen guía de
remediación. Son **hallazgos de QA**, nunca una predicción de ranking o citación.

### Integración con CI/CD

Agrega un único paso a cualquier pipeline para aplicar un umbral mínimo de
calidad de contenido en todo el sitio. No se requiere clave de licencia para los
gates de auditoría/umbral; `TOOLTICIAN_LICENSE_KEY` sólo se necesita para el
comando Pro `report` o `--no-branding`.

```yaml
# .github/workflows/geo-opt.yml
name: Content quality gate
on: [pull_request]
jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm install -g geo-opt
      - run: geo-opt audit content/ --recursive --threshold 70
```

El comando sale con código de error cuando algún archivo está por debajo del
umbral, bloqueando deploys de contenido sin optimizar. Los fallos parciales —
archivos ilegibles o rutas explícitas inexistentes — también salen con error
en modo texto y JSON por igual (auditoría F-05), de modo que una ruta mal
escrita nunca puede pasar un pipeline en silencio. El flag `--format json`
emite salida legible por máquinas en stdout; los diagnósticos siempre van a
stderr.

#### Acción compuesta de GitHub Actions

Una acción compuesta lista para usar
([`geo-opt-audit`](.github/actions/geo-opt-audit/action.yml)) envuelve la CLI
para pipelines de GitHub:

```yaml
- uses: cortega26/geo-opt/.github/actions/geo-opt-audit@v2.3.0
  with:
    path: content/
    threshold: 70
```

- `path` — archivo o directorio a auditar (predeterminado: `.`).
- `threshold` — sale con código 1 cuando la puntuación está por debajo de este
  valor, bloqueando el pipeline (p. ej. `70`).
- `recursive` — ponlo en `true` para escanear directorios recursivamente en
  auditorías de sitio completo (función Community, sin clave de licencia).
- `model` — modelo de puntuación: `v2` (predeterminado, con conciencia de
  perfil) o `v1` (legado).
- `license-key` — opcional; solo desbloquea las superficies Pro (reportes HTML
  independientes y `--no-branding`).

Salidas: `score` (0–100), `passed` (`true`/`false` — si se cumplió el umbral),
`badge-url` (una URL de badge de shields.io para incrustar en READMEs o
comentarios de PR) y `badge-markdown` (un badge de shields.io listo para
incrustar). La acción audita el contenido y actúa como gate según el código de
salida de la CLI; no modifica el repositorio. En auditorías recursivas, `score`
es el promedio agregado de todo el conjunto auditado (el mismo número que la
CLI reporta con `audit --summary`), de modo que el badge describe todos los
archivos que cubre el gate, no un solo archivo.

En [`ci-templates/gitlab-ci.yml`](ci-templates/gitlab-ci.yml) hay una
plantilla lista para GitLab CI.

---

## Referencia de comandos

| Comando | Nivel | Descripción |
|---|---|---|
| `audit [archivos...]` | Free + Pro | Puntúa contenido; admite `--recursive`, `--format json`, `--summary`, `--threshold <n>`, `--model v2` |
| `technical [archivos...]` | Free + Pro | Audita HTML buscando fundamentos técnicos de SEO/GEO; archivos locales sin red, `--url`/`--sitemap` para remoto con protecciones SSRF; los hops remotos son solo HTTPS y mismo origin por defecto (opt-ins `--allow-http`/`--allow-cross-origin`) |
| `schema <archivo> <tipo>` | Free + Pro | Imprime el JSON-LD generado en stdout. Tipos Community: `article`, `news-article`, `faq`, `product`. Tipos Pro: `course`, `event`, `recipe`, `howto` |
| `validate <archivo>` | Free + Pro | Inspecciona y verifica bloques JSON-LD en Markdown o HTML |
| `inject <archivo> <tipo>` | Free + Pro | Escribe el JSON-LD en el archivo; admite `--dry-run`, `--backup`, `--recursive`. `--no-branding` es Pro |
| `robots audit <archivo>` | Free + Pro | Evalúa la política de crawlers; `--format json` para salida de máquina |
| `robots generate` | Free + Pro | Genera `robots.txt` con preset `search-visible` u `open` |
| `llmstxt audit <archivo>` | Free + Pro | Valida la estructura y comprueba la cobertura del contenido |
| `llmstxt generate [archivos...]` | Free + Pro | Crea `llms.txt` y opcionalmente `llms-full.txt`; Node también admite `--frontmatter-fields` |
| `sitemap generate [archivos...]` | Free + Pro | Genera `sitemap.xml` con prioridades derivadas de GEO |
| `report [archivos...]` | Pro | Reporte HTML independiente; `--compare <base.json>` para comparar antes/después |
| `generate-all [dir]` | Free + Pro | Paquete en un solo paso: reporte de auditoría, schema, `llms.txt` y `sitemap.xml` |
| `badge <archivo>` | Free + Pro | Genera un badge de puntuación GEO para el archivo |
| `init` | Free + Pro | Crea un archivo `geo_config.json` inicial |
| `config get\|set` | Free + Pro | Administra preferencias locales (recordatorios, telemetría) |

---

## Vocabulario de evidencia

Cada heurística y recomendación lleva una etiqueta que describe la calidad del respaldo investigativo detrás de ella. Estas etiquetas comunican el nivel de confianza epistémica — ninguna constituye un resultado garantizado.

| Etiqueta | Base investigativa |
|---|---|
| **Fuerte** | Múltiples estudios independientes y reproducibles, además de documentación oficial de las plataformas |
| **Probable** | Al menos un estudio controlado o guía consistente de plataforma; aún no replicado de forma independiente en distintos motores |
| **Experimental** | Un único benchmark controlado bajo condiciones específicas; puede no transferirse a motores en producción o dominios de contenido distintos |
| **Heurística propia** | Derivada de las observaciones propias de este proyecto; ningún estudio externo confirma un efecto causal en búsqueda o recuperación por IA |

---

## Free vs. Pro

**Community es completo. Pro añade reportes, salida sin marca y tipos de schema avanzados.**

La titularidad Pro gatinga exactamente tres superficies: el comando `report`, el flag `--no-branding` (en `inject` y `report`), y los tipos Schema.org Pro (`course`, `event`, `recipe`, `howto`). Todo lo demás — auditorías recursivas y multi-archivo, umbrales de CI, `inject`, `robots generate`, `llmstxt generate`, `sitemap generate`, `generate-all`, `technical`, y todas las funciones de lectura/escritura/lote de la librería — funciona en Community sin clave de licencia.

| Capacidad | Free | Pro |
|---|---|---|
| Auditar archivos individuales | Sí | Sí |
| Auditar múltiples archivos / directorios | Sí | Sí |
| Umbrales de calidad para CI/CD | Sí | Sí |
| Generar JSON-LD (stdout, con branding) | Sí | Sí |
| Inyectar JSON-LD en archivos | Sí | Sí |
| Inyección en lote (`--recursive`) | Sí | Sí |
| Salida sin marca (`--no-branding`) | No | Sí |
| Validar JSON-LD | Sí | Sí |
| Auditoría técnica de HTML (local + remoto) | Sí | Sí |
| Auditar `robots.txt` | Sí | Sí |
| Generar `robots.txt` | Sí | Sí |
| Auditar `llms.txt` | Sí | Sí |
| Generar `llms.txt` | Sí | Sí |
| Generar `sitemap.xml` | Sí | Sí |
| Paquete de optimización en un paso (`generate-all`) | Sí | Sí |
| Reportes HTML con comparación antes/después | No | Sí |
| Tipos de schema disponibles | `article`, `news-article`, `faq`, `product` | Todos los de Free + `course`, `event`, `recipe`, `howto` |
| Librería JavaScript — funciones de lectura, escritura y lote | Sí | Sí |

La matriz completa de funcionalidades, incluyendo la superficie completa de la API JavaScript, está en [`docs/free-vs-pro.md`](docs/free-vs-pro.md).

La titularidad Pro se resuelve localmente desde la variable de entorno `TOOLTICIAN_LICENSE_KEY` o el campo `license.key` en `geo_config.json`. No se envía contenido ni datos a Tooltician durante la verificación. Las licencias comerciales aún no están disponibles para compra general; consulta [`docs/commercial-licensing.md`](docs/commercial-licensing.md) para detalles y consultas de licenciamiento.

---

## Configuración

```bash
node bin/cli.js init        # crea geo_config.json en el directorio actual
node bin/cli.js config get  # consulta las preferencias actuales
node bin/cli.js config set reminders false  # desactiva los recordatorios de soporte
```

Proporciona únicamente metadatos que puedas verificar. `geo-opt` nunca infiere autor, editor, fechas, precios ni disponibilidad por su cuenta.

<details>
<summary>Ejemplo de <code>geo_config.json</code></summary>

```json
{
  "author": {
    "name": "Nombre del Autor",
    "sameAs": "https://ejemplo.com/autor"
  },
  "publisher": {
    "name": "Nombre del Editor",
    "url": "https://ejemplo.com"
  },
  "acronyms": {
    "GEO": "Optimización para Motores Generativos",
    "RAG": "Generación con Recuperación Aumentada"
  },
  "license": {
    "key": "tt_pro_tu-clave-de-licencia-aqui"
  }
}
```
</details>

Se puede especificar una ruta de configuración alternativa por ejecución:

```bash
node bin/cli.js audit contenido/ --config ruta/a/otra-config.json
```

---

## Librería JavaScript

Todas las exportaciones están tipadas en [`index.d.ts`](index.d.ts) y verificadas por una prueba de compilación de consumidor. Importa siempre desde el punto de entrada raíz; las rutas internas están bloqueadas por el mapa de exportaciones.

```javascript
import { loadConfig, scoreContent, scoreContentV2 } from "geo-opt";

const { config } = loadConfig();
const { score, report } = scoreContent(markdown, "articulo.md", config);

console.log(score);
// 76

console.log(report.dimensionScores);
// { structure: 17, evidence: 13, quotations: 7, citations: 17, clarity: 22 }
```

Para colecciones Markdown dirigidas por esquema,
`extractFrontmatterContent(markdown, ["body", "excerpt"])` expone la misma
extracción exclusiva de Node que usa `llmstxt generate --frontmatter-fields`.

Los usuarios de **TypeScript** tienen cobertura de tipos completa desde el primer momento:

```bash
npm run typecheck   # compila tests/consumer.test.ts contra index.d.ts
```

Cualquier nueva exportación raíz debe actualizar `index.d.ts` y la prueba de consumidor en el mismo cambio para mantener el contrato sincronizado.

---

## Habilidad para agentes

**Para agentes de IA.** El repositorio incluye una habilidad para agentes
en [`.agents/skills/geo-optimization/`](.agents/skills/geo-optimization/) —
el punto de entrada es [`SKILL.md`](.agents/skills/geo-optimization/SKILL.md).
Guía al agente por los mismos tres pilares como flujo de trabajo: auditar →
analizar → aplicar → inyectar el esquema → verificar. Ejecuta la auditoría,
revisa el informe de puntuación, aplica las reglas de contenido, inyecta el
JSON-LD y vuelve a auditar para confirmar.

**Dos implementaciones.** Como dice la propia documentación de la habilidad:
el CLI canónico de Node (`node bin/cli.js`) y un puerto Python de alcance
acotado (`python3 scripts/geo_optimizer.py`). El puerto Python admite la
auditoría v1 heredada y flujos seleccionados de esquema, robots, `llms.txt`,
lote, configuración e inyección; no admite actualmente el modelo v2 ni la
auditoría técnica de HTML. Consulta la matriz de capacidades normativa en
[`docs/architecture.md`](docs/architecture.md).

**Distribución.** La habilidad se distribuye con el checkout del repositorio
y no forma parte del paquete npm.

**Cómo usarla.** Copia el directorio de la habilidad a la ruta de
habilidades de tu agente — `.claude/skills/` en Claude Code, o el
equivalente de tu agente — y apunta al agente a `SKILL.md`. Los comandos
de la habilidad asumen un checkout del repositorio de `geo-opt` —
`node bin/cli.js` es la ruta del CLI canónico; los scripts del puerto
Python funcionan desde el directorio copiado.

---

## Garantías de privacidad

| Garantía | Cómo se implementa |
|---|---|
| El contenido nunca sale de tu máquina | Cada auditoría, generación de schema y validación se ejecuta completamente en proceso |
| Sin telemetría por defecto | El interruptor de transporte está deshabilitado; no aparece ningún aviso y no se envía nada |
| Sin llamadas de red silenciosas | Las solicitudes salientes solo ocurren cuando las habilitas explícitamente con `technical --url`/`--sitemap`, y están protegidas contra SSRF, DNS rebinding y acceso a IPs privadas. Cada hop remoto — redirects, `robots.txt`, sub-sitemaps, páginas — es solo HTTPS y mismo origin salvo que optes con `--allow-http`/`--allow-cross-origin` |
| `DO_NOT_TRACK` respetado | La CLI verifica la variable de entorno y permanece silenciosa cuando está activa |
| Los recordatorios son locales y desactivables | `node bin/cli.js config set reminders false` — permanente e inmediato |
| Salida de máquina en stdout, diagnósticos en stderr | Seguro para redirigir la salida `--format json` a otras herramientas sin ruido |

El diseño completo de telemetría opt-in (actualmente inactivo) está documentado en [`docs/telemetry.md`](docs/telemetry.md), incluyendo el esquema de eventos congelado que limita lo que alguna vez podría recopilarse.

---

## Desarrollo

```bash
npm run check          # suite completa: lint + formato + tests JS + tests Python + conformance + typecheck + changelog
npm test               # 854 tests · 155 suites · 0 fallos (Node.js)
npm run test:python    # suite de tests del port de compatibilidad Python (40 tests)
npm run lint           # ESLint + Python py_compile
npm run format:check   # Prettier en modo dry-run
npm run typecheck      # compilación del consumidor TypeScript
npm run changelog:check  # aplica la política de actualización de CHANGELOG.md
```

La implementación JavaScript en `src/` es la canónica. Un port de compatibilidad Python 3 viene incluido para flujos de trabajo impulsados por agentes; su alcance está definido por la matriz de capacidades en [`docs/architecture.md`](docs/architecture.md).

La gobernanza de documentación y los disparadores de cambio están definidos en [`docs/documentation-governance.md`](docs/documentation-governance.md). Reporta bugs en [GitHub Issues](https://github.com/cortega26/geo-opt/issues) — consulta [`docs/reporting-issues.md`](docs/reporting-issues.md) para saber qué incluir (y qué redactar).

---

## Investigación

- [GEO: Generative Engine Optimization](https://arxiv.org/abs/2311.09735) — Singh et al., KDD 2024
- [What Gets Cited: Measuring the Impact of GEO on LLM Citations](https://arxiv.org/abs/2605.25517)
- [Guía de optimización para IA de Google](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide)
- [Schema.org](https://schema.org/)
- [Propuesta `llms.txt`](https://llmstxt.org/)
- [Documentación de crawlers OpenAI](https://developers.openai.com/api/docs/bots)
- [Documentación de crawlers Google](https://developers.google.com/crawling/docs/crawlers-fetchers/google-common-crawlers)
- [Documentación de crawlers Anthropic](https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler)
- [Documentación de crawlers Perplexity](https://docs.perplexity.ai/docs/resources/perplexity-crawlers)

---

## Licencia

- [Tooltician Community License 1.0](LICENSE) — uso con fuente disponible, con condiciones de branding y redistribución
- [Tooltician Commercial License](COMMERCIAL-LICENSE.md) — entitlements comerciales emitidos

Este proyecto es source-available, no es software de código abierto aprobado por OSI. Las versiones históricas hasta el commit `67f18be` siguen disponibles bajo [MIT](LICENSE-HISTORY.md). `geo-opt` es parte del toolkit de descubribilidad por IA [Tooltician](https://tooltician.com).
