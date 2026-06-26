import fs from "fs";
import os from "os";
import path from "path";
import { hasProEntitlement } from "./integrity.js";

export const REMINDER_INJECTION_INTERVAL = 10;
export const REMINDER_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
export const STATE_DIR_ENV_VAR = "GEO_OPT_STATE_DIR";

const STATE_FILENAME = "state.json";
const SUPPORT_URL = "https://www.tooltician.com";

function defaultState() {
  return {
    remindersEnabled: true,
    successfulFreeInjections: 0,
    lastReminderAt: null,
  };
}

export function getStatePath(env = process.env, homedir = os.homedir()) {
  const baseDir = env[STATE_DIR_ENV_VAR] || env.XDG_CONFIG_HOME || path.join(homedir, ".config");
  return path.join(baseDir, "geo-opt", STATE_FILENAME);
}

export function readEngagementState(options = {}) {
  const statePath = options.statePath || getStatePath(options.env, options.homedir);
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath, "utf8"));
    return {
      ...defaultState(),
      ...parsed,
      remindersEnabled: parsed.remindersEnabled !== false,
      successfulFreeInjections: Number.isInteger(parsed.successfulFreeInjections)
        ? Math.max(0, parsed.successfulFreeInjections)
        : 0,
      lastReminderAt: typeof parsed.lastReminderAt === "string" ? parsed.lastReminderAt : null,
    };
  } catch {
    return defaultState();
  }
}

function writeEngagementState(state, options = {}) {
  const statePath = options.statePath || getStatePath(options.env, options.homedir);
  const directory = path.dirname(statePath);
  const temporaryPath = `${statePath}.${process.pid}.tmp`;

  try {
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    fs.writeFileSync(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    fs.renameSync(temporaryPath, statePath);
    return true;
  } catch {
    try {
      fs.rmSync(temporaryPath, { force: true });
    } catch {
      // A reminder preference must never break the primary CLI command.
    }
    return false;
  }
}

export function setRemindersEnabled(enabled, options = {}) {
  const state = readEngagementState(options);
  state.remindersEnabled = enabled;
  return writeEngagementState(state, options);
}

export function remindersAreEnabled(options = {}) {
  return readEngagementState(options).remindersEnabled;
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

export function recordSuccessfulFreeInjection(config = {}, options = {}) {
  const env = options.env || process.env;
  const stderr = options.stderr || process.stderr;
  const now = options.now || new Date();

  if (
    hasProEntitlement(config, env) ||
    !stderr.isTTY ||
    isAutomatedEnvironment(env) ||
    env.GEO_OPT_DISABLE_REMINDERS === "1"
  ) {
    return { shown: false, reason: "suppressed" };
  }

  const state = readEngagementState({ ...options, env });
  if (!state.remindersEnabled) {
    return { shown: false, reason: "disabled" };
  }

  state.successfulFreeInjections += 1;
  const lastReminderTime = state.lastReminderAt ? Date.parse(state.lastReminderAt) : Number.NaN;
  const cooldownElapsed =
    !Number.isFinite(lastReminderTime) || now.getTime() - lastReminderTime >= REMINDER_COOLDOWN_MS;
  const intervalReached = state.successfulFreeInjections >= REMINDER_INJECTION_INTERVAL;

  if (intervalReached && cooldownElapsed) {
    stderr.write(
      "\nEnjoying geo-opt? Support Tooltician and unlock branding-free output:\n" +
        `${SUPPORT_URL}\n` +
        "Hide this message: geo-opt config set reminders false\n\n"
    );
    state.successfulFreeInjections = 0;
    state.lastReminderAt = now.toISOString();
    writeEngagementState(state, { ...options, env });
    return { shown: true, reason: "interval" };
  }

  writeEngagementState(state, { ...options, env });
  return { shown: false, reason: intervalReached ? "cooldown" : "interval" };
}
