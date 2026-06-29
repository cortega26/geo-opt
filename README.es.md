[🇺🇸 English](README.md) &nbsp;·&nbsp; 🇪🇸 Español

---

<div align="center">

# geo-opt

**Puntúa, estructura y señala tu contenido para cada IA que lee la web.**

El toolkit de descubribilidad por IA — parte del ecosistema [Tooltician](https://tooltician.com).

`geo-opt` audita Markdown y HTML para mejorar su visibilidad en motores de búsqueda con IA, genera datos estructurados Schema.org JSON-LD, revisa la política de crawlers y produce archivos `llms.txt`, `sitemap.xml` y reportes independientes — todo de forma local, sin telemetría y sin subir tu contenido a ningún servidor.

<!-- Build & quality -->
<p>
  <a href="https://github.com/cortega26/geo-opt/actions"><img src="https://img.shields.io/github/actions/workflow/status/cortega26/geo-opt/ci.yml?branch=main&label=CI&logo=github" alt="Estado de CI"></a>
  <img src="https://img.shields.io/badge/tests-573_pasados-16a34a?logo=nodedotjs&logoColor=white" alt="573 tests pasados">
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
  <a href="https://tooltician.com"><img src="https://tooltician.com/badge.svg" alt="Parte del ecosistema Tooltician"></a>
</p>

</div>

```
$ node bin/cli.js audit contenido/articulo.md

  Score  76 / 100
  Model  v1 · default

  ┌──────────────────────────┬────────┬──────────────────────┐
  │ Dimensión                │  Score │ Evidencia            │
  ├──────────────────────────┼────────┼──────────────────────┤
  │ Estructura y organización│  17/25 │ experimental         │
  │ Evidencia numérica       │  13/20 │ heurística propia    │
  │ Citas y atribución       │   7/15 │ experimental         │
  │ Referencias y enlaces    │  17/20 │ probable             │
  │ Claridad semántica       │  22/20 │ heurística propia    │
  └──────────────────────────┴────────┴──────────────────────┘

  Hallazgos
  ⚠  8  experimental · heurística propia
  ✗  3  probable · experimental
  ✔  14 correctos
```

El modelo de puntuación está fundamentado en el [artículo GEO aceptado en KDD 2024](https://arxiv.org/abs/2311.09735) y caracterizado contra un corpus de 32 casos de regresión. Es una heurística de calidad de contenido — no es una predicción estadística ni una garantía de posicionamiento, recuperación o citación por parte de ningún sistema de IA.

---

## Lo más destacado

- 🔒 **100% local.** Cada auditoría, generación de schema y validación se ejecuta en proceso. Tu contenido nunca sale de tu máquina — cero telemetría, sin llamadas salientes.
- 📚 **Fundamentado en investigación y etiquetado con honestidad.** La puntuación deriva de la literatura GEO; cada heurística lleva una etiqueta de evidencia explícita (`fuerte`, `probable`, `experimental`, `heurística propia`) para que siempre sepas cuánta confianza depositar en ella.
- 🧩 **Un solo toolkit, toda la superficie.** Auditoría, Schema.org JSON-LD para 8 tipos, `robots.txt`, `llms.txt`, `sitemap.xml`, comprobaciones técnicas de SEO y reportes HTML — desde una única CLI y una librería JavaScript tipada.
- 🚦 **Nativo para CI.** Quality gates por umbral con códigos de salida distintos de cero; JSON legible por máquinas en stdout, diagnósticos en stderr. Se integra en GitHub Actions o GitLab CI en un solo paso.
- 🤖 **Multirruntime.** Implementación canónica en Node.js más un port de Python 3 incluido para flujos de trabajo impulsados por agentes, mantenidos coherentes por una suite de conformance compartida.
- ✅ **Diseñado para producción.** 573 tests en 97 suites, CI en Node 22 y 24, declaraciones TypeScript verificadas por una prueba de compilación de consumidor y una política de changelog aplicada automáticamente.

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
- [Garantías de privacidad](#garantías-de-privacidad)
- [Desarrollo](#desarrollo)
- [Investigación](#investigación)
- [Licencia](#licencia)

---

## Por qué tu contenido necesita GEO

Los motores de búsqueda impulsados por IA — ChatGPT, Perplexity, Gemini, Grok — no ordenan enlaces. *Recuperan y citan* fragmentos de la web abierta, atribuyendo el contenido a su fuente. Las señales que impulsaban el SEO tradicional (densidad de palabras clave, cantidad de backlinks) son necesarias pero no suficientes: los sistemas de IA favorecen contenido que es **estructurado**, **respaldado por evidencia**, **correctamente atribuido** y **semánticamente inequívoco**.

La **Optimización para Motores Generativos (GEO)** es la disciplina de escribir y presentar contenido que los sistemas de IA puedan comprender y citar con confianza. `geo-opt` convierte esa investigación en una puntuación reproducible y calculada localmente, con hallazgos específicos y accionables.

A diferencia de las herramientas SEO en la nube, cada auditoría, generación de schema y validación se ejecuta en tu máquina. Tu contenido nunca sale de ella.

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
```

### Estructurar

Genera JSON-LD Schema.org para tipos `Article`, `NewsArticle`, `FAQ`, `Product`, `Course`, `Event`, `Recipe` y `HowTo`. Previsualiza las inyecciones antes de modificar cualquier archivo. Aplica los cambios con copias de seguridad automáticas. Valida los bloques de datos estructurados existentes por sintaxis, adecuación al contexto y campos requeridos — sin inventar jamás autor, editor, fechas, precios ni disponibilidad.

```bash
# Previsualizar JSON-LD sin escribir en disco
node bin/cli.js schema contenido/articulo.md article

# Inyectar JSON-LD con copia de seguridad automática (Pro)
node bin/cli.js inject contenido/articulo.md article --backup

# Validar datos estructurados existentes
node bin/cli.js validate contenido/articulo.md
```

### Controlar

Audita `robots.txt` contra las políticas documentadas de crawlers de IA — crawlers de búsqueda, scrapers de entrenamiento y tokens de control se evalúan por separado. Genera un preset `search-visible` que permite los crawlers de búsqueda conocidos mientras bloquea los scrapers de entrenamiento, o empieza desde `open` y ajusta desde ahí.

```bash
node bin/cli.js robots audit public/robots.txt
node bin/cli.js robots generate --preset search-visible  # Pro
```

### Señalar

Genera archivos `llms.txt` y `llms-full.txt` siguiendo la propuesta de la comunidad, además de un `sitemap.xml` priorizado según GEO. Audita archivos existentes para verificar cumplimiento estructural y comprueba la cobertura respecto al contenido local.

```bash
node bin/cli.js llmstxt audit public/llms.txt
node bin/cli.js llmstxt generate contenido/ --recursive --site-url https://ejemplo.com  # Pro
node bin/cli.js sitemap generate contenido/ --base-url https://ejemplo.com               # Pro
```

### Inspeccionar (técnico)

Audita HTML — archivos locales sin red, o URLs remotas y sitemaps con protecciones SSRF integradas — buscando fundamentos técnicos de SEO/GEO: títulos, meta descripciones, encabezados, etiquetas canónicas y presencia de datos estructurados.

```bash
# HTML local, sin acceso a red
node bin/cli.js technical public/index.html

# Auditoría de URL remota con protección contra IPs privadas y DNS rebinding
node bin/cli.js technical --url https://ejemplo.com/articulo
```

### Reportar *(Pro)*

Genera reportes HTML independientes con medidores SVG de puntuación, gráficos de barras por dimensión y CSS listo para imprimir. Compara instantáneas antes/después para cuantificar el impacto concreto de los cambios en el contenido. O produce un paquete de optimización completo — auditoría, schema, `llms.txt` y `sitemap.xml` — en un solo comando con `generate-all`.

```bash
# Captura una línea base, realiza cambios y compara
node bin/cli.js audit contenido/ --format json > base.json
# ... edita el contenido ...
node bin/cli.js report contenido/ --compare base.json

# Paquete de optimización en un solo paso
node bin/cli.js generate-all contenido/ --site-url https://ejemplo.com  # Pro
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

### Integración con CI/CD

Agrega un único paso a cualquier pipeline para aplicar un umbral mínimo de calidad de contenido en todo el sitio:

```yaml
# Ejemplo para GitHub Actions
- name: Auditar calidad del contenido
  run: node bin/cli.js audit contenido/ --recursive --threshold 70
  env:
    TOOLTICIAN_LICENSE_KEY: ${{ secrets.TOOLTICIAN_LICENSE_KEY }}
```

El comando sale con código de error cuando algún archivo está por debajo del umbral, bloqueando deploys de contenido sin optimizar. El flag `--format json` emite salida legible por máquinas en stdout; los diagnósticos siempre van a stderr. En [`ci-templates/gitlab-ci.yml`](ci-templates/gitlab-ci.yml) hay una plantilla lista para GitLab CI.

---

## Referencia de comandos

| Comando | Nivel | Descripción |
|---|---|---|
| `audit [archivos...]` | Free + Pro | Puntúa contenido; admite `--recursive`, `--format json`, `--summary`, `--threshold <n>`, `--model v2` |
| `technical [archivos...]` | Free + Pro | Audita HTML buscando fundamentos técnicos de SEO/GEO; archivos locales sin red, `--url`/`--sitemap` para remoto con protecciones SSRF |
| `schema <archivo> <tipo>` | Free + Pro | Imprime el JSON-LD generado en stdout |
| `validate <archivo>` | Free + Pro | Inspecciona y verifica bloques JSON-LD en Markdown o HTML |
| `inject <archivo> <tipo>` | Pro | Escribe el JSON-LD en el archivo; admite `--dry-run`, `--backup`, `--recursive`, `--no-branding` |
| `robots audit <archivo>` | Free + Pro | Evalúa la política de crawlers; `--format json` para salida de máquina |
| `robots generate` | Pro | Genera `robots.txt` con preset `search-visible` u `open` |
| `llmstxt audit <archivo>` | Free + Pro | Valida la estructura y comprueba la cobertura del contenido |
| `llmstxt generate [archivos...]` | Pro | Crea `llms.txt` y opcionalmente `llms-full.txt` |
| `sitemap generate [archivos...]` | Pro | Genera `sitemap.xml` con prioridades derivadas de GEO |
| `report [archivos...]` | Pro | Reporte HTML independiente; `--compare <base.json>` para comparar antes/después |
| `generate-all [dir]` | Pro | Paquete en un solo paso: reporte de auditoría, schema, `llms.txt` y `sitemap.xml` |
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

**Si lo lees, es Free. Si lo escribes o escalas, es Pro.**

| Capacidad | Free | Pro |
|---|---|---|
| Auditar archivos individuales | Sí | Sí |
| Auditar múltiples archivos / directorios | No | Sí |
| Umbrales de calidad para CI/CD | No | Sí |
| Generar JSON-LD (stdout, con branding) | Sí | Sí |
| Inyectar JSON-LD en archivos | No | Sí |
| Inyección en lote (`--recursive`) | No | Sí |
| Salida sin marca (`--no-branding`) | No | Sí |
| Validar JSON-LD | Sí | Sí |
| Auditoría técnica de HTML (archivos locales) | Sí | Sí |
| Auditar `robots.txt` | Sí | Sí |
| Generar `robots.txt` | No | Sí |
| Auditar `llms.txt` | Sí | Sí |
| Generar `llms.txt` | No | Sí |
| Generar `sitemap.xml` | No | Sí |
| Reportes HTML con comparación antes/después | No | Sí |
| Paquete de optimización en un paso (`generate-all`) | No | Sí |
| Tipos de schema disponibles | `article`, `news-article`, `faq`, `product` | Todos los de Free + `course`, `event`, `recipe`, `howto` |
| Librería JavaScript — funciones de lectura | Sí | Sí |
| Librería JavaScript — funciones de escritura / lote | No | Sí |

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

Los usuarios de **TypeScript** tienen cobertura de tipos completa desde el primer momento:

```bash
npm run typecheck   # compila tests/consumer.test.ts contra index.d.ts
```

Cualquier nueva exportación raíz debe actualizar `index.d.ts` y la prueba de consumidor en el mismo cambio para mantener el contrato sincronizado.

---

## Garantías de privacidad

| Garantía | Cómo se implementa |
|---|---|
| El contenido nunca sale de tu máquina | Cada auditoría, generación de schema y validación se ejecuta completamente en proceso |
| Sin telemetría por defecto | El interruptor de transporte está deshabilitado; no aparece ningún aviso y no se envía nada |
| Sin llamadas de red silenciosas | Las solicitudes salientes solo ocurren cuando las habilitas explícitamente con `technical --url`/`--sitemap`, y están protegidas contra SSRF, DNS rebinding y acceso a IPs privadas |
| `DO_NOT_TRACK` respetado | La CLI verifica la variable de entorno y permanece silenciosa cuando está activa |
| Los recordatorios son locales y desactivables | `node bin/cli.js config set reminders false` — permanente e inmediato |
| Salida de máquina en stdout, diagnósticos en stderr | Seguro para redirigir la salida `--format json` a otras herramientas sin ruido |

El diseño completo de telemetría opt-in (actualmente inactivo) está documentado en [`docs/telemetry.md`](docs/telemetry.md), incluyendo el esquema de eventos congelado que limita lo que alguna vez podría recopilarse.

---

## Desarrollo

```bash
npm run check          # suite completa: lint + formato + tests JS + tests Python + conformance + typecheck + changelog
npm test               # 573 tests · 97 suites · 0 fallos (Node.js)
npm run test:python    # suite de tests del port de compatibilidad Python (38 tests)
npm run lint           # ESLint + Python py_compile
npm run format:check   # Prettier en modo dry-run
npm run typecheck      # compilación del consumidor TypeScript
npm run changelog:check  # aplica la política de actualización de CHANGELOG.md
```

La implementación JavaScript en `src/` es la canónica. Un port de compatibilidad Python 3 viene incluido para flujos de trabajo impulsados por agentes; su alcance está definido por la matriz de capacidades en [`docs/architecture.md`](docs/architecture.md).

La gobernanza de documentación y los disparadores de cambio están definidos en [`docs/documentation-governance.md`](docs/documentation-governance.md). Reporta bugs en [GitHub Issues](https://github.com/cortega26/geo-opt/issues).

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
