# Plan 016: Aumentar cobertura de tests del CLI al 80%+

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 4dff240..HEAD -- bin/cli.js tests/optimizer.test.js`
> Si alguno de estos archivos cambió desde que este plan fue escrito, compara
> los fragmentos en "Current state" contra el código real; si hay divergencia,
> trátalo como STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `4dff240`, 2026-06-26

## Why this matters

`bin/cli.js` tiene **61.02%** de cobertura de líneas (185 de 567 líneas sin cubrir). Es el punto de entrada principal del producto; los usuarios interactúan con `geo-opt` a través de este archivo. Los caminos no cubiertos son mayoritariamente **manejo de errores**: archivos no encontrados, formatos inválidos, thresholds malformados, fallos de escritura, etc. Estos son precisamente los caminos donde un bug tiene mayor impacto (pérdida de datos, salidas confusas, falsos éxitos). Subir la cobertura al 80%+ agrega ~10 tests que ejercitan estos caminos de error, convirtiendo bugs silenciosos en fallos de test ruidosos.

## Current state

- `bin/cli.js` — 567 líneas, CLI basado en commander. Usa `spawnSync` en tests para testing de integración.
- `tests/optimizer.test.js` — 1385 líneas, 59 tests. Usa `spawnSync(process.execPath, [cliPath, ...])` para tests CLI.
- `npm run test:coverage` — usa `c8` para reporte de cobertura.
- Convención de tests CLI: crear archivos temporales con `fs.mkdtempSync`, ejecutar `spawnSync`, verificar `status`, `stdout`, `stderr`, limpiar con `fs.rmSync`.

Líneas no cubiertas de `bin/cli.js` según el reporte de coverage (abreviado):

| Líneas | Path no cubierto |
|--------|-----------------|
| 56-60 | `audit` sin archivos y sin `--recursive` → error |
| 64-67 | `--format` inválido |
| 86-93 | `discoverFiles` lanza error en `audit` |
| 99-101 | `discoverFiles` retorna 0 archivos |
| 107 | `--summary` sin `--format json` |
| 122-124 | Batch errors en output text |
| 157-170 | Threshold failures |
| 260-261 | `discoverFiles` error en `llmstxt generate` |
| 264-266 | 0 archivos en `llmstxt generate` |
| 275-316 | Procesamiento de entries en `llmstxt generate` |
| 364-369 | File processing errors en `llmstxt generate` |
| 381-382 | Archivo no encontrado en `llmstxt audit` |
| 388-397 | Coverage check falla en `llmstxt audit` |
| 455-460 | `--no-branding` sin entitlement |
| 478-484 | `discoverFiles` error en `inject --recursive` |
| 482-484 | 0 archivos en `inject --recursive` |
| 491-503 | `inject` single-file con `--backup` |
| 511-513 | `batchInject` errors en `inject` |
| 539-540 | `config` con argumentos inválidos |
| 548-551 | `config set` con valor que no es true/false |

Ejemplo de test CLI existente para referencia (`tests/optimizer.test.js:523-545`):

```javascript
test("CLI rejects explicitly malformed config files", () => {
  const tempFile = path.join(__dirname, "temp_bad_config_target.md");
  const configFile = path.join(__dirname, "temp_bad_config.json");
  fs.writeFileSync(tempFile, "# Target\n\nBody text.\n", { encoding: "utf8" });
  fs.writeFileSync(configFile, "{ invalid json", { encoding: "utf8" });

  try {
    const result = spawnSync(
      process.execPath,
      [cliPath, "audit", tempFile, "--config", configFile],
      { cwd: repoRoot, encoding: "utf8" }
    );
    assert.strictEqual(result.status, 1);
    assert.match(result.stderr, /Failed to parse config/);
    assert.strictEqual(result.stdout, "");
  } finally {
    for (const file of [tempFile, configFile]) {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
    }
  }
});
```

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Full check | `npm run check` | exit 0, all tests pass |
| JS tests only | `npm test` | all tests pass |
| Coverage | `npm run test:coverage` | coverage report, `bin/cli.js` ≥ 80% |
| Coverage (only new tests) | `node --test --test-name-pattern="CLI" tests/optimizer.test.js` | matching tests pass |
| Lint | `npm run lint` | exit 0 |
| Format check | `npm run format:check` | exit 0 |

## Scope

**In scope** (the only files you should modify):
- `tests/optimizer.test.js` — agregar nuevos tests CLI

**Out of scope** (do NOT touch):
- `bin/cli.js` — no modificar el código del CLI (solo agregar tests)
- `src/` — no modificar código fuente
- Python tests

## Git workflow

- Branch: `advisor/016-increase-cli-test-coverage`
- Commit: `test: add CLI coverage for error paths in audit, inject, llmstxt, and config`
- Sigue el estilo de commits del repo.
- No hagas push ni abras PR a menos que se te indique explícitamente.

## Steps

### Step 1: Agregar tests para `audit` — caminos de error

Agrega los siguientes tests en `tests/optimizer.test.js`, después del test `CLI audit --summary produces aggregate report` (aproximadamente línea 1161):

**Test A: `CLI audit without files and without --recursive exits with error`**

```javascript
test("CLI audit without files and without --recursive exits with error", () => {
  const result = spawnSync(
    process.execPath,
    [cliPath, "audit"],
    { cwd: repoRoot, encoding: "utf8" }
  );
  assert.strictEqual(result.status, 1);
  assert.match(result.stderr, /Missing file path/);
});
```

**Test B: `CLI audit with invalid --format exits with error`**

```javascript
test("CLI audit with invalid --format exits with error", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "geo-test-"));
  const testFile = path.join(tmpDir, "test.md");
  fs.writeFileSync(testFile, "# Test\n\nContent.\n");
  try {
    const result = spawnSync(
      process.execPath,
      [cliPath, "audit", testFile, "--format", "xml"],
      { cwd: repoRoot, encoding: "utf8" }
    );
    assert.strictEqual(result.status, 1);
    assert.match(result.stderr, /--format must be/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
```

**Test C: `CLI audit with invalid --threshold exits with error`**

```javascript
test("CLI audit with invalid --threshold exits with error", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "geo-test-"));
  const testFile = path.join(tmpDir, "test.md");
  fs.writeFileSync(testFile, "# Test\n\nContent.\n");
  try {
    const result = spawnSync(
      process.execPath,
      [cliPath, "audit", testFile, "--threshold", "abc"],
      { cwd: repoRoot, encoding: "utf8" }
    );
    assert.strictEqual(result.status, 1);
    assert.match(result.stderr, /--threshold must be an integer/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
```

**Test D: `CLI audit with --summary without --format json shows text summary`**

```javascript
test("CLI audit --summary without --format json shows text summary", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "geo-test-"));
  try {
    fs.writeFileSync(
      path.join(tmpDir, "a.md"),
      "# A\n\nIntro paragraph with over forty words of content to score properly here.\n"
    );
    const result = spawnSync(
      process.execPath,
      [cliPath, "audit", tmpDir, "--recursive", "--summary"],
      { cwd: repoRoot, encoding: "utf8" }
    );
    // --summary sin --format json debe mostrar salida en texto y exit 0
    assert.strictEqual(result.status, 0, result.stderr);
    assert.ok(
      result.stdout.includes("SITE SUMMARY") || result.stdout.includes("GEO OPTIMIZATION"),
      "Should output text report"
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
```

**Verifica**: `node --test --test-name-pattern="CLI audit" tests/optimizer.test.js` → todos los tests CLI audit pasan.

### Step 2: Agregar test para `inject` — `--backup`

**Test E: `CLI inject --backup creates .bak file`**

```javascript
test("CLI inject --backup creates .bak file", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "geo-test-"));
  const testFile = path.join(tmpDir, "original.md");
  const backupFile = testFile + ".bak";
  fs.writeFileSync(testFile, "# Original\n\nContent here.\n");
  try {
    const result = spawnSync(
      process.execPath,
      [cliPath, "inject", testFile, "article", "--backup"],
      { cwd: repoRoot, encoding: "utf8" }
    );
    assert.strictEqual(result.status, 0, result.stderr);
    assert.ok(fs.existsSync(backupFile), "Backup file should exist");
    assert.strictEqual(
      fs.readFileSync(backupFile, "utf8"),
      "# Original\n\nContent here.\n"
    );
    // El archivo original debe haber sido modificado (contiene schema)
    assert.ok(
      fs.readFileSync(testFile, "utf8").includes("```json"),
      "Original should contain injected schema"
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
```

**Verifica**: `node --test --test-name-pattern="CLI inject --backup" tests/optimizer.test.js` → el test pasa.

### Step 3: Agregar tests para `llmstxt`

**Test F: `CLI llmstxt audit with missing file exits with error`**

```javascript
test("CLI llmstxt audit with missing file exits with error", () => {
  const result = spawnSync(
    process.execPath,
    [cliPath, "llmstxt", "audit", "/nonexistent/llms.txt"],
    { cwd: repoRoot, encoding: "utf8" }
  );
  assert.strictEqual(result.status, 1);
  assert.match(result.stderr, /not found/);
});
```

**Test G: `CLI llmstxt audit --recursive reports coverage`**

```javascript
test("CLI llmstxt audit --recursive reports coverage", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "geo-test-"));
  try {
    // Crear un llms.txt que lista solo una de dos páginas
    const llmsContent = `# Test Site

> A test.

## Pages

- [Home](https://example.com/): The homepage.
`;
    fs.writeFileSync(path.join(tmpDir, "llms.txt"), llmsContent);
    fs.writeFileSync(
      path.join(tmpDir, "index.md"),
      "# Home\n\nWelcome to the test site with enough words for description.\n"
    );
    fs.writeFileSync(
      path.join(tmpDir, "about.md"),
      "# About\n\nAbout page with enough words here for description text.\n"
    );

    const result = spawnSync(
      process.execPath,
      [cliPath, "llmstxt", "audit", path.join(tmpDir, "llms.txt"), "--recursive"],
      { cwd: tmpDir, encoding: "utf8" }
    );
    // Debe reportar que hay archivos no listados
    assert.ok(
      result.stdout.includes("Missing") || result.stderr.includes("not listed"),
      "Should report missing files from coverage"
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
```

**Verifica**: `node --test --test-name-pattern="CLI llmstxt" tests/optimizer.test.js` → los tests pasan.

### Step 4: Agregar tests para `config`

**Test H: `CLI config with invalid action exits with error`**

```javascript
test("CLI config with invalid action exits with error", () => {
  const result = spawnSync(
    process.execPath,
    [cliPath, "config", "delete", "reminders"],
    { cwd: repoRoot, encoding: "utf8" }
  );
  assert.strictEqual(result.status, 1);
  assert.match(result.stderr, /Usage:|Error:/);
});
```

**Test I: `CLI config set with invalid value exits with error`**

```javascript
test("CLI config set with invalid value exits with error", () => {
  const result = spawnSync(
    process.execPath,
    [cliPath, "config", "set", "reminders", "maybe"],
    { cwd: repoRoot, encoding: "utf8" }
  );
  assert.strictEqual(result.status, 1);
  assert.match(result.stderr, /true or false/);
});
```

**Verifica**: `node --test --test-name-pattern="CLI config" tests/optimizer.test.js` → los tests pasan.

### Step 5: Full check y cobertura

**Verifica**: `npm test` → todos los tests pasan (59 + 9 nuevos = 68 tests).

**Verifica**: `npm run test:coverage` → la cobertura de `bin/cli.js` debe ser ≥ 80%. Si es menor, revisa el reporte para ver qué caminos faltan y considera agregar tests adicionales, pero no bajes del umbral del 80%.

### Step 6: Full check

**Verifica**: `npm run check` → exit 0.

## Test plan

Los nuevos tests siguen el patrón establecido en el archivo:

| Test | Qué cubre | Patrón de referencia |
|------|-----------|---------------------|
| A | `audit` sin archivos → error | `CLI rejects explicitly malformed config files` (línea 523) |
| B | `--format` inválido | Mismo patrón |
| C | `--threshold` inválido | Mismo patrón |
| D | `--summary` en modo texto | `CLI audit --summary produces aggregate report` (línea 1132) |
| E | `--backup` | `CLI inject --recursive processes multiple files` (línea 1163) |
| F | `llmstxt audit` archivo ausente | `CLI rejects explicitly malformed config files` |
| G | `llmstxt audit --recursive` | `CLI audit --recursive finds files in directory` (línea 1109) |
| H | `config` acción inválida | `CLI rejects explicitly malformed config files` |
| I | `config set` valor inválido | Mismo patrón |

## Done criteria

- [ ] `npm run check` exits 0
- [ ] `npm test` exits 0; ≥ 68 tests (59 + 9 nuevos)
- [ ] `npm run test:coverage` muestra `bin/cli.js` ≥ 80% line coverage
- [ ] `node --test --test-name-pattern="CLI" tests/optimizer.test.js` → todos los tests CLI pasan
- [ ] `git diff --stat` solo muestra `tests/optimizer.test.js`
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `bin/cli.js` o `tests/optimizer.test.js` cambiaron significativamente desde `4dff240` (drift).
- `npm test` falla después de agregar tests — si un test nuevo falla, el código del CLI puede tener un bug; repórtalo como hallazgo.
- La cobertura no sube del 61% a pesar de los nuevos tests — verifica que los tests ejercitan las líneas correctas con `c8` y ajusta.
- El test E (`--backup`) falla porque `--backup` no está implementado — repórtalo; es un bug en el CLI, no en el test.

## Maintenance notes

- Los tests CLI usan `spawnSync` con `process.execPath` para ejecutar Node.js. Esto es más lento que tests unitarios pero valida el comportamiento real del ejecutable.
- Si se agregan nuevos comandos o flags al CLI, agrega tests CLI para sus caminos de error (no solo happy path). Los caminos de error son donde los bugs son más costosos.
- La cobertura objetivo (80%) es un piso, no un techo. Idealmente aspirar a ≥ 90% para el entry point del producto.
