# Plan 001: Inicializar git y establecer tooling base

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check**: Este proyecto no es un repositorio git al momento de
> escribir este plan (2025-06-25). El primer paso de este plan inicializa
> git, por lo que no aplica drift check previo. Si el proyecto YA es un
> repositorio git cuando este plan se ejecute, compara los archivos listados
> en "Current state" contra su estado actual antes de proceder.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: 2025-06-25 (no git — project not yet initialized)

## Why this matters

Este proyecto no tiene repositorio git, no tiene linter, no tiene formatter,
no tiene typechecker, no tiene `CLAUDE.md`, tiene un `__pycache__/` compilado
en el árbol de fuentes, requiere Node.js 18 (EOL desde abril 2025), y tiene
archivos muertos (`schema_templates/`) que confunden a contribuyentes.

Sin esta base, ningún otro plan puede ejecutarse con verificación automatizada.
Este plan establece el baseline de calidad sobre el cual todos los demás planes
construyen.

## Current state

- **No git repo**: el directorio `/home/carlos/VS_Code_Projects/products/GEO-skill/`
  no contiene `.git/`.
- **`package.json`**: solo tiene script `"test"`. Sin `devDependencies`.
  `engines.node: ">=18.0.0"` — Node 18 EOL desde abril 2025.
- **`.agents/skills/geo-optimization/scripts/__pycache__/geo_optimizer.cpython-313.pyc`**:
  artefacto binario compilado en el árbol de fuentes.
- **`.agents/skills/geo-optimization/resources/schema_templates/`**:
  `article.json`, `faq.json`, `product.json` — nunca referenciados por ningún
  código JS ni Python. Sirven como documentación de referencia.
- **Sin `CLAUDE.md`**, sin `.editorconfig`, sin `.eslintrc`, sin `.prettierrc`,
  sin `.gitignore`.
- **Convenciones observadas en el código**:
  - JS: ESM (`"type": "module"`), camelCase, punto y coma, `process.exit(1)`
    en errores, `console.error` + `process.exit` como patrón de error.
  - Python: snake_case, `sys.exit(1)` en errores, `print(..., file=sys.stderr)`.
  - Ver `src/optimizer.js` y `geo_optimizer.py` como referencia de estilo.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Node tests | `npm test` | 5 pass, 0 fail |
| Python tests | `python3 .agents/skills/geo-optimization/scripts/test_optimizer.py` | 6 OK |
| ESLint (post-install) | `npx eslint src/ bin/` | exit 0, sin errores |
| Prettier check (post-install) | `npx prettier --check src/ bin/ tests/` | "All matched files use Prettier code style!" |

## Scope

**In scope** (archivos a crear o modificar):
- `package.json` — añadir devDependencies, scripts, engines update
- `.gitignore` — crear con patrones para Node.js, Python, y OS
- `.editorconfig` — crear
- `.eslintrc.json` — crear config básica para ESM
- `.prettierrc` — crear config mínima
- `CLAUDE.md` — crear con documentación del proyecto para agentes AI
- Eliminar `.agents/skills/geo-optimization/scripts/__pycache__/`
- Añadir `.agents/skills/geo-optimization/resources/schema_templates/README.md`

**Out of scope** (no tocar):
- `src/optimizer.js` — solo se reformatea con Prettier, sin cambios de lógica
- `bin/cli.js` — solo se reformatea con Prettier, sin cambios de lógica
- `tests/optimizer.test.js` — solo se reformatea con Prettier
- `.agents/skills/geo-optimization/scripts/geo_optimizer.py` — no se toca
- `.agents/skills/geo-optimization/scripts/test_optimizer.py` — no se toca
- `.agents/skills/geo-optimization/SKILL.md` — no se toca
- Los archivos JSON en `schema_templates/` no se modifican

## Git workflow

- Branch: `advisor/001-git-and-tooling` (crear desde el commit inicial)
- Commits lógicos por paso. Formato de mensaje: `chore: <descripción>`
- **No hacer push** ni abrir PR a menos que se indique explícitamente.

## Steps

### Step 1: Inicializar repositorio git

```bash
cd /home/carlos/VS_Code_Projects/products/GEO-skill
git init
git add -A
git commit -m "chore: initial commit — geo-opt v1.0.0"
```

**Verify**: `git rev-parse --short HEAD` muestra un hash corto. `git status`
reporta working tree clean.

### Step 2: Crear `.gitignore`

Crear `.gitignore` con este contenido:

```
# Dependencies
node_modules/

# Python bytecache
__pycache__/
*.pyc
*.pyo

# IDE
.vscode/
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Environment
.env
.env.local
.env.*.local

# Build output
dist/
*.tsbuildinfo

# Logs
*.log
npm-debug.log*
```

**Verify**: `git status` muestra `.gitignore` como untracked. `git add .gitignore`.

### Step 3: Crear `.editorconfig`

Crear `.editorconfig`:

```ini
root = true

[*]
indent_style = space
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true

[*.{js,json,md}]
indent_size = 2

[*.py]
indent_size = 4

[Makefile]
indent_style = tab
```

**Verify**: `cat .editorconfig` muestra el contenido esperado. `git add .editorconfig`.

### Step 4: Eliminar `__pycache__/`

```bash
rm -rf .agents/skills/geo-optimization/scripts/__pycache__
```

**Verify**: `ls .agents/skills/geo-optimization/scripts/__pycache__ 2>&1`
debe fallar con "No such file or directory". `git add -u` (stage la eliminación).

### Step 5: Añadir README a `schema_templates/`

Crear `.agents/skills/geo-optimization/resources/schema_templates/README.md`:

```markdown
# Schema Templates

These JSON files are **reference templates** showing the Schema.org shapes
generated by `generateSchemaData()` in `geo_optimizer.py` and `optimizer.js`.

They are **not loaded at runtime**. The actual schema generation logic lives in:
- `src/optimizer.js` (JavaScript)
- `geo_optimizer.py` (Python)

When modifying schema output, update both the generation code AND these
reference templates to keep them in sync.
```

**Verify**: `cat .agents/skills/geo-optimization/resources/schema_templates/README.md`
muestra el contenido. `git add` el archivo.

### Step 6: Actualizar `engines.node` en `package.json`

Cambiar `package.json` línea 13 de `">=18.0.0"` a `">=20.0.0"`:

```json
"engines": {
  "node": ">=20.0.0"
}
```

Node 20 es el mínimo LTS activo al momento de este plan. Nota: Node 20 LTS
termina en abril 2026 y estamos en junio 2025, así que es correcto.

**Verify**: `node -e "const p = require('./package.json'); console.log(p.engines.node)"`
muestra `>=20.0.0`. `git add package.json`.

### Step 7: Instalar ESLint y Prettier como devDependencies

```bash
npm install --save-dev eslint @eslint/js prettier
```

**Verify**: `node -e "require('eslint'); require('prettier'); console.log('OK')"`
muestra `OK`. `package.json` ahora tiene `devDependencies`.

### Step 8: Configurar ESLint

Crear `.eslintrc.json`:

```json
{
  "root": true,
  "env": {
    "node": true,
    "es2022": true
  },
  "parserOptions": {
    "ecmaVersion": 2022,
    "sourceType": "module"
  },
  "extends": ["eslint:recommended"],
  "rules": {
    "no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }],
    "no-console": "off",
    "semi": ["error", "always"],
    "quotes": ["error", "double", { "avoidEscape": true }],
    "no-undef": "error"
  }
}
```

**Verify**: `npx eslint src/optimizer.js` — puede reportar warnings pero no
errores fatales. `git add .eslintrc.json`.

### Step 9: Configurar Prettier

Crear `.prettierrc`:

```json
{
  "semi": true,
  "singleQuote": false,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 100
}
```

**Verify**: `npx prettier --check src/optimizer.js` — reportará diferencias de
formato (esto es esperado). `git add .prettierrc`.

### Step 10: Añadir scripts a `package.json`

En `package.json`, reemplazar el bloque `"scripts"` con:

```json
"scripts": {
  "test": "node --test tests/*.test.js",
  "lint": "eslint src/ bin/",
  "format": "prettier --write src/ bin/ tests/",
  "format:check": "prettier --check src/ bin/ tests/",
  "check": "npm run lint && npm run format:check && npm test"
}
```

**Verify**: `npm run check` — lint puede reportar warnings, format:check
reportará diferencias, test pasa. `git add package.json`.

### Step 11: Aplicar formateo Prettier

```bash
npx prettier --write src/optimizer.js bin/cli.js tests/optimizer.test.js
```

**Verify**: `npx prettier --check src/ bin/ tests/` muestra "All matched files
use Prettier code style!". `npm test` sigue pasando 5/5. `git add -u`.

### Step 12: Crear `CLAUDE.md`

Crear `CLAUDE.md` en la raíz del proyecto:

```markdown
# CLAUDE.md — geo-opt

## Project

`geo-opt` is a zero-dependency CLI tool for Generative Engine Optimization
(GEO). It audits Markdown/HTML content and scores it 0–100 based on the
Princeton GEO framework (KDD 2024). It also generates and injects JSON-LD
Schema.org structured data and audits robots.txt for AI crawler access.

## Architecture

- **Two implementations** of the same logic:
  - `src/optimizer.js` (705 lines) — JavaScript/Node.js ESM, published as npm
    package `geo-opt`
  - `.agents/skills/geo-optimization/scripts/geo_optimizer.py` (672 lines) —
    Python 3, used by the agent skill defined in `SKILL.md`
- **CLI entry point**: `bin/cli.js` (90 lines) — manual argv parsing
- **Tests**: `tests/optimizer.test.js` (5 tests, node:test) +
  `.agents/skills/geo-optimization/scripts/test_optimizer.py` (6 tests,
  unittest)

## Commands

| Purpose | Command |
|---------|---------|
| Test (JS) | `npm test` |
| Test (Python) | `python3 .agents/skills/geo-optimization/scripts/test_optimizer.py` |
| Lint | `npm run lint` |
| Format check | `npm run format:check` |
| Format apply | `npm run format` |
| Full check | `npm run check` |
| Run CLI | `node bin/cli.js <command> [args]` |

## Conventions

- JS: ESM, camelCase, double quotes, semicolons, `process.exit(1)` on errors
- Python: snake_case, `sys.exit(1)` on errors, `print(..., file=sys.stderr)`
- Error pattern: `console.error`/`print(stderr)` + `process.exit(1)`/`sys.exit(1)`
- Output functions write to stdout; core functions return data
- Config loaded from `geo_config.json` in CWD or `.agents/` fallback

## Implementation plans

See `plans/README.md` for the current improvement roadmap. Execute plans in
order. All plans are authored for executor models with zero context — read
each plan fully before starting.
```

**Verify**: `cat CLAUDE.md | head -5` muestra el título. `git add CLAUDE.md`.

### Step 13: Commit final

```bash
git add -A
git commit -m "chore: initialize git, add tooling baseline (lint, format, editorconfig, CLAUDE.md)

- Add .gitignore, .editorconfig, .eslintrc.json, .prettierrc
- Add lint, format, format:check, check npm scripts
- Bump engines.node from >=18.0.0 to >=20.0.0
- Remove committed __pycache__ directory
- Add README for schema_templates/
- Create CLAUDE.md with project docs for AI agents

Co-Authored-By: Claude <noreply@anthropic.com>"
```

**Verify**: `git log --oneline -1` muestra el commit. `git status` está clean.
`npm run check` pasa completo.

## Test plan

No se añaden nuevos tests en este plan. El paso 11 verifica que los tests
existentes siguen pasando después del formateo Prettier.

- **Verify**: `npm test` → 5 pass, 0 fail
- **Verify**: `python3 .agents/skills/geo-optimization/scripts/test_optimizer.py` → 6 OK

## Done criteria

- [ ] `git rev-parse --short HEAD` devuelve un hash (repositorio inicializado)
- [ ] `.gitignore` existe con patrones para node_modules, __pycache__, IDE, OS
- [ ] `.editorconfig` existe con indent_size=2 para JS/JSON, 4 para Python
- [ ] `__pycache__/` no existe en el árbol (`find . -name __pycache__` no produce output)
- [ ] `schema_templates/README.md` existe
- [ ] `package.json` engines.node es `">=20.0.0"`
- [ ] `package.json` tiene devDependencies: `eslint`, `prettier`
- [ ] `package.json` tiene scripts: `lint`, `format`, `format:check`, `check`
- [ ] `.eslintrc.json` existe con config para ESM
- [ ] `.prettierrc` existe
- [ ] `npx eslint src/ bin/` no reporta errores (warnings aceptables)
- [ ] `npx prettier --check src/ bin/ tests/` reporta "All matched files use Prettier code style!"
- [ ] `npm test` → 5 pass, 0 fail
- [ ] `npm run check` → exit 0 (lint + format:check + test)
- [ ] `CLAUDE.md` existe en la raíz
- [ ] `git status` está clean
- [ ] `plans/README.md` status row actualizado a DONE

## STOP conditions

Stop and report back (do not improvise) if:

- El proyecto YA es un repositorio git con commits previos. En ese caso,
  omite el Step 1 (git init + initial commit) pero ejecuta todos los demás
  pasos normalmente. Crea branch `advisor/001-git-and-tooling` desde HEAD.
- `npm install --save-dev eslint @eslint/js prettier` falla (problemas de
  red o permisos).
- `npm test` falla después del formateo Prettier (el formateo no debería
  romper nada, pero si lo hace, reporta el error específico).
- `eslint` reporta errores que no pueden resolverse con cambios de formato
  (ej. variables no definidas que requieren cambios de lógica). Los warnings
  son aceptables y no deben bloquear.
- El usuario ha modificado archivos manualmente entre pasos y `git status`
  no está limpio entre commits.

## Maintenance notes

- **Prettier config**: `printWidth: 100` es más permisivo que el default de
  80. Si el equipo prefiere 80, ajustar `.prettierrc`.
- **ESLint config**: `no-console: "off"` porque esta es una CLI tool que usa
  `console.log` intencionalmente. No cambiar sin revisar todos los usos.
- **Node engines**: cambiar de `>=18.0.0` a `>=20.0.0` es un bump semver-major.
  Si esto se publica a npm, considerar bump a v2.0.0 o documentar el cambio.
- **schema_templates/**: si en el futuro se decide que estas plantillas son
  innecesarias incluso como referencia, eliminar el directorio completo.
  Por ahora se documenta su propósito.
