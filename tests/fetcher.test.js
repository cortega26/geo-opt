/**
 * Tests para src/fetcher.js — módulo de fetch con SSRF guards.
 *
 * Usa servidores HTTP locales (node:http) para todas las pruebas.
 * Cero dependencias externas: ningún test contacta servicios públicos.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import dns from "node:dns/promises";
import { readFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import os from "node:os";
import { fileURLToPath } from "node:url";

import {
  fetchUrl,
  fetchRobotsTxt,
  checkRobotsRule,
  clearRobotsCache,
  MAX_RESPONSE_SIZE,
} from "../src/index.js";

// ═══════════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════════

/** Servidores de test activos (server -> handle) — la limpieza de seguridad los cierra al final. */
const activeServers = new Map();

/**
 * Crea un servidor HTTP en un puerto aleatorio, escuchando en `host`
 * (por defecto loopback). Rastrea los sockets conectados para poder
 * destruirlos en la limpieza: un request colgado no debe bloquear el runner.
 *
 * @param {object} handler — función (req, res) => void
 * @param {string} [host="127.0.0.1"] — dirección a la que escuchar
 * @returns {Promise<{ server: http.Server, sockets: Set, port: number, baseUrl: string }>}
 */
function startServer(handler, host = "127.0.0.1") {
  return new Promise((resolve, reject) => {
    const server = http.createServer(handler);
    const sockets = new Set();
    server.on("connection", (socket) => {
      sockets.add(socket);
      socket.on("close", () => sockets.delete(socket));
    });
    server.listen(0, host, () => {
      const port = server.address().port;
      // Un host IPv6 necesita brackets en la URL ("http://[::1]:8080/"); sin
      // ellos el parseo falla con ERR_INVALID_URL.
      const urlHost = host.includes(":") ? `[${host}]` : host;
      const handle = { server, sockets, port, baseUrl: `http://${urlHost}:${port}` };
      activeServers.set(server, handle);
      resolve(handle);
    });
    server.on("error", reject);
  });
}

/**
 * Cierra un servidor de test: destruye primero sus sockets activos (para que
 * un test colgado no bloquee el runner) y luego el listener.
 *
 * Acepta el handle completo o el http.Server desnudo (los describe guardan
 * `server = s.server` para su hook after).
 */
function stopServer(serverOrHandle) {
  const handle =
    serverOrHandle && serverOrHandle.sockets ? serverOrHandle : activeServers.get(serverOrHandle);
  if (!handle) return Promise.resolve();
  const { server, sockets } = handle;
  activeServers.delete(server);
  for (const socket of sockets) socket.destroy();
  return new Promise((resolve) => {
    try {
      server.closeAllConnections?.();
    } catch {
      // Ya cerrado — nada que hacer.
    }
    server.close(() => resolve());
  });
}

// Seguridad: si un test falla antes de su limpieza, cerrar servidores restantes.
after(async () => {
  await Promise.allSettled([...activeServers.values()].map(stopServer));
});

// ═══════════════════════════════════════════════════════════════════════════════
// Fixtures TLS de test (Plan 074) — ver tests/fixtures/tls/README.md
// ═══════════════════════════════════════════════════════════════════════════════

/** Directorio de fixtures TLS de test (CA, certificados, subproceso). */
const FIXTURES_DIR = fileURLToPath(new URL("./fixtures/tls/", import.meta.url));

/** Subproceso que ejecuta el fetchUrl real contra un servidor HTTPS local. */
const TLS_CHILD_SCRIPT = `${FIXTURES_DIR}fetch-child.mjs`;

/**
 * Lee un fixture PEM del directorio tests/fixtures/tls/.
 * @param {string} name — nombre de archivo, p. ej. "TEST-ONLY-ca-cert.pem"
 * @returns {string} contenido PEM
 */
function fixture(name) {
  return readFileSync(`${FIXTURES_DIR}${name}`, "utf8");
}

/**
 * Igual que startServer pero para HTTPS con certificados de test: crea un
 * https.Server con { key, cert } y rastrea sus sockets de la misma forma,
 * de modo que la limpieza de seguridad (stopServer / after global) también
 * lo cierre.
 *
 * @param {string} keyPem — clave privada de test (PEM)
 * @param {string} certPem — certificado de test (PEM)
 * @param {object} handler — función (req, res) => void
 * @param {string} [host="127.0.0.1"] — dirección a la que escuchar
 * @returns {Promise<{ server: https.Server, sockets: Set, port: number, baseUrl: string }>}
 */
function startTlsServer(keyPem, certPem, handler, host = "127.0.0.1") {
  return new Promise((resolve, reject) => {
    const server = https.createServer({ key: keyPem, cert: certPem }, handler);
    const sockets = new Set();
    server.on("connection", (socket) => {
      sockets.add(socket);
      socket.on("close", () => sockets.delete(socket));
    });
    server.listen(0, host, () => {
      const port = server.address().port;
      const urlHost = host.includes(":") ? `[${host}]` : host;
      const handle = { server, sockets, port, baseUrl: `https://${urlHost}:${port}` };
      activeServers.set(server, handle);
      resolve(handle);
    });
    server.on("error", reject);
  });
}

/**
 * Ejecuta el subproceso TLS de test (tests/fixtures/tls/fetch-child.mjs) con
 * entorno extra (p. ej. NODE_EXTRA_CA_CERTS) y resuelve al cerrar con
 * { code, out, err }. El subproceso imprime un JSON en stdout:
 * code 0 = fetch exitoso, 1 = fetch rechazado, 2+ = error del subproceso.
 *
 * @param {object} extraEnv — variables de entorno adicionales para el hijo
 * @param {number} [timeoutMs=30_000] — tope; si el hijo no cierra, se mata
 * @returns {Promise<{ code: number, out: string, err: string }>}
 */
function runTlsChild(extraEnv, timeoutMs = 30_000) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [TLS_CHILD_SCRIPT], {
      env: { ...process.env, ...extraEnv },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (chunk) => (out += chunk));
    child.stderr.on("data", (chunk) => (err += chunk));
    const watchdog = setTimeout(() => {
      child.kill("SIGKILL");
      reject(
        new Error(`subproceso TLS agotó el tiempo (${timeoutMs}ms). stderr: ${err.slice(-500)}`)
      );
    }, timeoutMs);
    child.on("error", (error) => {
      clearTimeout(watchdog);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(watchdog);
      resolve({ code, out, err });
    });
  });
}

/**
 * Verifica que el fetch fue rechazado por la política SSRF (guard) y no por
 * un fallo de conexión: el mensaje del error debe contener la razón exacta
 * del guard, p. ej. "Private IPv4 blocked: 10.0.0.1".
 */
function guardRejects(promise, reasonFragment) {
  return assert.rejects(promise, (err) => {
    assert.ok(
      err instanceof Error && err.message.includes(reasonFragment),
      `esperaba rechazo del guard con "${reasonFragment}", recibí: ${err}`
    );
    return true;
  });
}

/**
 * Encuentra una dirección IPv4 privada de una interfaz local no loopback
 * (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16). Retorna null si el runner no
 * expone ninguna; en ese caso el test que la usa se omite explícitamente.
 */
function privateInterfaceAddress() {
  for (const infos of Object.values(os.networkInterfaces())) {
    for (const info of infos ?? []) {
      if (info.family !== "IPv4" || info.internal) continue;
      const [a, b] = info.address.split(".").map(Number);
      const isPrivate = a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
      if (isPrivate) return info.address;
    }
  }
  return null;
}

/** Opciones por defecto para conectar a localhost. */
const LOCALHOST_OPTS = { allowLocalhost: true };

// ═══════════════════════════════════════════════════════════════════════════════
// IP validation (SSRF guards)
// ═══════════════════════════════════════════════════════════════════════════════

describe("fetchUrl — SSRF guards", () => {
  let server, baseUrl;

  before(async () => {
    const s = await startServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(
        "<!DOCTYPE html><html><head><title>Test</title></head><body><p>Hello.</p></body></html>"
      );
    });
    server = s.server;
    baseUrl = s.baseUrl;
  });

  after(async () => {
    await stopServer(server);
  });

  it("bloquea conexión a localhost sin --allow-localhost", async () => {
    await guardRejects(fetchUrl(`${baseUrl}/`), "Loopback IPv4 blocked: 127.0.0.1");
  });

  it("permite conexión a localhost con allowLocalhost: true", async () => {
    const result = await fetchUrl(`${baseUrl}/`, LOCALHOST_OPTS);
    assert.equal(result.statusCode, 200);
    assert.ok(result.html.includes("<title>Test</title>"));
    assert.equal(result.finalUrl, `${baseUrl}/`);
  });

  it("rechaza esquemas no http(s)", async () => {
    await assert.rejects(() => fetchUrl("ftp://example.com/test"), /unsupported protocol|ftp/i);
  });

  it("rechaza URLs inválidas", async () => {
    await assert.rejects(() => fetchUrl("not a url"), /invalid url/i);
  });

  // ── Regresión SSRF: IPs privadas conocidas ──
  // Estos tests verifican que las IPs privadas más comunes son rechazadas
  // en la etapa de validación, antes de cualquier intento de conexión, y
  // que la razón es de política (el mensaje exacto del guard), no un fallo
  // de conexión.

  const BLOCKED_IPS = [
    { label: "10.0.0.1 (Class A private)", url: "http://10.0.0.1/", address: "10.0.0.1" },
    { label: "192.168.1.1 (Class C private)", url: "http://192.168.1.1/", address: "192.168.1.1" },
    { label: "172.16.0.1 (Class B private)", url: "http://172.16.0.1/", address: "172.16.0.1" },
    { label: "127.0.0.1 (IPv4 loopback)", url: "http://127.0.0.1/", address: "127.0.0.1" },
    { label: "0.0.0.0 (current network)", url: "http://0.0.0.0/", address: "0.0.0.0" },
  ];

  for (const ip of BLOCKED_IPS) {
    it(`bloquea IP privada — ${ip.label}`, async () => {
      await guardRejects(fetchUrl(ip.url), `blocked: ${ip.address}`);
    });
  }

  it("bloquea IPv6 loopback ::1", async () => {
    await guardRejects(fetchUrl("http://[::1]/"), "blocked: ::1");
  });

  it("bloquea IPv6 link-local fe80::", async () => {
    await guardRejects(fetchUrl("http://[fe80::1]/"), "blocked: fe80::1");
  });

  it("bloquea IPv6 unique local fd00::", async () => {
    await guardRejects(fetchUrl("http://[fd00::1]/"), "blocked: fd00::1");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Fetch exitoso
// ═══════════════════════════════════════════════════════════════════════════════

describe("fetchUrl — successful fetch", () => {
  let server, baseUrl;

  before(async () => {
    const s = await startServer(
      (_req, res) => {
        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "X-Custom": "test-value",
        });
        res.end(
          '<!DOCTYPE html><html lang="es"><head><title>Test Page</title></head><body><h1>Hello World</h1></body></html>'
        );
      },
      // Host explícito: ejercita el parámetro `host` de startServer
      // (la ruta IPv6 del bracket queda cubierta por la revisión del helper).
      "127.0.0.1"
    );
    server = s.server;
    baseUrl = s.baseUrl;
  });

  after(async () => {
    await stopServer(server);
  });

  it("retorna html, statusCode, finalUrl y headers", async () => {
    const result = await fetchUrl(`${baseUrl}/page`, LOCALHOST_OPTS);
    assert.equal(result.statusCode, 200);
    assert.ok(result.html.includes("<h1>Hello World</h1>"));
    assert.ok(result.html.includes("Test Page"));
    assert.equal(result.finalUrl, `${baseUrl}/page`);
    assert.ok(result.headers["content-type"].includes("text/html"));
    assert.equal(result.headers["x-custom"], "test-value");
  });

  it("maneja página 404 sin crashear", async () => {
    // Crear un servidor dedicado que solo responde 404
    const s404 = await startServer((_req, res) => {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found");
    });
    try {
      const result = await fetchUrl(`${s404.baseUrl}/not-found`, LOCALHOST_OPTS);
      assert.equal(result.statusCode, 404);
    } finally {
      await stopServer(s404);
    }
  });

  it("maneja página 500 sin crashear", async () => {
    const s500 = await startServer((_req, res) => {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("Internal Server Error");
    });
    try {
      const result = await fetchUrl(`${s500.baseUrl}/error`, LOCALHOST_OPTS);
      assert.equal(result.statusCode, 500);
    } finally {
      await stopServer(s500);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Redirects
// ═══════════════════════════════════════════════════════════════════════════════

describe("fetchUrl — redirects", () => {
  // Servidor con múltiples endpoints para redirects
  let server, baseUrl;

  before(async () => {
    const s = await startServer((req, res) => {
      const url = new URL(req.url, `http://${req.headers.host}`);

      if (url.pathname === "/one-redirect") {
        res.writeHead(301, { Location: `${baseUrl}/final` });
        res.end();
      } else if (url.pathname === "/three-redirects") {
        res.writeHead(302, { Location: `/redirect-2` });
        res.end();
      } else if (url.pathname === "/redirect-2") {
        res.writeHead(302, { Location: `/redirect-3` });
        res.end();
      } else if (url.pathname === "/redirect-3") {
        res.writeHead(307, { Location: `/final` });
        res.end();
      } else if (url.pathname === "/five-redirects") {
        res.writeHead(301, { Location: `/chain-2` });
        res.end();
      } else if (url.pathname === "/chain-2") {
        res.writeHead(301, { Location: `/chain-3` });
        res.end();
      } else if (url.pathname === "/chain-3") {
        res.writeHead(301, { Location: `/chain-4` });
        res.end();
      } else if (url.pathname === "/chain-4") {
        res.writeHead(301, { Location: `/chain-5` });
        res.end();
      } else if (url.pathname === "/chain-5") {
        res.writeHead(301, { Location: `/final` });
        res.end();
      } else if (url.pathname === "/six-redirects") {
        res.writeHead(301, { Location: `/deep-2` });
        res.end();
      } else if (url.pathname === "/deep-2") {
        res.writeHead(301, { Location: `/deep-3` });
        res.end();
      } else if (url.pathname === "/deep-3") {
        res.writeHead(301, { Location: `/deep-4` });
        res.end();
      } else if (url.pathname === "/deep-4") {
        res.writeHead(301, { Location: `/deep-5` });
        res.end();
      } else if (url.pathname === "/deep-5") {
        res.writeHead(301, { Location: `/deep-6` });
        res.end();
      } else if (url.pathname === "/deep-6") {
        res.writeHead(301, { Location: `/final` });
        res.end();
      } else if (url.pathname === "/redirect-to-private") {
        // Redirect a IP privada para testear re-validación
        res.writeHead(301, { Location: "http://10.0.0.1/blocked" });
        res.end();
      } else if (url.pathname === "/redirect-invalid") {
        res.writeHead(301, { Location: "javascript:void(0)" });
        res.end();
      } else {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<html><body><p>Final</p></body></html>");
      }
    });
    server = s.server;
    baseUrl = s.baseUrl;
  });

  after(async () => {
    await stopServer(server);
  });

  it("sigue un redirect simple (1 nivel)", async () => {
    const result = await fetchUrl(`${baseUrl}/one-redirect`, LOCALHOST_OPTS);
    assert.equal(result.statusCode, 200);
    // finalUrl es la URL final tras el redirect (no la original)
    assert.ok(result.finalUrl.includes("/final"), `Esperaba /final, recibí ${result.finalUrl}`);
    assert.ok(result.html.includes("Final"));
  });

  it("sigue cadena de 3 redirects", async () => {
    const result = await fetchUrl(`${baseUrl}/three-redirects`, LOCALHOST_OPTS);
    assert.equal(result.statusCode, 200);
    assert.ok(result.html.includes("Final"));
  });

  it("sigue cadena de 5 redirects (máximo)", async () => {
    const result = await fetchUrl(`${baseUrl}/five-redirects`, LOCALHOST_OPTS);
    assert.equal(result.statusCode, 200);
    assert.ok(result.html.includes("Final"));
  });

  it("cadena de 5 redirects completa dentro de un presupuesto ajustado", async () => {
    // El presupuesto compartido (Plan 077) no debe romper las cadenas
    // rápidas: una cadena local entera cabe holgadamente en 2s.
    const started = Date.now();
    const result = await fetchUrl(`${baseUrl}/five-redirects`, {
      ...LOCALHOST_OPTS,
      timeoutMs: 2_000,
    });
    const elapsed = Date.now() - started;
    assert.equal(result.statusCode, 200);
    assert.ok(result.html.includes("Final"));
    assert.ok(elapsed < 2_000, `cadena rápida excedió el presupuesto (${elapsed}ms)`);
  });

  it("rechaza cadena de 6 redirects (excede max depth)", async () => {
    await assert.rejects(
      () => fetchUrl(`${baseUrl}/six-redirects`, LOCALHOST_OPTS),
      /too many redirects|redirect/i
    );
  });

  it("rechaza redirect a IP privada (re-validación SSRF)", async () => {
    // Usar allowLocalhost para el servidor local, pero la IP 10.0.0.1
    // del redirect debe ser bloqueada porque no es loopback.
    await guardRejects(
      fetchUrl(`${baseUrl}/redirect-to-private`, { allowLocalhost: true, allowPrivate: false }),
      "blocked: 10.0.0.1"
    );
  });

  it("rechaza redirect con Location inválida", async () => {
    await assert.rejects(
      () => fetchUrl(`${baseUrl}/redirect-invalid`, LOCALHOST_OPTS),
      /invalid redirect|javascript/i
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Hop scheme & origin policy (Plan 075)
// ═══════════════════════════════════════════════════════════════════════════════

describe("fetchUrl — hop scheme & origin policy (Plan 075)", () => {
  // Dos origins locales (puertos distintos): A es el root de la auditoría,
  // B el destino cross-origin. B cuenta requests para probar que un hop
  // rechazado nunca llega a conectar.
  let serverA, serverB, baseUrlA, baseUrlB, requestsB;

  before(async () => {
    requestsB = 0;
    const sA = await startServer((req, res) => {
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (url.pathname === "/same-origin-redirect") {
        res.writeHead(302, { Location: `${baseUrlA}/final` });
        res.end();
      } else if (url.pathname === "/cross-origin-redirect") {
        res.writeHead(302, { Location: `${baseUrlB}/page` });
        res.end();
      } else if (url.pathname === "/redirect-to-private") {
        res.writeHead(301, { Location: "http://10.0.0.1/blocked" });
        res.end();
      } else {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<html><body><p>origin-a</p></body></html>");
      }
    });
    const sB = await startServer((req, res) => {
      requestsB += 1;
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (url.pathname === "/sub-sitemap.xml") {
        res.writeHead(200, { "Content-Type": "application/xml" });
        res.end(
          `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${baseUrlB}/page</loc></url></urlset>`
        );
        return;
      }
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end("<html><body><p>origin-b</p></body></html>");
    });
    serverA = sA.server;
    baseUrlA = sA.baseUrl;
    serverB = sB.server;
    baseUrlB = sB.baseUrl;
  });

  after(async () => {
    await stopServer(serverA);
    await stopServer(serverB);
  });

  it("rechaza URL raíz http: con allowHttp:false antes de conectar (0 requests)", async () => {
    const before = requestsB;
    await guardRejects(
      fetchUrl(`${baseUrlB}/page`, { allowLocalhost: true, allowHttp: false }),
      "Hop policy: HTTP scheme blocked"
    );
    assert.equal(requestsB - before, 0, "el hop rechazado por esquema no debe conectar");
  });

  it("permite http: con allowHttp:true (compatibilidad de librería)", async () => {
    const result = await fetchUrl(`${baseUrlB}/page`, { allowLocalhost: true, allowHttp: true });
    assert.equal(result.statusCode, 200);
    assert.ok(result.html.includes("origin-b"));
  });

  it("rechaza redirect cross-origin con rootOrigin sin --allow-cross-origin (0 requests al destino)", async () => {
    const before = requestsB;
    await guardRejects(
      fetchUrl(`${baseUrlA}/cross-origin-redirect`, {
        allowLocalhost: true,
        allowHttp: true,
        allowCrossOrigin: false,
        rootOrigin: baseUrlA,
      }),
      "Hop policy: cross-origin blocked"
    );
    assert.equal(requestsB - before, 0, "el hop cross-origin rechazado no debe conectar");
  });

  it("sigue redirect cross-origin con allowCrossOrigin:true", async () => {
    const result = await fetchUrl(`${baseUrlA}/cross-origin-redirect`, {
      allowLocalhost: true,
      allowHttp: true,
      allowCrossOrigin: true,
      rootOrigin: baseUrlA,
    });
    assert.equal(result.statusCode, 200);
    assert.ok(result.html.includes("origin-b"));
    assert.ok(result.finalUrl.includes("/page"));
  });

  it("sigue redirect same-origin sin allowCrossOrigin (el root origin no restringe dentro de él)", async () => {
    const result = await fetchUrl(`${baseUrlA}/same-origin-redirect`, {
      allowLocalhost: true,
      allowHttp: true,
      allowCrossOrigin: false,
      rootOrigin: baseUrlA,
    });
    assert.equal(result.statusCode, 200);
    assert.ok(result.finalUrl.includes("/final"));
  });

  it("rechaza URL raíz cross-origen con rootOrigin fijo (caso página de sitemap) sin conectar", async () => {
    // Simula el modo --sitemap del CLI: fetchUrl recibe una página de otro
    // origin con rootOrigin = origin del sitemap raíz.
    const before = requestsB;
    await guardRejects(
      fetchUrl(`${baseUrlB}/page`, {
        allowLocalhost: true,
        allowHttp: true,
        allowCrossOrigin: false,
        rootOrigin: baseUrlA,
      }),
      "Hop policy: cross-origin blocked"
    );
    assert.equal(requestsB - before, 0, "la página cross-origin rechazada no debe conectar");
  });

  it("deriva el root origin de la URL raíz cuando no se pasa rootOrigin", async () => {
    // Sin rootOrigin explícito (modo --url del CLI), el root es la propia
    // URL: un redirect a otro origin se rechaza igual con allowCrossOrigin:false.
    const before = requestsB;
    await guardRejects(
      fetchUrl(`${baseUrlA}/cross-origin-redirect`, {
        allowLocalhost: true,
        allowHttp: true,
        allowCrossOrigin: false,
      }),
      "Hop policy: cross-origin blocked"
    );
    assert.equal(requestsB - before, 0);
  });

  it("los guards SSRF siguen ganando incluso con ambos opt-ins activos", async () => {
    // allowHttp + allowCrossOrigin activos no debilitan el bloqueo de IPs:
    // el redirect a 10.0.0.1 se rechaza en la validación de IP, no por
    // política de esquema/origin.
    await guardRejects(
      fetchUrl(`${baseUrlA}/redirect-to-private`, {
        allowLocalhost: true,
        allowHttp: true,
        allowCrossOrigin: true,
      }),
      "blocked: 10.0.0.1"
    );
  });

  it("fetchRobotsTxt PROPAGA el rechazo de política (ERR_HOP_POLICY) sin cachearlo", async () => {
    clearRobotsCache();
    // origin http + allowHttp:false → el hop de robots.txt se rechaza por
    // política y el error se PROPAGA (no se degrada en silencio como los
    // fallos de red): el llamador debe poder avisar y reintentar con el
    // opt-in. El resultado vacío NO se cachea en el camino del throw.
    const strictOpts = { allowLocalhost: true, allowHttp: false, allowCrossOrigin: false };
    await assert.rejects(fetchRobotsTxt(baseUrlA, strictOpts), (err) => {
      assert.ok(
        err instanceof Error && err.message.includes("Hop policy"),
        `esperaba rechazo de política, recibí: ${err.message}`
      );
      assert.equal(err.code, "ERR_HOP_POLICY", "el error debe llevar el código estable");
      return true;
    });

    // Reintento con la misma política estricta: vuelve a rechazar (prueba
    // que el vacío del primer fallo no quedó cacheado).
    await assert.rejects(fetchRobotsTxt(baseUrlA, strictOpts), (err) => {
      assert.equal(err?.code, "ERR_HOP_POLICY");
      return true;
    });

    // Reintento con el opt-in: fetchea de verdad (la política pasa y el
    // servidor local responde el HTML por defecto).
    clearRobotsCache();
    const fresh = await fetchRobotsTxt(baseUrlA, {
      allowLocalhost: true,
      allowHttp: true,
      allowCrossOrigin: true,
    });
    assert.ok(Array.isArray(fresh.groups));
  });

  it("sub-sitemap cross-origin se rechaza en el flujo de sitemap (0 requests al segundo origin)", async () => {
    const { collectSubSitemapPageUrls } = await import("../src/sitemap.js");
    const strict = {
      allowLocalhost: true,
      allowHttp: true,
      allowCrossOrigin: false,
      rootOrigin: baseUrlA,
    };
    const before = requestsB;
    const warnings = [];
    const { pageUrls, fetched } = await collectSubSitemapPageUrls(
      [{ loc: `${baseUrlB}/sub-sitemap.xml` }],
      {
        fetchFn: fetchUrl,
        fetchOptions: strict,
        onWarn: (m) => warnings.push(m),
      }
    );
    assert.equal(pageUrls.length, 0);
    assert.equal(requestsB - before, 0, "el sub-sitemap cross-origin no debe conectarse");
    assert.ok(
      warnings.some((w) => w.includes("Failed to fetch sub-sitemap")),
      `esperaba warning de fetch fallido, recibí: ${warnings.join("; ")}`
    );

    // Con allowCrossOrigin:true el mismo flujo extrae las páginas del
    // sub-sitemap de B.
    const allowed = await collectSubSitemapPageUrls([{ loc: `${baseUrlB}/sub-sitemap.xml` }], {
      fetchFn: fetchUrl,
      fetchOptions: { ...strict, allowCrossOrigin: true },
    });
    assert.deepEqual(allowed.pageUrls, [`${baseUrlB}/page`]);
  });

  it("sub-sitemap http: se rechaza por esquema bajo política estricta (0 requests)", async () => {
    const { collectSubSitemapPageUrls } = await import("../src/sitemap.js");
    // Variación estricta en el esquema: allowHttp:false hace que el loc
    // http:// del sub-sitemap se rechace antes de cualquier conexión.
    const strict = {
      allowLocalhost: true,
      allowHttp: false,
      allowCrossOrigin: false,
      rootOrigin: baseUrlA,
    };
    const before = requestsB;
    const warnings = [];
    const { pageUrls, fetched } = await collectSubSitemapPageUrls(
      [{ loc: `${baseUrlB}/sub-sitemap.xml` }],
      {
        fetchFn: fetchUrl,
        fetchOptions: strict,
        onWarn: (m) => warnings.push(m),
      }
    );
    assert.equal(pageUrls.length, 0);
    assert.equal(fetched, 1, "el sub-sitemap se intenta una vez y falla por política");
    assert.equal(requestsB - before, 0, "el sub-sitemap http rechazado no debe conectarse");
    assert.ok(
      warnings.some((w) => w.includes("Failed to fetch sub-sitemap")),
      `esperaba warning de fetch fallido, recibí: ${warnings.join("; ")}`
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Timeouts
// ═══════════════════════════════════════════════════════════════════════════════

describe("fetchUrl — timeouts", () => {
  it("timeout total: servidor que retiene la conexión sin responder", async () => {
    const s = await startServer(() => {
      // No hacemos nada — nunca enviamos respuesta.
      // El total timeout debe abortar el request.
    });

    try {
      const budget = 1_000;
      const started = Date.now();
      await assert.rejects(
        () => fetchUrl(`${s.baseUrl}/hang`, { allowLocalhost: true, timeoutMs: budget }),
        /Request total timeout after 1000ms/
      );
      const elapsed = Date.now() - started;
      assert.ok(elapsed >= 800, `timeout total disparado demasiado pronto (${elapsed}ms)`);
      assert.ok(elapsed < 5_000, `timeout total tardó demasiado (${elapsed}ms)`);
    } finally {
      await stopServer(s);
    }
  });

  it("timeout total: servidor que envía headers pero nunca termina el body", async () => {
    const s = await startServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/html" });
      // Escribe headers pero nunca envía el body completo
      res.write("<html>");
      // se queda colgado...
    });

    try {
      const budget = 1_000;
      const started = Date.now();
      await assert.rejects(
        () => fetchUrl(`${s.baseUrl}/slow`, { allowLocalhost: true, timeoutMs: budget }),
        /Request total timeout after 1000ms/
      );
      const elapsed = Date.now() - started;
      assert.ok(elapsed >= 800, `timeout total disparado demasiado pronto (${elapsed}ms)`);
      assert.ok(elapsed < 5_000, `timeout total tardó demasiado (${elapsed}ms)`);
    } finally {
      await stopServer(s);
    }
  });

  it("timeout total: cadena de redirects individualmente rápidos pero acumulativamente lentos comparte el presupuesto", async () => {
    // Cada hop tarda 400ms < presupuesto (1000ms), pero la suma de los 4
    // (3 redirects + respuesta final) es 1600ms > presupuesto. El timeout
    // total es UNA fecha límite para toda la transacción (Plan 077): la
    // cadena debe rechazar cerca del presupuesto original, no tras
    // multiplicarlo por el número de hops.
    const s = await startServer((req, res) => {
      const url = new URL(req.url, `http://${req.headers.host}`);
      setTimeout(() => {
        if (url.pathname === "/slow-chain-1") {
          res.writeHead(302, { Location: "/slow-chain-2" });
        } else if (url.pathname === "/slow-chain-2") {
          res.writeHead(302, { Location: "/slow-chain-3" });
        } else if (url.pathname === "/slow-chain-3") {
          res.writeHead(302, { Location: "/slow-final" });
        } else {
          res.writeHead(200, { "Content-Type": "text/html" });
        }
        res.end("<html>final</html>");
      }, 400);
    });

    try {
      const budget = 1_000;
      const started = Date.now();
      await assert.rejects(
        () => fetchUrl(`${s.baseUrl}/slow-chain-1`, { allowLocalhost: true, timeoutMs: budget }),
        /Request total timeout after 1000ms/
      );
      const elapsed = Date.now() - started;
      // Generoso: ni disparado antes de la primera mitad del presupuesto ni
      // con el presupuesto renovado por hop (que habría tardado ~1600ms).
      assert.ok(elapsed >= 500, `timeout total disparado demasiado pronto (${elapsed}ms)`);
      assert.ok(elapsed < 2_500, `timeout total tardó demasiado (${elapsed}ms)`);
    } finally {
      await stopServer(s);
    }
  });

  it("timeout total: presupuesto agotado antes del siguiente hop", async () => {
    // El primer hop consume el 90% del presupuesto y el segundo tarda más
    // de lo que queda: debe rechazar al alcanzar la fecha límite compartida
    // (o de inmediato si ya la excedió), nunca con un presupuesto renovado.
    const s = await startServer((req, res) => {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const delay = url.pathname === "/almost-exhausted" ? 900 : 300;
      setTimeout(() => {
        if (url.pathname === "/almost-exhausted") {
          res.writeHead(302, { Location: "/slow-tail" });
        } else {
          res.writeHead(200, { "Content-Type": "text/html" });
        }
        res.end("<html>final</html>");
      }, delay);
    });

    try {
      const budget = 1_000;
      const started = Date.now();
      await assert.rejects(
        () =>
          fetchUrl(`${s.baseUrl}/almost-exhausted`, {
            allowLocalhost: true,
            timeoutMs: budget,
          }),
        /Request total timeout after 1000ms/
      );
      const elapsed = Date.now() - started;
      assert.ok(elapsed >= 500, `timeout total disparado demasiado pronto (${elapsed}ms)`);
      assert.ok(elapsed < 2_000, `timeout total tardó demasiado (${elapsed}ms)`);
    } finally {
      await stopServer(s);
    }
  });

  it("timeout total: el timer armado aborta antes de recibir headers", async () => {
    // El presupuesto (200ms) es suficiente para pasar el check de entrada
    // (overhead medido ~5ms): el abort debe venir del TIMER armado, no del
    // throw de entrada. Si este test reporta elapsed < 150, el abort viene
    // del camino equivocado — NO aflojar el límite, reportar.
    const s = await startServer(() => {
      // Nunca responde — el abort debe venir del presupuesto total.
    });

    try {
      const started = Date.now();
      await assert.rejects(
        () => fetchUrl(`${s.baseUrl}/hang`, { allowLocalhost: true, timeoutMs: 200 }),
        /Request total timeout after 200ms/
      );
      const elapsed = Date.now() - started;
      assert.ok(elapsed >= 150, `timeout total disparado demasiado pronto (${elapsed}ms)`);
      assert.ok(elapsed < 1_000, `timeout total tardó demasiado (${elapsed}ms)`);
    } finally {
      await stopServer(s);
    }
  });

  it("timeout total: presupuesto agotado antes de entrar lanza de inmediato", async () => {
    // Un presupuesto de 1ms se consume en la adquisición del rate-limiter:
    // el check de entrada (remaining <= 0) lanza SIN armar el timer ni
    // conectar. La aserción aguanta ambos caminos (throw de entrada o timer
    // de 1ms): el mensaje es el mismo y elapsed queda por debajo de 50ms.
    const s = await startServer(() => {
      // Nunca responde — el abort debe venir del presupuesto total.
    });

    try {
      const started = Date.now();
      await assert.rejects(
        () => fetchUrl(`${s.baseUrl}/hang`, { allowLocalhost: true, timeoutMs: 1 }),
        /Request total timeout after 1ms/
      );
      const elapsed = Date.now() - started;
      assert.ok(elapsed < 50, `timeout total tardó demasiado (${elapsed}ms)`);
    } finally {
      await stopServer(s);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Max response size
// ═══════════════════════════════════════════════════════════════════════════════

describe("fetchUrl — max response size", () => {
  let server, baseUrl;

  before(async () => {
    const s = await startServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/html" });
      // Enviar un body grande (~500 KB)
      const chunk = "x".repeat(1024); // 1 KB
      let sent = 0;
      const maxToSend = 500 * 1024; // 500 KB
      function sendChunk() {
        if (sent >= maxToSend) {
          res.end();
          return;
        }
        const canContinue = res.write(chunk);
        sent += chunk.length;
        if (canContinue) {
          setImmediate(sendChunk);
        } else {
          res.once("drain", sendChunk);
        }
      }
      sendChunk();
    });
    server = s.server;
    baseUrl = s.baseUrl;
  });

  after(async () => {
    await stopServer(server);
  });

  it("rechaza body que excede maxSize sin OOM", async () => {
    await assert.rejects(
      () =>
        fetchUrl(`${baseUrl}/large`, {
          allowLocalhost: true,
          maxSize: 10_000, // 10 KB — menor que los 500 KB del servidor
        }),
      /size|exceeds limit/i
    );
  });

  it("acepta body dentro del límite", async () => {
    const result = await fetchUrl(`${baseUrl}/large`, {
      allowLocalhost: true,
      maxSize: MAX_RESPONSE_SIZE, // 2 MB — suficiente
    });
    assert.equal(result.statusCode, 200);
    assert.ok(result.html.length > 100_000);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// DNS failure
// ═══════════════════════════════════════════════════════════════════════════════

describe("fetchUrl — DNS failures", () => {
  it("error con hostname inexistente", async () => {
    // ".invalid" es un TLD reservado (RFC 2606): nunca resuelve, sin depender
    // de ningún servicio externo.
    await assert.rejects(
      () =>
        fetchUrl("http://this-hostname-does-not-exist-xyz-123.invalid/", {
          allowPrivate: true,
        }),
      /DNS resolution failed: no addresses found/
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// robots.txt integration
// ═══════════════════════════════════════════════════════════════════════════════

describe("fetchRobotsTxt", () => {
  let server, baseUrl, robotsRequests;

  before(async () => {
    robotsRequests = 0;
    const s = await startServer((req, res) => {
      robotsRequests += 1;
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (url.pathname === "/robots.txt") {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end(
          [
            "User-agent: *",
            "Disallow: /private",
            "Disallow: /admin",
            "",
            "User-agent: GeoBot",
            "Disallow: /geo-secret",
            "",
            "User-agent: geo-opt",
            "Allow: /",
          ].join("\n")
        );
      } else if (url.pathname === "/robots-empty.txt") {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("");
      } else {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not Found");
      }
    });
    server = s.server;
    baseUrl = s.baseUrl;
  });

  after(async () => {
    await stopServer(server);
    clearRobotsCache();
  });

  it("obtiene y parsea robots.txt correctamente", async () => {
    clearRobotsCache();
    const result = await fetchRobotsTxt(baseUrl, LOCALHOST_OPTS);
    assert.ok(result.groups.length > 0);
    assert.ok(result.raw.length > 0);
  });

  it("cachea robots.txt — la segunda llamada no vuelve a la red", async () => {
    clearRobotsCache();
    const first = await fetchRobotsTxt(baseUrl, LOCALHOST_OPTS);
    assert.ok(first.groups.length > 0);
    const requestsAfterFirst = robotsRequests;
    const cached = await fetchRobotsTxt(baseUrl, LOCALHOST_OPTS);
    assert.equal(cached, first, "la llamada cacheada debe devolver la misma entrada");
    assert.equal(robotsRequests, requestsAfterFirst, "la caché no debe generar otra request");
  });

  it("fetchRobotsTxt no crashea si robots.txt no existe (404)", async () => {
    clearRobotsCache();
    const s404 = await startServer((_req, res) => {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found");
    });
    try {
      const result = await fetchRobotsTxt(s404.baseUrl, LOCALHOST_OPTS);
      // Debería retornar grupos vacíos sin crashear
      assert.ok(Array.isArray(result.groups));
      assert.equal(result.groups.length, 0);
    } finally {
      await stopServer(s404);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// checkRobotsRule
// ═══════════════════════════════════════════════════════════════════════════════

describe("checkRobotsRule", () => {
  // Grupos de ejemplo parseados de un robots.txt típico
  const groups = [
    {
      agents: ["*"],
      rules: [
        { directive: "disallow", path: "/private" },
        { directive: "disallow", path: "/admin" },
      ],
    },
    {
      agents: ["geo-opt"],
      rules: [{ directive: "allow", path: "/" }],
    },
    {
      agents: ["GPTBot"],
      rules: [
        { directive: "disallow", path: "/no-gpt" },
        { directive: "allow", path: "/public" },
      ],
    },
  ];

  it("permite URL sin reglas coincidentes", () => {
    const result = checkRobotsRule("https://example.com/public/page", groups, "MyBot");
    assert.equal(result.allowed, true);
  });

  it("bloquea URL que coincide con Disallow del wildcard", () => {
    const result = checkRobotsRule("https://example.com/private/data", groups, "MyBot");
    assert.equal(result.allowed, false);
    assert.ok(result.matchedRule);
    assert.equal(result.matchedRule.directive, "disallow");
    assert.equal(result.matchedRule.path, "/private");
  });

  it("permite URL para user-agent con Allow explícito", () => {
    const result = checkRobotsRule("https://example.com/private/data", groups, "geo-opt/2.0");
    assert.equal(result.allowed, true);
  });

  it("bloquea URL para GPTBot en path prohibido", () => {
    const result = checkRobotsRule("https://example.com/no-gpt/content", groups, "GPTBot");
    assert.equal(result.allowed, false);
  });

  it("permite URL para GPTBot en path público (no coincide con reglas wildcard)", () => {
    const result = checkRobotsRule("https://example.com/public/content", groups, "GPTBot");
    // /public/content no coincide con /private ni /admin (reglas del wildcard *)
    assert.equal(result.allowed, true);
  });

  it("retorna allowed:true si no hay grupos", () => {
    const result = checkRobotsRule("https://example.com/anything", [], "AnyBot");
    assert.equal(result.allowed, true);
    assert.equal(result.matchedRule, null);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Sitemap mode integration (servidor local con sitemap.xml + páginas)
// ═══════════════════════════════════════════════════════════════════════════════

describe("fetchUrl — sitemap integration", () => {
  let server, baseUrl;

  before(async () => {
    const pages = new Map();
    pages.set(
      "/page-1",
      "<html><head><title>Page 1</title></head><body><h1>One</h1></body></html>"
    );
    pages.set(
      "/page-2",
      "<html><head><title>Page 2</title></head><body><h1>Two</h1></body></html>"
    );
    pages.set(
      "/page-3",
      "<html><head><title>Page 3</title></head><body><h1>Three</h1></body></html>"
    );

    const s = await startServer((req, res) => {
      const url = new URL(req.url, `http://${req.headers.host}`);

      if (url.pathname === "/sitemap.xml") {
        res.writeHead(200, { "Content-Type": "application/xml" });
        const xml = [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
          `  <url><loc>${baseUrl}/page-1</loc></url>`,
          `  <url><loc>${baseUrl}/page-2</loc></url>`,
          `  <url><loc>${baseUrl}/page-3</loc></url>`,
          "</urlset>",
        ].join("\n");
        res.end(xml);
      } else if (pages.has(url.pathname)) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(pages.get(url.pathname));
      } else {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not Found");
      }
    });
    server = s.server;
    baseUrl = s.baseUrl;
  });

  after(async () => {
    await stopServer(server);
  });

  it("puede fetchear un sitemap y parsear URLs", async () => {
    // Fetch del sitemap
    const sitemapResult = await fetchUrl(`${baseUrl}/sitemap.xml`, LOCALHOST_OPTS);
    assert.equal(sitemapResult.statusCode, 200);
    assert.ok(sitemapResult.html.includes("<urlset"));

    // Verificar que las páginas existen
    const pageResult = await fetchUrl(`${baseUrl}/page-1`, LOCALHOST_OPTS);
    assert.equal(pageResult.statusCode, 200);
    assert.ok(pageResult.html.includes("Page 1"));
  });

  it("puede fetchear múltiples páginas desde el sitemap", async () => {
    // Simular el flujo: fetch sitemap → parsear → fetch cada página
    const { parseSitemapXml } = await import("../src/sitemap.js");

    const sitemapResult = await fetchUrl(`${baseUrl}/sitemap.xml`, LOCALHOST_OPTS);
    const parsed = parseSitemapXml(sitemapResult.html);

    assert.equal(parsed.valid, true);
    assert.equal(parsed.urls.length, 3);

    // Fetch cada URL del sitemap
    const pageResults = [];
    for (const { loc } of parsed.urls) {
      const result = await fetchUrl(loc, LOCALHOST_OPTS);
      pageResults.push(result);
    }

    assert.equal(pageResults.length, 3);
    assert.ok(pageResults[0].html.includes("Page 1"));
    assert.ok(pageResults[1].html.includes("Page 2"));
    assert.ok(pageResults[2].html.includes("Page 3"));
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Rate limiting
// ═══════════════════════════════════════════════════════════════════════════════

describe("fetchUrl — rate limiting", () => {
  let server, baseUrl;

  before(async () => {
    const s = await startServer((_req, res) => {
      // Pequeño delay para simular trabajo
      setTimeout(() => {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<html><body><p>OK</p></body></html>");
      }, 50);
    });
    server = s.server;
    baseUrl = s.baseUrl;
  });

  after(async () => {
    await stopServer(server);
  });

  it("maneja múltiples requests concurrentes sin crashear", async () => {
    const urls = Array.from({ length: 5 }, (_, i) => `${baseUrl}/page-${i}`);

    const results = await Promise.all(urls.map((url) => fetchUrl(url, LOCALHOST_OPTS)));

    assert.equal(results.length, 5);
    for (const r of results) {
      assert.equal(r.statusCode, 200);
      assert.ok(r.html.includes("OK"));
    }
  });

  it("maneja mezcla de éxito y errores en concurrentes", async () => {
    const tasks = [
      fetchUrl(`${baseUrl}/ok-1`, LOCALHOST_OPTS),
      fetchUrl(`${baseUrl}/ok-2`, LOCALHOST_OPTS),
      // Esta fallará por DNS
      fetchUrl("http://does-not-exist-xyz-999.invalid/test").catch((e) => ({
        error: e.message,
      })),
    ];

    const results = await Promise.allSettled(tasks);

    const successful = results.filter((r) => r.status === "fulfilled");
    assert.ok(successful.length >= 2, "Debería haber al menos 2 éxitos");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Auditoría 2026-07-31 — F-02/F-03: huecos de cobertura SSRF
// ═══════════════════════════════════════════════════════════════════════════════

describe("SSRF guards — audit F-02/F-03", () => {
  // El guard debe rechazar ANTES de intentar conectar (sin servidor local).
  it("fetcher-blocks-link-local-metadata (169.254.0.0/16)", async () => {
    // 169.254.0.1 está en el rango link-local del metadata service (F-02);
    // se usa un literal distinto al de la dirección real para que el test
    // no dependa de ningún servicio externo.
    await guardRejects(fetchUrl("http://169.254.0.1/latest/meta-data/"), "blocked: 169.254.0.1");
  });

  it("fetcher-blocks-cgnat-range (100.64.0.0/10)", async () => {
    await guardRejects(fetchUrl("http://100.64.1.2/"), "blocked: 100.64.1.2");
  });

  it("fetcher-blocks-ipv4-mapped-loopback", async () => {
    // ::ffff:7f00:1 (hex) y ::ffff:127.0.0.1 (decimal) mapean a 127.0.0.1.
    await guardRejects(fetchUrl("http://[::ffff:7f00:1]/"), "blocked: 127.0.0.1");
    await guardRejects(fetchUrl("http://[::ffff:127.0.0.1]/"), "blocked: 127.0.0.1");
  });

  it("fetcher-blocks-ipv4-mapped-private", async () => {
    // ::ffff:a00:1 -> 10.0.0.1 (privada) debe bloquearse.
    await guardRejects(fetchUrl("http://[::ffff:a00:1]/"), "blocked: 10.0.0.1");
  });

  it("fetcher-blocks-link-local-v6-range (fe80::/10)", async () => {
    // El prefijo /10 cubre fe80::..febf:: — no solo fe80: (F-03).
    await guardRejects(fetchUrl("http://[fe90::1]/"), "blocked: fe90::1");
    await guardRejects(fetchUrl("http://[febf::1]/"), "blocked: febf::1");
  });

  it("allow-private: desbloquea IPs privadas reales pero no loopback mapeado", async (t) => {
    // allowPrivate=true solo permite privadas no-loopback; el loopback
    // mapeado sigue bloqueado salvo allowLocalhost.
    await guardRejects(
      fetchUrl("http://[::ffff:7f00:1]/", { allowPrivate: true }),
      "blocked: 127.0.0.1"
    );

    // Probar contra una IP privada local real (interfaz no loopback del
    // runner): bloqueada por defecto por política, alcanzable con
    // allowPrivate: true. Si el runner no expone una interfaz privada, se
    // omite solo este caso; nunca se usa una dirección externa como
    // sustituto.
    const privateIp = privateInterfaceAddress();
    if (!privateIp) {
      t.skip("el runner no expone una interfaz privada local; se omite la parte de conexión local");
      return;
    }

    const s = await startServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end("<html><body><p>private-ok</p></body></html>");
    }, privateIp);
    try {
      // Rechazo por política (el mensaje del guard), no por fallo de
      // conexión: se rechaza antes de conectar, incluso con allowLocalhost.
      await guardRejects(
        fetchUrl(`http://${privateIp}:${s.port}/`, { allowLocalhost: true }),
        `blocked: ${privateIp}`
      );

      // allowPrivate: true desbloquea la privada y llega al servidor local.
      const result = await fetchUrl(`http://${privateIp}:${s.port}/`, { allowPrivate: true });
      assert.equal(result.statusCode, 200);
      assert.ok(result.html.includes("private-ok"));
    } finally {
      await stopServer(s);
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Conexiones con literales IPv6 (fix F2): fetchUrl debe conectar a [::1] por
  // la dirección validada; parsed.hostname trae brackets ("[::1]") y, si llegan
  // al request, getaddrinfo falla con ENOTFOUND en Node 22+.
  // ═══════════════════════════════════════════════════════════════════════════

  let ipv6Server, ipv6Unavailable, ipv6HostHeader;

  before(async () => {
    try {
      const s = await startServer((req, res) => {
        ipv6HostHeader = req.headers.host;
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<html><body><p>v6-ok</p></body></html>");
      }, "::1");
      ipv6Server = s;
    } catch {
      ipv6Unavailable = true;
    }
  });

  after(async () => {
    if (ipv6Server) await stopServer(ipv6Server);
  });

  it("fetches-ipv6-literal: [::1] con allowLocalhost devuelve 200 y Host correcto", async (t) => {
    if (ipv6Unavailable) {
      t.skip("::1 no está disponible en este runner; se omite la conexión IPv6 local");
      return;
    }
    const result = await fetchUrl(`http://[::1]:${ipv6Server.port}/`, {
      allowLocalhost: true,
    });
    assert.equal(result.statusCode, 200);
    assert.ok(result.html.includes("v6-ok"));
    // El Host header debe ser la forma HTTP/1.1 correcta, con brackets.
    assert.equal(ipv6HostHeader, `[::1]:${ipv6Server.port}`);
  });

  it("bloquea http://[::1] sin allowLocalhost por política (guard antes de conectar)", async () => {
    // El guard rechaza en validación, antes de cualquier conexión: el puerto
    // es irrelevante, así que no depende de que ::1 esté disponible.
    await guardRejects(fetchUrl("http://[::1]:1/"), "blocked: ::1");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// HTTPS — validación de certificados y pinning de IP (Plan 074)
// ═══════════════════════════════════════════════════════════════════════════════
// Cubre la propiedad de seguridad más importante del fetcher: conectarse a la
// IP pre-resuelta y verificada (mitigación de DNS rebinding) mientras se valida
// TLS para el hostname original (SNI + Host). Los fixtures viven en
// tests/fixtures/tls/ (ver su README para regeneración y expiración).

describe("fetchUrl — HTTPS certificate & IP pinning (Plan 074)", () => {
  let trustedServer;
  let trustedUrl;
  let seen;
  let localhostResolvesToLoopback = false;

  before(async () => {
    // Estos tests resuelven el hostname "localhost" de verdad; si el runner no
    // lo resuelve a 127.0.0.1 (p. ej. /etc/hosts alterado) se omiten, igual
    // que los tests IPv6 cuando ::1 no está disponible.
    try {
      const v4 = await dns.resolve4("localhost");
      localhostResolvesToLoopback = v4.includes("127.0.0.1");
    } catch {
      localhostResolvesToLoopback = false;
    }
    if (!localhostResolvesToLoopback) return;

    seen = { host: null, remoteAddress: null, sni: null };
    const s = await startTlsServer(
      fixture("TEST-ONLY-localhost-server-key.pem"),
      fixture("TEST-ONLY-localhost-server-cert.pem"),
      (req, res) => {
        seen.host = req.headers.host;
        seen.remoteAddress = req.socket.remoteAddress;
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<html><body><p>tls-pin-ok</p></body></html>");
      }
    );
    s.server.on("secureConnection", (socket) => {
      seen.sni = socket.servername;
    });
    trustedServer = s;
    trustedUrl = `https://localhost:${s.port}/tls-pin`;
  });

  after(async () => {
    if (trustedServer) await stopServer(trustedServer.server);
  });

  it("TLS positivo: CA de test confiable y hostname en el certificado (subproceso con NODE_EXTRA_CA_CERTS)", async (t) => {
    if (!localhostResolvesToLoopback) {
      t.skip("localhost no resuelve a 127.0.0.1 en este runner; se omite el caso TLS positivo");
      return;
    }
    const child = await runTlsChild({
      NODE_EXTRA_CA_CERTS: `${FIXTURES_DIR}TEST-ONLY-ca-cert.pem`,
      TLS_TEST_URL: trustedUrl,
    });
    assert.equal(
      child.code,
      0,
      `el subproceso TLS debía salir con 0. stdout: ${child.out} stderr: ${child.err}`
    );
    const payload = JSON.parse(child.out);
    assert.equal(payload.ok, true);
    assert.equal(payload.statusCode, 200);
    assert.equal(payload.finalUrl, trustedUrl);
    // El servidor (proceso principal) observa la identidad original:
    assert.equal(
      seen.host,
      `localhost:${trustedServer.port}`,
      "el Host header debe ser el hostname original"
    );
    assert.equal(seen.sni, "localhost", "el SNI debe ser el hostname original");
    assert.equal(
      seen.remoteAddress,
      "127.0.0.1",
      "el socket debe llegar a la IP pre-resuelta (loopback)"
    );
  });

  it("TLS negativo: hostname no presente en el certificado → rechaza (ERR_TLS_CERT_ALTNAME_INVALID)", async (t) => {
    if (!localhostResolvesToLoopback) {
      t.skip("localhost no resuelve a 127.0.0.1 en este runner; se omite el caso de mismatch");
      return;
    }
    // El servidor presenta un cert firmado por la CA de test pero para
    // example.test: con la CA confiada, el único motivo de fallo es la
    // verificación de hostname (no la confianza), aislando esa dimensión.
    const s = await startTlsServer(
      fixture("TEST-ONLY-mismatch-server-key.pem"),
      fixture("TEST-ONLY-mismatch-server-cert.pem"),
      (_req, res) => {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<html><body><p>should-not-arrive</p></body></html>");
      }
    );
    try {
      const child = await runTlsChild({
        NODE_EXTRA_CA_CERTS: `${FIXTURES_DIR}TEST-ONLY-ca-cert.pem`,
        TLS_TEST_URL: `https://localhost:${s.port}/mismatch`,
      });
      assert.equal(child.code, 1, "el fetch con hostname no cubierto debía rechazarse");
      const payload = JSON.parse(child.out);
      assert.equal(payload.ok, false);
      assert.equal(
        payload.code,
        "ERR_TLS_CERT_ALTNAME_INVALID",
        `esperaba fallo de verificación de hostname, recibí: ${payload.code} — ${payload.error}`
      );
    } finally {
      await stopServer(s);
    }
  });

  it("TLS negativo: certificado no confiable (autofirmado) → rechaza sin debilitar TLS", async (t) => {
    if (!localhostResolvesToLoopback) {
      t.skip(
        "localhost no resuelve a 127.0.0.1 en este runner; se omite el caso de cert no confiable"
      );
      return;
    }
    const s = await startTlsServer(
      fixture("TEST-ONLY-untrusted-server-key.pem"),
      fixture("TEST-ONLY-untrusted-server-cert.pem"),
      (_req, res) => {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<html><body><p>should-not-arrive</p></body></html>");
      }
    );
    try {
      // Corre en el proceso principal SIN la CA de test: la única forma de que
      // llegue al servidor es que alguien desactive la verificación en
      // producción, y ese sería exactamente el bug que queremos detectar.
      await assert.rejects(
        fetchUrl(`https://localhost:${s.port}/untrusted`, LOCALHOST_OPTS),
        (err) => {
          const failClosedCodes = [
            "DEPTH_ZERO_SELF_SIGNED_CERT",
            "SELF_SIGNED_CERT_IN_CHAIN",
            "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
          ];
          assert.ok(
            failClosedCodes.includes(err.code) ||
              /self[- ]signed|unable to verify|certificate/i.test(err.message),
            `esperaba rechazo de verificación TLS, recibí code=${err.code} message=${err.message}`
          );
          return true;
        }
      );
    } finally {
      await stopServer(s);
    }
  });

  it("TLS contrato de fuente: rejectUnauthorized=true, resolución antes de conectar, request a la IP validada", () => {
    const source = readFileSync(new URL("../src/fetcher.js", import.meta.url), "utf8");
    // El agente HTTPS debe fijar los tres pins y nunca desactivar la verificación.
    assert.ok(
      source.includes("rejectUnauthorized: true"),
      "el agente seguro debe exigir verificación TLS"
    );
    assert.ok(
      !source.includes("rejectUnauthorized: false"),
      "no debe existir un modo sin verificación TLS"
    );
    assert.ok(source.includes("servername: hostname"), "el SNI debe ser el hostname original");
    assert.ok(source.includes("host: resolvedIp"), "el agente debe conectar a la IP pre-resuelta");
    // La resolución/validación debe preceder a la creación del agente (conexión).
    // Se busca la llamada (no la definición de la función) anclando la búsqueda
    // después de la línea de resolución.
    const resolveIndex = source.indexOf("await resolveAndValidateHost");
    const agentCallIndex = source.indexOf(
      "createSecureAgent(hostname, resolvedIp, port)",
      resolveIndex
    );
    assert.ok(
      resolveIndex !== -1 && agentCallIndex !== -1,
      "no se encontraron los puntos de anclaje del contrato de fuente"
    );
    assert.ok(
      resolveIndex < agentCallIndex,
      "la resolución y validación de IP debe preceder a la creación del agente"
    );
    // El request debe apuntar a la IP ya validada (sin segunda resolución DNS).
    assert.ok(source.includes("hostname: resolvedIp"), "el request debe conectar a la IP validada");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Hop policy sobre HTTPS (Plan 075) — downgrade y cross-origin con el agente TLS
// real, usando los fixtures de tests/fixtures/tls/ y el subproceso fetch-child.
// ═══════════════════════════════════════════════════════════════════════════════

describe("fetchUrl — hop scheme & origin policy over HTTPS (Plan 075)", () => {
  let localhostResolvesToLoopback = false;

  before(async () => {
    try {
      const v4 = await dns.resolve4("localhost");
      localhostResolvesToLoopback = v4.includes("127.0.0.1");
    } catch {
      localhostResolvesToLoopback = false;
    }
  });

  it("redirect HTTPS same-origin se sigue con la política estricta por defecto", async (t) => {
    if (!localhostResolvesToLoopback) {
      t.skip("localhost no resuelve a 127.0.0.1 en este runner; se omite el caso same-origin");
      return;
    }
    const s = await startTlsServer(
      fixture("TEST-ONLY-localhost-server-key.pem"),
      fixture("TEST-ONLY-localhost-server-cert.pem"),
      (req, res) => {
        const url = new URL(req.url, `https://${req.headers.host}`);
        if (url.pathname === "/redirect") {
          res.writeHead(302, { Location: "/final" });
          res.end();
          return;
        }
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<html><body><p>same-origin-https</p></body></html>");
      }
    );
    try {
      // El subproceso usa allowHttp:false y allowCrossOrigin:false por defecto:
      // un redirect https→https del mismo origin debe pasar la política.
      const child = await runTlsChild({
        NODE_EXTRA_CA_CERTS: `${FIXTURES_DIR}TEST-ONLY-ca-cert.pem`,
        TLS_TEST_URL: `https://localhost:${s.port}/redirect`,
      });
      assert.equal(
        child.code,
        0,
        `el redirect same-origin HTTPS debía seguirse. stdout: ${child.out} stderr: ${child.err}`
      );
      const payload = JSON.parse(child.out);
      assert.equal(payload.ok, true);
      assert.equal(payload.statusCode, 200);
      assert.equal(payload.finalUrl, `https://localhost:${s.port}/final`);
    } finally {
      await stopServer(s.server);
    }
  });

  it("HTTPS→HTTP downgrade rechazado por defecto (0 requests al destino http); --allow-http lo permite", async (t) => {
    if (!localhostResolvesToLoopback) {
      t.skip("localhost no resuelve a 127.0.0.1 en este runner; se omite el caso de downgrade");
      return;
    }
    let httpRequests = 0;
    const httpTarget = await startServer((_req, res) => {
      httpRequests += 1;
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end("<html><body><p>downgraded</p></body></html>");
    });
    const s = await startTlsServer(
      fixture("TEST-ONLY-localhost-server-key.pem"),
      fixture("TEST-ONLY-localhost-server-cert.pem"),
      (_req, res) => {
        res.writeHead(302, { Location: `http://127.0.0.1:${httpTarget.port}/final` });
        res.end();
      }
    );
    try {
      // Política estricta (por defecto): el hop http:// se rechaza antes de
      // conectar; el servidor http no recibe ningún request.
      const child = await runTlsChild({
        NODE_EXTRA_CA_CERTS: `${FIXTURES_DIR}TEST-ONLY-ca-cert.pem`,
        TLS_TEST_URL: `https://localhost:${s.port}/downgrade`,
      });
      assert.equal(
        child.code,
        1,
        `el downgrade debía rechazarse. stdout: ${child.out} stderr: ${child.err}`
      );
      const payload = JSON.parse(child.out);
      assert.ok(
        payload.error.includes("HTTP scheme"),
        `el error debe nombrar el esquema bloqueado, recibí: ${payload.error}`
      );
      assert.equal(httpRequests, 0, "el destino http del downgrade no debe recibir requests");

      // Opt-ins explícitos: el downgrade necesita --allow-http (esquema). En
      // la web real un downgrade https→http del mismo host:port solo necesita
      // --allow-http (la política de origin compara la autoridad, no el
      // esquema); este fixture cambia además host/puerto, así que el caso
      // permitido pasa también --allow-cross-origin. SSRF sigue aplicando.
      const childAllowed = await runTlsChild({
        NODE_EXTRA_CA_CERTS: `${FIXTURES_DIR}TEST-ONLY-ca-cert.pem`,
        TLS_TEST_URL: `https://localhost:${s.port}/downgrade`,
        TLS_TEST_ALLOW_HTTP: "1",
        TLS_TEST_ALLOW_CROSS_ORIGIN: "1",
      });
      assert.equal(
        childAllowed.code,
        0,
        `con los opt-ins el downgrade debía seguirse. stdout: ${childAllowed.out} stderr: ${childAllowed.err}`
      );
      const allowedPayload = JSON.parse(childAllowed.out);
      assert.equal(allowedPayload.ok, true);
      assert.equal(allowedPayload.statusCode, 200);
      assert.equal(
        httpRequests,
        1,
        "con los opt-ins el destino http recibe exactamente un request"
      );
    } finally {
      await stopServer(s.server);
      await stopServer(httpTarget);
    }
  });

  it("redirect HTTPS cross-origin rechazado por defecto (0 requests al segundo origin); el opt-in lo permite", async (t) => {
    if (!localhostResolvesToLoopback) {
      t.skip("localhost no resuelve a 127.0.0.1 en este runner; se omite el caso cross-origin");
      return;
    }
    let crossRequests = 0;
    const target = await startTlsServer(
      fixture("TEST-ONLY-localhost-server-key.pem"),
      fixture("TEST-ONLY-localhost-server-cert.pem"),
      (_req, res) => {
        crossRequests += 1;
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<html><body><p>cross-origin-https</p></body></html>");
      }
    );
    const s = await startTlsServer(
      fixture("TEST-ONLY-localhost-server-key.pem"),
      fixture("TEST-ONLY-localhost-server-cert.pem"),
      (_req, res) => {
        // Puertos distintos ⇒ origins distintos para la política (el origin
        // incluye el puerto). El segundo servidor usa el mismo cert localhost.
        res.writeHead(302, { Location: `https://localhost:${target.port}/final` });
        res.end();
      }
    );
    try {
      const child = await runTlsChild({
        NODE_EXTRA_CA_CERTS: `${FIXTURES_DIR}TEST-ONLY-ca-cert.pem`,
        TLS_TEST_URL: `https://localhost:${s.port}/redirect`,
      });
      assert.equal(
        child.code,
        1,
        `el hop cross-origin debía rechazarse. stdout: ${child.out} stderr: ${child.err}`
      );
      const payload = JSON.parse(child.out);
      assert.ok(
        payload.error.includes("cross-origin"),
        `el error debe nombrar el salto cross-origin, recibí: ${payload.error}`
      );
      assert.equal(crossRequests, 0, "el segundo origin no debe recibir requests");

      const childAllowed = await runTlsChild({
        NODE_EXTRA_CA_CERTS: `${FIXTURES_DIR}TEST-ONLY-ca-cert.pem`,
        TLS_TEST_URL: `https://localhost:${s.port}/redirect`,
        TLS_TEST_ALLOW_CROSS_ORIGIN: "1",
      });
      assert.equal(
        childAllowed.code,
        0,
        `con allowCrossOrigin el hop debía seguirse. stdout: ${childAllowed.out} stderr: ${childAllowed.err}`
      );
      const allowedPayload = JSON.parse(childAllowed.out);
      assert.equal(allowedPayload.statusCode, 200);
      assert.ok(allowedPayload.finalUrl.includes(`:${target.port}/final`));
      assert.equal(crossRequests, 1, "con allowCrossOrigin el segundo origin recibe un request");
    } finally {
      await stopServer(s.server);
      await stopServer(target.server);
    }
  });

  it("fetchRobotsTxt: 404 sobre https bajo política estricta degrada a grupos vacíos sin lanzar", async (t) => {
    if (!localhostResolvesToLoopback) {
      t.skip("localhost no resuelve a 127.0.0.1 en este runner; se omite el caso robots 404");
      return;
    }
    // El servidor responde 404 a /robots.txt. Con la política estricta
    // (allowHttp:false, allowCrossOrigin:false) el hop https del mismo
    // origin pasa la política y el 404 es un fallo HTTP: fetchRobotsTxt
    // debe degradar a grupos vacíos SIN lanzar (la degradación silenciosa
    // queda reservada a los fallos de red/HTTP; los rechazos de política
    // son los que se propagan).
    const s = await startTlsServer(
      fixture("TEST-ONLY-localhost-server-key.pem"),
      fixture("TEST-ONLY-localhost-server-cert.pem"),
      (_req, res) => {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not Found");
      }
    );
    try {
      const child = await runTlsChild({
        NODE_EXTRA_CA_CERTS: `${FIXTURES_DIR}TEST-ONLY-ca-cert.pem`,
        TLS_TEST_ROBOTS_ORIGIN: `https://localhost:${s.port}`,
      });
      assert.equal(
        child.code,
        0,
        `el 404 debía degradar sin lanzar. stdout: ${child.out} stderr: ${child.err}`
      );
      const payload = JSON.parse(child.out);
      assert.equal(payload.ok, true);
      assert.equal(payload.groups, 0, "grupos vacíos por el 404");
    } finally {
      await stopServer(s.server);
    }
  });
});
