import assert from "node:assert/strict";
import { test } from "node:test";
import { createHandler } from "../../services/controller/src/http-handler.js";
import type { ControllerService } from "../../services/controller/src/controller-service.js";
import { controllerLogDiagnosticEvent, controllerLogProofPlan, controllerLogStreamCandidates, reviewControllerDeliveredEvents,
  reviewControllerDiagnosticInvocation, reviewControllerLogGrant } from "../controller-log-delivery-proof.js";
const id = `gmai-log-proof-${"a".repeat(32)}`, request = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const account = "123456789012", group = "/aws/lambda/global-market-ai-insight-dev-controller";
const started = Date.parse("2026-10-07T06:00:00Z"), end = started + 90_000;
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
function lines() {
  const warning = { timestamp: new Date(started + 10).toISOString(), level: "warn", service: "controller", code: "REQUEST_REJECTED",
    publicCode: "VALIDATION_ERROR", requestId: id, httpStatus: 404 };
  return [`START RequestId: ${request}\tVersion: $LATEST`, `${warning.timestamp}\t${request}\tWARN\t${JSON.stringify(warning)}`,
    `END RequestId: ${request}`, `REPORT RequestId: ${request}\tDuration: 1.0 ms\tBilled Duration: 2 ms`];
}
function invocation() {
  return { meta: { StatusCode: 200, ExecutedVersion: "$LATEST", LogResult: Buffer.from(lines().join("\n")).toString("base64") },
    payload: { statusCode: 404, headers: { "cache-control": "no-store" }, body: JSON.stringify({ error: {
      code: "VALIDATION_ERROR", message: "Route not found.", requestId: id } }) } };
}
test("default plan is zero-call with one synchronous existing-function invocation and no workload or IAM mutation", () => {
  const p = controllerLogProofPlan(); assert.equal(p.awsCalls, 0); assert.equal(p.synchronousInvocationsMax, 1); assert.equal(p.iamWrites, 0);
  assert.equal(p.invocationRetryAllowed, false); assert.equal(p.maintenanceAuthorizationProven, false);
  assert.equal(p.readyForMaintenanceDeployment, false);
  for (const args of [["--execute"], ["--invoke-one-existing-rejection"], ["--enable-jobs"]]) assert.throws(() => controllerLogProofPlan(args));
  for (const bad of ["", "PRIVATE_SENTINEL", id + "foreign", "gmai-log-proof-*"]) assert.throws(() => controllerLogDiagnosticEvent(bad));
});
test("the exact diagnostic route emits a public rejection without ever accessing a service method", async () => {
  let calls = 0; const warnings: string[] = [], original = console.warn;
  const service = new Proxy({} as ControllerService, { get() { calls++; throw Error("NO_SERVICE_ACCESS_ALLOWED"); } });
  console.warn = (v: string) => { warnings.push(v); };
  try {
    const response = await createHandler(service)(controllerLogDiagnosticEvent(id));
    assert.equal(response.statusCode, 404); assert.equal(JSON.parse(response.body).error.requestId, id);
    assert.equal(calls, 0); assert.equal(warnings.length, 1); assert.equal(JSON.parse(warnings[0]).code, "REQUEST_REJECTED");
  } finally { console.warn = original; }
});
function policy() { return { Version: "2012-10-17", Statement: [{ Effect: "Allow", Action: ["logs:CreateLogStream", "logs:PutLogEvents"],
  Resource: `arn:aws:logs:ap-northeast-1:${account}:log-group:${group}:*:*` }] }; }
test("only the independently observed two-action exact existing log grant is diagnostic evidence", () => {
  assert.equal(reviewControllerLogGrant(policy(), account).logsPermissionsAdded, false);
  for (const mutate of [ (p: any) => { p.Statement[0].Resource = "*"; }, (p: any) => { p.Statement[0].Action.push("logs:*"); },
    (p: any) => { p.Statement.push({ Effect: "Allow", Action: "*", Resource: "*" }); },
    (p: any) => { p.Statement[0].Resource += "foreign"; }, (p: any) => { p.Statement[0].Condition = {}; } ]) {
    const p = policy(); mutate(p); assert.throws(() => reviewControllerLogGrant(p, account));
  }
});
test("successful invocation must be the exact 404 rejection with correlated complete tail; tail is not delivery proof", () => {
  const f = invocation(), result = reviewControllerDiagnosticInvocation(f.meta, f.payload, id);
  assert.equal(result.request, request); assert.equal(result.rejectionVerified, true); assert.equal(result.cloudWatchDeliveryVerified, false);
  for (const mutate of [
    (f: any) => { f.meta.StatusCode = 202; }, (f: any) => { f.meta.FunctionError = "Unhandled"; },
    (f: any) => { f.meta.ExecutedVersion = "1"; }, (f: any) => { f.payload.statusCode = 202; },
    (f: any) => { f.payload.headers["cache-control"] = "public"; },
    (f: any) => { f.payload.body = JSON.stringify({ error: { code: "PRIVATE_SENTINEL", message: "Route not found.", requestId: id } }); },
    (f: any) => { f.meta.LogResult = Buffer.from(lines().slice(0, 2).join("\n")).toString("base64"); },
    (f: any) => { f.meta.LogResult = Buffer.from(lines().join("\n").replaceAll(request, "11111111-2222-3333-4444-555555555555")).toString("base64"); f.payload.body = "{}"; },
    (f: any) => { f.meta.LogResult = "not-canonical="; },
  ]) { const f = invocation(); mutate(f); assert.throws(() => reviewControllerDiagnosticInvocation(f.meta, f.payload, id)); }
});
function streams(name = `2026/10/07/global-market-ai-insight-dev-controller[$LATEST]${"a".repeat(32)}`) {
  return { logStreams: [{ logStreamName: name, arn: `arn:aws:logs:ap-northeast-1:${account}:log-group:${group}:log-stream:${name}`, creationTime: started + 1 }] };
}
test("bounded current-day default/custom names must belong to the exact group and function/version", () => {
  assert.equal(controllerLogStreamCandidates(streams(), account, started, end)[0].newlyCreated, true);
  assert.equal(controllerLogStreamCandidates(streams(`2026/10/07/[$LATEST]${"a".repeat(32)}`), account, started, end).length, 1);
  const warm = streams(); warm.logStreams[0].creationTime = started - 10;
  assert.equal(controllerLogStreamCandidates(warm, account, started, end)[0].newlyCreated, false);
  warm.logStreams[0].creationTime = started - 60_001; assert.equal(controllerLogStreamCandidates(warm, account, started, end).length, 0);
  for (const mutate of [ (v: any) => { v.nextToken = "PRIVATE_SENTINEL"; }, (v: any) => { v.logStreams[0].arn += "foreign"; },
    (v: any) => { v.logStreams[0].logStreamName = "2026/10/07/foreign[$LATEST]" + "a".repeat(32); },
    (v: any) => { v.logStreams.push(clone(v.logStreams[0])); }, (v: any) => { v.logStreams[0].creationTime = end + 1; },
  ]) { const f = streams(); mutate(f); assert.throws(() => controllerLogStreamCandidates(f, account, started, end)); }
});
function events() { return { events: lines().map((message, n) => ({ message, timestamp: started + 10 + n })) }; }
test("independent CloudWatch evidence requires START, exact synthetic warning, END and REPORT from the same request", () => {
  const report = reviewControllerDeliveredEvents(events(), id, request, started, end);
  assert.equal(report.independentCloudWatchDeliveryVerified, true); assert.equal(report.exhaustiveStreamScanClaimed, false);
  assert.equal(JSON.stringify(report).includes(request), false); assert.equal(JSON.stringify(report).includes(id), false);
  for (const mutate of [ (v: any) => { v.events = []; }, (v: any) => { v.events.pop(); },
    (v: any) => { v.events[1].message = v.events[1].message.replace(id, id.replaceAll("a", "b")); },
    (v: any) => { v.events.push(clone(v.events[1])); },
    (v: any) => { v.events[2].message = "END RequestId: 11111111-2222-3333-4444-555555555555"; },
  ]) { const f = events(); mutate(f); assert.equal(reviewControllerDeliveredEvents(f, id, request, started, end).independentCloudWatchDeliveryVerified, false); }
});
test("time/page/message ambiguity is rejected; partial pages cannot be called an exhaustive scan", () => {
  for (const mutate of [ (v: any) => { v.events[0].timestamp = started - 1; }, (v: any) => { v.events[0].timestamp = end + 1; },
    (v: any) => { v.events[0].message = "x".repeat(4097); }, (v: any) => { v.events = Array(26).fill(v.events[0]); },
  ]) { const f = events(); mutate(f); assert.throws(() => reviewControllerDeliveredEvents(f, id, request, started, end)); }
  const partial = { events: events().events.slice(0, 2), nextForwardToken: "PRIVATE_SENTINEL" };
  assert.equal(reviewControllerDeliveredEvents(partial, id, request, started, end).independentCloudWatchDeliveryVerified, false);
  assert.throws(() => reviewControllerDeliveredEvents(events(), id, request, started, end + 1));
});
