import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createSyntheticRoleCli, syntheticRoleCliTransport } from "../synthetic-role-cli.js";

const rejected = { message: "SYNTHETIC_ROLE_CLI_REJECTED" };
const operations = ["get-role", "list-attached-role-policies", "list-role-policies", "get-role-policy", "assume-role"] as const;
test("candidate CLI adapter fixes order, endpoints, signing regions and one assumption", () => {
  const calls: readonly string[][] = [], outputs: any[] = [];
  const call = syntheticRoleCliTransport(args => {
    (calls as string[][]).push([...args]);
    const result = { status: 0, signal: null, stdout: '{"testOnly":true}', stderr: "PRIVATE_SENTINEL" }; outputs.push(result); return result;
  });
  for (const operation of operations) assert.deepEqual(call(operation, []), { testOnly: true });
  calls.forEach((args, i) => {
    assert.equal(args[args.indexOf("--region") + 1], i === 4 ? "ap-northeast-1" : "us-east-1");
    assert.equal(args[args.indexOf("--endpoint-url") + 1], i === 4 ? "https://sts.ap-northeast-1.amazonaws.com" : "https://iam.amazonaws.com");
    assert.equal(args[args.indexOf("--profile") + 1], "gmai-admin");
  });
  assert.ok(outputs.every(r => r.stdout === "" && r.stderr === ""));
  assert.throws(() => call("assume-role", []), rejected); assert.equal(calls.length, 5);
});

test("child failures discard raw buffers and permanently reject retries or later steps", () => {
  for (const failure of [ { status: 1 }, { signal: "SIGTERM" }, { error: Error("PRIVATE_SENTINEL") }, { stdout: "malformed PRIVATE_SENTINEL" } ]) {
    let calls = 0;
    const raw = { status: 0, signal: null as string | null, stdout: "{}", stderr: "PRIVATE_SENTINEL", ...failure };
    const call = syntheticRoleCliTransport(() => { calls++; return raw; });
    assert.throws(() => call("get-role", []), rejected); assert.equal(raw.stdout, ""); assert.equal(raw.stderr, "");
    assert.throws(() => call("get-role", []), rejected); assert.throws(() => call("list-attached-role-policies", []), rejected);
    assert.equal(calls, 1);
  }
  let calls = 0;
  const call = syntheticRoleCliTransport(() => { calls++; throw Error("PRIVATE_SENTINEL"); });
  assert.throws(() => call("assume-role", []), rejected); assert.equal(calls, 0);
});

test("real adapter checks runtime before filesystem/auth and keeps subprocesses bounded", () => {
  const original = Object.getOwnPropertyDescriptor(process.versions, "node")!;
  try {
    Object.defineProperty(process.versions, "node", { ...original, value: "24.19.0" });
    assert.throws(() => createSyntheticRoleCli(), { message: "PROJECT_NODE_SECURITY_BASELINE_REQUIRED" });
  } finally { Object.defineProperty(process.versions, "node", original); }
  const source = readFileSync(new URL("../synthetic-role-cli.ts", import.meta.url), "utf8");
  assert.match(source, /timeout: 20000/); assert.match(source, /AWS_MAX_ATTEMPTS: "1"/);
  assert.doesNotMatch(source, /export-credentials|console\.|writeFile|fromNodeProviderChain/);
});
