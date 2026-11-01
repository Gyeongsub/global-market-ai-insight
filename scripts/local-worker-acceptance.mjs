import {spawnSync} from "node:child_process";
import {createHash,randomUUID} from "node:crypto";
import {existsSync,lstatSync,mkdirSync,mkdtempSync,readFileSync,realpathSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {fingerprintCurrentSource} from "./clean-source-build-proof.mjs";
import {backupStoppedDockerSockets} from "./docker-transient-preflight.mjs";
import {ownedLocalGateReportDirectory} from "./local-gate-proof.mjs";
import {runRecordedWorkerCandidate,safeWorkerCandidateResult} from "./record-worker-candidate.mjs";
import {runRecordedRuntimeSmoke,safeWorkerRuntimeResult} from "./worker-runtime-smoke.mjs";
import {assertNodeSecurityBaseline} from "./node-security-baseline.mjs";

const fail=()=>{throw new Error("LOCAL_WORKER_ACCEPTANCE_INCOMPLETE");};
const uuid=v=>typeof v==="string"&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const fingerprint=f=>f&&Object.keys(f).sort().join(",")==="bytes,files,sha256"&&Number.isSafeInteger(f.files)&&f.files>0&&f.files<=2000&&
  Number.isSafeInteger(f.bytes)&&f.bytes>0&&f.bytes<=64_000_000&&/^[a-f0-9]{64}$/.test(f.sha256??"");
function leaseValid(v){return v&&Number.isSafeInteger(v.rootPid)&&v.rootPid>0&&v.rootPid<=2147483647&&
  typeof v.startedAtUtc==="string"&&/^20[0-9]{2}-[0-9:T.-]+Z$/.test(v.startedAtUtc)&&Number.isFinite(Date.parse(v.startedAtUtc));}
function socketBackup(p){if(p?.completed!==true||p.filesDeleted!==0||p.imagesAndVolumesModified!==false||p.globalSettingsChanged!==false||
  !Number.isSafeInteger(p.recoverableDirectories)||p.recoverableDirectories<0||p.recoverableDirectories>2||!/^[a-f0-9]{32}$/.test(p.backupScope??""))fail();return p;}

export function localWorkerAcceptancePlan(args=[]){
  if(args.length)fail();return {mode:"dry-run",awsCalls:0,dockerCalls:0,processStarts:0,reportFilesWritten:0,
    stoppedOnlyPreflightRequired:true,existingDockerAdoptionAllowed:false,callerSelectedImageAllowed:false,
    buildsMax:1,runtimeContainersMax:1,credentialsPassed:false,cloudMutations:0,imagePushes:0,
    privateLogsPrinted:false,settingsChanged:false,imagesAndVolumesDeleted:false,readyForDeployment:false,readyForPublication:false};
}

export function ownedDesktopStopArguments(force){
  if(typeof force!=="boolean")fail();
  // Invoke the signed bundled plugin directly. An intentionally empty Docker
  // config has no plugin discovery paths and must not fall back to user auths.
  return ["desktop","stop",...(force?["--force"]:[]),"--timeout","25"];
}

/** Fixed stages only. Cleanup is independent of successful build/runtime results;
 * an active/foreign container or unverified process tree is never stopped. */
export async function runLocalWorkerAcceptance(ports,onPhase=()=>{}){
  let stage="preflight",lease=null,startAttempted=false,baselineStopped=false,engineReady=false,passed=false,cleanupVerified=false,ownerVerified=false;
  let source=null,buildRunId=null,runtimeRunId=null,imageId=null,stopMethod="none",beforeBackup=null,afterBackup=null;
  const started=ports.now();
  const step=async(name,operation)=>{stage=name;const now=ports.now();if(!Number.isFinite(now)||now<started||now-started>=900000)fail();
    onPhase({mode:"local-worker-acceptance-phase",phase:name,privateDetailsSuppressed:true});
    const value=await operation();const after=ports.now();if(!Number.isFinite(after)||after<now||after-started>=900000)fail();return value;};
  try{
    if(!Number.isFinite(started)||started<0)fail();
    const inspected=await step("preflight",()=>ports.inspectStopped());if(inspected?.stopped!==true||inspected.signaturesVerified!==true)fail();baselineStopped=true;
    beforeBackup=socketBackup(await step("socket-preflight",()=>ports.backupSockets()));
    const captured=await step("source-capture",()=>ports.captureSource());if(!fingerprint(captured))fail();source={...captured};
    lease=await step("start-owned",()=>{startAttempted=true;return ports.startHidden();});if(!leaseValid(lease))fail();
    const ready=await step("engine-ready",()=>ports.waitReady());if(ready!==true)fail();engineReady=true;
    if(await step("owner-before-work",()=>ports.verifyOwner(lease))!==true)fail();ownerVerified=true;
    if(await step("empty-before-work",()=>ports.runningContainers())!==0)fail();
    await step("fixed-bundles",()=>ports.buildBundles());
    const build=await step("build-scan",()=>ports.buildScan());
    if(build?.mode!=="recorded-local-worker-build"||build.completed!==true||build.passed!==true||!uuid(build.runId)||!safeWorkerCandidateResult(build.proof)||
      !same(build.proof.sourceFingerprint,source))fail();
    buildRunId=build.runId;imageId=build.proof.localCandidateImageId;
    const runtime=await step("offline-runtime",()=>ports.runtimeSmoke());
    if(runtime?.mode!=="recorded-worker-runtime-smoke"||runtime.completed!==true||runtime.passed!==true||!uuid(runtime.runId)||!safeWorkerRuntimeResult(runtime.proof)||
      !same(runtime.proof.sourceFingerprint,source)||runtime.proof.localImageId!==imageId||
      runtime.proof.applicationModuleSha256!==build.proof.currentApplicationProof.applicationModuleSha256)fail();
    runtimeRunId=runtime.runId;
    if(!same(await step("source-closing",()=>ports.captureSource()),source))fail();
    passed=true;
  }catch{passed=false;}
  finally{
    try{
      if(startAttempted&&!leaseValid(lease))lease=await ports.recoverOwnedStart();
      if(leaseValid(lease)){
        if(await ports.verifyOwner(lease)!==true)fail();ownerVerified=true;
        if(engineReady&&await ports.runningContainers()!==0)fail();
        // Force is restricted to our verified failed startup before readiness.
        stopMethod=engineReady?"normal":"forced-owned-startup";if(await ports.stopOwned(!engineReady)!==true)fail();
        if(await ports.verifyStopped()!==true)fail();afterBackup=socketBackup(await ports.backupSockets());cleanupVerified=true;
      }else if(baselineStopped){if(await ports.verifyStopped()!==true)fail();afterBackup=socketBackup(await ports.backupSockets());cleanupVerified=true;}
    }catch{cleanupVerified=false;}
  }
  return {mode:"local-worker-acceptance-result",passed:passed&&cleanupVerified,stage,sourceFingerprint:source,buildRunId,runtimeRunId,localImageId:imageId,
    baselineStopped,startAttempted,ownedProcessLeaseVerified:ownerVerified,engineReady,cleanupVerified,stopMethod,
    beforeBackupScope:beforeBackup?.backupScope??null,afterBackupScope:afterBackup?.backupScope??null,
    awsCalls:0,cloudMutations:0,imagePushes:0,credentialsPassed:false,existingDockerAdopted:false,
    settingsChanged:false,imagesAndVolumesDeleted:false,rawDetailsSuppressed:true,independentClosureRequired:true,
    readyForDeployment:false,readyForPublication:false};
}

/** Durable receipts contain only this exact finite projection. In particular, a
 * syntactically plausible PID lease is not evidence of verified ownership. */
export function safeLocalWorkerAcceptanceResult(p){
  const keys="afterBackupScope,awsCalls,baselineStopped,beforeBackupScope,buildRunId,cleanupVerified,cloudMutations,credentialsPassed,engineReady,existingDockerAdopted,imagePushes,imagesAndVolumesDeleted,independentClosureRequired,localImageId,mode,ownedProcessLeaseVerified,passed,rawDetailsSuppressed,readyForDeployment,readyForPublication,runtimeRunId,settingsChanged,sourceFingerprint,stage,startAttempted,stopMethod";
  if(!p||Object.keys(p).sort().join(",")!==keys||p.mode!=="local-worker-acceptance-result"||
    !["preflight","socket-preflight","source-capture","start-owned","engine-ready","owner-before-work","empty-before-work","fixed-bundles","build-scan","offline-runtime","source-closing"].includes(p.stage)||
    !["none","normal","forced-owned-startup"].includes(p.stopMethod))return false;
  for(const key of ["baselineStopped","startAttempted","ownedProcessLeaseVerified","engineReady","cleanupVerified","passed"])if(typeof p[key]!=="boolean")return false;
  for(const key of ["awsCalls","cloudMutations","imagePushes"])if(p[key]!==0)return false;
  for(const key of ["credentialsPassed","existingDockerAdopted","settingsChanged","imagesAndVolumesDeleted","readyForDeployment","readyForPublication"])if(p[key]!==false)return false;
  if(p.rawDetailsSuppressed!==true||p.independentClosureRequired!==true||!(p.sourceFingerprint===null||fingerprint(p.sourceFingerprint)))return false;
  for(const key of ["buildRunId","runtimeRunId"])if(p[key]!==null&&!uuid(p[key]))return false;
  for(const key of ["beforeBackupScope","afterBackupScope"])if(p[key]!==null&&!/^[a-f0-9]{32}$/.test(p[key]))return false;
  if(p.localImageId!==null&&!/^sha256:[a-f0-9]{64}$/.test(p.localImageId))return false;
  if(p.passed&&(!p.baselineStopped||!p.startAttempted||!p.ownedProcessLeaseVerified||!p.engineReady||!p.cleanupVerified||
    p.stopMethod!=="normal"||p.stage!=="source-closing"||!p.sourceFingerprint||!p.buildRunId||!p.runtimeRunId||!p.localImageId||!p.beforeBackupScope||!p.afterBackupScope))return false;
  if(p.cleanupVerified&&!p.afterBackupScope)return false;
  return true;
}

function makeRealPorts(){
  assertNodeSecurityBaseline();
  if(process.platform!=="win32")fail();
  const script=resolve("scripts/docker-local-session.ps1"),stat=lstatSync(script);
  if(!stat.isFile()||stat.isSymbolicLink()||realpathSync(script)!==script||stat.size>16000)fail();
  const bytes=readFileSync(script),source=bytes.toString("utf8"),sourceSha=createHash("sha256").update(bytes).digest("hex");
  const env={};
  for(const name of ["PATH","Path","SystemRoot","SYSTEMROOT","WINDIR","ComSpec","TEMP","TMP","LOCALAPPDATA","APPDATA","USERPROFILE",
    "ProgramFiles","ProgramFiles(x86)","ProgramData","ALLUSERSPROFILE","SystemDrive","OS","PROCESSOR_ARCHITECTURE","NUMBER_OF_PROCESSORS"])
    if(typeof process.env[name]==="string")env[name]=process.env[name];
  if(!/^[A-Za-z]:\\Windows$/i.test(env.SystemRoot??""))fail();
  env.PSModulePath=join(env.SystemRoot,"System32/WindowsPowerShell/v1.0/Modules");
  const host=join(env.SystemRoot,"System32/WindowsPowerShell/v1.0/powershell.exe");
  let cli,stopPlugin,temporary=null,physical=null,config=null,startMetadata=null;
  const bridge=(action,lease)=>{
    if(!readFileSync(script).equals(bytes))fail();
    if(!["inspect-stopped","start-hidden","verify-owner","find-owned-start","verify-stopped"].includes(action))fail();
    let args=` -Action '${action}'`;
    if(action==="verify-owner"){if(!leaseValid(lease))fail();args+=` -ExpectedRootPid ${lease.rootPid} -ExpectedStartedAt '${lease.startedAtUtc}'`;}
    if(action==="find-owned-start"){
      if(!startMetadata||!Number.isSafeInteger(startMetadata.parentPid)||startMetadata.parentPid<1||!/^20[0-9]{2}-[0-9:T.-]+Z$/.test(startMetadata.afterUtc))fail();
      args+=` -ExpectedParentPid ${startMetadata.parentPid} -ExpectedAfterUtc '${startMetadata.afterUtc}'`;
    }
    const issuedAt=new Date().toISOString();
    const r=spawnSync(host,["-NoLogo","-NoProfile","-NonInteractive","-Command",`& {\n${source}\n}${args}`],
      {env,encoding:"utf8",windowsHide:true,timeout:15000,maxBuffer:20000});
    if(action==="start-hidden")startMetadata={parentPid:r.pid,afterUtc:issuedAt};
    if(r.status!==0||r.signal!==null||r.error)fail();const packet=JSON.parse(r.stdout);if(packet.error)fail();return packet;
  };
  const childEnv=()=>{
    if(!config)fail();return {...env,DOCKER_CONFIG:config,DOCKER_CONTEXT:"",DOCKER_HOST:"npipe:////./pipe/dockerDesktopLinuxEngine",
      DOCKER_BUILDKIT:"1",DOCKER_CLI_HINTS:"false",DOCKER_CLI_TELEMETRY:"0",OTEL_SDK_DISABLED:"true"};
  };
  const docker=(args,timeout=15000)=>spawnSync(cli,["--host","npipe:////./pipe/dockerDesktopLinuxEngine",...args],
    {env:childEnv(),encoding:"utf8",windowsHide:true,timeout,maxBuffer:20000});
  const output=r=>{if(r.status!==0||r.signal!==null||r.error)fail();return r.stdout;};
  return {
    now:()=>performance.now(),
    inspectStopped(){const p=bridge("inspect-stopped");if(p.mode!=="verified-stopped-docker-install"||p.stopped!==true||p.signaturesVerified!==true||
      typeof p.cliPath!=="string"||!p.cliPath.endsWith("\\resources\\bin\\docker.exe")||realpathSync(p.cliPath)!==p.cliPath||
      typeof p.stopPluginPath!=="string"||!p.stopPluginPath.endsWith("\\resources\\cli-plugins\\docker-desktop.exe")||realpathSync(p.stopPluginPath)!==p.stopPluginPath)fail();
      cli=p.cliPath;stopPlugin=p.stopPluginPath;
      const base=resolve(tmpdir());physical=realpathSync(base);temporary=mkdtempSync(join(base,"gmai-live-image-scan-"));
      config=join(temporary,"docker-config");mkdirSync(config);writeFileSync(join(config,"config.json"),JSON.stringify({auths:{}}),{flag:"wx"});
      return {stopped:true,signaturesVerified:true};},
    backupSockets(){const file=resolve("scripts/docker-transient-preflight.ps1"),expected="0f5cd327aecee063fe7eb546cfb6ce7f77e29037d4a2b2c15349d8c2ebeed071";
      if(createHash("sha256").update(readFileSync(file)).digest("hex")!==expected)fail();
      const p=backupStoppedDockerSockets();if(p.sourceSha256!==expected)fail();return p;},captureSource:()=>fingerprintCurrentSource(),
    startHidden:()=>bridge("start-hidden"),
    recoverOwnedStart(){const p=bridge("find-owned-start");return p.mode==="no-owned-docker-start"?null:p;},
    async waitReady(){const started=performance.now();for(let index=0;index<12&&performance.now()-started<75000;index++){
      const r=docker(["version","--format","{{.Server.Version}}"],5000);
      if(r.status===0&&r.signal===null&&!r.error&&/^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}(?:[-+][A-Za-z0-9.-]+)?$/.test(r.stdout.trim()))return true;
      await new Promise(resolve=>setTimeout(resolve,1000));
    }return false;},
    verifyOwner(lease){const p=bridge("verify-owner",lease);if(p.mode!=="owned-docker-tree"||p.verified!==true||p.rootPid!==lease.rootPid||p.startedAtUtc!==lease.startedAtUtc)fail();return true;},
    runningContainers(){const text=output(docker(["container","ls","--quiet"])).trim();if(!text)return 0;
      const rows=text.split(/\r?\n/);if(rows.length>100||rows.some(v=>!/^[a-f0-9]{12,64}$/.test(v)))fail();return rows.length;},
    async buildBundles(){const {buildBackendBundle}=await import("./backend-bundle-build.mjs");for(const service of ["controller","worker","sweeper","alarm-circuit"])await buildBackendBundle(service);},
    async buildScan(){const before=process.env.GMAI_DOCKER_CLI_PATH;process.env.GMAI_DOCKER_CLI_PATH=cli;
      try{return await runRecordedWorkerCandidate();}finally{if(before===undefined)delete process.env.GMAI_DOCKER_CLI_PATH;else process.env.GMAI_DOCKER_CLI_PATH=before;}},
    async runtimeSmoke(){const before=process.env.GMAI_DOCKER_CLI_PATH;process.env.GMAI_DOCKER_CLI_PATH=cli;
      try{return await runRecordedRuntimeSmoke();}finally{if(before===undefined)delete process.env.GMAI_DOCKER_CLI_PATH;else process.env.GMAI_DOCKER_CLI_PATH=before;}},
    stopOwned(force){output(spawnSync(stopPlugin,["--config",config,...ownedDesktopStopArguments(force)],
      {env:childEnv(),encoding:"utf8",windowsHide:true,timeout:30000,maxBuffer:20000}));return true;},
    verifyStopped(){const p=bridge("verify-stopped");if(p.stopped!==true||p.processes!==0)fail();return true;},
    async close(){const unchanged=readFileSync(script).equals(bytes);if(temporary){
      const {safeScanTemporaryDirectory}=await import("./scan-live-image-cache.ts");
      if(!safeScanTemporaryDirectory(resolve(tmpdir()),temporary,physical))fail();rmSync(temporary,{recursive:true});if(existsSync(temporary))fail();}
      if(!unchanged)fail();return {bridgeSourceSha256:sourceSha,ownedConfigurationRemoved:true};},
  };
}

async function recordedLocalWorkerAcceptance(){
  const directory=ownedLocalGateReportDirectory(process.cwd()),runId=randomUUID(),path=join(directory,`worker-session-${runId}.json`);
  const initial={mode:"recorded-local-worker-acceptance",runId,completed:false,passed:false,startedAt:new Date().toISOString(),rawDetailsSuppressed:true};
  writeFileSync(path,JSON.stringify(initial)+"\n",{flag:"wx"});let ports,proof=null,close=null;
  try{ports=makeRealPorts();const result=await runLocalWorkerAcceptance(ports,p=>console.log(JSON.stringify(p)));
    if(safeLocalWorkerAcceptanceResult(result))proof=result;}catch{/* Fixed failure packet only. */}
  finally{if(ports)try{close=await ports.close();}catch{close=null;}}
  const packet={...initial,completed:true,completedAt:new Date().toISOString(),passed:proof?.passed===true&&close?.ownedConfigurationRemoved===true,
    ...(proof?{proof}:{}),...(close?{localCleanup:close}:{}),independentLocalClosureRequired:true};
  if(ownedLocalGateReportDirectory(process.cwd())!==directory||!lstatSync(path).isFile()||lstatSync(path).isSymbolicLink()||realpathSync(path)!==path||readFileSync(path,"utf8")!==JSON.stringify(initial)+"\n")fail();
  writeFileSync(path,JSON.stringify(packet)+"\n");return packet;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{const args=process.argv.slice(2);if(!args.length)console.log(JSON.stringify(localWorkerAcceptancePlan()));
    else {if(args.length!==1||args[0]!=="--execute-local-acceptance")fail();const p=await recordedLocalWorkerAcceptance();console.log(JSON.stringify(p));if(!p.passed)process.exitCode=1;}}
  catch{console.error(JSON.stringify({error:"LOCAL_WORKER_ACCEPTANCE_INCOMPLETE",rawDetailsSuppressed:true,independentLocalClosureRequired:true}));process.exitCode=1;}
}
