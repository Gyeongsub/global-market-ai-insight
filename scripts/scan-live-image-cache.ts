import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { phase11ReadOnlyChildEnvironment } from "./phase11-live-readiness.js";
import { collectLiveImageReadiness, createLiveImageReadOnlyRunner, evaluateStoredBasicScan, summarizeLiveImageFailure, verifyRegistryManifest } from "./live-image-readiness.js";
import { PATCH, verifyPromotedImageDetail } from "./worker-patch-identity.js";

const HOST = "npipe:////./pipe/dockerDesktopLinuxEngine";
const SCANNER = "sha256:cffe3f5161a47a6823fbd23d985795b3ed72a4c806da4c4df16266c02accdd6f";
const LIMIT = 256 * 1024 * 1024;
const OWNER = "gmai-live-image-archive-scan";
type Json = Record<string, any>;
type Reader = (args: readonly string[]) => unknown;
function object(value: unknown): Json | null { return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Json : null; }
const CACHE_FAILURE_CODES = ["CACHE_TARGET_NOT_VERIFIED", "CACHE_PATCH_IDENTITY_INVALID", "CACHE_PATCH_SCAN_BLOCKED",
  "CACHE_IMAGE_IDENTITY_INVALID", "CACHE_SCANNER_IDENTITY_INVALID", "CACHE_ARCHIVE_INVALID", "CACHE_ARCHIVE_BLOB_HASH_INVALID",
  "CACHE_ARCHIVE_ENTRY_TYPE_UNSUPPORTED", "CACHE_ARCHIVE_METADATA_MISSING", "CACHE_ARCHIVE_BINDING_INVALID", "CACHE_SCAN_DB_TIME_INVALID",
  "CACHE_SCAN_REPORT_INVALID", "CACHE_SCAN_DB_STALE", "CACHE_SCAN_OS_INVENTORY_MISSING", "CACHE_SCAN_CONTAINER_OWNER_INVALID",
  "CACHE_SCAN_ARGUMENTS_REJECTED", "CACHE_DOCKER_CLI_INVALID", "CACHE_TEMP_OWNER_INVALID", "CACHE_SCAN_DEADLINE_OR_CALL_LIMIT",
  "CACHE_DOCKER_OPERATION_FAILED", "CACHE_SCAN_ARCHIVE_INVALID", "CACHE_SCAN_DB_INVALID", "CACHE_LIVE_TARGET_CHANGED",
  "CACHE_SCANNER_STOP_UNVERIFIED", "CACHE_SCANNER_EXIT_UNVERIFIED", "CACHE_TEMP_CLEANUP_UNVERIFIED", "CACHE_SCAN_INCOMPLETE"] as const;
class CacheScanFailure extends Error {
  readonly #packet;
  constructor(code: typeof CACHE_FAILURE_CODES[number]) {
    const safe = CACHE_FAILURE_CODES.includes(code) ? code : "CACHE_SCAN_INCOMPLETE";
    super(safe);
    this.#packet = Object.freeze({ error: safe, stage: "cached-image-or-scanner", readyForExecution: false,
      rawDetailsSuppressed: true, cleanupMustBeIndependentlyVerified: true });
  }
  packet() { return this.#packet; }
}
function fail(code: typeof CACHE_FAILURE_CODES[number]): never { throw new CacheScanFailure(code); }
export function cachedScanFailurePacket(error: unknown) {
  try { if (error instanceof CacheScanFailure) return CacheScanFailure.prototype.packet.call(error); }
  catch { /* Private branded state is required, not an Error message prefix. */ }
  const live = summarizeLiveImageFailure(error);
  return { error: live.error === "LIVE_IMAGE_CHECK_INCOMPLETE" ? "CACHE_SCAN_INCOMPLETE" : live.error,
    stage: live.stage, readyForExecution: false, rawDetailsSuppressed: true, cleanupMustBeIndependentlyVerified: true };
}
function digest(value: unknown): value is string { return typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value); }
export interface PrivateCacheTarget { reference: string; configDigest: string; runtimeDigest: string; }

/** Private target stays in operator memory. Only the separately returned public report may be printed. */
export function collectPrivateCacheTarget(read: Reader, now: () => number = Date.now) {
  let reference: string | undefined;
  let configDigest: string | undefined;
  let runtimeDigest: string | undefined;
  const report = collectLiveImageReadiness(args => {
    const value = read(args);
    if (args[1] === "describe-task-definition") reference = object(value)?.taskDefinition?.containerDefinitions?.[0]?.image;
    if (args[1] === "batch-get-image") {
      const bytes = object(value)?.images?.[0]?.imageManifest;
      if (typeof bytes === "string") {
        const manifest = object(JSON.parse(bytes));
        if (manifest?.config) { configDigest = manifest.config.digest; runtimeDigest = object(value)?.images?.[0]?.imageId?.imageDigest; }
      }
    }
    return value;
  }, now);
  // collectLiveImageReadiness independently verifies root/child SHA-256, platform,
  // ownership, scan scope and the controller's still-disabled task reference.
  if (!reference || !digest(configDigest) || !digest(runtimeDigest) || !report.exactOwnedLiveImageVerified || !report.controllerStillDisabled) fail("CACHE_TARGET_NOT_VERIFIED");
  return { report, target: Object.freeze({ reference, configDigest, runtimeDigest }) };
}

/** Existing candidate only; live ownership/disabled gates stay independent. No credential or pull fallback. */
export function collectPrivateDatedPatchCacheTarget(readFactory: () => Reader, now: () => number = Date.now) {
  const live = collectPrivateCacheTarget(readFactory(), now), account = live.target.reference.split(".")[0]!;
  const read = readFactory();
  const query = (operation: string, extra: string[]) => read(["ecr", operation, "--registry-id", account,
    "--repository-name", "global-market-ai-insight-dev-worker", ...extra, "--profile", "gmai-admin", "--region", "ap-northeast-1", "--no-cli-pager", "--no-paginate", "--output", "json"]);
  verifyPromotedImageDetail(query("describe-images", ["--image-ids", `imageDigest=${PATCH.runtimeDigest}`]), account);
  const manifest = verifyRegistryManifest(query("batch-get-image", ["--image-ids", `imageDigest=${PATCH.runtimeDigest}`]), account, PATCH.runtimeDigest, "application/vnd.oci.image.manifest.v1+json");
  if (object(manifest.config)?.digest !== PATCH.configDigest) fail("CACHE_PATCH_IDENTITY_INVALID");
  const scan = evaluateStoredBasicScan(query("describe-image-scan-findings", ["--image-id", `imageDigest=${PATCH.runtimeDigest}`, "--max-results", "1000"]), account, PATCH.runtimeDigest, now());
  if (!scan.basicOsGatePassed) fail("CACHE_PATCH_SCAN_BLOCKED");
  return { report: { ...live.report, awsCalls: live.report.awsCalls + 3 }, liveTarget: live.target,
    target: Object.freeze({ reference: live.target.reference.replace(/@sha256:[a-f0-9]{64}$/, `@${PATCH.runtimeDigest}`),
      runtimeDigest: PATCH.runtimeDigest, configDigest: PATCH.configDigest }) };
}

export function verifyCachedLiveImage(value: unknown, target: PrivateCacheTarget) {
  const input = Array.isArray(value) && value.length === 1 ? object(value[0]) : null;
  const containerdId = input && [target.reference.split("@")[1], target.runtimeDigest].includes(input.Id) && input.Descriptor?.digest === input.Id &&
    ["application/vnd.oci.image.index.v1+json", "application/vnd.oci.image.manifest.v1+json", "application/vnd.docker.distribution.manifest.v2+json", "application/vnd.docker.distribution.manifest.list.v2+json"].includes(input.Descriptor?.mediaType);
  if (!input || typeof target.reference !== "string" || !/^(?!0{12}\.)[0-9]{12}\.dkr\.ecr\.ap-northeast-1\.amazonaws\.com\/global-market-ai-insight-dev-worker@sha256:[a-f0-9]{64}$/.test(target.reference) ||
      !digest(target.configDigest) || !digest(target.runtimeDigest) || (input.Id !== target.configDigest && !containerdId) || input.Os !== "linux" || input.Architecture !== "amd64" ||
      !Array.isArray(input.RepoDigests) || !input.RepoDigests.includes(target.reference) || input.Config?.User !== "65532:65532" ||
      !Number.isSafeInteger(input.Size) || input.Size <= 0 || input.Size > LIMIT) fail("CACHE_IMAGE_IDENTITY_INVALID");
  return { imageId: input.Id as string, size: input.Size as number };
}

export function verifyCachedScanner(value: unknown) {
  const input = Array.isArray(value) && value.length === 1 ? object(value[0]) : null;
  if (input?.Id !== SCANNER || input.Os !== "linux" || input.Architecture !== "amd64" ||
      JSON.stringify(input.Config?.Entrypoint) !== JSON.stringify(["trivy"]) || !Array.isArray(input.RepoDigests) ||
      !input.RepoDigests.some((entry: unknown) => typeof entry === "string" && /^aquasec\/trivy@sha256:[a-f0-9]{64}$/.test(entry))) fail("CACHE_SCANNER_IDENTITY_INVALID");
}

/** Containerd OCI/Docker-compatible export only. Inspect bounded tar bytes in memory; never extract or execute paths. */
export function readBoundedCachedArchiveFiles(bytes: Buffer): Map<string, Buffer> {
  if (!Buffer.isBuffer(bytes) || bytes.length < 1024 || bytes.length > LIMIT || bytes.length % 512 !== 0) fail("CACHE_ARCHIVE_INVALID");
  const files = new Map<string, Buffer>(), names = new Set<string>();
  const decode = (value: Buffer) => new TextDecoder("utf-8", { fatal: true }).decode(value).replace(/\0.*$/s, "");
  let ended = false;
  for (let offset = 0; offset < bytes.length;) {
    const header = bytes.subarray(offset, offset + 512);
    if (header.every(value => value === 0)) {
      if (bytes.length - offset < 1024 || !bytes.subarray(offset).every(value => value === 0)) fail("CACHE_ARCHIVE_INVALID");
      ended = true; break;
    }
    const checksum = decode(header.subarray(148, 156)).trim(), sizeText = decode(header.subarray(124, 136)).trim();
    if (!/^[0-7]+$/.test(checksum) || !/^[0-7]+$/.test(sizeText) || header.reduce((sum, byte, index) => sum + (index >= 148 && index < 156 ? 32 : byte), 0) !== Number.parseInt(checksum, 8)) fail("CACHE_ARCHIVE_INVALID");
    const prefix = decode(header.subarray(345, 500));
    const name = `${prefix ? prefix + "/" : ""}${decode(header.subarray(0, 100))}`;
    const size = Number.parseInt(sizeText, 8), kind = header[156];
    if (!Number.isSafeInteger(size) || size > LIMIT || offset + 512 + size > bytes.length || names.has(name) || names.size >= 512) fail("CACHE_ARCHIVE_INVALID");
    names.add(name);
    const content = bytes.subarray(offset + 512, offset + 512 + size);
    if (kind === 53) {
      if (size !== 0 || !["blobs", "blobs/", "blobs/sha256", "blobs/sha256/"].includes(name)) fail("CACHE_ARCHIVE_INVALID");
    } else if (kind === 0 || kind === 48) {
      if (!["index.json", "manifest.json", "oci-layout"].includes(name) && !/^blobs\/sha256\/[a-f0-9]{64}$/.test(name)) fail("CACHE_ARCHIVE_INVALID");
      if (name.startsWith("blobs/") && createHash("sha256").update(content).digest("hex") !== name.slice("blobs/sha256/".length)) fail("CACHE_ARCHIVE_BLOB_HASH_INVALID");
      files.set(name, content);
    } else fail("CACHE_ARCHIVE_ENTRY_TYPE_UNSUPPORTED");
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  if (!ended) fail("CACHE_ARCHIVE_INVALID");
  return files;
}

export function verifyCachedArchive(bytes: Buffer, target: PrivateCacheTarget) {
  const files = readBoundedCachedArchiveFiles(bytes);
  const parse = (path: string, maximum = 65_536) => {
    const data = files.get(path); if (!data || data.length === 0 || data.length > maximum) fail("CACHE_ARCHIVE_METADATA_MISSING");
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(data));
  };
  const blobPath = (value: string) => `blobs/sha256/${value.slice(7)}`;
  const runtime = object(parse(blobPath(target.runtimeDigest))), configPath = blobPath(target.configDigest), configBytes = files.get(configPath);
  const config = object(parse(configPath, 256 * 1024));
  const layers = runtime?.layers;
  const index = object(parse("index.json")), layout = object(parse("oci-layout")), dockerManifest = parse("manifest.json");
  if (!digest(target.runtimeDigest) || !digest(target.configDigest) || runtime?.schemaVersion !== 2 || runtime.config?.digest !== target.configDigest ||
      runtime.config?.size !== configBytes?.length || config?.os !== "linux" || config.architecture !== "amd64" || config.config?.User !== "65532:65532" ||
      config.rootfs?.type !== "layers" || !Array.isArray(config.rootfs.diff_ids) || !Array.isArray(layers) || layers.length < 1 || layers.length > 64 ||
      config.rootfs.diff_ids.length !== layers.length || index?.schemaVersion !== 2 || !Array.isArray(index.manifests) || index.manifests.length < 1 || index.manifests.length > 8 ||
      layout?.imageLayoutVersion !== "1.0.0" || !Array.isArray(dockerManifest) || dockerManifest.length !== 1 || dockerManifest[0]?.Config !== configPath ||
      !Array.isArray(dockerManifest[0]?.Layers) || dockerManifest[0].Layers.length !== layers.length) fail("CACHE_ARCHIVE_BINDING_INVALID");
  for (let index = 0; index < layers.length; index++) {
    const layer = object(layers[index]), diffId = config.rootfs.diff_ids[index];
    if (!layer || !digest(layer.digest) || !digest(diffId)) fail("CACHE_ARCHIVE_BINDING_INVALID");
    const stored = files.get(blobPath(layer.digest));
    if (stored && stored.length !== layer.size) fail("CACHE_ARCHIVE_BINDING_INVALID");
    const path = dockerManifest[0].Layers[index];
    if (![blobPath(layer.digest), blobPath(diffId)].includes(path) || !files.has(path)) fail("CACHE_ARCHIVE_BINDING_INVALID");
  }
  return { archiveContentsMatchedToRuntimeManifest: true, imageConfigArchitectureVerified: true, hashedBlobs: [...files.keys()].filter(path => path.startsWith("blobs/")).length };
}

function validTime(value: unknown): number {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(value)) fail("CACHE_SCAN_DB_TIME_INVALID");
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  const calendar = new Date(Date.UTC(year!, month! - 1, day!));
  if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() + 1 !== month || calendar.getUTCDate() !== day ||
      Number(value.slice(11, 13)) > 23 || Number(value.slice(14, 16)) > 59 || Number(value.slice(17, 19)) > 59) fail("CACHE_SCAN_DB_TIME_INVALID");
  const time = Date.parse(value); if (!Number.isFinite(time)) fail("CACHE_SCAN_DB_TIME_INVALID"); return time;
}

/** Reduce private Trivy matches/package paths to bounded counts; never emit its raw report. */
export function summarizeLiveArchiveScan(value: unknown, imageId: string, dbValue: unknown, now: number) {
  const input = object(value), db = object(dbValue);
  if (!Number.isSafeInteger(now) || now <= 0 || input?.SchemaVersion !== 2 || !digest(imageId) || input.Metadata?.ImageID !== imageId ||
      !Array.isArray(input.Results) || input.Results.length > 128 || db?.Version !== 2) fail("CACHE_SCAN_REPORT_INVALID");
  const updated = validTime(db.UpdatedAt), downloaded = validTime(db.DownloadedAt), next = validTime(db.NextUpdate);
  if (updated > now || downloaded > now || downloaded < updated || next <= now || next <= updated ||
      now - updated > 86_400_000 || now - downloaded > 86_400_000) fail("CACHE_SCAN_DB_STALE");
  const counts: Record<string, number> = { UNKNOWN: 0, LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
  let vulnerabilities = 0, secrets = 0, osPackages = 0;
  for (const candidate of input.Results) {
    const result = object(candidate); if (!result || !["os-pkgs", "lang-pkgs", "secret"].includes(result.Class)) fail("CACHE_SCAN_REPORT_INVALID");
    if (result.Class === "os-pkgs") {
      if (!Array.isArray(result.Packages) || result.Packages.length === 0 || result.Packages.length > 1000) fail("CACHE_SCAN_OS_INVENTORY_MISSING");
      osPackages += result.Packages.length;
    }
    if (result.Vulnerabilities !== undefined) {
      if (!Array.isArray(result.Vulnerabilities)) fail("CACHE_SCAN_REPORT_INVALID");
      for (const finding of result.Vulnerabilities) {
        if (!object(finding) || !Object.hasOwn(counts, finding.Severity) || ++vulnerabilities > 5000) fail("CACHE_SCAN_REPORT_INVALID");
        counts[finding.Severity]! += 1;
      }
    }
    if (result.Secrets !== undefined) {
      if (!Array.isArray(result.Secrets) || result.Secrets.some((finding: unknown) => !object(finding))) fail("CACHE_SCAN_REPORT_INVALID");
      secrets += result.Secrets.length; if (secrets > 1000) fail("CACHE_SCAN_REPORT_INVALID");
    }
  }
  if (osPackages === 0 || osPackages > 1000) fail("CACHE_SCAN_OS_INVENTORY_MISSING");
  return { exactImageConfigMatched: true, scannerDatabaseFresh: true, osPackagesInspected: osPackages,
    severityCounts: counts, detectedSecrets: secrets,
    archiveGatePassed: counts.UNKNOWN === 0 && counts.HIGH === 0 && counts.CRITICAL === 0 && secrets === 0,
    secretScannerEnabled: true, completeApplicationDependencyScanVerified: false, currentSourceDeploymentVerified: false,
    completeLicenseProvenanceVerified: false, readyForExecution: false, readyForPublication: false,
    rawScannerReportPrinted: false };
}

export function safeScanTemporaryDirectory(base: string, directory: string, physicalBase: string) {
  try {
    const name = basename(directory);
    return /^gmai-live-image-scan-[A-Za-z0-9]+$/.test(name) && relative(resolve(base), resolve(directory)) === name &&
      lstatSync(directory).isDirectory() && !lstatSync(directory).isSymbolicLink() && realpathSync(base) === physicalBase &&
      realpathSync(directory) === resolve(physicalBase, name);
  } catch { return false; }
}

export function verifyOwnedScanContainer(value: unknown, name: string, scope: string) {
  const input = Array.isArray(value) && value.length === 1 ? object(value[0]) : null;
  if (!/^gmai-live-image-scan-[a-f0-9]{32}$/.test(name) || !/^[a-f0-9]{32}$/.test(scope) || name !== `gmai-live-image-scan-${scope}` ||
      input?.Name !== `/${name}` || input.Image !== SCANNER || !/^[a-f0-9]{64}$/.test(input.Id) ||
      input.Config?.Labels?.["com.gmai.operator"] !== OWNER || input.Config.Labels["com.gmai.scope"] !== scope) fail("CACHE_SCAN_CONTAINER_OWNER_INVALID");
  return input.Id as string;
}

export function liveCacheScanPlan(args: readonly string[] = []) {
  if (args.length) fail("CACHE_SCAN_ARGUMENTS_REJECTED");
  return { mode: "dry-run", awsCalls: 0, awsReadsMax: 24, cloudMutations: 0, localScannersMax: 1,
    scannerTimeoutSeconds: 180, totalTimeoutSeconds: 600, imagePulls: 0, imagePushes: 0,
    credentialRetrievals: 0, dockerSocketMounted: false, publicationPerformed: false, readyForExecution: false };
}

export function cacheScanChildEnvironment(source: NodeJS.ProcessEnv, dockerConfig: string) {
  const env = phase11ReadOnlyChildEnvironment(source);
  for (const key of Object.keys(env)) if (/^(AWS_|GMAI_|CDK_|TWELVE_?DATA|BEDROCK_|OPENAI_|ANTHROPIC_|GITHUB_TOKEN$|GH_TOKEN$|NODE_OPTIONS$|NODE_PATH$|ESBUILD_|npm_config_esbuild_|DOCKER_|BUILDX_|BUILDKIT_|OTEL_|TRACEPARENT$|TRACESTATE$|BAGGAGE$|HTTP_PROXY$|HTTPS_PROXY$|ALL_PROXY$|NO_PROXY$|NODE_COMPILE_CACHE(?:_PORTABLE)?$|NODE_DISABLE_COMPILE_CACHE$|NODE_V8_COVERAGE$|NODE_TLS_REJECT_UNAUTHORIZED$)/i.test(key)) delete env[key];
  env.DOCKER_CONFIG = dockerConfig;
  env.NODE_DISABLE_COMPILE_CACHE = "1";
  env.NODE_TLS_REJECT_UNAUTHORIZED = "1";
  return env;
}

interface ScanDependencies {
  readFactory?: () => Reader;
  spawn?: typeof spawnSync;
}

/** Cached image only. A missing cache stops; it never adds ECR passwords or a registry pull path. */
export function scanLiveImageCache(dependencies: ScanDependencies = {}, scanDatedPatch = false): Record<string, unknown> {
  if (process.env.AWS_PROFILE !== "gmai-admin" || process.platform !== "win32") fail("CACHE_SCAN_ARGUMENTS_REJECTED");
  const configured = process.env.GMAI_DOCKER_CLI_PATH;
  if (!configured || !isAbsolute(configured) || basename(configured).toLowerCase() !== "docker.exe" || !existsSync(configured) ||
      !lstatSync(configured).isFile() || lstatSync(configured).isSymbolicLink()) fail("CACHE_DOCKER_CLI_INVALID");
  const started = Date.now();
  const base = resolve(tmpdir()), physicalBase = realpathSync(base);
  const directory = resolve(mkdtempSync(join(base, "gmai-live-image-scan-")));
  if (!safeScanTemporaryDirectory(base, directory, physicalBase)) fail("CACHE_TEMP_OWNER_INVALID");
  const scope = randomUUID().replaceAll("-", ""), name = `gmai-live-image-scan-${scope}`;
  const archive = join(directory, "image.tar"), cache = join(directory, "cache"), dockerConfig = join(directory, "docker-config");
  const env = cacheScanChildEnvironment(process.env, dockerConfig);
  const readFactory = dependencies.readFactory ?? (() => createLiveImageReadOnlyRunner());
  const spawn = dependencies.spawn ?? spawnSync;
  let scannerAttempted = false, containerAbsent = false, dockerCalls = 0;
  let packet: Record<string, unknown> | undefined;
  const docker = (args: string[], timeout = 20_000, cleanup = false) => {
    const elapsed = Date.now() - started;
    if (!cleanup && (elapsed < 0 || elapsed >= 600_000 || dockerCalls >= 8)) fail("CACHE_SCAN_DEADLINE_OR_CALL_LIMIT");
    dockerCalls++;
    return spawn(configured, ["--host", HOST, ...args], { encoding: "utf8", timeout: cleanup ? timeout : Math.min(timeout, 600_000 - elapsed),
      maxBuffer: 8_000_000, windowsHide: true, env });
  };
  const successful = (result: ReturnType<typeof docker>) => {
    if (result.status !== 0 || result.signal !== null || typeof result.stdout !== "string") fail("CACHE_DOCKER_OPERATION_FAILED");
    return result.stdout;
  };
  try {
    mkdirSync(cache); mkdirSync(dockerConfig);
    const targetReader = () => scanDatedPatch ? collectPrivateDatedPatchCacheTarget(readFactory) :
      { ...collectPrivateCacheTarget(readFactory()), liveTarget: undefined };
    const initial = targetReader();
    const image = verifyCachedLiveImage(JSON.parse(successful(docker(["image", "inspect", "--platform", "linux/amd64", initial.target.reference]))), initial.target);
    verifyCachedScanner(JSON.parse(successful(docker(["image", "inspect", SCANNER]))));
    successful(docker(["image", "save", "--platform", "linux/amd64", "--output", archive, initial.target.reference], 30_000));
    const file = lstatSync(archive);
    if (!file.isFile() || file.isSymbolicLink() || file.size <= 0 || file.size > LIMIT || realpathSync(archive) !== archive) fail("CACHE_SCAN_ARCHIVE_INVALID");
    const archiveBinding = verifyCachedArchive(readFileSync(archive), initial.target);
    scannerAttempted = true;
    const scan = JSON.parse(successful(docker(["run", "--rm", "--pull", "never", "--name", name,
      "--label", `com.gmai.operator=${OWNER}`, "--label", `com.gmai.scope=${scope}`,
      "--read-only", "--cap-drop", "ALL", "--security-opt", "no-new-privileges", "--pids-limit", "128", "--memory", "1g", "--cpus", "1",
      "--tmpfs", "/tmp:rw,noexec,nosuid,size=512m", "--mount", `type=bind,source=${archive},target=/input/image.tar,readonly`,
      "--mount", `type=bind,source=${cache},target=/cache`, SCANNER,
      "image", "--input", "/input/image.tar", "--cache-dir", "/cache", "--format", "json", "--scanners", "vuln,secret", "--list-all-pkgs",
      "--skip-version-check", "--disable-telemetry", "--offline-scan"], 180_000)));
    const dbPath = join(cache, "db", "metadata.json"), dbStat = lstatSync(dbPath);
    if (!dbStat.isFile() || dbStat.isSymbolicLink() || dbStat.size <= 0 || dbStat.size > 16_384 || realpathSync(dbPath) !== dbPath) fail("CACHE_SCAN_DB_INVALID");
    const summary = summarizeLiveArchiveScan(scan, initial.target.configDigest, JSON.parse(readFileSync(dbPath, "utf8")), Date.now());
    const final = targetReader();
    if (JSON.stringify(initial.target) !== JSON.stringify(final.target) || JSON.stringify(initial.liveTarget) !== JSON.stringify(final.liveTarget)) fail("CACHE_LIVE_TARGET_CHANGED");
    verifyCachedLiveImage(JSON.parse(successful(docker(["image", "inspect", "--platform", "linux/amd64", final.target.reference]))), final.target);
    packet = { mode: scanDatedPatch ? "dated-private-candidate-cached-archive-scan" : "live-cached-image-archive-scan", datedCandidateScanned: scanDatedPatch,
      awsCalls: initial.report.awsCalls + final.report.awsCalls,
      cloudMutations: 0, imagePulls: 0, imagePushes: 0, credentialRetrievals: 0, controllerStillDisabled: true,
      indexChildAndLocalConfigMatched: true, archiveBytes: file.size, ...archiveBinding, ...summary, dockerSocketMounted: false,
      sourceOrHomeMounted: false, publicDatabaseDownloadsAllowed: true, dependencyApiLookupsDisabled: true,
      telemetryDisabled: true, publicationPerformed: false };
  } finally {
    // Client timeout does not prove container exit. Exact random name + image +
    // labels must agree before stopping/removing any remaining owned scanner.
    if (scannerAttempted) {
      const inspection = docker(["container", "inspect", name], 15_000, true);
      if (inspection.status === 0) {
        const id = verifyOwnedScanContainer(JSON.parse(inspection.stdout), name, scope);
        const stopped = docker(["container", "stop", "--time", "10", id], 20_000, true);
        if (stopped.status !== 0 && !String(stopped.stderr).includes(`No such container: ${id}`)) fail("CACHE_SCANNER_STOP_UNVERIFIED");
        const again = docker(["container", "inspect", name], 15_000, true);
        if (again.status === 0) { verifyOwnedScanContainer(JSON.parse(again.stdout), name, scope); successful(docker(["container", "rm", id], 15_000, true)); }
      } else if (!String(inspection.stderr).includes(`No such container: ${name}`)) fail("CACHE_SCANNER_EXIT_UNVERIFIED");
      const final = docker(["container", "inspect", name], 15_000, true);
      containerAbsent = final.status !== 0 && String(final.stderr).includes(`No such container: ${name}`);
      if (!containerAbsent) fail("CACHE_SCANNER_EXIT_UNVERIFIED");
    } else containerAbsent = true;
    if (!safeScanTemporaryDirectory(base, directory, physicalBase)) fail("CACHE_TEMP_OWNER_INVALID");
    rmSync(directory, { recursive: true });
    if (existsSync(directory)) fail("CACHE_TEMP_CLEANUP_UNVERIFIED");
  }
  if (!packet) fail("CACHE_SCAN_INCOMPLETE");
  return { ...packet, ownedScannerAbsent: containerAbsent, temporaryArchiveAndCacheRemoved: true };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (!args.length) console.log(JSON.stringify(liveCacheScanPlan()));
    else {
      if (args[0] !== "--execute-cached-archive-scan" || args.length > 2 || (args.length === 2 && args[1] !== "--scan-dated-patch")) fail("CACHE_SCAN_ARGUMENTS_REJECTED");
      console.log(JSON.stringify(scanLiveImageCache({}, args[1] === "--scan-dated-patch")));
    }
  } catch (error) {
    console.error(JSON.stringify(cachedScanFailurePacket(error))); process.exitCode = 1;
  }
}
