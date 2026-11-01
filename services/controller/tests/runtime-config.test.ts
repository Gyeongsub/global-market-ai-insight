import assert from "node:assert/strict";
import test from "node:test";
import { parseControllerRuntimeConfig } from "../src/runtime-config.js";

const valid = {
  AWS_REGION: "ap-northeast-1", JOBS_TABLE_NAME: "global-market-ai-insight-dev-jobs",
  // Synthetic all-zero account; these fixtures never authenticate or call AWS.
  WORKER_CLUSTER: "arn:aws:ecs:ap-northeast-1:000000000000:cluster/local-contract-cluster",
  WORKER_TASK_DEFINITION: "arn:aws:ecs:ap-northeast-1:000000000000:task-definition/local-contract-task:3",
  WORKER_SUBNET_IDS: "subnet-0123456789abcdef0,subnet-11111111111111111",
  WORKER_SECURITY_GROUP_ID: "sg-0123456789abcdef0", JOB_TIMEOUT_SECONDS: "90",
  JOB_TTL_SECONDS: "604800", CIRCUIT_STATE: "CLOSED",
  MAX_JOBS_PER_MINUTE: "2",
  MAX_ACTIVE_JOBS: "2",
  API_AUTH_MODE: "AWS_IAM",
  ENABLE_PROVIDER_BACKED_JOBS: "false", ENABLE_LIVE_RESULT_DISPLAY: "false",
};

test("parses only bounded controller runtime settings", () => {
  const parsed = parseControllerRuntimeConfig(valid);
  assert.equal(parsed.jobTimeoutSeconds, 90);
  assert.equal(parsed.jobTtlSeconds, 604_800);
  assert.equal(parsed.subnetIds.length, 2);
  assert.equal(parsed.enableProviderBackedJobs, false);
  assert.equal(parsed.maxActiveJobs, 2);
  assert.equal(parsed.apiAuthMode, "AWS_IAM");
  assert.equal(parsed.privateOwnerUserArn, null);
  assert.equal(parsed.ownerAdmissionWindow, null);
});

test("runtime owner must belong to the same account as the pinned worker resources", () => {
  const owner = "arn:aws:iam::000000000000:user/local-owner";
  assert.equal(parseControllerRuntimeConfig({ ...valid, PRIVATE_OWNER_USER_ARN: owner }).privateOwnerUserArn, owner);
  assert.throws(() => parseControllerRuntimeConfig({ ...valid, PRIVATE_OWNER_USER_ARN: owner.replace("000000000000", "111111111111") }), /Private owner configuration/);
});

test("execution flag requires IAM and remains independently gated by an absent admission window", () => {
  const parsed = parseControllerRuntimeConfig({ ...valid, ENABLE_PROVIDER_BACKED_JOBS: "true" });
  assert.equal(parsed.enableProviderBackedJobs, true);
  assert.equal(parsed.enableLiveResultDisplay, false);
  assert.equal(parsed.ownerAdmissionWindow, null);
  assert.throws(() => parseControllerRuntimeConfig({ ...valid, API_AUTH_MODE: "NONE", ENABLE_PROVIDER_BACKED_JOBS: "true" }), /AWS_IAM/);
});

test("runtime window requires an exact configured owner and never renews its fixed timestamps", () => {
  const settings = { OWNER_JOB_WINDOW_START: "2026-10-25T00:00:00.000Z", OWNER_JOB_WINDOW_END: "2026-10-25T00:05:00.000Z" };
  assert.throws(() => parseControllerRuntimeConfig({ ...valid, ...settings }), /Owner admission window configuration/);
  const parsed = parseControllerRuntimeConfig({ ...valid, ...settings, PRIVATE_OWNER_USER_ARN: "arn:aws:iam::000000000000:user/local-owner" });
  assert.deepEqual(parsed.ownerAdmissionWindow, { startsAtMs: Date.parse(settings.OWNER_JOB_WINDOW_START), expiresAtMs: Date.parse(settings.OWNER_JOB_WINDOW_END) });
});

test("rejects unsafe or malformed network and circuit settings", () => {
  assert.throws(() => parseControllerRuntimeConfig({ ...valid, WORKER_SUBNET_IDS: "subnet-secret" }), /WORKER_SUBNET_IDS/);
  assert.throws(() => parseControllerRuntimeConfig({ ...valid, CIRCUIT_STATE: "HALF_OPEN" }), /CIRCUIT_STATE/);
  assert.throws(() => parseControllerRuntimeConfig({ ...valid, JOB_TIMEOUT_SECONDS: "9999" }), /JOB_TIMEOUT_SECONDS/);
  assert.throws(() => parseControllerRuntimeConfig({ ...valid, MAX_ACTIVE_JOBS: "0" }), /MAX_ACTIVE_JOBS/);
  assert.throws(() => parseControllerRuntimeConfig({ ...valid, ENABLE_LIVE_RESULT_DISPLAY: "true" }), /display rights/);
});

test("runtime configuration requires same-account same-region full ARNs with one concrete task revision", () => {
  for (const change of [
    { WORKER_CLUSTER: "local-contract-cluster" }, { WORKER_TASK_DEFINITION: "local-contract-task:3" },
    { WORKER_TASK_DEFINITION: valid.WORKER_TASK_DEFINITION.replace(":3", ":*") },
    { WORKER_TASK_DEFINITION: valid.WORKER_TASK_DEFINITION.replace("000000000000", "111111111111") },
    { WORKER_CLUSTER: valid.WORKER_CLUSTER.replace("ap-northeast-1", "us-east-1") },
  ]) assert.throws(() => parseControllerRuntimeConfig({ ...valid, ...change }), /resource scope is invalid/);
});
