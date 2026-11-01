import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import { assertBackendCompilerEnvironment } from "./backend-bundle-build.mjs";
import { readLocalDependencyLock } from "./dependency-license-inventory.mjs";
import { inspectPinnedPackageArchive } from "./pinned-package-archive.mjs";

const VERSION="0.28.1", COMMIT="bb9db84c02433fbe37b3509f53f9f3e3cc48725e", REPOSITORY="git+https://github.com/evanw/esbuild.git";
export const COMPILER_TARGETS=Object.freeze([
  Object.freeze({name:"esbuild",version:VERSION,license:"MIT",tarball:"https://registry.npmjs.org/esbuild/-/esbuild-0.28.1.tgz",
    files:Object.freeze(["package.json","lib/main.js","LICENSE.md"])}),
  Object.freeze({name:"@esbuild/win32-x64",version:VERSION,license:"MIT",tarball:"https://registry.npmjs.org/@esbuild/win32-x64/-/win32-x64-0.28.1.tgz",
    files:Object.freeze(["package.json","esbuild.exe"])}),
]);
const hash=bytes=>createHash("sha256").update(bytes).digest("hex");
function fail(){throw Error("COMPILER_BYTE_PROOF_INCOMPLETE");}
const known=target=>COMPILER_TARGETS.includes(target);
const inside=(base,path)=>{const p=relative(base,path);return p!==""&&p!==".."&&!p.startsWith(`..${sep}`)&&!isAbsolute(p);};
const json=bytes=>JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));

export function compilerByteProofPlan(args=[]) {
  if(args.length) fail();
  return {mode:"dry-run",awsCalls:0,publicRegistryRequests:0,publicRegistryReadsMax:4,
    targets:COMPILER_TARGETS.map(({name,version})=>({name,version})),platformScope:"installed-windows-x64-compiler",
    filesWritten:0,packagesInstalled:0,downloadedCodeExecuted:false,readyForPublication:false};
}
function regular(path,root,max=16_000_000) {
  const before=lstatSync(path);
  if(!inside(root,path)||!before.isFile()||before.isSymbolicLink()||realpathSync(path)!==path||before.size<1||before.size>max) fail();
  const bytes=readFileSync(path),after=lstatSync(path);
  if(!after.isFile()||after.isSymbolicLink()||realpathSync(path)!==path||bytes.length!==before.size||
    before.size!==after.size||before.mtimeMs!==after.mtimeMs||before.ino!==after.ino) fail();
  return bytes;
}
function capture(root) {
  if(typeof root!=="string"||!isAbsolute(root)||realpathSync(root)!==root||lstatSync(root).isSymbolicLink()) fail();
  assertBackendCompilerEnvironment();
  const {lock,lockfileSha256}=readLocalDependencyLock(root),rootManifest=regular(join(root,"package.json"),root,2_000_000);
  if(json(rootManifest).devDependencies?.esbuild!==VERSION||lock.importers?.["."]?.devDependencies?.esbuild?.specifier!==VERSION||
      lock.importers["."].devDependencies.esbuild.version!==VERSION) fail();
  const store=join(root,"node_modules/.pnpm");
  if(!lstatSync(store).isDirectory()||lstatSync(store).isSymbolicLink()||realpathSync(store)!==store) fail();
  const req=createRequire(join(root,"package.json")),wrapper=realpathSync(req.resolve("esbuild/package.json"));
  const paths=[wrapper,realpathSync(createRequire(wrapper).resolve("@esbuild/win32-x64/package.json"))];
  const tools=COMPILER_TARGETS.map((target,index)=>{
    const path=paths[index],directory=dirname(path),manifest=json(regular(path,store,100_000));
    const integrity=lock.packages?.[`${target.name}@${VERSION}`]?.resolution?.integrity;
    if(manifest.name!==target.name||manifest.version!==VERSION||manifest.license!=="MIT"||!/^sha512-[A-Za-z0-9+/]{86}==$/.test(integrity??"")) fail();
    if(index===0&&manifest.optionalDependencies?.["@esbuild/win32-x64"]!==VERSION) fail();
    if(index===1&&(JSON.stringify(manifest.os)!=='["win32"]'||JSON.stringify(manifest.cpu)!=='["x64"]')) fail();
    return {name:target.name,version:VERSION,integrity,files:target.files.map(name=>{
      const bytes=regular(join(directory,name),store,name==="esbuild.exe"?16_000_000:500_000);
      return {path:name,bytes:bytes.length,sha256:hash(bytes)};
    })};
  });
  return {lockfileSha256,rootManifestSha256:hash(rootManifest),tools};
}

export function verifyCompilerMetadata(target,metadata,integrity) {
  if(!known(target)||metadata?.name!==target.name||metadata?.version!==VERSION||metadata?.license!=="MIT"||
      metadata?.repository?.url!==REPOSITORY||metadata?.gitHead!==COMMIT||metadata?.dist?.tarball!==target.tarball||
      metadata?.dist?.integrity!==integrity||!/^sha512-[A-Za-z0-9+/]{86}==$/.test(integrity??"")) fail();
  if(target===COMPILER_TARGETS[1]&&(JSON.stringify(metadata.os)!=='["win32"]'||JSON.stringify(metadata.cpu)!=='["x64"]')) fail();
}
export function compareCompilerArchive(target,compressed,integrity,installed) {
  if(!known(target)||installed?.name!==target.name||installed?.version!==VERSION||!Array.isArray(installed.files)||installed.files.length!==target.files.length) fail();
  const archive=inspectPinnedPackageArchive(target,compressed,integrity,target===COMPILER_TARGETS[1]?"reviewed-native-compiler":"frontend-helper");
  if(archive.manifest?.repository?.url!==REPOSITORY) fail();
  for(const path of target.files) {
    const local=installed.files.filter(file=>file?.path===path),published=archive.regularFiles.filter(file=>file.path===path);
    if(local.length!==1||published.length!==1||!Number.isSafeInteger(local[0].bytes)||local[0].bytes<1||
      !/^[a-f0-9]{64}$/.test(local[0].sha256??"")||local[0].bytes!==published[0].bytes||local[0].sha256!==published[0].sha256) fail();
  }
  return {name:target.name,version:VERSION,tarballSha256:archive.tarballSha256,lockedArchiveIntegrityMatched:true,
    selectedInstalledFilesMatched:target.files.length,selectedBytesMatched:installed.files.reduce((sum,file)=>sum+file.bytes,0),
    rootLicenseDocumentPresent:archive.rootDocuments.some(doc=>/^LICENSE(?:[._-]|$)/i.test(doc.name)),
    entireInstalledPackageFileSetVerified:false,archiveExtracted:false,packageCodeExecuted:false,installedFilesModified:false};
}

export async function fetchCompilerBytes(target,kind,fetcher=fetch,remainingMs=20_000) {
  if(!known(target)||!["metadata","tarball"].includes(kind)||!Number.isFinite(remainingMs)||remainingMs<=0) fail();
  const url=kind==="metadata"?`https://registry.npmjs.org/${encodeURIComponent(target.name)}/${VERSION}`:target.tarball;
  const maximum=kind==="metadata"?100_000:target===COMPILER_TARGETS[1]?8_000_000:1_000_000;
  let reader;
  try {
    const response=await fetcher(url,{redirect:"error",credentials:"omit",referrerPolicy:"no-referrer",
      signal:AbortSignal.timeout(Math.max(1,Math.floor(Math.min(20_000,remainingMs)))),headers:{Accept:kind==="metadata"?"application/json":"application/octet-stream","Accept-Encoding":"identity"}});
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
  } catch {fail();}
  finally {try{await reader?.cancel();}catch{} try{reader?.releaseLock();}catch{}}
}

export async function collectCompilerByteProof(root=process.cwd(),fetcher=fetch) {
  try {
    const started=performance.now(),before=capture(root),results=[];let requests=0,downloadedBytes=0;
    for(const [index,target] of COMPILER_TARGETS.entries()) {
      const read=async kind=>{if(++requests>4)fail();const bytes=await fetchCompilerBytes(target,kind,fetcher,90_000-(performance.now()-started));
        if((downloadedBytes+=bytes.length)>10_000_000)fail();return bytes;};
      const metadata=json(await read("metadata")),installed=before.tools[index];
      verifyCompilerMetadata(target,metadata,installed.integrity);
      results.push(compareCompilerArchive(target,await read("tarball"),installed.integrity,installed));
    }
    if(performance.now()-started>90_000||JSON.stringify(capture(root))!==JSON.stringify(before)) fail();
    return {mode:"official-selected-compiler-byte-proof",observedAtUtc:new Date().toISOString(),awsCalls:0,publicRegistryRequests:requests,
      downloadedBytes,lockfileSha256:before.lockfileSha256,installedStateRechecked:true,platformScope:"installed-windows-x64-compiler",results,
      publisherReportedCommit:COMMIT,publisherSignatureVerified:false,sourceToBinaryBuildReproduced:false,nativeCompilerActuallyUsedAttested:false,
      generatedHelperRightsComplete:false,filesWritten:0,packagesInstalled:0,downloadedCodeExecuted:false,privateMetadataSent:false,readyForPublication:false};
  }catch{fail();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  try {const args=process.argv.slice(2);if(!args.length) console.log(JSON.stringify(compilerByteProofPlan()));
    else {if(args.length!==1||args[0]!=="--execute-public-byte-proof")fail();console.log(JSON.stringify(await collectCompilerByteProof()));}}
  catch{console.error(JSON.stringify({error:"COMPILER_BYTE_PROOF_INCOMPLETE",rawDetailsSuppressed:true,filesWritten:0,readyForPublication:false}));process.exitCode=1;}
}
