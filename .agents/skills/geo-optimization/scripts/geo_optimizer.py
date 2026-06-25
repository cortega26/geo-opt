#!/usr/bin/env python3
import sys
import re
import os
import json
import argparse

# Default thresholds
MAX_PRONOUN_DENSITY = 0.02

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
                print(f"Warning: Failed to parse config at {path}: {e}", file=sys.stderr)
                
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
    # Strip markdown code blocks
    text = re.sub(r'```.*?```', '', content, flags=re.DOTALL)
    # Strip HTML script and style blocks
    text = re.sub(r'<script.*?>.*?</script>', '', text, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r'<style.*?>.*?</style>', '', text, flags=re.DOTALL | re.IGNORECASE)
    # Strip HTML comments
    text = re.sub(r'<!--.*?-->', '', text, flags=re.DOTALL)
    return text

def clean_markdown_to_plain_text(md_text):
    """Converts markdown (links, bold, tables) to clean, search-compliant plain text for schema nodes."""
    # Remove links keeping text: [text](url) -> text
    text = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', md_text)
    # Remove bold/italic tags
    text = re.sub(r'[\*_]{1,3}', '', text)
    
    lines = []
    for line in text.split('\n'):
        line = line.strip()
        if line.startswith('|') and line.endswith('|'):
            # Skip divider rows
            if re.match(r'^\|[\s\-\:\+\|]+$', line):
                continue
            cells = [c.strip() for c in line.split('|')[1:-1]]
            lines.append(' - '.join(c for c in cells if c))
        else:
            lines.append(line)
            
    return '\n'.join(lines).strip()

def extract_sections(content):
    """Robustly extracts headings and their clean body text from markdown, stripping code blocks."""
    clean_content = preprocess_content(content)
    sections = []
    current_header = None
    current_text = []
    
    for line in clean_content.split('\n'):
        header_match = re.match(r'^(##+)\s+(.+)$', line)
        if header_match:
            if current_header:
                sections.append((current_header, '\n'.join(current_text).strip()))
            current_header = header_match.group(2).strip()
            current_text = []
        else:
            if current_header is not None:
                current_text.append(line)
                
    if current_header:
        sections.append((current_header, '\n'.join(current_text).strip()))
        
    return sections

def audit_file(filepath, config, output_format="text"):
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
        
    if ("|" in text_content and re.search(r'\|\s*:?-+:?\s*\|', text_content)) or "<table>" in text_content.lower():
        struct_score += 4
        struct_breakdown.append("Tables: Structured data tables present (+4 pts)")
    else:
        struct_breakdown.append("Tables: No tables found (+0 pts)")
        
    if re.search(r'^\s*[\-\*\+\d\.]+\s+', text_content, re.MULTILINE):
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
    if filepath.endswith('.html') or "<html" in content.lower():
        html_lowered = content.lower()
        semantic_tags = ["<article", "<main", "<header", "<footer", "<nav", "<section"]
        found_tags = [t for t in semantic_tags if t in html_lowered]
        if len(found_tags) >= 3:
            struct_breakdown.append(f"Semantic HTML: Good HTML5 layout tags used ({', '.join(found_tags)}) (+0 pts)")
        else:
            deduction = 4
            struct_score = max(0, struct_score - deduction)
            struct_breakdown.append(f"Semantic HTML: Lacks HTML5 structural tags (e.g. <main>, <article>). Found only: {', '.join(found_tags)} (-{deduction} pts)")
            
        # Check for dynamic client-side JS rendering setups
        dynamic_indicators = ["id=\"app\"", "id=\"root\"", "createapp(", "reactdom.render("]
        found_dynamic = [ind for ind in dynamic_indicators if ind in html_lowered]
        if found_dynamic:
            struct_breakdown.append("Dynamic Rendering Warning: Detects client-side JS references. Ensure content is pre-rendered / SSR for AI crawler searchability.")

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
    if stat_count >= 3:
        stats_score = 20
        stats_breakdown = f"High density ({stat_count} stats found): {', '.join(filtered_stats[:5])}... (+20 pts)"
    elif stat_count > 0:
        stats_score = 10
        stats_breakdown = f"Moderate density ({stat_count} stats found): {', '.join(filtered_stats)} (+10 pts)"
    else:
        stats_breakdown = "No statistics or numerical evidence found (+0 pts)"

    # 3. Quotation Density (Max 20 pts)
    quotes_score = 0
    quote_blocks = re.findall(r'^\s*>\s+.+', text_content, re.MULTILINE)
    inline_quotes = re.findall(r'"([^"]{15,})"', text_content)
    quote_count = len(quote_blocks) + len(inline_quotes)
    
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
    links = re.findall(r'\[([^\]]+)\]\((https?://[^\)]+)\)', text_content)
    html_links = re.findall(r'href=["\'](https?://[^"\']+)["\']', text_content)
    link_count = len(links) + len(html_links)
    
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
            print("Excellent! This page is fully optimized for generative search engine indexing.")
        else:
            for r in recs:
                print(f"- {r}")
        print("==================================================")
        
    return total_score

def check_robots(robots_path):
    if not os.path.exists(robots_path):
        print(f"Error: robots.txt not found at {robots_path}", file=sys.stderr)
        sys.exit(1)
        
    try:
        with open(robots_path, 'r', encoding='utf-8', errors='replace') as f:
            content = f.read()
    except Exception as e:
        print(f"Error: Failed to read robots.txt: {e}", file=sys.stderr)
        sys.exit(1)
        
    ai_agents = [
        "GPTBot", "Google-Extended", "ClaudeBot", 
        "PerplexityBot", "Applebot-Extended", "Anthropic-AI"
    ]
    
    print("==================================================")
    print("            ROBOTS.TXT CRAWLER AUDIT             ")
    print("==================================================")
    
    blocked_agents = []
    lines = content.split('\n')
    current_agent = None
    
    for line in lines:
        line = line.strip()
        if not line or line.startswith('#'):
            continue
            
        agent_match = re.match(r'^User-agent:\s*(.+)$', line, re.IGNORECASE)
        if agent_match:
            current_agent = agent_match.group(1).strip()
            continue
            
        disallow_match = re.match(r'^Disallow:\s*(.+)$', line, re.IGNORECASE)
        if disallow_match and current_agent:
            disallowed_path = disallow_match.group(1).strip()
            if disallowed_path in ["/", "/*"] or (current_agent == "*" and disallowed_path in ["/", "/*"]):
                blocked_agents.append((current_agent, disallowed_path))
                
    if blocked_agents:
        print("WARNING: The following AI agents are blocked from crawling your root directory:")
        for agent, path in blocked_agents:
            print(f"  - User-agent: {agent} (Disallow: {path})")
        print("\nNote: Blocking these crawlers prevents AI engines from indexing your content and citing your pages.")
    else:
        print("SUCCESS: No major AI agents or wildcard directives are blocking root access.")
        print("Your content is crawler-friendly for generative search engine indexing.")
    print("==================================================")

def generate_schema_data(filepath, schema_type, config):
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
    
    title_match = re.search(r'^#\s+(.+)$', clean_text, re.MULTILINE)
    title = title_match.group(1).strip() if title_match else "Untitled Document"
    
    intro_match = re.search(r'^#\s+.+?\n\n([^#\n]+)', clean_text, re.DOTALL)
    description = intro_match.group(1).strip() if intro_match else ""
    if len(description) > 150:
        description = description[:147] + "..."
        
    author_info = config.get("author", {})
    pub_info = config.get("publisher", {})
    
    pub_url = pub_info.get("url", "https://example.com").rstrip("/")
    org_id = f"{pub_url}/#organization"
    org_node = {
        "@type": "Organization",
        "@id": org_id,
        "name": pub_info.get("name", "Publisher Name"),
        "url": pub_url
    }
    if pub_info.get("logo"):
        org_node["logo"] = {
            "@type": "ImageObject",
            "url": pub_info.get("logo")
        }
        
    author_id = f"{pub_url}/#author"
    author_node = {
        "@type": "Person",
        "@id": author_id,
        "name": author_info.get("name", "Author Name"),
        "jobTitle": author_info.get("jobTitle", "Job Title")
    }
    if author_info.get("sameAs"):
        author_node["sameAs"] = author_info.get("sameAs")
        
    graph_nodes = [org_node, author_node]
    
    if schema_type == "article":
        article_node = {
            "@type": "NewsArticle",
            "@id": f"{pub_url}/#article",
            "headline": title,
            "description": description,
            "datePublished": "2026-06-25T12:00:00+00:00",
            "author": {"@id": author_id},
            "publisher": {"@id": org_id}
        }
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
                    "@id": f"{pub_url}/#faq",
                    "mainEntity": qa_list
                }
                graph_nodes.append(faq_node)
            
    elif schema_type == "faq":
        sections = extract_sections(content)
        qa_list = []
        for q, a in sections[:5]:
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
            "@id": f"{pub_url}/#faq",
            "mainEntity": qa_list
        }
        graph_nodes.append(faq_node)
        
    elif schema_type == "product":
        product_node = {
            "@type": "Product",
            "@id": f"{pub_url}/#product",
            "name": title,
            "description": description,
            "brand": {"@id": org_id},
            "offers": {
                "@type": "Offer",
                "priceCurrency": "USD",
                "availability": "https://schema.org/InStock",
                "seller": {"@id": org_id}
            }
        }
        graph_nodes.append(product_node)
        
    return {
        "@context": "https://schema.org",
        "@graph": graph_nodes
    }

def inject_schema(filepath, schema_type, config):
    if not os.path.exists(filepath):
        print(f"Error: File {filepath} not found.", file=sys.stderr)
        sys.exit(1)
        
    schema = generate_schema_data(filepath, schema_type, config)
    schema_json = json.dumps(schema, indent=2, ensure_ascii=False)
    
    try:
        with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
            content = f.read()
    except Exception as e:
        print(f"Error: Failed to read file {filepath}: {e}", file=sys.stderr)
        sys.exit(1)
        
    schema_pattern = r'```json\s*\{\s*"@context":\s*"https://schema\.org".*?\}\s*```'
    script_pattern = r'<script[^>]*type="application/ld\+json"[^>]*>.*?https://schema\.org.*?</script>'
    
    signature = config.get("signature")
    sig_md = ""
    sig_html = ""
    
    if signature:
        # Check for signature presence by stripping links
        sig_raw = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', signature)
        # Check if already present in content
        if sig_raw not in content:
            sig_md = f"\n\n{signature}\n"
            sig_html = f'\n<div class="geo-signature"><p>{signature}</p></div>\n'
            
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
            
    try:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
    except Exception as e:
        print(f"Error: Failed to write to file {filepath}: {e}", file=sys.stderr)
        sys.exit(1)

def main():
    parser = argparse.ArgumentParser(description="GEO (Generative Engine Optimization) Audit and Helper Tool")
    parser.add_argument("--config", help="Path to geo_config.json configuration file")
    
    subparsers = parser.add_subparsers(dest="command", help="Subcommand to run")
    
    # Audit Command
    audit_parser = subparsers.add_parser("audit", help="Audit content for GEO optimization score")
    audit_parser.add_argument("filepath", help="Path to the markdown or HTML file to audit")
    audit_parser.add_argument("-f", "--format", choices=["text", "json"], default="text", help="Output format")
    
    # Robots Command
    robots_parser = subparsers.add_parser("robots", help="Audit robots.txt for AI bot block rules")
    robots_parser.add_argument("filepath", help="Path to robots.txt")
    
    # Schema Command
    schema_parser = subparsers.add_parser("schema", help="Generate JSON-LD schema markup from file content")
    schema_parser.add_argument("filepath", help="Path to markdown or HTML file")
    schema_parser.add_argument("type", choices=["article", "faq", "product"], help="Type of schema to generate")
    
    # Inject Command
    inject_parser = subparsers.add_parser("inject", help="Generate and inject JSON-LD schema block directly into file")
    inject_parser.add_argument("filepath", help="Path to target markdown or HTML file")
    inject_parser.add_argument("type", choices=["article", "faq", "product"], help="Type of schema to generate")
    
    args = parser.parse_args()
    
    config, config_path = load_config(args.config)
    
    if args.command == "audit":
        audit_file(args.filepath, config, args.format)
    elif args.command == "robots":
        check_robots(args.filepath)
    elif args.command == "schema":
        schema = generate_schema_data(args.filepath, args.type, config)
        print(json.dumps(schema, indent=2, ensure_ascii=False))
    elif args.command == "inject":
        inject_schema(args.filepath, args.type, config)
    else:
        parser.print_help()

if __name__ == "__main__":
    main()
