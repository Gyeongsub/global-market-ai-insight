import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { collectPhase11Readiness, createPhase11ReadOnlyCliRunner, phase11ReadOnlyChildEnvironment } from "./phase11-live-readiness.js";
import { collectPhase11ReferenceReadiness } from "./phase11-reference-readiness.js";
import { PRIVATE_ACL, privateAclChildEnvironment } from "./promote-worker-patch.js";
import { verifyReleaseSource } from "./release-source-proof.js";
import { OWNER_STACK, OWNER_FUNCTION, OWNER_REGION, ownerDigest, ownerDraftIdentity, proposeOwnerTemplate, reviewOwnerDraft, reviewOwnerIdentity, reviewOwnerStack } from "./private-owner-review.js";
import { executeOwnerUpdate } from "./private-owner-execution.js";

type Json = Record<string, any>;
function fail(code: string): never { throw new Error(`PRIVATE_OWNER_${code}`); }
export function privateOwnerDraftPlan(args: readonly string[] = []) {
  if(args.length) fail("ARGUMENTS_REJECTED");
  return {mode:"dry-run",awsCalls:0,changeSetsCreatedMax:1,changeSetsExecuted:0,assetsUploaded:0,
    runtimeChanges:0,iamChanges:0,workloadCalls:0,mainCallsMax:100,cleanupCallsReserved:12,timeoutMs:900000,publicationPerformed:false};
}
export function safeOwnerDirectory(base:string,directory:string,physical:string) {
  try {const name=basename(directory);return /^gmai-owner-review-[A-Za-z0-9]+$/.test(name)&&relative(resolve(base),resolve(directory))===name&&
    lstatSync(directory).isDirectory()&&!lstatSync(directory).isSymbolicLink()&&realpathSync(base)===physical&&realpathSync(directory)===resolve(physical,name);}catch{return false;}
}
/** Fixed three-file package; no directory traversal, credential/environment files,
 * executable hooks or extraction. Epoch timestamps make the zip reproducible. */
export const OWNER_ZIP_SCRIPT = String.raw`
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.IO.Compression
$taskFiles=ConvertFrom-Json $env:GMAI_OWNER_FILES
$taskZip=[IO.Compression.ZipArchive]::new([IO.File]::Open($env:GMAI_OWNER_ZIP,[IO.FileMode]::CreateNew),[IO.Compression.ZipArchiveMode]::Create)
try {
  foreach($taskRecord in $taskFiles){
    $taskBytes=[IO.File]::ReadAllBytes([IO.Path]::Combine($env:GMAI_OWNER_BUNDLE,$taskRecord.name))
    $taskSha=[Security.Cryptography.SHA256]::Create()
    try{$taskHash=([BitConverter]::ToString($taskSha.ComputeHash($taskBytes))).Replace('-','').ToLowerInvariant()}finally{$taskSha.Dispose()}
    if($taskBytes.Length -ne $taskRecord.bytes -or $taskHash -cne $taskRecord.sha256){throw 'OWNER_PACKAGE_SOURCE_CHANGED'}
    $taskEntry=$taskZip.CreateEntry($taskRecord.name,[IO.Compression.CompressionLevel]::Optimal)
    $taskEntry.LastWriteTime=[DateTimeOffset]::new(2000,1,1,0,0,0,[TimeSpan]::Zero)
    $taskStream=$taskEntry.Open()
    try{$taskStream.Write($taskBytes,0,$taskBytes.Length)}finally{$taskStream.Dispose()}
  }
}finally{$taskZip.Dispose()}
[pscustomobject]@{packagedFiles=$taskFiles.Count}|ConvertTo-Json -Compress
`;

export function ownerBundleFiles() {
  return ["main.mjs","THIRD_PARTY_NOTICES.md","licenses/AWS-SDK-JS-V3-APACHE-2.0.txt"].map(name=>{
    const path=resolve("services/controller/bundle",name),s=lstatSync(path);
    if(!s.isFile()||s.isSymbolicLink()||realpathSync(path)!==path||s.size<1||s.size>2_000_000)fail("PACKAGE_SOURCE_INVALID");
    return {name,bytes:s.size,sha256:createHash("sha256").update(readFileSync(path)).digest("hex")};
  });
}

export function createOwnerReadSnapshot(read:(args:readonly string[])=>unknown,query:(service:string,operation:string,args:string[])=>Json,
  referenceRead:(args:readonly string[])=>unknown) {
  let identity:Json|undefined,runtime:Json|undefined,stacks:Json|undefined;
  const core=collectPhase11Readiness(args=>{const v=read(args) as Json;if(args[0]==="sts")identity=v;if(args[0]==="lambda")runtime=v;if(args[1]==="describe-stacks")stacks=v;return v;});
  const refs=collectPhase11ReferenceReadiness(referenceRead);
  if(core.readyForAccountSpecificDiff!==true||refs.referencesVerified!==true||!identity||!runtime||!stacks)fail("BASELINE_BLOCKED");
  const {account}=reviewOwnerIdentity(identity),stack=stacks.Stacks?.find((s:Json)=>s.StackName===OWNER_STACK);
  reviewOwnerStack(stack,account);
  const result=query("cloudformation","get-template",["--stack-name",stack.StackId,"--template-stage","Original"]);
  if(!Array.isArray(result.StagesAvailable)||!result.StagesAvailable.includes("Original"))fail("TEMPLATE_RESPONSE_INVALID");
  const live=typeof result.TemplateBody==="string"?JSON.parse(result.TemplateBody):result.TemplateBody;
  const fingerprint=ownerDigest({identity,runtime,stack,live,compute:core.compute,circuit:core.circuit,slots:core.occupiedSlots,
    references:refs.referenceFingerprint,otherStacks:stacks.Stacks?.filter((s:Json)=>["global-market-ai-insight-dev-foundation","global-market-ai-insight-dev-api"].includes(s.StackName))});
  return {identity,runtime,stack,live,account,fingerprint,core,refs,
    otherStacks:stacks.Stacks?.filter((s:Json)=>["global-market-ai-insight-dev-foundation","global-market-ai-insight-dev-api"].includes(s.StackName))};
}

export function reviewOwnerGateReceipt(receipt:Json,current:Json,runId:string,now:number) {
  const completed=Date.parse(receipt?.completedAt);
  if(!/^[a-f0-9-]{36}$/.test(runId)||receipt.runId!==runId||receipt.mode!=="current-installation-local-gate"||receipt.schemaVersion!==2||
    receipt.completed!==true||receipt.passed!==true||receipt.sourceUnchanged!==true||!Number.isFinite(completed)||!Number.isSafeInteger(now)||
    now<completed||now-completed>3_600_000||receipt.awsCalls!==0||receipt.externalNetworkCalls!==0||receipt.httpServersClosed!==true||
    receipt.stepTimings?.failedSteps!==0||receipt.stepTimings?.recordsValid!==true||ownerDigest(receipt.sourceFingerprint)!==ownerDigest(current))fail("LOCAL_GATE_UNVERIFIED");
  return {currentSourceFullGateVerified:true};
}

export function ownerCreateArguments(stack:Json,path:string,name:string) {
  if(!isAbsolute(path)||/[\0\r\n]/.test(path)||!/^gmai-owner-[a-f0-9]{32}$/.test(name))fail("DRAFT_INPUT_INVALID");
  return ["--stack-name",stack.StackId,"--change-set-name",name,"--change-set-type","UPDATE","--template-body",`file://${path}`,
    "--role-arn",stack.RoleARN,"--tags",JSON.stringify(stack.Tags??[]),"--notification-arns","[]",
    "--parameters",JSON.stringify([{ParameterKey:"BootstrapVersion",UsePreviousValue:true}]),"--capabilities","CAPABILITY_IAM","CAPABILITY_NAMED_IAM",
    "--no-include-nested-stacks","--no-import-existing-resources","--client-token",name,"--description","Unexecuted owner-only controller code and configuration review"];
}

/** Default mode cannot upload/execute. The explicit execution path additionally
 * requires a fresh full source gate and independently reconciles one update. */
export async function preparePrivateOwnerDraft(execute=false): Promise<Json> {
  const aws=process.env.GMAI_AWS_CLI_PATH;
  if(process.env.AWS_PROFILE!=="gmai-admin"||process.platform!=="win32"||!aws||!isAbsolute(aws)||basename(aws).toLowerCase()!=="aws.exe"||
    !lstatSync(aws).isFile()||lstatSync(aws).isSymbolicLink())fail("CONFIGURATION_INVALID");
  const started=Date.now(),base=resolve(tmpdir()),physical=realpathSync(base),directory=mkdtempSync(join(base,"gmai-owner-review-"));
  const name=`gmai-owner-${randomUUID().replaceAll("-","")}`,path=join(directory,"candidate.json"),zip=join(directory,"controller.zip");
  const env=phase11ReadOnlyChildEnvironment(process.env);
  let calls=0,cleanupCalls=0,createAttempted=false,draftRemoved=false,localRemoved=false,packet:Json|undefined;
  let executeAttempted=false,assetUploadAttempted=false,assetVerified=false,executionHistoryVerified=false;
  let before:ReturnType<typeof createOwnerReadSnapshot>|undefined,primary="",cleanup="";
  const code=(e:unknown)=>e instanceof Error&&/^PRIVATE_OWNER_[A-Z_]+$/.test(e.message)?e.message:"PRIVATE_OWNER_REVIEW_INCOMPLETE";
  const consume=(closing=false)=>{if(closing){if(++cleanupCalls>(execute?100:12)||Date.now()-started>1_800_000)fail("CLEANUP_BOUND");}else if(++calls>(execute?130:100)||Date.now()-started+30000>900000)fail("MAIN_BOUND");};
  const query=(service:string,operation:string,args:string[],closing=false):Json=>{
    const key=`${service}.${operation}`,allowed=["cloudformation.get-template","cloudformation.create-change-set","cloudformation.describe-change-set","cloudformation.delete-change-set",
      ...(execute?["cloudformation.execute-change-set","cloudformation.describe-stacks","s3api.put-object","s3api.head-object","s3api.get-public-access-block"]:[])];
    if(!allowed.includes(key)||closing&&!["get-template","describe-stacks","describe-change-set","delete-change-set"].includes(operation))fail("OPERATION_REJECTED");
    if(operation==="execute-change-set")executeAttempted=true;
    if(operation==="put-object")assetUploadAttempted=true;
    consume(closing);const r=spawnSync(aws,[service,operation,...args,"--profile","gmai-admin","--region",OWNER_REGION,"--no-cli-pager","--no-paginate","--output","json"],
      {env,encoding:"utf8",windowsHide:true,timeout:30000,maxBuffer:2_000_000});
    if(r.status!==0||r.signal!==null||r.error){
      if(closing&&operation==="describe-change-set"&&/\(ChangeSetNotFound\)/.test(r.stderr))return{absent:true};
      if(operation==="head-object"&&/\(404\)/.test(r.stderr))return{absent:true};fail("AWS_OPERATION_FAILED");}
    return r.stdout.trim()?JSON.parse(r.stdout):{};
  };
  const snapshot=(closing=false,rollback?:Json)=>{
    const reader=createPhase11ReadOnlyCliRunner(),references=createPhase11ReadOnlyCliRunner();
    return createOwnerReadSnapshot(args=>{consume(closing);const value=reader(args) as Json;
      if(rollback&&args[1]==="describe-stacks"){
        const found=value.Stacks?.filter((s:Json)=>s.StackName===OWNER_STACK);
        if(found?.length!==1||ownerDigest(found[0])!==ownerDigest(rollback))fail("ROLLBACK_STACK_CHANGED");found[0].StackStatus="UPDATE_COMPLETE";
      }return value;},(s,o,a)=>query(s,o,a,closing),args=>{consume(closing);return references(args);});
  };
  try{
    if(!safeOwnerDirectory(base,directory,physical))fail("TEMP_INVALID");
    const acl=spawnSync("powershell.exe",["-NoProfile","-NonInteractive","-Command",PRIVATE_ACL],{env:privateAclChildEnvironment(env,directory),encoding:"utf8",windowsHide:true,timeout:10000,maxBuffer:20000});
    if(acl.status!==0||JSON.parse(acl.stdout).privateAclVerified!==true)fail("ACL_INVALID");
    const files=ownerBundleFiles(),proof=verifyReleaseSource("controller",readFileSync(resolve("services/controller/bundle/main.mjs")));
    const assertSource=()=>{
      if(ownerDigest(files)!==ownerDigest(ownerBundleFiles())||ownerDigest(proof)!==ownerDigest(verifyReleaseSource("controller",readFileSync(resolve("services/controller/bundle/main.mjs")))))fail("PACKAGE_SOURCE_CHANGED");
      if(execute){
        const runId=process.env.GMAI_OWNER_GATE_RUN_ID;
        if(!runId||!/^[a-f0-9-]{36}$/.test(runId))fail("LOCAL_GATE_UNVERIFIED");
        const receiptPath=resolve("outputs/local-gates",`${runId}.json`),stat=lstatSync(receiptPath);
        if(!stat.isFile()||stat.isSymbolicLink()||stat.size>10000||realpathSync(receiptPath)!==receiptPath)fail("LOCAL_GATE_UNVERIFIED");
        const fp=spawnSync(process.execPath,["--input-type=module","--eval",'import {fingerprintCurrentSource} from "./scripts/clean-source-build-proof.mjs"; console.log(JSON.stringify(fingerprintCurrentSource(process.cwd())));'],
          {env:privateAclChildEnvironment(env,directory),encoding:"utf8",windowsHide:true,timeout:15000,maxBuffer:20000});
        if(fp.status!==0||fp.signal!==null)fail("LOCAL_GATE_UNVERIFIED");
        reviewOwnerGateReceipt(JSON.parse(readFileSync(receiptPath,"utf8")),JSON.parse(fp.stdout),runId,Date.now());
      }
    };
    assertSource();
    const packed=spawnSync("powershell.exe",["-NoProfile","-NonInteractive","-Command",OWNER_ZIP_SCRIPT],{
      env:{...privateAclChildEnvironment(env,directory),GMAI_OWNER_FILES:JSON.stringify(files),GMAI_OWNER_ZIP:zip,GMAI_OWNER_BUNDLE:resolve("services/controller/bundle")},encoding:"utf8",windowsHide:true,timeout:15000,maxBuffer:20000});
    if(packed.status!==0||packed.signal!==null||JSON.parse(packed.stdout).packagedFiles!==3)fail("PACKAGE_INVALID");
    const bytes=readFileSync(zip);if(bytes.length<22||bytes.length>8_000_000||ownerDigest(files)!==ownerDigest(ownerBundleFiles()))fail("PACKAGE_INVALID");
    const zipSha256=createHash("sha256").update(bytes).digest("hex");
    before=snapshot();const proposed=proposeOwnerTemplate(before.live,before.identity,zipSha256),text=JSON.stringify(proposed);
    if(Buffer.byteLength(text)>51200)fail("TEMPLATE_TOO_LARGE");writeFileSync(path,text,{encoding:"utf8",flag:"wx"});
    createAttempted=true;const ack=query("cloudformation","create-change-set",ownerCreateArguments(before.stack,path,name));
    if(ack.StackId!==before.stack.StackId||typeof ack.Id!=="string")fail("CREATE_ACK_INVALID");
    let draft:Json|undefined;
    for(let n=0;n<16;n++){
      const v=query("cloudformation","describe-change-set",["--stack-name",before.stack.StackId,"--change-set-name",name,"--include-property-values"]);
      ownerDraftIdentity(v,before.stack,before.account,name,started,Date.now());
      if(v.Status==="CREATE_COMPLETE"){draft=v;break;}if(!["CREATE_PENDING","CREATE_IN_PROGRESS"].includes(v.Status))fail("PREPARATION_FAILED");
      await new Promise(done=>setTimeout(done,3000));
    }
    if(!draft||draft.ChangeSetId!==ack.Id)fail("PREPARATION_UNVERIFIED");
    // Sanitized structural diagnostics are useful if AWS changes its context shape.
    console.error(JSON.stringify({stage:"owner-draft-shape",changes:draft.Changes?.map((c:Json)=>({type:c.ResourceChange?.ResourceType,action:c.ResourceChange?.Action,
      replacement:c.ResourceChange?.Replacement,properties:c.ResourceChange?.Details?.map((d:Json)=>({name:d.Target?.Name,evaluation:d.Evaluation,recreation:d.Target?.RequiresRecreation})),
      beforeContextPresent:typeof c.ResourceChange?.BeforeContext==="string",afterContextPresent:typeof c.ResourceChange?.AfterContext==="string"}))}));
    const review=reviewOwnerDraft(draft,before.stack,before.identity,name,started,Date.now(),before.live,proposed,before.runtime,zipSha256);
    const prepared=query("cloudformation","get-template",["--stack-name",before.stack.StackId,"--change-set-name",draft.ChangeSetId,"--template-stage","Original"]);
    const body=typeof prepared.TemplateBody==="string"?JSON.parse(prepared.TemplateBody):prepared.TemplateBody;
    if(ownerDigest(body)!==ownerDigest(proposed)||readFileSync(path,"utf8")!==text)fail("PREPARED_TEMPLATE_CHANGED");
    if(execute){
      const account=before.account,bucket=`cdk-hnb659fds-assets-${account}-${OWNER_REGION}`,key=`${zipSha256}.zip`,checksum=Buffer.from(zipSha256,"hex").toString("base64");
      const upload=()=>{
        const block=query("s3api","get-public-access-block",["--bucket",bucket,"--expected-bucket-owner",account]).PublicAccessBlockConfiguration;
        if(!block||["BlockPublicAcls","IgnorePublicAcls","BlockPublicPolicy","RestrictPublicBuckets"].some(k=>block[k]!==true))fail("ASSET_BUCKET_NOT_PRIVATE");
        const head=()=>query("s3api","head-object",["--bucket",bucket,"--key",key,"--expected-bucket-owner",account,"--checksum-mode","ENABLED"]);
        const initial=head();
        if(initial.absent){
          if(createHash("sha256").update(readFileSync(zip)).digest("hex")!==zipSha256)fail("PACKAGE_CHANGED");
          try{query("s3api","put-object",["--bucket",bucket,"--key",key,"--body",zip,"--expected-bucket-owner",account,"--if-none-match","*",
            "--server-side-encryption","AES256","--checksum-sha256",checksum,"--content-type","application/zip"]);}catch{/* Read exact object; never retry PUT. */}
        }
        const stored=head();if(stored.ContentLength!==bytes.length||stored.ChecksumSHA256!==checksum||stored.ServerSideEncryption!=="AES256")fail("ASSET_UPLOAD_UNVERIFIED");
        assetVerified=true;
      };
      const result=await executeOwnerUpdate({query,snapshot:rollback=>snapshot(executeAttempted,rollback),upload,assertSource,now:Date.now,sleep:ms=>new Promise(done=>setTimeout(done,ms))},before,proposed,draft,name,started,zipSha256);
      packet={...result,...review,sourceRebuildVerified:true,zipSha256,zipBytes:bytes.length,assetVerified,assetUploadAttempted,changeSetsCreated:1};
      if(result.outcome!=="updated")primary="PRIVATE_OWNER_UPDATE_ROLLED_BACK";
    }else{
      const after=snapshot();if(after.fingerprint!==before.fingerprint)fail("BASELINE_CHANGED");assertSource();
      packet={mode:"unexecuted-private-owner-review",...review,sourceRebuildVerified:true,zipSha256,zipBytes:bytes.length,
        liveStateUnchanged:true,changeSetsCreated:1,changeSetsExecuted:0,assetsUploaded:0,workloadCalls:0,publicationPerformed:false};
    }
  }catch(e){primary=code(e);}finally{
    try{
      if(executeAttempted&&before){
        const history=query("cloudformation","describe-change-set",["--stack-name",before.stack.StackId,"--change-set-name",name],true);
        if(!history.absent){
          ownerDraftIdentity(history,before.stack,before.account,name,started,Date.now());
          if(!["EXECUTE_COMPLETE","EXECUTE_FAILED","OBSOLETE"].includes(history.ExecutionStatus))fail("EXECUTION_HISTORY_UNVERIFIED");
        }
        executionHistoryVerified=true;
      }else if(createAttempted&&before){
        let absent=false;
        for(let n=0;n<5;n++){
          const v=query("cloudformation","describe-change-set",["--stack-name",before.stack.StackId,"--change-set-name",name],true);
          if(v.absent){absent=true;break;}
          const id=ownerDraftIdentity(v,before.stack,before.account,name,started,Date.now());
          if(!["AVAILABLE","UNAVAILABLE"].includes(v.ExecutionStatus))fail("CLEANUP_EXECUTION_UNEXPECTED");
          if(n===0)query("cloudformation","delete-change-set",["--stack-name",before.stack.StackId,"--change-set-name",id],true);
          await new Promise(done=>setTimeout(done,2000));
        }
        if(!absent)fail("DRAFT_CLEANUP_UNVERIFIED");draftRemoved=true;
      }
    }catch(e){cleanup=code(e);}
    try{if(!safeOwnerDirectory(base,directory,physical))fail("TEMP_INVALID");rmSync(directory,{recursive:true});localRemoved=!existsSync(directory);if(!localRemoved)fail("TEMP_CLEANUP_UNVERIFIED");}catch(e){cleanup=cleanup||code(e);}
  }
  const closure={awsCalls:calls+cleanupCalls,ownedDraftRemoved:draftRemoved,executionHistoryVerified,privateCandidateRemoved:localRemoved,privateDetailsSuppressed:true,independentSafeStopRequired:true};
  if(primary||cleanup)return{...packet,error:primary||cleanup,cleanupError:cleanup||null,createAttempted,executeAttempted,assetUploadAttempted,assetVerified,...closure};
  return{...packet,...closure};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{const args=process.argv.slice(2);if(!args.length)console.log(JSON.stringify(privateOwnerDraftPlan()));
    else{if(args.length!==1||!["--prepare-one-unexecuted-review","--execute-one-owner-update"].includes(args[0]!))fail("ARGUMENTS_REJECTED");const p=await preparePrivateOwnerDraft(args[0]==="--execute-one-owner-update");console.log(JSON.stringify(p));if(p.error)process.exitCode=1;}}
  catch{console.error(JSON.stringify({error:"PRIVATE_OWNER_REVIEW_INCOMPLETE",privateDetailsSuppressed:true,independentSafeStopRequired:true}));process.exitCode=1;}
}
