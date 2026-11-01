import assert from "node:assert/strict";
import test from "node:test";
import { rehearseSyntheticRole, type SyntheticRoleExercise, type SyntheticExpiryExercise, type SyntheticBrowserExercise } from "../synthetic-role-rehearsal.js";
import { syntheticRoleDraftTags, syntheticRoleTemplateExpected } from "../synthetic-role-template-review.js";
import { SYNTHETIC_LAB_ROLE_NAME, syntheticRoleTrust } from "../../shared/security/synthetic-lab-policy.js";
import type { DraftCall } from "../synthetic-role-draft.js";

const account = "123456789012", nonce = "d".repeat(32), name = `gmai-synthetic-role-${nonce}`;
const identity = { Account: account, Arn: `arn:aws:iam::${account}:user/aws-admin-user`, UserId: `AIDA${"X".repeat(17)}` };
const start = Date.parse("2026-10-28T00:00:00.000Z");
const stackId = `arn:aws:cloudformation:ap-northeast-1:${account}:stack/${name}/test`;
const changeId = `arn:aws:cloudformation:ap-northeast-1:${account}:changeSet/${name}/test`;
type Options = { asyncExercise?: () => Promise<SyntheticRoleExercise | SyntheticExpiryExercise | SyntheticBrowserExercise>; expiry?: boolean; browser?: boolean; attempts?: number;
  collision?: boolean; roleExists?: boolean; createLost?: boolean; createInvisible?: boolean;
  executeLost?: boolean; exerciseFails?: boolean; exerciseBadPacket?: boolean; badTemplate?: boolean;
  foreignStack?: boolean; foreignResource?: boolean; paged?: boolean; foreignRole?: boolean; replacementRole?: boolean;
  badRoleTrust?: boolean; oldRole?: boolean; missingRoleTags?: boolean; unknownSystemTag?: boolean;
  stuckCreate?: boolean; stuckDelete?: boolean; rollback?: boolean; autoDeleted?: boolean; deleteLost?: boolean;
  missingTombstoneTime?: boolean; reverseClock?: boolean; earlyJournalFails?: boolean; postExecuteJournalFails?: boolean;
  proposalPending?: boolean; stackPaged?: boolean; liveProtectionMissing?: boolean; cleanupTemplateChanged?: boolean;
  createIntentFails?: boolean; executeIntentFails?: boolean; executeVisibilityLag?: boolean; deleteVisibilityLag?: boolean;
  executeNeverVisible?: boolean; roleDeletionLag?: boolean; cleanupObservationAbsent?: boolean; failedRoleCreation?: boolean;
  deduplicateTokens?: boolean; deletionRejected?: boolean; deletionThrows?: boolean; rejectionThenInvisible?: boolean };

function fixture(o: Options = {}) {
  let status = o.collision ? "CREATE_COMPLETE" : "ABSENT", role = !!o.roleExists, proposal = false;
  let now = start, didExercise = false, roleReads = 0, dispatched = false, deletionDispatched = false, laggedRoleRead = false;
  const calls: { service: string; operation: string; args: string[]; cleanup: boolean }[] = [], records: any[] = [];
  const template = syntheticRoleTemplateExpected(identity.Arn, account);
  const row = () => ({ LogicalResourceId: o.foreignResource ? "Foreign" : "SyntheticLabRole", ResourceType: "AWS::IAM::Role",
    PhysicalResourceId: SYNTHETIC_LAB_ROLE_NAME, ResourceStatus: o.failedRoleCreation ? "CREATE_FAILED" : role ? "CREATE_COMPLETE" : "DELETE_COMPLETE" });
  const stack = () => ({ StackId: o.foreignStack ? stackId.replace("/test", "/foreign") : stackId, StackName: name,
    CreationTime: new Date(start).toISOString(), StackStatus: status,
    // AWS's server timestamp does not move backward with the injected local clock.
    ...(status === "DELETE_COMPLETE" ? o.missingTombstoneTime ? {} : { DeletionTime: new Date(Math.max(start, now)).toISOString() } :
      o.liveProtectionMissing ? {} : { EnableTerminationProtection: false }),
    Tags: status === "REVIEW_IN_PROGRESS" ? [] : syntheticRoleDraftTags(nonce),
    DeploymentConfig: { Mode: "STANDARD", DisableRollback: false } });
  const call: DraftCall = (service, operation, args, cleanup) => {
    const flag = operation === "create-change-set" ? "--client-token" : "--client-request-token";
    const token = args[args.indexOf(flag) + 1];
    const reused = args.includes(flag) && calls.some(c => c.args.includes("--client-token") &&
      c.args[c.args.indexOf("--client-token") + 1] === token || c.args.includes("--client-request-token") &&
      c.args[c.args.indexOf("--client-request-token") + 1] === token);
    calls.push({ service, operation, args, cleanup });
    if (o.rejectionThenInvisible && ["describe-stacks", "get-role"].includes(operation) &&
        calls.some(c => c.operation === "delete-stack")) return { ok: false, code: "ABSENT" };
    // Model an idempotency conflict without claiming this was yesterday's
    // actual AWS error. A rejected request does not change remote state.
    if (o.deduplicateTokens && reused) return { ok: false, code: "UNVERIFIED" };
    if (operation === "describe-stacks") {
      if (cleanup && o.cleanupObservationAbsent) return { ok: false, code: "ABSENT" };
      if (status === "ABSENT") return { ok: false, code: "ABSENT" };
      const response = { ok: true as const, data: { Stacks: [stack()], ...(o.stackPaged ? { NextToken: "PRIVATE_SENTINEL" } : {}) } };
      if (dispatched && o.executeVisibilityLag && status === "REVIEW_IN_PROGRESS") status = "CREATE_COMPLETE";
      if (deletionDispatched && o.deleteVisibilityLag && status === "CREATE_COMPLETE") { status = "DELETE_COMPLETE"; role = false; }
      return response;
    }
    if (operation === "get-role") {
      if (cleanup && o.cleanupObservationAbsent) return { ok: false, code: "ABSENT" };
      if (!role) {
        if (deletionDispatched && o.roleDeletionLag && !laggedRoleRead) laggedRoleRead = true;
        else return { ok: false, code: "ABSENT" };
      }
      roleReads++;
      return { ok: true, data: { Role: { RoleName: SYNTHETIC_LAB_ROLE_NAME, Path: "/",
        Arn: `arn:aws:iam::${account}:role/${SYNTHETIC_LAB_ROLE_NAME}`, RoleId: `AROA${(o.foreignRole || o.replacementRole && roleReads > 1 ? "Y" : "X").repeat(17)}`,
        CreateDate: new Date(o.oldRole ? start - 10000 : start).toISOString(), MaxSessionDuration: 3600,
        AssumeRolePolicyDocument: o.badRoleTrust ? {} : syntheticRoleTrust(identity.Arn, account),
        Tags: o.missingRoleTags ? [] : [...template.Resources.SyntheticLabRole.Properties.Tags,
          { Key: "aws:cloudformation:stack-id", Value: o.foreignRole ? "foreign" : stackId },
          ...(o.unknownSystemTag ? [{ Key: "aws:cloudformation:unexpected", Value: "foreign" }] : [])] } } };
    }
    if (operation === "create-change-set") {
      status = o.createInvisible ? "ABSENT" : "REVIEW_IN_PROGRESS"; proposal = true;
      return o.createLost ? { ok: false, code: "UNVERIFIED" } : { ok: true, data: { Id: changeId, StackId: stackId } };
    }
    if (operation === "describe-change-set") {
      if (!proposal) return { ok: false, code: "ABSENT" };
      return { ok: true, data: { ChangeSetName: name, StackName: name, StackId: stackId, ChangeSetId: changeId,
        Status: o.proposalPending ? "CREATE_IN_PROGRESS" : "CREATE_COMPLETE", ExecutionStatus: o.proposalPending ? "UNAVAILABLE" : "AVAILABLE",
        CreationTime: new Date(start).toISOString(), OnStackFailure: "DELETE", Tags: syntheticRoleDraftTags(nonce),
        IncludeNestedStacks: false, Capabilities: ["CAPABILITY_NAMED_IAM"],
        Changes: [{ Type: "Resource", ResourceChange: { Action: "Add", LogicalResourceId: "SyntheticLabRole", ResourceType: "AWS::IAM::Role" } }] } };
    }
    if (operation === "get-template") return { ok: true, data: { TemplateBody: o.badTemplate || o.cleanupTemplateChanged && cleanup ? {} : template } };
    if (operation === "list-stack-resources") return { ok: true, data: {
      StackResourceSummaries: status === "REVIEW_IN_PROGRESS" ? [] : [row()], ...(o.paged ? { NextToken: "PRIVATE_SENTINEL" } : {}) } };
    if (operation === "execute-change-set") {
      dispatched = true;
      status = o.failedRoleCreation ? "CREATE_FAILED" : o.executeVisibilityLag || o.executeNeverVisible ? "REVIEW_IN_PROGRESS" : o.stuckCreate ? "CREATE_IN_PROGRESS" : o.rollback ? "ROLLBACK_COMPLETE" : o.autoDeleted ? "DELETE_COMPLETE" : "CREATE_COMPLETE";
      role = !o.autoDeleted && !o.rollback; proposal = false;
      return o.executeLost ? { ok: false, code: "UNVERIFIED" } : { ok: true, data: {} };
    }
    if (operation === "delete-change-set") { proposal = false; return { ok: true, data: {} }; }
    if (operation === "delete-stack") {
      if (o.deletionThrows) throw Error("PRIVATE_SENTINEL");
      if (o.deletionRejected) return { ok: false, code: "TOKEN_CONFLICT" };
      deletionDispatched = true;
      status = o.deleteVisibilityLag ? "CREATE_COMPLETE" : o.stuckDelete ? "DELETE_IN_PROGRESS" : "DELETE_COMPLETE"; role = !!o.stuckDelete;
      return o.deleteLost ? { ok: false, code: "UNVERIFIED" } : { ok: true, data: {} };
    }
    throw Error("UNEXPECTED_OPERATION");
  };
  return { calls, records, rolePresent: () => role, exercised: () => didExercise, run: () => rehearseSyntheticRole({ identity, nonce, template,
    ...(o.expiry ? { exerciseMode: "expiry-contrast" as const, observedModelAttempts: () => o.attempts ?? 2 } : {}),
    ...(o.browser ? { exerciseMode: "restricted-browser" as const, observedModelAttempts: () => o.attempts ?? 0 } : {}),
    now: () => now, call, wait: async () => { now += o.reverseClock ? -1000 : 15000; },
    record: r => {
      if (o.earlyJournalFails && r.stage === "pre-create" || o.postExecuteJournalFails && r.stage === "deployed-temporary" ||
          o.createIntentFails && r.stage === "create-intent" || o.executeIntentFails && r.stage === "execute-intent") throw Error("PRIVATE_SENTINEL");
      records.push(r);
    },
    exercise: o.asyncExercise ?? (() => { didExercise = true; if (o.exerciseFails) throw Error("PRIVATE_SENTINEL");
      return { assumptionVerified: !o.exerciseBadPacket, credentialLeaseClosed: true, inferenceCalls: 0 } as any; }),
  }) };
}

test("one freshly reviewed CREATE is executed, credential-only exercised and removed", async () => {
  const f = fixture(), r = await f.run();
  assert.equal(r.completed, true); assert.equal(r.deployed, true); assert.equal(r.exercised, true);
  assert.equal(r.stackAbsent, true); assert.equal(r.roleAbsent, true); assert.equal(f.rolePresent(), false);
  assert.equal(f.records.at(-1).startedAtMs, start);
  assert.equal(f.records.at(-1).verifiedRoleId, `AROA${"X".repeat(17)}`);
  assert.equal(r.inferenceCalls, 0); assert.equal(r.negativeAuthorizationVerified, false); assert.equal(r.allCredentialsRevoked, false);
  assert.equal(f.calls.filter(c => c.operation === "execute-change-set").length, 1);
  const execute = f.calls.find(c => c.operation === "execute-change-set")!;
  assert.deepEqual(execute.args, ["--stack-name", stackId, "--change-set-name", changeId, "--client-request-token", `${name}-execute`]);
  assert.equal(execute.args.includes("--disable-rollback"), false);
  assert.equal(f.calls.some(c => /put-role|delete-role|attach-role|invoke|run-task/.test(c.operation)), false);
  assert.ok(f.calls.filter(c => c.operation.startsWith("delete-")).every(c => c.cleanup && c.args.includes(stackId)));
  assert.doesNotMatch(JSON.stringify(r), /123456789012|arn:aws|PRIVATE_SENTINEL/);
});

test("explicit expiry mode admits only the exact two-attempt receipt and still cleans on failed control", async () => {
  const packet: SyntheticExpiryExercise = { assumptionVerified: true, credentialLeaseClosed: true, inferenceCalls: 2, serverSideExpiryVerified: true };
  const accepted = fixture({ expiry: true, asyncExercise: async () => packet });
  const result = await accepted.run(); assert.equal(result.completed, true); assert.equal(result.inferenceCalls, 2);
  assert.equal(result.roleAbsent, true); assert.equal(result.stackAbsent, true);
  const legacy = fixture({ asyncExercise: async () => packet });
  assert.equal((await legacy.run()).completed, false); assert.equal(legacy.rolePresent(), false);
  for (const attempts of [0, 1, 3, NaN]) {
    const f = fixture({ expiry: true, attempts, asyncExercise: async () => packet });
    const r = await f.run(); assert.equal(r.completed, false); assert.equal(r.stackAbsent, true); assert.equal(r.roleAbsent, true);
  }
  const failed = fixture({ expiry: true, attempts: 1, asyncExercise: async () => { throw Error("PRIVATE_SENTINEL"); } });
  const r = await failed.run(); assert.equal(r.completed, false); assert.equal(r.inferenceCalls, 1); assert.equal(r.roleAbsent, true);
});

test("asynchronous exercise finishes before deletion; rejection still reaches owned cleanup", async () => {
  for (const rejects of [false, true]) {
    let release: (() => void) | undefined;
    const f = fixture({ asyncExercise: () => new Promise((resolve, reject) => {
      release = () => rejects ? reject(Error("PRIVATE_SENTINEL")) : resolve({ assumptionVerified: true, credentialLeaseClosed: true, inferenceCalls: 0 });
    }) });
    const pending = f.run(); await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.rolePresent(), true); assert.equal(f.calls.some(c => c.operation === "delete-stack"), false);
    release!(); const r = await pending;
    assert.equal(r.completed, !rejects); assert.equal(r.primaryError, rejects);
    assert.equal(r.stackAbsent, true); assert.equal(r.roleAbsent, true); assert.equal(f.rolePresent(), false);
  }
});

test("restricted browser mode admits only observed zero/one attempts and a closed listener", async () => {
  for (const attempts of [0, 1] as const) {
    const packet: SyntheticBrowserExercise = { assumptionVerified: true, credentialLeaseClosed: true, inferenceCalls: attempts, listenerClosed: true };
    const f = fixture({ browser: true, attempts, asyncExercise: async () => packet }), r = await f.run();
    assert.equal(r.completed, true); assert.equal(r.inferenceCalls, attempts); assert.equal(r.roleAbsent, true); assert.equal(r.stackAbsent, true);
    const legacy = fixture({ asyncExercise: async () => packet }); assert.equal((await legacy.run()).completed, false); assert.equal(legacy.rolePresent(), false);
  }
  for (const attempts of [2, -1, NaN]) {
    const f = fixture({ browser: true, attempts, asyncExercise: async () => ({ assumptionVerified: true, credentialLeaseClosed: true, inferenceCalls: 0, listenerClosed: true }) });
    const r = await f.run(); assert.equal(r.completed, false); assert.equal(r.inferenceCalls, null); assert.equal(r.roleAbsent, true);
  }
  const mismatch = fixture({ browser: true, attempts: 1, asyncExercise: async () => ({ assumptionVerified: true, credentialLeaseClosed: true, inferenceCalls: 0, listenerClosed: true }) });
  assert.equal((await mismatch.run()).completed, false); assert.equal(mismatch.rolePresent(), false);
  const open = fixture({ browser: true, asyncExercise: async () => ({ assumptionVerified: true, credentialLeaseClosed: true, inferenceCalls: 0, listenerClosed: false } as any) });
  assert.equal((await open.run()).completed, false); assert.equal(open.rolePresent(), false);
});

test("create, execute and delete use distinct operation-scoped tokens", async () => {
  const f = fixture({ deduplicateTokens: true }), r = await f.run();
  assert.equal(r.completed, true);
  assert.equal(f.rolePresent(), false);
  const tokens = ["create-change-set", "execute-change-set", "delete-stack"].map(op => {
    const c = f.calls.find(c => c.operation === op)!;
    const flag = op === "create-change-set" ? "--client-token" : "--client-request-token";
    return c.args[c.args.indexOf(flag) + 1]!;
  });
  assert.equal(new Set(tokens).size, 3);
  for (const token of tokens) { assert.match(token, /^[a-zA-Z0-9][-a-zA-Z0-9]*$/); assert.ok(token.length <= 128); }
  assert.equal(f.calls.filter(c => c.operation === "execute-change-set").length, 1);
  assert.equal(f.calls.filter(c => c.operation === "delete-stack").length, 1);
});

test("collisions and pre-write journal failure never create or delete", async () => {
  for (const o of [{ collision: true }, { roleExists: true }, { earlyJournalFails: true }, { createIntentFails: true }]) {
    const f = fixture(o), r = await f.run(); assert.equal(r.createAttempted, false);
    assert.equal(f.calls.some(c => /^(create|execute|delete)-/.test(c.operation)), false);
  }
});

test("deletion rejection is preserved without raw errors, mutation retry or false closure", async () => {
  const f = fixture({ deletionRejected: true }), r = await f.run();
  assert.equal(r.deletionResponse, "TOKEN_CONFLICT");
  assert.equal(f.records.at(-1).deletionResponse, "TOKEN_CONFLICT");
  assert.equal(r.completed, false); assert.equal(r.cleanupError, true);
  assert.equal(r.stackAbsent, false); assert.equal(r.roleAbsent, false); assert.equal(f.rolePresent(), true);
  assert.equal(f.calls.filter(c => c.operation === "delete-stack").length, 1);
  assert.ok(r.cleanupCalls <= 48);
  assert.doesNotMatch(JSON.stringify(r), /PRIVATE_SENTINEL|arn:aws|123456789012/);
});

test("deletion diagnostics distinguish no dispatch, acknowledgement and lost/throwing replies", async () => {
  for (const [options, expected] of [[{ collision: true }, "NOT_ATTEMPTED"], [{}, "ACKNOWLEDGED"],
    [{ deleteLost: true }, "UNVERIFIED"], [{ deletionThrows: true }, "UNVERIFIED"]] as const) {
    const f = fixture(options), r = await f.run();
    assert.equal(r.deletionResponse, expected);
    assert.equal(f.records.at(-1).deletionResponse, expected);
  }
});

test("a known rejected delete plus invisible observations cannot certify resource closure", async () => {
  const f = fixture({ deletionRejected: true, rejectionThenInvisible: true }), r = await f.run();
  assert.equal(r.completed, false); assert.equal(r.stackAbsent, false); assert.equal(r.roleAbsent, false);
  assert.equal(r.cleanupError, true); assert.equal(f.rolePresent(), true);
  assert.equal(r.deletionResponse, "TOKEN_CONFLICT");
  assert.equal(f.calls.filter(c => c.operation === "delete-stack").length, 1);
});

test("failed execution-intent journal cannot execute and still cleans the unexecuted proposal", async () => {
  const f = fixture({ executeIntentFails: true }), r = await f.run();
  assert.equal(r.primaryError, true); assert.equal(r.executeAttempted, false);
  assert.equal(r.stackAbsent, true); assert.equal(r.roleAbsent, true);
  assert.equal(f.calls.some(c => c.operation === "execute-change-set"), false);
});

test("lost create acknowledgement cleans only a bound empty proposal; invisibility is unverified", async () => {
  const f = fixture({ createLost: true }), r = await f.run();
  assert.equal(r.primaryError, true); assert.equal(r.executeAttempted, false); assert.equal(r.stackAbsent, true); assert.equal(r.roleAbsent, true);
  const g = fixture({ createLost: true, createInvisible: true }), s = await g.run();
  assert.equal(s.cleanupError, true); assert.equal(s.stackAbsent, false);
  assert.equal(g.calls.some(c => c.operation.startsWith("delete-")), false);
});

test("lost execution acknowledgement is not retried or exercised; its owned role is still removed", async () => {
  const f = fixture({ executeLost: true }), r = await f.run();
  assert.equal(r.completed, false); assert.equal(r.primaryError, true); assert.equal(f.exercised(), false);
  assert.equal(r.stackAbsent, true); assert.equal(r.roleAbsent, true);
  assert.equal(f.calls.filter(c => c.operation === "execute-change-set").length, 1);
});

test("lost execution plus invisible reads cannot prove cleanup before any owned deletion", async () => {
  const f = fixture({ executeLost: true, cleanupObservationAbsent: true }), r = await f.run();
  assert.equal(r.primaryError, true); assert.equal(r.cleanupError, true);
  assert.equal(r.stackAbsent, false); assert.equal(r.roleAbsent, false);
  assert.equal(f.rolePresent(), true); // hidden observation is not actual absence
  assert.equal(f.calls.some(c => c.operation.startsWith("delete-")), false);
});

test("exercise or post-deployment journal failure preserves automatic cleanup", async () => {
  for (const o of [{ exerciseFails: true }, { exerciseBadPacket: true }, { postExecuteJournalFails: true }]) {
    const f = fixture(o), r = await f.run(); assert.equal(r.completed, false); assert.equal(r.primaryError, true);
    assert.equal(r.stackAbsent, true); assert.equal(r.roleAbsent, true);
  }
});

test("changed template, stack, resource or incomplete inventory never authorizes deletion", async () => {
  for (const o of [{ badTemplate: true }, { foreignStack: true }, { foreignResource: true }, { paged: true },
    { stackPaged: true }, { liveProtectionMissing: true }, { cleanupTemplateChanged: true }]) {
    const f = fixture(o), r = await f.run(); assert.equal(r.completed, false); assert.equal(r.cleanupError, true);
    assert.equal(f.calls.some(c => c.operation === "delete-stack"), false);
  }
});

test("foreign/replaced/old/mistagged role or changed trust cannot be deleted", async () => {
  for (const o of [{ foreignRole: true }, { replacementRole: true }, { oldRole: true }, { missingRoleTags: true },
    { unknownSystemTag: true }, { badRoleTrust: true }]) {
    const f = fixture(o), r = await f.run(); assert.equal(r.completed, false); assert.equal(r.cleanupError, true);
    assert.equal(f.calls.some(c => c.operation === "delete-stack"), false);
  }
});

test("a failed CREATE carrying a role name cannot authorize deleting the surviving same-name role", async () => {
  const f = fixture({ failedRoleCreation: true }), r = await f.run();
  assert.equal(r.primaryError, true); assert.equal(r.cleanupError, true);
  assert.equal(f.rolePresent(), true); assert.equal(r.stackAbsent, false);
  assert.equal(f.calls.some(c => c.operation === "delete-stack"), false);
});

test("pending proposal/reversed clock is bounded and retains independent cleanup", async () => {
  for (const o of [{ proposalPending: true }, { proposalPending: true, reverseClock: true }]) {
    const f = fixture(o), r = await f.run(); assert.equal(r.completed, false); assert.equal(r.executeAttempted, false);
    assert.equal(r.stackAbsent, true); assert.equal(r.roleAbsent, true); assert.ok(r.normalCalls <= 30); assert.ok(r.cleanupCalls <= 48);
  }
});

test("stuck create/delete never becomes success and both polling loops are bounded", async () => {
  for (const o of [{ stuckCreate: true }, { stuckDelete: true }, { executeNeverVisible: true }]) {
    const f = fixture(o), r = await f.run(); assert.equal(r.completed, false); assert.equal(r.cleanupError, true);
    assert.equal(r.stackAbsent, false); assert.ok(r.normalCalls <= 30); assert.ok(r.cleanupCalls <= 48);
  }
});

test("delayed execution/deletion/role visibility causes bounded reads, never mutation replay", async () => {
  const f = fixture({ executeVisibilityLag: true, deleteVisibilityLag: true, roleDeletionLag: true }), r = await f.run();
  assert.equal(r.completed, true); assert.equal(r.stackAbsent, true); assert.equal(r.roleAbsent, true);
  assert.equal(f.calls.filter(c => c.operation === "execute-change-set").length, 1);
  assert.equal(f.calls.filter(c => c.operation === "delete-stack").length, 1);
});

test("rollback/automatic delete are failures but reconcile the exact owned scope", async () => {
  for (const o of [{ rollback: true }, { autoDeleted: true }]) {
    const f = fixture(o), r = await f.run(); assert.equal(r.completed, false); assert.equal(r.primaryError, true);
    assert.equal(r.stackAbsent, true); assert.equal(r.roleAbsent, true); assert.equal(f.exercised(), false);
  }
});

test("lost delete acknowledgement accepts an exact tombstone, never one without deletion time", async () => {
  const f = fixture({ deleteLost: true }), r = await f.run(); assert.equal(r.completed, true); assert.equal(r.roleAbsent, true);
  const g = fixture({ missingTombstoneTime: true }), s = await g.run(); assert.equal(s.completed, false); assert.equal(s.cleanupError, true);
});

test("invalid identity/template/nonce never calls the transport", async () => {
  let calls = 0;
  for (const o of [{ identity: {} }, { template: {} }, { nonce: "bad" }]) {
    await assert.rejects(rehearseSyntheticRole({ identity, template: syntheticRoleTemplateExpected(identity.Arn, account), nonce,
      now: () => start, call: () => { calls++; throw Error(); }, wait: async () => {}, record: () => {},
      exercise: () => ({ assumptionVerified: true, credentialLeaseClosed: true, inferenceCalls: 0 }), ...o }));
  }
  assert.equal(calls, 0);
});
