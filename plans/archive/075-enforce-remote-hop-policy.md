# Plan 075: Enforce scheme and origin policy on every remote hop

> **Executor instructions**: Characterize current redirects and sitemap hops
> before changing policy. Preserve SSRF/IP pinning at every hop. Update the index
> when complete.
>
> **Drift check (run first)**: `git diff --stat 888d3e7..HEAD -- src/fetcher.js src/sitemap.js bin/cli.js index.d.ts tests/fetcher.test.js tests/sitemap.test.js tests/cli-smoke.test.js README.md README.es.md docs/architecture.md plans/README.md`

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: plans/073-make-fetcher-tests-hermetic.md and plans/074-cover-https-ip-pinning.md
- **Category**: security
- **Planned at**: commit `888d3e7`, 2026-08-02

## Why this matters

The CLI validates HTTPS only on root inputs. Redirects, nested sitemaps, and
page URLs can downgrade to HTTP or leave the root origin while still being
fetched. Users need one explicit policy applied to every network hop, with
opt-ins for intentional HTTP or cross-origin crawling.

## Current state

- `bin/cli.js:1647-1673` requires HTTPS for explicit URLs unless `--allow-http`.
- `bin/cli.js:1706-1712` requires HTTPS for only the root sitemap.
- `src/fetcher.js:474-510` follows any HTTP(S) redirect after SSRF validation,
  without scheme-downgrade or origin checks.
- `src/sitemap.js:579-604` queues every nested sitemap/page URL; the comment at
  lines 554-557 acknowledges cross-origin amplification.
- Network behavior is opt-in and must remain documented per
  `docs/architecture.md:156`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Fetcher | `node --test tests/fetcher.test.js` | pass |
| Sitemap | `node --test tests/sitemap.test.js` | pass |
| CLI | `node --test tests/cli-smoke.test.js` | pass |
| Full | `npm run check` | exit 0 |

## Scope

**In scope**: fetcher/sitemap/CLI modules, their declarations/tests, README
EN/ES, architecture docs, `CHANGELOG.md`, `plans/README.md`.

**Out of scope**: relaxing private/loopback guards, adding general web crawling,
or treating robots.txt as access control.

## Git workflow

- Branch: `advisor/075-remote-hop-policy`
- Commit example: `security(fetcher): enforce hop scheme and origin policy`.

## Steps

### Step 1: Define a single policy contract

Represent allowed schemes and origins explicitly in fetch options. Default CLI
remote audits to HTTPS-only and root-origin-only. Add a clearly named
`--allow-cross-origin` opt-in if valid cross-origin sitemaps/redirects must be
supported; existing `--allow-http` is the only HTTP opt-in. Direct library
defaults must remain compatible unless a documented major contract change is
approved.

**Verify**: typecheck and CLI help tests pin defaults and opt-in names.

### Step 2: Enforce policy before every fetch

Validate root URL, each redirect target, nested sitemap URL, discovered page
URL, robots URL, and final redirected URL. Policy rejection must happen before
DNS/connect and produce a specific error naming the rejected hop class without
leaking private data.

**Verify**: local-server tests count zero requests for rejected HTTP downgrade
and cross-origin hops.

### Step 3: Cover opt-ins and compatibility

Add local two-origin fixtures. Prove same-origin HTTPS succeeds; HTTP downgrade
and cross-origin redirect/sitemap/page fail by default; each succeeds only with
its explicit opt-in while SSRF blocks still win.

**Verify**: focused Fetcher/Sitemap/CLI commands -> all pass.

### Step 4: Synchronize docs and release record

Document flags/defaults in README EN/ES and architecture capability/security
notes. Add an Unreleased Security bullet.

**Verify**: `npm run check && git diff --check` -> exit 0.

## Test plan

- Root, redirect, robots, nested sitemap, and page URL policy.
- HTTPS-to-HTTP downgrade, cross-origin HTTPS, relative redirect, and both
  opt-ins.
- SSRF private/loopback rejection remains effective even when opt-ins are set.

## Done criteria

- [ ] Every remote hop passes the same scheme/origin policy before connection.
- [ ] Defaults are HTTPS-only/root-origin-only for CLI remote mode.
- [ ] Intentional exceptions require explicit, documented flags.
- [ ] SSRF/TLS tests and full checks pass.

## STOP conditions

- Same-origin-only would reject a documented supported workflow and no bounded
  opt-in can preserve it.
- A hop can be fetched without flowing through the central policy.
- The change requires weakening IP validation or TLS verification.

## Maintenance notes

Reviewers should trace every URL-producing path, not only `fetchUrl`. New remote
features must accept the same policy object rather than inventing local flags.
