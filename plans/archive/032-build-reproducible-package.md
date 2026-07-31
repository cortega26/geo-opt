# Plan 032: Build and verify the publish artifact without mutating source

> **Executor instructions**: The working tree must remain clean after every
> build, pack and failed-build test. Never restore files with destructive Git
> commands from a lifecycle script.
>
> **Drift check (run first)**:
> `git diff --stat f91fae7..HEAD -- scripts/build.js src/licensing.js src/integrity.js package.json package-lock.json .gitignore tests README.md docs CHANGELOG.md`

## Status

- **Priority**: P0
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: release / robustness
- **Planned at**: commit `f91fae7`, 2026-06-27
- **Status**: DONE
- **Completed at**: 2026-06-27

## Why this matters

The current `prepublishOnly` build overwrites tracked licensing and integrity
sources, then `postpublish` runs `git checkout --` to restore them. A failed
publish can leave a dirty tree; a successful postpublish can discard local
changes. `npm pack --dry-run` does not run `prepublishOnly`, so the inspected
package is not necessarily the publish artifact.

## Current state

- `scripts/build.js:11-47` transforms files in `src/` in place.
- `package.json:33-34` couples publish to build and Git restoration.
- `dist/` is already ignored.
- `package.json#files` packages `src/` directly.
- Licensing is a convenience gate, not strong DRM; reproducibility is more
  valuable than elaborate obfuscation.

## Commands

| Purpose    | Command                     | Expected                                     |
| ---------- | --------------------------- | -------------------------------------------- |
| Build      | `npm run build`             | exit 0; no tracked diff                      |
| Package    | `npm pack --dry-run --json` | exact staged artifact listed                 |
| Full check | `npm run check`             | exit 0                                       |
| Tree       | `git status --short`        | clean except intended implementation changes |

## Scope

**In scope:** files in the drift check and deterministic build fixtures under
`tests/`.

**Out of scope:** remote license validation, checkout/provider integration,
pricing, legal terms or stronger DRM.

## Steps

### 1. Define the publish layout

Build runtime files into `dist/` or a disposable staging directory. Preserve
module paths, shebangs, declarations, docs and license files required by npm.

**Verify:** staged files import and CLI help runs from the staged layout.

### 2. Transform only staged licensing files

If obfuscation/integrity remains, apply it only to staged copies. Generate the
hash deterministically. Evaluate and document whether obfuscation provides
enough value to retain; removing unnecessary transformation is allowed if
licensing behavior and commercial policy remain intact.

**Verify:** source hashes before and after build are identical.

### 3. Replace lifecycle restoration

Remove the Git-based `postpublish`. Use npm lifecycle hooks that make `npm pack`
and `npm publish` inspect/build the same artifact, or publish a prebuilt tarball.

**Verify:** pack and publish-dry-run paths use the same staged file list.

### 4. Add artifact tests

Test clean build, repeated build, deliberate build failure, package contents,
entry-point imports and CLI invocation.

**Verify:** every scenario leaves tracked source unchanged.

### 5. Document release procedure

Update README/development docs and changelog with the exact clean-tree release
verification.

**Verify:** a maintainer can follow the procedure without manual restoration.

## Test plan

- Two consecutive builds produce equivalent artifacts.
- Build failure leaves source intact.
- Tarball contains only allowlisted runtime/docs/license files.
- Installed/staged CLI help and library import succeed.
- Integrity behavior passes in staged output.

## Done criteria

- [x] Build and pack never modify tracked source.
- [x] No npm lifecycle script invokes `git checkout`.
- [x] Dry-run inspects the same artifact shape intended for publication.
- [x] Artifact import/CLI smoke tests pass.
- [x] Full checks pass from a clean tree.

## STOP conditions

- npm cannot express the desired layout without changing public import paths;
  stop and propose a migration.
- A transformation is nondeterministic and cannot be verified.
- Legal/product policy requires a licensing mechanism not represented here.

## Maintenance notes

Treat the tarball as the release unit. Release verification must operate on
that artifact, not only on repository sources.
