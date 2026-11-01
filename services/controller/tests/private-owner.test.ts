import assert from "node:assert/strict";
import test from "node:test";
import { parsePrivateOwnerArn, isPrivateOwnerRequest } from "../src/private-owner.js";
import { createHandler, buildAwsHandler } from "../src/http-handler.js";
import type { ControllerService } from "../src/controller-service.js";

// Reserved synthetic identity only. No credentials, SDK calls or real account.
const account = "000000000000";
const owner = `arn:aws:iam::${account}:user/local-owner`;
const cluster = `arn:aws:ecs:ap-northeast-1:${account}:cluster/local-contract-cluster`;
const context = () => ({ accountId: account, requestId: "owner-request-1",
  authorizer: { iam: { userArn: owner, accountId: account } } });
const event = () => ({ version: "2.0", routeKey: "GET /v1/assets", requestContext: context() });

test("owner configuration binds one IAM user to the workload account and partition", () => {
  assert.equal(parsePrivateOwnerArn(owner, cluster), owner);
  assert.equal(parsePrivateOwnerArn(undefined, cluster), null);
  assert.equal(parsePrivateOwnerArn("", cluster), null);
  for (const value of [null, false, [], {}, owner + "*", owner + "\n", owner.replace(account, "111111111111"),
    owner.replace("arn:aws:", "arn:aws-cn:"), owner.replace("user/local-owner", "root"),
    owner.replace("iam::", "sts::").replace("user/", "assumed-role/"), "x".repeat(513)]) {
    assert.throws(() => parsePrivateOwnerArn(value, cluster), /^Error: Private owner configuration is invalid\.$/);
  }
});

test("only exact gateway IAM owner context is accepted, never headers or request content", () => {
  assert.equal(isPrivateOwnerRequest(event(), owner), true);
  for (const input of [null, [], {}, { ...event(), version: "1.0" },
    { ...event(), requestContext: {} }, { ...event(), requestContext: { ...context(), accountId: "111111111111" } },
    { ...event(), requestContext: { ...context(), authorizer: { iam: { accountId: account, userArn: owner + "-other" } } } },
    { ...event(), requestContext: { ...context(), authorizer: { iam: { accountId: "111111111111", userArn: owner } } } },
    { ...event(), requestContext: { ...context(), authorizer: { jwt: {}, ...context().authorizer } } },
    { ...event(), requestContext: { ...context(), authorizer: { lambda: {}, ...context().authorizer } } },
    { version: "2.0", headers: { "x-owner-arn": owner }, body: JSON.stringify({ requestContext: context() }) },
    { ...event(), requestContext: { ...context(), authorizer: { iam: { accountId: account,
      userArn: `arn:aws:sts::${account}:assumed-role/local-owner/session` } } } },
  ]) assert.equal(isPrivateOwnerRequest(input, owner), false);
  for (const configured of [null, "", "*", owner + "\n"]) assert.equal(isPrivateOwnerRequest(event(), configured), false);
});

test("denied routes cannot read a job, circuit or body, write state, launch or log identities", async (t) => {
  const logs: string[] = [];
  t.mock.method(console, "warn", (...values: unknown[]) => { logs.push(values.map(String).join(" ")); });
  let serviceReads = 0;
  const unreachable = new Proxy({}, { get() { serviceReads++; throw Error("must not reach service"); } }) as ControllerService;
  const run = createHandler(unreachable, e => isPrivateOwnerRequest(e, owner));
  for (const routeKey of ["GET /v1/assets", "GET /v1/health", "GET /v1/jobs/{jobId}", "POST /v1/jobs", "$default"]) {
    const denied = { routeKey, requestContext: { requestId: "private\nmarker" },
      get body(): string { throw Error("must not read private body"); } };
    const result = await run(denied);
    assert.equal(result.statusCode, 403);
    assert.equal(result.headers["cache-control"], "no-store");
    assert.deepEqual(JSON.parse(result.body), { error: { code: "ACCESS_DENIED", message: "Access is not permitted.", requestId: "unknown" } });
  }
  assert.equal(serviceReads, 0);
  assert.doesNotMatch(logs.join(""), /local-owner|000000000000|private|arn:/);
});

test("authorized owner retains existing routing, with no implicit job execution enablement", async () => {
  let healthReads = 0;
  const service = { async health() { healthReads++; return { circuit: "OPEN", jobCreationEnabled: false }; } } as unknown as ControllerService;
  const run = createHandler(service, e => isPrivateOwnerRequest(e, owner));
  assert.equal((await run(event())).statusCode, 200);
  const health = await run({ ...event(), routeKey: "GET /v1/health" });
  assert.deepEqual(JSON.parse(health.body), { circuit: "OPEN", jobCreationEnabled: false });
  assert.equal(healthReads, 1);
});

test("production AWS factory always enforces owner identity, including omitted configuration", async (t) => {
  t.mock.method(console, "warn", () => {});
  const env = { AWS_REGION: "ap-northeast-1", JOBS_TABLE_NAME: "local-contract-jobs",
    WORKER_CLUSTER: cluster, WORKER_TASK_DEFINITION: `arn:aws:ecs:ap-northeast-1:${account}:task-definition/local-contract-task:3`,
    WORKER_SUBNET_IDS: "subnet-0123456789abcdef0", WORKER_SECURITY_GROUP_ID: "sg-0123456789abcdef0",
    JOB_TIMEOUT_SECONDS: "90", JOB_TTL_SECONDS: "604800", CIRCUIT_STATE: "OPEN", MAX_JOBS_PER_MINUTE: "2", MAX_ACTIVE_JOBS: "2",
    API_AUTH_MODE: "AWS_IAM", ENABLE_PROVIDER_BACKED_JOBS: "false", ENABLE_LIVE_RESULT_DISPLAY: "false" };
  const locked = buildAwsHandler(env);
  assert.equal((await locked(event())).statusCode, 403);
  const configured = buildAwsHandler({ ...env, PRIVATE_OWNER_USER_ARN: owner });
  assert.equal((await configured({ routeKey: "GET /v1/assets" })).statusCode, 403);
  // Catalog is local; this proves production wiring without touching SDK/network.
  assert.equal((await configured(event())).statusCode, 200);
});
