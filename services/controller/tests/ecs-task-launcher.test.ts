import assert from "node:assert/strict";
import test from "node:test";
import { RunTaskCommand } from "@aws-sdk/client-ecs";
import { EcsFargateTaskLauncher, TaskLaunchError, controllerEcsConfig, type ControllerEcsSender } from "../src/ecs-task-launcher.js";

const jobId = "job_0123456789abcdef0123456789abcdef0123456789abcdef";
// All-zero account and deterministic task IDs are synthetic, never live targets.
const options = {
  region: "ap-northeast-1",
  cluster: "arn:aws:ecs:ap-northeast-1:000000000000:cluster/local-contract-cluster",
  taskDefinition: "arn:aws:ecs:ap-northeast-1:000000000000:task-definition/local-contract-task:3",
  subnetIds: ["subnet-0123456789abcdef0"], securityGroupId: "sg-0123456789abcdef0",
};
const taskArn = "arn:aws:ecs:ap-northeast-1:000000000000:task/local-contract-cluster/" + "a".repeat(32);
function task() {
  return { taskArn, clusterArn: options.cluster, taskDefinitionArn: options.taskDefinition,
    startedBy: jobId.slice(0, 36), launchType: "FARGATE", enableExecuteCommand: false,
    overrides: { containerOverrides: [{ name: "worker", environment: [{ name: "JOB_ID", value: jobId }] }] } };
}
function launcherReturning(response: unknown, counter = { value: 0 }) {
  return new EcsFargateTaskLauncher({ ...options,
    client: { async send() { counter.value += 1; return response; } } });
}

test("launches exactly one Fargate task with a deterministic token and JOB_ID-only override", async () => {
  const commands: RunTaskCommand[] = [];
  const client: ControllerEcsSender = {
    async send(command) { commands.push(command); return { tasks: [task()], failures: [] }; },
  };
  const launcher = new EcsFargateTaskLauncher({
    ...options,
    subnetIds: ["subnet-0123456789abcdef0", "subnet-11111111111111111"], securityGroupId: "sg-0123456789abcdef0", client,
  });
  assert.deepEqual(await launcher.launch(jobId), { taskArn });
  assert.equal(commands.length, 1);
  const input = commands[0]?.input;
  assert.equal(input?.count, 1);
  assert.equal(input?.launchType, "FARGATE");
  assert.equal(input?.clientToken?.length, 64);
  assert.equal(input?.cluster, options.cluster);
  assert.equal(input?.taskDefinition, options.taskDefinition);
  assert.equal(input?.enableExecuteCommand, false);
  assert.deepEqual(input?.overrides?.containerOverrides, [{ name: "worker", environment: [{ name: "JOB_ID", value: jobId }] }]);
  assert.equal(JSON.stringify(input).includes("TWELVE_DATA_API_KEY"), false);
});

test("pins ECS SDK retries and maps raw failures to a stable error", async () => {
  assert.equal(controllerEcsConfig("ap-northeast-1").maxAttempts, 1);
  const client: ControllerEcsSender = { async send() { throw new Error("credential and endpoint detail"); } };
  const launcher = new EcsFargateTaskLauncher({
    ...options,
    subnetIds: ["subnet-0123456789abcdef0"], securityGroupId: "sg-0123456789abcdef0", client,
  });
  await assert.rejects(() => launcher.launch(jobId), (error: unknown) => {
    assert.ok(error instanceof TaskLaunchError);
    assert.equal(error.code, "UNAVAILABLE");
    assert.doesNotMatch(error.message, /credential|endpoint/);
    return true;
  });
});

test("rejects shortened, wildcard, cross-account, cross-region and cross-partition launch settings before sending", () => {
  let calls = 0;
  const client: ControllerEcsSender = { async send() { calls += 1; return {}; } };
  for (const invalid of [
    { cluster: "local-contract-cluster" }, { taskDefinition: "local-contract-task:3" },
    { taskDefinition: options.taskDefinition.replace(":3", ":*") },
    { taskDefinition: options.taskDefinition.replace(":3", "") },
    { taskDefinition: options.taskDefinition.replace(":3", ":0") },
    { taskDefinition: options.taskDefinition.replace("000000000000", "111111111111") },
    { cluster: options.cluster.replace("ap-northeast-1", "us-east-1") },
    { taskDefinition: options.taskDefinition.replace("arn:aws:", "arn:aws-cn:") },
    { region: "INVALID_PRIVATE_REGION" },
  ]) {
    assert.throws(() => new EcsFargateTaskLauncher({ ...options, ...invalid, client }), error => {
      assert.equal((error as Error).message, "Worker launch resource scope is invalid."); return true;
    });
  }
  assert.equal(calls, 0);
});

test("validates scoped government and China partitions without authenticating or launching", () => {
  const client: ControllerEcsSender = { async send() { throw new Error("Should never send."); } };
  for (const [partition, region] of [["aws-us-gov", "us-gov-west-1"], ["aws-cn", "cn-north-1"]] as const) {
    assert.doesNotThrow(() => new EcsFargateTaskLauncher({ ...options, region,
      cluster: options.cluster.replace("arn:aws:", `arn:${partition}:`).replace("ap-northeast-1", region!),
      taskDefinition: options.taskDefinition.replace("arn:aws:", `arn:${partition}:`).replace("ap-northeast-1", region!), client }));
  }
});

test("rejects non-finite, fractional deadlines and duplicate or unbounded subnet choices", () => {
  const client: ControllerEcsSender = { async send() { return {}; } };
  for (const operationTimeoutMs of [NaN, Infinity, -Infinity, 499, 15_001, 7000.5]) {
    assert.throws(() => new EcsFargateTaskLauncher({ ...options, operationTimeoutMs, client }), /timeout is invalid/);
  }
  for (const subnetIds of [[], [options.subnetIds[0]!, options.subnetIds[0]!], Array(5).fill(options.subnetIds[0]), ["subnet-invalid"]]) {
    assert.throws(() => new EcsFargateTaskLauncher({ ...options, subnetIds, client }), /subnet configuration/);
  }
});

test("never accepts a missing, ambiguous or failure-bearing RunTask response, and never retries", async () => {
  for (const response of [undefined, null, [], {}, { tasks: [] }, { tasks: [null] }, { tasks: [task(), task()] },
    { tasks: [task()], failures: [{ reason: "PRIVATE_REASON" }] }, { tasks: [task()], failures: {} }, { tasks: [task()], failures: null }]) {
    const counter = { value: 0 };
    await assert.rejects(launcherReturning(response, counter).launch(jobId), error => {
      assert.ok(error instanceof TaskLaunchError); assert.equal(error.code, "REJECTED");
      assert.equal(error.message, "Secure worker launch failed."); return true;
    });
    assert.equal(counter.value, 1);
  }
});

test("task account, region, cluster, full revision, owner and Fargate execution proof must all match", async () => {
  for (const patch of [
    { taskArn: undefined }, { taskArn: taskArn.replace("000000000000", "111111111111") },
    { taskArn: taskArn.replace("ap-northeast-1", "us-east-1") }, { taskArn: taskArn.replace("local-contract-cluster", "other") },
    { taskArn: taskArn + "/extra" }, { taskArn: "arn:aws:ecs:ap-northeast-1:000000000000:task/" + "a".repeat(32) },
    { taskArn: taskArn.slice(0, -1) }, { clusterArn: undefined }, { clusterArn: options.cluster + "-other" },
    { taskDefinitionArn: undefined }, { taskDefinitionArn: options.taskDefinition.replace(":3", ":4") },
    { startedBy: undefined }, { startedBy: "UNRELATED_OWNER" }, { launchType: "EC2" }, { launchType: undefined },
    { enableExecuteCommand: true }, { enableExecuteCommand: undefined },
  ]) {
    const counter = { value: 0 };
    await assert.rejects(launcherReturning({ tasks: [{ ...task(), ...patch }] }, counter).launch(jobId),
      (error: unknown) => error instanceof TaskLaunchError && error.code === "REJECTED");
    assert.equal(counter.value, 1);
  }
});

test("foreign, duplicate, missing or execution-changing overrides are not task ownership proof", async () => {
  const container = task().overrides.containerOverrides[0]!;
  for (const overrides of [undefined, {}, { containerOverrides: null }, { containerOverrides: [] },
    { containerOverrides: [container, container] }, { containerOverrides: [{ ...container, name: "other" }] },
    { containerOverrides: [{ name: "worker" }] },
    { containerOverrides: [{ ...container, environment: [...container.environment, ...container.environment] }] },
    { containerOverrides: [{ ...container, environment: [{ name: "JOB_ID", value: "OTHER_OWNER" }] }] },
    { containerOverrides: [{ ...container, environment: [{ name: "OTHER", value: jobId }] }] },
    { containerOverrides: [{ ...container, command: ["UNREVIEWED_COMMAND"] }] },
    { containerOverrides: [container], taskRoleArn: "UNREVIEWED_ROLE" },
  ]) {
    await assert.rejects(launcherReturning({ tasks: [{ ...task(), overrides }] }).launch(jobId),
      (error: unknown) => error instanceof TaskLaunchError && error.code === "REJECTED");
  }
});

test("caller or fake transport mutation cannot redirect later commands", async () => {
  const commands: RunTaskCommand[] = [];
  const client: ControllerEcsSender = { async send(command) {
    commands.push(command);
    command.input.networkConfiguration!.awsvpcConfiguration!.subnets!.push("subnet-11111111111111111");
    return { tasks: [task()] };
  } };
  const mutable = { ...options, subnetIds: [...options.subnetIds], client };
  const launcher = new EcsFargateTaskLauncher(mutable);
  mutable.cluster = "UNREVIEWED_CLUSTER";
  mutable.taskDefinition = "UNREVIEWED_REVISION";
  mutable.subnetIds.push("subnet-22222222222222222");
  await launcher.launch(jobId); await launcher.launch(jobId);
  assert.equal(commands[0]!.input.cluster, options.cluster);
  assert.equal(commands[1]!.input.taskDefinition, options.taskDefinition);
  assert.deepEqual(commands[1]!.input.networkConfiguration!.awsvpcConfiguration!.subnets,
    [options.subnetIds[0], "subnet-11111111111111111"]);
  assert.equal(commands[0]!.input.clientToken, commands[1]!.input.clientToken);
});

test("invalid job identifiers are refused before a single task request", async () => {
  const counter = { value: 0 };
  const launcher = launcherReturning({ tasks: [task()] }, counter);
  for (const value of ["short", "x".repeat(65), jobId + "\n", "../" + jobId]) await assert.rejects(launcher.launch(value),
    (error: unknown) => error instanceof TaskLaunchError && error.code === "REJECTED");
  assert.equal(counter.value, 0);
});

test("bounded abort maps to TIMEOUT without a second task request", async () => {
  let calls = 0;
  const launcher = new EcsFargateTaskLauncher({ ...options, operationTimeoutMs: 500, client: { async send(_command, context) {
    calls += 1;
    return await new Promise((_resolve, reject) => context.abortSignal.addEventListener("abort", () => {
      const error = new Error("PRIVATE_TIMEOUT_DETAIL"); error.name = "AbortError"; reject(error);
    }, { once: true }));
  } } });
  await assert.rejects(launcher.launch(jobId), error => error instanceof TaskLaunchError && error.code === "TIMEOUT");
  assert.equal(calls, 1);
});

test("request cancellation reaches RunTask without retry or a new request when already cancelled", async () => {
  const parent = new AbortController(); let calls = 0, signal: AbortSignal | undefined;
  const launcher = new EcsFargateTaskLauncher({ ...options, client: { async send(_command, context) {
    calls++; signal = context.abortSignal;
    return new Promise((_resolve, reject) => context.abortSignal.addEventListener("abort", () => reject(new Error("synthetic-only")), { once: true }));
  } } });
  const pending = launcher.launch(jobId, parent.signal);
  const rejected = assert.rejects(pending, error => error instanceof TaskLaunchError && error.code === "TIMEOUT");
  await Promise.resolve(); parent.abort(); await rejected;
  assert.equal(signal?.aborted, true); assert.equal(calls, 1);
  await assert.rejects(launcher.launch(jobId, parent.signal), error => error instanceof TaskLaunchError && error.code === "TIMEOUT");
  assert.equal(calls, 1);
});
