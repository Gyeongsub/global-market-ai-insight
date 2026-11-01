import { randomUUID } from "node:crypto";
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

const TARGETS = Object.freeze({
  controller: {directory:"services/controller", entry:"main.ts", license:"client-ecs"},
  worker: {directory:"services/worker", entry:"main.ts", license:"client-bedrock-runtime"},
  sweeper: {directory:"services/operations/sweeper", entry:"handler.ts", license:"client-ecs"},
  "alarm-circuit": {directory:"services/operations/alarm_circuit", entry:"handler.ts", license:"client-dynamodb"},
});
const BANNER = "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);";
function fail() { throw new Error("BACKEND_BUILD_UNVERIFIED"); }
export function assertBackendCompilerEnvironment(source = process.env) {
  if (Object.keys(source).some(key => /^(?:ESBUILD_|npm_config_esbuild_)/i.test(key) && source[key])) fail();
}
function inside(root, path) {
  const offset = relative(root, path);
  return offset !== "" && offset !== ".." && !offset.startsWith(`..${sep}`) && !isAbsolute(offset);
}
function directory(root, path, create = false) {
  if (path !== root && !inside(root, path)) fail();
  const offset = relative(root, path), parts = offset ? offset.split(sep) : [];
  for (let index = 0; index <= parts.length; index++) {
    const current = join(root, ...parts.slice(0, index));
    let info;
    try { info = lstatSync(current); } catch (error) {
      if (!create || error.code !== "ENOENT" || index === 0) fail();
      mkdirSync(current); info = lstatSync(current);
    }
    if (!info.isDirectory() || info.isSymbolicLink() || realpathSync(current) !== current) fail();
  }
}
function regular(root, path, maximum, output = false) {
  directory(root, dirname(path));
  let info;
  try { info = lstatSync(path); } catch (error) {
    if (output && error.code === "ENOENT") return null;
    fail();
  }
  if (!info.isFile() || info.isSymbolicLink() || realpathSync(path) !== path ||
      info.size > maximum || (!output && info.size < 1) || (output && info.nlink !== 1)) fail();
  return readFileSync(path);
}
function dependencyLicense(root, name) {
  const store = resolve(root, "node_modules/.pnpm"); directory(root, store);
  const path = realpathSync(resolve(root, "node_modules/@aws-sdk", name, "LICENSE"));
  if (!inside(store, path)) fail();
  return regular(root, path, 500_000);
}

/** Four fixed targets, no app execution/network/cloud. Only three generated
 * output files are replaced. Shared hard links and all redirected output
 * ancestors are refused; staging avoids truncating an existing output inode.
 * This is not an atomic multi-file release or a concurrent attacker sandbox. */
export async function buildBackendBundle(service, root = process.cwd()) {
  let stage;
  const owner = randomUUID();
  let output;
  const validateStage = () => {
    directory(root, output);
    if (!stage || relative(output, stage) !== basename(stage) || !/^\.gmai-build-[A-Za-z0-9]+$/.test(basename(stage))) fail();
    directory(root, stage);
    if (regular(root, join(stage, ".owner"), 100)?.toString("utf8") !== owner) fail();
    for (const name of readdirSync(stage)) {
      if (![".owner", "0", "1", "2"].includes(name)) fail();
      regular(root, join(stage, name), 5_000_000, true);
    }
  };
  try {
    assertBackendCompilerEnvironment();
    if (typeof service !== "string" || !Object.hasOwn(TARGETS, service) || typeof root !== "string" || !isAbsolute(root) || root.includes("\0")) fail();
    root = resolve(root); directory(root, root);
    const target = TARGETS[service], entry = resolve(root, target.directory, "src", target.entry);
    const entryBytes = regular(root, entry, 2_000_000);
    const noticePath = resolve(root, "THIRD_PARTY_NOTICES.md"), notice = regular(root, noticePath, 500_000);
    const license = dependencyLicense(root, target.license);
    output = resolve(root, target.directory, "bundle");
    directory(root, output, true); directory(root, join(output, "licenses"), true);
    const names = ["main.mjs", "THIRD_PARTY_NOTICES.md", "licenses/AWS-SDK-JS-V3-APACHE-2.0.txt"];
    for (const name of names) regular(root, resolve(output, name), 5_000_000, true);
    const { build } = await import("esbuild");
    const outfile = join(output, "main.mjs"), result = await build({absWorkingDir:root, entryPoints:[entry], outfile,
      bundle:true, platform:"node", target:"node22", format:"esm", banner:{js:BANNER}, sourcemap:false,
      legalComments:"none", treeShaking:true, logLevel:"silent", write:false});
    if (result.outputFiles?.length !== 1 || result.outputFiles[0].path !== outfile) fail();
    const contents = [Buffer.from(result.outputFiles[0].contents), notice, license];
    if (contents.some(bytes => !Buffer.isBuffer(bytes) || bytes.length < 1 || bytes.length > 5_000_000)) fail();
    if (!entryBytes.equals(regular(root, entry, 2_000_000)) || !notice.equals(regular(root, noticePath, 500_000)) ||
        !license.equals(dependencyLicense(root, target.license))) fail();
    directory(root, output); stage = mkdtempSync(join(output, ".gmai-build-"));
    writeFileSync(join(stage, ".owner"), owner, {flag:"wx",mode:0o600});
    // Lambda code archives and the nonroot runtime need readable code/notices.
    // POSIX staging modes are not an attestation of Windows ACL privacy.
    // Only generated public-scope code/notices are staged, never credentials.
    for (let index = 0; index < contents.length; index++) writeFileSync(join(stage, String(index)), contents[index], {flag:"wx",mode:0o644});
    validateStage();
    for (let index = 0; index < names.length; index++) {
      const destination = resolve(output, names[index]);
      regular(root, destination, 5_000_000, true);
      renameSync(join(stage, String(index)), destination);
      if (!contents[index].equals(regular(root, destination, 5_000_000, true))) fail();
    }
    return {mode:"local-backend-bundle-build",service,generatedFiles:3,sourceMapsCreated:false,
      applicationExecuted:false,awsCalls:0,externalNetworkCalls:0,completeAttributionVerified:false,readyForPublication:false};
  } catch { fail(); }
  finally {
    if (stage) { try { validateStage(); rmSync(stage, {recursive:true}); } catch { fail(); } }
  }
}

export async function backendBundleBuildMain(service) {
  try {
    if (process.argv.length !== 2) fail();
    console.log(JSON.stringify(await buildBackendBundle(service)));
  } catch { console.error(JSON.stringify({error:"BACKEND_BUILD_UNVERIFIED",rawDetailsSuppressed:true,awsCalls:0})); process.exitCode=1; }
}
