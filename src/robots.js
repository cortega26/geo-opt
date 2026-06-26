import fs from "fs";
import chalk from "chalk";

export const AI_CRAWLER_AGENTS = [
  "GPTBot",
  "ChatGPT-User",
  "OAI-SearchBot",
  "ClaudeBot",
  "Claude-SearchBot",
  "Claude-User",
  "PerplexityBot",
  "Google-Extended",
  "Applebot-Extended",
  "Meta-ExternalAgent",
  "Bytespider",
  "CCBot",
  "Amazonbot",
  "anthropic-ai",
];

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

function ruleMatchesRoot(path) {
  return path === "/" || path === "/*";
}

function blocksRoot(group) {
  if (!group) {
    return false;
  }

  let strongestRule = null;
  for (const rule of group.rules) {
    if (!rule.path || !ruleMatchesRoot(rule.path)) {
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

  return strongestRule?.directive === "disallow";
}

export function checkRobots(robotsPath) {
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

  const banner = chalk.bold.blue("═".repeat(50));
  console.log(banner);
  console.log(chalk.bold.blue("            ROBOTS.TXT CRAWLER AUDIT             "));
  console.log(banner);

  const groups = parseRobotsGroups(content);
  const blockedAgents = [];

  for (const agent of AI_CRAWLER_AGENTS) {
    const group = selectGroup(groups, agent);
    if (blocksRoot(group)) {
      blockedAgents.push({ agent });
    }
  }

  const wildcardGroup = selectGroup(groups, "*");
  const wildcardBlocksRoot = blocksRoot(wildcardGroup);

  if (blockedAgents.length > 0 || wildcardBlocksRoot) {
    console.log(
      chalk.yellow.bold(
        "WARNING: The following AI agents are blocked from crawling your root directory:"
      )
    );
    if (wildcardBlocksRoot) {
      console.log(
        chalk.yellow(
          "  - User-agent: * (root access blocked for crawlers without a specific allow)"
        )
      );
    }
    for (const b of blockedAgents) {
      console.log(chalk.yellow(`  - User-agent: ${b.agent} (root access blocked)`));
    }
    console.log(
      chalk.dim(
        "\nNote: Blocking these crawlers prevents AI engines from indexing your content and citing your pages."
      )
    );
  } else {
    console.log(
      chalk.green.bold(
        "SUCCESS: No major AI agents or wildcard directives are blocking root access."
      )
    );
    console.log(
      chalk.green("Your content is crawler-friendly for generative search engine indexing.")
    );
  }
  console.log(banner);
}
