import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import test from "node:test";
import { prepareWorkerPatchPlan, verifyLocalPatchArchive, currentWorkerCandidatePlan, currentWorkerCandidateTag, october16WorkerCandidatePlan, october16WorkerCandidateTag } from "../prepare-worker-patch.js";
import { localPatchFixture, makeTar } from "./fixtures/local-patch-archive-fixture.js";
import { october17WorkerCandidatePlan, october17WorkerCandidateTag } from "../prepare-worker-patch.js";
import { sourceBoundWorkerCandidateScope, sourceBoundWorkerCandidateTag, sourceBoundWorkerCandidatePlan,
  verifySourceBoundWorkerCandidateScope, verifySourceBoundLocalPatchArchive } from "../prepare-worker-patch.js";

test("current local candidate binds the Tokyo date and entire source hash without changing historical scopes", () => {
  const hash = "a".repeat(64), now = Date.parse("2026-10-17T15:00:00Z");
  const scope = sourceBoundWorkerCandidateScope(now, hash), tag = sourceBoundWorkerCandidateTag(scope);
  assert.equal(scope.dateJst,"2026-10-18"); assert.equal(Object.isFrozen(scope),true);
  assert.equal(tag,`gmai-worker:local-20261018-s${hash}`);
  verifySourceBoundWorkerCandidateScope(scope, Date.parse("2026-10-18T14:59:59Z"),hash);
  for (const closing of [Date.parse("2026-10-17T14:59:59Z"),Date.parse("2026-10-18T15:00:00Z")])
    assert.throws(()=>verifySourceBoundWorkerCandidateScope(scope,closing,hash),/PATCH_SOURCE_BOUND_SCOPE_CHANGED/);
  assert.throws(()=>verifySourceBoundWorkerCandidateScope(scope,now,"b".repeat(64)),/PATCH_SOURCE_BOUND_SCOPE_CHANGED/);
  assert.throws(()=>october17WorkerCandidateTag(now),/PATCH_OCTOBER17_SCOPE_EXPIRED/);
});

test("source-bound scope rejects invalid dates, private inputs, extra keys and abbreviated hashes", () => {
  for(const now of [NaN,Infinity,-1,Number.MAX_SAFE_INTEGER,Date.parse("2100-01-01T00:00:00Z")])
    assert.throws(()=>sourceBoundWorkerCandidateScope(now,"a".repeat(64)),/PATCH_SOURCE_BOUND_SCOPE_INVALID/);
  for(const hash of ["PRIVATE_SENTINEL","a".repeat(63),"A".repeat(64),"a".repeat(65)])
    assert.throws(()=>sourceBoundWorkerCandidateScope(Date.parse("2026-10-18T00:00:00Z"),hash));
  for(const value of [{dateJst:"2026-02-30",sourceSha256:"a".repeat(64)},
    {dateJst:"2026-10-18",sourceSha256:"a".repeat(64),tag:"PRIVATE_SENTINEL"},null])
    assert.throws(()=>sourceBoundWorkerCandidateTag(value as any),/PATCH_SOURCE_BOUND_SCOPE_INVALID/);
});

test("new local namespace has its own content verifier and never extends the historical tag allowlist", () => {
  const scope=sourceBoundWorkerCandidateScope(Date.parse("2026-10-18T00:00:00Z"),"c".repeat(64));
  const input=localPatchFixture(),tag=sourceBoundWorkerCandidateTag(scope);
  assert.throws(()=>verifySourceBoundLocalPatchArchive(input.bytes,input.image,scope),/PATCH_LOCAL_IMAGE_INVALID/);
  input.image[0].RepoTags=[tag];
  assert.equal(verifySourceBoundLocalPatchArchive(input.bytes,input.image,scope).target.reference,tag);
  assert.throws(()=>verifyLocalPatchArchive(input.bytes,input.image,tag),/PATCH_CANDIDATE_TAG_UNREVIEWED/);
  assert.throws(()=>verifySourceBoundLocalPatchArchive(input.bytes,input.image,{...scope,sourceSha256:"d".repeat(64)}),/PATCH_LOCAL_IMAGE_INVALID/);
});

test("source-bound plan is zero-action with no caller-selected target, clock override or promotion permission", () => {
  const p=sourceBoundWorkerCandidatePlan();
  assert.equal(p.awsCalls,0);assert.equal(p.imagePushes,0);assert.equal(p.credentialRetrievals,0);
  assert.equal(p.callerSelectedTagAllowed,false);assert.equal(p.registryPromotionAuthorized,false);
  assert.equal(p.dayAndSourceClosingRecheckRequired,true);assert.equal(p.fullCurrentSourceHashInLocalTag,true);
  assert.throws(()=>sourceBoundWorkerCandidatePlan(["--tag","PRIVATE_SENTINEL"]));
  for(const extra of [[],["PRIVATE_SENTINEL"]]) {
    const r=spawnSync(process.execPath,["--import","tsx",resolve("scripts/prepare-worker-patch.ts"),"--plan-source-bound-candidate",...extra],
      {encoding:"utf8",windowsHide:true,timeout:10000});
    assert.equal(r.status,extra.length?1:0);assert.equal((r.stdout+r.stderr).includes("PRIVATE_SENTINEL"),false);
    if(!extra.length) assert.deepEqual(JSON.parse(r.stdout),p);
  }
});

test("Tokyo October 17 is a new local-only scope, not a UTC-clock or promotion override", () => {
  const plan=october17WorkerCandidatePlan(); assert.equal(plan.candidateDateJst,"2026-10-17"); assert.equal(plan.scopeTimezone,"Asia/Tokyo");
  assert.equal(plan.registryPromotionAuthorized,false); assert.equal(plan.awsCalls,0); assert.equal(plan.imagePushes,0);
  assert.equal(plan.sourceAndBundleClosingRecheckRequired,true); assert.equal(plan.priorDatedCandidatesPreserved,true);
  for (const now of ["2026-10-16T15:00:00Z","2026-10-16T23:59:59Z","2026-10-17T14:59:59Z"])
    assert.equal(october17WorkerCandidateTag(Date.parse(now)),"gmai-worker:local-20261017-release");
  for (const now of [NaN,Infinity,-1,Number.MAX_SAFE_INTEGER,Date.parse("2026-10-16T14:59:59Z"),Date.parse("2026-10-17T15:00:00Z")])
    assert.throws(()=>october17WorkerCandidateTag(now),/PATCH_OCTOBER17_SCOPE_EXPIRED/);
  assert.equal(october16WorkerCandidateTag(Date.parse("2026-10-16T23:59:59Z")),"gmai-worker:local-20261016-release");
  assert.throws(()=>october16WorkerCandidateTag(Date.parse("2026-10-17T00:00:00Z")),/PATCH_OCTOBER16_SCOPE_EXPIRED/);
  const input=localPatchFixture(); input.image[0].RepoTags=[october17WorkerCandidateTag(Date.parse("2026-10-17T00:00:00Z"))];
  assert.equal(verifyLocalPatchArchive(input.bytes,input.image,input.image[0].RepoTags[0]).target.reference,input.image[0].RepoTags[0]);
  assert.throws(()=>verifyLocalPatchArchive(input.bytes,input.image),/PATCH_LOCAL_IMAGE_INVALID/);
});

test("Tokyo scope default remains inert and unknown extra args cannot touch Docker", () => {
  for(const extra of [[],["PRIVATE_SENTINEL"]]) {
    const r=spawnSync(process.execPath,["--import","tsx",resolve("scripts/prepare-worker-patch.ts"),"--plan-20261017-candidate",...extra],
      {encoding:"utf8",windowsHide:true,timeout:10000});
    assert.equal(r.status,extra.length?1:0); assert.equal((r.stdout+r.stderr).includes("PRIVATE_SENTINEL"),false);
    if(!extra.length) assert.deepEqual(JSON.parse(r.stdout),october17WorkerCandidatePlan());
  }
});

test("local build/scan plan makes no AWS, push or credential call", () => {
  const plan = prepareWorkerPatchPlan(); assert.equal(plan.awsCalls, 0); assert.equal(plan.imagePushes, 0); assert.equal(plan.credentialRetrievals, 0);
  assert.equal(plan.readyForDeployment, false); assert.throws(() => prepareWorkerPatchPlan(["--push"]));
  const result = spawnSync(process.execPath, [resolve("node_modules/tsx/dist/cli.mjs"), resolve("scripts/prepare-worker-patch.ts")], { encoding: "utf8" });
  assert.equal(result.status, 0); assert.equal(JSON.parse(result.stdout).cloudMutations, 0);
});
test("dated current candidate cannot become generic promotion, overwrite the old tag or run on another date", () => {
  const plan = currentWorkerCandidatePlan();
  assert.equal(plan.awsCalls, 0); assert.equal(plan.imagePushes, 0); assert.equal(plan.registryPromotionAuthorized, false);
  assert.equal(plan.existingHistoricalCandidateOverwritten, false); assert.equal(plan.liveImageSourceMismatchResolved, false);
  assert.equal(plan.currentApplicationArchiveProofRequired, true);
  const tag = currentWorkerCandidateTag(Date.parse("2026-10-12T12:00:00Z"));
  assert.equal(tag, "gmai-worker:local-20261012-release");
  for (const date of [NaN, -1, Number.MAX_SAFE_INTEGER, Date.parse("2026-10-11T23:59:59Z"), Date.parse("2026-10-13T00:00:00Z")])
    assert.throws(() => currentWorkerCandidateTag(date), /PATCH_CURRENT_SCOPE_EXPIRED/);
  assert.throws(() => currentWorkerCandidatePlan(["--push"]));
});
test("candidate proof imports pure helpers without awaiting a CLI or promotion cycle", () => {
  const source = readFileSync("scripts/worker-application-proof.ts", "utf8");
  assert.doesNotMatch(source, /from ["']\.\/(?:prepare-worker-patch|promote-worker-patch|verify-worker-release)\.js["']|process\.argv/);
  const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e",
    'await import("./scripts/worker-application-proof.ts"); console.log("PURE_IMPORT_COMPLETED");'],
    { encoding: "utf8", windowsHide: true, timeout: 5000, maxBuffer: 30000 });
  assert.equal(result.status, 0); assert.equal(result.signal, null); assert.equal(result.stdout.trim(), "PURE_IMPORT_COMPLETED");
  assert.equal(result.stderr, "");
  assert.match(readFileSync("scripts/prepare-worker-patch.ts", "utf8"), /from "\.\/worker-application-proof\.js"/);
});
test("current tag verification is explicit and never silently rebinds the old candidate", () => {
  const tag = currentWorkerCandidateTag(Date.parse("2026-10-12T12:00:00Z")), input = localPatchFixture();
  assert.throws(() => verifyLocalPatchArchive(input.bytes, input.image, tag), /PATCH_LOCAL_IMAGE_INVALID/);
  input.image[0].RepoTags = [tag];
  assert.equal(verifyLocalPatchArchive(input.bytes, input.image, tag).target.reference, tag);
  assert.throws(() => verifyLocalPatchArchive(input.bytes, input.image), /PATCH_LOCAL_IMAGE_INVALID/);
  for (const bad of ["foreign:latest", "gmai-worker:local-20261013-release", "PRIVATE_SENTINEL"])
    assert.throws(() => verifyLocalPatchArchive(input.bytes, input.image, bad), /PATCH_CANDIDATE_TAG_UNREVIEWED/);
});

test("October 16 local scope preserves both historical expiries and never grants promotion or execution", () => {
  const plan = october16WorkerCandidatePlan();
  assert.equal(plan.candidateDateUtc, "2026-10-16"); assert.equal(plan.awsCalls, 0); assert.equal(plan.imagePushes, 0);
  assert.equal(plan.credentialRetrievals, 0); assert.equal(plan.registryPromotionAuthorized, false);
  assert.equal(plan.readyForDeployment, false); assert.equal(plan.priorDatedCandidatesPreserved, true);
  assert.equal(plan.currentApplicationArchiveProofRequired, true);
  const now = Date.parse("2026-10-16T12:00:00Z"), tag = october16WorkerCandidateTag(now);
  assert.equal(tag, "gmai-worker:local-20261016-release"); assert.throws(() => currentWorkerCandidateTag(now), /PATCH_CURRENT_SCOPE_EXPIRED/);
  assert.equal(currentWorkerCandidateTag(Date.parse("2026-10-12T12:00:00Z")), "gmai-worker:local-20261012-release");
  for (const value of [NaN, Infinity, -1, Date.parse("2026-10-15T23:59:59Z"), Date.parse("2026-10-17T00:00:00Z")])
    assert.throws(() => october16WorkerCandidateTag(value), /PATCH_OCTOBER16_SCOPE_EXPIRED/);
  assert.throws(() => october16WorkerCandidatePlan(["--push"]));
  const input = localPatchFixture(); input.image[0].RepoTags = [tag];
  assert.equal(verifyLocalPatchArchive(input.bytes, input.image, tag).target.reference, tag);
  assert.throws(() => verifyLocalPatchArchive(input.bytes, input.image), /PATCH_LOCAL_IMAGE_INVALID/);
});

test("new dated CLI plan is inert and extra private arguments fail before Docker or registry activity", () => {
  const args = ["--import", "tsx", resolve("scripts/prepare-worker-patch.ts"), "--plan-20261016-candidate"];
  const plan = spawnSync(process.execPath, args, { encoding: "utf8", windowsHide: true, timeout: 10000 });
  assert.equal(plan.status, 0); assert.equal(plan.signal, null); assert.equal(plan.error, undefined); assert.equal(plan.stderr, "");
  assert.deepEqual(JSON.parse(plan.stdout), october16WorkerCandidatePlan());
  const rejected = spawnSync(process.execPath, [...args, "PRIVATE_SENTINEL"], { encoding: "utf8", windowsHide: true, timeout: 10000 });
  assert.equal(rejected.status, 1); assert.equal(rejected.stdout, "");
  assert.equal(rejected.stderr.includes("PRIVATE_SENTINEL"), false);
  assert.equal(JSON.parse(rejected.stderr).error, "PATCH_ARGUMENTS_REJECTED");
});
test("actual content hashes bind both single manifests and containerd image indexes to the one local candidate", () => {
  for (const indexed of [false, true]) {
    const input = localPatchFixture(indexed), result = verifyLocalPatchArchive(input.bytes, input.image);
    assert.equal(result.target.runtimeDigest, input.runtimeDigest); assert.equal(result.target.configDigest, input.configDigest);
    assert.equal(result.binding.archiveContentsMatchedToRuntimeManifest, true); assert.equal(result.binding.imageConfigArchitectureVerified, true);
    assert.equal(JSON.parse(result.manifestBytes.toString()).config.digest, input.configDigest);
  }
});
test("different architecture, user, entrypoint, tag, identity or excessive local size fails closed", () => {
  for (const mutate of [(image: any) => { image.Architecture = "arm64"; }, (image: any) => { image.Os = "windows"; },
    (image: any) => { image.Config.User = "root"; }, (image: any) => { image.Config.Entrypoint = ["sh"]; },
    (image: any) => { image.RepoTags = ["foreign:latest"]; }, (image: any) => { image.Id = `sha256:${"a".repeat(64)}`; },
    (image: any) => { image.Size = 256 * 1024 * 1024 + 1; }]) {
    const input = localPatchFixture(); mutate(input.image[0]); assert.throws(() => verifyLocalPatchArchive(input.bytes, input.image));
  }
});
test("matching inspect output cannot conceal a rooted, foreign-architecture or injected-key archive config", () => {
  for (const mutate of [(config: any) => { config.config.User = "root"; }, (config: any) => { config.architecture = "arm64"; },
    (config: any) => { config.config.Env.push(["AWS_SECRET_ACCESS_KEY", "PRIVATE_SENTINEL"].join("=")); },
    (config: any) => { config.config.Env.push(["TWELVE_DATA_API_KEY", "PRIVATE_SENTINEL"].join("=")); },
    (config: any) => { config.config.Env.push(["OPENAI_API_KEY", "PRIVATE_SENTINEL"].join("=")); },
    (config: any) => { config.config.Entrypoint = ["sh"]; }]) {
    const input = localPatchFixture(false, mutate); assert.throws(() => verifyLocalPatchArchive(input.bytes, input.image));
  }
});
test("foreign URL layers, unknown media, artifact subjects and mismatched config sizes are rejected", () => {
  for (const mutate of [(manifest: any) => { manifest.layers[0].urls = ["https://foreign.invalid/PRIVATE_SENTINEL"]; },
    (manifest: any) => { manifest.mediaType = "application/foreign"; }, (manifest: any) => { manifest.subject = {}; },
    (manifest: any) => { manifest.artifactType = "PRIVATE_SENTINEL"; }, (manifest: any) => { manifest.config.size++; }]) {
    const input = localPatchFixture(false, () => {}, mutate); assert.throws(() => verifyLocalPatchArchive(input.bytes, input.image));
  }
});
test("corrupted archive bytes, traversal, links and a truncated footer stop before any scanner", () => {
  const input = localPatchFixture();
  const entries = [...input.entries]; entries[0] = { ...entries[0], bytes: Buffer.from("PRIVATE_SENTINEL") };
  assert.throws(() => verifyLocalPatchArchive(makeTar(entries), input.image));
  for (const entry of [{ name: "../PRIVATE_SENTINEL", bytes: Buffer.alloc(0) }, { name: "oci-layout", bytes: Buffer.alloc(0), kind: "2" }]) {
    assert.throws(() => verifyLocalPatchArchive(makeTar([entry, ...input.entries]), input.image));
  }
  assert.throws(() => verifyLocalPatchArchive(input.bytes.subarray(0, -1024), input.image));
});
