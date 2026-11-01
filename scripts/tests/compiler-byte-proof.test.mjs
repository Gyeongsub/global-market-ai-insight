import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { gzipSync,gunzipSync } from "node:zlib";
import test from "node:test";
import { COMPILER_TARGETS,compilerByteProofPlan,verifyCompilerMetadata,compareCompilerArchive,fetchCompilerBytes,collectCompilerByteProof } from "../compiler-byte-proof.mjs";
import { inspectPinnedPackageArchive } from "../pinned-package-archive.mjs";
const sha=bytes=>createHash("sha256").update(bytes).digest("hex"),repository="git+https://github.com/evanw/esbuild.git";
const commit="bb9db84c02433fbe37b3509f53f9f3e3cc48725e";
function tar(entries) {
  const blocks=[];
  for(const {path,bytes:input,kind="0"} of entries) {
    const bytes=Buffer.from(input),header=Buffer.alloc(512);
    header.write("package/"+path,0,100); header.write("0000644\0",100); header.write("0000000\0",108);header.write("0000000\0",116);
    header.write(bytes.length.toString(8).padStart(11,"0")+"\0",124);header.write("00000000000\0",136);header.fill(32,148,156);
    header.write(kind,156);header.write("ustar\0",257);header.write("00",263);
    header.write(header.reduce((a,b)=>a+b,0).toString(8).padStart(6,"0")+"\0 ",148);
    blocks.push(header,bytes,Buffer.alloc((512-bytes.length%512)%512));
  }
  return gzipSync(Buffer.concat([...blocks,Buffer.alloc(1024)]));
}
function fixture(target,binary=Buffer.from("SYNTHETIC_NONEXECUTABLE_BYTES")) {
  const manifest={name:target.name,version:target.version,license:target.license,repository:{url:repository}};
  const files=target.files.map(path=>({path,bytes:path==="package.json"?JSON.stringify(manifest):path==="esbuild.exe"?binary:"SYNTHETIC_PUBLIC_FILE"}));
  const compressed=tar(files),integrity="sha512-"+createHash("sha512").update(compressed).digest("base64");
  const installed={name:target.name,version:target.version,files:files.map(({path,bytes})=>({path,bytes:Buffer.byteLength(bytes),sha256:sha(bytes)}))};
  return {compressed,integrity,installed,files};
}
function metadata(target,integrity) {
  return {name:target.name,version:target.version,license:"MIT",repository:{url:repository},gitHead:commit,
    dist:{tarball:target.tarball,integrity},...(target===COMPILER_TARGETS[1]?{os:["win32"],cpu:["x64"]}:{})};
}

test("five selected installed compiler files bind to lock-integrity archive bytes without native execution or full provenance claims",()=>{
  for(const target of COMPILER_TARGETS) {
    const f=fixture(target),r=compareCompilerArchive(target,f.compressed,f.integrity,f.installed);
    assert.equal(r.selectedInstalledFilesMatched,target.files.length);assert.equal(r.lockedArchiveIntegrityMatched,true);
    for(const key of ["entireInstalledPackageFileSetVerified","archiveExtracted","packageCodeExecuted","installedFilesModified"]) assert.equal(r[key],false);
    for(const hidden of ["SYNTHETIC_","lib/main.js","esbuild.exe"]) assert.equal(JSON.stringify(r).includes(hidden),false);
    assert.equal(r.rootLicenseDocumentPresent,target===COMPILER_TARGETS[0]);
  }
});
test("native size allowance is fixed to exactly the reviewed Windows compiler and does not relax existing archive profiles",()=>{
  const target=COMPILER_TARGETS[1],f=fixture(target,Buffer.alloc(6_000_000,65));
  assert.equal(compareCompilerArchive(target,f.compressed,f.integrity,f.installed).selectedInstalledFilesMatched,2);
  assert.throws(()=>inspectPinnedPackageArchive(target,f.compressed,f.integrity,"frontend-helper"));
  for(const change of [{name:"@esbuild/linux-x64"},{version:"0.28.2"},{license:"Apache-2.0"}])
    assert.throws(()=>inspectPinnedPackageArchive({...target,...change},f.compressed,f.integrity,"reviewed-native-compiler"));
});
test("metadata must preserve exact reviewed tool, native platform, official URL, commit and lock integrity",()=>{
  for(const target of COMPILER_TARGETS) {
    const {integrity}=fixture(target),v=metadata(target,integrity);assert.doesNotThrow(()=>verifyCompilerMetadata(target,v,integrity));
    for(const change of [{name:"PRIVATE_SENTINEL"},{version:"0.28.2"},{license:"ISC"},{repository:{url:"PRIVATE_SENTINEL"}},
      {gitHead:"a".repeat(40)},{dist:{...v.dist,tarball:"https://invalid.example/PRIVATE_SENTINEL"}},{dist:{...v.dist,integrity:"invalid"}}])
      assert.throws(()=>verifyCompilerMetadata(target,{...v,...change},integrity));
    assert.throws(()=>verifyCompilerMetadata({...target},v,integrity));
    if(target===COMPILER_TARGETS[1]) for(const change of [{os:["linux"]},{cpu:["arm64"]}])
      assert.throws(()=>verifyCompilerMetadata(target,{...v,...change},integrity));
  }
});
test("changed bytes, missing/duplicate selections and a self-described manifest cannot stand in for installed compiler evidence",()=>{
  const target=COMPILER_TARGETS[0],f=fixture(target);
  for(const change of [v=>v.files[0].sha256="a".repeat(64),v=>v.files[1].bytes++,v=>v.files.pop(),
    v=>v.files[1]=v.files[0],v=>v.name="PRIVATE_SENTINEL",v=>v.files[0].path="PRIVATE_SENTINEL"]){
    const value=structuredClone(f.installed);change(value);assert.throws(()=>compareCompilerArchive(target,f.compressed,f.integrity,value));
  }
  const broken=Buffer.from(f.compressed);broken[broken.length-10]^=1;
  assert.throws(()=>compareCompilerArchive(target,broken,f.integrity,f.installed));
  for(const extra of [{path:"../PRIVATE_SENTINEL",bytes:"x"},{path:"linked",bytes:"x",kind:"2"}]) {
    const bytes=tar([...f.files,extra]),integrity="sha512-"+createHash("sha512").update(bytes).digest("base64");
    assert.throws(()=>compareCompilerArchive(target,bytes,integrity,f.installed));
  }
  const bad=gunzipSync(f.compressed);bad[20]^=1;const changed=gzipSync(bad);
  assert.throws(()=>compareCompilerArchive(target,changed,"sha512-"+createHash("sha512").update(changed).digest("base64"),f.installed));
});
test("fixed public reads carry no credential or redirect destination and copy streamed data before later mutation",async()=>{
  const bytes=Buffer.from("{}"),seen=[];let reads=0,canceled=0,released=0;
  const result=await fetchCompilerBytes(COMPILER_TARGETS[0],"metadata",async(url,options)=>{
    seen.push(url);assert.equal(options.credentials,"omit");assert.equal(options.redirect,"error");assert.equal(options.referrerPolicy,"no-referrer");
    assert.equal(options.headers.Authorization,undefined);assert.equal(options.headers["Accept-Encoding"],"identity");
    return {status:200,url,headers:new Headers({"content-type":"application/json"}),body:{getReader:()=>({
      read:async()=>++reads===1?{done:false,value:bytes}:(bytes.fill(88),{done:true}),cancel:async()=>{canceled++;},releaseLock:()=>{released++;}})}};
  });
  assert.equal(result.toString(),"{}");assert.equal(canceled,1);assert.equal(released,1);assert.equal(seen.length,1);
  assert.equal(seen[0],"https://registry.npmjs.org/esbuild/0.28.1");
});
test("oversized bodies, inaccurate length, wrong MIME/encoding/redirect and private transport failures remain incomplete",async()=>{
  for(const response of [new Response("{}",{headers:{"content-type":"text/html"}}),
    new Response("{}",{headers:{"content-type":"application/json","content-length":"3"}}),
    new Response("{}",{headers:{"content-type":"application/json","content-encoding":"gzip"}}),
    new Response("{}",{status:302,headers:{"content-type":"application/json","location":"https://invalid.example/PRIVATE_SENTINEL"}})])
    await assert.rejects(fetchCompilerBytes(COMPILER_TARGETS[0],"metadata",async()=>response),/^Error: COMPILER_BYTE_PROOF_INCOMPLETE$/);
  let canceled=0;
  await assert.rejects(fetchCompilerBytes(COMPILER_TARGETS[0],"metadata",async()=>new Response(new ReadableStream({
    pull(c){c.enqueue(new Uint8Array(100_001));},cancel(){canceled++;}}),{headers:{"content-type":"application/json"}})));
  assert.equal(canceled,1);
  await assert.rejects(fetchCompilerBytes(COMPILER_TARGETS[0],"metadata",async()=>{throw Error("PRIVATE_SENTINEL");}),/^Error: COMPILER_BYTE_PROOF_INCOMPLETE$/);
});
test("caller-selected targets, invalid scope and altered CLI arguments never query a private service or install anything",async()=>{
  let calls=0;const fetcher=async()=>{calls++;throw Error("PRIVATE_SENTINEL");};
  for(const target of [{...COMPILER_TARGETS[0]},null]) await assert.rejects(fetchCompilerBytes(target,"metadata",fetcher));
  await assert.rejects(fetchCompilerBytes(COMPILER_TARGETS[0],"PRIVATE_SENTINEL",fetcher));
  await assert.rejects(collectCompilerByteProof(".",fetcher),/^Error: COMPILER_BYTE_PROOF_INCOMPLETE$/);assert.equal(calls,0);
  const plan=compilerByteProofPlan();assert.equal(plan.publicRegistryRequests,0);assert.equal(plan.awsCalls,0);assert.equal(plan.filesWritten,0);
  assert.throws(()=>compilerByteProofPlan(["PRIVATE_SENTINEL"]));
  for(const args of [[],["PRIVATE_SENTINEL"]]) {
    const r=spawnSync(process.execPath,["scripts/compiler-byte-proof.mjs",...args],{encoding:"utf8",windowsHide:true,timeout:10000});
    assert.equal(r.status,args.length?1:0);assert.equal((r.stdout+r.stderr).includes("PRIVATE_SENTINEL"),false);
  }
});
