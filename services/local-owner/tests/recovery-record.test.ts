import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { createRecordedOwnerJobSession, readOwnerRecoveryRecord, validateOwnerRecoveryRecord, writeOwnerRecoveryRecord } from "../src/recovery-record.js";
import type { OwnerJobTransport } from "../src/job-session.js";
import { deterministicJobId } from "../../controller/src/aws-job-repository.js";

const at = Date.parse("2026-10-25T00:00:00.000Z"), window = { startsAtMs: at, expiresAtMs: at + 300000 };
const request = { operation: "PRICE", symbol: "QLD", locale: "en" } as const;
const id = "job_" + "a".repeat(48);
const record = () => ({ kind: "owner-job-dispatch-intent", schemaVersion: 1, jobId: id, request: { ...request },
  preparedAt: new Date(at).toISOString(), admissionWindow: { ...window }, dispatchMayOccur: true, reconciliationRequired: true });
const path = (root: string, jobId = id) => join(root, "outputs", "owner-recovery", `${jobId}.json`);
function fixture() {
  const parent = realpathSync(tmpdir()), root = mkdtempSync(join(parent, "gmai-owner-recovery-test-"));
  writeFileSync(join(root, ".gitignore"), "outputs/\n");
  return { root, close() {
    assert.ok(root.startsWith(parent + sep + "gmai-owner-recovery-test-"));
    assert.equal(realpathSync(root), resolve(root));
    rmSync(root, { recursive: true });
  } };
}

test("record has exact minimal fields and cannot store secrets, results or closure assertions", () => {
  const good = record(), copied = validateOwnerRecoveryRecord(good);
  good.request.locale = "en";
  assert.notEqual(copied.request, good.request); assert.equal(Object.isFrozen(copied.admissionWindow), true);
  for (const bad of [{ ...record(), credential: "PRIVATE_SENTINEL" }, { ...record(), request: { ...request, key: "PRIVATE_SENTINEL" } },
    { ...record(), admissionWindow: { ...window, extra: true } }, { ...record(), reconciliationRequired: false },
    { ...record(), dispatchMayOccur: false }, { ...record(), kind: "closed" }, { ...record(), jobId: "../secret" },
    { ...record(), preparedAt: "2026-02-30T00:00:00.000Z" }, { ...record(), preparedAt: new Date(at + 285000).toISOString() }]) {
    assert.throws(() => validateOwnerRecoveryRecord(bad), /^Error: OWNER_RECOVERY_RECORD_UNAVAILABLE$/);
  }
  assert.doesNotMatch(JSON.stringify(copied), /secret|accessKey|sessionToken|taskArn|idempotency|result|endpoint/);
});

test("exclusive synced record is independently readable and never overwritten", () => {
  const f = fixture();
  try {
    writeOwnerRecoveryRecord(f.root, record());
    assert.deepEqual(readOwnerRecoveryRecord(f.root, id), record());
    const before = readFileSync(path(f.root), "utf8");
    assert.throws(() => writeOwnerRecoveryRecord(f.root, record()), /^Error: OWNER_RECOVERY_RECORD_UNAVAILABLE$/);
    assert.equal(readFileSync(path(f.root), "utf8"), before);
    assert.deepEqual(readdirSync(join(f.root, "outputs", "owner-recovery")), [id + ".json"]);
  } finally { f.close(); }
});

test("bounded reader rejects corruption, duplicates, private additions, wrong job and oversized files", () => {
  const f = fixture();
  try {
    writeOwnerRecoveryRecord(f.root, record());
    const text = readFileSync(path(f.root), "utf8");
    for (const raw of ["{", text.replace('"schemaVersion":1', '"schemaVersion":1,"schemaVersion":1'),
      JSON.stringify({ ...record(), private: "PRIVATE_SENTINEL" }), JSON.stringify({ ...record(), jobId: "job_" + "b".repeat(48) }), "x".repeat(4097), text + " "]) {
      writeFileSync(path(f.root), raw);
      assert.throws(() => readOwnerRecoveryRecord(f.root, id), /^Error: OWNER_RECOVERY_RECORD_UNAVAILABLE$/);
    }
    assert.throws(() => readOwnerRecoveryRecord(f.root, "../.aws/credentials"), /^Error: OWNER_RECOVERY_RECORD_UNAVAILABLE$/);
  } finally { f.close(); }
});

test("scope requires absolute ordinary workspace, ignored outputs and exclusive regular file", () => {
  const f = fixture();
  try {
    assert.throws(() => writeOwnerRecoveryRecord(".", record()));
    writeFileSync(join(f.root, ".gitignore"), "# outputs not ignored\n");
    assert.throws(() => writeOwnerRecoveryRecord(f.root, record())); assert.equal(existsSync(join(f.root, "outputs")), false);
    writeFileSync(join(f.root, ".gitignore"), "outputs/\n");
    writeFileSync(join(f.root, "outputs"), "owned obstruction");
    assert.throws(() => writeOwnerRecoveryRecord(f.root, record()));
    unlinkSync(join(f.root, "outputs")); writeOwnerRecoveryRecord(f.root, record());
    linkSync(path(f.root), join(f.root, "linked-record"));
    assert.throws(() => readOwnerRecoveryRecord(f.root, id));
  } finally { f.close(); }
});

test("prepared record exists before first dispatch and survives lost acknowledgement without key or retry", async () => {
  const f = fixture(); let calls = 0, expected = "";
  const transport: OwnerJobTransport = { async request(method, _path, _body, headers) {
    calls++; assert.equal(method, "POST");
    const persisted = readOwnerRecoveryRecord(f.root, expected);
    assert.equal(persisted.jobId, deterministicJobId(headers!["idempotency-key"]!));
    assert.equal(persisted.reconciliationRequired, true);
    assert.equal(readFileSync(path(f.root, expected), "utf8").includes(headers!["idempotency-key"]!), false);
    throw Error("PRIVATE_SENTINEL");
  } };
  const session = createRecordedOwnerJobSession(f.root, transport, request, window, { wall: () => at }); expected = session.expectedJobId;
  try {
    assert.equal(calls, 0); assert.equal(readOwnerRecoveryRecord(f.root, expected).dispatchMayOccur, true);
    await assert.rejects(session.start(), /^Error: OWNER_RECOVERY_RECORD_UNAVAILABLE$/);
    await assert.rejects(session.start(), /^Error: OWNER_RECOVERY_RECORD_UNAVAILABLE$/);
    assert.equal(calls, 1); assert.equal(session.snapshot().independentClosureRequired, true);
    assert.equal(readOwnerRecoveryRecord(f.root, expected).reconciliationRequired, true);
  } finally { session.close(); f.close(); }
});

test("unwritable journal, invalid window and changed predispatch record prevent all transport calls", async () => {
  const f = fixture(); let calls = 0;
  const transport: OwnerJobTransport = { async request() { calls++; return {}; } };
  try {
    mkdirSync(join(f.root, "outputs")); writeFileSync(join(f.root, "outputs", "owner-recovery"), "owned obstruction");
    assert.throws(() => createRecordedOwnerJobSession(f.root, transport, request, window, { wall: () => at }));
    unlinkSync(join(f.root, "outputs", "owner-recovery"));
    assert.throws(() => createRecordedOwnerJobSession(f.root, transport, request, window, { wall: () => at + 285000 }));
    for (const tamper of ["changed", "removed"] as const) {
      const session = createRecordedOwnerJobSession(f.root, transport, request, window, { wall: () => at });
      try {
        if (tamper === "removed") unlinkSync(path(f.root, session.expectedJobId));
        else writeFileSync(path(f.root, session.expectedJobId), "{broken");
        await assert.rejects(session.start(), /^Error: OWNER_RECOVERY_RECORD_UNAVAILABLE$/);
        assert.equal(session.snapshot().keyRetained, false); assert.equal(session.snapshot().timerActive, false);
      } finally { session.close(); }
    }
    assert.equal(calls, 0);
  } finally { f.close(); }
});

test("successful metadata terminal never marks recovery record remotely closed", async () => {
  const f = fixture(); let expected = "", calls = 0;
  const expiry = new Date(at + 86400000).toISOString(), stamp = new Date(at).toISOString();
  const transport: OwnerJobTransport = { async request(method) {
    calls++;
    return method === "POST" ? { jobId: expected, status: "QUEUED", statusUrl: `/v1/jobs/${expected}`, expiresAt: expiry }
      : { ...request, jobId: expected, status: "SUCCEEDED", createdAt: stamp, updatedAt: stamp, expiresAt: expiry, schemaVersion: "1.0.0" };
  } };
  const session = createRecordedOwnerJobSession(f.root, transport, request, window, { wall: () => at }); expected = session.expectedJobId;
  try {
    const before = readFileSync(path(f.root, expected), "utf8");
    await session.start(); await session.poll(); session.close();
    assert.equal(calls, 2); assert.equal(readFileSync(path(f.root, expected), "utf8"), before);
    assert.equal(session.snapshot().independentClosureRequired, true);
  } finally { session.close(); f.close(); }
});
