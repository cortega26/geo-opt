# Plan 004: Hardening de seguridad para `injectSchema`

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

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/001-git-and-tooling.md
- **Category**: security
- **Planned at**: 2025-06-25 (no git SHA — project not yet initialized)

## Why this matters

Dos vulnerabilidades en `injectSchema` exponen a usuarios a riesgo:

1. **Path traversal**: `injectSchema` escribe en cualquier `filepath` que el
   usuario provea, sin validar que esté dentro del directorio de trabajo.
   Si esta herramienta se integra en un pipeline o servidor web en el futuro,
   un path como `../../etc/cron.d/malicious` podría sobreescribir archivos
   del sistema.
2. **Inyección de HTML sin sanitización**: el campo `signature` del archivo
   de configuración se inyecta directamente en `<div>` HTML y en markdown.
   Si el config es modificado por un atacante (o un usuario copia un config
   malicioso de internet), se puede inyectar `<script>` tags u otro HTML
   activo en cada archivo procesado.

Ambos fixes son preventivos (el contexto actual es CLI, el usuario controla
sus archivos), pero la ausencia total de defensas convierte la herramienta en
un vector de ataque si su uso evoluciona.

## Current state

### SEC-01: Sin validación de path (`src/optimizer.js:638-704`)

```javascript
// Línea 638-644 — injectSchema recibe filepath sin validar
export function injectSchema(filepath, schemaType, config) {
  if (!fs.existsSync(filepath)) {
    console.error(`Error: File ${filepath} not found.`);
    process.exit(1);
  }

  // ... generation logic ...

  // Línea 699 — escritura directa sin validación de directorio
  fs.writeFileSync(filepath, content, { encoding: 'utf8' });
}
```

No hay `path.resolve()`, no hay verificación de que el path resuelto esté
dentro de `process.cwd()`. La herramienta escribe donde el usuario diga.

### SEC-02: Signature inyectado sin sanitización (`src/optimizer.js:662-669`)

```javascript
// Líneas 662-669 — signature del config se concatena directamente
if (signature) {
  const sigRaw = signature.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  if (!content.includes(sigRaw)) {
    sigMd = `\n\n${signature}\n`;
    sigHtml = `\n<div class="geo-signature"><p>${signature}</p></div>\n`;
  }
}
```

El valor `config.signature` se inyecta sin escapar. Si contiene `</p><script>alert(1)</script><p>`,
eso se escribe literal en el HTML de salida.

### Convenciones del proyecto

- Patrón de error: `console.error` + `process.exit(1)`
- `path` ya está importado en `src/optimizer.js:2` (`import path from 'path'`)
- La CLI es interactiva y de confianza, pero el módulo exportado podría usarse
  programáticamente por terceros.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Full check | `npm run check` | exit 0 |
| Node tests | `npm test` | N pass, 0 fail |
| Quick test path validation | `node -e "const p=require('path'); const r=p.resolve('/tmp/test.txt'); console.log(p.relative('/tmp', r))"` | `test.txt` |

## Scope

**In scope** (archivo a modificar):
- `src/optimizer.js` — añadir validación en `injectSchema` (SEC-01) +
  sanitización del signature (SEC-02)

**Out of scope** (no tocar):
- `bin/cli.js` — sin cambios
- `tests/optimizer.test.js` — si el plan 003 ya existe, los tests de HTML
  injection deben seguir pasando sin cambios
- `.agents/skills/geo-optimization/scripts/geo_optimizer.py` — la versión
  Python tiene los mismos problemas, pero el plan 006 decide su futuro
- `geo_config.json` — no modificar el signature actual (es benigno)

## Git workflow

- Branch: `advisor/004-security-inject` (crear desde `advisor/001-git-and-tooling`
  o desde `main`/`master`)
- Commits: un commit con ambos fixes
- Formato de mensaje: `fix: <descripción>`

## Steps

### Step 1: Añadir validación de path traversal en `injectSchema`

Al inicio de `injectSchema`, después de verificar que el archivo existe
(líneas 639-642), añadir validación de que el path resuelto está dentro de
`process.cwd()`:

```javascript
export function injectSchema(filepath, schemaType, config) {
  if (!fs.existsSync(filepath)) {
    console.error(`Error: File ${filepath} not found.`);
    process.exit(1);
  }

  // SEC-01: Validate path is within working directory
  const resolvedPath = path.resolve(filepath);
  const cwd = path.resolve(process.cwd());
  if (!resolvedPath.startsWith(cwd + path.sep) && resolvedPath !== cwd) {
    console.error(`Error: Security restriction — target file ${filepath} is outside the current working directory.`);
    process.exit(1);
  }

  const schema = generateSchemaData(filepath, schemaType, config);
  // ... resto del código sin cambios ...
```

**Verify**: `grep -A4 "SEC-01" src/optimizer.js` muestra la validación.
`node -e "const p=require('path'); console.log('/tmp/x'.startsWith('/tmp' + p.sep))"`
imprime `true`.

### Step 2: Añadir sanitización del signature

Reemplazar el bloque de líneas 662-669 con una versión que valide el signature:

```javascript
  let sigMd = "";
  let sigHtml = "";

  if (signature) {
    // SEC-02: Validate signature format — only allow markdown link syntax [text](https://url)
    const sigPattern = /^\[([^\]]+)\]\((https?:\/\/[^\)]+)\)$/;
    if (!sigPattern.test(signature)) {
      console.error(`Error: Security restriction — signature must be a markdown link: [text](https://url). Got: ${signature}`);
      process.exit(1);
    }

    // Check if signature is already present by stripping markdown link markers
    const sigRaw = signature.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
    if (!content.includes(sigRaw)) {
      const escapedText = signature
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

      sigMd = `\n\n${signature}\n`;
      // For HTML, use the escaped version to prevent XSS
      sigHtml = `\n<div class="geo-signature"><p>${escapedText}</p></div>\n`;
    }
  }
```

**Verify**: `grep -B2 -A10 "SEC-02" src/optimizer.js` muestra la validación
del patrón y el escapado HTML.

### Step 3: Ejecutar formateo

```bash
npx prettier --write src/optimizer.js
```

**Verify**: `npx prettier --check src/optimizer.js` → sin diferencias.

### Step 4: Ejecutar verificaciones

```bash
npm run check
```

**Verify**: lint exit 0, format check exit 0, `npm test` todos pasan.

### Step 5: Verificar que el signature existente en `geo_config.json` sigue siendo aceptado

```bash
node -e "
const sig = 'Optimized by [Tooltician](https://www.tooltician.com)';
const sigPattern = /^\[([^\]]+)\]\((https?:\/\/[^\)]+)\)$/;
console.log('Valid:', sigPattern.test(sig));
"
```

**Verify**: imprime `Valid: true`. El signature actual del proyecto pasa la
validación.

### Step 6: Commit

```bash
git add src/optimizer.js
git commit -m "fix: add path traversal guard and signature sanitization to injectSchema

- Validate target path is within cwd before writing (path traversal)
- Restrict signature config to markdown link format [text](https://url)
- HTML-escape signature content in HTML injection path (XSS prevention)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

**Verify**: `git log --oneline -1` muestra el commit. `git status` clean.

## Test plan

Este plan no añade nuevos tests (los tests de `injectSchema` están en el plan
003). Verificaciones manuales:

1. **Path válido**: `node bin/cli.js inject tests/temp_test.md article` debe
   funcionar (archivo dentro de cwd).
2. **Path traversal**: `node bin/cli.js inject ../../etc/passwd article` debe
   fallar con "Security restriction — target file ... is outside the current
   working directory."
3. **Signature válido**: con el config por defecto, `node bin/cli.js inject
   tests/temp_test.md article` debe inyectar el signature de Tooltician.
4. **Signature inválido**: con un config que tenga `"signature": "<script>alert(1)</script>"`,
   el comando debe fallar con "Security restriction — signature must be a
   markdown link".

## Done criteria

- [ ] `grep "startsWith(cwd + path.sep)" src/optimizer.js` encuentra la validación
- [ ] `grep "sigPattern" src/optimizer.js` encuentra la validación del signature
- [ ] `grep "escapedText" src/optimizer.js` encuentra el escapado HTML
- [ ] El signature actual del proyecto (`Optimized by [Tooltician](https://www.tooltician.com)`)
  pasa la validación del regex
- [ ] `npm run check` → exit 0
- [ ] `npm test` → todos pasan
- [ ] `git status` está clean
- [ ] `plans/README.md` status row actualizado a DONE

## STOP conditions

Stop and report back (do not improvise) if:

- La verificación de path `startsWith` no funciona correctamente en Windows
  (si se ejecuta en Windows, `path.sep` es `\` y la lógica de prefijos
  puede diferir — reportar el SO).
- El signature actual en `geo_config.json` o `.agents/skills/geo-optimization/geo_config.json`
  no coincide con el patrón `[text](url)` — si el usuario tiene un signature
  personalizado, la validación lo rechazará. Reportar el valor actual.
- `npm test` falla después de los cambios — posiblemente porque el test de
  `injectSchema` usa un config con un signature que no cumple el nuevo patrón.
  Si el config de test tiene un signature válido, no debería fallar.
- El código en `src/optimizer.js:638-704` no coincide con los excerpts en
  "Current state" (el código ha cambiado desde que se escribió este plan).

## Maintenance notes

- **Path validation**: la verificación `startsWith(cwd + path.sep)` asume
  sistema de archivos Unix-like con separador `/`. En Windows, `path.sep` es
  `\`, lo que requiere testing adicional. Si el proyecto debe soportar Windows,
  considerar usar `path.relative()` en lugar de `startsWith`: verificar que
  `path.relative(cwd, resolvedPath)` no empiece con `..`.
- **Signature format**: el patrón `[text](url)` es restrictivo pero seguro.
  Si en el futuro se necesita soportar texto sin links o HTML formateado,
  reconsiderar esta validación. El trade-off actual prioriza seguridad sobre
  flexibilidad.
- **Coordinación con plan 006**: si el plan 006 decide mantener la versión
  Python, estos mismos fixes deben aplicarse a `geo_optimizer.py:568-628`.
  Este plan deliberadamente no toca Python.
