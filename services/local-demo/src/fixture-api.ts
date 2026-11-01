import { createHash } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { ControllerService, type ControllerJobRepository } from "../../controller/src/controller-service.js";
import { PublicError, type JobRecord } from "../../controller/src/contracts.js";
import { createHandler } from "../../controller/src/http-handler.js";
import { assertIdempotentReplay, createQueuedJob, transitionJob } from "../../controller/src/job.js";
import { contractDemoResult } from "../../../frontend/src/data/contract-demo.js";

export const LOCAL_FIXTURE_LIMITS = Object.freeze({ lifetimeMs: 300_000, requests: 512, jobs: 32, activeJobs: 1,
  bodyBytes: 4096, headerBytes: 8192, requestMs: 10_000 });
export type LocalFixtureScenario = "success" | "unavailable" | "timeout" | "circuit" | "launch-failure";
export const LOCAL_FIXTURE_BROWSER_ORIGIN = "http://127.0.0.1:5173";
const scenarios = new Set<LocalFixtureScenario>(["success", "unavailable", "timeout", "circuit", "launch-failure"]);
const headers = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store",
  "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'; frame-ancestors 'none'" };
const reject = (response: ServerResponse, status = 400, code = "VALIDATION_ERROR") => {
  response.writeHead(status, headers); response.end(JSON.stringify({ error: { code, message: "Local fixture request rejected.", requestId: "local-http-fixture" } }));
};

/** No configurable upstream, credential reader, file server or AWS factory.
 * Controller dependencies below are fixed memory effects. SDK adapter modules
 * imported by the real handler are not instantiated or used as a fallback. */
export async function startLocalFixtureApi(port = 4174) {
  if (!Number.isSafeInteger(port) || ![0, 4174].includes(port)) throw Error("LOCAL_FIXTURE_PORT_REJECTED");
  const jobs = new Map<string, JobRecord>(), timers = new Set<ReturnType<typeof setTimeout>>();
  let requests = 0, launches = 0, admitted = 0, closed = false;
  const now = () => new Date();
  const startsAtMs = Date.now();
  const admissionWindow = { startsAtMs, expiresAtMs: startsAtMs + LOCAL_FIXTURE_LIMITS.lifetimeMs };
  const repository: ControllerJobRepository = {
    async create(request, key, at) {
      const jobId = `job_${createHash("sha256").update(key).digest("hex").slice(0, 48)}`;
      const previous = jobs.get(jobId);
      if (previous) return { job: assertIdempotentReplay(previous, request), created: false };
      if (closed || admitted >= LOCAL_FIXTURE_LIMITS.jobs || [...jobs.values()].some(job => ["QUEUED", "RUNNING"].includes(job.status)))
        throw new PublicError("RATE_LIMITED", "Local fixture capacity reached.", 429);
      const job = createQueuedJob({ request, idempotencyKey: key, jobId, now: at, timeoutSeconds: 90, ttlSeconds: 86400 });
      admitted++; jobs.set(jobId, job); return { job, created: true };
    },
    async get(id) { return jobs.get(id) ?? null; },
    async attachTaskArn(id, taskArn) { const job = jobs.get(id); if (!job) throw Error("LOCAL_FIXTURE_JOB_ABSENT"); jobs.set(id, { ...job, taskArn }); },
    async markLaunchFailed(job, at) {
      const next = { ...transitionJob(jobs.get(job.jobId) ?? job, "FAILED", at), errorCode: "TASK_LAUNCH_FAILED", errorMessage: "Local fixture launch failure." };
      jobs.set(job.jobId, next); return next;
    },
  };
  let origin = "";
  const server = createServer({ maxHeaderSize: LOCAL_FIXTURE_LIMITS.headerBytes }, async (request, response) => {
    requests++;
    if (closed || requests > LOCAL_FIXTURE_LIMITS.requests) { reject(response, 429, "RATE_LIMITED"); return; }
    try {
      const route = validateLocalFixtureRequest(request, origin);
      const body = await boundedBody(request);
      if (request.method !== "POST" && body !== "") throw Error("LOCAL_FIXTURE_BODY_REJECTED");
      const cors = request.headers.origin === LOCAL_FIXTURE_BROWSER_ORIGIN ? {
        "access-control-allow-origin": LOCAL_FIXTURE_BROWSER_ORIGIN, "vary": "Origin" } : {};
      if (route.routeKey === "OPTIONS") {
        response.writeHead(204, { ...headers, ...cors, "access-control-allow-methods": "GET, POST",
          "access-control-allow-headers": "content-type, idempotency-key, x-local-fixture-scenario", "access-control-max-age": "0" });
        response.end(); return;
      }
      const scenario = (request.headers["x-local-fixture-scenario"] ?? "success") as LocalFixtureScenario;
      const service = new ControllerService(repository, { async launch(id) {
        const job = jobs.get(id); if (!job || closed || scenario === "launch-failure") throw Error("LOCAL_FIXTURE_LAUNCH_REJECTED");
        launches++; jobs.set(id, transitionJob(job, "RUNNING", now()));
        const timer = setTimeout(() => {
          timers.delete(timer); const current = jobs.get(id); if (closed || !current || current.status !== "RUNNING") return;
          try {
            if (scenario === "timeout") jobs.set(id, { ...transitionJob(current, "TIMED_OUT", now()), errorCode: "JOB_DEADLINE_EXCEEDED", errorMessage: "Local fixture timeout." });
            else if (scenario === "unavailable" || current.symbol === "SPCX") jobs.set(id, { ...transitionJob(current, "FAILED", now()), errorCode: "DATA_UNAVAILABLE", errorMessage: "Local fixture data unavailable." });
            else jobs.set(id, { ...transitionJob(current, "SUCCEEDED", now()), result: contractDemoResult(current) });
          } catch { jobs.set(id, { ...transitionJob(current, "FAILED", now()), errorCode: "INTERNAL_ERROR", errorMessage: "Local fixture generation failed." }); }
        }, 20);
        timers.add(timer); return { taskArn: `local-fixture-task-${id}` };
      } }, { state: async () => scenario === "circuit" ? "OPEN" : "CLOSED" },
      { jobCreationEnabled: true, liveResultDisplayEnabled: true, admissionWindow }, { write() {} }, now);
      const result = await createHandler(service)({ routeKey: route.routeKey, headers: Object.fromEntries(Object.entries(request.headers)
        .filter(([, value]) => typeof value === "string")) as Record<string, string>,
        ...(request.method === "POST" ? { body } : {}), ...(route.jobId ? { pathParameters: { jobId: route.jobId } } : {}),
        requestContext: { requestId: "local-http-fixture" } });
      if (!closed && !response.destroyed) { response.writeHead(result.statusCode, { ...headers, ...result.headers, ...cors }); response.end(result.body); }
    } catch { if (!response.destroyed && !response.headersSent) reject(response); }
  });
  server.requestTimeout = LOCAL_FIXTURE_LIMITS.requestMs; server.headersTimeout = LOCAL_FIXTURE_LIMITS.requestMs;
  server.keepAliveTimeout = 1000; server.maxRequestsPerSocket = 100; server.maxConnections = 16;
  server.on("clientError", (_error, socket) => socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n"));
  await new Promise<void>((accept, refuse) => { server.once("error", refuse); server.listen(port, "127.0.0.1", accept); });
  const address = server.address() as AddressInfo;
  origin = `http://127.0.0.1:${address.port}`;
  let closing: Promise<void> | undefined;
  const close = () => {
    if (closing) return closing;
    closed = true; clearTimeout(lifetime); for (const timer of timers) clearTimeout(timer); timers.clear(); jobs.clear();
    closing = new Promise<void>((accept, refuse) => { server.close(error => error ? refuse(error) : accept()); server.closeAllConnections(); });
    return closing;
  };
  const lifetime = setTimeout(() => { void close(); }, LOCAL_FIXTURE_LIMITS.lifetimeMs);
  return { origin, close, snapshot: () => ({ requests, admitted, launches, activeJobs: [...jobs.values()].filter(job => ["QUEUED", "RUNNING"].includes(job.status)).length,
    jobsRetained: jobs.size, timersRetained: timers.size, closed, listening: server.listening, awsCalls: 0, providerCalls: 0, modelCalls: 0 }) };
}

export function validateLocalFixtureRequest(request: Pick<IncomingMessage, "url" | "method" | "headers" | "rawHeaders">, origin: string) {
  const expected = new URL(origin);
  if (expected.protocol !== "http:" || expected.hostname !== "127.0.0.1" || expected.origin !== origin || request.rawHeaders.length % 2 !== 0 ||
      request.headers.host !== expected.host ||
      request.headers.origin !== undefined && request.headers.origin !== origin && request.headers.origin !== LOCAL_FIXTURE_BROWSER_ORIGIN ||
      ["authorization", "cookie", "x-amz-security-token", "x-amz-credential"].some(name => request.headers[name] !== undefined) ||
      request.headers["transfer-encoding"] !== undefined || request.headers.expect !== undefined) throw Error("LOCAL_FIXTURE_REQUEST_REJECTED");
  const seen = new Set<string>();
  for (let i = 0; i < request.rawHeaders.length; i += 2) {
    const raw = request.rawHeaders[i]; if (typeof raw !== "string") throw Error("LOCAL_FIXTURE_HEADERS_REJECTED");
    const name = raw.toLowerCase(); if (seen.has(name)) throw Error("LOCAL_FIXTURE_HEADERS_REJECTED"); seen.add(name);
  }
  const scenario = request.headers["x-local-fixture-scenario"] ?? "success";
  if (typeof scenario !== "string" || !scenarios.has(scenario as LocalFixtureScenario) || !request.url || /[%?#\\]/.test(request.url)) throw Error("LOCAL_FIXTURE_ROUTE_REJECTED");
  if (request.method === "OPTIONS") {
    const method = request.headers["access-control-request-method"], allowed = ["content-type", "idempotency-key", "x-local-fixture-scenario"];
    const names = String(request.headers["access-control-request-headers"] ?? "").split(",").map(name => name.trim().toLowerCase());
    if (request.headers.origin !== LOCAL_FIXTURE_BROWSER_ORIGIN || !["GET", "POST"].includes(String(method)) ||
        names.some(name => !allowed.includes(name)) || new Set(names).size !== names.length) throw Error("LOCAL_FIXTURE_CORS_REJECTED");
    if (method === "POST" && request.url === "/v1/jobs" || method === "GET" &&
        (["/v1/assets", "/v1/health"].includes(request.url) || /^\/v1\/jobs\/[A-Za-z0-9_-]{16,64}$/.test(request.url))) return { routeKey: "OPTIONS" };
    throw Error("LOCAL_FIXTURE_CORS_REJECTED");
  }
  if (request.method === "POST" && request.url === "/v1/jobs") return { routeKey: "POST /v1/jobs" };
  if (request.method === "GET" && ["/v1/assets", "/v1/health"].includes(request.url)) return { routeKey: `GET ${request.url}` };
  if (request.method === "GET" && /^\/v1\/jobs\/[A-Za-z0-9_-]{16,64}$/.test(request.url))
    return { routeKey: "GET /v1/jobs/{jobId}", jobId: request.url.slice("/v1/jobs/".length) };
  throw Error("LOCAL_FIXTURE_ROUTE_REJECTED");
}

async function boundedBody(request: IncomingMessage) {
  const length = request.headers["content-length"];
  if (length !== undefined && (!/^\d+$/.test(length) || Number(length) > LOCAL_FIXTURE_LIMITS.bodyBytes)) throw Error("LOCAL_FIXTURE_BODY_REJECTED");
  const chunks: Buffer[] = []; let total = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk); total += bytes.length;
    if (total > LOCAL_FIXTURE_LIMITS.bodyBytes) throw Error("LOCAL_FIXTURE_BODY_REJECTED"); chunks.push(bytes);
  }
  return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(Buffer.concat(chunks));
}
