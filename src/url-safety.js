const HTTP_SCHEMES = new Set(["http:", "https:"]);

/**
 * URI schemes defined by IANA or well-known RFCs whose targets are
 * intrinsically safe (user agents already validate or gate them).
 *
 * Marking these as safe ensures their links are not counted as "invalid
 * link targets" by the technical audit.  The audit only flags truly
 * unvalidatable or dangerous schemes like `data:`, `javascript:`, or
 * `vbscript:`.
 */
const WELL_KNOWN_SAFE_SCHEMES = new Set([
  "mailto:", // RFC 6068
  "tel:", // RFC 3966
  "fax:", // RFC 2806 / 3966
  "sms:", // RFC 5724
]);

export function normalizeHref(value) {
  return String(value ?? "").trim();
}

function hasUriScheme(value) {
  return /^[a-z][a-z0-9+.-]*:/i.test(normalizeHref(value));
}

export function isHttpHref(value) {
  const href = normalizeHref(value);
  try {
    return HTTP_SCHEMES.has(new URL(href).protocol);
  } catch {
    return /^https?:\/\//i.test(href);
  }
}

export function isFragmentHref(value) {
  return normalizeHref(value).startsWith("#");
}

export function isWellKnownSafeScheme(value) {
  const href = normalizeHref(value);
  if (!hasUriScheme(href)) return false;
  return WELL_KNOWN_SAFE_SCHEMES.has(href.split(":")[0].toLowerCase() + ":");
}

export function hasUnsafeHrefScheme(value) {
  const href = normalizeHref(value);
  if (!hasUriScheme(href) || isWellKnownSafeScheme(href)) return false;
  try {
    return !HTTP_SCHEMES.has(new URL(href).protocol);
  } catch {
    return true;
  }
}
