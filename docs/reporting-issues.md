# Reporting defects

**Status:** normative
**Owner:** repository maintainer
**Last verified:** 2026-06-30

This document is the authoritative source for how `geo-opt` — and any AI agent
driving it through the bundled skill — reports defects back to the project.
`SKILL.md` and `AGENTS.md` summarize this protocol and link here.

The goal is a high-signal feedback loop: when a real `geo-opt` defect surfaces
during use, the user gets a clear, professional GitHub Issue with one
confirmation — and **nothing about their content ever leaves their machine
without their explicit, reviewed consent.**

## Privacy rule (governs everything)

An issue must **never** contain:

- audited content (the Markdown/HTML/text the user is optimizing),
- file paths, file names, or directory structure,
- internal or private URLs,
- configuration values (`geo_config.json`, license keys, environment),
- secrets, tokens, or credentials.

An issue **may** contain only technical metadata:

- `geo-opt` version, Node.js version, operating system,
- the exact command (with sensitive arguments redacted),
- the error output / stack trace (redacted of the items above),
- a minimal, sanitized reproduction note.

This mirrors the project's telemetry policy in `AGENTS.md` and keeps defect
reporting consistent with the "100% local, zero telemetry" guarantee. Reporting
is **user-initiated and user-reviewed sharing**, not background telemetry.

## What is a reportable defect

Report when the behavior is attributable to `geo-opt` itself:

- a crash or unhandled exception;
- a contract violation — output that is missing or wrong versus the documented
  behavior (commands, flags, JSON shapes, finding fields);
- an inconsistency between the documentation and the actual runtime behavior;
- any other unexpected or undesired behavior of the tool.

Do **not** open an issue for:

- user input errors (malformed files, wrong flags) that the tool handled
  correctly;
- the agent's own reasoning or workflow mistakes;
- feature requests — use the
  [feature request template](https://github.com/cortega26/geo-opt/issues/new?template=feature_request.yml)
  instead;
- security vulnerabilities — report those privately via
  [security advisories](https://github.com/cortega26/geo-opt/security/advisories/new).

## Protocol (for the agent)

1. **Surface** the failure to the user plainly: what failed, the command, and
   the error.
2. **Ask** explicitly, and only proceed on a clear "yes":
   *"Do you want to report this as a GitHub Issue to help improve geo-opt?"*
   Declining has zero side effects.
3. **Deduplicate** before drafting — search existing issues:
   ```bash
   gh issue list --repo cortega26/geo-opt --search "<keywords>" --state all
   ```
   If a match exists, offer to comment on or link it instead of opening a new one.
4. **Draft** a professional issue mapped to the bug-report template fields
   (`version`, `node-version`, `os`, `command`, `expected`, `actual`, `context`),
   collecting metadata only:
   ```bash
   geo-opt --version    # or: npx geo-opt --version
   node --version
   ```
5. **Review** — show the user the full title and body, redact anything matching
   the privacy rule, and let them edit before anything is sent.
6. **Submit only on explicit confirmation**, preferring the no-auth path:
   - **Default — prefilled URL** (the user reviews and submits on GitHub):
     ```
     https://github.com/cortega26/geo-opt/issues/new?template=bug_report.yml&title=<title>&version=<v>&node-version=<n>&os=<os>&command=<cmd>&expected=<exp>&actual=<err>&context=<ctx>&labels=bug
     ```
   - **If `gh` is installed and authenticated:**
     ```bash
     gh issue create --repo cortega26/geo-opt \
       --title "<concise summary>" \
       --body "<rendered body>" \
       --label bug
     ```
7. **Never auto-submit**, never include secrets, and never attach the user's raw
   files.

## Prefilled-URL mechanics

The repository disables blank issues (`blank_issues_enabled: false` in
`.github/ISSUE_TEMPLATE/config.yml`), so a prefilled URL **must** reference the
form template with `template=bug_report.yml`. Query parameters map to each YAML
field by its `id` (`version`, `node-version`, `os`, `command`, `expected`,
`actual`, `context`); `labels=bug` preselects the label. Always URL-encode the
values. Because the user reviews and submits on GitHub, this path requires no
local authentication and keeps the human in control of what is sent.

The `title` query parameter prefills the issue title (verified). The
`Report origin` checkbox, however, cannot be prefilled — GitHub does not support
prefilling `checkboxes` via URL — so the reporter ticks it manually after the
form opens.
