#!/usr/bin/env python3
import unittest
import os
import tempfile
import sys
import json
import subprocess
from datetime import datetime, timezone
from io import StringIO

# Add current directory to path to import script
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from geo_optimizer import (
    AI_CRAWLER_AGENTS,
    AI_CRAWLER_REGISTRY,
    calculate_readability,
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
    check_robots,
    generate_schema_data,
    has_pro_entitlement,
    inject_schema,
    load_config,
    read_engagement_state,
    record_successful_free_injection,
    reminders_are_enabled,
    set_reminders_enabled,
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

    def test_generate_schema_data_article(self):
        with tempfile.NamedTemporaryFile(mode='w+', suffix='.md', delete=False) as temp:
            temp.write("# Test Headline\n\nThis is the introductory paragraph that acts as the description.")
            temp_path = temp.name
            
        try:
            schema = generate_schema_data(temp_path, "article", self.config)
            self.assertEqual(schema["@context"], "https://schema.org")
            self.assertIn("@graph", schema)
            
            # Find NewsArticle in graph
            article = next(x for x in schema["@graph"] if x["@type"] == "NewsArticle")
            self.assertEqual(article["headline"], "Test Headline")
            self.assertEqual(article["author"]["@id"], "https://www.tooltician.com/#author")
            
            # Find Person in graph
            person = next(x for x in schema["@graph"] if x["@type"] == "Person")
            self.assertEqual(person["name"], "Carlos Ortega González")
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
                ["NewsArticle"],
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


if __name__ == "__main__":
    unittest.main()
