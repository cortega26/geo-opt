import fs from "fs";
import path from "path";
import { cleanMarkdownToPlainText, cleanHtmlText, extractSections } from "./text.js";
import { extractPageMetadata } from "./llms-txt.js";
import { getNoBrandingError, hasProEntitlement, LICENSE_ENV_VAR } from "./integrity.js";

export const TOOLTICIAN_BRANDING_MARKDOWN =
  "Optimized with [Tooltician](https://www.tooltician.com)";
export const TOOLTICIAN_BRANDING_HTML =
  '<div class="geo-signature"><p>Optimized with <a href="https://www.tooltician.com">Tooltician</a></p></div>';
export const COMMUNITY_SCHEMA_TYPES = new Set(["article", "news-article", "faq", "product"]);
export const PRO_SCHEMA_TYPES = new Set(["course", "event", "recipe", "howto"]);
const SUPPORTED_SCHEMA_TYPES = new Set([...COMMUNITY_SCHEMA_TYPES, ...PRO_SCHEMA_TYPES]);

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

/**
 * Validate that a target path resolves inside the current working directory.
 * Batch-safe: returns a result object instead of calling process.exit.
 *
 * @param {string} filepath
 * @returns {{ valid: true, targetRealPath: string, cwdRealPath: string } | { valid: false, error: string }}
 */
export function validateWritableTargetInsideCwd(filepath) {
  let targetRealPath;
  let cwdRealPath;
  try {
    targetRealPath = fs.realpathSync(filepath);
    cwdRealPath = fs.realpathSync(process.cwd());
  } catch (e) {
    return { valid: false, error: `Failed to resolve real path for ${filepath}: ${e.message}` };
  }

  if (!isInsideDirectory(targetRealPath, cwdRealPath)) {
    return {
      valid: false,
      error: `Security restriction — target file ${filepath} resolves outside the current working directory. Run the command from the target directory, or copy the file into the current working directory.`,
    };
  }

  return { valid: true, targetRealPath, cwdRealPath };
}

export function assertWritableTargetInsideCwd(filepath) {
  const result = validateWritableTargetInsideCwd(filepath);
  // Nota: en modo no-estricto (strictNullChecks desactivado) el narrowing por
  // falsiness de un booleano no excluye el miembro `false` — ni `!valid` ni
  // `valid === false` funcionan (verificado en TS 5.9 y 7.0). `!== true` sí.
  if (result.valid !== true) {
    throw new Error(result.error);
  }
  return { targetRealPath: result.targetRealPath, cwdRealPath: result.cwdRealPath };
}

/**
 * Validate that a new file's parent directory is inside the CWD.
 * Batch-safe: returns a result object instead of calling process.exit.
 *
 * @param {string} filepath
 * @returns {{ valid: true, parentRealPath: string, cwdRealPath: string } | { valid: false, error: string }}
 */
export function validateNewFileParentInsideCwd(filepath) {
  let parentRealPath;
  let cwdRealPath;
  try {
    parentRealPath = fs.realpathSync(path.dirname(filepath));
    cwdRealPath = fs.realpathSync(process.cwd());
  } catch (e) {
    return { valid: false, error: `Failed to resolve real path for ${filepath}: ${e.message}` };
  }

  if (!isInsideDirectory(parentRealPath, cwdRealPath)) {
    return {
      valid: false,
      error: `Security restriction — output path ${filepath} resolves outside the current working directory. Run the command from the target directory, or copy the file into the current working directory.`,
    };
  }

  return { valid: true, parentRealPath, cwdRealPath };
}

export function assertNewFileParentInsideCwd(filepath) {
  const result = validateNewFileParentInsideCwd(filepath);
  // Mismo patrón que assertWritableTargetInsideCwd: ver nota de narrowing.
  if (result.valid !== true) {
    throw new Error(result.error);
  }
  return { parentRealPath: result.parentRealPath, cwdRealPath: result.cwdRealPath };
}

/**
 * Validate that an output directory (which may not exist yet) resolves inside
 * the current working directory. Realpath-resolves the nearest existing
 * ancestor so symlinked parents cannot escape. Batch-safe: returns a result.
 *
 * @param {string} dirPath
 * @returns {{ valid: true } | { valid: false, error: string }}
 */
export function validateOutputDirInsideCwd(dirPath) {
  const resolved = path.resolve(dirPath);
  let probe = resolved;
  while (!fs.existsSync(probe)) {
    const parent = path.dirname(probe);
    if (parent === probe) break;
    probe = parent;
  }
  let ancestorRealPath;
  let cwdRealPath;
  try {
    ancestorRealPath = fs.realpathSync(probe);
    cwdRealPath = fs.realpathSync(process.cwd());
  } catch (e) {
    return { valid: false, error: `Failed to resolve real path for ${dirPath}: ${e.message}` };
  }
  const suffix = path.relative(probe, resolved);
  const target = suffix ? path.join(ancestorRealPath, suffix) : ancestorRealPath;
  if (!isInsideDirectory(target, cwdRealPath)) {
    return {
      valid: false,
      error: `Security restriction — output directory ${dirPath} resolves outside the current working directory. Run the command from the target directory, or copy the file into the current working directory.`,
    };
  }
  return { valid: true };
}

export function assertOutputDirInsideCwd(dirPath) {
  const result = validateOutputDirInsideCwd(dirPath);
  // Mismo patrón que assertWritableTargetInsideCwd: ver nota de narrowing.
  if (result.valid !== true) {
    throw new Error(result.error);
  }
}

function extractListItems(rawText) {
  const items = [];
  for (const line of rawText.split("\n")) {
    const m = line.match(/^[-*+]\s+(.+)$/);
    if (m) items.push(m[1].trim());
  }
  return items;
}

function extractNumberedSteps(rawText) {
  const steps = [];
  for (const line of rawText.split("\n")) {
    const m = line.match(/^\d+\.\s+(.+)$/);
    if (m) steps.push(m[1].trim());
  }
  return steps;
}

// Extract the raw body of a named markdown section (preserves list markers).
function extractRawSection(rawContent, ...names) {
  const lower = names.map((n) => n.toLowerCase());
  const lines = rawContent.split("\n");
  let inSection = false;
  let sectionDepth = 0;
  const bodyLines = [];
  for (const line of lines) {
    const hm = line.match(/^(#{1,6})\s+(.+)$/);
    if (hm) {
      const level = hm[1].length;
      const header = hm[2].trim().toLowerCase();
      if (!inSection && lower.includes(header) && level >= 2) {
        inSection = true;
        sectionDepth = level;
        continue;
      }
      if (inSection && level <= sectionDepth) {
        break;
      }
    }
    if (inSection) bodyLines.push(line);
  }
  return bodyLines.join("\n");
}

function buildCourseNodes(
  title,
  description,
  config,
  pubUrl,
  orgNode,
  orgId,
  authorNode,
  authorId
) {
  const courseId = optionalId(pubUrl, "course");
  /** @type {import("schema-dts").Course} */
  const courseNode = {
    "@type": "Course",
    name: title,
    ...(courseId ? { "@id": courseId } : {}),
  };
  if (description) courseNode.description = description;
  const providerName = config.course?.provider;
  if (providerName) {
    courseNode.provider = { "@type": "Organization", name: providerName };
  } else if (orgNode) {
    courseNode.provider = referenceOrInline(orgNode, orgId);
  }
  if (authorNode) courseNode.author = referenceOrInline(authorNode, authorId);
  return [courseNode];
}

function buildEventNodes(title, description, config, pubUrl, orgNode, orgId) {
  const eventConfig = config.event || {};
  const eventId = optionalId(pubUrl, "event");
  /** @type {import("schema-dts").Event} */
  const eventNode = {
    "@type": "Event",
    name: title,
    ...(eventId ? { "@id": eventId } : {}),
  };
  if (description) eventNode.description = description;
  if (eventConfig.startDate) eventNode.startDate = eventConfig.startDate;
  if (eventConfig.endDate) eventNode.endDate = eventConfig.endDate;
  if (eventConfig.location) {
    eventNode.location = { "@type": "Place", name: eventConfig.location };
  }
  if (orgNode) eventNode.organizer = referenceOrInline(orgNode, orgId);
  return [eventNode];
}

function buildRecipeNodes(title, description, content, config, pubUrl, authorNode, authorId) {
  const recipeConfig = config.recipe || {};
  const ingredientRaw = extractRawSection(
    content,
    "ingredients",
    "what you'll need",
    "what you need"
  );
  const ingredients = extractListItems(ingredientRaw);
  const instructionRaw = extractRawSection(
    content,
    "instructions",
    "steps",
    "method",
    "directions",
    "how to make"
  );
  let stepTexts = extractNumberedSteps(instructionRaw);
  if (stepTexts.length === 0) stepTexts = extractListItems(instructionRaw);
  const recipeId = optionalId(pubUrl, "recipe");
  /** @type {import("schema-dts").Recipe} */
  const recipeNode = {
    "@type": "Recipe",
    name: title,
    recipeIngredient: ingredients,
    recipeInstructions: stepTexts.map((text, i) => ({
      "@type": "HowToStep",
      position: i + 1,
      text,
    })),
    ...(recipeId ? { "@id": recipeId } : {}),
  };
  if (description) recipeNode.description = description;
  if (recipeConfig.totalTime) recipeNode.totalTime = recipeConfig.totalTime;
  if (recipeConfig.recipeYield) recipeNode.recipeYield = recipeConfig.recipeYield;
  if (recipeConfig.recipeCategory) recipeNode.recipeCategory = recipeConfig.recipeCategory;
  if (authorNode) recipeNode.author = referenceOrInline(authorNode, authorId);
  return [recipeNode];
}

function buildHowToNodes(title, description, content, config, pubUrl) {
  const howtoConfig = config.howto || {};
  const sections = extractSections(content);
  const skippedHeaders = new Set([
    "introduction",
    "overview",
    "summary",
    "conclusion",
    "references",
    "sources",
    "bibliography",
  ]);
  // Los pasos derivados de secciones usan {name, text}; el fallback de pasos
  // numerados usa {position, text}. Ambas son formas HowToStep válidas según
  // Schema.org — el fallback no debe sintetizar un `name` (gobernanza: nunca
  // inferir contenido).
  /** @type {Array<import("schema-dts").HowToStep>} */
  let stepNodes = sections
    .filter((s) => !skippedHeaders.has(s.header.toLowerCase()))
    .map((s) => ({
      "@type": "HowToStep",
      name: s.header,
      text: cleanMarkdownToPlainText(s.body),
    }));
  if (stepNodes.length === 0) {
    stepNodes = extractNumberedSteps(content).map((text, i) => ({
      "@type": "HowToStep",
      position: i + 1,
      text,
    }));
  }
  const howtoId = optionalId(pubUrl, "howto");
  /** @type {import("schema-dts").HowTo} */
  const howtoNode = {
    "@type": "HowTo",
    name: title,
    step: stepNodes,
    ...(howtoId ? { "@id": howtoId } : {}),
  };
  if (description) howtoNode.description = description;
  if (howtoConfig.totalTime) howtoNode.totalTime = howtoConfig.totalTime;
  if (howtoConfig.estimatedCost) howtoNode.estimatedCost = howtoConfig.estimatedCost;
  return [howtoNode];
}

// _content is an optional pre-read file body. When provided, the file
// existence check and read are skipped — the caller (injectSchema) has
// already read the file once to avoid double I/O.
export function generateSchemaData(filepath, schemaType, config, _content = null) {
  const types = String(schemaType)
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);

  if (types.length === 0) {
    throw new Error(
      "Schema type is required. Community types: article, news-article, faq, product. Pro types: course, event, recipe, howto."
    );
  }

  for (const type of types) {
    if (!SUPPORTED_SCHEMA_TYPES.has(type)) {
      throw new Error(
        `Unsupported schema type "${type}". Community types: article, news-article, faq, product. Pro types: course, event, recipe, howto.`
      );
    }
    if (PRO_SCHEMA_TYPES.has(type) && !hasProEntitlement(config)) {
      throw new Error(
        `Schema type "${type}" requires a Tooltician Pro license. ` +
          `Set ${LICENSE_ENV_VAR} or license.key in geo_config.json to unlock Pro types: course, event, recipe, howto.`
      );
    }
  }

  let content = _content;
  if (content === null) {
    if (!fs.existsSync(filepath)) {
      throw new Error(`File ${filepath} not found.`);
    }

    try {
      content = fs.readFileSync(filepath, { encoding: "utf8", flag: "r" });
    } catch (e) {
      throw new Error(`Failed to read file ${filepath}: ${e.message}`, { cause: e });
    }
  }

  const { title: rawTitle, description } = extractPageMetadata(content, filepath);
  const title = cleanHtmlText(rawTitle) || rawTitle;

  const authorInfo = config.author || {};
  const pubInfo = config.publisher || {};

  const pubUrl =
    typeof pubInfo.url === "string" && pubInfo.url.trim()
      ? pubInfo.url.trim().replace(/\/+$/, "")
      : "";
  const orgId = optionalId(pubUrl, "organization");
  const authorId = optionalId(pubUrl, "author");
  /** @type {Array<import("schema-dts").Thing>} */
  const graphNodes = [];

  /** @type {import("schema-dts").Organization} */
  let orgNode = null;
  if (pubInfo.name || pubUrl) {
    orgNode = {
      "@type": "Organization",
      ...(orgId ? { "@id": orgId } : {}),
    };
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

  /** @type {import("schema-dts").Person} */
  let authorNode = null;
  if (authorInfo.name) {
    authorNode = {
      "@type": "Person",
      name: authorInfo.name,
      ...(authorId ? { "@id": authorId } : {}),
    };
    if (authorInfo.jobTitle) authorNode.jobTitle = authorInfo.jobTitle;
    if (authorInfo.sameAs) authorNode.sameAs = authorInfo.sameAs;
    if (authorId) graphNodes.push(authorNode);
  }

  for (const type of types) {
    if (type === "article") {
      const articleId = optionalId(pubUrl, "article");
      /** @type {import("schema-dts").Article} */
      const articleNode = {
        "@type": "Article",
        headline: title,
        ...(articleId ? { "@id": articleId } : {}),
      };
      if (description) articleNode.description = description;
      if (config.datePublished) articleNode.datePublished = config.datePublished;
      if (authorNode) articleNode.author = referenceOrInline(authorNode, authorId);
      if (orgNode) articleNode.publisher = referenceOrInline(orgNode, orgId);
      graphNodes.push(articleNode);
    } else if (type === "news-article") {
      if (!config.datePublished) {
        throw new Error(
          'Schema type "news-article" requires config.datePublished (ISO 8601 date, e.g. "2026-06-27"). ' +
            'Use "article" for general content that is not time-sensitive news.'
        );
      }
      const newsId = optionalId(pubUrl, "article");
      /** @type {import("schema-dts").NewsArticle} */
      const newsNode = {
        "@type": "NewsArticle",
        headline: title,
        datePublished: config.datePublished,
        ...(newsId ? { "@id": newsId } : {}),
      };
      if (description) newsNode.description = description;
      if (config.dateModified) newsNode.dateModified = config.dateModified;
      if (authorNode) newsNode.author = referenceOrInline(authorNode, authorId);
      if (orgNode) newsNode.publisher = referenceOrInline(orgNode, orgId);
      graphNodes.push(newsNode);
    } else if (type === "faq") {
      const sections = extractSections(content);
      /** @type {Array<import("schema-dts").Question>} */
      const qaList = [];
      for (const section of sections.slice(0, 5)) {
        const header = section.header.trim();
        if (
          section.body.length < 15 ||
          ["sources", "references", "citations", "bibliography"].includes(header.toLowerCase()) ||
          !header.endsWith("?")
        ) {
          continue;
        }
        qaList.push({
          "@type": "Question",
          name: header,
          acceptedAnswer: {
            "@type": "Answer",
            text: cleanMarkdownToPlainText(section.body),
          },
        });
      }
      const faqId = optionalId(pubUrl, "faq");
      // schema-dts tipa FAQPage.mainEntity como `Question | ItemList`; el
      // generador emite deliberadamente un array de Questions (guía de datos
      // estructurados de Google para FAQPage). Excepción estrecha, documentada:
      /** @type {import("schema-dts").FAQPage & { mainEntity?: Array<import("schema-dts").Question> }} */
      const faqNode = {
        "@type": "FAQPage",
        mainEntity: qaList,
        ...(faqId ? { "@id": faqId } : {}),
      };
      graphNodes.push(faqNode);
    } else if (type === "product") {
      const productId = optionalId(pubUrl, "product");
      /** @type {import("schema-dts").Product} */
      const productNode = {
        "@type": "Product",
        name: title,
        ...(productId ? { "@id": productId } : {}),
      };
      if (description) productNode.description = description;
      if (orgNode) productNode.brand = referenceOrInline(orgNode, orgId);

      const offerInfo = config.product?.offer;
      if (offerInfo?.price !== undefined && offerInfo?.priceCurrency) {
        // schema-dts tipa Offer.availability como la unión enumerada
        // ItemAvailability, pero el esquema zod acepta cualquier string
        // (proporcionado por el usuario, nunca inferido). Ampliar solo esa
        // propiedad, nunca el @type.
        /** @type {import("schema-dts").Offer & { availability?: string }} */
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
    } else if (type === "course") {
      graphNodes.push(
        ...buildCourseNodes(
          title,
          description,
          config,
          pubUrl,
          orgNode,
          orgId,
          authorNode,
          authorId
        )
      );
    } else if (type === "event") {
      graphNodes.push(...buildEventNodes(title, description, config, pubUrl, orgNode, orgId));
    } else if (type === "recipe") {
      graphNodes.push(
        ...buildRecipeNodes(title, description, content, config, pubUrl, authorNode, authorId)
      );
    } else if (type === "howto") {
      graphNodes.push(...buildHowToNodes(title, description, content, config, pubUrl));
    }
  }

  // En schema-dts 2.x `Graph` es el nodo raíz en sí (lleva @context).
  /** @type {import("schema-dts").Graph} */
  return {
    "@context": "https://schema.org",
    "@graph": graphNodes,
  };
}

/**
 * Build the injected content by merging schema JSON-LD and optional branding
 * into the file body. Pure function — no I/O, no process.exit.
 *
 * @param {string} content - raw file content
 * @param {string} filepath - used to detect HTML vs Markdown
 * @param {object} schema - generated schema data object
 * @param {object} options
 * @param {boolean} [options.noBranding=false]
 * @returns {{ content: string, replaced: boolean }} modified content and whether an existing tag was replaced
 */
export function buildInjectedContent(content, filepath, schema, options = {}) {
  const noBranding = options.noBranding ?? false;
  const schemaJson = JSON.stringify(schema, null, 2).replace(/<\//g, "<\\/");

  const schemaPattern = /```json\s*\{\s*"@context":\s*"https:\/\/schema\.org"[\s\S]*?\}\s*```/;
  const scriptPattern =
    /<script\b(?=[^>]*\btype\s*=\s*(["']?)application\/ld\+json\1)[^>]*>[\s\S]*?<\/script>/i;

  content = stripToolticianBranding(content);
  const sigMd = noBranding ? "" : `\n\n${TOOLTICIAN_BRANDING_MARKDOWN}\n`;
  const sigHtml = noBranding ? "" : `\n${TOOLTICIAN_BRANDING_HTML}\n`;

  const isHtml = filepath.endsWith(".html") || content.toLowerCase().includes("<html");
  let replaced = false;

  if (isHtml) {
    const injectedCode = `${sigHtml}\n<script type="application/ld+json">\n${schemaJson}\n</script>\n`;
    if (scriptPattern.test(content)) {
      content = content.replace(scriptPattern, injectedCode.trim());
      replaced = true;
    } else if (/<\/head>/i.test(content)) {
      content = content.replace(/<\/head>/i, `${injectedCode}</head>`);
    } else if (/<\/body>/i.test(content)) {
      content = content.replace(/<\/body>/i, `${injectedCode}</body>`);
    } else {
      content += injectedCode;
    }
  } else {
    const injectedCode = `${sigMd}\n\`\`\`json\n${schemaJson}\n\`\`\`\n`;
    if (schemaPattern.test(content)) {
      content = content.replace(schemaPattern, injectedCode.trim());
      replaced = true;
    } else {
      content += injectedCode;
    }
  }

  return { content, replaced };
}

export function injectSchema(filepath, schemaType, config, options = {}) {
  const normalizedOptions = typeof options === "boolean" ? { dryRun: options } : options;
  const dryRun = normalizedOptions.dryRun ?? false;
  const noBranding = normalizedOptions.noBranding ?? false;

  if (noBranding) {
    const entitlementError = getNoBrandingError(config);
    if (entitlementError) {
      throw new Error(entitlementError);
    }
  }

  if (!fs.existsSync(filepath)) {
    throw new Error(`File ${filepath} not found.`);
  }

  assertWritableTargetInsideCwd(filepath);

  // Read file once; pass to generateSchemaData to avoid double I/O.
  let content = "";
  try {
    content = fs.readFileSync(filepath, { encoding: "utf8", flag: "r" });
  } catch (e) {
    throw new Error(`Failed to read file ${filepath}: ${e.message}`, { cause: e });
  }

  const schema = generateSchemaData(filepath, schemaType, config, content);

  const { content: modifiedContent, replaced } = buildInjectedContent(content, filepath, schema, {
    noBranding,
  });

  const isHtml = filepath.endsWith(".html") || content.toLowerCase().includes("<html");
  let message;
  if (isHtml) {
    message = replaced
      ? `Successfully replaced existing JSON-LD script tag in ${filepath}.`
      : `Successfully injected JSON-LD script tag into ${filepath}.`;
  } else {
    message = replaced
      ? `Successfully updated existing Schema.org block in markdown file ${filepath}.`
      : `Successfully appended Schema.org block to markdown file ${filepath}.`;
  }

  if (dryRun) {
    // Reconstruct preview snippet for dry-run display
    const previewJson = JSON.stringify(schema, null, 2).replace(/<\//g, "<\\/");
    const previewSig = noBranding ? "" : `\n\n${TOOLTICIAN_BRANDING_MARKDOWN}\n`;
    const preview = `${previewSig}\n\`\`\`json\n${previewJson}\n\`\`\`\n`;
    const dryRunMessage = `=== DRY RUN: The following would be injected ===\n${preview}\n=== End of dry run preview ===`;
    return { replaced, dryRun: true, preview, message: dryRunMessage };
  }

  try {
    fs.writeFileSync(filepath, modifiedContent, { encoding: "utf8" });
  } catch (e) {
    throw new Error(`Failed to write to file ${filepath}: ${e.message}`, { cause: e });
  }

  return { replaced, dryRun: false, message };
}
