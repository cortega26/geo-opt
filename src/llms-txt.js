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
 * @param {Array<{ title: string, url: string, content: string }>} entries
 * @param {object} options
 * @param {string} [options.siteTitle] - site name for the header
 * @returns {string} compiled markdown content for llms-full.txt
 */
export function generateLlmsFullTxt(entries, options = {}) {
  const { siteTitle = "Site Documentation" } = options;
  const lines = [];

  lines.push(`# ${siteTitle} — Full Content`);
  lines.push("");
  lines.push("> This file contains the complete content of all pages listed in llms.txt.");
  lines.push("");

  for (const entry of entries) {
    lines.push("---");
    lines.push("");
    lines.push(`## [${entry.title}](${entry.url})`);
    lines.push("");

    const content = entry.content || "";
    const clean = preprocessContent(content);
    const plain = cleanMarkdownToPlainText(clean);
    // Split into paragraphs for readability
    const paragraphs = plain.split(/\n{2,}/);
    for (const para of paragraphs) {
      const trimmed = para.trim();
      if (trimmed) lines.push(trimmed);
      lines.push("");
    }
  }

  return lines.join("\n").trim() + "\n";
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
  const lines = [];

  lines.push("# ── AI Crawler Policy ──");
  lines.push(`# Registry: ${CRAWLER_REGISTRY_VERSION}; preset: ${preset}`);
  lines.push("# Draft policy signal only: robots.txt is not an access control.");
  lines.push("");

  for (const entry of AI_CRAWLER_REGISTRY) {
    if (entry.purpose === "legacy" && preset !== "open") {
      lines.push(
        `# ${entry.token}: legacy or undocumented token; verify with ${entry.provider} before adding rules.`
      );
      continue;
    }

    const broadlyAllowed =
      preset === "open" || entry.purpose === "search" || entry.purpose === "user";
    lines.push(`# ${entry.provider}; purpose: ${entry.purpose}; source: ${entry.officialSource}`);
    if (entry.robotsApplicable === false) {
      lines.push("# User-triggered requests may ignore robots.txt.");
    } else if (entry.purpose === "control") {
      lines.push("# Product control token; not a distinct HTTP crawler user agent.");
    }
    lines.push(`User-agent: ${entry.token}`);
    if (broadlyAllowed) {
      lines.push("Allow: /");
      for (const disallowPath of normalizedDisallowPaths) {
        lines.push(`Disallow: ${disallowPath}`);
      }
    } else {
      lines.push("Disallow: /");
    }
    lines.push("");
  }

  lines.push("# ── Default Rules ──");
  lines.push("# All other crawlers (traditional search engines, etc.) follow these rules.");
  lines.push("");

  lines.push("User-agent: *");
  for (const disallowPath of normalizedDisallowPaths) {
    lines.push(`Disallow: ${disallowPath}`);
  }

  lines.push("");

  if (sitemapUrl) {
    lines.push(`Sitemap: ${sitemapUrl}`);
    lines.push("");
  }

  return lines.join("\n").trim() + "\n";
}
