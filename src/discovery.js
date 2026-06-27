import fs from "fs";
import path from "path";

const DEFAULT_EXTENSIONS = new Set([".md", ".html", ".htm"]);

// ---- Internal: .gitignore-style pattern compiler ----

/**
 * Compile raw .gitignore-style strings into a rules array with pre-built regex.
 * Supports: *, ?, **, [...], leading /, trailing /, ! negation, # comments.
 * Blank lines and pure-comment lines are skipped.
 */
function compileGitignorePatterns(rawPatterns) {
  const rules = [];
  for (const raw of rawPatterns) {
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const negated = trimmed.startsWith("!");
    const pattern = negated ? trimmed.slice(1) : trimmed;
    const regex = patternToRegex(pattern);
    rules.push({ pattern, regex, negated });
  }
  return rules;
}

function patternToRegex(pattern) {
  let anchored = false;
  let p = pattern;

  // Leading / anchors to the root of the ignore context
  if (p.startsWith("/")) {
    anchored = true;
    p = p.slice(1);
  }

  // Trailing / matches directories only
  const dirOnly = p.endsWith("/");
  if (dirOnly) p = p.slice(0, -1);

  // Escape regex specials, then convert glob tokens
  let r = p
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    // ** matches any number of directories
    .replace(/\\\*\\\*/g, ".__DOUBLESTAR__.")
    // * matches anything except /
    .replace(/\\\*/g, "[^/]*")
    // ? matches single char except /
    .replace(/\\\?/g, "[^/]")
    // Restore ** placeholder
    .replace(/\.__DOUBLESTAR__\./g, ".*");

  if (dirOnly) {
    // Match directory entries: pattern or pattern/**
    r = `(?:${r}/.*|${r}$)`;
  }

  // If not anchored, the pattern can match at any depth
  if (anchored) {
    r = "^" + r;
  } else {
    r = "(?:^|.*/)" + r;
  }

  // Patterns without a trailing / or explicit $ match partial prefixes too
  if (!dirOnly && !r.endsWith(".*")) {
    r = r + "(?:/.*)?$";
  } else if (dirOnly) {
    // dirOnly regex already covers suffixes; just anchor the end
    r += "";
  } else {
    r += "$";
  }

  return new RegExp(r);
}

/**
 * Check if a relative path (from the ignore root) matches any compiled rule.
 * Later rules override earlier ones (last match wins). Negated rules re-include.
 *
 * @param {string} relativePath - path relative to the ignore root
 * @param {Array} rules - compiled rules from compileGitignorePatterns
 * @returns {boolean} true if the path should be ignored
 */
function matchesIgnore(relativePath, rules) {
  let ignored = false;
  for (const rule of rules) {
    if (rule.regex.test(relativePath)) {
      ignored = !rule.negated;
    }
  }
  return ignored;
}

// ---- Internal: directory walker ----

function walkDirectory(dirPath, collected, { rules, allowedExtensions, relativeRoot }) {
  let entries;
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return; // skip unreadable directories silently in batch mode
  }
  for (const entry of entries) {
    // Skip dot-prefixed entries by default (like .git, .DS_Store)
    // unless explicitly un-ignored via a negation pattern.
    if (entry.name.startsWith(".")) continue;

    const entryRel = path.relative(relativeRoot, path.join(dirPath, entry.name));
    if (rules && matchesIgnore(entryRel, rules)) continue;

    if (entry.isDirectory()) {
      walkDirectory(path.join(dirPath, entry.name), collected, {
        rules,
        allowedExtensions,
        relativeRoot,
      });
    } else if (entry.isFile() && hasAllowedExtension(entry.name, allowedExtensions)) {
      collected.push(path.join(dirPath, entry.name));
    }
  }
}

function hasAllowedExtension(filename, allowedExtensions) {
  const exts = allowedExtensions || DEFAULT_EXTENSIONS;
  const ext = path.extname(filename).toLowerCase();
  return exts.has(ext);
}

// ---- Public API ----

/**
 * Discover content files from user-supplied paths (files or directories).
 *
 * @param {string[]} inputPaths - positional paths from CLI
 * @param {object} options
 * @param {boolean} [options.recursive=false] - walk directories
 * @param {string[]} [options.ignorePatterns=[]] - additional CLI --ignore patterns
 * @param {Set<string>} [options.allowedExtensions] - default: .md, .html, .htm
 * @param {string} [options.cwd] - defaults to process.cwd()
 * @param {object} [options.config] - parsed geo_config.json (for config.ignore)
 * @returns {string[]} resolved absolute file paths, sorted
 * @throws {Error} if a path is a directory and !recursive
 */
export function discoverFiles(inputPaths, options = {}) {
  const {
    recursive = false,
    ignorePatterns = [],
    allowedExtensions = DEFAULT_EXTENSIONS,
    cwd = process.cwd(),
    config = {},
  } = options;

  // Compile ignore rules from .gitignore + config + CLI
  const rules = [];
  const gitignorePath = path.join(cwd, ".gitignore");
  try {
    const content = fs.readFileSync(gitignorePath, "utf8");
    const raw = content.split("\n").filter((l) => l.trim() && !l.trim().startsWith("#"));
    rules.push(...compileGitignorePatterns(raw));
  } catch {
    // No .gitignore found — that's fine
  }

  if (Array.isArray(config.ignore)) {
    rules.push(...compileGitignorePatterns(config.ignore));
  }
  if (ignorePatterns.length > 0) {
    rules.push(...compileGitignorePatterns(ignorePatterns));
  }

  const collected = [];
  const relativeRoot = path.resolve(cwd);

  for (const inputPath of inputPaths) {
    const resolved = path.resolve(cwd, inputPath);

    let stat;
    try {
      stat = fs.statSync(resolved);
    } catch {
      // Non-existent path — skip in batch, but report
      continue;
    }

    if (stat.isDirectory()) {
      if (!recursive) {
        throw new Error(`Path "${inputPath}" is a directory. Use --recursive to scan directories.`);
      }
      walkDirectory(resolved, collected, {
        rules: rules.length > 0 ? rules : null,
        allowedExtensions,
        relativeRoot,
      });
    } else if (stat.isFile() && hasAllowedExtension(resolved, allowedExtensions)) {
      collected.push(resolved);
    }
  }

  // Sort for deterministic output
  collected.sort();
  return collected;
}
