import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync,lstatSync,mkdtempSync,realpathSync,rmSync,writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename,isAbsolute,join,relative,resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { AwsIamApiClient } from "../services/operations/api-smoke/src/signed-api-client.js";
import { parseControllerRuntimeConfig } from "../services/controller/src/runtime-config.js";
import { collectPhase11Readiness,createPhase11ReadOnlyCliRunner,phase11ReadOnlyChildEnvironment } from "./phase11-live-readiness.js";
import { collectPhase11ReferenceReadiness } from "./phase11-reference-readiness.js";
import { scanLiveImageCache } from "./scan-live-image-cache.js";
import { verifyControllerRelease } from "./verify-controller-release.js";
import { canonicalPatchValue } from "./compute-patch-rollout.js";
import { PATCH,PRIVATE_ACL,privateAclChildEnvironment } from "./promote-worker-patch.js";
import { runCircuitDenialWorkflow,type DenialInvariant } from "./circuit-denial-workflow.js";

const PREFIX="global-market-ai-insight-dev",FUNCTION=`${PREFIX}-controller`,TABLE=`${PREFIX}-jobs`;
type Json=Record<string,any>;
function fail(code:string):never{throw new Error(`CIRCUIT_DENIAL_${code}`);}
const ENV_KEYS=["JOBS_TABLE_NAME","WORKER_CLUSTER","WORKER_TASK_DEFINITION","WORKER_SUBNET_IDS","WORKER_SECURITY_GROUP_ID",
  "JOB_TIMEOUT_SECONDS","JOB_TTL_SECONDS","MAX_JOBS_PER_MINUTE","MAX_ACTIVE_JOBS","CIRCUIT_STATE","API_AUTH_MODE","ENABLE_PROVIDER_BACKED_JOBS","ENABLE_LIVE_RESULT_DISPLAY","PRIVATE_OWNER_USER_ARN"].sort();

export function safeDenialTemporaryDirectory(base:string,directory:string,physical:string){
  try{const name=basename(directory);return /^gmai-circuit-denial-[A-Za-z0-9]+$/.test(name)&&relative(resolve(base),resolve(directory))===name&&
    lstatSync(directory).isDirectory()&&!lstatSync(directory).isSymbolicLink()&&realpathSync(base)===physical&&realpathSync(directory)===resolve(physical,name);}catch{return false;}
}
export function denialControllerStableValue(controller:Json) {
  if(controller?.FunctionName!==FUNCTION || !/^[a-f0-9-]{36}$/.test(controller.RevisionId??"") ||
    !controller.Environment?.Variables || Object.keys(controller.Environment.Variables).sort().join(",")!==ENV_KEYS.join(","))fail("CONTROLLER_SCOPE_INVALID");
  const config=parseControllerRuntimeConfig({...controller.Environment.Variables,AWS_REGION:"ap-northeast-1"});
  const account=config.taskDefinition.split(":")[4];
  if(config.privateOwnerUserArn!==`arn:aws:iam::${account}:user/aws-admin-user`)fail("OWNER_SCOPE_INVALID");
  if(controller.FunctionArn!==`arn:aws:lambda:ap-northeast-1:${account}:function:${FUNCTION}` ||
    !new RegExp(`^arn:aws:iam::${account}:role/[A-Za-z0-9+=,.@_-]{1,64}$`).test(String(controller.Role)) ||
    controller.Runtime!=="nodejs22.x" || controller.Handler!=="main.handler" ||
    canonicalPatchValue(controller.Architectures)!=='["x86_64"]' || controller.MemorySize!==128 || controller.Timeout!==15 ||
    !/^[A-Za-z0-9+/]{43}=$/.test(String(controller.CodeSha256)))fail("CONTROLLER_SCOPE_INVALID");
  if(controller.Environment.Variables.JOBS_TABLE_NAME!==TABLE || controller.Environment.Variables.CIRCUIT_STATE!=="CLOSED")fail("CONTROLLER_SCOPE_INVALID");
  return canonicalPatchValue({FunctionArn:controller.FunctionArn,CodeSha256:controller.CodeSha256,Role:controller.Role,Runtime:controller.Runtime,
    Architectures:controller.Architectures,MemorySize:controller.MemorySize,Timeout:controller.Timeout,
    Environment:{Variables:{...controller.Environment.Variables,ENABLE_PROVIDER_BACKED_JOBS:undefined}}});
}
export function denialLivePlan(args:readonly string[]=[]){if(args.length)fail("ARGUMENTS_REJECTED");return{
  mode:"dry-run",awsCalls:0,apiCalls:0,cloudMutations:0,jobPostsMax:1,postRetries:0,enableAttemptsMax:1,restoreAttemptsMax:1,
  persistedCircuitCloseWrites:0,publicActions:0,imagePushes:0,requiredFreshLiveArchive:true,requiredDeployedControllerSourceProof:true,
  admissionWindowSeconds:180,cleanupReserveSeconds:300,readyForExecution:false,readyForPublication:false};}

export async function executeOneCircuitDenial(){
  const aws=process.env.GMAI_AWS_CLI_PATH;
  if(process.env.AWS_PROFILE!=="gmai-admin"||process.platform!=="win32"||!aws||!isAbsolute(aws)||basename(aws).toLowerCase()!=="aws.exe"||
    !lstatSync(aws).isFile()||lstatSync(aws).isSymbolicLink())fail("CONFIGURATION_INVALID");
  const started=Date.now(),base=resolve(tmpdir()),physical=realpathSync(base),directory=mkdtempSync(join(base,"gmai-circuit-denial-"));
  const env=phase11ReadOnlyChildEnvironment(process.env);
  let calls=0,enableAttempts=0,restoreAttempts=0,proved=false,initialController:Json|undefined,initialAccount:string|undefined;
  let initialFingerprint:string|undefined,endpoint:string|undefined,referenceFingerprint:unknown,packet:Json|undefined;
  const consume=(cleanup=false)=>{if(++calls>(cleanup?190:150)||!cleanup&&Date.now()-started>=1_200_000)fail("DEADLINE_OR_CALL_LIMIT");};
  const query=(service:string,operation:string,extra:string[],cleanup=false):Json=>{
    consume(cleanup);const result=spawnSync(aws,[service,operation,...extra,"--profile","gmai-admin","--region","ap-northeast-1","--no-cli-pager","--no-paginate","--output","json"],
      {env,encoding:"utf8",windowsHide:true,timeout:20_000,maxBuffer:2_000_000});
    if(result.status!==0||result.signal!==null)fail("AWS_OPERATION_UNVERIFIED");
    return result.stdout.trim()?JSON.parse(result.stdout):{};
  };
  const baseline=()=>{
    const reader=createPhase11ReadOnlyCliRunner();let controller:Json|undefined,identity:Json|undefined,task:Json|undefined;
    const report=collectPhase11Readiness(args=>{consume(true);const value=reader(args) as Json;
      if(args[0]==="lambda")controller=value;if(args[0]==="sts")identity=value;if(args[1]==="describe-task-definition")task=value;return value;}) as Json;
    if(!controller||!identity||!task)fail("BASELINE_INCOMPLETE");
    const fingerprint=createHash("sha256").update(canonicalPatchValue({account:identity.Account,controller:denialControllerStableValue(controller),
      task:task.taskDefinition,referenceFingerprint})).digest("hex");
    const c=report.compute,expectedImage=`${identity.Account}.dkr.ecr.ap-northeast-1.amazonaws.com/${PREFIX}-worker@${PATCH.runtimeDigest}`;
    const invariant:DenialInvariant={ownedResourcesVerified:report.expectedPrincipal===true&&report.accountShapeValid===true&&
      [report.stacks.foundation,report.stacks.compute,report.stacks.api].every(s=>/^(?:CREATE|UPDATE)_COMPLETE$/.test(s))&&
      report.stacks.operations==="ABSENT"&&report.stacks.alarmCircuit==="ABSENT"&&c.taskDefinitionScopeValid&&c.taskDefinitionMatchesController&&c.imagePinnedByDigest&&c.hardenedWorker,
      budgetWithinLimit:report.budget.spendWithinLimit===true,sourceAndImageVerified:proved&&task.taskDefinition.containerDefinitions[0].image===expectedImage,
      jobsEnabled:c.internalJobsEnabled,displayEnabled:c.liveResultDisplayEnabled,circuitOpen:report.circuit.verifiedOpen,circuitVersion:report.circuit.version,
      runningTasks:c.runningTasks,pendingTasks:c.pendingTasks,services:c.services,occupiedSlots:report.occupiedSlots,stableFingerprint:fingerprint};
    return{report,controller,account:identity.Account as string,invariant,fingerprint};
  };
  const freshController=(cleanup=false)=>query("lambda","get-function-configuration",["--function-name",FUNCTION],cleanup);
  const awaitAdmission=async(enabled:boolean,cleanup=false)=>{
    for(let poll=0;poll<12;poll++){
      const current=freshController(cleanup);
      if(denialControllerStableValue(current)!==denialControllerStableValue(initialController!))fail("CONTROLLER_CHANGED");
      if(current.State==="Active"&&current.LastUpdateStatus==="Successful"&&current.Environment.Variables.ENABLE_PROVIDER_BACKED_JOBS===String(enabled))return;
      if(current.LastUpdateStatus==="Failed"||! ["Active","Pending"].includes(current.State))fail("ADMISSION_UPDATE_UNVERIFIED");
      await new Promise(done=>setTimeout(done,2000));
    }fail("ADMISSION_UPDATE_UNVERIFIED");
  };
  const mutateAdmission=async(enabled:boolean)=>{
    if(enabled?enableAttempts++!==0:restoreAttempts++!==0)fail("ADMISSION_RETRY_REJECTED");
    const current=freshController(!enabled);
    if(denialControllerStableValue(current)!==denialControllerStableValue(initialController!))fail("CONTROLLER_CHANGED");
    if(!enabled&&current.Environment.Variables.ENABLE_PROVIDER_BACKED_JOBS==="false")return;
    if(current.State!=="Active"||current.LastUpdateStatus!=="Successful"||current.Environment.Variables.ENABLE_PROVIDER_BACKED_JOBS!==String(!enabled))fail("ADMISSION_NOT_READY");
    const file=join(directory,enabled?"enabled-environment.json":"disabled-environment.json");
    writeFileSync(file,JSON.stringify({Variables:{...current.Environment.Variables,ENABLE_PROVIDER_BACKED_JOBS:String(enabled)}}),{flag:"wx"});
    query("lambda","update-function-configuration",["--function-name",FUNCTION,"--revision-id",current.RevisionId,"--environment",`file://${file}`],!enabled);
    await awaitAdmission(enabled,!enabled);
  };
  const job=(id:string)=>{if(!/^job_[a-f0-9]{48}$/.test(id))fail("JOB_SCOPE_INVALID");return query("dynamodb","get-item",
    ["--table-name",TABLE,"--key",JSON.stringify({jobId:{S:id}}),"--consistent-read"],true);};
  try{
    if(!safeDenialTemporaryDirectory(base,directory,physical))fail("TEMP_INVALID");
    const acl=spawnSync("powershell.exe",["-NoProfile","-NonInteractive","-Command",PRIVATE_ACL],
      {env:privateAclChildEnvironment(env,directory),encoding:"utf8",windowsHide:true,timeout:10000,maxBuffer:20000});
    if(acl.status!==0||JSON.parse(acl.stdout).privateAclVerified!==true)fail("PRIVATE_ACL_UNVERIFIED");
    const initial=baseline();if(initial.report.readyForAccountSpecificDiff!==true)fail("BASELINE_BLOCKED");
    initialController=initial.controller;initialAccount=initial.account;
    const reader=createPhase11ReadOnlyCliRunner();const references=collectPhase11ReferenceReadiness(args=>{consume();const value=reader(args) as Json;
      if(args[0]==="apigatewayv2"&&args[1]==="get-api")endpoint=value.ApiEndpoint;return value;});
    if(references.referencesVerified!==true||!endpoint)fail("REFERENCE_BLOCKED");referenceFingerprint=references.referenceFingerprint;
    const archive=scanLiveImageCache();calls+=Number(archive.awsCalls);
    if(archive.archiveGatePassed!==true||archive.ownedScannerAbsent!==true||archive.temporaryArchiveAndCacheRemoved!==true)fail("IMAGE_PROOF_BLOCKED");
    const controllerProof=verifyControllerRelease();calls+=Number(controllerProof.awsReads);
    if(controllerProof.deployedMainAndNoticesMatched!==true||controllerProof.privateArchiveRemoved!==true)fail("SOURCE_PROOF_BLOCKED");
    proved=true;const before=baseline();if(before.account!==initialAccount||denialControllerStableValue(before.controller)!==denialControllerStableValue(initialController))fail("BASELINE_CHANGED");
    initialFingerprint=before.fingerprint;if(Date.now()-started>=900_000||calls>100)fail("CLEANUP_RESERVE_UNAVAILABLE");
    const outcome=await runCircuitDenialWorkflow({
      readInvariant:async()=>{const state=baseline();if(state.account!==initialAccount||state.fingerprint!==initialFingerprint)fail("BASELINE_CHANGED");return state.invariant;},
      enableAdmission:()=>mutateAdmission(true),restoreDisabledAdmission:async()=>{
        // An ambiguous enable may still be completing. Read first; never re-enable or retry an enable write.
        for(let poll=0;poll<12;poll++){const current=freshController(true);if(current.LastUpdateStatus!=="InProgress")break;await new Promise(done=>setTimeout(done,2000));}
        await mutateAdmission(false);
      },exactJobAbsent:async(id)=>!Object.hasOwn(job(id),"Item"),
      assertSameOpenCircuit:async(version)=>{
        const value=query("dynamodb","get-item",["--table-name",TABLE,"--key",JSON.stringify({jobId:{S:"control_circuit"}}),"--consistent-read"]);
        if(value.Item?.state?.S!=="OPEN"||value.Item?.version?.N!==String(version))fail("PERSISTED_CIRCUIT_CHANGED");
      },request:new AwsIamApiClient(endpoint),emergencyOwnedCleanup:async(id)=>{
        if(!id)return;const record=job(id);if(!Object.hasOwn(record,"Item"))return;
        // A record is unexpected: never delete it or stop an unrelated task by inference.
        // Disable first and fail closed for the root operator's exact scoped recovery.
        fail("UNEXPECTED_JOB_REQUIRES_SCOPED_RECOVERY");
      },
    });
    const finalReader=createPhase11ReadOnlyCliRunner();const finalReferences=collectPhase11ReferenceReadiness(args=>{consume(true);return finalReader(args);});
    if(finalReferences.referencesVerified!==true||finalReferences.referenceFingerprint!==referenceFingerprint)fail("CLOSING_REFERENCE_CHANGED");
    packet={...outcome,enableAttempts,restoreAttempts,cloudConfigurationWrites:enableAttempts+restoreAttempts,
      persistedCircuitWrites:0,iamPermissionChanges:0,codeChanges:0,apiConfigurationChanges:0,imagePushes:0,
      temporaryConfigurationRestored:true,privateEnvironmentFilesRemoved:true,workerTasksExpected:0};
  }finally{
    if(!safeDenialTemporaryDirectory(base,directory,physical))fail("TEMP_INVALID");
    rmSync(directory,{recursive:true});if(existsSync(directory))fail("TEMP_CLEANUP_UNVERIFIED");
  }
  if(!packet)fail("INCOMPLETE");return{...packet,explicitAwsCalls:calls};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){try{const args=process.argv.slice(2);
  if(!args.length)console.log(JSON.stringify(denialLivePlan()));else{if(args.length!==1||args[0]!=="--execute-one-circuit-denial")fail("ARGUMENTS_REJECTED");
    console.log(JSON.stringify(await executeOneCircuitDenial()));}}
  catch(error){const code=error instanceof Error&&/^(?:CIRCUIT_DENIAL_|CONTROLLER_PROOF_|CACHE_)[A-Z_]{1,100}$/.test(error.message)?error.message:"CIRCUIT_DENIAL_LIVE_INCOMPLETE";
    console.error(JSON.stringify({error:code,privateDetailsSuppressed:true,
    safeStopMustBeIndependentlyVerified:true,automaticPostRetry:false}));process.exitCode=1;}}
