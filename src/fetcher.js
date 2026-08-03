/**
 * Fetch module — única puerta de acceso a red para `geo-opt technical`.
 *
 * Implementa el threat model de la security architecture review 2026-06-28:
 * mitigación de DNS rebinding, bloqueo de IPs privadas, límites de timeout,
 * tamaño de respuesta y rate limiting.
 *
 * Solo usa built-ins de Node.js 22+. Cero dependencias externas.
 *
 * @module fetcher
 */

import dns from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import tls from "node:tls";
import net from "node:net";

import { parseRobotsGroups } from "./robots.js";

// ═══════════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════════

export const USER_AGENT = "geo-opt/2.0.0 (+https://github.com/cortega26/geo-opt) Technical Audit";

export const RESPONSE_TIMEOUT_MS = 15_000;
export const TOTAL_TIMEOUT_MS = 30_000;
export const MAX_RESPONSE_SIZE = 2_097_152; // 2 MB
export const MAX_REDIRECTS = 5;

/** Máximo de conexiones simultáneas al mismo origin. */
const MAX_HOST_CONCURRENT = 2;

/** Máximo total de conexiones simultáneas. */
const MAX_GLOBAL_CONCURRENT = 10;

// ═══════════════════════════════════════════════════════════════════════════════
// Semaphore (rate limiting)
// ═══════════════════════════════════════════════════════════════════════════════

class Semaphore {
  constructor(max) {
    this.max = max;
    this.current = 0;
    this.queue = [];
  }

  acquire() {
    if (this.current < this.max) {
      this.current += 1;
      return Promise.resolve();
    }
    return new Promise((resolve) => this.queue.push(resolve));
  }

  release() {
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      next();
    } else {
      this.current -= 1;
    }
  }
}

const globalSemaphore = new Semaphore(MAX_GLOBAL_CONCURRENT);
const hostSemaphores = new Map(); // origin -> Semaphore

function hostSemaphoreFor(origin) {
  let sem = hostSemaphores.get(origin);
  if (!sem) {
    sem = new Semaphore(MAX_HOST_CONCURRENT);
    hostSemaphores.set(origin, sem);
  }
  return sem;
}

// ═══════════════════════════════════════════════════════════════════════════════
// IP validation (SSRF guards)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Verifica si una dirección IPv4 es privada o de loopback.
 * @param {string} ip
 * @returns {boolean}
 */
function isPrivateIPv4(ip) {
  const parts = ip.split(".");
  if (parts.length !== 4) return false;
  const octets = parts.map(Number);
  if (octets.some((o) => isNaN(o) || o < 0 || o > 255)) return false;

  // 10.0.0.0/8
  if (octets[0] === 10) return true;
  // 172.16.0.0/12
  if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) return true;
  // 192.168.0.0/16
  if (octets[0] === 192 && octets[1] === 168) return true;
  // 127.0.0.0/8 (loopback)
  if (octets[0] === 127) return true;
  // 0.0.0.0/8 (current network)
  if (octets[0] === 0) return true;
  // 169.254.0.0/16 (link-local, cloud metadata service) — audit F-02
  if (octets[0] === 169 && octets[1] === 254) return true;
  // 100.64.0.0/10 (CGNAT) — defensa en profundidad, audit F-02
  if (octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127) return true;

  return false;
}

/**
 * Convierte dos hextets hexadecimales (::ffff:h1:h2) a su IPv4 subyacente.
 * @param {string} hiHex
 * @param {string} loHex
 * @returns {string|null}
 */
function ipv4FromHexHextets(hiHex, loHex) {
  const hi = parseInt(hiHex, 16);
  const lo = parseInt(loHex, 16);
  if (!Number.isFinite(hi) || !Number.isFinite(lo)) return null;
  return `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`;
}

/**
 * Normaliza una dirección IPv6 mapeada a IPv4 (::ffff:a.b.c.d o
 * ::ffff:7f00:1) a su IPv4 subyacente. Retorna null si no aplica.
 * Cubre las formas compactas y expandidas (0:0:0:0:0:ffff:...).
 * @param {string} ip
 * @returns {string|null}
 */
function normalizeIpv4Mapped(ip) {
  const normalized = ip.toLowerCase();

  // Formas compactas: ::ffff:7f00:1 y ::ffff:127.0.0.1
  const compactHex = normalized.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (compactHex) return ipv4FromHexHextets(compactHex[1], compactHex[2]);
  const compactDecimal = normalized.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (compactDecimal) return compactDecimal[1];

  // Formas expandidas: 0:0:0:0:0:ffff:7f00:1 y 0:0:0:0:0:ffff:a.b.c.d
  const fullHex = normalized.match(/^0{1,4}(?::0{1,4}){4}:ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (fullHex) return ipv4FromHexHextets(fullHex[1], fullHex[2]);
  const fullDecimal = normalized.match(
    /^0{1,4}(?::0{1,4}){4}:ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/
  );
  if (fullDecimal) return fullDecimal[1];

  return null;
}

/**
 * Verifica si una dirección IPv4 es de loopback.
 * @param {string} ip
 * @returns {boolean}
 */
function isLoopbackIPv4(ip) {
  const parts = ip.split(".");
  if (parts.length !== 4) return false;
  const first = parseInt(parts[0], 10);
  return first === 127;
}

/**
 * Verifica si una dirección IPv6 es privada o de loopback.
 * @param {string} ip
 * @returns {boolean}
 */
function isPrivateIPv6(ip) {
  // IPv4-mapped IPv6 (::ffff:a.b.c.d): revalidar la IPv4 subyacente (F-03).
  const mapped = normalizeIpv4Mapped(ip);
  if (mapped !== null) return isPrivateIPv4(mapped);

  const normalized = ip.toLowerCase();
  // ::1 (loopback)
  if (normalized === "::1" || normalized === "0:0:0:0:0:0:0:1") return true;
  // fe80::/10 (link-local): primer hextet en 0xfe80..0xfebf (F-03)
  const firstHextet = parseInt(normalized.split(":")[0], 16);
  if (!Number.isNaN(firstHextet) && firstHextet >= 0xfe80 && firstHextet <= 0xfebf) {
    return true;
  }
  // fd00::/8 (unique local addresses)
  if (normalized.startsWith("fd")) return true;
  // fc00::/8 (unique local addresses, reserved)
  if (normalized.startsWith("fc")) return true;
  return false;
}

/**
 * Verifica si una dirección IPv6 es de loopback.
 * @param {string} ip
 * @returns {boolean}
 */
function isLoopbackIPv6(ip) {
  const normalized = ip.toLowerCase();
  return normalized === "::1" || normalized === "0:0:0:0:0:0:0:1";
}

/**
 * Determina si una IP está bloqueada según las políticas SSRF actuales.
 *
 * @param {string} ip — dirección IPv4 o IPv6
 * @param {boolean} allowPrivate — si es true, permite IPs privadas (no loopback)
 * @param {boolean} allowLocalhost — si es true, permite loopback
 * @returns {{ blocked: boolean, reason?: string }}
 */
function checkIp(ip, allowPrivate, allowLocalhost) {
  // IPv4-mapped IPv6 (::ffff:7f00:1, ::ffff:127.0.0.1): validar la IPv4
  // subyacente — cierra el hueco de la rama IPv4 cuando la forma lleva "."
  // (F-03).
  const mapped = normalizeIpv4Mapped(ip);
  if (mapped !== null) {
    return checkIp(mapped, allowPrivate, allowLocalhost);
  }

  // Detectar si es IPv4 o IPv6
  if (ip.includes(".")) {
    // IPv4
    const isPrivate = isPrivateIPv4(ip);
    const isLoopback = isLoopbackIPv4(ip);

    if (isLoopback && !allowLocalhost) {
      return { blocked: true, reason: `Loopback IPv4 blocked: ${ip}` };
    }
    // Bloquear IPs privadas que NO son loopback a menos que allowPrivate esté activo.
    // allowLocalhost solo desbloquea loopback, no el resto de IPs privadas.
    if (isPrivate && !isLoopback && !allowPrivate) {
      return { blocked: true, reason: `Private IPv4 blocked: ${ip}` };
    }
  } else {
    // IPv6
    const isPrivate = isPrivateIPv6(ip);
    const isLoopback = isLoopbackIPv6(ip);

    if (isLoopback && !allowLocalhost) {
      return { blocked: true, reason: `Loopback IPv6 blocked: ${ip}` };
    }
    if (isPrivate && !isLoopback && !allowPrivate) {
      return { blocked: true, reason: `Private IPv6 blocked: ${ip}` };
    }
  }

  return { blocked: false };
}

/**
 * Resuelve un hostname a direcciones IP, validando cada una contra las
 * políticas SSRF. Retorna la primera IP que pasa los checks.
 *
 * @param {string} hostname
 * @param {boolean} allowPrivate
 * @param {boolean} allowLocalhost
 * @returns {Promise<{ address: string, family: 4|6 }>}
 * @throws {Error} si no se encuentra ninguna IP válida
 */
/**
 * Detecta si un string es una dirección IP literal.
 * @param {string} hostname
 * @returns {{ isIp: boolean, family: 4|6|null, address: string }}
 */
function detectIpLiteral(hostname) {
  // Node.js 22+ URL parser devuelve direcciones IPv6 con brackets ([::1]).
  // Los quitamos primero para unificar la detección.
  const isBracketed = hostname.startsWith("[") && hostname.endsWith("]");
  const raw = isBracketed ? hostname.slice(1, -1) : hostname;

  // IPv4: cuatro octetos decimales
  const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const v4Match = raw.match(ipv4Regex);
  if (v4Match) {
    const octets = [v4Match[1], v4Match[2], v4Match[3], v4Match[4]].map(Number);
    if (octets.every((o) => o >= 0 && o <= 255)) {
      return { isIp: true, family: 4, address: raw };
    }
  }

  // IPv6: contiene ":" y caracteres hexadecimales
  const ipv6Regex = /^[0-9a-fA-F:]+$/;
  if (raw.includes(":") && ipv6Regex.test(raw)) {
    try {
      // Normalizar con la clase URL (convierte ::1, etc.)
      const testUrl = new URL(`http://[${raw}]:80/`);
      const normalized = testUrl.hostname.replace(/^\[|\]$/g, "");
      return { isIp: true, family: 6, address: normalized };
    } catch {
      return { isIp: false, family: null, address: hostname };
    }
  }

  return { isIp: false, family: null, address: hostname };
}

async function resolveAndValidateHost(hostname, allowPrivate, allowLocalhost) {
  // Verificar si ya es una IP literal
  const literal = detectIpLiteral(hostname);
  if (literal.isIp) {
    const result = checkIp(literal.address, allowPrivate, allowLocalhost);
    if (result.blocked) {
      throw new Error(result.reason);
    }
    return { address: literal.address, family: literal.family };
  }

  // Resolución DNS para hostnames
  let v4Addresses = [];
  let v6Addresses = [];

  try {
    v4Addresses = await dns.resolve4(hostname);
  } catch {
    // Sin registros A — normal para hosts IPv6-only
  }

  try {
    v6Addresses = await dns.resolve6(hostname);
  } catch {
    // Sin registros AAAA — normal para hosts IPv4-only
  }

  const allAddresses = [
    ...v4Addresses.map((a) => ({ address: a, family: 4 })),
    ...v6Addresses.map((a) => ({ address: a, family: 6 })),
  ];

  if (allAddresses.length === 0) {
    throw new Error(`DNS resolution failed: no addresses found for ${hostname}`);
  }

  // Filtrar IPs bloqueadas
  const allowed = allAddresses.filter(
    ({ address }) => !checkIp(address, allowPrivate, allowLocalhost).blocked
  );

  if (allowed.length === 0) {
    const blockedReasons = allAddresses.map(
      ({ address }) => checkIp(address, allowPrivate, allowLocalhost).reason
    );
    throw new Error(`All resolved IPs for ${hostname} are blocked: ${blockedReasons.join("; ")}`);
  }

  // Preferir IPv4 si está disponible
  const preferred = allowed.find((a) => a.family === 4) || allowed[0];
  return preferred;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Hop scheme & origin policy (Plan 075)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Política de esquema y origin aplicada a CADA hop de red (URL raíz, destino
 * de cada redirect, robots.txt, sub-sitemaps y páginas descubiertas) ANTES
 * de cualquier resolución DNS o conexión.
 *
 * Dos dimensiones independientes:
 *  - Esquema: por defecto solo https: (allowHttp abre http:).
 *  - Origin: si rootOrigin está definido, todos los hops deben mantener la
 *    autoridad (host:port) de ese root salvo allowCrossOrigin. La
 *    comparación es por autoridad y NO incluye el esquema: un downgrade
 *    https→http del mismo host:port es el mismo sitio y su único opt-in es
 *    allowHttp; un cambio de host o de puerto es un salto cross-origin y
 *    necesita allowCrossOrigin.
 *
 * Los rechazos nombran la clase de hop rechazada (downgrade HTTP o salto
 * cross-origin) sin volcar la URL completa (path/query) al mensaje.
 *
 * @param {URL} parsed — URL del hop ya parseada (valida el caller)
 * @param {object} policy
 * @param {boolean} [policy.allowHttp=false] — permite el esquema http:
 * @param {boolean} [policy.allowCrossOrigin=false] — permite hops fuera del root origin
 * @param {string|null} [policy.rootOrigin=null] — origin raíz de la auditoría; null = sin restricción
 * @returns {{ blocked: boolean, reason?: string }}
 */
function checkHopPolicy(
  parsed,
  { allowHttp = false, allowCrossOrigin = false, rootOrigin = null } = {}
) {
  if (!allowHttp && parsed.protocol !== "https:") {
    return {
      blocked: true,
      reason: `Hop policy: HTTP scheme blocked for ${parsed.host} — use --allow-http`,
    };
  }
  if (rootOrigin && !allowCrossOrigin) {
    let rootHost = null;
    try {
      rootHost = new URL(rootOrigin).host;
    } catch {
      // rootOrigin malformado: fail-closed, el hop no sale del root.
      rootHost = rootOrigin;
    }
    if (parsed.host !== rootHost) {
      return {
        blocked: true,
        reason: `Hop policy: cross-origin blocked for ${parsed.host} (root ${rootHost}) — use --allow-cross-origin`,
      };
    }
  }
  return { blocked: false };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Custom agents (DNS rebinding mitigation)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Crea un https.Agent que se conecta a `resolvedIp` pero envía
 * `servername` (SNI) y `Host` header con el hostname original.
 *
 * Esto mitiga DNS rebinding: el atacante no puede cambiar el registro DNS
 * entre la resolución y la conexión porque ya estamos conectados a la IP
 * que verificamos.
 *
 * @param {string} hostname — nombre original (para SNI)
 * @param {string} resolvedIp — IP verificada
 * @param {number} port
 * @returns {https.Agent}
 */
function createSecureAgent(hostname, resolvedIp, port) {
  return new https.Agent({
    createConnection: (options, cb) => {
      const tlsOpts = {
        host: resolvedIp,
        port: port || 443,
        servername: hostname,
        rejectUnauthorized: true,
      };
      const socket = tls.connect(tlsOpts);
      socket.on("secureConnect", () => cb(null, socket));
      socket.on("error", cb);
    },
  });
}

/**
 * Crea un http.Agent que se conecta a `resolvedIp` pero envía
 * `Host` header con el hostname original.
 *
 * @param {string} hostname — nombre original (para Host header)
 * @param {string} resolvedIp — IP verificada
 * @param {number} port
 * @returns {http.Agent}
 */
function createPlainAgent(hostname, resolvedIp, port) {
  return new http.Agent({
    createConnection: (_options, cb) => {
      return net.createConnection({ host: resolvedIp, port: port || 80 }, cb);
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// HTTP request with timeouts, size limits, and redirect tracking
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Realiza un request HTTP(S) con timeouts, control de tamaño y seguimiento
 * de redirects. Cada redirect se re-valida contra los SSRF guards y contra la
 * política de esquema/origin (Plan 075) antes de conectar.
 *
 * @param {string} url — URL absoluta
 * @param {object} options
 * @param {number} [options.redirectDepth] — profundidad de redirect actual
 * @param {boolean} [options.allowPrivate]
 * @param {boolean} [options.allowLocalhost]
 * @param {boolean} [options.allowHttp=true] — permite hops http: (CLI: solo con --allow-http)
 * @param {boolean} [options.allowCrossOrigin=true] — permite hops fuera del root origin
 * @param {string|null} [options.rootOrigin] — origin raíz que deben respetar todos los hops
 * @param {number} [options.totalTimeoutMs] — presupuesto total de la transacción
 * @param {number} [options.deadlineMs] — fecha límite absoluta compartida por
 *   todos los hops (Plan 077); si se omite, se deriva de totalTimeoutMs
 * @param {number} [options.responseTimeoutMs]
 * @param {number} [options.maxResponseSize]
 * @param {number} [options.maxRedirects]
 * @returns {Promise<{ html: string, statusCode: number, finalUrl: string, headers: object }>}
 */
async function performRequest(url, options = {}) {
  const {
    redirectDepth = 0,
    allowPrivate = false,
    allowLocalhost = false,
    allowHttp = true,
    allowCrossOrigin = true,
    rootOrigin = null,
    totalTimeoutMs = TOTAL_TIMEOUT_MS,
    deadlineMs = null,
    responseTimeoutMs = RESPONSE_TIMEOUT_MS,
    maxResponseSize = MAX_RESPONSE_SIZE,
    maxRedirects = MAX_REDIRECTS,
  } = options;

  const parsed = new URL(url);
  const hostname = parsed.hostname;
  const port = parsed.port || (parsed.protocol === "https:" ? 443 : 80);
  const isHttps = parsed.protocol === "https:";

  // Política de esquema/origin: el rechazo ocurre aquí, antes de DNS y
  // conexión, para la URL raíz y para cada destino de redirect (la
  // recursión de redirects vuelve a pasar por esta función). El código
  // estable ERR_HOP_POLICY permite a los llamadores distinguir un rechazo
  // de política (que debe propagarse) de un fallo de red/HTTP (que puede
  // degradarse, p. ej. en fetchRobotsTxt).
  const hopPolicy = checkHopPolicy(parsed, { allowHttp, allowCrossOrigin, rootOrigin });
  if (hopPolicy.blocked) {
    const err = new Error(hopPolicy.reason);
    err.code = "ERR_HOP_POLICY";
    throw err;
  }

  // 1. Fecha límite compartida (Plan 077): una sola transacción pública
  //    (fetchUrl) tiene un solo presupuesto total a través de TODOS los
  //    hops. Cada recursión de redirect recibe la misma deadlineMs absoluta
  //    y arma su timer con el tiempo restante — el presupuesto NO se
  //    renueva por hop. Si el presupuesto ya se agotó, abortar de inmediato
  //    sin resolver ni conectar.
  const deadline = deadlineMs ?? Date.now() + totalTimeoutMs;
  const remaining = deadline - Date.now();
  if (remaining <= 0) {
    throw new Error(`Request total timeout after ${totalTimeoutMs}ms`);
  }

  // 2. Timer total: se arma ANTES de resolver DNS y conectar para que la
  //    fecha límite cubra también esas fases; si dispara durante la
  //    resolución, el check posterior cierra la transacción en cuanto esta
  //    termine. El timeout de respuesta (post-conexión) queda subordinado
  //    por construcción: este timer dispara antes cuando el tiempo restante
  //    es menor que responseTimeoutMs.
  const totalController = new globalThis.AbortController();
  const totalTimer = setTimeout(() => {
    totalController.abort();
  }, remaining);

  // 3. Resolver y validar IP
  let resolvedIp;
  try {
    ({ address: resolvedIp } = await resolveAndValidateHost(
      hostname,
      allowPrivate,
      allowLocalhost
    ));
  } catch (error) {
    clearTimeout(totalTimer);
    throw error;
  }

  // El presupuesto se agotó mientras se resolvía el host: el timer ya
  // abortó el controller; cerrar con el error de timeout total.
  if (totalController.signal.aborted) {
    clearTimeout(totalTimer);
    throw new Error(`Request total timeout after ${totalTimeoutMs}ms`);
  }

  // 4. Crear agente con IP pre-resuelta (mitigación de DNS rebinding)
  const agent = isHttps
    ? createSecureAgent(hostname, resolvedIp, port)
    : createPlainAgent(hostname, resolvedIp, port);

  const httpMod = isHttps ? https : http;

  let responseTimer;

  return new Promise((resolve, reject) => {
    const req = httpMod.request(
      {
        // Conectar a la IP ya validada (resolvedIp) y no al hostname original:
        // para literales IPv6 parsed.hostname trae brackets ("[::1]") y
        // getaddrinfo falla con ENOTFOUND; para hostnames se elimina la segunda
        // resolución (refuerza la mitigación de DNS rebinding).
        hostname: resolvedIp,
        port,
        path: parsed.pathname + parsed.search,
        method: "GET",
        agent,
        signal: totalController.signal,
        // Si Node omite el agente custom (hostname literal), el SNI debe seguir
        // siendo el nombre original; el agente ya lo fija en tls.connect.
        ...(isHttps ? { servername: hostname } : {}),
        headers: {
          "User-Agent": USER_AGENT,
          Host: parsed.host,
          Accept: "text/html, application/xhtml+xml, application/xml;q=0.9, */*;q=0.8",
        },
      },
      (res) => {
        // Primer byte recibido — limpiar timeout de respuesta
        clearTimeout(responseTimer);

        const { statusCode, headers } = res;

        // Seguir redirects con re-validación SSRF
        if ([301, 302, 303, 307, 308].includes(statusCode) && headers.location) {
          // Consumir el body del redirect antes de seguir
          res.resume();

          if (redirectDepth >= maxRedirects) {
            clearTimeout(totalTimer);
            reject(new Error(`Too many redirects (max ${maxRedirects}) for ${url}`));
            return;
          }

          // Resolver la URL de destino relativa a la original
          let redirectUrl;
          try {
            redirectUrl = new URL(headers.location, url).href;
          } catch {
            clearTimeout(totalTimer);
            reject(new Error(`Invalid redirect location: ${headers.location}`));
            return;
          }

          // Validar que el destino sea http(s)
          const redirectParsed = new URL(redirectUrl);
          if (!["http:", "https:"].includes(redirectParsed.protocol)) {
            clearTimeout(totalTimer);
            reject(new Error(`Redirect to unsupported protocol: ${redirectParsed.protocol}`));
            return;
          }

          clearTimeout(totalTimer);
          // Re-validar el destino del redirect contra SSRF guards. La
          // recursión hereda la MISMA fecha límite absoluta (deadlineMs vía
          // ...options) y arma un timer con el tiempo restante — el
          // presupuesto total no se renueva por hop (Plan 077).
          performRequest(redirectUrl, {
            ...options,
            redirectDepth: redirectDepth + 1,
          })
            .then(resolve)
            .catch(reject);
          return;
        }

        // Leer body con control de tamaño
        const chunks = [];
        let totalBytes = 0;

        res.on("data", (chunk) => {
          totalBytes += chunk.length;
          if (totalBytes > maxResponseSize) {
            req.destroy(new Error(`Response size ${totalBytes} exceeds limit ${maxResponseSize}`));
            return;
          }
          chunks.push(chunk);
        });

        res.on("end", () => {
          clearTimeout(totalTimer);
          const html = Buffer.concat(chunks).toString("utf8");
          resolve({
            html,
            statusCode,
            finalUrl: url,
            headers: Object.fromEntries(
              Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])
            ),
          });
        });

        res.on("error", (err) => {
          clearTimeout(totalTimer);
          reject(err);
        });
      }
    );

    // Timeout de respuesta: empieza cuando el socket se conecta
    req.on("socket", (socket) => {
      socket.on("connect", () => {
        responseTimer = setTimeout(() => {
          req.destroy(
            new Error(`Response timeout: no data received within ${responseTimeoutMs}ms`)
          );
        }, responseTimeoutMs);
      });
    });

    req.on("error", (err) => {
      clearTimeout(totalTimer);
      clearTimeout(responseTimer);
      // No rechazar si ya fue abortado por timeout
      if (totalController.signal.aborted) {
        reject(new Error(`Request total timeout after ${totalTimeoutMs}ms`));
        return;
      }
      reject(err);
    });

    req.on("timeout", () => {
      req.destroy(new Error(`Request timed out after ${totalTimeoutMs}ms`));
    });

    req.end();
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Robots.txt integration
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Cache de robots.txt por origin para evitar fetches repetidos.
 * @type {Map<string, { groups: Array, fetchedAt: number }>}
 */
const robotsCache = new Map();

/**
 * Obtiene y parsea el robots.txt de un origin.
 *
 * Degradación: si el robots.txt no se puede obtener por un fallo de
 * red/HTTP (404, DNS, timeout), asumimos acceso total y retornamos grupos
 * vacíos. Los rechazos de la POLÍTICA de esquema/origin (Plan 075) NO se
 * degradan: se propagan con error.code === "ERR_HOP_POLICY" para que el
 * llamador pueda avisar (el CLI lo reporta como warning) y reintentar con
 * el opt-in correspondiente. El resultado vacío no se cachea en ese caso:
 * un reintento con el opt-in debe fetchear fresco.
 *
 * @param {string} origin — e.g. "https://example.com"
 * @param {object} options — opciones de fetch
 * @returns {Promise<{ groups: Array, raw: string }>}
 * @throws {Error} con code "ERR_HOP_POLICY" si la política bloquea el hop
 */
export async function fetchRobotsTxt(origin, options = {}) {
  const cached = robotsCache.get(origin);
  if (cached) {
    return cached;
  }

  const robotsUrl = `${origin.replace(/\/+$/, "")}/robots.txt`;

  let result;
  try {
    result = await fetchUrl(robotsUrl, options);
  } catch (error) {
    // Degradación silenciosa SOLO para fallos de red/HTTP. Un rechazo de
    // política tragado haría indistinguible un robots.txt bloqueado de uno
    // inexistente — el bug que este fix cierra — así que se propaga sin
    // cachear el resultado vacío.
    if (error?.code === "ERR_HOP_POLICY") {
      throw error;
    }
    const empty = { groups: [], raw: "" };
    robotsCache.set(origin, empty);
    return empty;
  }

  const groups = parseRobotsGroups(result.html);
  const entry = { groups, raw: result.html };
  robotsCache.set(origin, entry);
  return entry;
}

/**
 * Verifica si una URL está bloqueada por las reglas de robots.txt.
 *
 * Reimplementa la lógica de selección de grupo y matching de path
 * de src/robots.js para evitar dependencia circular.
 *
 * @param {string} url — URL absoluta a verificar
 * @param {Array} groups — resultado de parseRobotsGroups()
 * @param {string} userAgent — user-agent contra el que verificar
 * @returns {{ allowed: boolean, matchedRule: { directive: string, path: string } | null }}
 */
export function checkRobotsRule(url, groups, userAgent) {
  if (!groups || groups.length === 0) {
    return { allowed: true, matchedRule: null };
  }

  let targetPath;
  try {
    targetPath = new URL(url).pathname || "/";
  } catch {
    return { allowed: true, matchedRule: null };
  }

  // Seleccionar el grupo más específico que aplique al user-agent
  let selectedGroup = null;
  let selectedLength = -1;

  for (const group of groups) {
    for (const agent of group.agents) {
      const applies = agent === "*" || userAgent.toLowerCase().includes(agent.toLowerCase());
      if (applies && agent.length > selectedLength) {
        selectedGroup = group;
        selectedLength = agent.length;
      }
    }
  }

  if (!selectedGroup) {
    return { allowed: true, matchedRule: null };
  }

  // Verificar reglas del grupo seleccionado
  let strongestRule = null;
  for (const rule of selectedGroup.rules) {
    const escaped = rule.path
      .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
      .replaceAll("*", ".*")
      .replace(/\\\$$/, "$");
    const regex = new RegExp(`^${escaped}`);
    if (regex.test(targetPath)) {
      if (
        !strongestRule ||
        rule.path.length > strongestRule.path.length ||
        (rule.path.length === strongestRule.path.length && rule.directive === "allow")
      ) {
        strongestRule = rule;
      }
    }
  }

  return {
    allowed: strongestRule?.directive !== "disallow",
    matchedRule: strongestRule,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Fetch público con rate limiting, SSRF guards y política de esquema/origin
 * (Plan 075).
 *
 * Compatibilidad de la librería: los valores por defecto mantienen el
 * comportamiento histórico (http: permitido, hops cross-origin permitidos).
 * El CLI remoto pasa los valores estrictos: allowHttp=false y
 * allowCrossOrigin=false para que TODOS los hops (raíz, redirects, robots,
 * sub-sitemaps, páginas) respeten el mismo policy.
 *
 * @param {string} url — URL absoluta (http: o https:)
 * @param {object} [options]
 * @param {boolean} [options.allowPrivate=false] — permite IPs privadas
 * @param {boolean} [options.allowLocalhost=false] — permite loopback
 * @param {boolean} [options.allowHttp=true] — permite el esquema http: (por defecto, compat)
 * @param {boolean} [options.allowCrossOrigin=true] — permite hops fuera del root origin (por defecto, compat)
 * @param {string|null} [options.rootOrigin=null] — origin raíz; si se omite, el de esta URL
 * @param {number} [options.timeoutMs=TOTAL_TIMEOUT_MS] — timeout total de la
 *   transacción completa (DNS, redirects y body) con UNA fecha límite
 *   compartida entre todos los hops
 * @param {number} [options.maxSize=MAX_RESPONSE_SIZE] — tamaño máximo de respuesta
 * @param {string} [options.userAgent=USER_AGENT] — User-Agent header
 * @returns {Promise<{ html: string, statusCode: number, finalUrl: string, headers: object }>}
 */
export async function fetchUrl(url, options = {}) {
  const {
    allowPrivate = false,
    allowLocalhost = false,
    allowHttp = true,
    allowCrossOrigin = true,
    rootOrigin = null,
    timeoutMs = TOTAL_TIMEOUT_MS,
    maxSize = MAX_RESPONSE_SIZE,
  } = options;

  // Validar esquema
  let parsed;
  try {
    parsed = new URL(url);
  } catch (e) {
    throw new Error(`Invalid URL "${url}": ${e.message}`, { cause: e });
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error(
      `Unsupported protocol "${parsed.protocol}". Only http: and https: are allowed.`
    );
  }

  const origin = parsed.origin;
  // El root de esta cadena de hops es esta misma URL salvo que el llamador
  // imponga otro (p. ej. el origin del sitemap raíz para páginas y
  // sub-sitemaps descubiertos).
  const effectiveRootOrigin = rootOrigin ?? origin;

  // Fecha límite única de la transacción (Plan 077): se calcula al entrar
  // (antes de adquirir slots de rate limiting, que también consumen
  // presupuesto) y se propaga a cada hop de redirect vía performRequest.
  const deadlineMs = Date.now() + timeoutMs;

  // Rate limiting: adquirir slots
  await hostSemaphoreFor(origin).acquire();
  await globalSemaphore.acquire();

  try {
    const result = await performRequest(url, {
      allowPrivate,
      allowLocalhost,
      allowHttp,
      allowCrossOrigin,
      rootOrigin: effectiveRootOrigin,
      totalTimeoutMs: timeoutMs,
      deadlineMs,
      maxResponseSize: maxSize,
    });
    return result;
  } finally {
    hostSemaphoreFor(origin).release();
    globalSemaphore.release();
  }
}

/**
 * Limpia la caché de robots.txt (útil para tests).
 */
export function clearRobotsCache() {
  robotsCache.clear();
}
