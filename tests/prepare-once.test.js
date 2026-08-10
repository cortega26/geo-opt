import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  observeContent,
  observeAndParse,
  prepareDocument,
  resetLexCounter,
  getLexCalls,
} from "../src/observations.js";
import { resetTextParseCounters, getTextParseCounters } from "../src/text.js";
import { scoreContentV2 } from "../src/scoring-v2.js";

// Plan 089: one v2 audit must prepare/parse each document representation
// exactly once — preprocess, HTML visible-text extraction, and marked lexing
// are counted with injectable counters (no wall-time gates).

const MD = "# API Docs\n\n## Intro\n\nAccording to a study, 50% of users agree.\n";
const HTML = `<!DOCTYPE html><html><head><title>Page</title></head><body><h1>Report</h1><p>According to a study, 50% prefer X.</p></body></html>`;
const MALFORMED_MD = "no frontmatter\njust text with 50% and a stray < tag";
const MALFORMED_HTML = "no frontmatter\njust text with 50% and a stray <div tag";

function snapshot() {
  return { ...getTextParseCounters(), lex: getLexCalls() };
}

function run(content, filepath, fn) {
  resetTextParseCounters();
  resetLexCounter();
  const result = fn();
  return { result, counts: snapshot() };
}

describe("Plan 089 — one document preparation per call", () => {
  it("observeAndParse preprocesses and lexes a markdown document once", () => {
    const { counts } = run(MD, "docs.md", () => observeAndParse(MD, "docs.md"));
    assert.deepEqual(counts, { preprocess: 1, htmlExtract: 0, lex: 1 });
  });

  it("observeContent preprocesses and lexes a markdown document once", () => {
    const { counts } = run(MD, "docs.md", () => observeContent(MD, "docs.md"));
    assert.deepEqual(counts, { preprocess: 1, htmlExtract: 0, lex: 1 });
  });

  it("scoreContentV2 preprocesses and lexes a markdown document once", () => {
    const { counts } = run(MD, "docs.md", () => scoreContentV2(MD, "docs.md"));
    assert.deepEqual(counts, { preprocess: 1, htmlExtract: 0, lex: 1 });
  });

  it("observeAndParse extracts and lexes an HTML document once", () => {
    // The v1-view preprocess of raw HTML also happens once (clarity path);
    // the expensive HTML extraction and lexing happen exactly once.
    const { counts } = run(HTML, "page.html", () => observeAndParse(HTML, "page.html"));
    assert.deepEqual(counts, { preprocess: 1, htmlExtract: 1, lex: 1 });
  });

  it("observeContent extracts and lexes an HTML document once", () => {
    const { counts } = run(HTML, "page.html", () => observeContent(HTML, "page.html"));
    assert.deepEqual(counts, { preprocess: 1, htmlExtract: 1, lex: 1 });
  });

  it("scoreContentV2 extracts and lexes an HTML document once", () => {
    const { counts } = run(HTML, "page.html", () => scoreContentV2(HTML, "page.html"));
    assert.deepEqual(counts, { preprocess: 1, htmlExtract: 1, lex: 1 });
  });

  it("tolerates malformed input on both paths without extra parsing", () => {
    const md = run(MALFORMED_MD, "weird.txt", () => scoreContentV2(MALFORMED_MD, "weird.txt"));
    assert.deepEqual(md.counts, { preprocess: 1, htmlExtract: 0, lex: 1 });
    assert.equal(typeof md.result.score, "number");
    const html = run(MALFORMED_HTML, "weird2.txt", () =>
      scoreContentV2(MALFORMED_HTML, "weird2.txt")
    );
    assert.deepEqual(html.counts, { preprocess: 1, htmlExtract: 1, lex: 1 });
    assert.equal(typeof html.result.score, "number");
  });

  it("does not cache preparation across calls", () => {
    const { counts } = run(MD, "docs.md", () => {
      observeContent(MD, "docs.md");
      observeContent(MD, "docs.md");
    });
    assert.deepEqual(counts, { preprocess: 2, htmlExtract: 0, lex: 2 });
  });

  it("profile override/auto does not change preparation counts", () => {
    const auto = run(MD, "docs.md", () => scoreContentV2(MD, "docs.md", {}));
    const forced = run(MD, "docs.md", () =>
      scoreContentV2(MD, "docs.md", { profile: "editorial" })
    );
    assert.deepEqual(auto.counts, forced.counts);
    assert.deepEqual(auto.counts, { preprocess: 1, htmlExtract: 0, lex: 1 });
  });

  it("observeAndParse and observeContent agree on observations", () => {
    for (const [content, fp] of [
      [MD, "docs.md"],
      [HTML, "page.html"],
      [MALFORMED_MD, "weird.txt"],
    ]) {
      const { observations: viaParse } = observeAndParse(content, fp);
      const viaContent = observeContent(content, fp);
      assert.deepEqual(viaParse, viaContent, `observations must agree for ${fp}`);
    }
  });

  it("opts flow through observeAndParse exactly as through observeContent", () => {
    // Thresholds must reach the detectors identically on both paths. The
    // chosen values deliberately alter some observations (minWords 1 vs
    // default 10) so a broken opts passthrough would show up.
    const opts = { minWordsPerSection: 1, maxLongParagraph: 30 };
    const viaParse = observeAndParse(MD, "docs.md", opts).observations;
    const viaContent = observeContent(MD, "docs.md", opts);
    assert.deepEqual(viaParse, viaContent);
  });

  it("prepareDocument exposes the values observeAndParse returns", () => {
    const prepared = prepareDocument(MD, "docs.md");
    const { tokens, textContent } = observeAndParse(MD, "docs.md");
    assert.deepEqual(prepared.tokens, tokens);
    assert.equal(prepared.textContent, textContent);
    assert.equal(
      prepared.preprocessedText,
      textContent,
      "markdown clarity view equals detector view"
    );
    const htmlPrepared = prepareDocument(HTML, "page.html");
    assert.notEqual(
      htmlPrepared.preprocessedText,
      htmlPrepared.textContent,
      "HTML clarity view differs from detector view (raw vs visible)"
    );
  });
});
