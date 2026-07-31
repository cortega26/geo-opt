# Plan 006: Consolidar implementaciones JS y Python

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat HEAD -- src/optimizer.js .agents/skills/geo-optimization/scripts/geo_optimizer.py`
> If either file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: MED
- **Depends on**: plans/003-test-coverage.md
- **Category**: tech-debt
- **Planned at**: 2025-06-25 (no git SHA — project not yet initialized)

## Why this matters

El proyecto mantiene dos implementaciones completas (~90% idénticas) de la
misma herramienta:

- `src/optimizer.js` (705 líneas) — JavaScript/Node.js ESM, publicada como npm
  package `geo-opt`, con CLI en `bin/cli.js`
- `.agents/skills/geo-optimization/scripts/geo_optimizer.py` (672 líneas) —
  Python 3, usada por el agent skill definido en `SKILL.md`

Esta duplicación triplica el costo de cada cambio: hay que implementar en JS,
implementar en Python, y testear en ambos. Ya hay evidencia de drift: el bug
`searchPaths.append()` (corregido en plan 002) solo existía en JS; la versión
Python usa `list.append()` correctamente.

Este plan NO elimina una implementación. En su lugar, toma una decisión
estratégica documentada y establece un proceso para mantener la consistencia
mientras ambas existan.

## Current state

### Estructura actual

| Aspecto | JS (`src/optimizer.js`) | Python (`geo_optimizer.py`) |
|---------|------------------------|----------------------------|
| Ubicación | `src/optimizer.js` | `.agents/skills/geo-optimization/scripts/geo_optimizer.py` |
| CLI | `bin/cli.js` | El propio script con `argparse` |
| Publicación | npm (`npx geo-opt`) | Solo local, usado por SKILL.md |
| Tests | 5 tests (`node:test`) | 6 tests (`unittest`) |
| Usuarios | Desarrolladores vía npx | Agentes AI vía SKILL.md |
| Argument parsing | Manual (`process.argv`) | `argparse` (más robusto) |
| Salida de errores | `process.exit(1)` | `sys.exit(1)` |

### Diferencias funcionales identificadas

1. **`loadConfig`**: JS usa `searchPaths.push()` (corregido en plan 002),
   Python usa `search_paths.append()` (correcto). JS tiene fallback path a
   `.agents/` que Python no tiene.
2. **`extractSections`**: JS retorna `[{header, body}]`, Python retorna
   `[(header, body)]` (tuplas vs objetos).
3. **`injectSchema`**: JS tiene lógica de detección de firma duplicada
   (`sigRaw`) que Python implementa de forma ligeramente diferente.
4. **Schema generation**: JS usa `cleanMarkdownToPlainText` como función
   separada; Python usa `clean_markdown_to_plain_text` con diferencias
   menores de regex (`re.DOTALL` flags).
5. **Fecha hardcodeada**: Ambas versiones tienen `"2026-06-25T12:00:00+00:00"`
   hardcodeado. El plan 002 corrigió solo JS.

### SKILL.md asume Python

`.agents/skills/geo-optimization/SKILL.md` (líneas 69-74) solo referencia
`python3 scripts/geo_optimizer.py`. El CLI JS (`npx geo-opt`) no se menciona.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Full check (JS) | `npm run check` | exit 0 |
| Node tests | `npm test` | N pass, 0 fail |
| Python tests | `python3 .agents/skills/geo-optimization/scripts/test_optimizer.py` | 6 OK |

## Decision framework

Este plan NO elige por ti qué implementación mantener. En su lugar, implementa
el approach de **documentar y congelar**: declarar una implementación como
canónica y la otra como derivada, documentar las diferencias, y establecer
un checklist de sincronización.

La **recomendación** (basada en la evidencia del código) es:

- **JS como canónica**: tiene `package.json`, publicación npm (`bin` entry),
  tests en CI (`npm test`), y es la interfaz pública documentada en README.
- **Python como derivada**: existe solo para el agent skill (SKILL.md). Los
  agentes AI también pueden invocar el CLI JS vía `npx`.

Si el maintainer prefiere mantener ambas como pares, este plan igual aplica:
la tabla de diferencias y el checklist son útiles en cualquier escenario.

## Scope

**In scope** (archivos a modificar):
- `plans/006-consolidation-decision.md` o `docs/implementation-strategy.md` —
  documento con la decisión y el checklist de sincronización
- `.agents/skills/geo-optimization/SKILL.md` — añadir nota sobre las dos
  implementaciones y cuál usar
- `.agents/skills/geo-optimization/scripts/geo_optimizer.py` — aplicar fixes
  que ya existen en JS (solo si se decide mantener Python)

**Out of scope** (no tocar):
- `src/optimizer.js` — no se modifica en este plan
- `bin/cli.js` — no se modifica
- Eliminar cualquiera de las dos implementaciones (requiere decisión humana)

## Git workflow

- Branch: `advisor/006-consolidation`
- Commits: un commit con la documentación, otro (opcional) con fixes de
  sincronización a Python
- Formato de mensaje: `docs: <descripción>` o `fix: <descripción>`

## Steps

### Step 1: Crear documento de estrategia de implementaciones

Crear `docs/implementation-strategy.md`:

```markdown
# Implementation Strategy — JS vs Python

## Decision

As of 2025-06-25, **`src/optimizer.js` (JavaScript)** is the canonical
implementation of geo-opt. The Python implementation in
`.agents/skills/geo-optimization/scripts/geo_optimizer.py` is a secondary
port used by the agent skill defined in `SKILL.md`.

## Rationale

1. **Public interface**: The npm package `geo-opt` is the documented public
   CLI (`README.md`). The `bin` entry in `package.json` makes it available
   via `npx geo-opt`.
2. **CI/CD**: `npm test` is the automated verification path. Python tests
   exist but are not integrated into `npm run check`.
3. **Feature recency**: JS has received more recent fixes (plan 002 fixed
   4 bugs in JS; Python equivalents may still be unfixed).

## Keeping them in sync

When making changes to the canonical JS implementation, apply equivalent
changes to the Python port following this checklist:

### Sync checklist

- [ ] `loadConfig` / `load_config` — config search paths and error handling
- [ ] `preprocessContent` / `preprocess_content` — regex patterns for
  stripping code blocks, scripts, styles, comments
- [ ] `cleanMarkdownToPlainText` / `clean_markdown_to_plain_text` — link
  removal, table conversion, bold/italic stripping
- [ ] `extractSections` / `extract_sections` — heading parsing and body
  extraction (note: different return types: objects vs tuples)
- [ ] `auditFile` / `audit_file` — all 5 scoring dimensions, HTML path,
  output formatting (text + JSON)
- [ ] `checkRobots` / `check_robots` — agent list, blocking detection
- [ ] `generateSchemaData` / `generate_schema_data` — schema generation
  for article, faq, product types; FAQ filters
- [ ] `injectSchema` / `inject_schema` — signature injection, schema
  replacement, HTML vs markdown path, path validation, dry-run mode

### Known differences (intentional)

- **Return types**: JS `extractSections` returns `[{header, body}]`; Python
  returns `[(header, body)]`. Both are valid for their language idioms.
- **CLI parsing**: JS uses manual `process.argv`; Python uses `argparse`.
  This is acceptable — the CLI layer is not duplicated logic.
- **Config fallback**: JS searches `.agents/skills/geo-optimization/` as
  a secondary fallback; Python searches relative to the script directory.
  This reflects their different deployment contexts.

## Migration path (future)

If maintaining both implementations becomes unsustainable, the recommended
migration is:

1. Make the Python version a thin wrapper that shells out to the JS CLI:
   `subprocess.run(['node', 'bin/cli.js', ...])`.
2. Or: extract scoring rules into a shared JSON/YAML config file that both
   implementations load, reducing logic duplication to I/O and formatting.
```

**Verify**: `cat docs/implementation-strategy.md | head -5` muestra el título.

### Step 2: Actualizar SKILL.md con nota sobre las dos implementaciones

En `.agents/skills/geo-optimization/SKILL.md`, añadir después de la línea
de título (`# Generative Engine Optimization (GEO) Skill`), antes del
workflow:

```markdown
> **Implementation note**: This skill is backed by two implementations:
> - **`npx geo-opt`** (JavaScript/Node.js) — the canonical CLI, published
>   to npm. Use for CI/CD and local development.
> - **`python3 scripts/geo_optimizer.py`** — Python port, used by this skill
>   for agent-driven optimization. Both produce identical results.
>   See `docs/implementation-strategy.md` for details.
```

**Verify**: `grep "Implementation note" .agents/skills/geo-optimization/SKILL.md`
muestra la nota.

### Step 3: (Condicional) Aplicar fixes de JS a Python

SI se decide mantener Python como implementación activa (no solo legacy),
aplicar los siguientes fixes de sincronización a `geo_optimizer.py`:

#### Step 3a: Corregir fecha hardcodeada

En `geo_optimizer.py`, línea 495, cambiar:
```python
"datePublished": "2026-06-25T12:00:00+00:00",
```
por:
```python
"datePublished": datetime.now(timezone.utc).isoformat(),
```

Y añadir al inicio del archivo:
```python
from datetime import datetime, timezone
```

**Verify**: `grep "datetime.now" .agents/skills/geo-optimization/scripts/geo_optimizer.py`
muestra el cambio.

#### Step 3b: Añadir filtros de sección al tipo FAQ en Python

En `geo_optimizer.py`, dentro del bloque `elif schema_type == "faq"`,
replicar los mismos filtros que el plan 002 añadió a JS:

```python
elif schema_type == "faq":
    sections = extract_sections(content)
    qa_list = []
    for q, a in sections[:5]:
        if len(a) < 15 or q.lower() in ["sources", "references", "citations", "bibliography"]:
            continue
        clean_answer = clean_markdown_to_plain_text(a)
        qa_list.append({
            "@type": "Question",
            "name": q,
            "acceptedAnswer": {
                "@type": "Answer",
                "text": clean_answer
            }
        })
```

**Verify**: `grep "len(a) < 15" .agents/skills/geo-optimization/scripts/geo_optimizer.py`
muestra el filtro.

### Step 4: Ejecutar verificaciones

```bash
npm run check
python3 .agents/skills/geo-optimization/scripts/test_optimizer.py
```

**Verify**: `npm run check` exit 0. Python tests 6 OK.

### Step 5: Commit

```bash
git add docs/implementation-strategy.md .agents/skills/geo-optimization/SKILL.md
# Si se aplicaron fixes de Python:
git add .agents/skills/geo-optimization/scripts/geo_optimizer.py
git commit -m "docs: document JS/Python implementation strategy and sync fixes

- Add docs/implementation-strategy.md with canonical decision and sync checklist
- Update SKILL.md with implementation note for agents
- Sync Python: dynamic datePublished, FAQ section filters

Co-Authored-By: Claude <noreply@anthropic.com>"
```

**Verify**: `git log --oneline -1` muestra el commit. `git status` clean.

## Test plan

No se añaden nuevos tests. Verificaciones:

- `npm test` → todos pasan
- `python3 .agents/skills/geo-optimization/scripts/test_optimizer.py` → 6 OK
- Si se aplicaron fixes a Python, los tests existentes deben seguir pasando
  (la fecha dinámica no se testea explícitamente; los filtros de FAQ pueden
  cambiar el output de `test_generate_schema_data_article` solo si usa tipo
  `"faq"` — verificar).

## Done criteria

- [ ] `docs/implementation-strategy.md` existe con la decisión documentada
- [ ] `docs/implementation-strategy.md` incluye el sync checklist con las 8
  funciones principales
- [ ] `.agents/skills/geo-optimization/SKILL.md` menciona ambas implementaciones
- [ ] Si se decidió sincronizar Python: `geo_optimizer.py` tiene fecha dinámica
  y filtros FAQ
- [ ] `npm run check` → exit 0
- [ ] `npm test` → todos pasan
- [ ] `python3 .agents/skills/geo-optimization/scripts/test_optimizer.py` → 6 OK
- [ ] `git status` está clean
- [ ] `plans/README.md` status row actualizado a DONE

## STOP conditions

Stop and report back (do not improvise) if:

- El maintainer prefiere ELIMINAR una implementación en lugar de documentar
  la dualidad. Este plan no cubre eliminación — requiere un plan nuevo.
- Los fixes de Python (Step 3) rompen los tests de Python. Reportar qué test
  falla y por qué. Posible causa: el filtro de FAQ elimina entries que los
  tests esperan.
- `docs/` no existe como directorio (crearlo con `mkdir -p docs`).
- La estructura del proyecto cambió significativamente desde que se escribió
  este plan (ej. `geo_optimizer.py` fue movido o renombrado).

## Maintenance notes

- **El sync checklist es un proceso manual**: no hay verificación automatizada
  de que JS y Python producen outputs idénticos. Si el proyecto crece, añadir
  un test de integración que corra ambos sobre el mismo input y compare JSON.
- **Si Python se vuelve solo un wrapper**: la opción de `subprocess.run` es
  la más simple y elimina la duplicación de lógica. El costo es el overhead
  de spawnear un proceso Node.js desde Python (~100ms).
- **Los agentes AI pueden usar `npx`**: si el agent skill se actualiza para
  preferir `npx geo-opt`, la versión Python podría deprecarse completamente.
