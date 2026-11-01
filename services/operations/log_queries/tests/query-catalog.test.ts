import assert from "node:assert/strict";
import test from "node:test";
import {
  diagnosticQueryCatalog,
  jobTraceQuery,
  projectLogGroups,
  requestTraceQuery,
} from "../src/query-catalog.js";

const groups = projectLogGroups("global-market-ai-insight", "dev");

test("derives only the three reviewed project log groups", () => {
  assert.deepEqual(groups, {
    apiAccess: "/aws/apigateway/global-market-ai-insight-dev-api-access",
    controller: "/aws/lambda/global-market-ai-insight-dev-controller",
    worker: "/aws/ecs/global-market-ai-insight-dev/worker",
  });
  for (const values of [["Bad_Project", "dev"], ["gmai", "Prod!"], ["../gmai", "dev"]]) {
    assert.throws(() => projectLogGroups(values[0]!, values[1]!), /identity is invalid/);
  }
});

test("summary catalog is bounded and never selects raw log messages", () => {
  const catalog = diagnosticQueryCatalog(groups);
  assert.deepEqual(catalog.map(({ name }) => name), [
    "api-status-summary",
    "controller-failure-summary",
    "worker-failure-summary",
  ]);
  for (const plan of catalog) {
    assert.equal(plan.suggestedLookbackMinutes, 15);
    assert.ok(plan.maximumRows <= 20);
    assert.match(plan.query, new RegExp(`limit ${plan.maximumRows}$`));
    assert.doesNotMatch(plan.query, /@message|provider|prompt|credential|secret|taskArn/i);
    assert.ok(plan.logGroups.every(group => Object.values(groups).includes(group)));
  }
  const controller = catalog.find(({ name }) => name === "controller-failure-summary");
  assert.match(controller?.query ?? "", /publicCode/);
  assert.match(controller?.query ?? "", /level = 'warn' or level = 'error'/);
});

test("exact request and job traces accept only injection-safe identifiers", () => {
  const request = requestTraceQuery(groups, "request-123:abc");
  assert.deepEqual(request.logGroups, [groups.apiAccess, groups.controller]);
  assert.match(request.query, /requestId = 'request-123:abc'/);
  assert.match(request.query, /jobId, operation/);
  assert.equal(request.maximumRows, 50);

  const job = jobTraceQuery(groups, "job_0123456789abcdef0123456789abcdef0123456789abcdef");
  assert.deepEqual(job.logGroups, [groups.controller, groups.worker]);
  assert.match(job.query, /jobId = 'job_0123456789abcdef0123456789abcdef0123456789abcdef'/);
  assert.doesNotMatch(job.query, /@message|taskArn/i);

  for (const value of ["' or 1=1", "line\nbreak", "x".repeat(101), ""]) {
    assert.throws(() => requestTraceQuery(groups, value), /Request ID is invalid/);
    assert.throws(() => jobTraceQuery(groups, value), /Job ID is invalid/);
  }
});
