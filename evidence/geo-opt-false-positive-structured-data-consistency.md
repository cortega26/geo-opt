# Falso positivo: `technical.structured_data_text_consistency` en páginas con Layout global + schema local

**Reportado**: 2026-06-29
**Versión de geo-opt**: v2.0.0 (post-fix, commit `13fb3bf`)
**Sitio de prueba**: monedario.cl (Astro 7)

---

## Síntoma

En páginas que combinan un `Layout` global (que inyecta `Organization` + `WebSite`) con
un componente de schema específico de página (como `DefinedTerm`), la herramienta
reporta falsos positivos de `structured_data_text_consistency` para claims que **sí
están visibles** en la página, pero que la herramienta no encuentra porque:

1. Restringe la búsqueda a un subconjunto del DOM (probablemente `<main>`)
2. No excluye campos inherentemente meta como `url` o `inDefinedTermSet.name`
3. No busca texto de branding en elementos como `.brand-mark` o `alt` de logos

---

## Evidencia

### Página analizada

`https://monedario.cl/glosario/uf/` — entrada individual del glosario

### JSON-LD presente en la página

La página emite dos bloques de schema: uno global desde `Layout.astro` y uno
específico desde `GlossaryJsonLd.astro`.

```json
{
  "@graph": [
    {
      "@type": "WebSite",
      "name": "Monedario",
      "description": "Unidad de cuenta chilena que se reajusta diariamente..."
    },
    {
      "@type": "Organization",
      "name": "Monedario",
      "description": "Unidad de cuenta chilena que se reajusta diariamente..."
    }
  ]
}
```

```json
{
  "@type": "DefinedTerm",
  "name": "Unidad de Fomento (UF)",
  "description": "Unidad de cuenta chilena que se reajusta diariamente según la inflación (IPC)...",
  "url": "https://monedario.cl/glosario/uf/",
  "inDefinedTermSet": {
    "@type": "DefinedTermSet",
    "name": "Glosario Monedario",
    "url": "https://monedario.cl/glosario/"
  }
}
```

### Claims detectados por la herramienta

| # | Property | Value | Schema fuente | ¿Visible? | ¿Dónde? |
|---|----------|-------|---------------|-----------|---------|
| 1 | `name` | `Monedario` | Organization | ✅ | `<a class="brand-mark">` en el `<header>` |
| 2 | `name` | `Monedario` | WebSite | ✅ | Mismo elemento |
| 3 | `description` | `Unidad de cuenta chilena que se reajusta...` | Organization | ✅ | `<div>` con clase `border-l-4` (callout) |
| 4 | `name` | `Unidad de Fomento (UF)` | DefinedTerm | ✅ | `<h1>` |
| 5 | `description` | `Unidad de cuenta chilena que se reajusta...` | DefinedTerm | ✅ | Mismo callout |
| 6 | `url` | `https://monedario.cl/glosario/uf/` | DefinedTerm | ❌ | — (es una URL, no texto visible) |
| 7 | `inDefinedTermSet.name` | `Glosario Monedario` | DefinedTerm | ❌ | — (metadato interno del schema) |

### Claims reportados como "no encontrados en texto visible"

La herramienta reporta 3 mismatches. De los claims listados arriba, los 3 que
razonablemente podrían fallar la búsqueda son:

1. **`name: "Monedario"` (×2)** — aunque "Monedario" aparece en el `<header>` como
   texto de branding dentro de `<a class="brand-mark">`, la herramienta no lo
   encuentra. Hipótesis: el extractor de texto visible se limita a `<main>` o
   excluye el `<header>`.

2. **`description: "Finanzas personales para chilenos..."`** — si el sitio live aún
   tiene `Organization.description = SITE.desc` (el texto antiguo), este sí sería
   un mismatch real. Pero una vez unificado con el fix QW-1, este claim coincidirá
   con el callout visible y **dejará de ser mismatch**.

Post-deploy del fix QW-1, el único mismatch remanente será `name: "Monedario"` (×2),
que es un falso positivo porque el texto SÍ está visible en la página.

---

## Causa raíz

### Causa 1: Ámbito de búsqueda restringido

La función que extrae texto visible (probablemente `extractHtmlVisibleText` en
`src/text.js` u `observeContent`/`observeTechnicalHtml`) parece restringir el
análisis a un subconjunto del DOM — típicamente `<main>` o un selector como
`[data-pagefind-body]`. Los elementos de branding en `<header>` y `<footer>` quedan
fuera del scope.

**Evidencia en monedario.cl**: La página tiene `data-pagefind-body` en el `<main>`,
y el header/footer están fuera de ese atributo. Si la herramienta usa ese selector
(o uno equivalente como `main`), el texto "Monedario" del logo no se incluye en el
corpus de texto visible.

### Causa 2: Campos no user-facing incluidos en la comparación

Los campos `url` (URL canónica) e `inDefinedTermSet.name` (nombre interno del
conjunto de términos) son metadatos para máquinas, no claims destinados a aparecer
como texto visible. Sin embargo, la herramienta los incluye en la verificación de
consistencia textual.

La propuesta `llmstxt.org` y el schema `DefinedTermSet` están diseñados para
consumo por LLMs y crawlers, no para lectura humana directa. No es razonable
exigir que `inDefinedTermSet.name` aparezca como texto visible en la página.

---

## Recomendaciones para el equipo de geo-opt

### 1. Ampliar el ámbito de búsqueda de texto visible

El extractor de texto visible para la verificación de consistencia debería escanear
**todo** el `<body>`, no solo el contenido principal. Si se usa `[data-pagefind-body]`
o `main` como selector, agregar también el `<header>` y `<footer>` al corpus, o
simplemente usar `body` como raíz.

### 2. Excluir campos no user-facing de la comparación

Definir una lista de propiedades de schema que son inherentemente meta y no se
espera que aparezcan como texto visible:

- `url`
- `@id`
- `inDefinedTermSet` (y sus sub-propiedades: `name`, `url`, `@id`)
- `sameAs`
- `potentialAction` (y sus sub-propiedades)
- `foundingDate`, `areaServed`, `inLanguage`
- `logo`

Estas propiedades deben excluirse del checker de consistencia textual.

### 3. Buscar claims de `name` en elementos de branding

Para claims de tipo `name` en esquemas `Organization`/`WebSite`, buscar también en:
- Elementos con clase `.brand-mark`, `.logo`, `.site-title`
- `alt` de imágenes de logo
- `aria-label` de enlaces de navegación principales
- `<title>` de la página (el sufijo " | Monedario" contiene el nombre)

### 4. (Opcional) Umbral de similitud en lugar de coincidencia exacta

Usar una comparación difusa (por ejemplo, inclusión de substrings o similitud
Levenshtein con umbral) en lugar de búsqueda exacta. Esto absorbería diferencias
menores de whitespace, puntuación o truncamiento.

---

## Reproducción mínima

```bash
# Sitio que combina schema global (Organization) con schema de página (DefinedTerm)
geo-opt technical --url https://monedario.cl/glosario/uf/ --format json \
  | jq '.findings[] | select(.ruleId == "technical.structured_data_text_consistency")'
```

Resultado esperado después del fix: 0 mismatches reportados para claims cuyo texto
sí aparece en cualquier parte visible del documento.

---

## Metadata del sitio de prueba

- **URL**: https://monedario.cl/glosario/uf/
- **Framework**: Astro 7, output estático
- **Estructura**: `<header>` con logo + `<main data-pagefind-body>` con contenido + `<footer>`
- **Schema blocks**: `Organization` + `WebSite` (Layout global) + `DefinedTerm` (página)
- **DOM relevante**: `<a class="brand-mark">Monedario</a>` en el header contiene el claim `name: "Monedario"`
