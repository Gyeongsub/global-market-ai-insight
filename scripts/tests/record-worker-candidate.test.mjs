import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {mkdtempSync,readFileSync,readdirSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import test from "node:test";
import {recordedWorkerCandidatePlan,runRecordedWorkerCandidate,safeWorkerCandidateResult,safeWorkerCandidateObservation} from "../record-worker-candidate.mjs";
import {workerOsTriage} from "./fixtures/worker-session-results.mjs";

function fixture(){const sha="a".repeat(64),id=`sha256:${"b".repeat(64)}`;
  return {mode:"local-worker-patch-build-scan",sourceBuildPerformed:true,runtimePlatform:"linux/amd64",awsCalls:0,cloudMutations:0,imagePushes:0,
    credentialRetrievals:0,sourceBuildSecretInputsPassed:false,provenanceAttestationsGenerated:false,
    sourceFingerprint:{files:1,bytes:1,sha256:sha},copiedSourceBuildContext:true,localCandidateTag:`gmai-worker:local-20261018-s${sha}`,
    localCandidateImageId:id,runtimeManifestDigest:id,imageConfigDigest:id,archiveBytes:1024,archiveContentsMatchedToRuntimeManifest:true,
    imageConfigArchitectureVerified:true,hashedBlobs:26,exactImageConfigMatched:true,scannerDatabaseFresh:true,osPackagesInspected:14,
    severityCounts:{UNKNOWN:0,LOW:8,MEDIUM:23,HIGH:0,CRITICAL:0},osVulnerabilityTriage:workerOsTriage(),detectedSecrets:0,archiveGatePassed:true,secretScannerEnabled:true,
    completeApplicationDependencyScanVerified:false,currentSourceDeploymentVerified:false,completeLicenseProvenanceVerified:false,
    readyForExecution:false,readyForPublication:false,rawScannerReportPrinted:false,existingUserImagesAndCachesPreserved:true,
    failedOrSuccessfulCandidateRetainedForInspection:true,candidateDateJst:"2026-10-18",scopeTimezone:"Asia/Tokyo",fullSourceHashTagBound:true,
    currentApplicationProof:{archiveContentsMatchedToRuntimeManifest:true,imageConfigArchitectureVerified:true,hashedBlobs:26,
      finalApplicationLayers:2,regularApplicationFiles:3,applicationModuleBytes:1,applicationModuleSha256:"c".repeat(64),applicationFilesMatchedCurrentBundle:true,
      finalLayerDiffIdsMatched:true,applicationLinksWhiteoutsOrPathRedirectionAccepted:false,archiveExtracted:false,imageExecuted:false,
      fullRootFilesystemOrLicenseProof:false,completeApplicationDependencyScanVerified:false,readyForPublication:false},
    currentBaseProof:{reviewedPublicBaseManifestMatched:true,baseLayerDescriptorPrefixMatched:true,baseConfigDiffIdPrefixMatched:true,
      baseLayers:22,laterLayers:2,publicBasePlatform:"linux/amd64",privateManifestAndConfigHashBound:true,laterOverlayContentsVerified:false,
      layerBodiesVerifiedByThisFunction:false,fullRootFilesystemOrLicenseProof:false,liveAwsTargetBoundByThisFunction:false,imageExecuted:false,
      publisherSignatureVerified:false,vulnerabilityScanPerformed:false,completeDistributedNoticesVerified:false,readyForPublication:false},
    sourceAndBundleRecheckedAfterScan:true,liveImageSourceMismatchResolved:false,registryPromotionAuthorized:false,readyForDeployment:false,
    ownedScannerAbsent:true,temporaryArchiveAndCacheRemoved:true};}

function root(){const value=mkdtempSync(join(tmpdir(),"gmai-local-gate-tests-"));writeFileSync(join(value,".gitignore"),"outputs/\n");return value;}
test("a counts-only historical scan cannot clear current remediation evidence",()=>{
  const p=fixture(); delete p.osVulnerabilityTriage; assert.equal(safeWorkerCandidateResult(p),null);
});
test("a valid HIGH DSA observation is durable but never successful or usable for runtime acceptance",async()=>{
  const p=fixture(),t=p.osVulnerabilityTriage;p.severityCounts.HIGH=1;p.archiveGatePassed=false;t.severityCounts.HIGH=1;
  t.matches.unshift({vulnerabilityId:"DSA-6572-1",packageName:"ca-certificates",installedVersion:"20250419",
    fixedVersion:"20250419+deb13u1",severity:"HIGH",status:"fixed"});t.matchesWithAdvertisedFix=1;
  assert.deepEqual(safeWorkerCandidateObservation(p),p);assert.equal(safeWorkerCandidateResult(p),null);
  const r=root();try{const result=await runRecordedWorkerCandidate(r,async()=>p);
    assert.equal(result.completed,true);assert.equal(result.passed,false);assert.equal(result.error,"WORKER_IMAGE_SCAN_BLOCKED");
    assert.deepEqual(result.proof,p);assert.equal(result.proof.readyForDeployment,false);
    const impossible=structuredClone(p);impossible.archiveGatePassed=true;assert.equal(safeWorkerCandidateObservation(impossible),null);
  }finally{rmSync(r,{recursive:true});}
});
test("recorded image plan and import do not load the TS producer or create a receipt",()=>{
  const p=recordedWorkerCandidatePlan();assert.equal(p.dockerCalls,0);assert.equal(p.reportFilesWritten,0);assert.equal(p.imagePushes,0);
  assert.throws(()=>recordedWorkerCandidatePlan(["PRIVATE_SENTINEL"]));
  for(const args of [[],["--image","PRIVATE_SENTINEL"]]){
    const r=spawnSync(process.execPath,["scripts/record-worker-candidate.mjs",...args],{encoding:"utf8",timeout:10000,windowsHide:true});
    assert.equal(r.status,args.length?1:0);assert.equal((r.stdout+r.stderr).includes("PRIVATE_SENTINEL"),false);
    if(!args.length)assert.deepEqual(JSON.parse(r.stdout),p);
  }
  const r=spawnSync(process.execPath,["--input-type=module","-e",'await import("./scripts/record-worker-candidate.mjs");console.log("INERT");'],
    {encoding:"utf8",timeout:10000,windowsHide:true});assert.equal(r.status,0);assert.equal(r.stdout.trim(),"INERT");
});
test("exact public producer facts are cloned and preserve MEDIUM/LOW findings without granting deployment",()=>{
  const input=fixture(),p=safeWorkerCandidateResult(input);assert.deepEqual(p,input);input.severityCounts.LOW=9;
  assert.equal(p.severityCounts.LOW,8);assert.equal(p.severityCounts.MEDIUM,23);assert.equal(p.readyForDeployment,false);
});
test("unknown nested fields, bad identities, elevated findings and missing cleanup fail closed",()=>{
  for(const mutate of [p=>p.rawLog="PRIVATE_SENTINEL",p=>p.sourceFingerprint.path="PRIVATE_SENTINEL",p=>p.severityCounts.raw="PRIVATE_SENTINEL",
    p=>p.currentApplicationProof.path="PRIVATE_SENTINEL",p=>p.currentBaseProof.privateArn="PRIVATE_SENTINEL",p=>p.archiveBytes=0,
    p=>p.sourceFingerprint.files=0,p=>p.sourceFingerprint.bytes=64_000_001,p=>p.sourceFingerprint.sha256="b".repeat(64),
    p=>p.candidateDateJst="2026-02-30",p=>p.localCandidateTag="foreign:latest",p=>p.localCandidateImageId="PRIVATE_SENTINEL",
    p=>p.severityCounts.HIGH=1,p=>p.severityCounts.CRITICAL=1,p=>p.severityCounts.UNKNOWN=1,p=>p.severityCounts.MEDIUM=-1,
    p=>p.detectedSecrets=1,p=>p.awsCalls=1,p=>p.imagePushes=1,p=>p.credentialRetrievals=1,p=>p.scannerDatabaseFresh=false,
    p=>p.ownedScannerAbsent=false,p=>p.temporaryArchiveAndCacheRemoved=false,p=>p.readyForExecution=true,p=>p.readyForDeployment=true,
    p=>p.currentApplicationProof.imageExecuted=true,p=>p.currentApplicationProof.hashedBlobs=25,p=>p.currentBaseProof.baseLayers=21,
    p=>p.currentBaseProof.readyForPublication=true]){const p=fixture();mutate(p);assert.equal(safeWorkerCandidateResult(p),null);}
  for(const value of [null,undefined,"PRIVATE_SENTINEL",{toJSON(){throw new Error("PRIVATE_SENTINEL");}}])assert.equal(safeWorkerCandidateResult(value),null);
});
test("exactly one producer call writes a durable independently readable journal without old evidence overwrite",async()=>{
  const r=root();try{let calls=0;const before=fixture();const p=await runRecordedWorkerCandidate(r,async()=>{calls++;return before;});
    assert.equal(calls,1);assert.equal(p.completed,true);assert.equal(p.passed,true);assert.deepEqual(p.proof,before);
    const directory=join(r,"outputs/local-gates"),first=readdirSync(directory)[0];assert.deepEqual(JSON.parse(readFileSync(join(directory,first),"utf8")),p);
    await runRecordedWorkerCandidate(r,async()=>fixture());assert.equal(readdirSync(directory).length,2);
    assert.deepEqual(JSON.parse(readFileSync(join(directory,first),"utf8")),p);
  }finally{rmSync(r,{recursive:true});}
});
test("private failures or incomplete success retain a failed receipt and never their raw error",async()=>{
  const r=root();try{for(const operation of [async()=>{throw new Error("PRIVATE_SENTINEL");},async()=>({...fixture(),ownedScannerAbsent:false}),
    async()=>({...fixture(),privatePath:"PRIVATE_SENTINEL"})]){
    const p=await runRecordedWorkerCandidate(r,operation);assert.equal(p.completed,true);assert.equal(p.passed,false);assert.equal(p.proof,undefined);
    assert.equal(p.independentLocalClosureRequired,true);assert.equal(JSON.stringify(p).includes("PRIVATE_SENTINEL"),false);
  }}finally{rmSync(r,{recursive:true});}
});
test("changed initial journal is never replaced with a success claim",async()=>{
  const r=root();try{await assert.rejects(runRecordedWorkerCandidate(r,async()=>{
    const directory=join(r,"outputs/local-gates"),path=join(directory,readdirSync(directory)[0]);
    const p=JSON.parse(readFileSync(path,"utf8"));assert.equal(p.completed,false);assert.equal(p.passed,false);
    writeFileSync(path,JSON.stringify({...p,unexpected:"PRIVATE_SENTINEL"}));return fixture();
  }),/RECORDED_WORKER_CANDIDATE_INCOMPLETE/);
    const directory=join(r,"outputs/local-gates"),p=JSON.parse(readFileSync(join(directory,readdirSync(directory)[0]),"utf8"));assert.equal(p.completed,false);
  }finally{rmSync(r,{recursive:true});}
});
