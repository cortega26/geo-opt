import { describe, it } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, "..");

function read(rel) {
  return readFileSync(path.join(repoRoot, rel), "utf8");
}

// Plan 065: harden the CI entry assets. Pins the GitLab include org, the
// effectiveScore JSON field, the v2 model defaults, and the README action
// reference so the entry assets cannot silently drift again.

const pkg = JSON.parse(read("package.json"));
const org = pkg.repository.url.match(/github\.com\/([^/]+)\//u)?.[1];

describe("Plan 065 — CI entry assets", () => {
  it("package.json repository.url is a GitHub URL and yields an org", () => {
    assert.ok(org, `no GitHub org extracted from ${pkg.repository.url}`);
  });

  it("GitLab template include URL uses the repository org", () => {
    const template = read("ci-templates/gitlab-ci.yml");
    assert.ok(
      template.includes(`raw.githubusercontent.com/${org}/`),
      `GitLab include URL should point at raw.githubusercontent.com/${org}/`
    );
  });

  it("GitLab template and GitHub action parse effectiveScore, not score", () => {
    const rels = ["ci-templates/gitlab-ci.yml", ".github/actions/geo-opt-audit/action.yml"];
    for (const rel of rels) {
      const text = read(rel);
      assert.ok(text.includes("effectiveScore"), `${rel} should read effectiveScore`);
      assert.ok(!text.includes("?.score "), `${rel} should not access the broken score field`);
    }
  });

  it("GitHub action forces JSON mode and isolates stderr from the repo", () => {
    const action = read(".github/actions/geo-opt-audit/action.yml");
    assert.ok(
      action.includes("--format json"),
      "action should audit in JSON mode so the score parse has machine-readable stdout"
    );
    assert.ok(
      !action.includes("inputs.format"),
      "action should not declare or use a dead format input"
    );
    assert.ok(
      action.includes("$RUNNER_TEMP"),
      "action should capture stderr outside the repo working directory"
    );
    assert.ok(
      !action.includes("2>audit-stderr.txt"),
      "action should not write stderr into the repository"
    );
  });

  it("GitLab template and GitHub action default the model to v2", () => {
    const template = read("ci-templates/gitlab-ci.yml");
    const action = read(".github/actions/geo-opt-audit/action.yml");
    assert.ok(
      template.includes('GEO_OPT_MODEL: "v2"'),
      "GitLab template should default GEO_OPT_MODEL to v2"
    );
    const modelBlock = action.match(/^\s{2}model:\n(?:.*\n)*?^\s{2}\w+:/mu)?.[0];
    assert.ok(modelBlock, "GitHub action should declare a model input block");
    assert.ok(
      modelBlock.includes('default: "v2"'),
      "GitHub action model input should default to v2"
    );
  });

  it("READMEs pin the action reference to the repository org and a version tag", () => {
    for (const rel of ["README.md", "README.es.md"]) {
      const text = read(rel);
      assert.ok(
        text.includes(`${org}/geo-opt/.github/actions/geo-opt-audit@v`),
        `${rel} action reference should use the repository org ${org}`
      );
      assert.match(
        text,
        /geo-opt-audit@v\d+\.\d+\.\d+/u,
        `${rel} should pin the action to a version tag`
      );
    }
  });
});

describe("Plan 065 — GitLab template claims (audit F-13)", () => {
  const template = read("ci-templates/gitlab-ci.yml");

  it("does not claim Pro for --recursive (Community feature)", () => {
    assert.ok(
      template.includes("scan directories recursively\n"),
      "GEO_OPT_RECURSIVE comment must not claim Pro"
    );
    const recursiveLine = template.split("\n").find((l) => l.includes("GEO_OPT_RECURSIVE"));
    assert.ok(!recursiveLine.includes("Pro"), "recursive is Community, not Pro");
  });

  it("licenses comment describes the real Pro gates", () => {
    const licenseLine = template.split("\n").find((l) => l.includes("TOOLTICIAN_LICENSE_KEY"));
    assert.ok(!licenseLine.includes("recursive"), "license key not needed for recursive");
    assert.ok(licenseLine.includes("--no-branding") || licenseLine.includes("report"));
  });

  it("dotenv artifact is declared on the job that creates the file", () => {
    // El job hidden (.geo-opt-audit) no puede declarar dotenv: un artifact
    // ausente falla el job en GitLab y el archivo solo lo crea el job
    // concreto geo-opt-audit (echo ... >> geo-opt-env.env).
    const hiddenBlock = template.slice(
      template.indexOf(".geo-opt-audit:"),
      template.indexOf("geo-opt-audit:\n  extends")
    );
    assert.ok(
      !hiddenBlock.includes("dotenv:"),
      "hidden job must not declare a dotenv artifact it never creates"
    );
    const concreteJob = template.slice(template.indexOf("geo-opt-audit:\n  extends"));
    assert.ok(concreteJob.includes("dotenv: geo-opt-env.env"), "concrete job owns the dotenv");
  });
});
