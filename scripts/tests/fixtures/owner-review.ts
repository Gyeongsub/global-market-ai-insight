import { OWNER_FUNCTION, OWNER_RESOURCE, OWNER_STACK, proposeOwnerTemplate } from "../../private-owner-review.js";
const account="123456789012",region="ap-northeast-1",zip="b".repeat(64),started=Date.parse("2026-10-25T06:00:00Z"),name=`gmai-owner-${"a".repeat(32)}`;
const clone=<T>(v:T):T=>JSON.parse(JSON.stringify(v));
export function ownerFixture() {
  const identity={Account:account,Arn:`arn:aws:iam::${account}:user/aws-admin-user`,UserId:`AIDA${"A".repeat(17)}`};
  const live:any={Resources:Object.fromEntries(Array.from({length:25},(_,i)=>[`Other${i}`,{Type:"AWS::IAM::Role",Properties:{Marker:i}}])),Outputs:{Keep:{Value:"PRIVATE_SENTINEL"}}};
  const p={FunctionName:OWNER_FUNCTION,Runtime:"nodejs22.x",Handler:"main.handler",Architectures:["x86_64"],Role:`arn:aws:iam::${account}:role/controller`,
    Code:{S3Bucket:`cdk-hnb659fds-assets-${account}-${region}`,S3Key:`${"a".repeat(64)}.zip`},
    Environment:{Variables:{ENABLE_PROVIDER_BACKED_JOBS:"false",ENABLE_LIVE_RESULT_DISPLAY:"false",API_AUTH_MODE:"AWS_IAM",CIRCUIT_STATE:"CLOSED"}}};
  live.Resources[OWNER_RESOURCE]={Type:"AWS::Lambda::Function",Properties:p};
  const runtime:any={...clone(p),FunctionArn:`arn:aws:lambda:${region}:${account}:function:${OWNER_FUNCTION}`,State:"Active",LastUpdateStatus:"Successful",CodeSha256:Buffer.from("a".repeat(64),"hex").toString("base64"),RevisionId:"before"};delete runtime.Code;
  const proposed=proposeOwnerTemplate(live,identity,zip);
  const stack:any={StackName:OWNER_STACK,StackId:`arn:aws:cloudformation:${region}:${account}:stack/${OWNER_STACK}/test`,StackStatus:"UPDATE_COMPLETE",
    RoleARN:`arn:aws:iam::${account}:role/cdk-hnb659fds-cfn-exec-role-${account}-${region}`,Parameters:[{ParameterKey:"BootstrapVersion",ParameterValue:"/cdk-bootstrap/hnb659fds/version",ResolvedValue:"30"}],Tags:[],NotificationARNs:[]};
  const draft:any={StackId:stack.StackId,StackName:OWNER_STACK,ChangeSetName:name,ChangeSetId:`arn:aws:cloudformation:${region}:${account}:changeSet/${name}/test`,
    CreationTime:new Date(started+1000).toISOString(),Status:"CREATE_COMPLETE",ExecutionStatus:"AVAILABLE",IncludeNestedStacks:false,Parameters:clone(stack.Parameters),Tags:[],NotificationARNs:[],
    Changes:[{Type:"Resource",ResourceChange:{LogicalResourceId:OWNER_RESOURCE,ResourceType:"AWS::Lambda::Function",Action:"Modify",Replacement:"False",Scope:["Properties"],
      Details:["Code","Environment"].map(Name=>({Evaluation:"Static",ChangeSource:"DirectModification",Target:{Attribute:"Properties",Name,RequiresRecreation:"Never",Path:`/Properties/${Name}`}})),
      BeforeContext:JSON.stringify(live.Resources[OWNER_RESOURCE]),AfterContext:JSON.stringify(proposed.Resources[OWNER_RESOURCE])}}]};
  return{identity,live,runtime,proposed,stack,draft};
}
