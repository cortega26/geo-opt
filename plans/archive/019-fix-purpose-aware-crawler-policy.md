# Plan 019: Make crawler policy generation purpose-aware and internally consistent

> **Executor instructions**: Follow every step and verification gate. Keep the
> JavaScript and Python implementations aligned. Update this plan's row in
> `plans/README.md` when done.
>
> **Drift check (run first)**:
> `git diff --stat c6a604a..HEAD -- src/robots.js src/llms-txt.js src/index.js bin/cli.js index.d.ts tests/optimizer.test.js .agents/skills/geo-optimization/scripts/geo_optimizer.py .agents/skills/geo-optimization/scripts/test_optimizer.py README.md CHANGELOG.md`
>
> If crawler generation or parsing has changed, stop and reconcile this plan
> against the live behavior before editing.

## Status

- **State**: DONE
- **Priority**: P0
- **Horizon**: inmediato, 0–2 semanas
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `c6a604a`, 2026-06-26

## Why this matters

The generated file says that `/admin`, `/api`, and `/private` are disallowed,
but every listed AI agent receives its own `Allow: /` group. Robots exclusion
parsers select the most specific applicable user-agent group, so the wildcard
restrictions do not protect those paths for the explicitly allowed agents.
The generator also treats search, training, control-token, and user-triggered
agents as one undifferentiated list despite provider documentation saying they
have different purposes and, for some user-triggered fetchers, that
`robots.txt` may not apply.

## Current state

- `src/robots.js:4-19` exports a flat `AI_CRAWLER_AGENTS` string array.
- `src/llms-txt.js:354-380` emits `Allow: /` in a specific group for every
  entry, then emits sensitive-looking `Disallow` paths only in `User-agent: *`.
- The Python implementation duplicates this behavior at
  `.agents/skills/geo-optimization/scripts/geo_optimizer.py:493-532`.
- `tests/optimizer.test.js:1563-1581` checks only that both strings occur, not
  that effective policy preserves the disallowed paths.
- OpenAI's current crawler documentation distinguishes `OAI-SearchBot`
  (search), `GPTBot` (training), and `ChatGPT-User` (user action, where robots
  rules may not apply): <https://developers.openai.com/api/docs/bots>.
- Anthropic documents `ClaudeBot`, `Claude-SearchBot`, and `Claude-User`
  separately: <https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler>.
- Perplexity distinguishes `PerplexityBot` from `Perplexity-User`:
  <https://docs.perplexity.ai/docs/resources/perplexity-crawlers>.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| JS tests | `npm test` | 0 failures |
| Python parity | `npm run test:python` | `OK` |
| Full check | `npm run check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

**In scope**: the files in the drift check.

**Out of scope**: WAF mutation, IP allowlist downloads, remote deployment,
authentication, or claiming that `robots.txt` protects private content.

## Git workflow

- Branch: `advisor/019-purpose-aware-crawlers`
- Use conventional commits such as `fix: correct generated crawler policy`.
- Do not push or open a PR unless the operator explicitly requests it.

## Steps

### Step 1: Replace the flat list with a versioned crawler registry

Create one canonical JavaScript registry with, at minimum: token, provider,
purpose (`search`, `training`, `user`, `control`, `legacy`), whether robots
rules are documented as applicable, official source URL, and `lastVerified`.
Retain a derived `AI_CRAWLER_AGENTS` export for compatibility. Mirror the data
shape in Python and mark undocumented/legacy entries rather than silently
presenting them as current.

**Verify**: focused tests assert the purpose of OpenAI, Anthropic, Perplexity,
and Google control tokens and pass in both runtimes.

### Step 2: Generate an explicit policy preset

Replace “allow everything” with named presets. The default reviewable preset
must allow documented search crawlers, disallow documented training crawlers,
and explain user-triggered fetchers without pretending robots enforcement is
guaranteed. An `open` preset may allow all only when explicitly selected.
Copy caller-supplied disallow paths into every specific group whose broad allow
would otherwise override the wildcard group.

**Verify**: parse generated output through the same policy evaluator and assert
that `/admin`, `/api`, and `/private` remain disallowed for every generated
specific group while `/` remains allowed for search crawlers.

### Step 3: Return structured audit results

Extract a pure audit function that returns effective policy by agent, purpose,
matched group, warnings, and source metadata. Keep the existing terminal
wrapper, but render from the structured result. Add JSON output to the CLI.

**Verify**: CLI JSON is parseable and distinguishes search, training, user, and
control entries.

### Step 4: Update public contracts and parity

Update exports, `index.d.ts`, README examples, Python parity, and the Unreleased
changelog. State plainly that robots rules are policy signals, not security
controls or guarantees of indexing.

**Verify**: `npm run check` exits 0.

## Test plan

- Regression: generated specific groups cannot bypass supplied disallow paths.
- Presets: default/search-visible, open, and invalid preset.
- Semantics: user-triggered agents carry a “may ignore robots” warning.
- Compatibility: `AI_CRAWLER_AGENTS` remains available.
- Parsing: wildcard and specific group precedence, longest rule, empty
  `Disallow`, and multiple user agents in one group.

## Done criteria

- [x] No generated policy claims to apply wildcard-only disallows to specific groups.
- [x] Every registry entry has purpose, official source, and verification date.
- [x] JS/Python behavior and tests agree.
- [x] `npm run check` and `git diff --check` pass.

## STOP conditions

- A provider's current official documentation contradicts the proposed purpose.
- Correct effective-policy evaluation requires a full RFC parser dependency;
  report the gap before adding one.
- Compatibility would require silently changing an existing public export.

## Maintenance notes

Review the registry at least quarterly. Provider names, IP ranges, and semantics
change independently; registry updates should not require editing policy logic.
