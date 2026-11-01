import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { basename, isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { phase11ReadOnlyChildEnvironment } from "./phase11-live-readiness.js";
import { collectLiveImageReadiness, createLiveImageReadOnlyRunner, evaluateStoredBasicScan,
  summarizeLiveImageFailure, validateLiveImageReadOnlyQuery, verifyRegistryManifest } from "./live-image-readiness.js";
import { collectPrivateCacheTarget } from "./scan-live-image-cache.js";
import { PATCH, verifyPromotedImageDetail } from "./worker-patch-identity.js";

const REGION = "ap-northeast-1";
const PROFILE = "gmai-admin";
const REPOSITORY = "global-market-ai-insight-dev-worker";
const MAX_TOTAL_MS = 360_000;
const MAX_POLLS = 5;
const WAITING_SCAN_STATUSES = ["PENDING", "IN_PROGRESS"];
type Reader = (args: readonly string[]) => unknown;
type Json = Record<string, unknown>;
class SafeRefreshError extends Error {
  constructor(readonly code: string, readonly startAttempted = false) { super(code); }
}
function object(value: unknown): Json | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Json : null;
}
function common(operation: string, extras: readonly string[] = []): string[] {
  return ["ecr", operation, ...extras, "--profile", PROFILE, "--region", REGION, "--output", "json", "--no-paginate", "--no-cli-pager"];
}

/** A separate command owns the one permitted rescan write; the read-only tool never gains it. */
export function validateBasicScanControlQuery(args: readonly string[]): string {
  if (args.length === 10 && JSON.stringify(args) === JSON.stringify(common("get-registry-scanning-configuration"))) return "configuration-read";
  if (args[0] !== "ecr" || args[1] !== "start-image-scan") throw new SafeRefreshError("BASIC_SCAN_OPERATION_REJECTED");
  validateLiveImageReadOnlyQuery(["ecr", "describe-image-scan-findings", ...args.slice(2), "--max-results", "1000"]);
  return "one-scan-start";
}

interface ControlDependencies {
  spawn?: (command: string, args: readonly string[], options: { encoding: "utf8"; timeout: number; maxBuffer: number; windowsHide: boolean; env: NodeJS.ProcessEnv }) => { status: number | null; signal: string | null; stdout: unknown };
}
export function createBasicScanControlRunner(dependencies: ControlDependencies = {}): Reader {
  const configured = process.env.GMAI_AWS_CLI_PATH;
  if (configured && (!isAbsolute(configured) || !["aws", "aws.exe"].includes(basename(configured).toLowerCase()) || !existsSync(configured) || !statSync(configured).isFile())) throw new SafeRefreshError("BASIC_SCAN_CLI_INVALID");
  const spawn = dependencies.spawn ?? ((command, args, options) => spawnSync(command, args, options));
  let calls = 0;
  let attempted = false;
  let verifiedBasicRegistry: string | null = null;
  return args => {
    const kind = validateBasicScanControlQuery(args);
    if ((kind === "configuration-read" && calls !== 0) || (kind === "one-scan-start" && (calls !== 1 || attempted)) || calls >= 2) throw new SafeRefreshError("BASIC_SCAN_CONTROL_LIMIT", attempted);
    if (kind === "one-scan-start" && (!verifiedBasicRegistry || args[args.indexOf("--registry-id") + 1] !== verifiedBasicRegistry)) throw new SafeRefreshError("BASIC_SCAN_MODE_NOT_VERIFIED");
    calls += 1;
    if (kind === "one-scan-start") attempted = true; // Consumed before spawn, including ambiguous failure.
    const result = spawn(configured ?? "aws", args, { encoding: "utf8", timeout: 30_000, maxBuffer: 2_000_000, windowsHide: true, env: phase11ReadOnlyChildEnvironment(process.env) });
    if (result.status !== 0 || result.signal !== null || typeof result.stdout !== "string" || Buffer.byteLength(result.stdout, "utf8") > 2_000_000) throw new SafeRefreshError("BASIC_SCAN_CONTROL_FAILED", attempted);
    let response: unknown;
    try { response = JSON.parse(result.stdout); } catch { throw new SafeRefreshError("BASIC_SCAN_CONTROL_RESPONSE_INVALID", attempted); }
    if (kind === "configuration-read") {
      const value = object(response);
      if (typeof value?.registryId !== "string" || !/^[0-9]{12}$/.test(value.registryId) || /^0+$/.test(value.registryId) ||
          object(value.scanningConfiguration)?.scanType !== "BASIC") throw new SafeRefreshError("BASIC_SCAN_MODE_NOT_VERIFIED");
      verifiedBasicRegistry = value.registryId;
    }
    return response;
  };
}

interface RefreshDependencies {
  readFactory?: () => Reader;
  control?: Reader;
  now?: () => number;
  wait?: (milliseconds: number) => Promise<void>;
}

/** Fixed dated candidate only. A stale scan is readable here, never accepted for deployment. */
export function collectDatedPatchBasicScanReadiness(readFactory: () => Reader, now: () => number) {
  const live = collectPrivateCacheTarget(readFactory(), now);
  const account = live.target.reference.split(".")[0]!;
  const read = readFactory();
  const query = (operation: string, extra: string[]) => read(common(operation,
    ["--registry-id", account, "--repository-name", REPOSITORY, ...extra]));
  verifyPromotedImageDetail(query("describe-images", ["--image-ids", `imageDigest=${PATCH.runtimeDigest}`]), account);
  const manifest = verifyRegistryManifest(query("batch-get-image", ["--image-ids", `imageDigest=${PATCH.runtimeDigest}`]),
    account, PATCH.runtimeDigest, "application/vnd.oci.image.manifest.v1+json");
  if (object(manifest.config)?.digest !== PATCH.configDigest) throw new SafeRefreshError("BASIC_SCAN_PATCH_IDENTITY_INVALID");
  const scan = evaluateStoredBasicScan(query("describe-image-scan-findings", ["--image-id", `imageDigest=${PATCH.runtimeDigest}`, "--max-results", "1000"]), account, PATCH.runtimeDigest, now());
  return { ...live.report, ...scan, awsCalls: live.report.awsCalls + 3, datedCandidateVerified: true };
}

export async function refreshLiveBasicScan(dependencies: RefreshDependencies = {}, datedPatch = false) {
  const now = dependencies.now ?? Date.now;
  const started = now();
  const readFactory = dependencies.readFactory ?? (() => createLiveImageReadOnlyRunner());
  const control = dependencies.control ?? createBasicScanControlRunner();
  const wait = dependencies.wait ?? (milliseconds => new Promise(resolveWait => setTimeout(resolveWait, milliseconds)));
  let startAttempted = false;
  let awsCalls = 0;
  const maxCalls = datedPatch ? 37 : 31;
  const mode = datedPatch ? "dated-patch-basic-scan-refresh" : "live-basic-scan-refresh";
  const guard = () => {
    const elapsed = now() - started;
    if (!Number.isSafeInteger(started) || started <= 0 || !Number.isSafeInteger(elapsed) || elapsed < 0 || elapsed >= MAX_TOTAL_MS || awsCalls > maxCalls) throw new SafeRefreshError("BASIC_SCAN_DEADLINE_OR_CALL_LIMIT", startAttempted);
  };
  const counted = (read: Reader): Reader => args => { guard(); if (awsCalls >= maxCalls) throw new SafeRefreshError("BASIC_SCAN_DEADLINE_OR_CALL_LIMIT", startAttempted); awsCalls++; const value = read(args); guard(); return value; };
  try {
    let exactScanArgs: readonly string[] | undefined;
    const initialQueries: string[][] = [];
    const initialFactory = () => {
      const initialRead = counted(readFactory());
      return (args: readonly string[]) => {
      const value = initialRead(args);
      initialQueries.push([...args]);
      if (args[0] === "ecr" && args[1] === "describe-image-scan-findings") exactScanArgs = Object.freeze([...args]);
      return value;
    }; };
    const before = datedPatch ? collectDatedPatchBasicScanReadiness(initialFactory, now) : collectLiveImageReadiness(initialFactory(), now);
    if (!exactScanArgs || before.exactOwnedLiveImageVerified !== true || before.controllerStillDisabled !== true) throw new SafeRefreshError("BASIC_SCAN_TARGET_UNVERIFIED");
    if (before.freshWithin24Hours) return { mode, awsCalls, scanStartAttempts: 0, cloudMutations: 0, alreadyFresh: true, scanCompletionVerified: true, liveImage: before, readyForExecution: false };
    if (!before.eligibleForDailyRefresh) throw new SafeRefreshError("BASIC_SCAN_DAILY_REFRESH_NOT_ELIGIBLE");
    const scanArgs = exactScanArgs as readonly string[];
    validateLiveImageReadOnlyQuery(scanArgs);
    const account = scanArgs[scanArgs.indexOf("--registry-id") + 1]!;
    const digest = scanArgs[scanArgs.indexOf("--image-id") + 1]!.slice("imageDigest=".length);
    const configuration = object(counted(control)(common("get-registry-scanning-configuration")));
    if (configuration?.registryId !== account || object(configuration.scanningConfiguration)?.scanType !== "BASIC") throw new SafeRefreshError("BASIC_SCAN_MODE_NOT_VERIFIED");
    // The target can only come from completed ownership/manifest/controller reads, not CLI input.
    const startArgs = common("start-image-scan", ["--registry-id", account, "--repository-name", REPOSITORY, "--image-id", `imageDigest=${digest}`]);
    guard(); startAttempted = true;
    const result = object(counted(control)(startArgs));
    const identityMatches = (value: Json | null) => value?.registryId === account && value.repositoryName === REPOSITORY && object(value.imageId)?.imageDigest === digest;
    if (!identityMatches(result) || ![...WAITING_SCAN_STATUSES, "COMPLETE"].includes(String(object(result?.imageScanStatus)?.status))) throw new SafeRefreshError("BASIC_SCAN_START_UNVERIFIED", true);
    const pollRead = counted(readFactory());
    let polls = 0;
    let completed = false;
    for (; polls < MAX_POLLS; polls++) {
      guard();
      const response = object(pollRead(scanArgs));
      if (!identityMatches(response)) throw new SafeRefreshError("BASIC_SCAN_POLL_TARGET_CHANGED", true);
      const status = object(response?.imageScanStatus)?.status;
      if (status === "COMPLETE") {
        const scan = evaluateStoredBasicScan(response, account, digest, now());
        if (scan.freshWithin24Hours) { completed = true; polls++; break; }
      } else if (!WAITING_SCAN_STATUSES.includes(String(status))) throw new SafeRefreshError("BASIC_SCAN_POLL_FAILED", true);
      if (polls + 1 < MAX_POLLS) { guard(); await wait(10_000); guard(); }
    }
    if (!completed) throw new SafeRefreshError("BASIC_SCAN_COMPLETION_UNVERIFIED", true);
    let finalTargetMatches = false;
    const finalQueries: string[][] = [];
    const finalFactory = () => {
      const finalRead = counted(readFactory());
      return (args: readonly string[]) => {
      const value = finalRead(args);
      finalQueries.push([...args]);
      if (args[0] === "ecr" && args[1] === "describe-image-scan-findings") finalTargetMatches = JSON.stringify(args) === JSON.stringify(scanArgs);
      return value;
    }; };
    const after = datedPatch ? collectDatedPatchBasicScanReadiness(finalFactory, now) : collectLiveImageReadiness(finalFactory(), now);
    if (!finalTargetMatches || JSON.stringify(finalQueries) !== JSON.stringify(initialQueries) || !after.freshWithin24Hours || !after.controllerStillDisabled) throw new SafeRefreshError("BASIC_SCAN_FINAL_RECHECK_FAILED", true);
    return { mode, awsCalls, scanStartAttempts: 1, cloudMutations: 1,
      existingImageOnly: true, registryScanConfigurationChanged: false, enhancedScannerEnabled: false,
      pollReads: polls, scanCompletionVerified: true, liveImage: after,
      readyForExecution: false, publicationPerformed: false, internalJobsEnabled: false };
  } catch (error) {
    if (error instanceof SafeRefreshError) throw new SafeRefreshError(error.code, startAttempted || error.startAttempted);
    throw new SafeRefreshError(summarizeLiveImageFailure(error).error, startAttempted);
  }
}

export function summarizeBasicScanRefreshFailure(error: unknown) {
  return { error: error instanceof SafeRefreshError ? error.code : "BASIC_SCAN_REFRESH_INCOMPLETE",
    scanStartAttempted: error instanceof SafeRefreshError && error.startAttempted, scanCompletionVerified: false,
    retryPermitted: false, internalJobsEnabled: false, readyForExecution: false, privateDetailsSuppressed: true };
}
export function basicScanRefreshPlan(args: readonly string[] = []) {
  if (args.length) throw new SafeRefreshError("BASIC_SCAN_ARGUMENTS_REJECTED");
  return { mode: "dry-run", operation: "refresh-owned-live-basic-scan", awsCalls: 0, awsCallsMax: 31,
    scanStartAttemptsMax: 1, pollReadsMax: 5, timeoutSeconds: 360, cloudMutations: 0,
    registryScanConfigurationChanged: false, enhancedScannerEnabled: false, internalJobsEnabled: false,
    datedPatchAwsCallsMax: 37, callerSelectedImagePermitted: false, readyForExecution: false, publicationPerformed: false };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (!args.length) console.log(JSON.stringify(basicScanRefreshPlan()));
    else {
      if (args.length !== 1 || !["--execute-one-basic-scan", "--execute-one-dated-patch-basic-scan"].includes(args[0]!) || process.env.AWS_PROFILE !== PROFILE) throw new SafeRefreshError("BASIC_SCAN_ARGUMENTS_REJECTED");
      console.log(JSON.stringify(await refreshLiveBasicScan({}, args[0] === "--execute-one-dated-patch-basic-scan")));
    }
  } catch (error) { console.error(JSON.stringify(summarizeBasicScanRefreshFailure(error))); process.exitCode = 1; }
}
