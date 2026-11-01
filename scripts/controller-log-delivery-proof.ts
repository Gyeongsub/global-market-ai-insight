import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { collectControllerPolicySnapshot } from "./controller-policy-review.js";
import { createPhase11ReadOnlyCliRunner, phase11ReadOnlyChildEnvironment } from "./phase11-live-readiness.js";
import { PRIVATE_ACL, privateAclChildEnvironment } from "./promote-worker-patch.js";
import { verifyControllerRelease } from "./verify-controller-release.js";

type Json = Record<string, any>;
const PREFIX = "global-market-ai-insight-dev", FUNCTION = `${PREFIX}-controller`, GROUP = `/aws/lambda/${FUNCTION}`;
const REGION = "ap-northeast-1", ROUTE = "GET /__gmai_log_delivery_diagnostic__";
const object = (v: unknown): v is Json => v !== null && typeof v === "object" && !Array.isArray(v);
function fail(code: string): never { throw new Error(`CONTROLLER_LOG_${code}`); }
const idPattern = /^gmai-log-proof-[a-f0-9]{32}$/;
const requestPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export function controllerLogDiagnosticEvent(id: string) {
  if (!idPattern.test(id)) fail("CORRELATION_INVALID");
  // Deliberately not a registered API route: the inspected handler rejects
  // before touching any job repository, task launcher or circuit store.
  return { routeKey: ROUTE, requestContext: { requestId: id } };
}
export function reviewControllerLogGrant(policy: unknown, account: string) {
  if (!object(policy) || policy.Version !== "2012-10-17" || !Array.isArray(policy.Statement) ||
    !/^(?!0{12}$)[0-9]{12}$/.test(account)) fail("POLICY_INVALID");
  const statements = policy.Statement.filter((s: Json) => (Array.isArray(s?.Action) ? s.Action : [s?.Action])
    .some((a: unknown) => typeof a === "string" && /^(?:logs:|\*)/i.test(a)));
  const expected = { Effect: "Allow", Action: ["logs:CreateLogStream", "logs:PutLogEvents"],
    Resource: `arn:aws:logs:${REGION}:${account}:log-group:${GROUP}:*:*` };
  const canonical = (v: unknown): string => Array.isArray(v) ? `[${v.map(canonical).join(",")}]` : object(v)
    ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}` : JSON.stringify(v) ?? "undefined";
  if (statements.length !== 1 || canonical(statements[0]) !== canonical(expected)) fail("LOG_SCOPE_INVALID");
  return { independentlyMatchedExactExistingLogGrant: true, logsPermissionsAdded: false };
}
function rejection(message: string, id: string) {
  // Lambda text logs prepend timestamp/request UUID/WARN. Do not accept an
  // arbitrary embedded substring: only one bounded JSON object at line end.
  const start = message.indexOf("{"); if (start < 0 || message.length > 2048) return false;
  let v: unknown; try { v = JSON.parse(message.slice(start).trim()); } catch { return false; }
  return object(v) && Object.keys(v).sort().join(",") === "code,httpStatus,level,publicCode,requestId,service,timestamp" &&
    v.level === "warn" && v.service === "controller" && v.code === "REQUEST_REJECTED" && v.publicCode === "VALIDATION_ERROR" &&
    v.requestId === id && v.httpStatus === 404 && typeof v.timestamp === "string" && Number.isFinite(Date.parse(v.timestamp));
}
export function reviewControllerDiagnosticInvocation(meta: unknown, payload: unknown, id: string) {
  if (!idPattern.test(id) || !object(meta) || meta.StatusCode !== 200 || meta.ExecutedVersion !== "$LATEST" || meta.FunctionError != null ||
    typeof meta.LogResult !== "string" || meta.LogResult.length > 6000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(meta.LogResult) ||
    !object(payload) || payload.statusCode !== 404 || !object(payload.headers) || payload.headers["cache-control"] !== "no-store" ||
    typeof payload.body !== "string" || payload.body.length > 2048) fail("INVOCATION_UNVERIFIED");
  let body: unknown; try { body = JSON.parse(payload.body); } catch { fail("INVOCATION_UNVERIFIED"); }
  if (!object(body) || Object.keys(body).length !== 1 || !object(body.error) ||
    Object.keys(body.error).sort().join(",") !== "code,message,requestId" || body.error.code !== "VALIDATION_ERROR" ||
    body.error.message !== "Route not found." || body.error.requestId !== id) fail("REJECTION_UNVERIFIED");
  const bytes = Buffer.from(meta.LogResult, "base64");
  if (bytes.toString("base64") !== meta.LogResult || bytes.length > 4096) fail("TAIL_INVALID");
  const lines = new TextDecoder("utf-8", { fatal: true }).decode(bytes).split(/\r?\n/).filter(Boolean);
  const starts = lines.map(v => /^START RequestId: ([a-f0-9-]{36})\s+Version: \$LATEST$/.exec(v.trim())).filter(Boolean);
  if (starts.length !== 1 || !requestPattern.test(starts[0]![1])) fail("REQUEST_ID_UNVERIFIED");
  const request = starts[0]![1];
  if (lines.filter(v => rejection(v, id) && v.includes(request)).length !== 1 ||
    !lines.some(v => v.trim() === `END RequestId: ${request}`) ||
    !lines.some(v => v.startsWith(`REPORT RequestId: ${request}\t`))) fail("TAIL_CORRELATION_UNVERIFIED");
  // This private UUID binds the independent CloudWatch read. It must not be
  // included in the CLI report. Tail alone is not delivery acceptance.
  return { request, rejectionVerified: true, cloudWatchDeliveryVerified: false };
}
export function controllerLogStreamCandidates(response: unknown, account: string, started: number, end: number) {
  if (!object(response) || response.nextToken != null || response.NextToken != null || !Array.isArray(response.logStreams) ||
    response.logStreams.length > 5 || !/^(?!0{12}$)[0-9]{12}$/.test(account) ||
    !Number.isSafeInteger(started) || !Number.isSafeInteger(end) || end < started || end - started > 90_000) fail("STREAM_LIST_UNVERIFIED");
  const date = new Date(started).toISOString().slice(0, 10).replaceAll("-", "/"), seen = new Set<string>();
  const result: { name: string; newlyCreated: boolean }[] = [];
  for (const s of response.logStreams) {
    if (!object(s) || typeof s.logStreamName !== "string" ||
      !new RegExp(`^${date}/(?:${FUNCTION})?\\[\\$LATEST\\][a-f0-9]{32}$`).test(s.logStreamName) ||
      seen.has(s.logStreamName) || s.arn !== `arn:aws:logs:${REGION}:${account}:log-group:${GROUP}:log-stream:${s.logStreamName}` ||
      !Number.isSafeInteger(s.creationTime) || s.creationTime < 0 || s.creationTime > end) fail("STREAM_OWNER_INVALID");
    seen.add(s.logStreamName);
    if (s.creationTime >= started - 60_000) result.push({ name: s.logStreamName, newlyCreated: s.creationTime >= started });
  }
  if (result.length > 3) fail("STREAM_BOUND_EXCEEDED");
  return result;
}
export function reviewControllerDeliveredEvents(response: unknown, id: string, request: string, started: number, end: number) {
  if (!idPattern.test(id) || !requestPattern.test(request) || !object(response) || !Array.isArray(response.events) || response.events.length > 25 ||
    !Number.isSafeInteger(started) || !Number.isSafeInteger(end) || end < started || end - started > 90_000) fail("EVENT_RESPONSE_INVALID");
  const rows = response.events;
  for (const v of rows) if (!object(v) || typeof v.message !== "string" || Buffer.byteLength(v.message) > 4096 ||
    !Number.isSafeInteger(v.timestamp) || v.timestamp < started || v.timestamp > end) fail("EVENT_BOUNDS_INVALID");
  const starts = rows.filter(v => v.message.trim().replace(/\s+/g, " ") === `START RequestId: ${request} Version: $LATEST`);
  const rejects = rows.filter(v => rejection(v.message, id) && v.message.includes(request));
  const ends = rows.filter(v => v.message.trim() === `END RequestId: ${request}`);
  const reports = rows.filter(v => v.message.startsWith(`REPORT RequestId: ${request}\t`));
  // Fixed first page only. Empty or partial pages never prove failure/success;
  // no next-token scan, unlimited startFromHead or new invocation retry.
  return { independentCloudWatchDeliveryVerified: starts.length === 1 && rejects.length === 1 && ends.length === 1 && reports.length === 1,
    fixedWindowEventsInspected: rows.length, exhaustiveStreamScanClaimed: false };
}
export function safeControllerLogDirectory(base: string, directory: string, physical: string) {
  try { const name = basename(directory); return /^gmai-controller-log-proof-[A-Za-z0-9]+$/.test(name) &&
    relative(resolve(base), resolve(directory)) === name && lstatSync(directory).isDirectory() && !lstatSync(directory).isSymbolicLink() &&
    realpathSync(base) === physical && realpathSync(directory) === resolve(physical, name); } catch { return false; }
}
export function controllerLogProofPlan(args: readonly string[] = []) {
  if (args.length) fail("ARGUMENTS_REJECTED");
  return { mode: "dry-run", awsCalls: 0, awsCallsMax: 80, synchronousInvocationsMax: 1, functionMemoryMb: 128, functionTimeoutSeconds: 15,
    existingExecutionRoleOnly: true, iamWrites: 0, deployments: 0, taskCalls: 0, providerCalls: 0, modelCalls: 0,
    maintenanceAuthorizationProven: false, readyForMaintenanceDeployment: false, invocationRetryAllowed: false };
}
export async function proveControllerLogDelivery(): Promise<Json> {
  const aws = process.env.GMAI_AWS_CLI_PATH;
  if (process.platform !== "win32" || process.env.AWS_PROFILE !== "gmai-admin" || !aws || !isAbsolute(aws) ||
    basename(aws).toLowerCase() !== "aws.exe" || !lstatSync(aws).isFile() || lstatSync(aws).isSymbolicLink()) fail("CONFIGURATION_INVALID");
  const started = Date.now(), base = resolve(tmpdir()), physical = realpathSync(base), directory = mkdtempSync(join(base, "gmai-controller-log-proof-"));
  const env = phase11ReadOnlyChildEnvironment(process.env), path = join(directory, "response.json"), id = `gmai-log-proof-${randomUUID().replaceAll("-", "")}`;
  let calls = 0, invocationAttempted = false, packet: Json | undefined;
  const consume = () => { if (++calls > 80 || Date.now() < started || Date.now() - started >= 900_000) fail("BOUNDS_EXCEEDED"); };
  const query = (service: string, action: string, extra: string[]): Json => {
    if (!["cloudformation.get-template", "iam.get-role", "iam.list-role-policies", "iam.list-attached-role-policies", "iam.get-role-policy",
      "logs.describe-log-streams", "logs.get-log-events", "lambda.invoke"].includes(`${service}.${action}`)) fail("OPERATION_REJECTED");
    if (action === "invoke") { if (invocationAttempted) fail("RETRY_REJECTED"); invocationAttempted = true; }
    consume();
    const r = spawnSync(aws, [service, action, ...extra, "--profile", "gmai-admin", "--region", REGION,
      "--no-cli-pager", "--no-paginate", "--output", "json"], { env, encoding: "utf8", windowsHide: true, timeout: 25_000, maxBuffer: 2_000_000 });
    if (r.status !== 0 || r.signal !== null || r.error) fail("AWS_OPERATION_UNVERIFIED");
    const value: unknown = JSON.parse(r.stdout); if (!object(value)) fail("RESPONSE_INVALID"); return value;
  };
  const snapshot = () => {
    const first = createPhase11ReadOnlyCliRunner(), second = createPhase11ReadOnlyCliRunner(); let reads = 0;
    return collectControllerPolicySnapshot(args => { consume(); return (++reads <= 7 ? first : second)(args); }, query);
  };
  try {
    if (!safeControllerLogDirectory(base, directory, physical)) fail("TEMP_INVALID");
    const acl = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", PRIVATE_ACL], {
      env: privateAclChildEnvironment(env, directory), encoding: "utf8", windowsHide: true, timeout: 10_000, maxBuffer: 20_000 });
    if (acl.status !== 0 || acl.signal !== null || acl.error || JSON.parse(acl.stdout).privateAclVerified !== true) fail("PRIVATE_ACL_UNVERIFIED");
    const codeProof = verifyControllerRelease(); calls += Number(codeProof.awsReads);
    if (codeProof.deployedMainAndNoticesMatched !== true || codeProof.deployedZipHashMatched !== true || codeProof.privateArchiveRemoved !== true ||
      codeProof.cloudMutations !== 0 || codeProof.awsReads !== 24) fail("SOURCE_PROOF_UNVERIFIED");
    const before = snapshot(), c = before.controller;
    if (c.MemorySize !== 128 || c.Timeout !== 15 || c.Runtime !== "nodejs22.x" || c.Handler !== "main.handler" ||
      c.State !== "Active" || c.LastUpdateStatus !== "Successful" || c.LoggingConfig?.LogGroup !== GROUP ||
      c.LoggingConfig.LogFormat !== "Text" || c.CodeSha256 !== codeProof.deployedCodeSha256) fail("FUNCTION_BOUND_INVALID");
    const grant = reviewControllerLogGrant(before.policy.PolicyDocument, before.t.account);
    const bundle = resolve("services/controller/bundle/main.mjs"), bundleHash = createHash("sha256").update(readFileSync(bundle)).digest("hex");
    if (bundleHash !== codeProof.mainBundleSha256) fail("SOURCE_PROOF_CHANGED");
    const invokeStart = Date.now(), end = invokeStart + 90_000;
    // One synchronous route rejection, not an API job or asynchronous retry.
    const meta = query("lambda", "invoke", ["--function-name", c.FunctionArn, "--qualifier", "$LATEST", "--invocation-type", "RequestResponse",
      "--log-type", "Tail", "--cli-binary-format", "raw-in-base64-out", "--payload", JSON.stringify(controllerLogDiagnosticEvent(id)), path]);
    const info = lstatSync(path);
    if (!info.isFile() || info.isSymbolicLink() || info.size > 16_384 || realpathSync(path) !== path) fail("PRIVATE_RESPONSE_INVALID");
    const response = reviewControllerDiagnosticInvocation(meta, JSON.parse(readFileSync(path, "utf8")), id);
    let delivered: ReturnType<typeof reviewControllerDeliveredEvents> | undefined, newStream = false;
    const datePrefix = new Date(invokeStart).toISOString().slice(0, 10).replaceAll("-", "/") + "/";
    for (let poll = 0; poll < 3 && !delivered?.independentCloudWatchDeliveryVerified; poll++) {
      if (Date.now() >= end) fail("DELIVERY_WINDOW_EXCEEDED");
      const streams = controllerLogStreamCandidates(query("logs", "describe-log-streams", ["--log-group-name", GROUP,
        "--log-stream-name-prefix", datePrefix, "--order-by", "LogStreamName", "--descending", "--limit", "5"]), before.t.account, invokeStart, end);
      for (const stream of streams) {
        const report = reviewControllerDeliveredEvents(query("logs", "get-log-events", ["--log-group-name", GROUP, "--log-stream-name", stream.name,
          "--start-time", String(invokeStart), "--end-time", String(end), "--start-from-head", "--limit", "25"]), id, response.request, invokeStart, end);
        if (report.independentCloudWatchDeliveryVerified) { delivered = report; newStream = stream.newlyCreated; break; }
      }
      if (!delivered?.independentCloudWatchDeliveryVerified) await new Promise(done => setTimeout(done, 5000));
    }
    // Even a missing delivery result requires a fresh full disabled/empty/OPEN
    // check; no new invocation or role edit is a recovery strategy.
    const after = snapshot();
    if (after.fingerprint !== before.fingerprint || createHash("sha256").update(readFileSync(bundle)).digest("hex") !== bundleHash) fail("SOURCE_OR_RUNTIME_CHANGED");
    packet = { ...controllerLogProofPlan(), mode: "existing-controller-log-delivery-diagnostic", awsCalls: calls,
      synchronousInvocations: 1, requestRejectedBeforeJobServices: response.rejectionVerified, ...grant,
      independentCloudWatchDeliveryVerified: delivered?.independentCloudWatchDeliveryVerified === true,
      freshLogStreamCreationObserved: newStream, fixedWindowEventsInspected: delivered?.fixedWindowEventsInspected ?? 0,
      tailAloneUsedAsProof: false, runtimeAndPolicyUnchanged: true, liveReferencesStableBeforeAfter: true,
      privateDetailsPrinted: false, originalMaintenanceSimulatorGateStillRequired: true,
      logRetentionUnchanged: true, sharedCloudWatchStreamDeleted: false, tinyExistingLogStorageRemains: true,
      jobsEnabled: false, circuitMutations: 0, workerTasksLaunched: 0 };
  } finally {
    if (!safeControllerLogDirectory(base, directory, physical)) fail("TEMP_INVALID");
    rmSync(directory, { recursive: true }); if (existsSync(directory)) fail("TEMP_CLEANUP_UNVERIFIED");
  }
  if (!packet) fail("INCOMPLETE");
  return { ...packet, privateResponseRemoved: true };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { const args = process.argv.slice(2);
    if (!args.length) console.log(JSON.stringify(controllerLogProofPlan()));
    else { if (args.length !== 1 || args[0] !== "--invoke-one-existing-rejection") fail("ARGUMENTS_REJECTED");
      const result = await proveControllerLogDelivery(); console.log(JSON.stringify(result));
      if (!result.independentCloudWatchDeliveryVerified) process.exitCode = 1;
    }
  } catch (error) {
    const code = error instanceof Error && /^CONTROLLER_(?:LOG|POLICY|PROOF)_[A-Z_]+$/.test(error.message) ? error.message : "CONTROLLER_LOG_PROOF_INCOMPLETE";
    console.error(JSON.stringify({ error: code, rawDetailsSuppressed: true, noAutomaticRetry: true, independentSafeStopRequired: true })); process.exitCode = 1;
  }
}
