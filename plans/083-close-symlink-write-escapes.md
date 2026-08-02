# Plan 083: Make every user-directed artifact write symlink-safe

> **Executor instructions**: Centralize safe writes; do not patch call sites with
> check-then-write races. Preserve unrelated state/telemetry storage boundaries.
>
> **Drift check (run first)**: `git diff --stat 888d3e7..HEAD -- src/schema.js src/batch.js bin/cli.js .agents/skills/geo-optimization/scripts/geo_optimizer.py tests/write-guard.test.js tests/optimizer.test.js tests/cli-smoke.test.js .agents/skills/geo-optimization/scripts/test_optimizer.py plans/README.md`

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `888d3e7`, 2026-08-02

## Why this matters

Existing guards validate a target or parent before calling normal write/copy
APIs. For a new output whose final filename is an existing symlink, parent
validation passes and the write follows the link outside CWD. All user-directed
writers—including backup files and Python artifact generators—need an atomic,
shared destination primitive.

## Current state

- `validateNewFileParentInsideCwd` checks only the parent
  (`src/schema.js:84-101`).
- Example gap: robots output validates parent then `writeFileSync`s the final
  path (`bin/cli.js:368-371`). Sitemap, llms, reports, config, technical output,
  and generate-all have equivalent final-name writes (`rg -n "writeFileSync"
  bin/cli.js`).
- Existing-file injection validates `realpath` in `src/batch.js:185-218` and
  `src/schema.js`, but backup destinations use `copyFileSync` and may be links.
- Python writes robots/llms directly at `geo_optimizer.py:2435,2518,2524` and
  backup via `shutil.copy2` near line 2607.
- `src/engagement.js` and `src/telemetry.js` use separate state directories and
  temp+rename; they are not CWD artifact writers.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Node writer tests | `node --test tests/write-guard.test.js tests/optimizer.test.js tests/cli-smoke.test.js` | pass |
| Python | `python3 .agents/skills/geo-optimization/scripts/test_optimizer.py` | all pass |
| Full | `npm run check` | exit 0 |
| Diff | `git diff --check` | exit 0 |

## Scope

**In scope**: one Node safe-write module/helper, all user-directed artifact
writers in `src/schema.js`, `src/batch.js`, `bin/cli.js`; equivalent Python
helpers/writers; `tests/write-guard.test.js`, `tests/optimizer.test.js`,
`tests/cli-smoke.test.js`, Python tests; internal/public declarations only if exports change;
`CHANGELOG.md`; `plans/README.md`.

**Out of scope**: engagement/telemetry state storage, allowing writes outside
CWD, changing artifact contents, or following destination symlinks deliberately.

## Git workflow

- Branch: `advisor/083-symlink-safe-writes`
- Commit example: `security(io): make artifact writes symlink-safe`.

## Steps

### Step 1: Build a complete writer matrix and regressions

List every write/copy destination and classify existing target, new target,
directory output, backup, and dry-run. For each family, create a temp CWD with a
final destination symlink to an outside sentinel and assert the command/library
rejects or safely replaces the link without changing the sentinel. Cover
symlinked parents and normal writes.

**Verify**: new tests expose at least robots, llms/sitemap/report, generate-all,
backup, and Python gaps before implementation.

### Step 2: Add an atomic Node safe-write primitive

Validate the nearest existing parent by realpath; reject an existing final
symlink via `lstat`; write bytes to a unique file in the validated destination
directory; fsync/close as appropriate; atomically rename onto the final name.
Preserve existing file mode where relevant and clean temp files on failure.
Rename must replace a raced-in symlink rather than follow it. Provide a safe
copy/backup wrapper by reading the validated source and using the same writer.

**Verify**: helper tests cover normal, outside parent, existing symlink,
raced-in symlink (as deterministically as practical), cleanup, and permissions.

### Step 3: Migrate every Node artifact destination

Replace direct final `writeFileSync`/`copyFileSync` calls for robots, sitemap,
llms files, inject/batch inject, config template, report, generate-all, and
technical `-o`. Keep dry-run side-effect free. Do not migrate state files.

**Verify**: `rg -n "writeFileSync|copyFileSync" bin/cli.js src/batch.js src/schema.js`
shows no unreviewed user-directed final write; writer regressions pass.

### Step 4: Implement the equivalent Python boundary

Use `os.path.realpath`/`commonpath`, reject `os.path.islink` final targets, write
through `tempfile.mkstemp(dir=validated_parent)` and `os.replace`, with cleanup
and mode handling. Migrate robots, llms/full, injection, and backups.

**Verify**: Python tests prove outside sentinel unchanged for each writer and
normal outputs unchanged.

### Step 5: Record the security change

Add an Unreleased Security bullet naming the covered writer families.

**Verify**: Python suite, `npm run check`, and `git diff --check` all pass.

## Test plan

- Node and Python: final symlink, symlinked parent, real in-CWD file, missing
  parent, backup target, dry-run, partial failure cleanup.
- Assert outside sentinel bytes never change and no temp files remain.

## Done criteria

- [ ] Every user-directed artifact writer uses the shared atomic boundary.
- [ ] Destination symlinks never cause an outside-CWD write.
- [ ] Backups and existing-file injection are covered in both runtimes.
- [ ] State/telemetry behavior is untouched; all full checks pass.

## STOP conditions

- A writer intentionally targets outside CWD under a documented contract.
- Cross-platform atomic rename/mode behavior cannot preserve a required public
  invariant; report the platform and failing test.
- Any fix relies only on `existsSync/lstat` followed by direct write, leaving a
  check/use race.

## Maintenance notes

This supersedes the narrower coverage assumptions of archived Plans 043 and
audit F-12. New writers must enter the matrix and use the shared primitive;
review destination behavior under attacker-controlled symlinks.
