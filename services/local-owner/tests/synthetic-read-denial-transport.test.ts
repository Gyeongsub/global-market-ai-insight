import test from "node:test";
import assert from "node:assert/strict";
import https from "node:https";
import { EventEmitter } from "node:events";
import { syncBuiltinESMExports } from "node:module";
import { createSyntheticReadDenialTransport, type SyntheticReadDenialWire } from "../src/synthetic-read-denial-transport.js";
import { createSyntheticReadDenialCandidate, syntheticReadDenialRequests } from "../src/synthetic-read-denial.js";

const nonce = "b".repeat(32), specs = syntheticReadDenialRequests(nonce);
const failure = { message: "SYNTHETIC_READ_DENIAL_TRANSPORT_UNVERIFIED" };
// Invented fixtures only, never AWS credentials or a live network request.
const fake = () => ({ accessKeyId: `ASIA${"X".repeat(16)}`, secretAccessKey: "x".repeat(40), sessionToken: "fixture-session-token" });
const denial = () => ({ status: 400, body: '{"__type":"AccessDeniedException","message":"fixture"}' });
const signal = () => new AbortController().signal;

test("native request and private agent explicitly require verified TLS without opening a socket", async () => {
  const original = https.request;
  let observed: https.RequestOptions | undefined, requests = 0;
  // Intercept the actual native adapter boundary; never connect to AWS or use
  // real credentials. Restore ESM bindings even when an assertion fails.
  https.request = ((_url: unknown, options: https.RequestOptions) => {
    requests++; observed = options;
    const req = new EventEmitter() as EventEmitter & { end(): void; destroy(): unknown };
    req.end = () => { queueMicrotask(() => req.emit("error", Error("FIXTURE_SOCKET_ERROR"))); };
    req.destroy = () => req;
    return req;
  }) as typeof https.request;
  syncBuiltinESMExports();
  let transport: ReturnType<typeof createSyntheticReadDenialTransport> | undefined;
  try {
    transport = createSyntheticReadDenialTransport(nonce, fake);
    await assert.rejects(transport.request(specs[0]!, signal()), failure);
    assert.equal(requests, 1);
    assert.equal(observed?.rejectUnauthorized, true);
    assert.equal(observed?.minVersion, "TLSv1.2");
    const agent = observed?.agent as https.Agent;
    assert.notEqual(agent, https.globalAgent);
    assert.equal(agent.options.rejectUnauthorized, true);
    assert.equal(agent.options.minVersion, "TLSv1.2");
    assert.equal(agent.options.keepAlive, false);
    await assert.rejects(transport.request(specs[1]!, signal()), failure);
    assert.equal(requests, 1);
  } finally {
    transport?.destroy(); https.request = original; syncBuiltinESMExports();
  }
});

function fixture(send?: SyntheticReadDenialWire["send"]) {
  let count = 0, destroyed = 0, checks = 0;
  const key = fake();
  const wire: SyntheticReadDenialWire = { async send(...args) { count++; return send ? send(...args) : denial(); }, destroy() { destroyed++; } };
  const transport = createSyntheticReadDenialTransport(nonce, () => { checks++; return key; }, wire);
  return { transport, key, count: () => count, destroyed: () => destroyed, checks: () => checks };
}

test("inert construction; exactly two ordered fixed requests are signed with explicit temporary credentials", async () => {
  const seen: string[] = [];
  const f = fixture(async (url, headers, body, abort) => {
    const spec = specs[seen.length]!;
    assert.equal(url, spec.endpoint); assert.equal(body, spec.body); assert.equal(abort.aborted, false);
    assert.equal(headers.host, new URL(url).hostname); assert.equal(headers["x-amz-target"], spec.target);
    assert.equal(headers["content-length"], String(Buffer.byteLength(body)));
    assert.equal(headers["x-amz-security-token"], fake().sessionToken);
    assert.match(headers.authorization!, /^AWS4-HMAC-SHA256 Credential=ASIAX{16}\//);
    assert.ok(headers.authorization!.includes(`/ap-northeast-1/${spec.service}/aws4_request`));
    seen.push(url); return denial();
  });
  assert.equal(f.count(), 0); assert.equal(f.checks(), 0);
  assert.deepEqual(await f.transport.request(specs[0]!, signal()), denial());
  assert.deepEqual(await f.transport.request(specs[1]!, signal()), denial());
  assert.equal(f.count(), 2); assert.equal(f.checks(), 4);
  await assert.rejects(f.transport.request(specs[0]!, signal()), failure);
  assert.equal(f.count(), 2); assert.equal(f.destroyed(), 1); f.transport.destroy(); assert.equal(f.destroyed(), 1);
});

test("tampered endpoint, target, body, extra field, order and pre-abort fail before obtaining credentials", async () => {
  for (const spec of [{ ...specs[0]!, endpoint: "https://example.invalid/" }, { ...specs[0]!, target: "AmazonSSM.GetParameters" },
    { ...specs[0]!, body: '{"Name":"/private","WithDecryption":true}' }, { ...specs[0]!, extra: true }, specs[1]!]) {
    const f = fixture(); await assert.rejects(f.transport.request(spec as typeof specs[0], signal()), failure);
    assert.equal(f.count(), 0); assert.equal(f.checks(), 0); assert.equal(f.destroyed(), 1);
  }
  const f = fixture(), controller = new AbortController(); controller.abort();
  await assert.rejects(f.transport.request(specs[0]!, controller.signal), failure); assert.equal(f.checks(), 0);
});

test("invalid nonce and throwing cleanup never leak raw failure details", () => {
  let destroyed = 0;
  assert.throws(() => createSyntheticReadDenialTransport("bad", fake, {
    send: async () => assert.fail("no request"), destroy() { destroyed++; throw Error("PRIVATE_SENTINEL"); }
  }), failure); assert.equal(destroyed, 1);
});

test("no default provider or long-lived key fallback; malformed credentials block dispatch", async () => {
  for (const key of [undefined, { ...fake(), accessKeyId: `AKIA${"X".repeat(16)}` }, { ...fake(), secretAccessKey: "bad" },
    { ...fake(), sessionToken: "bad\nheader" }, { ...fake(), sessionToken: "x".repeat(20001) }]) {
    let calls = 0;
    const transport = createSyntheticReadDenialTransport(nonce, () => key as ReturnType<typeof fake>, {
      async send() { calls++; return denial(); }, destroy() {} });
    await assert.rejects(transport.request(specs[0]!, signal()), failure); assert.equal(calls, 0);
  }
});

test("expiry and credential replacement during signing block dispatch", async () => {
  for (const expire of [true, false]) {
    let checks = 0, calls = 0;
    const transport = createSyntheticReadDenialTransport(nonce, () => {
      if (++checks === 1) return fake();
      if (expire) throw Error("PRIVATE_SENTINEL");
      return { ...fake(), sessionToken: "replacement-session-token" };
    }, { async send() { calls++; return denial(); }, destroy() {} });
    await assert.rejects(transport.request(specs[0]!, signal()), failure); assert.equal(calls, 0);
  }
});

test("unexpected success, redirects, oversized or malformed envelopes are never returned", async () => {
  for (const result of [{ status: 200, body: "PRIVATE_SENTINEL" }, { status: 301, body: "" },
    { status: 403, body: "x".repeat(16385) }, { status: 403, body: null },
    { ...denial(), errorType: "x".repeat(257) }, null]) {
    const f = fixture(async () => result as ReturnType<typeof denial>);
    await assert.rejects(f.transport.request(specs[0]!, signal()), failure);
    await assert.rejects(f.transport.request(specs[1]!, signal()), failure);
    assert.equal(f.count(), 1); assert.equal(f.destroyed(), 1);
  }
});

test("parallel request closes the transport, cancels the first and cannot multiply dispatch", async () => {
  let observed: AbortSignal | undefined, finish: ((v: ReturnType<typeof denial>) => void) | undefined;
  const f = fixture(async (_url, _headers, _body, abort) => { observed = abort; return new Promise(resolve => { finish = resolve; }); });
  const first = assert.rejects(f.transport.request(specs[0]!, signal()), failure);
  await new Promise(resolve => setImmediate(resolve)); assert.equal(f.count(), 1);
  await assert.rejects(f.transport.request(specs[1]!, signal()), failure); await first;
  assert.equal(observed?.aborted, true); assert.equal(f.count(), 1); assert.equal(f.destroyed(), 1);
  finish?.(denial());
});

test("20-second deadline aborts an uncooperative wire without retries or late success", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let observed: AbortSignal | undefined;
  const f = fixture(async (_url, _headers, _body, abort) => { observed = abort; return new Promise(() => {}); });
  const pending = assert.rejects(f.transport.request(specs[0]!, signal()), failure);
  await new Promise(resolve => setImmediate(resolve)); t.mock.timers.tick(20000); await pending;
  assert.equal(observed?.aborted, true); assert.equal(f.count(), 1); assert.equal(f.destroyed(), 1);
});

test("caller cancellation and explicit destroy prevent successful completion and suppress raw wire errors", async () => {
  for (const mode of ["parent", "destroy", "error"] as const) {
    const controller = new AbortController();
    const f = fixture(async () => {
      if (mode === "parent") controller.abort();
      else if (mode === "destroy") f.transport.destroy();
      else throw Error("PRIVATE_SENTINEL");
      return denial();
    });
    await assert.rejects(f.transport.request(specs[0]!, controller.signal), failure);
    assert.equal(f.destroyed(), 1); assert.equal(f.count(), 1);
  }
});

test("candidate, signed transport and strict reviewer compose without live IAM claims or credential retention", async () => {
  const key = { ...fake(), expiration: new Date() }; let closed = false, calls = 0, destroyed = 0;
  const lease = { getCredentials() { if (closed) throw Error("PRIVATE_SENTINEL"); return key; },
    close() { closed = true; key.accessKeyId = key.secretAccessKey = key.sessionToken = ""; },
    remainingMs: () => closed ? 0 : 300000, toJSON: () => ({ mode: "test-only" } as any) };
  const candidate = createSyntheticReadDenialCandidate({ nonce, lease, factory: credentials =>
    createSyntheticReadDenialTransport(nonce, credentials, {
      async send(_url, headers) {
        const action = calls++ === 0 ? "ssm:GetParameter" : "ecs:DescribeClusters";
        assert.ok(headers.authorization);
        return { status: 400, body: JSON.stringify({ __type: "AccessDeniedException",
          message: `User PRIVATE_SENTINEL is not authorized to perform ${action} with an explicit deny in a session policy` }) };
      }, destroy() { destroyed++; }
    }) });
  const result = await candidate.run();
  assert.equal(calls, 2); assert.equal(destroyed, 1); assert.equal(closed, true); assert.equal(key.accessKeyId, "");
  assert.equal(result.liveAuthorizationVerified, false); assert.equal(result.inferenceCalls, 0);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_SENTINEL|AWS4-HMAC-SHA256|fixture-session-token|AccessDeniedException/);
});
