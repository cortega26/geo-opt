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

export function preprocessContent(content) {
  // Strip markdown code blocks
  let text = content.replace(/```[\s\S]*?```/g, "");
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
