import crypto from "node:crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { getStatePath } from "./engagement.js";

// --- Frozen contract -------------------------------------------------------
//
// This module implements the *consent gate* and the *frozen event schema* for
// optional, anonymous usage telemetry. Capturing consent and freezing the
// schema now means that the day a transport endpoint exists, every installed
// user without a recorded decision is prompted on their next run, and the
// consent they give still matches what is sent because the schema never grew.
//
// Until `TELEMETRY_TRANSPORT_ENABLED` is true there is NO prompt and NO
// network activity: the gate is fully built but dormant. The project's
// "no telemetry by default" promise therefore stays literally true today.

export const TELEMETRY_SCHEMA_VERSION = 1;

// Master kill switch. While false: never prompt, never send. Flipping this to
// true is the single, deliberate step that activates the (separately built and
// reviewed) transport. Do not flip it without a published privacy policy and a
// real endpoint.
export const TELEMETRY_TRANSPORT_ENABLED = false;

// Honor the cross-tool de facto standard plus a project-specific override.
const TELEMETRY_ENV_VAR = "GEO_OPT_TELEMETRY";
const DO_NOT_TRACK_ENV_VAR = "DO_NOT_TRACK";

const STATE_KEY = "telemetryConsent";
export const CONSENT_UNSET = "unset";
export const CONSENT_GRANTED = "granted";
export const CONSENT_DENIED = "denied";

// The ONLY fields that may ever leave the machine. Building events from this
// allowlist makes it structurally impossible to leak audited content, paths,
// URLs, file names, or user configuration.
export const TELEMETRY_EVENT_FIELDS = Object.freeze([
  "schemaVersion",
  "cliVersion",
  "nodeMajor",
  "platform",
  "command",
  "model",
  "durationMs",
  "status",
  "findingsBySeverity",
  "sessionId",
]);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function readCliVersion() {
  // src/telemetry.js -> ../package.json in dev; dist/telemetry.js ->
  // ../package.json in the published layout. Same relative path either way.
  try {
    const pkgPath = path.resolve(__dirname, "..", "package.json");
    return JSON.parse(fs.readFileSync(pkgPath, "utf8")).version || "unknown";
  } catch {
    return "unknown";
  }
}

function readRawState(statePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeConsent(value) {
  return value === CONSENT_GRANTED || value === CONSENT_DENIED ? value : CONSENT_UNSET;
}

/**
 * Read the persisted consent decision, preserving any unrelated state fields
 * written by other modules (e.g. engagement reminders).
 */
export function readTelemetryConsent(options = {}) {
  const statePath = options.statePath || getStatePath(options.env, options.homedir);
  return normalizeConsent(readRawState(statePath)[STATE_KEY]);
}

/**
 * Persist a consent decision via an atomic read-modify-write that keeps every
 * other field in the shared state file intact. Never throws: a telemetry
 * preference must not break the primary CLI command.
 */
export function setTelemetryConsent(decision, options = {}) {
  const normalized = normalizeConsent(decision);
  const statePath = options.statePath || getStatePath(options.env, options.homedir);
  const directory = path.dirname(statePath);
  const temporaryPath = `${statePath}.${process.pid}.${crypto.randomBytes(8).toString("hex")}.tmp`;
  const next = { ...readRawState(statePath), [STATE_KEY]: normalized };

  try {
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    fs.writeFileSync(temporaryPath, `${JSON.stringify(next, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    fs.renameSync(temporaryPath, statePath);
    return true;
  } catch {
    try {
      fs.rmSync(temporaryPath, { force: true });
    } catch {
      // Swallow: preference persistence is best-effort.
    }
    return false;
  }
}

function isTruthyFlag(value) {
  return value === "1" || value === "true" || value === "on" || value === "yes";
}

function isFalsyFlag(value) {
  return value === "0" || value === "false" || value === "off" || value === "no";
}

function isAutomatedEnvironment(env) {
  return Boolean(
    env.CI ||
    env.GITHUB_ACTIONS ||
    env.GITLAB_CI ||
    env.BUILDKITE ||
    env.JENKINS_URL ||
    env.TF_BUILD
  );
}

/**
 * Resolve the effective telemetry decision, considering (in precedence order)
 * the DO_NOT_TRACK standard, the project env override, then the persisted
 * choice. Environment overrides never mutate stored state.
 *
 * @returns {{ decision: string, source: string, active: boolean, canPrompt: boolean }}
 */
export function resolveTelemetryStatus(options = {}) {
  const env = options.env || process.env;
  const stream = options.stream || process.stderr;

  let decision = CONSENT_UNSET;
  let source = "default";

  const persisted = readTelemetryConsent({ ...options, env });
  if (persisted !== CONSENT_UNSET) {
    decision = persisted;
    source = "state";
  }

  // DO_NOT_TRACK and the explicit env override win over persisted state so a
  // user (or CI) can force behavior per-invocation without rewriting the file.
  if (isTruthyFlag(env[DO_NOT_TRACK_ENV_VAR])) {
    decision = CONSENT_DENIED;
    source = DO_NOT_TRACK_ENV_VAR;
  } else if (isFalsyFlag(env[TELEMETRY_ENV_VAR])) {
    decision = CONSENT_DENIED;
    source = TELEMETRY_ENV_VAR;
  } else if (isTruthyFlag(env[TELEMETRY_ENV_VAR])) {
    decision = CONSENT_GRANTED;
    source = TELEMETRY_ENV_VAR;
  }

  const interactive = Boolean(stream.isTTY) && !isAutomatedEnvironment(env);
  const active = TELEMETRY_TRANSPORT_ENABLED && decision === CONSENT_GRANTED;
  const canPrompt =
    TELEMETRY_TRANSPORT_ENABLED &&
    decision === CONSENT_UNSET &&
    interactive &&
    source === "default";

  return { decision, source, active, canPrompt };
}

/**
 * Whether a first-use consent prompt should be shown right now. Always false
 * while the transport is disabled, which keeps the gate latent today.
 */
export function shouldPromptForTelemetryConsent(options = {}) {
  return resolveTelemetryStatus(options).canPrompt;
}

/**
 * Whether anonymous telemetry is currently active (transport on AND granted).
 */
export function telemetryIsActive(options = {}) {
  return resolveTelemetryStatus(options).active;
}

/**
 * Build the anonymous event strictly from the frozen allowlist. Any field not
 * in TELEMETRY_EVENT_FIELDS is dropped, so callers cannot accidentally attach
 * paths, URLs, or audited content.
 *
 * @param {object} input Raw signals; only allowlisted keys are read.
 * @returns {Readonly<object>}
 */
export function buildTelemetryEvent(input = {}, options = {}) {
  const source = {
    schemaVersion: TELEMETRY_SCHEMA_VERSION,
    cliVersion: options.cliVersion || readCliVersion(),
    nodeMajor: Number.parseInt(process.versions.node.split(".")[0], 10),
    platform: process.platform,
    command: typeof input.command === "string" ? input.command : null,
    model: input.model === "v1" || input.model === "v2" ? input.model : null,
    durationMs: Number.isFinite(input.durationMs) ? Math.round(input.durationMs) : null,
    status: input.status === "error" ? "error" : "ok",
    findingsBySeverity:
      input.findingsBySeverity && typeof input.findingsBySeverity === "object"
        ? sanitizeSeverityCounts(input.findingsBySeverity)
        : null,
    sessionId: options.sessionId || null,
  };

  const event = {};
  for (const field of TELEMETRY_EVENT_FIELDS) {
    event[field] = source[field];
  }
  return Object.freeze(event);
}

function sanitizeSeverityCounts(counts) {
  const result = {};
  for (const [key, value] of Object.entries(counts)) {
    if (typeof key === "string" && Number.isFinite(value)) {
      result[key] = Math.max(0, Math.trunc(value));
    }
  }
  return result;
}

/**
 * First-use consent entry point for the CLI bootstrap. Latent while the
 * transport is disabled: returns without prompting or writing. When the
 * transport is later enabled, this is where the one-time prompt is wired in.
 *
 * @returns {{ prompted: boolean, decision: string }}
 */
// Punto de cableado reservado para la activación de telemetría
// (docs/telemetry.md, checklist de activación): la llamada se implementa
// cuando TELEMETRY_TRANSPORT_ENABLED pase a true. Sin export a propósito
// (limpieza knip P3) — se mantiene como símbolo privado de módulo.
// eslint-disable-next-line no-unused-vars
function maybePromptForTelemetryConsent(options = {}) {
  const status = resolveTelemetryStatus(options);
  if (!status.canPrompt) {
    return { prompted: false, decision: status.decision };
  }
  // Transport is disabled today, so this branch is unreachable until a real
  // prompt + endpoint land. Kept as the single wiring point for that step.
  return { prompted: false, decision: status.decision };
}
