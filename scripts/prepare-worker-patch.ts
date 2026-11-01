import { spawnSync } from "node:child_process";
import { projectOsVulnerabilityTriage, throwOsCoordinateDiagnostic } from "./os-vulnerability-triage.mjs";
import { assertNodeSecurityBaseline } from "./node-security-baseline.mjs";
import { randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { cacheScanChildEnvironment, readBoundedCachedArchiveFiles, safeScanTemporaryDirectory,
  verifyCachedArchive, verifyCachedScanner, verifyOwnedScanContainer } from "./scan-live-image-cache.js";
import { selectLinuxAmd64Child, verifyRuntimeManifest } from "./live-image-readiness.js";
import { verifyReviewedWorkerBaseSource, verifyWorkerBaseMetadata } from "./worker-base-identity.js";
import { readCurrentWorkerBundle, verifyWorkerApplicationArchive } from "./worker-application-proof.js";

const HOST = "npipe:////./pipe/dockerDesktopLinuxEngine";
const SCANNER = "sha256:cffe3f5161a47a6823fbd23d985795b3ed72a4c806da4c4df16266c02accdd6f";
const TAG = "gmai-worker:local-20261004-release";
const CURRENT_TAG = "gmai-worker:local-20261012-release";
const OCTOBER16_TAG = "gmai-worker:local-20261016-release";
const OCTOBER17_TAG = "gmai-worker:local-20261017-release";
const LIMIT = 256 * 1024 * 1024;
type Json = Record<string, any>;
export type SourceBoundWorkerCandidateScope = Readonly<{dateJst: string; sourceSha256: string}>;
function fail(code: string): never { throw new Error(code); }
function object(value: unknown): Json | null { return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Json : null; }
function digest(value: unknown): value is string { return typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value); }

/** No archive extraction, execution, private registry target or mutable remote image is accepted here. */
export function verifyLocalPatchArchive(bytes: Buffer, inspection: unknown, candidateTag = TAG) {
  if (![TAG, CURRENT_TAG, OCTOBER16_TAG, OCTOBER17_TAG].includes(candidateTag)) fail("PATCH_CANDIDATE_TAG_UNREVIEWED");
  return inspectLocalPatchArchive(bytes, inspection, candidateTag);
}

/** New local-only namespace. Historical tag and promotion allowlists are not
 * relaxed; the producer supplies a bracketed full source hash, never CLI text. */
export function sourceBoundWorkerCandidateScope(now: number, sourceSha256: string): SourceBoundWorkerCandidateScope {
  const offset = 9 * 60 * 60 * 1000;
  if (!Number.isSafeInteger(now) || now <= 0 || now > 8_640_000_000_000_000 - offset ||
      typeof sourceSha256 !== "string" || !/^[a-f0-9]{64}$/.test(sourceSha256)) fail("PATCH_SOURCE_BOUND_SCOPE_INVALID");
  const dateJst = new Date(now + offset).toISOString().slice(0, 10);
  if (!/^20[0-9]{2}-[0-9]{2}-[0-9]{2}$/.test(dateJst)) fail("PATCH_SOURCE_BOUND_SCOPE_INVALID");
  return Object.freeze({dateJst, sourceSha256});
}
export function sourceBoundWorkerCandidateTag(scope: SourceBoundWorkerCandidateScope) {
  if (!scope || Object.keys(scope).sort().join(",") !== "dateJst,sourceSha256" ||
      !/^20[0-9]{2}-[0-9]{2}-[0-9]{2}$/.test(scope.dateJst) || !/^[a-f0-9]{64}$/.test(scope.sourceSha256) ||
      !Number.isFinite(Date.parse(`${scope.dateJst}T00:00:00Z`)) || new Date(`${scope.dateJst}T00:00:00Z`).toISOString().slice(0,10) !== scope.dateJst)
    fail("PATCH_SOURCE_BOUND_SCOPE_INVALID");
  return `gmai-worker:local-${scope.dateJst.replaceAll("-", "")}-s${scope.sourceSha256}`;
}
export function verifySourceBoundWorkerCandidateScope(scope: SourceBoundWorkerCandidateScope, now: number, sourceSha256: string) {
  if (sourceBoundWorkerCandidateTag(scope) !== sourceBoundWorkerCandidateTag(sourceBoundWorkerCandidateScope(now, sourceSha256)))
    fail("PATCH_SOURCE_BOUND_SCOPE_CHANGED");
}
export function verifySourceBoundLocalPatchArchive(bytes: Buffer, inspection: unknown, scope: SourceBoundWorkerCandidateScope) {
  return inspectLocalPatchArchive(bytes, inspection, sourceBoundWorkerCandidateTag(scope));
}
function inspectLocalPatchArchive(bytes: Buffer, inspection: unknown, candidateTag: string) {
  const image = Array.isArray(inspection) && inspection.length === 1 ? object(inspection[0]) : null;
  if (!image || !digest(image.Id) || image.Os !== "linux" || image.Architecture !== "amd64" || image.Config?.User !== "65532:65532" ||
      JSON.stringify(image.Config?.Entrypoint) !== JSON.stringify(["/nodejs/bin/node", "main.mjs"]) || !Array.isArray(image.RepoTags) ||
      !image.RepoTags.includes(candidateTag) || !Number.isSafeInteger(image.Size) || image.Size <= 0 || image.Size > LIMIT) fail("PATCH_LOCAL_IMAGE_INVALID");
  const files = readBoundedCachedArchiveFiles(bytes);
  const parseBlob = (hash: string) => {
    if (!digest(hash)) fail("PATCH_LOCAL_MANIFEST_INVALID");
    const bytes = files.get(`blobs/sha256/${hash.slice(7)}`);
    if (!bytes || bytes.length === 0 || bytes.length > 256 * 1024) fail("PATCH_LOCAL_MANIFEST_INVALID");
    return { value: object(JSON.parse(bytes.toString("utf8"))), bytes: bytes.length };
  };
  // Containerd's inspected descriptor identifies the actual image root. Every
  // referenced blob was independently content-hashed by the bounded tar reader.
  const root = parseBlob(image.Id);
  let runtimeDigest = image.Id;
  if (root.value?.manifests) {
    const child = selectLinuxAmd64Child(root.value);
    const runtime = parseBlob(child.digest);
    if (runtime.bytes !== child.bytes || runtime.value?.mediaType !== child.mediaType) fail("PATCH_LOCAL_MANIFEST_INVALID");
    runtimeDigest = child.digest;
  }
  const manifest = parseBlob(runtimeDigest).value;
  if (!manifest || manifest.schemaVersion !== 2 || manifest.artifactType !== undefined || manifest.subject !== undefined) fail("PATCH_LOCAL_MANIFEST_INVALID");
  verifyRuntimeManifest(manifest);
  const configDigest = manifest?.config?.digest;
  if (!digest(configDigest)) fail("PATCH_LOCAL_MANIFEST_INVALID");
  const config = parseBlob(configDigest).value;
  if (!Array.isArray(config?.config?.Env) || config.config.Env.some((entry: unknown) => typeof entry !== "string" ||
      /^(AWS_|TWELVE_?DATA|OPENAI_|ANTHROPIC_)/i.test(entry) || ["GH_TOKEN", "GITHUB_TOKEN"].includes(entry.split("=")[0]!)) ||
      JSON.stringify(config.config.Entrypoint) !== JSON.stringify(["/nodejs/bin/node", "main.mjs"])) fail("PATCH_LOCAL_CONFIG_INVALID");
  const target = { reference: candidateTag, configDigest, runtimeDigest };
  return { target, imageId: image.Id as string, manifestBytes: files.get(`blobs/sha256/${runtimeDigest.slice(7)}`)!,
    binding: verifyCachedArchive(bytes, target) };
}

export function prepareWorkerPatchPlan(args: readonly string[] = []) {
  if (args.length) fail("PATCH_ARGUMENTS_REJECTED");
  return { mode: "dry-run", awsCalls: 0, cloudMutations: 0, buildsMax: 1, localScannersMax: 1, imagePushes: 0,
    credentialRetrievals: 0, publicBuildAndDatabaseDownloadsAllowed: true, internalJobsEnabled: false, readyForDeployment: false };
}
export function currentWorkerCandidateTag(now: number) {
  if (!Number.isSafeInteger(now) || now <= 0 || now > 8_640_000_000_000_000 || new Date(now).toISOString().slice(0, 10) !== "2026-10-12") fail("PATCH_CURRENT_SCOPE_EXPIRED");
  return CURRENT_TAG;
}
export function currentWorkerCandidatePlan(args: readonly string[] = []) {
  if (args.length) fail("PATCH_ARGUMENTS_REJECTED");
  return { ...prepareWorkerPatchPlan(), operation: "dated-current-source-local-candidate", candidateDateUtc: "2026-10-12",
    existingHistoricalCandidateOverwritten: false, currentApplicationArchiveProofRequired: true,
    liveImageSourceMismatchResolved: false, registryPromotionAuthorized: false };
}

/** New local-only scope, not an extension of the expired October 12 or private
 * promotion acceptance. Older image tags and their date guards stay intact. */
export function october16WorkerCandidateTag(now: number) {
  if (!Number.isSafeInteger(now) || now <= 0 || now > 8_640_000_000_000_000 || new Date(now).toISOString().slice(0, 10) !== "2026-10-16") fail("PATCH_OCTOBER16_SCOPE_EXPIRED");
  return OCTOBER16_TAG;
}
export function october16WorkerCandidatePlan(args: readonly string[] = []) {
  if (args.length) fail("PATCH_ARGUMENTS_REJECTED");
  return { ...prepareWorkerPatchPlan(), operation: "dated-current-source-local-candidate", candidateDateUtc: "2026-10-16",
    priorDatedCandidatesPreserved: true, currentApplicationArchiveProofRequired: true,
    liveImageSourceMismatchResolved: false, registryPromotionAuthorized: false };
}

/** Separate local-only Tokyo-day scope. Historical UTC-day and registry
 * promotion gates are unchanged; no clock override or old-tag overwrite. */
export function october17WorkerCandidateTag(now: number) {
  const offset = 9 * 60 * 60 * 1000;
  if (!Number.isSafeInteger(now) || now <= 0 || now > 8_640_000_000_000_000 - offset ||
      new Date(now + offset).toISOString().slice(0, 10) !== "2026-10-17") fail("PATCH_OCTOBER17_SCOPE_EXPIRED");
  return OCTOBER17_TAG;
}
export function october17WorkerCandidatePlan(args: readonly string[] = []) {
  if (args.length) fail("PATCH_ARGUMENTS_REJECTED");
  return { ...prepareWorkerPatchPlan(), operation: "dated-current-source-local-candidate", candidateDateJst: "2026-10-17",
    scopeTimezone: "Asia/Tokyo", priorDatedCandidatesPreserved: true, currentApplicationArchiveProofRequired: true,
    sourceAndBundleClosingRecheckRequired: true, liveImageSourceMismatchResolved: false, registryPromotionAuthorized: false };
}

export function sourceBoundWorkerCandidatePlan(args: readonly string[] = []) {
  if (args.length) fail("PATCH_ARGUMENTS_REJECTED");
  return {...prepareWorkerPatchPlan(), operation:"source-bound-local-candidate", scopeTimezone:"Asia/Tokyo",
    fullCurrentSourceHashInLocalTag:true, dayAndSourceClosingRecheckRequired:true, callerSelectedTagAllowed:false,
    priorDatedCandidatesPreserved:true, currentApplicationArchiveProofRequired:true, registryPromotionAuthorized:false,
    liveImageSourceMismatchResolved:false};
}

/** One local source build and isolated archive scan only. Registry promotion remains a separate operation. */
export async function prepareWorkerPatch(currentCandidate: boolean | "20261016" | "20261017-jst" | "source-bound-jst" = false) {
  if (typeof currentCandidate !== "boolean" && currentCandidate !== "20261016" && currentCandidate !== "20261017-jst" && currentCandidate !== "source-bound-jst") fail("PATCH_ARGUMENTS_REJECTED");
  assertNodeSecurityBaseline();
  let tag = currentCandidate === "source-bound-jst" ? "" : currentCandidate === "20261017-jst" ? october17WorkerCandidateTag(Date.now()) :
    currentCandidate === "20261016" ? october16WorkerCandidateTag(Date.now()) : currentCandidate ? currentWorkerCandidateTag(Date.now()) : TAG;
  const candidateDateUtc = currentCandidate === "20261016" ? "2026-10-16" : "2026-10-12";
  const cli = process.env.GMAI_DOCKER_CLI_PATH;
  if (process.platform !== "win32" || !cli || !isAbsolute(cli) || basename(cli).toLowerCase() !== "docker.exe" ||
      !existsSync(cli) || !lstatSync(cli).isFile() || lstatSync(cli).isSymbolicLink()) fail("PATCH_CLI_INVALID");
  const plugins = resolve(dirname(cli), "..", "cli-plugins"), buildx = join(plugins, "docker-buildx.exe");
  if (!lstatSync(plugins).isDirectory() || lstatSync(plugins).isSymbolicLink() || realpathSync(plugins) !== plugins ||
      !lstatSync(buildx).isFile() || lstatSync(buildx).isSymbolicLink() || realpathSync(buildx) !== buildx) fail("PATCH_BUILDX_PATH_INVALID");
  const base = resolve(tmpdir()), physical = realpathSync(base), directory = mkdtempSync(join(base, "gmai-live-image-scan-"));
  if (!safeScanTemporaryDirectory(base, directory, physical)) fail("PATCH_TEMP_INVALID");
  const started = Date.now(), scope = randomUUID().replaceAll("-", ""), name = `gmai-live-image-scan-${scope}`;
  const cache = join(directory, "cache"), config = join(directory, "docker-config"), archive = join(directory, "image.tar"), source = join(directory, "source");
  const env = cacheScanChildEnvironment(process.env, config);
  let scannerAttempted = false, packet: Record<string, unknown> | undefined;
  const docker = (args: string[], timeout = 20_000, cleanup = false, cwd = process.cwd()) => {
    const elapsed = Date.now() - started;
    if (!cleanup && (elapsed < 0 || elapsed + timeout >= 600_000)) fail("PATCH_DEADLINE");
    return spawnSync(cli, ["--host", HOST, ...args], { env, cwd, encoding: "utf8", windowsHide: true,
      timeout, maxBuffer: 8_000_000 });
  };
  const output = (result: ReturnType<typeof docker>) => {
    if (result.status !== 0 || result.signal !== null || typeof result.stdout !== "string") fail("PATCH_DOCKER_OPERATION_FAILED"); return result.stdout;
  };
  try {
    mkdirSync(cache); mkdirSync(config); mkdirSync(source);
    // The per-user Docker install keeps Buildx outside Docker's built-in global
    // search directory. This owned empty config exposes only its trusted install
    // path, not the user's auths, credential helper, contexts or cloud builders.
    writeFileSync(join(config, "config.json"), JSON.stringify({ auths: {}, cliPluginsExtraDirs: [plugins] }), { flag: "wx" });
    const sourceTools = await import(pathToFileURL(resolve("scripts/clean-source-build-proof.mjs")).href);
    sourceTools.copySources(source);
    const sourceFingerprint = sourceTools.fingerprintCopiedSource(source);
    const sourceScope = currentCandidate === "source-bound-jst" ? sourceBoundWorkerCandidateScope(Date.now(), sourceFingerprint.sha256) : null;
    if (sourceScope) tag = sourceBoundWorkerCandidateTag(sourceScope);
    const sourceStillCurrent = () => JSON.stringify(sourceTools.fingerprintCurrentSource()) === JSON.stringify(sourceFingerprint);
    let currentExpected: ReadonlyMap<string, Buffer> | undefined;
    if (currentCandidate) {
      if (!sourceStillCurrent()) fail("PATCH_CURRENT_SOURCE_CHANGED");
      try { verifyReviewedWorkerBaseSource(source); } catch { fail("PATCH_CURRENT_BASE_SOURCE_UNREVIEWED"); }
      const rebuilt = spawnSync(process.execPath, [resolve("scripts/build-worker-bundle.mjs")], { env, cwd: process.cwd(),
        encoding: "utf8", windowsHide: true, timeout: 30_000, maxBuffer: 200_000 });
      if (rebuilt.status !== 0 || rebuilt.signal !== null || rebuilt.error) fail("PATCH_CURRENT_BUNDLE_INCOMPLETE");
      currentExpected = readCurrentWorkerBundle();
      if (!currentExpected.get("THIRD_PARTY_NOTICES.md")!.equals(readFileSync(join(source, "THIRD_PARTY_NOTICES.md")))) fail("PATCH_CURRENT_NOTICE_MISMATCH");
    }
    // No cache pruning, user image overwrite, secret mount, build argument or registry login.
    const existing = docker(["image", "inspect", tag]);
    if (existing.status === 0 || !String(existing.stderr).includes("No such image:")) fail("PATCH_LOCAL_TAG_ALREADY_PRESENT_OR_UNKNOWN");
    verifyCachedScanner(JSON.parse(output(docker(["image", "inspect", SCANNER]))));
    const build = docker(["build", "--platform", "linux/amd64", "--provenance=false", "--sbom=false", "--pull=false",
      "--file", "services/worker/Dockerfile", "--tag", tag, "."], 300_000, false, source);
    if (build.status !== 0 || build.signal !== null) fail("PATCH_DOCKER_BUILD_FAILED");
    if (JSON.stringify(sourceTools.fingerprintCopiedSource(source)) !== JSON.stringify(sourceFingerprint)) fail("PATCH_SOURCE_CHANGED");
    const inspection = JSON.parse(output(docker(["image", "inspect", "--platform", "linux/amd64", tag])));
    output(docker(["image", "save", "--platform", "linux/amd64", "--output", archive, tag], 30_000));
    const stat = lstatSync(archive);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0 || stat.size > LIMIT || realpathSync(archive) !== archive) fail("PATCH_ARCHIVE_INVALID");
    const archiveBytes = readFileSync(archive), verified = sourceScope ? verifySourceBoundLocalPatchArchive(archiveBytes, inspection, sourceScope) : verifyLocalPatchArchive(archiveBytes, inspection, tag);
    const archiveFiles = currentCandidate ? readBoundedCachedArchiveFiles(archiveBytes) : null;
    const currentBaseProof = archiveFiles ? verifyWorkerBaseMetadata(verified.manifestBytes,
      archiveFiles.get(`blobs/sha256/${verified.target.configDigest.slice(7)}`)!, verified.target) : null;
    const currentApplicationProof = currentExpected ? verifyWorkerApplicationArchive(archiveBytes, verified.target, currentExpected) : null;
    scannerAttempted = true;
    const raw = JSON.parse(output(docker(["run", "--rm", "--pull", "never", "--name", name,
      "--label", "com.gmai.operator=gmai-live-image-archive-scan", "--label", `com.gmai.scope=${scope}`,
      "--read-only", "--cap-drop", "ALL", "--security-opt", "no-new-privileges", "--pids-limit", "128", "--memory", "1g", "--cpus", "1",
      "--tmpfs", "/tmp:rw,noexec,nosuid,size=512m", "--mount", `type=bind,source=${archive},target=/input/image.tar,readonly`,
      "--mount", `type=bind,source=${cache},target=/cache`, SCANNER,
      "image", "--input", "/input/image.tar", "--cache-dir", "/cache", "--format", "json", "--scanners", "vuln,secret", "--list-all-pkgs",
      "--skip-version-check", "--disable-telemetry", "--offline-scan"], 180_000)));
    const dbPath = join(cache, "db", "metadata.json");
    if (!lstatSync(dbPath).isFile() || lstatSync(dbPath).isSymbolicLink() || lstatSync(dbPath).size > 16_384 || realpathSync(dbPath) !== dbPath) fail("PATCH_DATABASE_INVALID");
    // Dynamic pure helper import avoids an initialization cycle: the retained
    // artifact operator imports this module's archive verifier, not this producer.
    const { summarizeCandidateVulnerabilities } = await import("./candidate-vulnerability-triage.js");
    const database = JSON.parse(readFileSync(dbPath, "utf8"));
    let coordinates: ReturnType<typeof summarizeCandidateVulnerabilities>;
    try { coordinates = summarizeCandidateVulnerabilities(raw, verified.target.configDigest, database, Date.now()); }
    catch { throwOsCoordinateDiagnostic(raw); }
    const {osFindings,osFindingCounts,nonOsVulnerabilities,duplicateRecordsDropped,rawScannerDetailsCopied,
      sourceAdvisoriesReviewed,exploitabilityVerified,automaticVulnerabilityWaivers,registryPromotionAuthorized,...summary}=coordinates;
    const osVulnerabilityTriage = projectOsVulnerabilityTriage({osFindings,osFindingCounts,nonOsVulnerabilities,
      osPackagesInspected:summary.osPackagesInspected,exactImageConfigMatched:summary.exactImageConfigMatched},
      verified.target.configDigest, summary.severityCounts, summary.osPackagesInspected,raw.Metadata.OS.Name);
    const finalInspection = JSON.parse(output(docker(["image", "inspect", "--platform", "linux/amd64", tag])));
    const final = sourceScope ? verifySourceBoundLocalPatchArchive(readFileSync(archive), finalInspection, sourceScope) : verifyLocalPatchArchive(readFileSync(archive), finalInspection, tag);
    if (final.imageId !== verified.imageId || JSON.stringify(final.target) !== JSON.stringify(verified.target)) fail("PATCH_LOCAL_IMAGE_CHANGED");
    if (currentExpected) {
      const closingBundle = readCurrentWorkerBundle();
      if (!sourceStillCurrent() || [...currentExpected].some(([name, bytes]) => !closingBundle.get(name)?.equals(bytes))) fail("PATCH_CURRENT_SOURCE_CHANGED");
    }
    if (sourceScope) verifySourceBoundWorkerCandidateScope(sourceScope, Date.now(), sourceFingerprint.sha256);
    packet = { mode: "local-worker-patch-build-scan", sourceBuildPerformed: true, runtimePlatform: "linux/amd64", awsCalls: 0, cloudMutations: 0,
      imagePushes: 0, credentialRetrievals: 0, sourceBuildSecretInputsPassed: false, provenanceAttestationsGenerated: false,
      sourceFingerprint, copiedSourceBuildContext: true, localCandidateTag: tag, localCandidateImageId: verified.imageId, runtimeManifestDigest: verified.target.runtimeDigest,
      imageConfigDigest: verified.target.configDigest, archiveBytes: stat.size, ...verified.binding, ...summary, osVulnerabilityTriage,
      existingUserImagesAndCachesPreserved: true, failedOrSuccessfulCandidateRetainedForInspection: true,
      ...(currentApplicationProof ? { ...(sourceScope ? {candidateDateJst:sourceScope.dateJst,scopeTimezone:"Asia/Tokyo",fullSourceHashTagBound:true} : currentCandidate === "20261017-jst" ? {candidateDateJst:"2026-10-17",scopeTimezone:"Asia/Tokyo"} : {candidateDateUtc}),
        currentApplicationProof, currentBaseProof, sourceAndBundleRecheckedAfterScan: true,
        liveImageSourceMismatchResolved: false, registryPromotionAuthorized: false, readyForDeployment: false } : {}) };
  } finally {
    if (scannerAttempted) {
      const inspection = docker(["container", "inspect", name], 15_000, true);
      if (inspection.status === 0) {
        const id = verifyOwnedScanContainer(JSON.parse(inspection.stdout), name, scope);
        output(docker(["container", "stop", "--time", "10", id], 20_000, true));
        const again = docker(["container", "inspect", name], 15_000, true);
        if (again.status === 0) { verifyOwnedScanContainer(JSON.parse(again.stdout), name, scope); output(docker(["container", "rm", id], 15_000, true)); }
      } else if (!String(inspection.stderr).includes(`No such container: ${name}`)) fail("PATCH_SCANNER_EXIT_UNVERIFIED");
      const final = docker(["container", "inspect", name], 15_000, true);
      if (final.status === 0 || !String(final.stderr).includes(`No such container: ${name}`)) fail("PATCH_SCANNER_EXIT_UNVERIFIED");
    }
    if (!safeScanTemporaryDirectory(base, directory, physical)) fail("PATCH_TEMP_INVALID");
    rmSync(directory, { recursive: true }); if (existsSync(directory)) fail("PATCH_TEMP_CLEANUP_UNVERIFIED");
  }
  if (!packet) fail("PATCH_INCOMPLETE"); return { ...packet, ownedScannerAbsent: true, temporaryArchiveAndCacheRemoved: true };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (!args.length) console.log(JSON.stringify(prepareWorkerPatchPlan()));
    else if (args.length === 1 && args[0] === "--plan-current-candidate") console.log(JSON.stringify(currentWorkerCandidatePlan()));
    else if (args.length === 1 && args[0] === "--plan-20261016-candidate") console.log(JSON.stringify(october16WorkerCandidatePlan()));
    else if (args.length === 1 && args[0] === "--plan-20261017-candidate") console.log(JSON.stringify(october17WorkerCandidatePlan()));
    else if (args.length === 1 && args[0] === "--plan-source-bound-candidate") console.log(JSON.stringify(sourceBoundWorkerCandidatePlan()));
    else { if (args.length !== 1 || !["--execute-local-build-scan", "--execute-current-local-build-scan", "--execute-20261016-local-build-scan", "--execute-20261017-local-build-scan", "--execute-source-bound-local-build-scan"].includes(args[0])) fail("PATCH_ARGUMENTS_REJECTED");
      console.log(JSON.stringify(await prepareWorkerPatch(args[0] === "--execute-source-bound-local-build-scan" ? "source-bound-jst" : args[0] === "--execute-20261017-local-build-scan" ? "20261017-jst" : args[0] === "--execute-20261016-local-build-scan" ? "20261016" : args[0] === "--execute-current-local-build-scan"))); }
  } catch (error) {
    const code = error instanceof Error && /^PATCH_[A-Z_]+$/.test(error.message) ? error.message : "PATCH_INCOMPLETE";
    console.error(JSON.stringify({ error: code, rawDetailsSuppressed: true, awsCalls: 0, cloudMutations: 0, readyForDeployment: false,
      cleanupMustBeIndependentlyVerified: true })); process.exitCode = 1;
  }
}
