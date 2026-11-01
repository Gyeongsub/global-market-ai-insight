import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { classifyPhase11DeploymentFailure } from "../phase11-deployment-diagnostics.js";

const privateMarker = "PRIVATE_VALUE_MUST_NOT_ESCAPE";

test("deployment diagnostics classify known signals without printing private content", () => {
  const result = classifyPhase11DeploymentFailure({
    process: { exitCode: 1, stdout: `${privateMarker} No export named private-export found`, stderr: `AccessDenied ${privateMarker}` },
    stackEvents: { StackEvents: [{ ResourceStatus: "CREATE_FAILED", ResourceType: "AWS::Logs::MetricFilter", LogicalResourceId: privateMarker, PhysicalResourceId: privateMarker, ResourceStatusReason: `already exists ${privateMarker}` }] },
    changeSets: { Summaries: [{ Status: "FAILED", ChangeSetId: privateMarker, StatusReason: `AWS::EarlyValidation::ResourceExistenceCheck ${privateMarker}` }] },
  });
  assert.deepEqual(result.signals, ["AUTHORIZATION", "MISSING_EXPORT", "NAME_CONFLICT", "EARLY_VALIDATION"]);
  assert.deepEqual(result.failedResourceTypes, { "AWS::Logs::MetricFilter": 1 });
  assert.equal(result.causeConfirmed, false);
  assert.equal(result.readyForRetry, false);
  assert.equal(JSON.stringify(result).includes(privateMarker), false);
});

test("empty stack events never infer a cause or successful deployment", () => {
  const result = classifyPhase11DeploymentFailure({ process: { exitCode: 1, stderr: privateMarker }, stackEvents: { StackEvents: [] }, changeSets: { Summaries: [] } });
  assert.deepEqual(result.signals, []);
  assert.equal(result.failureEvents, 0);
  assert.equal(result.processFailed, true);
  assert.equal(result.readyForRetry, false);
  assert.equal(result.nextAction, "COLLECT_BOUNDED_PRIVATE_DIAGNOSTICS_BEFORE_RETRY");
});

test("partial pages and unavailable evidence remain explicitly incomplete", () => {
  const result = classifyPhase11DeploymentFailure({ stackEvents: { StackEvents: [], NextToken: privateMarker } });
  assert.equal(result.stackEventsComplete, false);
  assert.equal(result.changeSetsComplete, false);
  assert.equal(result.processFailed, null);
  assert.equal(JSON.stringify(result).includes(privateMarker), false);
});

test("unknown resource types cannot inject identifiers into the summary", () => {
  const result = classifyPhase11DeploymentFailure({ stackEvents: { StackEvents: [{ ResourceStatus: "CREATE_FAILED", ResourceType: privateMarker }] } });
  assert.deepEqual(result.failedResourceTypes, { OTHER_RESOURCE: 1 });
  assert.equal(JSON.stringify(result).includes(privateMarker), false);
});

test("malformed or oversized diagnostic input fails instead of looking successful", () => {
  for (const input of [null, [], { process: {} }, { process: { exitCode: -1 } }, { process: { exitCode: 1, stdout: {} } },
    { stackEvents: {} }, { stackEvents: { StackEvents: [null] } }, { changeSets: { Summaries: [{ Status: privateMarker }] } },
    { stackEvents: { StackEvents: Array.from({ length: 201 }, () => ({})) } },
    { process: { exitCode: 1, stdout: privateMarker.repeat(100_000) } }]) {
    assert.throws(() => classifyPhase11DeploymentFailure(input));
  }
});

test("authentication, template and quota signals remain categories only", () => {
  for (const [text, signal] of [["ExpiredToken", "AUTHENTICATION"], ["ValidationError", "TEMPLATE_VALIDATION"], ["ServiceQuotaExceeded", "QUOTA"],
    ["Failed to publish asset", "ASSET_PUBLISH"], ["requires bootstrap stack", "BOOTSTRAP"], ["ThrottlingException", "THROTTLING"]]) {
    const result = classifyPhase11DeploymentFailure({ process: { exitCode: 1, stderr: `${text} ${privateMarker}` } });
    assert.deepEqual(result.signals, [signal]);
    assert.equal(JSON.stringify(result).includes(privateMarker), false);
  }
});

test("CLI defaults to no input/no AWS and invalid stdin produces only a generic error", () => {
  const args = [resolve("node_modules/tsx/dist/cli.mjs"), resolve("scripts/phase11-deployment-diagnostics.ts")];
  const dryRun = spawnSync(process.execPath, args, { encoding: "utf8", timeout: 10_000 });
  assert.equal(dryRun.status, 0);
  assert.equal(JSON.parse(dryRun.stdout).awsCalls, 0);
  const invalid = spawnSync(process.execPath, [...args, "--stdin-json"], { input: privateMarker, encoding: "utf8", timeout: 10_000 });
  assert.equal(invalid.status, 1);
  assert.equal(invalid.stdout, "");
  assert.equal(invalid.stderr.includes(privateMarker), false);
  assert.deepEqual(JSON.parse(invalid.stderr), { error: "DEPLOYMENT_DIAGNOSTICS_FAILED", rawDetailsSuppressed: true });
  const valid = spawnSync(process.execPath, [...args, "--stdin-json"], { input: JSON.stringify({ process: { exitCode: 1, stderr: `ValidationError ${privateMarker}` } }), encoding: "utf8", timeout: 10_000 });
  assert.equal(valid.status, 0);
  assert.equal(valid.stderr, "");
  assert.deepEqual(JSON.parse(valid.stdout).signals, ["TEMPLATE_VALIDATION"]);
  assert.equal(valid.stdout.includes(privateMarker), false);
});
