import assert from "node:assert/strict";
import { test } from "node:test";
import { OWNER_FUNCTION, OWNER_RESOURCE, OWNER_STACK, ownerDraftIdentity, proposeOwnerTemplate,
  reviewOwnerDraft, reviewOwnerIdentity, reviewOwnerRuntime, reviewOwnerStack, reviewOwnerTemplate } from "../private-owner-review.js";
const account = "123456789012", region = "ap-northeast-1", zip = "b".repeat(64);
const started = Date.parse("2026-10-25T06:00:00Z"), now = started + 10000, name = `gmai-owner-${"a".repeat(32)}`;
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
export function ownerFixture() {
  const identity = { Account: account, Arn: `arn:aws:iam::${account}:user/aws-admin-user`, UserId: `AIDA${"A".repeat(17)}` };
  const live: any = { Resources: Object.fromEntries(Array.from({length:25}, (_,i)=>[`Other${i}`, { Type:"AWS::IAM::Role", Properties:{ Marker:i } }])), Outputs: { Keep: { Value: "PRIVATE_SENTINEL" } } };
  const p = { FunctionName: OWNER_FUNCTION, Runtime:"nodejs22.x", Handler:"main.handler", Architectures:["x86_64"],
    Role:`arn:aws:iam::${account}:role/controller`, Code:{S3Bucket:`cdk-hnb659fds-assets-${account}-${region}`,S3Key:`${"a".repeat(64)}.zip`},
    Environment:{Variables:{ENABLE_PROVIDER_BACKED_JOBS:"false",ENABLE_LIVE_RESULT_DISPLAY:"false",API_AUTH_MODE:"AWS_IAM",CIRCUIT_STATE:"CLOSED"}} };
  live.Resources[OWNER_RESOURCE] = {Type:"AWS::Lambda::Function", Properties:p};
  const runtime: any = { ...clone(p), FunctionArn:`arn:aws:lambda:${region}:${account}:function:${OWNER_FUNCTION}`, State:"Active",LastUpdateStatus:"Successful", CodeSha256:Buffer.from("a".repeat(64),"hex").toString("base64"),RevisionId:"before" };
  delete runtime.Code;
  const proposed=proposeOwnerTemplate(live,identity,zip);
  const stack: any = {StackName:OWNER_STACK,StackId:`arn:aws:cloudformation:${region}:${account}:stack/${OWNER_STACK}/test`,StackStatus:"UPDATE_COMPLETE",
    RoleARN:`arn:aws:iam::${account}:role/cdk-hnb659fds-cfn-exec-role-${account}-${region}`,Parameters:[{ParameterKey:"BootstrapVersion",ParameterValue:"/cdk-bootstrap/hnb659fds/version",ResolvedValue:"30"}], Tags:[],NotificationARNs:[]};
  const draft: any = { StackId:stack.StackId,StackName:OWNER_STACK,ChangeSetName:name,ChangeSetId:`arn:aws:cloudformation:${region}:${account}:changeSet/${name}/test`,
    CreationTime:new Date(started+1000).toISOString(),Status:"CREATE_COMPLETE",ExecutionStatus:"AVAILABLE",IncludeNestedStacks:false,Parameters:clone(stack.Parameters),Tags:[],NotificationARNs:[],
    Changes:[{Type:"Resource",ResourceChange:{LogicalResourceId:OWNER_RESOURCE,ResourceType:"AWS::Lambda::Function",Action:"Modify",Replacement:"False",Scope:["Properties"],
      Details:["Code","Environment"].map(Name=>({Evaluation:"Static",ChangeSource:"DirectModification",Target:{Attribute:"Properties",Name,RequiresRecreation:"Never",Path:`/Properties/${Name}`}})),
      BeforeContext:JSON.stringify(live.Resources[OWNER_RESOURCE]),AfterContext:JSON.stringify(proposed.Resources[OWNER_RESOURCE])}}] };
  return {identity,live,runtime,proposed,stack,draft};
}
const review = (f:ReturnType<typeof ownerFixture>)=>reviewOwnerDraft(f.draft,f.stack,f.identity,name,started,now,f.live,f.proposed,f.runtime,zip);

test("exclusive controller owner/code delta preserves original template and exposes only decisions",()=>{
  const f=ownerFixture(), original=clone(f.live); const result=review(f);
  assert.equal(result.exactlyOneNonReplacingLambdaUpdate,true); assert.equal(result.iamChanged,false);
  assert.deepEqual(f.live,original); assert.equal(JSON.stringify(result).includes(account),false);
  f.draft.Parameters[0].UsePreviousValue=true; review(f);
});
test("wrong identity, open admission, foreign artifacts and unrelated template changes fail",()=>{
  for(const mutate of [
    (f:any)=>{f.identity.Arn=f.identity.Arn.replace("user/aws-admin-user","root")},
    (f:any)=>{f.identity.UserId="AROA"+"A".repeat(17)},
    (f:any)=>{f.live.Resources[OWNER_RESOURCE].Properties.Environment.Variables.ENABLE_PROVIDER_BACKED_JOBS="true"},
    (f:any)=>{f.live.Resources[OWNER_RESOURCE].Properties.Environment.Variables.ENABLE_LIVE_RESULT_DISPLAY="true"},
    (f:any)=>{f.live.Resources[OWNER_RESOURCE].Properties.Environment.Variables.PRIVATE_OWNER_USER_ARN="PRIVATE_SENTINEL"},
    (f:any)=>{f.live.Resources[OWNER_RESOURCE].Properties.Code.S3Bucket="foreign"},
    (f:any)=>{f.proposed.Resources.Other0.Properties.Marker=99},
    (f:any)=>{f.proposed.Resources[OWNER_RESOURCE].Properties.MemorySize=10240},
    (f:any)=>{f.proposed.Outputs.Keep.Value="changed"},
  ]) {const f=ownerFixture();mutate(f);assert.throws(()=>reviewOwnerTemplate(f.live,f.proposed,f.identity,zip),/^Error: PRIVATE_OWNER_/);}
  assert.throws(()=>reviewOwnerIdentity({}),/IDENTITY/);
  assert.throws(()=>proposeOwnerTemplate(ownerFixture().live,ownerFixture().identity,"../bad"),/ARTIFACT/);
});
test("draft validates exact ownership, freshness, rollback, parameters and no extra resources",()=>{
  for(const mutate of [
    (f:any)=>{f.draft.StackId+="foreign"},(f:any)=>{f.draft.ChangeSetName+="foreign"},
    (f:any)=>{f.draft.CreationTime=new Date(started-2000).toISOString()},(f:any)=>{f.draft.NextToken="more"},
    (f:any)=>{f.stack.DisableRollback=true},(f:any)=>{f.draft.ImportExistingResources=true},
    (f:any)=>{f.draft.Parameters[0].ResolvedValue="31"},(f:any)=>{f.draft.Tags=[{Key:"x",Value:"y"}]},
    (f:any)=>{f.draft.Changes.push(clone(f.draft.Changes[0]))},(f:any)=>{f.draft.Changes[0].ResourceChange.Replacement="Conditional"},
    (f:any)=>{f.draft.Changes[0].ResourceChange.Details[0].Target.Name="Role"},
    (f:any)=>{f.draft.Changes[0].ResourceChange.Details[0].Evaluation="Dynamic"},
    (f:any)=>{f.draft.ExecutionStatus="EXECUTE_COMPLETE"},
    (f:any)=>{f.draft.RollbackConfiguration={MonitoringTimeInMinutes:10}},
  ]){const f=ownerFixture();mutate(f);assert.throws(()=>review(f),/^Error: PRIVATE_OWNER_/);}
  const f=ownerFixture();assert.throws(()=>ownerDraftIdentity(f.draft,f.stack,account,name,started,started+1_800_001));
  assert.throws(()=>reviewOwnerStack({...f.stack,StackStatus:"UPDATE_IN_PROGRESS"},account));
});
test("resolved before/after context and runtime are not replaced by change-set property labels",()=>{
  for(const mutate of [
    (f:any)=>{f.draft.Changes[0].ResourceChange.BeforeContext="{}"},
    (f:any)=>{f.runtime.Environment.Variables.EXTRA="PRIVATE_SENTINEL"},
    (f:any)=>{const r=f.draft.Changes[0].ResourceChange,v=JSON.parse(r.AfterContext);v.Properties.Role+="foreign";r.AfterContext=JSON.stringify(v)},
    (f:any)=>{const r=f.draft.Changes[0].ResourceChange,v=JSON.parse(r.BeforeContext);v.Properties.Code.S3Key="bad";r.BeforeContext=JSON.stringify(v)},
  ]){const f=ownerFixture();mutate(f);assert.throws(()=>review(f),/^Error: PRIVATE_OWNER_/);}
});
test("post-update proof binds actual zip digest, owner and unchanged runtime, not a success acknowledgment",()=>{
  const f=ownerFixture(),after=clone(f.runtime);after.CodeSha256=Buffer.from(zip,"hex").toString("base64");
  after.Environment.Variables.PRIVATE_OWNER_USER_ARN=f.identity.Arn;after.RevisionId="after";
  assert.equal(reviewOwnerRuntime(f.runtime,after,f.identity,zip).deployedCodeDigestMatched,true);
  for(const mutate of [(v:any)=>{v.CodeSha256="bad"},(v:any)=>{v.Role+="foreign"},(v:any)=>{v.Environment.Variables.ENABLE_PROVIDER_BACKED_JOBS="true"},
    (v:any)=>{delete v.Environment.Variables.PRIVATE_OWNER_USER_ARN},(v:any)=>{v.LastUpdateStatus="InProgress"}]){
    const v=clone(after);mutate(v);assert.throws(()=>reviewOwnerRuntime(f.runtime,v,f.identity,zip),/POST_RUNTIME/);
  }
});
