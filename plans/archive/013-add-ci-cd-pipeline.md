# Plan 013: CI/CD pipeline completo con GitHub Actions

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 4dff240..HEAD -- .github/workflows/`
> Si el directorio de workflows cambió desde que este plan fue escrito, compara
> el workflow existente contra lo documentado en "Current state"; si hay
> divergencia, trátalo como STOP condition.

## Status

- **Priority**: P1
- **Effort**: S-M
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `4dff240`, 2026-06-26

## Why this matters

El proyecto tiene `npm run check` que ejecuta lint, format, tests JS, tests Python, y changelog policy en un solo comando. Sin embargo, el único workflow de CI (`.github/workflows/changelog-policy.yml`) solo verifica el changelog. No hay validación automática de que el código compila, pasa tests, o cumple con el formato en cada PR. Esto significa que:

1. Un PR puede mergearse con tests rotos y nadie se entera hasta que otro desarrollador hace checkout.
2. No hay visibilidad de cobertura de tests en el tiempo.
3. `npm audit` no se ejecuta en ningún lado; vulnerabilidades en dependencias pasan desapercibidas.

Agregar un workflow `ci.yml` que ejecute `npm run check` + `npm audit` en cada push a `main` y en cada PR cierra esta brecha con ~35 líneas de YAML.

## Current state

- `.github/workflows/changelog-policy.yml` — workflow existente. Solo verifica changelog.
- `package.json` — scripts listos para CI: `test`, `test:coverage`, `lint`, `format:check`, `check`, `changelog:check`.
- No hay `test:python` en CI porque no se instala Python. Este plan debe agregarlo.
- El workflow existente usa `actions/checkout@v4` y `actions/setup-node@v4` con `node-version: 20`.

Fragmento del workflow existente (`.github/workflows/changelog-policy.yml`):

```yaml
name: Changelog policy

on:
  pull_request:
  push:
    branches:
      - main
      - master

permissions:
  contents: read

jobs:
  require-changelog:
    runs-on: ubuntu-latest

    steps:
      - name: Check out repository history
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Verify changelog policy
        env:
          GITHUB_BASE_REF: ${{ github.base_ref }}
        run: node scripts/check-changelog.js
```

`engines` en `package.json`: `"node": ">=20.0.0"`.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Full check local | `npm run check` | exit 0 |
| JS tests | `npm test` | exit 0, 59 tests pass |
| Python tests | `python3 .agents/skills/geo-optimization/scripts/test_optimizer.py` | exit 0, 28 tests pass |
| Validate YAML | `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"` | exit 0, no errors |
| Lint | `npm run lint` | exit 0 |

## Scope

**In scope** (the only files you should create/modify):
- `.github/workflows/ci.yml` — nuevo archivo

**Out of scope** (do NOT touch):
- `.github/workflows/changelog-policy.yml` — déjalo intacto; el nuevo workflow es complementario, no reemplaza
- `package.json` — no agregues nuevos scripts
- `README.md` — no agregues badges de CI (puede hacerse en otro plan si se desea)
- Python requirements — el workflow instalará `mistune` y `beautifulsoup4` vía pip

## Git workflow

- Branch: `advisor/013-add-ci-pipeline`
- Commit: `ci: add full check workflow (lint, tests, audit)`
- Sigue el estilo de commits del repo.
- No hagas push ni abras PR a menos que se te indique explícitamente.

## Steps

### Step 1: Crear `.github/workflows/ci.yml`

Crea el archivo `.github/workflows/ci.yml` con el siguiente contenido:

```yaml
name: CI

on:
  pull_request:
  push:
    branches:
      - main
      - master

permissions:
  contents: read

jobs:
  check:
    runs-on: ubuntu-latest

    steps:
      - name: Check out repository
        uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: "npm"

      - name: Install Node dependencies
        run: npm ci

      - name: Lint
        run: npm run lint

      - name: Format check
        run: npm run format:check

      - name: JS tests
        run: npm test

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.11"

      - name: Install Python dependencies
        run: |
          python3 -m pip install --upgrade pip
          pip install mistune beautifulsoup4

      - name: Python parity tests
        run: python3 .agents/skills/geo-optimization/scripts/test_optimizer.py

      - name: Changelog policy
        if: github.event_name == 'pull_request'
        env:
          GITHUB_BASE_REF: ${{ github.base_ref }}
        run: node scripts/check-changelog.js

      - name: Security audit (advisory only)
        run: npm audit --audit-level=high || true
        continue-on-error: true
```

**Verifica**: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"` → exit 0 (valida que el YAML es sintácticamente correcto).

### Step 2: Verificar localmente que los comandos del workflow funcionan

Ejecuta cada paso del workflow manualmente para confirmar que no hay sorpresas:

```bash
npm ci --dry-run 2>&1 | head -3  # solo verifica que npm ci es válido
npm run lint
npm run format:check
npm test
python3 .agents/skills/geo-optimization/scripts/test_optimizer.py
```

**Verifica**: Todos los comandos salen con exit 0.

### Step 3: Full check local

**Verifica**: `npm run check` → exit 0 (esto no prueba el workflow en GitHub, pero confirma que el código actual está limpio).

## Test plan

No se requieren tests de código. La validación del workflow ocurre en GitHub Actions después del push:

- El workflow se dispara en el push a la branch del plan.
- Se puede verificar manualmente revisando la pestaña "Actions" del repo en GitHub.
- Para prueba local, cada step del workflow se ejecuta manualmente en Step 2.

## Done criteria

- [ ] `.github/workflows/ci.yml` existe y es YAML válido
- [ ] `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"` exit 0
- [ ] `npm run check` exit 0 localmente
- [ ] `python3 .agents/skills/geo-optimization/scripts/test_optimizer.py` exit 0
- [ ] El workflow existente `changelog-policy.yml` no fue modificado
- [ ] `git diff --stat` solo muestra `.github/workflows/ci.yml` como archivo nuevo
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `.github/workflows/ci.yml` ya existe (alguien ya implementó este plan).
- `npm ci` falla localmente (las dependencias en `package-lock.json` están corruptas).
- `pip install mistune beautifulsoup4` falla (Python 3.11 no está disponible o los paquetes no se encuentran).
- El comando `python3` no existe en el sistema; reporta qué versión de Python está disponible.

## Maintenance notes

- El workflow usa `ubuntu-latest`. Si el proyecto requiere un SO específico en el futuro, ajusta `runs-on`.
- `npm audit` está configurado como `continue-on-error: true` para no bloquear PRs por vulnerabilidades sin fix disponible. Si se desea un comportamiento más estricto, cambia a `false`.
- El changelog policy solo se ejecuta en PRs (`if: github.event_name == 'pull_request'`) porque `GITHUB_BASE_REF` no está definido en pushes a main.
- Si se agregan más tests (JS o Python), el workflow los ejecutará automáticamente porque los comandos `npm test` y `python3 ...` no tienen filtros.
- El workflow existente `changelog-policy.yml` tiene un solapamiento parcial con el step "Changelog policy" en el nuevo workflow. Esto es intencional: el workflow nuevo es autosuficiente, y el antiguo puede eliminarse en el futuro si se desea consolidar.
