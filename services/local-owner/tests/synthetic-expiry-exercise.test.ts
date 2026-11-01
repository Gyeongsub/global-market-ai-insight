import assert from "node:assert/strict";
import test from "node:test";
import { createSyntheticExpiryExercise } from "../src/synthetic-expiry-exercise.js";
import { createSyntheticExpiryTransport } from "../src/synthetic-expiry-transport.js";
import { SYNTHETIC_LAB_ROLE_NAME, syntheticModelPolicy, syntheticRoleTrust } from "../../../shared/security/synthetic-lab-policy.js";
import type { SyntheticRoleOperation } from "../src/synthetic-role-acquisition.js";

const account = "123456789012", owner = `arn:aws:iam::${account}:user/aws-admin-user`, nonce = "b".repeat(32);
const roleId = `AROA${"X".repeat(17)}`, base = Date.parse("2026-10-30T00:00:00.000Z");
const failure = { message: "SYNTHETIC_EXPIRY_EXERCISE_UNVERIFIED" };
function success() { return { stopReason: "tool_use", usage: { inputTokens: 800, outputTokens: 100, totalTokens: 900 },
  output: { message: { content: [{ toolUse: { name: "select_grounded_insights", input: {
    observationIds: ["QUOTE_SNAPSHOT", "QUOTE_CHANGE"], riskIds: ["MARKET_PRICE_RISK", "QLD_LEVERAGED_DOWNSIDE", "QLD_PATH_DEPENDENCY"],
    specialConsiderationIds: ["DATA_PROVENANCE", "QLD_DAILY_RESET"], uncertaintyId: "SINGLE_QUOTE_NO_FORECAST" } } }] } } }; }
function denial(layer = "session") { return { __type: "AccessDeniedException",
  message: `PRIVATE_SENTINEL is not authorized to perform bedrock:InvokeModel with an explicit deny in ${layer === "session" ? "a session" : "an identity-based"} policy` }; }
type Options = { badPolicy?: boolean; controlBad?: boolean; controlThrows?: boolean; afterSuccess?: boolean;
  badError?: boolean; wrongLayer?: boolean; badDateAt?: number; driftAtWait?: number; reverseAtWait?: boolean;
  closeAtWait?: boolean; badUsage?: boolean; closeThrows?: boolean; stuckWait?: boolean; abortBefore?: boolean;
  cancelFactory?: boolean; cancelSend?: boolean; zeroCacheUsage?: boolean; nonzeroCacheUsage?: boolean; nullCacheUsage?: boolean;
  additionalUsageMetadata?: boolean; legacyErrorType?: boolean };
function fixture(o: Options = {}) {
  let wall = base, mono = 0, sends = 0, destroys = 0, waits = 0, windowEnd = 0, raw: any;
  const operations: string[] = [], sent: Array<{ body: string; time: number }> = [], signal = new AbortController();
  if (o.abortBefore) signal.abort();
  const advance = (ms: number) => { wall += ms; mono += ms; };
  const input = { identity: { Account: account, Arn: owner }, nonce, now: () => wall, elapsed: () => mono, signal: signal.signal,
    async wait(ms: number, abort: AbortSignal) {
      assert.ok(ms > 0 && ms <= 10000); waits++; if (!o.stuckWait) advance(ms);
      if (o.closeAtWait) signal.abort(); if (o.driftAtWait) wall += o.driftAtWait;
      if (o.reverseAtWait) wall = base - 1; abort.throwIfAborted();
    },
    call(operation: SyntheticRoleOperation, args: readonly string[]) {
      operations.push(operation); const issued = wall; advance(100);
      if (operation === "get-role") return { Role: { RoleName: SYNTHETIC_LAB_ROLE_NAME,
        Arn: `arn:aws:iam::${account}:role/${SYNTHETIC_LAB_ROLE_NAME}`, RoleId: roleId, Path: "/", MaxSessionDuration: 3600,
        AssumeRolePolicyDocument: syntheticRoleTrust(owner, account) } };
      if (operation === "list-attached-role-policies") return { AttachedPolicies: [], IsTruncated: false };
      if (operation === "list-role-policies") return { PolicyNames: ["TokyoNovaLiteOnly"], IsTruncated: false };
      if (operation === "get-role-policy") return { RoleName: SYNTHETIC_LAB_ROLE_NAME, PolicyName: "TokyoNovaLiteOnly", PolicyDocument: o.badPolicy ? {} : syntheticModelPolicy() };
      const policy = JSON.parse(args[args.indexOf("--policy") + 1]!);
      windowEnd = Date.parse(policy.Statement.at(-1).Condition.DateGreaterThanEquals["aws:CurrentTime"]);
      raw = { Credentials: { AccessKeyId: `ASIA${"X".repeat(16)}`, SecretAccessKey: "x".repeat(40), SessionToken: "synthetic-test-only-token",
        Expiration: new Date(issued + 900000).toISOString() }, AssumedRoleUser: {
        Arn: `arn:aws:sts::${account}:assumed-role/${SYNTHETIC_LAB_ROLE_NAME}/gmai-synthetic-${nonce}`,
        AssumedRoleId: `${roleId}:gmai-synthetic-${nonce}` }, PackedPolicySize: 12 };
      return raw;
    } };
  let retained: ReturnType<Parameters<typeof createSyntheticExpiryTransport>[0]> | undefined;
  const exercise = createSyntheticExpiryExercise(input, async credentials => {
    retained = credentials();
    const transport = await createSyntheticExpiryTransport(credentials, {
    async send(headers, body, abort) {
      abort.throwIfAborted(); sends++; sent.push({ body, time: wall });
      if (o.cancelSend) { signal.abort(); await Promise.resolve(); }
      assert.match(headers.authorization!, /\/ap-northeast-1\/bedrock\/aws4_request/);
      if (sends === 1 && o.controlThrows) throw Error("PRIVATE_SENTINEL");
      const result = success(); if (o.badUsage) result.usage.outputTokens = 9000;
      if (o.zeroCacheUsage || o.nonzeroCacheUsage) Object.assign(result.usage,
        { cacheReadInputTokens: o.nonzeroCacheUsage ? 1 : 0, cacheWriteInputTokens: 0, cacheDetails: [] });
      if (o.nullCacheUsage) Object.assign(result.usage, { cacheReadInputTokens: null, cacheWriteInputTokens: null, cacheDetails: null });
      if (o.additionalUsageMetadata) Object.assign(result.usage, { futureMetadata: "PRIVATE_SENTINEL", futureCounter: 123 });
      return { status: sends === 1 || o.afterSuccess ? 200 : 403,
        ...(sends === 2 && o.legacyErrorType ? { errorType: "AccessDeniedException:https://example.invalid/detail" } : {}),
        serverDate: new Date(o.badDateAt === sends ? base - 60000 : wall).toUTCString(),
        body: JSON.stringify(sends === 1 ? o.controlBad ? {} : result : o.afterSuccess ? result : o.badError ? { __type: "ValidationException" } : denial(o.wrongLayer ? "identity" : "session")) };
    }, destroy() { destroys++; if (o.closeThrows) throw Error("PRIVATE_SENTINEL"); }
    });
    if (o.cancelFactory) { signal.abort(); await Promise.resolve(); }
    return transport;
  });
  return { exercise, operations, sent, signal, raw: () => raw, retained: () => retained,
    counts: () => ({ sends, destroys, waits, windowEnd }) };
}

test("one assumption, identical fixed requests straddling absolute policy window, verified control and clearing", async () => {
  const f = fixture(); assert.equal(f.operations.length, 0);
  const result = await f.exercise.run();
  assert.equal(f.operations.filter(x => x === "assume-role").length, 1);
  assert.equal(f.counts().sends, 2); assert.equal(f.counts().destroys, 1);
  assert.equal(f.sent[0]!.body, f.sent[1]!.body);
  assert.ok(f.sent[0]!.time < f.counts().windowEnd); assert.ok(f.sent[1]!.time >= f.counts().windowEnd + 10000);
  assert.ok(f.counts().waits <= 31); assert.deepEqual(f.raw().Credentials, {});
  assert.equal(result.serverSideExpiryVerified, true); assert.equal(result.usage.totalTokens, 900);
  assert.equal(f.exercise.snapshot().credentialsRetained, false); assert.equal(f.exercise.snapshot().closed, true);
  assert.deepEqual(f.retained(), { accessKeyId: "", secretAccessKey: "", sessionToken: "" });
  assert.doesNotMatch(JSON.stringify(result) + JSON.stringify(f.exercise.snapshot()), /PRIVATE|ASIA|123456789012|synthetic-test-only/);
  await assert.rejects(f.exercise.run(), failure); f.exercise.close(); assert.equal(f.counts().destroys, 1);
});

for (const [name, options, count] of [
  ["policy mismatch", { badPolicy: true }, 0], ["pre-cancel", { abortBefore: true }, 0],
  ["invalid control", { controlBad: true }, 1], ["lost control", { controlThrows: true }, 1],
  ["invalid usage", { badUsage: true }, 1], ["bad control server time", { badDateAt: 1 }, 1],
  ["clock skew", { driftAtWait: 6000 }, 1], ["clock reversal", { reverseAtWait: true }, 1],
  ["cancel during wait", { closeAtWait: true }, 1], ["unexpected second success", { afterSuccess: true }, 2],
  ["generic error", { badError: true }, 2], ["wrong policy layer", { wrongLayer: true }, 2],
  ["bad post-window server time", { badDateAt: 2 }, 2], ["cleanup failure", { closeThrows: true }, 2],
  ["nonadvancing wait", { stuckWait: true }, 1], ["late factory", { cancelFactory: true }, 0],
  ["late control response", { cancelSend: true }, 1],
] as const) {
  test(`expiry experiment fails closed without retry: ${name}`, async () => {
    const f = fixture(options); await assert.rejects(f.exercise.run(), failure);
    assert.equal(f.counts().sends, count); assert.equal(f.exercise.snapshot().credentialsRetained, false);
    assert.equal(f.exercise.snapshot().closed, true);
    assert.ok(f.operations.filter(x => x === "assume-role").length <= 1);
    if (f.raw()) assert.deepEqual(f.raw().Credentials, {});
    if (f.retained()) assert.deepEqual(f.retained(), { accessKeyId: "", secretAccessKey: "", sessionToken: "" });
    await assert.rejects(f.exercise.run(), failure);
  });
}

test("duplicate run while waiting cannot dispatch another request or assumption", async () => {
  const f = fixture(); const first = f.exercise.run();
  await assert.rejects(f.exercise.run(), failure); await first;
  assert.equal(f.counts().sends, 2); assert.equal(f.operations.filter(x => x === "assume-role").length, 1);
});

test("documented zero cache metadata is normalized without enabling prompt caching", async () => {
  const f = fixture({ zeroCacheUsage: true });
  assert.equal((await f.exercise.run()).positiveControlVerified, true);
  assert.deepEqual(f.exercise.snapshot().controlUsage, { inputTokens: 800, outputTokens: 100, totalTokens: 900 });
  const unsafe = fixture({ nonzeroCacheUsage: true });
  await assert.rejects(unsafe.exercise.run(), failure);
  assert.equal(unsafe.counts().sends, 1);
  assert.equal(unsafe.exercise.snapshot().diagnostics.normalizationFailure, "CACHE_READ_USAGE");
  const cap = fixture({ zeroCacheUsage: true, badUsage: true });
  await assert.rejects(cap.exercise.run(), failure); assert.equal(cap.counts().sends, 1);
});

test("null optional metadata preserves domain validation and never grants extra attempts", async () => {
  const f = fixture({ nullCacheUsage: true });
  assert.equal((await f.exercise.run()).positiveControlVerified, true);
  assert.equal(f.counts().sends, 2);
  assert.equal(f.exercise.snapshot().diagnostics.normalizationFailure, null);
  const bad = fixture({ nullCacheUsage: true, badUsage: true });
  await assert.rejects(bad.exercise.run(), failure);
  assert.equal(bad.counts().sends, 1);
  assert.equal(bad.exercise.snapshot().diagnostics.checkpoint, "CONTROL_RESULT");
  assert.equal(bad.exercise.snapshot().credentialsRetained, false);
});

test("additional service usage metadata is discarded without changing bounded execution or validation", async () => {
  const f = fixture({ additionalUsageMetadata: true });
  assert.equal((await f.exercise.run()).positiveControlVerified, true);
  assert.equal(f.counts().sends, 2);
  assert.equal(f.operations.filter(x => x === "assume-role").length, 1);
  assert.deepEqual(f.exercise.snapshot().controlUsage, { inputTokens: 800, outputTokens: 100, totalTokens: 900 });
  assert.doesNotMatch(JSON.stringify(f.exercise.snapshot()), /PRIVATE_SENTINEL|futureMetadata|futureCounter/);
  for (const options of [{ badUsage: true }, { nonzeroCacheUsage: true }]) {
    const bad = fixture({ ...options, additionalUsageMetadata: true });
    await assert.rejects(bad.exercise.run(), failure);
    assert.equal(bad.counts().sends, 1);
    assert.equal(bad.exercise.snapshot().credentialsRetained, false);
  }
});

test("operator diagnostics distinguish failed stages and preserve cleanup separately", async () => {
  for (const [options, checkpoint, status] of [
    [{ controlThrows: true }, "CONTROL_REQUEST", null], [{ controlBad: true }, "CONTROL_NORMALIZATION", 200],
    [{ badUsage: true }, "CONTROL_RESULT", 200], [{ badDateAt: 1 }, "CONTROL_SERVER_TIME", 200],
    [{ nonzeroCacheUsage: true }, "CONTROL_NORMALIZATION", 200], [{ wrongLayer: true }, "POST_WINDOW_DENIAL", 200],
  ] as const) {
    const f = fixture(options); await assert.rejects(f.exercise.run(), failure);
    const snapshot = f.exercise.snapshot();
    assert.equal(snapshot.diagnostics.checkpoint, checkpoint);
    assert.equal(snapshot.diagnostics.controlHttpStatus, status);
    assert.equal(snapshot.diagnostics.denialFailure, checkpoint === "POST_WINDOW_DENIAL" ? "POLICY_LAYER" : null);
    assert.equal(snapshot.closed, true); assert.equal(snapshot.credentialsRetained, false);
    assert.doesNotMatch(JSON.stringify(snapshot), /PRIVATE|ASIA|123456789012|synthetic-test-only/);
  }
  const f = fixture({ closeThrows: true }); await assert.rejects(f.exercise.run(), failure);
  assert.equal(f.exercise.snapshot().diagnostics.cleanupFailed, true);
});

test("post-window diagnostic records only a fixed error-code category without relaxing acceptance", async () => {
  const f = fixture({ badError: true });
  await assert.rejects(f.exercise.run(), failure);
  const snapshot = f.exercise.snapshot();
  assert.equal(snapshot.diagnostics.denialFailure, "ERROR_CODE");
  assert.equal(snapshot.positiveControlVerified, true);
  assert.equal(snapshot.serverSideExpiryVerified, false);
  assert.equal(snapshot.modelRequestAttempts, 2);
  assert.equal(snapshot.credentialsRetained, false);
  assert.doesNotMatch(JSON.stringify(snapshot), /PRIVATE|ASIA|123456789012|ValidationException/);
});

test("protocol-normalized error retains exact policy, timing, request count and credential cleanup requirements", async () => {
  const f = fixture({ legacyErrorType: true });
  const result = await f.exercise.run();
  assert.equal(result.serverSideExpiryVerified, true);
  assert.equal(f.counts().sends, 2);
  assert.equal(f.exercise.snapshot().diagnostics.denialFailure, null);
  assert.equal(f.exercise.snapshot().credentialsRetained, false);
  assert.doesNotMatch(JSON.stringify(result) + JSON.stringify(f.exercise.snapshot()), /example\.invalid|PRIVATE|ASIA/);
  const wrong = fixture({ legacyErrorType: true, wrongLayer: true });
  await assert.rejects(wrong.exercise.run(), failure);
  assert.equal(wrong.exercise.snapshot().diagnostics.denialFailure, "POLICY_LAYER");
  assert.equal(wrong.exercise.snapshot().serverSideExpiryVerified, false);
});
