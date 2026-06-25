# Plan 008: CLI modernization + batch audit + enhanced statistics detection

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat HEAD -- bin/cli.js src/scoring.js src/text.js src/schema.js`
> Si los archivos cambiaron desde que se escribió este plan, compara los
> excerpts de "Current state" contra el código real antes de proceder; en caso
> de discrepancia, trata como STOP condition.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/005-features-v1.1.md, plans/007-split-god-module.md
- **Category**: direction
- **Planned at**: 2025-06-25 (no git SHA — project not yet initialized)

## Why this matters

Tres mejoras que cierran brechas entre lo que la herramienta promete y lo que
entrega:

1. **CLI modernization**: `bin/cli.js` usa parseo manual de `process.argv`
   con `indexOf` y `splice` que es frágil, no soporta `--help` por comando,
   y es difícil de extender. Cambiar a `util.parseArgs()` (built-in de Node.js
   18.3+) unifica la experiencia con la versión Python que ya usa `argparse`.
2. **Batch audit**: La herramienta solo acepta un archivo a la vez. Equipos con
   docenas de páginas deben escribir wrappers. Soportar múltiples archivos
   (el shell expande globs) habilita auditorías de sitio completo sin perder
   el claim "zero-dependency".
3. **Enhanced statistics detection**: El regex actual (`src/scoring.js:209`
   post-plan-007) no detecta estadísticas verbales ("one third", "double",
   "3 out of 4") que son comunes en contenido bien escrito pero menos denso
   en números. Esto produce falsos negativos.

## Current state

### CLI manual parsing (`bin/cli.js:26-89`)

```javascript
async function main() {
  const args = process.argv.slice(2);
  // ...
  let configPath = null;
  const configIndex = args.indexOf('--config');
  if (configIndex !== -1 && configIndex < args.length - 1) {
    configPath = args[configIndex + 1];
    args.splice(configIndex, 2);
  }

  const command = args[0];
  const cmdArgs = args.slice(1);

  // Cada comando con su propio parseo manual de flags...
  const formatIndex = cmdArgs.indexOf('--format');
  // ... etc.
}
```

### Audit acepta un solo filepath (`bin/cli.js:47`)

```javascript
const filepath = cmdArgs[0];
if (!filepath) {
  console.error("Error: Missing file path for audit command.");
  process.exit(1);
}
// ... solo procesa un archivo
```

### Statistics regex actual (`src/optimizer.js:209` — estará en `src/scoring.js` post-plan-007)

```javascript
const statMatches = textContent.match(
  /\b\d+(?:\.\d+)?%|\$\d+(?:\.\d+)?[kKmMbB]?|\b\d+(?:\.\d+)?[xX]\b|\b\d{2,}(?:,\d{3})*(?:\.\d+)?\b/g
) || [];
```

Esto detecta: porcentajes (`34%`), monedas (`$24M`), multiplicadores (`3.2x`),
números grandes (`10,000`). Pero NO detecta: "one third", "double", "half",
"three out of four", "1 in 5", "two-thirds".

### Convenciones del proyecto

- ESM, `import`/`export`
- `console.error` + `process.exit(1)` para errores
- `console.log` para output
- El proyecto valora "zero-dependency", así que `util.parseArgs` (built-in)
  es la opción correcta, no `commander`/`yargs`

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Full check | `npm run check` | exit 0 |
| Node tests | `npm test` | N pass, 0 fail |
| Test CLI help | `node bin/cli.js --help` | exit 0, muestra ayuda |
| Test batch | `node bin/cli.js audit file1.md file2.md --format json` | exit 0, output JSON array |

## Scope

**In scope** (archivos a modificar):
- `bin/cli.js` — reescribir con `util.parseArgs`; añadir soporte multi-file
  para audit; añadir `--help` por comando
- `src/scoring.js` — añadir detección de estadísticas verbales (post-plan-007)
- `src/text.js` — añadir helper `tokenizeWords` para detección verbal
  (post-plan-007)
- `tests/optimizer.test.js` — añadir un test para estadísticas verbales

**Out of scope** (no tocar):
- `src/config.js`, `src/schema.js`, `src/robots.js` — sin cambios
- `.agents/skills/geo-optimization/scripts/geo_optimizer.py` — sin cambios
- `--format html` (DIR-05 del audit) — no se implementa en este plan
- Salida agregada de batch (median, min, max) — solo JSON array de resultados
  individuales para mantener el scope acotado

## Git workflow

- Branch: `advisor/008-modernization`
- Commits: uno por feature (CLI modernization, batch, enhanced stats)
- Formato de mensaje: `feat:` o `refactor:` según corresponda

## Steps

### Step 1: Reescribir `bin/cli.js` con `util.parseArgs`

Reemplazar el parseo manual con `util.parseArgs`. La estructura nueva:

```javascript
#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { auditFile, checkRobots, generateSchemaData, injectSchema, loadConfig } from '../src/index.js';
import fs from 'fs';

function printHelp(command = null) {
  if (command === 'audit') {
    console.log(`
geo-opt audit <file...> [options]

Audit content for GEO optimization score.

Options:
  --config <path>     Path to geo_config.json
  --format <type>     Output format: text (default) or json
  --threshold <n>     Exit with code 1 if score is below n
  -f, -t              Short forms of --format, --threshold

Example:
  geo-opt audit post.md --format json --threshold 70
`);
  } else if (command === 'inject') {
    console.log(`
geo-opt inject <file> <type> [options]

Generate and inject JSON-LD schema into file.

Options:
  --config <path>     Path to geo_config.json
  --dry-run           Preview changes without writing
  --backup            Create .bak file before modifying

Example:
  geo-opt inject post.md article --dry-run
`);
  } else {
    console.log(`
geo-opt — Generative Engine Optimization CLI

Commands:
  audit    <file...>     Audit content for GEO score
  schema   <file> <type>  Generate JSON-LD schema (article|faq|product)
  inject   <file> <type>  Inject schema into file (article|faq|product)
  robots   <file>         Audit robots.txt for AI crawler rules

Options:
  --config <path>         Path to geo_config.json
  --help                  Show this help

Run 'geo-opt <command> --help' for command-specific options.
`);
  }
}

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    printHelp();
    process.exit(0);
  }

  const command = args[0];
  const rest = args.slice(1);

  // Extraer --config globalmente
  let configPath = null;
  const configLong = rest.indexOf('--config');
  if (configLong !== -1 && configLong < rest.length - 1) {
    configPath = rest[configLong + 1];
  }

  const { config } = loadConfig(configPath);

  switch (command) {
    case 'audit': {
      if (rest.length === 0 || rest[0].startsWith('-')) {
        if (rest[0] === '--help' || rest[0] === '-h') {
          printHelp('audit');
          process.exit(0);
        }
        console.error("Error: Missing file path for audit command.");
        process.exit(1);
      }

      // Separar filepaths de flags
      const filepaths = [];
      let format = 'text';
      let threshold = null;
      let i = 0;

      while (i < rest.length) {
        const arg = rest[i];
        if (arg === '--format' || arg === '-f') {
          format = rest[++i];
        } else if (arg === '--threshold' || arg === '-t') {
          threshold = parseInt(rest[++i], 10);
        } else if (arg === '--config') {
          i++; // ya procesado arriba
        } else if (!arg.startsWith('-')) {
          filepaths.push(arg);
        }
        i++;
      }

      if (filepaths.length === 0) {
        console.error("Error: Missing file path for audit command.");
        process.exit(1);
      }

      const results = [];
      for (const fp of filepaths) {
        const score = auditFile(fp, config, format);
        results.push({ file: fp, score });
      }

      // Batch threshold check
      if (threshold !== null && !isNaN(threshold)) {
        const failures = results.filter(r => r.score < threshold);
        if (failures.length > 0) {
          console.error(`\nThreshold not met for ${failures.length} file(s):`);
          for (const f of failures) {
            console.error(`  ${f.file}: ${f.score}/100 (threshold: ${threshold})`);
          }
          process.exit(1);
        }
        console.log(`\nAll ${results.length} file(s) meet threshold ${threshold}/100.`);
      }

      break;
    }

    case 'robots': {
      const filepath = rest.find(a => !a.startsWith('-'));
      if (!filepath) {
        console.error("Error: Missing file path for robots command.");
        process.exit(1);
      }
      checkRobots(filepath);
      break;
    }

    case 'schema': {
      const positional = rest.filter(a => !a.startsWith('-') && a !== configPath);
      const filepath = positional[0];
      const type = positional[1];
      if (!filepath || !type) {
        console.error("Error: Missing arguments. Usage: schema <file> <type>");
        process.exit(1);
      }
      const schema = generateSchemaData(filepath, type, config);
      console.log(JSON.stringify(schema, null, 2));
      break;
    }

    case 'inject': {
      const positional = rest.filter(a => !a.startsWith('-') && a !== configPath);
      const filepath = positional[0];
      const type = positional[1];
      if (!filepath || !type) {
        console.error("Error: Missing arguments. Usage: inject <file> <type>");
        process.exit(1);
      }
      const dryRun = rest.includes('--dry-run');
      const backup = rest.includes('--backup');

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
      break;
    }

    case '--help':
    case '-h':
      printHelp();
      process.exit(0);

    default:
      console.error(`Error: Unknown command "${command}"`);
      printHelp();
      process.exit(1);
  }
}

main();
```

**Verify**: `node bin/cli.js --help` muestra ayuda general.
`node bin/cli.js audit --help` muestra ayuda del comando audit.
`node bin/cli.js inject --help` muestra ayuda del comando inject.

### Step 2: Verificar que el CLI refactorizado funciona

```bash
echo "# Test" > /tmp/test_geo.md
node bin/cli.js audit /tmp/test_geo.md 2>&1; echo "EXIT: $?"
node bin/cli.js audit /tmp/test_geo.md --format json 2>&1 | head -5
node bin/cli.js audit /tmp/test_geo.md --threshold 100 2>&1; echo "EXIT: $?"
node bin/cli.js schema /tmp/test_geo.md article 2>&1 | head -5
node bin/cli.js robots /tmp/test_geo.md 2>&1
rm /tmp/test_geo.md
```

**Verify**: audit funciona (exit 0, muestra reporte), `--threshold 100` falla
(exit 1), schema genera JSON, robots detecta que no es un robots.txt válido
(exit 1 con mensaje de error).

### Step 3: Test batch audit

```bash
echo "# File 1" > /tmp/test1.md
echo "# File 2" > /tmp/test2.md
node bin/cli.js audit /tmp/test1.md /tmp/test2.md --threshold 0 2>&1; echo "EXIT: $?"
rm /tmp/test1.md /tmp/test2.md
```

**Verify**: exit 0, se muestran dos reportes (o dos líneas de threshold met).

### Step 4: Añadir detección de estadísticas verbales en `src/scoring.js`

Después del paso 3, añadir una segunda pasada de detección en `auditFile`,
inmediatamente después de la detección numérica actual (alrededor de la
línea 217 del scoring original, post-plan-007):

```javascript
  // Enhanced: detect verbal/non-numeric statistics
  const verbalStats = [
    // Fractions
    /\b(?:one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:-|—)\s*(?:third|quarter|fifth|sixth|seventh|eighth|ninth|tenth)s?\b/gi,
    /\b(?:one|two|three|four|five)\s*-?\s*(?:third|quarter|fifth)s?\b/gi,
    // Proportional phrases
    /\b\d+\s*(?:out\s*of|in)\s*\d+\b/gi,
    // Multiplier words
    /\b(?:double|triple|quadruple|half|twice)\b/gi,
    // Percentage words
    /\b(?:majority|minority|plurality)\b/gi,
  ];

  let verbalCount = 0;
  const verbalMatches = [];
  for (const pattern of verbalStats) {
    const matches = textContent.match(pattern) || [];
    verbalCount += matches.length;
    if (matches.length > 0) {
      verbalMatches.push(...matches.slice(0, 3));
    }
  }

  const totalStatCount = statCount + verbalCount;
  // Replace statCount with totalStatCount in the scoring logic below
```

Y ajustar la lógica de scoring para usar `totalStatCount` en lugar de
`statCount`:

```javascript
  if (totalStatCount >= 3) {
    statsScore = 20;
    statsBreakdown = `High density (${totalStatCount} stats found: ${filteredStats.slice(0, 3).join(', ')}${verbalMatches.length > 0 ? ', ' + verbalMatches.slice(0, 3).join(', ') : ''}...) (+20 pts)`;
  } else if (totalStatCount > 0) {
    statsScore = 10;
    statsBreakdown = `Moderate density (${totalStatCount} stats found) (+10 pts)`;
  } else {
    statsBreakdown = "No statistics or numerical evidence found (+0 pts)";
  }
```

**Verify**: `grep "verbalStats\|totalStatCount" src/scoring.js` muestra los
patrones nuevos y la variable.

### Step 5: Añadir test de estadísticas verbales

En `tests/optimizer.test.js`, añadir:

```javascript
test('auditFile detects verbal statistics as data points', () => {
  const tempFile = path.join(__dirname, 'temp_verbal.md');
  fs.writeFileSync(tempFile, `# Report

Hybrid cloud adoption is an enterprise IT strategy. It delivers significant benefits.

One third of enterprises report cost reductions. Double the efficiency of legacy setups.
Three out of four IT managers recommend the approach.
  `, { encoding: 'utf8' });

  try {
    const score = auditFile(tempFile, config, "json");
    // Con "one third", "double", "three out of four" debería tener score > 0
    // en la categoría de estadísticas
    assert.ok(typeof score === 'number');
    assert.ok(score > 0);
  } finally {
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
  }
});
```

**Verify**: `npm test` → N+1 pass, 0 fail (donde N es el número previo de tests).

### Step 6: Ejecutar formateo

```bash
npx prettier --write src/scoring.js bin/cli.js tests/optimizer.test.js
```

### Step 7: Verificaciones finales

```bash
npm run check
```

**Verify**: lint exit 0, format check exit 0, `npm test` todos pasan.

### Step 8: Commit

```bash
git add bin/cli.js src/scoring.js tests/optimizer.test.js
git commit -m "feat: CLI modernization, batch audit, and enhanced verbal statistics

- Rewrite CLI with per-command --help and cleaner flag parsing
- Support multiple file paths for audit command (batch mode)
- Add verbal/non-numeric statistics detection (fractions, multipliers,
  proportional phrases)
- Add test for verbal statistics scoring

Co-Authored-By: Claude <noreply@anthropic.com>"
```

**Verify**: `git log --oneline -1` muestra el commit. `git status` clean.

## Test plan

| Test | Comando | Esperado |
|------|---------|----------|
| Help general | `node bin/cli.js --help` | Muestra todos los comandos |
| Help comando | `node bin/cli.js audit --help` | Muestra opciones de audit |
| Audit simple | `node bin/cli.js audit file.md` | exit 0, muestra reporte |
| Audit JSON | `node bin/cli.js audit file.md --format json` | exit 0, JSON válido |
| Threshold fail | `node bin/cli.js audit file.md --threshold 100` | exit 1 |
| Threshold pass | `node bin/cli.js audit file.md --threshold 0` | exit 0 |
| Batch audit | `node bin/cli.js audit f1.md f2.md --threshold 0` | exit 0 |
| Dry run | `node bin/cli.js inject file.md article --dry-run` | No modifica archivo |
| Backup | `node bin/cli.js inject file.md article --backup` | Crea .bak |
| Verbal stats test | `npm test -- --test-name-pattern="verbal"` | 1 test nuevo pasa |

## Done criteria

- [ ] `node bin/cli.js --help` muestra ayuda general con todos los comandos
- [ ] `node bin/cli.js audit --help` muestra opciones específicas de audit
- [ ] `node bin/cli.js audit file1.md file2.md` procesa ambos archivos
- [ ] `grep "verbalStats" src/scoring.js` muestra los nuevos patrones
- [ ] `grep "totalStatCount" src/scoring.js` muestra la variable combinada
- [ ] `node bin/cli.js audit file.md --threshold 0` → exit 0
- [ ] `node bin/cli.js audit file.md --threshold 999` → exit 1
- [ ] `npm run check` → exit 0
- [ ] `npm test` → todos pasan, incluyendo test de estadísticas verbales
- [ ] `git status` está clean
- [ ] `plans/README.md` status row actualizado a DONE

## STOP conditions

Stop and report back (do not improvise) if:

- `util.parseArgs` no está disponible en la versión de Node.js. Mínimo
  requerido: Node.js 18.3.0. Verificar con `node -e "console.log(process.version)"`.
- El CLI refactorizado no es backward-compatible: flags que funcionaban antes
  deben seguir funcionando. Verificar `--config`, `--format`, `-f`, `--threshold`,
  `-t`, `--dry-run`, `--backup`.
- La detección de estadísticas verbales produce demasiados falsos positivos
  en los tests existentes. Si un test existente espera un score específico
  y el nuevo patrón lo cambia, reportar el test y el delta de score.
- `npm test` falla después de los cambios en `scoring.js`.
- El batch audit con archivos que no existen debe fallar con un mensaje claro.
  Verificar: `node bin/cli.js audit existe.md noexiste.md 2>&1; echo $?`.

## Maintenance notes

- **`util.parseArgs`**: disponible desde Node.js 18.3.0. No es un dependency
  externo — es parte de la stdlib de Node.js. La API es estable desde Node 20.
- **Estadísticas verbales**: los patrones actuales detectan inglés solamente.
  Si el proyecto necesita soporte multi-idioma, los patrones deben
  externalizarse a un archivo de configuración.
- **Posibles falsos positivos verbales**: "first of all" no es una estadística,
  pero "first" no está en los patrones (solo "one", "two", etc.). "double"
  podría aparecer en contextos no estadísticos ("double-click"). Monitorear
  la precisión en uso real.
- **Batch output**: actualmente cada archivo produce su propio bloque de
  output (texto o JSON). En JSON, los resultados no están envueltos en un
  array — cada `auditFile` imprime su propio objeto JSON. Si se necesita
  un JSON array agregado, eso requiere refactorizar `auditFile` para retornar
  datos en lugar de imprimir (fuera del scope de este plan).
