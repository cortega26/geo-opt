# Reporte de Bugs — geo-opt v2.1.0

> Auditoría realizada el 2026-06-30 contra tooltician.com usando geo-opt
> clonado desde `github:cortega26/geo-opt` (commit `6b6853d5`).
>
> Prueba exhaustiva de los 13 comandos de la CLI.

---

## 🐛 P1 — La instalación como dependencia desde GitHub está rota

**Comando:** `npm install github:cortega26/geo-opt`

**Error:**
```
cp: no se puede crear el fichero regular '.git/hooks/pre-commit':
No existe el archivo o el directorio
```

**Causa raíz:** El script `prepare` del `package.json` ejecuta
`cp hooks/pre-commit .git/hooks/pre-commit` asumiendo que existe
`.git/hooks/`. Cuando npm instala desde una URL de GitHub, clona el repo
a un directorio temporal en `~/.npm/_cacache/` que **no tiene `.git/`**
propio, por lo que `cp` falla y la instalación se aborta.

**Incluso con `--ignore-scripts`** el paquete queda inservible porque:

- `dist/` no está commiteado en el repo (desapareció entre v2.0.0 y
  v2.1.0).
- `scripts/` no está en el campo `files` del `package.json`, así que
  `scripts/build.js` no llega al tarbal de npm.
- Sin `dist/` no hay `dist/bin/cli.js` → npm no crea el bin link →
  el paquete no se puede ejecutar ni importar programáticamente.

**Regresión:** La caché de npx contenía v2.0.0 con `dist/` presente y
funcional. Quien haya ejecutado `npx cortega26/geo-opt` antes del
30-jun-2026 lo tiene funcionando desde la caché. Una instalación
fresca — o con la caché invalidada — obtiene v2.1.0 (actual `HEAD`)
que **ya no incluye `dist/`** y el `prepare` script falla.
v2.1.0 está roto para instalación como dependencia.

**Posibles soluciones:**

| Opción | Esfuerzo | Efecto |
|---|---|---|
| Commitar `dist/` en el repo | Bajo | La instalación desde GitHub funciona al instante |
| Incluir `scripts/` en `files` + arreglar `prepare` | Medio | Permite rebuildear post-install |
| Arreglar `prepare` script para tolerar falta de `.git/hooks/` | Bajo | Evita el crash de entrada |

---

## 🐛 P2 — `--help` no produce output cuando falta `dist/`

**Contexto:** Instalación fallida o incompleta (sin `dist/`).

**Síntoma:** `npx cortega26/geo-opt --help` y
`npx cortega26/geo-opt --version` producen **cero output** en stdout y
stderr, con exit code 1. El usuario no recibe ningún mensaje de error
que explique qué ocurrió.

**Esperado:** Un mensaje como `"Error: no se encuentra dist/bin/cli.js.
Ejecute 'npm run build' primero"` o similar.

---

## 🐛 P3 — URL path resolution en `llmstxt generate` depende del CWD

**Comando:**
```bash
# Ejecutado desde /home/user/project/
geo-opt llmstxt generate \
  --site-url https://example.com \
  dist/en/index.html
```

**Resultado:**
```
https://example.com/../../home/user/project/dist/en
```

**vs. (ejecutado desde dist/):**
```
https://example.com/en   ✅
```

**Causa:** El tool usa `path.relative()` desde el CWD para derivar la
URL, sin resolver contra la raíz del sitio. Cuando los archivos están
fuera del CWD, las URLs incluyen segmentos `../` del sistema de
archivos local.

**Esperado:** Encontrar el prefijo común entre todas las rutas de
entrada y resolver limpiamente contra `--site-url`, o advertir si no
se puede.

---

## 🐛 P9 — `technical` con directorio muestra error EISDIR crudo

**Comando:**
```bash
geo-opt technical en/
```

**Output:**
```
Error auditing en/: Read failed: EISDIR: illegal operation on a directory, read
```

**Problema:** Muestra el error raw de Node.js (`EISDIR`) en vez de un
mensaje amigable. **Inconsistente** con `audit` y `sitemap` que dicen:

```
Path "en/" is a directory. Use --recursive to scan directories.
```

Además, `technical` ni siquiera tiene flag `-r`/`--recursive`, a
diferencia de `audit` y `sitemap`.

---

## 🐛 P10 — Error de `--url http://` sugiere `--allow-private` para sitios públicos

**Comando:**
```bash
geo-opt technical --url http://example.com
```

**Error:**
```
Error: --url requires https:// scheme: "http://example.com".
Use --allow-private or --allow-localhost for http://.
```

**Problema:** `example.com` es un sitio **público**, no una IP
privada ni localhost. `--allow-private` es para rangos de IP
privados según la descripción del flag. El mensaje de error es
engañoso — sugiere usar un flag que no corresponde.

La validación debería distinguir entre:
- `http://example.com` (público, pero sin HTTPS) → ofrecer
  `--allow-http` o similar
- `http://192.168.x.x` o `http://localhost` → ofrecer
  `--allow-private` / `--allow-localhost`

---

## ⚠️ P5 — Inconsistencia en nombres de flags para URL base

Cada comando usa un nombre DISTINTO para el mismo concepto (la URL
base del sitio):

| Comando | Flag |
|---|---|
| `technical` | `--source-url` |
| `llmstxt generate` | `--site-url` |
| `sitemap generate` | `--base-url` |
| `generate-all` | `--site-url` |

**Sugerencia:** Unificar a un solo nombre (ej. `--base-url`) y
aceptar los otros como aliados para no romper scripts existentes.

---

## ⚠️ P6 — Check de JSON-LD reporta ✗ con mensaje "not applicable"

**Salida del `technical audit`:**
```
✗ [technical.structured_data_text_consistency]
  No JSON-LD blocks are present; text consistency is not applicable.
```

Si la validación no aplica porque no hay JSON-LD, el resultado debería
ser un ✓ informativo ("no hay JSON-LD que validar"), no una ✗ que
sugiere un error.

**Afecta a:** Páginas sin JSON-LD (privacy, terms, cookies, 404.html).

---

## ⚠️ P7 — Profile detection con confianza baja para sitio de servicios

**Detectado:** `Editorial / Blog / News` con **20% de confianza**.

**Sitio real:** Portafolio de servicios de consultoría Python.

El perfil incorrecto afecta el scoring porque aplica pesos de
dimensiones que no corresponden.

**Posibles mejoras:**
- Agregar perfil `Service / Consulting` con pesos distintos
- Mejorar el detector para reconocer sitios de servicios
  profesionales
- Exponer opción `--profile` para perfil manual

---

## ⚠️ P11 — `technical` duplica línea "Target:" con URLs remotas

**Comando:**
```bash
geo-opt technical --url http://example.com --allow-private
```

**Output:**
```
Target: http://example.com
Target: http://example.com
```

La línea `Target:` aparece duplicada en el reporte. Ocurre solo con
modo `--url` remoto, no con archivos locales.

---

## ⚠️ P12 — `validate` genera falsos positivos con tipos multi-value y tipos no-listados

**Comando:** `geo-opt validate en/index.html`

**Output:**
```
ℹ️  "Person,ProfessionalService" is not in the known-types list
ℹ️  "BreadcrumbList" is not in the known-types list
```

**Problemas:**
1. `Person,ProfessionalService` es un tipo compuesto (multi-type
   separado por coma). El validador no separa por coma para verificar
   cada tipo individual. `Person` SÍ está en la lista.
2. `BreadcrumbList` es un tipo válido de Schema.org pero no está en
   la lista limitada de geo-opt. Genera un falso positivo.

---

## ⚠️ P13 — `sitemap generate --audit` no diferencia prioridades por GEO score

**Comando:**
```bash
geo-opt sitemap generate --audit --base-url https://example.com pages/*
```

Todas las URLs aparecen con `priority: 0.5` y `changefreq: daily`
independientemente de su score GEO. El flag `--audit` no parece
influir en la prioridad asignada.

---

## ⚠️ P14 — `sitemap generate` no añade trailing slash a URLs

**Comando:** `geo-opt sitemap generate --base-url https://tooltician.com ...`

**Genera:** `https://tooltician.com/en`

**Real:** `https://tooltician.com/en/` (con slash, porque son
directorios HTML en Astro)

Esto puede causar discrepancias con las URLs canónicas reales del
sitio. El tool debería preservar la forma exacta de la URL o
normalizar consistentemente.

**Afecta también a `llmstxt generate`** y `generate-all`.

---

## ⚠️ P15 — `sitemap generate -r` incluye 404.html en el sitemap

```
<loc>https://tooltician.com/404</loc>
```

La página de error 404 no debería aparecer en el sitemap. El tool
podría filtrar archivos llamados `404.html` o detectar páginas con
`noindex`.

---

## ⚠️ P16 — `audit --ignore` con archivo después del flag produce error confuso

**Comando:**
```bash
geo-opt audit --ignore "*.html" en/index.html
```

**Error:**
```
Error: Missing file path for audit command.
```

**Causa:** Commander.js consume `en/index.html` como parte del
variadic `<patterns...>` de `--ignore`, dejando cero archivos.

**Solución aceptable si el archivo va ANTES del flag:**
```bash
geo-opt audit en/index.html --ignore "*.html"   # ✅ funciona
```

Pero el error "Missing file path" es engañoso — el usuario sí pasó un
archivo. Debería decir algo como "No files matched (all were filtered
by --ignore patterns)".

---

## ⚠️ P17 — `generate-all` y `llmstxt generate` usan distintos fallbacks para `--title`

| Comando | Fallback sin `--title` |
|---|---|
| `llmstxt generate` | Nombre del directorio actual (ej. `# dist`) |
| `generate-all` | Texto fijo `# Your Organization` |

Comportamiento inconsistente para el mismo concepto.

---

## 📝 P18 — `technical --output` usa rutas relativas con `../../..`

**Comando:**
```bash
geo-opt technical --format json --output /tmp/geo-test/report.json en/index.html
```

**Output:**
```
✓ Technical audit report written → ../../../../../../tmp/geo-test/report.json
```

El mensaje de éxito debería mostrar la ruta absoluta o la relativa
más legible, no una cadena de `../..` que parece un error.

---

## 📝 P19 — `inject` con archivo fuera del CWD da error sin sugerencia

**Comando:**
```bash
geo-opt inject /tmp/test.html article
```

**Error:**
```
Error: Security restriction — target file /tmp/test.html resolves
outside the current working directory.
```

El error no explica cómo solucionarlo. Debería sugerir: "Run from the
target directory, or copy the file into the current directory."

---

## 📝 P20 — `badge --format` usa nombres distintos que `audit`/`technical`

| Comando | Flag de formato | Valores |
|---|---|---|
| `audit` | `--format` | `text`, `json` |
| `technical` | `--format` | `text`, `json` |
| `badge` | `--format` | `markdown`, `url`, `json` |

`badge` llama "markdown" a lo que otros comandos llamarían "text".
No hay `--format text` en `badge`.

---

## 📝 P21 — `sitemap generate` URLs sin trailing slash difieren de `llmstxt generate`

`sitemap generate` produce URLs sin trailing slash (`/en`), mientras
que `generate-all` y `llmstxt generate` también producen sin slash.
Pero las URLs reales del sitio (`/en/` con slash) difieren. Esto
puede confundir a crawlers que esperan consistencia.

---

## 📝 P8 — Observaciones adicionales

| # | Hallazgo | Detalle |
|---|---|---|
| 8a | Tokens legacy en `robots audit` | `Bytespider` y `anthropic-ai` se reportan como "legacy or undocumented token" |
| 8b | Gateway de idioma con pocas palabras | `index.html` raíz tiene 40 palabras — deliberado, pero el audit lo señala siempre |
| 8c | Sin fecha de publicación detectable | `audit` reporta "No publication or review date detected" [heuristic] |
| 8d | Sin quotes atribuidas | Portfolio sin testimonios → Quotations siempre da 0/20 |
| 8e | `init` no soporta `--dry-run` | A diferencia de `sitemap generate`, `llmstxt generate`, `generate-all`, etc. |

---

## Resumen por severidad

| Severidad | Cantidad | IDs |
|---|---|---|
| 🐛 Bug (funcionalidad rota) | 4 | P1, P2, P3, P9 |
| 🐛 Bug (comportamiento incorrecto) | 2 | P10, P13 |
| ⚠️ Inconsistencia / UX confuso | 10 | P5, P6, P7, P11, P12, P14, P15, P16, P17, P20 |
| 📝 Observación / UX menor | 4 | P18, P19, P21, P8a–P8e |

**Total: 21 hallazgos** (P1–P21)

---

## Cobertura de la prueba

| Comando | Estado |
|---|---|
| `audit` | ✅ Probado (formato, threshold, explain, summary, -r, --ignore, --model) |
| `technical` | ✅ Probado (local, remoto, sitemap, format, output, edge cases) |
| `schema` | ✅ Probado (tipos community, Pro, multi-type, inválidos, archivo faltante) |
| `validate` | ✅ Probado (JSON-LD válido, tipos multi-value, archivo faltante) |
| `inject` | ✅ Probado (dry-run, backup, seguridad outside-CWD) |
| `robots` | ✅ Probado (audit, generate, dry-run) |
| `sitemap` | ✅ Probado (generate, --audit, -r, --base-url, dry-run) |
| `llmstxt` | ✅ Probado (generate, audit, -r, URLs, edge cases) |
| `badge` | ✅ Probado (format markdown/url/json, default) |
| `generate-all` | ✅ Probado (dry-run, sitio completo) |
| `report` | ✅ Probado (requiere Pro, error claro) |
| `config` | ✅ Probado (get, set, valor inválido) |
| `init` | ✅ Probado (crear, overwrite con --force, sin --dry-run) |

## Contexto de la auditoría

- **Sitio auditado:** tooltician.com (Astro, estático, bilingüe EN/ES)
- **Comandos ejecutados:** los 13 comandos de la CLI, con variantes de
  flags y edge cases
- **geo-opt usado desde:** `/tmp/geo-opt` (clonado y construido
  localmente)
- **Sistema:** Linux, Node.js v24.15.0
