import {spawnSync} from "node:child_process";
import {randomUUID,createHash} from "node:crypto";
import {existsSync,lstatSync,mkdirSync,mkdtempSync,readdirSync,readFileSync,realpathSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {basename,isAbsolute,join,resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {ownedLocalGateReportDirectory} from "./local-gate-proof.mjs";
import {workerCaTrustProgram} from "./worker-ca-trust.mjs";
import {assertNodeSecurityBaseline} from "./node-security-baseline.mjs";
const HOST="npipe:////./pipe/dockerDesktopLinuxEngine",OPERATOR="gmai-worker-runtime-proof";
const fail=()=>{throw new Error("WORKER_RUNTIME_SMOKE_INCOMPLETE");};
const digest=value=>typeof value==="string"&&/^sha256:[a-f0-9]{64}$/.test(value);
const hex=value=>typeof value==="string"&&/^[a-f0-9]{32}$/.test(value);

export function workerRuntimeSmokePlan(args=[]) {
  if(args.length)fail();
  return {mode:"dry-run",awsCalls:0,dockerCalls:0,containersCreated:0,containersMax:1,callerSelectedImageAllowed:false,
    network:"none",readOnlyRoot:true,hostMounts:0,credentialsPassed:false,localCandidateSourceBindingRequired:true,currentCleanArchiveScanRequired:true,
    realProviderRequests:0,realModelRequests:0,cloudMutations:0,publicationPerformed:false,readyForDeployment:false};
}
export function runtimeContainerCreateArguments(imageId,scope,program) {
  if(!digest(imageId)||!hex(scope)||typeof program!=="string"||program.length<1||program.length>20_000||program.includes("\0"))fail();
  return ["container","create","--pull","never","--name",`gmai-worker-runtime-${scope}`,
    "--label",`com.gmai.operator=${OPERATOR}`,"--label",`com.gmai.scope=${scope}`,
    "--network","none","--read-only","--cap-drop","ALL","--security-opt","no-new-privileges",
    "--pids-limit","64","--memory","256m","--cpus","0.5","--tmpfs","/tmp:rw,noexec,nosuid,size=16m",
    "--entrypoint","/nodejs/bin/node",imageId,"--input-type=module","--eval",program];
}
export function verifyRuntimeContainerOwner(value,imageId,scope) {
  const c=Array.isArray(value)&&value.length===1?value[0]:null;
  if(!digest(imageId)||!hex(scope)||!c||!c.Config||c.Name!==`/gmai-worker-runtime-${scope}`||
    !/^[a-f0-9]{64}$/.test(c.Id??"")||c.Config.Image!==imageId||
    c.Config.Labels?.["com.gmai.operator"]!==OPERATOR||c.Config.Labels?.["com.gmai.scope"]!==scope)fail();
  return c;
}
export function verifyRuntimeContainerIsolation(value,imageId,scope,program) {
  const c=verifyRuntimeContainerOwner(value,imageId,scope),h=c.HostConfig;
  if(!h||h.NetworkMode!=="none"||h.ReadonlyRootfs!==true||JSON.stringify(h.CapDrop)!=='["ALL"]'||
    JSON.stringify(h.SecurityOpt)!=='["no-new-privileges"]'||h.Privileged!==false||h.PidsLimit!==64||h.Memory!==268435456||
    h.NanoCpus!==500000000||c.Config.User!=="65532:65532"||c.Config.WorkingDir!=="/app"||
    JSON.stringify(c.Config.Entrypoint)!=='["/nodejs/bin/node"]'||JSON.stringify(c.Config.Cmd)!==JSON.stringify(["--input-type=module","--eval",program])||
    (h.Binds?.length??0)!==0||(h.Mounts?.length??0)!==0||Object.keys(h.PortBindings??{}).length!==0||
    Object.keys(h.Tmpfs??{}).join(",")!=="/tmp"||h.Tmpfs["/tmp"]!=="rw,noexec,nosuid,size=16m"||
    !Array.isArray(c.Config.Env)||c.Config.Env.some(v=>typeof v!=="string"||/^(?:AWS_|GMAI_|TWELVE_?DATA|OPENAI_|ANTHROPIC_|(?:GH|GITHUB)_TOKEN(?:=|$))/i.test(v)))fail();
  return c;
}
export function validateRuntimeFixtureResult(value) {
  const constants={schemaVersion:5,mode:"offline-worker-runtime-fixture",normalCases:30,negativeCases:15,totalCases:45,
    mockedProviderRequests:43,mockedModelRequests:20,realProviderRequests:0,realModelRequests:0,awsCalls:0,
    realDataCoverageClaimed:false,remoteCancellationOrBillingAcceptanceClaimed:false,platform:"linux",architecture:"x64",uid:65532,gid:65532};
  if(!value||typeof value!=="object"||Array.isArray(value)||Object.keys(value).sort().join(",")!==[...Object.keys(constants),"nodeVersion","entrypoint","processDeadline","caTrust"].sort().join(",")||
    Object.entries(constants).some(([k,v])=>value[k]!==v)||value.nodeVersion!=="22.23.4")fail();
  const ca=value.caTrust;
  if(!ca||Object.keys(ca).sort().join(",")!=="blockedRootFingerprintsAbsent,defaultRoots,defaultStoreMatchesBundled"||
    !Number.isSafeInteger(ca.defaultRoots)||ca.defaultRoots<100||ca.defaultRoots>512||
    ca.blockedRootFingerprintsAbsent!==true||ca.defaultStoreMatchesBundled!==true)fail();
  const boot={schemaVersion:1,mode:"offline-worker-entrypoint-fixture",normalCases:6,negativeCases:12,totalCases:18,childProcessesStarted:18,
    maxConcurrentChildren:1,childTimeoutMs:5000,sequenceBudgetMs:25000,allChildrenExited:true,processOutputsSanitized:true,
    credentialFieldsPassed:false,awsCalls:0,realProviderRequests:0,realModelRequests:0};
  if(!value.entrypoint||Object.keys(value.entrypoint).sort().join(",")!==Object.keys(boot).sort().join(",")||
    Object.entries(boot).some(([key,v])=>value.entrypoint[key]!==v))fail();
  const guard={schemaVersion:1,mode:"offline-worker-process-deadline-fixture",totalCases:3,naturalExitCases:1,retainedIoCases:2,
    maxConcurrentChildren:1,childTimeoutMs:3000,sequenceBudgetMs:10000,productionCeilingMs:300000,syntheticCeilingMs:100,
    allChildrenExited:true,privateOutputReturned:false,credentialsPassed:false,awsCalls:0,realProviderRequests:0,realModelRequests:0};
  if(!value.processDeadline||Object.keys(value.processDeadline).sort().join(",")!==Object.keys(guard).sort().join(",")||
    Object.entries(guard).some(([key,v])=>value.processDeadline[key]!==v))fail();
  return {...value,entrypoint:{...value.entrypoint},processDeadline:{...value.processDeadline},caTrust:{...ca}};
}
export function verifyFreshRuntimeCandidateScan(packet,expected,now=Date.now()) {
  const p=packet?.proof,completed=Date.parse(packet?.completedAt),started=Date.parse(packet?.startedAt);
  if(!Number.isSafeInteger(now)||packet?.mode!=="recorded-local-worker-build"||packet.completed!==true||packet.passed!==true||
    !Number.isFinite(completed)||!Number.isFinite(started)||completed<started||completed>now||now-completed>3_600_000||
    p?.mode!=="local-worker-patch-build-scan"||p.fullSourceHashTagBound!==true||p.localCandidateTag!==expected.tag||
    p.sourceBuildPerformed!==true||p.runtimePlatform!=="linux/amd64"||p.copiedSourceBuildContext!==true||
    p.candidateDateJst!==expected.dateJst||p.scopeTimezone!=="Asia/Tokyo"||
    p.localCandidateImageId!==expected.imageId||JSON.stringify(p.sourceFingerprint)!==JSON.stringify(expected.sourceFingerprint)||
    p.sourceAndBundleRecheckedAfterScan!==true||p.ownedScannerAbsent!==true||p.temporaryArchiveAndCacheRemoved!==true||
    p.awsCalls!==0||p.cloudMutations!==0||p.imagePushes!==0||p.credentialRetrievals!==0||p.sourceBuildSecretInputsPassed!==false||
    p.scannerDatabaseFresh!==true||p.archiveGatePassed!==true||p.secretScannerEnabled!==true||p.detectedSecrets!==0||
    !p.severityCounts||Object.keys(p.severityCounts).sort().join(",")!=="CRITICAL,HIGH,LOW,MEDIUM,UNKNOWN"||
    Object.values(p.severityCounts).some(v=>!Number.isSafeInteger(v)||v<0||v>10_000)||
    p.severityCounts.UNKNOWN!==0||p.severityCounts.HIGH!==0||p.severityCounts.CRITICAL!==0||
    p.currentApplicationProof?.applicationFilesMatchedCurrentBundle!==true||p.currentApplicationProof?.applicationModuleSha256!==expected.moduleSha256||
    p.currentBaseProof?.reviewedPublicBaseManifestMatched!==true||p.currentBaseProof?.baseLayerDescriptorPrefixMatched!==true||
    p.currentBaseProof?.baseConfigDiffIdPrefixMatched!==true||p.registryPromotionAuthorized!==false||p.readyForDeployment!==false||
    p.readyForExecution!==false||p.readyForPublication!==false||p.rawScannerReportPrinted!==false)fail();
  return {scanCompletedAtUtc:packet.completedAt,severityCounts:{...p.severityCounts},localArchiveScanMatched:true,remoteExecutionAuthorized:false};
}
function currentRuntimeCandidateScan(root,expected) {
  const directory=ownedLocalGateReportDirectory(root),names=readdirSync(directory).filter(n=>/^worker-[a-f0-9-]{36}\.json$/.test(n));
  if(names.length>500)fail();
  for(const name of names){const path=join(directory,name),stat=lstatSync(path);
    if(!stat.isFile()||stat.isSymbolicLink()||realpathSync(path)!==path||stat.size>100_000||stat.size<1)fail();
    const packet=JSON.parse(readFileSync(path,"utf8"));
    if(packet?.proof?.localCandidateTag===expected.tag&&packet?.proof?.sourceFingerprint?.sha256===expected.sourceFingerprint.sha256)
      return verifyFreshRuntimeCandidateScan(packet,expected);
  }
  fail();
}
export function runtimeFixtureProgram(root=process.cwd()) {
  const parts=[];
  for(const name of ["worker-runtime-fixture.mjs","worker-entrypoint-fixture.mjs","worker-process-fixture.mjs"]){
    const path=resolve(root,"scripts/fixtures",name),stat=lstatSync(path);
    if(!stat.isFile()||stat.isSymbolicLink()||realpathSync(path)!==path||stat.size<1||stat.size>18_000)fail();
    parts.push(readFileSync(path,"utf8"));
  }
  const source=parts.join("\n;\n");
  const suffix='\nassert.equal(process.platform,"linux");assert.equal(process.arch,"x64");assert.equal(process.getuid(),65532);assert.equal(process.getgid(),65532);\n'+workerCaTrustProgram()+
    'const facts=await runWorkerRuntimeScenarios(await import("/app/main.mjs"));const entrypoint=runWorkerEntrypointScenarios();const processDeadline=runWorkerProcessDeadlineScenarios();console.log(JSON.stringify({...facts,schemaVersion:5,entrypoint,processDeadline,caTrust,nodeVersion:process.versions.node,platform:process.platform,architecture:process.arch,uid:process.getuid(),gid:process.getgid()}));\n';
  if(source.length+suffix.length>20_000)fail();
  return {program:source+suffix,fixtureSha256:createHash("sha256").update(source).digest("hex")};
}

export async function runWorkerRuntimeSmoke() {
  assertNodeSecurityBaseline();
  const root=resolve(process.cwd()),cli=process.env.GMAI_DOCKER_CLI_PATH;
  if(process.platform!=="win32"||!cli||!isAbsolute(cli)||basename(cli).toLowerCase()!=="docker.exe"||
    !lstatSync(cli).isFile()||lstatSync(cli).isSymbolicLink()||realpathSync(cli)!==cli)fail();
  const sourceTools=await import(pathToFileURL(resolve("scripts/clean-source-build-proof.mjs")).href);
  const patch=await import(pathToFileURL(resolve("scripts/prepare-worker-patch.ts")).href);
  const scan=await import(pathToFileURL(resolve("scripts/scan-live-image-cache.ts")).href);
  const app=await import(pathToFileURL(resolve("scripts/worker-application-proof.ts")).href);
  const baseProof=await import(pathToFileURL(resolve("scripts/worker-base-identity.ts")).href);
  const {collectBackendModuleProof}=await import("./backend-module-proof.mjs");
  const started=Date.now(),sourceFingerprint=sourceTools.fingerprintCurrentSource(),scope=patch.sourceBoundWorkerCandidateScope(started,sourceFingerprint.sha256);
  const tag=patch.sourceBoundWorkerCandidateTag(scope),owner=randomUUID().replaceAll("-",""),name=`gmai-worker-runtime-${owner}`;
  const base=resolve(tmpdir()),physical=realpathSync(base),directory=mkdtempSync(join(base,"gmai-live-image-scan-"));
  const config=join(directory,"docker-config"),archive=join(directory,"image.tar"),env=scan.cacheScanChildEnvironment(process.env,config);
  let attempted=false,packet,ownedImageId;
  const docker=(args,timeout=15_000,cleanup=false)=>{
    const left=180_000-(Date.now()-started);if(!cleanup&&(!Number.isFinite(left)||left<1))fail();
    return spawnSync(cli,["--host",HOST,...args],{env,encoding:"utf8",windowsHide:true,timeout:cleanup?timeout:Math.min(timeout,left),maxBuffer:100_000});
  };
  const out=r=>{if(r.status!==0||r.signal!==null||r.error||typeof r.stdout!=="string")fail();return r.stdout;};
  try {
    if(!scan.safeScanTemporaryDirectory(base,directory,physical))fail();mkdirSync(config);
    writeFileSync(join(config,"config.json"),JSON.stringify({auths:{}}),{flag:"wx"});
    const modules=await collectBackendModuleProof(root);
    if(modules.reports.length!==4||modules.reports.some(r=>!r.inMemoryRebuildMatchedWrittenArtifact||!r.inputBytesRechecked))fail();
    const inspection=JSON.parse(out(docker(["image","inspect","--platform","linux/amd64",tag])));
    out(docker(["image","save","--platform","linux/amd64","--output",archive,tag],30_000));
    const stat=lstatSync(archive);if(!stat.isFile()||stat.isSymbolicLink()||realpathSync(archive)!==archive||stat.size<1||stat.size>256*1024*1024)fail();
    const bytes=readFileSync(archive),verified=patch.verifySourceBoundLocalPatchArchive(bytes,inspection,scope);
    const application=app.verifyWorkerApplicationArchive(bytes,verified.target,app.readCurrentWorkerBundle());
    const scanExpected={tag,imageId:verified.imageId,dateJst:scope.dateJst,sourceFingerprint,moduleSha256:application.applicationModuleSha256};
    const scanReceipt=currentRuntimeCandidateScan(root,scanExpected);
    const files=scan.readBoundedCachedArchiveFiles(bytes);
    baseProof.verifyWorkerBaseMetadata(verified.manifestBytes,files.get(`blobs/sha256/${verified.target.configDigest.slice(7)}`),verified.target);
    const fixture=runtimeFixtureProgram(root);
    ownedImageId=verified.imageId;attempted=true;const id=out(docker(runtimeContainerCreateArguments(verified.imageId,owner,fixture.program))).trim();
    const created=verifyRuntimeContainerIsolation(JSON.parse(out(docker(["container","inspect",name]))),verified.imageId,owner,fixture.program);
    if(created.Id!==id||created.State?.Running!==false||created.State?.Status!=="created")fail();
    const result=validateRuntimeFixtureResult(JSON.parse(out(docker(["container","start","--attach",id],45_000))));
    const stopped=verifyRuntimeContainerIsolation(JSON.parse(out(docker(["container","inspect",id]))),verified.imageId,owner,fixture.program);
    if(stopped.State?.Running!==false||stopped.State?.Status!=="exited"||stopped.State?.ExitCode!==0||stopped.State?.OOMKilled!==false)fail();
    const closingImage=JSON.parse(out(docker(["image","inspect","--platform","linux/amd64",tag])));
    const closing=patch.verifySourceBoundLocalPatchArchive(readFileSync(archive),closingImage,scope);
    app.verifyWorkerApplicationArchive(readFileSync(archive),closing.target,app.readCurrentWorkerBundle());
    if(closing.imageId!==verified.imageId||fixture.fixtureSha256!==runtimeFixtureProgram(root).fixtureSha256||
      JSON.stringify(sourceFingerprint)!==JSON.stringify(sourceTools.fingerprintCurrentSource()))fail();
    patch.verifySourceBoundWorkerCandidateScope(scope,Date.now(),sourceFingerprint.sha256);
    currentRuntimeCandidateScan(root,scanExpected);
    packet={mode:"source-bound-offline-worker-runtime-smoke",sourceFingerprint,candidateDateJst:scope.dateJst,
      localImageId:verified.imageId,configDigest:verified.target.configDigest,fixtureSha256:fixture.fixtureSha256,
      applicationModuleSha256:application.applicationModuleSha256,scanReceipt,containerIsolationVerified:true,containerExitedZero:true,
      result,awsCalls:0,cloudMutations:0,imagePushes:0,credentialsPassed:false,hostMounts:0,network:"none",readyForDeployment:false};
  } finally {
    if(attempted) {
      const current=docker(["container","inspect",name],15_000,true);
      if(current.status===0){const c=verifyRuntimeContainerOwner(JSON.parse(current.stdout),ownedImageId,owner);
        if(c.State?.Running===true)out(docker(["container","stop","--time","5",c.Id],10_000,true));
        out(docker(["container","rm",c.Id],15_000,true));
      }else if(!String(current.stderr).includes(`No such container: ${name}`))fail();
      const absent=docker(["container","inspect",name],15_000,true);
      if(absent.status===0||!String(absent.stderr).includes(`No such container: ${name}`))fail();
    }
    if(!scan.safeScanTemporaryDirectory(base,directory,physical))fail();rmSync(directory,{recursive:true});if(existsSync(directory))fail();
  }
  if(!packet)fail();return {...packet,ownedContainerAbsent:true,temporaryArchiveAndConfigRemoved:true};
}

export function safeWorkerRuntimeResult(value) {
  try {
    const text=JSON.stringify(value);if(typeof text!=="string"||text.length>20_000)return null;
    const p=JSON.parse(text),exact=(v,keys)=>v&&typeof v==="object"&&!Array.isArray(v)&&Object.keys(v).sort().join(",")===keys.slice().sort().join(",");
    const count=(v,max)=>Number.isSafeInteger(v)&&v>=0&&v<=max,hash=v=>typeof v==="string"&&/^[a-f0-9]{64}$/.test(v);
    const yes=["containerIsolationVerified","containerExitedZero","ownedContainerAbsent","temporaryArchiveAndConfigRemoved"],
      no=["credentialsPassed","readyForDeployment"];
    if(!exact(p,["mode","sourceFingerprint","candidateDateJst","localImageId","configDigest","fixtureSha256","applicationModuleSha256","scanReceipt","result",
      "awsCalls","cloudMutations","imagePushes","hostMounts","network",...yes,...no])||
      p.mode!=="source-bound-offline-worker-runtime-smoke"||yes.some(k=>p[k]!==true)||no.some(k=>p[k]!==false)||
      ["awsCalls","cloudMutations","imagePushes","hostMounts"].some(k=>p[k]!==0)||p.network!=="none"||
      !digest(p.localImageId)||!digest(p.configDigest)||!hash(p.fixtureSha256)||!hash(p.applicationModuleSha256)||
      !/^20[0-9]{2}-[0-9]{2}-[0-9]{2}$/.test(p.candidateDateJst)||new Date(`${p.candidateDateJst}T00:00:00Z`).toISOString().slice(0,10)!==p.candidateDateJst)return null;
    const f=p.sourceFingerprint,s=p.scanReceipt;
    if(!exact(f,["files","bytes","sha256"])||!count(f.files,2000)||f.files<1||!count(f.bytes,64_000_000)||f.bytes<1||!hash(f.sha256)||
      !exact(s,["scanCompletedAtUtc","severityCounts","localArchiveScanMatched","remoteExecutionAuthorized"])||
      s.localArchiveScanMatched!==true||s.remoteExecutionAuthorized!==false||typeof s.scanCompletedAtUtc!=="string"||
      new Date(s.scanCompletedAtUtc).toISOString()!==s.scanCompletedAtUtc||
      !exact(s.severityCounts,["UNKNOWN","LOW","MEDIUM","HIGH","CRITICAL"])||Object.values(s.severityCounts).some(v=>!count(v,10000))||
      s.severityCounts.UNKNOWN!==0||s.severityCounts.HIGH!==0||s.severityCounts.CRITICAL!==0)return null;
    validateRuntimeFixtureResult(p.result);return p;
  } catch {return null;}
}

export async function runRecordedRuntimeSmoke(root=process.cwd(),operation=runWorkerRuntimeSmoke) {
  const directory=ownedLocalGateReportDirectory(root),runId=randomUUID(),path=join(directory,`runtime-${runId}.json`);
  const initial={mode:"recorded-worker-runtime-smoke",runId,startedAt:new Date().toISOString(),completed:false,passed:false,rawDetailsSuppressed:true};
  writeFileSync(path,JSON.stringify(initial)+"\n",{flag:"wx"});let proof;
  try{proof=safeWorkerRuntimeResult(await operation());}catch{proof=null;}
  if(ownedLocalGateReportDirectory(root)!==directory||!lstatSync(path).isFile()||lstatSync(path).isSymbolicLink()||realpathSync(path)!==path||readFileSync(path,"utf8")!==JSON.stringify(initial)+"\n")fail();
  const packet={...initial,completed:true,completedAt:new Date().toISOString(),passed:proof!==null,
    ...(proof?{proof}:{error:"WORKER_RUNTIME_SMOKE_INCOMPLETE",independentClosureRequired:true})};
  writeFileSync(path,JSON.stringify(packet)+"\n");return packet;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{const args=process.argv.slice(2);if(!args.length)console.log(JSON.stringify(workerRuntimeSmokePlan()));
    else{if(args.length!==1||args[0]!=="--execute-local-runtime-smoke")fail();const p=await runRecordedRuntimeSmoke();console.log(JSON.stringify(p));if(!p.passed)process.exitCode=1;}}
  catch{console.error(JSON.stringify({error:"WORKER_RUNTIME_SMOKE_INCOMPLETE",rawDetailsSuppressed:true,independentClosureRequired:true,readyForDeployment:false}));process.exitCode=1;}
}
