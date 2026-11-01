import assert from "node:assert/strict";
import test from "node:test";
import { GetItemCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { DescribeTasksCommand, StopTaskCommand } from "@aws-sdk/client-ecs";
import { StaleJobSweeper, type SweepDynamoSender, type SweepEcsSender } from "../src/stale-job-sweeper.js";

const jobId = `job_${"a".repeat(48)}`;
const clusterArn = "arn:aws:ecs:ap-northeast-1:000000000000:cluster/test";
const taskArn = `${clusterArn.replace(":cluster/", ":task/")}/${"b".repeat(32)}`;
const acquiredAt = "2026-09-23T00:00:00.000Z";
const deadlineAt = "2026-09-23T00:01:00.000Z";
const now = new Date("2026-09-23T00:02:00.000Z");

function harness(mode = "running") {
  const commands: Array<GetItemCommand | UpdateItemCommand | DescribeTasksCommand | StopTaskCommand> = [];
  let stopAccepted = false;
  const dynamo: SweepDynamoSender = { async send(command) {
    commands.push(command);
    if (command instanceof GetItemCommand) {
      assert.equal(command.input.ConsistentRead, true);
      if (command.input.Key?.jobId?.S === "control_slot_0") return { Item: { ownerJobId: { S: jobId }, acquiredAt: { S: acquiredAt } } };
      if (command.input.Key?.jobId?.S !== jobId) throw new Error("unexpected key");
      return { Item: {
        jobId: { S: jobId }, createdAt: { S: mode === "reused" ? "2026-09-22T00:00:00.000Z" : acquiredAt },
        status: { S: mode === "terminal" ? "SUCCEEDED" : "RUNNING" },
        deadlineAt: { S: mode === "future" ? "2026-09-23T00:03:00.000Z" : deadlineAt },
        version: { N: "3" },
        ...(mode === "missing-task" ? {} : { taskArn: { S: mode === "foreign" ? taskArn.replace("000000000000", "111111111111") : taskArn } }),
      } };
    }
    assert.ok(command instanceof UpdateItemCommand);
    assert.equal(command.input.Key?.jobId?.S, jobId);
    assert.match(command.input.ConditionExpression ?? "", /#taskArn = :taskArn/);
    assert.equal(command.input.ExpressionAttributeValues?.[":previousVersion"]?.N, "3");
    assert.equal(command.input.ExpressionAttributeValues?.[":acquiredAt"]?.S, acquiredAt);
    assert.equal(command.input.ExpressionAttributeValues?.[":timedOut"]?.S, "TIMED_OUT");
    if (mode === "update-race") throw new Error("conditional conflict");
    return {};
  } };
  const ecs: SweepEcsSender = { async send(command) {
    commands.push(command);
    if (command instanceof DescribeTasksCommand) {
      assert.equal(command.input.cluster, clusterArn);
      assert.deepEqual(command.input.tasks, [taskArn]);
      if (mode === "describe-failure") throw new Error("SDK detail must not escape");
      if (mode === "missing-ecs") return { failures: [{ reason: "MISSING" }] };
      return { tasks: [{
        taskArn, clusterArn,
        startedBy: mode === "wrong-owner" || (mode === "owner-changed-after-stop" && stopAccepted) ? "someone-else" : jobId.slice(0, 36),
        overrides: mode === "missing-override" ? undefined : { containerOverrides: [{ name: "worker", environment: [{ name: "JOB_ID", value: mode === "wrong-job-override" ? `job_${"c".repeat(48)}` : jobId }] }] },
        lastStatus: mode === "stopped" || (stopAccepted && mode !== "slow-stop") ? "STOPPED" : mode === "unknown-ecs" ? "UNKNOWN" : "RUNNING",
        desiredStatus: mode === "stopping" ? "STOPPED" : "RUNNING",
      }] };
    }
    assert.ok(command instanceof StopTaskCommand);
    assert.equal(command.input.cluster, clusterArn);
    assert.equal(command.input.task, taskArn);
    assert.equal(command.input.reason, "JOB_DEADLINE_EXCEEDED");
    if (mode === "stop-failure") throw new Error("SDK detail must not escape");
    stopAccepted = true;
    return {};
  } };
  const sweeper = new StaleJobSweeper({ tableName: "jobs-table", region: "ap-northeast-1", clusterArn, maxActiveJobs: 1, dynamo, ecs });
  return { sweeper, commands };
}

test("overdue exact running task is stopped and job is conditionally timed out", async () => {
  const { sweeper, commands } = harness();
  assert.deepEqual(await sweeper.sweep(now), { inspected: 1, timedOut: 1, stopRequested: 1, retainedForReview: 0 });
  assert.deepEqual(commands.map(command => command.constructor.name), ["GetItemCommand", "GetItemCommand", "DescribeTasksCommand", "StopTaskCommand", "DescribeTasksCommand", "UpdateItemCommand"]);
  assert.ok(!commands.some(command => command.constructor.name.includes("Delete")));
});

test("already stopped task can time out; still-stopping task remains reserved", async () => {
  for (const mode of ["stopped", "stopping"]) {
    const { sweeper, commands } = harness(mode);
    const result = await sweeper.sweep(now);
    assert.equal(result.timedOut, mode === "stopped" ? 1 : 0, mode);
    assert.equal(result.stopRequested, 0, mode);
    assert.equal(commands.some(command => command instanceof StopTaskCommand), false);
  }
});

test("a slow StopTask does not mark terminal until actual STOPPED is observed", async () => {
  const { sweeper, commands } = harness("slow-stop");
  assert.deepEqual(await sweeper.sweep(now), { inspected: 1, timedOut: 0, stopRequested: 1, retainedForReview: 1 });
  assert.equal(commands.some(command => command instanceof UpdateItemCommand), false);
});

test("missing/foreign/reused evidence and future or terminal jobs cannot stop or update", async () => {
  for (const mode of ["missing-task", "foreign", "reused", "future", "terminal", "missing-ecs", "describe-failure", "unknown-ecs", "wrong-owner", "wrong-job-override", "missing-override"]) {
    const { sweeper, commands } = harness(mode);
    const result = await sweeper.sweep(now);
    assert.equal(result.timedOut, 0, mode);
    assert.equal(result.stopRequested, 0, mode);
    assert.equal(commands.some(command => command instanceof StopTaskCommand || command instanceof UpdateItemCommand), false, mode);
  }
});

test("failed stop or concurrent job update leaves capacity reserved for review", async () => {
  for (const mode of ["stop-failure", "update-race", "owner-changed-after-stop"]) {
    const { sweeper, commands } = harness(mode);
    const result = await sweeper.sweep(now);
    assert.equal(result.timedOut, 0, mode);
    assert.equal(result.retainedForReview, 1, mode);
    assert.equal(commands.some(command => command instanceof UpdateItemCommand), mode === "update-race", mode);
  }
});

test("pre-aborted execution makes no AWS calls and reports retained capacity", async () => {
  const { sweeper, commands } = harness();
  const abort = new AbortController();
  abort.abort();
  assert.deepEqual(await sweeper.sweep(now, abort.signal), { inspected: 0, timedOut: 0, stopRequested: 0, retainedForReview: 1 });
  assert.equal(commands.length, 0);
});

test("invalid cluster or unbounded slot count cannot create a sweeper", () => {
  assert.throws(() => new StaleJobSweeper({ tableName: "jobs-table", region: "us-east-1", clusterArn, maxActiveJobs: 1 }), /Invalid sweep cluster/);
  assert.throws(() => new StaleJobSweeper({ tableName: "jobs-table", region: "ap-northeast-1", clusterArn, maxActiveJobs: 10 }), /Invalid sweep configuration/);
});
