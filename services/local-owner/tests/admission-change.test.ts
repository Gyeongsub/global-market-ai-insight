import assert from "node:assert/strict";
import test from "node:test";
import { createOwnerAdmissionChangePlan, OWNER_ADMISSION_CHANGE_LIMITS } from "../src/admission-change.js";
import { parseControllerRuntimeConfig } from "../../controller/src/runtime-config.js";

const account = "000000000000", prefix = "global-market-ai-insight-dev", at = Date.parse("2026-10-25T00:00:00.000Z");
const codeSha256 = Buffer.alloc(32, 1).toString("base64");
const scope = { ownerUserArn: `arn:aws:iam::${account}:user/local-owner`, controllerCodeSha256: codeSha256 };
function baseline() {
  return { functionArn: `arn:aws:lambda:ap-northeast-1:${account}:function:${prefix}-controller`,
    revisionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", codeSha256, stableConfigurationSha256: "a".repeat(64), state: "Active", lastUpdateStatus: "Successful",
    environment: { JOBS_TABLE_NAME: `${prefix}-jobs`, WORKER_CLUSTER: `arn:aws:ecs:ap-northeast-1:${account}:cluster/${prefix}-worker`,
      WORKER_TASK_DEFINITION: `arn:aws:ecs:ap-northeast-1:${account}:task-definition/${prefix}-worker:10`, WORKER_SUBNET_IDS: "subnet-12345678,subnet-87654321",
      WORKER_SECURITY_GROUP_ID: "sg-12345678", JOB_TIMEOUT_SECONDS: "90", JOB_TTL_SECONDS: "86400", MAX_JOBS_PER_MINUTE: "5", MAX_ACTIVE_JOBS: "2",
      CIRCUIT_STATE: "CLOSED", API_AUTH_MODE: "AWS_IAM", ENABLE_PROVIDER_BACKED_JOBS: "false", ENABLE_LIVE_RESULT_DISPLAY: "false", PRIVATE_OWNER_USER_ARN: scope.ownerUserArn },
  };
}
const plan = () => createOwnerAdmissionChangePlan(baseline(), scope, at);
const secondRevision = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

test("pure enable plan changes exactly one flag and two absolute timestamps with conditional revision", () => {
  const before = baseline(), p = createOwnerAdmissionChangePlan(before, scope, at), change = p.prepareEnable(before, at + 1);
  assert.equal(change.kind, "update-environment"); if (change.kind !== "update-environment") throw Error();
  assert.equal(change.expectedRevisionId, before.revisionId); assert.equal(change.functionArn, before.functionArn);
  const changed = Object.keys(change.variables).filter(key => change.variables[key] !== before.environment[key as keyof typeof before.environment]).sort();
  assert.deepEqual(changed, ["ENABLE_PROVIDER_BACKED_JOBS", "OWNER_JOB_WINDOW_END", "OWNER_JOB_WINDOW_START"]);
  assert.equal(change.variables.ENABLE_LIVE_RESULT_DISPLAY, "false");
  const parsed = parseControllerRuntimeConfig({ ...change.variables, AWS_REGION: "ap-northeast-1" });
  assert.equal(parsed.ownerAdmissionWindow!.expiresAtMs - parsed.ownerAdmissionWindow!.startsAtMs, 180000);
  assert.equal(Object.isFrozen(change.variables), true);
  assert.throws(() => p.prepareEnable(before, at + 2), /^Error: OWNER_ADMISSION_CHANGE_UNVERIFIED$/);
  assert.deepEqual(p.snapshot(), { enablePlanConsumed: true, restorePlanConsumed: false, awsCalls: 0, cloudMutations: 0,
    independentlyVerified: false, executionAuthorized: false, remoteClosureVerified: false });
});

test("restore removes only owned window and restores disabled baseline without renewing timestamps", () => {
  for (const enabledFlag of ["true", "false"]) {
    const p = plan(), enable = p.prepareEnable(baseline(), at);
    if (enable.kind !== "update-environment") throw Error();
    const current = { ...baseline(), revisionId: secondRevision, environment: { ...enable.variables, ENABLE_PROVIDER_BACKED_JOBS: enabledFlag } };
    const restored = p.prepareRestore(current);
    assert.equal(restored.kind, "update-environment"); if (restored.kind !== "update-environment") throw Error();
    assert.equal(restored.expectedRevisionId, secondRevision); assert.deepEqual(restored.variables, baseline().environment);
    assert.equal(Object.hasOwn(restored.variables, "OWNER_JOB_WINDOW_START"), false); assert.equal(Object.hasOwn(restored.variables, "OWNER_JOB_WINDOW_END"), false);
    assert.throws(() => p.prepareRestore(current)); assert.throws(() => p.prepareEnable(baseline(), at));
  }
});

test("already-restored state creates no write plan and consumes future enabling", () => {
  const p = plan();
  assert.deepEqual(p.prepareRestore({ ...baseline(), revisionId: secondRevision }), { kind: "already-restored" });
  assert.throws(() => p.prepareEnable(baseline(), at)); assert.equal(p.snapshot().cloudMutations, 0);
});

test("stale, future, invalid and changed-revision plans fail before environment payload generation", () => {
  for (const now of [at - 1, at + OWNER_ADMISSION_CHANGE_LIMITS.freshPlanMs, NaN, Infinity, at + 0.5]) {
    const p = plan(); assert.throws(() => p.prepareEnable(baseline(), now)); assert.equal(p.snapshot().enablePlanConsumed, true);
  }
  assert.throws(() => plan().prepareEnable({ ...baseline(), revisionId: secondRevision }, at));
  for (const start of [-1, NaN, Infinity, 253402300799999]) assert.throws(() => createOwnerAdmissionChangePlan(baseline(), scope, start));
});

test("unsafe baseline, unknown/private fields, foreign scope and existing window are refused", () => {
  for (const mutate of [
    (b: any) => { b.environment.EXTRA = "PRIVATE_SENTINEL"; }, (b: any) => { b.environment.ENABLE_PROVIDER_BACKED_JOBS = "true"; },
    (b: any) => { b.environment.ENABLE_LIVE_RESULT_DISPLAY = "true"; }, (b: any) => { b.environment.API_AUTH_MODE = "NONE"; },
    (b: any) => { b.environment.PRIVATE_OWNER_USER_ARN = `arn:aws:iam::${account}:user/other`; },
    (b: any) => { b.functionArn = b.functionArn.replace(account, "111111111111"); },
    (b: any) => { b.environment.WORKER_CLUSTER += "-foreign"; }, (b: any) => { b.environment.JOBS_TABLE_NAME = "other-table"; },
    (b: any) => { b.codeSha256 = Buffer.alloc(32, 2).toString("base64"); }, (b: any) => { b.lastUpdateStatus = "InProgress"; },
    (b: any) => { b.state = "Pending"; }, (b: any) => { b.environment.OWNER_JOB_WINDOW_START = new Date(at).toISOString(); },
    (b: any) => { b.private = "PRIVATE_SENTINEL"; },
  ]) { const b = baseline(); mutate(b); assert.throws(() => createOwnerAdmissionChangePlan(b, scope, at), /^Error: OWNER_ADMISSION_CHANGE_UNVERIFIED$/); }
});

test("restore refuses unrelated drift or another window instead of overwriting concurrent changes", () => {
  for (const mutate of [
    (b: any) => { b.environment.MAX_ACTIVE_JOBS = "3"; }, (b: any) => { b.environment.WORKER_TASK_DEFINITION = b.environment.WORKER_TASK_DEFINITION.replace(":10", ":11"); },
    (b: any) => { b.environment.OWNER_JOB_WINDOW_START = new Date(at + 1).toISOString(); },
    (b: any) => { b.environment.OWNER_JOB_WINDOW_END = new Date(at + 180001).toISOString(); },
    (b: any) => { b.environment.PRIVATE_OWNER_USER_ARN = `arn:aws:iam::${account}:user/other`; },
    (b: any) => { b.stableConfigurationSha256 = "b".repeat(64); }, (b: any) => { b.environment.EXTRA = "PRIVATE_SENTINEL"; },
    (b: any) => { delete b.environment.OWNER_JOB_WINDOW_START; },
  ]) {
    const p = plan(), change = p.prepareEnable(baseline(), at); if (change.kind !== "update-environment") throw Error();
    const current = { ...baseline(), revisionId: secondRevision, environment: { ...change.variables } }; mutate(current);
    assert.throws(() => p.prepareRestore(current), /^Error: OWNER_ADMISSION_CHANGE_UNVERIFIED$/);
    assert.equal(p.snapshot().restorePlanConsumed, true); assert.equal(p.snapshot().remoteClosureVerified, false);
  }
});

test("caller mutation cannot widen captured owner, code, baseline or fixed expiry", () => {
  const original = baseline(), expected = { ...scope }, p = createOwnerAdmissionChangePlan(original, expected, at);
  original.environment.MAX_ACTIVE_JOBS = "5"; expected.ownerUserArn = "PRIVATE_SENTINEL";
  const change = p.prepareEnable(baseline(), at); if (change.kind !== "update-environment") throw Error();
  assert.equal(change.variables.MAX_ACTIVE_JOBS, "2"); assert.equal(change.variables.PRIVATE_OWNER_USER_ARN, scope.ownerUserArn);
  assert.deepEqual(p.window, { startsAtMs: at, expiresAtMs: at + 180000 });
});
