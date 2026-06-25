#!/usr/bin/env python3
import unittest
import os
import tempfile
import sys
import json
from io import StringIO

# Add current directory to path to import script
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from geo_optimizer import calculate_readability, audit_file, check_robots, generate_schema_data, inject_schema, load_config

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
            self.assertIn("SUCCESS: No major AI agents or wildcard directives are blocking", output)
        finally:
            os.remove(temp_path)

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

    def test_inject_schema_markdown(self):
        with tempfile.NamedTemporaryFile(mode='w+', suffix='.md', delete=False) as temp:
            temp.write("# Test Markdown File\n\nThis is the content.")
            temp_path = temp.name
            
        try:
            inject_schema(temp_path, "article", self.config)
            with open(temp_path, 'r', encoding='utf-8') as f:
                updated_content = f.read()
            self.assertIn("```json", updated_content)
            self.assertIn("Carlos Ortega González", updated_content)
            self.assertIn("Tooltician", updated_content)
        finally:
            os.remove(temp_path)

if __name__ == "__main__":
    unittest.main()
