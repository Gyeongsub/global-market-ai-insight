import assert from "node:assert/strict";
import test from "node:test";
import { evaluateBackendNoticeInventory } from "../backend-notice-inventory.mjs";
function fixture(){return { emitted:{mode:"local-backend-emitted-module-proof",filesWritten:0,reports:["controller","worker","sweeper","alarm-circuit"].map(service=>({service,
  artifactSha256:"a".repeat(64),inMemoryRebuildMatchedWrittenArtifact:true,inputsBracketedFinalRebuild:true,packages:[{name:"runtime",version:"1.0.0"},{name:"missing",version:"2.0.0"}]}))},
  documents:[{name:"runtime",version:"1.0.0",state:"documents-available",documents:[{name:"LICENSE",bytes:100,sha256:"b".repeat(64)}]},
    {name:"missing",version:"2.0.0",state:"root-license-missing",documents:[]}]};}
test("each emitted service is linked to exact-version document hashes and explicit unresolved gaps",()=>{
  const f=fixture(),r=evaluateBackendNoticeInventory(f.emitted,f.documents);assert.equal(r.uniqueEmittedPackages,2);assert.equal(r.gaps.length,4);
  assert.equal(r.missingPackageLicenseIdentities,1);assert.equal(r.bundledDistributedNoticesComplete,false);assert.equal(r.missingRootLicenseIsLegalViolation,false);
  assert.equal(r.readyForPublication,false);assert.equal(r.documents[0].documents[0].sha256,"b".repeat(64));
});
test("a document claim without LICENSE, missing identity, changed version or stale artifact cannot pass",()=>{
  const changes=[f=>f.documents[0].documents=[],f=>f.documents[1].state="documents-available",f=>f.documents[0].version="9.0.0",
    f=>f.documents.pop(),f=>f.documents.push(f.documents[0]),f=>f.emitted.reports[0].inputsBracketedFinalRebuild=false,
    f=>f.emitted.reports[0].artifactSha256="PRIVATE_SENTINEL",f=>f.emitted.reports[0].service="PRIVATE_SENTINEL",
    f=>f.emitted.reports[0].packages.push(f.emitted.reports[0].packages[0]),f=>f.emitted.filesWritten=1];
  for(const change of changes){const f=fixture();change(f);assert.throws(()=>evaluateBackendNoticeInventory(f.emitted,f.documents),/BACKEND_NOTICE_INVENTORY_INCOMPLETE/);}
});
test("arbitrary paths, document text, oversized hashes and unknown issue states cannot be emitted",()=>{
  for(const change of [f=>f.documents[0].documents[0].name="../PRIVATE_SENTINEL",f=>f.documents[0].documents[0].sha256="PRIVATE_SENTINEL",
    f=>f.documents[0].documents[0].bytes=500001,f=>f.documents[1].state="PRIVATE_SENTINEL",f=>f.documents[0].name="C:/PRIVATE_SENTINEL",
    f=>f.documents[0].documents[0].text="PRIVATE_SENTINEL",f=>f.documents[0].privatePath="PRIVATE_SENTINEL"]){
    const f=fixture();change(f);assert.throws(()=>evaluateBackendNoticeInventory(f.emitted,f.documents));}
});
test("zero root-document gaps do not approve generated helpers, OS licensing or published notices",()=>{
  const f=fixture();f.documents[1]={name:"missing",version:"2.0.0",state:"documents-available",documents:[{name:"COPYING.txt",bytes:10,sha256:"c".repeat(64)}]};
  const r=evaluateBackendNoticeInventory(f.emitted,f.documents);assert.equal(r.gaps.length,0);assert.equal(r.legalApprovalGranted,false);
  assert.equal(r.generatedHelperAndBannerReviewRequired,true);assert.equal(r.bundledDistributedNoticesComplete,false);
});
