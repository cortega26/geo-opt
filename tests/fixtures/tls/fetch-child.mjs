/**
 * Subproceso de test para la cobertura TLS de Plan 074.
 *
 * Ejecuta el `fetchUrl` real contra un servidor HTTPS local. El runner de
 * tests lo lanza con `NODE_EXTRA_CA_CERTS` apuntando a la CA de test
 * (TEST-ONLY-ca-cert.pem), de modo que la cadena de confianza de este proceso
 * incluye la CA de test sin tocar el trust store del proceso principal ni la
 * API de producción.
 *
 * Contrato de salida (stdout, JSON en una línea):
 *   - éxito:  {"ok": true,  "statusCode": <n>, "finalUrl": "<url>"}  — exit 0
 *             (modo robots: {"ok": true, "groups": <n>, "raw": "<len>"})
 *   - fallo:  {"ok": false, "code": "<err.code>", "error": "<mensaje>"} — exit 1
 *
 * Variables de entorno:
 *   TLS_TEST_URL — URL https://localhost:<puerto>/... a fetchear
 *   TLS_TEST_ROBOTS_ORIGIN — origin https://localhost:<puerto> para probar
 *     fetchRobotsTxt (mutuamente excluyente con TLS_TEST_URL)
 *   TLS_TEST_ALLOW_HTTP — "1" para allowHttp: true (por defecto false)
 *   TLS_TEST_ALLOW_CROSS_ORIGIN — "1" para allowCrossOrigin: true (por defecto false)
 *   TLS_TEST_ROOT_ORIGIN — rootOrigin explícito (por defecto null: la librería
 *     deriva el root del origin de la URL fetcheada)
 */

import { fetchUrl, fetchRobotsTxt } from "../../../src/index.js";

const url = process.env.TLS_TEST_URL;
const robotsOrigin = process.env.TLS_TEST_ROBOTS_ORIGIN;
if (!url && !robotsOrigin) {
  process.stderr.write("TLS_TEST_URL or TLS_TEST_ROBOTS_ORIGIN is required\n");
  process.exit(2);
}

const options = {
  allowLocalhost: true,
  allowHttp: process.env.TLS_TEST_ALLOW_HTTP === "1",
  allowCrossOrigin: process.env.TLS_TEST_ALLOW_CROSS_ORIGIN === "1",
};
if (process.env.TLS_TEST_ROOT_ORIGIN) {
  options.rootOrigin = process.env.TLS_TEST_ROOT_ORIGIN;
}

try {
  if (robotsOrigin) {
    const robots = await fetchRobotsTxt(robotsOrigin, options);
    const robotsPayload = JSON.stringify({
      ok: true,
      groups: robots.groups.length,
      raw: robots.raw.length,
    });
    process.stdout.write(robotsPayload, () => process.exit(0));
  } else {
    const result = await fetchUrl(url, options);
    const payload = JSON.stringify({
      ok: true,
      statusCode: result.statusCode,
      finalUrl: result.finalUrl,
    });
    process.stdout.write(payload, () => process.exit(0));
  }
} catch (err) {
  const payload = JSON.stringify({
    ok: false,
    code: err?.code ?? null,
    error: err?.message ?? String(err),
  });
  process.stdout.write(payload, () => process.exit(1));
}
