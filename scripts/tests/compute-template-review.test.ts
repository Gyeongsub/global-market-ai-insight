import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { computeReviewSynthEnvironment, computeTemplateReviewPlan, deployedComputeAvailabilityZones, reviewComputeTemplates, safeComputeReviewTemporaryDirectory } from "../compute-template-review.js";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const EXPORT = "global-market-ai-insight-dev-foundation:ExportsOutputFnGetAttJobsTableArn";
function templates() {
  const compute = { Resources: {
    Worker: { Type: "AWS::ECS::TaskDefinition", Properties: { ContainerDefinitions: [{ User: "65532:65532", ReadonlyRootFilesystem: true, Image: "PRIVATE_SENTINEL" }], Family: "global-market-ai-insight-dev-worker" } },
    Controller: { Type: "AWS::Lambda::Function", Properties: { FunctionName: "global-market-ai-insight-dev-controller", Code: { S3Key: "PRIVATE_SENTINEL" }, Environment: { Variables: { ENABLE_PROVIDER_BACKED_JOBS: "false", ENABLE_LIVE_RESULT_DISPLAY: "false" } } } },
    ControllerPolicy: { Type: "AWS::IAM::Policy", Properties: { PolicyDocument: { Statement: [{ Effect: "Allow", Action: ["dynamodb:GetItem"], Resource: { "Fn::ImportValue": EXPORT }, Condition: { Null: { "dynamodb:LeadingKeys": "false" } } }] } } },
  }, Outputs: { SafeOutput: { Value: "PRIVATE_SENTINEL" } } };
  const foundation = { Resources: { JobsTable: { Type: "AWS::DynamoDB::Table", Properties: {} } }, Outputs: { Jobs: { Value: "PRIVATE_SENTINEL", Export: { Name: EXPORT } } } };
  return { live: clone(compute), proposed: clone(compute), foundation };
}
test("read-only plan defaults to zero AWS calls and rejects execution alternatives", () => {
  const plan = computeTemplateReviewPlan(); assert.equal(plan.awsCalls, 0); assert.equal(plan.assetUploads, 0); assert.equal(plan.changeSetsCreated, 0);
  assert.equal(plan.readyForDeployment, false); assert.throws(() => computeTemplateReviewPlan(["--deploy"]));
  const result = spawnSync(process.execPath, [resolve("node_modules/tsx/dist/cli.mjs"), resolve("scripts/compute-template-review.ts")], { encoding: "utf8" });
  assert.equal(result.status, 0); assert.equal(JSON.parse(result.stdout).cloudMutations, 0);
});
test("identical templates prove only structural comparison and existing exports, not deployment", () => {
  const input = templates(); const report = reviewComputeTemplates(input.live, input.proposed, input.foundation);
  assert.equal(report.comparedComputeResources, 3); assert.deepEqual(report.changedResources, []); assert.equal(report.existingFoundationExportCompatibility, true);
  assert.equal(report.fullReplacementAndIamReviewComplete, false); assert.equal(report.deploymentPerformed, false); assert.equal(report.readyForDeployment, false);
  assert.equal(JSON.stringify(report).includes("PRIVATE_SENTINEL"), false);
});
test("object field ordering is irrelevant but ordered arrays are not silently normalized", () => {
  const input = templates(); input.proposed.Resources.Worker.Properties.ContainerDefinitions[0] = { Image: "PRIVATE_SENTINEL", ReadonlyRootFilesystem: true, User: "65532:65532" };
  assert.deepEqual(reviewComputeTemplates(input.live, input.proposed, input.foundation).changedResources, []);
  input.proposed.Resources.ControllerPolicy.Properties.PolicyDocument.Statement[0].Action = ["dynamodb:PutItem", "dynamodb:GetItem"];
  const report = reviewComputeTemplates(input.live, input.proposed, input.foundation);
  assert.deepEqual(report.changedResources[0]?.addedIamActions, ["dynamodb:PutItem"]); assert.equal(report.changedResources[0]?.policyResourceOrConditionReviewStillRequired, true);
});
test("changed code and image are named without leaking their private values", () => {
  const input = templates(); input.proposed.Resources.Controller.Properties.Code.S3Key = "PRIVATE_SENTINEL_NEW";
  input.proposed.Resources.Worker.Properties.ContainerDefinitions[0]!.Image = "PRIVATE_SENTINEL_NEW";
  const report = reviewComputeTemplates(input.live, input.proposed, input.foundation);
  assert.deepEqual(report.changedResources.map(resource => resource.changedProperties), [["Code"], ["ContainerDefinitions"]]);
  assert.equal(JSON.stringify(report).includes("PRIVATE_SENTINEL"), false);
});
test("new/removed resources and non-property changes are explicit, never an implicit patch approval", () => {
  const input: any = templates(); delete input.proposed.Resources.ControllerPolicy;
  input.proposed.Resources.NewLogs = { Type: "AWS::Logs::LogGroup", Properties: {} };
  input.proposed.Resources.Worker.DeletionPolicy = "Retain";
  const report = reviewComputeTemplates(input.live, input.proposed, input.foundation);
  assert.deepEqual(report.addedResourceIds, ["NewLogs"]); assert.deepEqual(report.removedResourceIds, ["ControllerPolicy"]);
  assert.equal(report.changedResources[0]?.nonPropertyFieldsChanged, true); assert.equal(report.readyForDeployment, false);
});
test("CDK default-security-group custom resource is accounted for, not mistaken for invalid cloud data", () => {
  const input: any = templates();
  input.live.Resources.VpcRestrict = { Type: "Custom::VpcRestrictDefaultSG", Properties: { ServiceToken: "PRIVATE_SENTINEL" } };
  input.proposed.Resources.VpcRestrict = clone(input.live.Resources.VpcRestrict);
  const report = reviewComputeTemplates(input.live, input.proposed, input.foundation);
  assert.equal(report.comparedComputeResources, 4); assert.deepEqual(report.changedResources, []);
});
test("missing foundation exports block compatibility; unresolved import/export expressions fail closed", () => {
  const input: any = templates(); input.foundation.Outputs = {};
  assert.equal(reviewComputeTemplates(input.live, input.proposed, input.foundation).existingFoundationExportCompatibility, false);
  input.proposed.Resources.ControllerPolicy.Properties.PolicyDocument.Statement[0].Resource["Fn::ImportValue"] = { "Fn::Sub": EXPORT };
  assert.throws(() => reviewComputeTemplates(input.live, input.proposed, input.foundation));
  const next: any = templates(); next.foundation.Outputs.Jobs.Export.Name = { "Fn::Sub": EXPORT };
  assert.throws(() => reviewComputeTemplates(next.live, next.proposed, next.foundation));
});
test("unreviewable policy forms do not get mislabeled as complete IAM evidence", () => {
  for (const mutate of [(statement: any) => { statement.Effect = "Deny"; }, (statement: any) => { statement.NotAction = "*"; },
    (statement: any) => { statement.NotResource = "*"; }, (statement: any) => { statement.Action = "PRIVATE_SENTINEL"; }]) {
    const input = templates(); mutate(input.proposed.Resources.ControllerPolicy.Properties.PolicyDocument.Statement[0]);
    assert.throws(() => reviewComputeTemplates(input.live, input.proposed, input.foundation));
  }
});
test("enabled execution, extra worker containers and weaker hardening fail", () => {
  for (const mutate of [(input: any) => { input.Resources.Controller.Properties.Environment.Variables.ENABLE_PROVIDER_BACKED_JOBS = "true"; },
    (input: any) => { input.Resources.Controller.Properties.Environment.Variables.ENABLE_LIVE_RESULT_DISPLAY = "true"; },
    (input: any) => { input.Resources.Worker.Properties.ContainerDefinitions[0].User = "root"; },
    (input: any) => { input.Resources.Worker.Properties.ContainerDefinitions[0].ReadonlyRootFilesystem = false; },
    (input: any) => { input.Resources.Worker.Properties.ContainerDefinitions.push({}); }]) {
    const input = templates(); mutate(input.proposed); assert.throws(() => reviewComputeTemplates(input.live, input.proposed, input.foundation));
  }
});
test("always-on ECS service, NAT or load balancer additions are refused even in a local proposal", () => {
  for (const type of ["AWS::ECS::Service", "AWS::EC2::NatGateway", "AWS::ElasticLoadBalancingV2::LoadBalancer"]) {
    const input: any = templates(); input.proposed.Resources.Extra = { Type: type, Properties: {} };
    assert.throws(() => reviewComputeTemplates(input.live, input.proposed, input.foundation));
  }
});
test("outputs and other template section changes are not hidden from the resource-only summary", () => {
  const input: any = templates(); input.proposed.Outputs.SafeOutput.Value = "PRIVATE_SENTINEL_NEW"; input.proposed.Conditions = { Optional: false };
  assert.deepEqual(reviewComputeTemplates(input.live, input.proposed, input.foundation).changedTemplateSections, ["Conditions", "Outputs"]);
});
test("invalid bounded templates/resource identifiers are rejected before private values could be emitted", () => {
  for (const input of [null, {}, { Resources: {} }, { Resources: { "arn:aws:PRIVATE_SENTINEL": { Type: "AWS::Logs::LogGroup" } } },
    { Resources: { Key: { Type: "PRIVATE_SENTINEL" } } }]) {
    const normal = templates(); assert.throws(() => reviewComputeTemplates(input, normal.proposed, normal.foundation));
  }
});
test("synthesis receives no cloud/AI credentials and cannot inherit execution/public flags", () => {
  const env = computeReviewSynthEnvironment({ AWS_SECRET_ACCESS_KEY: "PRIVATE_SENTINEL", AWS_PROFILE: "foreign", GMAI_ENABLE_API: "true", GMAI_ENABLE_INTERNAL_JOBS: "true",
    NODE_OPTIONS: "PRIVATE_SENTINEL", HTTP_PROXY: "PRIVATE_SENTINEL", OPENAI_API_KEY: "PRIVATE_SENTINEL", CDK_CONTEXT_JSON: "PRIVATE_SENTINEL" },
  "123456789012", `sha256:${"a".repeat(64)}`, resolve("safe-assembly"));
  assert.equal(env.GMAI_ENABLE_INTERNAL_JOBS, "false"); assert.equal(env.GMAI_ENABLE_API, "true"); assert.equal(env.CDK_DISABLE_CLI_TELEMETRY, "true");
  assert.equal(JSON.stringify(env).includes("PRIVATE_SENTINEL"), false);
  assert.throws(() => computeReviewSynthEnvironment({}, "000000000000", `sha256:${"a".repeat(64)}`, "path"));
  assert.throws(() => computeReviewSynthEnvironment({}, "123456789012", "latest", "path"));
});
test("only the two already-deployed public-worker subnet zones may supply synthesis context", () => {
  const value = { Resources: {
    WorkerVpcpublicworkerSubnet1Subnet37E39F3A: { Type: "AWS::EC2::Subnet", Properties: { AvailabilityZone: "ap-northeast-1a", MapPublicIpOnLaunch: true } },
    WorkerVpcpublicworkerSubnet2Subnet073D8779: { Type: "AWS::EC2::Subnet", Properties: { AvailabilityZone: "ap-northeast-1c", MapPublicIpOnLaunch: true } },
  } };
  const zones = deployedComputeAvailabilityZones(value); assert.deepEqual(zones, ["ap-northeast-1a", "ap-northeast-1c"]);
  const env = computeReviewSynthEnvironment({}, "123456789012", `sha256:${"a".repeat(64)}`, "assembly", zones);
  assert.deepEqual(JSON.parse(env.CDK_CONTEXT_JSON!), { "availability-zones:account=123456789012:region=ap-northeast-1": zones });
  for (const mutate of [(input: any) => { input.Resources.WorkerVpcpublicworkerSubnet1Subnet37E39F3A.Properties.AvailabilityZone = "ap-northeast-2a"; },
    (input: any) => { input.Resources.WorkerVpcpublicworkerSubnet1Subnet37E39F3A.Properties.AvailabilityZone = { "Fn::GetAZs": "" }; },
    (input: any) => { input.Resources.WorkerVpcpublicworkerSubnet1Subnet37E39F3A.Properties.MapPublicIpOnLaunch = false; },
    (input: any) => { input.Resources.WorkerVpcpublicworkerSubnet2Subnet073D8779.Properties.AvailabilityZone = "ap-northeast-1a"; },
    (input: any) => { input.Resources.Extra = clone(input.Resources.WorkerVpcpublicworkerSubnet1Subnet37E39F3A); }]) {
    const next = clone(value); mutate(next); assert.throws(() => deployedComputeAvailabilityZones(next));
  }
});
test("arbitrary, duplicate or foreign-region context injection is rejected", () => {
  for (const zones of [[], ["ap-northeast-1a"], ["ap-northeast-1a", "ap-northeast-1a"], ["ap-northeast-1a", "ap-northeast-2c"], ["PRIVATE_SENTINEL", "ap-northeast-1c"]]) {
    assert.throws(() => computeReviewSynthEnvironment({}, "123456789012", `sha256:${"a".repeat(64)}`, "assembly", zones));
  }
});
test("only the physically owned direct-child temporary assembly is removable", () => {
  const base = resolve(tmpdir()), physical = realpathSync(base), directory = mkdtempSync(join(base, "gmai-compute-review-"));
  const foreign = mkdtempSync(join(base, "not-gmai-review-"));
  try {
    assert.equal(safeComputeReviewTemporaryDirectory(base, directory, physical), true);
    assert.equal(safeComputeReviewTemporaryDirectory(base, foreign, physical), false);
    assert.equal(safeComputeReviewTemporaryDirectory(base, base, physical), false);
    assert.equal(safeComputeReviewTemporaryDirectory(base, directory, `${physical}-foreign`), false);
    const link = join(directory, "junction"); symlinkSync(foreign, link, "junction");
    assert.equal(safeComputeReviewTemporaryDirectory(base, link, physical), false);
  } finally { rmSync(directory, { recursive: true }); rmSync(foreign, { recursive: true }); }
});
