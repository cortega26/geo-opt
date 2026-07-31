# Plan 005: Features v1.1 — CI/CD gate `--threshold`, `--dry-run`, `--backup`

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat HEAD -- bin/cli.js src/optimizer.js`
> If either file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plans/001-git-and-tooling.md
- **Category**: direction
- **Planned at**: 2025-06-25 (no git SHA — project not yet initialized)

## Why this matters

Tres funcionalidades prometidas o esperadas que no existen:

1. **`--threshold`**: el README (`README.md:22`) promete "CI/CD gates" con
   `--format json`, pero la CLI descarta el score retornado por `auditFile`.
   No hay forma de usar geo-opt como quality gate sin scripts externos.
2. **`--dry-run`**: `injectSchema` sobreescribe el archivo fuente sin opción
   de previsualizar los cambios. Los usuarios deben confiar ciegamente en el
   output generado.
3. **`--backup`**: no hay forma de proteger el archivo original antes de la
   inyección. Un `inject` mal configurado puede corromper contenido.

Las tres son aditivas (no rompen comportamiento existente) y aprovechan
infraestructura que ya existe en el código.

## Current state

### CLI actual (`bin/cli.js:46-60`)

```javascript
// El comando audit descarta el score retornado
if (command === 'audit') {
  const filepath = cmdArgs[0];
  if (!filepath) {
    console.error("Error: Missing file path for audit command.");
    process.exit(1);
  }
  const formatIndex = cmdArgs.indexOf('--format');
  const fIndex = cmdArgs.indexOf('-f');
  let format = 'text';
  if (formatIndex !== -1 && formatIndex < cmdArgs.length - 1) {
    format = cmdArgs[formatIndex + 1];
  } else if (fIndex !== -1 && fIndex < cmdArgs.length - 1) {
    format = cmdArgs[fIndex + 1];
  }
  auditFile(filepath, config, format);  // ← el valor de retorno se descarta
}
```

### `auditFile` retorna el score (`src/optimizer.js:436`)

```javascript
// Línea 436 — auditFile retorna el score total
return totalScore;
```

### `injectSchema` no tiene dry-run ni backup (`src/optimizer.js:638-704`)

La función construye `injectedCode` y escribe directamente. No hay parámetro
para saltar la escritura o para crear backup.

### Convenciones del proyecto

- CLI parsea `--flag value` manualmente con `indexOf` y `splice` en `bin/cli.js`
- Las funciones principales exportadas retornan datos (o `undefined` para
  las que solo hacen side effects)
- Patrón de salida: `console.log` para output, `console.error` para errores

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Full check | `npm run check` | exit 0 |
| Node tests | `npm test` | N pass, 0 fail |
| Test --threshold | `node bin/cli.js audit tests/temp.md --threshold 0` | exit 0 (score >= 0) |
| Test --dry-run | `node bin/cli.js inject tests/temp.md article --dry-run` | exit 0, no modifica archivo |
| Test --backup | `node bin/cli.js inject tests/temp.md article --backup` | exit 0, existe temp.md.bak |

## Scope

**In scope** (archivos a modificar):
- `src/optimizer.js` — añadir parámetro `dryRun` a `injectSchema`
- `bin/cli.js` — añadir flags `--threshold`, `--dry-run`, `--backup`; capturar
  score de `auditFile` y comparar

**Out of scope** (no tocar):
- `tests/optimizer.test.js` — no se añaden tests (el plan 003 cubre testing)
- `.agents/skills/geo-optimization/scripts/geo_optimizer.py` — no se modifica
- `README.md` — no se actualiza (la documentación se actualiza en plan 008)

## Git workflow

- Branch: `advisor/005-features-v1.1` (crear desde `advisor/001-git-and-tooling`)
- Commits: un commit por feature, o uno consolidado
- Formato de mensaje: `feat: <descripción>`

## Steps

### Step 1: Añadir `--threshold` al comando `audit` en `bin/cli.js`

En `bin/cli.js`, dentro del bloque `if (command === 'audit')`, añadir parseo
de `--threshold` y lógica de comparación. Reemplazar el bloque existente
(líneas 46-60) con:

```javascript
if (command === 'audit') {
  const filepath = cmdArgs[0];
  if (!filepath) {
    console.error("Error: Missing file path for audit command.");
    process.exit(1);
  }

  // Parse --format (or -f)
  const formatIndex = cmdArgs.indexOf('--format');
  const fIndex = cmdArgs.indexOf('-f');
  let format = 'text';
  if (formatIndex !== -1 && formatIndex < cmdArgs.length - 1) {
    format = cmdArgs[formatIndex + 1];
  } else if (fIndex !== -1 && fIndex < cmdArgs.length - 1) {
    format = cmdArgs[fIndex + 1];
  }

  // Parse --threshold
  const thresholdIndex = cmdArgs.indexOf('--threshold');
  const tIndex = cmdArgs.indexOf('-t');
  let threshold = null;
  if (thresholdIndex !== -1 && thresholdIndex < cmdArgs.length - 1) {
    threshold = parseInt(cmdArgs[thresholdIndex + 1], 10);
  } else if (tIndex !== -1 && tIndex < cmdArgs.length - 1) {
    threshold = parseInt(cmdArgs[tIndex + 1], 10);
  }

  const score = auditFile(filepath, config, format);

  if (threshold !== null && !isNaN(threshold)) {
    if (score < threshold) {
      console.error(`\nThreshold not met: score ${score}/100 is below required ${threshold}/100.`);
      process.exit(1);
    }
    console.log(`\nThreshold met: score ${score}/100 >= ${threshold}/100.`);
  }
}
```

**Verify**: `grep "threshold" bin/cli.js` muestra el nuevo código. `grep "const score = auditFile" bin/cli.js`
muestra que se captura el valor de retorno.

### Step 2: Añadir `dryRun` a `injectSchema` en `src/optimizer.js`

Cambiar la firma de `injectSchema` para aceptar un parámetro opcional `dryRun`.
Modificar línea 638:

```javascript
export function injectSchema(filepath, schemaType, config, dryRun = false) {
```

Y añadir el modo dry-run justo antes de la escritura (antes de la línea 698,
el bloque `try { fs.writeFileSync... }`):

```javascript
  if (dryRun) {
    console.log("=== DRY RUN: The following would be injected ===");
    console.log(injectedCode);
    console.log("=== End of dry run preview ===");
    return;
  }

  try {
    fs.writeFileSync(filepath, content, { encoding: 'utf8' });
  } catch (e) {
    console.error(`Error: Failed to write to file ${filepath}: ${e.message}`);
    process.exit(1);
  }
```

**Verify**: `grep "dryRun" src/optimizer.js` muestra la firma y el bloque
de dry run.

### Step 3: Añadir `--dry-run` al CLI en `bin/cli.js`

En el bloque `else if (command === 'inject')` (líneas 77-84), añadir parseo
de `--dry-run`:

```javascript
} else if (command === 'inject') {
  const filepath = cmdArgs[0];
  const type = cmdArgs[1];
  if (!filepath || !type) {
    console.error("Error: Missing arguments for inject command. Usage: inject <file> <type>");
    process.exit(1);
  }

  const dryRun = cmdArgs.includes('--dry-run');
  const backup = cmdArgs.includes('--backup');

  if (backup) {
    const backupPath = filepath + '.bak';
    try {
      fs.copyFileSync(filepath, backupPath);
      console.log(`Backup created: ${backupPath}`);
    } catch (e) {
      console.error(`Error: Failed to create backup ${backupPath}: ${e.message}`);
      process.exit(1);
    }
  }

  injectSchema(filepath, type, config, dryRun);
}
```

Nota: `fs` ya está disponible en `bin/cli.js` porque `injectSchema` lo usa
desde `optimizer.js`, pero NO está importado en `bin/cli.js`. Debes añadir
el import:

En la línea 2 de `bin/cli.js`, añadir:
```javascript
import fs from 'fs';
```

**Verify**: `grep "dry-run\|backup\|copyFileSync" bin/cli.js` muestra todo
el código nuevo.

### Step 4: Ejecutar formateo

```bash
npx prettier --write src/optimizer.js bin/cli.js
```

**Verify**: `npx prettier --check src/optimizer.js bin/cli.js` → sin diferencias.

### Step 5: Verificaciones

```bash
npm run check
```

**Verify**: lint exit 0, format check exit 0, `npm test` todos pasan.

### Step 6: Pruebas manuales de las nuevas features

Crear un archivo de prueba:

```bash
echo "# Test" > /tmp/test_geo.md
```

**Test `--threshold`** (score bajo, threshold alto → debe fallar):

```bash
node bin/cli.js audit /tmp/test_geo.md --threshold 90 --format json 2>&1; echo "EXIT: $?"
```

El exit code debe ser 1 (archivo casi vacío tiene score muy bajo).

**Test `--threshold`** (threshold bajo → debe pasar):

```bash
node bin/cli.js audit /tmp/test_geo.md --threshold 0 --format json 2>&1; echo "EXIT: $?"
```

El exit code debe ser 0.

**Test `--dry-run`**:

```bash
cp /tmp/test_geo.md /tmp/test_geo_dry.md
BEFORE=$(cat /tmp/test_geo_dry.md)
node bin/cli.js inject /tmp/test_geo_dry.md article --dry-run 2>&1
AFTER=$(cat /tmp/test_geo_dry.md)
test "$BEFORE" = "$AFTER" && echo "DRY-RUN OK: file unchanged" || echo "DRY-RUN FAIL: file was modified"
```

Debe imprimir `DRY-RUN OK: file unchanged` y mostrar el preview del schema.

**Test `--backup`**:

```bash
node bin/cli.js inject /tmp/test_geo_dry.md article --backup 2>&1
ls /tmp/test_geo_dry.md.bak 2>&1 && echo "BACKUP OK" || echo "BACKUP FAIL"
```

Debe existir `/tmp/test_geo_dry.md.bak`.

### Step 7: Limpiar archivos temporales

```bash
rm -f /tmp/test_geo.md /tmp/test_geo_dry.md /tmp/test_geo_dry.md.bak
```

### Step 8: Commit

```bash
git add src/optimizer.js bin/cli.js
git commit -m "feat: add --threshold, --dry-run, and --backup flags

- audit --threshold <n>: exit 1 if score below threshold (CI/CD gate)
- inject --dry-run: preview schema output without modifying file
- inject --backup: create .bak file before writing

Co-Authored-By: Claude <noreply@anthropic.com>"
```

**Verify**: `git log --oneline -1` muestra el commit. `git status` clean.

## Test plan

Verificación manual (paso 6):

| Feature | Test | Expected |
|---------|------|----------|
| `--threshold` | Archivo mínimo, threshold 90 | exit 1 |
| `--threshold` | Archivo mínimo, threshold 0 | exit 0 |
| `--dry-run` | Inyectar con --dry-run | Archivo no modificado, preview en stdout |
| `--backup` | Inyectar con --backup | Se crea `.bak`, archivo modificado |

Verificación automatizada existente:
- `npm test` → todos los tests existentes pasan (las nuevas features no rompen
  comportamiento anterior)
- `npm run lint` → exit 0

## Done criteria

- [ ] `grep "threshold" bin/cli.js` muestra parseo y comparación de threshold
- [ ] `grep "dryRun" src/optimizer.js` muestra la firma de `injectSchema` con
  el parámetro y el bloque de dry run
- [ ] `grep "copyFileSync" bin/cli.js` muestra la creación de backup
- [ ] `grep "import fs from" bin/cli.js` muestra el import añadido
- [ ] `npm run check` → exit 0
- [ ] `npm test` → todos pasan
- [ ] `node bin/cli.js audit /tmp/test.md --threshold 0` → exit 0
- [ ] `node bin/cli.js inject /tmp/test.md article --dry-run` → no modifica archivo
- [ ] `node bin/cli.js inject /tmp/test.md article --backup` → crea .bak
- [ ] `git status` está clean
- [ ] `plans/README.md` status row actualizado a DONE

## STOP conditions

Stop and report back (do not improvise) if:

- `npm test` falla después de cualquier cambio.
- El flag `--threshold` con valor no numérico causa un crash (probarlo:
  `node bin/cli.js audit file.md --threshold abc`). `parseInt("abc", 10)`
  retorna `NaN`, que debe ser manejado por el guard `!isNaN(threshold)`.
- La creación de backup falla porque el archivo `.bak` ya existe. En ese caso,
  añadir un sufijo de timestamp o reportar el error sin sobreescribir.
- El `import fs from 'fs'` en `bin/cli.js` causa conflictos porque `fs` ya se
  usa en el scope (actualmente no se importa).
- Los paths de test (`/tmp/test_geo.md`) no son escribibles en el sistema.

## Maintenance notes

- **`--threshold`** usa `parseInt` que trunca decimales. Si el score es 59.9,
  `parseInt` da 59. Esto es aceptable porque el score retornado es entero.
- **`--dry-run`** imprime el schema generado a stdout. Si se usa en pipes,
  puede mezclarse con otros outputs. Considerar `--format json` para dry-run
  en el futuro.
- **`--backup`** crea exactamente un `.bak`. Si se ejecuta dos veces, la
  segunda sobreescribe el `.bak` de la primera (el backup es del estado
  previo a la inyección actual). Esto es intencional: solo se preserva el
  estado inmediatamente anterior.
- **Coordinación con plan 008**: el plan 008 añade `--format html` y batch
  audit. El flag `--threshold` debe funcionar también en modo batch (exit 1
  si ALGÚN archivo no alcanza el threshold).
