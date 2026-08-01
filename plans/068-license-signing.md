# Plan 068: Replace the Pro honor-system key format with verifiable offline signing

> **Executor instructions:** Cold-backlog design spike. Keep it frozen while
> Plan 059 runs. Reopen it when commercial Pro licenses are actually for sale
> (the plan 060 decision on the Community/Pro boundary is GO, and a purchase
> channel exists). Do not implement signature verification while the honor
> system is the only distribution model.

**Status:** DEFERRED  
**Priority:** P3  
**Size:** L  
**Depends on:** Plan 059 `CONTINUE` + plan 060 GO + an actual purchase channel
for commercial licenses  
**Planned against:** `dc48b64`, revised 2026-08-01

## Why this is parked

Audit 2026-07-31 (F-04) confirmed the Pro key is a public, locally-checked
format (`tt_pro_` + 20+ alphanumerics) with no cryptographic signature — a
honor-system control, not a security boundary. The fix documented the model
explicitly (`docs/free-vs-pro.md`) and locked the current pattern contract
with `tests/licensing.test.js`. Implementing signatures now would build
infrastructure for a sales channel that does not exist: commercial licenses
are "not yet available for general purchase" (`docs/free-vs-pro.md`), and the
roadmap gates Pro on Plan 059's 90-day validation and Plan 060's boundary
decision.

## Scope after the trigger

- Generate an Ed25519 keypair owned by Tooltician; embed the **public** key in
  the published package (integrity-checked alongside `licensing.js`).
- Define the signed payload: at minimum `key id + holder + issued-at +
  feature set`; keep it small and forward-compatible (additive fields only).
- `hasProEntitlement` verifies the signature offline; the regex pattern is
  removed or demoted to a fast-fail pre-check.
- Rotation story: key id in the payload, registry of retired key ids,
  `staleLicenseWarnings`-style notice for old keys (mirror the evidence
  registry staleness mechanism).
- Optional (not required): activation telemetry gated behind the existing
  telemetry consent checklist (`docs/telemetry.md`).
- End in `GO`, `ADAPT`, or `STOP`; on GO, write a separate implementation
  plan with a regression plan for `tests/licensing.test.js` (the contract
  tests currently document the honor-system behavior and must be updated
  deliberately).

## Out of scope

- Server-side license validation, DRM, phone-home enforcement, key
  revocation over the network, per-seat quotas, or anything that breaks the
  "100% local, zero telemetry" invariant for local commands.
- Changing the Community feature surface (that is Plan 060's decision).

## Work plan after the trigger

1. Decide the payload schema and key-id registry (backwards compatible).
2. Add `ed25519` verification to `src/licensing.js` with the public key
   injected at build time (reuse the `scripts/build.js` SHA-256 injection
   pattern so the key is covered by `integrity.js`).
3. Update `tests/licensing.test.js` contract tests to the signed format.
4. Update `docs/free-vs-pro.md` (remove the honor-system section) and the
   CHANGELOG.
