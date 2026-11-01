import assert from "node:assert/strict";
import {test} from "node:test";
import {ownerAcceptancePlan,reviewExecutedOwnerUpdate,verifyOwnerGets} from "../private-owner-acceptance.js";
import {ownerFixture} from "./fixtures/owner-review.js";
import catalog from "../../shared/asset_catalog/assets.json" with {type:"json"};
const clone=<T>(v:T):T=>JSON.parse(JSON.stringify(v));
const zip="b".repeat(64),now=Date.parse("2026-10-25T06:02:00Z");
function fixture(){const f=ownerFixture();const s:any={...f,live:f.proposed,refs:{privateOwnerConfigurationMatchesCaller:true}};
  s.stack.ChangeSetId=f.draft.ChangeSetId;s.stack.LastUpdatedTime=new Date(now-1000).toISOString();
  s.runtime.Environment=clone(f.proposed.Resources.ControllerFunctionC25B79B1.Properties.Environment);
  s.runtime.CodeSha256=Buffer.from(zip,"hex").toString("base64");
  const draft={...f.draft,ExecutionStatus:"EXECUTE_COMPLETE"};return{s,draft};}
test("default plan has no AWS or HTTP side effects",()=>{const p=ownerAcceptancePlan();assert.equal(p.awsCalls,0);assert.equal(p.httpCalls,0);assert.equal(p.cloudMutations,0)});
test("independent executed scope proof never claims to recover lost full stack baseline",()=>{
  const {s,draft}=fixture(),p=reviewExecutedOwnerUpdate(s,draft,zip,now);
  assert.equal(p.executedChangeSetScopeVerified,true);assert.equal(p.historicalFullStackBaselineRecovered,false);assert.equal(p.redeploymentPerformed,false);
});
test("resolved change-set environments are not substituted for template references",()=>{
  const {s,draft}=fixture();
  s.live.Resources.ControllerFunctionC25B79B1.Properties.Environment.Variables.TABLE={Ref:"Table"};
  s.runtime.Environment.Variables.TABLE="resolved-table";
  for(const key of ["BeforeContext","AfterContext"]){const c=JSON.parse(draft.Changes[0].ResourceChange[key]);c.Properties.Environment.Variables.TABLE="resolved-table";draft.Changes[0].ResourceChange[key]=JSON.stringify(c);}
  assert.equal(reviewExecutedOwnerUpdate(s,draft,zip,now).executedChangeSetScopeVerified,true);
});
test("reconciliation rejects different artifact, execution, owner, time and extra resolved changes",()=>{
  for(const mutate of [(s:any,d:any)=>{s.runtime.CodeSha256="wrong"},(s:any,d:any)=>{d.ExecutionStatus="AVAILABLE"},
    (s:any,d:any)=>{s.refs.privateOwnerConfigurationMatchesCaller=false},(s:any,d:any)=>{d.CreationTime=new Date(now+1).toISOString()},
    (s:any,d:any)=>{d.CreationTime=new Date(now-86400001).toISOString()},(s:any,d:any)=>{const c=JSON.parse(d.Changes[0].ResourceChange.AfterContext);c.Properties.Runtime="nodejs18.x";d.Changes[0].ResourceChange.AfterContext=JSON.stringify(c)},
    (s:any,d:any)=>{d.Changes.push(clone(d.Changes[0]))},(s:any,d:any)=>{s.runtime.Environment.Variables.PRIVATE_OWNER_USER_ARN+="other"}]){
    const {s,draft}=fixture();mutate(s,draft);assert.throws(()=>reviewExecutedOwnerUpdate(s,draft,zip,now),/^Error: PRIVATE_OWNER_/);
  }
});
test("acceptance calls only two signed GETs and one anonymous GET",async()=>{
  const calls:string[]=[],p=await verifyOwnerGets({request:async(method,path)=>{calls.push(`${method} ${path}`);return path==="v1/assets"?catalog:{status:"ok",circuit:"OPEN",jobCreationEnabled:false};}},async()=>{calls.push("anonymous GET");return 403;});
  assert.deepEqual(calls,["GET v1/assets","GET v1/health","anonymous GET"]);assert.equal(p.postCalls,0);assert.equal(p.realSignedSecondPrincipalTested,false);
});
test("unsafe health or malformed catalog fails before later requests",async()=>{
  for(const bad of [{status:"ok",circuit:"CLOSED",jobCreationEnabled:false},{status:"ok",circuit:"OPEN",jobCreationEnabled:true}]){
    let anonymousCalls=0;await assert.rejects(()=>verifyOwnerGets({request:async(_m,p)=>p==="v1/assets"?catalog:bad},async()=>{anonymousCalls++;return 403}),/HEALTH_NOT_SAFE/);assert.equal(anonymousCalls,0);
  }
  await assert.rejects(()=>verifyOwnerGets({request:async()=>({})},async()=>403),/CATALOG_INVALID/);
  await assert.rejects(()=>verifyOwnerGets({request:async(_m,p)=>p==="v1/assets"?catalog:{status:"ok",circuit:"OPEN",jobCreationEnabled:false}},async()=>200),/ANONYMOUS_NOT_DENIED/);
});
