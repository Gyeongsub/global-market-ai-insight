import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, statSync } from "node:fs";
import { basename, isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { phase11ReadOnlyChildEnvironment, validatePhase11ReadOnlyQuery } from "./phase11-live-readiness.js";

const REGION = "ap-northeast-1";
const PROFILE = "gmai-admin";
const PREFIX = "global-market-ai-insight-dev";
const REPOSITORY = `${PREFIX}-worker`;
const MAX_BYTES = 2_000_000;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MANIFEST_TYPES = ["application/vnd.oci.image.manifest.v1+json", "application/vnd.docker.distribution.manifest.v2+json"];
const INDEX_TYPES = ["application/vnd.oci.image.index.v1+json", "application/vnd.docker.distribution.manifest.list.v2+json"];
const SEVERITIES = ["INFORMATIONAL", "LOW", "MEDIUM", "HIGH", "CRITICAL", "UNDEFINED"] as const;
type Json = Record<string, unknown>;
type Reader = (args: readonly string[]) => unknown;

const IMAGE_FAILURE_CODES = ["LIVE_IMAGE_RESPONSE_INVALID", "LIVE_IMAGE_OPERATION_REJECTED", "LIVE_IMAGE_QUERY_REJECTED",
  "LIVE_IMAGE_CLI_INVALID", "LIVE_IMAGE_READ_LIMIT", "LIVE_IMAGE_SCAN_NOT_FOUND", "LIVE_IMAGE_READ_FAILED",
  "LIVE_IMAGE_ARGUMENTS_REJECTED", "LIVE_IMAGE_CHECK_INCOMPLETE"] as const;
const IMAGE_FAILURE_STAGES = ["unknown", "arguments", "identity", "ownership", "controller", "task-definition", "image-target",
  "scan-findings", "scan-timestamps", "image-details", "manifest", "manifest-integrity", "manifest-descriptor", "index",
  "index-platform", "runtime-manifest", "read-count", "repository", "child-media-type", "controller-changed",
  "sts.get-caller-identity", "cloudformation.list-stack-resources", "lambda.get-function-configuration", "ecs.describe-task-definition",
  "ecr.describe-repositories", "ecr.describe-images", "ecr.describe-image-scan-findings", "ecr.batch-get-image"] as const;
class SafeImageError extends Error {
  readonly #packet;
  constructor(code: string, stage: string) {
    const known = IMAGE_FAILURE_CODES.includes(code as typeof IMAGE_FAILURE_CODES[number]);
    super(known ? code : "LIVE_IMAGE_CHECK_INCOMPLETE");
    this.#packet = Object.freeze({ error: known ? code : "LIVE_IMAGE_CHECK_INCOMPLETE",
      stage: known && IMAGE_FAILURE_STAGES.includes(stage as typeof IMAGE_FAILURE_STAGES[number]) ? stage : "unknown",
      readyForExecution: false, privateDetailsSuppressed: true });
  }
  packet() { return this.#packet; }
}

export function summarizeLiveImageFailure(error: unknown) {
  try {
    if (error instanceof SafeImageError) return SafeImageError.prototype.packet.call(error);
  } catch { /* Forged prototypes and throwing getters remain untrusted. */ }
  return new SafeImageError("LIVE_IMAGE_CHECK_INCOMPLETE", "unknown").packet();
}

function object(value: unknown): Json | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Json : null;
}
function fail(stage: string): never { throw new SafeImageError("LIVE_IMAGE_RESPONSE_INVALID", stage); }
function noContinuation(value: Json) { return value.nextToken == null && value.NextToken == null; }
function collection(value: unknown, key: string, stage: string): Json[] {
  const input = object(value);
  if (!input || !noContinuation(input) || !Array.isArray(input[key]) || input[key].length > 1000 || input[key].some(entry => !object(entry))) fail(stage);
  return input[key] as Json[];
}
function accountFrom(value: unknown): string {
  const input = object(value);
  if (typeof input?.Account !== "string" || !/^[0-9]{12}$/.test(input.Account) || /^0+$/.test(input.Account) ||
      input.Arn !== `arn:aws:iam::${input.Account}:user/aws-admin-user`) fail("identity");
  return input.Account;
}
function owns(value: unknown, type: string, physical: string) {
  const entries = collection(value, "StackResourceSummaries", "ownership");
  const logical = new Set<string>();
  for (const entry of entries) {
    if (typeof entry.LogicalResourceId !== "string" || !/^[A-Za-z0-9]{1,255}$/.test(entry.LogicalResourceId) || logical.has(entry.LogicalResourceId)) fail("ownership");
    logical.add(entry.LogicalResourceId);
  }
  const matches = entries.filter(entry => entry.ResourceType === type && entry.PhysicalResourceId === physical);
  if (matches.length !== 1 || !/^(?:CREATE|UPDATE)_COMPLETE$/.test(String(matches[0]!.ResourceStatus))) fail("ownership");
}
function controllerTarget(value: unknown, account: string): string {
  const input = object(value);
  const variables = object(object(input?.Environment)?.Variables);
  const arn = variables?.WORKER_TASK_DEFINITION;
  if (input?.FunctionName !== `${PREFIX}-controller` || input.FunctionArn !== `arn:aws:lambda:${REGION}:${account}:function:${PREFIX}-controller` ||
      input.State !== "Active" || input.LastUpdateStatus !== "Successful" || input.Runtime !== "nodejs22.x" ||
      variables?.ENABLE_PROVIDER_BACKED_JOBS !== "false" || variables.ENABLE_LIVE_RESULT_DISPLAY !== "false" ||
      typeof arn !== "string" || !new RegExp(`^arn:aws:ecs:${REGION}:${account}:task-definition/${REPOSITORY}:[1-9][0-9]*$`).test(arn)) fail("controller");
  return arn;
}
function imageTarget(value: unknown, account: string, taskArn: string) {
  const task = object(object(value)?.taskDefinition);
  const containers = task?.containerDefinitions;
  const platform = object(task?.runtimePlatform);
  if (task?.taskDefinitionArn !== taskArn || task.status !== "ACTIVE" || platform?.operatingSystemFamily !== "LINUX" || platform.cpuArchitecture !== "X86_64" ||
      !Array.isArray(containers) || containers.length !== 1) fail("task-definition");
  const worker = object(containers[0]);
  if (worker?.readonlyRootFilesystem !== true || worker.user !== "65532:65532" || worker.privileged === true ||
      typeof worker.image !== "string") fail("task-definition");
  const prefix = `${account}.dkr.ecr.${REGION}.amazonaws.com/${REPOSITORY}@`;
  const digest = worker.image.startsWith(prefix) ? worker.image.slice(prefix.length) : "";
  if (!/^sha256:[a-f0-9]{64}$/.test(digest)) fail("image-target");
  return { digest, uri: prefix.slice(0, -1) };
}
function timestamp(value: unknown): number | null {
  // AWS CLI JSON uses ISO timestamps; numeric API timestamps are Unix seconds.
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value * 1000;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    const [year, month, day] = value.slice(0, 10).split("-").map(Number);
    const calendar = new Date(Date.UTC(year!, month! - 1, day!));
    if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() + 1 !== month || calendar.getUTCDate() !== day ||
        Number(value.slice(11, 13)) > 23 || Number(value.slice(14, 16)) > 59 || Number(value.slice(17, 19)) > 59) return null;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** A stored ECR OS scan is not a secret, full dependency or current-source scan. */
export function evaluateStoredBasicScan(value: unknown, account: string, digest: string, now: number) {
  const input = object(value);
  const findings = object(input?.imageScanFindings);
  const counts = object(findings?.findingSeverityCounts);
  if (!Number.isSafeInteger(now) || now <= 0 || !/^[0-9]{12}$/.test(account) || /^0+$/.test(account) || !/^sha256:[a-f0-9]{64}$/.test(digest) ||
      !input || input.registryId !== account || input.repositoryName !== REPOSITORY || object(input.imageId)?.imageDigest !== digest ||
      !noContinuation(input) || object(input.imageScanStatus)?.status !== "COMPLETE" || !findings ||
      Object.hasOwn(findings, "enhancedFindings") || !counts || !Array.isArray(findings.findings) || findings.findings.length > 1000) fail("scan-findings");
  const normalized = Object.fromEntries(SEVERITIES.map(severity => [severity, 0])) as Record<typeof SEVERITIES[number], number>;
  for (const [key, count] of Object.entries(counts)) {
    if (!SEVERITIES.includes(key as typeof SEVERITIES[number]) || typeof count !== "number" || !Number.isSafeInteger(count) || count < 0 || count > 1000) fail("scan-findings");
    normalized[key as typeof SEVERITIES[number]] = count;
  }
  const observed = { ...normalized };
  for (const severity of SEVERITIES) observed[severity] = 0;
  for (const candidate of findings.findings) {
    const severity = object(candidate)?.severity;
    if (typeof severity !== "string" || !SEVERITIES.includes(severity as typeof SEVERITIES[number])) fail("scan-findings");
    observed[severity as typeof SEVERITIES[number]] += 1;
  }
  if (SEVERITIES.some(severity => observed[severity] !== normalized[severity])) fail("scan-findings");
  const completed = timestamp(findings.imageScanCompletedAt);
  const sourceUpdated = timestamp(findings.vulnerabilitySourceUpdatedAt);
  if (completed === null || sourceUpdated === null || completed > now || sourceUpdated > now) fail("scan-timestamps");
  const fresh = now - completed <= MAX_AGE_MS && now - sourceUpdated <= MAX_AGE_MS;
  const blockingFindings = normalized.HIGH + normalized.CRITICAL + normalized.UNDEFINED;
  return {
    scanStatus: "COMPLETE", scanAgeHours: Math.ceil((now - completed) / 3_600_000),
    sourceAgeHours: Math.ceil((now - sourceUpdated) / 3_600_000), freshWithin24Hours: fresh,
    eligibleForDailyRefresh: now - completed >= MAX_AGE_MS,
    severityCounts: normalized, basicOsGatePassed: fresh && blockingFindings === 0,
  };
}

function common(service: string, operation: string, extra: readonly string[] = []): string[] {
  return [service, operation, ...extra, "--profile", PROFILE, "--region", REGION, "--output", "json", "--no-paginate", "--no-cli-pager"];
}

function verifiedImageDetail(value: unknown, account: string, digest: string, manifestOnly = false): string {
  const images = collection(value, "imageDetails", "image-details");
  const image = images.length === 1 ? images[0] : undefined;
  const types = manifestOnly ? MANIFEST_TYPES : [...MANIFEST_TYPES, ...INDEX_TYPES];
  if (image?.registryId !== account || image.repositoryName !== REPOSITORY || image.imageDigest !== digest ||
      !types.includes(String(image.imageManifestMediaType)) || typeof image.imageSizeInBytes !== "number" ||
      !Number.isSafeInteger(image.imageSizeInBytes) || image.imageSizeInBytes <= 0 || image.imageSizeInBytes > 256 * 1024 * 1024) fail("image-details");
  return image.imageManifestMediaType as string;
}

/** Hash the exact returned bytes before interpreting any manifest or child descriptor. */
export function verifyRegistryManifest(value: unknown, account: string, digest: string, mediaType: string, expectedBytes?: number): Json {
  const response = object(value);
  const images = collection(value, "images", "manifest");
  const image = images.length === 1 ? images[0] : undefined;
  if (!response || !Array.isArray(response.failures) || response.failures.length !== 0 || image?.registryId !== account ||
      image.repositoryName !== REPOSITORY || object(image.imageId)?.imageDigest !== digest || image.imageManifestMediaType !== mediaType ||
      typeof image.imageManifest !== "string") fail("manifest");
  const size = Buffer.byteLength(image.imageManifest, "utf8");
  if (size <= 0 || size > 65_536 || (expectedBytes !== undefined && size !== expectedBytes) ||
      `sha256:${createHash("sha256").update(image.imageManifest, "utf8").digest("hex")}` !== digest) fail("manifest-integrity");
  let manifest: Json | null;
  try { manifest = object(JSON.parse(image.imageManifest)); } catch { fail("manifest"); }
  if (!manifest || manifest.schemaVersion !== 2 || manifest.mediaType !== mediaType || Object.hasOwn(manifest, "subject") || Object.hasOwn(manifest, "artifactType")) fail("manifest");
  return manifest;
}

function descriptor(value: unknown, types: readonly string[], maxSize: number): Json {
  const input = object(value);
  if (!input || typeof input.digest !== "string" || !/^sha256:[a-f0-9]{64}$/.test(input.digest) || typeof input.size !== "number" ||
      !Number.isSafeInteger(input.size) || input.size <= 0 || input.size > maxSize || !types.includes(String(input.mediaType)) ||
      Object.hasOwn(input, "urls") || Object.hasOwn(input, "data")) fail("manifest-descriptor");
  return input;
}

export function selectLinuxAmd64Child(manifest: Json): { digest: string; mediaType: string; bytes: number } {
  if (!INDEX_TYPES.includes(String(manifest.mediaType)) || !Array.isArray(manifest.manifests) || manifest.manifests.length === 0 || manifest.manifests.length > 8) fail("index");
  const selected: Json[] = [];
  const digests = new Set<string>();
  for (const candidate of manifest.manifests) {
    const entry = descriptor(candidate, MANIFEST_TYPES, 65_536);
    if (digests.has(entry.digest as string)) fail("index");
    digests.add(entry.digest as string);
    const platform = object(entry.platform);
    if (!platform || typeof platform.os !== "string" || typeof platform.architecture !== "string") fail("index-platform");
    if (platform.os === "linux" && platform.architecture === "amd64") {
      if (["os.version", "os.features", "features", "variant"].some(key => Object.hasOwn(platform, key)) ||
          object(entry.annotations)?.["vnd.docker.reference.type"] === "attestation-manifest") fail("index-platform");
      selected.push(entry);
    }
  }
  // Never silently select one of several equally plausible runtime manifests.
  if (selected.length !== 1) fail("index-platform");
  return { digest: selected[0]!.digest as string, mediaType: selected[0]!.mediaType as string, bytes: selected[0]!.size as number };
}

export function verifyRuntimeManifest(manifest: Json) {
  if (!MANIFEST_TYPES.includes(String(manifest.mediaType)) || Object.hasOwn(manifest, "manifests") || !Array.isArray(manifest.layers) ||
      manifest.layers.length === 0 || manifest.layers.length > 64) fail("runtime-manifest");
  descriptor(manifest.config, ["application/vnd.oci.image.config.v1+json", "application/vnd.docker.container.image.v1+json"], 256 * 1024);
  let bytes = 0;
  for (const candidate of manifest.layers) {
    const layer = descriptor(candidate, ["application/vnd.oci.image.layer.v1.tar", "application/vnd.oci.image.layer.v1.tar+gzip", "application/vnd.oci.image.layer.v1.tar+zstd", "application/vnd.docker.image.rootfs.diff.tar.gzip"], 256 * 1024 * 1024);
    bytes += layer.size as number;
  }
  if (bytes > 256 * 1024 * 1024) fail("runtime-manifest");
}

/** At most twelve reads, including an immutable index's exact runtime child. No layer pull or write. */
export function collectLiveImageReadiness(read: Reader, now: () => number = Date.now) {
  let calls = 0;
  const counted: Reader = args => { calls += 1; if (calls > 12) fail("read-count"); return read(args); };
  const run = counted;
  const account = accountFrom(run(common("sts", "get-caller-identity")));
  const foundation = run(common("cloudformation", "list-stack-resources", ["--stack-name", `${PREFIX}-foundation`]));
  owns(foundation, "AWS::ECR::Repository", REPOSITORY);
  const compute = run(common("cloudformation", "list-stack-resources", ["--stack-name", `${PREFIX}-compute`]));
  owns(compute, "AWS::Lambda::Function", `${PREFIX}-controller`);
  const controllerArgs = common("lambda", "get-function-configuration", ["--function-name", `${PREFIX}-controller`]);
  const taskArn = controllerTarget(run(controllerArgs), account);
  owns(compute, "AWS::ECS::TaskDefinition", taskArn);
  const target = imageTarget(run(common("ecs", "describe-task-definition", ["--task-definition", taskArn])), account, taskArn);
  const repositories = collection(run(common("ecr", "describe-repositories", ["--registry-id", account, "--repository-names", REPOSITORY])), "repositories", "repository");
  const repository = repositories.length === 1 ? repositories[0] : undefined;
  if (repository?.registryId !== account || repository.repositoryName !== REPOSITORY || repository.repositoryUri !== target.uri ||
      repository.repositoryArn !== `arn:aws:ecr:${REGION}:${account}:repository/${REPOSITORY}` || repository.imageTagMutability !== "IMMUTABLE" ||
      object(repository.encryptionConfiguration)?.encryptionType !== "AES256") fail("repository");
  const imageArgs = (digest: string) => ["--registry-id", account, "--repository-name", REPOSITORY, "--image-ids", `imageDigest=${digest}`];
  const rootType = verifiedImageDetail(run(common("ecr", "describe-images", imageArgs(target.digest))), account, target.digest);
  const rootManifest = verifyRegistryManifest(run(common("ecr", "batch-get-image", imageArgs(target.digest))), account, target.digest, rootType);
  const indexChildSelected = INDEX_TYPES.includes(rootType);
  let runtimeDigest = target.digest;
  let runtimeManifest = rootManifest;
  if (indexChildSelected) {
    const child = selectLinuxAmd64Child(rootManifest);
    if (verifiedImageDetail(run(common("ecr", "describe-images", imageArgs(child.digest))), account, child.digest, true) !== child.mediaType) fail("child-media-type");
    runtimeManifest = verifyRegistryManifest(run(common("ecr", "batch-get-image", imageArgs(child.digest))), account, child.digest, child.mediaType, child.bytes);
    runtimeDigest = child.digest;
  }
  verifyRuntimeManifest(runtimeManifest);
  const scanResponse = run(common("ecr", "describe-image-scan-findings", ["--registry-id", account, "--repository-name", REPOSITORY, "--image-id", `imageDigest=${runtimeDigest}`, "--max-results", "1000"]));
  // Reject a controller changed during the read sequence instead of validating an obsolete image.
  if (controllerTarget(run(controllerArgs), account) !== taskArn) fail("controller-changed");
  const scan = evaluateStoredBasicScan(scanResponse, account, runtimeDigest, now());
  return {
    mode: "live-image-readiness", awsCalls: calls, cloudMutations: 0, region: REGION,
    exactOwnedLiveImageVerified: true, controllerStillDisabled: true, indexChildSelected, manifestBytesVerified: true,
    runtimePlatform: "linux/amd64", imageConfigArchitectureVerified: false, ...scan,
    secretScanVerified: false, applicationDependencyScanVerified: false, currentSourceDeploymentVerified: false,
    freshRuntimeArchiveScanStillRequired: true, readyForExecution: false, readyForPublication: false,
    rawIdentifiersPrinted: false,
  };
}

export function validateLiveImageReadOnlyQuery(args: readonly string[]): string {
  if (args[0] !== "ecr") {
    const stage = validatePhase11ReadOnlyQuery(args);
    if (!["sts.get-caller-identity", "cloudformation.list-stack-resources", "lambda.get-function-configuration", "ecs.describe-task-definition"].includes(stage)) throw new SafeImageError("LIVE_IMAGE_OPERATION_REJECTED", "unknown");
    if (args.includes(`${PREFIX}-api`)) throw new SafeImageError("LIVE_IMAGE_QUERY_REJECTED", "ownership");
    return stage;
  }
  const operation = args[1];
  if (!operation || !["describe-repositories", "describe-images", "describe-image-scan-findings", "batch-get-image"].includes(operation)) throw new SafeImageError("LIVE_IMAGE_OPERATION_REJECTED", "unknown");
  const stage = `ecr.${operation}`;
  const invalid = () => { throw new SafeImageError("LIVE_IMAGE_QUERY_REJECTED", stage); };
  const options = new Map<string, string | true>();
  if (args.length > 26 || args.some(arg => typeof arg !== "string" || arg.length > 4096)) invalid();
  for (let index = 2; index < args.length; index += 1) {
    const key = args[index]!;
    if (!key.startsWith("--") || options.has(key)) invalid();
    if (["--no-paginate", "--no-cli-pager"].includes(key)) options.set(key, true);
    else { const value = args[++index]; if (!value || value.startsWith("--")) invalid(); options.set(key, value!); }
  }
  const repositoryKey = operation === "describe-repositories" ? "--repository-names" : "--repository-name";
  const specific = operation === "describe-repositories" ? [] : ["describe-images", "batch-get-image"].includes(operation) ? ["--image-ids"] : ["--image-id", "--max-results"];
  const keys = ["--profile", "--region", "--output", "--no-paginate", "--no-cli-pager", "--registry-id", repositoryKey, ...specific];
  if (options.size !== keys.length || keys.some(key => !options.has(key)) || options.get("--profile") !== PROFILE || options.get("--region") !== REGION ||
      options.get("--output") !== "json" || options.get(repositoryKey) !== REPOSITORY || typeof options.get("--registry-id") !== "string" ||
      !/^[0-9]{12}$/.test(String(options.get("--registry-id"))) || /^0+$/.test(String(options.get("--registry-id")))) invalid();
  if (specific.length && !/^imageDigest=sha256:[a-f0-9]{64}$/.test(String(options.get(specific[0]!)))) invalid();
  if (operation === "describe-image-scan-findings" && options.get("--max-results") !== "1000") invalid();
  return stage;
}

interface CliDependencies {
  now?: () => number;
  spawn?: (command: string, args: readonly string[], options: { encoding: "utf8"; timeout: number; maxBuffer: number; windowsHide: boolean; env: NodeJS.ProcessEnv }) => { status: number | null; signal: string | null; stdout: unknown; stderr?: unknown };
}
export function createLiveImageReadOnlyRunner(dependencies: CliDependencies = {}): Reader {
  const configured = process.env.GMAI_AWS_CLI_PATH;
  if (configured && (!isAbsolute(configured) || !["aws", "aws.exe"].includes(basename(configured).toLowerCase()) || !existsSync(configured) || !statSync(configured).isFile())) throw new SafeImageError("LIVE_IMAGE_CLI_INVALID", "unknown");
  const now = dependencies.now ?? Date.now;
  const spawn = dependencies.spawn ?? ((command, args, options) => spawnSync(command, args, options));
  const started = now();
  const env = phase11ReadOnlyChildEnvironment(process.env);
  let calls = 0;
  return args => {
    const stage = validateLiveImageReadOnlyQuery(args);
    const elapsed = now() - started;
    if (calls >= 12 || !Number.isSafeInteger(started) || started < 0 || !Number.isSafeInteger(elapsed) || elapsed < 0 || elapsed >= 180_000) throw new SafeImageError("LIVE_IMAGE_READ_LIMIT", stage);
    calls += 1;
    const result = spawn(configured ?? "aws", args, { encoding: "utf8", timeout: Math.min(30_000, 180_000 - elapsed), maxBuffer: MAX_BYTES, windowsHide: true, env });
    const finished = now() - started;
    if (!Number.isSafeInteger(finished) || finished < 0 || finished >= 180_000) throw new SafeImageError("LIVE_IMAGE_READ_LIMIT", stage);
    if (result.status !== 0 || result.signal !== null || typeof result.stdout !== "string" || Buffer.byteLength(result.stdout, "utf8") > MAX_BYTES) {
      const missing = stage === "ecr.describe-image-scan-findings" && typeof result.stderr === "string" && /\(ScanNotFoundException\)/.test(result.stderr);
      throw new SafeImageError(missing ? "LIVE_IMAGE_SCAN_NOT_FOUND" : "LIVE_IMAGE_READ_FAILED", stage);
    }
    try { return JSON.parse(result.stdout); } catch { fail(stage); }
  };
}

export function liveImageReadinessPlan(args: readonly string[] = []) {
  if (args.length !== 0) throw new SafeImageError("LIVE_IMAGE_ARGUMENTS_REJECTED", "arguments");
  return { mode: "dry-run", operation: "live-image-readiness", awsCalls: 0, awsCallsMax: 12, cloudMutations: 0,
    pulls: 0, credentialsRetrieved: false, rescansStarted: false, internalJobsEnabled: false,
    localScanProvesLiveImage: false, readyForExecution: false, readyForPublication: false };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (args.length === 0) console.log(JSON.stringify(liveImageReadinessPlan()));
    else {
      if (args.length !== 1 || args[0] !== "--execute-read-only" || process.env.AWS_PROFILE !== PROFILE) throw new SafeImageError("LIVE_IMAGE_ARGUMENTS_REJECTED", "arguments");
      console.log(JSON.stringify(collectLiveImageReadiness(createLiveImageReadOnlyRunner())));
    }
  } catch (error) { console.error(JSON.stringify(summarizeLiveImageFailure(error))); process.exitCode = 1; }
}
