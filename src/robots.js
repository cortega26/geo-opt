import fs from "fs";
import chalk from "chalk";

export const CRAWLER_REGISTRY_VERSION = "2026-06-26";

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
    token: "Meta-ExternalAgent",
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
    lastVerified: CRAWLER_REGISTRY_VERSION,
  },
]);

// Compatibility export retained for existing consumers.
export const AI_CRAWLER_AGENTS = AI_CRAWLER_REGISTRY.map(({ token }) => token);

function parseRobotsGroups(content) {
  const groups = [];
  let current = null;

  for (let rawLine of content.split("\n")) {
    rawLine = rawLine.replace(/#.*/, "").trim();
    if (!rawLine) {
      current = null;
      continue;
    }

    const agentMatch = rawLine.match(/^User-agent:\s*(.+)$/i);
    if (agentMatch) {
      if (!current || current.rules.length > 0) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(agentMatch[1].trim());
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

function selectGroup(groups, targetAgent) {
  let selected = null;
  let selectedLength = -1;

  for (const group of groups) {
    for (const agent of group.agents) {
      if (agentApplies(agent, targetAgent) && agent.length > selectedLength) {
        selected = group;
        selectedLength = agent.length;
      }
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

function evaluateGroup(group, targetPath) {
  if (!group) {
    return { allowed: true, matchedRule: null };
  }

  let strongestRule = null;
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

  return {
    allowed: strongestRule?.directive !== "disallow",
    matchedRule: strongestRule,
  };
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
 * @param {string} content - robots.txt content
 * @param {{ path?: string }} [options]
 * @returns {object} structured policy audit
 */
export function auditRobots(content, options = {}) {
  const targetPath = options.path || "/";
  const groups = parseRobotsGroups(content);
  const wildcardGroup = selectGroup(groups, "*");
  const wildcardPolicy = evaluateGroup(wildcardGroup, targetPath);

  return {
    registryVersion: CRAWLER_REGISTRY_VERSION,
    path: targetPath,
    wildcard: {
      matchedGroup: wildcardGroup?.agents || null,
      ...wildcardPolicy,
    },
    agents: AI_CRAWLER_REGISTRY.map((entry) => {
      const group = selectGroup(groups, entry.token);
      return {
        ...entry,
        matchedGroup: group?.agents || null,
        ...evaluateGroup(group, targetPath),
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
    console.error(`Error: robots.txt not found at ${robotsPath}`);
    process.exit(1);
    return;
  }

  let content = "";
  try {
    content = fs.readFileSync(robotsPath, { encoding: "utf8", flag: "r" });
  } catch (e) {
    console.error(`Error: Failed to read robots.txt: ${e.message}`);
    process.exit(1);
    return;
  }

  const result = auditRobots(content, options);
  if (options.format === "json") {
    console.log(JSON.stringify(result, null, 2));
  } else {
    renderRobotsAudit(result);
  }
  return result;
}
