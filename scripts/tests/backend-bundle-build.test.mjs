import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import { existsSync, linkSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve } from "node:path";
import test from "node:test";
import { buildBackendBundle } from "../backend-bundle-build.mjs";
import { REVIEWED_WORKER_DOCKERFILE_SHA256 } from "../public-base-notice-proof.mjs";

const buildEntry = resolve("scripts/build-worker-bundle.mjs");
async function fixture(operation) {
  const base = realpathSync(tmpdir()), root = mkdtempSync(join(base, "gmai-backend-build-")), token = randomUUID();
  writeFileSync(join(root, ".fixture-owner"), token, {flag:"wx"});
  try {
    mkdirSync(join(root, "services/worker/src"), {recursive:true});
    writeFileSync(join(root, "services/worker/src/main.ts"), "export const fixture = 'SYNTHETIC_BUILD';\n");
    writeFileSync(join(root, "THIRD_PARTY_NOTICES.md"), "SYNTHETIC_NOTICE\n");
    mkdirSync(join(root, "node_modules/@aws-sdk"), {recursive:true});
    for (const name of ["client-bedrock-runtime", "client-ecs", "client-dynamodb"]) {
      const dependency = join(root, "node_modules/.pnpm/synthetic/node_modules/@aws-sdk", name);
      mkdirSync(dependency, {recursive:true}); writeFileSync(join(dependency, "LICENSE"), "SYNTHETIC_LICENSE\n");
      symlinkSync(dependency, join(root, "node_modules/@aws-sdk", name), "junction");
    }
    return await operation(root);
  } finally {
    assert.equal(realpathSync(root), root); assert.equal(lstatSync(root).isSymbolicLink(), false);
    assert.equal(relative(base, root), basename(root)); assert.match(basename(root), /^gmai-backend-build-[A-Za-z0-9]+$/);
    assert.equal(readFileSync(join(root, ".fixture-owner"), "utf8"), token);
    rmSync(root, {recursive:true}); assert.equal(existsSync(root), false);
  }
}
function run(root, args = [], environment = {}) {
  return spawnSync(process.execPath, [buildEntry, ...args], {cwd:root, env:{...process.env,...environment}, encoding:"utf8", windowsHide:true, timeout:15000, maxBuffer:100000});
}

test("an inherited compiler executable override is rejected before compilation or output creation", () => fixture(root => {
  const result=run(root,[],{ESBUILD_BINARY_PATH:"SYNTHETIC_PRIVATE_BINARY"});
  assert.equal(result.status,1); assert.equal(result.stderr.includes("SYNTHETIC_PRIVATE_BINARY"),false);
  assert.equal(existsSync(join(root,"services/worker/bundle")),false);
}));

test("redirected bundle directory fails before an existing outside file can be overwritten", () => fixture(root => {
  const outside = join(root, "outside"), bundle = join(root, "services/worker/bundle");
  mkdirSync(outside); writeFileSync(join(outside, "main.mjs"), "SYNTHETIC_PRESERVED\n");
  symlinkSync(outside, bundle, "junction"); const result = run(root);
  assert.equal(result.status, 1);
  assert.equal(readFileSync(join(outside, "main.mjs"), "utf8"), "SYNTHETIC_PRESERVED\n");
  assert.deepEqual(readdirSync(outside), ["main.mjs"]);
}));

test("four fixed targets preserve exact notices and readable output without retained staging or app execution", () => fixture(async root => {
  for (const [service, directory, entry] of [["worker","services/worker","main.ts"], ["controller","services/controller","main.ts"],
    ["sweeper","services/operations/sweeper","handler.ts"], ["alarm-circuit","services/operations/alarm_circuit","handler.ts"]]) {
    mkdirSync(join(root,directory,"src"), {recursive:true});
    writeFileSync(join(root,directory,"src",entry), "throw Error('SYNTHETIC_NEVER_EXECUTED'); export const fixture=1;\n");
    const report = await buildBackendBundle(service,root), output=join(root,directory,"bundle");
    assert.equal(report.generatedFiles,3); assert.equal(report.applicationExecuted,false); assert.equal(report.externalNetworkCalls,0);
    assert.equal(report.completeAttributionVerified,false); assert.equal(report.readyForPublication,false);
    assert.deepEqual(readdirSync(output).sort(), ["THIRD_PARTY_NOTICES.md","licenses","main.mjs"]);
    assert.deepEqual(readdirSync(join(output,"licenses")), ["AWS-SDK-JS-V3-APACHE-2.0.txt"]);
    assert.equal(readFileSync(join(output,"THIRD_PARTY_NOTICES.md"),"utf8"), "SYNTHETIC_NOTICE\n");
    assert.equal(readFileSync(join(output,"licenses/AWS-SDK-JS-V3-APACHE-2.0.txt"),"utf8"), "SYNTHETIC_LICENSE\n");
    if(process.platform!=="win32") assert.equal(lstatSync(join(output,"main.mjs")).mode & 0o777, 0o644);
    const first=readFileSync(join(output,"main.mjs")); await buildBackendBundle(service,root);
    assert.ok(first.equals(readFileSync(join(output,"main.mjs"))));
  }
}));

test("a hard-linked generated file is rejected without truncating its other name", () => fixture(root => {
  const output=join(root,"services/worker/bundle"), outside=join(root,"outside.mjs");
  mkdirSync(output); writeFileSync(outside,"SYNTHETIC_PRESERVED\n"); linkSync(outside,join(output,"main.mjs"));
  const result=run(root); assert.equal(result.status,1);
  assert.equal(readFileSync(outside,"utf8"),"SYNTHETIC_PRESERVED\n");
  assert.equal(existsSync(join(output,"THIRD_PARTY_NOTICES.md")),false);
}));

test("a redirected notice directory cannot publish outside the fixed bundle scope", () => fixture(root => {
  const output=join(root,"services/worker/bundle"), outside=join(root,"outside");
  mkdirSync(output); mkdirSync(outside); symlinkSync(outside,join(output,"licenses"),"junction");
  assert.equal(run(root).status,1); assert.deepEqual(readdirSync(outside),[]);
  assert.equal(existsSync(join(output,"main.mjs")),false);
}));

test("redirected source parents are refused before any output directory is created", () => fixture(root => {
  const outside=join(root,"outside"), source=join(root,"services/worker/src");
  mkdirSync(outside); writeFileSync(join(outside,"main.ts"),"export const fixture=1;");
  rmSync(source,{recursive:true}); symlinkSync(outside,source,"junction");
  assert.equal(run(root).status,1); assert.equal(existsSync(join(root,"services/worker/bundle")),false);
}));

test("an upstream notice redirected outside the owned package store is not copied", () => fixture(root => {
  const packagePath=join(root,"node_modules/.pnpm/synthetic/node_modules/@aws-sdk/client-bedrock-runtime");
  const outside=join(root,"outside"); mkdirSync(outside); writeFileSync(join(outside,"LICENSE"),"SYNTHETIC_PRESERVED");
  rmSync(packagePath,{recursive:true}); symlinkSync(outside,packagePath,"junction");
  assert.equal(run(root).status,1); assert.equal(existsSync(join(root,"services/worker/bundle")),false);
}));

test("compiler errors and unknown arguments cannot expose source text or leave outputs", () => fixture(root => {
  writeFileSync(join(root,"services/worker/src/main.ts"),"SYNTHETIC_PRIVATE_SENTINEL {{{");
  for(const args of [[],["SYNTHETIC_PRIVATE_SENTINEL"]]) {
    const result=run(root,args); assert.equal(result.status,1); assert.equal(result.stdout,"");
    assert.equal(result.stderr.includes("SYNTHETIC_PRIVATE_SENTINEL"),false);
    assert.equal(JSON.parse(result.stderr).error,"BACKEND_BUILD_UNVERIFIED");
  }
  assert.equal(existsSync(join(root,"services/worker/bundle/main.mjs")),false);
  assert.equal(readdirSync(join(root,"services/worker/bundle")).some(name=>name.startsWith(".gmai-build-")),false);
}));

test("invalid targets, relative roots and null values fail without creating caller-selected paths", async () => {
  for(const [target,root] of [["__proto__",process.cwd()],["PRIVATE_SENTINEL",process.cwd()],["worker","."],["worker",null]])
    await assert.rejects(buildBackendBundle(target,root), /^Error: BACKEND_BUILD_UNVERIFIED$/);
});

test("the shared builder imports inertly and the container copies its fixed dependency", () => {
  const imported=spawnSync(process.execPath,["--input-type=module","-e",'await import("./scripts/backend-bundle-build.mjs");'],
    {encoding:"utf8",windowsHide:true,timeout:5000});
  assert.equal(imported.status,0); assert.equal(imported.stdout,""); assert.equal(imported.stderr,"");
  assert.match(readFileSync("services/worker/Dockerfile","utf8"),/^COPY scripts\/backend-bundle-build.mjs \.\/scripts\/backend-bundle-build.mjs$/m);
  const current=readFileSync("services/worker/Dockerfile","utf8"), line="COPY scripts/backend-bundle-build.mjs ./scripts/backend-bundle-build.mjs\n";
  assert.equal(current.split(line).length-1,1);
  const sha=bytes=>createHash("sha256").update(bytes).digest("hex");
  assert.equal(sha(current),REVIEWED_WORKER_DOCKERFILE_SHA256);
  // Both FROM/security comments were reviewed on 2026-10-22. Still require
  // exactly one COPY and the full reviewed file, not a relaxed substring gate.
  assert.equal(sha(current.replace(line,"")),"5fa215f86d1d9a1d34ce8ad434ff16b307b845e7188c24d8fc89e600f4d33b20");
});
