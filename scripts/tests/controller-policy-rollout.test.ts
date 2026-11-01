import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { test } from "node:test";
import { controllerRolloutExecuteArguments, controllerRolloutPlan, performControllerPolicyRollout,
  reviewControllerRolloutTerminal, controllerRolloutFailurePacket, withControllerRolloutLocalCleanup } from "../controller-policy-rollout.js";
import { CONTROLLER_POLICY_ID as ID, correctControllerCondition, controllerCorrectionMatrix, reviewUnchangedControllerState } from "../controller-policy-review.js";
import type { BoundaryTargets } from "../iam-boundary-proof.js";
const account = "123456789012", region = "ap-northeast-1", prefix = "global-market-ai-insight-dev";
const name = `gmai-controller-review-${"a".repeat(32)}`, id = `arn:aws:cloudformation:${region}:${account}:changeSet/${name}/unique`;
const started = Date.parse("2026-10-08T00:00:00Z"), clone = (v: any) => JSON.parse(JSON.stringify(v));
function fixture() {
  const table = `arn:aws:dynamodb:${region}:${account}:table/${prefix}-jobs`;
  const roleName = "controllerRoleTEST", roles: any = {};
  for (const kind of ["controller", "worker", "execution"]) roles[kind] = { name: `${kind}RoleTEST`, arn: `arn:aws:iam::${account}:role/${kind}RoleTEST`, policy: ID, trust: {} };
  const t: BoundaryTargets = { account, table, roles, cluster: `arn:aws:ecs:${region}:${account}:cluster/${prefix}-worker`,
    task: `arn:aws:ecs:${region}:${account}:task-definition/${prefix}-worker:9`, secret: "PRIVATE_SENTINEL", model: "PRIVATE_SENTINEL" };
  const policy = { Version: "2012-10-17", Statement: [{ Effect: "Allow", Action: "dynamodb:ConditionCheckItem", Resource: table,
    Condition: { "ForAllValues:StringLike": { "dynamodb:LeadingKeys": ["control_circuit"] }, Null: { "dynamodb:LeadingKeys": "false" },
      "ForAnyValue:StringEquals": { "dynamodb:EnclosingOperation": ["TransactWriteItems"] } } }] };
  const live: any = { Resources: {
    [ID]: { Type: "AWS::IAM::Policy", Properties: { PolicyName: ID, Roles: [{ Ref: "ControllerRole10B665F1" }], PolicyDocument: policy } },
    ControllerFunctionC25B79B1: { Type: "AWS::Lambda::Function", Properties: { Environment: { Variables: { ENABLE_PROVIDER_BACKED_JOBS: "false", ENABLE_LIVE_RESULT_DISPLAY: "false" } } } },
    WorkerTaskDefinition8AD2CCFF: { Type: "AWS::ECS::TaskDefinition", Properties: { ContainerDefinitions: [{ User: "65532:65532", ReadonlyRootFilesystem: true }] } },
  } };
  for (let n = 0; n < 23; n++) live.Resources[`Fixed${n}`] = { Type: "AWS::Logs::LogGroup" };
  const proposed = clone(live), proposedPolicy = correctControllerCondition(policy, table); proposed.Resources[ID].Properties.PolicyDocument = proposedPolicy;
  const before: any = { t, live, proposed, exactTable: table, policy: { PolicyDocument: policy }, proposedPolicy, fingerprint: "stable",
    foundation: {}, role: {}, captured: { reads: [], computeResources: { StackResourceSummaries: [] } } };
  const stack: any = { StackName: `${prefix}-compute`, StackId: `arn:aws:cloudformation:${region}:${account}:stack/${prefix}-compute/unique`,
    StackStatus: "UPDATE_COMPLETE", DisableRollback: false, RoleARN: `arn:aws:iam::${account}:role/cdk-hnb659fds-cfn-exec-role-${account}-${region}`,
    Parameters: [{ ParameterKey: "BootstrapVersion", ParameterValue: "/cdk-bootstrap/hnb659fds/version", ResolvedValue: "30" }], Tags: [], NotificationARNs: [], RollbackConfiguration: {} };
  const context = (PolicyDocument: any) => JSON.stringify({ Type: "AWS::IAM::Policy", Properties: { Roles: [roleName], PolicyName: ID, PolicyDocument } });
  const draft: any = { StackName: stack.StackName, StackId: stack.StackId, ChangeSetName: name, ChangeSetId: id,
    CreationTime: new Date(started).toISOString(), Status: "CREATE_COMPLETE", ExecutionStatus: "AVAILABLE", IncludeNestedStacks: false,
    Parameters: clone(stack.Parameters), Tags: [], NotificationARNs: [], RollbackConfiguration: {}, Changes: [{ Type: "Resource", ResourceChange: {
      LogicalResourceId: ID, ResourceType: "AWS::IAM::Policy", Action: "Modify", Replacement: "False", Scope: ["Properties"],
      Details: [{ Evaluation: "Static", ChangeSource: "DirectModification", Target: { Attribute: "Properties", Name: "PolicyDocument", RequiresRecreation: "Never" } }],
      BeforeContext: context(policy), AfterContext: context(proposedPolicy) } }] };
  let executed = false, removed = false, snapshots = 0, clock = started, postReads = 0;
  const calls: string[] = [], cases = controllerCorrectionMatrix(t);
  const io = { now: () => clock, sleep: async (ms: number) => { clock += ms; }, candidate: () => resolve("PRIVATE_SENTINEL.json"), assertCandidate: () => {},
    snapshot: (baseline?: any) => { snapshots++; if (baseline) { postReads++; return { report: { exactAppliedPolicyVerified: true } }; } return clone(before); },
    query: (service: string, action: string, args: string[]) => {
      calls.push(`${service}.${action}`);
      if (action === "describe-stacks") return { Stacks: [executed ? { ...stack, ChangeSetId: id, LastUpdatedTime: new Date(clock).toISOString() } : clone(stack)] };
      if (action === "simulate-custom-policy") {
        const item = cases[calls.filter(c => c === "iam.simulate-custom-policy").length - 1];
        return { IsTruncated: false, EvaluationResults: [{ EvalActionName: item.action, EvalResourceName: item.resource, EvalDecision: item.expected,
          MissingContextValues: [], ResourceSpecificResults: [{ EvalResourceName: item.resource, EvalResourceDecision: item.expected, MissingContextValues: [] }] }] };
      }
      if (action === "create-change-set") return { StackId: stack.StackId, Id: id };
      if (action === "describe-change-set") return removed ? { absent: true } : { ...clone(draft), ExecutionStatus: executed ? "EXECUTE_COMPLETE" : "AVAILABLE" };
      if (action === "get-template") return { TemplateBody: clone(proposed), StagesAvailable: ["Original"] };
      if (action === "execute-change-set") { executed = true; return {}; }
      if (action === "delete-change-set") { removed = true; return {}; }
      throw Error("UNEXPECTED_OPERATION");
    },
  };
  return { io, calls, stack, draft, before, postReads: () => postReads, snapshots: () => snapshots };
}
test("default/import has zero AWS side effects, rejects generic deployment and activation flags", () => {
  const p = controllerRolloutPlan(); assert.equal(p.awsCalls, 0); assert.equal(p.changeSetsExecutedMax, 1); assert.equal(p.rollbackRequired, true);
  for (const args of [["--execute"], ["--enable-jobs"], ["--deploy"], ["--execute-one-reviewed-update"]]) assert.throws(() => controllerRolloutPlan(args));
  const r = spawnSync(process.execPath, [resolve("node_modules/tsx/dist/cli.mjs"), resolve("scripts/controller-policy-rollout.ts")], { encoding: "utf8", timeout: 10_000,
    env: { ...process.env, AWS_PROFILE: "PRIVATE_SENTINEL", GMAI_AWS_CLI_PATH: "PRIVATE_SENTINEL" } });
  assert.equal(r.status, 0); assert.equal(JSON.parse(r.stdout).awsCalls, 0); assert.equal(r.stderr, "");
});
test("execute arguments require exact fresh owner and explicitly retain automatic rollback", () => {
  const f = fixture(), args = controllerRolloutExecuteArguments(id, account, name, f.stack);
  assert.ok(args.includes("--no-disable-rollback")); assert.equal(args.includes("--disable-rollback"), false);
  for (const bad of [id.replace(account, "999999999999"), id + "/foreign", id.replace(name, name + "foreign")])
    assert.throws(() => controllerRolloutExecuteArguments(bad, account, name, f.stack));
  assert.throws(() => controllerRolloutExecuteArguments(id, account, name, { ...f.stack, DisableRollback: true }));
});
test("terminal state must belong to this exact execution, not a stale healthy stack", () => {
  const f = fixture(), v = { Stacks: [{ ...f.stack, ChangeSetId: id, LastUpdatedTime: new Date(started).toISOString() }] };
  assert.equal(reviewControllerRolloutTerminal(f.stack, v, id, started, started), "updated");
  for (const change of [{ ChangeSetId: "foreign" }, { LastUpdatedTime: new Date(started - 2000).toISOString() }, { DisableRollback: true },
    { StackStatus: "UPDATE_IN_PROGRESS" }, { RoleARN: "foreign" }, { Outputs: [] }])
    assert.throws(() => reviewControllerRolloutTerminal(f.stack, { Stacks: [{ ...v.Stacks[0], ...change }] }, id, started, started));
});
test("fresh exclusive update runs once, checks 15 simulations and verifies independent post-state", async () => {
  const f = fixture(), p = await performControllerPolicyRollout(f.io, name);
  assert.equal(p.postUpdateIndependentlyVerified, true); assert.equal(p.proposedSimulationsVerified, 15); assert.equal(f.postReads(), 1);
  assert.equal(f.calls.filter(c => c === "cloudformation.execute-change-set").length, 1);
  assert.equal(f.calls.filter(c => c === "cloudformation.create-change-set").length, 1);
  assert.equal(f.calls.includes("cloudformation.delete-change-set"), false);
  assert.equal(JSON.stringify(p).includes("PRIVATE_SENTINEL"), false);
});
test("ambiguous execution acknowledgement is reconciled without resubmission", async () => {
  const f = fixture(), original = f.io.query;
  f.io.query = (s, a, args) => { const v = original(s, a, args); if (a === "execute-change-set") throw Error("timeout"); return v; };
  assert.equal((await performControllerPolicyRollout(f.io, name)).postUpdateIndependentlyVerified, true);
  assert.equal(f.calls.filter(c => c === "cloudformation.execute-change-set").length, 1);
});
test("bad proposed simulation cannot create a change set or mutate IAM", async () => {
  const f = fixture(), original = f.io.query;
  f.io.query = (s, a, args) => a === "simulate-custom-policy" ? {} : original(s, a, args);
  await assert.rejects(performControllerPolicyRollout(f.io, name));
  assert.equal(f.calls.some(c => /create-change-set|execute-change-set/.test(c)), false);
});
test("extra delta, stale policy and drift stop before execution and remove only owned draft", async () => {
  for (const mode of ["extra-delta", "context", "snapshot", "candidate", "prepared"]) {
    const f = fixture(), q = f.io.query, snap = f.io.snapshot;
    if (mode === "extra-delta") f.draft.Changes.push(clone(f.draft.Changes[0]));
    if (mode === "context") f.draft.Changes[0].ResourceChange.AfterContext = "{}";
    if (mode === "snapshot") { let count = 0; f.io.snapshot = b => { const v = snap(b); return ++count === 2 ? { ...v, fingerprint: "changed" } : v; }; }
    if (mode === "candidate") f.io.assertCandidate = () => { throw Error("changed"); };
    if (mode === "prepared") f.io.query = (s, a, args) => a === "get-template" ? { TemplateBody: {}, StagesAvailable: ["Original"] } : q(s, a, args);
    await assert.rejects(performControllerPolicyRollout(f.io, name));
    assert.equal(f.calls.includes("cloudformation.execute-change-set"), false); assert.equal(f.calls.includes("cloudformation.delete-change-set"), true);
  }
});
test("ambiguous create acknowledgement still inspects and deletes exact owned unexecuted draft", async () => {
  const f = fixture(), q = f.io.query;
  f.io.query = (s, a, args) => { const v = q(s, a, args); if (a === "create-change-set") throw Error("timeout"); return v; };
  await assert.rejects(performControllerPolicyRollout(f.io, name));
  assert.equal(f.calls.filter(c => c === "cloudformation.create-change-set").length, 1);
  assert.equal(f.calls.filter(c => c === "cloudformation.delete-change-set").length, 1);
  assert.equal(f.calls.includes("cloudformation.execute-change-set"), false);
});
test("foreign cleanup identity and unverified post-state cannot become success", async () => {
  const f = fixture(), q = f.io.query;
  f.io.query = (s, a, args) => { const v = q(s, a, args); if (a === "describe-change-set") v.StackId = "foreign"; return v; };
  await assert.rejects(performControllerPolicyRollout(f.io, name)); assert.equal(f.calls.includes("cloudformation.delete-change-set"), false);
  const g = fixture(), snap = g.io.snapshot;
  g.io.snapshot = b => { if (b) throw Error("poststate unverified"); return snap(b); };
  await assert.rejects(performControllerPolicyRollout(g.io, name)); assert.equal(g.calls.filter(c => c === "cloudformation.execute-change-set").length, 1);
});
test("verified automatic rollback is failure, not rollout success or permission to launch jobs", async () => {
  const f = fixture(), q = f.io.query, snap = f.io.snapshot;
  f.io.query = (s, a, args) => { const v = q(s, a, args); if (a === "describe-stacks" && v.Stacks[0].ChangeSetId === id) v.Stacks[0].StackStatus = "UPDATE_ROLLBACK_COMPLETE"; return v; };
  f.io.snapshot = ((baseline?: any, cleanup?: boolean, rollback?: any) => rollback ? { originalPolicyRestored: true, runtimeAndCircuitRestored: true } : snap(baseline)) as typeof f.io.snapshot;
  await assert.rejects(performControllerPolicyRollout(f.io, name), /UPDATE_ROLLED_BACK/);
  assert.equal(f.calls.filter(c => c === "cloudformation.execute-change-set").length, 1);
  assert.equal(f.calls.includes("cloudformation.delete-change-set"), false);
});
test("a nonterminal or old execution is bounded and never retried or deleted as a draft", async () => {
  const f = fixture(), q = f.io.query;
  f.io.query = (s, a, args) => { const v = q(s, a, args); if (a === "describe-stacks" && v.Stacks[0].ChangeSetId === id) v.Stacks[0].StackStatus = "UPDATE_IN_PROGRESS"; return v; };
  await assert.rejects(performControllerPolicyRollout(f.io, name), /RECONCILIATION_UNVERIFIED/);
  assert.equal(f.calls.filter(c => c === "cloudformation.execute-change-set").length, 1);
  assert.equal(f.calls.filter(c => c === "cloudformation.describe-stacks").length, 26);
  assert.equal(f.calls.includes("cloudformation.delete-change-set"), false);
});
test("definitively unstarted execution is not retried and only its unchanged owned draft is removed", async () => {
  const f = fixture(), q = f.io.query;
  f.io.query = (s, a, args) => { if (a === "execute-change-set") { f.calls.push(`${s}.${a}`); throw Error("not accepted"); } return q(s, a, args); };
  await assert.rejects(performControllerPolicyRollout(f.io, name), /EXECUTION_NOT_STARTED/);
  assert.equal(f.calls.filter(c => c === "cloudformation.execute-change-set").length, 1);
  assert.equal(f.calls.filter(c => c === "cloudformation.delete-change-set").length, 1);
});

test("terminal review failure survives the final reconciliation failure without a mutation retry", async () => {
  const f = fixture(), q = f.io.query;
  f.io.query = (s, a, args) => {
    const v = q(s, a, args);
    if (a === "describe-stacks" && v.Stacks[0].ChangeSetId === id) v.Stacks[0].RoleARN = "PRIVATE_SENTINEL";
    return v;
  };
  await assert.rejects(performControllerPolicyRollout(f.io, name), error => {
    const p = controllerRolloutFailurePacket(error);
    assert.deepEqual(p.primaryFailure, { stage: "terminal-stack-review", code: "CONTROLLER_ROLLOUT_TERMINAL_UNBOUND" });
    assert.deepEqual(p.cleanupFailure, { stage: "final-reconciliation", code: "CONTROLLER_ROLLOUT_RECONCILIATION_UNVERIFIED" });
    assert.equal(p.reconciliationAttempted, true); assert.equal(p.reconciliationVerified, false);
    assert.equal(p.independentSafeStopRequired, true); assert.equal(p.readyForLiveJobs, false);
    assert.equal(JSON.stringify(p).includes("PRIVATE_SENTINEL"), false); return true;
  });
  assert.equal(f.calls.filter(v => v === "cloudformation.execute-change-set").length, 1);
  assert.equal(f.calls.includes("cloudformation.delete-change-set"), false);
  assert.equal(f.postReads(), 0);
});

test("post-state drift identifies its own stage and is not overwritten or called an applied pass", async () => {
  const f = fixture(), snap = f.io.snapshot;
  f.io.snapshot = b => { if (b) throw new Error("CONTROLLER_POLICY_POST_UPDATE_DRIFT"); return snap(b); };
  await assert.rejects(performControllerPolicyRollout(f.io, name), error => {
    const p = controllerRolloutFailurePacket(error);
    assert.deepEqual(p.primaryFailure, { stage: "applied-state-review", code: "CONTROLLER_POLICY_POST_UPDATE_DRIFT" });
    assert.equal(p.cleanupFailure?.code, "CONTROLLER_ROLLOUT_RECONCILIATION_UNVERIFIED");
    assert.equal(p.executionOutcome, "updated"); // terminal observation, not complete reconciliation
    assert.equal(p.reconciliationVerified, false); assert.equal(p.readyForPublication, false); return true;
  });
  assert.equal(f.calls.filter(v => v === "cloudformation.execute-change-set").length, 1);
});

test("final history failure after verified post-state is still a failure with no fabricated primary error", async () => {
  const f = fixture(), q = f.io.query;
  f.io.query = (s, a, args) => {
    const v = q(s, a, args);
    if (a === "describe-change-set" && v.ExecutionStatus === "EXECUTE_COMPLETE") v.StackId = "PRIVATE_SENTINEL";
    return v;
  };
  await assert.rejects(performControllerPolicyRollout(f.io, name), error => {
    const p = controllerRolloutFailurePacket(error);
    assert.equal(p.primaryFailure, null);
    assert.deepEqual(p.cleanupFailure, { stage: "execution-history", code: "CONTROLLER_ROLLOUT_EXECUTION_HISTORY_UNVERIFIED" });
    assert.equal(p.reconciliationVerified, true); assert.equal(p.terminalHistoryVerified, false);
    assert.equal(p.independentSafeStopRequired, true); return true;
  });
});

test("pre-execution failure and separate owned-draft cleanup failure both remain visible", async () => {
  const f = fixture(), q = f.io.query;
  f.io.query = (s, a, args) => {
    const v = q(s, a, args);
    if (a === "create-change-set") return { ...v, StackId: "PRIVATE_SENTINEL" };
    if (a === "describe-change-set") return { ...v, StackId: "PRIVATE_SENTINEL" };
    return v;
  };
  await assert.rejects(performControllerPolicyRollout(f.io, name), error => {
    const p = controllerRolloutFailurePacket(error);
    assert.equal(p.primaryFailure?.code, "CONTROLLER_ROLLOUT_CREATE_ACK_INVALID");
    assert.equal(p.cleanupFailure?.stage, "draft-cleanup"); assert.equal(p.createAttempted, true);
    assert.equal(p.executeAttempted, false); assert.equal(p.draftAbsenceVerified, false); return true;
  });
  assert.equal(f.calls.includes("cloudformation.execute-change-set"), false);
  assert.equal(f.calls.includes("cloudformation.delete-change-set"), false);
});

test("ambiguous execution is recorded separately when later independent reconciliation fails", async () => {
  const f = fixture(), q = f.io.query;
  f.io.query = (s, a, args) => { const v = q(s, a, args); if (a === "execute-change-set") throw new Error("PRIVATE_SENTINEL"); return v; };
  f.io.snapshot = b => { if (b) throw new Error("PRIVATE_SENTINEL"); return clone(f.before); };
  await assert.rejects(performControllerPolicyRollout(f.io, name), error => {
    const p = controllerRolloutFailurePacket(error);
    assert.equal(p.executionAcknowledgementAmbiguous, true); assert.equal(p.executeAttempted, true);
    assert.equal(p.primaryFailure?.stage, "applied-state-review");
    assert.equal(p.primaryFailure?.code, "CONTROLLER_ROLLOUT_INCOMPLETE");
    assert.equal(JSON.stringify(p).includes("PRIVATE_SENTINEL"), false); return true;
  });
  assert.equal(f.calls.filter(v => v === "cloudformation.execute-change-set").length, 1);
});

test("private temporary cleanup failure preserves both prior cloud error facts and remains non-success", async () => {
  const f = fixture(), q = f.io.query; let cleanups = 0;
  f.io.query = (s, a, args) => {
    const v = q(s, a, args);
    if (a === "describe-stacks" && v.Stacks[0].ChangeSetId === id) v.Stacks[0].RoleARN = "PRIVATE_SENTINEL";
    return v;
  };
  await assert.rejects(withControllerRolloutLocalCleanup(() => performControllerPolicyRollout(f.io, name), () => {
    cleanups++; throw new Error("CONTROLLER_ROLLOUT_TEMP_CLEANUP_UNVERIFIED");
  }), error => {
    const p = controllerRolloutFailurePacket(error);
    assert.equal(p.primaryFailure?.code, "CONTROLLER_ROLLOUT_TERMINAL_UNBOUND");
    assert.equal(p.cleanupFailure?.code, "CONTROLLER_ROLLOUT_RECONCILIATION_UNVERIFIED");
    assert.deepEqual(p.localCleanupFailure, { stage: "local-temp-cleanup", code: "CONTROLLER_ROLLOUT_TEMP_CLEANUP_UNVERIFIED" });
    assert.equal(p.privateCandidateRemoved, false); assert.equal(p.readyForLiveJobs, false); return true;
  });
  assert.equal(cleanups, 1);
});

test("successful private cleanup does not turn a failed cloud operation into success", async () => {
  let cleanups = 0;
  await assert.rejects(withControllerRolloutLocalCleanup(async () => { throw new Error("PRIVATE_SENTINEL"); }, () => { cleanups++; }), error => {
    const p = controllerRolloutFailurePacket(error);
    assert.equal(p.error, "CONTROLLER_ROLLOUT_INCOMPLETE"); assert.equal(p.privateCandidateRemoved, true);
    assert.equal(p.localCleanupFailure, null); assert.equal(p.mutationAttemptsKnown, false); return true;
  });
  assert.equal(cleanups, 1);
  assert.deepEqual(await withControllerRolloutLocalCleanup(async () => ({ mode: "synthetic-success" }), () => {}), { mode: "synthetic-success" });
});

test("local cleanup failure cannot leak raw error fields or retain an operation success packet", async () => {
  await assert.rejects(withControllerRolloutLocalCleanup(async () => ({ secret: "PRIVATE_SENTINEL", readyForLiveJobs: true }), () => {
    throw new Error("PRIVATE_SENTINEL", { cause: { token: "PRIVATE_SENTINEL" } });
  }), error => {
    const p = controllerRolloutFailurePacket(error);
    assert.equal(p.primaryFailure, null); assert.equal(p.localCleanupFailure?.stage, "local-temp-cleanup");
    assert.equal(p.privateCandidateRemoved, false); assert.equal(p.readyForLiveJobs, false);
    assert.equal(JSON.stringify(p).includes("PRIVATE_SENTINEL"), false); return true;
  });
});

test("error packet allowlist rejects private-looking fake codes, raw payloads and throwing getters", () => {
  const badGetter = new Error(); Object.defineProperty(badGetter, "message", { get() { throw new Error("PRIVATE_SENTINEL"); } });
  for (const error of [new Error("CONTROLLER_ROLLOUT_PRIVATE_SENTINEL"), new Error("CONTROLLER_POLICY_PRIVATE_SENTINEL"),
    new Error("PRIVATE_SENTINEL", { cause: { token: "PRIVATE_SENTINEL" } }), { message: "PRIVATE_SENTINEL" }, badGetter, null]) {
    const p = controllerRolloutFailurePacket(error);
    assert.equal(p.error, "CONTROLLER_ROLLOUT_INCOMPLETE");
    assert.equal(JSON.stringify(p).includes("PRIVATE_SENTINEL"), false); assert.equal(p.mutationAttemptsKnown, false);
  }
});

test("CLI rejected flag emits a sanitized failure packet and a nonzero exit without AWS access", () => {
  const r = spawnSync(process.execPath, [resolve("node_modules/tsx/dist/cli.mjs"), resolve("scripts/controller-policy-rollout.ts"), "--enable-jobs"], {
    encoding: "utf8", timeout: 10_000, env: { ...process.env, AWS_PROFILE: "PRIVATE_SENTINEL", GMAI_AWS_CLI_PATH: "PRIVATE_SENTINEL" } });
  assert.equal(r.status, 1); assert.equal(r.stdout, "");
  const p = JSON.parse(r.stderr); assert.equal(p.error, "CONTROLLER_ROLLOUT_ARGUMENTS_REJECTED");
  assert.equal(p.independentSafeStopRequired, true); assert.equal(r.stderr.includes("PRIVATE_SENTINEL"), false);
});

test("real strict-comparator drift details survive rollout and local cleanup wrappers", async () => {
  const f = fixture(), snap = f.io.snapshot;
  f.io.snapshot = b => {
    if (b) { const changed = clone(f.before); changed.role.privateTest = "PRIVATE_SENTINEL"; reviewUnchangedControllerState(f.before, changed); }
    return snap(b);
  };
  await assert.rejects(withControllerRolloutLocalCleanup(() => performControllerPolicyRollout(f.io, name), () => {}), error => {
    const p = controllerRolloutFailurePacket(error);
    assert.equal(p.primaryFailure?.stage, "applied-state-review");
    assert.equal(p.primaryFailure?.code, "CONTROLLER_POLICY_ORIGINAL_STATE_DRIFT");
    assert.deepEqual(p.primaryFailure?.decisionDetails, { changedScopes: ["controller-role"], fullStateComparisonPassed: false });
    assert.equal(p.cleanupFailure?.code, "CONTROLLER_ROLLOUT_RECONCILIATION_UNVERIFIED");
    assert.equal(p.privateCandidateRemoved, true); assert.equal(p.reconciliationVerified, false);
    assert.equal(JSON.stringify(p).includes("PRIVATE_SENTINEL"), false); return true;
  });
  assert.equal(f.calls.filter(v => v === "cloudformation.execute-change-set").length, 1);
});
