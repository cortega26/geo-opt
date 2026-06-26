import fs from "fs";
import path from "path";
import * as cheerio from "cheerio";
import { preprocessContent, cleanMarkdownToPlainText, extractSections, cleanHtmlText, truncateDescription } from "./text.js";
import { getNoBrandingError } from "./licensing.js";

export const TOOLTICIAN_BRANDING_MARKDOWN = "Optimized with [Tooltician](https://www.tooltician.com)";
export const TOOLTICIAN_BRANDING_HTML =
  '<div class="geo-signature"><p>Optimized with <a href="https://www.tooltician.com">Tooltician</a></p></div>';
const SUPPORTED_SCHEMA_TYPES = new Set(["article", "faq", "product"]);

function optionalId(baseUrl, fragment) {
  return baseUrl ? `${baseUrl}/#${fragment}` : null;
}

function referenceOrInline(node, id) {
  return id ? { "@id": id } : node;
}

function stripToolticianBranding(content) {
  return content
    .replace(
      /\n{0,2}Optimized (?:by|with) \[Tooltician\]\(https?:\/\/(?:www\.)?tooltician\.com\/?\)\s*/gi,
      "\n"
    )
    .replace(
      /\s*<div[^>]*class=["'][^"']*\bgeo-signature\b[^"']*["'][^>]*>[\s\S]*?<\/div>\s*/gi,
      "\n"
    );
}

function isInsideDirectory(candidatePath, directoryPath) {
  const relativePath = path.relative(directoryPath, candidatePath);
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

export function assertWritableTargetInsideCwd(filepath) {
  let targetRealPath;
  let cwdRealPath;
  try {
    targetRealPath = fs.realpathSync(filepath);
    cwdRealPath = fs.realpathSync(process.cwd());
  } catch (e) {
    console.error(`Error: Failed to resolve real path for ${filepath}: ${e.message}`);
    process.exit(1);
    return;
  }

  if (!isInsideDirectory(targetRealPath, cwdRealPath)) {
    console.error(
      `Error: Security restriction — target file ${filepath} resolves outside the current working directory.`
    );
    process.exit(1);
    return;
  }

  return { targetRealPath, cwdRealPath };
}

export function assertNewFileParentInsideCwd(filepath) {
  let parentRealPath;
  let cwdRealPath;
  try {
    parentRealPath = fs.realpathSync(path.dirname(filepath));
    cwdRealPath = fs.realpathSync(process.cwd());
  } catch (e) {
    console.error(`Error: Failed to resolve real path for ${filepath}: ${e.message}`);
    process.exit(1);
    return;
  }

  if (!isInsideDirectory(parentRealPath, cwdRealPath)) {
    console.error(
      `Error: Security restriction — output path ${filepath} resolves outside the current working directory.`
    );
    process.exit(1);
    return;
  }

  return { parentRealPath, cwdRealPath };
}

// _content is an optional pre-read file body. When provided, the file
// existence check and read are skipped — the caller (injectSchema) has
// already read the file once to avoid double I/O.
export function generateSchemaData(filepath, schemaType, config, _content = null) {
  if (!SUPPORTED_SCHEMA_TYPES.has(schemaType)) {
    console.error(
      `Error: Unsupported schema type "${schemaType}". Expected article, faq, or product.`
    );
    process.exit(1);
    return;
  }

  let content = _content;
  if (content === null) {
    if (!fs.existsSync(filepath)) {
      console.error(`Error: File ${filepath} not found.`);
      process.exit(1);
      return;
    }

    try {
      content = fs.readFileSync(filepath, { encoding: "utf8", flag: "r" });
    } catch (e) {
      console.error(`Error: Failed to read file ${filepath}: ${e.message}`);
      process.exit(1);
      return;
    }
  }

  const cleanText = preprocessContent(content);

  // Try markdown H1 first, then HTML <h1>
  let titleMatch = cleanText.match(/^#\s+(.+)$/m);
  if (!titleMatch) {
    titleMatch = cleanText.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  }
  const title = titleMatch ? cleanHtmlText(titleMatch[1]) : "Untitled Document";

  const introMatch = cleanText.match(/^#\s+.+?\n\n([^#\n]+)/s);
  let description = introMatch ? cleanMarkdownToPlainText(introMatch[1].trim()) : "";
  if (!description && (filepath.endsWith(".html") || cleanText.toLowerCase().includes("<html"))) {
    // Use cheerio for reliable <meta name="description"> extraction
    // regardless of attribute order, and fall back to the first <p>.
    const $desc = cheerio.load(content);
    const metaDesc = $desc('meta[name="description"]').attr("content");
    if (metaDesc) {
      description = cleanHtmlText(metaDesc);
    }
    if (!description) {
      const firstParagraph = $desc("p").first().text();
      if (firstParagraph) {
        description = cleanHtmlText(firstParagraph);
      }
    }
  }
  description = truncateDescription(description);

  const authorInfo = config.author || {};
  const pubInfo = config.publisher || {};

  const pubUrl =
    typeof pubInfo.url === "string" && pubInfo.url.trim()
      ? pubInfo.url.trim().replace(/\/+$/, "")
      : "";
  const orgId = optionalId(pubUrl, "organization");
  const authorId = optionalId(pubUrl, "author");
  const graphNodes = [];

  let orgNode = null;
  if (pubInfo.name || pubUrl) {
    orgNode = {
      "@type": "Organization",
    };
    if (orgId) orgNode["@id"] = orgId;
    if (pubInfo.name) orgNode.name = pubInfo.name;
    if (pubUrl) orgNode.url = pubUrl;
    if (pubInfo.logo) {
      orgNode.logo = {
        "@type": "ImageObject",
        url: pubInfo.logo,
      };
    }
    if (orgId) graphNodes.push(orgNode);
  }

  let authorNode = null;
  if (authorInfo.name) {
    authorNode = {
      "@type": "Person",
      name: authorInfo.name,
    };
    if (authorId) authorNode["@id"] = authorId;
    if (authorInfo.jobTitle) authorNode.jobTitle = authorInfo.jobTitle;
    if (authorInfo.sameAs) authorNode.sameAs = authorInfo.sameAs;
    if (authorId) graphNodes.push(authorNode);
  }

  if (schemaType === "article") {
    const articleNode = {
      "@type": "NewsArticle",
      headline: title,
    };
    const articleId = optionalId(pubUrl, "article");
    if (articleId) articleNode["@id"] = articleId;
    if (description) articleNode.description = description;
    if (config.datePublished) articleNode.datePublished = config.datePublished;
    if (authorNode) articleNode.author = referenceOrInline(authorNode, authorId);
    if (orgNode) articleNode.publisher = referenceOrInline(orgNode, orgId);
    graphNodes.push(articleNode);

    // FAQ extraction
    const sections = extractSections(content);
    if (sections.length > 0) {
      const qaList = [];
      for (const section of sections.slice(0, 5)) {
        if (
          section.body.length < 15 ||
          ["sources", "references", "citations", "bibliography"].includes(
            section.header.toLowerCase()
          )
        ) {
          continue;
        }
        qaList.push({
          "@type": "Question",
          name: section.header,
          acceptedAnswer: {
            "@type": "Answer",
            text: cleanMarkdownToPlainText(section.body),
          },
        });
      }
      if (qaList.length > 0) {
        const faqNode = {
          "@type": "FAQPage",
          mainEntity: qaList,
        };
        const faqId = optionalId(pubUrl, "faq");
        if (faqId) faqNode["@id"] = faqId;
        graphNodes.push(faqNode);
      }
    }
  } else if (schemaType === "faq") {
    const sections = extractSections(content);
    const qaList = [];
    for (const section of sections.slice(0, 5)) {
      if (
        section.body.length < 15 ||
        ["sources", "references", "citations", "bibliography"].includes(
          section.header.toLowerCase()
        )
      ) {
        continue;
      }
      qaList.push({
        "@type": "Question",
        name: section.header,
        acceptedAnswer: {
          "@type": "Answer",
          text: cleanMarkdownToPlainText(section.body),
        },
      });
    }
    const faqNode = {
      "@type": "FAQPage",
      mainEntity: qaList,
    };
    const faqId = optionalId(pubUrl, "faq");
    if (faqId) faqNode["@id"] = faqId;
    graphNodes.push(faqNode);
  } else if (schemaType === "product") {
    const productNode = {
      "@type": "Product",
      name: title,
    };
    const productId = optionalId(pubUrl, "product");
    if (productId) productNode["@id"] = productId;
    if (description) productNode.description = description;
    if (orgNode) productNode.brand = referenceOrInline(orgNode, orgId);

    const offerInfo = config.product?.offer;
    if (offerInfo?.price !== undefined && offerInfo?.priceCurrency) {
      productNode.offers = {
        "@type": "Offer",
        price: String(offerInfo.price),
        priceCurrency: offerInfo.priceCurrency,
      };
      if (offerInfo.availability) {
        productNode.offers.availability = offerInfo.availability;
      }
      if (orgNode) {
        productNode.offers.seller = referenceOrInline(orgNode, orgId);
      }
    }
    graphNodes.push(productNode);
  }

  return {
    "@context": "https://schema.org",
    "@graph": graphNodes,
  };
}

export function injectSchema(filepath, schemaType, config, options = {}) {
  const normalizedOptions = typeof options === "boolean" ? { dryRun: options } : options;
  const dryRun = normalizedOptions.dryRun ?? false;
  const noBranding = normalizedOptions.noBranding ?? false;

  if (noBranding) {
    const entitlementError = getNoBrandingError(config);
    if (entitlementError) {
      console.error(`Error: ${entitlementError}`);
      process.exit(1);
      return;
    }
  }

  if (!fs.existsSync(filepath)) {
    console.error(`Error: File ${filepath} not found.`);
    process.exit(1);
    return;
  }

  if (!assertWritableTargetInsideCwd(filepath)) {
    return;
  }

  // Read file once; pass to generateSchemaData to avoid double I/O.
  let content = "";
  try {
    content = fs.readFileSync(filepath, { encoding: "utf8", flag: "r" });
  } catch (e) {
    console.error(`Error: Failed to read file ${filepath}: ${e.message}`);
    process.exit(1);
    return;
  }

  const schema = generateSchemaData(filepath, schemaType, config, content);
  // Escape "</" to prevent breaking out of <script> tags when
  // JSON-LD is embedded in HTML (SEC-03).
  const schemaJson = JSON.stringify(schema, null, 2).replace(/<\//g, "<\\/");

  const schemaPattern = /```json\s*\{\s*"@context":\s*"https:\/\/schema\.org"[\s\S]*?\}\s*```/;
  const scriptPattern =
    /<script\b(?=[^>]*\btype\s*=\s*(["']?)application\/ld\+json\1)[^>]*>[\s\S]*?<\/script>/i;

  content = stripToolticianBranding(content);
  const sigMd = noBranding ? "" : `\n\n${TOOLTICIAN_BRANDING_MARKDOWN}\n`;
  const sigHtml = noBranding ? "" : `\n${TOOLTICIAN_BRANDING_HTML}\n`;

  let injectedCode = `${sigMd}\n\`\`\`json\n${schemaJson}\n\`\`\`\n`;

  if (filepath.endsWith(".html") || content.toLowerCase().includes("<html")) {
    injectedCode = `${sigHtml}\n<script type="application/ld+json">\n${schemaJson}\n</script>\n`;
    if (scriptPattern.test(content)) {
      content = content.replace(scriptPattern, injectedCode.trim());
      console.log(`Successfully replaced existing JSON-LD script tag in ${filepath}.`);
    } else {
      if (/<\/head>/i.test(content)) {
        content = content.replace(/<\/head>/i, `${injectedCode}</head>`);
      } else if (/<\/body>/i.test(content)) {
        content = content.replace(/<\/body>/i, `${injectedCode}</body>`);
      } else {
        content += injectedCode;
      }
      console.log(`Successfully injected JSON-LD script tag into ${filepath}.`);
    }
  } else {
    if (schemaPattern.test(content)) {
      content = content.replace(schemaPattern, injectedCode.trim());
      console.log(`Successfully updated existing Schema.org block in markdown file ${filepath}.`);
    } else {
      content += injectedCode;
      console.log(`Successfully appended Schema.org block to markdown file ${filepath}.`);
    }
  }

  if (dryRun) {
    console.log("=== DRY RUN: The following would be injected ===");
    console.log(injectedCode);
    console.log("=== End of dry run preview ===");
    return;
  }

  try {
    fs.writeFileSync(filepath, content, { encoding: "utf8" });
  } catch (e) {
    console.error(`Error: Failed to write to file ${filepath}: ${e.message}`);
    process.exit(1);
    return;
  }
}
