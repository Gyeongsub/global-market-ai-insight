import assert from "node:assert/strict";
import test from "node:test";
import { createOwnerJobSession } from "../src/job-session.js";
import { AwsIamApiClient } from "../../operations/api-smoke/src/signed-api-client.js";
import { ControllerService } from "../../controller/src/controller-service.js";
import { createHandler } from "../../controller/src/http-handler.js";
import { isPrivateOwnerRequest } from "../../controller/src/private-owner.js";
import { deterministicJobId } from "../../controller/src/aws-job-repository.js";
import { createQueuedJob, transitionJob } from "../../controller/src/job.js";
import type { JobRecord } from "../../controller/src/contracts.js";
import type { JobRequest } from "../../../frontend/src/api/jobs.js";
import { contractDemoResult } from "../../../frontend/src/data/contract-demo.js";

const now = new Date("2026-10-25T00:00:00.000Z"), window = { startsAtMs: now.getTime(), expiresAtMs: now.getTime() + 300000 };
const owner = "arn:aws:iam::000000000000:user/local-owner";
const input: JobRequest = { operation: "PRICE", symbol: "QLD", locale: "en" };

// Real local layers, but substituted gateway identity/persistence/worker. This is
// not a valid AWS signature check, IAM integration, live task or market result.
function harness(options: { foreign?: boolean; circuit?: "OPEN" | "CLOSED"; loseAcknowledgement?: boolean; display?: boolean } = {}) {
  let stored: JobRecord | undefined;
  const counts = { posts: 0, reads: 0, creates: 0, launches: 0 };
  const controller = new ControllerService({
    async create(request, key, at) {
      counts.creates++; stored = createQueuedJob({ request, idempotencyKey: key, jobId: deterministicJobId(key), now: at, timeoutSeconds: 90, ttlSeconds: 86400 });
      return { job: stored, created: true };
    },
    async get() { return stored ?? null; },
    async attachTaskArn(_id, taskArn) { stored = { ...stored!, taskArn }; },
    async markLaunchFailed(job) { return job; },
  }, { async launch() {
    counts.launches++;
    stored = stored!.symbol === "SPCX"
      ? { ...transitionJob(transitionJob(stored!, "RUNNING", now), "FAILED", now), errorCode: "DATA_UNAVAILABLE" }
      : { ...transitionJob(transitionJob(stored!, "RUNNING", now), "SUCCEEDED", now), result: contractDemoResult(stored!) };
    return { taskArn: "private-fixture-task" };
  } }, { state: async () => options.circuit ?? "CLOSED" },
  { jobCreationEnabled: true, liveResultDisplayEnabled: options.display ?? false, admissionWindow: window }, { write() {} }, () => now);
  const handler = createHandler(controller, event => isPrivateOwnerRequest(event, owner));
  const client = new AwsIamApiClient("https://abc123.execute-api.ap-northeast-1.amazonaws.com",
    async () => ({ accessKeyId: "AKIDEXAMPLE", secretAccessKey: "example-secret", sessionToken: "example-token" }), async (url, init) => {
      const post = init?.method === "POST";
      if (post) counts.posts++; else counts.reads++;
      assert.match(new Headers(init?.headers).get("authorization") ?? "", /^AWS4-HMAC-SHA256 /);
      const response = await handler({ version: "2.0", routeKey: post ? "POST /v1/jobs" : "GET /v1/jobs/{jobId}",
        headers: Object.fromEntries(new Headers(init?.headers).entries()), ...(post ? { body: String(init?.body) } : { pathParameters: { jobId: new URL(url).pathname.split("/").at(-1)! } }),
        requestContext: { accountId: "000000000000", requestId: "local-owner-composition", authorizer: { iam: { accountId: "000000000000", userArn: options.foreign ? owner + "-other" : owner } } } });
      if (post && options.loseAcknowledgement) throw Error("PRIVATE_SENTINEL");
      return new Response(response.body, { status: response.statusCode, headers: response.headers });
    });
  return { counts, session: (request = input) => createOwnerJobSession(client, request, window, { wall: () => now.getTime() }), job: () => stored };
}

test("all 30 intents compose real local signing, owner guard, controller and checked metadata with no native network", async t => {
  let network = 0; t.mock.method(globalThis, "fetch", async () => { network++; throw Error("FORBIDDEN"); });
  for (const operation of ["PRICE", "ANALYZE"] as const) for (const symbol of ["VOO", "QLD", "TSLA", "SPCX", "GOOG"] as const)
    for (const locale of ["en", "ja", "ko"] as const) {
      const h = harness(), session = h.session({ operation, symbol, locale });
      try {
        await session.start(); const observed = await session.poll();
        assert.equal(observed.status, symbol === "SPCX" ? "FAILED" : "SUCCEEDED"); assert.equal(observed.result, undefined);
        if (symbol === "SPCX") assert.equal(observed.errorCode, "DATA_UNAVAILABLE");
        assert.equal(session.expectedJobId, h.job()?.jobId);
        assert.doesNotMatch(JSON.stringify(observed), /private-fixture|result|taskArn|idempotency|price|summary/);
        assert.deepEqual(h.counts, { posts: 1, reads: 1, creates: 1, launches: 1 });
      } finally { session.close(); }
    }
  assert.equal(network, 0);
});

test("foreign owner and OPEN circuit reject the composed POST before fixture effects with no retry", async t => {
  t.mock.method(console, "warn", () => {});
  for (const options of [{ foreign: true }, { circuit: "OPEN" as const }]) {
    const h = harness(options), session = h.session();
    try {
      await assert.rejects(session.start(), /OWNER_JOB_UNAVAILABLE/);
      await assert.rejects(session.start(), /OWNER_JOB_NOT_READY/);
      assert.deepEqual(h.counts, { posts: 1, reads: 0, creates: 0, launches: 0 });
    } finally { session.close(); }
  }
});

test("lost acknowledgement after real fixture admission retains an exact recovery hint and never resubmits", async () => {
  const h = harness({ loseAcknowledgement: true }), session = h.session();
  try {
    await assert.rejects(session.start(), /OWNER_JOB_UNAVAILABLE/);
    assert.equal(session.expectedJobId, h.job()?.jobId);
    assert.equal(session.snapshot().independentClosureRequired, true);
    await assert.rejects(session.start(), /OWNER_JOB_NOT_READY/); await assert.rejects(session.poll(), /OWNER_JOB_NOT_READY/);
    assert.deepEqual(h.counts, { posts: 1, reads: 0, creates: 1, launches: 1 });
  } finally { session.close(); }
});

test("accidental result-display enablement is refused by the independent metadata-only owner boundary", async () => {
  const h = harness({ display: true }), session = h.session();
  try { await session.start(); await assert.rejects(session.poll(), /OWNER_JOB_UNAVAILABLE/); assert.equal(session.snapshot().status, "UNVERIFIED"); }
  finally { session.close(); }
});
