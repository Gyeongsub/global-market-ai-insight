import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createSyntheticComputeDenialTransport as create, type SyntheticComputeDenialWire } from "../src/synthetic-compute-denial-transport.js";
const account = "123456789012", prefix = "global-market-ai-insight-dev", region = "ap-northeast-1";
const ownerArn = `arn:aws:iam::${account}:user/aws-admin-user`, clusterArn = `arn:aws:ecs:${region}:${account}:cluster/${prefix}-worker`;
const taskArn = `arn:aws:ecs:${region}:${account}:task-definition/${prefix}-worker:7`;
const scope = () => ({ account, ownerArn, nonce: "a".repeat(32), checkedAtMs: 1000,
  controller: { FunctionName: `${prefix}-controller`, FunctionArn: `arn:aws:lambda:${region}:${account}:function:${prefix}-controller`,
    State: "Active", LastUpdateStatus: "Successful", Environment: { Variables: { API_AUTH_MODE: "AWS_IAM", PRIVATE_OWNER_USER_ARN: ownerArn,
      ENABLE_PROVIDER_BACKED_JOBS: "false", ENABLE_LIVE_RESULT_DISPLAY: "false", WORKER_CLUSTER: clusterArn, WORKER_TASK_DEFINITION: taskArn,
      WORKER_SUBNET_IDS: `subnet-${"a".repeat(17)},subnet-${"b".repeat(17)}`, WORKER_SECURITY_GROUP_ID: `sg-${"c".repeat(17)}` } } },
  taskDefinition: { taskDefinition: { taskDefinitionArn: taskArn, status: "ACTIVE", networkMode: "awsvpc", cpu: "256", memory: "512",
    compatibilities: ["EC2", "FARGATE"], containerDefinitions: [{ name: "worker", essential: true, readonlyRootFilesystem: true, user: "65532:65532",
      image: `${account}.dkr.ecr.${region}.amazonaws.com/${prefix}-worker@sha256:${"a".repeat(64)}` }] } },
  clusters: { failures: [], clusters: [{ clusterArn, clusterName: `${prefix}-worker`, status: "ACTIVE", registeredContainerInstancesCount: 0,
    runningTasksCount: 0, pendingTasksCount: 0, activeServicesCount: 0, capacityProviders: [], defaultCapacityProviderStrategy: [] }] },
  instances: { containerInstanceArns: [] },
});
const keys = () => ({ accessKeyId: `ASIA${"A".repeat(16)}`, secretAccessKey: "x".repeat(40), sessionToken: "fixture-only-session" });
const denied = (status = 400, action = "ecs:RunTask", layer = "session") => ({ status,
  body: JSON.stringify({ __type: "AccessDeniedException", message: `User private is not authorized to perform: ${action} on resource private with an explicit deny in ${layer === "session" ? "a session" : "an identity-based"} policy` }) });
const rejected = { message: "SYNTHETIC_COMPUTE_DENIAL_TRANSPORT_UNVERIFIED" };
function fixture() {
  const state = { sent: 0, destroyed: 0, now: 2000 }, wire: SyntheticComputeDenialWire = {
    async send() { state.sent++; return denied(); }, destroy() { state.destroyed++; },
  };
  const input = { scope: scope(), credentials: keys, now: () => state.now, wire };
  return { input, wire, state };
}

test("one signed EC2 request fixes host, scope, count, no public IP and exact IAM evidence", async () => {
  for (const status of [400, 403]) for (const layer of ["session", "identity"]) {
    const f = fixture();
    f.wire.send = async (headers, body) => {
      f.state.sent++;
      assert.equal(headers.host, "ecs.ap-northeast-1.amazonaws.com");
      assert.equal(headers["x-amz-target"], "AmazonEC2ContainerServiceV20141113.RunTask");
      assert.match(headers.authorization!, /ap-northeast-1\/ecs\/aws4_request/);
      assert.equal(headers["x-amz-security-token"], keys().sessionToken);
      const request = JSON.parse(body); assert.equal(request.count, 1); assert.equal(request.launchType, "EC2");
      assert.equal(request.capacityProviderStrategy, undefined); assert.equal(request.taskDefinition, taskArn);
      assert.equal(request.networkConfiguration.awsvpcConfiguration.assignPublicIp, "DISABLED");
      assert.doesNotMatch(body, /fixture-only|SecretAccessKey|FARGATE/);
      return denied(status, "ecs:RunTask", layer);
    };
    const transport = create(f.input), result = await transport.request(new AbortController().signal);
    assert.equal(result.accepted, true); assert.equal(result.action, "ecs:RunTask"); assert.equal(result.liveAuthorizationVerified, false);
    assert.equal(transport.snapshot().denialAccepted, true); assert.equal(f.state.sent, 1);
    transport.destroy(); transport.destroy(); assert.equal(f.state.destroyed, 1); assert.equal(transport.snapshot().wireClosed, true);
    await assert.rejects(transport.request(new AbortController().signal), rejected); assert.equal(f.state.sent, 1);
  }
});

test("success, no-capacity failure, wrong action and generic denial require reconciliation, never a pass", async () => {
  const responses = [
    { status: 200, body: '{"tasks":[{"taskArn":"private-task"}]}' },
    { status: 400, body: '{"__type":"ClientException","message":"No Container Instances were found"}' },
    denied(400, "iam:PassRole"), denied(400, "ecs:DescribeClusters"),
    { status: 403, body: '{"__type":"AccessDeniedException","message":"Access denied"}' },
    { status: 403, body: "PRIVATE_SENTINEL" }, { status: 429, body: denied().body },
  ];
  for (const response of responses) {
    const f = fixture(); f.wire.send = async () => { f.state.sent++; return response; };
    const transport = create(f.input); await assert.rejects(transport.request(new AbortController().signal), rejected);
    assert.equal(transport.snapshot().denialAccepted, false); assert.equal(transport.snapshot().wireRequests, 1);
    assert.equal(transport.snapshot().independentTaskReconciliationRequired, true);
    assert.doesNotMatch(JSON.stringify(transport.snapshot()), /private-task|PRIVATE_SENTINEL/); assert.equal(f.state.destroyed, 1);
  }
});

test("expired/reversed snapshots or invalid credentials cannot reach the wire", async () => {
  for (const mode of ["expired", "reverse", "keys", "changed-keys", "lease-error"] as const) {
    const f = fixture(); let credentialsRead = 0;
    f.input.credentials = () => {
      credentialsRead++;
      if (mode === "lease-error") throw Error("private-lease");
      return { ...keys(), sessionToken: mode === "keys" ? "bad" : mode === "changed-keys" && credentialsRead > 1 ? "changed-fixture-only" : keys().sessionToken };
    };
    const transport = create(f.input);
    if (mode === "expired") f.state.now = 31000;
    if (mode === "reverse") f.state.now = 1999;
    await assert.rejects(transport.request(new AbortController().signal), rejected);
    assert.equal(f.state.sent, 0); assert.equal(f.state.destroyed, 1);
  }
});

test("source mutation cannot replace the reviewed request or introduce a capacity provider", async () => {
  const f = fixture();
  f.wire.send = async (_headers, body) => { f.state.sent++; assert.equal(JSON.parse(body).taskDefinition, taskArn); return denied(); };
  const transport = create(f.input); f.input.scope.controller.Environment.Variables.WORKER_TASK_DEFINITION = "changed";
  f.input.scope.clusters.clusters[0]!.registeredContainerInstancesCount = 10;
  assert.equal((await transport.request(new AbortController().signal)).accepted, true); transport.destroy();
  // This proves a copied scope, not that AWS cannot change after the fresh read.
  assert.equal(f.state.sent, 1);
});

test("aborting before send or during a request destroys transport without retry", async () => {
  const early = fixture(), canceled = new AbortController(); canceled.abort(); const first = create(early.input);
  await assert.rejects(first.request(canceled.signal), rejected); assert.equal(early.state.sent, 0); assert.equal(early.state.destroyed, 1);
  const later = fixture(), abort = new AbortController();
  later.wire.send = async (_headers, _body, signal) => {
    later.state.sent++; abort.abort(); signal.throwIfAborted(); return denied();
  };
  const second = create(later.input); await assert.rejects(second.request(abort.signal), rejected);
  assert.equal(later.state.sent, 1); assert.equal(later.state.destroyed, 1);
  assert.equal(second.snapshot().denialAccepted, false);
});

test("invalid construction and transport exceptions are sanitized; failed close is not verified", async () => {
  const invalid = fixture(); invalid.input.scope.clusters.clusters[0]!.registeredContainerInstancesCount = 1;
  assert.throws(() => create(invalid.input), rejected); assert.equal(invalid.state.sent, 0); assert.equal(invalid.state.destroyed, 1);
  const failed = fixture(); failed.wire.send = async () => { failed.state.sent++; throw Error("PRIVATE_SENTINEL"); };
  failed.wire.destroy = () => { throw Error("PRIVATE_CLOSE"); };
  const transport = create(failed.input); await assert.rejects(transport.request(new AbortController().signal), rejected);
  assert.equal(transport.snapshot().closed, true); assert.equal(transport.snapshot().wireClosed, false);
  assert.throws(() => transport.destroy(), rejected);
});

test("native wire is exact TLS-verified ECS with error-only response reader and no live entry", () => {
  const code = readFileSync(new URL("../src/synthetic-compute-denial-transport.ts", import.meta.url), "utf8");
  assert.match(code, /minVersion: "TLSv1\.2", rejectUnauthorized: true/);
  assert.match(code, /readSyntheticDenialResponse\(response, signal\)/);
  assert.doesNotMatch(code, /process\.argv|console\.|defaultProvider|fromNodeProviderChain|writeFile|spawnSync/);
});
