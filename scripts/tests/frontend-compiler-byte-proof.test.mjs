import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { gzipSync } from "node:zlib";
import test from "node:test";
import { FRONTEND_COMPILER_TARGETS as targets,frontendCompilerByteProofPlan,verifyFrontendCompilerMetadata,
  compareFrontendCompilerArchive,fetchFrontendCompilerBytes,collectFrontendCompilerByteProof } from "../frontend-compiler-byte-proof.mjs";
import { inspectPinnedPackageArchive } from "../pinned-package-archive.mjs";
import { cleanSourceChildEnvironment } from "../local-proof-environment.mjs";
const sha=bytes=>createHash("sha256").update(bytes).digest("hex");
const integrity=bytes=>"sha512-"+createHash("sha512").update(bytes).digest("base64");
const native=target=>target===targets[2];
function tar(entries) {
  const blocks=[];
  for(const {path,bytes:input,kind="0"}of entries) {
    const bytes=Buffer.from(input),header=Buffer.alloc(512);
    header.write("package/"+path,0,100);header.write("0000644\0",100);header.write("0000000\0",108);header.write("0000000\0",116);
    header.write(bytes.length.toString(8).padStart(11,"0")+"\0",124);header.write("00000000000\0",136);header.fill(32,148,156);
    header.write(kind,156);header.write("ustar\0",257);header.write("00",263);
    header.write(header.reduce((a,b)=>a+b,0).toString(8).padStart(6,"0")+"\0 ",148);
    blocks.push(header,bytes,Buffer.alloc((512-bytes.length%512)%512));
  }
  return gzipSync(Buffer.concat([...blocks,Buffer.alloc(1024)]));
}
function fixture(target,binary=Buffer.from("SYNTHETIC_NONEXECUTABLE_BYTES"),change={}) {
  const manifest={name:target.name,version:target.version,license:"MIT",repository:{url:target.repository},
    ...(native(target)?{os:["win32"],cpu:["x64"],main:target.files[1]}:{}),...change};
  const files=target.files.map(path=>({path,bytes:path==="package.json"?JSON.stringify(manifest):path.endsWith(".node")?binary:"SYNTHETIC_PUBLIC_FILE"}));
  const compressed=tar(files),installed={name:target.name,version:target.version,
    files:files.map(({path,bytes})=>({path,bytes:Buffer.byteLength(bytes),sha256:sha(bytes)}))};
  return {files,compressed,integrity:integrity(compressed),installed};
}
const metadata=(target,hash)=>({name:target.name,version:target.version,license:"MIT",repository:{url:target.repository},
  dist:{tarball:target.tarball,integrity:hash},...(native(target)?{os:["win32"],cpu:["x64"],main:target.files[1]}:{})});

test("eleven selected frontend producer/native files match locked archives without broad provenance or execution claims",()=>{
  let total=0;
  for(const target of targets) {
    const f=fixture(target),r=compareFrontendCompilerArchive(target,f.compressed,f.integrity,f.installed);
    assert.equal(r.selectedInstalledFilesMatched,target.files.length);total+=r.selectedInstalledFilesMatched;
    assert.equal(r.lockedArchiveIntegrityMatched,true);assert.equal(r.rootLicenseDocumentPresent,!native(target));
    if(native(target))assert.equal(r.nativeBinarySha256,f.installed.files[1].sha256);
    for(const key of ["entireInstalledPackageFileSetVerified","archiveExtracted","packageCodeExecuted","installedFilesModified"])assert.equal(r[key],false);
    assert.equal(JSON.stringify(r).includes("SYNTHETIC_"),false);
  }
  assert.equal(total,11);
});

test("frontend native per-file allowance is exact-target only and preserves all existing generic caps",()=>{
  const target=targets[2],f=fixture(target,Buffer.alloc(17_000_000,65));
  assert.equal(compareFrontendCompilerArchive(target,f.compressed,f.integrity,f.installed).selectedInstalledFilesMatched,2);
  for(const profile of ["frontend-helper","reviewed-runtime","reviewed-native-compiler"])
    assert.throws(()=>inspectPinnedPackageArchive(target,f.compressed,f.integrity,profile));
  for(const change of [{name:"@rolldown/binding-linux-x64-gnu"},{version:"1.2.15"},{license:"Apache-2.0"}])
    assert.throws(()=>inspectPinnedPackageArchive({...target,...change},f.compressed,f.integrity,"reviewed-frontend-native-compiler"));
  const oversized=fixture(target,Buffer.alloc(24_000_001,65));
  assert.throws(()=>compareFrontendCompilerArchive(target,oversized.compressed,oversized.integrity,oversized.installed));
  const exactLimit=tar([...fixture(target).files,...Array.from({length:14},(_,i)=>({path:`extra-${i}.txt`,bytes:"x"}))]);
  assert.equal(inspectPinnedPackageArchive(target,exactLimit,integrity(exactLimit),"reviewed-frontend-native-compiler").filesInspected,16);
  const many=tar([...fixture(target).files,...Array.from({length:15},(_,i)=>({path:`extra-${i}.txt`,bytes:"x"}))]);
  assert.throws(()=>inspectPinnedPackageArchive(target,many,integrity(many),"reviewed-frontend-native-compiler"));
});

test("metadata binds each exact version, MIT, repository, canonical archive, integrity and native platform",()=>{
  for(const target of targets) {
    const f=fixture(target),m=metadata(target,f.integrity);assert.doesNotThrow(()=>verifyFrontendCompilerMetadata(target,m,f.integrity));
    for(const change of [{name:"PRIVATE_SENTINEL"},{version:"99.0.0"},{license:"ISC"},{repository:{url:"PRIVATE_SENTINEL"}},
      {dist:{...m.dist,tarball:"https://invalid.example/PRIVATE_SENTINEL"}},{dist:{...m.dist,integrity:"invalid"}}])
      assert.throws(()=>verifyFrontendCompilerMetadata(target,{...m,...change},f.integrity));
    assert.throws(()=>verifyFrontendCompilerMetadata({...target},m,f.integrity));
    if(native(target))for(const change of [{os:["linux"]},{cpu:["arm64"]},{main:"PRIVATE_SENTINEL"}])
      assert.throws(()=>verifyFrontendCompilerMetadata(target,{...m,...change},f.integrity));
  }
});

test("changed or duplicate selected bytes and untrusted native manifests cannot become a successful comparison",()=>{
  for(const target of targets) {
    const f=fixture(target);
    for(const mutate of [v=>v.files[0].sha256="a".repeat(64),v=>v.files[1].bytes++,v=>v.files.pop(),
      v=>v.files[1]=v.files[0],v=>v.version="99.0.0",v=>v.files[0].path="PRIVATE_SENTINEL"]) {
      const installed=structuredClone(f.installed);mutate(installed);
      assert.throws(()=>compareFrontendCompilerArchive(target,f.compressed,f.integrity,installed));
    }
    const corrupt=Buffer.from(f.compressed);corrupt[5]^=1;
    assert.throws(()=>compareFrontendCompilerArchive(target,corrupt,f.integrity,f.installed));
    for(const extra of [{path:"../PRIVATE_SENTINEL",bytes:"x"},{path:"link",bytes:"x",kind:"2"}]) {
      const compressed=tar([...f.files,extra]);assert.throws(()=>compareFrontendCompilerArchive(target,compressed,integrity(compressed),f.installed));
    }
  }
  for(const change of [{os:["linux"]},{main:"other.node"},{repository:{url:"PRIVATE_SENTINEL"}}]) {
    const f=fixture(targets[2],undefined,change);
    assert.throws(()=>compareFrontendCompilerArchive(targets[2],f.compressed,f.integrity,f.installed));
  }
});

test("public reads use fixed official destinations, omit credentials, copy stream chunks and close readers",async()=>{
  for(const target of targets) {
    const bytes=Buffer.from("{}"),seen=[];let reads=0,canceled=0,released=0;
    const r=await fetchFrontendCompilerBytes(target,"metadata",async(url,options)=>{
      seen.push(url);assert.equal(options.redirect,"error");assert.equal(options.credentials,"omit");
      assert.equal(options.referrerPolicy,"no-referrer");assert.equal(options.headers.Authorization,undefined);
      assert.equal(options.headers["Accept-Encoding"],"identity");
      return {status:200,url,headers:new Headers({"content-type":"application/json"}),body:{getReader:()=>({
        read:async()=>++reads===1?{done:false,value:bytes}:(bytes.fill(88),{done:true}),
        cancel:async()=>{canceled++;},releaseLock:()=>{released++;}})}};
    });
    assert.equal(r.toString(),"{}");assert.equal(canceled,1);assert.equal(released,1);
    assert.deepEqual(seen,[`https://registry.npmjs.org/${encodeURIComponent(target.name)}/${target.version}`]);
  }
});

test("redirect, inaccurate length, MIME, encoding, oversized streams and private transport errors fail closed",async()=>{
  for(const response of [new Response("{}",{headers:{"content-type":"text/html"}}),
    new Response("{}",{headers:{"content-type":"application/json","content-length":"3"}}),
    new Response("{}",{headers:{"content-type":"application/json","content-encoding":"gzip"}}),
    new Response("{}",{status:302,headers:{location:"https://invalid.example/PRIVATE_SENTINEL"}})])
    await assert.rejects(fetchFrontendCompilerBytes(targets[0],"metadata",async()=>response),/^Error: FRONTEND_COMPILER_BYTE_PROOF_INCOMPLETE$/);
  let canceled=0;
  await assert.rejects(fetchFrontendCompilerBytes(targets[0],"metadata",async()=>new Response(new ReadableStream({
    pull(c){c.enqueue(new Uint8Array(100_001));},cancel(){canceled++;}}),{headers:{"content-type":"application/json"}})));
  assert.equal(canceled,1);
  await assert.rejects(fetchFrontendCompilerBytes(targets[0],"tarball",async()=>{throw Error("PRIVATE_SENTINEL");}),/^Error: FRONTEND_COMPILER_BYTE_PROOF_INCOMPLETE$/);
});

test("arbitrary destinations, invalid roots and CLI arguments cannot fetch or leak private error details",async()=>{
  let calls=0;const fetcher=async()=>{calls++;throw Error("PRIVATE_SENTINEL");};
  for(const target of [{...targets[0]},null])await assert.rejects(fetchFrontendCompilerBytes(target,"metadata",fetcher));
  await assert.rejects(fetchFrontendCompilerBytes(targets[0],"PRIVATE_SENTINEL",fetcher));
  await assert.rejects(collectFrontendCompilerByteProof(".",fetcher));assert.equal(calls,0);
  const plan=frontendCompilerByteProofPlan();assert.equal(plan.publicRegistryRequests,0);assert.equal(plan.selectedOwnPackageFiles,11);
  assert.equal(plan.readyForPublication,false);assert.throws(()=>frontendCompilerByteProofPlan(["PRIVATE_SENTINEL"]));
  for(const args of [[],["PRIVATE_SENTINEL"]]) {
    const r=spawnSync(process.execPath,["scripts/frontend-compiler-byte-proof.mjs",...args],{encoding:"utf8",windowsHide:true,timeout:10000});
    assert.equal(r.status,args.length?1:0);assert.equal((r.stdout+r.stderr).includes("PRIVATE_SENTINEL"),false);
  }
});

test("old-runtime collector execution is rejected before filesystem or network effects",()=>{
  const program='import fs from"node:fs";import{syncBuiltinESMExports}from"node:module";'+
    'const{collectFrontendCompilerByteProof:f}=await import("./scripts/frontend-compiler-byte-proof.mjs");let calls=0;'+
    'fs.readFileSync=()=>{calls++;throw Error("PRIVATE_SENTINEL")};syncBuiltinESMExports();'+
    'Object.defineProperty(process.versions,"node",{value:"24.19.0"});'+
    'try{await f("NONEXISTENT_ROOT",async()=>{calls++;});throw Error("UNEXPECTED_SUCCESS")}catch(e){if(e.message!=="PROJECT_NODE_SECURITY_BASELINE_REQUIRED")throw e;}'+
    'if(calls)throw Error("UNEXPECTED_EFFECT");console.log("BLOCKED_BEFORE_EFFECTS");';
  const r=spawnSync(process.execPath,["--input-type=module","--eval",program],{encoding:"utf8",timeout:5000,windowsHide:true,
    env:cleanSourceChildEnvironment(process.env),maxBuffer:2000});
  assert.equal(r.status,0);assert.equal(r.stdout.trim(),"BLOCKED_BEFORE_EFFECTS");assert.equal(r.stderr,"");
});
