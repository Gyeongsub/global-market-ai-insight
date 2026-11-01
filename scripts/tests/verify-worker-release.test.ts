import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import test from "node:test";
import { readApplicationLayer, safeWorkerProofDirectory, verifyWorkerApplicationArchive, workerProofFailurePacket, workerReleasePlan } from "../verify-worker-release.js";
import { makeTar } from "./fixtures/local-patch-archive-fixture.js";
import { hash } from "./fixtures/live-image-fixture.js";
const names=["main.mjs","THIRD_PARTY_NOTICES.md","licenses/AWS-SDK-JS-V3-APACHE-2.0.txt"];
const expected=()=>new Map(names.map(name=>[name,Buffer.from(`SYNTHETIC_${name}`)]));
function layer(entries:{name:string;bytes:Buffer;kind?:string}[],owner=65532) {
  const tar=makeTar(entries);let offset=0;
  for(const entry of entries){const header=tar.subarray(offset,offset+512);for(const start of [108,116])header.write(owner.toString(8).padStart(7,"0")+"\0",start,8);
    header.write("ustar\0",257,6);header.write("00",263,2);
    header.write("0000644\0",100,8);header.fill(32,148,156);const sum=header.reduce((a,b)=>a+b,0);header.write(sum.toString(8).padStart(6,"0")+"\0 ",148,8);
    offset+=512+Math.ceil(entry.bytes.length/512)*512;}return tar;
}
function fixture(change:(config:any)=>void=()=>{},content=expected()){
  const dirs=layer([{name:"app/",bytes:Buffer.alloc(0),kind:"5"}],0),copy=layer([...content].map(([name,bytes])=>({name:`app/${name}`,bytes}))),compressed=[gzipSync(dirs),gzipSync(copy)];
  const config:any={os:"linux",architecture:"amd64",config:{WorkingDir:"/app",User:"65532:65532",Entrypoint:["/nodejs/bin/node","main.mjs"]},rootfs:{type:"layers",diff_ids:[hash(dirs),hash(copy)]}};change(config);
  const cfg=Buffer.from(JSON.stringify(config)),configDigest=hash(cfg),manifest=Buffer.from(JSON.stringify({schemaVersion:2,config:{digest:configDigest,size:cfg.length},
    layers:compressed.map(bytes=>({mediaType:"application/vnd.oci.image.layer.v1.tar+gzip",digest:hash(bytes),size:bytes.length}))})),runtimeDigest=hash(manifest);
  const entries=[{name:`blobs/sha256/${configDigest.slice(7)}`,bytes:cfg},{name:`blobs/sha256/${runtimeDigest.slice(7)}`,bytes:manifest},
    ...compressed.map(bytes=>({name:`blobs/sha256/${hash(bytes).slice(7)}`,bytes})),{name:"oci-layout",bytes:Buffer.from(JSON.stringify({imageLayoutVersion:"1.0.0"}))},
    {name:"index.json",bytes:Buffer.from(JSON.stringify({schemaVersion:2,manifests:[{digest:runtimeDigest}]}))},
    {name:"manifest.json",bytes:Buffer.from(JSON.stringify([{Config:`blobs/sha256/${configDigest.slice(7)}`,Layers:compressed.map(bytes=>`blobs/sha256/${hash(bytes).slice(7)}`)}]))}];
  return {bytes:makeTar(entries),target:{reference:`123456789012.dkr.ecr.ap-northeast-1.amazonaws.com/global-market-ai-insight-dev-worker@${runtimeDigest}`,configDigest,runtimeDigest}};
}
test("three exact worker application files bind to the final two hashed filesystem layers without extraction",()=>{
  const f=fixture(),r=verifyWorkerApplicationArchive(f.bytes,f.target,expected());assert.equal(r.applicationFilesMatchedCurrentBundle,true);
  assert.equal(r.finalLayerDiffIdsMatched,true);assert.equal(r.imageExecuted,false);assert.equal(r.fullRootFilesystemOrLicenseProof,false);
  for(const hidden of ["SYNTHETIC_","123456789012","dkr.ecr","app/main"])assert.equal(JSON.stringify(r).includes(hidden),false);
});
test("a stale source bundle or notice cannot be accepted as current image provenance",()=>{
  const f=fixture();for(const name of names){const wrong=expected();wrong.set(name,Buffer.from("CHANGED_PRIVATE_SENTINEL"));assert.throws(()=>verifyWorkerApplicationArchive(f.bytes,f.target,wrong));}
});
test("source mismatch reports every changed fixed artifact label without bytes, hashes or private paths",()=>{
  const f=fixture();
  for(const changed of [[names[0]],[names[1]],[names[2]],names]){
    const wrong=expected();for(const name of changed)wrong.set(name,Buffer.from("PRIVATE_CONTENT_SENTINEL"));
    let error:unknown;try{verifyWorkerApplicationArchive(f.bytes,f.target,wrong);}catch(value){error=value;}
    const packet=workerProofFailurePacket(error);
    assert.equal(packet.error,"WORKER_PROOF_SOURCE_BYTES_MISMATCH");
    assert.deepEqual(packet.applicationMismatchFiles,changed);assert.equal(packet.currentImageSourceMatchVerified,false);
    assert.equal(packet.cleanupMustBeIndependentlyVerified,true);assert.ok(Object.isFrozen(packet.applicationMismatchFiles));
    for(const hidden of ["PRIVATE_CONTENT_SENTINEL","123456789012","dkr.ecr",f.target.runtimeDigest])assert.equal(JSON.stringify(packet).includes(hidden),false);
  }
});
test("unknown, forged and throwing worker errors cannot reflect private message or prototype content",()=>{
  const throwing=Object.defineProperty({},"message",{get(){throw Error("PRIVATE_SENTINEL");}});
  const errors=[new Error("WORKER_PROOF_PRIVATE_SENTINEL"),"PRIVATE_SENTINEL",throwing,
    new Proxy({}, {getPrototypeOf(){throw Error("PRIVATE_SENTINEL");}})];
  const f=fixture(),wrong=expected();wrong.set(names[0],Buffer.from("PRIVATE_SENTINEL"));
  let genuine:any;try{verifyWorkerApplicationArchive(f.bytes,f.target,wrong);}catch(value){genuine=value;}
  errors.push(Object.create(Object.getPrototypeOf(genuine)));
  for(const error of errors){const packet=workerProofFailurePacket(error);assert.equal(packet.error,"WORKER_PROOF_INCOMPLETE");
    assert.deepEqual(packet.applicationMismatchFiles,[]);assert.equal(JSON.stringify(packet).includes("PRIVATE_SENTINEL"),false);}
  genuine.message="WORKER_PROOF_PRIVATE_SENTINEL";genuine.packet=()=>({error:"PRIVATE_SENTINEL"});
  assert.equal(workerProofFailurePacket(genuine).error,"WORKER_PROOF_SOURCE_BYTES_MISMATCH");
  assert.deepEqual(workerProofFailurePacket(genuine).applicationMismatchFiles,[names[0]]);
});
test("non-source worker failures do not invent mismatched application labels",()=>{
  let error:unknown;try{readApplicationLayer(Buffer.alloc(512));}catch(value){error=value;}
  const packet=workerProofFailurePacket(error);assert.equal(packet.error,"WORKER_PROOF_LAYER_INVALID");
  assert.deepEqual(packet.applicationMismatchFiles,[]);assert.equal(packet.currentImageSourceMatchVerified,false);
});
test("working directory, entrypoint, command override, user and diff IDs fail closed",()=>{
  for(const change of [(c:any)=>c.config.WorkingDir="/other",(c:any)=>c.config.Entrypoint=["/bin/sh"],(c:any)=>c.config.Cmd=["OTHER_PRIVATE"],
    (c:any)=>c.config.User="0",(c:any)=>c.rootfs.diff_ids[1]=`sha256:${"a".repeat(64)}`]){const f=fixture(change);assert.throws(()=>verifyWorkerApplicationArchive(f.bytes,f.target,expected()));}
});
test("links, whiteouts, path escapes, unrelated files, duplicate entries and wrong owner fail",()=>{
  const entries=[...expected()].map(([name,bytes])=>({name:`app/${name}`,bytes}));
  for(const extra of [{name:"app/.wh.main.mjs",bytes:Buffer.alloc(0)},{name:"../PRIVATE_SENTINEL",bytes:Buffer.from("x")},
    {name:"app/unrelated.txt",bytes:Buffer.from("x")},{...entries[0]}, {name:"app/main.mjs",bytes:Buffer.alloc(0),kind:"2"}]){
    assert.throws(()=>readApplicationLayer(layer([...entries,extra])));}
  assert.throws(()=>readApplicationLayer(layer(entries,0)));assert.throws(()=>readApplicationLayer(layer(entries),true));
});
test("mkdir proof is exactly the non-linked app directory and cannot hide another overlay",()=>{
  assert.equal(readApplicationLayer(layer([{name:"app/",bytes:Buffer.alloc(0),kind:"5"}],0),true).size,0);
  for(const kind of ["0","1","2","x","g","L"]){assert.throws(()=>readApplicationLayer(layer([{name:"app",bytes:Buffer.alloc(0),kind}],0),true));}
  assert.throws(()=>readApplicationLayer(layer([{name:"app/",bytes:Buffer.alloc(0),kind:"5"},{name:"app/licenses/",bytes:Buffer.alloc(0),kind:"5"}],0),true));
});
test("truncated data, invalid checksum, missing termination and oversized input do not pass",()=>{
  const tar=layer([...expected()].map(([name,bytes])=>({name:`app/${name}`,bytes})));const wrong=Buffer.from(tar);wrong[20]^=1;
  for(const data of [wrong,tar.subarray(0,tar.length-1024),tar.subarray(0,tar.length-1),Buffer.alloc(16*1024*1024+512)])assert.throws(()=>readApplicationLayer(data));
});

function changedHeader(change:(header:Buffer)=>void) {
  const tar=layer([...expected()].map(([name,bytes])=>({name:`app/${name}`,bytes}))),header=tar.subarray(0,512);
  change(header);header.fill(32,148,156);const sum=header.reduce((a,b)=>a+b,0);header.write(sum.toString(8).padStart(6,"0")+"\0 ",148,8);
  return tar;
}
test("an exact USTAR prefix/name pair has the same reviewed application path",()=>{
  const tar=changedHeader(header=>{header.fill(0,0,100);header.write("main.mjs",0);header.write("app",345);});
  const actual=readApplicationLayer(tar);assert.equal(actual.size,3);assert.ok(actual.get("main.mjs")!.equals(expected().get("main.mjs")!));
});
test("unknown, V7 and GNU headers cannot borrow USTAR prefix semantics for an application proof",()=>{
  for(const change of [(h:Buffer)=>h.fill(0,257,265),(h:Buffer)=>h.write("ustar  \0",257,8),
    (h:Buffer)=>h.write("01",263,2),(h:Buffer)=>h.write("OTHER\0",257,6)])
    assert.throws(()=>readApplicationLayer(changedHeader(h=>{h.fill(0,0,100);h.write("main.mjs",0);h.write("app",345);change(h);})),/WORKER_PROOF_LAYER_INVALID/);
});
test("a trailing slash is allowed only for reviewed directory records, never regular application files",()=>{
  const entries=[...expected()].map(([name,bytes])=>({name:`app/${name}/`,bytes}));
  assert.throws(()=>readApplicationLayer(layer(entries)),/WORKER_PROOF_LAYER_SCOPE_INVALID/);
  assert.equal(readApplicationLayer(layer([{name:"app/",bytes:Buffer.alloc(0),kind:"5"}],0),true).size,0);
});
test("hidden NUL tails and junk after numeric termination cannot masquerade as clean application header fields",()=>{
  for(const change of [(h:Buffer)=>h.write("HIDDEN_SENTINEL",20),(h:Buffer)=>h.write("HIDDEN_SENTINEL",350),
    (h:Buffer)=>{h[114]=0;h[115]=49;},(h:Buffer)=>h.write("HIDDEN_SENTINEL",157)])
    assert.throws(()=>readApplicationLayer(changedHeader(change)),/WORKER_PROOF_LAYER_INVALID/);
});
test("nonzero application payload padding cannot be silently excluded from the narrow source proof",()=>{
  const tar=layer([...expected()].map(([name,bytes])=>({name:`app/${name}`,bytes})));
  tar[512+expected().get("main.mjs")!.length]=1;
  assert.throws(()=>readApplicationLayer(tar),/WORKER_PROOF_LAYER_INVALID/);
});
test("cleanup validates one exact owned physical temporary directory only",()=>{
  const base=resolve(tmpdir()),physical=realpathSync(base),directory=mkdtempSync(join(base,"gmai-worker-source-proof-"));
  try{assert.equal(safeWorkerProofDirectory(base,directory,physical),true);for(const path of [base,resolve("."),join(directory,"nested")])assert.equal(safeWorkerProofDirectory(base,path,physical),false);}
  finally{rmSync(directory,{recursive:true});}
});
test("default, import and arbitrary flags cannot save an image or query AWS",()=>{
  assert.equal(workerReleasePlan().awsCalls,0);assert.equal(workerReleasePlan().containersStarted,0);assert.throws(()=>workerReleasePlan(["PRIVATE_SENTINEL"]));
  for(const args of [[],["PRIVATE_SENTINEL"],["--execute-read-only","PRIVATE_SENTINEL"]]){const r=spawnSync(process.execPath,["--import","tsx","scripts/verify-worker-release.ts",...args],{encoding:"utf8",timeout:5000});
    assert.equal(r.status,args.length?1:0);assert.equal(`${r.stdout}${r.stderr}`.includes("PRIVATE_SENTINEL"),false);}
});
