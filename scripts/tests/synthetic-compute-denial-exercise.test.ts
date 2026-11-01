import assert from "node:assert/strict";
import test from "node:test";
import { collectSyntheticComputeScope, exerciseSyntheticComputeDenial as exercise } from "../synthetic-compute-denial-exercise.js";
import { SYNTHETIC_LAB_ROLE_NAME, syntheticModelPolicy, syntheticRoleTrust } from "../../shared/security/synthetic-lab-policy.js";
const account = "123456789012", ownerArn = `arn:aws:iam::${account}:user/aws-admin-user`, nonce = "a".repeat(32);
const prefix = "global-market-ai-insight-dev", clusterArn = `arn:aws:ecs:ap-northeast-1:${account}:cluster/${prefix}-worker`;
const taskDefinitionArn = `arn:aws:ecs:ap-northeast-1:${account}:task-definition/${prefix}-worker:7`;
const roleId = `AROA${"X".repeat(17)}`, start = Date.parse("2026-10-31T01:00:00Z");
function fixture(options: { denied?: boolean; abortDuringWire?: boolean; journalFails?: boolean; cleanupReadFails?: boolean;
  failRole?: boolean; scopeChange?: (controller: any) => void; age?: number; destroyFails?: boolean } = {}) {
  const controller = { FunctionName: `${prefix}-controller`, FunctionArn: `arn:aws:lambda:ap-northeast-1:${account}:function:${prefix}-controller`,
    State: "Active", LastUpdateStatus: "Successful", Environment: { Variables: { API_AUTH_MODE: "AWS_IAM", PRIVATE_OWNER_USER_ARN: ownerArn,
      ENABLE_PROVIDER_BACKED_JOBS: "false", ENABLE_LIVE_RESULT_DISPLAY: "false", WORKER_CLUSTER: clusterArn, WORKER_TASK_DEFINITION: taskDefinitionArn,
      WORKER_SUBNET_IDS: `subnet-${"a".repeat(17)},subnet-${"b".repeat(17)}`, WORKER_SECURITY_GROUP_ID: `sg-${"c".repeat(17)}` } } };
  options.scopeChange?.(controller);
  const calls: string[] = [], records: any[] = [], abort = new AbortController();
  let now = start, raw: any, sends = 0, destroys = 0;
  const input: Parameters<typeof exercise>[0] = { identity: { Account: account, Arn: ownerArn, UserId: `AIDA${"X".repeat(17)}` }, nonce, now: () => now,
    signal: abort.signal, wait: async () => {}, record: state => { if (options.journalFails) throw Error("private-journal"); records.push(state); },
    roleCall(operation) {
      calls.push(operation); if (options.failRole) throw Error("private-role");
      if (operation === "get-role") return { Role: { RoleName: SYNTHETIC_LAB_ROLE_NAME, Arn: `arn:aws:iam::${account}:role/${SYNTHETIC_LAB_ROLE_NAME}`,
        RoleId: roleId, Path: "/", MaxSessionDuration: 3600, AssumeRolePolicyDocument: syntheticRoleTrust(ownerArn, account) } };
      if (operation === "list-attached-role-policies") return { AttachedPolicies: [], IsTruncated: false };
      if (operation === "list-role-policies") return { PolicyNames: ["TokyoNovaLiteOnly"], IsTruncated: false };
      if (operation === "get-role-policy") return { RoleName: SYNTHETIC_LAB_ROLE_NAME, PolicyName: "TokyoNovaLiteOnly", PolicyDocument: syntheticModelPolicy() };
      raw = { Credentials: { AccessKeyId: `ASIA${"X".repeat(16)}`, SecretAccessKey: "x".repeat(40), SessionToken: "synthetic-test-only-token",
        Expiration: new Date(start + 900000).toISOString() }, AssumedRoleUser: { Arn: `arn:aws:sts::${account}:assumed-role/${SYNTHETIC_LAB_ROLE_NAME}/gmai-synthetic-${nonce}`,
        AssumedRoleId: `${roleId}:gmai-synthetic-${nonce}` }, PackedPolicySize: 12 }; return raw;
    },
    ownerCall(service, operation, args, cleanup) {
      calls.push(operation); assert.ok(!args.some(v => /ASIA|synthetic-test-only-token/.test(v)));
      if (cleanup) { assert.equal(service, "ecs"); assert.equal(operation, "list-tasks");
        if (options.cleanupReadFails) throw Error("private-cleanup"); return { taskArns: [] }; }
      if (operation === "get-function-configuration") return controller;
      if (operation === "describe-task-definition") return { taskDefinition: { taskDefinitionArn, status: "ACTIVE", networkMode: "awsvpc", cpu: "256", memory: "512",
        compatibilities: ["EC2", "FARGATE"], containerDefinitions: [{ name: "worker", essential: true, readonlyRootFilesystem: true, user: "65532:65532",
          image: `${account}.dkr.ecr.ap-northeast-1.amazonaws.com/${prefix}-worker@sha256:${"a".repeat(64)}` }] } };
      if (operation === "describe-clusters") return { failures: [], clusters: [{ clusterArn, clusterName: `${prefix}-worker`, status: "ACTIVE",
        registeredContainerInstancesCount: 0, runningTasksCount: 0, pendingTasksCount: 0, activeServicesCount: 0, capacityProviders: [], defaultCapacityProviderStrategy: [] }] };
      assert.equal(operation, "list-container-instances"); now += options.age ?? 0; return { containerInstanceArns: [] };
    },
    wire: { async send(headers, body) {
      sends++; assert.match(headers.authorization!, /ASIA/); const request = JSON.parse(body);
      assert.equal(request.launchType, "EC2"); assert.equal(request.count, 1); assert.equal(request.startedBy, `gmai${nonce}`);
      if (options.abortDuringWire) abort.abort();
      if (options.denied === false) return { status: 200, body: "private-success-not-proof" };
      return { status: 400, body: JSON.stringify({ __type: "AccessDeniedException", message: "User is not authorized to perform: ecs:RunTask with an explicit deny in a session policy" }) };
    }, destroy() { destroys++; if (options.destroyFails) throw Error("private-destroy"); } },
  };
  return { input, abort, calls, records, sends: () => sends, destroys: () => destroys, raw: () => raw, run: () => exercise(input) };
}
test("one restricted request follows exact role and fresh scope reads; close precedes reconciliation", async () => {
  const f = fixture(), r = await f.run(); assert.equal(r.completed, true); assert.equal(r.runTaskRequests, 1);
  assert.equal(r.credentialLeaseClosed, true); assert.equal(r.transportClosed, true); assert.equal(r.reconciliation?.observedEmpty, true);
  assert.equal(r.scopeReads, 4); assert.equal(r.inferenceCalls, 0); assert.equal(r.providerCalls, 0); assert.equal(f.sends(), 1); assert.equal(f.destroys(), 1);
  assert.deepEqual(f.raw().Credentials, {}); assert.equal(f.calls.filter(v => v === "assume-role").length, 1);
  assert.deepEqual(f.calls.slice(-5), ["get-function-configuration", "describe-task-definition", "describe-clusters", "list-container-instances", "list-tasks"]);
  assert.equal(f.records.find(v => v.stage === "reconcile").credentialLeaseClosed, true);
  assert.doesNotMatch(JSON.stringify(r), /123456789012|arn:|private-|ASIA|synthetic-test/);
});
test("unexpected success and cancellation still close keys and perform bounded reconciliation", async () => {
  for (const options of [{ denied: false }, { abortDuringWire: true }]) {
    const f = fixture(options), r = await f.run(); assert.equal(r.completed, false); assert.equal(r.primaryError, true);
    assert.equal(r.credentialLeaseClosed, true); assert.equal(r.transportClosed, true); assert.equal(r.reconciliation?.unresolvedCommit, true);
    assert.equal(f.calls.filter(v => v === "list-tasks").length, 3); assert.equal(f.sends(), 1);
  }
});
test("failed cleanup or wire destruction is not converted to successful acceptance", async () => {
  for (const options of [{ cleanupReadFails: true }, { destroyFails: true }]) {
    const f = fixture(options), r = await f.run(); assert.equal(r.completed, false); assert.equal(r.cleanupError, true);
    assert.equal(r.credentialLeaseClosed, true); assert.equal(f.calls.includes("list-tasks"), true);
  }
});
test("invalid or stale scope and failed journal cannot send a compute request", async () => {
  for (const options of [{ age: 30000 }, { journalFails: true }, { scopeChange: (v: any) => v.Environment.Variables.ENABLE_PROVIDER_BACKED_JOBS = "true" },
    { scopeChange: (v: any) => v.Environment.Variables.WORKER_TASK_DEFINITION = "--attacker" }]) {
    const f = fixture(options), r = await f.run(); assert.equal(r.completed, false); assert.equal(f.sends(), 0); assert.equal(r.credentialLeaseClosed, true);
    assert.equal(f.calls.includes("list-tasks"), false);
  }
});
test("pre-abort or failed role acquisition has no owner mutation or transport", async () => {
  const a = fixture(); a.abort.abort(); const ar = await a.run(); assert.equal(ar.completed, false); assert.deepEqual(a.calls, []);
  const b = fixture({ failRole: true }), br = await b.run(); assert.equal(br.completed, false); assert.deepEqual(b.calls, ["get-role"]);
  assert.equal(a.sends() + b.sends(), 0);
});
test("collector rejects foreign references before they reach an owner CLI call", () => {
  const f = fixture({ scopeChange: (v: any) => v.Environment.Variables.WORKER_CLUSTER = "foreign" });
  assert.throws(() => collectSyntheticComputeScope({ identity: f.input.identity, nonce, now: f.input.now, call: f.input.ownerCall }));
  assert.deepEqual(f.calls, ["get-function-configuration"]);
});
