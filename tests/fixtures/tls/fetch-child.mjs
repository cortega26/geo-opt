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
 *   - fallo:  {"ok": false, "code": "<err.code>", "error": "<mensaje>"} — exit 1
 *
 * Variables de entorno:
 *   TLS_TEST_URL — URL https://localhost:<puerto>/... a fetchear
 */

import { fetchUrl } from "../../../src/index.js";

const url = process.env.TLS_TEST_URL;
if (!url) {
  process.stderr.write("TLS_TEST_URL is required\n");
  process.exit(2);
}

try {
  const result = await fetchUrl(url, { allowLocalhost: true });
  const payload = JSON.stringify({
    ok: true,
    statusCode: result.statusCode,
    finalUrl: result.finalUrl,
  });
  process.stdout.write(payload, () => process.exit(0));
} catch (err) {
  const payload = JSON.stringify({
    ok: false,
    code: err?.code ?? null,
    error: err?.message ?? String(err),
  });
  process.stdout.write(payload, () => process.exit(1));
}
