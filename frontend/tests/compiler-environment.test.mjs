import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { frontendCompilerChildEnvironment } from "../scripts/compiler-environment.mjs";
import { frontendViteCommandPlan,runFrontendViteCommand } from "../scripts/vite-command.mjs";
import { cleanSourceChildEnvironment } from "../../scripts/local-proof-environment.mjs";

const root=fileURLToPath(new URL("../../",import.meta.url));
function child(program) {
  return spawnSync(process.execPath,["--input-type=module","--eval",program],{cwd:root,
    env:cleanSourceChildEnvironment(process.env),encoding:"utf8",windowsHide:true,timeout:10000,maxBuffer:3000});
}

test("frontend child keeps bootstrap paths, excludes credentials/preloads/proxies and enforces native version matching",()=>{
  const source={SystemRoot:"C:\\Windows",PATH:"C:\\trusted",AWS_ACCESS_KEY_ID:"PRIVATE_SENTINEL",
    AWS_SESSION_TOKEN:"PRIVATE_SENTINEL",TWELVE_DATA_API_KEY:"PRIVATE_SENTINEL",VITE_PRIVATE:"PRIVATE_SENTINEL",
    NODE_OPTIONS:"--require PRIVATE_SENTINEL",NODE_PATH:"PRIVATE_SENTINEL",HTTP_PROXY:"PRIVATE_SENTINEL",CONSOLA_LEVEL:"PRIVATE_SENTINEL"};
  const before=structuredClone(source),env=frontendCompilerChildEnvironment(source);
  assert.deepEqual(source,before);assert.equal(env.SystemRoot,source.SystemRoot);assert.equal(env.PATH,source.PATH);
  assert.equal(env.NODE_TLS_REJECT_UNAUTHORIZED,"1");assert.equal(env.NAPI_RS_ENFORCE_VERSION_CHECK,"1");
  for(const name of ["AWS_ACCESS_KEY_ID","AWS_SESSION_TOKEN","TWELVE_DATA_API_KEY","VITE_PRIVATE","NODE_OPTIONS","NODE_PATH","HTTP_PROXY"])
    assert.equal(env[name],undefined);
  assert.equal(JSON.stringify(env).includes("PRIVATE_SENTINEL"),false);
});

test("native-path, WASI, build and test overrides are rejected case-insensitively, not silently forwarded",()=>{
  for(const name of ["NAPI_RS_NATIVE_LIBRARY_PATH","NAPI_RS_FORCE_WASI","NAPI_RS_WASI_FLAVOR","NAPI_RS_ENFORCE_VERSION_CHECK",
    "napi_rs_native_library_path","ROLLDOWN_TEST","rolldown_other","ESBUILD_BINARY_PATH","npm_config_esbuild_binary_path"]) {
    for(const value of ["PRIVATE_SENTINEL","0",false,null])
      assert.throws(()=>frontendCompilerChildEnvironment({[name]:value}),/^Error: FRONTEND_COMPILER_ENVIRONMENT_REJECTED$/);
    const env=frontendCompilerChildEnvironment({[name]:""});
    assert.equal(env[name],name==="NAPI_RS_ENFORCE_VERSION_CHECK"?"1":undefined);
  }
  for(const value of [null,[],"PRIVATE_SENTINEL"])assert.throws(()=>frontendCompilerChildEnvironment(value));
});

test("all supported build/dev/preview paths reject native overrides before any subprocess or file mutation",()=>{
  const r=child('import cp from"node:child_process";import fs from"node:fs";import{syncBuiltinESMExports}from"node:module";'+
    'let calls=0;cp.spawnSync=()=>{calls++;throw Error("PRIVATE_SENTINEL")};fs.writeFileSync=()=>{calls++;throw Error("PRIVATE_SENTINEL")};'+
    'syncBuiltinESMExports();const{buildFrontend}=await import("./frontend/scripts/build.mjs");'+
    'const{runFrontendViteCommand:run}=await import("./frontend/scripts/vite-command.mjs");'+
    'process.env.NAPI_RS_NATIVE_LIBRARY_PATH="PRIVATE_SENTINEL";'+
    'for(const op of[()=>buildFrontend(),()=>run("dev"),()=>run("preview")]){try{await op();throw Error("UNEXPECTED_SUCCESS")}'+
    'catch(e){if(e.message!=="FRONTEND_COMPILER_ENVIRONMENT_REJECTED")throw e;}}'+
    'if(calls)throw Error("UNEXPECTED_EFFECT");console.log("BLOCKED_BEFORE_EFFECTS");');
  assert.equal(r.status,0);assert.equal(r.stdout.trim(),"BLOCKED_BEFORE_EFFECTS");assert.equal(r.stderr,"");
});

test("normal dev/preview wrappers use only the fixed Vite CLI, command and scrubbed environment",()=>{
  const r=child('import cp from"node:child_process";import{syncBuiltinESMExports}from"node:module";import assert from"node:assert/strict";'+
    'const seen=[];cp.spawnSync=(exe,args,options)=>{seen.push({exe,args,options});return{status:0,signal:null}};syncBuiltinESMExports();'+
    'const{runFrontendViteCommand:run}=await import("./frontend/scripts/vite-command.mjs");'+
    'process.env.AWS_SESSION_TOKEN="PRIVATE_SENTINEL";process.env.NODE_OPTIONS="--require PRIVATE_SENTINEL";'+
    'assert.equal(run("dev"),0);assert.equal(run("preview"),0);assert.equal(seen.length,2);'+
    'for(const [i,row]of seen.entries()){assert.equal(row.exe,process.execPath);assert.equal(row.args.length,i+1);'+
    'assert.match(row.args[0],/frontend[\\\\/]node_modules[\\\\/]vite[\\\\/]bin[\\\\/]vite.js$/);'+
    'assert.equal(row.options.env.AWS_SESSION_TOKEN,undefined);assert.equal(row.options.env.NODE_OPTIONS,undefined);'+
    'assert.equal(row.options.env.NAPI_RS_ENFORCE_VERSION_CHECK,"1");assert.equal(row.options.windowsHide,true);}'+
    'assert.equal(seen[1].args[1],"preview");console.log("FIXED_CHILDREN_ONLY");');
  assert.equal(r.status,0);assert.equal(r.stdout.trim(),"FIXED_CHILDREN_ONLY");assert.equal(r.stderr,"");
});

test("build uses the same scrubbed environment and does not replace artifacts after a failed child",()=>{
  const r=child('import cp from"node:child_process";import fs from"node:fs";import{syncBuiltinESMExports}from"node:module";import assert from"node:assert/strict";'+
    'let calls=0,writes=0;cp.spawnSync=(exe,args,options)=>{calls++;assert.equal(args.at(-1),"build");'+
    'assert.equal(options.env.AWS_SESSION_TOKEN,undefined);assert.equal(options.env.NODE_OPTIONS,undefined);'+
    'assert.equal(options.env.NAPI_RS_ENFORCE_VERSION_CHECK,"1");return{status:1,signal:null}};'+
    'fs.writeFileSync=()=>{writes++;throw Error("PRIVATE_SENTINEL")};syncBuiltinESMExports();'+
    'const{buildFrontend}=await import("./frontend/scripts/build.mjs");process.env.AWS_SESSION_TOKEN="PRIVATE_SENTINEL";'+
    'process.env.NODE_OPTIONS="--require PRIVATE_SENTINEL";await assert.rejects(buildFrontend(),/^Error: FRONTEND_BUILD_UNVERIFIED$/);'+
    'assert.equal(calls,1);assert.equal(writes,0);console.log("OLD_ARTIFACT_PRESERVED");');
  assert.equal(r.status,0);assert.equal(r.stdout.trim(),"OLD_ARTIFACT_PRESERVED");assert.equal(r.stderr,"");
});

test("documented commands are wired to guards; imports/default plan and unsupported arguments never start servers",()=>{
  const manifest=JSON.parse(readFileSync(new URL("../package.json",import.meta.url)));
  assert.equal(manifest.scripts.dev,"node scripts/vite-command.mjs dev");
  assert.equal(manifest.scripts.preview,"node scripts/vite-command.mjs preview");
  assert.equal(manifest.scripts.build,"node scripts/build.mjs");
  assert.equal(frontendViteCommandPlan().subprocessesStarted,0);
  for(const command of ["build","PRIVATE_SENTINEL",undefined])assert.throws(()=>runFrontendViteCommand(command));
  for(const args of [[],["PRIVATE_SENTINEL"],["dev","--host","0.0.0.0"]]) {
    const r=spawnSync(process.execPath,["frontend/scripts/vite-command.mjs",...args],{
      cwd:root,env:cleanSourceChildEnvironment(process.env),encoding:"utf8",windowsHide:true,timeout:10000});
    assert.equal(r.status,args.length?1:0);assert.equal((r.stdout+r.stderr).includes("PRIVATE_SENTINEL"),false);
  }
  const imported=child('await import("./frontend/scripts/build.mjs");await import("./frontend/scripts/vite-command.mjs");');
  assert.equal(imported.status,0);assert.equal(imported.stdout,"");assert.equal(imported.stderr,"");
});

test("unsupported Node versions stop before frontend environment or child setup",()=>{
  const r=child('const{frontendCompilerChildEnvironment:f}=await import("./frontend/scripts/compiler-environment.mjs");'+
    'Object.defineProperty(process.versions,"node",{value:"24.19.0"});try{f();throw Error("UNEXPECTED_SUCCESS")}'+
    'catch(e){if(e.message!=="PROJECT_NODE_SECURITY_BASELINE_REQUIRED")throw e;}console.log("OLD_NODE_BLOCKED");');
  assert.equal(r.status,0);assert.equal(r.stdout.trim(),"OLD_NODE_BLOCKED");assert.equal(r.stderr,"");
});
