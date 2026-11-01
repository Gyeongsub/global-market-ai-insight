import test from "node:test";
import assert from "node:assert/strict";
import { createSyntheticReadDenialCandidate, syntheticReadDenialRequests } from "../src/synthetic-read-denial.js";

const nonce = "a".repeat(32), rejected = { message: "SYNTHETIC_READ_DENIAL_UNVERIFIED" };
function fixture() {
  let closed = false, destroyed = 0, checks = 0, remaining = 300000;
  const keys = { accessKeyId: "TEST_ONLY", secretAccessKey: "PRIVATE_SENTINEL", sessionToken: "TEST_ONLY", expiration: new Date() };
  const seen: string[] = [];
  const lease = { getCredentials() { checks++; if (closed) throw Error("PRIVATE_SENTINEL"); return keys; },
    close() { closed = true; keys.accessKeyId = keys.secretAccessKey = keys.sessionToken = ""; },
    remainingMs: () => closed ? 0 : remaining, toJSON: () => ({ mode: "test-only" } as any) };
  return { lease, keys, seen, checks: () => checks, closed: () => closed, destroyed: () => destroyed,
    expire: () => { remaining = 0; }, destroy: () => { destroyed++; } };
}
function denied(action: string) {
  return { status: 400, body: JSON.stringify({ __type: "AccessDeniedException",
    message: `User PRIVATE_SENTINEL is not authorized to perform ${action} with an explicit deny in a session policy` }) };
}

test("fixed immutable read specifications reject caller-selected resources, workload starts and HTTPS overrides", () => {
  const requests = syntheticReadDenialRequests(nonce);
  assert.ok(Object.isFrozen(requests)); assert.ok(requests.every(Object.isFrozen));
  assert.deepEqual(JSON.parse(requests[0]!.body), { Name: `/gmai/synthetic-denial/${nonce}/nonexistent`, WithDecryption: false });
  assert.deepEqual(JSON.parse(requests[1]!.body), { clusters: [`gmai-synthetic-denial-${nonce}`] });
  assert.deepEqual(requests.map(r => r.endpoint), ["https://ssm.ap-northeast-1.amazonaws.com/", "https://ecs.ap-northeast-1.amazonaws.com/"]);
  assert.doesNotMatch(JSON.stringify(requests), /InvokeModel|Converse|RunTask|GetSecretValue|twelvedata|Authorization/);
  for (const invalid of ["", "A".repeat(32), "a".repeat(31), "a".repeat(33), "../secret", null])
    assert.throws(() => syntheticReadDenialRequests(invalid as string), rejected);
});

test("candidate makes only two fixed requests once, clears credentials and never claims live IAM evidence", async () => {
  const f = fixture();
  const candidate = createSyntheticReadDenialCandidate({ nonce, lease: f.lease, factory: credentials => ({
    async request(r, signal) { assert.equal(credentials(), f.keys); assert.equal(signal.aborted, false); f.seen.push(r.caseName);
      return denied(r.service === "ssm" ? "ssm:GetParameter" : "ecs:DescribeClusters"); }, destroy: f.destroy }) });
  assert.equal(f.seen.length, 0);
  const result = await candidate.run();
  assert.deepEqual(result.acceptedCases, ["parameter-canary", "cluster-read"]);
  assert.equal(result.requestAttempts, 2); assert.equal(result.liveAuthorizationVerified, false);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_SENTINEL|accessKeyId|sessionToken/);
  assert.equal(f.closed(), true); assert.equal(f.keys.secretAccessKey, ""); assert.equal(f.destroyed(), 1);
  await assert.rejects(candidate.run(), rejected); candidate.close(); assert.equal(f.destroyed(), 1);
});

test("unexpected success, missing canary, generic denial and private errors stop before the next request", async () => {
  for (const response of [{ status: 200, body: "PRIVATE_SENTINEL" }, { status: 400, body: '{"__type":"ParameterNotFound"}' },
    { status: 403, body: '{"__type":"AccessDeniedException","message":"denied"}' }, "throw"]) {
    const f = fixture(); let calls = 0;
    const candidate = createSyntheticReadDenialCandidate({ nonce, lease: f.lease, factory: () => ({
      async request() { calls++; if (response === "throw") throw Error("PRIVATE_SENTINEL"); return response; }, destroy: f.destroy }) });
    await assert.rejects(candidate.run(), rejected); assert.equal(calls, 1);
    assert.equal(f.closed(), true); assert.equal(f.destroyed(), 1); await assert.rejects(candidate.run(), rejected);
  }
});

test("invalid nonce, expired lease and failed factory never dispatch or retain credentials", async () => {
  const invalid = fixture();
  assert.throws(() => createSyntheticReadDenialCandidate({ nonce: "PRIVATE_SENTINEL", lease: invalid.lease,
    factory: () => assert.fail("must not construct") }), rejected); assert.equal(invalid.closed(), true);
  for (const expired of [true, false]) {
    const f = fixture(); if (expired) f.expire(); let constructed = 0;
    const candidate = createSyntheticReadDenialCandidate({ nonce, lease: f.lease,
      factory: () => { constructed++; throw Error("PRIVATE_SENTINEL"); } });
    await assert.rejects(candidate.run(), rejected); assert.equal(constructed, expired ? 0 : 1); assert.equal(f.closed(), true);
  }
});

test("expired or reversed elapsed clock after first response blocks the second request", async () => {
  for (const next of [40000, -1, NaN]) {
    const f = fixture(); let now = 0, calls = 0;
    const candidate = createSyntheticReadDenialCandidate({ nonce, lease: f.lease, elapsed: () => now, factory: () => ({
      async request() { calls++; now = next; return denied("ssm:GetParameter"); }, destroy: f.destroy }) });
    await assert.rejects(candidate.run(), rejected); assert.equal(calls, 1); assert.equal(f.closed(), true);
  }
});

test("a hanging transport is aborted at 20 seconds; concurrent/repeated runs cannot multiply requests", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const f = fixture(); let signal: AbortSignal | undefined, finish: ((v: unknown) => void) | undefined;
  const candidate = createSyntheticReadDenialCandidate({ nonce, lease: f.lease, factory: () => ({
    request(_r, s) { signal = s; return new Promise(resolve => { finish = resolve; }); }, destroy: f.destroy }) });
  const run = candidate.run(), failure = assert.rejects(run, rejected);
  await assert.rejects(candidate.run(), rejected);
  await new Promise(resolve => setImmediate(resolve)); t.mock.timers.tick(20000); await failure;
  assert.equal(signal?.aborted, true); assert.equal(f.closed(), true); assert.equal(f.destroyed(), 1);
  finish?.(denied("ssm:GetParameter")); await new Promise(resolve => setImmediate(resolve));
  assert.equal(candidate.snapshot().requestAttempts, 1);
});

test("explicit close cancels an in-flight request and cleanup errors are not reported as success", async () => {
  const f = fixture(); let finish: ((v: unknown) => void) | undefined;
  const candidate = createSyntheticReadDenialCandidate({ nonce, lease: f.lease, factory: () => ({
    request() { return new Promise(resolve => { finish = resolve; }); }, destroy: f.destroy }) });
  const run = candidate.run(), failure = assert.rejects(run, rejected);
  await new Promise(resolve => setImmediate(resolve)); candidate.close(); await failure;
  finish?.(denied("ssm:GetParameter")); assert.equal(f.closed(), true); assert.equal(f.destroyed(), 1);
  const bad = fixture();
  const failedClose = createSyntheticReadDenialCandidate({ nonce, lease: bad.lease, factory: () => ({
    async request(r) { return denied(r.service === "ssm" ? "ssm:GetParameter" : "ecs:DescribeClusters"); },
    destroy() { throw Error("PRIVATE_SENTINEL"); } }) });
  await assert.rejects(failedClose.run(), rejected); assert.equal(bad.closed(), true);
});

test("close before run is inert and lease expiry after the first denial blocks the second request", async () => {
  const f = fixture();
  const unused = createSyntheticReadDenialCandidate({ nonce, lease: f.lease,
    factory: () => assert.fail("must not construct") });
  unused.close(); await assert.rejects(unused.run(), rejected); assert.equal(f.closed(), true);
  const expired = fixture(); let calls = 0;
  const candidate = createSyntheticReadDenialCandidate({ nonce, lease: expired.lease, factory: () => ({
    async request() { calls++; expired.expire(); return denied("ssm:GetParameter"); }, destroy: expired.destroy }) });
  await assert.rejects(candidate.run(), rejected); assert.equal(calls, 1); assert.equal(expired.closed(), true);
});

test("a throwing credential cleanup still destroys transport and cannot return a successful result", async () => {
  const f = fixture(); let destroyed = 0;
  const candidate = createSyntheticReadDenialCandidate({ nonce, lease: { ...f.lease,
    close() { f.lease.close(); throw Error("PRIVATE_SENTINEL"); } }, factory: () => ({
    async request(r) { return denied(r.service === "ssm" ? "ssm:GetParameter" : "ecs:DescribeClusters"); },
    destroy() { destroyed++; } }) });
  await assert.rejects(candidate.run(), rejected); assert.equal(f.closed(), true); assert.equal(destroyed, 1);
});
