import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync } from "node:fs";
import { basename, isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { canonicalPatchValue } from "./compute-patch-rollout.js";
import { collectMaintenanceReferenceReadiness } from "./maintenance-reference-readiness.js";
import { createPhase11ReadOnlyCliRunner, phase11ReadOnlyChildEnvironment } from "./phase11-live-readiness.js";

type Json = Record<string, any>;
const REGION = "ap-northeast-1", PREFIX = "global-market-ai-insight-dev";
const hash = (value: unknown) => createHash("sha256").update(canonicalPatchValue(value)).digest("hex");
const FAILURE_CODES = ["IDENTITY_INVALID", "EXISTING_GROUP_UNVERIFIED", "EXISTING_STREAM_UNVERIFIED", "ARGUMENTS_REJECTED",
  "VALIDATION_RESPONSE_INCOMPLETE", "CONFIGURATION_INVALID", "CALL_OR_TIME_BOUND", "BASELINE_UNVERIFIED", "VALIDATION_READ_FAILED",
  "LIVE_REFERENCE_CHANGED", "SIMULATION_READ_FAILED", "EXISTING_GROUP_OWNER_UNVERIFIED", "INCOMPLETE"] as const;
class MaintenanceLogFailure extends Error {
  readonly #packet;
  constructor(code: string) {
    const fixed = FAILURE_CODES.includes(code as typeof FAILURE_CODES[number]) ? code : "INCOMPLETE";
    super(`MAINTENANCE_LOG_${fixed}`);
    this.#packet = Object.freeze({ error: `MAINTENANCE_LOG_${fixed}`, rawIdentifiersPrinted: false,
      cloudMutations: 0, deploymentAuthorized: false });
  }
  packet() { return this.#packet; }
}
function fail(code: string): never { throw new MaintenanceLogFailure(code); }
export function maintenanceLogFailurePacket(error: unknown) {
  try { if (error instanceof MaintenanceLogFailure) return MaintenanceLogFailure.prototype.packet.call(error); } catch { /* Private brand only. */ }
  return new MaintenanceLogFailure("INCOMPLETE").packet();
}
export interface LogDiagnosticCase {
  name: string; action: "logs:CreateLogStream" | "logs:PutLogEvents" | "logs:CreateLogGroup" | "dynamodb:GetItem";
  resource: string; policy: Json; callerArn?: string; resourceOwner?: string;
  exactStream: boolean; diagnosticOnly: true;
}
/** Unattached controls isolate simulator behavior. A group-wildcard or broad
 * control is never substituted for the applicable exact-stream acceptance. */
export function maintenanceLogDiagnosticMatrix(account: string): LogDiagnosticCase[] {
  if (!/^(?!0{12}$)[0-9]{12}$/.test(account)) fail("IDENTITY_INVALID");
  const group = `arn:aws:logs:${REGION}:${account}:log-group:/aws/lambda/${PREFIX}-maintenance`;
  const stream = `${group}:log-stream:synthetic-policy-proof`;
  const cases: LogDiagnosticCase[] = [];
  for (const action of ["logs:CreateLogStream", "logs:PutLogEvents"] as const) {
    const policy = (resource: string) => ({ Version: "2012-10-17", Statement: [{ Effect: "Allow", Action: action, Resource: resource }] });
    const add = (suffix: string, resource: string, grant: string, owner = false) => cases.push({
      name: `${action === "logs:CreateLogStream" ? "create" : "write"}-${suffix}`, action, resource,
      policy: policy(grant), exactStream: resource === stream, diagnosticOnly: true,
      ...(owner ? { callerArn: `arn:aws:iam::${account}:user/aws-admin-user`, resourceOwner: `arn:aws:iam::${account}:root` } : {}),
    });
    add("cdk-group-suffix", stream, `${group}:*:*`);
    add("literal-exact-stream", stream, stream);
    add("unattached-universal-control", stream, "*");
    add("explicit-same-account-owner", stream, stream, true);
    add("group-input-control-not-acceptance", `${group}:*`, `${group}:*:*`);
  }
  return cases;
}
/** Independent action-match controls: never replace the original exact-action
 * permission matrix. Even an unattached Action:* allow is not role approval. */
export function maintenanceLogCoverageMatrix(account: string): LogDiagnosticCase[] {
  if (!/^(?!0{12}$)[0-9]{12}$/.test(account)) fail("IDENTITY_INVALID");
  const group = `arn:aws:logs:${REGION}:${account}:log-group:/aws/lambda/${PREFIX}-maintenance`;
  const stream = `${group}:log-stream:synthetic-policy-proof`;
  const cases: LogDiagnosticCase[] = [];
  const add = (name: string, action: LogDiagnosticCase["action"], resource: string, grantAction: string, grantResource: string) => {
    cases.push({ name, action, resource, policy: { Version: "2012-10-17", Statement: [
      { Effect: "Allow", Action: grantAction, Resource: grantResource },
    ] }, exactStream: resource === stream, diagnosticOnly: true });
  };
  for (const action of ["logs:CreateLogStream", "logs:PutLogEvents"] as const) {
    const prefix = action === "logs:CreateLogStream" ? "create" : "write";
    add(`${prefix}-exact-action-universal-resource`, action, stream, action, "*");
    add(`${prefix}-service-actions-exact-stream`, action, stream, "logs:*", stream);
    add(`${prefix}-all-actions-exact-stream`, action, stream, "*", stream);
  }
  add("create-group-independent-positive-control", "logs:CreateLogGroup", group, "logs:CreateLogGroup", "*");
  add("get-table-independent-positive-control", "dynamodb:GetItem", `arn:aws:dynamodb:${REGION}:${account}:table/${PREFIX}-jobs`, "dynamodb:GetItem", "*");
  return cases;
}
const CONTROLLER_LOG_GROUP = `/aws/lambda/${PREFIX}-controller`;
/** One bounded metadata page is a source for one owned stream, not an inventory
 * or a Maintenance-role/service authorization proof. No log messages are read. */
export function maintenanceLogExistenceMatrix(account: string, groupValue: unknown, streamsValue: unknown): LogDiagnosticCase[] {
  maintenanceLogDiagnosticMatrix(account); // same strict account boundary
  const group = groupValue as Json | null, streams = streamsValue as Json | null;
  const groupArn = `arn:aws:logs:${REGION}:${account}:log-group:${CONTROLLER_LOG_GROUP}`;
  const groups = group?.logGroups;
  if (!group || !Array.isArray(groups) || groups.length !== 1 || group.nextToken != null || group.NextToken != null ||
      groups[0]?.logGroupName !== CONTROLLER_LOG_GROUP || groups[0]?.arn !== `${groupArn}:*` ||
      (groups[0].logGroupArn !== undefined && groups[0].logGroupArn !== groupArn) ||
      ![7, 14].includes(groups[0].retentionInDays)) fail("EXISTING_GROUP_UNVERIFIED");
  const entries = streams?.logStreams;
  if (!streams || !Array.isArray(entries) || entries.length < 1 || entries.length > 5 || streams.NextToken != null ||
      (streams.nextToken !== undefined && (typeof streams.nextToken !== "string" || streams.nextToken.length < 1 || streams.nextToken.length > 4096)))
    fail("EXISTING_STREAM_UNVERIFIED");
  const seen = new Set<string>();
  for (const entry of entries) {
    if (!entry || typeof entry !== "object" || typeof entry.logStreamName !== "string" ||
        !/^20[0-9]{2}\/(?:0[1-9]|1[0-2])\/(?:0[1-9]|[12][0-9]|3[01])\/(?:global-market-ai-insight-dev-controller)?\[\$LATEST\][a-f0-9]{32}$/.test(entry.logStreamName) ||
        seen.has(entry.logStreamName) || entry.arn !== `${groupArn}:log-stream:${entry.logStreamName}` ||
        (entry.uploadSequenceToken !== undefined && (typeof entry.uploadSequenceToken !== "string" ||
          entry.uploadSequenceToken.length < 1 || entry.uploadSequenceToken.length > 4096)) ||
        !Number.isSafeInteger(entry.creationTime) || entry.creationTime <= 0) fail("EXISTING_STREAM_UNVERIFIED");
    seen.add(entry.logStreamName);
  }
  // The selected entry is physically owned metadata, never a guessed or old ARN.
  const actual = entries[0].arn as string, synthetic = `${groupArn}:log-stream:synthetic-log-existence-control`;
  const cases: LogDiagnosticCase[] = [];
  for (const action of ["logs:CreateLogStream", "logs:PutLogEvents"] as const) {
    for (const [kind, resource, exactStream] of [
      ["existing-exact-stream", actual, true], ["synthetic-same-group-stream", synthetic, true],
      ["existing-group-input-not-acceptance", `${groupArn}:*`, false],
    ] as const) cases.push({ name: `${action === "logs:CreateLogStream" ? "create" : "write"}-${kind}`,
      action, resource, exactStream, diagnosticOnly: true,
      policy: { Version: "2012-10-17", Statement: [{ Effect: "Allow", Action: action, Resource: "*" }] } });
  }
  return cases;
}
export function maintenanceLogMetadataFingerprint(account: string, group: unknown, streams: unknown) {
  maintenanceLogExistenceMatrix(account, group, streams);
  const g = group as Json, s = streams as Json;
  // Only transport/legacy tokens are not resource identity. PutLogEvents ignores
  // sequenceToken (AWS API reference, checked 2026-10-12). The raw difference
  // remains reported independently; every other selected field is compared.
  // This is diagnostic stability, never the original IAM acceptance matrix.
  const selected = s.logStreams.map((entry: Json) => {
    const { uploadSequenceToken, ...remaining } = entry; void uploadSequenceToken; return remaining;
  });
  return hash({ group: g.logGroups, streams: selected, additionalPageObserved: s.nextToken !== undefined });
}
export function controllerDiagnosticGroupOwned(value: unknown): boolean {
  const response = value as Json | null;
  if (!response || response.NextToken != null || response.nextToken != null || !Array.isArray(response.StackResourceSummaries)) return false;
  const groups = response.StackResourceSummaries.filter((item: Json) => item?.ResourceType === "AWS::Logs::LogGroup" &&
    item.PhysicalResourceId === CONTROLLER_LOG_GROUP);
  return groups.length === 1 && /^(?:CREATE|UPDATE)_COMPLETE$/.test(groups[0].ResourceStatus);
}
/** Report bounded observations, never error text, private ARNs, or approval. */
export function summarizeLogDiagnostic(value: unknown, item: LogDiagnosticCase) {
  const response = value as Json | null;
  const results = response?.EvaluationResults, result = Array.isArray(results) && results.length === 1 ? results[0] : undefined;
  const specifics = result?.ResourceSpecificResults;
  const specific = Array.isArray(specifics) && specifics.length === 1 ? specifics[0] : undefined;
  const decisions = ["allowed", "implicitDeny", "explicitDeny"];
  const noMissing = (v: unknown) => v === undefined || Array.isArray(v) && v.length === 0;
  const complete = response?.IsTruncated === false && response?.Marker == null && response?.NextToken == null &&
    typeof result?.EvalActionName === "string" && result.EvalActionName.toLowerCase() === item.action.toLowerCase() &&
    specific?.EvalResourceName === item.resource && decisions.includes(result?.EvalDecision) &&
    result.EvalDecision === specific.EvalResourceDecision && noMissing(result.MissingContextValues) && noMissing(specific.MissingContextValues);
  // These optional API fields are observations, not root-cause conclusions.
  // Omission must not mean "no SCP/boundary"; do not expose source-policy IDs,
  // statement contents/positions or arbitrary cross-account dictionary keys.
  const boolean = (v: unknown) => typeof v === "boolean" ? v : null;
  const count = (v: unknown) => Array.isArray(v) && v.length <= 100 ? v.length : null;
  const decisionEvidence = complete ? {
    aggregateMatchedStatementCount: count(result.MatchedStatements),
    exactResourceMatchedStatementCount: count(specific.MatchedStatements),
    aggregateOrganizationsAllowed: boolean(result.OrganizationsDecisionDetail?.AllowedByOrganizations),
    aggregatePermissionsBoundaryAllowed: boolean(result.PermissionsBoundaryDecisionDetail?.AllowedByPermissionsBoundary),
    exactResourcePermissionsBoundaryAllowed: boolean(specific.PermissionsBoundaryDecisionDetail?.AllowedByPermissionsBoundary),
    rootCauseEstablished: false,
  } : null;
  return { case: item.name, exactStreamInput: item.exactStream, diagnosticOnly: true,
    completeObservation: complete, observedDecision: complete ? result.EvalDecision as string : "unverified",
    decisionEvidence, liveAuthorizationVerified: false, deploymentAuthorized: false };
}
export function maintenanceLogDiagnosticPlan(args: readonly string[] = []) {
  if (args.length) fail("ARGUMENTS_REJECTED");
  return { mode: "dry-run", awsCalls: 0, awsCallsMax: 38, simulationsMax: 10,
    cloudMutations: 0, attachedPolicies: 0, actualLogCalls: 0, roleAssumptions: 0,
    readyForDeployment: false, originalExactStreamAcceptanceRequired: true, rawIdentifiersPrinted: false };
}
export function maintenanceLogCoveragePlan(args: readonly string[] = []) {
  if (args.length) fail("ARGUMENTS_REJECTED");
  return { ...maintenanceLogDiagnosticPlan(), operation: "unattached-action-coverage-comparison",
    awsCallsMax: 36, simulationsMax: 8, originalAcceptanceMatrixUnchanged: true,
    broadActionPoliciesAttached: false, rootCauseEstablished: false };
}
export function maintenanceLogExistencePlan(args: readonly string[] = []) {
  if (args.length) fail("ARGUMENTS_REJECTED");
  return { ...maintenanceLogDiagnosticPlan(), operation: "unattached-existing-stream-comparison",
    awsCallsMax: 38, simulationsMax: 6, logMetadataReadsMax: 4, logMessageReads: 0, logWrites: 0,
    originalAcceptanceMatrixUnchanged: true, rootCauseEstablished: false,
    metadataPageIsCompleteStreamInventory: false, broadPoliciesAttached: false };
}
export function maintenanceLogBaselinePlan(args: readonly string[] = []) {
  if (args.length) fail("ARGUMENTS_REJECTED");
  return { ...maintenanceLogExistencePlan(), operation: "existing-reference-baseline-only",
    awsCallsMax: 32, simulationsMax: 0, permissionDecisionsObserved: false };
}
export interface LogTransportCase extends LogDiagnosticCase {
  transport: "argv" | "cli-input-json";
  comparisonPair: "exact-stream" | "group-input-not-acceptance";
}
/** Compare CLI input parsing only, never replace the exact-stream IAM gate. */
export function maintenanceLogTransportMatrix(account: string, group: unknown, streams: unknown): LogTransportCase[] {
  const originals = maintenanceLogExistenceMatrix(account, group, streams)
    .filter(item => item.action === "logs:PutLogEvents" && !item.name.includes("synthetic-same-group"));
  return originals.flatMap(item => (["argv", "cli-input-json"] as const).map(transport => ({
    ...item, name: `${item.exactStream ? "exact-stream" : "group-input-not-acceptance"}-${transport}`,
    comparisonPair: item.exactStream ? "exact-stream" : "group-input-not-acceptance", transport,
  })));
}
export function maintenanceLogTransportArguments(item: LogTransportCase): string[] {
  if (!["argv", "cli-input-json"].includes(item.transport) || item.action !== "logs:PutLogEvents" || item.diagnosticOnly !== true ||
      !["exact-stream", "group-input-not-acceptance"].includes(item.comparisonPair) ||
      item.name !== `${item.comparisonPair}-${item.transport}` ||
      item.exactStream !== (item.comparisonPair === "exact-stream") || item.callerArn !== undefined || item.resourceOwner !== undefined ||
      hash(item.policy) !== hash({ Version: "2012-10-17", Statement: [{ Effect: "Allow", Action: "logs:PutLogEvents", Resource: "*" }] }))
    fail("ARGUMENTS_REJECTED");
  const account = /^arn:aws:logs:ap-northeast-1:((?!0{12}$)[0-9]{12}):log-group:\/aws\/lambda\/global-market-ai-insight-dev-controller:/.exec(item.resource)?.[1];
  const group = `arn:aws:logs:${REGION}:${account}:log-group:${CONTROLLER_LOG_GROUP}`;
  if (!account || (item.exactStream ?
    !item.resource.startsWith(`${group}:log-stream:`) || !/^20[0-9]{2}\/(?:0[1-9]|1[0-2])\/(?:0[1-9]|[12][0-9]|3[01])\/(?:global-market-ai-insight-dev-controller)?\[\$LATEST\][a-f0-9]{32}$/.test(item.resource.slice(`${group}:log-stream:`.length)) :
    item.resource !== `${group}:*`)) fail("ARGUMENTS_REJECTED");
  const policy = JSON.stringify(item.policy);
  // API policy documents are strings inside PolicyInputList, not nested objects.
  const request = { PolicyInputList: [policy], ActionNames: [item.action], ResourceArns: [item.resource] };
  const input = item.transport === "argv" ? ["--policy-input-list", policy, "--action-names", item.action, "--resource-arns", item.resource] :
    ["--cli-input-json", JSON.stringify(request)];
  return ["iam", "simulate-custom-policy", ...input, "--max-items", "100"];
}
export function maintenanceLogTransportPlan(args: readonly string[] = []) {
  if (args.length) fail("ARGUMENTS_REJECTED");
  return { ...maintenanceLogExistencePlan(), operation: "unattached-cli-input-parsing-comparison",
    awsCallsMax: 36, simulationsMax: 4, inputFilesWritten: 0, wireInputsVerified: false,
    originalAcceptanceMatrixUnchanged: true, simulatorResultsAreLivePermissionProof: false };
}
export function summarizeLogTransportAgreement(results: unknown) {
  const pairs = ["exact-stream", "group-input-not-acceptance"] as const;
  const transports = ["argv", "cli-input-json"] as const;
  const names = pairs.flatMap(pair => transports.map(transport => `${pair}-${transport}`));
  if (!Array.isArray(results) || results.length !== names.length || results.some((result, i) =>
    result?.case !== names[i] || result.comparisonPair !== pairs[Math.floor(i / 2)] || result.transport !== transports[i % 2] ||
    result.completeObservation !== true || result.diagnosticOnly !== true || result.deploymentAuthorized !== false ||
    result.liveAuthorizationVerified !== false || result.exactStreamInput !== (Math.floor(i / 2) === 0) ||
    !["allowed", "implicitDeny", "explicitDeny"].includes(result.observedDecision))) fail("INCOMPLETE");
  return { allTransportResponsesComplete: true, inputFilesWritten: 0, wireInputsVerified: false,
    pairs: pairs.map((pair, i) => ({ pair, decisionsAgree: results[i * 2].observedDecision === results[i * 2 + 1].observedDecision })),
    rootCauseEstablished: false, acceptanceGateStillRequired: true, readyForDeployment: false };
}
export function summarizeDiagnosticReadChanges(before: unknown, after: unknown) {
  const valid = (v: unknown): v is Json[] => Array.isArray(v) && v.length === 14 && v.every(item =>
    item && typeof item === "object" && Array.isArray(item.args) && item.args.length >= 2 &&
    item.args.every((arg: unknown) => typeof arg === "string") && item.value && typeof item.value === "object" && !Array.isArray(item.value));
  if (!valid(before) || !valid(after)) return { readComparisonComplete: false, requestScopesUnchanged: false, changedReadOrdinals: [] as number[] };
  return { readComparisonComplete: true,
    requestScopesUnchanged: before.every((item, i) => hash(item.args) === hash(after[i]!.args)),
    changedReadOrdinals: before.flatMap((item, i) => hash(item.value) === hash(after[i]!.value) ? [] : [i + 1]) };
}
export function maintenancePolicyValidationPlan(args: readonly string[] = []) {
  if (args.length) fail("ARGUMENTS_REJECTED");
  return { mode: "dry-run", operation: "basic-unattached-policy-validation", awsCalls: 0, awsCallsMax: 30,
    validationsMax: 2, cloudMutations: 0, attachedPolicies: 0, analyzersCreated: 0,
    paidCustomPolicyChecks: 0, actualLogCalls: 0, roleAssumptions: 0,
    originalExactStreamAcceptanceRequired: true, readyForDeployment: false, rawIdentifiersPrinted: false };
}
const VALIDATION_TYPES = ["ERROR", "SECURITY_WARNING", "WARNING", "SUGGESTION"] as const;
// Fixed public API codes only. Even uppercase strings from the response must
// not become arbitrary private-policy text in the output.
const PUBLIC_VALIDATION_CODES = ["INVALID_ACTION", "INVALID_ARN_ACCOUNT", "INVALID_ARN_PREFIX",
  "INVALID_ARN_REGION", "INVALID_ARN_RESOURCE"] as const;
export function summarizeMaintenancePolicyValidation(value: unknown) {
  const response = value as Json | null;
  if (!response || typeof response !== "object" || Array.isArray(response) ||
      Object.keys(response).some(key => !["findings", "nextToken"].includes(key)) || response.nextToken != null ||
      !Array.isArray(response.findings) || response.findings.length > 100) fail("VALIDATION_RESPONSE_INCOMPLETE");
  const counts = { ERROR: 0, SECURITY_WARNING: 0, WARNING: 0, SUGGESTION: 0 };
  const knownCounts = Object.fromEntries(PUBLIC_VALIDATION_CODES.map(code => [code, 0]));
  let otherIssueCodeCount = 0;
  for (const item of response.findings) {
    if (!item || typeof item !== "object" || Array.isArray(item) || !VALIDATION_TYPES.includes(item.findingType) ||
        typeof item.issueCode !== "string" || !/^[A-Z][A-Z0-9_]{0,99}$/.test(item.issueCode) ||
        typeof item.findingDetails !== "string" || item.findingDetails.length > 16_384 ||
        !Array.isArray(item.locations) || item.locations.length > 100) fail("VALIDATION_RESPONSE_INCOMPLETE");
    counts[item.findingType as typeof VALIDATION_TYPES[number]]++;
    if (PUBLIC_VALIDATION_CODES.includes(item.issueCode)) knownCounts[item.issueCode]++;
    else otherIssueCodeCount++;
  }
  return { completeObservation: true, findingCounts: counts, knownIssueCodeCounts: knownCounts, otherIssueCodeCount,
    noValidationErrorsObserved: counts.ERROR === 0, rawFindingDetailsSuppressed: true,
    rootCauseEstablished: false, liveAuthorizationVerified: false, deploymentAuthorized: false };
}
export async function buildMaintenancePolicyValidationDocuments(account: string) {
  const exact = maintenanceLogDiagnosticMatrix(account).filter(item => item.name.endsWith("literal-exact-stream"));
  const { buildMaintenancePolicyForSimulation } = await import("./maintenance-reference-preflight.js");
  return [
    { name: "complete-proposed-maintenance-policy", policy: buildMaintenancePolicyForSimulation(account) },
    { name: "literal-exact-stream-control", policy: { Version: "2012-10-17", Statement: [{ Effect: "Allow",
      Action: exact.map(item => item.action), Resource: exact[0]!.resource }] } },
  ];
}
/** Basic ValidatePolicy only, not CheckNoNewAccess/paid custom checks, analyzer
 * creation, attached-policy mutation or a replacement for simulation tests. */
export async function executeMaintenancePolicyValidation() {
  const plan = maintenancePolicyValidationPlan(), aws = process.env.GMAI_AWS_CLI_PATH;
  if (process.platform !== "win32" || process.env.AWS_PROFILE !== "gmai-admin" || !aws || !isAbsolute(aws) ||
      basename(aws).toLowerCase() !== "aws.exe" || !lstatSync(aws).isFile() || lstatSync(aws).isSymbolicLink()) fail("CONFIGURATION_INVALID");
  const started = Date.now(); let calls = 0;
  const consume = () => { const elapsed = Date.now() - started;
    if (++calls > plan.awsCallsMax || !Number.isSafeInteger(elapsed) || elapsed < 0 || elapsed >= 480_000) fail("CALL_OR_TIME_BOUND"); };
  const snapshot = () => {
    const captured: Json = { reads: [] };
    const reader = () => { const run = createPhase11ReadOnlyCliRunner(); return (args: readonly string[]) => {
      consume(); const value = run(args); captured.reads.push({ args: [...args], value });
      if (args[0] === "sts") captured.identity = value;
      return value;
    }; };
    const report = collectMaintenanceReferenceReadiness(reader(), reader());
    if (!report.referencesVerified || !captured.identity) fail("BASELINE_UNVERIFIED");
    return { account: captured.identity.Account as string, fingerprint: hash({ captured, references: report.referenceFingerprint }) };
  };
  const before = snapshot(), documents = await buildMaintenancePolicyValidationDocuments(before.account), results = [];
  for (const item of documents) {
    consume();
    const result = spawnSync(aws, ["accessanalyzer", "validate-policy", "--policy-document", JSON.stringify(item.policy),
      "--policy-type", "IDENTITY_POLICY", "--locale", "EN", "--max-results", "100", "--profile", "gmai-admin",
      "--region", REGION, "--no-cli-pager", "--no-cli-auto-prompt", "--no-paginate", "--output", "json",
      "--cli-connect-timeout", "10", "--cli-read-timeout", "20"], { encoding: "utf8", windowsHide: true,
      env: phase11ReadOnlyChildEnvironment(process.env), timeout: 25_000, maxBuffer: 2_000_000 });
    if (result.status !== 0 || result.signal !== null || result.error || Date.now() - started >= 480_000) fail("VALIDATION_READ_FAILED");
    results.push({ case: item.name, ...summarizeMaintenancePolicyValidation(JSON.parse(result.stdout)) });
  }
  const after = snapshot(), currentDocuments = await buildMaintenancePolicyValidationDocuments(after.account);
  if (before.fingerprint !== after.fingerprint || hash(documents) !== hash(currentDocuments)) fail("LIVE_REFERENCE_CHANGED");
  return { ...plan, mode: "basic-unattached-policy-validation", awsCalls: calls, results,
    liveReferencesAndProposedPolicyStableBeforeAfter: true, allValidationResponsesComplete: true,
    originalSimulatorAcceptanceUnchanged: true, actualServiceAuthorizationUnverified: true };
}
export function executeMaintenanceLogDiagnostics(mode: "resource-forms" | "action-coverage" | "resource-existence" | "baseline-comparison" | "input-transport" = "resource-forms") {
  if (!["resource-forms", "action-coverage", "resource-existence", "baseline-comparison", "input-transport"].includes(mode)) fail("ARGUMENTS_REJECTED");
  const withMetadata = mode === "resource-existence" || mode === "baseline-comparison" || mode === "input-transport";
  const plan = mode === "action-coverage" ? maintenanceLogCoveragePlan() : mode === "resource-existence" ? maintenanceLogExistencePlan() :
    mode === "baseline-comparison" ? maintenanceLogBaselinePlan() : mode === "input-transport" ? maintenanceLogTransportPlan() : maintenanceLogDiagnosticPlan();
  const aws = process.env.GMAI_AWS_CLI_PATH;
  if (process.platform !== "win32" || process.env.AWS_PROFILE !== "gmai-admin" || !aws || !isAbsolute(aws) ||
    basename(aws).toLowerCase() !== "aws.exe" || !lstatSync(aws).isFile() || lstatSync(aws).isSymbolicLink()) fail("CONFIGURATION_INVALID");
  const started = Date.now(); let calls = 0;
  const consume = () => { const elapsed = Date.now() - started;
    if (++calls > plan.awsCallsMax || !Number.isSafeInteger(elapsed) || elapsed < 0 || elapsed >= 480_000) fail("CALL_OR_TIME_BOUND"); };
  const snapshot = () => {
    const captured: Json = { reads: [] };
    const reader = () => { const run = createPhase11ReadOnlyCliRunner(); return (args: readonly string[]) => {
      consume(); const value = run(args);
      captured.reads.push({ args: [...args], value });
      if (args[0] === "sts") captured.identity = value;
      if (args[0] === "lambda") captured.controller = value;
      if (args[1] === "describe-task-definition") captured.definition = value;
      if (args[1] === "get-item" && args.includes(JSON.stringify({ jobId: { S: "control_circuit" } }))) captured.circuit = value;
      return value;
    }; };
    const report = collectMaintenanceReferenceReadiness(reader(), reader());
    if (!report.referencesVerified || !captured.identity || !captured.controller || !captured.definition || !captured.circuit) fail("BASELINE_UNVERIFIED");
    const compute = captured.reads.find((item: Json) => item.args[0] === "cloudformation" &&
      item.args[1] === "list-stack-resources" && item.args.includes(`${PREFIX}-compute`));
    return { account: captured.identity.Account as string, fingerprint: hash({ captured, references: report.referenceFingerprint }),
      controllerLogGroupOwned: controllerDiagnosticGroupOwned(compute?.value), privateReads: captured.reads as Json[] };
  };
  const read = (args: string[]): Json => {
    consume();
    const result = spawnSync(aws, [...args, "--profile", "gmai-admin", "--region", REGION, "--no-cli-pager", "--no-cli-auto-prompt", "--no-paginate", "--output", "json",
      "--cli-connect-timeout", "10", "--cli-read-timeout", "15"], { encoding: "utf8", windowsHide: true,
      env: phase11ReadOnlyChildEnvironment(process.env), timeout: 20_000, maxBuffer: 2_000_000 });
    if (result.status !== 0 || result.signal !== null || result.error || Date.now() - started >= 480_000) fail("SIMULATION_READ_FAILED");
    return JSON.parse(result.stdout);
  };
  const metadata = () => ({
    group: read(["logs", "describe-log-groups", "--log-group-name-prefix", CONTROLLER_LOG_GROUP, "--limit", "5"]),
    streams: read(["logs", "describe-log-streams", "--log-group-name", CONTROLLER_LOG_GROUP, "--order-by", "LastEventTime", "--descending", "--limit", "5"]),
  });
  const before = snapshot(), results = [];
  if (withMetadata && before.controllerLogGroupOwned !== true) fail("EXISTING_GROUP_OWNER_UNVERIFIED");
  const metaBefore = withMetadata ? metadata() : null;
  if (metaBefore) maintenanceLogMetadataFingerprint(before.account, metaBefore.group, metaBefore.streams);
  const matrix = mode === "input-transport" ? maintenanceLogTransportMatrix(before.account, metaBefore!.group, metaBefore!.streams) :
    mode === "baseline-comparison" ? [] : mode === "action-coverage" ? maintenanceLogCoverageMatrix(before.account) : mode === "resource-existence" ?
    maintenanceLogExistenceMatrix(before.account, metaBefore!.group, metaBefore!.streams) : maintenanceLogDiagnosticMatrix(before.account);
  for (const item of matrix) {
    const args = mode === "input-transport" ? maintenanceLogTransportArguments(item as LogTransportCase) :
      ["iam", "simulate-custom-policy", "--policy-input-list", JSON.stringify(item.policy),
      "--action-names", item.action, "--resource-arns", item.resource, "--max-items", "100"];
    if (item.callerArn) args.push("--caller-arn", item.callerArn, "--resource-owner", item.resourceOwner!);
    const observed = summarizeLogDiagnostic(read(args), item);
    results.push(mode === "input-transport" ? { ...observed, transport: (item as LogTransportCase).transport,
      comparisonPair: (item as LogTransportCase).comparisonPair } : observed);
  }
  const metaAfter = withMetadata ? metadata() : null;
  const after = snapshot();
  const comparison = { ...summarizeDiagnosticReadChanges(before.privateReads, after.privateReads),
    fullReferencesStable: before.fingerprint === after.fingerprint,
    controllerGroupOwnerStable: !withMetadata || before.controllerLogGroupOwned === true && after.controllerLogGroupOwned === true,
    controllerMetadataStable: !metaBefore || !metaAfter || maintenanceLogMetadataFingerprint(before.account, metaBefore.group, metaBefore.streams) ===
      maintenanceLogMetadataFingerprint(after.account, metaAfter.group, metaAfter.streams),
    ...(metaBefore && metaAfter ? { metadataStabilityScope: "all-selected-fields-except-continuation-and-deprecated-sequence-tokens",
      rawControllerMetadataStable: hash(metaBefore) === hash(metaAfter),
      deprecatedSequenceTokensChanged: hash(metaBefore.streams.logStreams.map((entry: Json) => entry.uploadSequenceToken ?? null)) !==
        hash(metaAfter.streams.logStreams.map((entry: Json) => entry.uploadSequenceToken ?? null)), tokenValuesPrinted: false } : {}) };
  if (!comparison.readComparisonComplete) fail("BASELINE_UNVERIFIED");
  const stable = comparison.requestScopesUnchanged && comparison.fullReferencesStable && comparison.controllerGroupOwnerStable && comparison.controllerMetadataStable;
  const decisionCounts = { allowed: 0, implicitDeny: 0, explicitDeny: 0, unverified: 0 };
  for (const result of results) decisionCounts[result.observedDecision as keyof typeof decisionCounts]++;
  if (mode === "baseline-comparison") return { ...plan, mode: "read-only-existing-reference-baseline", awsCalls: calls,
    completed: true, stable, comparison, permissionDecisionsObserved: false, readyForDeployment: false, rootCauseEstablished: false };
  if (!stable) {
    console.error(JSON.stringify({ mode: "maintenance-log-comparison-failure", awsCalls: calls, comparison,
      simulationObservations: results.length, decisionCounts, cloudMutations: 0, rootCauseEstablished: false, readyForDeployment: false }));
    fail("LIVE_REFERENCE_CHANGED");
  }
  if (metaAfter) maintenanceLogExistenceMatrix(after.account, metaAfter.group, metaAfter.streams);
  return { ...plan, mode: mode === "input-transport" ? "read-only-cli-input-parsing-comparison" :
    mode === "action-coverage" ? "read-only-action-coverage-comparison" : mode === "resource-existence" ?
    "read-only-existing-stream-comparison" : "read-only-log-simulator-diagnostics", awsCalls: calls,
    results, liveReferencesStableBeforeAfter: true, exactStreamObservationsComplete: results.filter(r => r.exactStreamInput).every(r => r.completeObservation),
    ...(withMetadata ? { comparison } : {}),
    ...(mode === "input-transport" ? { transportComparison: summarizeLogTransportAgreement(results) } : {}),
    ...(metaBefore ? { existingControllerMetadataStableBeforeAfter: true, logMetadataReads: 4, logMessageReads: 0, logWrites: 0 } : {}),
    actualServiceAuthorizationUnverified: true, acceptanceGateStillRequired: true };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (!args.length) console.log(JSON.stringify(maintenanceLogDiagnosticPlan()));
    else if (args.length === 1 && args[0] === "--plan-action-coverage") console.log(JSON.stringify(maintenanceLogCoveragePlan()));
    else if (args.length === 1 && args[0] === "--plan-resource-existence") console.log(JSON.stringify(maintenanceLogExistencePlan()));
    else if (args.length === 1 && args[0] === "--plan-baseline-comparison") console.log(JSON.stringify(maintenanceLogBaselinePlan()));
    else if (args.length === 1 && args[0] === "--plan-input-transport") console.log(JSON.stringify(maintenanceLogTransportPlan()));
    else if (args.length === 1 && args[0] === "--plan-policy-validation") console.log(JSON.stringify(maintenancePolicyValidationPlan()));
    else if (args.length === 1 && args[0] === "--execute-basic-policy-validation") console.log(JSON.stringify(await executeMaintenancePolicyValidation()));
    else if (args.length === 1 && args[0] === "--execute-baseline-comparison-read-only") {
      const result = executeMaintenanceLogDiagnostics("baseline-comparison"); console.log(JSON.stringify(result));
      if (!("stable" in result) || result.stable !== true) process.exitCode = 1;
    }
    else {
      if (args.length !== 1 || !["--execute-read-only", "--execute-action-coverage-read-only", "--execute-resource-existence-read-only", "--execute-input-transport-read-only"].includes(args[0])) fail("ARGUMENTS_REJECTED");
      console.log(JSON.stringify(executeMaintenanceLogDiagnostics(args[0] === "--execute-input-transport-read-only" ? "input-transport" :
        args[0] === "--execute-action-coverage-read-only" ? "action-coverage" :
        args[0] === "--execute-resource-existence-read-only" ? "resource-existence" : "resource-forms")));
    }
  } catch (error) { console.error(JSON.stringify(maintenanceLogFailurePacket(error))); process.exitCode = 1; }
}
