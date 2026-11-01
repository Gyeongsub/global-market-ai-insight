import {spawnSync} from "node:child_process";
import {basename,isAbsolute,resolve} from "node:path";
import {lstatSync} from "node:fs";
import {pathToFileURL} from "node:url";
import catalog from "../shared/asset_catalog/assets.json" with {type:"json"};
import {AwsIamApiClient} from "../services/operations/api-smoke/src/signed-api-client.js";
import {createPhase11ReadOnlyCliRunner,phase11ReadOnlyChildEnvironment} from "./phase11-live-readiness.js";
import {createOwnerReadSnapshot} from "./private-owner-draft.js";
import {OWNER_RESOURCE,OWNER_STACK,OWNER_REGION,ownerDigest,reviewOwnerDraft} from "./private-owner-review.js";

type Json=Record<string,any>;
const clone=<T>(v:T):T=>JSON.parse(JSON.stringify(v));
function fail(code:string):never{throw Error(`PRIVATE_OWNER_ACCEPTANCE_${code}`);}
export function ownerAcceptancePlan(){return{mode:"dry-run",awsCalls:0,httpCalls:0,postCalls:0,cloudMutations:0,
  readCallsMax:50,httpCallsMax:3,deadlineMs:420000,workloadCalls:0,publicationPerformed:false};}

/** Reconcile an already executed change set, never execute or roll it back.
 * Historical resolved contexts prove its two-property scope. They cannot restore
 * the lost full pre-deployment DescribeStacks snapshot; report that limitation. */
export function reviewExecutedOwnerUpdate(snapshot:ReturnType<typeof createOwnerReadSnapshot>,draft:Json,zip:string,now:number){
  if(!/^[a-f0-9]{64}$/.test(zip)||snapshot.stack.StackStatus!=="UPDATE_COMPLETE"||
    snapshot.stack.ChangeSetId!==draft.ChangeSetId||draft.ExecutionStatus!=="EXECUTE_COMPLETE"||
    snapshot.refs.privateOwnerConfigurationMatchesCaller!==true||
    snapshot.runtime.CodeSha256!==Buffer.from(zip,"hex").toString("base64"))fail("DEPLOYMENT_UNVERIFIED");
  const created=Date.parse(draft.CreationTime),updated=Date.parse(snapshot.stack.LastUpdatedTime);
  if(!Number.isSafeInteger(now)||!Number.isFinite(created)||created>now||now-created>86400000||
    !Number.isFinite(updated)||updated<created||updated>now)fail("DEPLOYMENT_TIME_INVALID");
  let previous:Json;try{previous=JSON.parse(draft.Changes?.[0]?.ResourceChange?.BeforeContext);}catch{fail("CONTEXT_INVALID");}
  const old=clone(snapshot.live),runtime=clone(snapshot.runtime);
  if(!previous?.Properties?.Code||!previous?.Properties?.Environment)fail("CONTEXT_INVALID");
  old.Resources[OWNER_RESOURCE].Properties.Code=previous.Properties.Code;
  // Contexts contain resolved values; do not replace template Ref/GetAtt values.
  // Only the literal owner variable was changed by this historical update.
  const oldOwner=previous.Properties.Environment.Variables?.PRIVATE_OWNER_USER_ARN;
  if(oldOwner===undefined)delete old.Resources[OWNER_RESOURCE].Properties.Environment.Variables.PRIVATE_OWNER_USER_ARN;
  else old.Resources[OWNER_RESOURCE].Properties.Environment.Variables.PRIVATE_OWNER_USER_ARN=oldOwner;
  runtime.Environment=previous.Properties.Environment;
  // Historical structural review uses its creation instant. Actual current
  // execution status, age, identity, code and safe posture are checked separately.
  const proof=reviewOwnerDraft({...draft,ExecutionStatus:"AVAILABLE"},snapshot.stack,snapshot.identity,draft.ChangeSetName,
    created,created,old,snapshot.live,runtime,zip);
  const after=JSON.parse(draft.Changes[0].ResourceChange.AfterContext);
  if(ownerDigest(after.Properties.Environment)!==ownerDigest(snapshot.runtime.Environment)||
    snapshot.runtime.State!=="Active"||snapshot.runtime.LastUpdateStatus!=="Successful")fail("RUNTIME_UNVERIFIED");
  return{...proof,executedChangeSetScopeVerified:true,deployedCodeDigestMatched:true,ownerConfigurationMatched:true,
    historicalFullStackBaselineRecovered:false,redeploymentPerformed:false};
}

export async function verifyOwnerGets(client:Pick<AwsIamApiClient,"request">,anonymous:()=>Promise<number>){
  const assets=await client.request("GET","v1/assets");
  if(ownerDigest(assets)!==ownerDigest(catalog))fail("CATALOG_INVALID");
  const health=await client.request("GET","v1/health");
  if(ownerDigest(health)!==ownerDigest({status:"ok",circuit:"OPEN",jobCreationEnabled:false}))fail("HEALTH_NOT_SAFE");
  if(await anonymous()!==403)fail("ANONYMOUS_NOT_DENIED");
  return{ownerCatalogVerified:true,ownerHealthVerified:true,anonymousDenied:true,httpCalls:3,postCalls:0,
    realSignedSecondPrincipalTested:false,workloadCalls:0};
}

export async function runOwnerAcceptance(zip:string,invoke=false){
  const aws=process.env.GMAI_AWS_CLI_PATH;
  if(!/^[a-f0-9]{64}$/.test(zip)||process.env.AWS_PROFILE!=="gmai-admin"||process.platform!=="win32"||!aws||
    !isAbsolute(aws)||basename(aws).toLowerCase()!=="aws.exe"||!lstatSync(aws).isFile()||lstatSync(aws).isSymbolicLink())fail("CONFIGURATION_INVALID");
  const env=phase11ReadOnlyChildEnvironment(process.env),started=Date.now();let reads=0,endpoint="";
  const consume=()=>{if(++reads>50||Date.now()-started+30000>420000)fail("BOUND_EXCEEDED");};
  const query=(service:string,operation:string,args:string[])=>{
    if(service!=="cloudformation"||!["get-template","describe-change-set"].includes(operation))fail("OPERATION_REJECTED");
    consume();const r=spawnSync(aws,[service,operation,...args,"--profile","gmai-admin","--region",OWNER_REGION,"--no-cli-pager","--no-paginate","--output","json"],
      {env,encoding:"utf8",windowsHide:true,timeout:30000,maxBuffer:2000000});
    if(r.status!==0||r.signal!==null)fail("READ_FAILED");return JSON.parse(r.stdout);
  };
  const snapshot=()=>{const core=createPhase11ReadOnlyCliRunner(),refs=createPhase11ReadOnlyCliRunner();
    return createOwnerReadSnapshot(args=>{consume();return core(args)},query,args=>{
      consume();const value=refs(args) as Json;if(args[0]==="apigatewayv2"&&args[1]==="get-api")endpoint=value.ApiEndpoint;return value;});};
  const before=snapshot(),draft=query("cloudformation","describe-change-set",["--stack-name",OWNER_STACK,"--change-set-name",before.stack.ChangeSetId,"--include-property-values"]);
  const proof=reviewExecutedOwnerUpdate(before,draft,zip,Date.now());let httpProof:Json={httpCalls:0,postCalls:0,liveOwnerAcceptanceVerified:false};
  if(invoke){
    const client=new AwsIamApiClient(endpoint);
    httpProof={...await verifyOwnerGets(client,async()=>{
      const response=await fetch(new URL("/v1/assets",endpoint),{method:"GET",redirect:"error",cache:"no-store",signal:AbortSignal.timeout(10000)});
      void response.body?.cancel().catch(()=>{});return response.status;
    }),liveOwnerAcceptanceVerified:true};
  }
  const after=snapshot();if(before.fingerprint!==after.fingerprint)fail("CURRENT_STATE_CHANGED");
  return{mode:invoke?"owner-get-only-acceptance":"owner-update-reconciliation",...proof,...httpProof,awsReads:reads,cloudMutations:0,
    jobsEnabled:false,displayEnabled:false,circuitOpen:true,circuitVersion:(after.core.circuit as Json).version,runningTasks:0,pendingTasks:0,services:0,occupiedSlots:0,
    rawIdentifiersPrinted:false,credentialsPrinted:false,publicationPerformed:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{const args=process.argv.slice(2);if(!args.length)console.log(JSON.stringify(ownerAcceptancePlan()));
    else{if(args.length!==2||!["--reconcile-read-only","--verify-three-get-requests"].includes(args[0]!))fail("ARGUMENTS_REJECTED");
      console.log(JSON.stringify(await runOwnerAcceptance(args[1]!,args[0]==="--verify-three-get-requests")));}}
  catch(e){console.error(JSON.stringify({error:e instanceof Error&&/^PRIVATE_OWNER(?:_ACCEPTANCE)?_[A-Z_]+$/.test(e.message)?e.message:"PRIVATE_OWNER_ACCEPTANCE_UNVERIFIED",
    rawDetailsSuppressed:true,mutationRetried:false,independentSafeStopRequired:true}));process.exitCode=1;}
}
