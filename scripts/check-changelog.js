#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const CHANGELOG_PATH = "CHANGELOG.md";
const CODE_PATH_PATTERNS = [
  /^bin\/.*\.(?:js|mjs|cjs)$/,
  /^src\/.*\.(?:js|mjs|cjs)$/,
  /^scripts\/.*\.(?:js|mjs|cjs|py)$/,
  /^tests\/.*\.(?:js|mjs|cjs|py)$/,
  /^\.agents\/skills\/geo-optimization\/scripts\/.*\.py$/,
  /^(?:package|package-lock)\.json$/,
  /^eslint\.config\.js$/,
];

function git(args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function gitRaw(args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function lines(value) {
  return value ? value.split("\n").filter(Boolean) : [];
}

function existingRef(ref) {
  try {
    git(["rev-parse", "--verify", ref]);
    return true;
  } catch {
    return false;
  }
}

function changedFilesFromStatus() {
  return gitRaw(["status", "--porcelain=v1", "-z", "--untracked-files=all"])
    .split("\0")
    .filter(Boolean)
    .map((entry) => entry.slice(3));
}

function determineBase() {
  const explicitBaseIndex = process.argv.indexOf("--base");
  if (explicitBaseIndex !== -1) {
    const explicitBase = process.argv[explicitBaseIndex + 1];
    if (!explicitBase) {
      throw new Error("--base requires a Git revision.");
    }
    return explicitBase;
  }

  if (process.env.GITHUB_BASE_REF) {
    const remoteBase = `origin/${process.env.GITHUB_BASE_REF}`;
    return existingRef(remoteBase) ? remoteBase : process.env.GITHUB_BASE_REF;
  }

  return existingRef("HEAD^") ? "HEAD^" : null;
}

function changedFiles() {
  const workingTreeFiles = changedFilesFromStatus();
  if (workingTreeFiles.length > 0) {
    return workingTreeFiles;
  }

  const base = determineBase();
  return base ? lines(git(["diff", "--name-only", `${base}...HEAD`])) : [];
}

function main() {
  if (!fs.existsSync(CHANGELOG_PATH)) {
    console.error(`Error: ${CHANGELOG_PATH} is required.`);
    process.exit(1);
  }

  const files = changedFiles();
  const codeFiles = files.filter((file) =>
    CODE_PATH_PATTERNS.some((pattern) => pattern.test(file))
  );

  if (codeFiles.length === 0) {
    console.log("Changelog check passed: no code changes detected.");
    return;
  }

  if (!files.includes(CHANGELOG_PATH)) {
    console.error(
      `Error: code changes require an update to ${CHANGELOG_PATH}.\n` +
        `Code files changed:\n${codeFiles.map((file) => `  - ${file}`).join("\n")}\n\n` +
        'Add a concise entry under "## [Unreleased]".'
    );
    process.exit(1);
  }

  const changelog = fs.readFileSync(CHANGELOG_PATH, "utf8");
  const unreleasedSection = changelog.match(/## \[Unreleased\]([\s\S]*?)(?=\n## \[|$)/)?.[1];

  if (!unreleasedSection || !/^\s*-\s+\S/m.test(unreleasedSection)) {
    console.error(
      `Error: ${CHANGELOG_PATH} must contain at least one bullet under "## [Unreleased]".`
    );
    process.exit(1);
  }

  console.log(
    `Changelog check passed: ${codeFiles.length} code file(s) accompanied by ${CHANGELOG_PATH}.`
  );
}

try {
  main();
} catch (error) {
  console.error(`Error: changelog policy check failed: ${error.message}`);
  process.exit(1);
}
