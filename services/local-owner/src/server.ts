import { randomBytes, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { performance } from "node:perf_hooks";
import type { AddressInfo } from "node:net";
import { validateOwnerObservation, type OwnerObservation } from "./observation.js";
import { ownerPage, OWNER_PAGE_CSS, OWNER_PAGE_JS, OWNER_ENTRY_HTML } from "./page.js";

export const LOCAL_OWNER_LIMITS = Object.freeze({ lifetimeMs: 300_000, requests: 128, headerBytes: 8192, connections: 16 });
export const OWNER_LOCAL_RESPONSE_HEADERS = Object.freeze({ "cache-control": "no-store", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer",
  "cross-origin-resource-policy": "same-origin", "x-frame-options": "DENY",
  "content-security-policy": "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'" });

export function validateOwnerLocalRequest(request: Pick<IncomingMessage, "method" | "url" | "headers" | "rawHeaders">, origin: string): string {
  const target = new URL(origin), h = request.headers;
  if (target.protocol !== "http:" || target.hostname !== "127.0.0.1" || target.origin !== origin || h.host !== target.host) throw Error("OWNER_LOCAL_HOST_REJECTED");
  if (h.origin !== undefined && h.origin !== origin) throw Error("OWNER_LOCAL_ORIGIN_REJECTED");
  if (["authorization", "cookie", "x-amz-security-token", "x-amz-credential"].some(key => h[key] !== undefined)) throw Error("OWNER_LOCAL_CREDENTIALS_REJECTED");
  if (["transfer-encoding", "expect"].some(key => h[key] !== undefined) ||
      h["content-length"] !== undefined && h["content-length"] !== "0") throw Error("OWNER_LOCAL_BODY_REJECTED");
  const names = request.rawHeaders.filter((_, index) => index % 2 === 0).map(name => name.toLowerCase());
  if (request.rawHeaders.length % 2 || new Set(names).size !== names.length) throw Error("OWNER_LOCAL_HEADERS_REJECTED");
  const site = h["sec-fetch-site"], mode = h["sec-fetch-mode"], dest = h["sec-fetch-dest"];
  if (request.method === "GET" && request.url === "/") {
    if (!["none", "same-origin"].includes(String(site))) {
      const kind = site === undefined ? "MISSING" : site === "cross-site" ? "CROSS_SITE" : site === "same-site" ? "SAME_SITE" : "UNKNOWN";
      throw Error(`OWNER_LOCAL_SITE_${kind}_REJECTED`);
    }
    if (mode !== "navigate") throw Error("OWNER_LOCAL_MODE_REJECTED");
    if (dest !== "document") throw Error("OWNER_LOCAL_DESTINATION_REJECTED");
    return "/";
  }
  if (request.method === "GET" && site === "same-origin" && mode === "no-cors" &&
      (request.url === "/owner.js" && dest === "script" || request.url === "/owner.css" && dest === "style")) return request.url;
  if (request.method === "POST" && request.url === "/bridge/observation" && h.origin === origin && site === "same-origin" && mode === "cors" && dest === "empty") return request.url;
  throw Error("OWNER_LOCAL_REQUEST_REJECTED");
}

/** Accepts only a copied observation: no transport, filesystem, credential or SDK
 * dependency can be reached from an HTTP request. Port zero is for tests only. */
export async function startOwnerObservationServer(input: OwnerObservation, port = 4175, lifetimeMs: number = LOCAL_OWNER_LIMITS.lifetimeMs) {
  if (![0, 4175].includes(port) || !Number.isSafeInteger(lifetimeMs) || lifetimeMs < 1 || lifetimeMs > LOCAL_OWNER_LIMITS.lifetimeMs) throw Error("OWNER_LOCAL_OPTIONS_REJECTED");
  let observation: OwnerObservation | undefined = validateOwnerObservation(input);
  let capability = randomBytes(32).toString("hex"), origin = "", requests = 0, closed = false;
  const started = performance.now();
  const send = (response: ServerResponse, status: number, body: string, type = "application/json; charset=utf-8") => {
    response.writeHead(status, { ...OWNER_LOCAL_RESPONSE_HEADERS, "content-type": type, "connection": "close" }); response.end(body);
  };
  const server = createServer({ maxHeaderSize: LOCAL_OWNER_LIMITS.headerBytes }, (request, response) => {
    try {
      if (++requests > LOCAL_OWNER_LIMITS.requests || closed || performance.now() - started >= lifetimeMs || !observation) {
        send(response, 410, '{"error":"OWNER_LOCAL_CLOSED"}'); void close(); return;
      }
      const route = validateOwnerLocalRequest(request, origin);
      if (route === "/") { send(response, 200, ownerPage(capability), "text/html; charset=utf-8"); return; }
      if (route === "/owner.js") { send(response, 200, OWNER_PAGE_JS, "text/javascript; charset=utf-8"); return; }
      if (route === "/owner.css") { send(response, 200, OWNER_PAGE_CSS, "text/css; charset=utf-8"); return; }
      const supplied = request.headers["x-gmai-local-capability"];
      if (typeof supplied !== "string" || !/^[a-f0-9]{64}$/.test(supplied) ||
          !timingSafeEqual(Buffer.from(supplied), Buffer.from(capability))) throw Error("OWNER_LOCAL_REQUEST_REJECTED");
      send(response, 200, JSON.stringify({ ...observation, remainingMs: Math.max(1, Math.floor(lifetimeMs - (performance.now() - started))) }));
    } catch (error) {
      if (error instanceof Error && ["OWNER_LOCAL_SITE_CROSS_SITE_REJECTED", "OWNER_LOCAL_SITE_SAME_SITE_REJECTED"].includes(error.message) &&
          request.method === "GET" && request.url === "/" && request.headers["sec-fetch-mode"] === "navigate" && request.headers["sec-fetch-dest"] === "document") {
        send(response, 403, OWNER_ENTRY_HTML, "text/html; charset=utf-8"); return;
      }
      const code = error instanceof Error && ["HOST", "ORIGIN", "CREDENTIALS", "BODY", "HEADERS", "SITE_MISSING", "SITE_CROSS_SITE", "SITE_SAME_SITE", "SITE_UNKNOWN", "MODE", "DESTINATION"]
        .some(kind => error.message === `OWNER_LOCAL_${kind}_REJECTED`) ? error.message : "OWNER_LOCAL_REQUEST_REJECTED";
      send(response, 403, JSON.stringify({ error: code }));
    }
  });
  server.maxConnections = LOCAL_OWNER_LIMITS.connections; server.maxRequestsPerSocket = 1;
  server.requestTimeout = 5000; server.headersTimeout = 5000; server.keepAliveTimeout = 1;
  server.setTimeout(5000, socket => socket.destroy());
  server.on("clientError", (_error, socket) => socket.destroy());
  server.on("upgrade", (_request, socket) => socket.destroy());
  server.on("connect", (_request, socket) => socket.destroy());
  const finished = new Promise<void>(resolve => server.once("close", resolve));
  let closing: Promise<void> | undefined, timer: ReturnType<typeof setTimeout> | undefined;
  const close = () => {
    if (closing) return closing;
    closed = true; capability = ""; observation = undefined; if (timer) clearTimeout(timer);
    closing = new Promise<void>((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeAllConnections(); });
    return closing;
  };
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", resolve); });
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  timer = setTimeout(() => { void close(); }, Math.max(1, lifetimeMs - (performance.now() - started)));
  return { origin, close, finished, snapshot: () => ({ requests, closed, listening: server.listening, observationRetained: observation !== undefined,
    capabilityRetained: capability !== "", awsCallsFromHttp: 0, jobCalls: 0 }) };
}
