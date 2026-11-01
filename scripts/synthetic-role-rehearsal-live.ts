import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { lstatSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { basename, isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { App, BootstraplessSynthesizer } from "aws-cdk-lib/core";
import { Template } from "aws-cdk-lib/assertions";
import { SyntheticLabRoleStack } from "../infrastructure/lib/synthetic-lab-role-stack.js";
import { acquireSyntheticRoleLease } from "../services/local-owner/src/synthetic-role-acquisition.js";
import { createSyntheticReadDenialExercise } from "../services/local-owner/src/synthetic-read-denial-exercise.js";
import { createSyntheticExpiryExercise } from "../services/local-owner/src/synthetic-expiry-exercise.js";
import { assertNodeSecurityBaseline } from "./node-security-baseline.mjs";
import { ownedLocalGateReportDirectory } from "./local-gate-proof.mjs";
import { reviewOwnerIdentity } from "./private-owner-review.js";
import { collectPhase11Readiness, createPhase11ReadOnlyCliRunner, phase11ReadOnlyChildEnvironment } from "./phase11-live-readiness.js";
import { reviewSyntheticDraftSourceProofs, syntheticDraftCliResponse } from "./synthetic-role-draft-live.js";
import type { DraftCall } from "./synthetic-role-draft.js";
import { createSyntheticRoleCli } from "./synthetic-role-cli.js";
import { rehearseSyntheticRole, type SyntheticRoleExercise } from "./synthetic-role-rehearsal.js";
import { rehearseSyntheticAlternatePrincipal } from "./synthetic-alternate-principal-rehearsal.js";
import { exerciseSyntheticComputeDenial } from "./synthetic-compute-denial-exercise.js";
import { exerciseRestrictedSyntheticBrowser } from "./synthetic-restricted-browser-exercise.js";
import { cleanSourceChildEnvironment } from "./local-proof-environment.mjs";

type Json = Record<string, any>;
function fail(): never { throw Error("SYNTHETIC_ROLE_REHEARSAL_LIVE_UNVERIFIED"); }
export function syntheticRoleRehearsalPlan(args: readonly string[] = []) {
  if (args.length) fail();
  return { mode: "dry-run", awsCalls: 0, filesWritten: 0, plannedTemporaryRolesMax: 1,
    plannedAssumptionsMax: 1, plannedInferenceCalls: 0, plannedProviderCalls: 0,
    exactSourceAndFreshInstallRequired: true, newProposalReviewRequired: true,
    existingRoleReuseAllowed: false, automaticStackCleanupRequired: true,
    durableDeployment: false, negativeAuthorizationVerified: false, allCredentialsRevoked: false };
}

/** One assumption, no use of the credentials on a service request. The borrowed
 * object must be visibly cleared on close; this is not secure memory erasure,
 * service-side revocation, or verification of denied access/model permission. */
export function exerciseSyntheticRoleCredentials(input: Parameters<typeof acquireSyntheticRoleLease>[0]): SyntheticRoleExercise {
  let lease: ReturnType<typeof acquireSyntheticRoleLease> | undefined;
  try {
    lease = acquireSyntheticRoleLease(input);
    const borrowed = lease.getCredentials();
    lease.close();
    if (borrowed.accessKeyId !== "" || borrowed.secretAccessKey !== "" || borrowed.sessionToken !== "" || lease.remainingMs() !== 0) fail();
    let denied = false;
    try { lease.getCredentials(); } catch { denied = true; }
    if (!denied) fail();
    return { assumptionVerified: true, credentialLeaseClosed: true, inferenceCalls: 0 };
  } catch { throw Error("SYNTHETIC_ROLE_REHEARSAL_LIVE_UNVERIFIED"); }
  finally { lease?.close(); }
}

export function syntheticReadDenialRehearsalPlan() {
  return { ...syntheticRoleRehearsalPlan(), plannedReadDenialRequestsMax: 2,
    exactCases: ["parameter-canary", "cluster-read"], decryption: false,
    runTaskPerformed: false, readDenialVerified: false, separateApprovalRequired: true };
}

export function syntheticExpiryRehearsalPlan() {
  return { ...syntheticRoleRehearsalPlan(), plannedInferenceCalls: 2, positiveControlsMax: 1,
    postWindowRequestsMax: 1, maxOutputTokensPerRequest: 512, automaticRetries: 0,
    serverSideExpiryVerified: false, separateApprovalRequired: true };
}

export function syntheticAlternatePrincipalRehearsalPlan() {
  return { ...syntheticRoleRehearsalPlan(), plannedTemporaryRolesMax: 2, plannedAssumptionsMax: 2,
    plannedSourceAssumptionsMax: 1, plannedTargetAssumptionAttemptsMax: 1,
    targetTrustModified: false, targetSessionPolicy: "explicit-deny-all", targetCredentialsUsed: false,
    sourceIndependentCleanupRequired: true, alternatePrincipalDenied: false, runTaskPerformed: false,
    explicitTwoRoleScopeRequired: true };
}

export function syntheticComputeDenialRehearsalPlan() {
  return { ...syntheticRoleRehearsalPlan(), plannedRunTaskRequestsMax: 1, plannedLaunchType: "EC2",
    emptyRegisteredCapacityRequired: true, fargateSelected: false, automaticRetries: 0,
    exactOwnedTaskReconciliationRequired: true, runTaskDenialVerified: false, taskSecretInjectionPrevented: false,
    concurrentCapacityChangeRisk: true, explicitComputeDenialScopeRequired: true };
}

export function syntheticRestrictedBrowserRehearsalPlan() {
  return { ...syntheticRoleRehearsalPlan(), plannedInferenceCalls: 1, maxOutputTokensPerRequest: 512,
    automaticModelCalls: 0, providerCalls: 0, loopbackOnly: true, lifetimeMsMax: 300000,
    administratorKeysExported: false, restrictedLeaseOnly: true, browserResultAcceptanceRequired: true,
    permanentRoleCreated: false, automaticStackCleanupRequired: true };
}

export async function runSyntheticRoleRehearsal(mode: "credentials-only" | "read-denial" | "expiry-contrast" | "alternate-principal" | "compute-denial" | "restricted-browser" = "credentials-only") {
  if (!["credentials-only", "read-denial", "expiry-contrast", "alternate-principal", "compute-denial", "restricted-browser"].includes(mode)) fail();
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
  const { account, ownerArn } = reviewOwnerIdentity(identity);
  const readiness = collectPhase11Readiness(read) as Json;
  if (readiness.readyForAccountSpecificDiff !== true || readiness.compute?.executionFlagsVerifiedDisabled !== true ||
      readiness.compute.runningTasks !== 0 || readiness.compute.pendingTasks !== 0 || readiness.compute.services !== 0 ||
      readiness.circuit?.verifiedOpen !== true || readiness.occupiedSlots !== 0) fail();
  const stack = new SyntheticLabRoleStack(new App({ autoSynth: false, analyticsReporting: false }), "SyntheticRoleRehearsal",
    { ownerUserArn: ownerArn, env: { account, region: "ap-northeast-1" }, synthesizer: new BootstraplessSynthesizer() });
  const template = Template.fromStack(stack).toJSON(), nonce = randomUUID().replaceAll("-", "");
  const journal = join(directory, `synthetic-role-rehearsal-${nonce}.json`);
  writeFileSync(journal, JSON.stringify({ stage: "initial", stackName: `gmai-synthetic-role-${nonce}` }) + "\n", { flag: "wx" });
  const call: DraftCall = (service, operation, args, cleanup) => {
    const allowed = service === "iam" ? ["get-role"] : cleanup ?
      ["describe-stacks", "describe-change-set", "get-template", "list-stack-resources", "delete-change-set", "delete-stack"] :
      ["describe-stacks", "create-change-set", "describe-change-set", "get-template", "list-stack-resources", "execute-change-set"];
    if (!allowed.includes(operation)) fail();
    const result = spawnSync(aws, [service, operation, ...args, "--profile", "gmai-admin",
      "--region", service === "iam" ? "us-east-1" : "ap-northeast-1", "--endpoint-url",
      service === "iam" ? "https://iam.amazonaws.com" : "https://cloudformation.ap-northeast-1.amazonaws.com",
      "--no-cli-pager", "--no-paginate", "--output", "json"],
      { env, encoding: "utf8", windowsHide: true, timeout: 20000, maxBuffer: 100000 });
    return syntheticDraftCliResponse(operation, result);
  };
  let readDenialAccepted = false, denialRequestAttempts = 0;
  let expiryState: ReturnType<ReturnType<typeof createSyntheticExpiryExercise>["snapshot"]> | undefined;
  let alternateState: Json | undefined;
  let alternateResult: Awaited<ReturnType<typeof rehearseSyntheticAlternatePrincipal>> | undefined;
  let computeState: Json | undefined;
  let computeResult: Awaited<ReturnType<typeof exerciseSyntheticComputeDenial>> | undefined;
  let browserState: Json | undefined;
  let browserResult: Awaited<ReturnType<typeof exerciseRestrictedSyntheticBrowser>> | undefined;
  function save(state: Json) {
    if (ownedLocalGateReportDirectory(process.cwd()) !== directory || !lstatSync(journal).isFile() ||
        lstatSync(journal).isSymbolicLink() || realpathSync(journal) !== journal) fail();
    writeFileSync(journal, JSON.stringify({ ...state, exerciseMode: mode, readDenialAccepted, denialRequestAttempts,
      expiryState, alternateState, alternateResult, computeState, computeResult, browserState, browserResult }) + "\n");
  }
  let parentState: Json = { stage: "initial", stackName: `gmai-synthetic-role-${nonce}` };
  const cancellation = new AbortController(), cancel = () => cancellation.abort();
  process.on("SIGINT", cancel); process.on("SIGTERM", cancel);
  if (mode === "restricted-browser") { process.stdin.once("data", cancel); process.stdin.once("end", cancel); }
  let result: Awaited<ReturnType<typeof rehearseSyntheticRole>>;
  try { result = await rehearseSyntheticRole({ identity, nonce, template, now: Date.now, wait: () => delay(15000), call,
    ...(mode === "expiry-contrast" ? { exerciseMode: "expiry-contrast" as const, observedModelAttempts: () => expiryState?.modelRequestAttempts ?? 0 } : {}),
    ...(mode === "restricted-browser" ? { exerciseMode: "restricted-browser" as const,
      observedModelAttempts: () => browserState?.modelRequestAttempts === null ? NaN : browserState?.modelRequestAttempts ?? 0 } : {}),
    exercise: async () => {
      if (cancellation.signal.aborted) fail();
      if (mode === "credentials-only") return exerciseSyntheticRoleCredentials({ identity, nonce, call: createSyntheticRoleCli() });
      if (mode === "restricted-browser") {
        // The owner CLI adapter captures its independently sanitized environment
        // before the SDK runtime loses profile, endpoint and injected key values.
        const roleCall = createSyntheticRoleCli();
        const runtimeEnvironment = { ...cleanSourceChildEnvironment(process.env), AWS_CSM_ENABLED: "false", AWS_EC2_METADATA_DISABLED: "true" };
        for (const key of Object.keys(process.env)) delete process.env[key];
        Object.assign(process.env, runtimeEnvironment);
        browserResult = await exerciseRestrictedSyntheticBrowser({ identity, nonce, roleCall, signal: cancellation.signal,
          ready: origin => console.log(JSON.stringify({ mode: "restricted-synthetic-lab-ready", origin,
            automaticModelCalls: 0, maxModelAttempts: 1, maxOutputTokens: 512, lifetimeMsMax: 300000,
            dataOrigin: "synthetic", auth: "temporary-model-only-role", stop: "Enter or browser Close or automatic expiry" })),
          record: state => { browserState = state; save(parentState); },
        });
        if (!browserResult.completed || browserResult.modelRequestAttempts !== 0 && browserResult.modelRequestAttempts !== 1) fail();
        return { assumptionVerified: true, credentialLeaseClosed: true, inferenceCalls: browserResult.modelRequestAttempts, listenerClosed: true };
      }
      if (mode === "compute-denial") {
        let scopeReads = 0, cleanupCalls = 0;
        computeResult = await exerciseSyntheticComputeDenial({ identity, nonce, now: Date.now,
          roleCall: createSyntheticRoleCli(), signal: cancellation.signal, wait: () => delay(15000),
          ownerCall: (service, operation, args, cleanup) => {
            const allowed = cleanup ? service === "ecs" && ["list-tasks", "describe-tasks", "stop-task"].includes(operation) :
              service === "lambda" && operation === "get-function-configuration" || service === "ecs" &&
              ["describe-task-definition", "describe-clusters", "list-container-instances"].includes(operation);
            if (!allowed || (cleanup ? ++cleanupCalls > 15 : cancellation.signal.aborted || ++scopeReads > 4)) fail();
            const r = spawnSync(aws, [service, operation, ...args, "--profile", "gmai-admin", "--region", "ap-northeast-1",
              "--endpoint-url", `https://${service}.ap-northeast-1.amazonaws.com`, "--no-cli-pager", "--no-paginate", "--output", "json"],
              { env, encoding: "utf8", windowsHide: true, timeout: 20000, maxBuffer: 100000 });
            try {
              if (r.error || r.status !== 0 || r.signal !== null) fail();
              return JSON.parse(r.stdout);
            } finally { r.stdout = ""; r.stderr = ""; }
          },
          record: state => { computeState = state; save(parentState); },
        });
        if (!computeResult.completed || !computeResult.denialAccepted || computeResult.runTaskRequests !== 1) fail();
        return { assumptionVerified: true, credentialLeaseClosed: true, inferenceCalls: 0 };
      }
      if (mode === "alternate-principal") {
        alternateResult = await rehearseSyntheticAlternatePrincipal({ identity, nonce, now: Date.now, wait: () => delay(15000),
          environment: process.env, signal: cancellation.signal,
          call: (service, operation, args) => {
            const regional = service === "sts";
            const r = syntheticDraftCliResponse(operation, spawnSync(aws, [service, operation, ...args,
              "--profile", "gmai-admin", "--region", regional ? "ap-northeast-1" : "us-east-1",
              "--endpoint-url", regional ? "https://sts.ap-northeast-1.amazonaws.com" : "https://iam.amazonaws.com",
              "--no-cli-pager", "--no-paginate", "--output", "json"],
              { env, encoding: "utf8", windowsHide: true, timeout: 20000, maxBuffer: 100000 }));
            if (r.ok) return r;
            return { ok: false, code: r.code === "ABSENT" ? "ABSENT" : "UNVERIFIED" };
          },
          targetRun: (args, options) => spawnSync(aws, [...args], options),
          record: state => { alternateState = state; save(parentState); },
        });
        if (!alternateResult.completed || !alternateResult.sourceAbsent || !alternateResult.candidateDenialAccepted) fail();
        return { assumptionVerified: true, credentialLeaseClosed: true, inferenceCalls: 0 };
      }
      if (mode === "expiry-contrast") {
        const exercise = createSyntheticExpiryExercise({ identity, nonce, call: createSyntheticRoleCli(), signal: cancellation.signal });
        try {
          const r = await exercise.run();
          return { assumptionVerified: r.assumptionVerified, credentialLeaseClosed: r.credentialLeaseClosed,
            inferenceCalls: r.inferenceCalls, serverSideExpiryVerified: r.serverSideExpiryVerified };
        } finally { expiryState = exercise.snapshot(); exercise.close(); }
      }
      const exercise = createSyntheticReadDenialExercise({ identity, nonce, call: createSyntheticRoleCli() });
      try {
        const r = await exercise.run();
        if (r.assumptionVerified !== true || r.credentialLeaseClosed !== true || r.requestAttempts !== 2 ||
            r.inferenceCalls !== 0 || r.providerCalls !== 0 || r.acceptedCases.join(",") !== "parameter-canary,cluster-read") fail();
        readDenialAccepted = true;
        return { assumptionVerified: true, credentialLeaseClosed: true, inferenceCalls: 0 };
      } finally {
        denialRequestAttempts = exercise.snapshot().requestAttempts;
        exercise.close();
      }
    },
    record: state => { parentState = state; save(state); }
    }); } finally {
      process.removeListener("SIGINT", cancel); process.removeListener("SIGTERM", cancel);
      if (mode === "restricted-browser") { process.stdin.removeListener("data", cancel); process.stdin.removeListener("end", cancel); process.stdin.pause(); }
    }
  if (mode === "restricted-browser") return { ...result, mode: "temporary-restricted-synthetic-browser", browserResult,
    restrictedBrowserLifecycleVerified: result.completed && browserResult?.completed === true,
    browserAnalysisAccepted: false, independentBrowserEvidenceRequired: true };
  if (mode === "compute-denial") return { ...result, mode: "temporary-synthetic-compute-denial-rehearsal", computeResult,
    runTaskDenialVerified: result.completed && computeResult?.completed === true && computeResult.denialAccepted,
    independentCloudPostureRequired: true, fargateSelected: false };
  if (mode === "alternate-principal") return { ...result, mode: "temporary-synthetic-alternate-principal-rehearsal",
    alternateResult, alternatePrincipalDenied: result.completed && alternateResult?.completed === true && alternateResult.candidateDenialAccepted,
    sourceRoleAbsent: alternateResult?.sourceAbsent === true, exactTrustConditionDiagnosed: false,
    allForeignPrincipalsVerified: false, runTaskDenialVerified: false, independentSourceAbsenceRequired: true };
  if (mode === "expiry-contrast") return { ...result, mode: "temporary-synthetic-expiry-contrast",
    ...expiryState, serverSideExpiryVerified: result.completed && expiryState?.serverSideExpiryVerified === true,
    runTaskDenialVerified: false, foreignPrincipalVerified: false };
  if (mode === "credentials-only") return result;
  return { ...result, mode: "temporary-synthetic-read-denial-rehearsal", denialRequestAttempts,
    readDenialVerified: result.completed && readDenialAccepted, runTaskDenialVerified: false,
    serverSideExpiryVerified: false, foreignPrincipalVerified: false };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (!args.length) console.log(JSON.stringify(syntheticRoleRehearsalPlan()));
    else if (args.length === 1 && args[0] === "--plan-read-denial") console.log(JSON.stringify(syntheticReadDenialRehearsalPlan()));
    else if (args.length === 1 && args[0] === "--plan-expiry-contrast") console.log(JSON.stringify(syntheticExpiryRehearsalPlan()));
    else if (args.length === 1 && args[0] === "--plan-alternate-principal") console.log(JSON.stringify(syntheticAlternatePrincipalRehearsalPlan()));
    else if (args.length === 1 && args[0] === "--plan-compute-denial") console.log(JSON.stringify(syntheticComputeDenialRehearsalPlan()));
    else if (args.length === 1 && args[0] === "--plan-restricted-browser") console.log(JSON.stringify(syntheticRestrictedBrowserRehearsalPlan()));
    else {
      if (args.length !== 1 || !["--execute-temporary-role-rehearsal", "--execute-temporary-role-read-denial", "--execute-temporary-role-expiry-contrast", "--execute-temporary-role-alternate-principal", "--execute-temporary-role-compute-denial", "--execute-temporary-role-browser"].includes(args[0]!)) fail();
      const result = await runSyntheticRoleRehearsal(args[0] === "--execute-temporary-role-browser" ? "restricted-browser" : args[0] === "--execute-temporary-role-compute-denial" ? "compute-denial" : args[0] === "--execute-temporary-role-alternate-principal" ? "alternate-principal" : args[0] === "--execute-temporary-role-expiry-contrast" ? "expiry-contrast" : args[0] === "--execute-temporary-role-read-denial" ? "read-denial" : "credentials-only"); console.log(JSON.stringify(result));
      if (!result.completed || !result.stackAbsent || !result.roleAbsent) process.exitCode = 1;
    }
  } catch { console.error(JSON.stringify({ error: "SYNTHETIC_ROLE_REHEARSAL_LIVE_UNVERIFIED", rawDetailsSuppressed: true,
    inspectOwnedJournalBeforeRetry: true, independentClosureRequired: true })); process.exitCode = 1; }
}
