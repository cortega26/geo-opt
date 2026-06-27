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
    profile?: string; // "auto" | ProfileId
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

  // ═══ Evidence ═══
  export type SourceType = "paper" | "official-doc" | "community-proposal" | "project-convention";

  export interface EvidenceEntry {
    id: string;
    title: string;
    url: string;
    sourceType: SourceType;
    lastVerified: string;
  }

  export const EVIDENCE_REGISTRY: Readonly<Record<string, EvidenceEntry>>;
  export const EVIDENCE_LABELS: Readonly<Record<string, string>>;
  export const VALID_EVIDENCE_LABELS: readonly string[];

  export function validateSourceRefs(sourceRefs: string[]): {
    valid: boolean;
    missing: string[];
  };

  export function staleEvidenceWarnings(staleDays?: number): string[];

  // ═══ Profiles ═══
  export type ProfileId =
    | "documentation"
    | "open-source"
    | "editorial"
    | "commercial"
    | "ecommerce"
    | "regulated";

  export interface ProfileDefinition {
    id: ProfileId;
    label: string;
    description: string;
    applicableDimensions: string[];
  }

  export const PROFILES: Readonly<Record<ProfileId, ProfileDefinition>>;
  export const VALID_PROFILES: readonly ProfileId[];
  export const ALL_DIMENSIONS: readonly string[];

  export function isApplicable(profile: ProfileId, dimension: string): boolean;
  export function notApplicableDimensions(profile: ProfileId): string[];
  export function scoreCeiling(profile: ProfileId): {
    totalMax: number;
    dimMax: Record<string, number>;
  };

  export interface ProfileDetection {
    profile: ProfileId;
    confidence: number;
    reasons: string[];
  }

  export interface ResolvedProfile extends ProfileDetection {
    overridden: boolean;
  }

  export function detectProfile(content: string, filepath?: string): ProfileDetection;
  export function resolveProfile(
    config: { profile?: string; [key: string]: unknown } | null | undefined,
    content: string,
    filepath?: string
  ): ResolvedProfile;

  // ═══ Observations ═══
  export type ObservationStatus = "pass" | "warn" | "fail";

  export interface HeadingObservation {
    kind: "heading_hierarchy";
    status: ObservationStatus;
    message: string;
    issues: string[];
  }

  export interface SectionObservation {
    kind: "section_self_containment";
    status: ObservationStatus;
    message: string;
    details: Array<{ header: string; wordCount: number; isEmpty: boolean }>;
  }

  export interface ParagraphObservation {
    kind: "paragraph_distribution";
    status: ObservationStatus;
    message: string;
    stats: { min: number; max: number; median: number; longCount: number };
  }

  export interface AnswerFirstObservation {
    kind: "answer_first";
    status: ObservationStatus;
    message: string;
    wordCount: number;
    hasDefinition: boolean;
  }

  export interface AttributionObservation {
    kind: "attribution_proximity";
    status: ObservationStatus;
    message: string;
    statsWithNearbySource: number;
    statsWithoutNearbySource: number;
    quotesWithAttribution: number;
    quotesWithoutAttribution: number;
  }

  export interface DateObservation {
    kind: "content_freshness";
    status: ObservationStatus;
    message: string;
    publishedDate: string | null;
    reviewedDate: string | null;
  }

  export interface SemanticHtmlObservation {
    kind: "semantic_html";
    status: ObservationStatus;
    message: string;
    foundTags: string[];
    hasDynamicRendering: boolean;
  }

  export interface LinkQualityObservation {
    kind: "link_quality";
    status: ObservationStatus;
    message: string;
    externalLinkCount: number;
    internalLinkCount: number;
    hasSourcesSection: boolean;
    hasExcessiveLinks: boolean;
  }

  export interface ContentObservations {
    headingHierarchy: HeadingObservation;
    sectionSelfContainment: SectionObservation;
    paragraphDistribution: ParagraphObservation;
    answerFirst: AnswerFirstObservation;
    attributionProximity: AttributionObservation;
    contentFreshness: DateObservation;
    semanticHtml?: SemanticHtmlObservation;
    linkQuality: LinkQualityObservation;
  }

  export function observeContent(
    rawContent: string,
    filepath?: string,
    opts?: { minWordsPerSection?: number; maxLongParagraph?: number }
  ): ContentObservations;

  export function observeAndParse(
    rawContent: string,
    filepath?: string,
    opts?: { minWordsPerSection?: number; maxLongParagraph?: number }
  ): { observations: ContentObservations; tokens: unknown; textContent: string };

  // ═══ Findings ═══
  export const REPORT_VERSION: string;
  export const MODEL_VERSION: string;

  export type FindingStatus = "pass" | "warn" | "fail" | "not_applicable";
  export type EvidenceLabel = "strong" | "probable" | "experimental" | "heuristic";

  export interface Finding {
    ruleId: string;
    category: string;
    severity: FindingStatus;
    status: FindingStatus;
    message: string;
    evidenceLabel: EvidenceLabel;
    applicability: string | string[];
    sourceRefs: string[];
    observedFacts: Record<string, unknown>;
    remediation: string | null;
  }

  export interface ReportMeta {
    reportVersion: string;
    modelVersion: string;
    generatedAt: string;
  }

  export function createFinding(params: {
    ruleId: string;
    category: string;
    severity: FindingStatus;
    message: string;
    evidenceLabel: EvidenceLabel;
    applicability?: string | string[];
    sourceRefs?: string[];
    observedFacts?: Record<string, unknown>;
    remediation?: string | null;
  }): Finding;

  export function buildReportMeta(): ReportMeta;

  export function mapLegacyToFindings(params: {
    introWordCount: number;
    introHasDefinition: boolean;
    hasTable: boolean;
    hasList: boolean;
    hasHeaders: boolean;
    hasSemanticHtml?: boolean;
    hasDynamicRendering: boolean;
    totalStatCount: number;
    quoteCount: number;
    linkCount: number;
    hasSourcesSection: boolean;
    pronounDensity: number;
    pronounLimit: number;
    unexplainedAcronyms: string[];
  }): Finding[];

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
    findings: Finding[];
    reportVersion: string;
    modelVersion: string;
    generatedAt: string;
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
    topFindings?: Array<{
      ruleId: string;
      category: string;
      evidenceLabel: string;
      message: string;
      fileCount: number;
    }>;
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
