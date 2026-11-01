import assert from "node:assert/strict";
import test from "node:test";
import { parseAcceptancePlan } from "../src/acceptance-plan.js";
import { runOneJobAcceptance } from "../src/signed-api-client.js";

const jobId = `job_${"c".repeat(48)}`;
const options = { operation: "ANALYZE", symbol: "QLD", locale: "ko", sleep: async () => {} } as const;

test("ANALYZE plan is zero-call by default and requires explicit one-call execution flags", () => {
  const dry = parseAcceptancePlan(["--operation", "ANALYZE"]);
  assert.equal(dry.mode, "dry-run");
  assert.deepEqual([dry.taskLaunchesMax, dry.providerCallsMax, dry.bedrockCallsMax, dry.apiCallsMax], [0, 0, 0, 0]);
  assert.equal(dry.bedrockOutputTokensMax, 512);
  assert.throws(() => parseAcceptancePlan(["--operation", "ANALYZE", "--execute", "--confirm-one-task"]), /confirm-one-bedrock-call/);
  assert.throws(() => parseAcceptancePlan(["--execute"]), /confirm-one-task/);
  for (const args of [["--operation"], ["--operation", "ANALIZE"], ["--exectue"], ["--execute", "--execute"]]) {
    assert.throws(() => parseAcceptancePlan(args));
  }
  const live = parseAcceptancePlan(["--operation", "ANALYZE", "--execute", "--confirm-one-task", "--confirm-one-bedrock-call"]);
  assert.deepEqual([live.taskLaunchesMax, live.providerCallsMax, live.bedrockCallsMax, live.apiCallsMax], [1, 3, 1, 18]);
  assert.equal(live.resultDisplayEnabled, false);
  const price = parseAcceptancePlan(["--execute", "--confirm-one-task"]);
  assert.equal(price.operation, "PRICE");
  assert.equal(price.bedrockCallsMax, 0);
});

test("ANALYZE submits one exact job and retains terminal failures without retry", async () => {
  for (const terminal of ["SUCCEEDED", "FAILED", "TIMED_OUT"] as const) {
    let posts = 0;
    let reads = 0;
    const client = { async request(method: "GET" | "POST", path: string, body?: Record<string, unknown>, headers?: Record<string, string>) {
      if (path === "v1/health") return { circuit: "CLOSED", jobCreationEnabled: true };
      if (method === "POST") {
        posts += 1;
        assert.deepEqual(body, { operation: "ANALYZE", symbol: "QLD", locale: "ko" });
        assert.match(headers?.["idempotency-key"] ?? "", /^[a-f0-9-]{36}$/);
        return { jobId, status: "QUEUED" };
      }
      reads += 1;
      return { jobId, status: reads === 1 ? "RUNNING" : terminal };
    } };
    assert.deepEqual(await runOneJobAcceptance(client, options), { jobId, status: terminal, apiCalls: 4 });
    assert.equal(posts, 1);
  }
});

test("an ambiguous ANALYZE submission never retries or polls a guessed job", async () => {
  let calls = 0;
  const client = { async request(_method: "GET" | "POST", path: string) {
    calls += 1;
    if (path === "v1/health") return { circuit: "CLOSED", jobCreationEnabled: true };
    throw new Error("simulated connection loss after POST");
  } };
  await assert.rejects(() => runOneJobAcceptance(client, options), /connection loss/);
  assert.equal(calls, 2);
});

test("ANALYZE enforces gate, bounded polling, matching job and result privacy", async () => {
  for (const response of [
    { jobId, status: "SUCCEEDED", result: {} },
    { jobId, status: "RUNNING", taskArn: "private" },
    { jobId: `job_${"d".repeat(48)}`, status: "SUCCEEDED" },
    { jobId, status: "UNKNOWN" },
  ]) {
    const client = { async request(method: "GET" | "POST", path: string) {
      if (path === "v1/health") return { circuit: "CLOSED", jobCreationEnabled: true };
      return method === "POST" ? { jobId } : response;
    } };
    await assert.rejects(() => runOneJobAcceptance(client, options), /EXPOSURE|mismatched|invalid job status/);
  }
  let calls = 0;
  const closed = { async request() { calls += 1; return { circuit: "OPEN", jobCreationEnabled: true }; } };
  await assert.rejects(() => runOneJobAcceptance(closed, options), /GATE_NOT_READY/);
  assert.equal(calls, 1);
  const pending = { async request(method: "GET" | "POST", path: string) {
    calls += 1;
    if (path === "v1/health") return { circuit: "CLOSED", jobCreationEnabled: true };
    return { jobId, status: method === "POST" ? "QUEUED" : "RUNNING" };
  } };
  calls = 0;
  await assert.rejects(() => runOneJobAcceptance(pending, options), /BOUNDED_POLL_TIMEOUT/);
  assert.equal(calls, 18);
  calls = 0;
  await assert.rejects(() => runOneJobAcceptance(pending, { ...options, maxStatusReads: 17 }), /between 1 and 16/);
  assert.equal(calls, 0);
  const leakingPost = { async request(_method: "GET" | "POST", path: string) {
    if (path === "v1/health") return { circuit: "CLOSED", jobCreationEnabled: true };
    return { jobId, result: {} };
  } };
  await assert.rejects(() => runOneJobAcceptance(leakingPost, options), /RESULT_EXPOSURE_GATE_FAILED/);
});
