import { createHash } from "node:crypto";
import { closeSync, fstatSync, lstatSync, openSync, readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import { readLocalDependencyLock } from "./dependency-license-inventory.mjs";
import { collectFrontendHelperProducers } from "./frontend-helper-attribution.mjs";
import { inspectPinnedPackageArchive } from "./pinned-package-archive.mjs";
import { assertNodeSecurityBaseline } from "./node-security-baseline.mjs";

// Lint-only Zod refresh; all three fixed compiler target records are unchanged.
// 2026-11-01: minimatch local backport; public coordinate body and declared
// runtime BOM hashes are unchanged. This binding is not new network consent.
const REVIEWED_LOCK = "9739b078cbca97d4e7d4b40f4c2b81a88a946faa843ee546ac5a0cbf5c0cfba2";
const ROLLDOWN_REPOSITORY = "git+https://github.com/rolldown/rolldown.git";
export const FRONTEND_COMPILER_TARGETS = Object.freeze([
  Object.freeze({ name:"vite", version:"8.2.4", license:"MIT", repository:"git+https://github.com/vitejs/vite.git",
    tarball:"https://registry.npmjs.org/vite/-/vite-8.2.4.tgz",
    files:Object.freeze(["package.json","bin/vite.js","dist/node/index.js","LICENSE.md"]) }),
  Object.freeze({ name:"rolldown", version:"1.2.14", license:"MIT", repository:ROLLDOWN_REPOSITORY,
    tarball:"https://registry.npmjs.org/rolldown/-/rolldown-1.2.14.tgz",
    files:Object.freeze(["package.json","dist/index.mjs","dist/shared/binding-CUpfdq6A.mjs","LICENSE","THIRD-PARTY-LICENSE"]) }),
  Object.freeze({ name:"@rolldown/binding-win32-x64-msvc", version:"1.2.14", license:"MIT", repository:ROLLDOWN_REPOSITORY,
    tarball:"https://registry.npmjs.org/@rolldown/binding-win32-x64-msvc/-/binding-win32-x64-msvc-1.2.14.tgz",
    files:Object.freeze(["package.json","rolldown-binding.win32-x64-msvc.node"]) }),
]);
const known = target => FRONTEND_COMPILER_TARGETS.includes(target);
const native = target => target === FRONTEND_COMPILER_TARGETS[2];
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const json = bytes => JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));
const fail = () => { throw Error("FRONTEND_COMPILER_BYTE_PROOF_INCOMPLETE"); };
const inside = (base,path) => { const p=relative(base,path);return !!p && !isAbsolute(p) && p!==".." && !p.startsWith(`..${sep}`); };
const statId = stat => [stat.dev,stat.ino,stat.size,stat.mtimeNs,stat.ctimeNs].map(String).join(":");

export function frontendCompilerByteProofPlan(args=[]) {
  if(args.length) fail();
  return { mode:"dry-run", awsCalls:0, publicRegistryRequests:0, publicRegistryReadsMax:6,
    targets:FRONTEND_COMPILER_TARGETS.map(({name,version})=>({name,version})), selectedOwnPackageFiles:11,
    platformScope:"installed-windows-x64-frontend-compiler", filesWritten:0, packagesInstalled:0,
    downloadedCodeExecuted:false, entireBuildDependencyGraphVerified:false, readyForPublication:false };
}

// Fixed selected public package files only; never follow a redirected ancestor.
// This does not inspect arbitrary installation-added node_modules/private files.
function regular(path,store,maximum) {
  if(!inside(store,path)) fail();
  for(let current=dirname(path);;current=dirname(current)) {
    const stat=lstatSync(current);
    if(!stat.isDirectory()||stat.isSymbolicLink()||realpathSync(current)!==current) fail();
    if(current===store) break;
    if(!inside(store,current)) fail();
  }
  const before=lstatSync(path,{bigint:true});
  if(!before.isFile()||before.isSymbolicLink()||realpathSync(path)!==path||before.size<1n||before.size>BigInt(maximum)) fail();
  const handle=openSync(path,"r");let bytes;
  try {
    if(statId(fstatSync(handle,{bigint:true}))!==statId(before)) fail();
    bytes=readFileSync(handle);
    if(bytes.length!==Number(before.size)||statId(fstatSync(handle,{bigint:true}))!==statId(before)) fail();
  }finally{closeSync(handle);}
  const after=lstatSync(path,{bigint:true});
  if(!after.isFile()||after.isSymbolicLink()||realpathSync(path)!==path||statId(before)!==statId(after)) fail();
  return bytes;
}

function capture(root) {
  if(process.platform!=="win32"||process.arch!=="x64"||typeof root!=="string"||!isAbsolute(root)||realpathSync(root)!==root) fail();
  const {lock,lockfileSha256}=readLocalDependencyLock(root);
  if(lockfileSha256!==REVIEWED_LOCK) fail();
  const helpers=collectFrontendHelperProducers(root).report;
  if(helpers.lockfileSha256!==lockfileSha256) fail();
  const store=join(root,"node_modules/.pnpm");
  const req=createRequire(join(root,"frontend/package.json")),vite=req.resolve("vite/package.json");
  const rolldown=createRequire(vite).resolve("rolldown/package.json");
  const paths=[vite,rolldown,createRequire(rolldown).resolve("@rolldown/binding-win32-x64-msvc/package.json")];
  const tools=FRONTEND_COMPILER_TARGETS.map((target,index)=>{
    const path=paths[index],directory=dirname(path),manifest=json(regular(path,store,100_000));
    const integrity=lock.packages?.[`${target.name}@${target.version}`]?.resolution?.integrity;
    if(manifest.name!==target.name||manifest.version!==target.version||manifest.license!==target.license||
      manifest.repository?.url!==target.repository||!/^sha512-[A-Za-z0-9+/]{86}==$/.test(integrity??"")) fail();
    if(index===1&&manifest.optionalDependencies?.[FRONTEND_COMPILER_TARGETS[2].name]!=="1.2.14") fail();
    if(native(target)&&(JSON.stringify(manifest.os)!=='["win32"]'||JSON.stringify(manifest.cpu)!=='["x64"]'||
      manifest.main!==target.files[1])) fail();
    return {name:target.name,version:target.version,integrity,files:target.files.map(name=>{
      const bytes=regular(join(directory,name),store,native(target)?24_000_000:5_000_000);
      return {path:name,bytes:bytes.length,sha256:hash(bytes)};
    })};
  });
  return {lockfileSha256,helpers,tools};
}

export function verifyFrontendCompilerMetadata(target,metadata,integrity) {
  if(!known(target)||metadata?.name!==target.name||metadata?.version!==target.version||metadata?.license!=="MIT"||
    metadata?.repository?.url!==target.repository||metadata?.dist?.tarball!==target.tarball||
    metadata?.dist?.integrity!==integrity||!/^sha512-[A-Za-z0-9+/]{86}==$/.test(integrity??"")) fail();
  if(native(target)&&(JSON.stringify(metadata.os)!=='["win32"]'||JSON.stringify(metadata.cpu)!=='["x64"]'||
    metadata.main!==target.files[1])) fail();
}

export function compareFrontendCompilerArchive(target,compressed,integrity,installed) {
  if(!known(target)||installed?.name!==target.name||installed?.version!==target.version||
    !Array.isArray(installed.files)||installed.files.length!==target.files.length) fail();
  const archive=inspectPinnedPackageArchive(target,compressed,integrity,native(target)?"reviewed-frontend-native-compiler":"frontend-helper");
  if(archive.manifest?.repository?.url!==target.repository) fail();
  if(native(target)&&(archive.manifest.main!==target.files[1]||JSON.stringify(archive.manifest.os)!=='["win32"]'||
    JSON.stringify(archive.manifest.cpu)!=='["x64"]')) fail();
  for(const path of target.files) {
    const local=installed.files.filter(file=>file?.path===path),published=archive.regularFiles.filter(file=>file.path===path);
    if(local.length!==1||published.length!==1||!Number.isSafeInteger(local[0].bytes)||local[0].bytes<1||
      !/^[a-f0-9]{64}$/.test(local[0].sha256??"")||local[0].bytes!==published[0].bytes||local[0].sha256!==published[0].sha256) fail();
  }
  return {name:target.name,version:target.version,tarballSha256:archive.tarballSha256,
    lockedArchiveIntegrityMatched:true,selectedInstalledFilesMatched:target.files.length,
    selectedBytesMatched:installed.files.reduce((sum,row)=>sum+row.bytes,0),
    ...(native(target)?{nativeBinarySha256:installed.files.find(row=>row.path===target.files[1]).sha256}:{}),
    rootLicenseDocumentPresent:archive.rootDocuments.some(doc=>/^LICENSE(?:[._-]|$)/i.test(doc.name)),
    entireInstalledPackageFileSetVerified:false,archiveExtracted:false,packageCodeExecuted:false,installedFilesModified:false};
}

export async function fetchFrontendCompilerBytes(target,kind,fetcher=fetch,remainingMs=20_000) {
  if(!known(target)||!["metadata","tarball"].includes(kind)||!Number.isFinite(remainingMs)||remainingMs<=0) fail();
  const url=kind==="metadata"?`https://registry.npmjs.org/${encodeURIComponent(target.name)}/${target.version}`:target.tarball;
  const maximum=kind==="metadata"?100_000:native(target)?16_000_000:5_000_000;
  let reader;
  try {
    const response=await fetcher(url,{redirect:"error",credentials:"omit",referrerPolicy:"no-referrer",
      signal:AbortSignal.timeout(Math.max(1,Math.floor(Math.min(20_000,remainingMs)))),
      headers:{Accept:kind==="metadata"?"application/json":"application/octet-stream","Accept-Encoding":"identity"}});
    reader=response.body?.getReader();
    const type=(response.headers.get("content-type")??"").split(";")[0].trim().toLowerCase();
    const encoding=response.headers.get("content-encoding"),length=response.headers.get("content-length");
    if(response.status!==200||!reader||(response.url&&response.url!==url)||(encoding&&encoding!=="identity")||
      (kind==="metadata"?type!=="application/json":!["application/octet-stream","application/gzip","application/x-gzip"].includes(type))||
      (length!==null&&(!/^\d{1,9}$/.test(length)||Number(length)>maximum))) fail();
    const chunks=[];let size=0;
    for(;;){const {done,value}=await reader.read();if(done)break;
      if(!(value instanceof Uint8Array)||chunks.length>=4096||(size+=value.byteLength)>maximum) fail();
      chunks.push(Buffer.from(value));
    }
    if(size<1||(length!==null&&size!==Number(length))) fail();
    return Buffer.concat(chunks);
  }catch{fail();}
  finally{try{await reader?.cancel();}catch{}try{reader?.releaseLock();}catch{}}
}

export async function collectFrontendCompilerByteProof(root=process.cwd(),fetcher=fetch) {
  assertNodeSecurityBaseline();
  try {
    const started=performance.now(),before=capture(root),results=[];let requests=0,downloadedBytes=0;
    for(const [index,target] of FRONTEND_COMPILER_TARGETS.entries()) {
      const read=async kind=>{if(++requests>6)fail();const bytes=await fetchFrontendCompilerBytes(target,kind,fetcher,90_000-(performance.now()-started));
        if((downloadedBytes+=bytes.length)>27_000_000)fail();return bytes;};
      const metadata=json(await read("metadata")),installed=before.tools[index];
      verifyFrontendCompilerMetadata(target,metadata,installed.integrity);
      results.push(compareFrontendCompilerArchive(target,await read("tarball"),installed.integrity,installed));
    }
    if(performance.now()-started>90_000||JSON.stringify(capture(root))!==JSON.stringify(before)) fail();
    return {mode:"official-selected-frontend-compiler-byte-proof",observedAtUtc:new Date().toISOString(),awsCalls:0,
      publicRegistryRequests:requests,downloadedBytes,lockfileSha256:before.lockfileSha256,installedStateRechecked:true,
      platformScope:"installed-windows-x64-frontend-compiler",results,selectedOwnPackageFiles:11,
      entireBuildDependencyGraphVerified:false,publisherSignatureVerified:false,sourceToBinaryBuildReproduced:false,
      nativeCompilerActuallyUsedAttested:false,generatedHelperRightsComplete:false,filesWritten:0,packagesInstalled:0,
      downloadedCodeExecuted:false,privateMetadataSent:false,readyForPublication:false};
  }catch{fail();}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  try{const args=process.argv.slice(2);if(!args.length)console.log(JSON.stringify(frontendCompilerByteProofPlan()));
    else{if(args.length!==1||args[0]!=="--execute-public-byte-proof")fail();console.log(JSON.stringify(await collectFrontendCompilerByteProof()));}}
  catch{console.error(JSON.stringify({error:"FRONTEND_COMPILER_BYTE_PROOF_INCOMPLETE",rawDetailsSuppressed:true,
    filesWritten:0,readyForPublication:false}));process.exitCode=1;}
}
