import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { cleanSourceChildEnvironment, copySources, fingerprintCopiedSource, LOCAL_GATE_TIMEOUT_MS, summarizeLocalGateTests } from "./clean-source-build-proof.mjs";
import { readLocalDependencyLock } from "./dependency-license-inventory.mjs";
import { summarizeLocalCheckTimings } from "./local-check-step.mjs";
import { assertNodeSecurityBaseline } from "./node-security-baseline.mjs";

export const PINNED_PNPM = Object.freeze({ version: "11.16.0", integrity: "sha512-t2fpqY/IeuwPQtrvzQ6ElBws20XXPE4eaIYPsr39vgMqtZIQVHnl4Fwjf3QMil/9u7UjhXl93CKWdFobu4g+jQ==",
  metadata: "https://registry.npmjs.org/pnpm/11.16.0", tarball: "https://registry.npmjs.org/pnpm/-/pnpm-11.16.0.tgz" });
const fail = code => { throw new Error(`FRESH_INSTALL_${code}`); };
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const decode = bytes => new TextDecoder("utf-8", { fatal: true }).decode(bytes);
const gateFailures = new WeakMap();

/** A failed gate keeps only public hashes and bounded ordinal timings. It is
 * never a successful install or proof that the source stayed unchanged. */
function publicFailureFingerprint(fingerprint) {
  if (!object(fingerprint) || Object.keys(fingerprint).sort().join(",") !== "bytes,files,sha256" ||
      !Number.isSafeInteger(fingerprint.files) || fingerprint.files < 1 || fingerprint.files > 2000 ||
      !Number.isSafeInteger(fingerprint.bytes) || fingerprint.bytes < 1 || fingerprint.bytes > 64_000_000 ||
      typeof fingerprint.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(fingerprint.sha256)) fail("FAILURE_SCOPE_INVALID");
  return { ...fingerprint };
}

export function createFreshInstallGateFailure(result, elapsedMs, fingerprint) {
  const sourceFingerprint = publicFailureFingerprint(fingerprint);
  const error = new Error("FRESH_INSTALL_GATE_INCOMPLETE");
  gateFailures.set(error, { mode: "failed-frozen-gate-observation", ...summarizeLocalGateFailure(result, elapsedMs),
    sourceFingerprint, sourceObservationStage: "copied-before-gate",
    sourceUnchangedVerified: false, immutableSnapshotClaimed: false, fullLocalGatePassed: false,
    stepTimings: summarizeLocalCheckTimings(typeof result?.stdout === "string" ? result.stdout : ""),
    independentLocalClosureRequired: true });
  return error;
}

export function createFrozenInstallFailure(result, elapsedMs, fingerprint) {
  const sourceFingerprint = publicFailureFingerprint(fingerprint);
  const error = new Error("FRESH_INSTALL_INSTALL_INCOMPLETE");
  gateFailures.set(error, { mode: "failed-frozen-install-observation", ...summarizeFrozenInstallFailure(result),
    elapsedMs: Number.isSafeInteger(elapsedMs) && elapsedMs >= 0 && elapsedMs <= 185000 ? elapsedMs : null,
    sourceFingerprint, sourceObservationStage: "copied-before-install", sourceUnchangedVerified: false,
    immutableSnapshotClaimed: false, freshInstallVerified: false, fullLocalGatePassed: false,
    independentLocalClosureRequired: true });
  return error;
}

export function freshInstallFailureObservation(error) {
  const observation = gateFailures.get(error);
  return observation ? structuredClone(observation) : null;
}

export function validateFreshInstallLock(lock, manifest) {
  if (!object(lock) || ![9, "9.0"].includes(lock.lockfileVersion) || !object(lock.packages) || !object(lock.importers) ||
      JSON.stringify(Object.keys(lock.importers).sort()) !== JSON.stringify([".", "frontend"]) || manifest?.private !== true || manifest?.packageManager !== "pnpm@11.16.0") fail("INPUT_INVALID");
  const packages = Object.entries(lock.packages);
  if (!packages.length || packages.length > 1000) fail("INPUT_INVALID");
  for (const [name, item] of packages) {
    if (!/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*@[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/.test(name) || !object(item) ||
        !object(item.resolution) || Object.keys(item.resolution).join(",") !== "integrity" || !/^sha512-[A-Za-z0-9+/]{86}==$/.test(item.resolution.integrity)) fail("REGISTRY_LOCK_REQUIRED");
  }
  return { lockedIdentities: packages.length, nonRegistryResolutionPresent: false };
}

export function verifyPnpmMetadata(metadata) {
  if (metadata?.name !== "pnpm" || metadata?.version !== PINNED_PNPM.version || metadata?.license !== "MIT" ||
      metadata?.repository?.url !== "git+https://github.com/pnpm/pnpm.git" || metadata?.dist?.tarball !== PINNED_PNPM.tarball ||
      metadata?.dist?.integrity !== PINNED_PNPM.integrity || metadata?.bin?.pnpm !== "bin/pnpm.mjs" || metadata?.engines?.node !== ">=22.13") fail("TOOL_METADATA_INVALID");
}

/** Verify every path and compressed SHA-512 before any package code is extracted or run. */
export function inspectPinnedPnpmArchive(compressed, integrity = PINNED_PNPM.integrity) {
  if (!Buffer.isBuffer(compressed) || compressed.length < 1 || compressed.length > 16_000_000 || integrity !== PINNED_PNPM.integrity ||
      `sha512-${createHash("sha512").update(compressed).digest("base64")}` !== integrity) fail("TOOL_INTEGRITY_INVALID");
  const tar = gunzipSync(compressed, { maxOutputLength: 64_000_000 });
  return { ...inspectPnpmTarContents(tar), compressedSha256: hash(compressed) };
}

export function inspectPnpmTarContents(tar) {
  if (!Buffer.isBuffer(tar) || tar.length > 64_000_000) fail("TOOL_ARCHIVE_INVALID");
  if (tar.length < 1024 || tar.length % 512 !== 0) fail("TOOL_ARCHIVE_INVALID");
  const entries = new Map(); let ended = false, totalBytes = 0, pendingLongName = null, headers = 0;
  for (let offset = 0; offset < tar.length;) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every(byte => byte === 0)) { if (pendingLongName || tar.length - offset < 1024 || !tar.subarray(offset).every(byte => byte === 0)) fail("TOOL_ARCHIVE_INVALID"); ended = true; break; }
    if (++headers > 4000) fail("TOOL_ARCHIVE_INVALID");
    const field = (start, length) => decode(header.subarray(start, start + length)).replace(/\0.*$/s, "");
    const checksum = field(148, 8).trim(), sizeText = field(124, 12).trim(), prefix = field(345, 155);
    if (!/^[0-7]+$/.test(checksum) || !/^[0-7]+$/.test(sizeText) || header.reduce((total, byte, index) => total + (index >= 148 && index < 156 ? 32 : byte), 0) !== Number.parseInt(checksum, 8)) fail("TOOL_ARCHIVE_INVALID");
    const rawName = `${prefix ? prefix + "/" : ""}${field(0, 100)}`, size = Number.parseInt(sizeText, 8);
    if (!Number.isSafeInteger(size) || size > 16_000_000 || offset + 512 + size > tar.length) fail("TOOL_ARCHIVE_INVALID");
    // GNU L is a bounded name-extension record, not a filesystem link. It may
    // affect only the immediately following regular file; K/hard/symbolic links
    // and dangling/stacked extensions remain rejected.
    if (header[156] === 76) {
      const content = tar.subarray(offset + 512, offset + 512 + size);
      if (pendingLongName || rawName !== "././@LongLink" || size < 2 || size > 4096 || content.at(-1) !== 0 || content.subarray(0, -1).includes(0)) fail("TOOL_ARCHIVE_INVALID");
      pendingLongName = decode(content.subarray(0, -1)); offset += 512 + Math.ceil(size / 512) * 512; continue;
    }
    const name = pendingLongName ?? rawName; pendingLongName = null;
    if (!/^package\/[A-Za-z0-9@._/-]+$/.test(name) || name.split("/").some(part => !part || part === "." || part === ".." || part.endsWith(".") || /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(part)) ||
        entries.has(name) || entries.size >= 2000 || !Number.isSafeInteger(size) || size > 16_000_000 || offset + 512 + size > tar.length ||
        ![0, 48].includes(header[156])) fail("TOOL_ARCHIVE_INVALID");
    const bytes = tar.subarray(offset + 512, offset + 512 + size); entries.set(name, bytes); totalBytes += size;
    if (totalBytes > 64_000_000) fail("TOOL_ARCHIVE_INVALID");
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  const manifestBytes = entries.get("package/package.json");
  if (!ended || !manifestBytes || !entries.has("package/bin/pnpm.mjs")) fail("TOOL_ARCHIVE_INVALID");
  const manifest = JSON.parse(decode(manifestBytes));
  if (manifest.name !== "pnpm" || manifest.version !== PINNED_PNPM.version || manifest.license !== "MIT" || manifest.bin?.pnpm !== "bin/pnpm.mjs") fail("TOOL_ARCHIVE_INVALID");
  return { entries, files: entries.size, bytes: totalBytes };
}

export async function fetchPinnedPnpm(kind, fetcher = fetch) {
  if (!["metadata", "tarball"].includes(kind)) fail("TOOL_FETCH_REJECTED");
  const url = PINNED_PNPM[kind], maximum = kind === "metadata" ? 100_000 : 16_000_000;
  const response = await fetcher(url, { redirect: "error", signal: AbortSignal.timeout(20_000), headers: { Accept: "application/json, application/octet-stream" } });
  if (response.status !== 200 || !response.body || (response.url && response.url !== url)) fail("TOOL_FETCH_FAILED");
  const declared = response.headers.get("content-length"); if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > maximum)) fail("TOOL_FETCH_FAILED");
  const reader = response.body.getReader(), chunks = []; let size = 0;
  try { for (;;) { const item = await reader.read(); if (item.done) break; size += item.value.byteLength; if (size > maximum) fail("TOOL_FETCH_FAILED"); chunks.push(Buffer.from(item.value)); } }
  finally { await reader.cancel(); }
  if (!size) fail("TOOL_FETCH_FAILED"); return Buffer.concat(chunks);
}

export function freshInstallEnvironment(source, root) {
  const env = cleanSourceChildEnvironment(source);
  for (const name of Object.keys(env)) if (/^(npm_|pnpm_|COREPACK_|YARN_|DOCKER_|HTTP_PROXY$|HTTPS_PROXY$|ALL_PROXY$|NO_PROXY$|CI$)/i.test(name)) delete env[name];
  const settings = { manage_package_manager_versions: "false", package_manager_strict: "true", pm_on_fail: "error", enable_global_virtual_store: "false",
    ignore_pnpmfile: "true", runtime: "false", side_effects_cache: "false", package_import_method: "copy", network_concurrency: "4", fetch_retries: "0", fetch_timeout: "20000" };
  for (const [key, value] of Object.entries(settings)) { env[`npm_config_${key}`] = value; env[`pnpm_config_${key}`] = value; }
  return { ...env, CI: "true", npm_config_userconfig: join(root, "empty-user.npmrc"), npm_config_globalconfig: join(root, "empty-global.npmrc"),
    npm_config_registry: "https://registry.npmjs.org/", npm_config_cache: join(root, "cache"), npm_config_ignore_scripts: "true",
    pnpm_config_manage_package_manager_versions: "false", pnpm_config_package_manager_strict: "true", pnpm_config_pm_on_fail: "error",
    pnpm_config_enable_global_virtual_store: "false", PNPM_HOME: join(root, "home"), XDG_CONFIG_HOME: join(root, "config"),
    XDG_CACHE_HOME: join(root, "cache"), XDG_DATA_HOME: join(root, "data") };
}

export function safeFreshInstallTemporaryDirectory(base, directory, physicalBase) {
  try { const name = basename(directory); return /^gmai-fresh-install-proof-[A-Za-z0-9]+$/.test(name) && relative(resolve(base), resolve(directory)) === name &&
    lstatSync(directory).isDirectory() && !lstatSync(directory).isSymbolicLink() && realpathSync(base) === physicalBase && realpathSync(directory) === resolve(physicalBase, name); }
  catch { return false; }
}

export function freshInstallPlan(args = []) {
  if (args.length) fail("ARGUMENTS_REJECTED");
  return { mode: "dry-run", awsCalls: 0, cloudMutations: 0, packagesInstalled: 0, sourceModified: false,
    pinnedPnpm: PINNED_PNPM.version, lifecycleScriptsEnabled: false, isolatedStoreOnly: true,
    publicationPerformed: false, cleanGitCloneClaimed: false, readyForPublication: false };
}

/** Only numeric progress and fixed error classes escape a failed child process. */
export function summarizeFrozenInstallFailure(result) {
  const text = String(result?.stdout ?? "") + "\n" + String(result?.stderr ?? "");
  const last = [...text.matchAll(/Progress: resolved (\d+), reused (\d+), downloaded (\d+), added (\d+)/g)].at(-1);
  const counts = last ? last.slice(1).map(Number) : null;
  const progress = counts && counts.every(value => Number.isSafeInteger(value) && value >= 0 && value <= 1000) ?
    { resolved:counts[0], reused:counts[1], downloaded:counts[2], added:counts[3] } : null;
  const knownSignals = ["SIGTERM", "SIGKILL", "SIGABRT", "SIGSEGV", "SIGINT"];
  const knownSpawnCodes = ["ETIMEDOUT", "ENOBUFS", "ENOENT", "EACCES", "EPERM", "ENOMEM"];
  const knownPackageCodes = ["ERR_PNPM_ENOSPC", "ERR_PNPM_EACCES", "ERR_PNPM_EPERM", "ERR_PNPM_TARBALL_EXTRACT",
    "ERR_PNPM_TARBALL_INTEGRITY", "ERR_PNPM_OUTDATED_LOCKFILE", "ERR_PNPM_FROZEN_LOCKFILE_WITH_OUTDATED_LOCKFILE",
    "ERR_PNPM_META_FETCH_FAIL", "ERR_PNPM_FETCH_401", "ERR_PNPM_FETCH_403", "ERR_PNPM_FETCH_404", "ERR_PNPM_FETCH_429", "ERR_PNPM_FETCH_500"];
  return { stage:"frozen-install", timeout:result?.error?.code === "ETIMEDOUT", bufferLimit:result?.error?.code === "ENOBUFS",
    successfulExit:result?.status===0 && result?.signal===null, progress,
    exitCode: Number.isSafeInteger(result?.status) && result.status >= -2147483648 && result.status <= 4294967295 ? result.status : null,
    terminationSignal: knownSignals.includes(result?.signal) ? result.signal : null,
    spawnErrorCode: knownSpawnCodes.includes(result?.error?.code) ? result.error.code : null,
    packageManagerErrorCodes: knownPackageCodes.filter(code => (text.match(/\bERR_PNPM_[A-Z0-9_]+\b/g) ?? []).includes(code)),
    memoryFailureTextDetected: /JavaScript heap out of memory|Allocation failed|out of memory/i.test(text),
    certificateFailureTextDetected: /UNABLE_TO_VERIFY_LEAF_SIGNATURE|UNABLE_TO_GET_ISSUER_CERT_LOCALLY|SELF_SIGNED_CERT_IN_CHAIN|CERT_HAS_EXPIRED|ERR_TLS_CERT_ALTNAME_INVALID/.test(text),
    filesystemFailureTextDetected: /\b(?:EACCES|EPERM|ENOSPC|EMFILE|ENFILE)\b/.test(text),
    internalPanicTextDetected: /panicked at|fatal runtime error/.test(text),
    fetchErrorsDetected:/\bERR_PNPM_(?:FETCH|META_FETCH|TARBALL_INTEGRITY|NO_MATCHING_VERSION)/.test(text),
    unknownOptionDetected:/Unknown option/.test(text), rawDetailsSuppressed:true };
}

/** Numeric timing only: a gate timeout is not a lint/test failure or a pass. */
export function summarizeLocalGateFailure(result, elapsedMs) {
  return { stage: "full-local-gate", timeout: result?.error?.code === "ETIMEDOUT",
    bufferLimit: result?.error?.code === "ENOBUFS", successfulExit: result?.status === 0 && result?.signal === null,
    elapsedMs: Number.isSafeInteger(elapsedMs) && elapsedMs >= 0 && elapsedMs <= LOCAL_GATE_TIMEOUT_MS + 5000 ? elapsedMs : null,
    rawDetailsSuppressed: true };
}

export async function runFreshInstallProof(sourceCopier = copySources) {
  if (typeof sourceCopier !== "function") fail("SOURCE_COPIER_INVALID");
  assertNodeSecurityBaseline();
  const root = resolve(process.cwd()), manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const { lock, lockfileSha256 } = readLocalDependencyLock(root), lockScope = validateFreshInstallLock(lock, manifest);
  const base = resolve(tmpdir()), physicalBase = realpathSync(base), directory = resolve(mkdtempSync(join(base, "gmai-fresh-install-proof-")));
  if (!safeFreshInstallTemporaryDirectory(base, directory, physicalBase)) fail("TEMP_OWNER_INVALID");
  const source = join(directory, "source"), tool = join(directory, "tooling"), store = join(directory, "store");
  let stage = "source-copy";
  try {
    mkdirSync(source); mkdirSync(tool); sourceCopier(source); const sourceFingerprint = fingerprintCopiedSource(source);
    if (existsSync(join(source, "node_modules")) || existsSync(join(source, "frontend", "node_modules"))) fail("DEPENDENCY_REUSE_FORBIDDEN");
    const env = freshInstallEnvironment(process.env, directory);
    stage = "pinned-tool-fetch";
    verifyPnpmMetadata(JSON.parse(decode(await fetchPinnedPnpm("metadata"))));
    const archive = inspectPinnedPnpmArchive(await fetchPinnedPnpm("tarball"));
    for (const [name, bytes] of archive.entries) {
      const path = resolve(tool, name.slice("package/".length)), offset = relative(tool, path);
      if (!offset || isAbsolute(offset) || offset === ".." || offset.startsWith(`..${sep}`)) fail("TOOL_ARCHIVE_INVALID");
      mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, bytes, { flag: "wx" });
    }
    const cli = join(tool, "bin", "pnpm.mjs");
    const run = (args, timeout, cwd = source) => spawnSync(process.execPath, args, { cwd, env, encoding: "utf8", timeout, maxBuffer: 2_000_000, windowsHide: true });
    stage = "pinned-tool-version";
    const version = run([cli, "--version"], 10_000); if (version.status !== 0 || version.stdout.trim() !== PINNED_PNPM.version) fail("TOOL_VERSION_INVALID");
    stage = "frozen-install";
    const installStarted = Date.now();
    const install = run([cli, "install", "--frozen-lockfile", "--ignore-scripts", "--store-dir", store,
      "--registry", "https://registry.npmjs.org/", "--reporter", "append-only"], 180_000);
    const installElapsedMs = Date.now() - installStarted;
    if (install.status !== 0 || install.signal !== null) {
      console.error(JSON.stringify(summarizeFrozenInstallFailure(install)));
      throw createFrozenInstallFailure(install, installElapsedMs, sourceFingerprint);
    }
    if (hash(readFileSync(join(source, "pnpm-lock.yaml"))) !== lockfileSha256 || hash(readFileSync(join(root, "pnpm-lock.yaml"))) !== lockfileSha256) fail("LOCK_CHANGED");
    stage = "full-local-gate";
    const gateStarted = Date.now();
    const checked = run([join(source, "scripts", "check-all.mjs")], LOCAL_GATE_TIMEOUT_MS);
    const gateElapsedMs = Date.now() - gateStarted;
    if (checked.status !== 0 || checked.signal !== null) {
      console.error(JSON.stringify({ ...summarizeLocalGateFailure(checked, gateElapsedMs), stepTimings: summarizeLocalCheckTimings(checked.stdout) }));
      throw createFreshInstallGateFailure(checked, gateElapsedMs, sourceFingerprint);
    }
    const tests = summarizeLocalGateTests(checked.stdout);
    const packets = checked.stdout.split(/\r?\n/).filter(line => line.startsWith('{"mode":"local-http-safety-proof",'));
    if (packets.length !== 1) fail("HTTP_PROOF_INCOMPLETE");
    const http = JSON.parse(packets[0]);
    if (http.awsCalls !== 0 || http.externalNetworkCalls !== 0 || http.serversClosed !== true || http.temporaryFixtureRetained !== false || http.developmentAndPreviewPassed !== true ||
        http.exactNoticeBytesMatched !== true || http.privateSentinelReturned !== false || http.publicationPerformed !== false ||
        http.fixturePreviewSecurityHeadersMatched !== true || http.developmentHmrPolicyUnchanged !== true || http.remoteTlsOrHostingVerified !== false ||
        !Number.isSafeInteger(http.loopbackHttpRequests) || http.loopbackHttpRequests < 1 || http.loopbackHttpRequests > 40) fail("HTTP_PROOF_INCOMPLETE");
    return { mode: "isolated-frozen-install-build-proof", pinnedPnpm: PINNED_PNPM.version, toolArchiveSha256: archive.compressedSha256,
      toolArchiveIntegrityMatched: true, toolFiles: archive.files, sourceFingerprint, ...lockScope, lockfileUnchanged: true,
      dependencyReuse: false, freshInstallVerified: true, lifecycleScriptsEnabled: false, fullLocalGatePassed: true, tests,
      installElapsedMs, gateElapsedMs, stepTimings: summarizeLocalCheckTimings(checked.stdout), fullLocalGateTimeoutMs: LOCAL_GATE_TIMEOUT_MS,
      awsCalls: 0, cloudMutations: 0, loopbackHttpRequests: http.loopbackHttpRequests, localHttpServersClosed: true,
      publicPackageDownloadsPerformed: true, privateRegistryCredentialsPassed: false, existingInstallationModified: false,
      temporaryTreeRetained: false, cleanGitCloneClaimed: false, publicationPerformed: false, readyForPublication: false };
  } catch (error) {
    if (error instanceof Error && /^FRESH_INSTALL_[A-Z_]+$/.test(error.message)) throw error;
    fail(`INCOMPLETE_${stage.replaceAll("-", "_").toUpperCase()}`);
  } finally {
    if (!safeFreshInstallTemporaryDirectory(base, directory, physicalBase)) fail("TEMP_OWNER_INVALID");
    rmSync(directory, { recursive: true }); if (existsSync(directory)) fail("TEMP_CLEANUP_UNVERIFIED");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (!args.length) console.log(JSON.stringify(freshInstallPlan()));
    else { if (args.length !== 1 || args[0] !== "--execute-isolated-install") fail("ARGUMENTS_REJECTED"); console.log(JSON.stringify(await runFreshInstallProof())); }
  } catch (error) {
    console.error(JSON.stringify({ error: error instanceof Error && /^FRESH_INSTALL_[A-Z_]+$/.test(error.message) ? error.message : "FRESH_INSTALL_INCOMPLETE",
      rawDetailsSuppressed: true, publicationPerformed: false, cleanupMustBeIndependentlyVerified: true })); process.exitCode = 1;
  }
}
