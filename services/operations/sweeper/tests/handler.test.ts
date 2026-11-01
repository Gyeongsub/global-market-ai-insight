import assert from "node:assert/strict";
import test from "node:test";
import { parseMaintenanceConfig, runMaintenance } from "../src/handler.js";

const valid = {
  AWS_REGION: "ap-northeast-1",
  JOBS_TABLE_NAME: "gmai-dev-jobs",
  WORKER_CLUSTER_ARN: "arn:aws:ecs:ap-northeast-1:000000000000:cluster/gmai-dev-worker",
  MAX_ACTIVE_JOBS: "2",
};

test("handler config accepts only the bounded Tokyo cluster and slot cap", () => {
  assert.deepEqual(parseMaintenanceConfig(valid), {
    region: "ap-northeast-1", tableName: "gmai-dev-jobs", clusterArn: valid.WORKER_CLUSTER_ARN, maxActiveJobs: 2,
  });
  for (const env of [
    { ...valid, AWS_REGION: "us-east-1" },
    { ...valid, WORKER_CLUSTER_ARN: "arn:aws:ecs:us-east-1:000000000000:cluster/other" },
    { ...valid, MAX_ACTIVE_JOBS: "100" },
    { ...valid, MAX_ACTIVE_JOBS: "NaN" },
    { ...valid, JOBS_TABLE_NAME: "" },
  ]) assert.throws(() => parseMaintenanceConfig(env), { message: "Invalid maintenance configuration." });
});

test("maintenance reconciles only after sweep completes", async () => {
  const order: string[] = [];
  const result = await runMaintenance(
    { async run() { order.push("sweep"); return { inspected: 1 }; } },
    { async run() { order.push("reconcile"); return { released: 0 }; } },
  );
  assert.deepEqual(order, ["sweep", "reconcile"]);
  assert.deepEqual(result, { sweep: { inspected: 1 }, reconcile: { released: 0 } });
});

test("a failed sweep does not reconcile or release capacity", async () => {
  let called = false;
  await assert.rejects(() => runMaintenance(
    { async run() { throw new Error("simulated failure"); } },
    { async run() { called = true; return {}; } },
  ));
  assert.equal(called, false);
});
