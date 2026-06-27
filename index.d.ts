declare module "geo-opt" {
  // ═══ Config ═══
  export const MAX_PRONOUN_DENSITY: number;
  export function loadConfig(configPath?: string | null): {
    config: GeoConfig;
    configPath: string | null;
  };

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
  export function resolveLicenseKey(
    config?: GeoConfig,
    env?: Record<string, string | undefined>
  ): string;
  export function hasProEntitlement(
    config?: GeoConfig,
    env?: Record<string, string | undefined>
  ): boolean;
  export function getNoBrandingError(
    config?: GeoConfig,
    env?: Record<string, string | undefined>
  ): string | null;

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
  export function readEngagementState(options?: {
    statePath?: string;
    env?: Record<string, string | undefined>;
    homedir?: string;
  }): EngagementState;
  export function setRemindersEnabled(
    enabled: boolean,
    options?: {
      statePath?: string;
      env?: Record<string, string | undefined>;
      homedir?: string;
    }
  ): boolean;
  export function remindersAreEnabled(options?: {
    statePath?: string;
    env?: Record<string, string | undefined>;
    homedir?: string;
  }): boolean;
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
  export function calculateReadability(text: string): {
    wordCount: number;
    avgSentenceLen: number;
  };
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
  export type CrawlerPurpose = "search" | "training" | "user" | "control" | "legacy";
  export interface CrawlerRegistryEntry {
    token: string;
    provider: string;
    purpose: CrawlerPurpose;
    robotsApplicable: boolean | null;
    officialSource: string;
    lastVerified: string;
  }
  export interface RobotsRule {
    directive: "allow" | "disallow";
    path: string;
  }
  export interface RobotsAgentAudit extends CrawlerRegistryEntry {
    matchedGroup: string[] | null;
    allowed: boolean;
    matchedRule: RobotsRule | null;
    warnings: string[];
  }
  export interface RobotsAuditReport {
    registryVersion: string;
    path: string;
    wildcard: {
      matchedGroup: string[] | null;
      allowed: boolean;
      matchedRule: RobotsRule | null;
    };
    agents: RobotsAgentAudit[];
  }
  export const CRAWLER_REGISTRY_VERSION: string;
  export const AI_CRAWLER_REGISTRY: readonly CrawlerRegistryEntry[];
  export const AI_CRAWLER_AGENTS: string[];
  export function auditRobots(content: string, options?: { path?: string }): RobotsAuditReport;
  export function checkRobots(
    robotsPath: string,
    options?: { path?: string; format?: "text" | "json" }
  ): RobotsAuditReport | void;

  // ═══ JSON-LD validation ═══
  export function validateSchemaFile(filepath: string): void;

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

  export function generateRobotsTxt(options?: {
    disallowPaths?: string[];
    sitemapUrl?: string;
    preset?: "search-visible" | "open";
  }): string;
}
