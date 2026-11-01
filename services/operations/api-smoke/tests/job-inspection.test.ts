import assert from "node:assert/strict";
import test from "node:test";
import type { AttributeValue } from "@aws-sdk/client-dynamodb";
import { attachApplicationMetadata } from "../../../worker/src/analysis.js";
import { groundedSelectionPolicy, renderGroundedAnalysis } from "../../../worker/src/grounded-analysis.js";
import { normalizeQuote } from "../../../worker/src/quote-normalizer.js";
import { inspectAnalysisJob, parseInspectionPlan, type InspectionInput } from "../src/job-inspection.js";

const input: InspectionInput = { jobId: `job_${"a".repeat(48)}`, symbol: "QLD", locale: "ja", modelId: "amazon.nova-lite-v1:0", tableName: "test-jobs", clusterArn: "arn:aws:ecs:ap-northeast-1:000000000000:cluster/test", region: "ap-northeast-1" };
const taskArn = input.clusterArn.replace(":cluster/", ":task/") + "/" + "b".repeat(32);
const quote = normalizeQuote({ symbol: "QLD", price: 100, currency: "USD", marketTimestamp: "2026-09-12T00:00:00Z", retrievedAt: "2026-09-12T00:01:00Z", marketState: "CLOSED", freshness: "LATEST_AVAILABLE", source: "synthetic" }, "QLD");
const required = groundedSelectionPolicy("QLD", quote).required;
const analysis = attachApplicationMetadata(renderGroundedAnalysis({ observationIds: required.observations, riskIds: required.risks, specialConsiderationIds: required.special, uncertaintyId: required.uncertainty }, { symbol: "QLD", locale: "ja", quote }), { ...input, dataAsOf: quote.marketTimestamp });

async function run(mode: string, options = input) {
  let calls = 0;
  let signal: AbortSignal | undefined;
  const result = await inspectAnalysisJob(options, {
    async readJob(command, abortSignal) {
      calls += 1; signal = abortSignal;
      assert.equal(command.input.ConsistentRead, true);
      assert.equal(command.input.Key?.jobId?.S, input.jobId);
      if (mode === "read-error") throw new Error("private provider text");
      const item: Record<string, AttributeValue> = { jobId: { S: input.jobId }, symbol: { S: "QLD" }, locale: { S: "ja" }, operation: { S: "ANALYZE" }, status: { S: "SUCCEEDED" }, attemptCount: { N: "1" }, taskArn: { S: taskArn }, resultJson: { S: JSON.stringify(analysis) } };
      if (mode === "missing") return { $metadata: {} };
      const changes: Record<string, [string, AttributeValue]> = {
        "wrong-job": ["jobId", { S: `job_${"c".repeat(48)}` }], "wrong-locale": ["locale", { S: "en" }], "wrong-symbol": ["symbol", { S: "TSLA" }],
        "wrong-operation": ["operation", { S: "PRICE" }], "job-running": ["status", { S: "RUNNING" }], "retry": ["attemptCount", { N: "2" }],
        "foreign-task": ["taskArn", { S: taskArn.replace("000000000000", "111111111111") }], "invalid-json": ["resultJson", { S: "private invalid text" }],
        "oversize": ["resultJson", { S: "字".repeat(6000) }], "bad-analysis": ["resultJson", { S: JSON.stringify({ ...analysis, disclaimer: "incorrect" }) }],
      };
      const change = changes[mode]; if (change) item[change[0]] = change[1];
      return { $metadata: {}, Item: item };
    },
    async describeTask(command, abortSignal) {
      calls += 1;
      assert.equal(abortSignal, signal);
      assert.equal(command.input.cluster, input.clusterArn);
      assert.deepEqual(command.input.tasks, [taskArn]);
      if (mode === "task-error") throw new Error("private ARN diagnostic");
      const task = { taskArn, clusterArn: input.clusterArn, lastStatus: "STOPPED", desiredStatus: "STOPPED", containers: [{ name: "worker", exitCode: 0 }] };
      if (mode === "task-running") task.lastStatus = "RUNNING";
      if (mode === "desired-running") task.desiredStatus = "RUNNING";
      if (mode === "task-mismatch") task.taskArn += "x";
      if (mode === "cluster-mismatch") task.clusterArn += "x";
      if (mode === "bad-exit") task.containers[0]!.exitCode = 1;
      if (mode === "bad-name") task.containers[0]!.name = "other";
      if (mode === "extra-container") task.containers.push({ name: "sidecar", exitCode: 0 });
      return { $metadata: {}, tasks: mode === "extra-task" ? [task, task] : [task], failures: mode === "missing-task" ? [{ reason: "MISSING" }] : [] };
    },
  });
  assert.equal(result.readCalls, calls);
  assert.ok(calls <= 2);
  assert.doesNotMatch(JSON.stringify(result), /private|arn:|job_[a-f0-9]|QLD|disclaimer|synthetic/);
  return { result, calls };
}

test("private inspection uses two exact reads and validates stopped worker/result", async () => {
  const { result, calls } = await run("valid"); assert.equal(result.passed, true); assert.equal(calls, 2);
});
test("mismatched jobs and foreign tasks stop before ECS access", async () => {
  for (const mode of ["missing", "wrong-job", "wrong-locale", "wrong-symbol", "wrong-operation", "foreign-task", "read-error"]) {
    const { result, calls } = await run(mode); assert.equal(result.passed, false); assert.equal(calls, 1);
  }
});
test("terminal, task identity, exit and private content failures cannot pass", async () => {
  for (const mode of ["job-running", "retry", "invalid-json", "oversize", "bad-analysis", "task-error", "task-running", "desired-running", "task-mismatch", "cluster-mismatch", "bad-exit", "bad-name", "extra-container", "extra-task", "missing-task"]) assert.equal((await run(mode)).result.passed, false, mode);
});
test("invalid inspection boundaries perform no reads", async () => {
  for (const invalid of [{ jobId: "ALL" }, { region: "us-east-1" }, { clusterArn: "not-an-arn" }, { tableName: "*" }, { modelId: "" }]) {
    const { result, calls } = await run("valid", { ...input, ...invalid }); assert.equal(result.passed, false); assert.equal(calls, 0);
  }
});
test("inspection CLI requires one explicit job and defaults to no execution", () => {
  const args = ["--job-id", input.jobId, "--symbol", "QLD", "--locale", "ja"];
  assert.deepEqual(parseInspectionPlan(args), { jobId: input.jobId, symbol: "QLD", locale: "ja", execute: false });
  assert.equal(parseInspectionPlan([...args, "--execute"]).execute, true);
  for (const invalid of [[], ["--job-id"], [...args, "--execute", "--execute"], [...args, "--all"], ["--job-id", "ALL", "--symbol", "QLD", "--locale", "ja"]]) assert.throws(() => parseInspectionPlan(invalid));
});
