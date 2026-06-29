/**
 * Consumer fixture — typechecks every supported public export.
 *
 * This file compiles (not executes) to verify the declarations in index.d.ts
 * match the runtime surface of src/index.js. Intentional removal of any
 * declaration or export MUST make this file fail to compile.
 *
 * Maintenance rule (plan 031): any future root export must update the
 * declaration and this fixture in the same change.
 */

import { before, after } from "node:test";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// ── Runtime fixture files ──
// Several runtime calls below need real files on disk. Create a temp
// directory inside the project root so security checks
// (assertNewFileParentInsideCwd) pass — they require paths to be
// inside process.cwd().
const __filename = fileURLToPath(import.meta.url);
const __dirname = join(__filename, "..");
const PROJECT_ROOT = join(__dirname, "..");
const FIXTURE_DIR = mkdtempSync(join(PROJECT_ROOT, ".geo-opt-consumer-"));
const fileMd = join(FIXTURE_DIR, "file.md");
const testMd = join(FIXTURE_DIR, "test.md");
const docsDir = join(FIXTURE_DIR, "docs");
const robotsTxt = join(FIXTURE_DIR, "robots.txt");

before(() => {
  writeFileSync(fileMd, "# Test\n\nContent for consumer fixture.", "utf8");
  writeFileSync(testMd, "# Schema Test\n\nContent.", "utf8");
  mkdirSync(docsDir, { recursive: true });
  writeFileSync(join(docsDir, "page.md"), "# Docs Page\n\nDoc content.", "utf8");
  writeFileSync(robotsTxt, "User-agent: *\nAllow: /", "utf8");
});

after(() => {
  rmSync(FIXTURE_DIR, { recursive: true, force: true });
});

// ── Types (compile-time only) ──
import type {
  GeoConfig,
  EngagementState,
  HtmlVisibleText,
  Section,
  SourceType,
  EvidenceEntry,
  ProfileId,
  ProfileDefinition,
  ProfileDetection,
  ResolvedProfile,
  ObservationStatus,
  HeadingObservation,
  SectionObservation,
  ParagraphObservation,
  AnswerFirstObservation,
  AttributionObservation,
  DateObservation,
  SemanticHtmlObservation,
  LinkQualityObservation,
  ContentObservations,
  FindingStatus,
  EvidenceLabel,
  Finding,
  ReportMeta,
  TechnicalAuditOptions,
  TechnicalObservations,
  TechnicalAuditReport,
  ScoreBreakdownItem,
  AuditReport,
  V2DimensionScore,
  V2ProfileInfo,
  V2StructuralObservations,
  V2AttributionSummary,
  V2LinkSummary,
  V2ContentFreshness,
  V2Report,
  DiscoverOptions,
  AuditResult,
  AggregateReport,
  BatchInjectResult,
  SchemaGraphObject,
  InjectOptions,
  CrawlerPurpose,
  CrawlerRegistryEntry,
  RobotsRule,
  RobotsAgentAudit,
  RobotsAuditReport,
  PageMetadata,
  LlmsEntry,
  LlmsFullEntry,
  LlmsAuditReport,
} from "geo-opt";

// ── Runtime values ──
import {
  MAX_PRONOUN_DENSITY,
  loadConfig,
  LICENSE_ENV_VAR,
  resolveLicenseKey,
  hasProEntitlement,
  getNoBrandingError,
  REMINDER_INJECTION_INTERVAL,
  REMINDER_COOLDOWN_MS,
  STATE_DIR_ENV_VAR,
  getStatePath,
  readEngagementState,
  setRemindersEnabled,
  remindersAreEnabled,
  recordSuccessfulFreeInjection,
  calculateReadability,
  preprocessContent,
  cleanMarkdownToPlainText,
  isHtmlContent,
  extractHtmlVisibleText,
  extractSections,
  EVIDENCE_REGISTRY,
  EVIDENCE_LABELS,
  VALID_EVIDENCE_LABELS,
  validateSourceRefs,
  staleEvidenceWarnings,
  PROFILES,
  VALID_PROFILES,
  ALL_DIMENSIONS,
  isApplicable,
  notApplicableDimensions,
  scoreCeiling,
  detectProfile,
  resolveProfile,
  observeContent,
  observeAndParse,
  REPORT_VERSION,
  MODEL_VERSION,
  createFinding,
  buildReportMeta,
  mapLegacyToFindings,
  observeTechnicalHtml,
  buildTechnicalFindings,
  auditTechnicalHtml,
  scoreContent,
  auditFile,
  auditContent,
  scoreContentV2,
  renderV1Report,
  renderV2Report,
  renderV1Summary,
  renderV2Summary,
  discoverFiles,
  auditFiles,
  aggregateReport,
  batchInject,
  assertNewFileParentInsideCwd,
  assertWritableTargetInsideCwd,
  validateNewFileParentInsideCwd,
  validateWritableTargetInsideCwd,
  generateSchemaData,
  injectSchema,
  CRAWLER_REGISTRY_VERSION,
  AI_CRAWLER_REGISTRY,
  AI_CRAWLER_AGENTS,
  auditRobots,
  checkRobots,
  validateSchemaFile,
  extractPageMetadata,
  resolvePageUrl,
  generateLlmsTxt,
  generateLlmsFullTxt,
  auditLlmsTxt,
  generateRobotsTxt,
} from "geo-opt";

// ═══ Type-level assertions ═══
// These compile-time checks ensure every imported type is structurally valid.

// --- Config ---
const _maxPronoun: number = MAX_PRONOUN_DENSITY;
const _configResult: { config: GeoConfig; configPath: string | null } = loadConfig();
const _config: GeoConfig = {
  author: { name: "Test", jobTitle: "Writer", sameAs: "https://example.com" },
  publisher: {
    name: "Pub",
    url: "https://pub.example.com",
    logo: "https://pub.example.com/logo.png",
  },
  acronyms: { SEO: "Search Engine Optimization" },
  product: { offer: { price: "9.99", priceCurrency: "USD", availability: "InStock" } },
  license: { key: "abc" },
  licenseKey: "abc",
  datePublished: "2026-01-01",
  limits: { max_pronoun_density: 0.05 },
  ignore: ["node_modules"],
  allowedExtensions: [".md", ".html"],
  siteUrl: "https://example.com",
  siteDescription: "A test site",
  profile: "documentation",
};

// --- Licensing ---
const _licEnv: string = LICENSE_ENV_VAR;
const _licKey: string = resolveLicenseKey(_config);
const _hasPro: boolean = hasProEntitlement(_config);
const _noBrandErr: string | null = getNoBrandingError(_config);

// --- Engagement ---
const _remInt: number = REMINDER_INJECTION_INTERVAL;
const _remCool: number = REMINDER_COOLDOWN_MS;
const _stateDir: string = STATE_DIR_ENV_VAR;
const _statePath: string = getStatePath();
const _engState: EngagementState = readEngagementState();
const _setRem: boolean = setRemindersEnabled(true);
const _remEn: boolean = remindersAreEnabled();
const _recFree: { shown: boolean; reason: string } = recordSuccessfulFreeInjection(_config);

// --- Text ---
const _readability: { wordCount: number; avgSentenceLen: number } =
  calculateReadability("Hello world.");
const _preprocessed: string = preprocessContent("# Title\n\nContent.");
const _plainText: string = cleanMarkdownToPlainText("**bold** text");
const _isHtml: boolean = isHtmlContent("<p>test</p>");
const _htmlVisible: HtmlVisibleText = extractHtmlVisibleText("<p>test</p>");
const _sections: Section[] = extractSections("## A\n\nBody\n\n## B\n\nMore.");

// --- Evidence ---
const _srcType: SourceType = "paper";
const _evEntry: EvidenceEntry = {
  id: "ref-1",
  title: "Test",
  url: "https://example.com",
  sourceType: "official-doc",
  lastVerified: "2026-01-01",
};
const _evReg: Readonly<Record<string, EvidenceEntry>> = EVIDENCE_REGISTRY;
const _evLabels: Readonly<Record<string, string>> = EVIDENCE_LABELS;
const _validLabels: readonly string[] = VALID_EVIDENCE_LABELS;
const _srcRefValidation: { valid: boolean; missing: string[] } = validateSourceRefs(["ref-1"]);
const _staleWarnings: string[] = staleEvidenceWarnings(90);

// --- Profiles ---
const _pid: ProfileId = "documentation";
const _pdef: ProfileDefinition = PROFILES.documentation;
const _validProfiles: readonly ProfileId[] = VALID_PROFILES;
const _allDims: readonly string[] = ALL_DIMENSIONS;
const _appl: boolean = isApplicable("documentation", "structure");
const _notAppl: string[] = notApplicableDimensions("documentation");
const _ceiling: { totalMax: number; dimMax: Record<string, number> } =
  scoreCeiling("documentation");
const _detect: ProfileDetection = detectProfile("content", fileMd);
const _resolved: ResolvedProfile = resolveProfile(_config, "content", fileMd);

// --- Observations ---
const _obsStatus: ObservationStatus = "pass";
const _headingObs: HeadingObservation = {
  kind: "heading_hierarchy",
  status: "pass",
  message: "ok",
  issues: [],
};
const _sectionObs: SectionObservation = {
  kind: "section_self_containment",
  status: "pass",
  message: "ok",
  details: [{ header: "H", wordCount: 50, isEmpty: false }],
};
const _paraObs: ParagraphObservation = {
  kind: "paragraph_distribution",
  status: "pass",
  message: "ok",
  stats: { min: 10, max: 100, median: 40, longCount: 0 },
};
const _afObs: AnswerFirstObservation = {
  kind: "answer_first",
  status: "pass",
  message: "ok",
  wordCount: 50,
  hasDefinition: true,
};
const _attrObs: AttributionObservation = {
  kind: "attribution_proximity",
  status: "pass",
  message: "ok",
  statsWithNearbySource: 3,
  statsWithoutNearbySource: 0,
  quotesWithAttribution: 2,
  quotesWithoutAttribution: 0,
};
const _dateObs: DateObservation = {
  kind: "content_freshness",
  status: "pass",
  message: "ok",
  publishedDate: "2026-01-01",
  reviewedDate: null,
};
const _semHtmlObs: SemanticHtmlObservation = {
  kind: "semantic_html",
  status: "pass",
  message: "ok",
  foundTags: ["article"],
  hasDynamicRendering: false,
};
const _linkObs: LinkQualityObservation = {
  kind: "link_quality",
  status: "pass",
  message: "ok",
  externalLinkCount: 5,
  internalLinkCount: 3,
  hasSourcesSection: true,
  hasExcessiveLinks: false,
};
const _contentObs: ContentObservations = observeContent("content", fileMd);
const _obsParsed: { observations: ContentObservations; tokens: unknown; textContent: string } =
  observeAndParse("content", fileMd);

// --- Findings ---
const _fStatus: FindingStatus = "warn";
const _evLabel: EvidenceLabel = "strong";
const _finding: Finding = createFinding({
  ruleId: "test.rule",
  category: "structure",
  severity: "warn",
  message: "test",
  evidenceLabel: "heuristic",
});
const _repVer: string = REPORT_VERSION;
const _modVer: string = MODEL_VERSION;
const _meta: ReportMeta = buildReportMeta();
const _legacyFindings: Finding[] = mapLegacyToFindings({
  introWordCount: 50,
  introHasDefinition: true,
  hasTable: true,
  hasList: true,
  hasHeaders: true,
  hasSemanticHtml: true,
  hasDynamicRendering: false,
  totalStatCount: 3,
  quoteCount: 2,
  linkCount: 5,
  hasSourcesSection: true,
  pronounDensity: 0.02,
  pronounLimit: 0.05,
  unexplainedAcronyms: [],
});

// --- Technical discovery ---
const _techOpts: TechnicalAuditOptions = { sourceUrl: "https://example.com", minVisibleWords: 100 };
const _techObs: TechnicalObservations = observeTechnicalHtml("<html></html>", _techOpts);
const _techFindings: Finding[] = buildTechnicalFindings(_techObs);
const _techReport: TechnicalAuditReport = auditTechnicalHtml("<html></html>", _techOpts);

// --- Scoring (v1) ---
const _scoreBreakdown: ScoreBreakdownItem = { score: 15, max: 20, details: ["ok"] };
const _auditReport: AuditReport = {
  file: "test.md",
  total_score: 85,
  breakdown: {
    structure: { score: 18, max: 20, details: ["ok"] },
    statistics: { score: 17, max: 20, details: ["ok"] },
    quotations: { score: 16, max: 20, details: "ok" },
    citations: { score: 17, max: 20, details: "ok" },
    clarity: { score: 17, max: 20, details: ["ok"] },
  },
  recommendations: ["rec 1"],
  findings: [],
  reportVersion: "1.0.0",
  modelVersion: "2.0.0",
  generatedAt: "2026-01-01T00:00:00.000Z",
};
const _scoreV1: { score: number; report: AuditReport } = scoreContent("content", fileMd, _config);
const _auditFileResult: number = auditFile(fileMd, _config, "json");

// --- Engine (unified) ---
const _auditV1: { score: number; report: AuditReport | V2Report } = auditContent(
  "content",
  fileMd,
  _config,
  "v1"
);
const _auditV2: { score: number; report: AuditReport | V2Report } = auditContent(
  "content",
  fileMd,
  _config,
  "v2"
);

// --- V2 scoring ---
const _v2Dim: V2DimensionScore = { score: 15, max: 20, applicable: true, details: ["ok"] };
const _v2Profile: V2ProfileInfo = {
  detected: "documentation",
  label: "Documentation",
  confidence: 0.9,
  overridden: false,
  reasons: ["markdown content"],
};
const _v2Struct: V2StructuralObservations = {
  headingHierarchy: "pass",
  sectionSelfContainment: "pass",
  answerFirst: "pass",
};
const _v2Attr: V2AttributionSummary = {
  statsWithAttribution: 3,
  statsWithoutAttribution: 0,
  quotesWithAttribution: 2,
  quotesWithoutAttribution: 0,
};
const _v2Link: V2LinkSummary = {
  externalLinks: 5,
  hasSourcesSection: true,
  hasExcessiveLinks: false,
};
const _v2Fresh: V2ContentFreshness = {
  publishedDate: "2026-01-01",
  reviewedDate: null,
};
const _v2Report: V2Report = {
  file: "test.md",
  reportVersion: "1.0.0",
  modelVersion: "2.1.0",
  generatedAt: "2026-01-01T00:00:00.000Z",
  profile: _v2Profile,
  readinessBand: "solid",
  readinessLabel: "Solid",
  readinessDescription: "Meets most thresholds.",
  applicableDimensions: 5,
  effectiveScore: 75,
  dimensions: { structure: _v2Dim },
  structuralObservations: _v2Struct,
  attributionSummary: _v2Attr,
  linkSummary: _v2Link,
  contentFreshness: _v2Fresh,
  findings: [],
  notApplicableDimensions: [],
  recommendations: ["Add more sources."],
};
const _scoreV2: { score: number; report: V2Report } = scoreContentV2("content", fileMd, _config);

// --- Rendering ---
const _v1Text: string = renderV1Report(_auditReport, "test.md");
const _v1TextExplain: string = renderV1Report(_auditReport, "test.md", { explain: true });
const _v2Text: string = renderV2Report(_v2Report, "test.md");
const _summary: AggregateReport = { totalFiles: 1, succeeded: 1, failed: 0 };
const _v1Summary: string = renderV1Summary(_summary);
const _v2Summary: string = renderV2Summary(_summary);

// --- Discovery ---
const _discOpts: DiscoverOptions = {
  recursive: true,
  ignorePatterns: ["node_modules"],
  allowedExtensions: new Set([".md"]),
  cwd: FIXTURE_DIR,
  config: _config,
};
const _files: string[] = discoverFiles([docsDir], _discOpts);

// --- Batch ---
const _auditResults: AuditResult[] = auditFiles(_files, _config);
const _auditResult: AuditResult = {
  file: "test.md",
  status: "success",
  score: 85,
  report: _auditReport,
};
const _aggReport: AggregateReport = aggregateReport(_auditResults);
const _batchResult: BatchInjectResult = batchInject(_files, "article", _config, { dryRun: true });

// --- Schema ---
const _schemaGraph: SchemaGraphObject = generateSchemaData(testMd, "article", _config);
const _injOpts: InjectOptions = { dryRun: true, noBranding: false };
const _assertNewFile: { parentRealPath: string; cwdRealPath: string } =
  assertNewFileParentInsideCwd(testMd);
const _assertWritable: { targetRealPath: string; cwdRealPath: string } =
  assertWritableTargetInsideCwd(testMd);
const _validateNewFile:
  { valid: true; parentRealPath: string; cwdRealPath: string } | { valid: false; error: string } =
  validateNewFileParentInsideCwd(testMd);
const _validateWritable:
  { valid: true; targetRealPath: string; cwdRealPath: string } | { valid: false; error: string } =
  validateWritableTargetInsideCwd(testMd);
// injectSchema returns void (side-effect function)
injectSchema(testMd, "article", _config, _injOpts);

// --- Robots ---
const _crawlerPurpose: CrawlerPurpose = "search";
const _crawlerEntry: CrawlerRegistryEntry = {
  token: "Googlebot",
  provider: "Google",
  purpose: "search",
  robotsApplicable: true,
  officialSource: "https://example.com",
  lastVerified: "2026-01-01",
};
const _robotsRule: RobotsRule = { directive: "allow", path: "/" };
const _robotsAgentAudit: RobotsAgentAudit = {
  ..._crawlerEntry,
  matchedGroup: ["*"],
  allowed: true,
  matchedRule: _robotsRule,
  warnings: [],
};
const _robotsReport: RobotsAuditReport = {
  registryVersion: CRAWLER_REGISTRY_VERSION,
  path: "/robots.txt",
  wildcard: { matchedGroup: ["*"], allowed: true, matchedRule: _robotsRule },
  agents: [],
};
const _crawlerVer: string = CRAWLER_REGISTRY_VERSION;
const _crawlerReg: readonly CrawlerRegistryEntry[] = AI_CRAWLER_REGISTRY;
const _crawlerAgents: string[] = AI_CRAWLER_AGENTS;
const _robotsAudit: RobotsAuditReport = auditRobots("User-agent: *\nAllow: /");
const _robotsCheck: RobotsAuditReport | void = checkRobots(robotsTxt);

// --- JSON-LD validation ---
// validateSchemaFile returns void (side-effect function)
validateSchemaFile(testMd);

// --- LLMs.txt ---
const _pageMeta: PageMetadata = extractPageMetadata("content", fileMd);
const _pageUrl: string = resolvePageUrl(fileMd, FIXTURE_DIR, "https://example.com");
const _llmsEntry: LlmsEntry = {
  title: "Page",
  url: "https://example.com/page",
  description: "A page",
  score: 85,
};
const _llmsFullEntry: LlmsFullEntry = {
  title: "Page",
  url: "https://example.com/page",
  content: "Full content",
};
const _llmsTxt: string = generateLlmsTxt([_llmsEntry], {
  siteTitle: "Site",
  siteDescription: "Desc",
  optionalThreshold: 70,
});
const _llmsFullTxt: string = generateLlmsFullTxt([_llmsFullEntry], { siteTitle: "Site" });
const _llmsAudit: LlmsAuditReport = auditLlmsTxt("llms.txt content", _files, {
  siteUrl: "https://example.com",
  baseDir: "/base",
});
const _robotsTxt: string = generateRobotsTxt({
  disallowPaths: ["/admin"],
  sitemapUrl: "https://example.com/sitemap.xml",
  preset: "search-visible",
});
