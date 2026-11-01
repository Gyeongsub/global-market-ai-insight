import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { lstatSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { basename, isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { App, BootstraplessSynthesizer } from "aws-cdk-lib/core";
import { Template } from "aws-cdk-lib/assertions";
import { SyntheticLabRoleStack } from "../infrastructure/lib/synthetic-lab-role-stack.js";
import { assertNodeSecurityBaseline } from "./node-security-baseline.mjs";
import { ownedLocalGateReportDirectory } from "./local-gate-proof.mjs";
import { safeLocalCloneProof } from "./local-git-clone-proof.mjs";
import { reviewOwnerGateReceipt } from "./private-owner-draft.js";
import { reviewOwnerIdentity } from "./private-owner-review.js";
import { collectPhase11Readiness, createPhase11ReadOnlyCliRunner, phase11ReadOnlyChildEnvironment } from "./phase11-live-readiness.js";
import { prepareSyntheticRoleDraft, type DraftCall, type DraftResponse } from "./synthetic-role-draft.js";

type Json = Record<string, any>;
function fail(): never { throw Error("SYNTHETIC_ROLE_DRAFT_LIVE_UNVERIFIED"); }
export function syntheticRoleDraftLivePlan(args: readonly string[] = []) {
  if (args.length) fail();
  return { mode: "dry-run", awsCalls: 0, filesWritten: 0, changeSetsCreated: 0, changeSetsExecuted: 0,
    plannedUnexecutedChangeSetsMax: 1, plannedEmptyStackCleanup: true, inferenceCalls: 0,
    roleCreateRequests: 0, sourceAndFreshInstallGatesRequired: true, independentClosureRequired: true };
}
export function reviewSyntheticDraftSourceProofs(currentReceipt: Json, cloneReceipt: Json, fingerprint: Json,
  runId: string, cloneId: string, now: number) {
  reviewOwnerGateReceipt(currentReceipt, fingerprint, runId, now);
  const completed = Date.parse(cloneReceipt?.completedAt), proof = safeLocalCloneProof(cloneReceipt?.proof);
  if (!/^[a-f0-9-]{36}$/.test(cloneId) || cloneReceipt.runId !== cloneId ||
      cloneReceipt.mode !== "recorded-local-git-snapshot-frozen-proof" || cloneReceipt.completed !== true ||
      cloneReceipt.passed !== true || !Number.isFinite(completed) || now < completed || now - completed > 3600000 ||
      !proof || JSON.stringify(proof.sourceFingerprint) !== JSON.stringify(fingerprint)) fail();
  return { currentGateVerified: true, freshCloneVerified: true, exactSourceMatched: true };
}
export function syntheticDraftCliResponse(operation: string, result: {
  error?: unknown; status: number | null; signal: string | null; stdout: string; stderr: string;
}): DraftResponse {
  try {
    if (result.error || result.signal !== null) return { ok: false, code: "UNVERIFIED" };
    if (result.status !== 0) {
      // Only a bounded, single-line DeleteStack error is diagnostic evidence.
      // Never expose the raw message or turn this into absence/retry permission.
      if (operation === "delete-stack" && result.stderr.length <= 4096 &&
          /^(?:aws: \[ERROR\]: )?An error occurred \(TokenAlreadyExists\) when calling the DeleteStack operation(?: \(reached max retries: 0\))?: [^\r\n]+$/.test(result.stderr.trim()))
        return { ok: false, code: "TOKEN_CONFLICT" };
      const absent = operation === "get-role" && /\(NoSuchEntity\) when calling the GetRole operation/.test(result.stderr) ||
        ["describe-change-set", "delete-change-set"].includes(operation) && /\(ChangeSetNotFound\)/.test(result.stderr) ||
        operation === "describe-stacks" && /^(?:aws: \[ERROR\]: )?An error occurred \(ValidationError\) when calling the DescribeStacks operation(?: \(reached max retries: 0\))?: Stack with id [^\s]+ does not exist$/.test(result.stderr.trim());
      return { ok: false, code: absent ? "ABSENT" : "UNVERIFIED" };
    }
    const data = result.stdout.trim() ? JSON.parse(result.stdout) : {};
    if (!data || typeof data !== "object" || Array.isArray(data)) fail();
    return { ok: true, data };
  } catch { return { ok: false, code: "UNVERIFIED" }; }
  finally { result.stdout = ""; result.stderr = ""; }
}
export async function runSyntheticRoleDraft() {
  assertNodeSecurityBaseline();
  const aws = process.env.GMAI_AWS_CLI_PATH, runId = process.env.GMAI_OWNER_GATE_RUN_ID, cloneId = process.env.GMAI_CLONE_GATE_RUN_ID;
  if (process.platform !== "win32" || process.env.AWS_PROFILE !== "gmai-admin" || !aws || !isAbsolute(aws) ||
      basename(aws).toLowerCase() !== "aws.exe" || !lstatSync(aws).isFile() || lstatSync(aws).isSymbolicLink() ||
      realpathSync(aws).toLowerCase() !== resolve(aws).toLowerCase() || !/^[a-f0-9-]{36}$/.test(runId ?? "") || !/^[a-f0-9-]{36}$/.test(cloneId ?? "")) fail();
  const env = { ...phase11ReadOnlyChildEnvironment(process.env), AWS_MAX_ATTEMPTS: "1", AWS_RETRY_MODE: "standard" };
  const directory = ownedLocalGateReportDirectory(process.cwd());
  function receipt(name: string) {
    const path = join(directory, name), s = lstatSync(path);
    if (!s.isFile() || s.isSymbolicLink() || s.size < 1 || s.size > 30000 || realpathSync(path) !== path) fail();
    return JSON.parse(readFileSync(path, "utf8"));
  }
  const fingerprint = spawnSync(process.execPath, ["--input-type=module", "--eval",
    'import {fingerprintCurrentSource} from "./scripts/clean-source-build-proof.mjs";console.log(JSON.stringify(fingerprintCurrentSource(process.cwd())));'],
    { env, encoding: "utf8", windowsHide: true, timeout: 30000, maxBuffer: 16000 });
  if (fingerprint.error || fingerprint.status !== 0 || fingerprint.signal !== null) fail();
  reviewSyntheticDraftSourceProofs(receipt(`${runId}.json`), receipt(`local-clone-${cloneId}.json`), JSON.parse(fingerprint.stdout), runId!, cloneId!, Date.now());
  const read = createPhase11ReadOnlyCliRunner();
  const identity = read(["sts", "get-caller-identity", "--profile", "gmai-admin", "--region", "ap-northeast-1", "--no-cli-pager", "--no-paginate", "--output", "json"]) as Json;
  const { account, ownerArn } = reviewOwnerIdentity(identity), readiness = collectPhase11Readiness(read) as Json;
  if (readiness.readyForAccountSpecificDiff !== true || readiness.compute?.executionFlagsVerifiedDisabled !== true ||
      readiness.compute.runningTasks !== 0 || readiness.compute.pendingTasks !== 0 || readiness.compute.services !== 0 ||
      readiness.circuit?.verifiedOpen !== true || readiness.occupiedSlots !== 0) fail();
  const stack = new SyntheticLabRoleStack(new App({ autoSynth: false, analyticsReporting: false }), "SyntheticRoleDraft",
    { ownerUserArn: ownerArn, env: { account, region: "ap-northeast-1" }, synthesizer: new BootstraplessSynthesizer() });
  const template = Template.fromStack(stack).toJSON(), nonce = randomUUID().replaceAll("-", "");
  const journal = join(directory, `synthetic-role-draft-${nonce}.json`);
  writeFileSync(journal, JSON.stringify({ stage: "initial", stackName: `gmai-synthetic-role-${nonce}` }) + "\n", { flag: "wx" });
  const call: DraftCall = (service, operation, args, cleanup) => {
    const allowed = service === "iam" ? ["get-role"] : cleanup ?
      ["describe-stacks", "describe-change-set", "get-template", "list-stack-resources", "delete-change-set", "delete-stack"] :
      ["describe-stacks", "create-change-set", "describe-change-set", "get-template"];
    if (!allowed.includes(operation)) fail();
    const result = spawnSync(aws, [service, operation, ...args, "--profile", "gmai-admin",
      "--region", service === "iam" ? "us-east-1" : "ap-northeast-1", "--endpoint-url",
      service === "iam" ? "https://iam.amazonaws.com" : "https://cloudformation.ap-northeast-1.amazonaws.com",
      "--no-cli-pager", "--no-paginate", "--output", "json"],
      { env, encoding: "utf8", windowsHide: true, timeout: 20000, maxBuffer: 100000 });
    return syntheticDraftCliResponse(operation, result);
  };
  return prepareSyntheticRoleDraft({ identity, nonce, template, now: Date.now, wait: () => delay(15000), call, record: state => {
    if (ownedLocalGateReportDirectory(process.cwd()) !== directory || !lstatSync(journal).isFile() ||
        lstatSync(journal).isSymbolicLink() || realpathSync(journal) !== journal) fail();
    writeFileSync(journal, JSON.stringify(state) + "\n");
  } });
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (!args.length) console.log(JSON.stringify(syntheticRoleDraftLivePlan()));
    else {
      if (args.length !== 1 || args[0] !== "--execute-unexecuted-role-draft") fail();
      const result = await runSyntheticRoleDraft(); console.log(JSON.stringify(result));
      if (!result.completed || !result.absentConfirmed || !result.roleAbsentConfirmed) process.exitCode = 1;
    }
  } catch { console.error(JSON.stringify({ error: "SYNTHETIC_ROLE_DRAFT_LIVE_UNVERIFIED", rawDetailsSuppressed: true,
    inspectOwnedJournalBeforeRetry: true, independentClosureRequired: true })); process.exitCode = 1; }
}
