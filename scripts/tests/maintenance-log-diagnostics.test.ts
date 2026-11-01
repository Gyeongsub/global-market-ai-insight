import { test } from "node:test";
import assert from "node:assert/strict";
import { executeMaintenanceLogDiagnostics, maintenanceLogCoverageMatrix, maintenanceLogCoveragePlan,
  maintenanceLogDiagnosticMatrix, maintenanceLogDiagnosticPlan, summarizeLogDiagnostic,
  maintenancePolicyValidationPlan, buildMaintenancePolicyValidationDocuments, summarizeMaintenancePolicyValidation,
  maintenanceLogExistenceMatrix, maintenanceLogExistencePlan, maintenanceLogMetadataFingerprint, controllerDiagnosticGroupOwned,
  maintenanceLogFailurePacket, maintenanceLogBaselinePlan, summarizeDiagnosticReadChanges,
  maintenanceLogTransportMatrix, maintenanceLogTransportArguments, maintenanceLogTransportPlan,
  summarizeLogTransportAgreement } from "../maintenance-log-diagnostics.js";
const matrix = maintenanceLogDiagnosticMatrix("123456789012"), item = matrix[0];
const reply = () => ({ IsTruncated: false, EvaluationResults: [{ EvalActionName: item.action, EvalDecision: "allowed",
  ResourceSpecificResults: [{ EvalResourceName: item.resource, EvalResourceDecision: "allowed" }] }] });

const controllerGroupName = "/aws/lambda/global-market-ai-insight-dev-controller";
const controllerGroupArn = `arn:aws:logs:ap-northeast-1:123456789012:log-group:${controllerGroupName}`;
const existingGroup = () => ({ logGroups: [{ logGroupName: controllerGroupName, arn: `${controllerGroupArn}:*`,
  logGroupArn: controllerGroupArn, retentionInDays: 14 }] });
const existingStreams = () => {
  const logStreamName = `2026/10/12/[$LATEST]${"a".repeat(32)}`;
  return { logStreams: [{ logStreamName, arn: `${controllerGroupArn}:log-stream:${logStreamName}`, creationTime: 1791800000000 }] };
};

test("input parsing comparison stays separate, default-zero and bounded to four unattached simulations", () => {
  const p = maintenanceLogTransportPlan();
  assert.equal(p.awsCalls, 0); assert.equal(p.awsCallsMax, 36); assert.equal(p.simulationsMax, 4);
  assert.equal(p.logMetadataReadsMax, 4); assert.equal(p.logWrites, 0); assert.equal(p.logMessageReads, 0);
  assert.equal(p.inputFilesWritten, 0); assert.equal(p.wireInputsVerified, false);
  assert.equal(p.originalAcceptanceMatrixUnchanged, true); assert.equal(p.readyForDeployment, false);
  assert.equal(p.simulatorResultsAreLivePermissionProof, false);
  assert.throws(() => maintenanceLogTransportPlan(["--execute"]));
  assert.equal(maintenanceLogDiagnosticMatrix("123456789012").length, 10);
  assert.equal(maintenanceLogCoverageMatrix("123456789012").length, 8);
  assert.equal(maintenanceLogExistenceMatrix("123456789012", existingGroup(), existingStreams()).length, 6);
});

test("transport pairs have the same exact action, policy and owned resource, never a substitute acceptance", () => {
  const cases = maintenanceLogTransportMatrix("123456789012", existingGroup(), existingStreams());
  assert.deepEqual(cases.map(c => c.name), ["exact-stream-argv", "exact-stream-cli-input-json",
    "group-input-not-acceptance-argv", "group-input-not-acceptance-cli-input-json"]);
  assert.equal(cases.length, 4);
  for (let i = 0; i < cases.length; i += 2) {
    const a = cases[i], b = cases[i + 1];
    assert.equal(a.action, "logs:PutLogEvents"); assert.equal(a.resource, b.resource);
    assert.deepEqual(a.policy, b.policy); assert.equal(a.exactStream, b.exactStream);
    assert.equal(a.diagnosticOnly, true); assert.equal(a.policy.Statement[0].Resource, "*");
    const argv = maintenanceLogTransportArguments(a), json = maintenanceLogTransportArguments(b);
    assert.deepEqual(argv.slice(0, 3), ["iam", "simulate-custom-policy", "--policy-input-list"]);
    assert.deepEqual(json.slice(0, 3), ["iam", "simulate-custom-policy", "--cli-input-json"]);
    assert.deepEqual(JSON.parse(json[3]), { PolicyInputList: [argv[3]], ActionNames: [argv[5]], ResourceArns: [argv[7]] });
    assert.deepEqual(argv.slice(-2), ["--max-items", "100"]);
    assert.deepEqual(json.slice(-2), ["--max-items", "100"]);
    assert.equal(json.includes("--endpoint-url"), false); assert.equal(json.includes("--no-verify-ssl"), false);
    assert.equal(json.some(value => value.startsWith("file://")), false);
  }
});

test("structured PolicyInputList contains strings and preserves exact punctuation without a shell", () => {
  const s = existingStreams();
  s.logStreams[0].logStreamName = s.logStreams[0].logStreamName.replace("/[$LATEST]", "/global-market-ai-insight-dev-controller[$LATEST]");
  s.logStreams[0].arn = `${controllerGroupArn}:log-stream:${s.logStreams[0].logStreamName}`;
  const item = maintenanceLogTransportMatrix("123456789012", existingGroup(), s)[1];
  const input = JSON.parse(maintenanceLogTransportArguments(item)[3]);
  assert.equal(typeof input.PolicyInputList[0], "string");
  assert.deepEqual(JSON.parse(input.PolicyInputList[0]), item.policy);
  assert.equal(input.ResourceArns[0], s.logStreams[0].arn);
  assert.equal(input.ResourceArns[0].includes("[$LATEST]"), true);
});

test("transport requests reject arbitrary principals, scopes, actions, policies and transport modes", () => {
  const original = maintenanceLogTransportMatrix("123456789012", existingGroup(), existingStreams())[0];
  for (const patch of [{ transport: "other" }, { action: "iam:PassRole" }, { resource: original.resource + "-foreign" },
    { resource: original.resource.replace("ap-northeast-1", "us-east-1") }, { resource: original.resource.replace("controller", "maintenance") },
    { callerArn: "PRIVATE_SENTINEL" }, { resourceOwner: "PRIVATE_SENTINEL" }, { diagnosticOnly: false },
    { exactStream: false }, { comparisonPair: "other" }, { name: "PRIVATE_SENTINEL" },
    { policy: { Version: "2012-10-17", Statement: [{ Effect: "Allow", Action: "*", Resource: "*" }] } }]) {
    assert.throws(() => maintenanceLogTransportArguments({ ...original, ...patch } as any));
  }
});

const transportResults = () => maintenanceLogTransportMatrix("123456789012", existingGroup(), existingStreams()).map(item => ({
  ...summarizeLogDiagnostic({ IsTruncated: false, EvaluationResults: [{ EvalActionName: item.action,
    EvalDecision: item.exactStream ? "implicitDeny" : "allowed", ResourceSpecificResults: [{ EvalResourceName: item.resource,
      EvalResourceDecision: item.exactStream ? "implicitDeny" : "allowed" }] }] }, item),
  transport: item.transport, comparisonPair: item.comparisonPair,
}));

test("transport agreement reports only fixed pair labels, not live authorization or root cause", () => {
  const r = summarizeLogTransportAgreement(transportResults());
  assert.deepEqual(r.pairs, [{ pair: "exact-stream", decisionsAgree: true }, { pair: "group-input-not-acceptance", decisionsAgree: true }]);
  assert.equal(r.wireInputsVerified, false); assert.equal(r.rootCauseEstablished, false);
  assert.equal(r.readyForDeployment, false); assert.equal(r.acceptanceGateStillRequired, true);
  assert.doesNotMatch(JSON.stringify(r), /123456789012|arn:aws|\$LATEST/);
});

test("transport disagreement remains an observation, never a role grant or hidden success", () => {
  const results = transportResults(); results[1].observedDecision = "allowed";
  const r = summarizeLogTransportAgreement(results);
  assert.equal(r.pairs[0].decisionsAgree, false); assert.equal(r.pairs[1].decisionsAgree, true);
  assert.equal(r.rootCauseEstablished, false); assert.equal(r.readyForDeployment, false);
});

test("missing, reordered, duplicate and incomplete transport observations fail closed", () => {
  const original = transportResults();
  for (const value of [null, [], original.slice(1), [...original].reverse(), [original[0], original[0], original[2], original[3]]])
    assert.throws(() => summarizeLogTransportAgreement(value));
  for (const patch of [{ case: "PRIVATE_SENTINEL" }, { transport: "other" }, { comparisonPair: "other" },
    { completeObservation: false }, { diagnosticOnly: false }, { deploymentAuthorized: true }, { liveAuthorizationVerified: true },
    { exactStreamInput: false }, { observedDecision: "PRIVATE_SENTINEL" }]) {
    const values = transportResults(); values[0] = { ...values[0], ...patch } as any;
    assert.throws(() => summarizeLogTransportAgreement(values));
  }
});
test("private failure packets keep only known branded categories, never exception messages or public forged fields", () => {
  let failure: unknown; try { maintenanceLogExistenceMatrix("123", existingGroup(), existingStreams()); } catch (error) { failure = error; }
  assert.equal(maintenanceLogFailurePacket(failure).error, "MAINTENANCE_LOG_IDENTITY_INVALID");
  for (const error of [new Error("MAINTENANCE_LOG_PRIVATE_SENTINEL"), { error: "MAINTENANCE_LOG_IDENTITY_INVALID", message: "PRIVATE_SENTINEL" },
    new Proxy({}, { get: () => { throw new Error("PRIVATE_SENTINEL"); } })]) {
    const p = maintenanceLogFailurePacket(error); assert.equal(p.error, "MAINTENANCE_LOG_INCOMPLETE");
    assert.equal(JSON.stringify(p).includes("PRIVATE_SENTINEL"), false); assert.equal(p.deploymentAuthorized, false);
  }
});
test("existing-stream comparison is default-zero-call with exactly six unattached cases and four metadata reads", () => {
  const p = maintenanceLogExistencePlan();
  assert.equal(p.awsCalls, 0); assert.equal(p.awsCallsMax, 38); assert.equal(p.simulationsMax, 6);
  assert.equal(p.logMetadataReadsMax, 4); assert.equal(p.logMessageReads, 0); assert.equal(p.logWrites, 0);
  assert.equal(p.readyForDeployment, false); assert.equal(p.broadPoliciesAttached, false);
  assert.equal(p.metadataPageIsCompleteStreamInventory, false); assert.equal(p.originalAcceptanceMatrixUnchanged, true);
  assert.throws(() => maintenanceLogExistencePlan(["--execute"]));
});
test("baseline-only comparison is separate zero-call plan and never repeats permission simulations", () => {
  const p = maintenanceLogBaselinePlan(); assert.equal(p.awsCalls, 0); assert.equal(p.awsCallsMax, 32);
  assert.equal(p.simulationsMax, 0); assert.equal(p.permissionDecisionsObserved, false); assert.equal(p.readyForDeployment, false);
  assert.throws(() => maintenanceLogBaselinePlan(["--execute"]));
});
test("reference-change diagnostics preserve every response but expose only ordinal positions and booleans", () => {
  const before = Array.from({ length: 14 }, (_, i) => ({ args: ["read", String(i), "PRIVATE_SENTINEL"], value: { private: `PRIVATE_SENTINEL_${i}` } }));
  const after = structuredClone(before); after[2].value.private = "CHANGED_PRIVATE_SENTINEL";
  assert.deepEqual(summarizeDiagnosticReadChanges(before, after), { readComparisonComplete: true, requestScopesUnchanged: true, changedReadOrdinals: [3] });
  after[1].args.push("PRIVATE_OTHER_SCOPE");
  const r = summarizeDiagnosticReadChanges(before, after); assert.equal(r.requestScopesUnchanged, false);
  assert.equal(JSON.stringify(r).includes("PRIVATE"), false);
  for (const bad of [null, before.slice(1), Array(14).fill({ args: [], value: {} }), Array(14).fill({ args: ["a", "b"], value: "private" })])
    assert.equal(summarizeDiagnosticReadChanges(bad, after).readComparisonComplete, false);
});
test("existing comparison binds one returned owned stream and same-group controls without changing actions", () => {
  const cases = maintenanceLogExistenceMatrix("123456789012", existingGroup(), existingStreams());
  assert.equal(cases.length, 6); assert.equal(new Set(cases.map(c => c.name)).size, 6);
  assert.equal(cases.filter(c => c.exactStream).length, 4);
  for (const action of ["logs:CreateLogStream", "logs:PutLogEvents"]) {
    const rows = cases.filter(c => c.action === action);
    assert.deepEqual(rows.map(c => c.resource), [existingStreams().logStreams[0].arn,
      `${controllerGroupArn}:log-stream:synthetic-log-existence-control`, `${controllerGroupArn}:*`]);
    assert.ok(rows.every(c => c.policy.Statement[0].Action === action && c.policy.Statement[0].Resource === "*" && c.diagnosticOnly));
  }
});
test("Lambda custom-group names accept only the exact controller prefix, not another function or version", () => {
  const s = existingStreams();
  s.logStreams[0].logStreamName = s.logStreams[0].logStreamName.replace("/[$LATEST]", "/global-market-ai-insight-dev-controller[$LATEST]");
  s.logStreams[0].arn = `${controllerGroupArn}:log-stream:${s.logStreams[0].logStreamName}`;
  assert.equal(maintenanceLogExistenceMatrix("123456789012", existingGroup(), s).length, 6);
  for (const replace of ["foreign-controller", "global-market-ai-insight-dev-maintenance"]) {
    const bad = structuredClone(s); bad.logStreams[0].logStreamName = bad.logStreams[0].logStreamName.replace("global-market-ai-insight-dev-controller", replace);
    bad.logStreams[0].arn = `${controllerGroupArn}:log-stream:${bad.logStreams[0].logStreamName}`;
    assert.throws(() => maintenanceLogExistenceMatrix("123456789012", existingGroup(), bad), /EXISTING_STREAM_UNVERIFIED/);
  }
  const version = structuredClone(s); version.logStreams[0].logStreamName = version.logStreams[0].logStreamName.replace("$LATEST", "1");
  version.logStreams[0].arn = `${controllerGroupArn}:log-stream:${version.logStreams[0].logStreamName}`;
  assert.throws(() => maintenanceLogExistenceMatrix("123456789012", existingGroup(), version), /EXISTING_STREAM_UNVERIFIED/);
});
test("foreign or unbounded controller group metadata is rejected", () => {
  for (const mutate of [
    (v: any) => { v.logGroups[0].logGroupName += "-foreign"; },
    (v: any) => { v.logGroups[0].arn = "arn:aws:logs:us-east-1:123456789012:log-group:foreign:*"; },
    (v: any) => { v.logGroups[0].logGroupArn += ":*"; },
    (v: any) => { v.logGroups[0].retentionInDays = 365; },
    (v: any) => { v.nextToken = "PRIVATE_SENTINEL"; },
    (v: any) => { v.logGroups.push(v.logGroups[0]); },
  ]) {
    const g = existingGroup(); mutate(g);
    assert.throws(() => maintenanceLogExistenceMatrix("123456789012", g, existingStreams()), /EXISTING_GROUP_UNVERIFIED/);
  }
});
test("missing, foreign, duplicate, malformed or oversized stream metadata is rejected", () => {
  for (const mutate of [
    (v: any) => { v.logStreams = []; }, (v: any) => { v.logStreams = Array(6).fill(v.logStreams[0]); },
    (v: any) => { v.logStreams.push(v.logStreams[0]); }, (v: any) => { v.logStreams[0].creationTime = NaN; },
    (v: any) => { v.logStreams[0].arn += "-foreign"; }, (v: any) => { v.logStreams[0].logStreamName = "PRIVATE_SENTINEL"; },
    (v: any) => { v.nextToken = {}; }, (v: any) => { v.nextToken = "x".repeat(4097); },
  ]) {
    const s = existingStreams(); mutate(s);
    assert.throws(() => maintenanceLogExistenceMatrix("123456789012", existingGroup(), s), /EXISTING_STREAM_UNVERIFIED/);
  }
});
test("bounded pagination remains explicitly partial and continuation tokens do not become resource identity", () => {
  const g = existingGroup(), a = { ...existingStreams(), nextToken: "PRIVATE_A" }, b = { ...existingStreams(), nextToken: "PRIVATE_B" };
  assert.equal(maintenanceLogExistenceMatrix("123456789012", g, a).length, 6);
  assert.equal(maintenanceLogMetadataFingerprint("123456789012", g, a), maintenanceLogMetadataFingerprint("123456789012", g, b));
  assert.notEqual(maintenanceLogMetadataFingerprint("123456789012", g, a), maintenanceLogMetadataFingerprint("123456789012", g, existingStreams()));
  b.logStreams[0].creationTime++;
  assert.notEqual(maintenanceLogMetadataFingerprint("123456789012", g, a), maintenanceLogMetadataFingerprint("123456789012", g, b));
});
test("deprecated sequence tokens remain observations; all resource and other metadata fields remain mandatory", () => {
  const g = existingGroup(), a = { logStreams: [{ ...existingStreams().logStreams[0], uploadSequenceToken: "PRIVATE_A" }] },
    b = { logStreams: [{ ...existingStreams().logStreams[0], uploadSequenceToken: "PRIVATE_B" }] };
  const before = maintenanceLogMetadataFingerprint("123456789012", g, a);
  assert.equal(before, maintenanceLogMetadataFingerprint("123456789012", g, b));
  for (const patch of [{ creationTime: 1791800000001 }, { storedBytes: 1 }, { lastIngestionTime: 1791800000000 },
    { newUnknownField: "PRIVATE_CHANGED" }]) {
    const changed = { logStreams: [{ ...b.logStreams[0], ...patch }] };
    assert.notEqual(before, maintenanceLogMetadataFingerprint("123456789012", g, changed));
  }
  assert.notEqual(before, maintenanceLogMetadataFingerprint("123456789012", { logGroups: [{ ...g.logGroups[0], retentionInDays: 7 }] }, b));
  for (const token of [null, {}, "", "x".repeat(4097)]) {
    const bad = { logStreams: [{ ...b.logStreams[0], uploadSequenceToken: token }] };
    assert.throws(() => maintenanceLogMetadataFingerprint("123456789012", g, bad), /EXISTING_STREAM_UNVERIFIED/);
  }
  const foreign = { logStreams: [{ ...b.logStreams[0], arn: b.logStreams[0].arn + "-foreign" }] };
  assert.throws(() => maintenanceLogMetadataFingerprint("123456789012", g, foreign), /EXISTING_STREAM_UNVERIFIED/);
});
test("existing controller Logs group must also have unique successful Compute stack ownership", () => {
  const owned = { StackResourceSummaries: [{ ResourceType: "AWS::Logs::LogGroup", PhysicalResourceId: controllerGroupName, ResourceStatus: "CREATE_COMPLETE" }] };
  assert.equal(controllerDiagnosticGroupOwned(owned), true);
  for (const bad of [null, {}, { ...owned, NextToken: "private" }, { StackResourceSummaries: [...owned.StackResourceSummaries, ...owned.StackResourceSummaries] },
    { StackResourceSummaries: [{ ...owned.StackResourceSummaries[0], PhysicalResourceId: controllerGroupName + "-foreign" }] },
    { StackResourceSummaries: [{ ...owned.StackResourceSummaries[0], ResourceStatus: "DELETE_COMPLETE" }] }])
    assert.equal(controllerDiagnosticGroupOwned(bad), false);
});
test("actual-stream control observations never expose resource identifiers or authorize Maintenance", () => {
  for (const c of maintenanceLogExistenceMatrix("123456789012", existingGroup(), existingStreams())) {
    const v = { IsTruncated: false, EvaluationResults: [{ EvalActionName: c.action, EvalDecision: "allowed",
      MatchedStatements: [{ SourcePolicyId: "PRIVATE_SENTINEL" }], ResourceSpecificResults: [{ EvalResourceName: c.resource, EvalResourceDecision: "allowed" }] }] };
    const p = summarizeLogDiagnostic(v, c);
    assert.equal(p.completeObservation, true); assert.equal(p.deploymentAuthorized, false); assert.equal(p.liveAuthorizationVerified, false);
    for (const privateText of ["123456789012", controllerGroupName, "PRIVATE_SENTINEL"]) assert.equal(JSON.stringify(p).includes(privateText), false);
  }
});
test("log diagnosis is default zero-call and never authorizes deployment", () => {
  assert.equal(maintenanceLogDiagnosticPlan().awsCalls, 0);
  assert.equal(maintenanceLogDiagnosticPlan().readyForDeployment, false);
  for (const args of [["--execute"], ["--profile", "other"], ["--resource", "*"]]) assert.throws(() => maintenanceLogDiagnosticPlan(args));
});
test("fixed log controls retain eight exact stream inputs and two explicit non-acceptance controls", () => {
  assert.equal(matrix.length, 10); assert.equal(matrix.filter(i => i.exactStream).length, 8);
  assert.equal(new Set(matrix.map(i => i.name)).size, 10);
  assert.ok(matrix.every(i => i.diagnosticOnly));
  assert.equal(matrix.filter(i => i.callerArn).length, 2);
  assert.equal(matrix.filter(i => i.policy.Statement[0].Resource === "*").length, 2);
  for (const bad of ["000000000000", "123", "123456789012:root", " 123456789012"]) assert.throws(() => maintenanceLogDiagnosticMatrix(bad));
});

test("action coverage is a separate bounded zero-call plan, never deployment authority", () => {
  const plan = maintenanceLogCoveragePlan();
  assert.equal(plan.awsCalls, 0); assert.equal(plan.awsCallsMax, 36); assert.equal(plan.simulationsMax, 8);
  assert.equal(plan.cloudMutations, 0); assert.equal(plan.actualLogCalls, 0);
  assert.equal(plan.broadActionPoliciesAttached, false); assert.equal(plan.readyForDeployment, false);
  assert.equal(plan.originalAcceptanceMatrixUnchanged, true); assert.equal(plan.rootCauseEstablished, false);
  assert.equal(maintenanceLogDiagnosticPlan().awsCallsMax, 38);
  for (const args of [["--execute"], ["--resource", "*"], ["--action", "*"]]) assert.throws(() => maintenanceLogCoveragePlan(args));
  assert.throws(() => executeMaintenanceLogDiagnostics("PRIVATE_INVALID_MODE" as any), /ARGUMENTS_REJECTED/);
});

test("basic policy validation never creates analyzers or replaces permission acceptance", () => {
  const plan = maintenancePolicyValidationPlan();
  assert.equal(plan.awsCalls, 0); assert.equal(plan.awsCallsMax, 30); assert.equal(plan.validationsMax, 2);
  assert.equal(plan.cloudMutations, 0); assert.equal(plan.attachedPolicies, 0);
  assert.equal(plan.analyzersCreated, 0); assert.equal(plan.paidCustomPolicyChecks, 0);
  assert.equal(plan.originalExactStreamAcceptanceRequired, true); assert.equal(plan.readyForDeployment, false);
  for (const args of [["--execute"], ["--policy", "PRIVATE_SENTINEL"], ["--check-no-new-access"]]) assert.throws(() => maintenancePolicyValidationPlan(args));
});

test("basic validation rejects invalid accounts before loading or synthesizing CDK", async () => {
  // The positive full-template/control assertions share the already-required
  // real synthesis in maintenance-policy-proof.test.ts; no coverage is waived.
  for (const bad of ["000000000000", "123", "123456789012:root", " 123456789012"]) await assert.rejects(buildMaintenancePolicyValidationDocuments(bad));
});

test("zero findings are only syntax observations, never actual authorization", () => {
  const report = summarizeMaintenancePolicyValidation({ findings: [] });
  assert.equal(report.completeObservation, true); assert.equal(report.noValidationErrorsObserved, true);
  assert.deepEqual(report.findingCounts, { ERROR: 0, SECURITY_WARNING: 0, WARNING: 0, SUGGESTION: 0 });
  assert.equal(report.rootCauseEstablished, false); assert.equal(report.deploymentAuthorized, false);
  assert.equal(report.liveAuthorizationVerified, false);
});

test("findings expose only bounded counts and fixed public codes, never policy text or locations", () => {
  const make = (findingType: string, issueCode: string) => ({ findingType, issueCode, findingDetails: "PRIVATE_POLICY_AND_ACCOUNT_123456789012",
    locations: [{ path: ["PRIVATE_PATH"], span: { start: { line: 12345 } } }], learnMoreLink: "https://private.invalid/PRIVATE" });
  const report = summarizeMaintenancePolicyValidation({ findings: [make("ERROR", "INVALID_ACTION"), make("SECURITY_WARNING", "PRIVATE_SENTINEL"),
    make("WARNING", "OTHER_NEW_CODE"), make("SUGGESTION", "ANOTHER_NEW_CODE")] });
  assert.deepEqual(report.findingCounts, { ERROR: 1, SECURITY_WARNING: 1, WARNING: 1, SUGGESTION: 1 });
  assert.equal(report.knownIssueCodeCounts.INVALID_ACTION, 1); assert.equal(report.otherIssueCodeCount, 3);
  assert.equal(report.noValidationErrorsObserved, false); assert.equal(report.deploymentAuthorized, false);
  for (const privateValue of ["PRIVATE", "123456789012", "12345", "OTHER_NEW_CODE", "private.invalid"]) assert.ok(!JSON.stringify(report).includes(privateValue));
});

test("paginated, partial, malformed and oversized policy validation never becomes a clean check", () => {
  const finding = { findingType: "ERROR", issueCode: "INVALID_ACTION", findingDetails: "private", locations: [] };
  for (const response of [null, [], {}, { findings: [], nextToken: "" }, { findings: [], nextToken: "PRIVATE_TOKEN" },
    { findings: [], IsTruncated: true }, { findings: Array(101).fill(finding) }, { findings: [null] },
    { findings: [{ ...finding, findingType: "allowed" }] }, { findings: [{ ...finding, issueCode: "private-string" }] },
    { findings: [{ ...finding, findingDetails: "x".repeat(16_385) }] }, { findings: [{ ...finding, locations: "private" }] }]) {
    assert.throws(() => summarizeMaintenancePolicyValidation(response), /VALIDATION_RESPONSE_INCOMPLETE/);
  }
});

test("action coverage retains exact evaluated actions and identical stream for all six controls", () => {
  const coverage = maintenanceLogCoverageMatrix("123456789012");
  assert.equal(coverage.length, 8); assert.equal(new Set(coverage.map(c => c.name)).size, 8);
  assert.equal(coverage.filter(c => c.exactStream).length, 6);
  for (const action of ["logs:CreateLogStream", "logs:PutLogEvents"]) {
    const controls = coverage.filter(c => c.action === action);
    assert.equal(controls.length, 3);
    assert.deepEqual(controls.map(c => c.policy.Statement[0].Action), [action, "logs:*", "*"]);
    assert.deepEqual(controls.map(c => c.policy.Statement[0].Resource), ["*", item.resource, item.resource]);
    assert.ok(controls.every(c => c.resource === item.resource && c.diagnosticOnly && !c.callerArn));
  }
  const independent = coverage.filter(c => !c.exactStream);
  assert.deepEqual(independent.map(c => c.action), ["logs:CreateLogGroup", "dynamodb:GetItem"]);
  assert.ok(independent.every(c => c.policy.Statement[0].Action === c.action && c.policy.Statement[0].Resource === "*"));
  for (const bad of ["000000000000", "123", "123456789012:root", " 123456789012"]) assert.throws(() => maintenanceLogCoverageMatrix(bad));
  assert.equal(maintenanceLogDiagnosticMatrix("123456789012").length, 10);
});

test("broad unattached control allows and independent sentinel allows are only observations", () => {
  for (const control of maintenanceLogCoverageMatrix("123456789012")) {
    const value = { IsTruncated: false, EvaluationResults: [{ EvalActionName: control.action, EvalDecision: "allowed",
      MatchedStatements: [{ SourcePolicyId: "PRIVATE_STATEMENT_SENTINEL" }],
      ResourceSpecificResults: [{ EvalResourceName: control.resource, EvalResourceDecision: "allowed" }] }] };
    const report = summarizeLogDiagnostic(value, control);
    assert.equal(report.completeObservation, true); assert.equal(report.observedDecision, "allowed");
    assert.equal(report.liveAuthorizationVerified, false); assert.equal(report.deploymentAuthorized, false);
    assert.equal(report.decisionEvidence?.rootCauseEstablished, false);
    assert.ok(!JSON.stringify(report).includes("PRIVATE")); assert.ok(!JSON.stringify(report).includes("123456789012"));
  }
});

test("wildcard actions/resources in replies cannot be substituted for exact coverage inputs", () => {
  const control = maintenanceLogCoverageMatrix("123456789012")[2];
  for (const mutate of [
    (v: any) => { v.EvaluationResults[0].EvalActionName = "logs:*"; },
    (v: any) => { v.EvaluationResults[0].EvalActionName = "*"; },
    (v: any) => { v.EvaluationResults[0].ResourceSpecificResults[0].EvalResourceName = "*"; },
    (v: any) => { v.EvaluationResults[0].ResourceSpecificResults[0].EvalResourceName = control.resource.split(":log-stream:")[0]; },
  ]) {
    const value: any = reply(); mutate(value);
    const report = summarizeLogDiagnostic(value, control);
    assert.equal(report.completeObservation, false); assert.equal(report.observedDecision, "unverified");
    assert.equal(report.decisionEvidence, null); assert.equal(report.deploymentAuthorized, false);
  }
});
test("complete exact-resource observations stay diagnostic rather than approval", () => {
  const r = summarizeLogDiagnostic(reply(), item);
  assert.equal(r.completeObservation, true); assert.equal(r.observedDecision, "allowed");
  assert.equal(r.liveAuthorizationVerified, false); assert.equal(r.deploymentAuthorized, false);
  assert.ok(!JSON.stringify(r).includes("123456789012"));
});
test("a genuine denial is reported without becoming missing-input evidence", () => {
  const value = reply(); value.EvaluationResults[0].EvalDecision = "implicitDeny";
  value.EvaluationResults[0].ResourceSpecificResults[0].EvalResourceDecision = "implicitDeny";
  assert.equal(summarizeLogDiagnostic(value, item).observedDecision, "implicitDeny");
});

test("optional simulator evidence reports only bounded counts and typed booleans", () => {
  const value: any = reply(), aggregate = value.EvaluationResults[0], exact = aggregate.ResourceSpecificResults[0];
  aggregate.MatchedStatements = [{ SourcePolicyId: "PRIVATE_POLICY_SENTINEL", StartPosition: { Line: 1234 } }];
  exact.MatchedStatements = [];
  aggregate.OrganizationsDecisionDetail = { AllowedByOrganizations: false, private: "PRIVATE_SENTINEL" };
  aggregate.PermissionsBoundaryDecisionDetail = { AllowedByPermissionsBoundary: true };
  exact.PermissionsBoundaryDecisionDetail = { AllowedByPermissionsBoundary: false };
  aggregate.EvalDecisionDetails = { "PRIVATE_SENTINEL": "allowed" };
  const report = summarizeLogDiagnostic(value, item);
  assert.deepEqual(report.decisionEvidence, { aggregateMatchedStatementCount: 1, exactResourceMatchedStatementCount: 0,
    aggregateOrganizationsAllowed: false, aggregatePermissionsBoundaryAllowed: true,
    exactResourcePermissionsBoundaryAllowed: false, rootCauseEstablished: false });
  assert.ok(!JSON.stringify(report).includes("PRIVATE"));
  assert.ok(!JSON.stringify(report).includes("1234"));
  assert.equal(report.deploymentAuthorized, false);
});

test("missing, malformed and excessive optional fields remain unknown, not cleared", () => {
  const missing = summarizeLogDiagnostic(reply(), item).decisionEvidence;
  assert.deepEqual(missing, { aggregateMatchedStatementCount: null, exactResourceMatchedStatementCount: null,
    aggregateOrganizationsAllowed: null, aggregatePermissionsBoundaryAllowed: null,
    exactResourcePermissionsBoundaryAllowed: null, rootCauseEstablished: false });
  for (const invalid of ["true", 1, {}, [], null]) {
    const value: any = reply(), aggregate = value.EvaluationResults[0], exact = aggregate.ResourceSpecificResults[0];
    aggregate.OrganizationsDecisionDetail = { AllowedByOrganizations: invalid };
    aggregate.PermissionsBoundaryDecisionDetail = { AllowedByPermissionsBoundary: invalid };
    exact.PermissionsBoundaryDecisionDetail = { AllowedByPermissionsBoundary: invalid };
    aggregate.MatchedStatements = Array(101).fill({ private: "PRIVATE_SENTINEL" });
    exact.MatchedStatements = "PRIVATE_SENTINEL";
    assert.deepEqual(summarizeLogDiagnostic(value, item).decisionEvidence, missing);
  }
});

test("incomplete decision observations discard even otherwise valid optional evidence", () => {
  const value: any = reply();
  value.IsTruncated = true;
  value.EvaluationResults[0].MatchedStatements = [];
  value.EvaluationResults[0].OrganizationsDecisionDetail = { AllowedByOrganizations: true };
  const report = summarizeLogDiagnostic(value, item);
  assert.equal(report.decisionEvidence, null);
  assert.equal(report.observedDecision, "unverified");
});
test("partial, substituted, mismatched and missing-context responses are unverified", () => {
  for (const mutate of [
    (v: any) => { v.IsTruncated = true; }, (v: any) => { v.Marker = "private-marker"; },
    (v: any) => { v.EvaluationResults.push(v.EvaluationResults[0]); },
    (v: any) => { v.EvaluationResults[0].MissingContextValues = ["private-context"]; },
    (v: any) => { v.EvaluationResults[0].ResourceSpecificResults[0].EvalResourceName += ":*"; },
    (v: any) => { v.EvaluationResults[0].ResourceSpecificResults[0].EvalResourceDecision = "implicitDeny"; },
    (v: any) => { v.EvaluationResults[0].ResourceSpecificResults = []; },
    (v: any) => { v.EvaluationResults[0].EvalActionName = "logs:DeleteLogGroup"; },
  ]) { const value = reply(); mutate(value); const r = summarizeLogDiagnostic(value, item);
    assert.equal(r.completeObservation, false); assert.equal(r.observedDecision, "unverified"); }
  assert.equal(summarizeLogDiagnostic(null, item).completeObservation, false);
});
