/**
 * Sitemap XML generation from content tree.
 *
 * Generates sitemap.xml (and sitemap index for large sites) following the
 * sitemap.org protocol. Priorities are derived from GEO audit scores;
 * change frequencies from content freshness signals.
 *
 * @module sitemap
 */

import fs from "fs";

// ═══════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════

/** Maximum URLs per sitemap before splitting into an index. */
const MAX_URLS_PER_SITEMAP = 50_000;

/** Valid change frequency values per sitemap.org spec. */
const VALID_CHANGEFREQ = new Set([
  "always",
  "hourly",
  "daily",
  "weekly",
  "monthly",
  "yearly",
  "never",
]);

/** XML escape map. */
const XML_ESCAPE = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Escape text for XML content.
 * @param {string} text
 * @returns {string}
 */
function xmlEscape(text) {
  return String(text).replace(/[&<>"']/g, (ch) => XML_ESCAPE[ch] || ch);
}

/**
 * Format a date for sitemap lastmod (YYYY-MM-DD).
 * @param {string|Date|null} date
 * @returns {string|null}
 */
function formatLastmod(date) {
  if (!date) return null;
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

/**
 * Read file modification time as lastmod.
 * @param {string} filePath
 * @returns {string|null}
 */
function fileLastmod(filePath) {
  try {
    const stat = fs.statSync(filePath);
    return formatLastmod(stat.mtime);
  } catch {
    return null;
  }
}

/**
 * Map a GEO score (0–100) to a sitemap priority (0.0–1.0).
 *
 * Sitemap priority is relative: it tells search engines which pages
 * the site owner considers most important. We derive it from the GEO
 * audit score so high-quality, AI-discoverable content gets higher
 * priority.
 *
 * @param {number} score — GEO audit score (0–100)
 * @returns {number} priority (0.0–1.0, step 0.1)
 */
export function scoreToPriority(score) {
  if (typeof score !== "number" || isNaN(score)) return 0.5;
  if (score >= 80) return 1.0;
  if (score >= 60) return 0.8;
  if (score >= 40) return 0.5;
  if (score >= 20) return 0.3;
  return 0.1;
}

/**
 * Determine a sensible change frequency from content date signals.
 *
 * Uses published/reviewed dates when available; falls back to file
 * modification time. Returns the sitemap.org enum value.
 *
 * @param {object} entry
 * @param {string|null} [entry.publishedDate]
 * @param {string|null} [entry.reviewedDate]
 * @param {string} [entry.filePath] — fallback for stat-based mtime
 * @returns {string} one of VALID_CHANGEFREQ
 */
export function determineChangefreq(entry = {}) {
  const { publishedDate, reviewedDate, filePath } = entry;
  const now = Date.now();
  const DAY = 86_400_000;

  // If content has a reviewed date, prefer it for freshness
  const dateStr = reviewedDate || publishedDate;
  if (dateStr) {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      const ageDays = (now - d.getTime()) / DAY;
      if (ageDays <= 7) return "daily";
      if (ageDays <= 30) return "weekly";
      if (ageDays <= 180) return "monthly";
      return "yearly";
    }
  }

  // Fallback: file modification time
  if (filePath) {
    try {
      const stat = fs.statSync(filePath);
      const ageDays = (now - stat.mtimeMs) / DAY;
      if (ageDays <= 7) return "daily";
      if (ageDays <= 30) return "weekly";
      if (ageDays <= 180) return "monthly";
      return "yearly";
    } catch {
      // Stat failed — use default
    }
  }

  return "monthly";
}

// ═══════════════════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate a sitemap.xml string from content entries.
 *
 * Each entry must have a `url` (absolute). Optional fields:
 * - `score` — GEO audit score, mapped to `<priority>` via scoreToPriority()
 * - `lastmod` — explicit ISO date (overrides filePath stat)
 * - `publishedDate` / `reviewedDate` — used for `<changefreq>` determination
 * - `filePath` — used for stat-based `<lastmod>` and `<changefreq>` fallback
 * - `images` — array of {loc, caption?, title?} for `<image:image>` extensions
 *
 * @param {Array<{
 *   url: string,
 *   score?: number,
 *   lastmod?: string,
 *   publishedDate?: string|null,
 *   reviewedDate?: string|null,
 *   filePath?: string,
 *   images?: Array<{loc: string, caption?: string, title?: string}>
 * }>} entries
 * @param {object} [options]
 * @param {string} [options.baseUrl] — prepended to relative URLs
 * @returns {string} XML sitemap content
 */
export function generateSitemapXml(entries, options = {}) {
  const { baseUrl = "" } = options;

  if (!entries || entries.length === 0) {
    return _renderUrlset([]);
  }

  // Resolve entries: ensure URL is absolute, derive lastmod/priority/changefreq
  const resolved = entries.map((entry) => {
    const url = entry.url.startsWith("http") ? entry.url : baseUrl + entry.url;

    const lastmod =
      formatLastmod(entry.lastmod) || fileLastmod(entry.filePath) || null;

    const priority = scoreToPriority(entry.score);

    const changefreq = determineChangefreq({
      publishedDate: entry.publishedDate,
      reviewedDate: entry.reviewedDate,
      filePath: entry.filePath,
    });

    const result = { url, lastmod, priority, changefreq };
    if (entry.images?.length) {
      result.images = entry.images;
    }
    return result;
  });

  // If under the max, render a single sitemap
  if (resolved.length <= MAX_URLS_PER_SITEMAP) {
    return _renderUrlset(resolved);
  }

  // Large site: render a sitemap index pointing to split files.
  // The caller is responsible for writing each split file.
  const pages = Math.ceil(resolved.length / MAX_URLS_PER_SITEMAP);
  const indexEntries = [];
  for (let i = 0; i < pages; i++) {
    indexEntries.push({
      url: `sitemap-${i + 1}.xml`,
      lastmod: resolved
        .slice(i * MAX_URLS_PER_SITEMAP, (i + 1) * MAX_URLS_PER_SITEMAP)
        .reduce((latest, e) => {
          if (!e.lastmod) return latest;
          if (!latest) return e.lastmod;
          return e.lastmod > latest ? e.lastmod : latest;
        }, null),
    });
  }
  return _renderSitemapIndex(indexEntries);
}

/**
 * Generate a series of sitemap files for a large site.
 *
 * Returns an array of { name, content } objects representing
 * sitemap-1.xml, sitemap-2.xml, ... plus the index sitemap.xml.
 *
 * @param {Array} entries — same as generateSitemapXml
 * @param {object} [options] — same as generateSitemapXml
 * @returns {Array<{name: string, content: string}>}
 */
export function generateSitemapFiles(entries, options = {}) {
  const { baseUrl = "" } = options;

  const resolved = entries.map((entry) => {
    const url = entry.url.startsWith("http") ? entry.url : baseUrl + entry.url;
    const lastmod =
      formatLastmod(entry.lastmod) || fileLastmod(entry.filePath) || null;
    const priority = scoreToPriority(entry.score);
    const changefreq = determineChangefreq({
      publishedDate: entry.publishedDate,
      reviewedDate: entry.reviewedDate,
      filePath: entry.filePath,
    });
    return { url, lastmod, priority, changefreq };
  });

  const files = [];

  if (resolved.length <= MAX_URLS_PER_SITEMAP) {
    files.push({ name: "sitemap.xml", content: _renderUrlset(resolved) });
    return files;
  }

  const pages = Math.ceil(resolved.length / MAX_URLS_PER_SITEMAP);
  const indexEntries = [];

  for (let i = 0; i < pages; i++) {
    const chunk = resolved.slice(
      i * MAX_URLS_PER_SITEMAP,
      (i + 1) * MAX_URLS_PER_SITEMAP
    );
    files.push({
      name: `sitemap-${i + 1}.xml`,
      content: _renderUrlset(chunk),
    });
    indexEntries.push({
      url: files[files.length - 1].name,
      lastmod: chunk.reduce((latest, e) => {
        if (!e.lastmod) return latest;
        if (!latest) return e.lastmod;
        return e.lastmod > latest ? e.lastmod : latest;
      }, null),
    });
  }

  files.unshift({
    name: "sitemap.xml",
    content: _renderSitemapIndex(indexEntries),
  });

  return files;
}

// ═══════════════════════════════════════════════════════════════════════════
// Spec compliance validation
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validate a sitemap XML string for sitemap.org spec compliance.
 *
 * Checks: XML declaration, required namespaces, valid URLs in <loc>,
 * valid changefreq values, priority in [0.0, 1.0], and well-formed
 * date values in <lastmod>.
 *
 * @param {string} xml - sitemap XML content
 * @returns {{ valid: boolean, issues: string[] }}
 */
export function validateSitemapXml(xml) {
  const issues = [];

  // Check XML declaration
  if (!/^<\?xml\s+version="1\.0"/.test(xml)) {
    issues.push("Missing or invalid XML declaration.");
  }

  // Check for urlset or sitemapindex
  const isUrlset = xml.includes("<urlset");
  const isSitemapIndex = xml.includes("<sitemapindex");
  if (!isUrlset && !isSitemapIndex) {
    issues.push("Missing <urlset> or <sitemapindex> root element.");
  }

  // Check namespace
  if (!xml.includes("http://www.sitemaps.org/schemas/sitemap/0.9")) {
    issues.push("Missing required sitemap.org namespace.");
  }

  // For urlset: validate URLs
  if (isUrlset) {
    const locRegex = /<loc>([^<]+)<\/loc>/g;
    let match;
    while ((match = locRegex.exec(xml)) !== null) {
      const url = match[1];
      try {
        const parsed = new URL(url);
        if (!["http:", "https:"].includes(parsed.protocol)) {
          issues.push(`URL with invalid protocol: ${url}`);
        }
      } catch {
        issues.push(`Invalid URL in <loc>: ${url}`);
      }
    }

    // Validate changefreq values
    const cfRegex = /<changefreq>([^<]+)<\/changefreq>/g;
    while ((match = cfRegex.exec(xml)) !== null) {
      if (!VALID_CHANGEFREQ.has(match[1])) {
        issues.push(`Invalid changefreq value: ${match[1]}`);
      }
    }

    // Validate priority range
    const priRegex = /<priority>([^<]+)<\/priority>/g;
    while ((match = priRegex.exec(xml)) !== null) {
      const pri = parseFloat(match[1]);
      if (isNaN(pri) || pri < 0 || pri > 1) {
        issues.push(`Priority out of range [0.0, 1.0]: ${match[1]}`);
      }
    }

    // Validate lastmod format (YYYY-MM-DD)
    const lmRegex = /<lastmod>([^<]+)<\/lastmod>/g;
    while ((match = lmRegex.exec(xml)) !== null) {
      const d = new Date(match[1]);
      if (isNaN(d.getTime())) {
        issues.push(`Invalid lastmod date: ${match[1]}`);
      }
    }
  }

  return { valid: issues.length === 0, issues };
}

// ═══════════════════════════════════════════════════════════════════════════
// Internal XML rendering
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Render a standard urlset.
 * @param {Array} entries
 * @returns {string}
 */
function _renderUrlset(entries) {
  const lines = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"'
  );
  lines.push('         xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">');

  for (const entry of entries) {
    lines.push("  <url>");
    lines.push(`    <loc>${xmlEscape(entry.url)}</loc>`);
    if (entry.lastmod) {
      lines.push(`    <lastmod>${entry.lastmod}</lastmod>`);
    }
    lines.push(`    <changefreq>${entry.changefreq}</changefreq>`);
    lines.push(`    <priority>${entry.priority.toFixed(1)}</priority>`);

    if (entry.images) {
      for (const img of entry.images) {
        lines.push("    <image:image>");
        lines.push(`      <image:loc>${xmlEscape(img.loc)}</image:loc>`);
        if (img.caption) {
          lines.push(
            `      <image:caption>${xmlEscape(img.caption)}</image:caption>`
          );
        }
        if (img.title) {
          lines.push(
            `      <image:title>${xmlEscape(img.title)}</image:title>`
          );
        }
        lines.push("    </image:image>");
      }
    }

    lines.push("  </url>");
  }

  lines.push("</urlset>");
  lines.push(""); // trailing newline
  return lines.join("\n");
}

/**
 * Render a sitemap index for large sites.
 * @param {Array<{url: string, lastmod: string|null}>} entries
 * @returns {string}
 */
function _renderSitemapIndex(entries) {
  const lines = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
  );

  for (const entry of entries) {
    lines.push("  <sitemap>");
    lines.push(`    <loc>${xmlEscape(entry.url)}</loc>`);
    if (entry.lastmod) {
      lines.push(`    <lastmod>${entry.lastmod}</lastmod>`);
    }
    lines.push("  </sitemap>");
  }

  lines.push("</sitemapindex>");
  lines.push("");
  return lines.join("\n");
}
