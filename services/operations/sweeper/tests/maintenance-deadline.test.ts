import assert from "node:assert/strict";
import test from "node:test";
import { GetItemCommand, UpdateItemCommand, TransactWriteItemsCommand } from "@aws-sdk/client-dynamodb";
import { DescribeTasksCommand, StopTaskCommand } from "@aws-sdk/client-ecs";
import { StaleJobSweeper } from "../src/stale-job-sweeper.js";
import { SlotReconciler } from "../src/slot-reconciler.js";

const owner = `job_${"a".repeat(48)}`;
const cluster = "arn:aws:ecs:ap-northeast-1:000000000000:cluster/test";
const task = `${cluster.replace(":cluster/", ":task/")}/${"b".repeat(32)}`;
const created = "2026-10-18T00:00:00.000Z";
const now = new Date("2026-10-18T00:02:00.000Z");
type Command = GetItemCommand | UpdateItemCommand | TransactWriteItemsCommand | DescribeTasksCommand | StopTaskCommand;

function fixture(terminal: boolean, after: (stage: string) => void | Promise<void>, elapsedNow?: () => number) {
  const stages: string[] = [];
  let stopped = terminal;
  const send = async (command: Command, options: { abortSignal: AbortSignal }): Promise<unknown> => {
    assert.ok(options.abortSignal instanceof AbortSignal);
    const stage = command instanceof GetItemCommand ? command.input.Key?.jobId?.S === "control_slot_0" ? "slot" : "job" :
      command instanceof DescribeTasksCommand ? stopped ? "stopped" : "running" :
      command instanceof StopTaskCommand ? "stop" : command instanceof UpdateItemCommand ? "timeout" : "release";
    stages.push(stage);
    await after(stage);
    if (stage === "slot") return { Item: { ownerJobId: { S: owner }, acquiredAt: { S: created } } };
    if (stage === "job") return { Item: { jobId: { S: owner }, createdAt: { S: created },
      status: { S: terminal ? "SUCCEEDED" : "RUNNING" }, deadlineAt: { S: "2026-10-18T00:01:00.000Z" },
      version: { N: "3" }, taskArn: { S: task } } };
    if (stage === "stop") { stopped = true; return {}; }
    if (stage === "running" || stage === "stopped") return { tasks: [{ taskArn: task, clusterArn: cluster,
      startedBy: owner.slice(0, 36), lastStatus: stopped ? "STOPPED" : "RUNNING", desiredStatus: stopped ? "STOPPED" : "RUNNING",
      overrides: { containerOverrides: [{ name: "worker", environment: [{ name: "JOB_ID", value: owner }] }] } }] };
    return {};
  };
  const options = { tableName: "jobs-table", region: "ap-northeast-1", clusterArn: cluster, maxActiveJobs: 1,
    dynamo: { send }, ecs: { send }, ...(elapsedNow ? { elapsedNow } : {}) };
  return { stages, sweep: new StaleJobSweeper(options), reconcile: new SlotReconciler(options) };
}

test("sweep cancellation discards late reads before any subsequent effect", async () => {
  for (const stopAt of ["slot", "job", "running", "stop", "stopped", "timeout"]) {
    const abort = new AbortController();
    const f = fixture(false, stage => { if (stage === stopAt) abort.abort(); });
    const result = await f.sweep.sweep(now, abort.signal);
    assert.equal(f.stages.at(-1), stopAt, stopAt);
    assert.equal(result.timedOut, 0, stopAt);
    assert.equal(result.retainedForReview, 1, stopAt);
    assert.equal(result.stopRequested, ["stopped", "timeout"].includes(stopAt) ? 1 : 0, stopAt);
  }
});

test("reconciliation cancellation never releases from late stopped-task evidence", async () => {
  for (const stopAt of ["slot", "job", "stopped", "release"]) {
    const abort = new AbortController();
    const f = fixture(true, stage => { if (stage === stopAt) abort.abort(); });
    assert.deepEqual(await f.reconcile.reconcile(abort.signal), { released: 0, retained: 1, empty: 0 }, stopAt);
    assert.equal(f.stages.at(-1), stopAt, stopAt);
  }
});

test("monotonic sweep deadline rejects late evidence even before the timer callback runs", async () => {
  for (const stopAt of ["slot", "job", "running", "stop", "stopped", "timeout"]) {
    let elapsed = 0;
    const f = fixture(false, stage => { if (stage === stopAt) elapsed = 20_000; }, () => elapsed);
    const result = await f.sweep.sweep(now);
    assert.equal(f.stages.at(-1), stopAt, stopAt);
    assert.equal(result.timedOut, 0, stopAt);
    assert.equal(result.retainedForReview, 1, stopAt);
  }
});

test("monotonic reconciliation deadline rejects late evidence and acknowledgements", async () => {
  for (const stopAt of ["slot", "job", "stopped", "release"]) {
    let elapsed = 0;
    const f = fixture(true, stage => { if (stage === stopAt) elapsed = 10_000; }, () => elapsed);
    assert.deepEqual(await f.reconcile.reconcile(), { released: 0, retained: 1, empty: 0 }, stopAt);
    assert.equal(f.stages.at(-1), stopAt, stopAt);
  }
});

test("invalid or backward monotonic readings retain capacity without later calls", async () => {
  for (const reading of [Number.NaN, Infinity, -1, 99]) {
    let elapsed = 100;
    const f = fixture(false, stage => { if (stage === "job") elapsed = reading; }, () => elapsed);
    assert.equal((await f.sweep.sweep(now)).retainedForReview, 1);
    assert.deepEqual(f.stages, ["slot", "job"]);
  }
});

test("parent cancellation bounds an uncooperative pending read and consumes its late rejection", { timeout: 2_000 }, async () => {
  for (const terminal of [false, true]) {
    const abort = new AbortController();
    let rejectLate: (reason: unknown) => void = () => {};
    const f = fixture(terminal, async () => {
      queueMicrotask(() => abort.abort());
      await new Promise<void>((_resolve, reject) => { rejectLate = reject; });
    });
    const result = terminal ? await f.reconcile.reconcile(abort.signal) : await f.sweep.sweep(now, abort.signal);
    assert.deepEqual(result, terminal ? { released: 0, retained: 1, empty: 0 } :
      { inspected: 0, timedOut: 0, stopRequested: 0, retainedForReview: 1 });
    rejectLate(new Error("private late transport detail"));
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(f.stages, ["slot"]);
  }
});

test("pre-cancelled multi-slot work retains every reservation without any transport call", async () => {
  const abort = new AbortController(); abort.abort();
  let calls = 0;
  const send = async () => { calls++; throw new Error("must not call"); };
  const options = { tableName: "jobs-table", region: "ap-northeast-1", clusterArn: cluster, maxActiveJobs: 3,
    dynamo: { send }, ecs: { send } };
  assert.deepEqual(await new StaleJobSweeper(options).sweep(now, abort.signal),
    { inspected: 0, timedOut: 0, stopRequested: 0, retainedForReview: 3 });
  assert.deepEqual(await new SlotReconciler(options).reconcile(abort.signal), { released: 0, retained: 3, empty: 0 });
  assert.equal(calls, 0);
});
