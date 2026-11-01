import { spawnSync } from "node:child_process";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { basename, isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { AwsIamApiClient } from "../services/operations/api-smoke/src/signed-api-client.js";
import { captureOwnerObservation } from "../services/local-owner/src/observation.js";
import { startOwnerObservationServer } from "../services/local-owner/src/server.js";
import { createOwnerReadSnapshot, reviewOwnerGateReceipt } from "./private-owner-draft.js";
import { createPhase11ReadOnlyCliRunner, phase11ReadOnlyChildEnvironment } from "./phase11-live-readiness.js";
import { OWNER_REGION } from "./private-owner-review.js";
import { assertNodeSecurityBaseline } from "./node-security-baseline.mjs";

type Json = Record<string, any>;
function fail(): never { throw Error("LOCAL_OWNER_CHECK_UNVERIFIED"); }
const STAGES = ["configuration", "local-gate", "before-readiness", "capture", "after-readiness", "serve", "closed"] as const;
type Progress = { stage: typeof STAGES[number]; awsReadAttempts: number; signedGetAttempts: number };
export class LocalOwnerCheckError extends Error {
  readonly progress: Progress;
  readonly reason: string;
  constructor(progress: Progress, cause?: unknown) {
    super("LOCAL_OWNER_CHECK_UNVERIFIED");
    this.reason = cause instanceof Error && ["OWNER_OBSERVATION_INVALID", "OWNER_OBSERVATION_UNAVAILABLE", "OWNER_LOCAL_OPTIONS_REJECTED", "PROJECT_NODE_SECURITY_BASELINE_REQUIRED"].includes(cause.message)
      ? cause.message : "DETAILS_SUPPRESSED";
    this.progress = { stage: STAGES.includes(progress.stage) ? progress.stage : "configuration",
      awsReadAttempts: Number.isSafeInteger(progress.awsReadAttempts) ? Math.max(0, Math.min(48, progress.awsReadAttempts)) : 0,
      signedGetAttempts: Number.isSafeInteger(progress.signedGetAttempts) ? Math.max(0, Math.min(2, progress.signedGetAttempts)) : 0 };
  }
}
// Exact deployed controller package verified in the 2026-10-25 owner evidence.
// A different deployment requires new code proof, not accepting whichever hash is returned.
export const LOCAL_OWNER_CONTROLLER_ZIP_SHA256 = "b6e230ef62728da7e698e5ff221590a4eb212d85856066ec90347d3c744ffcdb";
export function localOwnerObservationPlan(args: readonly string[] = []) {
  if (args.length) fail();
  return { mode: "dry-run", awsCalls: 0, serversStarted: 0, preflightReadMax: 48, signedGetsMax: 2,
    cloudMutations: 0, jobPosts: 0, providerCalls: 0, modelCalls: 0, localLifetimeMs: 300000,
    sourceGateRequired: true, freshOwnerSessionRequired: true, publicationPerformed: false };
}
export function reviewLocalOwnerBaseline(snapshot: ReturnType<typeof createOwnerReadSnapshot>) {
  if (snapshot.refs.privateOwnerConfigurationMatchesCaller !== true || snapshot.runtime.State !== "Active" ||
      snapshot.runtime.LastUpdateStatus !== "Successful" ||
      snapshot.runtime.CodeSha256 !== Buffer.from(LOCAL_OWNER_CONTROLLER_ZIP_SHA256, "hex").toString("base64")) fail();
}

/** Fixed read-only workflow; never enables jobs, opens circuit, deploys, logs raw
 * responses or exposes credentials. The HTTP process receives an observation only. */
export async function runLocalOwnerObservation() {
  const progress: Progress = { stage: "configuration", awsReadAttempts: 0, signedGetAttempts: 0 };
  try {
  assertNodeSecurityBaseline();
  const aws = process.env.GMAI_AWS_CLI_PATH, runId = process.env.GMAI_OWNER_GATE_RUN_ID;
  if (process.platform !== "win32" || process.env.AWS_PROFILE !== "gmai-admin" || !aws || !isAbsolute(aws) ||
      basename(aws).toLowerCase() !== "aws.exe" || !lstatSync(aws).isFile() || lstatSync(aws).isSymbolicLink() ||
      !runId || !/^[a-f0-9-]{36}$/.test(runId)) fail();
  progress.stage = "local-gate";
  const env = phase11ReadOnlyChildEnvironment(process.env), receiptPath = resolve("outputs/local-gates", `${runId}.json`);
  const stat = lstatSync(receiptPath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 10000 || realpathSync(receiptPath) !== receiptPath) fail();
  const source = spawnSync(process.execPath, ["--input-type=module", "--eval",
    'import {fingerprintCurrentSource} from "./scripts/clean-source-build-proof.mjs"; console.log(JSON.stringify(fingerprintCurrentSource(process.cwd())));'],
  { env, encoding: "utf8", windowsHide: true, timeout: 30000, maxBuffer: 16000 });
  if (source.status !== 0 || source.signal !== null) fail();
  reviewOwnerGateReceipt(JSON.parse(readFileSync(receiptPath, "utf8")), JSON.parse(source.stdout), runId, Date.now());
  const started = Date.now(); let reads = 0, endpoint = "";
  const consume = () => { if (++reads > 48 || Date.now() - started + 30000 > 420000) fail(); progress.awsReadAttempts = reads; };
  const query = (service: string, operation: string, args: string[]): Json => {
    if (service !== "cloudformation" || operation !== "get-template") fail();
    consume(); const result = spawnSync(aws, [service, operation, ...args, "--profile", "gmai-admin", "--region", OWNER_REGION,
      "--no-cli-pager", "--no-paginate", "--output", "json"], { env, encoding: "utf8", windowsHide: true, timeout: 30000, maxBuffer: 2000000 });
    if (result.status !== 0 || result.signal !== null) fail(); return JSON.parse(result.stdout);
  };
  const snapshot = () => {
    const core = createPhase11ReadOnlyCliRunner(), refs = createPhase11ReadOnlyCliRunner();
    const value = createOwnerReadSnapshot(args => { consume(); return core(args); }, query, args => {
      consume(); const result = refs(args) as Json;
      if (args[0] === "apigatewayv2" && args[1] === "get-api") endpoint = result.ApiEndpoint;
      return result;
    });
    reviewLocalOwnerBaseline(value); return value;
  };
  progress.stage = "before-readiness";
  const before = snapshot();
  progress.stage = "capture";
  const client = new AwsIamApiClient(endpoint);
  const observation = await captureOwnerObservation({ request(method, path) {
    progress.signedGetAttempts++; return client.request(method, path);
  } }, "aws-owner-read-only");
  progress.stage = "after-readiness";
  const after = snapshot();
  if (before.fingerprint !== after.fingerprint) fail();
  progress.stage = "serve";
  const app = await startOwnerObservationServer(observation);
  const stop = () => { void app.close(); };
  process.once("SIGINT", stop); process.once("SIGTERM", stop); process.stdin.once("data", stop); process.stdin.once("end", stop);
  console.log(JSON.stringify({ mode: "local-owner-read-only-ready", origin: app.origin, observedAt: observation.observedAt,
    awsReads: reads, signedGets: 2, cloudMutations: 0, circuitOpen: true, jobsEnabled: false, maxLocalLifetimeMs: 300000,
    refreshCallsAws: false, stop: "Enter or automatic expiry" }));
  try { await app.finished; }
  finally {
    await app.close(); process.removeListener("SIGINT", stop); process.removeListener("SIGTERM", stop);
    process.stdin.removeListener("data", stop); process.stdin.removeListener("end", stop); process.stdin.pause();
  }
  progress.stage = "closed";
  return { mode: "local-owner-read-only-closed", ...app.snapshot(), awsReads: reads, signedGets: 2,
    cloudMutations: 0, providerCalls: 0, modelCalls: 0, credentialsPrinted: false, publicationPerformed: false };
  } catch (error) { throw new LocalOwnerCheckError(progress, error); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (!args.length) console.log(JSON.stringify(localOwnerObservationPlan()));
    else { if (args.length !== 1 || args[0] !== "--execute-read-only") fail(); console.log(JSON.stringify(await runLocalOwnerObservation())); }
  } catch (error) { console.error(JSON.stringify({ error: "LOCAL_OWNER_CHECK_UNVERIFIED",
    ...(error instanceof LocalOwnerCheckError ? { ...error.progress, reason: error.reason } : {}), rawDetailsSuppressed: true, workloadCalls: 0 })); process.exitCode = 1; }
}
