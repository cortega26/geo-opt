#!/usr/bin/env python3
import unittest
import os
import re
import tempfile
import sys
import json
import subprocess
import contextlib
from datetime import datetime, timezone
from io import StringIO
from unittest import mock

# Add current directory to path to import script
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
import geo_optimizer
from geo_optimizer import (
    AI_CRAWLER_AGENTS,
    AI_CRAWLER_REGISTRY,
    calculate_readability,
    create_finding,
    audit_file,
    audit_files,
    compute_summary,
    discover_files,
    extract_page_metadata,
    generate_llms_txt,
    generate_llms_full_txt,
    audit_llms_txt,
    audit_robots,
    generate_robots_txt,
    parse_robots_groups,
    check_robots,
    generate_schema_data,
    has_pro_entitlement,
    inject_schema,
    load_config,
    read_engagement_state,
    record_successful_free_injection,
    reminders_are_enabled,
    set_reminders_enabled,
    write_engagement_state,
    write_file_safe,
    copy_file_safe,
    _render_text_report,
)

class TestGeoOptimizer(unittest.TestCase):
    
    def setUp(self):
        self.held_stdout = StringIO()
        sys.stdout = self.held_stdout
        self.config = {
            "author": {
                "name": "Carlos Ortega González",
                "jobTitle": "Sr. Software Automation and Data Analyst",
                "sameAs": "https://www.linkedin.com/in/cortega26/"
            },
            "publisher": {
                "name": "Tooltician",
                "url": "https://www.tooltician.com",
                "logo": "https://www.tooltician.com/logo.png"
            },
            "acronyms": {
                "AWS": "Amazon Web Services",
                "GDPR": "General Data Protection Regulation"
            },
            "product": {
                "offer": {
                    "price": "49.00",
                    "priceCurrency": "USD",
                    "availability": "https://schema.org/InStock"
                }
            }
        }
        
    def tearDown(self):
        sys.stdout = sys.__stdout__

    def test_calculate_readability(self):
        text = "This is a simple sentence. Here is another sentence containing more words."
        word_count, avg_len = calculate_readability(text)
        self.assertEqual(word_count, 12)
        self.assertEqual(avg_len, 6.0)

    def test_check_robots_blocking(self):
        with tempfile.NamedTemporaryFile(mode='w+', suffix='.txt', delete=False) as temp:
            temp.write("User-agent: GPTBot\nDisallow: /\nUser-agent: *\nDisallow: /private\n")
            temp_path = temp.name
            
        try:
            check_robots(temp_path)
            output = self.held_stdout.getvalue()
            self.assertIn("WARNING: The following AI agents are blocked", output)
            self.assertIn("GPTBot", output)
        finally:
            os.remove(temp_path)

    def test_check_robots_allowing(self):
        with tempfile.NamedTemporaryFile(mode='w+', suffix='.txt', delete=False) as temp:
            temp.write("User-agent: *\nDisallow: /admin\n")
            temp_path = temp.name
            
        try:
            check_robots(temp_path)
            output = self.held_stdout.getvalue()
            self.assertIn("SUCCESS: No configured AI agents or wildcard directives are blocking", output)
        finally:
            os.remove(temp_path)

    def test_check_robots_ignores_unrelated_bots_and_honors_allow(self):
        with tempfile.NamedTemporaryFile(mode='w+', suffix='.txt', delete=False) as unrelated:
            unrelated.write("User-agent: TotallyUnrelatedBot\nDisallow: /\n")
            unrelated_path = unrelated.name
        with tempfile.NamedTemporaryFile(mode='w+', suffix='.txt', delete=False) as allowed:
            allowed.write("User-agent: GPTBot\nDisallow: /\nAllow: /\n")
            allowed_path = allowed.name

        try:
            check_robots(unrelated_path)
            check_robots(allowed_path)
            output = self.held_stdout.getvalue()
            self.assertIn("SUCCESS", output)
            self.assertNotIn("TotallyUnrelatedBot", output)
            self.assertNotIn("root access blocked", output)
        finally:
            os.remove(unrelated_path)
            os.remove(allowed_path)

    def test_parse_robots_groups_splits_comma_agents(self):
        groups = parse_robots_groups(
            "User-agent: GPTBot, Googlebot\nDisallow: /private\n"
        )
        self.assertEqual(groups[0]["agents"], ["GPTBot", "Googlebot"])
        self.assertEqual(groups[0]["rules"][0]["path"], "/private")

        trailing = parse_robots_groups(
            "User-agent: GPTBot, \nDisallow: /private\n"
        )
        self.assertEqual(trailing[0]["agents"], ["GPTBot"])

        spaced = parse_robots_groups(
            "User-agent:  Googlebot  ,ClaudeBot\nDisallow: /x\n"
        )
        self.assertEqual(spaced[0]["agents"], ["Googlebot", "ClaudeBot"])

    def test_parse_robots_groups_all_empty_agent_lists_create_no_ghost_group(self):
        for ghost in ["User-agent: ,", "User-agent: , ,", "User-agent:   ,  "]:
            groups = parse_robots_groups(
                f"{ghost}\nDisallow: /x\nUser-agent: GPTBot\nDisallow: /y\n"
            )
            self.assertEqual(len(groups), 1, f"`{ghost}` must not create an empty-agents group")
            self.assertEqual(groups[0]["agents"], ["GPTBot"])
            self.assertEqual(len(groups[0]["rules"]), 1, "the ghost line's rule is not captured")
            self.assertEqual(groups[0]["rules"][0]["path"], "/y")

    def test_parse_robots_groups_crlf_and_bom(self):
        crlf = parse_robots_groups("User-agent: GPTBot\r\nDisallow: /private\r\n")
        self.assertEqual(len(crlf), 1)
        self.assertEqual(crlf[0]["agents"], ["GPTBot"])
        self.assertEqual(len(crlf[0]["rules"]), 1)
        self.assertEqual(crlf[0]["rules"][0]["path"], "/private")

        bom = parse_robots_groups("﻿User-agent: GPTBot\nDisallow: /private\n")
        self.assertEqual(bom, crlf, "BOM prefix parses to identical groups")

    def test_check_robots_bom_prefixed_file_still_blocks(self):
        with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False, encoding='utf-8') as f:
            f.write("﻿User-agent: GPTBot\nDisallow: /\n")
            tmp_path = f.name
        try:
            result = check_robots(tmp_path, output_format="json")
            gpt = next(e for e in result["agents"] if e["token"] == "GPTBot")
            self.assertFalse(gpt["allowed"], "BOM-prefixed file must still block")
            self.assertEqual(gpt["matchedRule"]["path"], "/")
        finally:
            os.remove(tmp_path)

    def test_parse_robots_groups_keeps_groups_across_comment_lines(self):
        kept = parse_robots_groups(
            "User-agent: GPTBot\n# nota\nDisallow: /private\n"
        )
        self.assertEqual(len(kept), 1)
        self.assertEqual(len(kept[0]["rules"]), 1)
        self.assertEqual(kept[0]["rules"][0]["path"], "/private")

        merged = parse_robots_groups(
            "User-agent: GPTBot\n# comentario\nUser-agent: Googlebot\nDisallow: /x\n"
        )
        self.assertEqual(len(merged), 1)
        self.assertEqual(merged[0]["agents"], ["GPTBot", "Googlebot"])

        separated = parse_robots_groups(
            "User-agent: GPTBot\n\nUser-agent: Googlebot\nDisallow: /x\n"
        )
        self.assertEqual(len(separated), 2)

    def test_audit_robots_combines_equally_specific_groups(self):
        content = (
            "User-agent: GPTBot\n"
            "Disallow: /no-gpt\n"
            "Disallow: /search?q=spam\n"
            "User-agent: GPTBot\n"
            "Disallow: /also-gpt\n"
            "Allow: /no-gpt/public\n"
            "User-agent: *\n"
            "Disallow: /wild-a\n"
            "User-agent: *\n"
            "Disallow: /wild-b\n"
            "User-agent: *\n"
            "Disallow: /tie\n"
            "User-agent: *\n"
            "Allow: /tie\n"
        )
        cases = [
            ("GPTBot", "/no-gpt/draft", False),
            ("GPTBot", "/also-gpt/draft", False),
            ("GPTBot", "/no-gpt/public/read", True),
            ("GPTBot", "/search?q=spam", False),
            ("GPTBot", "/search?q=news", True),
            ("GPTBot", "/search", True),
            ("GPTBot", "/tie", True),
            ("GPTBot", "/wild-a/x", True),
            ("MyBot", "/wild-a/x", False),
            ("MyBot", "/wild-b/x", False),
            ("MyBot", "/tie", True),
            ("MyBot", "/open", True),
        ]
        for agent, target, expected in cases:
            result = audit_robots(content, target)
            if agent == "MyBot":
                decision = result["wildcard"]
            else:
                decision = next(e for e in result["agents"] if e["token"] == agent)
            self.assertEqual(decision["allowed"], expected, f"{agent} {target}")

    def test_audit_robots_matched_group_dedup_case_insensitive(self):
        content = "User-agent: GPTBot\nDisallow: /a\nUser-agent: gptbot\nDisallow: /b\n"
        result = audit_robots(content, "/b/x")
        entry = next(e for e in result["agents"] if e["token"] == "GPTBot")
        self.assertEqual(entry["matchedGroup"], ["GPTBot"])
        self.assertFalse(entry["allowed"])
        self.assertEqual(entry["matchedRule"]["path"], "/b")

    def test_audit_robots_dollar_anchor_pinned(self):
        content = "User-agent: GPTBot\nDisallow: /page$\n"
        result_plain = audit_robots(content, "/page")
        entry = next(e for e in result_plain["agents"] if e["token"] == "GPTBot")
        self.assertFalse(entry["allowed"])
        self.assertEqual(entry["matchedRule"]["path"], "/page$")
        result_query = audit_robots(content, "/page?x=1")
        entry_query = next(e for e in result_query["agents"] if e["token"] == "GPTBot")
        self.assertTrue(entry_query["allowed"])

    def test_generate_schema_data_article(self):
        with tempfile.NamedTemporaryFile(mode='w+', suffix='.md', delete=False) as temp:
            temp.write("# Test Headline\n\nThis is the introductory paragraph that acts as the description.")
            temp_path = temp.name

        try:
            schema = generate_schema_data(temp_path, "article", self.config)
            self.assertEqual(schema["@context"], "https://schema.org")
            self.assertIn("@graph", schema)

            article = next(x for x in schema["@graph"] if x["@type"] == "Article")
            self.assertEqual(article["headline"], "Test Headline")
            self.assertEqual(article["author"]["@id"], "https://www.tooltician.com/#author")

            # No implicit FAQPage node from article mode
            faq = next((x for x in schema["@graph"] if x["@type"] == "FAQPage"), None)
            self.assertIsNone(faq)

            # Person node still present when configured
            person = next(x for x in schema["@graph"] if x["@type"] == "Person")
            self.assertEqual(person["name"], "Carlos Ortega González")
        finally:
            os.remove(temp_path)

    def test_generate_schema_data_news_article(self):
        with tempfile.NamedTemporaryFile(mode='w+', suffix='.md', delete=False) as temp:
            temp.write("# Breaking News\n\nSomething important happened today.")
            temp_path = temp.name

        try:
            schema = generate_schema_data(temp_path, "news-article", {"datePublished": "2026-06-27"})
            news = next(x for x in schema["@graph"] if x["@type"] == "NewsArticle")
            self.assertEqual(news["headline"], "Breaking News")
            self.assertEqual(news["datePublished"], "2026-06-27")
        finally:
            os.remove(temp_path)

    def test_generate_schema_data_news_article_requires_date(self):
        with tempfile.NamedTemporaryFile(mode='w+', suffix='.md', delete=False) as temp:
            temp.write("# Dateless\n\nBody.")
            temp_path = temp.name

        try:
            with self.assertRaises(ValueError, msg="news-article without datePublished should raise"):
                generate_schema_data(temp_path, "news-article", {})
        finally:
            os.remove(temp_path)

    def test_faq_mode_filters_non_question_headings(self):
        with tempfile.NamedTemporaryFile(mode='w+', suffix='.md', delete=False) as temp:
            temp.write(
                "# Docs\n\n"
                "## Installation\nFollow these steps to install.\n\n"
                "## How do I install?\nRun pip install to get started with this package.\n\n"
                "## Limitations\nThis tool has some limitations worth knowing.\n"
            )
            temp_path = temp.name

        try:
            schema = generate_schema_data(temp_path, "faq", {})
            faq = next(x for x in schema["@graph"] if x["@type"] == "FAQPage")
            self.assertEqual(len(faq["mainEntity"]), 1)
            self.assertEqual(faq["mainEntity"][0]["name"], "How do I install?")
        finally:
            os.remove(temp_path)

    def test_audit_json_format(self):
        with tempfile.NamedTemporaryFile(mode='w+', suffix='.md', delete=False) as temp:
            temp.write("# Test Title\n\nThis is a short intro. It has GDPR in it but AWS is not defined here.\n\n- Bullet 1\n- Bullet 2\n")
            temp_path = temp.name
            
        try:
            audit_file(temp_path, self.config, output_format="json")
            output_str = self.held_stdout.getvalue()
            report = json.loads(output_str)
            self.assertIn("total_score", report)
            self.assertEqual(report["file"], temp_path)
            self.assertIn("acronyms", report["breakdown"]["clarity"]["details"][-1])
        finally:
            os.remove(temp_path)

    def test_audit_json_finding_contract_matches_javascript(self):
        fixture_path = os.path.abspath(
            os.path.join(
                os.path.dirname(__file__),
                "..",
                "..",
                "..",
                "..",
                "tests",
                "fixtures",
                "sample.md",
            )
        )
        audit_file(fixture_path, self.config, output_format="json")
        python_report = json.loads(self.held_stdout.getvalue())

        repo_root = os.path.abspath(
            os.path.join(os.path.dirname(__file__), "..", "..", "..", "..")
        )
        javascript_result = subprocess.run(
            [
                "node",
                os.path.join(repo_root, "bin", "cli.js"),
                "audit",
                fixture_path,
                "--format",
                "json",
                "--model",
                "v1",
            ],
            cwd=repo_root,
            capture_output=True,
            text=True,
            check=True,
        )
        javascript_report = json.loads(javascript_result.stdout)

        self.assertEqual(python_report["total_score"], javascript_report["total_score"])
        self.assertEqual(python_report["breakdown"], javascript_report["breakdown"])
        self.assertEqual(python_report["recommendations"], javascript_report["recommendations"])
        self.assertEqual(python_report["findings"], javascript_report["findings"])
        self.assertEqual(python_report["reportVersion"], javascript_report["reportVersion"])
        self.assertEqual(python_report["modelVersion"], javascript_report["modelVersion"])
        self.assertRegex(
            python_report["generatedAt"],
            r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$",
        )

    def test_create_finding_rejects_invalid_evidence(self):
        with self.assertRaisesRegex(ValueError, "Invalid evidenceLabel"):
            create_finding(
                "content.test",
                "test",
                "warn",
                "Test finding",
                "unsupported",
            )
        with self.assertRaisesRegex(ValueError, "Unknown source refs"):
            create_finding(
                "content.test",
                "test",
                "warn",
                "Test finding",
                "heuristic",
                source_refs=["missing-source"],
            )

    def test_cli_json_is_parseable_for_batches_and_threshold_failures(self):
        script_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "geo_optimizer.py")
        fd_one, first_path = tempfile.mkstemp(suffix='.md', dir=os.getcwd())
        fd_two, second_path = tempfile.mkstemp(suffix='.md', dir=os.getcwd())
        with os.fdopen(fd_one, 'w') as first:
            first.write("# One\n\nTiny page with 42 percent evidence.\n")
        with os.fdopen(fd_two, 'w') as second:
            second.write("# Two\n\nTiny page with 43 percent evidence.\n")

        try:
            batch = subprocess.run(
                [
                    sys.executable,
                    script_path,
                    "audit",
                    first_path,
                    second_path,
                    "--format",
                    "json",
                ],
                cwd=os.getcwd(),
                text=True,
                capture_output=True,
                check=False,
            )
            self.assertEqual(batch.returncode, 0, batch.stderr)
            batch_payload = json.loads(batch.stdout)
            self.assertEqual(len(batch_payload), 2)

            threshold = subprocess.run(
                [
                    sys.executable,
                    script_path,
                    "audit",
                    first_path,
                    "--format",
                    "json",
                    "--threshold",
                    "999",
                ],
                cwd=os.getcwd(),
                text=True,
                capture_output=True,
                check=False,
            )
            self.assertEqual(threshold.returncode, 1)
            threshold_payload = json.loads(threshold.stdout)
            self.assertEqual(threshold_payload["file"], first_path)
            self.assertIn("Threshold not met", threshold.stderr)
        finally:
            os.remove(first_path)
            os.remove(second_path)

    def test_text_renderer_matches_audit_file_text_output(self):
        """Plan 090: the pure renderer reproduces audit_file's text exactly."""
        with tempfile.NamedTemporaryFile(mode='w+', suffix='.md', delete=False) as temp:
            temp.write(
                "# Test Title\n\n"
                "This is a short intro. It has GDPR in it but AWS is not defined here.\n\n"
                "- Bullet 1\n- Bullet 2\n"
            )
            temp_path = temp.name
        try:
            text_buf = StringIO()
            with contextlib.redirect_stdout(text_buf):
                audit_file(temp_path, self.config, output_format="text")

            json_buf = StringIO()
            with contextlib.redirect_stdout(json_buf):
                audit_file(temp_path, self.config, output_format="json")
            report = json.loads(json_buf.getvalue())

            render_buf = StringIO()
            with contextlib.redirect_stdout(render_buf):
                _render_text_report(report, temp_path)

            self.assertEqual(
                render_buf.getvalue(),
                text_buf.getvalue(),
                "rendered text must be byte-identical to audit_file's text output",
            )
        finally:
            os.remove(temp_path)

    def test_cli_text_mode_scores_each_file_once(self):
        """Plan 090: CLI batch text mode scores each file exactly once."""
        script_path = os.path.join(
            os.path.dirname(os.path.abspath(__file__)), "geo_optimizer.py"
        )
        fd_one, first_path = tempfile.mkstemp(suffix='.md', dir=os.getcwd())
        fd_two, second_path = tempfile.mkstemp(suffix='.md', dir=os.getcwd())
        with os.fdopen(fd_one, 'w') as first:
            first.write("# One\n\nTiny page with 42 percent evidence.\n")
        with os.fdopen(fd_two, 'w') as second:
            second.write("# Two\n\nTiny page with 43 percent evidence.\n")

        real_audit_file = geo_optimizer.audit_file
        calls = []

        def counting(filepath, config, output_format="text", _content=None):
            calls.append((filepath, output_format))
            return real_audit_file(filepath, config, output_format, _content)

        saved_argv = sys.argv
        try:
            with mock.patch.object(geo_optimizer, "audit_file", new=counting):
                sys.argv = [script_path, "audit", first_path, second_path]
                with contextlib.redirect_stdout(StringIO()), contextlib.redirect_stderr(StringIO()):
                    geo_optimizer.main()
            self.assertEqual(
                len(calls), 2, f"expected one scoring pass per file, got {len(calls)}: {calls}"
            )
            self.assertTrue(
                all(fmt == "json" for _, fmt in calls),
                f"text mode must render stored reports, not re-score: {calls}",
            )
        finally:
            sys.argv = saved_argv
            os.remove(first_path)
            os.remove(second_path)

    def test_batch_text_renders_the_stored_report_not_a_re_read_file(self):
        """Plan 090: rendering uses the report from the batch pass, so a file
        mutated after scoring cannot change the rendered output."""
        fd, path = tempfile.mkstemp(suffix='.md', dir=os.getcwd())
        with os.fdopen(fd, 'w') as fh:
            fh.write("# Original\n\nTiny page with 42 percent evidence.\n")
        try:
            results = audit_files([path], self.config)
            self.assertEqual(results[0]["status"], "success")
            original_score = results[0]["score"]

            with open(path, 'w', encoding='utf-8') as fh:
                fh.write("# Rewritten\n\nA completely different page without any evidence.\n")

            buf = StringIO()
            with contextlib.redirect_stdout(buf):
                _render_text_report(results[0]["report"], path)
            self.assertIn(
                f"Total GEO Score: {original_score}/100",
                buf.getvalue(),
                "rendered score must come from the stored report, not the mutated file",
            )
        finally:
            os.remove(path)

    def test_cli_text_mode_prints_reports_and_exits_zero(self):
        script_path = os.path.join(
            os.path.dirname(os.path.abspath(__file__)), "geo_optimizer.py"
        )
        fd_one, first_path = tempfile.mkstemp(suffix='.md', dir=os.getcwd())
        with os.fdopen(fd_one, 'w') as first:
            first.write("# One\n\nTiny page with 42 percent evidence.\n")
        try:
            single = subprocess.run(
                [sys.executable, script_path, "audit", first_path],
                cwd=os.getcwd(),
                text=True,
                capture_output=True,
                check=False,
            )
            self.assertEqual(single.returncode, 0, single.stderr)
            self.assertIn("GEO OPTIMIZATION AUDIT REPORT", single.stdout)
            self.assertIn("Total GEO Score:", single.stdout)
            self.assertEqual(single.stderr, "")
        finally:
            os.remove(first_path)

    def test_explicit_malformed_config_exits(self):
        fd, config_path = tempfile.mkstemp(suffix='.json')
        with os.fdopen(fd, 'w') as config_file:
            config_file.write("{ invalid json")

        try:
            with self.assertRaises(SystemExit):
                load_config(config_path)
        finally:
            os.remove(config_path)

    def test_inject_schema_markdown(self):
        # Create temp file inside CWD to pass path traversal guard
        fd, temp_path = tempfile.mkstemp(suffix='.md', dir=os.getcwd())
        with os.fdopen(fd, 'w') as f:
            f.write("# Test Markdown File\n\nThis is the content.")

        try:
            inject_schema(temp_path, "article", self.config)
            with open(temp_path, 'r', encoding='utf-8') as f:
                updated_content = f.read()
            self.assertIn("```json", updated_content)
            self.assertIn("Carlos Ortega González", updated_content)
            self.assertIn("Tooltician", updated_content)
        finally:
            os.remove(temp_path)

    def test_inject_schema_rejects_symlink_target_outside_cwd(self):
        outside_directory = tempfile.mkdtemp(prefix="geo-opt-outside-")
        outside_path = os.path.join(outside_directory, "outside.md")
        link_path = os.path.join(os.getcwd(), "temp_outside_link_py.md")
        with open(outside_path, "w", encoding="utf-8") as outside_file:
            outside_file.write("# Outside\n\nOriginal content.\n")

        try:
            os.symlink(outside_path, link_path)
            with self.assertRaises(SystemExit):
                inject_schema(link_path, "article", self.config)
            with open(outside_path, "r", encoding="utf-8") as outside_file:
                self.assertEqual(outside_file.read(), "# Outside\n\nOriginal content.\n")
        finally:
            if os.path.exists(link_path):
                os.remove(link_path)
            os.remove(outside_path)
            os.rmdir(outside_directory)

    def test_inject_schema_html_description_and_single_quoted_json_ld(self):
        fd, temp_path = tempfile.mkstemp(suffix='.html', dir=os.getcwd())
        with os.fdopen(fd, 'w') as temp:
            temp.write(
                "<!doctype html><html><body>"
                "<h1>HTML Title</h1>"
                "<p>This HTML paragraph should become the structured-data description.</p>"
                "<script type='application/ld+json'>{\"@context\":\"https://schema.org\",\"@type\":\"Thing\"}</script>"
                "</body></html>"
            )

        try:
            inject_schema(temp_path, "article", self.config)
            with open(temp_path, "r", encoding="utf-8") as temp:
                content = temp.read()
            self.assertEqual(content.count("application/ld+json"), 1)
            self.assertIn('"headline": "HTML Title"', content)
            self.assertIn('"description": "This HTML paragraph should become', content)
        finally:
            os.remove(temp_path)

    def test_unconfigured_schema_omits_identity_and_offer_claims(self):
        with tempfile.NamedTemporaryFile(mode='w+', suffix='.md', delete=False) as temp:
            temp.write("# Independent Article\n\nIndependent body text.")
            temp_path = temp.name

        try:
            article_schema = generate_schema_data(temp_path, "article", {})
            self.assertEqual(
                [node["@type"] for node in article_schema["@graph"]],
                ["Article"],
            )
            article = article_schema["@graph"][0]
            self.assertNotIn("author", article)
            self.assertNotIn("publisher", article)
            self.assertNotIn("datePublished", article)

            product_schema = generate_schema_data(temp_path, "product", {})
            product = next(
                node for node in product_schema["@graph"]
                if node["@type"] == "Product"
            )
            self.assertNotIn("brand", product)
            self.assertNotIn("offers", product)
        finally:
            os.remove(temp_path)

    def test_no_branding_requires_local_pro_key(self):
        valid_key = "tt_pro_1234567890abcdefghij"
        self.assertFalse(has_pro_entitlement({}))
        self.assertTrue(has_pro_entitlement({"license": {"key": valid_key}}))

        fd, temp_path = tempfile.mkstemp(suffix='.md', dir=os.getcwd())
        with os.fdopen(fd, 'w') as f:
            f.write("# Independent Article\n\nIndependent body text.")

        original_key = os.environ.get("TOOLTICIAN_LICENSE_KEY")
        try:
            inject_schema(temp_path, "article", {})
            with open(temp_path, 'r', encoding='utf-8') as f:
                branded_content = f.read()
            self.assertIn("Optimized with [Tooltician]", branded_content)

            os.environ["TOOLTICIAN_LICENSE_KEY"] = valid_key
            inject_schema(temp_path, "article", {}, no_branding=True)
            with open(temp_path, 'r', encoding='utf-8') as f:
                updated_content = f.read()
            self.assertIn("```json", updated_content)
            self.assertNotIn("Tooltician", updated_content)
            self.assertNotIn("Carlos Ortega", updated_content)
        finally:
            if original_key is None:
                os.environ.pop("TOOLTICIAN_LICENSE_KEY", None)
            else:
                os.environ["TOOLTICIAN_LICENSE_KEY"] = original_key
            os.remove(temp_path)

    def test_support_reminders_are_infrequent_and_disableable(self):
        class TtyBuffer(StringIO):
            def isatty(self):
                return True

        with tempfile.TemporaryDirectory() as state_directory:
            state_path = os.path.join(state_directory, "state.json")
            stderr = TtyBuffer()
            first_run = datetime(2026, 1, 1, tzinfo=timezone.utc)

            for _ in range(9):
                result = record_successful_free_injection(
                    {},
                    state_path=state_path,
                    env={},
                    stderr=stderr,
                    now=first_run,
                )
                self.assertFalse(result["shown"])

            result = record_successful_free_injection(
                {},
                state_path=state_path,
                env={},
                stderr=stderr,
                now=first_run,
            )
            self.assertTrue(result["shown"])
            self.assertIn("config set reminders false", stderr.getvalue())

            self.assertTrue(set_reminders_enabled(False, state_path, {}))
            self.assertFalse(reminders_are_enabled(state_path, {}))
            disabled = record_successful_free_injection(
                {},
                state_path=state_path,
                env={},
                stderr=stderr,
                now=datetime(2026, 3, 1, tzinfo=timezone.utc),
            )
            self.assertEqual(disabled["reason"], "disabled")

            self.assertTrue(set_reminders_enabled(True, state_path, {}))
            automated = record_successful_free_injection(
                {},
                state_path=state_path,
                env={"CI": "true"},
                stderr=stderr,
                now=datetime(2026, 3, 1, tzinfo=timezone.utc),
            )
            self.assertEqual(automated["reason"], "suppressed")
            self.assertTrue(
                read_engagement_state(state_path, {})["remindersEnabled"]
            )

    def test_engagement_state_rejects_unsafe_state_file_paths(self):
        with tempfile.TemporaryDirectory() as state_directory:
            unsafe_path = os.path.join(state_directory, "not-state.json")
            self.assertFalse(
                write_engagement_state(
                    {"remindersEnabled": False},
                    state_path=unsafe_path,
                    env={},
                )
            )
            self.assertFalse(os.path.exists(unsafe_path))

    def test_engagement_state_rejects_symlinked_state_file_escape(self):
        with tempfile.TemporaryDirectory() as state_directory:
            outside_path = os.path.join(state_directory, "outside.json")
            state_path = os.path.join(state_directory, "state.json")
            try:
                os.symlink(outside_path, state_path)
            except (OSError, NotImplementedError):
                return

            self.assertFalse(
                write_engagement_state(
                    {"remindersEnabled": False},
                    state_path=state_path,
                    env={},
                )
            )
            self.assertFalse(os.path.exists(outside_path))

    def test_discover_files_finds_files_in_directory(self):
        """discover_files should find .md and .html files recursively."""
        tmp_dir = tempfile.mkdtemp()
        try:
            with open(os.path.join(tmp_dir, "a.md"), "w") as f:
                f.write("# A")
            os.makedirs(os.path.join(tmp_dir, "sub"))
            with open(os.path.join(tmp_dir, "sub", "b.html"), "w") as f:
                f.write("<h1>B</h1>")
            with open(os.path.join(tmp_dir, "sub", "c.txt"), "w") as f:
                f.write("text")
            files = discover_files([tmp_dir], recursive=True)
            self.assertEqual(len(files), 2)
            self.assertTrue(any(f.endswith("a.md") for f in files))
            self.assertTrue(any(f.endswith("b.html") for f in files))
        finally:
            import shutil
            shutil.rmtree(tmp_dir, ignore_errors=True)

    def test_discover_files_throws_on_directory_without_recursive(self):
        """discover_files should raise RuntimeError on directory without --recursive."""
        tmp_dir = tempfile.mkdtemp()
        try:
            with self.assertRaises(RuntimeError):
                discover_files([tmp_dir], recursive=False)
        finally:
            import shutil
            shutil.rmtree(tmp_dir, ignore_errors=True)

    def test_audit_files_collects_errors_without_crashing(self):
        """audit_files should collect per-file errors, not crash."""
        results = audit_files(["/nonexistent/file.md"], {})
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["status"], "error")

    def test_compute_summary_computes_correct_statistics(self):
        """compute_summary should calculate correct aggregate statistics."""
        results = [
            {"file": "a.md", "status": "success", "score": 80,
             "report": {"recommendations": ["Add links"]}},
            {"file": "b.md", "status": "success", "score": 60,
             "report": {"recommendations": ["Add links", "Add quotes"]}},
            {"file": "c.md", "status": "error", "error": "not found"},
        ]
        summary = compute_summary(results)
        self.assertEqual(summary["totalFiles"], 3)
        self.assertEqual(summary["succeeded"], 2)
        self.assertEqual(summary["failed"], 1)
        self.assertEqual(summary["averageScore"], 70)
        self.assertEqual(summary["minScore"], 60)
        self.assertEqual(summary["maxScore"], 80)
        self.assertEqual(len(summary["topRecommendations"]), 2)
        self.assertEqual(len(summary["worstFiles"]), 2)

    def test_extract_page_metadata_extracts_title_and_description(self):
        """extract_page_metadata should extract H1 title and intro description."""
        md = (
            "# My Test Page\n\n"
            "This is an introduction paragraph that describes what the page is about in detail.\n\n"
            "## Section One\nContent here.\n"
        )
        meta = extract_page_metadata(md, "/tmp/test.md")
        self.assertEqual(meta["title"], "My Test Page")
        self.assertTrue(len(meta["description"]) > 10)
        self.assertEqual(len(meta["sections"]), 1)

    def test_extract_page_metadata_htm_extension_is_html(self):
        """A .htm file with an <h1> must be treated as HTML (Node parity)."""
        html = (
            "<html>\n"
            "<head><title>Page</title>"
            '<meta name="description" content="Meta description for the page."></head>\n'
            "<body><h1>Page Title</h1><p>First paragraph text.</p></body>\n"
            "</html>\n"
        )
        meta = extract_page_metadata(html, "/tmp/page.htm")
        self.assertEqual(meta["title"], "Page Title")
        self.assertEqual(meta["description"], "Meta description for the page.")
        meta2 = extract_page_metadata(html, "/tmp/page.html")
        self.assertEqual(meta2["title"], "Page Title")
        self.assertEqual(meta2["description"], "Meta description for the page.")

    def test_generate_llms_txt_empty_section_and_missing_fields(self):
        """Empty section names default to Pages; missing title/url must not crash."""
        entries = [
            {"title": "Sparse", "url": "https://example.com/sparse", "section": ""},
            {"description": "no label"},
        ]
        result = generate_llms_txt(entries, "Test")
        self.assertIn("## Pages", result)
        self.assertIn("- [Sparse](https://example.com/sparse)", result)
        self.assertIn("- []()", result)
        full = generate_llms_full_txt(entries, "Test")
        self.assertIn("## []()", full)

    def test_generate_llms_txt_threshold_ignores_non_numeric_scores(self):
        """Non-numeric or null scores never demote entries to Optional."""
        entries = [
            {"title": "Stringy", "url": "https://example.com/stringy", "score": "30"},
            {"title": "Nullish", "url": "https://example.com/nullish", "score": None},
            {"title": "Real", "url": "https://example.com/real", "score": 80},
        ]
        result = generate_llms_txt(entries, "Test", optional_threshold=50)
        self.assertNotIn("## Optional", result)
        self.assertIn("[Stringy]", result)
        self.assertIn("[Nullish]", result)
        self.assertIn("## Pages", result)

    def test_generate_llms_txt_produces_valid_structure(self):
        """generate_llms_txt should produce valid llmstxt.org-spec output."""
        entries = [
            {"title": "Home", "description": "Welcome page",
             "url": "https://example.com/", "section": "Main"},
            {"title": "API", "description": "API reference",
             "url": "https://example.com/docs/api", "section": "Docs"},
            {"title": "Archive", "description": "2024 posts",
             "url": "https://example.com/archive"},
        ]
        result = generate_llms_txt(entries, "Test Site", "A test site.")
        self.assertTrue(result.startswith("# Test Site"))
        self.assertIn("> A test site.", result)
        self.assertIn("## Main", result)
        self.assertIn("[Home](https://example.com/)", result)
        self.assertIn("[Archive](https://example.com/archive)", result)

    def test_generate_llms_txt_puts_low_score_in_optional(self):
        """Low-score pages should go to ## Optional section."""
        entries = [
            {"title": "Good", "url": "https://example.com/good", "score": 80},
            {"title": "Weak", "url": "https://example.com/weak", "score": 30},
        ]
        result = generate_llms_txt(entries, "Test", optional_threshold=50)
        self.assertIn("## Optional", result)
        self.assertIn("[Weak]", result)

    def test_generate_llms_txt_keeps_low_score_in_section_by_default(self):
        """Score-based Optional placement must be opt-in (Plan 084, Node parity)."""
        entries = [
            {"title": "Good", "url": "https://example.com/good", "score": 80},
            {"title": "Weak", "url": "https://example.com/weak", "score": 30},
        ]
        result = generate_llms_txt(entries, "Test")
        self.assertNotIn("## Optional", result)
        self.assertIn("## Pages", result)
        self.assertIn("[Weak](https://example.com/weak)", result)

    def test_generate_llms_txt_optional_flag_moves_entry_without_threshold(self):
        entries = [
            {"title": "Manual", "url": "https://example.com/manual", "optional": True},
            {"title": "Normal", "url": "https://example.com/normal"},
        ]
        result = generate_llms_txt(entries, "Test")
        self.assertIn("## Optional", result)
        self.assertIn("[Manual](https://example.com/manual)", result)
        self.assertIn("## Pages", result)

    def test_generate_llms_txt_escapes_hostile_link_text(self):
        entries = [
            {
                "title": "Release [v1.2] (stable) \\beta [x](https://evil.example)",
                "description": "Intro with ](https://evil.example) bracket (parens) text.",
                "url": "https://example.com/rel",
                "section": "Changelog [2026] (notes) [more](https://evil.example)",
            }
        ]
        result = generate_llms_txt(entries, "Test")
        self.assertIn("## Changelog \\[2026\\] \\(notes)", result)
        for line in result.splitlines():
            if line.startswith("## "):
                self.assertEqual(
                    len(re.findall(r"[^\\]\]\(", line)), 0, f"heading must be fully escaped: {line}"
                )
            elif line.startswith("- ["):
                self.assertEqual(
                    len(re.findall(r"[^\\]\]\(", line)),
                    1,
                    f"line must have exactly one real ](: {line}",
                )

    def test_generate_llms_full_txt_escapes_hostile_title(self):
        entries = [
            {
                "title": "Page [One] (beta) [x](https://evil.example)",
                "url": "https://example.com/one",
                "content": "# Page One\n\nBody.",
            }
        ]
        result = generate_llms_full_txt(entries, "Test")
        heading = next(line for line in result.splitlines() if line.startswith("## ["))
        self.assertEqual(
            len(re.findall(r"[^\\]\]\(", heading)),
            1,
            f"heading must have exactly one real ](: {heading}",
        )
        self.assertNotIn("](https://evil.example)", heading)

    def test_schema_title_falls_back_to_basename_when_no_h1(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "h1-less.md")
            with open(path, "w", encoding="utf-8") as f:
                f.write("Intro paragraph without a heading.\n\n## Section\nBody.\n")
            schema = generate_schema_data(path, "article", self.config)
            article = next(x for x in schema["@graph"] if x["@type"] == "Article")
            self.assertEqual(article["headline"], "h1-less")

    def test_schema_title_uses_html_h1(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "page.html")
            with open(path, "w", encoding="utf-8") as f:
                f.write("<html><body><h1>Hello <b>World</b></h1><p>Intro text here.</p></body></html>")
            schema = generate_schema_data(path, "article", {})
            article = next(x for x in schema["@graph"] if x["@type"] == "Article")
            self.assertEqual(article["headline"], "Hello World")

    def test_metadata_frontmatter_title_and_description_fallback(self):
        md = (
            "---\n"
            'title: "Frontmatter Title"\n'
            "description: A frontmatter description.\n"
            "---\n\n"
            "## Section\nBody.\n"
        )
        meta = extract_page_metadata(md, "/tmp/front.md")
        self.assertEqual(meta["title"], "Frontmatter Title")
        self.assertEqual(meta["description"], "A frontmatter description.")
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "front.md")
            with open(path, "w", encoding="utf-8") as f:
                f.write(md)
            schema = generate_schema_data(path, "article", {})
            article = next(x for x in schema["@graph"] if x["@type"] == "Article")
            self.assertEqual(article["headline"], "Frontmatter Title")

    def test_generate_llms_full_txt_compiles_full_content(self):
        """generate_llms_full_txt should compile complete page content."""
        entries = [
            {"title": "Page One", "url": "https://example.com/one",
             "content": "# Page One\n\nFirst paragraph here.\n\nSecond paragraph."},
        ]
        result = generate_llms_full_txt(entries, "Test")
        self.assertIn("# Test — Full Content", result)
        self.assertIn("## [Page One](https://example.com/one)", result)
        self.assertIn("First paragraph here.", result)

    def test_audit_llms_txt_reports_valid_as_valid(self):
        """audit_llms_txt should report valid llms.txt as valid."""
        content = (
            "# My Site\n\n"
            "> A sample site.\n\n"
            "## Pages\n\n"
            "- [Home](https://example.com/): The homepage.\n"
        )
        report = audit_llms_txt(content)
        self.assertTrue(report["valid"])
        self.assertEqual(len(report["issues"]), 0)

    def test_audit_llms_txt_detects_missing_elements(self):
        """audit_llms_txt should detect missing H1 and blockquote."""
        content = "## Pages\n\n- [Home](https://example.com/): Homepage.\n"
        report = audit_llms_txt(content)
        self.assertFalse(report["valid"])
        self.assertTrue(any("H1" in i for i in report["issues"]))

    def test_generate_robots_txt_includes_all_ai_crawlers(self):
        """generate_robots_txt should include every configured AI crawler."""
        result = generate_robots_txt(
            disallow_paths=["/admin"],
            sitemap_url="https://example.com/sitemap.xml",
        )
        self.assertIn("GPTBot", result)
        self.assertIn("ClaudeBot", result)
        self.assertIn("Google-Extended", result)
        self.assertIn("PerplexityBot", result)
        self.assertIn("Disallow: /admin", result)
        self.assertIn("Sitemap: https://example.com/sitemap.xml", result)

    def test_crawler_registry_is_purpose_aware_and_compatible(self):
        by_token = {entry["token"]: entry for entry in AI_CRAWLER_REGISTRY}
        self.assertEqual(by_token["OAI-SearchBot"]["purpose"], "search")
        self.assertEqual(by_token["GPTBot"]["purpose"], "training")
        self.assertEqual(by_token["Claude-User"]["purpose"], "user")
        self.assertFalse(by_token["Perplexity-User"]["robotsApplicable"])
        self.assertEqual(by_token["Google-Extended"]["purpose"], "control")
        self.assertEqual(
            AI_CRAWLER_AGENTS,
            [entry["token"] for entry in AI_CRAWLER_REGISTRY],
        )
        for entry in AI_CRAWLER_REGISTRY:
            self.assertTrue(entry["officialSource"])
            self.assertRegex(entry["lastVerified"], r"^\d{4}-\d{2}-\d{2}$")

    def test_search_visible_preset_preserves_sensitive_paths(self):
        content = generate_robots_txt()
        root = audit_robots(content)
        admin = audit_robots(content, "/admin/settings")

        for token in ["OAI-SearchBot", "Claude-SearchBot", "PerplexityBot"]:
            entry = next(item for item in root["agents"] if item["token"] == token)
            self.assertTrue(entry["allowed"], f"{token} should be allowed at root")
        gpt_bot = next(item for item in root["agents"] if item["token"] == "GPTBot")
        self.assertFalse(gpt_bot["allowed"])
        for entry in admin["agents"]:
            if entry["matchedGroup"] and entry["matchedGroup"][0] != "*":
                self.assertFalse(
                    entry["allowed"],
                    f"{entry['token']} should not bypass /admin",
                )

    def test_open_preset_and_invalid_preset(self):
        content = generate_robots_txt(
            disallow_paths=["private"],
            preset="open",
        )
        self.assertTrue(all(entry["allowed"] for entry in audit_robots(content)["agents"]))
        self.assertTrue(
            all(
                not entry["allowed"]
                for entry in audit_robots(content, "/private/record")["agents"]
            )
        )
        with self.assertRaisesRegex(ValueError, r"Unknown robots\.txt"):
            generate_robots_txt(preset="invalid")

    def test_audit_robots_longest_rule_and_grouped_agents(self):
        content = (
            "User-agent: OAI-SearchBot\n"
            "User-agent: Claude-SearchBot\n"
            "Disallow:\n"
            "Disallow: /private\n"
            "Allow: /private/public\n"
        )
        public_report = audit_robots(content, "/private/public/article")
        private_report = audit_robots(content, "/private/draft")
        for token in ["OAI-SearchBot", "Claude-SearchBot"]:
            public_entry = next(
                item for item in public_report["agents"] if item["token"] == token
            )
            private_entry = next(
                item for item in private_report["agents"] if item["token"] == token
            )
            self.assertTrue(public_entry["allowed"])
            self.assertFalse(private_entry["allowed"])

    def test_cli_llmstxt_generate_dry_run(self):
        """CLI llmstxt generate --dry-run should output preview."""
        tmp_dir = tempfile.mkdtemp()
        script_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "geo_optimizer.py")
        try:
            with open(os.path.join(tmp_dir, "index.md"), "w") as f:
                f.write("# Home\n\nWelcome to our test site with enough words for a description.\n")
            result = subprocess.run(
                [sys.executable, script_path, "llmstxt", "generate", tmp_dir,
                 "--recursive", "--site-url", "https://example.com",
                 "--title", "Test Site", "--description", "A test site.", "--dry-run"],
                cwd=tmp_dir, capture_output=True, text=True,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("# Test Site", result.stdout)
            self.assertIn("> A test site.", result.stdout)
            self.assertIn("[dry-run]", result.stdout)
        finally:
            import shutil
            shutil.rmtree(tmp_dir, ignore_errors=True)

    def test_cli_robots_generate_dry_run(self):
        """CLI robots generate --dry-run should output preview."""
        script_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "geo_optimizer.py")
        result = subprocess.run(
            [sys.executable, script_path, "robots", "generate", "--dry-run"],
            capture_output=True, text=True,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("GPTBot", result.stdout)
        self.assertIn("Allow: /", result.stdout)
        self.assertIn("[dry-run]", result.stdout)

    def test_cli_robots_audit_json(self):
        script_path = os.path.join(
            os.path.dirname(os.path.abspath(__file__)),
            "geo_optimizer.py",
        )
        with tempfile.NamedTemporaryFile(
            mode="w+", suffix=".txt", delete=False
        ) as temp:
            temp.write(generate_robots_txt())
            temp_path = temp.name
        try:
            result = subprocess.run(
                [
                    sys.executable,
                    script_path,
                    "robots",
                    "audit",
                    temp_path,
                    "--format",
                    "json",
                ],
                capture_output=True,
                text=True,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            report = json.loads(result.stdout)
            self.assertEqual(
                {entry["purpose"] for entry in report["agents"]},
                {"search", "training", "user", "control", "legacy"},
            )
        finally:
            os.remove(temp_path)

    def test_cli_audit_recursive(self):
        """CLI audit --recursive should find files in directory."""
        tmp_dir = tempfile.mkdtemp()
        script_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "geo_optimizer.py")
        try:
            with open(os.path.join(tmp_dir, "test.md"), "w") as f:
                f.write("# Test\n\nContent with 42% evidence and enough words for scoring here.\n")
            result = subprocess.run(
                [sys.executable, script_path, "audit", tmp_dir, "--recursive", "--format", "json"],
                cwd=tmp_dir, capture_output=True, text=True,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            payload = json.loads(result.stdout)
            self.assertIsInstance(payload, dict)
            self.assertIn("total_score", payload)
        finally:
            import shutil
            shutil.rmtree(tmp_dir, ignore_errors=True)


class SymlinkSafeWriteTests(unittest.TestCase):
    """Plan 083: atomic symlink-safe artifact writes (Python boundary)."""

    def setUp(self):
        self.work_dir = tempfile.mkdtemp(prefix="geo-safe-py-", dir=os.getcwd())
        self.outside_dir = tempfile.mkdtemp(prefix="geo-outside-py-")
        self.prev_cwd = os.getcwd()
        os.chdir(self.work_dir)

    def tearDown(self):
        os.chdir(self.prev_cwd)
        import shutil

        shutil.rmtree(self.work_dir, ignore_errors=True)
        shutil.rmtree(self.outside_dir, ignore_errors=True)

    def test_write_file_safe_normal(self):
        write_file_safe("out.txt", "hola")
        with open("out.txt", "r", encoding="utf-8") as f:
            self.assertEqual(f.read(), "hola")
        self.assertEqual(
            [n for n in os.listdir(".") if n.endswith(".tmp") or ".geo-opt-tmp" in n], []
        )

    def test_write_file_safe_preserves_mode(self):
        write_file_safe("out.txt", "v1")
        os.chmod("out.txt", 0o600)
        write_file_safe("out.txt", "v2")
        self.assertEqual(os.stat("out.txt").st_mode & 0o777, 0o600)

    def test_write_file_safe_rejects_final_symlink(self):
        sentinel = os.path.join(self.outside_dir, "sentinel.txt")
        with open(sentinel, "w", encoding="utf-8") as f:
            f.write("original")
        os.symlink(sentinel, "out.txt")
        with self.assertRaises(SystemExit):
            write_file_safe("out.txt", "x")
        with open(sentinel, "r", encoding="utf-8") as f:
            self.assertEqual(f.read(), "original")

    def test_write_file_safe_rejects_symlinked_parent(self):
        sentinel = os.path.join(self.outside_dir, "sentinel.txt")
        with open(sentinel, "w", encoding="utf-8") as f:
            f.write("original")
        os.symlink(self.outside_dir, "sub")
        with self.assertRaises(SystemExit):
            write_file_safe("sub/out.txt", "x")
        self.assertFalse(os.path.exists(os.path.join(self.outside_dir, "out.txt")))
        with open(sentinel, "r", encoding="utf-8") as f:
            self.assertEqual(f.read(), "original")

    def test_copy_file_safe_rejects_final_symlink(self):
        with open("src.md", "w", encoding="utf-8") as f:
            f.write("contenido")
        sentinel = os.path.join(self.outside_dir, "sentinel.txt")
        with open(sentinel, "w", encoding="utf-8") as f:
            f.write("original")
        os.symlink(sentinel, "src.md.bak")
        with self.assertRaises(SystemExit):
            copy_file_safe("src.md", "src.md.bak")
        with open(sentinel, "r", encoding="utf-8") as f:
            self.assertEqual(f.read(), "original")

    def test_write_file_safe_rejects_missing_directory(self):
        with self.assertRaises(SystemExit):
            write_file_safe("no-such-dir/out.txt", "x")
        self.assertFalse(os.path.exists("no-such-dir"))

    def test_write_file_safe_new_file_default_mode_matches_node(self):
        write_file_safe("out.txt", "hola")
        current_umask = os.umask(0)
        os.umask(current_umask)
        self.assertEqual(os.stat("out.txt").st_mode & 0o777, 0o644 & ~current_umask)

    def test_write_file_safe_writes_through_parent_symlink_inside_cwd(self):
        os.makedirs("real-dir")
        os.symlink("real-dir", "link-in")
        write_file_safe("link-in/out.txt", "hola")
        with open("real-dir/out.txt", "r", encoding="utf-8") as f:
            self.assertEqual(f.read(), "hola")

    def test_copy_file_safe_preserves_bytes_byte_for_byte(self):
        with open("src.bin", "wb") as f:
            f.write(b"\x00\xff\xfe\x80contenido\xff")
        copy_file_safe("src.bin", "src.bin.bak")
        with open("src.bin.bak", "rb") as f:
            self.assertEqual(f.read(), b"\x00\xff\xfe\x80contenido\xff")

    def test_copy_file_safe_normal_backup(self):
        with open("src.md", "w", encoding="utf-8") as f:
            f.write("contenido")
        os.chmod("src.md", 0o640)
        copy_file_safe("src.md", "src.md.bak")
        with open("src.md.bak", "r", encoding="utf-8") as f:
            self.assertEqual(f.read(), "contenido")
        self.assertEqual(os.stat("src.md.bak").st_mode & 0o777, 0o640)

    def test_cli_robots_generate_rejects_symlink_output(self):
        sentinel = os.path.join(self.outside_dir, "sentinel.txt")
        with open(sentinel, "w", encoding="utf-8") as f:
            f.write("original")
        os.symlink(sentinel, "robots.txt")
        script_path = os.path.join(
            os.path.dirname(os.path.abspath(__file__)), "geo_optimizer.py"
        )
        result = subprocess.run(
            [sys.executable, script_path, "robots", "generate", "--output", "robots.txt"],
            cwd=self.work_dir, capture_output=True, text=True,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("symlink", result.stderr)
        with open(sentinel, "r", encoding="utf-8") as f:
            self.assertEqual(f.read(), "original")

    def test_cli_llmstxt_generate_rejects_symlink_output(self):
        with open("index.md", "w", encoding="utf-8") as f:
            f.write("# Home\n\nWelcome to our test site with enough words for a description.\n")
        sentinel = os.path.join(self.outside_dir, "sentinel.txt")
        with open(sentinel, "w", encoding="utf-8") as f:
            f.write("original")
        os.symlink(sentinel, "llms.txt")
        script_path = os.path.join(
            os.path.dirname(os.path.abspath(__file__)), "geo_optimizer.py"
        )
        result = subprocess.run(
            [sys.executable, script_path, "llmstxt", "generate", ".",
             "--site-url", "https://example.com", "--title", "Test Site",
             "--description", "A description.", "--recursive"],
            cwd=self.work_dir, capture_output=True, text=True,
        )
        self.assertNotEqual(result.returncode, 0)
        with open(sentinel, "r", encoding="utf-8") as f:
            self.assertEqual(f.read(), "original")


if __name__ == "__main__":
    unittest.main()
