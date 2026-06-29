import { parse as parseYaml } from "yaml";
import { marked } from "marked";
import * as cheerio from "cheerio";

export function cleanHtmlText(value) {
  const $ = cheerio.load(value);
  return $.text().replace(/\s+/g, " ").trim();
}

export function truncateDescription(description, maxLen = 150) {
  if (!description) return "";
  return description.length > maxLen ? `${description.slice(0, maxLen - 3)}...` : description;
}

/**
 * Detecta si el contenido es HTML (en lugar de Markdown).
 * @param {string} content
 * @returns {boolean}
 */
export function isHtmlContent(content) {
  return (
    /^\s*<!DOCTYPE\s/i.test(content) ||
    /<html[\s>]/i.test(content) ||
    /<(?:head|body|meta|link|script|style|div|span|p|a|img|table|ul|ol|li|h[1-6]|header|footer|main|nav|section|article)[\s>]/i.test(
      content
    )
  );
}

/**
 * Extrae texto visible de HTML usando cheerio, normalizando whitespace
 * y separando elementos de bloque con saltos de párrafo.
 *
 * También retorna metadatos estructurales (headings, listas, tablas)
 * para que el scoring no dependa de marked AST cuando el contenido es HTML.
 *
 * @param {string} rawHtml — HTML crudo (minificado o no)
 * @returns {{ textContent: string, headingCount: number, h2h3Count: number, listCount: number, tableCount: number }}
 */
export function extractHtmlVisibleText(rawHtml) {
  const $ = cheerio.load(rawHtml);

  // Remover elementos no-visibles antes de extraer texto
  $("script, style, noscript, meta, link, head").remove();

  // Contar estructura con cheerio (antes de aplanar el texto)
  const headingCount = $("h1, h2, h3, h4, h5, h6").length;
  const h2h3Count = $("h2, h3").length;
  const listCount = $("ul, ol").length;
  const tableCount = $("table").length;

  // Obtener HTML del body (o del root si no hay body)
  const bodyEl = $("body").length ? $("body") : $.root();
  let html = bodyEl.html() || "";

  // Insertar saltos de párrafo en cierres de elementos de bloque
  // para que getParagraphLengths() y observeAnswerFirst() funcionen correctamente
  html = html.replace(
    /<\/(?:p|div|section|article|header|footer|main|nav|aside|h[1-6]|li|blockquote|pre|figure|figcaption|table|tr|form|fieldset|details|summary|address|ol|ul|dl|dt|dd)\s*>/gi,
    "\n\n"
  );
  html = html.replace(/<br\s*\/?>/gi, "\n");

  // Extraer texto plano
  const textContent = cheerio
    .load(html)
    .text()
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .trim();

  return {
    textContent,
    headingCount,
    h2h3Count,
    listCount,
    tableCount,
  };
}

export function calculateReadability(text) {
  const sentences = text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const words = text.match(/\b\w+\b/g) || [];

  if (sentences.length === 0 || words.length === 0) {
    return { wordCount: 0, avgSentenceLen: 0 };
  }

  return {
    wordCount: words.length,
    avgSentenceLen: words.length / sentences.length,
  };
}

/**
 * Split leading YAML frontmatter from a document.
 *
 * Tolerant: missing or invalid YAML yields { data: {}, body: content }
 * without throwing. Supports the `...` closing delimiter and multi-document
 * YAML (only the first document is parsed for metadata).
 *
 * @param {string} content — raw file content
 * @returns {{ data: object, body: string }}
 */
export function parseFrontmatter(content) {
  // Normalize a leading BOM only for detection; keep body bytes intact.
  const text = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;

  // Frontmatter must be the very first thing in the file.
  if (!/^---[\t ]*\r?\n/.test(text)) {
    return { data: {}, body: content };
  }

  // Find the closing delimiter line: a line that is exactly --- or ...
  const close = text.search(/\r?\n(?:---|\.\.\.)[\t ]*(?:\r?\n|$)/);
  if (close === -1) {
    return { data: {}, body: content };
  }

  // Extract the raw YAML block (text between opening --- and closing delimiter)
  const rawBlock = text.slice(text.indexOf("\n") + 1, close);
  const afterMatch = text.slice(close).match(/\r?\n(?:---|\.\.\.)[\t ]*(?:\r?\n|$)/);
  const body = text.slice(close + afterMatch[0].length);

  let data = {};
  try {
    const parsed = parseYaml(rawBlock);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      data = parsed;
    }
  } catch {
    // Invalid YAML — treat as no usable metadata, but still strip the block.
  }

  return { data, body };
}

/**
 * Preprocess content for scoring and analysis.
 *
 * Strips YAML frontmatter (via parseFrontmatter), fenced code blocks,
 * HTML script/style tags, and HTML comments so they do not inflate
 * word counts, quote/statistic detection, or heading parsing.
 *
 * @param {string} content — raw file content
 * @returns {string} cleaned content
 */
export function preprocessContent(content) {
  let { body: text } = parseFrontmatter(content);

  // Strip markdown code blocks
  text = text.replace(/```[\s\S]*?```/g, "");
  // Strip HTML script and style tags
  text = text.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "");
  // Strip HTML comments
  text = text.replace(/<!--[\s\S]*?-->/g, "");
  return text;
}

export function cleanMarkdownToPlainText(mdText) {
  const tokens = marked.lexer(mdText);

  // Extract plain text from a token or token array into a separate buffer.
  function extractText(tok, into) {
    if (typeof tok === "string") {
      into.push(tok);
    } else if (Array.isArray(tok)) {
      for (const t of tok) extractText(t, into);
    } else if (tok && typeof tok === "object") {
      if (tok.type === "text") {
        into.push(tok.text);
      } else if (tok.type === "link") {
        if (tok.tokens) extractText(tok.tokens, into);
        else if (tok.text) into.push(tok.text);
      } else if (tok.type === "image") {
        if (tok.text) into.push(tok.text);
      } else if (tok.type === "codespan") {
        into.push(tok.text);
      } else if (tok.type === "strong" || tok.type === "em" || tok.type === "del") {
        if (tok.tokens) extractText(tok.tokens, into);
        else if (tok.text) into.push(tok.text);
      } else if (tok.type === "html") {
        into.push(tok.text.replace(/<[^>]+>/g, ""));
      } else if (tok.type === "br") {
        into.push("\n");
      } else if (tok.type === "paragraph") {
        if (tok.tokens) extractText(tok.tokens, into);
        else if (tok.text) into.push(tok.text);
        into.push("\n");
      } else if (tok.type === "list") {
        for (const item of tok.items) {
          if (item.tokens) extractText(item.tokens, into);
          into.push("\n");
        }
      } else if (tok.type === "table") {
        for (const row of [tok.header, ...tok.rows]) {
          const cellTexts = row.map((cell) => {
            const cellParts = [];
            if (cell.tokens) extractText(cell.tokens, cellParts);
            return cellParts.join("").trim() || cell.text;
          });
          into.push(cellTexts.join(" - "));
          into.push("\n");
        }
      } else if (tok.type === "space") {
        into.push("\n");
      } else if (tok.tokens) {
        extractText(tok.tokens, into);
      }
    }
  }

  const parts = [];
  extractText(tokens, parts);
  // Strip any remaining HTML tags, normalize horizontal whitespace, and trim
  return parts
    .join("")
    .replace(/<[^>]+>/g, "")
    .replace(/[ \t]+/g, " ")
    .trim();
}

export function extractSections(content) {
  const cleanContent = preprocessContent(content);
  const tokens = marked.lexer(cleanContent);
  const sections = [];
  let currentHeader = null;
  let currentText = [];

  for (const token of tokens) {
    if (token.type === "heading" && token.depth >= 2) {
      if (currentHeader) {
        sections.push({ header: currentHeader, body: currentText.join("\n").trim() });
      }
      currentHeader = token.text;
      currentText = [];
    } else if (currentHeader !== null) {
      if (token.type === "paragraph" || token.type === "text") {
        currentText.push(token.text);
      } else if (token.type === "list") {
        for (const item of token.items) {
          currentText.push(item.text);
        }
      } else if (token.type === "blockquote") {
        currentText.push(token.text);
      } else if (token.type === "code") {
        currentText.push(token.text);
      } else if (token.type === "table") {
        const rows = [];
        for (const row of [token.header, ...token.rows]) {
          rows.push(row.map((cell) => cell.text).join(" | "));
        }
        currentText.push(rows.join("\n"));
      }
      // space tokens are ignored (whitespace between blocks)
    }
  }

  if (currentHeader) {
    sections.push({ header: currentHeader, body: currentText.join("\n").trim() });
  }

  return sections;
}
