import assert from "node:assert/strict";
import test from "node:test";
import { acquireSyntheticRoleLease, type SyntheticRoleOperation } from "../src/synthetic-role-acquisition.js";
import { SYNTHETIC_LAB_ROLE_NAME, syntheticModelPolicy, syntheticRoleTrust } from "../../../shared/security/synthetic-lab-policy.js";
import { createSyntheticReadDenialExercise } from "../src/synthetic-read-denial-exercise.js";
import { createSyntheticReadDenialTransport } from "../src/synthetic-read-denial-transport.js";

const account = "123456789012", owner = `arn:aws:iam::${account}:user/aws-admin-user`;
const nonce = "a".repeat(32), roleId = `AROA${"X".repeat(17)}`, start = Date.parse("2026-10-26T00:00:00.000Z");
const rejected = { message: "SYNTHETIC_ROLE_ACQUISITION_REJECTED" };
function fixture(options: { badPolicy?: boolean; failAt?: string; readMs?: number; assumeMs?: number; reverseAt?: string } = {}) {
  let now = start, raw: any;
  const calls: { operation: string; args: readonly string[] }[] = [];
  const input = { identity: { Account: account, Arn: owner }, nonce, now: () => now,
    call(operation: SyntheticRoleOperation, args: readonly string[]) {
      calls.push({ operation, args });
      if (operation === options.failAt) throw Error("PRIVATE_SENTINEL");
      const issuedAt = now;
      now += operation === "assume-role" ? options.assumeMs ?? 1000 : options.readMs ?? 1000;
      if (options.reverseAt === operation) now = start - 1;
      if (operation === "get-role") return { Role: { RoleName: SYNTHETIC_LAB_ROLE_NAME,
        Arn: `arn:aws:iam::${account}:role/${SYNTHETIC_LAB_ROLE_NAME}`, Path: "/", RoleId: roleId, MaxSessionDuration: 3600,
        AssumeRolePolicyDocument: syntheticRoleTrust(owner, account) } };
      if (operation === "list-attached-role-policies") return { AttachedPolicies: [], IsTruncated: false };
      if (operation === "list-role-policies") return { PolicyNames: ["TokyoNovaLiteOnly"], IsTruncated: false };
      if (operation === "get-role-policy") return { RoleName: SYNTHETIC_LAB_ROLE_NAME, PolicyName: "TokyoNovaLiteOnly",
        PolicyDocument: options.badPolicy ? {} : syntheticModelPolicy() };
      raw = { Credentials: { AccessKeyId: `ASIA${"X".repeat(16)}`, SecretAccessKey: "x".repeat(40), SessionToken: "synthetic-test-only-token",
        Expiration: new Date(issuedAt + 900000).toISOString() }, AssumedRoleUser: {
        Arn: `arn:aws:sts::${account}:assumed-role/${SYNTHETIC_LAB_ROLE_NAME}/gmai-synthetic-${nonce}`,
        AssumedRoleId: `${roleId}:gmai-synthetic-${nonce}` }, PackedPolicySize: 12 };
      return raw;
    } };
  return { input, calls, raw: () => raw, setTime: (n: number) => { now = n; } };
}

test("acquisition reads exact role and policy then assumes once with remaining absolute window", () => {
  const f = fixture(), lease = acquireSyntheticRoleLease(f.input);
  assert.deepEqual(f.calls.map(c => c.operation), ["get-role", "list-attached-role-policies", "list-role-policies", "get-role-policy", "assume-role"]);
  assert.equal(lease.remainingMs(), 299000);
  const args = f.calls[4]!.args, policy = JSON.parse(args[args.indexOf("--policy") + 1]!);
  assert.equal(policy.Statement.at(-1).Condition.DateGreaterThanEquals["aws:CurrentTime"], new Date(start + 304000).toISOString());
  assert.deepEqual(f.raw().Credentials, {});
  assert.doesNotMatch(JSON.stringify(lease), /ASIA|123456789012|synthetic-test-only|"secretAccessKey":|x{40}/);
  const borrowed = lease.getCredentials(); lease.close(); assert.equal(borrowed.accessKeyId, ""); assert.equal(lease.remainingMs(), 0);
});

test("changed policy or failed read prevents assumption, with no retry/fallback or private error", () => {
  for (const options of [{ badPolicy: true }, { failAt: "get-role" }, { failAt: "get-role-policy" }, { reverseAt: "get-role" }, { readMs: 23000 }]) {
    const f = fixture(options); assert.throws(() => acquireSyntheticRoleLease(f.input), rejected);
    assert.equal(f.calls.some(c => c.operation === "assume-role"), false);
  }
  const denied = fixture({ failAt: "assume-role" }); assert.throws(() => acquireSyntheticRoleLease(denied.input), rejected);
  assert.equal(denied.calls.filter(c => c.operation === "assume-role").length, 1);
});

test("late or clock-reversed assumption consumes raw keys and never returns a lease", () => {
  for (const options of [{ assumeMs: 30001 }, { reverseAt: "assume-role" }]) {
    const f = fixture(options); assert.throws(() => acquireSyntheticRoleLease(f.input), rejected);
    assert.deepEqual(f.raw().Credentials, {});
  }
});

test("unknown owner/nonce causes zero CLI calls; expiry never renews authorization", () => {
  for (const alteration of [{ identity: { Account: account, Arn: "PRIVATE_SENTINEL" } }, { nonce: "*" }]) {
    const f = fixture(); assert.throws(() => acquireSyntheticRoleLease({ ...f.input, ...alteration }), rejected); assert.equal(f.calls.length, 0);
  }
  const f = fixture(), lease = acquireSyntheticRoleLease(f.input), credentials = lease.getCredentials();
  f.setTime(start + 304000); assert.equal(lease.remainingMs(), 0); assert.equal(credentials.sessionToken, "");
  assert.equal(f.calls.length, 5);
});

test("read-denial exercise composes fresh policy reads, one assumption, two signed denials and clearing", async () => {
  const f = fixture(); let requests = 0, destroyed = 0;
  const exercise = createSyntheticReadDenialExercise(f.input, (n, credentials) => createSyntheticReadDenialTransport(n, credentials, {
    async send() {
      const action = requests++ === 0 ? "ssm:GetParameter" : "ecs:DescribeClusters";
      return { status: 400, body: JSON.stringify({ __type: "AccessDeniedException",
        message: `User PRIVATE_SENTINEL is not authorized to perform ${action} with an explicit deny in a session policy` }) };
    }, destroy() { destroyed++; }
  }));
  assert.equal(f.calls.length, 0); assert.equal(requests, 0);
  const result = await exercise.run();
  assert.equal(f.calls.length, 5); assert.equal(f.calls.filter(c => c.operation === "assume-role").length, 1);
  assert.equal(requests, 2); assert.equal(destroyed, 1); assert.deepEqual(f.raw().Credentials, {});
  assert.equal(result.credentialLeaseClosed, true); assert.equal(result.liveAuthorizationVerified, false);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_SENTINEL|synthetic-test-only|123456789012/);
  await assert.rejects(exercise.run(), { message: "SYNTHETIC_READ_DENIAL_EXERCISE_UNVERIFIED" });
  exercise.close(); assert.equal(destroyed, 1);
});

test("read-denial exercise blocks policy mismatch and cleans failure without retries", async () => {
  for (const badPolicy of [true, false]) {
    const f = fixture({ badPolicy }); let constructed = 0, requests = 0, destroyed = 0;
    const exercise = createSyntheticReadDenialExercise(f.input, (n, credentials) => {
      constructed++;
      return createSyntheticReadDenialTransport(n, credentials, {
        async send() { requests++; throw Error("PRIVATE_SENTINEL"); }, destroy() { destroyed++; }
      });
    });
    await assert.rejects(exercise.run(), { message: "SYNTHETIC_READ_DENIAL_EXERCISE_UNVERIFIED" });
    assert.equal(constructed, badPolicy ? 0 : 1); assert.equal(requests, badPolicy ? 0 : 1);
    assert.equal(destroyed, badPolicy ? 0 : 1);
    assert.equal(f.calls.filter(c => c.operation === "assume-role").length, badPolicy ? 0 : 1);
    if (!badPolicy) assert.deepEqual(f.raw().Credentials, {});
  }
});

test("closing an unstarted exercise is inert; closing an active exercise aborts and clears", async () => {
  const unused = fixture(), idle = createSyntheticReadDenialExercise(unused.input);
  idle.close(); await assert.rejects(idle.run()); assert.equal(unused.calls.length, 0);
  const f = fixture(); let destroyed = 0, aborted: AbortSignal | undefined;
  let borrowed: { accessKeyId: string } | undefined;
  const exercise = createSyntheticReadDenialExercise(f.input, (n, credentials) => {
    borrowed = credentials();
    return createSyntheticReadDenialTransport(n, credentials, {
      async send(_url, _headers, _body, signal) { aborted = signal; return new Promise(() => {}); },
      destroy() { destroyed++; }
    });
  });
  const pending = assert.rejects(exercise.run(), { message: "SYNTHETIC_READ_DENIAL_EXERCISE_UNVERIFIED" });
  await new Promise(resolve => setImmediate(resolve)); exercise.close(); await pending;
  assert.equal(aborted?.aborted, true); assert.equal(destroyed, 1); assert.equal(borrowed!.accessKeyId, "");
});
