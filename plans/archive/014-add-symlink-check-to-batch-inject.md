# Plan 014: Validación de seguridad de path en `batchInject`

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 4dff240..HEAD -- src/schema.js src/batch.js tests/optimizer.test.js`
> Si alguno de estos archivos cambió desde que este plan fue escrito, compara
> los fragmentos en "Current state" contra el código real; si hay divergencia,
> trátalo como STOP condition.

## Status

- **Priority**: P1
- **Effort**: S-M
- **Risk**: LOW
- **Depends on**: none (funcionalmente independiente, pero si el plan 011 ya se aplicó, `batch.js` importa desde `schema.js` — verifica los imports reales antes de empezar)
- **Category**: security
- **Planned at**: commit `4dff240`, 2026-06-26

## Why this matters

`src/batch.js:124-126` contiene un comentario que **admite explícitamente** que `batchInject` evita llamar a `injectSchema` porque esta función llama a `assertWritableTargetInsideCwd`, que hace `process.exit(1)` en caso de violación de path. Para evitar que el batch muera por un archivo malicioso, `batchInject` replica la lógica de inyección manualmente... pero **sin la validación de seguridad**.

Esto significa que:
1. Un symlink malicioso dentro de un directorio descubierto por `discoverFiles` que apunte fuera del CWD sería escrito por `batchInject` sin detección.
2. Un caller programático que pase paths arbitrarios a `batchInject` (sin pasar por `discoverFiles`) puede escribir fuera del CWD.

La solución es crear una versión "safe" de `assertWritableTargetInsideCwd` que retorne un resultado en vez de llamar `process.exit`, y usarla en `batchInject`.

## Current state

- `src/schema.js` — contiene la lógica de inyección y las funciones de validación de path.
  - Líneas 32-58: `isInsideDirectory()` y `assertWritableTargetInsideCwd()` — esta última llama `process.exit(1)` en caso de violación.
  - Líneas 60-81: `assertNewFileParentInsideCwd()` — similar, también llama `process.exit(1)`.
- `src/batch.js` — wrappers batch.
  - Líneas 116-207: `batchInject()` — itera sobre archivos y escribe sin validar symlinks.
  - Líneas 124-126: comentario que explica la omisión deliberada de la validación.
- `src/index.js` — barrel. Exporta `assertWritableTargetInsideCwd` y `assertNewFileParentInsideCwd`.

Fragmento clave `src/batch.js:121-128`:

```javascript
  for (const filepath of files) {
    try {
      // Use generateSchemaData + fs.writeFileSync instead of injectSchema
      // to avoid process.exit inside the batch loop. injectSchema calls
      // assertWritableTargetInsideCwd which exits on failure.
      // We replicate the inject logic here with batch-safe error handling.

      if (!fs.existsSync(filepath)) {
        errors.push({ file: filepath, error: "File not found" });
```

Fragmento `src/schema.js:32-58`:

```javascript
function isInsideDirectory(candidatePath, directoryPath) {
  const relativePath = path.relative(directoryPath, candidatePath);
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

export function assertWritableTargetInsideCwd(filepath) {
  let targetRealPath;
  let cwdRealPath;
  try {
    targetRealPath = fs.realpathSync(filepath);
    cwdRealPath = fs.realpathSync(process.cwd());
  } catch (e) {
    console.error(`Error: Failed to resolve real path for ${filepath}: ${e.message}`);
    process.exit(1);
    return;
  }

  if (!isInsideDirectory(targetRealPath, cwdRealPath)) {
    console.error(
      `Error: Security restriction — target file ${filepath} resolves outside the current working directory.`
    );
    process.exit(1);
    return;
  }

  return { targetRealPath, cwdRealPath };
}
```

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Full check | `npm run check` | exit 0, all tests pass |
| JS tests only | `npm test` | 59 tests pass |
| Specific tests | `node --test --test-name-pattern="symlink|batchInject|CLI inject" tests/optimizer.test.js` | matching tests pass |
| Lint | `npm run lint` | exit 0 |
| Format check | `npm run format:check` | exit 0 |

## Scope

**In scope** (the only files you should modify):
- `src/schema.js` — agregar `validateWritableTargetInsideCwd()` (versión sin `process.exit`)
- `src/batch.js` — usar la nueva validación en `batchInject`

**Out of scope** (do NOT touch):
- `src/index.js` — no es necesario exportar la nueva función (es interna)
- `bin/cli.js` — el CLI ya hace validación en el camino single-file; no cambiar
- `tests/optimizer.test.js` — el test existente `CLI rejects symlink targets that resolve outside the working directory` (línea 547) cubre el camino CLI; el camino `batchInject` se prueba indirectamente vía `inject --recursive`
- Python parity — no tiene batch inject

## Git workflow

- Branch: `advisor/014-batch-inject-symlink-check`
- Commit: `fix: add path traversal guard to batchInject`
- Sigue el estilo de commits del repo.
- No hagas push ni abras PR a menos que se te indique explícitamente.

## Steps

### Step 1: Crear `validateWritableTargetInsideCwd` en `schema.js`

En `src/schema.js`, agrega una nueva función **después** de `isInsideDirectory` (línea 35) y **antes** de `assertWritableTargetInsideCwd` (línea 37). La nueva función hace la misma validación pero retorna un objeto resultado en vez de llamar `process.exit`:

```javascript
/**
 * Validate that a target path resolves inside the current working directory.
 * Batch-safe: returns a result object instead of calling process.exit.
 *
 * @param {string} filepath
 * @returns {{ valid: true, targetRealPath: string, cwdRealPath: string } | { valid: false, error: string }}
 */
export function validateWritableTargetInsideCwd(filepath) {
  let targetRealPath;
  let cwdRealPath;
  try {
    targetRealPath = fs.realpathSync(filepath);
    cwdRealPath = fs.realpathSync(process.cwd());
  } catch (e) {
    return { valid: false, error: `Failed to resolve real path for ${filepath}: ${e.message}` };
  }

  if (!isInsideDirectory(targetRealPath, cwdRealPath)) {
    return {
      valid: false,
      error: `Security restriction — target file ${filepath} resolves outside the current working directory.`,
    };
  }

  return { valid: true, targetRealPath, cwdRealPath };
}
```

Luego, refactoriza `assertWritableTargetInsideCwd` para que delegue en la nueva función:

```javascript
export function assertWritableTargetInsideCwd(filepath) {
  const result = validateWritableTargetInsideCwd(filepath);
  if (!result.valid) {
    console.error(`Error: ${result.error}`);
    process.exit(1);
    return;
  }
  return { targetRealPath: result.targetRealPath, cwdRealPath: result.cwdRealPath };
}
```

**Verifica**: `npm run lint` → exit 0.

### Step 2: Usar la validación en `batchInject`

En `src/batch.js`, importa la nueva función. Agrega `validateWritableTargetInsideCwd` al import desde `./schema.js` (línea 3). Si el plan 011 ya se ejecutó, el import actual puede ser multi-línea; agrega la función al bloque existente.

Luego, en `batchInject`, agrega la validación **después** de `fs.existsSync` y **antes** de `fs.readFileSync`. Ubicación: después de la línea 131 (`continue;`) y antes de la línea 134 (`let content;`).

```javascript
      if (!fs.existsSync(filepath)) {
        errors.push({ file: filepath, error: "File not found" });
        failCount++;
        continue;
      }

      // Validate path confinement (batch-safe, no process.exit)
      const pathCheck = validateWritableTargetInsideCwd(filepath);
      if (!pathCheck.valid) {
        errors.push({ file: filepath, error: pathCheck.error });
        failCount++;
        continue;
      }

      let content;
```

El comentario en líneas 123-126 que explica por qué no se usa `injectSchema` debe actualizarse para reflejar que ahora sí hay validación:

```javascript
      // Use generateSchemaData + fs.writeFileSync with explicit path validation
      // instead of injectSchema to keep error handling batch-safe (no process.exit).
```

**Verifica**: `npm run lint` → exit 0.

### Step 3: Verificar que los tests existentes pasan

**Verifica**: `npm test` → 59 tests pass. Tests clave:
- `CLI rejects symlink targets that resolve outside the working directory` (línea 547) — el camino CLI single-file sigue funcionando.
- `batchInject injects schema and branding into markdown files` (línea 1183) — el batch inject sigue funcionando.
- `CLI inject --recursive processes multiple files` (línea 1163) — el comando recursive del CLI sigue funcionando.

### Step 4: Full check

**Verifica**: `npm run check` → exit 0.

## Test plan

No se requieren tests nuevos para este plan específico porque:

- El test `CLI rejects symlink targets that resolve outside the working directory` (línea 547) ya valida que la validación de path funciona a través del CLI single-file.
- `batchInject` se prueba indirectamente vía `CLI inject --recursive processes multiple files`.
- La nueva función `validateWritableTargetInsideCwd` comparte la misma lógica que `assertWritableTargetInsideCwd`, que ya está testeada.

Si se desea cobertura adicional, se puede agregar un test unitario para `validateWritableTargetInsideCwd` en un plan futuro de cobertura (ver plan 016).

## Done criteria

- [ ] `npm run check` exits 0
- [ ] `npm test` exits 0; 59 tests pass
- [ ] `grep -n "validateWritableTargetInsideCwd" src/schema.js` muestra la definición y el uso en `assertWritableTargetInsideCwd`
- [ ] `grep -n "validateWritableTargetInsideCwd" src/batch.js` muestra el import y el uso en `batchInject`
- [ ] `grep -n "process.exit" src/schema.js | grep -v "assertWritable"` — `validateWritableTargetInsideCwd` NO debe contener `process.exit`
- [ ] `git diff --stat` solo muestra `src/schema.js` y `src/batch.js`
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- El código en las ubicaciones indicadas en "Current state" no coincide con los fragmentos (el código ha cambiado).
- `npm run lint` o `npm test` fallan después de cualquier paso.
- `validateWritableTargetInsideCwd` ya existe en `src/schema.js` (el plan ya fue aplicado).
- Algún test existente de symlink o batch inject falla.
- La importación de `validateWritableTargetInsideCwd` en `batch.js` causa un error de export no encontrada.

## Maintenance notes

- `validateWritableTargetInsideCwd` es la fuente canónica de la lógica de validación de path. `assertWritableTargetInsideCwd` es un wrapper que agrega `console.error` + `process.exit` para uso en CLI.
- Si en el futuro se agregan más operaciones batch que escriben archivos (ej. `batchGenerateLlmsTxt`), deben usar `validateWritableTargetInsideCwd` para validar paths.
- La función `isInsideDirectory` es compartida por ambas. Si su lógica cambia (ej. para soportar symlinks permitidos), ambos caminos se benefician automáticamente.
