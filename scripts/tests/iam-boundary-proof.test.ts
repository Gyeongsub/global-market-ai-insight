import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { boundaryMatrix, boundaryProofPlan, deriveBoundaryTargets, recordBoundarySimulation, reviewBoundarySimulation,
  summarizeBoundaryResults, type BoundaryTargets } from "../iam-boundary-proof.js";
import { PATCH } from "../promote-worker-patch.js";
const ACCOUNT="123456789012", PREFIX="global-market-ai-insight-dev", REGION="ap-northeast-1";
function fixture() {
  const identity={Account:ACCOUNT,Arn:`arn:aws:iam::${ACCOUNT}:user/aws-admin-user`};
  const roles: Record<string,any>={}, resources:Record<string,any>={}, summaries:any[]=[];
  for(const [prefix,service] of [["ControllerRole","lambda.amazonaws.com"],["WorkerTaskRole","ecs-tasks.amazonaws.com"],["WorkerExecutionRole","ecs-tasks.amazonaws.com"]]) {
    const logical=`${prefix}AABBCCDD`,name=`${PREFIX}-${prefix}-abcdef`,policy=`${prefix}DefaultPolicyAABBCCDD`;
    const trust={Version:"2012-10-17",Statement:[{Action:"sts:AssumeRole",Effect:"Allow",Principal:{Service:service}}]};
    roles[prefix]={logical,name,arn:`arn:aws:iam::${ACCOUNT}:role/${name}`};
    resources[logical]={Type:"AWS::IAM::Role",Properties:{AssumeRolePolicyDocument:trust}};
    resources[policy]={Type:"AWS::IAM::Policy",Properties:{PolicyName:policy,Roles:[{Ref:logical}],PolicyDocument:{Version:"2012-10-17",Statement:[]}}};
    summaries.push({LogicalResourceId:logical,PhysicalResourceId:name,ResourceType:"AWS::IAM::Role",ResourceStatus:"CREATE_COMPLETE"},
      {LogicalResourceId:policy,PhysicalResourceId:policy,ResourceType:"AWS::IAM::Policy",ResourceStatus:"CREATE_COMPLETE"});
  }
  const taskArn=`arn:aws:ecs:${REGION}:${ACCOUNT}:task-definition/${PREFIX}-worker:10`;
  const controller={FunctionName:`${PREFIX}-controller`,FunctionArn:`arn:aws:lambda:${REGION}:${ACCOUNT}:function:${PREFIX}-controller`,State:"Active",LastUpdateStatus:"Successful",Role:roles.ControllerRole.arn,
    Environment:{Variables:{ENABLE_PROVIDER_BACKED_JOBS:"false",ENABLE_LIVE_RESULT_DISPLAY:"false",JOBS_TABLE_NAME:`${PREFIX}-jobs`,WORKER_TASK_DEFINITION:taskArn,
      WORKER_CLUSTER:`arn:aws:ecs:${REGION}:${ACCOUNT}:cluster/${PREFIX}-worker`}}};
  const task={taskDefinition:{taskDefinitionArn:taskArn,taskRoleArn:roles.WorkerTaskRole.arn,executionRoleArn:roles.WorkerExecutionRole.arn,
    containerDefinitions:[{image:`${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com/${PREFIX}-worker@${PATCH.runtimeDigest}`,
      secrets:[{name:"TWELVE_DATA_API_KEY",valueFrom:`arn:aws:ssm:${REGION}:${ACCOUNT}:parameter/global-market-ai-insight/dev/market-data/api-key`}],
      environment:[{name:"BEDROCK_MODEL_ID",value:"amazon.nova-lite-v1:0"}]}]}};
  resources.ControllerFunctionAABBCCDD={Type:"AWS::Lambda::Function",Properties:{FunctionName:controller.FunctionName,Role:{"Fn::GetAtt":[roles.ControllerRole.logical,"Arn"]}}};
  resources.WorkerTaskDefinitionAABBCCDD={Type:"AWS::ECS::TaskDefinition",Properties:{Family:`${PREFIX}-worker`,TaskRoleArn:{"Fn::GetAtt":[roles.WorkerTaskRole.logical,"Arn"]},ExecutionRoleArn:{"Fn::GetAtt":[roles.WorkerExecutionRole.logical,"Arn"]}}};
  summaries.push({LogicalResourceId:"ControllerFunctionAABBCCDD",PhysicalResourceId:controller.FunctionName,ResourceType:"AWS::Lambda::Function",ResourceStatus:"UPDATE_COMPLETE"},
    {LogicalResourceId:"WorkerTaskDefinitionAABBCCDD",PhysicalResourceId:taskArn,ResourceType:"AWS::ECS::TaskDefinition",ResourceStatus:"UPDATE_COMPLETE"});
  return {identity,controller,task,summaries:{StackResourceSummaries:summaries},template:{TemplateBody:{Resources:resources}}};
}
function targets(): BoundaryTargets {const f=fixture();return deriveBoundaryTargets(f.identity,f.controller,f.task,f.summaries,f.template);}
function response(entry: ReturnType<typeof boundaryMatrix>[number]) {return {IsTruncated:false,EvaluationResults:[{EvalActionName:entry.action,EvalDecision:entry.expected,
  MissingContextValues:[],ResourceSpecificResults:[{EvalResourceName:entry.resource,EvalResourceDecision:entry.expected,MissingContextValues:[]}]}]};}

test("roles, policies, task and Lambda are bound to exact live and original stack references",()=>{
  const t=targets();assert.equal(t.roles.controller.name,`${PREFIX}-ControllerRole-abcdef`);assert.equal(t.task.endsWith(":10"),true);
  const f=fixture();f.template.TemplateBody=JSON.stringify(f.template.TemplateBody) as any;
  assert.deepEqual(deriveBoundaryTargets(f.identity,f.controller,f.task,f.summaries,f.template),t);
});
test("identity, ownership, role references, secret metadata and active flags fail closed",()=>{
  const changes=[(f:any)=>f.identity.Account="000000000000",(f:any)=>f.identity.Account=123456789012,(f:any)=>f.identity.Arn=f.identity.Arn.replace("aws-admin-user","other"),
    (f:any)=>f.controller.Role=f.controller.Role.replace(ACCOUNT,"999999999999"),(f:any)=>f.controller.Environment.Variables.ENABLE_PROVIDER_BACKED_JOBS="true",
    (f:any)=>f.controller.Environment.Variables.ENABLE_LIVE_RESULT_DISPLAY="true",(f:any)=>f.controller.Environment.Variables.WORKER_CLUSTER="PRIVATE_SENTINEL",
    (f:any)=>f.task.taskDefinition.taskRoleArn=f.task.taskDefinition.executionRoleArn,(f:any)=>f.task.taskDefinition.containerDefinitions[0].image="PRIVATE_SENTINEL",
    (f:any)=>f.task.taskDefinition.containerDefinitions[0].secrets[0].valueFrom="PRIVATE_SENTINEL",(f:any)=>f.summaries.NextToken="PRIVATE_SENTINEL",
    (f:any)=>f.summaries.StackResourceSummaries.push(f.summaries.StackResourceSummaries[0]),(f:any)=>f.summaries.StackResourceSummaries[0].ResourceStatus="UPDATE_IN_PROGRESS",
    (f:any)=>f.template.TemplateBody.Resources.ControllerFunctionAABBCCDD.Properties.Role={"Fn::GetAtt":["WorkerTaskRoleAABBCCDD","Arn"]},
    (f:any)=>f.template.TemplateBody.Resources.ControllerRoleAABBCCDD.Properties.AssumeRolePolicyDocument.Statement[0].Principal={AWS:"*"},
    (f:any)=>f.template.TemplateBody.Resources.ControllerRoleDefaultPolicyAABBCCDD.Properties.Roles.push({Ref:"WorkerTaskRoleAABBCCDD"})];
  for(const change of changes){const f=fixture();change(f);assert.throws(()=>deriveBoundaryTargets(f.identity,f.controller,f.task,f.summaries,f.template));}
});
test("opaque CloudFormation policy IDs are not mistaken for the verified inline PolicyName",()=>{
  const f=fixture();for(const resource of f.summaries.StackResourceSummaries){if(resource.ResourceType==="AWS::IAM::Policy")resource.PhysicalResourceId="opaque-CFN-policy-resource-123";}
  assert.deepEqual(deriveBoundaryTargets(f.identity,f.controller,f.task,f.summaries,f.template),targets());
  f.summaries.StackResourceSummaries.find(x=>x.ResourceType==="AWS::IAM::Policy")!.LogicalResourceId="UnrelatedPolicy";
  assert.throws(()=>deriveBoundaryTargets(f.identity,f.controller,f.task,f.summaries,f.template));
});
test("the fixed matrix contains six required allows and eleven denies without real service calls",()=>{
  const matrix=boundaryMatrix(targets());assert.equal(matrix.length,17);assert.equal(new Set(matrix.map(x=>x.name)).size,17);
  assert.equal(matrix.filter(x=>x.expected==="allowed").length,6);assert.equal(matrix.filter(x=>x.expected==="implicitDeny").length,11);
  assert.equal(matrix.find(x=>x.name==="controller-unapproved-revision")?.resource.endsWith(":11"),true);
  const reset=matrix.find(x=>x.name==="worker-cannot-reset-circuit")!;assert.deepEqual(reset.context.find(x=>x.ContextKeyName==="dynamodb:LeadingKeys"),{ContextKeyName:"dynamodb:LeadingKeys",ContextKeyValues:["control_circuit"],ContextKeyType:"stringList"});
  for(const entry of matrix)assert.equal(new Set(entry.context.map(x=>x.ContextKeyName)).size,4);
  assert.deepEqual(matrix.find(x=>x.name==="controller-wrong-service")?.context.find(x=>x.ContextKeyName==="iam:PassedToService")?.ContextKeyValues,["lambda.amazonaws.com"]);
});
test("each exact per-resource decision passes while private identifiers never reach the report",()=>{
  for(const entry of boundaryMatrix(targets())) {const packet=reviewBoundarySimulation(response(entry),entry);assert.equal(packet.verified,true);
    for(const hidden of [ACCOUNT,"arn:aws",entry.resource])assert.equal(JSON.stringify(packet).includes(hidden),false);}
});
test("aggregate allow, another resource, missing condition values, mixed results and pagination do not prove a boundary",()=>{
  const entry=boundaryMatrix(targets())[0];
  const changes=[(v:any)=>v.IsTruncated=true,(v:any)=>delete v.IsTruncated,(v:any)=>v.Marker="PRIVATE_SENTINEL",
    (v:any)=>v.EvaluationResults=[],(v:any)=>v.EvaluationResults.push(v.EvaluationResults[0]),(v:any)=>v.EvaluationResults[0].EvalActionName="ecs:StopTask",
    (v:any)=>v.EvaluationResults[0].EvalDecision="implicitDeny",(v:any)=>v.EvaluationResults[0].MissingContextValues=["PRIVATE_SENTINEL"],
    (v:any)=>v.EvaluationResults[0].MissingContextValues=null,(v:any)=>v.EvaluationResults[0].ResourceSpecificResults=[],
    (v:any)=>v.EvaluationResults[0].ResourceSpecificResults[0].EvalResourceName="PRIVATE_SENTINEL",
    (v:any)=>v.EvaluationResults[0].ResourceSpecificResults[0].EvalResourceDecision="implicitDeny",
    (v:any)=>v.EvaluationResults[0].ResourceSpecificResults[0].MissingContextValues=["PRIVATE_SENTINEL"],
    (v:any)=>v.EvaluationResults[0].ResourceSpecificResults.push(v.EvaluationResults[0].ResourceSpecificResults[0])];
  for(const change of changes){const value=response(entry);change(value);assert.throws(()=>reviewBoundarySimulation(value,entry));}
});
test("documented optional empty-context omission passes only with exact aggregate and individual decisions",()=>{
  const entry=boundaryMatrix(targets())[0],value=response(entry) as any;
  delete value.EvaluationResults[0].MissingContextValues;delete value.EvaluationResults[0].ResourceSpecificResults[0].MissingContextValues;
  assert.equal(reviewBoundarySimulation(value,entry).verified,true);
  value.EvaluationResults[0].ResourceSpecificResults[0].MissingContextValues=null;
  assert.throws(()=>reviewBoundarySimulation(value,entry));
});
test("a denied-case allow is rejected, not explained away by a matched statement",()=>{
  const entry=boundaryMatrix(targets())[1],value=response(entry);value.EvaluationResults[0].EvalDecision="allowed" as any;
  value.EvaluationResults[0].ResourceSpecificResults[0].EvalResourceDecision="allowed" as any;
  assert.throws(()=>reviewBoundarySimulation(value,entry));
});

test("the fixed whole matrix retains an allow mismatch and all later deny evidence without authorizing deployment",()=>{
  const cases=boundaryMatrix(targets());let calls=0;
  const results=cases.map(item=>{calls++;const value=response(item);
    if(item.name==="controller-circuit-condition-check"){
      value.EvaluationResults[0].EvalDecision="implicitDeny" as any;
      value.EvaluationResults[0].ResourceSpecificResults[0].EvalResourceDecision="implicitDeny" as any;
    }
    return recordBoundarySimulation(value,item);
  });
  const report=summarizeBoundaryResults(results);assert.equal(calls,17);assert.equal(report.allExpectedDecisionsVerified,false);
  assert.equal(report.verifiedAllowCases,5);assert.equal(report.verifiedDenyCases,11);
  assert.deepEqual(report.unverifiedCases,["controller-circuit-condition-check"]);assert.equal(report.readyForDeployment,false);
  assert.equal(JSON.stringify(report).includes(ACCOUNT),false);
  const all=summarizeBoundaryResults(cases.map(item=>recordBoundarySimulation(response(item),item)));
  assert.equal(all.allExpectedDecisionsVerified,true);assert.equal(all.readyForDeployment,false);
});
test("partial or malformed decisions stay failed in a complete report; incomplete/duplicate matrices cannot pass",()=>{
  const cases=boundaryMatrix(targets());
  const rows=cases.map(item=>recordBoundarySimulation(response(item),item));
  for(const input of [null,{},[],{IsTruncated:false,EvaluationResults:[{EvalActionName:42}]}])
    assert.equal(recordBoundarySimulation(input,cases[0]).verified,false);
  assert.throws(()=>summarizeBoundaryResults(rows.slice(0,16)));
  assert.throws(()=>summarizeBoundaryResults([...rows.slice(0,16),rows[0]]));
  rows[0]=recordBoundarySimulation({IsTruncated:true},cases[0]);
  assert.equal(summarizeBoundaryResults(rows).allExpectedDecisionsVerified,false);
});
test("default/import plans and invalid CLI input cannot query AWS or disclose arbitrary data",()=>{
  assert.equal(boundaryProofPlan().awsCalls,0);assert.equal(boundaryProofPlan().actualWorkloadCalls,0);assert.throws(()=>boundaryProofPlan(["PRIVATE_SENTINEL"]));
  for(const args of [[],["PRIVATE_SENTINEL"],["--execute-read-only","PRIVATE_SENTINEL"]]){
    const r=spawnSync(process.execPath,["--import","tsx","scripts/iam-boundary-proof.ts",...args],{encoding:"utf8",timeout:5000});
    assert.equal(r.status,args.length?1:0);assert.equal(`${r.stdout}${r.stderr}`.includes("PRIVATE_SENTINEL"),false);
  }
  const r=spawnSync(process.execPath,["--import","tsx","--input-type=module","-e",'await import("./scripts/iam-boundary-proof.ts");'],{encoding:"utf8",timeout:5000});
  assert.equal(r.status,0);assert.equal(r.stdout,"");assert.equal(r.stderr,"");
});
