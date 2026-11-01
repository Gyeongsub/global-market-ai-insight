import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { canonicalPatchValue, canonicalStackTags, computePatchChangeSetDiagnostic, computePatchDetailDiagnostic, computePatchRolloutPlan, reviewComputePatchChangeSet, reviewDatedPatchArchiveProof,
  reviewExclusiveComputePatch, reviewRolloutAssetDestination, rolloutAssetFingerprint, safeRolloutDirectory, preservedStackTagArguments, reviewedChangeSetArguments, computePatchContextDiagnostic, reviewComputePatchReferenceContexts } from "../compute-patch-rollout.js";
import { PATCH } from "../worker-patch-identity.js";

const TASK = "WorkerTaskDefinition8AD2CCFF", CONTROLLER = "ControllerFunctionC25B79B1", POLICY = "ControllerRoleDefaultPolicyA5FA0784";
const STACK = "global-market-ai-insight-dev-compute", ACCOUNT = "123456789012", OLD = `sha256:${"b".repeat(64)}`;
const NOW = Date.parse("2026-10-04T10:30:00Z"), NAME = `gmai-compute-patch-${"a".repeat(32)}`;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
function templates() {
  const proposed: any = { Resources: {
    [TASK]: { Type: "AWS::ECS::TaskDefinition", Properties: { Cpu: "256", Memory: "512", Family: "global-market-ai-insight-dev-worker",
      ContainerDefinitions: [{ User: "65532:65532", ReadonlyRootFilesystem: true, Image: `PRIVATE_SENTINEL@${PATCH.runtimeDigest}`, Secrets: [{ ValueFrom: "PRIVATE_SENTINEL" }] }] } },
    [CONTROLLER]: { Type: "AWS::Lambda::Function", Properties: { FunctionName: "global-market-ai-insight-dev-controller", Code: { S3Bucket: "PRIVATE_SENTINEL", S3Key: `${"a".repeat(64)}.zip` },
      Environment: { Variables: { ENABLE_PROVIDER_BACKED_JOBS: "false", ENABLE_LIVE_RESULT_DISPLAY: "false", WORKER_TASK_DEFINITION: { Ref: TASK } } } } },
    [POLICY]: { Type: "AWS::IAM::Policy", Properties: { PolicyDocument: { Statement: [{ Effect: "Allow", Action: "ecs:RunTask", Resource: { Ref: TASK },
      Condition: { ArnEquals: { "ecs:cluster": { "Fn::GetAtt": ["WorkerClusterB2BB5BD9", "Arn"] } } } }] } } },
    WorkerClusterB2BB5BD9: { Type: "AWS::ECS::Cluster", Properties: {} },
  }, Outputs: { TaskDefinitionArn: { Value: { Ref: TASK } } } };
  for (let i = 0; i < 22; i++) proposed.Resources[`Logs${i}`] = { Type: "AWS::Logs::LogGroup", Properties: { RetentionInDays: 7 } };
  const live = clone(proposed); live.Resources[TASK].Properties.ContainerDefinitions[0].Image = `PRIVATE_SENTINEL@${OLD}`;
  live.Resources[CONTROLLER].Properties.Code.S3Key = `${"b".repeat(64)}.zip`;
  live.Resources.CDKMetadata = { Type: "AWS::CDK::Metadata", Properties: { Analytics: "PRIVATE_SENTINEL" } };
  live.Resources.Logs0.Metadata = { "aws:cdk:path": "PRIVATE_SENTINEL" };
  const foundation = { Resources: { Table: { Type: "AWS::DynamoDB::Table", Properties: {} } }, Outputs: {} };
  return { live, proposed, foundation };
}
function changeSet() {
  const resource = (id: string, type: string, name: string, indirect = false) => ({ Type: "Resource", ResourceChange: {
    LogicalResourceId: id, Action: "Modify", ResourceType: type, Replacement: id === TASK ? "True" : "False", Scope: ["Properties"], Details: [{
      Evaluation: indirect ? "Dynamic" : "Static", ChangeSource: indirect ? "ResourceReference" : "DirectModification",
      ...(indirect ? { CausingEntity: TASK } : {}), Target: { Attribute: "Properties", Name: name, RequiresRecreation: id === TASK ? "Always" : "Never" },
    }],
  } });
  const stack = { StackId: `arn:aws:cloudformation:ap-northeast-1:${ACCOUNT}:stack/${STACK}/PRIVATE_SENTINEL`, Tags: [], NotificationARNs: [] };
  const value: any = { StackId: stack.StackId, StackName: STACK, ChangeSetName: NAME,
    ChangeSetId: `arn:aws:cloudformation:ap-northeast-1:${ACCOUNT}:changeSet/${NAME}/PRIVATE_SENTINEL`, Status: "CREATE_COMPLETE", ExecutionStatus: "AVAILABLE",
    CreationTime: new Date(NOW - 30_000).toISOString(), Tags: [], NotificationARNs: [], Changes: [
      resource(TASK, "AWS::ECS::TaskDefinition", "ContainerDefinitions"), resource(CONTROLLER, "AWS::Lambda::Function", "Code"),
      resource(POLICY, "AWS::IAM::Policy", "PolicyDocument", true), { Type: "Resource", ResourceChange: { LogicalResourceId: "CDKMetadata", Action: "Remove", ResourceType: "AWS::CDK::Metadata" } },
    ] };
  return { value, stack };
}

function referenceFixture() {
  const t=templates(), cs=changeSet(), role="global-market-ai-insight-dev-compute-ControllerRoleTEST", policyName="ControllerRoleDefaultPolicyA5FA0784";
  const oldTask=`arn:aws:ecs:ap-northeast-1:${ACCOUNT}:task-definition/global-market-ai-insight-dev-worker:9`;
  const cluster=`arn:aws:ecs:ap-northeast-1:${ACCOUNT}:cluster/global-market-ai-insight-dev-worker`;
  const controller={FunctionArn:`arn:aws:lambda:ap-northeast-1:${ACCOUNT}:function:global-market-ai-insight-dev-controller`,
    Role:`arn:aws:iam::${ACCOUNT}:role/${role}`,Environment:{Variables:{WORKER_TASK_DEFINITION:oldTask,WORKER_CLUSTER:cluster}}};
  for(const template of [t.live,t.proposed]) {
    Object.assign(template.Resources[POLICY].Properties,{Roles:[{Ref:"ControllerRole10B665F1"}],PolicyName:policyName});
    template.Resources[POLICY].Properties.PolicyDocument.Version="2012-10-17";
    template.Resources[CONTROLLER].Properties.Environment.Variables.WORKER_CLUSTER=cluster;
  }
  const beforePolicy=clone(t.live.Resources[POLICY]); beforePolicy.Properties.Roles=[role];
  beforePolicy.Properties.PolicyDocument.Statement[0].Resource=oldTask;
  beforePolicy.Properties.PolicyDocument.Statement[0].Condition={ArnEquals:{"ecs:cluster":cluster}};
  const afterPolicy=clone(beforePolicy); afterPolicy.Properties.PolicyDocument.Statement[0].Resource="{{changeSet:KNOWN_AFTER_APPLY}}";
  const beforeController=clone(t.live.Resources[CONTROLLER]); beforeController.Properties.Role=controller.Role;
  beforeController.Properties.Environment.Variables.WORKER_TASK_DEFINITION=oldTask;
  const afterController=clone(beforeController); afterController.Properties.Code.S3Key=t.proposed.Resources[CONTROLLER].Properties.Code.S3Key;
  afterController.Properties.Environment.Variables.WORKER_TASK_DEFINITION="{{changeSet:KNOWN_AFTER_APPLY}}";
  const writeContexts=()=>{
    Object.assign(cs.value.Changes[1].ResourceChange,{BeforeContext:JSON.stringify(beforeController),AfterContext:JSON.stringify(afterController)});
    Object.assign(cs.value.Changes[2].ResourceChange,{BeforeContext:JSON.stringify(beforePolicy),AfterContext:JSON.stringify(afterPolicy)});
  };writeContexts();
  cs.value.Changes[1].ResourceChange.Details.push({Evaluation:"Static",ChangeSource:"ResourceReference",CausingEntity:TASK,Target:{Attribute:"Properties",Name:"Environment",RequiresRecreation:"Never"}},
    {Evaluation:"Dynamic",ChangeSource:"DirectModification",Target:{Attribute:"Properties",Name:"Environment",RequiresRecreation:"Never"}});
  cs.value.Changes[2].ResourceChange.Details[0]={Evaluation:"Static",ChangeSource:"DirectModification",Target:{Attribute:"Properties",Name:"PolicyDocument",RequiresRecreation:"Never"}};
  const iam={RoleName:role,PolicyName:policyName,PolicyDocument:clone(beforePolicy.Properties.PolicyDocument)};
  return {...t,...cs,controller,iam,beforePolicy,afterPolicy,beforeController,afterController,writeContexts};
}

test("direct policy/dynamic environment details require independent IAM, exact contexts and a branded change-set-bound proof",()=>{
  const r=referenceFixture(); const proof=reviewComputePatchReferenceContexts(r.value,r.live,r.proposed,r.controller,r.iam);
  assert.equal(proof.currentInlinePolicyIndependentlyMatched,true);
  assert.throws(()=>reviewComputePatchChangeSet(r.value,ACCOUNT,NAME,r.stack,NOW,NOW-60000));
  assert.throws(()=>reviewComputePatchChangeSet(r.value,ACCOUNT,NAME,r.stack,NOW,NOW-60000,{}, {...proof}));
  assert.equal(reviewComputePatchChangeSet(r.value,ACCOUNT,NAME,r.stack,NOW,NOW-60000,{},proof).completeNonpaginated,true);
  r.value.Changes[2].ResourceChange.Details[0].Evaluation="Dynamic";
  assert.throws(()=>reviewComputePatchChangeSet(r.value,ACCOUNT,NAME,r.stack,NOW,NOW-60000,{},proof));
  assert.equal(JSON.stringify(proof).includes(ACCOUNT),false);
});

test("resolved reference proof blocks policy drift, wildcard task, attachment changes, mismatched placeholders and controller broadening",()=>{
  const changes=[
    (r:ReturnType<typeof referenceFixture>)=>{r.iam.PolicyDocument.Statement[0].Action="ecs:*";},
    (r:ReturnType<typeof referenceFixture>)=>{r.iam.RoleName="other";},
    (r:ReturnType<typeof referenceFixture>)=>{r.afterPolicy.Properties.PolicyDocument.Statement[0].Resource="*";},
    (r:ReturnType<typeof referenceFixture>)=>{r.afterPolicy.Properties.PolicyDocument.Statement[0].Condition={};},
    (r:ReturnType<typeof referenceFixture>)=>{r.afterPolicy.Properties.PolicyDocument.Statement.push({Effect:"Allow",Action:"iam:*",Resource:"*"});},
    (r:ReturnType<typeof referenceFixture>)=>{r.afterPolicy.Properties.Roles.push("other");},
    (r:ReturnType<typeof referenceFixture>)=>{r.afterPolicy.Properties.PolicyName="other";},
    (r:ReturnType<typeof referenceFixture>)=>{r.afterController.Properties.Environment.Variables.WORKER_TASK_DEFINITION="unknown";},
    (r:ReturnType<typeof referenceFixture>)=>{r.afterController.Properties.Environment.Variables.ENABLE_PROVIDER_BACKED_JOBS="true";},
    (r:ReturnType<typeof referenceFixture>)=>{r.afterController.Properties.Environment.Variables.ENABLE_LIVE_RESULT_DISPLAY="true";},
    (r:ReturnType<typeof referenceFixture>)=>{r.afterController.Properties.Role=`arn:aws:iam::${ACCOUNT}:role/other`;},
    (r:ReturnType<typeof referenceFixture>)=>{r.afterController.Properties.Code.S3Bucket="other";},
    (r:ReturnType<typeof referenceFixture>)=>{r.proposed.Resources[POLICY].Properties.PolicyDocument.Statement[0].Resource="*";},
    (r:ReturnType<typeof referenceFixture>)=>{r.value.Changes[1].ResourceChange.Details.splice(1,1);},
  ];
  for(const change of changes){const r=referenceFixture();change(r);r.writeContexts();assert.throws(()=>reviewComputePatchReferenceContexts(r.value,r.live,r.proposed,r.controller,r.iam));}
  const r=referenceFixture();r.value.Changes[2].ResourceChange.BeforeContext="{";
  assert.throws(()=>reviewComputePatchReferenceContexts(r.value,r.live,r.proposed,r.controller,r.iam));
});

test("private property context diagnostics expose fixed classifications only, never policy or environment values", () => {
  const input=changeSet(), oldTask=`arn:aws:ecs:ap-northeast-1:${ACCOUNT}:task-definition/global-market-ai-insight-dev-worker:9`;
  const policies=(task: unknown) => ({Properties:{PolicyDocument:{Version:"2012-10-17",Statement:[{Action:"ecs:RunTask",Resource:task,Condition:{ArnEquals:{"ecs:cluster":"PRIVATE_SENTINEL"}}}]}}});
  const env=(task: unknown) => ({Properties:{Environment:{Variables:{PRIVATE_TOKEN:"PRIVATE_SENTINEL",WORKER_TASK_DEFINITION:task,ENABLE_PROVIDER_BACKED_JOBS:"false",ENABLE_LIVE_RESULT_DISPLAY:"false"}}}});
  Object.assign(input.value.Changes[1].ResourceChange,{BeforeContext:JSON.stringify(env(oldTask)),AfterContext:JSON.stringify(env({Ref:TASK}))});
  Object.assign(input.value.Changes[2].ResourceChange,{BeforeContext:JSON.stringify(policies(oldTask)),AfterContext:JSON.stringify(policies({Ref:TASK}))});
  const report=computePatchContextDiagnostic(input.value,oldTask);
  assert.equal(report.policyOtherwiseIdentical,true); assert.equal(report.environmentOtherwiseIdentical,true);
  assert.equal(report.beforePolicyTask.currentTaskArn,true); assert.equal(report.afterPolicyTask.exactIntrinsicTaskReference,true);
  assert.equal(report.executionFlagsRemainDisabled,true);
  for(const secret of [oldTask,ACCOUNT,"PRIVATE_SENTINEL","arn:aws"])assert.equal(JSON.stringify(report).includes(secret),false);
  input.value.Changes[2].ResourceChange.AfterContext="{";
  assert.equal(computePatchContextDiagnostic(input.value,oldTask).afterPolicyContextPresent,false);
  input.value.Changes[2].ResourceChange.AfterContext="x".repeat(200001);
  assert.equal(computePatchContextDiagnostic(input.value,oldTask).afterPolicyContextPresent,false);
});

test("exclusive rollout is zero-AWS by default and never accepts generic deployment/enable flags", () => {
  const plan = computePatchRolloutPlan(); assert.equal(plan.awsCalls, 0); assert.equal(plan.deployments, 0); assert.equal(plan.rollbackDisabled, false);
  for (const args of [["--deploy"], ["--enable-jobs"], ["--digest", OLD]]) assert.throws(() => computePatchRolloutPlan(args));
  const result = spawnSync(process.execPath, [resolve("node_modules/tsx/dist/cli.mjs"), resolve("scripts/compute-patch-rollout.ts")], { encoding: "utf8" });
  assert.equal(result.status, 0); assert.equal(JSON.parse(result.stdout).workerTasksLaunched, 0);
  const rejected = spawnSync(process.execPath, [resolve("node_modules/tsx/dist/cli.mjs"), resolve("scripts/compute-patch-rollout.ts"), "PRIVATE_SENTINEL"], { encoding: "utf8" });
  assert.equal(rejected.status, 1); assert.equal(rejected.stderr.includes("PRIVATE_SENTINEL"), false);
});
test("only the dated worker image and controller object key may change; three task references are explicit", () => {
  const input = templates(), report = reviewExclusiveComputePatch(input.live, input.proposed, input.foundation, OLD);
  assert.equal(report.indirectTaskReferencesReviewed, 3); assert.equal(report.taskDefinitionReplacementExpected, true);
  assert.deepEqual(report.metadataOnlyChangeTypes, { Logs0: "AWS::Logs::LogGroup" });
  assert.equal(JSON.stringify(report).includes("PRIVATE_SENTINEL"), false);
});
test("IAM, network, retention, deletion policy and non-image container deltas fail closed", () => {
  for (const mutate of [
    (t: any) => { t.Resources[POLICY].Properties.PolicyDocument.Statement[0].Resource = "*"; },
    (t: any) => { t.Resources[POLICY].Properties.PolicyDocument.Statement[0].Condition = {}; },
    (t: any) => { t.Resources.WorkerClusterB2BB5BD9.Properties.ClusterName = "other"; },
    (t: any) => { t.Resources.Logs0.Properties.RetentionInDays = 30; },
    (t: any) => { t.Resources.Logs0.DeletionPolicy = "Delete"; },
    (t: any) => { t.Resources[TASK].Properties.ContainerDefinitions[0].Secrets = []; },
    (t: any) => { t.Resources[TASK].Properties.ContainerDefinitions[0].User = "root"; },
    (t: any) => { t.Resources[TASK].Properties.Cpu = "512"; },
    (t: any) => { t.Resources[CONTROLLER].Properties.Code.S3Bucket = "other"; },
    (t: any) => { t.Resources[CONTROLLER].Properties.Environment.Variables.ENABLE_PROVIDER_BACKED_JOBS = "true"; },
    (t: any) => { t.Resources[CONTROLLER].Properties.Code.S3Key = "latest.zip"; },
  ]) { const input = templates(); mutate(input.proposed); assert.throws(() => reviewExclusiveComputePatch(input.live, input.proposed, input.foundation, OLD)); }
});
test("new/removed resources, export changes, unknown sections and extra task references are refused", () => {
  for (const mutate of [
    (t: any) => { t.Resources.Extra = { Type: "AWS::Logs::LogGroup", Properties: {} }; },
    (t: any) => { delete t.Resources.Logs21; },
    (t: any) => { t.Outputs.TaskDefinitionArn.Description = "changed"; },
    (t: any) => { t.MetadataExtra = {}; },
    (t: any) => { t.Outputs.Other = { Value: { Ref: TASK } }; },
  ]) { const input = templates(); mutate(input.proposed); assert.throws(() => reviewExclusiveComputePatch(input.live, input.proposed, input.foundation, OLD)); }
  const input = templates(); input.live.Resources.CDKMetadata.Type = "AWS::Logs::LogGroup";
  assert.throws(() => reviewExclusiveComputePatch(input.live, input.proposed, input.foundation, OLD));
  assert.throws(() => reviewExclusiveComputePatch(templates().proposed, templates().proposed, input.foundation, PATCH.runtimeDigest));
});
test("complete fresh owned change set allows one task replacement and only its known dependents", () => {
  const input = changeSet(), report = reviewComputePatchChangeSet(input.value, ACCOUNT, NAME, input.stack, NOW, NOW - 60_000);
  assert.equal(report.reviewedChanges.length, 4); assert.equal(report.completeNonpaginated, true);
  assert.equal(JSON.stringify(report).includes("PRIVATE_SENTINEL"), false);
  input.value.Changes[1].ResourceChange.Details.push({ Evaluation: "Dynamic", ChangeSource: "ResourceReference", CausingEntity: TASK,
    Target: { Attribute: "Properties", Name: "Environment", RequiresRecreation: "Never" } });
  assert.equal(reviewComputePatchChangeSet(input.value, ACCOUNT, NAME, input.stack, NOW, NOW - 60_000).onlyReviewedTaskReplacementAndDependents, true);
});
test("metadata-only changes need the separately reviewed resource type and cannot hide Properties changes", () => {
  const input = changeSet(); input.value.Changes.push({ Type: "Resource", ResourceChange: { LogicalResourceId: "Logs0", Action: "Modify", ResourceType: "AWS::Logs::LogGroup",
    Replacement: "False", Scope: ["Metadata"], Details: [{ Evaluation: "Static", ChangeSource: "DirectModification", Target: { Attribute: "Metadata", RequiresRecreation: "Never" } }] } });
  assert.throws(() => reviewComputePatchChangeSet(input.value, ACCOUNT, NAME, input.stack, NOW, NOW - 60_000));
  assert.equal(reviewComputePatchChangeSet(input.value, ACCOUNT, NAME, input.stack, NOW, NOW - 60_000, { Logs0: "AWS::Logs::LogGroup" }).reviewedChanges.length, 5);
  input.value.Changes.at(-1).ResourceChange.Scope.push("Properties");
  assert.throws(() => reviewComputePatchChangeSet(input.value, ACCOUNT, NAME, input.stack, NOW, NOW - 60_000, { Logs0: "AWS::Logs::LogGroup" }));
});
test("foreign, incomplete, stale, nested, unready and rollback-disabled change sets are rejected", () => {
  for (const mutate of [
    (v: any) => { v.StackId += "other"; }, (v: any) => { v.ChangeSetId = v.ChangeSetId.replace(ACCOUNT, "999999999999"); },
    (v: any) => { v.NextToken = "PRIVATE_SENTINEL"; }, (v: any) => { v.Status = "CREATE_IN_PROGRESS"; }, (v: any) => { v.ExecutionStatus = "EXECUTE_IN_PROGRESS"; },
    (v: any) => { v.IncludeNestedStacks = true; }, (v: any) => { v.ParentChangeSetId = "PRIVATE_SENTINEL"; }, (v: any) => { v.ImportExistingResources = true; },
    (v: any) => { v.OnStackFailure = "DO_NOTHING"; }, (v: any) => { v.CreationTime = new Date(NOW + 1000).toISOString(); },
    (v: any) => { v.CreationTime = new Date(NOW - 600_000).toISOString(); }, (v: any) => { v.Tags.push({ Key: "PRIVATE_SENTINEL", Value: "other" }); },
    (v: any) => { v.NotificationARNs.push("PRIVATE_SENTINEL"); },
  ]) { const input = changeSet(); mutate(input.value); assert.throws(() => reviewComputePatchChangeSet(input.value, ACCOUNT, NAME, input.stack, NOW, NOW - 60_000)); }
});

test("Metadata may omit recreation per AWS API but never authorize conditional/always replacement", () => {
  const input = changeSet();
  const detail: any = { Evaluation: "Static", ChangeSource: "DirectModification", Target: { Attribute: "Metadata" } };
  input.value.Changes[1].ResourceChange.Scope.push("Metadata");
  input.value.Changes[1].ResourceChange.Details.push(detail);
  for (const value of [undefined, null, "Never"]) {
    detail.Target.RequiresRecreation = value;
    assert.equal(reviewComputePatchChangeSet(input.value, ACCOUNT, NAME, input.stack, NOW, NOW - 60_000).completeNonpaginated, true);
  }
  for (const value of ["Always", "Conditionally", "PRIVATE_SENTINEL"]) {
    detail.Target.RequiresRecreation = value;
    assert.throws(() => reviewComputePatchChangeSet(input.value, ACCOUNT, NAME, input.stack, NOW, NOW - 60_000));
  }
});

test("detail diagnostics redact arbitrary IDs, causes, targets and private values", () => {
  const input = changeSet();
  input.value.Changes[0].ResourceChange.LogicalResourceId = "PRIVATE_SENTINEL";
  Object.assign(input.value.Changes[0].ResourceChange.Details[0], {CausingEntity:"PRIVATE_SENTINEL",BeforeValue:"PRIVATE_SENTINEL",AfterValue:"PRIVATE_SENTINEL"});
  input.value.Changes[0].ResourceChange.Details[0].Target.Name = "PRIVATE_SENTINEL";
  const report = computePatchDetailDiagnostic(input.value);
  assert.equal(JSON.stringify(report).includes("PRIVATE_SENTINEL"), false);
  assert.equal(report[0].logicalId, "out-of-scope");
});
test("unplanned replacement, direct policy changes and changed IAM actions cannot pass a change-set review", () => {
  for (const mutate of [
    (v: any) => { v.Changes[0].ResourceChange.Replacement = "False"; },
    (v: any) => { v.Changes[1].ResourceChange.Replacement = "True"; },
    (v: any) => { v.Changes[2].ResourceChange.Details[0].ChangeSource = "DirectModification"; },
    (v: any) => { v.Changes[2].ResourceChange.Details[0].CausingEntity = CONTROLLER; },
    (v: any) => { v.Changes[1].ResourceChange.Details[0].Target.Name = "Role"; },
    (v: any) => { v.Changes[0].ResourceChange.Details[0].Target.Name = "TaskRoleArn"; },
    (v: any) => { v.Changes[0].ResourceChange.LogicalResourceId = "Unexpected"; },
    (v: any) => { v.Changes.push(clone(v.Changes[0])); },
    (v: any) => { v.Changes.splice(2, 1); },
  ]) { const input = changeSet(); mutate(input.value); assert.throws(() => reviewComputePatchChangeSet(input.value, ACCOUNT, NAME, input.stack, NOW, NOW - 60_000)); }
});
test("old Basic counts alone or a scanner without owned cleanup cannot authorize rollout", () => {
  const proof: any = { mode: "dated-private-candidate-cached-archive-scan", datedCandidateScanned: true, archiveGatePassed: true, scannerDatabaseFresh: true,
    exactImageConfigMatched: true, indexChildAndLocalConfigMatched: true, archiveContentsMatchedToRuntimeManifest: true, controllerStillDisabled: true,
    ownedScannerAbsent: true, temporaryArchiveAndCacheRemoved: true, detectedSecrets: 0, severityCounts: { UNKNOWN: 0, LOW: 8, MEDIUM: 23, HIGH: 0, CRITICAL: 0 },
    awsCalls: 30, cloudMutations: 0, imagePulls: 0, imagePushes: 0, credentialRetrievals: 0, dockerSocketMounted: false, sourceOrHomeMounted: false, osPackagesInspected: 14 };
  assert.equal(reviewDatedPatchArchiveProof(proof).freshDatedCandidateArchiveGatePassed, true);
  for (const key of ["archiveGatePassed", "scannerDatabaseFresh", "datedCandidateScanned", "ownedScannerAbsent", "temporaryArchiveAndCacheRemoved", "archiveContentsMatchedToRuntimeManifest"]) {
    const wrong = clone(proof); wrong[key] = false; assert.throws(() => reviewDatedPatchArchiveProof(wrong));
  }
  for (const key of ["UNKNOWN", "HIGH", "CRITICAL"]) { const wrong = clone(proof); wrong.severityCounts[key] = 1; assert.throws(() => reviewDatedPatchArchiveProof(wrong)); }
  assert.throws(() => reviewDatedPatchArchiveProof({ basicOsGatePassed: true }));
});
test("bounded asset fingerprint detects bytes/path changes and refuses symlinks or foreign files", () => {
  const directory = mkdtempSync(join(tmpdir(), "gmai-compute-rollout-")), foreign = mkdtempSync(join(tmpdir(), "gmai-rollout-test-"));
  try {
    const asset = join(directory, "asset"); mkdirSync(asset); writeFileSync(join(asset, "main.mjs"), "PRIVATE_SENTINEL");
    const first = rolloutAssetFingerprint(directory, [asset]); assert.equal(first.files, 1); assert.equal(first.bytes, 16);
    writeFileSync(join(asset, "main.mjs"), "PRIVATE_SENTINEL2"); assert.notEqual(rolloutAssetFingerprint(directory, [asset]).fingerprint, first.fingerprint);
    assert.throws(() => rolloutAssetFingerprint(directory, [foreign]));
    const link = join(directory, "linked"); symlinkSync(foreign, link, "junction"); assert.throws(() => rolloutAssetFingerprint(directory, [link]));
    assert.equal(canonicalPatchValue({ b: 2, a: 1 }), canonicalPatchValue({ a: 1, b: 2 }));
  } finally { rmSync(directory, { recursive: true }); rmSync(foreign, { recursive: true }); }
});
test("cleanup is limited to the owned physical direct-child rollout directory", () => {
  const base = resolve(tmpdir()), physical = realpathSync(base), directory = mkdtempSync(join(base, "gmai-compute-rollout-"));
  try {
    assert.equal(safeRolloutDirectory(base, directory, physical), true);
    assert.equal(safeRolloutDirectory(base, base, physical), false);
    assert.equal(safeRolloutDirectory(base, directory, `${physical}-foreign`), false);
  } finally { rmSync(directory, { recursive: true }); }
});

test("only the standard CDK partition placeholder is normalized; account, role, key and bucket stay exact", () => {
  const hash = "a".repeat(64), value: any = { bucketName: `cdk-hnb659fds-assets-${ACCOUNT}-ap-northeast-1`, objectKey: `${hash}.zip`, region: "ap-northeast-1",
    assumeRoleArn: `arn:\${AWS::Partition}:iam::${ACCOUNT}:role/cdk-hnb659fds-file-publishing-role-${ACCOUNT}-ap-northeast-1` };
  assert.equal(reviewRolloutAssetDestination(value, ACCOUNT, hash).exactOwnedBootstrapDestination, true);
  value.assumeRoleArn = value.assumeRoleArn.replace("${AWS::Partition}", "aws");
  assert.equal(reviewRolloutAssetDestination(value, ACCOUNT, hash).exactOwnedBootstrapDestination, true);
  for (const mutate of [(v: any) => { v.assumeRoleArn = v.assumeRoleArn.replace("arn:aws:", "arn:aws-cn:"); },
    (v: any) => { v.assumeRoleArn = v.assumeRoleArn.replace(ACCOUNT, "999999999999"); }, (v: any) => { v.assumeRoleArn += "other"; },
    (v: any) => { v.bucketName += "other"; }, (v: any) => { v.region = "ap-northeast-2"; },
    (v: any) => { v.objectKey = `${hash}../other.zip`; }, (v: any) => { v.assumeRoleAdditionalOptions = { Policy: "PRIVATE_SENTINEL" }; }]) {
    const wrong = clone(value); mutate(wrong); assert.throws(() => reviewRolloutAssetDestination(wrong, ACCOUNT, hash));
  }
});

test("stack tags are unordered unique key/value pairs, not permission to change or drop tags", () => {
  const input = changeSet(); input.stack.Tags = [{Key:"Env",Value:"dev"},{Key:"Project",Value:"PRIVATE_SENTINEL"}] as any;
  input.value.Tags = clone(input.stack.Tags).reverse();
  assert.equal(reviewComputePatchChangeSet(input.value, ACCOUNT, NAME, input.stack, NOW, NOW - 60_000).completeNonpaginated, true);
  assert.equal(computePatchChangeSetDiagnostic(input.value, ACCOUNT, NAME, input.stack, NOW, NOW - 60_000).exactTagMapMatched, true);
  assert.equal(JSON.stringify(computePatchChangeSetDiagnostic(input.value, ACCOUNT, NAME, input.stack, NOW, NOW - 60_000)).includes("PRIVATE_SENTINEL"), false);
  input.value.Tags[0].Value = "other"; assert.throws(() => reviewComputePatchChangeSet(input.value, ACCOUNT, NAME, input.stack, NOW, NOW - 60_000));
  assert.throws(() => canonicalStackTags([{Key:"Env",Value:"a"},{Key:"Env",Value:"b"}]));
  assert.throws(() => canonicalStackTags([{Key:"Env",Value:3}]));
  assert.deepEqual(preservedStackTagArguments([{Key:"Env",Value:"dev"}]), ["--tags","Env=dev"]);
  assert.throws(() => preservedStackTagArguments([{Key:"Env",Value:"dev=other"}]));
});
test("reviewed replacement draft is explicit UPDATE, no nested/import and unchanged role/tags/parameter",()=>{
  const stack={Parameters:[{ParameterKey:"BootstrapVersion",ParameterValue:"PRIVATE_SENTINEL"}],Tags:[{Key:"Env",Value:"dev"}],RoleARN:"PRIVATE_SENTINEL_ROLE"};
  const args=reviewedChangeSetArguments(NAME,stack,resolve("private-template.json"));
  assert.equal(args.includes("--no-include-nested-stacks"),true);assert.equal(args.includes("--no-import-existing-resources"),true);
  assert.equal(args[args.indexOf("--change-set-type")+1],"UPDATE");assert.equal(args[args.indexOf("--role-arn")+1],stack.RoleARN);
  assert.deepEqual(JSON.parse(args[args.indexOf("--tags")+1]),stack.Tags);
  assert.deepEqual(JSON.parse(args[args.indexOf("--parameters")+1]),[{ParameterKey:"BootstrapVersion",UsePreviousValue:true}]);
  assert.equal(args.includes("CAPABILITY_AUTO_EXPAND"),false);assert.equal(args.join(" ").includes("PRIVATE_SENTINEL\""),false);
  assert.throws(()=>reviewedChangeSetArguments(NAME,{...stack,Parameters:[{ParameterKey:"Other"}]},resolve("template.json")));
});
