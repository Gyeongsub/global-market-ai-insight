import assert from "node:assert/strict";
import test from "node:test";
import { reconcileSyntheticComputeDenial as reconcile } from "../synthetic-compute-denial-reconcile.js";
const account = "123456789012", prefix = "global-market-ai-insight-dev", region = "ap-northeast-1", nonce = "a".repeat(32);
const ownerArn = `arn:aws:iam::${account}:user/aws-admin-user`, clusterArn = `arn:aws:ecs:${region}:${account}:cluster/${prefix}-worker`;
const taskDefinitionArn = `arn:aws:ecs:${region}:${account}:task-definition/${prefix}-worker:7`;
const taskArn = `arn:aws:ecs:${region}:${account}:task/${prefix}-worker/${"b".repeat(32)}`;
function scope() {
  return { account, ownerArn, nonce, checkedAtMs: 1000, nowMs: 2000,
    controller: { FunctionName: `${prefix}-controller`, FunctionArn: `arn:aws:lambda:${region}:${account}:function:${prefix}-controller`,
      State: "Active", LastUpdateStatus: "Successful", Environment: { Variables: { API_AUTH_MODE: "AWS_IAM", PRIVATE_OWNER_USER_ARN: ownerArn,
        ENABLE_PROVIDER_BACKED_JOBS: "false", ENABLE_LIVE_RESULT_DISPLAY: "false", WORKER_CLUSTER: clusterArn, WORKER_TASK_DEFINITION: taskDefinitionArn,
        WORKER_SUBNET_IDS: `subnet-${"a".repeat(17)},subnet-${"b".repeat(17)}`, WORKER_SECURITY_GROUP_ID: `sg-${"c".repeat(17)}` } } },
    taskDefinition: { taskDefinition: { taskDefinitionArn, status: "ACTIVE", networkMode: "awsvpc", cpu: "256", memory: "512",
      compatibilities: ["EC2", "FARGATE"], containerDefinitions: [{ name: "worker", essential: true, readonlyRootFilesystem: true, user: "65532:65532",
        image: `${account}.dkr.ecr.${region}.amazonaws.com/${prefix}-worker@sha256:${"a".repeat(64)}` }] } },
    clusters: { failures: [], clusters: [{ clusterArn, clusterName: `${prefix}-worker`, status: "ACTIVE", registeredContainerInstancesCount: 0,
      runningTasksCount: 0, pendingTasksCount: 0, activeServicesCount: 0, capacityProviders: [], defaultCapacityProviderStrategy: [] }] },
    instances: { containerInstanceArns: [] },
  };
}
function fixture(options: { outcome?: "not-sent" | "explicit-denial" | "unknown"; present?: boolean; stopped?: boolean;
  delayed?: boolean; lostStop?: boolean; surviving?: boolean; badList?: unknown; badDescribe?: unknown; taskChange?: (task: any) => void; waitFails?: boolean } = {}) {
  let stopped = options.stopped ?? false, lists = 0, stops = 0, waits = 0;
  const calls: Array<{ operation: string; args: readonly string[] }> = [], records: any[] = [];
  const input: Parameters<typeof reconcile>[0] = { scope: scope(), outcome: options.outcome ?? "unknown",
    wait: async () => { waits++; if (options.waitFails) throw Error("private-wait"); }, record: s => records.push(s),
    call: (operation, args) => {
      calls.push({ operation, args: [...args] }); assert.equal(args[args.indexOf("--cluster") + 1], clusterArn);
      if (operation === "list-tasks") {
        lists++; assert.equal(args[args.indexOf("--started-by") + 1], `gmai${nonce}`);
        assert.equal(args[args.indexOf("--max-results") + 1], "1");
        if (options.badList !== undefined) return options.badList;
        return { taskArns: options.present && !(stopped && lists > 1) && !(options.delayed && lists < 3) ? [taskArn] : [] };
      }
      if (operation === "describe-tasks") {
        assert.equal(args[args.indexOf("--tasks") + 1], taskArn);
        if (options.badDescribe !== undefined) return options.badDescribe;
        const task = { taskArn, clusterArn, taskDefinitionArn, startedBy: `gmai${nonce}`, launchType: "EC2", enableExecuteCommand: false,
          lastStatus: stopped ? "STOPPED" : "RUNNING", desiredStatus: stopped ? "STOPPED" : "RUNNING",
          overrides: { containerOverrides: [{ name: "worker", environment: [{ name: "JOB_ID", value: "" }, { name: "APP_ENV", value: "deny-probe" }] }] } };
        options.taskChange?.(task); return { tasks: [task], failures: [] };
      }
      assert.equal(operation, "stop-task"); stops++; assert.equal(args[args.indexOf("--task") + 1], taskArn);
      if (!options.surviving) stopped = true;
      if (options.lostStop) throw Error("private-stop");
      return {};
    } };
  return { input, calls, records, stops: () => stops, waits: () => waits, run: () => reconcile(input) };
}

test("not-sent makes no AWS call; an explicit denial plus empty scoped read is a candidate closure", async () => {
  const a = fixture({ outcome: "not-sent" }), first = await a.run(); assert.equal(first.completed, true); assert.equal(a.calls.length, 0);
  const b = fixture({ outcome: "explicit-denial" }), second = await b.run();
  assert.equal(second.completed, true); assert.equal(second.observedEmpty, true); assert.equal(second.unresolvedCommit, false);
  assert.equal(second.liveCloudClosureVerified, false); assert.equal(b.calls.length, 1); assert.equal(b.stops(), 0);
});

test("three empty reads after unknown outcome remain uncertain, not fabricated absence proof", async () => {
  const f = fixture(), result = await f.run(); assert.equal(result.completed, false); assert.equal(result.failed, false);
  assert.equal(result.observedEmpty, true); assert.equal(result.unresolvedCommit, true); assert.equal(f.calls.length, 3);
  assert.equal(f.waits(), 2); assert.equal(f.stops(), 0);
});

test("verified unexpected task is stopped once and observed stopped plus absent from active list", async () => {
  for (const options of [{ present: true }, { present: true, lostStop: true }, { present: true, delayed: true }]) {
    const f = fixture(options), result = await f.run();
    assert.equal(result.completed, true); assert.equal(result.taskStopped, true); assert.equal(result.observedEmpty, true);
    assert.equal(result.unexpectedTaskObserved, true); assert.equal(result.unresolvedCommit, false); assert.equal(f.stops(), 1);
    assert.doesNotMatch(JSON.stringify(result), /123456789012|arn:|private-/);
    assert.ok(result.calls <= 15);
  }
});

test("already stopped owned task is not stopped again; contradictory denial stays explicit", async () => {
  const stopped = fixture({ present: true, stopped: true }), a = await stopped.run();
  assert.equal(a.completed, true); assert.equal(a.taskStopped, true); assert.equal(stopped.stops(), 0);
  const contradiction = fixture({ present: true, outcome: "explicit-denial" }), b = await contradiction.run();
  assert.equal(b.completed, true); assert.equal(b.denialContradicted, true); assert.equal(b.taskStopped, true);
});

test("surviving task or a failed wait cannot produce a completed cleanup", async () => {
  for (const options of [{ present: true, surviving: true }, { present: true, surviving: true, waitFails: true }]) {
    const f = fixture(options), result = await f.run(); assert.equal(result.completed, false); assert.equal(result.failed, true);
    assert.equal(result.taskStopped, false); assert.equal(f.stops(), 1);
  }
});

test("pagination, multiple candidates and foreign task IDs never trigger broad stop operations", async () => {
  for (const badList of [null, {}, { taskArns: [], nextToken: "more" }, { taskArns: [taskArn, taskArn] },
    { taskArns: [taskArn.replace(account, "999999999999")] }, { taskArns: ["private-task"] }]) {
    const f = fixture({ badList }), result = await f.run(); assert.equal(result.completed, false); assert.equal(f.stops(), 0);
  }
});

test("unowned task descriptions never authorize stopping another workload", async () => {
  for (const taskChange of [
    (t: any) => t.startedBy = "other", (t: any) => t.clusterArn += "-other", (t: any) => t.taskDefinitionArn += "1",
    (t: any) => t.launchType = "FARGATE", (t: any) => t.enableExecuteCommand = true, (t: any) => t.lastStatus = "UNKNOWN",
    (t: any) => t.overrides.containerOverrides[0].command = ["worker"],
    (t: any) => t.overrides.containerOverrides[0].environment[0].value = "real-job-id",
    (t: any) => t.overrides.containerOverrides[0].environment[1].value = "aws",
    (t: any) => t.overrides.containerOverrides[0].environment.push({ name: "extra", value: "private" }),
  ]) {
    const f = fixture({ present: true, taskChange }), result = await f.run();
    assert.equal(result.completed, false); assert.equal(f.stops(), 0); assert.equal(result.unexpectedTaskObserved, false);
  }
});

test("missing or ambiguous describe results are not owned tasks or clean absence", async () => {
  for (const badDescribe of [{ tasks: [], failures: [{ reason: "MISSING" }] }, { tasks: [] }, { tasks: [{}], failures: [] }]) {
    const f = fixture({ present: true, badDescribe }), result = await f.run(); assert.equal(result.completed, false); assert.equal(f.stops(), 0);
  }
});
