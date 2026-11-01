import assert from "node:assert/strict";
import test from "node:test";
import { GetItemCommand, TransactWriteItemsCommand } from "@aws-sdk/client-dynamodb";
import { SlotReconciler, type SlotDynamoSender, type SlotEcsSender } from "../src/slot-reconciler.js";

const jobId = `job_${"a".repeat(48)}`;
const clusterArn = "arn:aws:ecs:ap-northeast-1:000000000000:cluster/test";
const taskArn = `${clusterArn.replace(":cluster/", ":task/")}/${"b".repeat(32)}`;
const acquiredAt = "2026-09-06T00:00:00.000Z";

async function run(mode: string) {
  let writes = 0;
  let descriptions = 0;
  const dynamo: SlotDynamoSender = { async send(command) {
    if (command instanceof GetItemCommand) {
      if (command.input.Key?.jobId?.S === "control_slot_0") return { Item: { ownerJobId: { S: jobId }, acquiredAt: { S: acquiredAt } } };
      return { Item: { taskArn: { S: taskArn }, createdAt: { S: mode === "reused-job-id" ? "2026-09-07T00:00:00.000Z" : acquiredAt }, status: { S: mode === "running-job" ? "RUNNING" : "SUCCEEDED" }, version: { N: "3" } } };
    }
    assert.ok(command instanceof TransactWriteItemsCommand);
    assert.equal(command.input.TransactItems?.[1]?.Delete?.ExpressionAttributeValues?.[":owner"]?.S, jobId);
    assert.equal(command.input.TransactItems?.[1]?.Delete?.ExpressionAttributeValues?.[":acquired"]?.S, acquiredAt);
    assert.equal(command.input.TransactItems?.[0]?.ConditionCheck?.ExpressionAttributeValues?.[":task"]?.S, taskArn);
    if (mode === "owner-race") throw new Error("condition failed");
    writes += 1;
    return {};
  } };
  const ecs: SlotEcsSender = { async send(command) {
    descriptions += 1;
    assert.equal(command.input.cluster, clusterArn);
    assert.deepEqual(command.input.tasks, [taskArn]);
    if (mode === "read-failure") throw new Error("private SDK detail");
    if (mode === "missing-task") return { failures: [{ reason: "MISSING" }] };
    return { tasks: [{
      taskArn: mode === "wrong-task" ? `${taskArn}x` : taskArn,
      clusterArn,
      startedBy: mode === "wrong-starter" ? "other-job" : jobId.slice(0, 36),
      overrides: { containerOverrides: [{ name: "worker", environment: [{ name: "JOB_ID", value: mode === "wrong-override" ? `job_${"c".repeat(48)}` : jobId }] }] },
      lastStatus: mode === "running-task" ? "RUNNING" : "STOPPED", desiredStatus: "STOPPED",
    }] };
  } };
  const reconciler = new SlotReconciler({ tableName: "jobs-table", region: "ap-northeast-1", clusterArn, maxActiveJobs: 1, dynamo, ecs });
  return { result: await reconciler.reconcile(), writes, descriptions };
}

test("only a matching terminal job AND observed ECS STOPPED releases capacity", async () => {
  const outcome = await run("stopped");
  assert.deepEqual(outcome.result, { released: 1, retained: 0, empty: 0 });
  assert.equal(outcome.writes, 1);
});

test("running/unknown tasks, stale owner, conflicts and reused IDs retain capacity", async () => {
  for (const mode of ["running-job", "running-task", "wrong-task", "wrong-starter", "wrong-override", "missing-task", "read-failure", "owner-race", "reused-job-id"]) {
    const outcome = await run(mode);
    assert.equal(outcome.writes, 0, mode);
    assert.equal(outcome.result.retained, 1, mode);
    if (mode === "reused-job-id" || mode === "running-job") assert.equal(outcome.descriptions, 0);
  }
});
