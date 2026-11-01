import assert from "node:assert/strict";
import test from "node:test";
import { syntheticComputeDenialPlan, syntheticComputeDenialRequest as build } from "../src/synthetic-compute-denial.js";
import { runWorkerEntry } from "../../worker/src/main.js";

const account = "123456789012", prefix = "global-market-ai-insight-dev", region = "ap-northeast-1";
const ownerArn = `arn:aws:iam::${account}:user/aws-admin-user`, clusterArn = `arn:aws:ecs:${region}:${account}:cluster/${prefix}-worker`;
const taskArn = `arn:aws:ecs:${region}:${account}:task-definition/${prefix}-worker:7`;
function fixture() {
  return { account, ownerArn, nonce: "a".repeat(32), checkedAtMs: 1000, nowMs: 2000,
    controller: { FunctionName: `${prefix}-controller`, FunctionArn: `arn:aws:lambda:${region}:${account}:function:${prefix}-controller`,
      State: "Active", LastUpdateStatus: "Successful", Environment: { Variables: { API_AUTH_MODE: "AWS_IAM", PRIVATE_OWNER_USER_ARN: ownerArn,
        ENABLE_PROVIDER_BACKED_JOBS: "false", ENABLE_LIVE_RESULT_DISPLAY: "false", WORKER_CLUSTER: clusterArn, WORKER_TASK_DEFINITION: taskArn,
        WORKER_SUBNET_IDS: `subnet-${"a".repeat(17)},subnet-${"b".repeat(17)}`, WORKER_SECURITY_GROUP_ID: `sg-${"c".repeat(17)}` } } },
    taskDefinition: { taskDefinition: { taskDefinitionArn: taskArn, status: "ACTIVE", networkMode: "awsvpc", cpu: "256", memory: "512",
      compatibilities: ["EC2", "FARGATE"], containerDefinitions: [{ name: "worker", essential: true, readonlyRootFilesystem: true, user: "65532:65532",
        image: `${account}.dkr.ecr.${region}.amazonaws.com/${prefix}-worker@sha256:${"a".repeat(64)}`,
        secrets: [{ name: "TWELVE_DATA_API_KEY", valueFrom: "private-secret-reference" }] }] } },
    clusters: { failures: [], clusters: [{ clusterArn, clusterName: `${prefix}-worker`, status: "ACTIVE", registeredContainerInstancesCount: 0,
      runningTasksCount: 0, pendingTasksCount: 0, activeServicesCount: 0, capacityProviders: [], defaultCapacityProviderStrategy: [] }] },
    instances: { containerInstanceArns: [] },
  };
}
const rejected = { message: "SYNTHETIC_COMPUTE_DENIAL_SCOPE_REJECTED" };

test("proposal fixes one EC2 attempt, no Fargate/capacity fallback, and explicit lack of execution authority", () => {
  const value = build(fixture()), plan = syntheticComputeDenialPlan();
  assert.equal(plan.awsCalls, 0); assert.equal(plan.runTaskRequests, 0); assert.equal(plan.liveEntryImplemented, true);
  assert.equal(value.endpoint, "https://ecs.ap-northeast-1.amazonaws.com/");
  assert.equal(value.target, "AmazonEC2ContainerServiceV20141113.RunTask");
  assert.equal(value.request.launchType, "EC2"); assert.equal(value.request.count, 1);
  assert.equal(value.request.cluster, clusterArn); assert.equal(value.request.taskDefinition, taskArn);
  assert.equal(value.request.startedBy.length, 36); assert.equal(value.request.clientToken.length <= 64, true);
  assert.equal(value.request.networkConfiguration.awsvpcConfiguration.assignPublicIp, "DISABLED");
  assert.equal(value.request.enableExecuteCommand, false);
  assert.equal(Object.hasOwn(value.request, "capacityProviderStrategy"), false);
  assert.equal(value.executionAuthorized, false); assert.equal(value.liveAuthorizationVerified, false);
  assert.equal(value.independentTaskReconciliationRequired, true); assert.equal(value.taskSecretInjectionPrevented, false);
  assert.equal(plan.unexpectedTaskReconciliationImplemented, true); assert.equal(plan.concurrentCapacityChangeRisk, true);
  assert.doesNotMatch(JSON.stringify(value), /private-secret-reference|TWELVE_DATA_API_KEY|aws-admin-user|FARGATE/);
});

test("existing capacity, services, tasks, autoscaling providers or incomplete inventory block construction", () => {
  const changes: Array<(v: any) => void> = [
    v => v.clusters.clusters[0].registeredContainerInstancesCount = 1,
    v => v.clusters.clusters[0].runningTasksCount = 1,
    v => v.clusters.clusters[0].pendingTasksCount = 1,
    v => v.clusters.clusters[0].activeServicesCount = 1,
    v => v.clusters.clusters[0].capacityProviders.push("managed"),
    v => v.clusters.clusters[0].defaultCapacityProviderStrategy.push({ capacityProvider: "FARGATE", weight: 1 }),
    v => v.instances.containerInstanceArns.push("existing"), v => v.instances.nextToken = "more",
    v => v.clusters.nextToken = "more", v => v.clusters.failures.push({ reason: "MISSING" }),
    v => v.clusters.clusters.push(v.clusters.clusters[0]), v => delete v.clusters.clusters[0].registeredContainerInstancesCount,
    v => delete v.clusters.clusters[0].capacityProviders, v => v.clusters.clusters[0].status = "INACTIVE",
  ];
  for (const change of changes) { const value = fixture(); change(value); assert.throws(() => build(value), rejected); }
});

test("wrong account, controller scope, enabled dispatch and unverified network identifiers fail closed", () => {
  const changes: Array<(v: any) => void> = [
    v => v.account = "999999999999", v => v.ownerArn += "-other", v => v.controller.FunctionName += "-other",
    v => v.controller.FunctionArn += "-other", v => v.controller.State = "Pending", v => v.controller.LastUpdateStatus = "InProgress",
    v => v.controller.Environment.Error = {}, v => v.controller.Environment.Variables.ENABLE_PROVIDER_BACKED_JOBS = "true",
    v => v.controller.Environment.Variables.ENABLE_LIVE_RESULT_DISPLAY = "true", v => delete v.controller.Environment.Variables.ENABLE_LIVE_RESULT_DISPLAY,
    v => v.controller.Environment.Variables.API_AUTH_MODE = "NONE", v => v.controller.Environment.Variables.PRIVATE_OWNER_USER_ARN += "-other",
    v => v.controller.Environment.Variables.WORKER_CLUSTER += "-other", v => v.clusters.clusters[0].clusterArn += "-other",
    v => v.controller.Environment.Variables.WORKER_SUBNET_IDS = `subnet-${"a".repeat(17)},subnet-${"a".repeat(17)}`,
    v => v.controller.Environment.Variables.WORKER_SUBNET_IDS = "subnet-invalid", v => v.controller.Environment.Variables.WORKER_SECURITY_GROUP_ID = "sg-invalid",
  ];
  for (const change of changes) { const value = fixture(); change(value); assert.throws(() => build(value), rejected); }
});

test("task revision, active status, EC2 compatibility, fixed size and worker hardening are required", () => {
  const changes: Array<(v: any) => void> = [
    v => v.taskDefinition.taskDefinition.taskDefinitionArn += "1", v => v.taskDefinition.taskDefinition.status = "INACTIVE",
    v => v.taskDefinition.taskDefinition.compatibilities = ["FARGATE"], v => v.taskDefinition.taskDefinition.networkMode = "bridge",
    v => v.taskDefinition.taskDefinition.cpu = "4096", v => v.taskDefinition.taskDefinition.memory = "8192",
    v => v.taskDefinition.taskDefinition.containerDefinitions.push({ name: "sidecar" }),
    v => v.taskDefinition.taskDefinition.containerDefinitions[0].name = "other",
    v => v.taskDefinition.taskDefinition.containerDefinitions[0].essential = false,
    v => v.taskDefinition.taskDefinition.containerDefinitions[0].readonlyRootFilesystem = false,
    v => v.taskDefinition.taskDefinition.containerDefinitions[0].user = "root",
    v => v.taskDefinition.taskDefinition.containerDefinitions[0].image = "untrusted:latest",
  ];
  for (const change of changes) { const value = fixture(); change(value); assert.throws(() => build(value), rejected); }
});

test("stale, reversed and malformed timing/nonce cannot select an execution request", () => {
  for (const changes of [{ nonce: "A".repeat(32) }, { nonce: "../private" }, { checkedAtMs: NaN }, { checkedAtMs: -1 },
    { nowMs: 999 }, { nowMs: 31000 }, { nowMs: Infinity }, { nowMs: 2000.1 }])
    assert.throws(() => build({ ...fixture(), ...changes }), rejected);
  assert.equal(build({ ...fixture(), nowMs: 30999 }).request.count, 1);
});

test("runtime overrides refuse application startup before provider/model/repository creation", async () => {
  const request = build(fixture()).request;
  const environment = Object.fromEntries(request.overrides.containerOverrides[0]!.environment.map(v => [v.name, v.value]));
  await assert.rejects(runWorkerEntry(environment), /JOB_ID must be/);
  await assert.rejects(runWorkerEntry({ ...environment, JOB_ID: "fixture_job_123456" }), /APP_ENV must be/);
  assert.equal(environment.JOB_ID, ""); assert.equal(environment.APP_ENV, "deny-probe");
});

test("request copies only fixed scope and does not forward extra environment or caller overrides", () => {
  const original = fixture();
  const value = build({ ...original, overrides: { count: 10 }, arbitrarySecret: "private-value" } as any);
  original.controller.Environment.Variables.WORKER_SUBNET_IDS = "changed";
  assert.equal(value.request.networkConfiguration.awsvpcConfiguration.subnets.length, 2);
  assert.doesNotMatch(JSON.stringify(value), /private-value|arbitrarySecret|changed/);
  value.request.overrides.containerOverrides[0]!.environment.length = 0;
  assert.equal(build(fixture()).request.overrides.containerOverrides[0]!.environment.length, 2);
});
