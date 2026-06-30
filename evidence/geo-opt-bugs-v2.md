# Verificación de Fixes — geo-opt v2.1.1

> Fecha: 2026-06-30
> Repo: `cortega26/geo-opt`, tag `v2.1.1` (commit `ad91287`)
>
> Prueba de regresión contra los 21 hallazgos del reporte original (v2.1.0).
> Se confirma que el commit `e3f953e` incluye "18 bugs from geo-opt v2.1.0 audit report".

---

## Resumen

| Estado | Cantidad |
|---|---|
| ✅ Fijo | 14 |
| ❌ No fijo | 3 |
| ⚠️ Parcialmente fijo | 1 |
| 📝 No aplica / no replicable | 3 |

---

## ✅ Fixes confirmados

### P1 — `prepare` script ya no falla

**Antes:**
```
cp: no se puede crear el fichero regular '.git/hooks/pre-commit':
No existe el archivo o el directorio
```

**Ahora:** El script verifica si `.git/hooks/` existe antes de copiar:
```js
const d = join('.git','hooks');
if (!existsSync(d)) {
  console.warn('[geo-opt] .git/hooks/ not found — skipping pre-commit hook install');
  process.exit(0);
}
```

**Veredicto:** ✅ `npm install github:cortega26/geo-opt` completa sin errores.

---

### P3 — URLs en `llmstxt generate` desde CWD distinto

**Antes:** Generaba rutas con `../../home/carlos/...` incluyendo el
sistema de archivos local.

**Ahora:** Genera URLs relativas al CWD (ej. `https://example.com/./`)
en vez de rutas absolutas del sistema de archivos. Sigue siendo
responsabilidad del usuario ejecutar desde el directorio correcto.

**Veredicto:** ✅ Ya no filtra rutas del sistema local. Para URLs
correctas, ejecutar desde el directorio raíz del sitio.

---

### P6 — JSON-LD "not applicable" ya no marca ✗

**Antes:**
```
✗ [technical.structured_data_text_consistency]
  No JSON-LD blocks are present; text consistency is not applicable.
```

**Ahora:**
```
○ [technical.structured_data_text_consistency]
  No JSON-LD blocks are present; text consistency is not applicable.
```

**Veredicto:** ✅ Usa `○` (neutral) en vez de `✗` (error).

---

### P7 — Profile detection ahora detecta "Service / Consulting"

**Antes:** `Editorial / Blog / News (confidence: 20%)`

**Ahora:** `Service / Consulting (confidence: 80%)`

El score también cambió: de 46 → 57 porque se aplican menos
dimensiones (4 en vez de 5) con pesos distintos.

**Veredicto:** ✅ Perfil correcto con alta confianza.

---

### P8e — `init --dry-run` ahora funciona

**Antes:** `error: unknown option '--dry-run'`

**Ahora:** Muestra preview del JSON sin escribir archivo.

```
Note: geo_config.json already exists (would be overwritten with --force).
=== geo_config.json preview (--dry-run) ===
{ ... }
```

**Veredicto:** ✅

---

### P9 — `technical` con directorio da mensaje amigable

**Antes:**
```
Error auditing en/: Read failed: EISDIR: illegal operation on a directory, read
```

**Ahora:**
```
"en/" is a directory. Use --recursive to scan directories.
```

Además, `technical` ahora soporta el flag `-r, --recursive`.

**Veredicto:** ✅ Mensaje consistente con `audit` y `sitemap`.

---

### P10 — Error de `--url http://` sugiere flag correcto

**Antes:**
```
Use --allow-private or --allow-localhost for http://.
```

**Ahora:**
```
Use --allow-http for http://.
```

Y existe un nuevo flag `--allow-http` para conexiones HTTP públicas.

**Veredicto:** ✅ Mensaje y flag correctos.

---

### P11 — "Target:" duplicado eliminado

**Antes:** La línea `Target:` aparecía dos veces en el reporte con
URLs remotas.

**Ahora:** Aparece una sola vez.

**Veredicto:** ✅

---

### P14 — Sitemap con trailing slash

**Antes:** `https://tooltician.com/en`

**Ahora:** `https://tooltician.com/en/`

**Veredicto:** ✅ URLs consistentes con el formato de directorio.

---

### P15 — 404 excluido del sitemap

**Antes:** El sitemap incluía `<loc>https://tooltician.com/404</loc>`.

**Ahora:** La página 404 ya no aparece en el sitemap.

**Veredicto:** ✅

---

### P17 — Fallback de `--title` consistente

**Antes:**
- `llmstxt generate` → nombre del directorio actual (ej. `# dist`)
- `generate-all` → `# Your Organization`

**Ahora:** Ambos usan `# Your Organization` como fallback.

**Veredicto:** ✅

---

### P18 — `--output` muestra ruta absoluta

**Antes:**
```
✓ Technical audit report written → ../../../../../../tmp/geo-test/report.json
```

**Ahora:**
```
✓ Technical audit report written → /tmp/geo-test2/report.json
```

**Veredicto:** ✅

---

### P19 — Mensaje de `inject` fuera de CWD con sugerencia

**Antes:**
```
Error: Security restriction — target file /tmp/test.html resolves
outside the current working directory.
```

**Ahora:**
```
Error: Security restriction — target file /tmp/test.html resolves
outside the current working directory.
Run the command from the target directory, or copy the file into
the current working directory.
```

**Veredicto:** ✅ Ahora explica cómo solucionarlo.

---

### P20 — `badge --format text` ahora es válido

**Antes:** `badge` solo aceptaba `markdown`, `url`, `json`.

**Ahora:** También acepta `text` como alias de `markdown`,
consistente con `audit` y `technical`.

**Veredicto:** ✅

---

## ❌ No fijos

### P5 — Flags URL inconsistentes

| Comando | Flag |
|---|---|
| `technical` | `--source-url` |
| `llmstxt generate` | `--site-url` |
| `sitemap generate` | `--base-url` |
| `generate-all` | `--site-url` |

Siguen siendo 4 nombres distintos para el mismo concepto. `technical`
no reconoce `--base-url`.

**Veredicto:** ❌ Pendiente.

---

### P13 — `sitemap --audit` no diferencia prioridades

```
<priority>0.5</priority>  (en/index.html score: 57)
<priority>0.5</priority>  (es/index.html score: 55)
```

Todas las URLs tienen `priority: 0.5` independientemente del score
GEO. El flag `--audit` está presente pero no parece influir en el
cálculo de prioridades. Puede requerir licencia Pro o configuración
adicional no documentada.

**Veredicto:** ❌ Pendiente de investigación.

---

### P16 — `--ignore` después del archivo

```bash
geo-opt audit --ignore "*.html" en/index.html
→ Error: Missing file path for audit command.
```

El variadic `<patterns...>` de commander.js consume todos los args
posicionales, incluyendo el archivo. Funciona si el archivo va
**antes** del flag:

```bash
geo-opt audit en/index.html --ignore "*.html"   # ✅
```

No hay forma limpia de arreglar esto sin cambiar la API de
`--ignore` para que no sea variadic.

**Veredicto:** ❌ Limitación conocida de commander.js.

---

## ⚠️ Parcialmente fijo

### P12 — `validate` con tipos multi-value

**Antes:**
```
"Person,ProfessionalService" is not in the known-types list
"BreadcrumbList" is not in the known-types list
```

**Ahora:**
- ✅ `BreadcrumbList` agregado a la lista de tipos conocidos
- ✅ Se parsean tipos compuestos separando por coma
- ❌ `ProfessionalService` (del multi-type `Person,ProfessionalService`)
  no está en la lista y genera falso positivo

La lista actual de tipos conocidos:
`Article, NewsArticle, BlogPosting, TechArticle, DiscussionForumPosting,
SocialMediaPosting, FAQPage, Product, Organization, Person, WebPage,
BreadcrumbList, SoftwareApplication, ImageObject, VideoObject, Course,
Event, Recipe, HowTo`

Faltan tipos como `ProfessionalService`, `LocalBusiness`, `Service`,
`ContactPoint`, `PostalAddress`, etc.

**Veredicto:** ⚠️ Mejorado pero persisten falsos positivos con tipos
Schema.org válidos no listados.

---

## 📝 No aplica / no replicable

| ID | Hallazgo | Motivo |
|---|---|---|
| P2 | `--help` no produce output | Dependía de dist/ faltante (P1). Con P1 fijo, ya no aplica. |
| P4 | Fallback de `--title` al CWD | Queda reemplazado por P17 (fallback consistente a "Your Organization"). |
| P8a–d | Observaciones menores | Son inherentes al contenido del sitio auditado, no bugs de geo-opt. |

---

## Regresiones

No se detectaron regresiones en la prueba. Todos los comandos
siguen funcionando con el comportamiento esperado de v2.1.0 más los
fixes.

---

## Resumen de cobertura

| Categoría | Bugs reportados | Fijos | No fijos | Parciales |
|---|---|---|---|---|
| Instalación / packaging | 1 (P1) | 1 | — | — |
| CLI / UX común | 4 (P2, P4, P5, P8e) | 1 | 1 | — |
| `technical` | 4 (P6, P9, P10, P11) | 4 | — | — |
| `sitemap` | 3 (P13, P14, P15) | 2 | 1 | — |
| `llmstxt` | 2 (P3, P17) | 2 | — | — |
| `schema` / `validate` | 1 (P12) | — | — | 1 |
| `inject` | 1 (P19) | 1 | — | — |
| `badge` | 1 (P20) | 1 | — | — |
| `audit` | 1 (P16) | — | 1 | — |
| Observaciones | 3 (P8a–d) | — | — | — |
| **Total** | **21** | **14** | **3** | **1** |

<!-- 3 no aplican (P2, P4, P8a-d) -->
