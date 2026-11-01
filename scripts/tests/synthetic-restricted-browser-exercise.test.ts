import assert from "node:assert/strict";
import test from "node:test";
import { exerciseRestrictedSyntheticBrowser as exercise } from "../synthetic-restricted-browser-exercise.js";
import { SYNTHETIC_LAB_ROLE_NAME, syntheticModelPolicy, syntheticRoleTrust } from "../../shared/security/synthetic-lab-policy.js";
const account = "123456789012", owner = `arn:aws:iam::${account}:user/aws-admin-user`, nonce = "a".repeat(32);
const roleId = `AROA${"X".repeat(17)}`, now = Date.parse("2026-10-31T01:00:00Z");
function fixture(options: { attempts?: number; failStart?: boolean; failClose?: boolean; failReady?: boolean; failJournal?: boolean;
  failRole?: boolean; badOrigin?: string; abortOnStart?: boolean; finishRejected?: boolean; keepListener?: boolean } = {}) {
  const calls: string[] = [], records: any[] = [], signal = new AbortController();
  let finished!: () => void, rejectFinish!: (error: Error) => void;
  const done = new Promise<void>((resolve, reject) => { finished = resolve; rejectFinish = reject; });
  let raw: any, borrowed: any, ready = 0, closes = 0, closed = false, modelAttempts = 0;
  const input: Parameters<typeof exercise>[0] = { identity: { Account: account, Arn: owner, UserId: `AIDA${"X".repeat(17)}` }, nonce,
    now: () => now, signal: signal.signal,
    roleCall(operation) {
      calls.push(operation); if (options.failRole) throw Error("PRIVATE_SENTINEL");
      if (operation === "get-role") return { Role: { RoleName: SYNTHETIC_LAB_ROLE_NAME,
        Arn: `arn:aws:iam::${account}:role/${SYNTHETIC_LAB_ROLE_NAME}`, RoleId: roleId, Path: "/", MaxSessionDuration: 3600,
        AssumeRolePolicyDocument: syntheticRoleTrust(owner, account) } };
      if (operation === "list-attached-role-policies") return { AttachedPolicies: [], IsTruncated: false };
      if (operation === "list-role-policies") return { PolicyNames: ["TokyoNovaLiteOnly"], IsTruncated: false };
      if (operation === "get-role-policy") return { RoleName: SYNTHETIC_LAB_ROLE_NAME, PolicyName: "TokyoNovaLiteOnly", PolicyDocument: syntheticModelPolicy() };
      raw = { Credentials: { AccessKeyId: `ASIA${"X".repeat(16)}`, SecretAccessKey: "x".repeat(40), SessionToken: "synthetic-test-only-token",
        Expiration: new Date(now + 900000).toISOString() }, AssumedRoleUser: {
        Arn: `arn:aws:sts::${account}:assumed-role/${SYNTHETIC_LAB_ROLE_NAME}/gmai-synthetic-${nonce}`,
        AssumedRoleId: `${roleId}:gmai-synthetic-${nonce}` }, PackedPolicySize: 12 }; return raw;
    },
    record: state => { if (options.failJournal) throw Error("PRIVATE_SENTINEL"); records.push(state); },
    start: async lease => {
      borrowed = lease.getCredentials(); if (options.failStart) throw Error("PRIVATE_SENTINEL");
      if (options.abortOnStart) signal.abort();
      return { origin: options.badOrigin ?? "http://127.0.0.1:4175", finished: done,
        close: async () => { closes++; closed = !options.keepListener; finished(); if (options.failClose) throw Error("PRIVATE_SENTINEL"); },
        snapshot: () => ({ closed, listening: !closed, requests: 0, capabilityRetained: !closed, resultRetained: false, modelAttempts }) };
    },
    ready: origin => {
      ready++; assert.equal(origin, "http://127.0.0.1:4175"); assert.equal(modelAttempts, 0);
      if (options.failReady) throw Error("PRIVATE_SENTINEL");
      // Simulate the already-tested server admission, not a real paid call.
      modelAttempts = options.attempts ?? 0;
      if (options.finishRejected) rejectFinish(Error("PRIVATE_SENTINEL")); else finished();
    },
  };
  return { input, signal, calls, records, raw: () => raw, borrowed: () => borrowed, ready: () => ready, closes: () => closes, run: () => exercise(input) };
}
test("zero or one click allowance closes listener and borrowed keys without automatic invocation", async () => {
  for (const attempts of [0, 1]) {
    const f = fixture({ attempts }), r = await f.run(); assert.equal(r.completed, true); assert.equal(r.modelRequestAttempts, attempts);
    assert.equal(r.automaticModelCalls, 0); assert.equal(r.credentialLeaseClosed, true); assert.equal(r.listenerClosed, true);
    assert.equal(r.browserResultAcceptanceRequired, true); assert.equal(f.ready(), 1); assert.equal(f.closes(), 1);
    assert.deepEqual(f.raw().Credentials, {}); assert.equal(f.borrowed().secretAccessKey, "");
    assert.equal(f.calls.filter(v => v === "assume-role").length, 1);
    assert.doesNotMatch(JSON.stringify(r), /ASIA|PRIVATE_SENTINEL|123456789012|synthetic-test-only/);
  }
});
test("startup, ready, journal and server-end failures all clear the lease", async () => {
  for (const options of [{ failStart: true }, { failReady: true }, { failJournal: true }, { finishRejected: true }]) {
    const f = fixture(options), r = await f.run(); assert.equal(r.completed, false); assert.equal(r.credentialLeaseClosed, true);
    assert.equal(f.borrowed().accessKeyId, ""); assert.equal(f.raw().Credentials.AccessKeyId, undefined);
  }
});
test("failed close or surviving listener is never called safe closure", async () => {
  for (const options of [{ failClose: true }, { keepListener: true }]) {
    const f = fixture(options), r = await f.run(); assert.equal(r.completed, false); assert.equal(r.credentialLeaseClosed, true);
    assert.equal(f.closes(), 1);
  }
});
test("abort before acquisition or during startup never exposes a fresh UI", async () => {
  const a = fixture(); a.signal.abort(); const ar = await a.run(); assert.equal(ar.completed, false); assert.deepEqual(a.calls, []);
  const b = fixture({ abortOnStart: true }), br = await b.run(); assert.equal(br.completed, false);
  assert.equal(br.credentialLeaseClosed, true); assert.equal(b.ready(), 0); assert.equal(b.closes(), 1);
});
test("abort from ready closes without waiting for natural server expiry", async () => {
  const f = fixture(); f.input.ready = () => f.signal.abort();
  const r = await f.run(); assert.equal(r.completed, true); assert.equal(r.modelRequestAttempts, 0); assert.equal(r.listenerClosed, true);
});
test("foreign origins or an invalid observed request count never pass", async () => {
  for (const badOrigin of ["https://example.invalid", "http://0.0.0.0:4175", "http://127.0.0.1:4175/?private=1"]) {
    const f = fixture({ badOrigin }), r = await f.run(); assert.equal(r.completed, false); assert.equal(r.credentialLeaseClosed, true); assert.equal(f.ready(), 0);
  }
  const f = fixture({ attempts: 2 }), r = await f.run(); assert.equal(r.completed, false); assert.equal(r.modelRequestAttempts, null);
  assert.equal(r.credentialLeaseClosed, true);
});
test("rejected acquisition never constructs a listener", async () => {
  const f = fixture({ failRole: true }), r = await f.run(); assert.equal(r.completed, false); assert.equal(f.ready(), 0); assert.equal(f.closes(), 0);
  assert.equal(r.modelRequestAttempts, 0); assert.deepEqual(f.calls, ["get-role"]);
});
