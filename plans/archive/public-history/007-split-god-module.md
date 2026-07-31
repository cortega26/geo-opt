# Plan 007: Modularizar `src/optimizer.js`

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat HEAD -- src/optimizer.js`
> If `src/optimizer.js` changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/003-test-coverage.md
- **Category**: tech-debt
- **Planned at**: 2025-06-25 (no git SHA — project not yet initialized)

## Why this matters

`src/optimizer.js` tiene 705 líneas con 7 funciones exportadas que mezclan
cuatro responsabilidades distintas en un solo archivo:

1. **Configuración**: `loadConfig`
2. **Procesamiento de texto**: `preprocessContent`, `cleanMarkdownToPlainText`,
   `extractSections`, `calculateReadability`
3. **Lógica de negocio**: `auditFile` (scoring), `checkRobots` (parsing),
   `generateSchemaData` (generación JSON-LD)
4. **I/O y formato**: `injectSchema` (lectura/escritura), `auditFile` (mezcla
   scoring con console.log)

Esto hace que sea difícil testear funciones individuales (todo está acoplado),
difícil extender (cada cambio toca el archivo más grande del proyecto), y
difícil onboardear contribuyentes.

Este plan divide `src/optimizer.js` en 4 módulos dentro de `src/`, manteniendo
100% de backward compatibility via un barrel file `src/index.js`.

## Current state

### Estructura de `src/optimizer.js` (705 líneas)

| Líneas | Función(es) | Responsabilidad |
|--------|------------|-----------------|
| 5 | `MAX_PRONOUN_DENSITY` | Constante |
| 11–36 | `loadConfig` | Configuración |
| 38–50 | `calculateReadability` | Texto |
| 52–61 | `preprocessContent` | Texto |
| 63–85 | `cleanMarkdownToPlainText` | Texto |
| 87–113 | `extractSections` | Texto |
| 115–437 | `auditFile` | Scoring + I/O + formato |
| 439–498 | `checkRobots` | Parsing + output |
| 500–636 | `generateSchemaData` | Schema generation |
| 638–704 | `injectSchema` | Schema injection + I/O |

### Dependencias actuales de los imports

```javascript
// src/optimizer.js imports
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
```

Solo `loadConfig` usa `__dirname` → necesita `fileURLToPath`. `auditFile`,
`checkRobots`, `generateSchemaData`, e `injectSchema` usan `fs`. `injectSchema`
usa `path` (solo para `path.join` en el fallback, pero con la validación de
path del plan 004 usa `path.resolve` y `path.sep`).

### Quién importa qué

- `bin/cli.js` importa: `auditFile`, `checkRobots`, `generateSchemaData`,
  `injectSchema`, `loadConfig`
- `tests/optimizer.test.js` importa: `auditFile`, `calculateReadability`,
  `checkRobots`, `cleanMarkdownToPlainText`, `extractSections`,
  `generateSchemaData`, `injectSchema`, `preprocessContent`

### Convenciones del proyecto

- ESM (`import`/`export`)
- Las funciones exportadas usan `export function`, no `export default`
- `process.exit(1)` en errores (esto DEBERÍA moverse a la capa CLI en el
  futuro, pero este plan no hace ese cambio de comportamiento)
- `console.log`/`console.error` para output (mismo caveat)

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Full check | `npm run check` | exit 0 |
| Node tests | `npm test` | N pass, 0 fail |
| Verify barrel exports | `node -e "import('./src/index.js').then(m => console.log(Object.keys(m).sort()))"` | lista de exports |

## Scope

**In scope** (archivos a crear o modificar):
- `src/config.js` — extraer `loadConfig` + `MAX_PRONOUN_DENSITY`
- `src/text.js` — extraer `preprocessContent`, `cleanMarkdownToPlainText`,
  `extractSections`, `calculateReadability`
- `src/scoring.js` — extraer `auditFile`
- `src/schema.js` — extraer `generateSchemaData`, `injectSchema`
- `src/robots.js` — extraer `checkRobots`
- `src/index.js` — barrel file que re-exporta todo como antes
- `src/optimizer.js` — reemplazar por `export * from './index.js'` (o eliminar
  y actualizar los dos consumidores)
- `bin/cli.js` — cambiar import de `'../src/optimizer.js'` a `'../src/index.js'`
- `tests/optimizer.test.js` — cambiar import a `'../src/index.js'`

**Out of scope** (no tocar):
- La lógica interna de las funciones — solo se mueven, no se modifican
- `.agents/skills/geo-optimization/` — sin cambios
- `package.json` — el `"main": "src/optimizer.js"` debe actualizarse a
  `"main": "src/index.js"`

## Git workflow

- Branch: `advisor/007-split-god-module`
- Commits: uno por cada extracción de módulo, más el barrel final
- Formato de mensaje: `refactor: <descripción>`

## Steps

### Step 1: Crear `src/config.js`

Crear el archivo `src/config.js` con el contenido de `loadConfig` (líneas
1–36 de `src/optimizer.js`, incluyendo imports de `fs`, `path`, `fileURLToPath`
y la constante `MAX_PRONOUN_DENSITY`):

```javascript
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const MAX_PRONOUN_DENSITY = 0.02;

export function loadConfig(configPath = null) {
  // ... (copiar líneas 11–36 sin modificar)
}
```

**Verify**: `node -e "import('./src/config.js').then(m => console.log(Object.keys(m)))"`
muestra `[ 'MAX_PRONOUN_DENSITY', 'loadConfig' ]`. `npm run lint` sin errores.

### Step 2: Crear `src/text.js`

Crear `src/text.js` con `preprocessContent`, `cleanMarkdownToPlainText`,
`extractSections`, y `calculateReadability` (líneas 38–113).

```javascript
export function calculateReadability(text) {
  // ... (copiar líneas 38–50 sin modificar)
}

export function preprocessContent(content) {
  // ... (copiar líneas 52–61 sin modificar)
}

export function cleanMarkdownToPlainText(mdText) {
  // ... (copiar líneas 63–85 sin modificar)
}

export function extractSections(content) {
  // ... (copiar líneas 87–113 sin modificar)
  // NOTA: extractSections usa preprocessContent internamente.
  // Como ahora están en el mismo archivo, no necesita import.
}
```

**Verify**: `node -e "import('./src/text.js').then(m => console.log(Object.keys(m).sort()))"`
muestra las 4 funciones.

### Step 3: Crear `src/scoring.js`

Crear `src/scoring.js` con `auditFile` (líneas 115–437). Necesita imports de
`fs` y de las funciones en `text.js` y `config.js`:

```javascript
import fs from 'fs';
import { preprocessContent } from './text.js';
import { MAX_PRONOUN_DENSITY } from './config.js';

export function auditFile(filepath, config, outputFormat = "text") {
  // ... (copiar líneas 115–437 sin modificar)
}
```

**Verify**: `node -e "import('./src/scoring.js').then(m => console.log(Object.keys(m)))"`
muestra `[ 'auditFile' ]`. Sin errores de import.

### Step 4: Crear `src/schema.js`

Crear `src/schema.js` con `generateSchemaData` e `injectSchema`
(líneas 500–704). Necesita imports de `fs`, `path`, y de `text.js`:

```javascript
import fs from 'fs';
import path from 'path';
import { preprocessContent, cleanMarkdownToPlainText, extractSections } from './text.js';

export function generateSchemaData(filepath, schemaType, config) {
  // ... (copiar líneas 500–636 sin modificar)
}

export function injectSchema(filepath, schemaType, config, dryRun = false) {
  // ... (copiar líneas 638–704 sin modificar, incluyendo la validación de
  // path del plan 004 y el parámetro dryRun del plan 005)
}
```

### Step 5: Crear `src/robots.js`

Crear `src/robots.js` con `checkRobots` (líneas 439–498):

```javascript
import fs from 'fs';

export function checkRobots(robotsPath) {
  // ... (copiar líneas 439–498 sin modificar)
}
```

### Step 6: Crear `src/index.js` (barrel file)

```javascript
export { loadConfig, MAX_PRONOUN_DENSITY } from './config.js';
export { calculateReadability, preprocessContent, cleanMarkdownToPlainText, extractSections } from './text.js';
export { auditFile } from './scoring.js';
export { generateSchemaData, injectSchema } from './schema.js';
export { checkRobots } from './robots.js';
```

**Verify**: `node -e "import('./src/index.js').then(m => console.log(Object.keys(m).sort()))"`
debe mostrar: `['MAX_PRONOUN_DENSITY', 'auditFile', 'calculateReadability', 'checkRobots', 'cleanMarkdownToPlainText', 'extractSections', 'generateSchemaData', 'injectSchema', 'loadConfig', 'preprocessContent']`.

### Step 7: Reemplazar `src/optimizer.js` con re-export desde el barrel

```javascript
export * from './index.js';
```

### Step 8: Actualizar `package.json`

Cambiar `"main": "src/optimizer.js"` a `"main": "src/index.js"`:

```json
"main": "src/index.js",
```

### Step 9: Ejecutar formateo

```bash
npx prettier --write src/
```

### Step 10: Verificaciones completas

```bash
npm run check
```

**Verify**: lint exit 0, format check exit 0, `npm test` todos pasan.

### Step 11: Verificar que los consumidores externos siguen funcionando

```bash
node -e "import('./src/optimizer.js').then(m => console.log('OK:', Object.keys(m).length, 'exports'))"
node -e "import('./src/index.js').then(m => console.log('OK:', Object.keys(m).length, 'exports'))"
```

Ambos deben mostrar `OK: 10 exports` (o el número actual).

### Step 12: Commit

```bash
git add src/config.js src/text.js src/scoring.js src/schema.js src/robots.js src/index.js src/optimizer.js package.json
git commit -m "refactor: split optimizer.js into domain modules

- Extract src/config.js (loadConfig, MAX_PRONOUN_DENSITY)
- Extract src/text.js (preprocessContent, cleanMarkdownToPlainText,
  extractSections, calculateReadability)
- Extract src/scoring.js (auditFile)
- Extract src/schema.js (generateSchemaData, injectSchema)
- Extract src/robots.js (checkRobots)
- Add src/index.js barrel file with all exports
- Update package.json main to src/index.js
- Backward compatible: src/optimizer.js re-exports from index.js

Co-Authored-By: Claude <noreply@anthropic.com>"
```

**Verify**: `git log --oneline -1` muestra el commit. `git status` clean.

## Test plan

Los tests existentes (`npm test`) deben pasar exactamente igual que antes.
No se añaden nuevos tests en este plan.

- Los tests importan desde `../src/optimizer.js`, que ahora es un re-export
  de `./index.js`. Verificar que la resolución de imports funciona.
- Si algún test usa import paths relativos internos, verificar que no se
  rompen (no deberían — los tests solo importan desde el barrel).

## Done criteria

- [ ] `src/config.js` existe con `loadConfig` y `MAX_PRONOUN_DENSITY`
- [ ] `src/text.js` existe con 4 funciones de procesamiento de texto
- [ ] `src/scoring.js` existe con `auditFile`
- [ ] `src/schema.js` existe con `generateSchemaData` y `injectSchema`
- [ ] `src/robots.js` existe con `checkRobots`
- [ ] `src/index.js` existe con re-exports de todos los módulos
- [ ] `src/optimizer.js` re-exporta desde `./index.js`
- [ ] `package.json` `"main"` apunta a `"src/index.js"`
- [ ] `npm run check` → exit 0 (lint + format + tests)
- [ ] `npm test` → todos pasan (mismo número que antes del refactor)
- [ ] `node -e "import('./src/index.js').then(...)"` muestra todos los exports
- [ ] Ningún import circular entre los nuevos módulos
- [ ] `git status` está clean
- [ ] `plans/README.md` status row actualizado a DONE

## STOP conditions

Stop and report back (do not improvise) if:

- `npm test` falla después de mover funciones a módulos separados. Causas
  probables: import circular, path relativo incorrecto, o variable no
  importada. Verificar imports de cada módulo.
- `extractSections` llama internamente a `preprocessContent`. En `text.js`
  ambas están en el mismo archivo, así que no necesita import. Si falla,
  verificar que `extractSections` no está en un archivo separado de
  `preprocessContent`.
- `injectSchema` usa `path` para la validación del plan 004. Verificar que
  `path` está importado en `schema.js`.
- Los tests importan de paths que ya no existen. Verificar que los imports
  en `tests/optimizer.test.js` resuelven a través de `optimizer.js` → `index.js`.
- `node:test` con ESM puede tener problemas de resolución de imports
  relativos con la nueva estructura. Si falla, probar con paths explícitos
  (extensión `.js`).

## Maintenance notes

- **Backward compatibility temporal**: `src/optimizer.js` se mantiene como
  re-export para no romper a consumidores externos. En una versión futura
  (v2.0.0), eliminar `src/optimizer.js` y actualizar todos los imports a
  `src/index.js`.
- **Los nuevos módulos tienen dependencias internas**: `scoring.js` importa de
  `text.js` y `config.js`. `schema.js` importa de `text.js`. Si se añaden más
  dependencias cruzadas en el futuro, considerar un diagrama de dependencias.
- **Funciones con side effects**: `auditFile`, `checkRobots`, e `injectSchema`
  aún llaman `console.log`/`console.error`/`process.exit`. Este plan solo
  reorganiza archivos; no aborda la separación de I/O y lógica. Eso sería
  un plan futuro (post-007).
