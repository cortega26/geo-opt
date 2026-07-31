import { parse as parseYaml } from "yaml";
import { marked } from "marked";
import * as cheerio from "cheerio";
import rs from "text-readability";

/**
 * Count syllables in Spanish text using phonetic rules.
 *
 * Spanish syllable rules are more regular than English:
 * - Each vowel group forms a syllable nucleus.
 * - Diphthongs (ia, ie, io, iu, ua, ue, ui, uo, ai, ei, oi, au, eu, ou)
 *   count as one syllable unless broken by hiatus.
 * - Hiatus occurs: two strong vowels (a, e, o) in a row, accented weak
 *   vowel (í, ú), or identical vowels.
 * - Triphthongs (iai, iei, uai, uei, etc.) count as one syllable.
 *
 * @param {string} text — raw Spanish text
 * @returns {number} estimated syllable count
 */
function countSpanishSyllables(text) {
  const STRONG = new Set(["a", "e", "o", "á", "é", "ó"]);
  const ALL_VOWELS = new Set(["a", "e", "i", "o", "u", "á", "é", "í", "ó", "ú", "ü"]);
  const ACCENTED_WEAK = new Set(["í", "ú"]);

  /** Two consecutive vowels form a hiatus (separate syllables) */
  function isHiatus(v1, v2) {
    // Two strong vowels → hiatus
    if (STRONG.has(v1) && STRONG.has(v2)) return true;
    // Same vowel repeated → hiatus (always separate in Spanish)
    if (v1 === v2) return true;
    // Accented weak vowel breaks diphthong
    if (ACCENTED_WEAK.has(v1) || ACCENTED_WEAK.has(v2)) return true;
    return false;
  }

  const words = text.toLowerCase().match(/[a-záéíóúü]+/gi) || [];
  let total = 0;

  for (const word of words) {
    let i = 0;
    let syll = 0;
    const chars = [...word]; // handle multi-byte chars

    while (i < chars.length) {
      if (ALL_VOWELS.has(chars[i])) {
        syll++;
        // Look ahead for consecutive vowels (diphthong / triphthong / hiatus)
        if (i + 1 < chars.length && ALL_VOWELS.has(chars[i + 1])) {
          // Triphthong candidate (3 consecutive vowels)
          if (i + 2 < chars.length && ALL_VOWELS.has(chars[i + 2])) {
            // Check each adjacent pair for hiatus
            if (isHiatus(chars[i], chars[i + 1]) || isHiatus(chars[i + 1], chars[i + 2])) {
              // Hiatus within the triplet → count separately
              // chars[i] was already counted; handle chars[i+1] and chars[i+2]
              if (isHiatus(chars[i], chars[i + 1])) {
                i++; // hiatus at i→i+1: i+1 is its own syllable
                // now check i+1→i+2
                if (isHiatus(chars[i], chars[i + 1])) {
                  i++; // also hiatus → separate
                } else {
                  i += 2; // diphthong at i+1→i+2
                }
              } else {
                // no hiatus at i→i+1, but hiatus at i+1→i+2
                i += 2; // i→i+1 is a diphthong, i+2 next syllable
              }
            } else {
              // No hiatus → triphthong (one syllable)
              i += 3;
            }
          } else if (isHiatus(chars[i], chars[i + 1])) {
            // Diphthong but with hiatus → separate syllables
            i++; // chars[i] counted, chars[i+1] next iteration
          } else {
            // Regular diphthong → one syllable
            i += 2;
          }
        } else {
          i++;
        }
      } else {
        i++;
      }
    }
    total += Math.max(1, syll);
  }
  return total;
}

/**
 * Fernández-Huerta readability score for Spanish text.
 * Adaptation of Flesch Reading Ease for Spanish (1959).
 *
 * Formula: 206.84 − 1.02 × (words/sentences) − 60.0 × (syllables/words)
 *
 * @param {number} wordCount
 * @param {number} sentenceCount
 * @param {number} syllableCount
 * @returns {number}
 */
function fernandezHuerta(wordCount, sentenceCount, syllableCount) {
  if (sentenceCount === 0 || wordCount === 0) return 0;
  return 206.84 - 1.02 * (wordCount / sentenceCount) - 60.0 * (syllableCount / wordCount);
}

/**
 * Szigriszt-Pazos perspicuity index for Spanish text (1993).
 *
 * Formula: 207 − 62.3 × (syllables/words) − (words/sentences)
 *
 * @param {number} wordCount
 * @param {number} sentenceCount
 * @param {number} syllableCount
 * @returns {number}
 */
function szigrisztPazos(wordCount, sentenceCount, syllableCount) {
  if (sentenceCount === 0 || wordCount === 0) return 0;
  return 207 - 62.3 * (syllableCount / wordCount) - wordCount / sentenceCount;
}

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
  let html = ($("body").length ? $("body").html() : $.root().html()) || "";

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

export function calculateReadability(text, { lang = null } = {}) {
  const sentences = text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const words = text.match(/\b\w+\b/g) || [];

  if (sentences.length === 0 || words.length === 0) {
    return {
      wordCount: 0,
      avgSentenceLen: 0,
      fleschReadingEase: null,
      fleschKincaidGrade: null,
      gunningFog: null,
      fernandezHuerta: null,
      szigrisztPazos: null,
      readingGradeNote: null,
    };
  }

  const base = {
    wordCount: words.length,
    avgSentenceLen: words.length / sentences.length,
  };

  const isEnglish = lang ? /^en(-|$)/i.test(lang) : false;
  const isSpanish = lang ? /^es(-|$)/i.test(lang) : false;

  if (isEnglish) {
    const fullText = words.join(" ");
    return {
      ...base,
      fleschReadingEase: rs.fleschReadingEase(fullText),
      fleschKincaidGrade: rs.fleschKincaidGrade(fullText),
      gunningFog: rs.gunningFog(fullText),
      fernandezHuerta: null,
      szigrisztPazos: null,
      readingGradeNote: null,
    };
  }

  if (isSpanish) {
    const fullText = words.join(" ");
    const syllableCount = countSpanishSyllables(fullText);
    return {
      ...base,
      fleschReadingEase: null,
      fleschKincaidGrade: null,
      gunningFog: null,
      fernandezHuerta: fernandezHuerta(words.length, sentences.length, syllableCount),
      szigrisztPazos: szigrisztPazos(words.length, sentences.length, syllableCount),
      readingGradeNote: null,
    };
  }

  // Unknown language — return base metrics without grade indices
  return {
    ...base,
    fleschReadingEase: null,
    fleschKincaidGrade: null,
    gunningFog: null,
    fernandezHuerta: null,
    szigrisztPazos: null,
    readingGradeNote: lang
      ? "Reading-grade indices are not available for the detected language."
      : "Language unknown; reading-grade indices omitted. Pass 'lang' (e.g. 'en' or 'es') to enable them.",
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
 * @returns {{ data: Record<string, unknown>, body: string }}
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
