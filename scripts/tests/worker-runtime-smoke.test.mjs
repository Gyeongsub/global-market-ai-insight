import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import test from "node:test";
import {mkdtempSync,readFileSync,readdirSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {workerProcessDeadlineResult} from "./fixtures/worker-session-results.mjs";
import {workerRuntimeSmokePlan,runtimeContainerCreateArguments,verifyRuntimeContainerOwner,verifyRuntimeContainerIsolation,
  validateRuntimeFixtureResult,runtimeFixtureProgram,verifyFreshRuntimeCandidateScan,safeWorkerRuntimeResult,runRecordedRuntimeSmoke} from "../worker-runtime-smoke.mjs";
const image=`sha256:${"a".repeat(64)}`,scope="b".repeat(32),program="SYNTHETIC_NONEXECUTABLE_PROGRAM";
function container(){return [{Id:"c".repeat(64),Name:`/gmai-worker-runtime-${scope}`,Config:{Image:image,Labels:{"com.gmai.operator":"gmai-worker-runtime-proof","com.gmai.scope":scope},
  User:"65532:65532",WorkingDir:"/app",Entrypoint:["/nodejs/bin/node"],Cmd:["--input-type=module","--eval",program],Env:["NODE_ENV=production"]},
  HostConfig:{NetworkMode:"none",ReadonlyRootfs:true,CapDrop:["ALL"],SecurityOpt:["no-new-privileges"],Privileged:false,PidsLimit:64,Memory:268435456,NanoCpus:500000000,
    Binds:null,Mounts:[],PortBindings:{},Tmpfs:{"/tmp":"rw,noexec,nosuid,size=16m"}}}];}
function result(){return {schemaVersion:5,mode:"offline-worker-runtime-fixture",normalCases:30,negativeCases:15,totalCases:45,mockedProviderRequests:43,mockedModelRequests:20,
  realProviderRequests:0,realModelRequests:0,awsCalls:0,realDataCoverageClaimed:false,remoteCancellationOrBillingAcceptanceClaimed:false,
  platform:"linux",architecture:"x64",uid:65532,gid:65532,nodeVersion:"22.23.4",
  caTrust:{defaultRoots:148,blockedRootFingerprintsAbsent:true,defaultStoreMatchesBundled:true},
  processDeadline:workerProcessDeadlineResult(),entrypoint:{schemaVersion:1,mode:"offline-worker-entrypoint-fixture",normalCases:6,negativeCases:12,totalCases:18,childProcessesStarted:18,
    maxConcurrentChildren:1,childTimeoutMs:5000,sequenceBudgetMs:25000,allChildrenExited:true,processOutputsSanitized:true,
    credentialFieldsPassed:false,awsCalls:0,realProviderRequests:0,realModelRequests:0}};}
function scan(){const expected={tag:`gmai-worker:local-20261018-s${"d".repeat(64)}`,imageId:image,dateJst:"2026-10-18",sourceFingerprint:{files:1,bytes:1,sha256:"d".repeat(64)},moduleSha256:"e".repeat(64)};
  const packet={mode:"recorded-local-worker-build",completed:true,passed:true,startedAt:"2026-10-18T00:00:00Z",completedAt:"2026-10-18T00:01:00Z",proof:{
    mode:"local-worker-patch-build-scan",sourceBuildPerformed:true,runtimePlatform:"linux/amd64",copiedSourceBuildContext:true,fullSourceHashTagBound:true,localCandidateTag:expected.tag,
    candidateDateJst:expected.dateJst,scopeTimezone:"Asia/Tokyo",localCandidateImageId:image,sourceFingerprint:expected.sourceFingerprint,sourceAndBundleRecheckedAfterScan:true,
    ownedScannerAbsent:true,temporaryArchiveAndCacheRemoved:true,awsCalls:0,cloudMutations:0,imagePushes:0,credentialRetrievals:0,sourceBuildSecretInputsPassed:false,
    scannerDatabaseFresh:true,archiveGatePassed:true,secretScannerEnabled:true,detectedSecrets:0,severityCounts:{UNKNOWN:0,LOW:8,MEDIUM:23,HIGH:0,CRITICAL:0},
    currentApplicationProof:{applicationFilesMatchedCurrentBundle:true,applicationModuleSha256:expected.moduleSha256},currentBaseProof:{reviewedPublicBaseManifestMatched:true,
      baseLayerDescriptorPrefixMatched:true,baseConfigDiffIdPrefixMatched:true},registryPromotionAuthorized:false,readyForDeployment:false,readyForExecution:false,readyForPublication:false,rawScannerReportPrinted:false}};
  return {packet,expected,now:Date.parse("2026-10-18T00:02:00Z")};
}
test("runtime operator default and import do not create a Docker container or write a receipt",()=>{
  const p=workerRuntimeSmokePlan();assert.equal(p.dockerCalls,0);assert.equal(p.containersCreated,0);assert.equal(p.awsCalls,0);
  assert.equal(p.callerSelectedImageAllowed,false);assert.equal(p.currentCleanArchiveScanRequired,true);assert.throws(()=>workerRuntimeSmokePlan(["PRIVATE_SENTINEL"]));
  for(const args of [[],["--image","PRIVATE_SENTINEL"]]){const r=spawnSync(process.execPath,["scripts/worker-runtime-smoke.mjs",...args],{encoding:"utf8",timeout:10000,windowsHide:true});
    assert.equal(r.status,args.length?1:0);assert.equal((r.stdout+r.stderr).includes("PRIVATE_SENTINEL"),false);}
  const inert=spawnSync(process.execPath,["--input-type=module","-e",'await import("./scripts/worker-runtime-smoke.mjs");console.log("INERT");'],{encoding:"utf8",timeout:10000,windowsHide:true});
  assert.equal(inert.status,0);assert.equal(inert.stdout.trim(),"INERT");
});
test("container arguments fix one nonroot read-only no-network process with no credential, source or socket mount",()=>{
  const args=runtimeContainerCreateArguments(image,scope,program),text=JSON.stringify(args);
  assert.equal(args[0],"container");assert.equal(args[1],"create");assert.ok(text.includes('"--network","none"'));
  assert.ok(args.includes("--read-only"));assert.ok(args.includes("no-new-privileges"));assert.ok(args.includes(image));
  for(const flag of ["--mount","--volume","--env","--env-file","--publish","--privileged"])assert.equal(args.includes(flag),false);
  for(const [a,b,c] of [["foreign:latest",scope,program],[image,"PRIVATE_SENTINEL",program],[image,scope,"x\0y"],[image,scope,"x".repeat(20001)]])
    assert.throws(()=>runtimeContainerCreateArguments(a,b,c));
});
test("exact random ownership is separate from isolation acceptance and never adopts a foreign container",()=>{
  assert.equal(verifyRuntimeContainerOwner(container(),image,scope).Id,"c".repeat(64));
  for(const mutate of [c=>c.Name="/foreign",c=>c.Id="bad",c=>c.Config.Image="foreign:latest",c=>c.Config.Labels["com.gmai.scope"]="d".repeat(32),
    c=>c.Config.Labels["com.gmai.operator"]="foreign"]){const c=container();mutate(c[0]);assert.throws(()=>verifyRuntimeContainerOwner(c,image,scope));}
});
test("network, mounts, writable root, privilege, limits, user, command and secret environment deviations fail before start",()=>{
  assert.ok(verifyRuntimeContainerIsolation(container(),image,scope,program));
  for(const mutate of [c=>c.HostConfig.NetworkMode="bridge",c=>c.HostConfig.ReadonlyRootfs=false,c=>c.HostConfig.Privileged=true,c=>c.HostConfig.CapDrop=[],
    c=>c.HostConfig.SecurityOpt=[],c=>c.HostConfig.PidsLimit=0,c=>c.HostConfig.Memory=0,c=>c.HostConfig.NanoCpus=0,c=>c.HostConfig.Binds=["PRIVATE_SENTINEL"],
    c=>c.HostConfig.Mounts=[{}],c=>c.HostConfig.PortBindings={"80/tcp":[{}]},c=>c.HostConfig.Tmpfs={"/tmp":"rw"},c=>c.Config.User="root",
    c=>c.Config.WorkingDir="/",c=>c.Config.Entrypoint=["sh"],c=>c.Config.Cmd=["PRIVATE_SENTINEL"],c=>c.Config.Env.push("AWS_"+"SESSION_TOKEN=PRIVATE_SENTINEL"),
    c=>c.Config.Env.push(["GH","TOKEN"].join("_")+"=PRIVATE_SENTINEL"),c=>c.Config.Env.push(["GITHUB","TOKEN"].join("_")+"=PRIVATE_SENTINEL")]){
    const c=container();mutate(c[0]);assert.throws(()=>verifyRuntimeContainerIsolation(c,image,scope,program));}
});
test("only exact Linux Node 22 facts and synthetic bounded call counts can become a runtime result",()=>{
  assert.deepEqual(validateRuntimeFixtureResult(result()),result());
  for(const mutate of [p=>p.uid=0,p=>p.gid=0,p=>p.nodeVersion="24.0.0",p=>p.platform="win32",p=>p.architecture="arm64",p=>p.totalCases=38,
    p=>p.realProviderRequests=1,p=>p.mockedModelRequests=18,p=>p.rawResponse="PRIVATE_SENTINEL",p=>p.remoteCancellationOrBillingAcceptanceClaimed=true,
    p=>p.schemaVersion=1,p=>p.schemaVersion=2,p=>p.schemaVersion=3,p=>p.negativeCases=11,p=>p.totalCases=41,p=>delete p.entrypoint,p=>p.entrypoint.rawLog="PRIVATE_SENTINEL",p=>p.entrypoint.totalCases=17,
    p=>delete p.processDeadline,p=>p.processDeadline.productionCeilingMs=300001,p=>p.processDeadline.allChildrenExited=false,
    p=>p.processDeadline.privateOutputReturned=true,p=>p.processDeadline.retainedIoCases=1,p=>p.processDeadline.extra="PRIVATE_SENTINEL",
    p=>p.entrypoint.credentialFieldsPassed=true,p=>p.entrypoint.childTimeoutMs=6000,p=>p.entrypoint.maxConcurrentChildren=2,p=>p.entrypoint.allChildrenExited=false]){
    const p=result();mutate(p);assert.throws(()=>validateRuntimeFixtureResult(p));}
});

test("historical and forged certificate trust receipts cannot clear current runtime acceptance",()=>{
  for(const mutate of [p=>p.schemaVersion=4,p=>p.nodeVersion="22.23.3",p=>delete p.caTrust,
    p=>p.caTrust={defaultRoots:148,blockedRootFingerprintsAbsent:false,defaultStoreMatchesBundled:true},
    p=>p.caTrust={defaultRoots:148,blockedRootFingerprintsAbsent:true,defaultStoreMatchesBundled:false},
    p=>p.caTrust={defaultRoots:0,blockedRootFingerprintsAbsent:true,defaultStoreMatchesBundled:true},
    p=>p.caTrust={defaultRoots:148,blockedRootFingerprintsAbsent:true,defaultStoreMatchesBundled:true,raw:"PRIVATE"}]){
    const p=result();mutate(p);assert.throws(()=>validateRuntimeFixtureResult(p));
  }
});
test("one-hour exact current source/image/module scan is required without waiving MEDIUM or LOW",()=>{
  const {packet,expected,now}=scan(),p=verifyFreshRuntimeCandidateScan(packet,expected,now);
  assert.equal(p.localArchiveScanMatched,true);assert.equal(p.remoteExecutionAuthorized,false);assert.equal(p.severityCounts.MEDIUM,23);
  assert.throws(()=>verifyFreshRuntimeCandidateScan(packet,expected,Date.parse(packet.completedAt)-1));
  assert.throws(()=>verifyFreshRuntimeCandidateScan(packet,expected,Date.parse(packet.completedAt)+3_600_001));
  for(const mutate of [p=>p.passed=false,p=>p.completed=false,p=>p.proof.localCandidateImageId=`sha256:${"f".repeat(64)}`,p=>p.proof.fullSourceHashTagBound=false,
    p=>p.proof.sourceFingerprint.sha256="f".repeat(64),p=>p.proof.severityCounts.HIGH=1,p=>p.proof.severityCounts.UNKNOWN=1,p=>p.proof.detectedSecrets=1,
    p=>p.proof.scannerDatabaseFresh=false,p=>p.proof.currentApplicationProof.applicationFilesMatchedCurrentBundle=false,p=>p.proof.readyForExecution=true]){
    const p=structuredClone(packet);mutate(p);assert.throws(()=>verifyFreshRuntimeCandidateScan(p,expected,now));}
});
test("only fixed inert fixture bytes are passed as a bounded program, never a user-selected executable path",()=>{
  const fixture=runtimeFixtureProgram();assert.match(fixture.fixtureSha256,/^[a-f0-9]{64}$/);assert.ok(fixture.program.length<20000);
  assert.match(fixture.program,/await import\("\/app\/main\.mjs"\)/);assert.match(fixture.program,/assert.equal\(process.platform,"linux"\)/);
  assert.match(fixture.program,/runWorkerEntrypointScenarios\(\)/);
  const syntax=spawnSync(process.execPath,["--check","--input-type=module"],{input:fixture.program,encoding:"utf8",timeout:10000,windowsHide:true});
  assert.equal(syntax.status,0);assert.equal(syntax.stderr,"");
  assert.throws(()=>runtimeFixtureProgram("missing-root"));
});

function runtimeProof(){return {mode:"source-bound-offline-worker-runtime-smoke",sourceFingerprint:{files:1,bytes:1,sha256:"a".repeat(64)},candidateDateJst:"2026-10-18",
  localImageId:image,configDigest:image,fixtureSha256:"b".repeat(64),applicationModuleSha256:"c".repeat(64),
  scanReceipt:{scanCompletedAtUtc:"2026-10-18T00:01:00.000Z",severityCounts:{UNKNOWN:0,LOW:8,MEDIUM:23,HIGH:0,CRITICAL:0},localArchiveScanMatched:true,remoteExecutionAuthorized:false},
  containerIsolationVerified:true,containerExitedZero:true,result:result(),awsCalls:0,cloudMutations:0,imagePushes:0,credentialsPassed:false,hostMounts:0,
  network:"none",readyForDeployment:false,ownedContainerAbsent:true,temporaryArchiveAndConfigRemoved:true};}
function journalRoot(){const r=mkdtempSync(join(tmpdir(),"gmai-local-gate-tests-"));writeFileSync(join(r,".gitignore"),"outputs/\n");return r;}
test("runtime journals accept only cloned finite public facts, never raw nested fields or incomplete cleanup",()=>{
  const source=runtimeProof(),safe=safeWorkerRuntimeResult(source);assert.deepEqual(safe,source);source.result.totalCases=0;assert.equal(safe.result.totalCases,45);
  for(const mutate of [p=>p.privatePath="PRIVATE_SENTINEL",p=>p.sourceFingerprint.path="PRIVATE_SENTINEL",p=>p.scanReceipt.rawLog="PRIVATE_SENTINEL",
    p=>p.scanReceipt.severityCounts.raw="PRIVATE_SENTINEL",p=>p.result.raw="PRIVATE_SENTINEL",p=>p.ownedContainerAbsent=false,
    p=>p.temporaryArchiveAndConfigRemoved=false,p=>p.credentialsPassed=true,p=>p.hostMounts=1,p=>p.network="bridge",p=>p.readyForDeployment=true,
    p=>p.scanReceipt.remoteExecutionAuthorized=true,p=>p.scanReceipt.severityCounts.HIGH=1,p=>p.scanReceipt.scanCompletedAtUtc="PRIVATE_SENTINEL",
    p=>p.sourceFingerprint.sha256="PRIVATE_SENTINEL",p=>p.candidateDateJst="2026-02-30"]){const p=runtimeProof();mutate(p);assert.equal(safeWorkerRuntimeResult(p),null);}
});
test("one runtime execution has a completed independently readable receipt without replacing old evidence",async()=>{
  const r=journalRoot();try{let calls=0;const p=await runRecordedRuntimeSmoke(r,async()=>{calls++;return runtimeProof();});
    assert.equal(calls,1);assert.equal(p.passed,true);assert.equal(p.completed,true);
    const directory=join(r,"outputs/local-gates"),first=readdirSync(directory)[0];assert.deepEqual(JSON.parse(readFileSync(join(directory,first),"utf8")),p);
    await runRecordedRuntimeSmoke(r,async()=>runtimeProof());assert.equal(readdirSync(directory).length,2);
    assert.deepEqual(JSON.parse(readFileSync(join(directory,first),"utf8")),p);
  }finally{rmSync(r,{recursive:true});}
});
test("failed, private or unclean runtime results never become a success or persist exception contents",async()=>{
  const r=journalRoot();try{for(const operation of [async()=>{throw new Error("PRIVATE_SENTINEL");},async()=>({...runtimeProof(),ownedContainerAbsent:false}),
    async()=>({...runtimeProof(),raw:"PRIVATE_SENTINEL"})]){
    const p=await runRecordedRuntimeSmoke(r,operation);assert.equal(p.passed,false);assert.equal(p.proof,undefined);assert.equal(p.independentClosureRequired,true);
    assert.equal(JSON.stringify(p).includes("PRIVATE_SENTINEL"),false);
  }}finally{rmSync(r,{recursive:true});}
});
test("altered incomplete runtime journal cannot be overwritten by producer success",async()=>{
  const r=journalRoot();try{await assert.rejects(runRecordedRuntimeSmoke(r,async()=>{
    const directory=join(r,"outputs/local-gates"),path=join(directory,readdirSync(directory)[0]);const p=JSON.parse(readFileSync(path,"utf8"));
    assert.equal(p.completed,false);writeFileSync(path,JSON.stringify({...p,unexpected:true}));return runtimeProof();
  }),/WORKER_RUNTIME_SMOKE_INCOMPLETE/);
  const directory=join(r,"outputs/local-gates"),p=JSON.parse(readFileSync(join(directory,readdirSync(directory)[0]),"utf8"));assert.equal(p.completed,false);
  }finally{rmSync(r,{recursive:true});}
});
