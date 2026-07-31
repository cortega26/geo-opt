# Plan 006: Add BeautifulSoup4 and mistune to Python skill implementation

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 4dff240..HEAD -- .agents/skills/geo-optimization/scripts/geo_optimizer.py .agents/skills/geo-optimization/scripts/test_optimizer.py`
> If any of these files changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: 002 and 003 (the JS cheerio + marked refactors define the
  target behavior. The Python port should mirror those implementations, not
  the pre-refactor regex code. If 002 or 003 changed `extractSections`,
  `cleanMarkdownToPlainText`, or `cleanHtmlText`, mirror those changes.)
- **Category**: tech-debt (parity improvement)
- **Planned at**: commit `4dff240`, 2026-06-26

## Why this matters

The Python implementation (`geo_optimizer.py`, 1234 lines) is the engine
behind the bundled agent skill (`SKILL.md`). It mirrors every function in
the JS codebase — scoring, schema generation, injection, robots audit,
licensing, and engagement. Currently, it duplicates the same regex-based
HTML and Markdown parsing that plans 002 and 003 replace in the JS
implementation. When an agent applies GEO optimization through the skill,
it uses this Python code; fragile parsing means the agent may produce wrong
scores or malformed JSON-LD.

**BeautifulSoup4** (`beautifulsoup4`) is the standard HTML parser for
Python — robust, tolerant of malformed markup, handles all HTML entities.
**mistune** is a fast, AST-based Markdown parser (~30KB) that matches the
capabilities of marked (plan 003). Together they bring the Python
implementation to parity with the post-plan-003 JS codebase.

## Current state

### File: `.agents/skills/geo-optimization/scripts/geo_optimizer.py`

The Python implementation mirrors the JS codebase function-for-function.
The HTML and Markdown regex patterns are functionally identical to the
pre-refactor JS code.

**`clean_html_text()`** (`geo_optimizer.py:281-295`) — same 7-regex loop
as JS `cleanHtmlText()`:

```python
def clean_html_text(value):
    text = re.sub(r"<script\b[^>]*>.*?</script>", " ", value, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r"<style\b[^>]*>.*?</style>", " ", text, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r"<[^>]+>", " ", text)
    replacements = {
        "&nbsp;": " ", "&amp;": "&", "&lt;": "<",
        "&gt;": ">", "&quot;": '"', "&#39;": "'",
    }
    for source, replacement in replacements.items():
        text = re.sub(re.escape(source), replacement, text, flags=re.IGNORECASE)
    return re.sub(r"\s+", " ", text).strip()
```

**`preprocess_content()`** (`geo_optimizer.py:343-352`) — same regex
approach as JS:

```python
def preprocess_content(content):
    text = re.sub(r'```.*?```', '', content, flags=re.DOTALL)
    text = re.sub(r'<script.*?>.*?</script>', '', text, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r'<style.*?>.*?</style>', '', text, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r'<!--.*?-->', '', text, flags=re.DOTALL)
    return text
```

**`extract_sections()`** (`geo_optimizer.py:379-404`) — line-by-line
heading parsing, same limitations as JS version.

**`clean_markdown_to_plain_text()`** (`geo_optimizer.py:354-377`) — regex
link and formatting removal, same gaps.

**`audit_file()`** (`geo_optimizer.py:406-718`) — uses the same regex
patterns for link counting, quote detection, table detection, and list
detection as the pre-refactor JS `scoring.js`.

### Python parity test convention

Tests live in
`.agents/skills/geo-optimization/scripts/test_optimizer.py` and use
Python's `unittest` framework. The test runner is:

```bash
python3 .agents/skills/geo-optimization/scripts/test_optimizer.py
```

This is part of `npm run check` via `npm run test:python`
(`package.json:23`).

### Dependencies management

The Python skill does not currently have a `requirements.txt` or any
dependency management. For this plan, we create one in
`.agents/skills/geo-optimization/scripts/requirements.txt`.

### Repo conventions for Python

- snake_case for functions and variables.
- `sys.exit(1)` on fatal CLI errors.
- `print(..., file=sys.stderr)` for diagnostics.
- CLI errors should write to stderr and exit non-zero.
- Tests use `unittest` and follow the pattern in `test_optimizer.py`.
- Both implementations must stay functionally aligned
  (`AGENTS.md:37-39`). After this plan, the Python implementation should
  produce identical results to the JS implementation (post plans 002+003).

## Commands you will need

| Purpose           | Command                                                             | Expected on success          |
|-------------------|---------------------------------------------------------------------|------------------------------|
| Python tests      | `python3 .agents/skills/geo-optimization/scripts/test_optimizer.py` | exit 0, all tests pass       |
| JS tests          | `npm test`                                                          | exit 0 (JS side unaffected)  |
| Full check        | `npm run check`                                                     | exit 0                       |
| Install deps      | `pip install -r .agents/skills/geo-optimization/scripts/requirements.txt` | exit 0                |

## Scope

**In scope** (the only files you should modify):
- `.agents/skills/geo-optimization/scripts/geo_optimizer.py` — refactor
  HTML and Markdown parsing functions to use beautifulsoup4 and mistune
- `.agents/skills/geo-optimization/scripts/requirements.txt` — create
  with beautifulsoup4 and mistune
- `.agents/skills/geo-optimization/scripts/test_optimizer.py` — add
  edge-case tests matching the JS tests from plans 002 and 003
- `CHANGELOG.md` — add Unreleased entry
- `AGENTS.md` — update the test command table if the Python test command
  gains a `pip install` prerequisite (note it in the command description)

**Out of scope** (do NOT touch, even though they look related):
- `src/*.js` — JS code is modified via plans 002 and 003 only.
- `.agents/skills/geo-optimization/geo_config.json` — configuration file,
  not code.
- `SKILL.md` — skill documentation; no behavioral changes to document.
- The Python CLI argument parsing (`argparse` section) — it works and is
  not regex-based.
- Adding a virtual environment or pipenv/poetry — a simple
  `requirements.txt` is sufficient for this project's scale.
- `sys.path` manipulation to find the libraries — assume the user installs
  them globally or in the active environment.

## Git workflow

- Branch: `advisor/006-python-parsing-libs`
- Commit style: conventional commits. Example: `feat: replace regex
  HTML/Markdown parsing with beautifulsoup4 and mistune in Python skill`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 0: Baseline parity check

Run both test suites to confirm the starting state:

```bash
npm test
python3 .agents/skills/geo-optimization/scripts/test_optimizer.py
```

**Verify**: both exit 0.

### Step 1: Create requirements.txt

Create `.agents/skills/geo-optimization/scripts/requirements.txt`:

```
beautifulsoup4>=4.12
mistune>=3.0
```

**Verify**: `pip install -r .agents/skills/geo-optimization/scripts/requirements.txt` →
exit 0. Then:

```bash
python3 -c "from bs4 import BeautifulSoup; print('bs4 ok')"
python3 -c "import mistune; print('mistune ok')"
```

Both print "ok".

### Step 2: Refactor HTML parsing functions

#### 2a. `clean_html_text()`

Replace the regex chain with BeautifulSoup:

```python
from bs4 import BeautifulSoup

def clean_html_text(value):
    soup = BeautifulSoup(value, "html.parser")
    return re.sub(r"\s+", " ", soup.get_text()).strip()
```

`BeautifulSoup(..., "html.parser")` uses Python's built-in html.parser —
no extra dependencies. `soup.get_text()` decodes all HTML entities and
strips all tags.

#### 2b. `preprocess_content()`

Replace the script/style regex with BeautifulSoup:

```python
def preprocess_content(content):
    # Strip markdown code blocks first (BeautifulSoup doesn't parse markdown)
    text = re.sub(r'```.*?```', '', content, flags=re.DOTALL)
    # Strip HTML comments (BeautifulSoup preserves them as Comment nodes)
    text = re.sub(r'<!--.*?-->', '', text, flags=re.DOTALL)
    # Use BeautifulSoup to strip <script> and <style> elements reliably
    soup = BeautifulSoup(text, "html.parser")
    for tag in soup(["script", "style"]):
        tag.decompose()
    return str(soup)
```

#### 2c. Meta description extraction in `generate_schema_data()`

Replace the regex lookahead (around line 869-877) with a BeautifulSoup
query:

```python
if not description and (filepath.endswith(".html") or "<html" in clean_text.lower()):
    soup = BeautifulSoup(content, "html.parser")
    meta_desc = soup.find("meta", attrs={"name": "description"})
    if meta_desc and meta_desc.get("content"):
        description = clean_html_text(meta_desc["content"])
    if not description:
        first_p = soup.find("p")
        if first_p:
            description = clean_html_text(first_p.get_text())
```

#### 2d. Semantic tag and SPA detection in `audit_file()`

Replace the `.includes()`-based checks (around line 469-484) with
BeautifulSoup DOM queries:

```python
if filepath.endswith('.html') or "<html" in text_content.lower():
    soup = BeautifulSoup(content, "html.parser")
    semantic_tags = ["article", "main", "header", "footer", "nav", "section"]
    found_tags = [t for t in semantic_tags if soup.find(t) is not None]
    if len(found_tags) >= 3:
        struct_breakdown.append(f"...")
    else:
        deduction = 4
        struct_score = max(0, struct_score - deduction)
        struct_breakdown.append(f"...")

    # SPA detection
    dynamic_selectors = ['[id="app"]', '[id="root"]']
    found_containers = [s for s in dynamic_selectors if soup.select_one(s) is not None]
    has_frameworks = bool(re.search(r'createapp\(|reactdom\.render\(', html_lowered))
    if found_containers or has_frameworks:
        struct_breakdown.append("Dynamic Rendering Warning: ...")
```

**Verify**: `python3 .agents/skills/geo-optimization/scripts/test_optimizer.py` →
all existing tests pass. Pay special attention to tests for
`generate_schema_data` and `audit_file`.

### Step 3: Refactor Markdown parsing functions

#### 3a. `extract_sections()`

Replace line-by-line heading parsing with mistune AST:

```python
import mistune

def extract_sections(content):
    clean_content = preprocess_content(content)
    # mistune parses markdown into an AST (list of dicts)
    markdown = mistune.create_markdown(renderer=None)
    tokens = markdown.parse(clean_content)

    sections = []
    current_header = None
    current_text = []

    for token in tokens:
        if token["type"] == "heading" and token["attrs"]["level"] >= 2:
            if current_header:
                sections.append((current_header, "\n".join(current_text).strip()))
            # Extract text from heading children
            header_text = "".join(
                child.get("text", child.get("raw", ""))
                for child in token.get("children", [])
            )
            current_header = header_text
            current_text = []
        elif current_header is not None:
            if token["type"] in ("paragraph", "text"):
                current_text.append(_extract_text_from_children(token))
            elif token["type"] == "list":
                for item in token.get("children", []):
                    current_text.append(_extract_text_from_children(item))
            elif token["type"] == "block_quote":
                current_text.append(_extract_text_from_children(token))
            elif token["type"] == "block_code":
                current_text.append(token.get("raw", ""))
            elif token["type"] == "table":
                rows = []
                for row in token.get("children", []):
                    cells = [_extract_text_from_children(cell) for cell in row.get("children", [])]
                    rows.append(" | ".join(cells))
                current_text.append("\n".join(rows))

    if current_header:
        sections.append((current_header, "\n".join(current_text).strip()))

    return sections


def _extract_text_from_children(token):
    """Recursively extract plain text from mistune AST token children."""
    if "children" in token:
        return "".join(_extract_text_from_children(c) for c in token["children"])
    return token.get("text", token.get("raw", ""))
```

**Note**: The return type stays `[(header, body)]` — a list of tuples,
matching the existing Python convention (documented in
`docs/implementation-strategy.md:33` as an intentional difference from JS).

#### 3b. `clean_markdown_to_plain_text()`

Replace regex-based link and formatting removal with mistune:

```python
def clean_markdown_to_plain_text(md_text):
    markdown = mistune.create_markdown(renderer=None)
    tokens = markdown.parse(md_text)
    parts = []

    def walk(tok):
        if isinstance(tok, list):
            for t in tok:
                walk(t)
        elif isinstance(tok, dict):
            ttype = tok.get("type")
            if ttype == "text":
                parts.append(tok.get("text", ""))
            elif ttype == "link":
                # Keep link text, drop URL
                walk(tok.get("children", []))
            elif ttype == "image":
                # Keep alt text
                if tok.get("alt"):
                    parts.append(tok["alt"])
            elif ttype in ("codespan", "strong", "emphasis", "delete"):
                walk(tok.get("children", []))
            elif ttype == "html_inline":
                parts.append(re.sub(r"<[^>]+>", "", tok.get("text", "")))
            elif ttype == "linebreak":
                parts.append("\n")
            elif ttype == "paragraph":
                walk(tok.get("children", []))
                parts.append("\n")
            elif ttype == "list":
                for item in tok.get("children", []):
                    walk(item.get("children", []))
                    parts.append("\n")
            elif ttype == "table":
                for row in tok.get("children", []):
                    cells = [_extract_text_from_children(c) for c in row.get("children", [])]
                    parts.append(" - ".join(cells))
                    parts.append("\n")
            elif "children" in tok:
                walk(tok["children"])

    walk(tokens)
    return re.sub(r"\s+", " ", "".join(parts)).strip()
```

#### 3c. Link, quote, table, list detection in `audit_file()`

Replace regex patterns with mistune token walks:

```python
def _count_md_links(tokens):
    count = 0
    def walk(tok):
        nonlocal count
        if isinstance(tok, list):
            for t in tok: walk(t)
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
            for t in tok: walk(t)
        elif isinstance(tok, dict):
            if tok.get("type") == "block_quote": count += 1
            if "children" in tok: walk(tok["children"])
    walk(tokens)
    return count

def _has_table(tokens):
    def walk(tok):
        if isinstance(tok, list):
            return any(walk(t) for t in tok)
        if isinstance(tok, dict):
            if tok.get("type") == "table": return True
            if "children" in tok and walk(tok["children"]): return True
        return False
    return walk(tokens)

def _has_list(tokens):
    def walk(tok):
        if isinstance(tok, list):
            return any(walk(t) for t in tok)
        if isinstance(tok, dict):
            if tok.get("type") == "list": return True
            if "children" in tok and walk(tok["children"]): return True
        return False
    return walk(tokens)
```

In `audit_file()`, after computing `text_content`, parse it with mistune:

```python
text_content = preprocess_content(content)
md_tokens = mistune.create_markdown(renderer=None).parse(text_content)
```

Then use the helper functions:

```python
md_link_count = _count_md_links(md_tokens)
blockquote_count = _count_blockquotes(md_tokens)
has_md_table = _has_table(md_tokens)
has_md_list = _has_list(md_tokens)
```

Replace the corresponding regex-based counts with these values.

**Verify**: `python3 .agents/skills/geo-optimization/scripts/test_optimizer.py` →
all existing tests pass.

### Step 4: Add Python edge-case tests

Add test cases to `test_optimizer.py` matching the JS tests from plans 002
and 003:

1. HTML entity decoding beyond the hardcoded 6 (test `&euro;`, `&mdash;`,
   `&copy;`)
2. Meta description extraction with reversed attribute order
3. Semantic HTML detection ignoring tag names in text
4. Reference-style Markdown links
5. Multi-line blockquotes counted correctly
6. Headings inside code blocks not extracted as sections

Follow the existing test class pattern in `test_optimizer.py`. Use
`tempfile.NamedTemporaryFile` for fixture files.

**Verify**: all new tests pass.

### Step 5: Run full check (both JS and Python)

```bash
npm run check
```

This runs JS lint, JS format check, JS tests, Python tests, and changelog
check.

**Verify**: exit 0.

### Step 6: Update changelog

Under `## [Unreleased]` / `### Changed`:

```markdown
- Python skill: replaced regex-based HTML/Markdown parsing with
  BeautifulSoup4 and mistune (`geo_optimizer.py`), matching JS parity.
```

**Verify**: `npm run changelog:check` → exit 0.

## Test plan

- All existing Python tests in `test_optimizer.py` must pass unmodified.
  If a scoring test changes its expected value, the mistune-derived score
  is correct — update the test (same logic as plan 003 for JS).
- New Python tests covering the same edge cases as the JS tests from plans
  002 and 003.
- Structural pattern: follow existing `unittest.TestCase` classes in
  `test_optimizer.py`.
- Verification: `python3 .agents/skills/geo-optimization/scripts/test_optimizer.py` → exit 0.

## Done criteria

- [ ] `npm run check` exits 0 (includes `test:python`)
- [ ] `python3 -c "from bs4 import BeautifulSoup; import mistune"` exits 0
- [ ] `pip install -r .agents/skills/geo-optimization/scripts/requirements.txt` exits 0
- [ ] `grep "from bs4 import BeautifulSoup" .agents/skills/geo-optimization/scripts/geo_optimizer.py` returns one match
- [ ] `grep "import mistune" .agents/skills/geo-optimization/scripts/geo_optimizer.py` returns one match
- [ ] `grep "clean_html_text\|clean_html_text" .agents/skills/geo-optimization/scripts/geo_optimizer.py` — the regex chain is replaced by BeautifulSoup
- [ ] `grep -c "re.sub.*script.*style" .agents/skills/geo-optimization/scripts/geo_optimizer.py` returns 0 (script/style regex removed)
- [ ] `.agents/skills/geo-optimization/scripts/requirements.txt` exists with both dependencies
- [ ] No files outside in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `pip install beautifulsoup4 mistune` fails (network issue or incompatible
  Python version — bs4 requires Python 3.6+, mistune 3.0 requires 3.8+).
- Plans 002 and/or 003 changed the JS function signatures in ways that
  differ from the Python refactors described here. Read the current state
  of `src/text.js`, `src/schema.js`, and `src/scoring.js` before starting
  the Python refactors. If they differ materially, adjust the Python
  implementation to match — do not diverge the two implementations.
- The Python test suite fails after any step and reverting doesn't restore
  the passing state.
- `mistune.create_markdown(renderer=None).parse()` returns an AST shape
  different from the `{"type": ..., "children": [...]}` structure assumed
  here. Run `python3 -c 'import mistune; m=mistune.create_markdown(renderer=None); import json; print(json.dumps(m.parse("## Test\n\nText"), indent=2))'` to inspect the actual AST.
- Score calculations differ by more than ±3 points from the regex baseline
  on existing test fixtures.

## Maintenance notes

- `mistune` v3 uses a plugin-based architecture. The default
  `create_markdown()` enables GFM-style tables, strikethrough, and task
  lists. If future features need different Markdown extensions, pass them
  via the `plugins` argument.
- BeautifulSoup's `"html.parser"` (Python stdlib) is used instead of
  `"lxml"` to avoid an extra C library dependency. It is slower than lxml
  but fast enough for typical content sizes (a few KB to 100KB). If
  performance becomes an issue, switch to `"lxml"` and add `lxml` to
  requirements.txt.
- The JS and Python implementations now use different libraries (cheerio vs
  bs4, marked vs mistune) but produce identical results. The
  `docs/implementation-strategy.md` sync checklist applies: after any
  change to the JS text/schema/scoring modules, check the Python
  equivalents and vice versa.
- The `_extract_text_from_children()` and `walk()` helpers added in this
  plan are internal functions. Do not export them as part of the public
  Python API.
