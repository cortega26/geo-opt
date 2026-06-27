#!/usr/bin/env python3
import sys
import re
import os
import json
import argparse
import contextlib
import io
from datetime import datetime, timezone

import mistune
from bs4 import BeautifulSoup

# Default thresholds
MAX_PRONOUN_DENSITY = 0.02
LICENSE_ENV_VAR = "TOOLTICIAN_LICENSE_KEY"
PRO_LICENSE_PATTERN = re.compile(r"^tt_pro_[A-Za-z0-9_-]{20,}$")
TOOLTICIAN_BRANDING_MARKDOWN = "Optimized with [Tooltician](https://www.tooltician.com)"
TOOLTICIAN_BRANDING_HTML = (
    '<div class="geo-signature"><p>Optimized with '
    '<a href="https://www.tooltician.com">Tooltician</a></p></div>'
)
SUPPORTED_SCHEMA_TYPES = {"article", "faq", "product"}
REMINDER_INJECTION_INTERVAL = 10
REMINDER_COOLDOWN_SECONDS = 7 * 24 * 60 * 60
STATE_DIR_ENV_VAR = "GEO_OPT_STATE_DIR"
SUPPORT_URL = "https://www.tooltician.com"
CRAWLER_REGISTRY_VERSION = "2026-06-26"
OPENAI_CRAWLER_SOURCE = "https://developers.openai.com/api/docs/bots"
ANTHROPIC_CRAWLER_SOURCE = (
    "https://support.claude.com/en/articles/"
    "8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler"
)
PERPLEXITY_CRAWLER_SOURCE = "https://docs.perplexity.ai/docs/resources/perplexity-crawlers"
AI_CRAWLER_REGISTRY = [
    {"token": "GPTBot", "provider": "OpenAI", "purpose": "training",
     "robotsApplicable": True, "officialSource": OPENAI_CRAWLER_SOURCE},
    {"token": "ChatGPT-User", "provider": "OpenAI", "purpose": "user",
     "robotsApplicable": False, "officialSource": OPENAI_CRAWLER_SOURCE},
    {"token": "OAI-SearchBot", "provider": "OpenAI", "purpose": "search",
     "robotsApplicable": True, "officialSource": OPENAI_CRAWLER_SOURCE},
    {"token": "ClaudeBot", "provider": "Anthropic", "purpose": "training",
     "robotsApplicable": True, "officialSource": ANTHROPIC_CRAWLER_SOURCE},
    {"token": "Claude-SearchBot", "provider": "Anthropic", "purpose": "search",
     "robotsApplicable": True, "officialSource": ANTHROPIC_CRAWLER_SOURCE},
    {"token": "Claude-User", "provider": "Anthropic", "purpose": "user",
     "robotsApplicable": True, "officialSource": ANTHROPIC_CRAWLER_SOURCE},
    {"token": "PerplexityBot", "provider": "Perplexity", "purpose": "search",
     "robotsApplicable": True, "officialSource": PERPLEXITY_CRAWLER_SOURCE},
    {"token": "Perplexity-User", "provider": "Perplexity", "purpose": "user",
     "robotsApplicable": False, "officialSource": PERPLEXITY_CRAWLER_SOURCE},
    {"token": "Google-Extended", "provider": "Google", "purpose": "control",
     "robotsApplicable": True,
     "officialSource": "https://developers.google.com/crawling/docs/crawlers-fetchers/"
                       "google-common-crawlers#google-extended"},
    {"token": "Applebot-Extended", "provider": "Apple", "purpose": "control",
     "robotsApplicable": True, "officialSource": "https://support.apple.com/en-us/119829"},
    {"token": "Meta-ExternalAgent", "provider": "Meta", "purpose": "training",
     "robotsApplicable": True,
     "officialSource": "https://developers.facebook.com/docs/sharing/webmasters/web-crawlers/"},
    {"token": "Bytespider", "provider": "ByteDance", "purpose": "legacy",
     "robotsApplicable": None, "officialSource": "https://www.bytedance.com/en/"},
    {"token": "CCBot", "provider": "Common Crawl", "purpose": "training",
     "robotsApplicable": True, "officialSource": "https://commoncrawl.org/ccbot"},
    {"token": "Amazonbot", "provider": "Amazon", "purpose": "training",
     "robotsApplicable": True, "officialSource": "https://developer.amazon.com/amazonbot"},
    {"token": "anthropic-ai", "provider": "Anthropic", "purpose": "legacy",
     "robotsApplicable": None, "officialSource": ANTHROPIC_CRAWLER_SOURCE},
]
for crawler_entry in AI_CRAWLER_REGISTRY:
    crawler_entry["lastVerified"] = CRAWLER_REGISTRY_VERSION
AI_CRAWLER_AGENTS = [entry["token"] for entry in AI_CRAWLER_REGISTRY]


def resolve_license_key(config, env=None):
    """Returns the locally configured Pro license key without logging it."""
    env = os.environ if env is None else env
    license_config = config.get("license", {})
    configured_key = (
        license_config.get("key")
        if isinstance(license_config, dict)
        else None
    ) or config.get("licenseKey")
    candidate = env.get(LICENSE_ENV_VAR) or configured_key
    return candidate.strip() if isinstance(candidate, str) else ""


def has_pro_entitlement(config, env=None):
    """Checks the local Tooltician Pro key format.

    This is a convenience entitlement gate for the source-available CLI, not a
    cryptographic or server-side license verification mechanism.
    """
    return bool(PRO_LICENSE_PATTERN.fullmatch(resolve_license_key(config, env)))


def no_branding_error(config, env=None):
    if has_pro_entitlement(config, env):
        return None
    return (
        "--no-branding requires a Tooltician Pro license key. "
        f"Set {LICENSE_ENV_VAR} or license.key in geo_config.json."
    )


def get_state_path(env=None):
    env = os.environ if env is None else env
    base_dir = (
        env.get(STATE_DIR_ENV_VAR)
        or env.get("XDG_CONFIG_HOME")
        or os.path.join(os.path.expanduser("~"), ".config")
    )
    return os.path.join(base_dir, "geo-opt", "state.json")


def default_engagement_state():
    return {
        "remindersEnabled": True,
        "successfulFreeInjections": 0,
        "lastReminderAt": None,
    }


def read_engagement_state(state_path=None, env=None):
    state_path = state_path or get_state_path(env)
    try:
        with open(state_path, "r", encoding="utf-8") as state_file:
            parsed = json.load(state_file)
        state = default_engagement_state()
        state.update(parsed)
        state["remindersEnabled"] = parsed.get("remindersEnabled") is not False
        count = parsed.get("successfulFreeInjections", 0)
        state["successfulFreeInjections"] = max(0, count) if isinstance(count, int) else 0
        last_reminder = parsed.get("lastReminderAt")
        state["lastReminderAt"] = last_reminder if isinstance(last_reminder, str) else None
        return state
    except (OSError, ValueError, TypeError):
        return default_engagement_state()


def write_engagement_state(state, state_path=None, env=None):
    state_path = state_path or get_state_path(env)
    directory = os.path.dirname(state_path)
    temporary_path = f"{state_path}.{os.getpid()}.tmp"
    try:
        os.makedirs(directory, mode=0o700, exist_ok=True)
        with open(temporary_path, "w", encoding="utf-8") as state_file:
            json.dump(state, state_file, indent=2)
            state_file.write("\n")
        os.chmod(temporary_path, 0o600)
        os.replace(temporary_path, state_path)
        return True
    except OSError:
        try:
            os.remove(temporary_path)
        except OSError:
            pass
        return False


def set_reminders_enabled(enabled, state_path=None, env=None):
    state = read_engagement_state(state_path, env)
    state["remindersEnabled"] = enabled
    return write_engagement_state(state, state_path, env)


def reminders_are_enabled(state_path=None, env=None):
    return read_engagement_state(state_path, env)["remindersEnabled"]


def is_automated_environment(env):
    return any(
        env.get(name)
        for name in (
            "CI",
            "GITHUB_ACTIONS",
            "GITLAB_CI",
            "BUILDKITE",
            "JENKINS_URL",
            "TF_BUILD",
        )
    )


def record_successful_free_injection(
    config,
    state_path=None,
    env=None,
    stderr=None,
    now=None,
):
    env = os.environ if env is None else env
    stderr = sys.stderr if stderr is None else stderr
    now = datetime.now(timezone.utc) if now is None else now

    if (
        has_pro_entitlement(config, env)
        or not getattr(stderr, "isatty", lambda: False)()
        or is_automated_environment(env)
        or env.get("GEO_OPT_DISABLE_REMINDERS") == "1"
    ):
        return {"shown": False, "reason": "suppressed"}

    state = read_engagement_state(state_path, env)
    if not state["remindersEnabled"]:
        return {"shown": False, "reason": "disabled"}

    state["successfulFreeInjections"] += 1
    last_reminder = None
    if state["lastReminderAt"]:
        try:
            last_reminder = datetime.fromisoformat(
                state["lastReminderAt"].replace("Z", "+00:00")
            )
        except ValueError:
            last_reminder = None

    cooldown_elapsed = (
        last_reminder is None
        or (now - last_reminder).total_seconds() >= REMINDER_COOLDOWN_SECONDS
    )
    interval_reached = (
        state["successfulFreeInjections"] >= REMINDER_INJECTION_INTERVAL
    )

    if interval_reached and cooldown_elapsed:
        print(
            "\nEnjoying geo-opt? Support Tooltician and unlock branding-free output:\n"
            f"{SUPPORT_URL}\n"
            "Hide this message: geo-opt config set reminders false\n",
            file=stderr,
        )
        state["successfulFreeInjections"] = 0
        state["lastReminderAt"] = now.isoformat()
        write_engagement_state(state, state_path, env)
        return {"shown": True, "reason": "interval"}

    write_engagement_state(state, state_path, env)
    return {
        "shown": False,
        "reason": "cooldown" if interval_reached else "interval",
    }


def optional_id(base_url, fragment):
    return f"{base_url}/#{fragment}" if base_url else None


def reference_or_inline(node, node_id):
    return {"@id": node_id} if node_id else node


def strip_tooltician_branding(content):
    content = re.sub(
        r"\n{0,2}Optimized (?:by|with) \[Tooltician\]"
        r"\(https?://(?:www\.)?tooltician\.com/?\)\s*",
        "\n",
        content,
        flags=re.IGNORECASE,
    )
    return re.sub(
        r'\s*<div[^>]*class=["\'][^"\']*\bgeo-signature\b[^"\']*["\'][^>]*>'
        r".*?</div>\s*",
        "\n",
        content,
        flags=re.DOTALL | re.IGNORECASE,
    )


def is_inside_directory(candidate_path, directory_path):
    relative_path = os.path.relpath(candidate_path, directory_path)
    return relative_path == "." or not (
        relative_path == ".." or relative_path.startswith(f"..{os.sep}") or os.path.isabs(relative_path)
    )


def assert_writable_target_inside_cwd(filepath):
    try:
        target_real_path = os.path.realpath(filepath)
        cwd_real_path = os.path.realpath(os.getcwd())
    except OSError as exc:
        print(f"Error: Failed to resolve real path for {filepath}: {exc}", file=sys.stderr)
        sys.exit(1)

    if not is_inside_directory(target_real_path, cwd_real_path):
        print(
            f"Error: Security restriction — target file {filepath} resolves outside the current working directory.",
            file=sys.stderr,
        )
        sys.exit(1)

    return target_real_path, cwd_real_path


def assert_new_file_parent_inside_cwd(filepath):
    try:
        parent_real_path = os.path.realpath(os.path.dirname(filepath) or ".")
        cwd_real_path = os.path.realpath(os.getcwd())
    except OSError as exc:
        print(f"Error: Failed to resolve real path for {filepath}: {exc}", file=sys.stderr)
        sys.exit(1)

    if not is_inside_directory(parent_real_path, cwd_real_path):
        print(
            f"Error: Security restriction — output path {filepath} resolves outside the current working directory.",
            file=sys.stderr,
        )
        sys.exit(1)

    return parent_real_path, cwd_real_path


def clean_html_text(value):
    soup = BeautifulSoup(value, "html.parser")
    return re.sub(r"\s+", " ", soup.get_text()).strip()


def truncate_description(description):
    return f"{description[:147]}..." if len(description) > 150 else description


# ---- Page metadata extraction (llms.txt) ----

def extract_page_metadata(content, filepath):
    """Extract title, description, and sections from Markdown or HTML content."""
    clean_text = preprocess_content(content)

    title = ""
    title_match = re.search(r'^#\s+(.+)$', clean_text, re.MULTILINE)
    if title_match:
        title = title_match.group(1).strip()
    if not title:
        h1_match = re.search(r'<h1\b[^>]*>([\s\S]*?)</h1>', clean_text, re.DOTALL | re.IGNORECASE)
        if h1_match:
            title = clean_html_text(h1_match.group(1))
    if not title:
        title = os.path.splitext(os.path.basename(filepath))[0] or "Untitled"

    description = ""
    intro_match = re.search(r'^#\s+.+?\n\n([^#\n]+)', clean_text, re.DOTALL)
    if intro_match:
        description = clean_markdown_to_plain_text(intro_match.group(1).strip())
    if not description and (filepath.endswith(".html") or re.search(r'<html', clean_text, re.IGNORECASE)):
        soup = BeautifulSoup(content, "html.parser")
        meta_desc = soup.find("meta", attrs={"name": "description"})
        if meta_desc and meta_desc.get("content"):
            description = clean_html_text(meta_desc["content"])
        if not description:
            first_p = soup.find("p")
            if first_p:
                description = clean_html_text(first_p.get_text())
    description = truncate_description(description)

    sections = extract_sections(content)
    return {"title": title, "description": description, "sections": sections}


# ---- llms.txt generation ----

def generate_llms_txt(entries, site_title="Site Documentation", site_description="",
                      optional_threshold=50):
    """Generate llms.txt content following the llmstxt.org specification."""
    lines = []

    lines.append(f"# {site_title}")
    lines.append("")
    if site_description:
        lines.append(f"> {site_description}")
        lines.append("")

    sections = {}
    optional_entries = []
    for entry in entries:
        score = entry.get("score")
        if score is not None and score < optional_threshold:
            optional_entries.append(entry)
        else:
            section = entry.get("section", "Pages")
            sections.setdefault(section, []).append(entry)

    for section_name, section_entries in sections.items():
        lines.append(f"## {section_name}")
        lines.append("")
        for entry in section_entries:
            desc = f": {clean_markdown_to_plain_text(entry['description'])}" if entry.get("description") else ""
            lines.append(f"- [{entry['title']}]({entry['url']}){desc}")
        lines.append("")

    if optional_entries:
        lines.append("## Optional")
        lines.append("")
        for entry in optional_entries:
            desc = f": {clean_markdown_to_plain_text(entry['description'])}" if entry.get("description") else ""
            lines.append(f"- [{entry['title']}]({entry['url']}){desc}")
        lines.append("")

    return "\n".join(lines).strip() + "\n"


def generate_llms_full_txt(entries, site_title="Site Documentation"):
    """Generate llms-full.txt with complete page content."""
    lines = []
    lines.append(f"# {site_title} — Full Content")
    lines.append("")
    lines.append("> This file contains the complete content of all pages listed in llms.txt.")
    lines.append("")

    for entry in entries:
        lines.append("---")
        lines.append("")
        lines.append(f"## [{entry['title']}]({entry['url']})")
        lines.append("")
        content = entry.get("content", "")
        clean = preprocess_content(content)
        plain = clean_markdown_to_plain_text(clean)
        paragraphs = re.split(r"\n{2,}", plain)
        for para in paragraphs:
            trimmed = para.strip()
            if trimmed:
                lines.append(trimmed)
            lines.append("")

    return "\n".join(lines).strip() + "\n"


# ---- llms.txt audit ----

def _parse_llms_entries(llms_content):
    """Parse section entries (URLs and titles) from an llms.txt file."""
    entries = []
    current_section = ""
    current_optional = False

    for line in llms_content.split("\n"):
        h2_match = re.match(r'^##\s+(.+)$', line)
        if h2_match:
            current_section = h2_match.group(1).strip()
            current_optional = current_section.lower() == "optional"
            continue
        link_match = re.match(r'^\s*-\s+\[([^\]]+)\]\(([^)]+)\)', line)
        if link_match:
            entries.append({
                "title": link_match.group(1).strip(),
                "url": link_match.group(2).strip(),
                "section": current_section or "Pages",
                "optional": current_optional,
            })

    return entries


def audit_llms_txt(llms_content, discovered_files=None, base_dir=""):
    """Audit an existing llms.txt for spec compliance and coverage."""
    if discovered_files is None:
        discovered_files = []
    issues = []

    if not re.search(r'^#\s+\S', llms_content, re.MULTILINE):
        issues.append("Missing required H1 title (e.g. '# Site Name').")
    if not re.search(r'^>\s+\S', llms_content, re.MULTILINE):
        issues.append("Missing recommended blockquote description (e.g. '> Brief summary...').")
    if not re.search(r'^##\s+\S', llms_content, re.MULTILINE):
        issues.append("No H2 sections found. Add at least one section with page links.")

    entries = _parse_llms_entries(llms_content)

    without_desc = 0
    for e in entries:
        pattern = re.compile(re.escape(f"[{e['title']}]({e['url']})") + r":")
        if not pattern.search(llms_content):
            without_desc += 1
    if without_desc > 0:
        issues.append(f"{without_desc} page(s) have no description (add ': description' after the URL).")

    h2_matches = list(re.finditer(r'^##\s+(.+)$', llms_content, re.MULTILINE))
    optional_idx = next(
        (i for i, m in enumerate(h2_matches) if m.group(1).strip().lower() == "optional"),
        -1
    )
    if optional_idx >= 0 and optional_idx < len(h2_matches) - 1:
        issues.append("The '## Optional' section should be the last section in the file.")

    coverage = None
    if discovered_files:
        listed_paths = set()
        for e in entries:
            try:
                listed_paths.add(e["url"])
            except Exception:
                listed_paths.add(e["url"])
        missing_files = []
        for fp in discovered_files:
            rel = os.path.relpath(fp, base_dir) if base_dir else fp
            ext = os.path.splitext(rel)[1]
            without_ext = rel[: -len(ext)]
            rel_url = "/" + without_ext.replace(os.sep, "/").replace("/index", "")
            if rel_url in ("/", ""):
                continue
            if rel_url not in listed_paths and (rel_url + "/") not in listed_paths:
                found = any(rel_url in p or os.path.basename(without_ext) in p for p in listed_paths)
                if not found:
                    missing_files.append(fp)
        coverage = {
            "listed": len(entries),
            "missing": len(missing_files),
            "total": len(discovered_files),
            "missingFiles": missing_files[:10],
        }
        if missing_files:
            issues.append(f"{len(missing_files)} file(s) on the site are not listed in llms.txt.")

    return {
        "valid": len(issues) == 0,
        "issues": issues,
        **({"coverage": coverage} if coverage else {}),
    }


# ---- robots.txt generation ----


def generate_robots_txt(disallow_paths=None, sitemap_url="", preset="search-visible"):
    """Generate a reviewable robots.txt draft for configured AI agents."""
    if disallow_paths is None:
        disallow_paths = []
    if preset not in {"search-visible", "open"}:
        raise ValueError(f"Unknown robots.txt policy preset: {preset}")

    normalized_paths = [
        path if path.startswith("/") else "/" + path
        for path in (disallow_paths or ["/admin", "/api", "/private"])
    ]
    lines = []
    lines.append("# ── AI Crawler Policy ──")
    lines.append(f"# Registry: {CRAWLER_REGISTRY_VERSION}; preset: {preset}")
    lines.append("# Draft policy signal only: robots.txt is not an access control.")
    lines.append("")

    for entry in AI_CRAWLER_REGISTRY:
        if entry["purpose"] == "legacy" and preset != "open":
            lines.append(
                f"# {entry['token']}: legacy or undocumented token; "
                f"verify with {entry['provider']} before adding rules."
            )
            continue

        broadly_allowed = (
            preset == "open"
            or entry["purpose"] in {"search", "user"}
        )
        lines.append(
            f"# {entry['provider']}; purpose: {entry['purpose']}; "
            f"source: {entry['officialSource']}"
        )
        if entry["robotsApplicable"] is False:
            lines.append("# User-triggered requests may ignore robots.txt.")
        elif entry["purpose"] == "control":
            lines.append("# Product control token; not a distinct HTTP crawler user agent.")
        lines.append(f"User-agent: {entry['token']}")
        if broadly_allowed:
            lines.append("Allow: /")
            for path in normalized_paths:
                lines.append(f"Disallow: {path}")
        else:
            lines.append("Disallow: /")
        lines.append("")

    lines.append("# ── Default Rules ──")
    lines.append("# All other crawlers (traditional search engines, etc.) follow these rules.")
    lines.append("")
    lines.append("User-agent: *")

    for path in normalized_paths:
        lines.append(f"Disallow: {path}")

    lines.append("")
    if sitemap_url:
        lines.append(f"Sitemap: {sitemap_url}")
        lines.append("")

    return "\n".join(lines).strip() + "\n"


def load_config(config_path=None):
    """Loads configuration file containing default author details and acronym dictionary."""
    search_paths = []
    if config_path:
        # If user explicitly passed a config path, it must exist
        if not os.path.exists(config_path):
            print(f"Error: Specified config file {config_path} not found.", file=sys.stderr)
            sys.exit(1)
        search_paths.append(config_path)
    else:
        # Fallback defaults
        search_paths.append(os.path.join(os.getcwd(), "geo_config.json"))
        script_dir = os.path.dirname(os.path.abspath(__file__))
        search_paths.append(os.path.abspath(os.path.join(script_dir, "..", "geo_config.json")))
    
    for path in search_paths:
        if os.path.exists(path):
            try:
                with open(path, 'r', encoding='utf-8', errors='replace') as f:
                    return json.load(f), path
            except Exception as e:
                message = f"Failed to parse config at {path}: {e}"
                if config_path:
                    print(f"Error: {message}", file=sys.stderr)
                    sys.exit(1)
                print(f"Warning: {message}", file=sys.stderr)
                
    return {}, None

def calculate_readability(text):
    """Simple heuristic for text clarity: sentence and word counts."""
    sentences = re.split(r'[.!?]+', text)
    sentences = [s.strip() for s in sentences if s.strip()]
    words = re.findall(r'\b\w+\b', text)
    
    if not sentences or not words:
        return 0, 0
        
    avg_sentence_len = len(words) / len(sentences)
    return len(words), avg_sentence_len

def preprocess_content(content):
    """Strips markdown code blocks and HTML comments to clean text for analysis."""
    # Strip markdown code blocks first (BeautifulSoup does not parse markdown)
    text = re.sub(r"```.*?```", "", content, flags=re.DOTALL)
    # Strip HTML comments before BeautifulSoup parsing
    text = re.sub(r"<!--.*?-->", "", text, flags=re.DOTALL)
    # Use BeautifulSoup to strip <script> and <style> elements reliably
    soup = BeautifulSoup(text, "html.parser")
    for tag in soup(["script", "style"]):
        tag.decompose()
    return str(soup)

def clean_markdown_to_plain_text(md_text):
    """Converts markdown (links, bold, tables) to clean, search-compliant plain text for schema nodes."""
    md = mistune.create_markdown(renderer=None, plugins=["table", "strikethrough", "task_lists"])
    tokens, _state = md.parse(md_text)

    def walk(tok, into):
        if isinstance(tok, list):
            for t in tok:
                walk(t, into)
        elif isinstance(tok, dict):
            ttype = tok.get("type")
            if ttype == "text":
                into.append(tok.get("text", tok.get("raw", "")))
            elif ttype == "link":
                walk(tok.get("children", []), into)
            elif ttype == "image":
                alt = tok.get("attrs", {}).get("alt") or tok.get("text")
                if alt:
                    into.append(alt)
            elif ttype in ("codespan", "strong", "emphasis", "delete"):
                walk(tok.get("children", []), into)
            elif ttype == "html_inline":
                into.append(re.sub(r"<[^>]+>", "", tok.get("text", "")))
            elif ttype == "linebreak":
                into.append("\n")
            elif ttype == "paragraph":
                walk(tok.get("children", []), into)
                into.append("\n")
            elif ttype == "list":
                for item in tok.get("children", []):
                    walk(item.get("children", []), into)
                    into.append("\n")
            elif ttype == "table":
                for row in tok.get("children", []):
                    cells = []
                    for cell in row.get("children", []):
                        cell_parts = []
                        walk(cell.get("children", []), cell_parts)
                        cells.append("".join(cell_parts).strip() or cell.get("text", ""))
                    into.append(" - ".join(cells))
                    into.append("\n")
            elif ttype in ("block_quote", "block_code"):
                into.append(tok.get("text", ""))
            elif "children" in tok:
                walk(tok["children"], into)

    parts = []
    walk(tokens, parts)
    return re.sub(r"<[^>]+>", "", re.sub(r"[ \t]+", " ", "".join(parts))).strip()

def _extract_text_from_children(token):
    """Recursively extract plain text from mistune AST token children."""
    if isinstance(token, dict):
        if "children" in token:
            return "".join(_extract_text_from_children(c) for c in token["children"])
        return token.get("text", token.get("raw", ""))
    return str(token) if token else ""


def extract_sections(content):
    """Extracts headings (H2+) and their body text from markdown using mistune AST."""
    clean_content = preprocess_content(content)
    md = mistune.create_markdown(renderer=None, plugins=["table", "strikethrough", "task_lists"])
    tokens, _state = md.parse(clean_content)
    sections = []
    current_header = None
    current_text = []

    for token in tokens:
        if token.get("type") == "heading" and token.get("attrs", {}).get("level", 1) >= 2:
            if current_header:
                sections.append((current_header, "\n".join(current_text).strip()))
            current_header = _extract_text_from_children(token)
            current_text = []
        elif current_header is not None:
            ttype = token.get("type")
            if ttype in ("paragraph", "text"):
                current_text.append(_extract_text_from_children(token))
            elif ttype == "list":
                for item in token.get("children", []):
                    current_text.append(_extract_text_from_children(item))
            elif ttype == "block_quote":
                current_text.append(_extract_text_from_children(token))
            elif ttype == "block_code":
                current_text.append(token.get("raw", ""))
            elif ttype == "table":
                rows = []
                for row in token.get("children", []):
                    cells = [_extract_text_from_children(c) for c in row.get("children", [])]
                    rows.append(" | ".join(cells))
                current_text.append("\n".join(rows))
            # blank_line tokens are ignored

    if current_header:
        sections.append((current_header, "\n".join(current_text).strip()))

    return sections

# ---- File discovery (batch/recursive) ----

DEFAULT_EXTENSIONS = {".md", ".html", ".htm"}


def _compile_gitignore_patterns(raw_patterns):
    """Compile .gitignore-style patterns into a list of {pattern, regex, negated} rules."""
    rules = []
    for raw in raw_patterns:
        trimmed = raw.strip()
        if not trimmed or trimmed.startswith("#"):
            continue
        negated = trimmed.startswith("!")
        pattern = negated and trimmed[1:] or trimmed
        regex = _pattern_to_regex(pattern)
        rules.append({"pattern": pattern, "regex": regex, "negated": negated})
    return rules


def _pattern_to_regex(pattern):
    """Convert a single .gitignore pattern to a compiled regex."""
    anchored = False
    p = pattern
    if p.startswith("/"):
        anchored = True
        p = p[1:]
    dir_only = p.endswith("/")
    if dir_only:
        p = p[:-1]

    r = re.escape(p)
    r = r.replace(r"\\*\\*", ".__DOUBLESTAR__.")
    r = r.replace(r"\\*", "[^/]*")
    r = r.replace(r"\\?", "[^/]")
    r = r.replace(".__DOUBLESTAR__.", ".*")

    if dir_only:
        r = f"(?:{r}/.*|{r}$)"
    if anchored:
        r = "^" + r
    else:
        r = "(?:^|.*/)" + r
    if not dir_only and not r.endswith(".*"):
        r = r + "(?:/.*)?$"
    else:
        r = r + "$"
    return re.compile(r)


def _matches_ignore(relative_path, rules):
    """Check if a relative path matches compiled ignore rules (last match wins)."""
    ignored = False
    for rule in rules:
        if rule["regex"].search(relative_path):
            ignored = not rule["negated"]
    return ignored


def _walk_directory(dir_path, collected, rules, allowed_extensions, relative_root):
    """Recursively walk a directory, collecting files matching allowed extensions."""
    try:
        entries = os.listdir(dir_path)
    except OSError:
        return
    for name in sorted(entries):
        full_path = os.path.join(dir_path, name)
        entry_rel = os.path.relpath(full_path, relative_root)
        if rules and _matches_ignore(entry_rel, rules):
            continue
        if os.path.isdir(full_path):
            _walk_directory(full_path, collected, rules, allowed_extensions, relative_root)
        elif os.path.isfile(full_path):
            ext = os.path.splitext(name)[1].lower()
            if ext in allowed_extensions:
                collected.append(full_path)


def discover_files(input_paths, recursive=False, ignore_patterns=None,
                   allowed_extensions=None, cwd=None, config=None):
    """Discover content files from user-supplied paths (files or directories).

    Returns a sorted list of absolute file paths.
    Raises RuntimeError if a path is a directory and recursive is False.
    """
    if allowed_extensions is None:
        allowed_extensions = DEFAULT_EXTENSIONS
    if ignore_patterns is None:
        ignore_patterns = []
    if cwd is None:
        cwd = os.getcwd()
    if config is None:
        config = {}

    # Compile ignore rules from .gitignore + config + CLI
    rules = []
    gitignore_path = os.path.join(cwd, ".gitignore")
    try:
        with open(gitignore_path, "r", encoding="utf-8") as fh:
            raw = [line.strip() for line in fh if line.strip() and not line.strip().startswith("#")]
        rules.extend(_compile_gitignore_patterns(raw))
    except OSError:
        pass

    config_ignore = config.get("ignore")
    if isinstance(config_ignore, list):
        rules.extend(_compile_gitignore_patterns(config_ignore))
    if ignore_patterns:
        rules.extend(_compile_gitignore_patterns(ignore_patterns))

    collected = []
    relative_root = os.path.abspath(cwd)

    for input_path in input_paths:
        resolved = os.path.abspath(os.path.join(cwd, input_path))
        try:
            st = os.stat(resolved)
        except OSError:
            continue

        if os.path.isdir(resolved) if hasattr(os.path, "isdir") else (lambda x: os.path.isdir(x))(resolved):
            # Use os.path.isdir
            if os.path.isdir(resolved):
                if not recursive:
                    raise RuntimeError(
                        f'Path "{input_path}" is a directory. Use --recursive to scan directories.'
                    )
                _walk_directory(
                    resolved, collected,
                    rules if rules else None,
                    allowed_extensions,
                    relative_root,
                )
        elif os.path.isfile(resolved):
            ext = os.path.splitext(resolved)[1].lower()
            if ext in allowed_extensions:
                collected.append(resolved)

    collected.sort()
    return collected


# ---- Batch audit (safe — no sys.exit per file) ----

def audit_files(filepaths, config):
    """Audit multiple files, collecting results without sys.exit.

    Returns list of dicts: {file, status, score?, report?, error?}
    """
    results = []
    for filepath in filepaths:
        try:
            try:
                with open(filepath, "r", encoding="utf-8", errors="replace") as fh:
                    content = fh.read()
            except OSError as read_err:
                results.append({
                    "file": filepath,
                    "status": "error",
                    "error": f"Read failed: {read_err}",
                })
                continue
            score, report = _score_content(content, filepath, config)
            results.append({"file": filepath, "status": "success", "score": score, "report": report})
        except Exception as err:
            results.append({"file": filepath, "status": "error", "error": str(err)})
    return results


def compute_summary(results):
    """Aggregate per-file audit results into a site-level summary report."""
    successes = [r for r in results if r.get("status") == "success"]
    scores = [r["score"] for r in successes]
    total = len(results)
    succeeded = len(successes)
    failed = total - succeeded

    if succeeded == 0:
        return {
            "totalFiles": total,
            "succeeded": 0,
            "failed": failed,
            "message": "No files could be audited.",
            "perFile": results,
        }

    sorted_scores = sorted(scores)
    avg = sum(scores) / len(scores)
    variance = sum((v - avg) ** 2 for v in scores) / len(scores)
    median = (
        (sorted_scores[len(sorted_scores) // 2 - 1] + sorted_scores[len(sorted_scores) // 2]) / 2
        if len(sorted_scores) % 2 == 0
        else sorted_scores[len(sorted_scores) // 2]
    )

    rec_counts = {}
    for r in successes:
        for rec in r["report"].get("recommendations", []):
            rec_counts[rec] = rec_counts.get(rec, 0) + 1
    top_recs = sorted(rec_counts.items(), key=lambda x: x[1], reverse=True)[:10]
    top_recommendations = [{"recommendation": rec, "fileCount": count} for rec, count in top_recs]

    worst = sorted(successes, key=lambda r: r["score"])[:5]

    return {
        "totalFiles": total,
        "succeeded": succeeded,
        "failed": failed,
        "averageScore": round(avg, 2),
        "medianScore": round(median, 2),
        "minScore": sorted_scores[0],
        "maxScore": sorted_scores[-1],
        "stdDev": round(variance ** 0.5, 2),
        "distribution": {
            "excellent": sum(1 for s in scores if s >= 80),
            "good": sum(1 for s in scores if s >= 50 and s < 80),
            "needsWork": sum(1 for s in scores if s < 50),
        },
        "topRecommendations": top_recommendations,
        "worstFiles": [{"file": r["file"], "score": r["score"]} for r in worst],
        "perFile": results,
    }


# ---- Pure scoring (without I/O — for batch use) ----

def _score_content(content, filepath, config):
    """Score content without I/O side effects. Returns (score, report_dict)."""
    # This delegates to the existing audit_file but captures its JSON output.
    # We reuse audit_file's scoring logic by temporarily redirecting stdout.
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        score = audit_file(filepath, config, "json", _content=content)
    report = json.loads(buf.getvalue())
    return score, report


# --- Mistune-based scoring helpers ---
def _parse_md_tokens(content):
    md = mistune.create_markdown(renderer=None, plugins=["table", "strikethrough", "task_lists"])
    tokens, _state = md.parse(content)
    return tokens


def _count_md_links(tokens):
    count = 0

    def walk(tok):
        nonlocal count
        if isinstance(tok, list):
            for t in tok:
                walk(t)
        elif isinstance(tok, dict):
            if tok.get("type") == "link" and tok.get("attrs", {}).get("url", "").startswith("http"):
                count += 1
            elif tok.get("type") == "image" and tok.get("attrs", {}).get("url", "").startswith("http"):
                count += 1
            if "children" in tok:
                walk(tok["children"])

    walk(tokens)
    return count


def _count_blockquotes(tokens):
    count = 0

    def walk(tok):
        nonlocal count
        if isinstance(tok, list):
            for t in tok:
                walk(t)
        elif isinstance(tok, dict):
            if tok.get("type") == "block_quote":
                count += 1
            if "children" in tok:
                walk(tok["children"])

    walk(tokens)
    return count


def _has_md_table(tokens):
    def walk(tok):
        if isinstance(tok, list):
            return any(walk(t) for t in tok)
        if isinstance(tok, dict):
            if tok.get("type") == "table":
                return True
            if "children" in tok and walk(tok["children"]):
                return True
        return False

    return walk(tokens)


def _has_md_list(tokens):
    def walk(tok):
        if isinstance(tok, list):
            return any(walk(t) for t in tok)
        if isinstance(tok, dict):
            if tok.get("type") == "list":
                return True
            if "children" in tok and walk(tok["children"]):
                return True
        return False

    return walk(tokens)


def audit_file(filepath, config, output_format="text", _content=None):
    # _content is an optional pre-read body. When provided, file I/O is skipped.
    if _content is not None:
        content = _content
    else:
        if not os.path.exists(filepath):
            print(f"Error: File {filepath} not found.", file=sys.stderr)
            sys.exit(1)

        try:
            with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
                content = f.read()
        except Exception as e:
            print(f"Error: Failed to read file {filepath}: {e}", file=sys.stderr)
            sys.exit(1)

    text_content = preprocess_content(content)
    md_tokens = _parse_md_tokens(text_content)

    # 1. Answer-First & Structure (Max 20 pts)
    struct_score = 0
    struct_breakdown = []
    
    lines = [line.strip() for line in text_content.split('\n') if line.strip()]
    intro_para = ""
    for line in lines:
        if not line.startswith('#'):
            intro_para = line
            break
            
    if intro_para:
        words = intro_para.split()
        word_count = len(words)
        is_definition = any(verb in intro_para.lower() for verb in [" is a ", " is an ", " refers to ", " represents ", " is the strategic "])
        
        if 40 <= word_count <= 90:
            if is_definition:
                struct_score += 10
                struct_breakdown.append("Answer-First: Optimal length (40-90 words) and contains definition markers (+10 pts)")
            else:
                struct_score += 7
                struct_breakdown.append("Answer-First: Optimal length but lacks clear definition markers (+7 pts)")
        else:
            struct_breakdown.append(f"Answer-First: Intro paragraph has {word_count} words (optimal is 40-90) (+0 pts)")
    else:
        struct_breakdown.append("Answer-First: No intro paragraph found (+0 pts)")
        
    if _has_md_table(md_tokens) or "<table>" in text_content.lower():
        struct_score += 4
        struct_breakdown.append("Tables: Structured data tables present (+4 pts)")
    else:
        struct_breakdown.append("Tables: No tables found (+0 pts)")
        
    if _has_md_list(md_tokens):
        struct_score += 3
        struct_breakdown.append("Lists: Bulleted or numbered lists present (+3 pts)")
    else:
        struct_breakdown.append("Lists: No lists found (+0 pts)")
        
    if re.search(r'^##+\s+\w+', text_content, re.MULTILINE) or re.search(r'<h[234]>', text_content.lower()):
        struct_score += 3
        struct_breakdown.append("Headers: Clean H2/H3 hierarchy found (+3 pts)")
    else:
        struct_breakdown.append("Headers: No H2/H3 headers found (+0 pts)")

    # Check for HTML semantic layout if it's an HTML file (Technical AI Readiness)
    # Use BeautifulSoup to query the actual DOM tree, avoiding false positives
    # from tag names that appear in text, comments, or code samples.
    if filepath.endswith('.html') or "<html" in text_content.lower():
        html_lowered = text_content.lower()
        soup = BeautifulSoup(content, "html.parser")
        semantic_tags = ["article", "main", "header", "footer", "nav", "section"]
        found_tags = [t for t in semantic_tags if soup.find(t) is not None]
        if len(found_tags) >= 3:
            struct_breakdown.append(
                f"Semantic HTML: Good HTML5 layout tags used (<{'}>, <{'.join(found_tags)}>) (+0 pts)"
            )
        else:
            deduction = 4
            struct_score = max(0, struct_score - deduction)
            tag_display = f"<{'}>, <{'.join(found_tags)}>" if found_tags else "none"
            struct_breakdown.append(
                f"Semantic HTML: Lacks HTML5 structural tags (e.g. <main>, <article>). "
                f"Found only: {tag_display} (-{deduction} pts)"
            )

        # SPA / client-side rendering detection.
        has_app_container = soup.select_one('[id="app"], [id="root"]') is not None
        has_framework_code = bool(re.search(r'createapp\(|reactdom\.render\(', html_lowered))
        if has_app_container or has_framework_code:
            struct_breakdown.append(
                "Dynamic Rendering Warning: Detects client-side JS references. "
                "Ensure content is pre-rendered / SSR for AI crawler searchability."
            )

    # 2. Statistics Density (Max 20 pts)
    stats_score = 0
    stat_matches = re.findall(r'\b\d+(?:\.\d+)?%|\$\d+(?:\.\d+)?[kKmMbB]?|\b\d+(?:\.\d+)?[xX]\b|\b\d{2,}(?:,\d{3})*(?:\.\d+)?\b', text_content)
    
    # Filter out isolated calendar years (1900 - 2099)
    filtered_stats = []
    for s in stat_matches:
        if re.match(r'^(19|20)\d{2}$', s):
            continue
        filtered_stats.append(s)
        
    stat_count = len(filtered_stats)

    # Enhanced: detect verbal/non-numeric statistics
    verbal_patterns = [
        # Fractions
        r'\b(?:one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:-|—)\s*(?:third|quarter|fifth|sixth|seventh|eighth|ninth|tenth)s?\b',
        r'\b(?:one|two|three|four|five)\s*-?\s*(?:third|quarter|fifth)s?\b',
        # Proportional phrases
        r'\b\d+\s*(?:out\s*of|in)\s*\d+\b',
        r'\b(?:one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:out\s*of|in)\s*(?:two|three|four|five|six|seven|eight|nine|ten)\b',
        # Multiplier words
        r'\b(?:double|triple|quadruple|half|twice)\b',
        # Percentage words
        r'\b(?:majority|minority|plurality)\b',
    ]

    verbal_count = 0
    verbal_matches = []
    for pattern in verbal_patterns:
        matches = re.findall(pattern, text_content, re.IGNORECASE)
        verbal_count += len(matches)
        if matches:
            verbal_matches.extend(matches[:3])

    total_stat_count = stat_count + verbal_count

    if total_stat_count >= 3:
        stats_score = 20
        detail_parts = filtered_stats[:3] + (["..."] if len(filtered_stats) > 3 else [])
        verbal_sample = verbal_matches[:3] if verbal_matches else []
        parts_str = ", ".join(detail_parts + verbal_sample) if filtered_stats else ", ".join(verbal_sample)
        stats_breakdown = f"High density ({total_stat_count} stats found: {parts_str}...) (+20 pts)"
    elif total_stat_count > 0:
        stats_score = 10
        all_matches = filtered_stats + verbal_matches
        stats_breakdown = f"Moderate density ({total_stat_count} stats found: {', '.join(all_matches)}) (+10 pts)"
    else:
        stats_breakdown = "No statistics or numerical evidence found (+0 pts)"

    # 3. Quotation Density (Max 20 pts)
    quotes_score = 0
    blockquote_count = _count_blockquotes(md_tokens)
    inline_quotes = re.findall(r'"([^"]{15,})"', text_content)
    quote_count = blockquote_count + len(inline_quotes)
    
    if quote_count >= 2:
        quotes_score = 20
        quotes_breakdown = f"High density ({quote_count} quotes found) (+20 pts)"
    elif quote_count > 0:
        quotes_score = 10
        quotes_breakdown = f"Moderate density ({quote_count} quotes found) (+10 pts)"
    else:
        quotes_breakdown = "No expert quotes or direct attributions found (+0 pts)"

    # 4. Citation & Authority (Max 20 pts)
    citation_score = 0
    md_link_count = _count_md_links(md_tokens)
    html_links = re.findall(r'href=["\'](https?://[^"\']+)["\']', text_content)
    link_count = md_link_count + len(html_links)
    
    has_sources_header = any(keyword in text_content.lower() for keyword in ["sources", "references", "citations", "bibliography"])
    
    if link_count >= 3:
        citation_score += 15
        citation_breakdown = f"Links: High authority link density ({link_count} links found) (+15 pts)"
    elif link_count > 0:
        citation_score += 8
        citation_breakdown = f"Links: Moderate link density ({link_count} links found) (+8 pts)"
    else:
        citation_breakdown = "Links: No external hyperlinks found (+0 pts)"
        
    if has_sources_header:
        citation_score += 5
        citation_breakdown += "\nReferences: Dedicated citation/sources section found (+5 pts)"
    else:
        citation_breakdown += "\nReferences: No dedicated citation section found (+0 pts)"

    # 5. Semantic Clarity & Readability (Max 20 pts)
    clarity_score = 20
    clarity_breakdown = []
    
    words = re.findall(r'\b\w+\b', text_content.lower())
    total_word_count = len(words)
    
    if total_word_count > 0:
        # Pronoun check
        pronouns = ["it", "they", "them", "this", "these", "those"]
        pronoun_count = sum(words.count(p) for p in pronouns)
        pronoun_density = pronoun_count / total_word_count
        
        pronoun_limit = config.get("limits", {}).get("max_pronoun_density", MAX_PRONOUN_DENSITY)
        if pronoun_density > pronoun_limit:
            deduction = min(15, int((pronoun_density - pronoun_limit) * 100))
            clarity_score -= deduction
            clarity_breakdown.append(f"Pronoun Ambiguity: High density of ambiguous pronouns ({pronoun_density:.1%}). Limit use of 'it', 'they', etc. (-{deduction} pts)")
        else:
            clarity_breakdown.append(f"Pronoun Ambiguity: Low density of ambiguous pronouns ({pronoun_density:.1%}) (+0 pts)")
            
        # Acronym check - strip markdown headers to prevent ALL CAPS HEADERS false positives
        no_headers = re.sub(r'^##+.*$', '', text_content, flags=re.MULTILINE)
        found_acronyms = set(re.findall(r'\b[A-Z]{2,}\b', no_headers))
        
        # Stopwords filter
        stopwords = {"THE", "AND", "FOR", "BUT", "YOU", "NOT", "YES", "OUT", "OFF", "HOW", "WHY", "OUR", "WHO"}
        found_acronyms = {acr for acr in found_acronyms if acr not in stopwords}
        
        acronym_dict = config.get("acronyms", {})
        unexplained = []
        
        for acr in found_acronyms:
            if acr in acronym_dict:
                expansion = acronym_dict[acr]
                acr_positions = [m.start() for m in re.finditer(rf'\b{acr}\b', text_content)]
                is_explained = False
                for pos in acr_positions:
                    start_look = max(0, pos - 120)
                    end_look = min(len(text_content), pos + 120)
                    window = text_content[start_look:end_look].lower()
                    if expansion.lower() in window:
                        is_explained = True
                        break
                if not is_explained:
                    unexplained.append(f"{acr} ('{expansion}')")
            else:
                pattern = rf'({acr}\s*\([^)]+\)|\([^)]+\)\s*{acr})'
                if not re.search(pattern, text_content, re.IGNORECASE) and len(acr) > 2:
                    unexplained.append(acr)
        
        if unexplained:
            deduct_pts = min(5, len(unexplained))
            clarity_score -= deduct_pts
            clarity_breakdown.append(f"Acronym Clarity: Unexplained acronyms found: {', '.join(unexplained)}. Spell them out on first mention (-{deduct_pts} pts)")
        else:
            clarity_breakdown.append("Acronym Clarity: All acronyms are defined or none detected (+0 pts)")
    else:
        clarity_breakdown.append("Empty file or no words found.")

    total_score = struct_score + stats_score + quotes_score + citation_score + clarity_score

    recs = []
    if struct_score < 15:
        recs.append("Format the opening paragraph to be a self-contained definition/summary of 40-90 words (Answer-First).")
        recs.append("Use markdown tables, headers, and bulleted lists to break up dense blocks of text.")
    if stats_score < 20:
        recs.append("Add specific metrics, percentages, dollar values, or dates from studies or reports to support your claims.")
    if quotes_score < 20:
        recs.append("Include direct quotes from experts or industry leaders to increase authority.")
    if citation_score < 20:
        recs.append("Add external hyperlinks to reputable sources and include a 'References' or 'Sources' list.")
    if clarity_score < 18:
        recs.append("Replace ambiguous pronouns ('it', 'they', 'this') with specific nouns (e.g. 'the database', 'this setup').")
        recs.append("Spell out acronyms when they are first used (e.g., 'SaaS (Software as a Service)').")

    if output_format == "json":
        report_data = {
            "file": filepath,
            "total_score": total_score,
            "breakdown": {
                "structure": {
                    "score": struct_score,
                    "max": 20,
                    "details": struct_breakdown
                },
                "statistics": {
                    "score": stats_score,
                    "max": 20,
                    "details": [stats_breakdown]
                },
                "quotations": {
                    "score": quotes_score,
                    "max": 20,
                    "details": [quotes_breakdown]
                },
                "citations": {
                    "score": citation_score,
                    "max": 20,
                    "details": citation_breakdown.split('\n')
                },
                "clarity": {
                    "score": clarity_score,
                    "max": 20,
                    "details": clarity_breakdown
                }
            },
            "recommendations": recs
        }
        print(json.dumps(report_data, indent=2, ensure_ascii=False))
    else:
        print("==================================================")
        print("            GEO OPTIMIZATION AUDIT REPORT         ")
        print("==================================================")
        print(f"File: {filepath}")
        print(f"Total GEO Score: {total_score}/100")
        print("--------------------------------------------------")
        print(f"1. Answer-First & Structure: {struct_score}/20")
        for item in struct_breakdown:
            print(f"   - {item}")
        print("--------------------------------------------------")
        print(f"2. Statistics Density: {stats_score}/20")
        print(f"   - {stats_breakdown}")
        print("--------------------------------------------------")
        print(f"3. Quotation Density: {quotes_score}/20")
        print(f"   - {quotes_breakdown}")
        print("--------------------------------------------------")
        print(f"4. Citation & Authority: {citation_score}/20")
        for item in citation_breakdown.split('\n'):
            print(f"   - {item}")
        print("--------------------------------------------------")
        print(f"5. Semantic Clarity: {clarity_score}/20")
        for item in clarity_breakdown:
            print(f"   - {item}")
        print("==================================================")
        
        print("\nActionable Recommendations:")
        if not recs:
            print("Excellent! This page meets all checks in the current geo-opt heuristic.")
        else:
            for r in recs:
                print(f"- {r}")
        print("==================================================")
        
    return total_score

def parse_robots_groups(content):
    groups = []
    current = None

    for raw_line in content.split("\n"):
        raw_line = re.sub(r"#.*", "", raw_line).strip()
        if not raw_line:
            current = None
            continue

        agent_match = re.match(r"^User-agent:\s*(.+)$", raw_line, re.IGNORECASE)
        if agent_match:
            if current is None or current["rules"]:
                current = {"agents": [], "rules": []}
                groups.append(current)
            current["agents"].append(agent_match.group(1).strip())
            continue

        rule_match = re.match(r"^(Allow|Disallow):\s*(.*)$", raw_line, re.IGNORECASE)
        if rule_match and current is not None:
            current["rules"].append(
                {
                    "directive": rule_match.group(1).lower(),
                    "path": rule_match.group(2).strip(),
                }
            )

    return groups


def agent_applies(agent_pattern, target_agent):
    if agent_pattern == "*":
        return True
    return agent_pattern.lower() in target_agent.lower()


def select_robots_group(groups, target_agent):
    selected = None
    selected_length = -1

    for group in groups:
        for agent in group["agents"]:
            if agent_applies(agent, target_agent) and len(agent) > selected_length:
                selected = group
                selected_length = len(agent)

    return selected


def robots_rule_matches_path(rule_path, target_path):
    if not rule_path:
        return False
    end_anchored = rule_path.endswith("$")
    source = rule_path[:-1] if end_anchored else rule_path
    pattern = "^" + re.escape(source).replace(r"\*", ".*")
    if end_anchored:
        pattern += "$"
    return re.match(pattern, target_path) is not None


def evaluate_robots_group(group, target_path):
    if not group:
        return {"allowed": True, "matchedRule": None}

    strongest_rule = None
    for rule in group["rules"]:
        if not robots_rule_matches_path(rule["path"], target_path):
            continue
        if (
            strongest_rule is None
            or len(rule["path"]) > len(strongest_rule["path"])
            or (
                len(rule["path"]) == len(strongest_rule["path"])
                and rule["directive"] == "allow"
            )
        ):
            strongest_rule = rule

    return {
        "allowed": strongest_rule is None or strongest_rule["directive"] != "disallow",
        "matchedRule": strongest_rule,
    }


def crawler_warnings(entry):
    warnings = []
    if entry["robotsApplicable"] is False:
        warnings.append(
            "This user-triggered fetcher may ignore robots.txt; "
            "use application security controls for private content."
        )
    if entry["robotsApplicable"] is None or entry["purpose"] == "legacy":
        warnings.append(
            "This legacy or undocumented token requires provider verification before use."
        )
    if entry["purpose"] == "control":
        warnings.append(
            "This is a product control token, not a distinct HTTP crawler user agent."
        )
    return warnings


def audit_robots(content, target_path="/"):
    """Return effective robots.txt policy for the versioned crawler registry."""
    groups = parse_robots_groups(content)
    wildcard_group = select_robots_group(groups, "*")
    wildcard = {
        "matchedGroup": wildcard_group["agents"] if wildcard_group else None,
        **evaluate_robots_group(wildcard_group, target_path),
    }
    agents = []
    for entry in AI_CRAWLER_REGISTRY:
        group = select_robots_group(groups, entry["token"])
        agents.append(
            {
                **entry,
                "matchedGroup": group["agents"] if group else None,
                **evaluate_robots_group(group, target_path),
                "warnings": crawler_warnings(entry),
            }
        )
    return {
        "registryVersion": CRAWLER_REGISTRY_VERSION,
        "path": target_path,
        "wildcard": wildcard,
        "agents": agents,
    }


def check_robots(robots_path, output_format="text"):
    if not os.path.exists(robots_path):
        print(f"Error: robots.txt not found at {robots_path}", file=sys.stderr)
        sys.exit(1)
        
    try:
        with open(robots_path, 'r', encoding='utf-8', errors='replace') as f:
            content = f.read()
    except Exception as e:
        print(f"Error: Failed to read robots.txt: {e}", file=sys.stderr)
        sys.exit(1)
        
    result = audit_robots(content)
    if output_format == "json":
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return result

    print("==================================================")
    print("            ROBOTS.TXT CRAWLER AUDIT             ")
    print("==================================================")

    blocked_agents = [entry for entry in result["agents"] if not entry["allowed"]]
    if blocked_agents or not result["wildcard"]["allowed"]:
        print("WARNING: The following AI agents are blocked from crawling your root directory:")
        if not result["wildcard"]["allowed"]:
            print("  - User-agent: * (root access blocked for crawlers without a specific allow)")
        for entry in blocked_agents:
            print(
                f"  - User-agent: {entry['token']} "
                f"({entry['purpose']}; root access blocked)"
            )
        print(
            "\nThese rules are policy signals, not access controls. "
            "Review each provider's current documentation."
        )
    else:
        print("SUCCESS: No configured AI agents or wildcard directives are blocking root access.")
        print(
            "Root access is allowed under the parsed robots.txt rules; "
            "this does not guarantee indexing or citation."
        )
    for entry in result["agents"]:
        for warning in entry["warnings"]:
            print(f"  {entry['token']}: {warning}")
    print("==================================================")
    return result

def generate_schema_data(filepath, schema_type, config, _content=None):
    if schema_type not in SUPPORTED_SCHEMA_TYPES:
        print(
            f'Error: Unsupported schema type "{schema_type}". '
            "Expected article, faq, or product.",
            file=sys.stderr,
        )
        sys.exit(1)

    # _content is an optional pre-read file body. When provided, the file
    # existence check and read are skipped — the caller (inject_schema) has
    # already read the file once to avoid double I/O.
    content = _content
    if content is None:
        if not os.path.exists(filepath):
            print(f"Error: File {filepath} not found.", file=sys.stderr)
            sys.exit(1)

        try:
            with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
                content = f.read()
        except Exception as e:
            print(f"Error: Failed to read file {filepath}: {e}", file=sys.stderr)
            sys.exit(1)
        
    # Strip code blocks to prevent title/description contamination
    clean_text = preprocess_content(content)

    # Try markdown H1 first, then HTML <h1>
    title_match = re.search(r'^#\s+(.+)$', clean_text, re.MULTILINE)
    if not title_match:
        title_match = re.search(r'<h1\b[^>]*>(.*?)</h1>', clean_text, re.DOTALL | re.IGNORECASE)
    title = clean_html_text(title_match.group(1)) if title_match else "Untitled Document"
    
    intro_match = re.search(r'^#\s+.+?\n\n([^#\n]+)', clean_text, re.DOTALL)
    description = clean_markdown_to_plain_text(intro_match.group(1).strip()) if intro_match else ""
    if not description and (filepath.endswith(".html") or "<html" in clean_text.lower()):
        # Use BeautifulSoup for reliable <meta name="description"> extraction
        # regardless of attribute order.
        soup_desc = BeautifulSoup(content, "html.parser")
        meta_desc = soup_desc.find("meta", attrs={"name": "description"})
        if meta_desc and meta_desc.get("content"):
            description = clean_html_text(meta_desc["content"])
        if not description:
            first_p = soup_desc.find("p")
            if first_p:
                description = clean_html_text(first_p.get_text())
    description = truncate_description(description)
        
    author_info = config.get("author", {})
    pub_info = config.get("publisher", {})
    
    pub_url_value = pub_info.get("url")
    pub_url = pub_url_value.strip().rstrip("/") if isinstance(pub_url_value, str) else ""
    org_id = optional_id(pub_url, "organization")
    author_id = optional_id(pub_url, "author")
    graph_nodes = []

    org_node = None
    if pub_info.get("name") or pub_url:
        org_node = {"@type": "Organization"}
        if org_id:
            org_node["@id"] = org_id
        if pub_info.get("name"):
            org_node["name"] = pub_info["name"]
        if pub_url:
            org_node["url"] = pub_url
        if pub_info.get("logo"):
            org_node["logo"] = {
                "@type": "ImageObject",
                "url": pub_info.get("logo"),
            }
        if org_id:
            graph_nodes.append(org_node)

    author_node = None
    if author_info.get("name"):
        author_node = {
            "@type": "Person",
            "name": author_info["name"],
        }
        if author_id:
            author_node["@id"] = author_id
        if author_info.get("jobTitle"):
            author_node["jobTitle"] = author_info["jobTitle"]
        if author_info.get("sameAs"):
            author_node["sameAs"] = author_info["sameAs"]
        if author_id:
            graph_nodes.append(author_node)

    if schema_type == "article":
        article_node = {
            "@type": "NewsArticle",
            "headline": title,
        }
        article_id = optional_id(pub_url, "article")
        if article_id:
            article_node["@id"] = article_id
        if description:
            article_node["description"] = description
        if config.get("datePublished"):
            article_node["datePublished"] = config["datePublished"]
        if author_node:
            article_node["author"] = reference_or_inline(author_node, author_id)
        if org_node:
            article_node["publisher"] = reference_or_inline(org_node, org_id)
        graph_nodes.append(article_node)
        
        # Robust FAQ extraction using header parsing
        sections = extract_sections(content)
        if sections:
            qa_list = []
            for q, a in sections[:5]:
                # Skip sections with empty content or header metadata
                if len(a) < 15 or q.lower() in ["sources", "references", "citations", "bibliography"]:
                    continue
                # Clean answer markdown to plain text for compliant JSON-LD
                clean_answer = clean_markdown_to_plain_text(a)
                qa_list.append({
                    "@type": "Question",
                    "name": q,
                    "acceptedAnswer": {
                        "@type": "Answer",
                        "text": clean_answer
                    }
                })
            if qa_list:
                faq_node = {
                    "@type": "FAQPage",
                    "mainEntity": qa_list
                }
                faq_id = optional_id(pub_url, "faq")
                if faq_id:
                    faq_node["@id"] = faq_id
                graph_nodes.append(faq_node)
            
    elif schema_type == "faq":
        sections = extract_sections(content)
        qa_list = []
        for q, a in sections[:5]:
            # Skip sections with empty content or header metadata
            if len(a) < 15 or q.lower() in [
                "sources",
                "references",
                "citations",
                "bibliography",
            ]:
                continue
            # Clean answer markdown to plain text for compliant JSON-LD
            clean_answer = clean_markdown_to_plain_text(a)
            qa_list.append({
                "@type": "Question",
                "name": q,
                "acceptedAnswer": {
                    "@type": "Answer",
                    "text": clean_answer
                }
            })
        faq_node = {
            "@type": "FAQPage",
            "mainEntity": qa_list
        }
        faq_id = optional_id(pub_url, "faq")
        if faq_id:
            faq_node["@id"] = faq_id
        graph_nodes.append(faq_node)
        
    elif schema_type == "product":
        product_node = {
            "@type": "Product",
            "name": title,
        }
        product_id = optional_id(pub_url, "product")
        if product_id:
            product_node["@id"] = product_id
        if description:
            product_node["description"] = description
        if org_node:
            product_node["brand"] = reference_or_inline(org_node, org_id)

        offer_info = config.get("product", {}).get("offer", {})
        if offer_info.get("price") is not None and offer_info.get("priceCurrency"):
            product_node["offers"] = {
                "@type": "Offer",
                "price": str(offer_info["price"]),
                "priceCurrency": offer_info["priceCurrency"],
            }
            if offer_info.get("availability"):
                product_node["offers"]["availability"] = offer_info["availability"]
            if org_node:
                product_node["offers"]["seller"] = reference_or_inline(org_node, org_id)
        graph_nodes.append(product_node)
        
    return {
        "@context": "https://schema.org",
        "@graph": graph_nodes
    }

def inject_schema(filepath, schema_type, config, dry_run=False, no_branding=False):
    if no_branding:
        entitlement_error = no_branding_error(config)
        if entitlement_error:
            print(f"Error: {entitlement_error}", file=sys.stderr)
            sys.exit(1)

    if not os.path.exists(filepath):
        print(f"Error: File {filepath} not found.", file=sys.stderr)
        sys.exit(1)

    assert_writable_target_inside_cwd(filepath)

    # Read file once; pass to generate_schema_data to avoid double I/O.
    try:
        with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
            content = f.read()
    except Exception as e:
        print(f"Error: Failed to read file {filepath}: {e}", file=sys.stderr)
        sys.exit(1)

    schema = generate_schema_data(filepath, schema_type, config, content)
    # Escape "</" to prevent breaking out of <script> tags when
    # JSON-LD is embedded in HTML (SEC-03).
    schema_json = json.dumps(schema, indent=2, ensure_ascii=False).replace("</", "<\\/")
        
    schema_pattern = r'```json\s*\{\s*"@context":\s*"https://schema\.org".*?\}\s*```'
    script_pattern = r'<script\b(?=[^>]*\btype\s*=\s*(["\']?)application/ld\+json\1)[^>]*>.*?</script>'
    
    content = strip_tooltician_branding(content)
    sig_md = "" if no_branding else f"\n\n{TOOLTICIAN_BRANDING_MARKDOWN}\n"
    sig_html = "" if no_branding else f"\n{TOOLTICIAN_BRANDING_HTML}\n"
            
    injected_code = f"{sig_md}\n```json\n{schema_json}\n```\n"
    
    if filepath.endswith('.html') or "<html" in content.lower():
        injected_code = f'{sig_html}\n<script type="application/ld+json">\n{schema_json}\n</script>\n'
        if re.search(script_pattern, content, re.DOTALL | re.IGNORECASE):
            # If replacing schema, we only inject HTML signature if not present
            content = re.sub(script_pattern, injected_code.strip(), content, flags=re.DOTALL | re.IGNORECASE)
            print(f"Successfully replaced existing JSON-LD script tag in {filepath}.")
        else:
            if re.search(r'(?i)</head>', content):
                content = re.sub(r'(?i)</head>', f"{injected_code}</head>", content, count=1)
            elif re.search(r'(?i)</body>', content):
                content = re.sub(r'(?i)</body>', f"{injected_code}</body>", content, count=1)
            else:
                content += injected_code
            print(f"Successfully injected JSON-LD script tag into {filepath}.")
    else:
        if re.search(schema_pattern, content, re.DOTALL):
            # If signature needs injection, prepend it to the new block
            content = re.sub(schema_pattern, injected_code.strip(), content, flags=re.DOTALL)
            print(f"Successfully updated existing Schema.org block in markdown file {filepath}.")
        else:
            content += injected_code
            print(f"Successfully appended Schema.org block to markdown file {filepath}.")
            
    if dry_run:
        print("=== DRY RUN: The following would be injected ===")
        print(injected_code)
        print("=== End of dry run preview ===")
        return

    try:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
    except Exception as e:
        print(f"Error: Failed to write to file {filepath}: {e}", file=sys.stderr)
        sys.exit(1)


def audit_file_json(filepath, config):
    buffer = io.StringIO()
    with contextlib.redirect_stdout(buffer):
        score = audit_file(filepath, config, "json")
    report = json.loads(buffer.getvalue())
    return score, report


def main():
    parser = argparse.ArgumentParser(description="GEO (Generative Engine Optimization) Audit and Helper Tool")
    parser.add_argument("--config", help="Path to geo_config.json configuration file")

    subparsers = parser.add_subparsers(dest="command", help="Subcommand to run")

    # Audit Command (with recursive/batch support)
    audit_parser = subparsers.add_parser("audit", help="Audit content for GEO optimization score")
    audit_parser.add_argument("filepaths", nargs="*", default=None,
                              help="Path(s) to the markdown or HTML file(s) to audit")
    audit_parser.add_argument("-f", "--format", choices=["text", "json"], default="text", help="Output format")
    audit_parser.add_argument("-t", "--threshold", type=int, default=None, help="Exit with code 1 if score is below threshold")
    audit_parser.add_argument("-r", "--recursive", action="store_true", help="Recursively scan directories")
    audit_parser.add_argument("--ignore", nargs="*", default=[], help="Additional ignore patterns (gitignore syntax)")
    audit_parser.add_argument("-s", "--summary", action="store_true", help="Show aggregate site report (JSON only)")

    # Robots Command (audit + generate)
    robots_parser = subparsers.add_parser("robots", help="Audit or generate robots.txt")
    robots_sub = robots_parser.add_subparsers(dest="robots_action", help="Action")
    robots_audit = robots_sub.add_parser("audit", help="Audit robots.txt for AI crawler blocking rules")
    robots_audit.add_argument("filepath", help="Path to robots.txt")
    robots_audit.add_argument(
        "-f", "--format", choices=["text", "json"], default="text", help="Output format"
    )
    robots_gen = robots_sub.add_parser(
        "generate",
        help="Generate a reviewable robots.txt draft for configured AI agents",
    )
    robots_gen.add_argument(
        "--preset", choices=["search-visible", "open"], default="search-visible",
        help="Crawler policy preset",
    )
    robots_gen.add_argument(
        "--disallow", nargs="*", default=[],
        help="Paths to disallow in broadly allowed groups",
    )
    robots_gen.add_argument("--sitemap", default="", help="URL of the sitemap")
    robots_gen.add_argument("--output", default="robots.txt", help="Output file path")
    robots_gen.add_argument("--dry-run", action="store_true", help="Preview without writing")

    # Schema Command
    schema_parser = subparsers.add_parser("schema", help="Generate JSON-LD schema markup from file content")
    schema_parser.add_argument("filepath", help="Path to markdown or HTML file")
    schema_parser.add_argument("type", choices=["article", "faq", "product"], help="Type of schema to generate")

    # LlmsTxt Command
    llmstxt_parser = subparsers.add_parser("llmstxt", help="Generate or audit llms.txt for LLM-friendly site documentation")
    llmstxt_sub = llmstxt_parser.add_subparsers(dest="llmstxt_action", help="Action")
    llmstxt_gen = llmstxt_sub.add_parser("generate", help="Generate llms.txt (and llms-full.txt) from content files")
    llmstxt_gen.add_argument("files", nargs="*", default=None, help="Files or directories to include")
    llmstxt_gen.add_argument("-r", "--recursive", action="store_true", help="Recursively scan directories")
    llmstxt_gen.add_argument("--ignore", nargs="*", default=[], help="Additional ignore patterns")
    llmstxt_gen.add_argument("--output", default=".", help="Output directory")
    llmstxt_gen.add_argument("--site-url", default="", help="Base URL of the site")
    llmstxt_gen.add_argument("--title", default="", help="Site name")
    llmstxt_gen.add_argument("--description", default="", help="Site description")
    llmstxt_gen.add_argument("--full", action="store_true", help="Also generate llms-full.txt")
    llmstxt_gen.add_argument("--dry-run", action="store_true", help="Preview without writing files")
    llmstxt_audit = llmstxt_sub.add_parser("audit", help="Audit an existing llms.txt for spec compliance and coverage")
    llmstxt_audit.add_argument("filepath", help="Path to llms.txt")
    llmstxt_audit.add_argument("-r", "--recursive", action="store_true", help="Check coverage against all site files")

    # Inject Command
    inject_parser = subparsers.add_parser("inject", help="Generate and inject JSON-LD schema block directly into file")
    inject_parser.add_argument("filepath", help="Path to target markdown or HTML file")
    inject_parser.add_argument("type", choices=["article", "faq", "product"], help="Type of schema to generate")
    inject_parser.add_argument("--dry-run", action="store_true", help="Preview changes without writing")
    inject_parser.add_argument("--backup", action="store_true", help="Create .bak file before modifying")
    inject_parser.add_argument("-r", "--recursive", action="store_true", help="Treat path as directory and inject all files within")
    inject_parser.add_argument("--ignore", nargs="*", default=[], help="Additional ignore patterns")
    inject_parser.add_argument(
        "--no-branding",
        action="store_true",
        help="Remove Tooltician branding (Pro license required)",
    )

    config_parser = subparsers.add_parser(
        "config", help="Manage local geo-opt preferences"
    )
    config_parser.add_argument("action", choices=["get", "set"])
    config_parser.add_argument("setting", choices=["reminders"])
    config_parser.add_argument("value", nargs="?", choices=["true", "false"])

    args = parser.parse_args()

    config, config_path = load_config(args.config)

    if args.command == "audit":
        filepaths = args.filepaths
        if not filepaths:
            if args.recursive:
                filepaths = ["."]
            else:
                print("Error: Missing file path for audit command.", file=sys.stderr)
                sys.exit(1)

        # File discovery
        try:
            discovered = discover_files(
                filepaths,
                recursive=args.recursive or False,
                ignore_patterns=args.ignore or [],
                cwd=os.getcwd(),
                config=config,
            )
        except RuntimeError as e:
            print(f"Error: {e}", file=sys.stderr)
            sys.exit(1)

        if not discovered:
            print("No matching files found.", file=sys.stderr)
            sys.exit(1)

        batch_results = audit_files(discovered, config)

        if args.summary and args.format == "json":
            summary = compute_summary(batch_results)
            print(json.dumps(summary, indent=2, ensure_ascii=False))
        elif args.format == "json":
            reports = [r["report"] for r in batch_results if r["status"] == "success"]
            payload = reports[0] if len(reports) == 1 else reports
            print(json.dumps(payload, indent=2, ensure_ascii=False))
        else:
            successes = [r for r in batch_results if r["status"] == "success"]
            for r in successes:
                audit_file(r["file"], config, "text")
            errors = [r for r in batch_results if r["status"] == "error"]
            for e in errors:
                print(f"\nError auditing {e['file']}: {e['error']}", file=sys.stderr)
            if len(batch_results) > 1:
                summary = compute_summary(batch_results)
                print(f"\n{'='*50}")
                print(f"                 SITE SUMMARY                    ")
                print(f"{'='*50}")
                print(f"Files:  {summary['succeeded']}/{summary['totalFiles']} succeeded")
                if summary['failed'] > 0:
                    print(f"        {summary['failed']} failed")
                print(f"Average: {summary['averageScore']}/100")
                print(f"Median:  {summary['medianScore']}/100")
                print(f"Range:   {summary['minScore']} – {summary['maxScore']}")
                print(f"{'='*50}")

        if args.threshold is not None:
            failures = [r for r in batch_results if r["status"] == "success" and r["score"] < args.threshold]
            errs = [r for r in batch_results if r["status"] == "error"]
            if failures or errs:
                if failures:
                    print(f"\nThreshold not met for {len(failures)} file(s):", file=sys.stderr)
                    for f in failures:
                        print(f"  {f['file']}: {f['score']}/100 (threshold: {args.threshold})", file=sys.stderr)
                if errs:
                    print(f"\n{len(errs)} file(s) could not be audited.", file=sys.stderr)
                sys.exit(1)
            if args.format != "json":
                suc = len([r for r in batch_results if r["status"] == "success"])
                print(f"\nAll {suc} file(s) meet threshold {args.threshold}/100.")

    elif args.command == "robots":
        if getattr(args, "robots_action", "audit") == "generate":
            content = generate_robots_txt(
                disallow_paths=args.disallow or [],
                sitemap_url=args.sitemap or "",
                preset=args.preset,
            )
            if getattr(args, "dry_run", False):
                print(content)
                print(f"[dry-run] Would write to: {args.output}")
            else:
                with open(args.output, "w", encoding="utf-8") as f:
                    f.write(content)
                print(f"robots.txt written to {args.output}")
        else:
            check_robots(args.filepath, output_format=args.format)

    elif args.command == "schema":
        schema = generate_schema_data(args.filepath, args.type, config)
        print(json.dumps(schema, indent=2, ensure_ascii=False))

    elif args.command == "llmstxt":
        if getattr(args, "llmstxt_action", "audit") == "generate":
            files = args.files
            if not files:
                files = ["."]
            try:
                discovered = discover_files(
                    files,
                    recursive=args.recursive or False,
                    ignore_patterns=args.ignore or [],
                    cwd=os.getcwd(),
                    config=config,
                )
            except RuntimeError as e:
                print(f"Error: {e}", file=sys.stderr)
                sys.exit(1)

            if not discovered:
                print("No matching files found.", file=sys.stderr)
                sys.exit(1)

            site_url = args.site_url or config.get("siteUrl", "")
            site_title = args.title or (config.get("publisher") or {}).get("name") or os.path.basename(os.getcwd())
            site_description = args.description or config.get("siteDescription", "")

            entries = []
            errors_list = []
            for fp in discovered:
                try:
                    with open(fp, "r", encoding="utf-8", errors="replace") as fh:
                        content = fh.read()
                    meta = extract_page_metadata(content, fp)
                    rel_dir = os.path.relpath(os.path.dirname(fp), os.getcwd())
                    section = "Pages"
                    if rel_dir and rel_dir != ".":
                        section = rel_dir[0].upper() + rel_dir[1:].replace("_", " ").replace("-", " ")
                    url = ""
                    if site_url:
                        rel = os.path.relpath(fp, os.getcwd()).replace(os.sep, "/")
                        ext = os.path.splitext(rel)[1]
                        without_ext = rel[: -len(ext)]
                        if os.path.basename(without_ext) == "index":
                            without_ext = os.path.dirname(without_ext)
                        if without_ext in (".", ""):
                            url = site_url.rstrip("/") + "/"
                        else:
                            url = site_url.rstrip("/") + "/" + without_ext
                    else:
                        url = rel_dir + "/" + os.path.basename(fp)

                    entry = {"path": fp, "url": url, "title": meta["title"],
                             "description": meta["description"], "section": section}
                    if args.full:
                        entry["content"] = content
                    entries.append(entry)
                except Exception as err:
                    errors_list.append({"file": fp, "error": str(err)})

            llms_content = generate_llms_txt(entries, site_title, site_description)

            if getattr(args, "dry_run", False):
                print("=== llms.txt preview ===")
                print(llms_content)
                if args.full:
                    full_content = generate_llms_full_txt([e for e in entries if e.get("content")], site_title)
                    print("\n=== llms-full.txt preview ===")
                    print(full_content[:2000])
                    if len(full_content) > 2000:
                        print(f"\n... ({len(full_content) - 2000} more chars)")
                print(f"\n[dry-run] Would write {len(entries)} page(s) to {os.path.abspath(args.output)}/llms.txt")
            else:
                out_dir = os.path.abspath(args.output)
                os.makedirs(out_dir, exist_ok=True)
                with open(os.path.join(out_dir, "llms.txt"), "w", encoding="utf-8") as f:
                    f.write(llms_content)
                sections_n = len(set(e["section"] for e in entries))
                print(f"✓ llms.txt written ({len(entries)} pages, {sections_n} sections) → {os.path.join(out_dir, 'llms.txt')}")
                if args.full:
                    full_content = generate_llms_full_txt([e for e in entries if e.get("content")], site_title)
                    with open(os.path.join(out_dir, "llms-full.txt"), "w", encoding="utf-8") as f:
                        f.write(full_content)
                    print(f"✓ llms-full.txt written → {os.path.join(out_dir, 'llms-full.txt')}")

            if errors_list:
                print(f"\n{len(errors_list)} file(s) could not be processed:", file=sys.stderr)
                for e in errors_list[:5]:
                    print(f"  {e['file']}: {e['error']}", file=sys.stderr)
                if errors_list:
                    sys.exit(1)
        else:
            fp = args.filepath
            if not os.path.exists(fp):
                print(f"Error: File {fp} not found.", file=sys.stderr)
                sys.exit(1)
            with open(fp, "r", encoding="utf-8", errors="replace") as f:
                content = f.read()
            discovered = []
            if getattr(args, "recursive", False):
                try:
                    discovered = discover_files(["."], recursive=True, cwd=os.getcwd(), config=config)
                except Exception:
                    pass
            report = audit_llms_txt(content, discovered, os.getcwd())
            print(f"{'='*50}")
            print(f"              LLMS.TXT AUDIT REPORT               ")
            print(f"{'='*50}")
            if report["valid"]:
                print("✓ llms.txt is valid and complete.")
            else:
                print(f"{len(report['issues'])} issue(s) found:")
                for issue in report["issues"]:
                    print(f"  - {issue}")
            if "coverage" in report:
                cov = report["coverage"]
                print(f"\nCoverage:")
                print(f"  Listed: {cov['listed']} | Missing: {cov['missing']} | Total: {cov['total']}")
                if cov["missingFiles"]:
                    print("\nMissing from llms.txt:")
                    for mf in cov["missingFiles"]:
                        print(f"  {mf}")
                    if cov["missing"] > 10:
                        print(f"  ... and {cov['missing'] - 10} more")
            print(f"{'='*50}")
            if not report["valid"]:
                sys.exit(1)

    elif args.command == "inject":
        dry_run = args.dry_run or False
        backup = args.backup or False
        no_branding = args.no_branding or False

        if no_branding:
            entitlement_error = no_branding_error(config)
            if entitlement_error:
                print(f"Error: {entitlement_error}", file=sys.stderr)
                sys.exit(1)

        # File discovery for inject
        file_list = []
        if getattr(args, "recursive", False):
            try:
                file_list = discover_files(
                    [args.filepath],
                    recursive=True,
                    ignore_patterns=args.ignore or [],
                    cwd=os.getcwd(),
                    config=config,
                )
            except RuntimeError as e:
                print(f"Error: {e}", file=sys.stderr)
                sys.exit(1)
            if not file_list:
                print("No matching files found.", file=sys.stderr)
                sys.exit(1)
        else:
            file_list = [args.filepath]
            if backup and not dry_run:
                backup_path = args.filepath + ".bak"
                assert_writable_target_inside_cwd(args.filepath)
                assert_new_file_parent_inside_cwd(backup_path)
                try:
                    import shutil
                    shutil.copy2(args.filepath, backup_path)
                    print(f"Backup created: {backup_path}")
                except Exception as e:
                    print(f"Error: Failed to create backup {backup_path}: {e}", file=sys.stderr)
                    sys.exit(1)

        success_count = 0
        fail_count = 0
        for fp in file_list:
            try:
                inject_schema(fp, args.type, config, dry_run=dry_run, no_branding=no_branding)
                success_count += 1
            except SystemExit:
                fail_count += 1
            except Exception as e:
                print(f"Error injecting {fp}: {e}", file=sys.stderr)
                fail_count += 1
        if dry_run:
            print(f"[dry-run] Would inject {args.type} schema into {success_count} file(s)" +
                  (f" ({fail_count} skipped)" if fail_count else ""))
        elif args.recursive:
            print(f"Injected {success_count} file(s)" + (f", {fail_count} failed" if fail_count else ""))
        if not dry_run:
            record_successful_free_injection(config)
        if fail_count > 0:
            sys.exit(1)

    elif args.command == "config":
        if args.action == "get":
            print("true" if reminders_are_enabled() else "false")
        else:
            if args.value is None:
                config_parser.error("set reminders requires true or false")
            enabled = args.value == "true"
            if not set_reminders_enabled(enabled):
                print(
                    "Error: Could not save the local reminder preference.",
                    file=sys.stderr,
                )
                sys.exit(1)
            print(f"Support reminders {'enabled' if enabled else 'disabled'}.")
    else:
        parser.print_help()

if __name__ == "__main__":
    main()
