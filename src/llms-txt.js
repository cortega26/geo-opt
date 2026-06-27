import path from "path";
import * as cheerio from "cheerio";
import {
  cleanMarkdownToPlainText,
  extractSections,
  preprocessContent,
  cleanHtmlText,
  truncateDescription,
} from "./text.js";
import { AI_CRAWLER_REGISTRY, CRAWLER_REGISTRY_VERSION } from "./robots.js";

// ---- Page metadata extraction ----

/**
 * Extract page metadata from raw content (title, description, sections).
 * Supports both Markdown and HTML.
 *
 * @param {string} content - raw file content
 * @param {string} filepath - file path (used to detect HTML vs Markdown)
 * @returns {{ title: string, description: string, sections: Array<{header: string, body: string}> }}
 */
export function extractPageMetadata(content, filepath) {
  const cleanText = preprocessContent(content);

  // H1 title
  let titleMatch = cleanText.match(/^#\s+(.+)$/m);
  let title = titleMatch ? titleMatch[1].trim() : "";
  if (!title) {
    const h1Match = cleanText.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
    if (h1Match) {
      title = cleanHtmlText(h1Match[1]);
    }
  }
  if (!title) {
    title = path.basename(filepath, path.extname(filepath)) || "Untitled";
  }

  // Description: first paragraph after H1
  let description = "";
  const introMatch = cleanText.match(/^#\s+.+?\n\n([^#\n]+)/s);
  if (introMatch) {
    description = cleanMarkdownToPlainText(introMatch[1].trim());
  }
  if (!description && (filepath.endsWith(".html") || /<html/i.test(cleanText))) {
    const $desc = cheerio.load(content);
    const metaDesc = $desc('meta[name="description"]').attr("content");
    if (metaDesc) description = cleanHtmlText(metaDesc);
    if (!description) {
      const firstP = $desc("p").first().text();
      if (firstP) description = cleanHtmlText(firstP);
    }
  }
  description = truncateDescription(description);

  // Sections (H2+)
  const sections = extractSections(content);

  return { title, description, sections };
}

/**
 * Resolve a file path to a URL relative to the site base directory.
 *
 * @param {string} filepath - absolute file path
 * @param {string} baseDir - absolute base directory of the site
 * @param {string} siteUrl - base URL of the site (e.g. https://example.com)
 * @returns {string} absolute URL
 */
export function resolvePageUrl(filepath, baseDir, siteUrl) {
  const cleanBase = siteUrl.replace(/\/+$/, "");
  let rel = path.relative(baseDir, filepath);
  // Strip file extension for clean URLs (index.md → /, about.md → /about)
  const ext = path.extname(rel);
  let withoutExt = rel.slice(0, -ext.length);
  // index pages become directory URLs
  if (path.basename(withoutExt) === "index") {
    withoutExt = path.dirname(withoutExt);
  }
  // Normalize to forward slashes
  rel = withoutExt.split(path.sep).join("/");
  if (rel === "") return cleanBase + "/";
  return `${cleanBase}/${rel}`;
}

// ---- llms.txt generation ----

/**
 * Generate an llms.txt file following the llmstxt.org specification.
 *
 * @param {Array<{ title: string, description: string, url: string, section?: string, score?: number }>} entries
 * @param {object} options
 * @param {string} [options.siteTitle] - H1 title of the site
 * @param {string} [options.siteDescription] - blockquote summary
 * @param {number} [options.optionalThreshold=50] - GEO score below which pages go to ## Optional
 * @returns {string} markdown content for llms.txt
 */
export function generateLlmsTxt(entries, options = {}) {
  const {
    siteTitle = "Site Documentation",
    siteDescription = "",
    optionalThreshold = 50,
  } = options;

  const lines = [];

  // H1
  lines.push(`# ${siteTitle}`);
  lines.push("");

  // Blockquote summary
  if (siteDescription) {
    lines.push(`> ${siteDescription}`);
    lines.push("");
  }

  // Group entries by section
  const sections = new Map();
  const optional = [];

  for (const entry of entries) {
    if (entry.score !== undefined && entry.score < optionalThreshold) {
      optional.push(entry);
    } else {
      const section = entry.section || "Pages";
      if (!sections.has(section)) sections.set(section, []);
      sections.get(section).push(entry);
    }
  }

  // Write regular sections
  for (const [sectionName, sectionEntries] of sections) {
    lines.push(`## ${sectionName}`);
    lines.push("");
    for (const entry of sectionEntries) {
      const desc = entry.description ? `: ${cleanMarkdownToPlainText(entry.description)}` : "";
      lines.push(`- [${entry.title}](${entry.url})${desc}`);
    }
    lines.push("");
  }

  // Write Optional section
  if (optional.length > 0) {
    lines.push("## Optional");
    lines.push("");
    for (const entry of optional) {
      const desc = entry.description ? `: ${cleanMarkdownToPlainText(entry.description)}` : "";
      lines.push(`- [${entry.title}](${entry.url})${desc}`);
    }
    lines.push("");
  }

  return lines.join("\n").trim() + "\n";
}

/**
 * Generate an llms-full.txt file containing the full content of all pages.
 *
 * Preserves Markdown structure (headings, lists, tables, code blocks, links)
 * so LLMs receive well-structured content. HTML pages are converted to
 * plain text with heading structure preserved.
 *
 * @param {Array<{ title: string, url: string, content: string }>} entries
 * @param {object} options
 * @param {string} [options.siteTitle] - site name for the header
 * @param {number} [options.maxChars] - max total chars before splitting (default: 500_000)
 * @returns {string} compiled markdown content for llms-full.txt
 */
export function generateLlmsFullTxt(entries, options = {}) {
  const { siteTitle = "Site Documentation", maxChars = 500_000 } = options;
  const lines = [];

  lines.push(`# ${siteTitle} — Full Content`);
  lines.push("");
  lines.push("> This file contains the complete content of all pages listed in llms.txt.");
  lines.push("");

  for (const entry of entries) {
    const pageContent = renderPageForFullTxt(entry, maxChars, lines);
    if (pageContent === null) break; // maxChars reached
  }

  return lines.join("\n").trim() + "\n";
}

/**
 * Render a single page entry for llms-full.txt, appending to lines.
 * Returns false if maxChars was reached.
 *
 * @param {{ title: string, url: string, content: string }} entry
 * @param {number} maxChars
 * @param {string[]} lines
 * @returns {boolean} true if the page was fully rendered, false if truncated
 */
function renderPageForFullTxt(entry, maxChars, lines) {
  const currentLen = lines.join("\n").length;
  if (currentLen >= maxChars) return false;

  lines.push("---");
  lines.push("");
  lines.push(`## [${entry.title}](${entry.url})`);
  lines.push("");

  const content = entry.content || "";
  const cleaned = preserveContentStructure(content);
  const bodyParagraphs = cleaned.split(/\n{2,}/);

  for (const para of bodyParagraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    lines.push(trimmed);
    lines.push("");

    // Check if we've exceeded maxChars
    if (lines.join("\n").length >= maxChars) {
      lines.push("");
      lines.push(`> ⚠️ Content truncated at ~${maxChars.toLocaleString()} characters.`);
      lines.push(`> Remaining pages omitted. Increase --max-chars or split into multiple files.`);
      return false;
    }
  }

  return true;
}

/**
 * Clean content for llms-full.txt while preserving Markdown structure.
 *
 * Removes: <script>, <style>, HTML comments, navigation/footer boilerplate.
 * Preserves: headings, lists, code blocks, tables, blockquotes, links.
 *
 * @param {string} rawContent
 * @returns {string}
 */
function preserveContentStructure(rawContent) {
  let text = rawContent;

  // Remove HTML scripts, styles, and comments
  text = text.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "");
  text = text.replace(/<!--[\s\S]*?-->/g, "");

  // Remove common navigation/footer boilerplate (non-semantic class patterns)
  // Only in HTML content
  if (/<html[\s>]/i.test(text) || /^\s*<!DOCTYPE\s/i.test(text)) {
    // For HTML, extract body content and convert to readable markdown-like text
    text = extractHtmlBodyForFullTxt(text);
  } else {
    // For Markdown, strip YAML frontmatter only
    text = text.replace(/^---\n[\s\S]*?\n---\n/, "");
  }

  // Collapse excessive blank lines
  text = text.replace(/\n{4,}/g, "\n\n\n");

  return text.trim();
}

/**
 * Extract meaningful body content from HTML for llms-full.txt.
 *
 * Removes <nav>, <footer>, and hidden elements; keeps semantic content
 * elements with their heading hierarchy intact.
 *
 * @param {string} html
 * @returns {string}
 */
function extractHtmlBodyForFullTxt(html) {
  const $ = cheerio.load(html);

  // Remove non-content elements
  $("script, style, noscript, meta, link, head").remove();
  $("nav, footer").remove();

  // Remove hidden elements
  $('[style*="display:none"], [style*="display: none"], [hidden], [aria-hidden="true"]').remove();

  // Try to extract main content area
  let $content;
  if ($("main").length) {
    $content = $("main");
  } else if ($("article").length) {
    $content = $("article").first();
  } else {
    $content = $("body").length ? $("body") : $.root();
  }

  if (!$content || !$content.length) return "";

  // Convert to text preserving heading markers
  const parts = [];
  $content.find("h1, h2, h3, h4, h5, h6, p, ul, ol, li, table, pre, code, blockquote").each((_, el) => {
    const tag = el.tagName.toLowerCase();
    const text = $(el).text().replace(/\s+/g, " ").trim();
    if (!text) return;

    if (tag.startsWith("h")) {
      const level = parseInt(tag[1]);
      parts.push("\n" + "#".repeat(level) + " " + text + "\n");
    } else if (tag === "li") {
      parts.push("- " + text);
    } else if (tag === "pre" || tag === "code") {
      const code = $(el).text();
      parts.push("\n```\n" + code + "\n```\n");
    } else if (tag === "blockquote") {
      parts.push("> " + text);
    } else {
      parts.push(text);
    }
  });

  return parts.join("\n\n");
}

/**
 * Suggest a logical section name based on content signals and file path.
 *
 * Uses content profile detection (via profiles.js) when the content is
 * available, falling back to path-based heuristics for the directory name.
 *
 * @param {string} filepath - absolute file path
 * @param {string} [content] - raw file content (optional, for profile detection)
 * @param {string} [cwd] - current working directory for relative paths
 * @returns {string} suggested section name
 */
export function suggestSection(filepath, content, cwd = process.cwd()) {
  // Derive from directory name with a map of common patterns
  const relDir = path.relative(cwd, path.dirname(filepath));
  if (!relDir || relDir === ".") return "Pages";

  // Common directory name → readable section
  const dirMap = {
    docs: "Documentation",
    documentation: "Documentation",
    api: "API Reference",
    guide: "Guides",
    guides: "Guides",
    tutorial: "Tutorials",
    tutorials: "Tutorials",
    blog: "Blog",
    posts: "Articles",
    articles: "Articles",
    news: "News",
    reference: "Reference",
    legal: "Legal",
    privacy: "Legal",
    terms: "Legal",
    about: "About",
    products: "Products",
    pricing: "Pricing",
    changelog: "Changelog",
    releases: "Releases",
  };

  const dirName = path.basename(relDir).toLowerCase();
  if (dirMap[dirName]) return dirMap[dirName];

  // Use content signals if available (lightweight, no profile dependency)
  if (content) {
    const lower = content.substring(0, 2000).toLowerCase();
    if (/api\s+(reference|endpoint|docs|documentation)/.test(lower)) return "API Reference";
    if (/changelog|release\s+notes|version\s+history/.test(lower)) return "Changelog";
    if (/privacy\s+policy|terms\s+of\s+(service|use)|gdpr|ccpa/.test(lower)) return "Legal";
    if (/tutorial|step.by.step|how.to|guide/.test(lower)) return "Guides";
    if (/news|press\s+release|announcement/.test(lower)) return "News";
  }

  // General path transformation
  return relDir.charAt(0).toUpperCase() + relDir.slice(1).replace(/[_-]/g, " ");
}

/**
 * Generate split llms-full.txt files for large sites.
 *
 * Returns an array of { name, content } objects suitable for writing
 * to disk. Files are named llms-full.txt, llms-full-2.txt, etc.
 *
 * @param {Array<{ title: string, url: string, content: string }>} entries
 * @param {object} [options]
 * @param {string} [options.siteTitle]
 * @param {number} [options.maxChars=500_000] - max characters per file
 * @returns {Array<{name: string, content: string}>}
 */
export function generateLlmsFullTxtFiles(entries, options = {}) {
  const { siteTitle = "Site Documentation", maxChars = 500_000 } = options;

  if (!entries || entries.length === 0) {
    return [{ name: "llms-full.txt", content: generateLlmsFullTxt([], options) }];
  }

  const files = [];
  let currentEntries = [];
  let currentSize = 0;
  let fileIndex = 0;

  const header = (title) =>
    `# ${title} — Full Content\n\n> This file contains the complete content of all pages listed in llms.txt.\n`;

  for (const entry of entries) {
    const pageHeader = `\n---\n\n## [${entry.title}](${entry.url})\n\n`;
    const content = entry.content || "";
    const cleaned = preserveContentStructure(content);
    const pageText = pageHeader + cleaned;

    const fullSize = currentSize + pageText.length;

    if (currentEntries.length > 0 && fullSize > maxChars) {
      // Finalize current file
      fileIndex++;
      const title = fileIndex === 1 ? siteTitle : `${siteTitle} (Part ${fileIndex})`;
      const fileName =
        fileIndex === 1 ? "llms-full.txt" : `llms-full-${fileIndex}.txt`;
      files.push({
        name: fileName,
        content: header(title) + currentEntries.join(""),
      });
      currentEntries = [];
      currentSize = 0;
    }

    currentEntries.push(pageText);
    currentSize += pageText.length;
  }

  // Final file
  if (currentEntries.length > 0) {
    fileIndex++;
    const title =
      fileIndex === 1 && files.length === 0
        ? siteTitle
        : `${siteTitle} (Part ${fileIndex})`;
    const fileName =
      files.length === 0 ? "llms-full.txt" : `llms-full-${fileIndex}.txt`;
    files.push({
      name: fileName,
      content: header(title) + currentEntries.join(""),
    });
  }

  return files;
}

// ---- llms.txt audit ----

/**
 * Parse the section entries (URLs and titles) from an llms.txt file.
 *
 * @param {string} llmsContent - content of the llms.txt file
 * @returns {Array<{ title: string, url: string, section: string, optional: boolean }>}
 */
function parseLlmsEntries(llmsContent) {
  const entries = [];
  let currentSection = "";
  let currentOptional = false;

  const lines = llmsContent.split("\n");
  for (const line of lines) {
    // Track H2 sections
    const h2Match = line.match(/^##\s+(.+)$/);
    if (h2Match) {
      currentSection = h2Match[1].trim();
      currentOptional = currentSection.toLowerCase() === "optional";
      continue;
    }

    // Track list items with links
    const linkMatch = line.match(/^\s*-\s+\[([^\]]+)\]\(([^)]+)\)/);
    if (linkMatch) {
      entries.push({
        title: linkMatch[1].trim(),
        url: linkMatch[2].trim(),
        section: currentSection || "Pages",
        optional: currentOptional,
      });
    }
  }

  return entries;
}

/**
 * Audit an existing llms.txt file for spec compliance and coverage.
 *
 * @param {string} llmsContent - content of the llms.txt file
 * @param {string[]} [discoveredFiles=[]] - absolute paths of all site files (for coverage check)
 * @param {{ siteUrl?: string, baseDir?: string }} [options={}]
 * @returns {{ valid: boolean, issues: string[], coverage?: { listed: number, missing: number, total: number, missingFiles: string[] } }}
 */
export function auditLlmsTxt(llmsContent, discoveredFiles = [], options = {}) {
  const issues = [];

  // Check required H1
  if (!/^#\s+\S/m.test(llmsContent)) {
    issues.push("Missing required H1 title (e.g. '# Site Name').");
  }

  // Check required blockquote
  if (!/^>\s+\S/m.test(llmsContent)) {
    issues.push("Missing recommended blockquote description (e.g. '> Brief summary...').");
  }

  // Check at least one H2 section
  if (!/^##\s+\S/m.test(llmsContent)) {
    issues.push("No H2 sections found. Add at least one section with page links.");
  }

  // Parse entries
  const entries = parseLlmsEntries(llmsContent);

  // Check for entries without descriptions
  const withoutDesc = entries.filter((e) => {
    // Find original line to check if it has a description after the URL
    const linePattern = new RegExp(
      `\\[${e.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\]\\(${e.url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\):`
    );
    return !linePattern.test(llmsContent);
  });
  if (withoutDesc.length > 0) {
    issues.push(
      `${withoutDesc.length} page(s) have no description (add ': description' after the URL).`
    );
  }

  // Check Optional section is last
  const h2Matches = [...llmsContent.matchAll(/^##\s+(.+)$/gm)];
  const optionalIdx = h2Matches.findIndex((m) => m[1].trim().toLowerCase() === "optional");
  if (optionalIdx >= 0 && optionalIdx < h2Matches.length - 1) {
    issues.push("The '## Optional' section should be the last section in the file.");
  }

  // Coverage check against discovered files
  let coverage = undefined;
  if (discoveredFiles.length > 0) {
    const listedPaths = new Set(
      entries.map((e) => {
        try {
          return new URL(e.url).pathname;
        } catch {
          return e.url;
        }
      })
    );
    const { baseDir = "" } = options;
    const missingFiles = [];
    for (const fp of discoveredFiles) {
      // Resolve each discovered file to a URL and check if it's listed
      let relPath;
      try {
        relPath = path.relative(baseDir, fp);
      } catch {
        relPath = fp;
      }
      const ext = path.extname(relPath);
      const withoutExt = relPath.slice(0, -ext.length);
      let relUrl =
        "/" +
        withoutExt
          .split(path.sep)
          .join("/")
          .replace(/\/index$/, "");
      if (relUrl === "/" || relUrl === "") continue; // root/index page
      if (!listedPaths.has(relUrl) && !listedPaths.has(relUrl + "/")) {
        // Also check if any entry URL contains a matching path
        const found = [...listedPaths].some(
          (p) => p.includes(path.basename(withoutExt)) || p.includes(relUrl)
        );
        if (!found) {
          missingFiles.push(fp);
        }
      }
    }
    coverage = {
      listed: entries.length,
      missing: missingFiles.length,
      total: discoveredFiles.length,
      missingFiles: missingFiles.slice(0, 10), // top 10
    };
    if (missingFiles.length > 0) {
      issues.push(`${missingFiles.length} file(s) on the site are not listed in llms.txt.`);
    }
  }

  return {
    valid: issues.length === 0,
    issues,
    ...(coverage ? { coverage } : {}),
  };
}

// ---- robots.txt generation ----

/**
 * Generate a reviewable robots.txt draft for configured AI agents.
 *
 * @param {object} [options={}]
 * @param {string[]} [options.disallowPaths=[]] - paths to disallow for every broadly allowed group
 * @param {string} [options.sitemapUrl] - URL of the sitemap
 * @param {"search-visible"|"open"} [options.preset="search-visible"] - crawler policy preset
 * @returns {string} robots.txt content
 */
export function generateRobotsTxt(options = {}) {
  const { disallowPaths = [], sitemapUrl = "", preset = "search-visible" } = options;
  if (!["search-visible", "open"].includes(preset)) {
    throw new RangeError(`Unknown robots.txt policy preset: ${preset}`);
  }

  const normalizedDisallowPaths = (
    disallowPaths.length > 0 ? disallowPaths : ["/admin", "/api", "/private"]
  ).map((entry) => (entry.startsWith("/") ? entry : `/${entry}`));

  // ── Group agents by effective policy ──
  const groups = {
    search: [],
    user: [],
    training: [],
    control: [],
    legacy: [],
  };

  for (const entry of AI_CRAWLER_REGISTRY) {
    (groups[entry.purpose] || groups.legacy).push(entry);
  }

  const lines = [];
  const B = " ".repeat(0); // base indent for readability

  lines.push(`${B}# ───────────────────────────────────────────────────────────`);
  lines.push(`${B}# AI Crawler Policy — generated by geo-opt`);
  lines.push(`${B}# Registry version: ${CRAWLER_REGISTRY_VERSION}`);
  lines.push(`${B}# Policy preset: ${preset}`);
  lines.push(`${B}#`);
  lines.push(`${B}# robots.txt is a voluntary policy signal, not an access`);
  lines.push(`${B}# control. Crawlers may ignore these directives. Always verify`);
  lines.push(`${B}# with each provider's current documentation.`);
  lines.push(`${B}# ───────────────────────────────────────────────────────────`);
  lines.push("");

  // ── Section 1: Search Crawlers ──
  // These are used by AI answer engines to fetch pages in real time
  // when a user asks a question. Allowing them helps your content
  // appear in AI-generated answers.
  if (groups.search.length > 0) {
    lines.push(`${B}# ═══ Search Crawlers ═══`);
    lines.push(`${B}# Real-time fetchers used by AI answer engines when a user asks`);
    lines.push(`${B}# a question. Allowing them enables citation and discovery.`);
    lines.push("");

    for (const entry of groups.search) {
      lines.push(`${B}# ${entry.provider} — ${describePurpose(entry.purpose)}`);
      lines.push(`${B}# Official source: ${entry.officialSource}`);
      lines.push(`${B}User-agent: ${entry.token}`);
      lines.push(`${B}Allow: /`);
      for (const disallowPath of normalizedDisallowPaths) {
        lines.push(`${B}Disallow: ${disallowPath}`);
      }
      lines.push("");
    }
  }

  // ── Section 2: User-Triggered Crawlers ──
  // These fetch pages when a user explicitly asks (e.g. "browse this
  // page"). Blocking them degrades the user experience without
  // preventing training ingestion.
  if (groups.user.length > 0) {
    lines.push(`${B}# ═══ User-Triggered Crawlers ═══`);
    lines.push(`${B}# Fetch content only when a user explicitly requests it (e.g.,`);
    lines.push(`${B}# "browse this page"). Blocking degrades user experience.`);
    lines.push(`${B}# These tokens may not respect robots.txt in all contexts.`);
    lines.push("");

    for (const entry of groups.user) {
      const robotsNote = entry.robotsApplicable === false
        ? `${B}# User-triggered requests may ignore robots.txt.`
        : "";
      if (robotsNote) lines.push(robotsNote);
      lines.push(`${B}# ${entry.provider} — ${describePurpose(entry.purpose)}`);
      lines.push(`${B}# Official source: ${entry.officialSource}`);
      lines.push(`${B}User-agent: ${entry.token}`);
      lines.push(`${B}Allow: /`);
      for (const disallowPath of normalizedDisallowPaths) {
        lines.push(`${B}Disallow: ${disallowPath}`);
      }
      lines.push("");
    }
  }

  // ── Section 3: Training Crawlers ──
  // These fetch content for model training datasets. Disallowing
  // them signals you prefer your content not be used for training,
  // though compliance varies by provider.
  if (groups.training.length > 0 && preset === "open") {
    lines.push(`${B}# ═══ Training Crawlers ═══`);
    lines.push(`${B}# Used for model training datasets. The 'open' preset allows`);
    lines.push(`${B}# them. Switch to 'search-visible' preset to disallow.`);
    lines.push("");

    for (const entry of groups.training) {
      lines.push(`${B}# ${entry.provider} — ${describePurpose(entry.purpose)}`);
      lines.push(`${B}# Official source: ${entry.officialSource}`);
      lines.push(`${B}User-agent: ${entry.token}`);
      lines.push(`${B}Allow: /`);
      for (const disallowPath of normalizedDisallowPaths) {
        lines.push(`${B}Disallow: ${disallowPath}`);
      }
      lines.push("");
    }
  } else if (groups.training.length > 0) {
    lines.push(`${B}# ═══ Training Crawlers ═══`);
    lines.push(`${B}# Used for model training datasets. Disallowed under the`);
    lines.push(`${B}# '${preset}' preset. Use 'open' preset to allow training ingestion.`);
    lines.push("");

    for (const entry of groups.training) {
      lines.push(`${B}# ${entry.provider} — ${describePurpose(entry.purpose)}`);
      lines.push(`${B}# Official source: ${entry.officialSource}`);
      lines.push(`${B}User-agent: ${entry.token}`);
      lines.push(`${B}Disallow: /`);
      lines.push("");
    }
  }

  // ── Section 4: Control Tokens ──
  // Product control tokens that are not distinct HTTP crawlers.
  if (groups.control.length > 0) {
    lines.push(`${B}# ═══ Product Control Tokens ═══`);
    lines.push(`${B}# These are not distinct HTTP user agents. They act as feature`);
    lines.push(`${B}# toggles within each provider's product (e.g., Google SGE,`);
    lines.push(`${B}# Apple Intelligence). Check the provider's documentation.`);
    lines.push(`${B}# Under '${preset}' preset: ${preset === "open" ? "allowed (opt-in)." : "disallowed (opt-out)."}`);
    lines.push("");

    for (const entry of groups.control) {
      lines.push(`${B}# ${entry.provider} — ${describePurpose(entry.purpose)}`);
      lines.push(`${B}# Official source: ${entry.officialSource}`);
      lines.push(`${B}User-agent: ${entry.token}`);
      if (preset === "open") {
        lines.push(`${B}Allow: /`);
        for (const disallowPath of normalizedDisallowPaths) {
          lines.push(`${B}Disallow: ${disallowPath}`);
        }
      } else {
        lines.push(`${B}Disallow: /`);
      }
      lines.push("");
    }
  }

  // ── Section 5: Legacy / Undocumented ──
  if (groups.legacy.length > 0 && preset === "open") {
    lines.push(`${B}# ═══ Legacy / Undocumented Tokens ═══`);
    lines.push(`${B}# Included for completeness under the 'open' preset. Verify`);
    lines.push(`${B}# with the provider before relying on these tokens.`);
    lines.push("");

    for (const entry of groups.legacy) {
      lines.push(`${B}# ${entry.provider} — ${describePurpose(entry.purpose)}`);
      lines.push(`${B}# Token may be obsolete or unofficial.`);
      lines.push(`${B}# Official source: ${entry.officialSource}`);
      lines.push(`${B}User-agent: ${entry.token}`);
      lines.push(`${B}Allow: /`);
      for (const disallowPath of normalizedDisallowPaths) {
        lines.push(`${B}Disallow: ${disallowPath}`);
      }
      lines.push("");
    }
  } else if (groups.legacy.length > 0) {
    lines.push(`${B}# ═══ Legacy / Undocumented Tokens ═══`);
    lines.push(`${B}# Commented out under the '${preset}' preset. Use 'open'`);
    lines.push(`${B}# preset to include these tokens.`);
    lines.push("");

    for (const entry of groups.legacy) {
      lines.push(`${B}# ${entry.token}: legacy or undocumented token.`);
      lines.push(`${B}# Verify with ${entry.provider} before adding rules.`);
      lines.push(`${B}# User-agent: ${entry.token}`);
      lines.push(`${B}# Disallow: /`);
      lines.push("");
    }
  }

  // ── Default Rules ──
  lines.push(`${B}# ═══ Default Rules ═══`);
  lines.push(`${B}# Applies to all crawlers not explicitly listed above,`);
  lines.push(`${B}# including traditional search engines (Googlebot, Bingbot).`);
  lines.push(`${B}# Private/admin paths are disallowed for all crawlers.`);
  lines.push("");

  lines.push(`${B}User-agent: *`);
  for (const disallowPath of normalizedDisallowPaths) {
    lines.push(`${B}Disallow: ${disallowPath}`);
  }

  lines.push("");

  if (sitemapUrl) {
    lines.push(`${B}# ── Sitemap ──`);
    lines.push(`${B}Sitemap: ${sitemapUrl}`);
    lines.push("");
  }

  return lines.join("\n").trim() + "\n";
}

/**
 * Human-readable description of a crawler purpose.
 * @param {string} purpose
 * @returns {string}
 */
function describePurpose(purpose) {
  const descriptions = {
    search: "real-time answer engine fetcher",
    user: "user-triggered page retrieval",
    training: "model training data collection",
    control: "product control/opt-out token",
    legacy: "legacy or undocumented token",
  };
  return descriptions[purpose] || purpose;
}
