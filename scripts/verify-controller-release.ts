import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { collectPhase11Readiness, createPhase11ReadOnlyCliRunner, phase11ReadOnlyChildEnvironment } from "./phase11-live-readiness.js";
import { PRIVATE_ACL, privateAclChildEnvironment } from "./promote-worker-patch.js";
import { verifyReleaseSource } from "./release-source-proof.js";

const PREFIX = "global-market-ai-insight-dev", CONTROLLER = "ControllerFunctionC25B79B1";
type Json = Record<string, any>;
function fail(code: string): never { throw new Error(code); }
export function controllerReleaseProofPlan(args: readonly string[] = []) {
  if (args.length) fail("CONTROLLER_PROOF_ARGUMENTS_REJECTED");
  return {mode:"dry-run",awsCalls:0,awsReadsMax:24,cloudMutations:0,privateZipDownloadsMax:1,zipBytesMax:8_000_000,codeExecuted:false,publicationPerformed:false};
}
export function verifyControllerZipHash(bytes: Buffer, expected: string) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 22 || bytes.length > 8_000_000 || !/^[A-Za-z0-9+/]{43}=$/.test(expected) ||
      createHash("sha256").update(bytes).digest("base64") !== expected) fail("CONTROLLER_PROOF_CODE_HASH_MISMATCH");
  return {deployedZipHashMatched:true};
}
export function controllerProofCodeKey(value: Json) {
  const code = value?.Resources?.[CONTROLLER]?.Properties?.Code;
  if (!code || !/^[a-f0-9]{64}\.zip$/.test(code.S3Key) || Object.keys(code).some(key => !["S3Bucket","S3Key"].includes(key))) fail("CONTROLLER_PROOF_TEMPLATE_INVALID");
  return code.S3Key as string;
}
export function safeControllerProofDirectory(base: string, directory: string, physical: string) {
  try { const name=basename(directory);return /^gmai-controller-proof-[A-Za-z0-9]+$/.test(name) && relative(resolve(base),resolve(directory))===name &&
    lstatSync(directory).isDirectory()&&!lstatSync(directory).isSymbolicLink()&&realpathSync(base)===physical&&realpathSync(directory)===resolve(physical,name); } catch {return false;}
}
export const VERIFY_ZIP = String.raw`
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.IO.Compression
$taskExpected=ConvertFrom-Json $env:GMAI_CONTROLLER_EXPECTED_FILES
$taskZip=[IO.Compression.ZipArchive]::new([IO.File]::OpenRead($env:GMAI_CONTROLLER_ZIP),[IO.Compression.ZipArchiveMode]::Read)
$taskSeen=@{}
try {
  if($taskZip.Entries.Count -lt 3 -or $taskZip.Entries.Count -gt 4){throw 'ZIP_ENTRY_COUNT_INVALID'}
  foreach($taskEntry in $taskZip.Entries){
    if($taskEntry.FullName -ceq 'licenses/' -and $taskEntry.Length -eq 0){continue}
    $taskName=$taskEntry.FullName
    $taskRecord=@($taskExpected|Where-Object {$_.name -ceq $taskName})
    if($taskRecord.Count -ne 1 -or $taskSeen.ContainsKey($taskName) -or $taskEntry.Length -ne $taskRecord[0].bytes -or $taskEntry.Length -gt 2000000){throw 'ZIP_ENTRY_INVALID'}
    $taskSeen[$taskName]=$true
    $taskStream=$taskEntry.Open();$taskMemory=[IO.MemoryStream]::new();$taskBuffer=New-Object byte[] 65536;$taskReadTotal=0
    try{
      while(($taskRead=$taskStream.Read($taskBuffer,0,$taskBuffer.Length)) -gt 0){$taskReadTotal+=$taskRead;if($taskReadTotal -gt 2000000){throw 'ZIP_ENTRY_OVERSIZED'};$taskMemory.Write($taskBuffer,0,$taskRead)}
      $taskSha=[Security.Cryptography.SHA256]::Create()
      try{$taskHash=([BitConverter]::ToString($taskSha.ComputeHash($taskMemory.ToArray()))).Replace('-','').ToLowerInvariant()}finally{$taskSha.Dispose()}
      if($taskReadTotal -ne $taskRecord[0].bytes -or $taskHash -cne $taskRecord[0].sha256){throw 'ZIP_SOURCE_MISMATCH'}
    }finally{$taskStream.Dispose();$taskMemory.Dispose()}
  }
  if($taskSeen.Count -ne 3){throw 'ZIP_CONTENT_INCOMPLETE'}
  [pscustomobject]@{sourceFilesMatched=3;deployedMainAndNoticesMatched=$true;archiveExtracted=$false;codeExecuted=$false}|ConvertTo-Json -Compress
}finally{$taskZip.Dispose()}
`;

export function verifyControllerRelease(): Record<string,unknown> {
  const aws=process.env.GMAI_AWS_CLI_PATH;
  if(process.env.AWS_PROFILE!=="gmai-admin"||process.platform!=="win32"||!aws||!isAbsolute(aws)||basename(aws).toLowerCase()!=="aws.exe"||!lstatSync(aws).isFile()||lstatSync(aws).isSymbolicLink())fail("CONTROLLER_PROOF_CONFIGURATION_INVALID");
  const started=Date.now(),base=resolve(tmpdir()),physical=realpathSync(base),directory=mkdtempSync(join(base,"gmai-controller-proof-"));
  let calls=0,packet:Json|undefined;
  const env=phase11ReadOnlyChildEnvironment(process.env);
  for(const key of Object.keys(env))if(/^(GMAI_|CDK_|OPENAI_|ANTHROPIC_|TWELVE_?DATA|BEDROCK_|NODE_OPTIONS$|NODE_PATH$|GH_TOKEN$|GITHUB_TOKEN$|HTTP_PROXY$|HTTPS_PROXY$|ALL_PROXY$|NO_PROXY$)/i.test(key))delete env[key];
  const consume=()=>{if(++calls>24||Date.now()-started+30000>=420000)fail("CONTROLLER_PROOF_BOUND_EXCEEDED")};
  const baseline=()=>{let identity:Json|undefined,controller:Json|undefined;const reader=createPhase11ReadOnlyCliRunner();
    const report=collectPhase11Readiness(args=>{consume();const v=reader(args) as Json;if(args[0]==="sts")identity=v;if(args[0]==="lambda")controller=v;return v});
    if(!report.readyForAccountSpecificDiff||!identity||!controller)fail("CONTROLLER_PROOF_BASELINE_BLOCKED");return{report,account:identity.Account as string,controller};};
  const query=(service:string,operation:string,args:string[])=>{consume();const r=spawnSync(aws,[service,operation,...args,"--profile","gmai-admin","--region","ap-northeast-1","--no-cli-pager","--no-paginate","--output","json"],
    {env,encoding:"utf8",windowsHide:true,timeout:30000,maxBuffer:1500000});if(r.status!==0||r.signal!==null)fail("CONTROLLER_PROOF_READ_UNVERIFIED");return JSON.parse(r.stdout);};
  try{
    if(!safeControllerProofDirectory(base,directory,physical))fail("CONTROLLER_PROOF_TEMP_INVALID");
    const acl=spawnSync("powershell.exe",["-NoProfile","-NonInteractive","-Command",PRIVATE_ACL],{env:privateAclChildEnvironment(env,directory),encoding:"utf8",windowsHide:true,timeout:10000,maxBuffer:20000});
    if(acl.status!==0||JSON.parse(acl.stdout).privateAclVerified!==true)fail("CONTROLLER_PROOF_ACL_UNVERIFIED");
    const files=["main.mjs","THIRD_PARTY_NOTICES.md","licenses/AWS-SDK-JS-V3-APACHE-2.0.txt"].map(name=>{const path=resolve("services/controller/bundle",name),info=lstatSync(path);
      if(!info.isFile()||info.isSymbolicLink()||info.size<1||info.size>2000000||realpathSync(path)!==path)fail("CONTROLLER_PROOF_SOURCE_INVALID");
      return{name,bytes:info.size,sha256:createHash("sha256").update(readFileSync(path)).digest("hex")};});
    const sourceProof=verifyReleaseSource("controller",readFileSync(resolve("services/controller/bundle/main.mjs")));
    if(sourceProof.artifactSha256!==files[0].sha256)fail("CONTROLLER_PROOF_SOURCE_CHANGED");
    const initial=baseline(),template=query("cloudformation","get-template",["--stack-name",`${PREFIX}-compute`,"--template-stage","Original"]);
    const body=typeof template.TemplateBody==="string"?JSON.parse(template.TemplateBody):template.TemplateBody,key=controllerProofCodeKey(body);
    const zip=join(directory,"controller.zip");
    query("s3api","get-object",["--bucket",`cdk-hnb659fds-assets-${initial.account}-ap-northeast-1`,"--key",key,"--expected-bucket-owner",initial.account,"--range","bytes=0-7999999",zip]);
    const info=lstatSync(zip);if(!info.isFile()||info.isSymbolicLink()||info.size>8000000||realpathSync(zip)!==zip)fail("CONTROLLER_PROOF_ARCHIVE_INVALID");
    verifyControllerZipHash(readFileSync(zip),initial.controller.CodeSha256);
    const inspected=spawnSync("powershell.exe",["-NoProfile","-NonInteractive","-Command",VERIFY_ZIP],{env:{...privateAclChildEnvironment(env,directory),GMAI_CONTROLLER_ZIP:zip,GMAI_CONTROLLER_EXPECTED_FILES:JSON.stringify(files)},encoding:"utf8",windowsHide:true,timeout:10000,maxBuffer:20000});
    if(inspected.status!==0||inspected.signal!==null)fail("CONTROLLER_PROOF_CONTENT_UNVERIFIED");
    const content=JSON.parse(inspected.stdout);if(content.deployedMainAndNoticesMatched!==true||content.sourceFilesMatched!==3||content.archiveExtracted!==false||content.codeExecuted!==false)fail("CONTROLLER_PROOF_CONTENT_UNVERIFIED");
    const final=baseline();if(final.account!==initial.account||final.controller.CodeSha256!==initial.controller.CodeSha256||
      final.controller.Environment?.Variables?.WORKER_TASK_DEFINITION!==initial.controller.Environment?.Variables?.WORKER_TASK_DEFINITION||JSON.stringify(initial.report.circuit)!==JSON.stringify(final.report.circuit))fail("CONTROLLER_PROOF_BASELINE_CHANGED");
    for(const record of files)if(createHash("sha256").update(readFileSync(resolve("services/controller/bundle",record.name))).digest("hex")!==record.sha256)fail("CONTROLLER_PROOF_SOURCE_CHANGED");
    const closingSourceProof=verifyReleaseSource("controller",readFileSync(resolve("services/controller/bundle/main.mjs")));
    if(JSON.stringify(sourceProof)!==JSON.stringify(closingSourceProof))fail("CONTROLLER_PROOF_SOURCE_CHANGED");
    packet={mode:"private-deployed-controller-code-proof",awsReads:calls,cloudMutations:0,privateZipDownloads:1,downloadBytes:info.size,deployedZipHashMatched:true,
      deployedCodeSha256:initial.controller.CodeSha256,mainBundleSha256:files.find(record=>record.name==="main.mjs")!.sha256,...content,
      jobsEnabled:false,displayEnabled:false,circuitVerifiedOpen:true,runningTasks:0,pendingTasks:0,services:0,occupiedSlots:0,rawIdentifiersPrinted:false,currentSourceRebuildVerified:true,completeLicenseProvenanceVerified:false,publicationPerformed:false};
  }finally{if(!safeControllerProofDirectory(base,directory,physical))fail("CONTROLLER_PROOF_TEMP_INVALID");rmSync(directory,{recursive:true});if(existsSync(directory))fail("CONTROLLER_PROOF_CLEANUP_UNVERIFIED");}
  if(!packet)fail("CONTROLLER_PROOF_INCOMPLETE");return{...packet,privateArchiveRemoved:true};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){try{const args=process.argv.slice(2);if(!args.length)console.log(JSON.stringify(controllerReleaseProofPlan()));
  else{if(args.length!==1||args[0]!=="--execute-read-only")fail("CONTROLLER_PROOF_ARGUMENTS_REJECTED");console.log(JSON.stringify(verifyControllerRelease()));}}
  catch(error){console.error(JSON.stringify({error:error instanceof Error&&/^CONTROLLER_PROOF_[A-Z_]+$/.test(error.message)?error.message:"CONTROLLER_PROOF_INCOMPLETE",rawDetailsSuppressed:true,cleanupMustBeIndependentlyVerified:true}));process.exitCode=1;}}
