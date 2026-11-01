import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluatePhase11Readiness,
  collectPhase11Readiness,
  parseReadOnlyAwsOutput,
  summarizeReadinessFailure,
  type Phase11ReadinessSnapshot,
} from "../phase11-live-readiness.js";

const account = "123456789012";
const taskDefinitionArn = `arn:aws:ecs:ap-northeast-1:${account}:task-definition/global-market-ai-insight-dev-worker:9`;

function healthySnapshot(): Phase11ReadinessSnapshot {
  return {
    identity: { Account: account, Arn: `arn:aws:iam::${account}:user/aws-admin-user`, UserId: "redacted" },
    budgets: { Budgets: [{
      BudgetType: "COST", TimeUnit: "MONTHLY", BudgetLimit: { Amount: "5.0", Unit: "USD" },
      CalculatedSpend: { ActualSpend: { Amount: "0.02", Unit: "USD" }, ForecastedSpend: { Amount: "0.04", Unit: "USD" } },
    }] },
    stacks: { Stacks: [
      { StackName: "global-market-ai-insight-dev-foundation", StackStatus: "UPDATE_COMPLETE" },
      { StackName: "global-market-ai-insight-dev-compute", StackStatus: "UPDATE_COMPLETE" },
      { StackName: "global-market-ai-insight-dev-api", StackStatus: "CREATE_COMPLETE" },
    ] },
    controller: { Environment: { Variables: {
      ENABLE_PROVIDER_BACKED_JOBS: "false",
      ENABLE_LIVE_RESULT_DISPLAY: "false",
      WORKER_TASK_DEFINITION: taskDefinitionArn,
    } } },
    runningTasks: { taskArns: [] },
    pendingTasks: { taskArns: [] },
    services: { serviceArns: [] },
    taskDefinition: { taskDefinition: {
      taskDefinitionArn,
      containerDefinitions: [{
        image: `123456789012.dkr.ecr.ap-northeast-1.amazonaws.com/global-market-ai-insight-dev-worker@sha256:${"a".repeat(64)}`,
        readonlyRootFilesystem: true,
        user: "65532:65532",
      }],
    } },
    circuit: { Item: { jobId: { S: "control_circuit" }, state: { S: "OPEN" }, version: { N: "11" } } },
    slots: [{}, {}],
  };
}

test("readiness report exposes only bounded facts and never grants deployment", () => {
  const report = evaluatePhase11Readiness(healthySnapshot());
  assert.equal(report.readyForAccountSpecificDiff, true);
  assert.equal(report.readyForDeployment, false);
  assert.deepEqual(report.circuit, { verifiedOpen: true, version: 11 });
  assert.equal(report.occupiedSlots, 0);
  const serialized = JSON.stringify(report);
  assert.equal(serialized.includes(account), false);
  assert.equal(serialized.includes("arn:aws"), false);
  assert.equal(serialized.includes("dkr.ecr"), false);
});

test("an OPEN-looking response must be the exact control_circuit record", () => {
  for (const jobId of [undefined, { S: "another-control" }, { S: ["control_circuit"] }]) {
    const snapshot = healthySnapshot();
    (snapshot.circuit as { Item: Record<string, unknown> }).Item.jobId = jobId;
    assert.equal(evaluatePhase11Readiness(snapshot).readyForAccountSpecificDiff, false);
    assert.equal((evaluatePhase11Readiness(snapshot).circuit as Record<string, unknown>).verifiedOpen, false);
  }
});

test("an existing or incompletely removed maintenance stack also blocks a new isolated operations diff", () => {
  for (const status of ["CREATE_COMPLETE", "UPDATE_IN_PROGRESS", "DELETE_FAILED", "DELETE_IN_PROGRESS"]) {
    const snapshot = healthySnapshot();
    (snapshot.stacks as { Stacks: Array<{ StackName: string; StackStatus: string }> }).Stacks.push({
      StackName: "global-market-ai-insight-dev-maintenance", StackStatus: status,
    });
    const report = evaluatePhase11Readiness(snapshot);
    assert.equal(report.readyForAccountSpecificDiff, false);
    assert.equal((report.stacks as Record<string, string>).maintenance, status);
  }
});

test("an all-zero account cannot become a valid identity even with matching mock ARNs", () => {
  const snapshot = JSON.parse(JSON.stringify(healthySnapshot()).replaceAll(account, "0".repeat(12)));
  assert.equal(evaluatePhase11Readiness(snapshot).accountShapeValid, false);
  assert.equal(evaluatePhase11Readiness(snapshot).readyForAccountSpecificDiff, false);
  let calls = 0;
  assert.throws(() => collectPhase11Readiness(() => { calls += 1; return snapshot.identity; }));
  assert.equal(calls, 1);
});

test("readiness fails closed for spending or capacity ambiguity", () => {
  const snapshot = healthySnapshot();
  snapshot.controller = { Environment: { Variables: {
    ENABLE_PROVIDER_BACKED_JOBS: "true",
    ENABLE_LIVE_RESULT_DISPLAY: "false",
    WORKER_TASK_DEFINITION: taskDefinitionArn,
  } } };
  snapshot.pendingTasks = { taskArns: ["hidden"] };
  snapshot.circuit = { Item: { state: { S: "CLOSED" }, version: { N: "12" } } };
  snapshot.slots = [{ Item: { ownerJobId: { S: "hidden" } } }, {}];
  const report = evaluatePhase11Readiness(snapshot);
  assert.equal(report.readyForAccountSpecificDiff, false);
  assert.deepEqual(report.circuit, { verifiedOpen: false, version: null });
  assert.equal(report.occupiedSlots, 1);
  assert.equal(JSON.stringify(report).includes("hidden"), false);
});

test("readiness failure reporting suppresses untrusted error content", () => {
  const report = summarizeReadinessFailure(new Error(
    "Access denied for arn:aws:iam::123456789012:user/example with a private endpoint",
  ));
  assert.deepEqual(report, { error: "READINESS_CHECK_FAILED", stage: "unknown" });
  assert.equal(JSON.stringify(report).includes("123456789012"), false);
  assert.equal(JSON.stringify(report).includes("arn:aws"), false);
});

test("an empty successful DynamoDB read means absent and still fails closed", () => {
  assert.deepEqual(parseReadOnlyAwsOutput("", "dynamodb.get-item"), {});
  assert.throws(() => parseReadOnlyAwsOutput("", "ecs.list-tasks"));
});

test("missing, malformed or partial capacity responses are unknown, never zero", () => {
  for (const field of ["runningTasks", "pendingTasks", "services"] as const) {
    const key = field === "services" ? "serviceArns" : "taskArns";
    for (const invalid of [null, {}, { [key]: null }, { [key]: [null] },
      { [key]: [], nextToken: "private-continuation" }, { [key]: [], NextToken: "private-continuation" }]) {
      const snapshot = healthySnapshot();
      snapshot[field] = invalid;
      const report = evaluatePhase11Readiness(snapshot);
      assert.equal(report.readyForAccountSpecificDiff, false);
      assert.equal((report.compute as Record<string, unknown>)[field], null);
      assert.equal(JSON.stringify(report).includes("private-continuation"), false);
    }
  }
});

test("both feature flags must be explicitly false", () => {
  for (const value of [undefined, null, false, "FALSE", "", "true"]) {
    for (const flag of ["ENABLE_PROVIDER_BACKED_JOBS", "ENABLE_LIVE_RESULT_DISPLAY"]) {
      const snapshot = healthySnapshot();
      const variables = (snapshot.controller as { Environment: { Variables: Record<string, unknown> } }).Environment.Variables;
      variables[flag] = value;
      const report = evaluatePhase11Readiness(snapshot);
      assert.equal(report.readyForAccountSpecificDiff, false);
      assert.equal((report.compute as Record<string, unknown>).executionFlagsVerifiedDisabled, false);
    }
  }
});

test("partial or duplicate stack inventory cannot prove a target absent", () => {
  for (const invalid of [null, {}, { Stacks: [] }, { Stacks: [], NextToken: "private" },
    { Stacks: [{ StackName: "global-market-ai-insight-dev-operations" }] }]) {
    const snapshot = healthySnapshot();
    snapshot.stacks = invalid;
    assert.equal(evaluatePhase11Readiness(snapshot).readyForAccountSpecificDiff, false);
  }
  const snapshot = healthySnapshot();
  const stacks = (snapshot.stacks as { Stacks: unknown[] }).Stacks;
  stacks.push(stacks[0]);
  const report = evaluatePhase11Readiness(snapshot);
  assert.equal(report.readyForAccountSpecificDiff, false);
  assert.equal((report.stacks as Record<string, unknown>).operations, "UNKNOWN");
});

test("both capacity-slot responses must be well formed and present", () => {
  for (const slots of [[], [{}], [{}, {}, {}], [null, {}], [{ Item: null }, {}], [{ Item: {} }, {}]]) {
    const snapshot = healthySnapshot();
    snapshot.slots = slots;
    const report = evaluatePhase11Readiness(snapshot);
    assert.equal(report.readyForAccountSpecificDiff, false);
    assert.equal(report.occupiedSlots, null);
  }
});

test("Budget must have one complete USD spend record below its limit", () => {
  for (const amount of [undefined, "", " ", "-1", "NaN", "Infinity", "5", "5.01"]) {
    const snapshot = healthySnapshot();
    const budget = (snapshot.budgets as { Budgets: Array<{ CalculatedSpend: { ActualSpend: { Amount: unknown } } }> }).Budgets[0]!;
    budget.CalculatedSpend.ActualSpend.Amount = amount;
    assert.equal(evaluatePhase11Readiness(snapshot).readyForAccountSpecificDiff, false);
  }
  for (const mutate of [
    (value: Record<string, unknown>) => { value.NextToken = "private"; },
    (value: Record<string, unknown>) => { const list = value.Budgets as unknown[]; list.push(list[0]); },
    (value: Record<string, unknown>) => { ((value.Budgets as Record<string, unknown>[])[0]!).CalculatedSpend = {}; },
  ]) {
    const snapshot = healthySnapshot();
    mutate(snapshot.budgets as Record<string, unknown>);
    assert.equal(evaluatePhase11Readiness(snapshot).readyForAccountSpecificDiff, false);
  }
});

test("identity, image and task reference must belong to the exact account and Region", () => {
  const wrongAccount = "000000000000";
  for (const [source, substitute] of [[account, wrongAccount], ["ap-northeast-1", "ap-northeast-2"], ["global-market-ai-insight-dev-worker", "different-worker"]]) {
    const snapshot = healthySnapshot();
    const task = (snapshot.taskDefinition as { taskDefinition: { taskDefinitionArn: string; containerDefinitions: Array<{ image: string }> } }).taskDefinition;
    task.taskDefinitionArn = task.taskDefinitionArn.replace(source!, substitute!);
    const variables = (snapshot.controller as { Environment: { Variables: Record<string, string> } }).Environment.Variables;
    variables.WORKER_TASK_DEFINITION = task.taskDefinitionArn;
    assert.equal(evaluatePhase11Readiness(snapshot).readyForAccountSpecificDiff, false);
  }
  const snapshot = healthySnapshot();
  (snapshot.identity as Record<string, unknown>).Arn = `arn:aws:iam::${wrongAccount}:user/aws-admin-user`;
  assert.equal(evaluatePhase11Readiness(snapshot).expectedPrincipal, false);
  const otherImage = healthySnapshot();
  const task = (otherImage.taskDefinition as { taskDefinition: { containerDefinitions: Array<{ image: string }> } }).taskDefinition;
  task.containerDefinitions[0]!.image = task.containerDefinitions[0]!.image.replace(account, wrongAccount);
  assert.equal(evaluatePhase11Readiness(otherImage).readyForAccountSpecificDiff, false);
});

test("an invalid additional container cannot be discarded as if only one existed", () => {
  const snapshot = healthySnapshot();
  (snapshot.taskDefinition as { taskDefinition: { containerDefinitions: unknown[] } }).taskDefinition.containerDefinitions.push(null);
  assert.equal(evaluatePhase11Readiness(snapshot).readyForAccountSpecificDiff, false);
});

test("collector performs exactly eleven allowlisted single-page reads and no writes", () => {
  const snapshot = healthySnapshot();
  const responses = [snapshot.identity, snapshot.controller, snapshot.budgets, snapshot.stacks,
    snapshot.runningTasks, snapshot.pendingTasks, snapshot.services, snapshot.taskDefinition,
    snapshot.circuit, ...snapshot.slots];
  const captured: string[][] = [];
  const report = collectPhase11Readiness(args => {
    captured.push([...args]);
    return responses[captured.length - 1];
  });
  assert.equal(report.readyForAccountSpecificDiff, true);
  assert.equal(captured.length, 11);
  assert.deepEqual(captured.map(args => `${args[0]}.${args[1]}`), [
    "sts.get-caller-identity", "lambda.get-function-configuration", "budgets.describe-budgets",
    "cloudformation.describe-stacks", "ecs.list-tasks", "ecs.list-tasks", "ecs.list-services",
    "ecs.describe-task-definition", "dynamodb.get-item", "dynamodb.get-item", "dynamodb.get-item",
  ]);
  assert.ok(captured.every(args => args.includes("--no-paginate") && args.includes("--no-cli-pager")));
  assert.ok(captured.filter(args => args[0] === "dynamodb").every(args => args.includes("--consistent-read")));
});

test("collector rejects foreign task reference before making downstream reads", () => {
  let calls = 0;
  assert.throws(() => collectPhase11Readiness(() => {
    calls += 1;
    return calls === 1 ? healthySnapshot().identity : { Environment: { Variables: {
      WORKER_TASK_DEFINITION: "arn:aws:ecs:ap-northeast-2:000000000000:task-definition/unrelated:1",
    } } };
  }));
  assert.equal(calls, 2);
});

test("collector rejects an unexpected principal before querying project resources", () => {
  let calls = 0;
  assert.throws(() => collectPhase11Readiness(() => {
    calls += 1;
    return { Account: account, Arn: `arn:aws:iam::${account}:user/unrelated` };
  }));
  assert.equal(calls, 1);
});
