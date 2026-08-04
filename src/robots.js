import fs from "fs";
import chalk from "chalk";

export const CRAWLER_REGISTRY_VERSION = "2026-08-01";

const OPENAI_SOURCE = "https://developers.openai.com/api/docs/bots";
const ANTHROPIC_SOURCE =
  "https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler";
const PERPLEXITY_SOURCE = "https://docs.perplexity.ai/docs/resources/perplexity-crawlers";

export const AI_CRAWLER_REGISTRY = Object.freeze([
  {
    token: "GPTBot",
    provider: "OpenAI",
    purpose: "training",
    robotsApplicable: true,
    officialSource: OPENAI_SOURCE,
    lastVerified: CRAWLER_REGISTRY_VERSION,
  },
  {
    token: "ChatGPT-User",
    provider: "OpenAI",
    purpose: "user",
    robotsApplicable: false,
    officialSource: OPENAI_SOURCE,
    lastVerified: CRAWLER_REGISTRY_VERSION,
  },
  {
    token: "OAI-SearchBot",
    provider: "OpenAI",
    purpose: "search",
    robotsApplicable: true,
    officialSource: OPENAI_SOURCE,
    lastVerified: CRAWLER_REGISTRY_VERSION,
  },
  {
    token: "ClaudeBot",
    provider: "Anthropic",
    purpose: "training",
    robotsApplicable: true,
    officialSource: ANTHROPIC_SOURCE,
    lastVerified: CRAWLER_REGISTRY_VERSION,
  },
  {
    token: "Claude-SearchBot",
    provider: "Anthropic",
    purpose: "search",
    robotsApplicable: true,
    officialSource: ANTHROPIC_SOURCE,
    lastVerified: CRAWLER_REGISTRY_VERSION,
  },
  {
    token: "Claude-User",
    provider: "Anthropic",
    purpose: "user",
    robotsApplicable: true,
    officialSource: ANTHROPIC_SOURCE,
    lastVerified: CRAWLER_REGISTRY_VERSION,
  },
  {
    token: "PerplexityBot",
    provider: "Perplexity",
    purpose: "search",
    robotsApplicable: true,
    officialSource: PERPLEXITY_SOURCE,
    lastVerified: CRAWLER_REGISTRY_VERSION,
  },
  {
    token: "Perplexity-User",
    provider: "Perplexity",
    purpose: "user",
    robotsApplicable: false,
    officialSource: PERPLEXITY_SOURCE,
    lastVerified: CRAWLER_REGISTRY_VERSION,
  },
  {
    token: "Google-Extended",
    provider: "Google",
    purpose: "control",
    robotsApplicable: true,
    officialSource:
      "https://developers.google.com/crawling/docs/crawlers-fetchers/google-common-crawlers#google-extended",
    lastVerified: CRAWLER_REGISTRY_VERSION,
  },
  {
    token: "Applebot-Extended",
    provider: "Apple",
    purpose: "control",
    robotsApplicable: true,
    officialSource: "https://support.apple.com/en-us/119829",
    lastVerified: CRAWLER_REGISTRY_VERSION,
  },
  {
    token: "meta-externalagent", // forma canónica oficial (case-insensitive en robots.txt)
    provider: "Meta",
    purpose: "training",
    robotsApplicable: true,
    officialSource: "https://developers.facebook.com/docs/sharing/webmasters/web-crawlers/",
    lastVerified: CRAWLER_REGISTRY_VERSION,
  },
  {
    token: "Bytespider",
    provider: "ByteDance",
    purpose: "legacy",
    robotsApplicable: null,
    officialSource: "https://www.bytedance.com/en/",
    lastVerified: CRAWLER_REGISTRY_VERSION,
  },
  {
    token: "CCBot",
    provider: "Common Crawl",
    purpose: "training",
    robotsApplicable: true,
    officialSource: "https://commoncrawl.org/ccbot",
    lastVerified: CRAWLER_REGISTRY_VERSION,
  },
  {
    token: "Amazonbot",
    provider: "Amazon",
    purpose: "training",
    robotsApplicable: true,
    officialSource: "https://developer.amazon.com/amazonbot",
    lastVerified: CRAWLER_REGISTRY_VERSION,
  },
  {
    token: "anthropic-ai",
    provider: "Anthropic",
    purpose: "legacy",
    robotsApplicable: null,
    officialSource: ANTHROPIC_SOURCE,
    // Verificado 2026-08-01: la doc oficial de Anthropic (2026-04-07) ya no
    // lista este token — solo ClaudeBot, Claude-SearchBot y Claude-User. Se
    // conserva como legacy histórico (token pre-2025); robotsApplicable null
    // significa que no participa en decisiones.
    lastVerified: CRAWLER_REGISTRY_VERSION,
  },
]);

// Compatibility export retained for existing consumers.
export const AI_CRAWLER_AGENTS = AI_CRAWLER_REGISTRY.map(({ token }) => token);

export function parseRobotsGroups(content) {
  const groups = [];
  let current = null;

  for (let rawLine of content.split("\n")) {
    const trimmed = rawLine.trim();
    const withoutComment = trimmed.replace(/#.*/, "").trim();
    if (!withoutComment) {
      if (!trimmed) {
        current = null; // real blank line ends the group
      }
      continue; // comment-only line: keep the current group open
    }
    rawLine = withoutComment;

    const agentMatch = rawLine.match(/^User-agent:\s*(.+)$/i);
    if (agentMatch) {
      // Google's de-facto spec permits comma-separated product tokens on one
      // line; each token is a separate agent (RFC 9309 ABNF only covers one
      // token per line). An all-empty list (e.g. "User-agent: ,") is an
      // invalid line: it must not create a ghost group that swallows rules.
      const tokens = agentMatch[1]
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      if (tokens.length === 0) {
        continue;
      }
      if (!current || current.rules.length > 0) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(...tokens);
      continue;
    }

    const ruleMatch = rawLine.match(/^(Allow|Disallow):\s*(.*)$/i);
    if (ruleMatch && current) {
      current.rules.push({
        directive: ruleMatch[1].toLowerCase(),
        path: ruleMatch[2].trim(),
      });
    }
  }

  return groups;
}

function agentApplies(agentPattern, targetAgent) {
  if (agentPattern === "*") {
    return true;
  }
  return targetAgent.toLowerCase().includes(agentPattern.toLowerCase());
}

/**
 * Selecciona todos los grupos cuyo token de user-agent aplica con la mayor
 * especificidad (token coincidente más largo). Todos los grupos con un token
 * de la misma longitud se COMBINAN: el RFC 9309 exige unir las reglas de los
 * grupos que aplican al mismo user-agent.
 *
 * Compartida con src/fetcher.js (checkRobotsRule) — una única implementación
 * para la auditoría local y la verificación remota.
 *
 * @param {Array} groups — grupos de parseRobotsGroups()
 * @param {string} targetAgent — user-agent contra el que verificar
 * @returns {Array} grupos igualmente específicos, en orden de documento
 */
export function selectGroups(groups, targetAgent) {
  let bestLength = -1;
  const selected = [];

  for (const group of groups) {
    const applicable = group.agents.filter((agent) => agentApplies(agent, targetAgent));
    if (applicable.length === 0) {
      continue;
    }
    const groupLength = Math.max(...applicable.map((agent) => agent.length));
    if (groupLength > bestLength) {
      bestLength = groupLength;
      selected.length = 0;
      selected.push(group);
    } else if (groupLength === bestLength) {
      selected.push(group);
    }
  }

  return selected;
}

function ruleMatchesPath(rulePath, targetPath) {
  if (!rulePath) {
    return false;
  }

  const escaped = rulePath
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replaceAll("*", ".*")
    .replace(/\\\$$/, "$");
  return new RegExp(`^${escaped}`).test(targetPath);
}

/**
 * Evalúa las reglas combinadas de los grupos seleccionados contra un target
 * (pathname + query string). Conserva la regla coincidente más larga y, en
 * empate de longitud, la Allow. Un array vacío equivale a "sin reglas":
 * acceso permitido sin regla coincidente.
 *
 * Compartida con src/fetcher.js (checkRobotsRule) — una única implementación
 * para la auditoría local y la verificación remota.
 *
 * @param {Array} groups — grupos seleccionados por selectGroups()
 * @param {string} targetPath — pathname + search del recurso
 * @returns {{ allowed: boolean, matchedRule: { directive: string, path: string } | null }}
 */
export function evaluateSelectedGroups(groups, targetPath) {
  let strongestRule = null;

  for (const group of groups) {
    for (const rule of group.rules) {
      if (!ruleMatchesPath(rule.path, targetPath)) {
        continue;
      }
      if (
        !strongestRule ||
        rule.path.length > strongestRule.path.length ||
        (rule.path.length === strongestRule.path.length && rule.directive === "allow")
      ) {
        strongestRule = rule;
      }
    }
  }

  return {
    allowed: strongestRule?.directive !== "disallow",
    matchedRule: strongestRule,
  };
}

/**
 * Une los agentes de los grupos seleccionados para el reporte, deduplicados
 * y en orden de documento. `null` cuando no hay ningún grupo seleccionado.
 *
 * @param {Array} groups — grupos seleccionados por selectGroups()
 * @returns {string[] | null}
 */
function collectMatchedAgents(groups) {
  if (groups.length === 0) {
    return null;
  }
  const seen = new Set();
  const agents = [];
  for (const group of groups) {
    for (const agent of group.agents) {
      // Matching is case-insensitive (agentApplies), so dedup is too; keep
      // the first-seen original casing in the report.
      const key = agent.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        agents.push(agent);
      }
    }
  }
  return agents;
}

function warningsFor(entry) {
  const warnings = [];
  if (entry.robotsApplicable === false) {
    warnings.push(
      "This user-triggered fetcher may ignore robots.txt; use application security controls for private content."
    );
  }
  if (entry.robotsApplicable === null || entry.purpose === "legacy") {
    warnings.push("This legacy or undocumented token requires provider verification before use.");
  }
  if (entry.purpose === "control") {
    warnings.push("This is a product control token, not a distinct HTTP crawler user agent.");
  }
  return warnings;
}

/**
 * Evaluate effective robots.txt policy for the versioned crawler registry.
 *
 * Todos los grupos cuyo token de user-agent aplica con la mayor especificidad
 * se combinan (RFC 9309 §2.2.1): sus reglas se evalúan juntas, conservando la
 * regla coincidente más larga y la Allow en empate de longitud. Las reglas se
 * comparan contra `options.path` completo, incluida la query string si la
 * lleva (los ejemplos del RFC 9309 §2.2.2 tratan la query como parte del
 * path a comparar).
 *
 * @param {string} content - robots.txt content
 * @param {{ path?: string }} [options] - path (y query, si aplica) a evaluar
 * @returns {object} structured policy audit
 */
export function auditRobots(content, options = {}) {
  const targetPath = options.path || "/";
  const groups = parseRobotsGroups(content);
  const wildcardGroups = selectGroups(groups, "*");
  const wildcardPolicy = evaluateSelectedGroups(wildcardGroups, targetPath);

  return {
    registryVersion: CRAWLER_REGISTRY_VERSION,
    path: targetPath,
    wildcard: {
      matchedGroup: collectMatchedAgents(wildcardGroups),
      ...wildcardPolicy,
    },
    agents: AI_CRAWLER_REGISTRY.map((entry) => {
      const entryGroups = selectGroups(groups, entry.token);
      return {
        ...entry,
        matchedGroup: collectMatchedAgents(entryGroups),
        ...evaluateSelectedGroups(entryGroups, targetPath),
        warnings: warningsFor(entry),
      };
    }),
  };
}

function renderRobotsAudit(result) {
  const banner = chalk.bold.blue("═".repeat(50));
  console.log(banner);
  console.log(chalk.bold.blue("            ROBOTS.TXT CRAWLER AUDIT             "));
  console.log(banner);

  const blockedAgents = result.agents.filter(({ allowed }) => !allowed);
  if (blockedAgents.length > 0 || !result.wildcard.allowed) {
    console.log(
      chalk.yellow.bold(
        "WARNING: The following AI agents are blocked from crawling your root directory:"
      )
    );
    if (!result.wildcard.allowed) {
      console.log(
        chalk.yellow(
          "  - User-agent: * (root access blocked for crawlers without a specific allow)"
        )
      );
    }
    for (const entry of blockedAgents) {
      console.log(
        chalk.yellow(`  - User-agent: ${entry.token} (${entry.purpose}; root access blocked)`)
      );
    }
    console.log(
      chalk.dim(
        "\nThese rules are policy signals, not access controls. Review each provider's current documentation."
      )
    );
  } else {
    console.log(
      chalk.green.bold(
        "SUCCESS: No configured AI agents or wildcard directives are blocking root access."
      )
    );
    console.log(
      chalk.green(
        "Root access is allowed under the parsed robots.txt rules; this does not guarantee indexing or citation."
      )
    );
  }

  for (const entry of result.agents.filter(({ warnings }) => warnings.length > 0)) {
    for (const warning of entry.warnings) {
      console.log(chalk.dim(`  ${entry.token}: ${warning}`));
    }
  }
  console.log(banner);
}

export function checkRobots(robotsPath, options = {}) {
  if (!fs.existsSync(robotsPath)) {
    throw new Error(`robots.txt not found at ${robotsPath}`);
  }

  let content = "";
  try {
    content = fs.readFileSync(robotsPath, { encoding: "utf8", flag: "r" });
  } catch (e) {
    throw new Error(`Failed to read robots.txt: ${e.message}`, { cause: e });
  }

  const result = auditRobots(content, options);
  if (options.format === "json") {
    console.log(JSON.stringify(result, null, 2));
  } else {
    renderRobotsAudit(result);
  }
  return result;
}
