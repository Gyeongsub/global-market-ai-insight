import assert from "node:assert/strict";
import test from "node:test";
import { prepareSyntheticRoleDraft, type DraftCall } from "../synthetic-role-draft.js";
import { syntheticRoleTemplateExpected, syntheticRoleDraftTags } from "../synthetic-role-template-review.js";

const account = "123456789012", nonce = "b".repeat(32), name = `gmai-synthetic-role-${nonce}`;
const identity = { Account: account, Arn: `arn:aws:iam::${account}:user/aws-admin-user`, UserId: `AIDA${"X".repeat(17)}` };
const start = Date.parse("2026-10-26T00:00:00.000Z"), stackId = `arn:aws:cloudformation:ap-northeast-1:${account}:stack/${name}/test`;
const changeId = `arn:aws:cloudformation:ap-northeast-1:${account}:changeSet/${name}/test`;
const template = () => syntheticRoleTemplateExpected(identity.Arn, account);
type Options = { collision?: boolean; roleExists?: boolean; createLost?: boolean; invisible?: boolean; neverReady?: boolean;
  badTemplate?: boolean; foreignTag?: boolean; executed?: boolean; resources?: boolean; paged?: boolean;
  deleteLost?: boolean; draftDeleteLost?: boolean; draftSurvives?: boolean; survives?: boolean; deletedTombstone?: boolean; reverseClock?: boolean; waitFails?: boolean; journalFails?: boolean;
  untaggedPlaceholder?: boolean; foreignProposalTag?: boolean; standardConfig?: boolean;
  tombstoneOmitsProtection?: boolean; invalidDeletionTime?: boolean; liveOmitsProtection?: boolean };
function fixture(o: Options = {}) {
  let exists = !!o.collision, removed = false, draftRemoved = false, now = start;
  const calls: { service: string; operation: string; args: string[]; cleanup: boolean }[] = [], records: any[] = [];
  const stack = () => ({ StackId: stackId, StackName: name, CreationTime: new Date(start).toISOString(),
    StackStatus: removed && o.deletedTombstone ? "DELETE_COMPLETE" : o.executed ? "CREATE_COMPLETE" : "REVIEW_IN_PROGRESS",
    ...(o.liveOmitsProtection || removed && o.tombstoneOmitsProtection ? {} : { EnableTerminationProtection: false }),
    ...(removed && o.deletedTombstone ? { DeletionTime: o.invalidDeletionTime ? "invalid" : new Date(now).toISOString() } : {}),
    Tags: o.untaggedPlaceholder ? [] : syntheticRoleDraftTags(nonce).map(t => t.Key === "ProofId" && o.foreignTag ? { ...t, Value: "other" } : t),
    ...(o.standardConfig ? { DeploymentConfig: { Mode: "STANDARD", DisableRollback: false } } : {}) });
  const call: DraftCall = (service, operation, args, cleanup) => {
    calls.push({ service, operation, args, cleanup });
    if (operation === "describe-stacks") return exists || removed && o.deletedTombstone ? { ok: true, data: { Stacks: [stack()] } } : { ok: false, code: "ABSENT" };
    if (operation === "get-role") return o.roleExists ? { ok: true, data: { Role: {} } } : { ok: false, code: "ABSENT" };
    if (operation === "create-change-set") { exists = !o.invisible; return o.createLost ? { ok: false, code: "UNVERIFIED" } : { ok: true, data: { Id: changeId, StackId: stackId } }; }
    if (operation === "describe-change-set" && draftRemoved) return { ok: false, code: "ABSENT" };
    if (operation === "describe-change-set") return { ok: true, data: { ChangeSetName: name, StackName: name,
      Status: o.neverReady || o.reverseClock || o.waitFails ? "CREATE_IN_PROGRESS" : "CREATE_COMPLETE", ExecutionStatus: o.neverReady || o.reverseClock || o.waitFails ? "UNAVAILABLE" : "AVAILABLE",
      OnStackFailure: "DELETE", Tags: syntheticRoleDraftTags(o.foreignProposalTag ? "c".repeat(32) : nonce), IncludeNestedStacks: false,
      ...(o.standardConfig ? { DeploymentConfig: { Mode: "STANDARD", DisableRollback: false } } : {}),
      Capabilities: ["CAPABILITY_NAMED_IAM"], CreationTime: new Date(start).toISOString(), ChangeSetId: changeId, StackId: stackId,
      Changes: [{ Type: "Resource", ResourceChange: { Action: "Add", LogicalResourceId: "SyntheticLabRole", ResourceType: "AWS::IAM::Role" } }] } };
    if (operation === "get-template") return { ok: true, data: { TemplateBody: o.badTemplate ? {} : template() } };
    if (operation === "list-stack-resources") return { ok: true, data: { StackResourceSummaries: o.resources ? [{}] : [], ...(o.paged ? { NextToken: "PRIVATE_SENTINEL" } : {}) } };
    if (operation === "delete-change-set") { draftRemoved = !o.draftSurvives; return o.draftDeleteLost ? { ok: false, code: "UNVERIFIED" } : { ok: true, data: {} }; }
    if (operation === "delete-stack") { if (!o.survives) { exists = false; removed = true; } return o.deleteLost ? { ok: false, code: "UNVERIFIED" } : { ok: true, data: {} }; }
    throw Error("UNEXPECTED_OPERATION");
  };
  return { calls, records, exists: () => exists, run: () => prepareSyntheticRoleDraft({ identity, nonce, template: template(), now: () => now, call,
    wait: async () => { now += o.reverseClock ? -1000 : 15000; if (o.waitFails) throw Error("PRIVATE_SENTINEL"); },
    record: state => { if (o.journalFails && state.stage === "pre-create") throw Error("PRIVATE_SENTINEL"); records.push(state); } }) };
}

test("one unexecuted CREATE proposal is bound, reviewed and both draft/empty stack are cleaned", async () => {
  const f = fixture(), r = await f.run();
  assert.equal(r.completed, true); assert.equal(r.absentConfirmed, true); assert.equal(f.exists(), false);
  assert.equal(r.normalCalls, 6); assert.equal(r.cleanupCalls, 9);
  assert.equal(r.executeCalls, 0); assert.equal(r.roleCreateRequests, 0); assert.equal(r.roleAbsentConfirmed, true);
  assert.equal(f.calls.some(c => /execute|assume|invoke|put-role|attach/.test(c.operation)), false);
  const create = f.calls.find(c => c.operation === "create-change-set")!;
  assert.equal(create.args[create.args.indexOf("--change-set-type") + 1], "CREATE");
  assert.deepEqual(JSON.parse(create.args[create.args.indexOf("--template-body") + 1]!), template());
  assert.equal(create.args.includes("--role-arn"), false); assert.equal(create.args.includes("--template-url"), false);
  const deletions = f.calls.filter(c => c.operation.startsWith("delete-"));
  assert.deepEqual(deletions.map(c => c.operation), ["delete-change-set", "delete-stack"]);
  assert.ok(deletions.every(c => c.args.includes(stackId) && c.cleanup));
  assert.doesNotMatch(JSON.stringify(r), /123456789012|arn:aws|PRIVATE_SENTINEL/);
});

test("collision, existing role and pre-write journal failure cannot create or delete resources", async () => {
  for (const o of [{ collision: true }, { roleExists: true }, { journalFails: true }]) {
    const f = fixture(o), r = await f.run();
    assert.equal(r.createAttempted, false); assert.equal(r.primaryError, true);
    assert.equal(f.calls.some(c => c.operation.startsWith("create-") || c.operation.startsWith("delete-")), false);
  }
});

test("ambiguous creation reconciles an exact empty owned stack, not absence alone", async () => {
  const f = fixture({ createLost: true }), r = await f.run();
  assert.equal(r.primaryError, true); assert.equal(r.absentConfirmed, true); assert.equal(r.reviewed, false); assert.equal(f.exists(), false);
  const hidden = fixture({ createLost: true, invisible: true }), h = await hidden.run();
  assert.equal(h.cleanupError, true); assert.equal(h.absentConfirmed, false);
  assert.equal(hidden.calls.filter(c => c.cleanup && c.operation === "describe-stacks").length, 3);
  assert.equal(hidden.calls.some(c => c.operation.startsWith("delete-")), false);
});

test("foreign, executed, nonempty and paged stacks cannot be deleted", async () => {
  for (const o of [{ foreignTag: true }, { executed: true }, { resources: true }, { paged: true }]) {
    const f = fixture(o), r = await f.run();
    assert.equal(r.completed, false); assert.equal(r.cleanupError, true); assert.equal(r.absentConfirmed, false);
    assert.equal(f.calls.some(c => c.operation.startsWith("delete-")), false);
  }
});

test("bounded pending, failed waits, reversed clock and changed template retain cleanup budget", async () => {
  for (const o of [{ neverReady: true }, { waitFails: true }, { reverseClock: true }, { badTemplate: true }]) {
    const f = fixture(o), r = await f.run();
    assert.equal(r.primaryError, true); assert.equal(r.absentConfirmed, true); assert.equal(r.cleanupError, false);
    assert.ok(r.normalCalls <= 14); assert.ok(r.cleanupCalls <= 22);
    assert.equal(f.exists(), false);
  }
});

test("ambiguous deletion uses consecutive absence; surviving stack is never clean", async () => {
  for (const o of [{ deleteLost: true }, { draftDeleteLost: true }, { deletedTombstone: true }]) {
    const f = fixture(o), r = await f.run(); assert.equal(r.absentConfirmed, true); assert.equal(r.completed, true);
  }
  const f = fixture({ survives: true }), r = await f.run();
  assert.equal(r.absentConfirmed, false); assert.equal(r.cleanupError, true); assert.equal(r.completed, false);
  assert.equal(f.calls.filter(c => c.operation === "delete-stack").length, 1);
});

test("unconfirmed draft removal never authorizes deleting its parent stack", async () => {
  const f = fixture({ draftSurvives: true }), r = await f.run();
  assert.equal(r.cleanupError, true); assert.equal(r.absentConfirmed, false);
  assert.equal(f.calls.some(c => c.operation === "delete-stack"), false);
});

test("deleted AWS tombstone can omit protection only after an owned deletion with a valid deletion time", async () => {
  const f = fixture({ untaggedPlaceholder: true, standardConfig: true, deletedTombstone: true, tombstoneOmitsProtection: true });
  const r = await f.run();
  assert.equal(r.completed, true); assert.equal(r.absentConfirmed, true); assert.equal(r.roleAbsentConfirmed, true);
  assert.equal(f.calls.filter(c => c.operation === "delete-stack").length, 1);
  for (const extra of [{ invalidDeletionTime: true }, { liveOmitsProtection: true }]) {
    const bad = fixture({ untaggedPlaceholder: true, deletedTombstone: true, tombstoneOmitsProtection: true, ...extra });
    const result = await bad.run();
    assert.equal(result.completed, false); assert.equal(result.absentConfirmed, false); assert.equal(result.cleanupError, true);
    if (extra.liveOmitsProtection) assert.equal(bad.calls.some(c => c.operation.startsWith("delete-")), false);
  }
});

test("invalid owner, nonce and broad template fail before any injected operation", async () => {
  let calls = 0;
  const common = { identity, nonce, template: template(), now: () => start, wait: async () => {}, call: (() => { calls++; throw Error(); }) as DraftCall, record: () => {} };
  for (const update of [{ identity: { ...identity, Account: "bad" } }, { nonce: "bad" }, { template: {} }])
    await assert.rejects(prepareSyntheticRoleDraft({ ...common, ...update }));
  assert.equal(calls, 0);
});

test("untagged AWS placeholder and standard defaults complete with independent proposal ownership", async () => {
  const f = fixture({ untaggedPlaceholder: true, standardConfig: true }), r = await f.run();
  assert.equal(r.completed, true); assert.equal(r.absentConfirmed, true); assert.equal(r.roleAbsentConfirmed, true);
  assert.equal(r.executeCalls, 0); assert.equal(f.exists(), false);
});

test("untagged ambiguous or pending creation needs fresh tagged proposal and exact template for cleanup", async () => {
  for (const extra of [{ createLost: true }, { neverReady: true }, { reverseClock: true }, { waitFails: true }]) {
    const f = fixture({ untaggedPlaceholder: true, ...extra }), r = await f.run();
    assert.equal(r.primaryError, true); assert.equal(r.cleanupError, false); assert.equal(r.absentConfirmed, true);
    assert.ok(f.calls.some(c => c.cleanup && c.operation === "get-template"));
    assert.ok(r.cleanupCalls <= 22); assert.equal(f.exists(), false);
  }
  for (const extra of [{ foreignProposalTag: true }, { badTemplate: true }, { executed: true }]) {
    const f = fixture({ untaggedPlaceholder: true, ...extra }), r = await f.run();
    assert.equal(r.cleanupError, true); assert.equal(r.absentConfirmed, false);
    assert.equal(f.calls.some(c => c.operation.startsWith("delete-")), false);
  }
});
