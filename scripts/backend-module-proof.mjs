import { assertBackendCompilerEnvironment } from "./backend-bundle-build.mjs";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { builtinModules } from "node:module";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { collectProductionPackageGraph } from "./check-production-licenses.mjs";
import { readLocalDependencyLock } from "./dependency-license-inventory.mjs";

const TARGETS = Object.freeze([
  Object.freeze({ name: "controller", directory: "services/controller", entry: "main.ts" }),
  Object.freeze({ name: "worker", directory: "services/worker", entry: "main.ts" }),
  Object.freeze({ name: "sweeper", directory: "services/operations/sweeper", entry: "handler.ts" }),
  Object.freeze({ name: "alarm-circuit", directory: "services/operations/alarm_circuit", entry: "handler.ts" }),
]);
const BANNER = "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);";
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const fail = () => { throw new Error("BACKEND_MODULE_PROOF_INCOMPLETE"); };
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const inside = (base, path) => { const r = relative(base, path); return r !== "" && r !== ".." && !isAbsolute(r) && !r.startsWith(`..${sep}`); };
const native = new Set(builtinModules.flatMap(name => [name, name.startsWith("node:") ? name.slice(5) : `node:${name}`]));
const bytes = value => Number.isSafeInteger(value) && value >= 0 && value <= 5_000_000;

/** Esbuild metadata + exact current artifact. No module paths/source text escape.
 * bytesInOutput > 0 distinguishes emitted modules from tree-shaken inputs. */
export function summarizeBackendMetafile(meta, targetName, root, packages, artifact) {
  try {
    const target = TARGETS.find(entry => entry.name === targetName);
    if (!target || !object(meta?.inputs) || !object(meta.outputs) || !Array.isArray(packages) || packages.length < 1 || packages.length > 200 ||
        !Buffer.isBuffer(artifact) || artifact.length < 1 || artifact.length > 5_000_000 || Object.keys(meta.inputs).length > 2000) fail();
    const outputs = Object.entries(meta.outputs), bundle = resolve(root, target.directory, "bundle/main.mjs");
    if (outputs.length !== 1 || resolve(root, outputs[0][0]) !== bundle) fail();
    const output = outputs[0][1];
    if (!object(output) || output.bytes !== artifact.length || !object(output.inputs) || resolve(root, output.entryPoint ?? "") !== resolve(root, target.directory, "src", target.entry) ||
        !Array.isArray(output.imports) || output.imports.some(value => !object(value) || value.external !== true || !native.has(value.path))) fail();
    const included = new Map(), categories = { ownService: 0, sharedSource: 0, circuitControlSource: 0, controllerContractSource: 0, lockedRuntimePackage: 0 };
    let consideredInputs = 0, treeShakenInputs = 0, emittedInputBytes = 0;
    for (const [id, contribution] of Object.entries(output.inputs)) {
      if (typeof id !== "string" || id.length < 1 || id.length > 8192 || id.includes("\0") || !object(meta.inputs[id]) ||
          !bytes(meta.inputs[id].bytes) || !object(contribution) || !bytes(contribution.bytesInOutput)) fail();
      consideredInputs++;
      const path = resolve(root, id), matches = packages.filter(pkg => inside(resolve(pkg.directory), path));
      if (matches.length > 1) fail();
      let category, row;
      if (matches.length === 1) {
        const pkg = matches[0];
        if (!/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(pkg.name) || !/^\d+\.\d+\.\d+$/.test(pkg.version) ||
            !["MIT", "Apache-2.0", "0BSD", "BSD-2-Clause", "BSD-3-Clause", "ISC", "CC0-1.0"].includes(pkg.license)) fail();
        category = "lockedRuntimePackage";
        row = { name: pkg.name, version: pkg.version, license: pkg.license, emittedModules: 0, emittedInputBytes: 0 };
      } else if (inside(resolve(root, target.directory, "src"), path)) category = "ownService";
      else if (inside(resolve(root, "shared"), path)) category = "sharedSource";
      else if (inside(resolve(root, "services/operations/circuit_control/src"), path)) category = "circuitControlSource";
      else if (["contracts.ts", "validation.ts", "job.ts"].some(name => path === resolve(root, "services/controller/src", name))) category = "controllerContractSource";
      else fail();
      if (contribution.bytesInOutput === 0) { treeShakenInputs++; continue; }
      categories[category]++; emittedInputBytes += contribution.bytesInOutput;
      if (row) {
        const key = `${row.name}@${row.version}`, current = included.get(key) ?? row;
        current.emittedModules++; current.emittedInputBytes += contribution.bytesInOutput; included.set(key, current);
      }
    }
    if (consideredInputs < 1 || categories.ownService < 1 || included.size < 1 || emittedInputBytes > output.bytes) fail();
    return { service: target.name, artifactBytes: artifact.length, artifactSha256: hash(artifact), consideredInputs, treeShakenInputs,
      emittedModules: consideredInputs - treeShakenInputs, categories, nativeExternalImports: output.imports.length,
      packages: [...included.values()].sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version)),
      absoluteModuleIdsPrinted: false, sourceTextPrinted: false, sourceMapsCreated: false,
      generatedHelperAndBannerLicenseReviewRequired: true, completeDistributedAttributionVerified: false, containerOsLicensesIncluded: false };
  } catch { fail(); }
}

function regular(path, root, max = 5_000_000) {
  const stat = lstatSync(path), physical = realpathSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || !inside(root, physical) || physical !== path || stat.size < 1 || stat.size > max) fail();
  return readFileSync(path);
}

/** Rebuild four fixed bundles in memory only; never write/update cloud assets.
 * All actual input bytes, artifact bytes and lock are rebound after rebuilding. */
export async function collectBackendModuleProof(root = process.cwd()) {
  let stage = "graph", service = "all";
  try {
  assertBackendCompilerEnvironment();
  const { build } = await import("esbuild");
  const physical = realpathSync(root), { lock, lockfileSha256 } = readLocalDependencyLock(root);
  const packages = await collectProductionPackageGraph(root), expected = new Map(), reports = [];
  for (const pkg of packages) {
    if (!Object.hasOwn(lock.packages, `${pkg.name}@${pkg.version}`) || expected.has(pkg.directory)) fail();
    expected.set(pkg.directory, pkg);
  }
  for (const target of TARGETS) {
    service = target.name;
    stage = "artifact-read";
    const outfile = resolve(root, target.directory, "bundle/main.mjs"), current = regular(outfile, physical);
    stage = "memory-build";
    const options = { absWorkingDir: root, entryPoints: [resolve(root, target.directory, "src", target.entry)], outfile,
      bundle: true, platform: "node", target: "node22", format: "esm", banner: { js: BANNER }, sourcemap: false,
      legalComments: "none", treeShaking: true, logLevel: "silent", metafile: true, write: false };
    const result = await build(options);
    stage = "artifact-match";
    if (result.outputFiles?.length !== 1 || result.outputFiles[0].path !== outfile || !current.equals(Buffer.from(result.outputFiles[0].contents))) fail();
    const sourceHashes = new Map();
    stage = "input-read";
    for (const id of Object.keys(result.metafile.inputs)) {
      const path = resolve(root, id);
      // Package graph realpaths remain private; no home/outside source file is read.
      if (!inside(physical, path)) fail();
      const data = regular(path, physical, 2_000_000); sourceHashes.set(path, hash(data));
    }
    stage = "module-summary";
    const report = summarizeBackendMetafile(result.metafile, target.name, root, packages, current);
    // Establish the exact input set, then bracket another in-memory rebuild
    // with those source hashes. Hashing only after a build cannot prove that
    // its metadata and output came from the still-current input bytes.
    stage = "bracketed-rebuild";
    const repeated = await build(options);
    if (repeated.outputFiles?.length !== 1 || repeated.outputFiles[0].path !== outfile ||
        !current.equals(Buffer.from(repeated.outputFiles[0].contents)) || JSON.stringify(repeated.metafile) !== JSON.stringify(result.metafile)) fail();
    stage = "input-recheck";
    for (const [path, digest] of sourceHashes) if (hash(regular(path, physical, 2_000_000)) !== digest) fail();
    if (!current.equals(regular(outfile, physical))) fail();
    reports.push({ ...report, inMemoryRebuildMatchedWrittenArtifact: true, inMemoryRebuilds: 2, inputsBracketedFinalRebuild: true, inputBytesRechecked: true });
  }
  stage = "lock-recheck";
  if (hash(regular(resolve(root, "pnpm-lock.yaml"), physical)) !== lockfileSha256) fail();
  return { mode: "local-backend-emitted-module-proof", awsCalls: 0, externalNetworkCalls: 0, filesWritten: 0,
    currentLockMatched: true, lockfileSha256, reports, cloudArtifactOrImageModified: false,
    generatedArtifactDependencyClaimed: false, completeLegalReviewApproved: false, readyForPublication: false };
  } catch { throw new Error(`BACKEND_MODULE_PROOF_${service.replaceAll("-", "_").toUpperCase()}_${stage.replaceAll("-", "_").toUpperCase()}_INCOMPLETE`); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { if (process.argv.length !== 2) fail(); console.log(JSON.stringify(await collectBackendModuleProof())); }
  catch (error) { const code = /^BACKEND_MODULE_PROOF_[A-Z_]{1,60}$/.test(error?.message) ? error.message : "BACKEND_MODULE_PROOF_INCOMPLETE";
    console.error(JSON.stringify({ error: code, privateDetailsSuppressed: true, filesWritten: 0, readyForPublication: false })); process.exitCode = 1; }
}
