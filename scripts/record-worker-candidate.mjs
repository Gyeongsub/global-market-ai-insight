import {randomUUID} from "node:crypto";
import {lstatSync,readFileSync,realpathSync,writeFileSync} from "node:fs";
import {join,resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {ownedLocalGateReportDirectory} from "./local-gate-proof.mjs";
import {safeOsVulnerabilityTriage,osTriageFailureReason,osTriageFailureDiagnostic} from "./os-vulnerability-triage.mjs";

const fail=()=>{throw new Error("RECORDED_WORKER_CANDIDATE_INCOMPLETE");};
const exact=(value,keys)=>value&&typeof value==="object"&&!Array.isArray(value)&&Object.keys(value).sort().join(",")===keys.slice().sort().join(",");
const hash=value=>typeof value==="string"&&/^[a-f0-9]{64}$/.test(value);
const digest=value=>typeof value==="string"&&/^sha256:[a-f0-9]{64}$/.test(value);
const count=(value,max)=>Number.isSafeInteger(value)&&value>=0&&value<=max;
const flags=(value,yes,no)=>yes.every(key=>value[key]===true)&&no.every(key=>value[key]===false);

export function recordedWorkerCandidatePlan(args=[]) {
  if(args.length)fail();
  return {mode:"dry-run",awsCalls:0,dockerCalls:0,reportFilesWritten:0,buildsMax:1,localScannersMax:1,
    durableResultOnExplicitExecution:true,callerSelectedTagAllowed:false,imagePushes:0,credentialsPassed:false,
    registryPromotionAuthorized:false,readyForDeployment:false,readyForPublication:false};
}

/** Only the reviewed producer's finite public facts are durable. In particular,
 * a future raw log/path field at any depth fails instead of silently persisting. */
function validateWorkerCandidate(value,requireClean) {
  try {
    const text=JSON.stringify(value);if(typeof text!=="string"||text.length>20_000)return null;
    const p=JSON.parse(text);
    const yes=["sourceBuildPerformed","copiedSourceBuildContext","archiveContentsMatchedToRuntimeManifest","imageConfigArchitectureVerified",
      "exactImageConfigMatched","scannerDatabaseFresh","secretScannerEnabled","existingUserImagesAndCachesPreserved",
      "failedOrSuccessfulCandidateRetainedForInspection","fullSourceHashTagBound","sourceAndBundleRecheckedAfterScan","ownedScannerAbsent","temporaryArchiveAndCacheRemoved"];
    const no=["sourceBuildSecretInputsPassed","provenanceAttestationsGenerated","completeApplicationDependencyScanVerified","currentSourceDeploymentVerified",
      "completeLicenseProvenanceVerified","readyForExecution","readyForPublication","rawScannerReportPrinted","liveImageSourceMismatchResolved","registryPromotionAuthorized","readyForDeployment"];
    const fields=["mode","runtimePlatform","awsCalls","cloudMutations","imagePushes","credentialRetrievals","sourceFingerprint","localCandidateTag",
      "localCandidateImageId","runtimeManifestDigest","imageConfigDigest","archiveBytes","hashedBlobs","osPackagesInspected","severityCounts","detectedSecrets",
      "candidateDateJst","scopeTimezone","currentApplicationProof","currentBaseProof","osVulnerabilityTriage","archiveGatePassed",...yes,...no];
    if(!exact(p,fields)||!flags(p,yes,no)||p.mode!=="local-worker-patch-build-scan"||p.runtimePlatform!=="linux/amd64"||
      ["awsCalls","cloudMutations","imagePushes","credentialRetrievals","detectedSecrets"].some(key=>p[key]!==0)||
      !digest(p.localCandidateImageId)||!digest(p.runtimeManifestDigest)||!digest(p.imageConfigDigest)||
      !count(p.archiveBytes,256*1024*1024)||p.archiveBytes<1||!count(p.hashedBlobs,2000)||p.hashedBlobs<1||
      !count(p.osPackagesInspected,10000)||p.osPackagesInspected<1||p.scopeTimezone!=="Asia/Tokyo")return null;
    const f=p.sourceFingerprint;
    if(!exact(f,["files","bytes","sha256"])||!count(f.files,2000)||f.files<1||!count(f.bytes,64_000_000)||f.bytes<1||!hash(f.sha256)||
      !/^20[0-9]{2}-[0-9]{2}-[0-9]{2}$/.test(p.candidateDateJst)||
      new Date(`${p.candidateDateJst}T00:00:00Z`).toISOString().slice(0,10)!==p.candidateDateJst||
      p.localCandidateTag!==`gmai-worker:local-${p.candidateDateJst.replaceAll("-","")}-s${f.sha256}`)return null;
    const s=p.severityCounts;
    if(!exact(s,["UNKNOWN","LOW","MEDIUM","HIGH","CRITICAL"])||Object.values(s).some(n=>!count(n,5000)))return null;
    const clean=s.UNKNOWN===0&&s.HIGH===0&&s.CRITICAL===0&&p.detectedSecrets===0;
    if(p.archiveGatePassed!==clean||requireClean&&!clean)return null;
    if(!safeOsVulnerabilityTriage(p.osVulnerabilityTriage,p.imageConfigDigest,s,p.osPackagesInspected))return null;
    const a=p.currentApplicationProof,ay=["archiveContentsMatchedToRuntimeManifest","imageConfigArchitectureVerified","applicationFilesMatchedCurrentBundle","finalLayerDiffIdsMatched"],
      an=["applicationLinksWhiteoutsOrPathRedirectionAccepted","archiveExtracted","imageExecuted","fullRootFilesystemOrLicenseProof","completeApplicationDependencyScanVerified","readyForPublication"];
    if(!exact(a,["hashedBlobs","finalApplicationLayers","regularApplicationFiles","applicationModuleBytes","applicationModuleSha256",...ay,...an])||!flags(a,ay,an)||
      a.hashedBlobs!==p.hashedBlobs||a.finalApplicationLayers!==2||a.regularApplicationFiles!==3||
      !count(a.applicationModuleBytes,5_000_000)||a.applicationModuleBytes<1||!hash(a.applicationModuleSha256))return null;
    const b=p.currentBaseProof,by=["reviewedPublicBaseManifestMatched","baseLayerDescriptorPrefixMatched","baseConfigDiffIdPrefixMatched","privateManifestAndConfigHashBound"],
      bn=["laterOverlayContentsVerified","layerBodiesVerifiedByThisFunction","fullRootFilesystemOrLicenseProof","liveAwsTargetBoundByThisFunction","imageExecuted",
        "publisherSignatureVerified","vulnerabilityScanPerformed","completeDistributedNoticesVerified","readyForPublication"];
    if(!exact(b,["baseLayers","laterLayers","publicBasePlatform",...by,...bn])||!flags(b,by,bn)||b.baseLayers!==22||b.laterLayers!==2||b.publicBasePlatform!=="linux/amd64")return null;
    return p;
  } catch {return null;}
}
// A finite blocked observation is not a successful acceptance receipt. Runtime
// consumers must continue using the clean-only validator and passed:true.
export const safeWorkerCandidateResult=value=>validateWorkerCandidate(value,true);
export const safeWorkerCandidateObservation=value=>validateWorkerCandidate(value,false);

async function buildCurrentCandidate() {
  const {prepareWorkerPatch}=await import("./prepare-worker-patch.ts");
  return await prepareWorkerPatch("source-bound-jst");
}

/** Operation injection is for offline unit fixtures only; the CLI has no
 * operation/root/path selector. An interrupted run remains completed:false. */
export async function runRecordedWorkerCandidate(root=process.cwd(),operation=buildCurrentCandidate) {
  const directory=ownedLocalGateReportDirectory(root),runId=randomUUID(),path=join(directory,`worker-${runId}.json`);
  const initial={mode:"recorded-local-worker-build",runId,startedAt:new Date().toISOString(),completed:false,passed:false,
    rawDetailsSuppressed:true,independentLocalClosureRequired:true};
  writeFileSync(path,JSON.stringify(initial)+"\n",{flag:"wx"});let proof=null,failureReason="producer-result",diagnostic=null;
  try {proof=safeWorkerCandidateObservation(await operation());} catch(error) { failureReason=osTriageFailureReason(error);diagnostic=osTriageFailureDiagnostic(error); }
  if(ownedLocalGateReportDirectory(root)!==directory||!lstatSync(path).isFile()||lstatSync(path).isSymbolicLink()||
    realpathSync(path)!==path||readFileSync(path,"utf8")!==JSON.stringify(initial)+"\n")fail();
  const passed=proof!==null&&proof.archiveGatePassed===true;
  const packet={...initial,completed:true,completedAt:new Date().toISOString(),passed,
    ...(proof?{proof,...(!passed?{error:"WORKER_IMAGE_SCAN_BLOCKED",failureReason:"image-scan-blocked"}:{})}:
      {error:"RECORDED_WORKER_CANDIDATE_INCOMPLETE",failureReason,...(diagnostic?{diagnostic}:{})})};
  writeFileSync(path,JSON.stringify(packet)+"\n");return packet;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try {const args=process.argv.slice(2);
    if(!args.length)console.log(JSON.stringify(recordedWorkerCandidatePlan()));
    else {if(args.length!==1||args[0]!=="--execute-source-bound-local-build-scan")fail();
      const packet=await runRecordedWorkerCandidate();console.log(JSON.stringify(packet));if(!packet.passed)process.exitCode=1;}}
  catch {console.error(JSON.stringify({error:"RECORDED_WORKER_CANDIDATE_INCOMPLETE",rawDetailsSuppressed:true,independentLocalClosureRequired:true}));process.exitCode=1;}
}
