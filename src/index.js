export { loadConfig, MAX_PRONOUN_DENSITY } from "./config.js";
export {
  LICENSE_ENV_VAR,
  resolveLicenseKey,
  hasProEntitlement,
  getNoBrandingError,
} from "./integrity.js";
export {
  REMINDER_INJECTION_INTERVAL,
  REMINDER_COOLDOWN_MS,
  STATE_DIR_ENV_VAR,
  getStatePath,
  readEngagementState,
  setRemindersEnabled,
  remindersAreEnabled,
  recordSuccessfulFreeInjection,
} from "./engagement.js";
export {
  calculateReadability,
  parseFrontmatter,
  preprocessContent,
  cleanMarkdownToPlainText,
  extractSections,
  isHtmlContent,
  extractHtmlVisibleText,
} from "./text.js";
export { scoreContent, auditFile } from "./scoring.js";
export { auditContent } from "./engine.js";
export { renderV1Report, renderV2Report, renderV1Summary, renderV2Summary } from "./renderer.js";
export {
  REPORT_VERSION,
  MODEL_VERSION,
  createFinding,
  buildReportMeta,
  mapLegacyToFindings,
} from "./findings.js";
export {
  EVIDENCE_REGISTRY,
  EVIDENCE_LABELS,
  VALID_EVIDENCE_LABELS,
  validateSourceRefs,
  staleEvidenceWarnings,
} from "./evidence.js";
export { discoverFiles } from "./discovery.js";
export { auditFiles, aggregateReport, batchInject } from "./batch.js";
export {
  PROFILES,
  VALID_PROFILES,
  ALL_DIMENSIONS,
  isApplicable,
  notApplicableDimensions,
  scoreCeiling,
  detectProfile,
  resolveProfile,
} from "./profiles.js";
export { observeContent, observeAndParse } from "./observations.js";
export { observeTechnicalHtml, buildTechnicalFindings, auditTechnicalHtml } from "./technical.js";
export { scoreContentV2 } from "./scoring-v2.js";
export {
  assertNewFileParentInsideCwd,
  assertWritableTargetInsideCwd,
  COMMUNITY_SCHEMA_TYPES,
  PRO_SCHEMA_TYPES,
  generateSchemaData,
  injectSchema,
  validateWritableTargetInsideCwd,
  validateNewFileParentInsideCwd,
} from "./schema.js";
export {
  AI_CRAWLER_AGENTS,
  AI_CRAWLER_REGISTRY,
  CRAWLER_REGISTRY_VERSION,
  auditRobots,
  checkRobots,
  parseRobotsGroups,
} from "./robots.js";
export { validateSchema, validateSchemaFile } from "./validate.js";
export {
  extractPageMetadata,
  resolvePageUrl,
  suggestSection,
  generateLlmsTxt,
  generateLlmsFullTxt,
  generateLlmsFullTxtFiles,
  auditLlmsTxt,
  generateRobotsTxt,
} from "./llms-txt.js";
export {
  generateSitemapXml,
  generateSitemapFiles,
  parseSitemapXml,
  validateSitemapXml,
  scoreToPriority,
  determineChangefreq,
} from "./sitemap.js";
export {
  renderV1ReportHtml,
  renderV2ReportHtml,
  renderAggregateReportHtml,
  renderComparisonHtml,
} from "./html-report.js";
export {
  scoreToBadgeColor,
  scoreToBadgeGrade,
  generateBadgeUrl,
  generateBadgeMarkdown,
} from "./badge.js";
export {
  fetchUrl,
  fetchRobotsTxt,
  checkRobotsRule,
  clearRobotsCache,
  USER_AGENT as FETCHER_USER_AGENT,
  RESPONSE_TIMEOUT_MS,
  TOTAL_TIMEOUT_MS,
  MAX_RESPONSE_SIZE,
  MAX_REDIRECTS,
} from "./fetcher.js";
