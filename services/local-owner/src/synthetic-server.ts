import { randomBytes, timingSafeEqual } from "node:crypto";
import { createServer, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { LOCAL_OWNER_LIMITS, OWNER_LOCAL_RESPONSE_HEADERS, validateOwnerLocalRequest } from "./server.js";
import { OWNER_ENTRY_HTML } from "./page.js";
import { SYNTHETIC_CSS, SYNTHETIC_JS, syntheticPage } from "./synthetic-page.js";
import { SYNTHETIC_LAB, type SyntheticAnalysisSession } from "./synthetic-analysis.js";

/** Deliberately separate from the read-only observation/fixture factories. */
export async function startSyntheticAnalysisServer(session: SyntheticAnalysisSession, port = 4175) {
  if (![0, 4175].includes(port)) throw Error("SYNTHETIC_PORT_INVALID");
  let capability = randomBytes(32).toString("hex"), origin = "", requests = 0, closed = false;
  const send = (r: ServerResponse, code: number, body: string, type = "application/json; charset=utf-8") => {
    if (r.destroyed || r.writableEnded) return;
    r.writeHead(code, { ...OWNER_LOCAL_RESPONSE_HEADERS, "content-type": type, connection: "close" }); r.end(body);
  };
  const server = createServer({ maxHeaderSize: LOCAL_OWNER_LIMITS.headerBytes }, (req, res) => { void (async () => {
    try {
      if (closed || ++requests > LOCAL_OWNER_LIMITS.requests || session.snapshot().state === "CLOSED") {
        send(res, 410, '{"error":"SESSION_CLOSED"}'); void close(); return;
      }
      if (["/", "/owner.js", "/owner.css"].includes(req.url ?? "")) {
        const route = validateOwnerLocalRequest(req, origin);
        send(res, 200, route === "/" ? syntheticPage(capability) : route === "/owner.js" ? SYNTHETIC_JS : SYNTHETIC_CSS,
          route === "/" ? "text/html; charset=utf-8" : route === "/owner.js" ? "text/javascript; charset=utf-8" : "text/css; charset=utf-8"); return;
      }
      validateOwnerLocalRequest({ method: req.method, url: "/bridge/observation", headers: req.headers, rawHeaders: req.rawHeaders }, origin);
      const supplied = req.headers["x-gmai-local-capability"];
      if (typeof supplied !== "string" || !/^[a-f0-9]{64}$/.test(supplied) || !timingSafeEqual(Buffer.from(supplied), Buffer.from(capability))) throw Error("DENIED");
      if (req.url === "/bridge/close") {
        session.close(); send(res, 200, '{"closed":true}'); res.once("finish", () => { void close(); });
        if (res.writableFinished) void close(); return;
      }
      if (req.url === "/bridge/status") { send(res, 200, JSON.stringify(session.snapshot())); return; }
      const match = /^\/bridge\/start\/(en|ja|ko)$/.exec(req.url ?? "");
      if (!match) throw Error("DENIED");
      send(res, 200, JSON.stringify(await session.start(match[1]!)));
    } catch (error) {
      if (error instanceof Error && ["OWNER_LOCAL_SITE_CROSS_SITE_REJECTED", "OWNER_LOCAL_SITE_SAME_SITE_REJECTED"].includes(error.message) &&
          req.method === "GET" && req.url === "/" && req.headers["sec-fetch-mode"] === "navigate" && req.headers["sec-fetch-dest"] === "document") {
        send(res, 403, OWNER_ENTRY_HTML, "text/html; charset=utf-8"); return;
      }
      send(res, 403, '{"error":"REQUEST_REJECTED"}');
    }
  })(); });
  server.maxConnections = LOCAL_OWNER_LIMITS.connections; server.maxRequestsPerSocket = 1;
  server.requestTimeout = 5000; server.headersTimeout = 5000; server.keepAliveTimeout = 1;
  server.setTimeout(25000, socket => socket.destroy());
  server.on("clientError", (_error, socket) => socket.destroy());
  server.on("upgrade", (_req, socket) => socket.destroy()); server.on("connect", (_req, socket) => socket.destroy());
  const finished = new Promise<void>(resolve => server.once("close", resolve));
  let closing: Promise<void> | undefined, timer: ReturnType<typeof setTimeout> | undefined;
  function close() {
    if (closing) return closing;
    closed = true; session.close(); capability = ""; if (timer) clearTimeout(timer);
    closing = new Promise<void>((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeAllConnections(); });
    return closing;
  }
  try { await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", resolve); }); }
  catch { session.close(); capability = ""; throw Error("SYNTHETIC_LISTEN_FAILED"); }
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  timer = setTimeout(() => { void close(); }, Math.max(1, Math.min(SYNTHETIC_LAB.lifetimeMs, session.snapshot().remainingMs)));
  return { origin, finished, close, snapshot: () => ({ listening: server.listening, closed, requests,
    capabilityRetained: capability !== "", modelAttempts: session.snapshot().attempts, resultRetained: !!session.snapshot().result }) };
}
