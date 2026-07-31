# Plan 017: Declaraciones de tipos TypeScript para la API pública

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 4dff240..HEAD -- src/index.js src/config.js src/scoring.js src/schema.js src/text.js src/robots.js src/batch.js src/discovery.js src/llms-txt.js src/engagement.js src/licensing.js package.json`
> Si los exports o firmas de funciones cambiaron desde que este plan fue escrito,
> compara los fragmentos en "Current state" contra el código real; si hay
> divergencia en las firmas, trátalo como STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `4dff240`, 2026-06-26

## Why this matters

`geo-opt` se describe como "pipeline friendly" y exporta 27 símbolos de API pública desde `src/index.js`. Sin embargo, los consumidores TypeScript no tienen autocompletado, verificación de tipos, ni documentación de parámetros al importar el paquete como librería. Dado que la mayoría de proyectos Node.js nuevos usan TypeScript, esto es una fricción de adopción significativa. Agregar un archivo `index.d.ts` con declaraciones de tipos es un cambio aditivo (no toca runtime) que mejora drásticamente la DX para consumidores TypeScript sin afectar a los usuarios JavaScript.

## Current state

- `package.json` — no tiene campo `"types"`. El manifiesto incluye `"files": ["bin/", "src/", ...]`.
- `src/index.js` — barrel que re-exporta 27 símbolos desde 7 módulos.
- Las funciones usan JSDoc parcialmente (ej. `batch.js`, `discovery.js`, `llms-txt.js` tienen anotaciones `@param` y `@returns`).
- No hay `.d.ts` files en el proyecto.

Principales exports y sus firmas (extraídos del código actual):

| Export | Módulo origen | Firma resumida |
|--------|--------------|----------------|
| `loadConfig(configPath?)` | `config.js` | `(configPath?: string \| null) => { config: object, configPath: string \| null }` |
| `MAX_PRONOUN_DENSITY` | `config.js` | `number` |
| `resolveLicenseKey(config?, env?)` | `licensing.js` | `(config?: object, env?: object) => string` |
| `hasProEntitlement(config?, env?)` | `licensing.js` | `(config?: object, env?: object) => boolean` |
| `getNoBrandingError(config?, env?)` | `licensing.js` | `(config?: object, env?: object) => string \| null` |
| `LICENSE_ENV_VAR` | `licensing.js` | `string` |
| `REMINDER_INJECTION_INTERVAL` | `engagement.js` | `number` |
| `REMINDER_COOLDOWN_MS` | `engagement.js` | `number` |
| `STATE_DIR_ENV_VAR` | `engagement.js` | `string` |
| `getStatePath(env?, homedir?)` | `engagement.js` | `(env?: object, homedir?: string) => string` |
| `readEngagementState(options?)` | `engagement.js` | `(options?: object) => EngagementState` |
| `setRemindersEnabled(enabled, options?)` | `engagement.js` | `(enabled: boolean, options?: object) => boolean` |
| `remindersAreEnabled(options?)` | `engagement.js` | `(options?: object) => boolean` |
| `recordSuccessfulFreeInjection(config?, options?)` | `engagement.js` | `(config?: object, options?: object) => { shown: boolean, reason: string }` |
| `calculateReadability(text)` | `text.js` | `(text: string) => { wordCount: number, avgSentenceLen: number }` |
| `preprocessContent(content)` | `text.js` | `(content: string) => string` |
| `cleanMarkdownToPlainText(mdText)` | `text.js` | `(mdText: string) => string` |
| `extractSections(content)` | `text.js` | `(content: string) => Array<{ header: string, body: string }>` |
| `scoreContent(content, filepath, config)` | `scoring.js` | `(content: string, filepath: string, config: object) => { score: number, report: object }` |
| `auditFile(filepath, config, outputFormat?)` | `scoring.js` | `(filepath: string, config: object, outputFormat?: string) => number` |
| `discoverFiles(inputPaths, options?)` | `discovery.js` | `(inputPaths: string[], options?: DiscoverOptions) => string[]` |
| `auditFiles(files, config)` | `batch.js` | `(files: string[], config: object) => Array<AuditResult>` |
| `aggregateReport(results)` | `batch.js` | `(results: Array<AuditResult>) => AggregateReport` |
| `batchInject(files, schemaType, config, options?)` | `batch.js` | `(files: string[], schemaType: string, config: object, options?: object) => BatchInjectResult` |
| `assertNewFileParentInsideCwd(filepath)` | `schema.js` | `(filepath: string) => { parentRealPath: string, cwdRealPath: string } \| void` |
| `assertWritableTargetInsideCwd(filepath)` | `schema.js` | `(filepath: string) => { targetRealPath: string, cwdRealPath: string } \| void` |
| `generateSchemaData(filepath, schemaType, config, _content?)` | `schema.js` | `(filepath: string, schemaType: string, config: object, _content?: string \| null) => SchemaObject` |
| `injectSchema(filepath, schemaType, config, options?)` | `schema.js` | `(filepath: string, schemaType: string, config: object, options?: boolean \| InjectOptions) => void` |
| `checkRobots(robotsPath)` | `robots.js` | `(robotsPath: string) => void` |
| `AI_CRAWLER_AGENTS` | `robots.js` | `string[]` |
| `extractPageMetadata(content, filepath)` | `llms-txt.js` | `(content: string, filepath: string) => PageMetadata` |
| `resolvePageUrl(filepath, baseDir, siteUrl)` | `llms-txt.js` | `(filepath: string, baseDir: string, siteUrl: string) => string` |
| `generateLlmsTxt(entries, options?)` | `llms-txt.js` | `(entries: Array<LlmsEntry>, options?: object) => string` |
| `generateLlmsFullTxt(entries, options?)` | `llms-txt.js` | `(entries: Array<FullEntry>, options?: object) => string` |
| `auditLlmsTxt(llmsContent, discoveredFiles?, options?)` | `llms-txt.js` | `(llmsContent: string, discoveredFiles?: string[], options?: object) => LlmsAuditReport` |
| `generateRobotsTxt(options?)` | `llms-txt.js` | `(options?: object) => string` |

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Full check | `npm run check` | exit 0, all tests pass |
| TypeScript check | `npx tsc --noEmit --lib es2022,dom index.d.ts` | exit 0 (sin errores) |
| Lint | `npm run lint` | exit 0 |
| Format check | `npm run format:check` | exit 0 |

## Scope

**In scope** (the only files you should create/modify):
- `index.d.ts` — nuevo archivo con todas las declaraciones de tipos
- `package.json` — agregar campo `"types": "index.d.ts"` y agregar `"index.d.ts"` a `"files"`

**Out of scope** (do NOT touch):
- Código fuente (`src/`, `bin/`) — no modificar; solo declaraciones de tipos
- Tests — no se requieren tests para definiciones de tipo
- `tsconfig.json` — no es necesario; el proyecto sigue siendo JavaScript
- `geo_optimizer.py` — Python no usa tipos TypeScript

## Git workflow

- Branch: `advisor/017-add-typescript-types`
- Commit: `feat: add TypeScript type declarations for public API`
- Sigue el estilo de commits del repo.
- No hagas push ni abras PR a menos que se te indique explícitamente.

## Steps

### Step 1: Crear `index.d.ts`

Crea el archivo `index.d.ts` en la raíz del proyecto con las declaraciones de tipo para todos los exports listados en `src/index.js` (27 símbolos). El archivo debe seguir estas reglas:

1. Usa `declare module "geo-opt"` como wrapper.
2. Tipa cada export con su firma exacta.
3. Usa interfaces con nombres descriptivos para objetos complejos (ej. `GeoConfig`, `AuditReport`, `AggregateReport`).
4. Usa JSDoc para documentar parámetros y returns (opcional pero recomendado).
5. Los tipos `object` en parámetros deben refinarse a interfaces específicas.

Estructura del archivo:

```typescript
declare module "geo-opt" {
  // ═══ Config ═══
  export const MAX_PRONOUN_DENSITY: number;
  export function loadConfig(
    configPath?: string | null
  ): { config: GeoConfig; configPath: string | null };

  export interface GeoConfig {
    author?: {
      name: string;
      jobTitle?: string;
      sameAs?: string;
    };
    publisher?: {
      name?: string;
      url?: string;
      logo?: string;
    };
    acronyms?: Record<string, string>;
    product?: {
      offer?: {
        price?: string | number;
        priceCurrency?: string;
        availability?: string;
      };
    };
    license?: {
      key?: string;
    };
    licenseKey?: string;
    datePublished?: string;
    limits?: {
      max_pronoun_density?: number;
    };
    ignore?: string[];
    allowedExtensions?: string[];
    siteUrl?: string;
    siteDescription?: string;
  }

  // ═══ Licensing ═══
  export const LICENSE_ENV_VAR: string;
  export function resolveLicenseKey(config?: GeoConfig, env?: Record<string, string | undefined>): string;
  export function hasProEntitlement(config?: GeoConfig, env?: Record<string, string | undefined>): boolean;
  export function getNoBrandingError(config?: GeoConfig, env?: Record<string, string | undefined>): string | null;

  // ═══ Engagement ═══
  export const REMINDER_INJECTION_INTERVAL: number;
  export const REMINDER_COOLDOWN_MS: number;
  export const STATE_DIR_ENV_VAR: string;

  export interface EngagementState {
    remindersEnabled: boolean;
    successfulFreeInjections: number;
    lastReminderAt: string | null;
  }

  export function getStatePath(env?: Record<string, string | undefined>, homedir?: string): string;
  export function readEngagementState(options?: { statePath?: string; env?: Record<string, string | undefined>; homedir?: string }): EngagementState;
  export function setRemindersEnabled(enabled: boolean, options?: { statePath?: string; env?: Record<string, string | undefined>; homedir?: string }): boolean;
  export function remindersAreEnabled(options?: { statePath?: string; env?: Record<string, string | undefined>; homedir?: string }): boolean;
  export function recordSuccessfulFreeInjection(
    config?: GeoConfig,
    options?: {
      statePath?: string;
      env?: Record<string, string | undefined>;
      stderr?: { isTTY: boolean; write(msg: string): void };
      now?: Date;
    }
  ): { shown: boolean; reason: string };

  // ═══ Text ═══
  export function calculateReadability(text: string): { wordCount: number; avgSentenceLen: number };
  export function preprocessContent(content: string): string;
  export function cleanMarkdownToPlainText(mdText: string): string;

  export interface Section {
    header: string;
    body: string;
  }

  export function extractSections(content: string): Section[];

  // ═══ Scoring ═══
  export interface ScoreBreakdownItem {
    score: number;
    max: number;
    details: string | string[];
  }

  export interface AuditReport {
    file: string;
    total_score: number;
    breakdown: {
      structure: ScoreBreakdownItem;
      statistics: ScoreBreakdownItem;
      quotations: ScoreBreakdownItem;
      citations: ScoreBreakdownItem;
      clarity: ScoreBreakdownItem;
    };
    recommendations: string[];
  }

  export function scoreContent(
    content: string,
    filepath: string,
    config: GeoConfig
  ): { score: number; report: AuditReport };

  export function auditFile(
    filepath: string,
    config: GeoConfig,
    outputFormat?: "text" | "json"
  ): number;

  // ═══ Discovery ═══
  export interface DiscoverOptions {
    recursive?: boolean;
    ignorePatterns?: string[];
    allowedExtensions?: Set<string>;
    cwd?: string;
    config?: GeoConfig;
  }

  export function discoverFiles(inputPaths: string[], options?: DiscoverOptions): string[];

  // ═══ Batch ═══
  export interface AuditResult {
    file: string;
    status: "success" | "error";
    score?: number;
    report?: AuditReport;
    error?: string;
  }

  export interface AggregateReport {
    totalFiles: number;
    succeeded: number;
    failed: number;
    message?: string;
    averageScore?: number;
    medianScore?: number;
    minScore?: number;
    maxScore?: number;
    stdDev?: number;
    distribution?: {
      excellent: number;
      good: number;
      needsWork: number;
    };
    topRecommendations?: Array<{ recommendation: string; fileCount: number }>;
    worstFiles?: Array<{ file: string; score: number }>;
    perFile?: AuditResult[];
  }

  export function auditFiles(files: string[], config: GeoConfig): AuditResult[];
  export function aggregateReport(results: AuditResult[]): AggregateReport;

  export interface BatchInjectResult {
    successCount: number;
    failCount: number;
    errors: Array<{ file: string; error: string }>;
  }

  export function batchInject(
    files: string[],
    schemaType: string,
    config: GeoConfig,
    options?: { dryRun?: boolean; noBranding?: boolean }
  ): BatchInjectResult;

  // ═══ Schema ═══
  export interface SchemaGraphObject {
    "@context": "https://schema.org";
    "@graph": Array<Record<string, unknown>>;
  }

  export function assertNewFileParentInsideCwd(
    filepath: string
  ): { parentRealPath: string; cwdRealPath: string } | void;

  export function assertWritableTargetInsideCwd(
    filepath: string
  ): { targetRealPath: string; cwdRealPath: string } | void;

  export function generateSchemaData(
    filepath: string,
    schemaType: "article" | "faq" | "product",
    config: GeoConfig,
    _content?: string | null
  ): SchemaGraphObject;

  export interface InjectOptions {
    dryRun?: boolean;
    noBranding?: boolean;
  }

  export function injectSchema(
    filepath: string,
    schemaType: string,
    config: GeoConfig,
    options?: boolean | InjectOptions
  ): void;

  // ═══ Robots ═══
  export const AI_CRAWLER_AGENTS: string[];
  export function checkRobots(robotsPath: string): void;

  // ═══ LLMs.txt ═══
  export interface PageMetadata {
    title: string;
    description: string;
    sections: Section[];
  }

  export function extractPageMetadata(content: string, filepath: string): PageMetadata;
  export function resolvePageUrl(filepath: string, baseDir: string, siteUrl: string): string;

  export interface LlmsEntry {
    title: string;
    url: string;
    description?: string;
    section?: string;
    score?: number;
    content?: string;
  }

  export function generateLlmsTxt(
    entries: LlmsEntry[],
    options?: {
      siteTitle?: string;
      siteDescription?: string;
      optionalThreshold?: number;
    }
  ): string;

  export interface LlmsFullEntry {
    title: string;
    url: string;
    content?: string;
  }

  export function generateLlmsFullTxt(
    entries: LlmsFullEntry[],
    options?: { siteTitle?: string }
  ): string;

  export interface LlmsAuditReport {
    valid: boolean;
    issues: string[];
    coverage?: {
      listed: number;
      missing: number;
      total: number;
      missingFiles: string[];
    };
  }

  export function auditLlmsTxt(
    llmsContent: string,
    discoveredFiles?: string[],
    options?: { siteUrl?: string; baseDir?: string }
  ): LlmsAuditReport;

  export function generateRobotsTxt(
    options?: {
      disallowPaths?: string[];
      sitemapUrl?: string;
    }
  ): string;
}
```

**Verifica**: `npx tsc --noEmit --lib es2022,dom index.d.ts` → exit 0. Si `tsc` no está disponible, instálalo con `npm install --no-save typescript` y ejecuta `npx tsc --noEmit --lib es2022,dom index.d.ts`. Si el comando falla con errores de tipo, corrígelos antes de continuar.

### Step 2: Actualizar `package.json`

En `package.json`, agrega dos entradas:

1. Agrega `"types": "index.d.ts"` después del campo `"main"` (línea 6):

```json
"main": "src/index.js",
"types": "index.d.ts",
```

2. Agrega `"index.d.ts"` al array `"files"` (línea 9):

```json
"files": [
  "bin/",
  "src/",
  "index.d.ts",
  "README.md",
  ...
],
```

**Verifica**: `npm pack --dry-run --json 2>/dev/null | node -e "const p=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log(p.filter(f=>f.path==='index.d.ts').length > 0 ? 'OK: index.d.ts included' : 'FAIL: missing')"` → `OK: index.d.ts included`.

### Step 3: Full check

**Verifica**: `npm run check` → exit 0. Los tipos no afectan el runtime.

## Test plan

No se requieren tests de código. La validación de tipos se hace con:

- `npx tsc --noEmit --lib es2022,dom index.d.ts` — confirma que las declaraciones de tipo son sintácticamente correctas y autoconsistentes.
- `npm pack --dry-run` — confirma que `index.d.ts` se incluye en el paquete publicado.

Para validación adicional (opcional, no requerida), un consumidor TypeScript puede probar:

```typescript
import { auditFile, loadConfig, type GeoConfig } from "geo-opt";
const { config } = loadConfig();
const score: number = auditFile("test.md", config as GeoConfig, "json");
```

## Done criteria

- [ ] `npm run check` exits 0
- [ ] `index.d.ts` existe con declaraciones para los 27 exports de `src/index.js`
- [ ] `npx tsc --noEmit --lib es2022,dom index.d.ts` exits 0 sin errores
- [ ] `package.json` tiene `"types": "index.d.ts"` después de `"main"`
- [ ] `package.json` tiene `"index.d.ts"` en el array `"files"`
- [ ] `npm pack --dry-run` incluye `index.d.ts`
- [ ] `git diff --stat` solo muestra `index.d.ts` (nuevo) y `package.json` (modificado)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Los exports en `src/index.js` no coinciden con la tabla en "Current state" (alguien agregó, eliminó, o cambió la firma de un export).
- `npx tsc --noEmit --lib es2022,dom index.d.ts` falla con errores que no puedes resolver (ej. conflicto de tipos con una versión nueva de una dependencia).
- `index.d.ts` ya existe (el plan ya fue aplicado).
- `npm pack --dry-run` muestra que `index.d.ts` no se incluye (el campo `files` puede estar mal configurado).

## Maintenance notes

- Cuando se agregue un nuevo export a `src/index.js`, debe agregarse la declaración de tipo correspondiente en `index.d.ts`. Agrega esta regla al CONTRIBUTING.md o AGENTS.md si existe un proceso de contribución formal.
- Los tipos usan intencionalmente `Record<string, unknown>` para `@graph` porque los nodos del grafo Schema.org varían por tipo. Si en el futuro se quiere tipado más estricto (ej. discriminated union por `@type`), refina las interfaces.
- Las funciones que llaman `process.exit(1)` y retornan `void` en ciertos caminos están tipadas como `void` — el consumidor TypeScript debe manejar la posibilidad de que el proceso termine.
- Si se aplica el plan 015 (`buildInjectedContent`), esa función es interna y no debe agregarse a `index.d.ts` a menos que se promueva a API pública.
- Mantén `index.d.ts` sincronizado manualmente con `src/index.js`. No hay tooling automático para generar `.d.ts` desde JSDoc en este proyecto.
