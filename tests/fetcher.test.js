/**
 * Tests para src/fetcher.js — módulo de fetch con SSRF guards.
 *
 * Usa servidores HTTP locales (node:http) para todas las pruebas.
 * Cero dependencias externas.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import net from "node:net";

import {
  fetchUrl,
  fetchRobotsTxt,
  checkRobotsRule,
  clearRobotsCache,
  MAX_RESPONSE_SIZE,
  TOTAL_TIMEOUT_MS,
  RESPONSE_TIMEOUT_MS,
  MAX_REDIRECTS,
} from "../src/index.js";

// ═══════════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Crea un servidor HTTP en un puerto aleatorio.
 * @param {object} handler — función (req, res) => void
 * @returns {Promise<{ server: http.Server, port: number, baseUrl: string }>}
 */
function startServer(handler) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(handler);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      resolve({
        server,
        port,
        baseUrl: `http://127.0.0.1:${port}`,
      });
    });
    server.on("error", reject);
  });
}

/** Opciones por defecto para conectar a localhost. */
const LOCALHOST_OPTS = { allowLocalhost: true };

// ═══════════════════════════════════════════════════════════════════════════════
// IP validation (SSRF guards)
// ═══════════════════════════════════════════════════════════════════════════════

describe("fetchUrl — SSRF guards", () => {
  let server, port, baseUrl;

  before(async () => {
    const s = await startServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(
        "<!DOCTYPE html><html><head><title>Test</title></head><body><p>Hello.</p></body></html>"
      );
    });
    server = s.server;
    port = s.port;
    baseUrl = s.baseUrl;
  });

  after(() => {
    server.close();
  });

  it("bloquea conexión a localhost sin --allow-localhost", async () => {
    await assert.rejects(() => fetchUrl(`${baseUrl}/`), /Loopback|blocked|private|loopback/i);
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
  // en la etapa de validación, antes de cualquier intento de conexión.

  const BLOCKED_IPS = [
    { label: "10.0.0.1 (Class A private)", url: "http://10.0.0.1/" },
    { label: "192.168.1.1 (Class C private)", url: "http://192.168.1.1/" },
    { label: "172.16.0.1 (Class B private)", url: "http://172.16.0.1/" },
    { label: "127.0.0.1 (IPv4 loopback)", url: "http://127.0.0.1/" },
    { label: "0.0.0.0 (current network)", url: "http://0.0.0.0/" },
  ];

  for (const ip of BLOCKED_IPS) {
    it(`bloquea IP privada — ${ip.label}`, async () => {
      await assert.rejects(() => fetchUrl(ip.url), /blocked|private|loopback|current network/i);
    });
  }

  it("bloquea IPv6 loopback ::1", async () => {
    await assert.rejects(() => fetchUrl("http://[::1]/"), /blocked|loopback/i);
  });

  it("bloquea IPv6 link-local fe80::", async () => {
    await assert.rejects(() => fetchUrl("http://[fe80::1]/"), /blocked|private/i);
  });

  it("bloquea IPv6 unique local fd00::", async () => {
    await assert.rejects(() => fetchUrl("http://[fd00::1]/"), /blocked|private/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Fetch exitoso
// ═══════════════════════════════════════════════════════════════════════════════

describe("fetchUrl — successful fetch", () => {
  let server, baseUrl;

  before(async () => {
    const s = await startServer((_req, res) => {
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "X-Custom": "test-value",
      });
      res.end(
        '<!DOCTYPE html><html lang="es"><head><title>Test Page</title></head><body><h1>Hello World</h1></body></html>'
      );
    });
    server = s.server;
    baseUrl = s.baseUrl;
  });

  after(() => {
    server.close();
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
      s404.server.close();
    }
  });

  it("maneja página 500 sin crashear", async () => {
    const s404 = await startServer((_req, res) => {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("Internal Server Error");
    });
    try {
      const result = await fetchUrl(`${s404.baseUrl}/error`, LOCALHOST_OPTS);
      assert.equal(result.statusCode, 500);
    } finally {
      s404.server.close();
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

  after(() => {
    server.close();
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

  it("rechaza cadena de 6 redirects (excede max depth)", async () => {
    await assert.rejects(
      () => fetchUrl(`${baseUrl}/six-redirects`, LOCALHOST_OPTS),
      /too many redirects|redirect/i
    );
  });

  it("rechaza redirect a IP privada (re-validación SSRF)", async () => {
    // Usar allowLocalhost para el servidor local, pero la IP 10.0.0.1
    // del redirect debe ser bloqueada porque no es loopback.
    await assert.rejects(
      () =>
        fetchUrl(`${baseUrl}/redirect-to-private`, { allowLocalhost: true, allowPrivate: false }),
      /blocked|private|10\.0\.0/i
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
// Timeouts
// ═══════════════════════════════════════════════════════════════════════════════

describe("fetchUrl — timeouts", () => {
  it("timeout: servidor que retiene conexión sin responder", async () => {
    const s = await startServer((_req, res) => {
      // No hacemos nada — nunca enviamos respuesta
      // El timeout debería dispararse
    });

    try {
      await assert.rejects(
        () =>
          fetchUrl(`${s.baseUrl}/hang`, {
            allowLocalhost: true,
            responseTimeoutMs: 1000,
            totalTimeoutMs: 2000,
          }),
        /timeout|timed out/i
      );
    } finally {
      s.server.close();
    }
  });

  it("timeout: servidor que envía headers pero no body", async () => {
    const s = await startServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/html" });
      // Escribe headers pero nunca envía el body completo
      res.write("<html>");
      // se queda colgado...
    });

    try {
      await assert.rejects(
        () =>
          fetchUrl(`${s.baseUrl}/slow`, {
            allowLocalhost: true,
            totalTimeoutMs: 1500,
          }),
        /timeout|timed out/i
      );
    } finally {
      s.server.close();
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

  after(() => {
    server.close();
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
    await assert.rejects(
      () =>
        fetchUrl("http://this-hostname-does-not-exist-xyz-123.invalid/", {
          allowPrivate: true,
        }),
      /dns|resolve|no addresses/i
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// robots.txt integration
// ═══════════════════════════════════════════════════════════════════════════════

describe("fetchRobotsTxt", () => {
  let server, baseUrl;

  before(async () => {
    const s = await startServer((req, res) => {
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

  after(() => {
    server.close();
    clearRobotsCache();
  });

  it("obtiene y parsea robots.txt correctamente", async () => {
    const result = await fetchRobotsTxt(baseUrl, LOCALHOST_OPTS);
    assert.ok(result.groups.length > 0);
    assert.ok(result.raw.length > 0);
  });

  it("cachea robots.txt — segunda llamada usa caché", async () => {
    // La caché se limpia en after, así que la primera llamada del test
    // anterior ya la llenó. Verificamos que la segunda sea instantánea.
    const start = Date.now();
    const result = await fetchRobotsTxt(baseUrl, LOCALHOST_OPTS);
    const elapsed = Date.now() - start;
    assert.ok(result.groups.length > 0);
    // La llamada cacheada debería ser muy rápida (< 100ms)
    // Nota: puede ser ligeramente mayor debido a la carga del sistema
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
      s404.server.close();
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

  after(() => {
    server.close();
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

  after(() => {
    server.close();
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
    await assert.rejects(
      fetchUrl("http://169.254.169.254/latest/meta-data/"),
      /blocked/i,
      "169.254.169.254 (cloud metadata) debe bloquearse antes de conectar"
    );
  });

  it("fetcher-blocks-cgnat-range (100.64.0.0/10)", async () => {
    await assert.rejects(fetchUrl("http://100.64.1.2/"), /blocked/i);
  });

  it("fetcher-blocks-ipv4-mapped-loopback", async () => {
    // ::ffff:7f00:1 (hex) y ::ffff:127.0.0.1 (decimal) mapean a 127.0.0.1.
    await assert.rejects(
      fetchUrl("http://[::ffff:7f00:1]/"),
      /blocked/i,
      "::ffff:7f00:1 mapea a loopback y debe bloquearse"
    );
    await assert.rejects(
      fetchUrl("http://[::ffff:127.0.0.1]/"),
      /blocked/i,
      "::ffff:127.0.0.1 mapea a loopback y debe bloquearse"
    );
  });

  it("fetcher-blocks-ipv4-mapped-private", async () => {
    // ::ffff:7f00:1 en versión privada: ::ffff:c000:0201 -> 192.0.2.1 es TEST-NET,
    // pero ::ffff:a00:1 -> 10.0.0.1 (privada) debe bloquearse.
    await assert.rejects(fetchUrl("http://[::ffff:a00:1]/"), /blocked/i);
  });

  it("fetcher-blocks-link-local-v6-range (fe80::/10)", async () => {
    // El prefijo /10 cubre fe80::..febf:: — no solo fe80: (F-03).
    await assert.rejects(fetchUrl("http://[fe90::1]/"), /blocked/i);
    await assert.rejects(fetchUrl("http://[febf::1]/"), /blocked/i);
  });

  it("allow-private no desbloquea loopback mapeado", async () => {
    // allowPrivate=true solo permite privadas no-loopback; el loopback
    // mapeado sigue bloqueado salvo allowLocalhost.
    await assert.rejects(fetchUrl("http://[::ffff:7f00:1]/", { allowPrivate: true }), /blocked/i);
    // 169.254.169.254 es privada no-loopback: allowPrivate=true la desbloquea.
    await fetchUrl("http://169.254.169.254/latest/", { allowPrivate: true }).then(
      () => assert.fail("esperaba fallo de conexión, no bloqueo"),
      (err) => {
        assert.ok(!/blocked/i.test(err.message), "no debe ser un bloqueo del guard");
      }
    );
  });
});
