import assert from "node:assert/strict";
import test from "node:test";
import { createOwnerJobBoundary, OWNER_JOB_BOUNDARY_LIMITS, type OwnerJobBoundaryRequest } from "../src/job-boundary.js";
import { createOwnerJobSession } from "../src/job-session.js";
import { deterministicJobId } from "../../controller/src/aws-job-repository.js";

const origin = "http://127.0.0.1:4175", capability = "a".repeat(64), at = Date.parse("2026-10-25T00:00:00.000Z");
const intent = { operation: "ANALYZE", symbol: "TSLA", locale: "ja" } as const;
const request = (url = "/bridge/job/start"): OwnerJobBoundaryRequest => ({ method: "POST", url,
  headers: { host: "127.0.0.1:4175", origin, "sec-fetch-site": "same-origin", "sec-fetch-mode": "cors", "sec-fetch-dest": "empty",
    "x-gmai-local-capability": capability, "content-length": "0" }, rawHeaders: ["Host", "127.0.0.1:4175", "Origin", origin] });
function harness(options: { lost?: boolean; pending?: boolean; nonterminal?: boolean } = {}) {
  let elapsed = 0, posts = 0, reads = 0, id = "";
  let resolve!: () => void;
  const wait = new Promise<void>(yes => { resolve = yes; });
  const expiresAt = new Date(at + 86400000).toISOString();
  const session = createOwnerJobSession({ async request(method, _path, body, headers) {
    if (method === "POST") {
      posts++; assert.deepEqual(body, intent); id = deterministicJobId(headers!["idempotency-key"]!);
      if (options.pending) await wait;
      if (options.lost) throw Error("PRIVATE_SENTINEL");
      return { jobId: id, status: "QUEUED", statusUrl: `/v1/jobs/${id}`, expiresAt };
    }
    reads++;
    return { ...intent, jobId: id, status: options.nonterminal ? "RUNNING" : "SUCCEEDED", createdAt: new Date(at).toISOString(),
      updatedAt: new Date(at).toISOString(), expiresAt, schemaVersion: "1.0.0" };
  } }, intent, { startsAtMs: at, expiresAtMs: at + 300000 }, { wall: () => at, elapsed: () => elapsed });
  const boundary = createOwnerJobBoundary(session, origin, capability, () => elapsed);
  return { boundary, session, counts: () => ({ posts, reads }), release: resolve,
    advance: (ms: number) => { elapsed += ms; }, close: () => { boundary.close(); session.close(); } };
}

test("strict fixed-route empty-body capability boundary rejects unauthorized requests before dispatch", async () => {
  const h = harness();
  try {
    const changes: [string, string][] = [["host", "localhost:4175"], ["origin", "https://evil.invalid"], ["sec-fetch-site", "cross-site"],
      ["sec-fetch-site", "same-site"], ["sec-fetch-mode", "no-cors"], ["sec-fetch-dest", "document"], ["content-length", "1"],
      ["transfer-encoding", "chunked"], ["cookie", "PRIVATE_SENTINEL"], ["authorization", "PRIVATE_SENTINEL"],
      ["x-amz-security-token", "PRIVATE_SENTINEL"], ["x-gmai-local-capability", "b".repeat(64)], ["x-gmai-local-capability", "bad"]];
    for (const [key, value] of changes) {
      const input = request(); input.headers[key] = value;
      assert.equal((await h.boundary.handle(input)).status, 403);
    }
    const missing = request(); delete missing.headers.origin; assert.equal((await h.boundary.handle(missing)).status, 403);
    const duplicate = request(); duplicate.rawHeaders.push("HOST", "127.0.0.1:4175"); assert.equal((await h.boundary.handle(duplicate)).status, 403);
    for (const path of ["/v1/jobs", "/bridge/job/status?jobId=other", "/bridge/job/other", "/bridge/observation", "https://evil.invalid/"])
      assert.equal((await h.boundary.handle(request(path))).status, 403);
    assert.equal((await h.boundary.handle({ ...request(), method: "GET" })).status, 403);
    assert.deepEqual(h.counts(), { posts: 0, reads: 0 });
  } finally { h.close(); }
});

test("one pinned start and status return checked metadata, never accept browser job IDs or intent", async () => {
  const h = harness();
  try {
    assert.equal((await h.boundary.handle(request("/bridge/job/status"))).status, 409);
    const accepted = await h.boundary.handle(request()); assert.equal(accepted.status, 202);
    assert.equal(accepted.body.jobId, h.session.expectedJobId);
    assert.equal((await h.boundary.handle(request())).status, 409);
    const terminal = await h.boundary.handle(request("/bridge/job/status"));
    assert.equal(terminal.status, 200); assert.equal(terminal.body.status, "SUCCEEDED"); assert.equal(terminal.body.result, undefined);
    assert.doesNotMatch(JSON.stringify(terminal), /PRIVATE_SENTINEL|credential|taskArn|idempotency|result/);
    const closed = await h.boundary.handle(request("/bridge/job/close"));
    assert.deepEqual(closed.body, { closed: true, remoteMayContinue: true, independentClosureRequired: true });
    assert.equal(h.boundary.snapshot().capabilityRetained, false);
    assert.equal((await h.boundary.handle(request())).status, 410);
    assert.deepEqual(h.counts(), { posts: 1, reads: 1 });
  } finally { h.close(); }
});

test("duplicate requests cannot race a second dispatch; explicit local close cancels late acknowledgement", async () => {
  const h = harness({ pending: true });
  try {
    const started = h.boundary.handle(request());
    for (let i = 0; i < 8; i++) await Promise.resolve();
    assert.equal(h.counts().posts, 1);
    assert.equal((await h.boundary.handle(request())).status, 409);
    assert.equal((await h.boundary.handle(request("/bridge/job/status"))).status, 409);
    assert.equal((await h.boundary.handle(request("/bridge/job/close"))).status, 200);
    assert.equal((await started).status, 410);
    h.release(); for (let i = 0; i < 8; i++) await Promise.resolve();
    assert.equal(h.boundary.snapshot().closed, true); assert.deepEqual(h.counts(), { posts: 1, reads: 0 });
  } finally { h.release(); h.close(); }
});

test("lost remote acknowledgement closes boundary with fixed error and reconciliation required", async () => {
  const h = harness({ lost: true });
  try {
    assert.deepEqual(await h.boundary.handle(request()), { status: 503, body: { error: { code: "OWNER_JOB_UNAVAILABLE" } } });
    assert.equal(h.boundary.snapshot().independentClosureRequired, true);
    assert.equal((await h.boundary.handle(request())).status, 410);
    assert.deepEqual(h.counts(), { posts: 1, reads: 0 });
  } finally { h.close(); }
});

test("early polling is refused without additional upstream call or session renewal", async () => {
  const h = harness({ nonterminal: true });
  try {
    await h.boundary.handle(request());
    assert.equal((await h.boundary.handle(request("/bridge/job/status"))).status, 200);
    assert.deepEqual(await h.boundary.handle(request("/bridge/job/status")), { status: 409, body: { error: { code: "OWNER_JOB_POLL_TOO_EARLY" } } });
    assert.equal(h.counts().reads, 1);
    h.advance(4000); assert.equal((await h.boundary.handle(request("/bridge/job/status"))).status, 200);
    h.advance(116000); assert.equal((await h.boundary.handle(request("/bridge/job/status"))).status, 410);
    assert.equal(h.counts().reads, 2); assert.equal(h.boundary.snapshot().capabilityRetained, false);
  } finally { h.close(); }
});

test("request ceiling and idle real timer discard capability and stop all later attempts", async t => {
  const h = harness();
  try {
    for (let i = 0; i < OWNER_JOB_BOUNDARY_LIMITS.requests; i++) assert.equal((await h.boundary.handle(request("/missing"))).status, 403);
    assert.equal((await h.boundary.handle(request())).status, 410); assert.equal(h.boundary.snapshot().capabilityRetained, false);
    assert.deepEqual(h.counts(), { posts: 0, reads: 0 });
  } finally { h.close(); }
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const idle = harness();
  try {
    t.mock.timers.tick(120000); assert.equal(idle.boundary.snapshot().capabilityRetained, false);
    assert.equal((await idle.boundary.handle(request())).status, 410); assert.equal(idle.session.snapshot().keyRetained, false);
    assert.deepEqual(idle.counts(), { posts: 0, reads: 0 });
  } finally { idle.close(); }
});

test("invalid origin or capability does not create a boundary or perform upstream work", () => {
  const h = harness();
  try {
    for (const bad of ["https://127.0.0.1:4175", "http://localhost:4175", "http://0.0.0.0:4175", "http://127.0.0.1:4175/"])
      assert.throws(() => createOwnerJobBoundary(h.session, bad, capability), /OWNER_JOB_BOUNDARY_OPTIONS_REJECTED/);
    assert.throws(() => createOwnerJobBoundary(h.session, origin, "bad"), /OWNER_JOB_BOUNDARY_OPTIONS_REJECTED/);
    assert.deepEqual(h.counts(), { posts: 0, reads: 0 });
  } finally { h.close(); }
});
