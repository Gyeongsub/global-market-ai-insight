import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { summarizeBackendMetafile } from "../backend-module-proof.mjs";
const root=resolve("synthetic-backend-module-fixture"),directory=resolve(root,"node_modules/.pnpm/runtime@1.0.0/node_modules/runtime");
const packages=[{name:"runtime",version:"1.0.0",license:"MIT",directory}];
function fixture(){return{inputs:{"services/worker/src/main.ts":{bytes:20},"shared/types.ts":{bytes:10},"node_modules/.pnpm/runtime@1.0.0/node_modules/runtime/main.js":{bytes:15},
  "node_modules/.pnpm/runtime@1.0.0/node_modules/runtime/unused.js":{bytes:15}},outputs:{"services/worker/bundle/main.mjs":{bytes:50,entryPoint:"services/worker/src/main.ts",
    imports:[{path:"node:module",external:true}],inputs:{"services/worker/src/main.ts":{bytesInOutput:12},"shared/types.ts":{bytesInOutput:4},
      "node_modules/.pnpm/runtime@1.0.0/node_modules/runtime/main.js":{bytesInOutput:10},"node_modules/.pnpm/runtime@1.0.0/node_modules/runtime/unused.js":{bytesInOutput:0}}}}};}
const artifact=Buffer.alloc(50,65);
test("emitted bytes bind module categories and package identity without private paths or code",()=>{
  const r=summarizeBackendMetafile(fixture(),"worker",root,packages,artifact);assert.equal(r.emittedModules,3);assert.equal(r.treeShakenInputs,1);
  assert.deepEqual(r.categories,{ownService:1,sharedSource:1,circuitControlSource:0,controllerContractSource:0,lockedRuntimePackage:1});assert.equal(r.packages[0].emittedModules,1);
  assert.equal(r.generatedHelperAndBannerLicenseReviewRequired,true);assert.equal(r.completeDistributedAttributionVerified,false);
  for(const hidden of [root,directory,"main.ts",artifact.toString()])assert.equal(JSON.stringify(r).includes(hidden),false);
});
test("shared controller contract modules are explicit, not arbitrary other-service code",()=>{
  const v=fixture(),id="services/controller/src/validation.ts";v.inputs[id]={bytes:5};v.outputs["services/worker/bundle/main.mjs"].inputs[id]={bytesInOutput:2};
  assert.equal(summarizeBackendMetafile(v,"worker",root,packages,artifact).categories.controllerContractSource,1);
  delete v.inputs[id];delete v.outputs["services/worker/bundle/main.mjs"].inputs[id];
  const unrelated="services/controller/src/main.ts";v.inputs[unrelated]={bytes:5};v.outputs["services/worker/bundle/main.mjs"].inputs[unrelated]={bytesInOutput:2};
  assert.throws(()=>summarizeBackendMetafile(v,"worker",root,packages,artifact));
});
test("the exact shared circuit-control source is classified separately without admitting arbitrary services",()=>{
  const v=fixture(),id="services/operations/circuit_control/src/store.ts";v.inputs[id]={bytes:5};v.outputs["services/worker/bundle/main.mjs"].inputs[id]={bytesInOutput:2};
  assert.equal(summarizeBackendMetafile(v,"worker",root,packages,artifact).categories.circuitControlSource,1);
  delete v.inputs[id];delete v.outputs["services/worker/bundle/main.mjs"].inputs[id];
  const unrelated="services/unknown/src/private.ts";v.inputs[unrelated]={bytes:5};v.outputs["services/worker/bundle/main.mjs"].inputs[unrelated]={bytesInOutput:2};
  assert.throws(()=>summarizeBackendMetafile(v,"worker",root,packages,artifact));
});
test("wrong artifact, missing/extra outputs, unknown dependencies and source escapes cannot pass",()=>{
  const changes=[v=>v.outputs["services/worker/bundle/main.mjs"].bytes=51,v=>v.outputs["extra/main.mjs"]=v.outputs["services/worker/bundle/main.mjs"],
    v=>v.outputs["services/worker/bundle/main.mjs"].entryPoint="services/controller/src/main.ts",v=>v.outputs["services/worker/bundle/main.mjs"].imports=[{path:"private-network-module",external:true}],
    v=>v.outputs["services/worker/bundle/main.mjs"].imports=[{path:"node:module",external:false}],v=>v.inputs["services/worker/src/main.ts"].bytes=-1,
    v=>v.outputs["services/worker/bundle/main.mjs"].inputs["services/worker/src/main.ts"].bytesInOutput=100,
    v=>{v.inputs["../../PRIVATE_SENTINEL"]={bytes:10};v.outputs["services/worker/bundle/main.mjs"].inputs["../../PRIVATE_SENTINEL"]={bytesInOutput:1};}];
  for(const change of changes){const v=fixture();change(v);assert.throws(()=>summarizeBackendMetafile(v,"worker",root,packages,artifact),/BACKEND_MODULE_PROOF_INCOMPLETE/);}
  for(const input of [{...packages[0],license:"PRIVATE_SENTINEL"},{...packages[0],name:"PRIVATE_SENTINEL"},{...packages[0],version:"PRIVATE_SENTINEL"}]){
    assert.throws(()=>summarizeBackendMetafile(fixture(),"worker",root,[input],artifact));}
});
test("unclassified or overlapping package roots and arbitrary service selectors fail without reflecting input",()=>{
  assert.throws(()=>summarizeBackendMetafile(fixture(),"PRIVATE_SENTINEL",root,packages,artifact));
  assert.throws(()=>summarizeBackendMetafile(fixture(),"worker",root,[],artifact));
  assert.throws(()=>summarizeBackendMetafile(fixture(),"worker",root,[...packages,{...packages[0],directory:resolve(directory,"..")}],artifact));
  const changed=[{...packages[0],directory:resolve(root,"unrelated")}];assert.throws(()=>summarizeBackendMetafile(fixture(),"worker",root,changed,artifact));
});
test("no emitted service/package and malformed contribution cannot pretend complete attribution",()=>{
  for(const id of ["services/worker/src/main.ts","node_modules/.pnpm/runtime@1.0.0/node_modules/runtime/main.js"]){const v=fixture();v.outputs["services/worker/bundle/main.mjs"].inputs[id].bytesInOutput=0;
    assert.throws(()=>summarizeBackendMetafile(v,"worker",root,packages,artifact));}
  const v=fixture();delete v.inputs["shared/types.ts"];assert.throws(()=>summarizeBackendMetafile(v,"worker",root,packages,artifact));
});
