import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { localIamWirePlan, localIamWireArguments, localIamWireEnvironment,
  verifyLocalIamWireRequest, safeLocalIamWireTemporary, localIamWireCliPath } from "../local-iam-wire-proof.mjs";

const endpoint = "http://127.0.0.1:49152";

test("CLI discovery is confined to the known vendor layout and never hardcodes a personal home", () => {
  const base = resolve("synthetic-appdata");
  assert.equal(localIamWireCliPath({ LOCALAPPDATA: base }), join(base, "Programs", "Amazon", "AWSCLIV2", "aws.exe"));
  for (const value of [undefined, null, {}, { LOCALAPPDATA: "." }, { LOCALAPPDATA: "" },
    { LOCALAPPDATA: "\\\\remote\\share" }, { LOCALAPPDATA: "//remote/share" }, { LOCALAPPDATA: base + "\0" }])
    assert.throws(() => localIamWireCliPath(value));
  assert.doesNotMatch(readFileSync("scripts/local-iam-wire-proof.mjs", "utf8"), /[A-Za-z]:[\\/]+Users[\\/]/);
});
function requestFixture() {
  const args = localIamWireArguments(endpoint, "argv"), value = flag => args[args.indexOf(flag) + 1];
  return { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded; charset=utf-8" },
    params: new URLSearchParams({ Action: "SimulateCustomPolicy", Version: "2010-05-08",
      "PolicyInputList.member.1": value("--policy-input-list"), "ActionNames.member.1": value("--action-names"),
      "ResourceArns.member.1": value("--resource-arns") }) };
}
function verify(value) { return verifyLocalIamWireRequest(value.method, value.headers, value.params.toString()); }

test("default plan has zero reads/writes/process/network and never authorizes AWS permission or deployment", () => {
  const p = localIamWirePlan();
  for (const key of ["awsCalls", "externalNetworkCalls", "subprocessesStarted", "filesWritten"]) assert.equal(p[key], 0);
  assert.equal(p.loopbackRequestsMax, 2); assert.equal(p.cliInvocationsMax, 3); assert.equal(p.deadlineMs, 30000);
  assert.equal(p.unsignedSyntheticRequestsOnly, true); assert.equal(p.permissionsGateUnchanged, true);
  for (const key of ["actualAwsRequestVerified", "liveAuthorizationVerified", "credentialRefreshPerformed", "policyAttached", "readyForDeployment"])
    assert.equal(p[key], false);
  assert.throws(() => localIamWirePlan(["--execute"]));
});

test("both argument forms preserve the fixed synthetic policy, action and resource without profile or signing", () => {
  const a = localIamWireArguments(endpoint, "argv"), b = localIamWireArguments(endpoint, "cli-input-json");
  const value = flag => a[a.indexOf(flag) + 1], input = JSON.parse(b.at(-1));
  assert.deepEqual(input, { PolicyInputList: [value("--policy-input-list")], ActionNames: [value("--action-names")], ResourceArns: [value("--resource-arns")] });
  assert.ok(input.ResourceArns[0].includes("[$LATEST]"));
  assert.equal(JSON.parse(input.PolicyInputList[0]).Statement[0].Resource, input.ResourceArns[0]);
  for (const args of [a, b]) {
    assert.ok(args.includes("--no-sign-request")); assert.equal(args.includes("--profile"), false);
    assert.ok(args.includes("--no-paginate"));
    assert.equal(args[args.indexOf("--endpoint-url") + 1], endpoint); assert.equal(args.includes("--debug"), false);
  }
});

test("remote, alternate localhost, userinfo, query, fragment and invalid ports cannot form an endpoint", () => {
  for (const url of ["https://iam.amazonaws.com", "http://localhost:49152", "http://127.0.0.2:49152", "http://[::1]:49152",
    "http://user:pass@127.0.0.1:49152", endpoint + "/private", endpoint + "?PRIVATE_SENTINEL", endpoint + "#private",
    "http://127.0.0.1:0", "http://127.0.0.1:65536", "http://127.0.0.1:999999"]) assert.throws(() => localIamWireArguments(url, "argv"));
  assert.throws(() => localIamWireArguments(endpoint, "PRIVATE_SENTINEL"));
});

test("wire checks normalize Query encoding/order but retain exact scalar values without printing received content", () => {
  const f = requestFixture(), a = verify(f);
  f.params = new URLSearchParams([...f.params.entries()].reverse()); const b = verify(f);
  assert.deepEqual(a, b); assert.equal(a.exactQueryMatched, true); assert.equal(a.unsigned, true);
  assert.equal(a.syntheticScopeOnly, true); assert.match(a.normalizedRequestSha256, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(a).includes("123456789012"), false); assert.equal(JSON.stringify(a).includes("Statement"), false);
});

test("authorization, cookies and session/proxy tokens are rejected regardless of header casing", () => {
  for (const key of ["Authorization", "x-amz-security-token", "COOKIE", "Proxy-Authorization"]) {
    const f = requestFixture(); f.headers[key] = "PRIVATE_SENTINEL";
    assert.throws(() => verify(f), /^Error: LOCAL_IAM_WIRE_PROOF_INCOMPLETE$/);
  }
});

test("extra or duplicated parameters, different scopes, invalid methods/types and oversized bodies fail closed", () => {
  for (const mutate of [f => { f.method = "GET"; }, f => { f.headers["content-type"] = "application/json"; },
    f => { f.params.append("Authorization", "PRIVATE_SENTINEL"); }, f => { f.params.append("Action", "SimulateCustomPolicy"); },
    f => { f.params.set("Action", "PutRolePolicy"); }, f => { f.params.set("Version", "PRIVATE_SENTINEL"); },
    f => { f.params.set("ResourceArns.member.1", "PRIVATE_SENTINEL"); }, f => { f.params.set("PolicyInputList.member.1", "PRIVATE_SENTINEL"); }]) {
    const f = requestFixture(); mutate(f); assert.throws(() => verify(f), /^Error: LOCAL_IAM_WIRE_PROOF_INCOMPLETE$/);
  }
  for (const body of [null, "", "x".repeat(8193)]) assert.throws(() => verifyLocalIamWireRequest("POST", {}, body));
});

test("CLI environment drops real identities, tokens, proxies, endpoint overrides and script injection without mutating its caller", () => {
  const root = resolve("synthetic-cli-root"), source = { PATH: "SYSTEM_PATH", AWS_PROFILE: "PRIVATE_SENTINEL", aws_secret_access_key: "PRIVATE_SENTINEL",
    AWS_SESSION_TOKEN: "PRIVATE_SENTINEL", HTTP_PROXY: "PRIVATE_SENTINEL", https_proxy: "PRIVATE_SENTINEL", ALL_PROXY: "PRIVATE_SENTINEL",
    NODE_OPTIONS: "PRIVATE_SENTINEL", AWS_ENDPOINT_URL: "PRIVATE_SENTINEL", AWS_DATA_PATH: "PRIVATE_SENTINEL", HOME: "PRIVATE_SENTINEL",
    USERPROFILE: "PRIVATE_SENTINEL", APPDATA: "PRIVATE_SENTINEL", LOCALAPPDATA: "PRIVATE_SENTINEL", UNKNOWN_SECRET: "PRIVATE_SENTINEL" };
  const env = localIamWireEnvironment(source, root);
  assert.equal(JSON.stringify(env).includes("PRIVATE_SENTINEL"), false); assert.equal(source.AWS_PROFILE, "PRIVATE_SENTINEL");
  for (const key of ["HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "TEMP", "TMP"]) assert.equal(env[key], root);
  assert.equal(env.AWS_CONFIG_FILE, join(root, "config")); assert.equal(env.AWS_SHARED_CREDENTIALS_FILE, join(root, "credentials"));
  assert.equal(env.NO_PROXY, "127.0.0.1,localhost"); assert.equal(env.AWS_MAX_ATTEMPTS, "1"); assert.equal(env.AWS_EC2_METADATA_DISABLED, "true");
});

test("cleanup only accepts the same marked physical direct temporary child; changed markers and links are refused", () => {
  const base = resolve(tmpdir()), physicalBase = realpathSync(base), root = mkdtempSync(join(base, "gmai-cli-wire-proof-")), other = mkdtempSync(join(base, "gmai-cli-wire-proof-"));
  const marker = "synthetic-owner\n";
  try {
    writeFileSync(join(root, "scope.json"), marker); writeFileSync(join(other, "scope.json"), marker);
    assert.equal(safeLocalIamWireTemporary(base, root, physicalBase, marker), true);
    assert.equal(safeLocalIamWireTemporary(root, root, physicalBase, marker), false);
    assert.equal(safeLocalIamWireTemporary(base, root, physicalBase, "PRIVATE_SENTINEL"), false);
    assert.equal(safeLocalIamWireTemporary(base, root, physicalBase, "x".repeat(1001)), false);
    const link = join(root, "linked"); symlinkSync(other, link, process.platform === "win32" ? "junction" : "dir");
    assert.equal(safeLocalIamWireTemporary(base, link, physicalBase, marker), false);
    writeFileSync(join(root, "scope.json"), "changed"); assert.equal(safeLocalIamWireTemporary(base, root, physicalBase, marker), false);
  } finally { rmSync(root, { recursive: true }); rmSync(other, { recursive: true }); }
});

test("import/default/rejected CLI arguments cannot open a server or execute AWS CLI, and errors stay private", () => {
  const script = resolve("scripts/local-iam-wire-proof.mjs");
  const imported = spawnSync(process.execPath, ["--input-type=module", "-e", 'await import("./scripts/local-iam-wire-proof.mjs");'], { encoding: "utf8", timeout: 5000 });
  assert.equal(imported.status, 0); assert.equal(imported.stdout, ""); assert.equal(imported.stderr, "");
  const plan = spawnSync(process.execPath, [script], { encoding: "utf8", timeout: 5000 });
  assert.equal(plan.status, 0); assert.equal(JSON.parse(plan.stdout).subprocessesStarted, 0);
  const failed = spawnSync(process.execPath, [script, "--endpoint-url", "PRIVATE_SENTINEL"], { encoding: "utf8", timeout: 5000 });
  assert.equal(failed.status, 1); assert.equal(failed.stdout, ""); assert.equal(failed.stderr.includes("PRIVATE_SENTINEL"), false);
  assert.equal(JSON.parse(failed.stderr).permissionsGateUnchanged, true);
  assert.match(readFileSync(script, "utf8"), /server\.closeAllConnections\(\)/);
});
