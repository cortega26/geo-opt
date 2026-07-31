# Plan 008: Los dotfiles se excluyen automáticamente en el directory walker

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 4dff240..HEAD -- src/discovery.js tests/optimizer.test.js`
> If either file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `4dff240`, 2026-06-26

## Why this matters

El comentario en `src/discovery.js:105-107` dice "Skip dot-prefixed entries by default (like .git, .DS_Store)", pero el código solo aplica `matchesIgnore` si hay reglas de ignore compiladas. Sin un `.gitignore` presente, directorios como `.git` y `node_modules` se recorren completos. `node_modules` contiene cientos de `README.md` que **sí** matchean las extensiones permitidas (`.md`), lo que causa que `geo-opt audit --recursive .` en un proyecto sin `.gitignore` audite archivos basura de dependencias, produciendo resultados incorrectos y consumiendo órdenes de magnitud más tiempo del necesario.

El fix es una línea: agregar la verificación `entry.name.startsWith(".")` que el comentario ya promete.

## Current state

- `src/discovery.js` — directory walker con soporte de patrones gitignore. Contiene la función `walkDirectory()` que recorre recursivamente.
  - Líneas 97-119: `walkDirectory()` — el bucle sobre `entries` no excluye dotfiles cuando no hay reglas de ignore.
  - Líneas 105-107: comentario que documenta el comportamiento esperado pero no implementado.
- `tests/optimizer.test.js` — tests existentes. Líneas 1036-1050: test `discoverFiles loads .gitignore automatically` que prueba el comportamiento con `.gitignore`. No hay test para el caso sin `.gitignore`.
- Convenciones del repo: ESM, camelCase, punto y coma, `node:test` + `node:assert` para tests.

Fragmento exacto del código actual (`src/discovery.js:97-119`):

```javascript
function walkDirectory(dirPath, collected, { rules, allowedExtensions, relativeRoot }) {
  let entries;
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return; // skip unreadable directories silently in batch mode
  }
  for (const entry of entries) {
    // Skip dot-prefixed entries by default (like .git, .DS_Store)
    // unless explicitly un-ignored.
    const entryRel = path.relative(relativeRoot, path.join(dirPath, entry.name));
    if (rules && matchesIgnore(entryRel, rules)) continue;

    if (entry.isDirectory()) {
      walkDirectory(path.join(dirPath, entry.name), collected, {
        rules,
        allowedExtensions,
        relativeRoot,
      });
    } else if (entry.isFile() && hasAllowedExtension(entry.name, allowedExtensions)) {
      collected.push(path.join(dirPath, entry.name));
    }
  }
}
```

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Full check | `npm run check` | exit 0, all tests pass |
| JS tests only | `npm test` | 59 tests pass |
| Specific test filter | `node --test --test-name-pattern="discoverFiles" tests/optimizer.test.js` | matching tests pass |
| Lint | `npm run lint` | exit 0 |
| Format check | `npm run format:check` | exit 0 |

## Scope

**In scope** (the only files you should modify):
- `src/discovery.js`
- `tests/optimizer.test.js`

**Out of scope** (do NOT touch):
- `src/batch.js` — no depende del walker de directorios
- `bin/cli.js` — no necesita cambios; el CLI usa `discoverFiles` que a su vez usa `walkDirectory`
- Python parity (`geo_optimizer.py`) — la feature de batch/recursive no existe en el script Python; no duplicar

## Git workflow

- Branch: `advisor/008-fix-dotfile-skipping`
- Commit: `fix: skip dot-prefixed entries in directory walker` seguido del body.
- Sigue el estilo de commits del repo: mensajes cortos en inglés, sin punto final en el subject.
- No hagas push ni abras PR a menos que se te indique explícitamente.

## Steps

### Step 1: Agregar el skip de dotfiles en `walkDirectory`

En `src/discovery.js`, dentro del bucle `for (const entry of entries)` en la función `walkDirectory()`, agrega una verificación de prefijo `.` **antes** del cálculo de `entryRel` y del chequeo de ignore. La línea debe ir inmediatamente después de la llave de apertura del bucle (línea 104).

El código nuevo debe verse así (solo se muestra el bloque relevante):

```javascript
  for (const entry of entries) {
    // Skip dot-prefixed entries by default (like .git, .DS_Store)
    // unless explicitly un-ignored via a negation pattern.
    if (entry.name.startsWith(".")) continue;

    const entryRel = path.relative(relativeRoot, path.join(dirPath, entry.name));
    if (rules && matchesIgnore(entryRel, rules)) continue;

    if (entry.isDirectory()) {
      // ... resto del código sin cambios
```

**Verifica**: `npm run lint` → exit 0, sin errores.

### Step 2: Ejecutar los tests existentes

Asegúrate de que los tests que ya existen sigan pasando.

**Verifica**: `npm test` → 59 tests pass.

### Step 3: Agregar test para dotfiles sin `.gitignore`

En `tests/optimizer.test.js`, agrega un nuevo test después del test `discoverFiles loads .gitignore automatically` (aproximadamente línea 1050). El test debe:

1. Crear un directorio temporal con `fs.mkdtempSync`.
2. Crear un archivo `.secret.md` (dot-prefixed) y un archivo `public.md`.
3. Crear un subdirectorio `.hidden/` con un archivo `inside.md` dentro.
4. Llamar a `discoverFiles([tmpDir], { recursive: true })` **sin** pasar `ignorePatterns` ni tener `.gitignore`.
5. Verificar que solo se descubre `public.md` (1 archivo), y que ni `.secret.md` ni `.hidden/inside.md` aparecen.

Sigue el patrón del test `discoverFiles loads .gitignore automatically` (líneas 1036-1050) como modelo estructural.

**Verifica**: `node --test --test-name-pattern="discoverFiles" tests/optimizer.test.js` → todos los tests de discoverFiles pasan, incluyendo el nuevo. El contador total de tests debe ser 60.

### Step 4: Full check

**Verifica**: `npm run check` → exit 0. Esto ejecuta lint + format:check + tests JS + tests Python + changelog:check.

## Test plan

- **Nuevo test**: `discoverFiles skips dot-prefixed entries without .gitignore` en `tests/optimizer.test.js`.
  - Happy path: directorio con `.secret.md`, `public.md`, y subdirectorio `.hidden/inside.md` → solo `public.md` descubierto.
- **Tests existentes**: los 59 tests existentes deben seguir pasando, especialmente `discoverFiles loads .gitignore automatically` (que prueba que el `.gitignore` se sigue respetando) y `discoverFiles respects ignore patterns`.
- **Patrón a seguir**: `discoverFiles loads .gitignore automatically` (líneas 1036-1050 de `tests/optimizer.test.js`).

## Done criteria

- [ ] `npm run check` exits 0
- [ ] `npm test` exits 0; 60 tests (59 existentes + 1 nuevo)
- [ ] `node --test --test-name-pattern="dot-prefixed" tests/optimizer.test.js` → 1 test nuevo pasa
- [ ] `grep -rn "TODO\|FIXME" src/discovery.js` no muestra nuevos marcadores
- [ ] `git diff --stat` solo muestra `src/discovery.js` y `tests/optimizer.test.js`
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- El código en `src/discovery.js:97-119` no coincide con el fragmento en "Current state" (el código ha cambiado desde que este plan fue escrito).
- Algún test existente falla después del cambio en Step 1.
- El nuevo test no puede escribirse sin tocar archivos fuera del scope.
- `npm run lint` falla con errores que no son triviales de arreglar (ej. problemas de formato que requieren `npm run format`).

## Maintenance notes

- Si en el futuro se agrega soporte para incluir archivos dot-prefixed (ej. `.env.example` como contenido auditado), la validación `entry.name.startsWith(".")` deberá convertirse en una lista de exclusión configurable. Por ahora, el comportamiento "skip all dot-prefixed" es correcto y coincide con la convención universal de herramientas CLI.
- Los patrones de negación (`!`) en `.gitignore` y `config.ignore` ya pueden re-incluir dotfiles porque las reglas compiladas se evalúan **antes** del nuevo skip. Si se necesita que `!` re-incluya dotfiles, el skip debe moverse **después** del chequeo de `matchesIgnore` y solo aplicarse si `ignored` sigue siendo `false`.
