import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyOperationalFailureLog,
  OPERATIONAL_FAILURE_METRICS,
  OPERATIONAL_FAILURE_SUFFIXES,
} from "../src/error-metric-catalog.js";

test("fixed structured-log contracts map to exactly three dimensionless metric identities", () => {
  assert.equal(OPERATIONAL_FAILURE_METRICS.length, 3);
  assert.equal(new Set(OPERATIONAL_FAILURE_SUFFIXES).size, 3);
  assert.deepEqual(OPERATIONAL_FAILURE_METRICS.map(item => item.field), ["code", "errorCode", "errorCode"]);
  assert.deepEqual(OPERATIONAL_FAILURE_METRICS.map(item => item.value), ["TASK_LAUNCH_FAILED", "PROVIDER_ERROR", "MODEL_ERROR"]);
  assert.doesNotMatch(JSON.stringify(OPERATIONAL_FAILURE_METRICS), /jobId|requestId|symbol|locale|dimension|message/i);
});

test("only the expected service and fixed code select an operational failure metric", () => {
  assert.equal(classifyOperationalFailureLog({ service: "controller", code: "TASK_LAUNCH_FAILED", jobId: "ignored" }), "TaskLaunchFailures");
  assert.equal(classifyOperationalFailureLog({ service: "worker", errorCode: "PROVIDER_ERROR", diagnosticCategory: "HTTP" }), "ProviderFailures");
  assert.equal(classifyOperationalFailureLog({ service: "worker", errorCode: "MODEL_ERROR" }), "ModelFailures");
  for (const event of [
    null,
    { service: "worker", code: "TASK_LAUNCH_FAILED" },
    { service: "controller", errorCode: "PROVIDER_ERROR" },
    { service: "worker", errorCode: "BEDROCK_THROTTLED" },
    { service: "controller", code: "REQUEST_FAILED" },
    { service: "unknown", code: "TASK_LAUNCH_FAILED" },
  ]) assert.equal(classifyOperationalFailureLog(event), null);
});
