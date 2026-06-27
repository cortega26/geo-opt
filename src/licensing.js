export const LICENSE_ENV_VAR = "TOOLTICIAN_LICENSE_KEY";

const PRO_LICENSE_PATTERN = /^tt_pro_[A-Za-z0-9_-]{20,}$/;

export function resolveLicenseKey(config = {}, env = process.env) {
  const configuredKey = config.license?.key ?? config.licenseKey;
  const candidate = env[LICENSE_ENV_VAR] || configuredKey;
  return typeof candidate === "string" ? candidate.trim() : "";
}

export function hasProEntitlement(config = {}, env = process.env) {
  return PRO_LICENSE_PATTERN.test(resolveLicenseKey(config, env));
}

export function getNoBrandingError(config = {}, env = process.env) {
  if (hasProEntitlement(config, env)) {
    return null;
  }

  return (
    "--no-branding requires a Tooltician Pro license key. " +
    `Set ${LICENSE_ENV_VAR} or license.key in geo_config.json.`
  );
}
