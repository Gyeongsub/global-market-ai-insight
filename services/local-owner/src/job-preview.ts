import { randomBytes } from "node:crypto";
import { createServer, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { performance } from "node:perf_hooks";
import { validateJobRequest, type JobRequest } from "../../../frontend/src/api/jobs.js";
import { stableHash } from "../../controller/src/job.js";
import { createOwnerJobSession } from "./job-session.js";
import { createOwnerJobBoundary } from "./job-boundary.js";
import { LOCAL_OWNER_LIMITS, OWNER_LOCAL_RESPONSE_HEADERS, validateOwnerLocalRequest } from "./server.js";
import { OWNER_ENTRY_HTML } from "./page.js";
import { ownerJobPreviewPage, OWNER_JOB_PREVIEW_CSS, OWNER_JOB_PREVIEW_JS } from "./job-page.js";

/** Synthetic-only browser harness. No transport, SDK, credential, environment,
 * endpoint or filesystem parameter can turn this factory into live execution.
 * Tests may select ephemeral port zero. The live observation CLI is unchanged. */
export async function startOwnerJobPreview(input: JobRequest, port = 4175, lifetimeMs = 120000) {
  validateJobRequest(input);
  if (![0, 4175].includes(port) || !Number.isSafeInteger(lifetimeMs) || lifetimeMs < 1 || lifetimeMs > 120000) throw Error("OWNER_JOB_PREVIEW_OPTIONS_INVALID");
  const intent = Object.freeze({ ...input }), at = Date.now(), started = performance.now();
  let id = "", posts = 0, reads = 0, requests = 0, closed = false, capability = randomBytes(32).toString("hex"), origin = "";
  const session = createOwnerJobSession({ async request(method, _path, _body, headers) {
    if (method === "POST") {
      posts++; id = "job_" + stableHash(headers!["idempotency-key"]!).slice(0, 48);
      return { jobId: id, status: "QUEUED", statusUrl: `/v1/jobs/${id}`, expiresAt: new Date(at + 86400000).toISOString() };
    }
    reads++;
    return { jobId: id, ...intent, status: reads === 1 ? "RUNNING" : "SUCCEEDED", schemaVersion: "1.0.0",
      createdAt: new Date(at).toISOString(), updatedAt: new Date().toISOString(), expiresAt: new Date(at + 86400000).toISOString() };
  } }, intent, { startsAtMs: at, expiresAtMs: at + 120000 });
  // The request boundary has one fixed production-preview origin; ephemeral
  // test hosts are normalized only after the real Host/Origin guards below.
  const boundary = createOwnerJobBoundary(session, "http://127.0.0.1:4175", capability);
  const send = (response: ServerResponse, status: number, body: string, type = "application/json; charset=utf-8") => {
    if (response.destroyed || response.writableEnded) return;
    response.writeHead(status, { ...OWNER_LOCAL_RESPONSE_HEADERS, "content-type": type, connection: "close" }); response.end(body);
  };
  const server = createServer({ maxHeaderSize: LOCAL_OWNER_LIMITS.headerBytes }, (request, response) => {
    void (async () => {
      try {
        if (closed || ++requests > LOCAL_OWNER_LIMITS.requests || performance.now() - started >= lifetimeMs) {
          send(response, 410, '{"error":"OWNER_LOCAL_CLOSED"}'); void close(); return;
        }
        if (request.url === "/") {
          validateOwnerLocalRequest(request, origin);
          send(response, 200, ownerJobPreviewPage(capability, intent, session.snapshot().status,
            Math.max(1, Math.floor(lifetimeMs - (performance.now() - started)))), "text/html; charset=utf-8"); return;
        }
        if (request.url === "/job.js" || request.url === "/job.css") {
          validateOwnerLocalRequest({ ...request, method: request.method, url: request.url === "/job.js" ? "/owner.js" : "/owner.css",
            headers: request.headers, rawHeaders: request.rawHeaders }, origin);
          send(response, 200, request.url === "/job.js" ? OWNER_JOB_PREVIEW_JS : OWNER_JOB_PREVIEW_CSS,
            request.url === "/job.js" ? "text/javascript; charset=utf-8" : "text/css; charset=utf-8"); return;
        }
        // Validate the actual bound address before test-port normalization. No
        // alternate browser Origin or hostname is accepted by the outer host.
        validateOwnerLocalRequest({ method: request.method, url: "/bridge/observation", headers: request.headers, rawHeaders: request.rawHeaders }, origin);
        const routed = { method: request.method, url: request.url, headers: { ...request.headers, host: "127.0.0.1:4175", origin: "http://127.0.0.1:4175" }, rawHeaders: request.rawHeaders };
        const result = await boundary.handle(routed);
        send(response, result.status, JSON.stringify(result.body));
        if (boundary.snapshot().closed) {
          // Allow the local close acknowledgement to flush before owned sockets
          // are destroyed. The fixed lifetime remains the independent fallback.
          response.once("finish", () => { void close(); });
          if (response.writableFinished) void close();
        }
      } catch (error) {
        if (error instanceof Error && ["OWNER_LOCAL_SITE_CROSS_SITE_REJECTED", "OWNER_LOCAL_SITE_SAME_SITE_REJECTED"].includes(error.message) &&
            request.method === "GET" && request.url === "/" && request.headers["sec-fetch-mode"] === "navigate" && request.headers["sec-fetch-dest"] === "document") {
          send(response, 403, OWNER_ENTRY_HTML, "text/html; charset=utf-8"); return;
        }
        send(response, 403, '{"error":"OWNER_LOCAL_REQUEST_REJECTED"}');
      }
    })();
  });
  server.maxConnections = LOCAL_OWNER_LIMITS.connections; server.maxRequestsPerSocket = 1;
  server.requestTimeout = 5000; server.headersTimeout = 5000; server.keepAliveTimeout = 1;
  server.setTimeout(5000, socket => socket.destroy());
  server.on("clientError", (_error, socket) => socket.destroy());
  server.on("upgrade", (_request, socket) => socket.destroy()); server.on("connect", (_request, socket) => socket.destroy());
  const finished = new Promise<void>(resolve => server.once("close", resolve));
  let closing: Promise<void> | undefined, timer: ReturnType<typeof setTimeout> | undefined;
  function close() {
    if (closing) return closing;
    closed = true; capability = ""; boundary.close(); session.close(); if (timer) clearTimeout(timer);
    closing = new Promise<void>((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeAllConnections(); });
    return closing;
  }
  try { await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", resolve); }); }
  catch { boundary.close(); session.close(); capability = ""; throw Error("OWNER_JOB_PREVIEW_LISTEN_FAILED"); }
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  timer = setTimeout(() => { void close(); }, Math.max(1, lifetimeMs - (performance.now() - started)));
  return { origin, close, finished, snapshot: () => ({ source: "local-test-fixture", requests, syntheticPosts: posts, syntheticReads: reads,
    closed, listening: server.listening, capabilityRetained: capability !== "", keyRetained: session.snapshot().keyRetained,
    awsCalls: 0, providerCalls: 0, modelCalls: 0 }) };
}
