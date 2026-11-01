import assert from "node:assert/strict";
import test from "node:test";
import { syntheticAlternatePrincipalSpec } from "../../shared/security/synthetic-alternate-principal.js";
import { createSyntheticAlternatePrincipalAttempt } from "../synthetic-alternate-principal-cli.js";

const specInput = { account: "123456789012", ownerArn: "arn:aws:iam::123456789012:user/aws-admin-user",
  nonce: "a".repeat(32), startedAt: "2026-10-31T00:00:00.000Z" };
const spec = syntheticAlternatePrincipalSpec(specInput), start = Date.parse(spec.startedAt), roleId = `AROA${"A".repeat(16)}`;
const denial = () => ({ status: 254 as number | null, signal: null as string | null, stdout: "",
  stderr: "An error occurred (AccessDenied) when calling the AssumeRole operation: private-denial-sentinel\r\n" });
function setup() {
  const snapshot = { role: { Role: { RoleName: spec.roleName, Arn: spec.roleArn, RoleId: roleId, Path: "/", CreateDate: spec.startedAt,
    MaxSessionDuration: 3600, AssumeRolePolicyDocument: structuredClone(spec.trust), Tags: structuredClone(spec.tags) } },
    attached: { AttachedPolicies: [], IsTruncated: false }, inlineNames: { PolicyNames: ["OnlyTargetAssumption"], IsTruncated: false },
    inlinePolicy: { RoleName: spec.roleName, PolicyName: "OnlyTargetAssumption", PolicyDocument: structuredClone(spec.permissions) },
    profiles: { InstanceProfiles: [], IsTruncated: false } };
  const keys = { accessKeyId: `ASIA${"A".repeat(16)}`, secretAccessKey: "x".repeat(40), sessionToken: "fixture-only-session" };
  const state = { calls: 0, closes: 0, time: start + 1000 };
  const input: Parameters<typeof createSyntheticAlternatePrincipalAttempt>[0] = {
    specInput, snapshot, now: () => state.time,
    lease: { roleArn: spec.roleArn, roleId, getCredentials: () => keys, close() { state.closes++; keys.accessKeyId = ""; keys.secretAccessKey = ""; keys.sessionToken = ""; } },
    environment: { PATH: "test-path", AWS_PROFILE: "gmai-admin", AWS_ACCESS_KEY_ID: "admin-key", AWS_SESSION_TOKEN: "admin-session",
      AWS_CONFIG_FILE: "private-config", AWS_ENDPOINT_URL: "https://unexpected.invalid", HTTPS_PROXY: "private-proxy", NODE_OPTIONS: "--inspect" },
    run: () => { state.calls++; return denial(); },
  };
  return { input, state, keys };
}

test("one regional target attempt uses only source keys, deny-all target policy and projected output", () => {
  const { input, state, keys } = setup(); let childEnv: NodeJS.ProcessEnv | undefined; const raw = denial();
  input.run = (args, options) => {
    state.calls++; childEnv = options.env;
    assert.deepEqual(args.slice(0, 2), ["sts", "assume-role"]);
    const arg = (flag: string) => args[args.indexOf(flag) + 1];
    assert.equal(arg("--role-arn"), spec.targetRoleArn); assert.equal(arg("--duration-seconds"), "900");
    assert.equal(arg("--policy"), spec.targetSessionRequest.Policy);
    assert.equal(arg("--endpoint-url"), "https://sts.ap-northeast-1.amazonaws.com");
    assert.equal(arg("--region"), "ap-northeast-1"); assert.equal(args.includes("--profile"), false);
    assert.doesNotMatch(arg("--query")!, /AccessKeyId|SecretAccessKey|SessionToken/);
    assert.equal(options.timeout, 20000); assert.equal(options.maxBuffer, 16384); assert.equal(options.windowsHide, true);
    assert.equal(options.env.AWS_ACCESS_KEY_ID, keys.accessKeyId); assert.equal(options.env.AWS_SESSION_TOKEN, keys.sessionToken);
    assert.equal(options.env.AWS_PROFILE, undefined); assert.equal(options.env.HTTPS_PROXY, undefined);
    assert.equal(options.env.AWS_ENDPOINT_URL, undefined); assert.equal(options.env.NODE_OPTIONS, undefined);
    assert.equal(options.env.AWS_CONFIG_FILE, "NUL"); assert.equal(options.env.AWS_SHARED_CREDENTIALS_FILE, "NUL");
    assert.equal(options.env.AWS_EC2_METADATA_DISABLED, "true"); assert.equal(options.env.AWS_MAX_ATTEMPTS, "1");
    assert.equal(options.env.NODE_TLS_REJECT_UNAUTHORIZED, "1");
    assert.equal(args.some(v => v.includes(keys.secretAccessKey) || v.includes(keys.sessionToken)), false);
    return raw;
  };
  const attempt = createSyntheticAlternatePrincipalAttempt(input), result = attempt();
  assert.equal(result.accepted, true); assert.equal(result.sourceLeaseClosed, true);
  assert.equal(result.liveAuthorizationVerified, false); assert.equal(result.exactTrustConditionDiagnosed, false);
  assert.equal(result.targetCredentialsUsed, false); assert.equal(result.independentRoleCleanupRequired, true);
  assert.equal(state.calls, 1); assert.equal(state.closes, 1);
  assert.equal(raw.stdout, ""); assert.equal(raw.stderr, ""); assert.equal(keys.sessionToken, "");
  assert.equal(childEnv!.AWS_ACCESS_KEY_ID, undefined); assert.equal(childEnv!.AWS_SECRET_ACCESS_KEY, undefined);
  assert.equal(childEnv!.AWS_SESSION_TOKEN, undefined); assert.doesNotMatch(JSON.stringify(result), /private|123456789012/);
  assert.equal(attempt().accepted, false); assert.equal(state.calls, 1);
});

test("unexpected assumption success is failure and returned bytes are discarded, never reused", () => {
  const { input, state } = setup(); const raw = { status: 0, signal: null, stdout: '{"Credentials":{"SessionToken":"private-output"}}', stderr: "" };
  input.run = () => { state.calls++; return raw; };
  const result = createSyntheticAlternatePrincipalAttempt(input)();
  assert.equal(result.accepted, false); assert.equal(result.disposition, "unexpected-allow");
  assert.equal(result.targetCredentialsUsed, false); assert.equal(state.calls, 1); assert.equal(raw.stdout, "");
  assert.doesNotMatch(JSON.stringify(result), /private-output|"Credentials"|"SessionToken"/);
});

test("validation failures close source without a child or administrator fallback", () => {
  for (const mutate of [
    (x: ReturnType<typeof setup>) => x.input.lease.roleArn = spec.targetRoleArn,
    (x: ReturnType<typeof setup>) => x.input.lease.roleId += "X",
    (x: ReturnType<typeof setup>) => x.keys.accessKeyId = "invalid",
    (x: ReturnType<typeof setup>) => x.keys.secretAccessKey = "invalid",
    (x: ReturnType<typeof setup>) => x.keys.sessionToken = "bad\n".repeat(10),
    (x: ReturnType<typeof setup>) => x.input.lease.getCredentials = () => { throw Error("private"); },
    (x: ReturnType<typeof setup>) => x.state.time = start + 280001,
    (x: ReturnType<typeof setup>) => x.state.time = NaN,
    (x: ReturnType<typeof setup>) => x.input.snapshot = {},
    (x: ReturnType<typeof setup>) => x.input.environment = { PATH: "invalid\n" },
  ]) {
    const x = setup(); mutate(x); const result = createSyntheticAlternatePrincipalAttempt(x.input)();
    assert.equal(result.accepted, false); assert.equal(result.attempted, false); assert.equal(result.sourceLeaseClosed, true);
    assert.equal(x.state.calls, 0); assert.equal(x.state.closes, 1);
  }
});

test("signature, expired-token, validation and ambiguous child failures never count as denied access", () => {
  for (const change of [
    { status: 1 }, { status: null }, { signal: "SIGTERM" }, { error: Error("private") },
    { stderr: "An error occurred (ExpiredToken) when calling the AssumeRole operation: private" },
    { stderr: "An error occurred (AccessDenied) when calling the GetRole operation: private" },
    { stderr: "An error occurred (AccessDeniedException) when calling the AssumeRole operation: private" },
    { stderr: "An error occurred (AccessDenied) when calling the AssumeRole operation: private\nextra error" },
    { stderr: "x".repeat(16385) }, { stdout: "x".repeat(16385) },
  ]) {
    const { input, state } = setup(), raw = { ...denial(), ...change };
    input.run = () => { state.calls++; return raw; };
    const attempt = createSyntheticAlternatePrincipalAttempt(input), result = attempt();
    assert.equal(result.accepted, false); assert.equal(result.disposition, "unverified");
    assert.equal(result.sourceLeaseClosed, true); assert.equal(state.calls, 1);
    assert.equal(raw.stdout, ""); assert.equal(raw.stderr, "");
    assert.equal(attempt().accepted, false); assert.equal(state.calls, 1);
  }
});

test("reversed clocks, late responses and child exceptions still attempt credential cleanup", () => {
  for (const advance of [-1, 20000, 300000, NaN]) {
    const { input, state } = setup();
    input.run = () => { state.calls++; state.time += advance; return denial(); };
    const result = createSyntheticAlternatePrincipalAttempt(input)();
    assert.equal(result.accepted, false); assert.equal(result.sourceLeaseClosed, true); assert.equal(state.calls, 1);
  }
  const { input, state } = setup(); input.run = () => { state.calls++; throw Error("private"); };
  const result = createSyntheticAlternatePrincipalAttempt(input)();
  assert.equal(result.accepted, false); assert.equal(result.sourceLeaseClosed, true); assert.equal(state.calls, 1);
});

test("cleanup failure cannot produce an accepted result even when the request was denied", () => {
  const { input, state } = setup(); input.lease.close = () => { state.closes++; throw Error("private-close"); };
  const result = createSyntheticAlternatePrincipalAttempt(input)();
  assert.equal(result.accepted, false); assert.equal(result.disposition, "access-denied");
  assert.equal(result.sourceLeaseClosed, false); assert.equal(state.calls, 1); assert.equal(state.closes, 1);
  assert.doesNotMatch(JSON.stringify(result), /private-close/);
});

test("fixed CLI error prefix and zero-retry annotation preserve denial classification", () => {
  for (const prefix of ["", "aws: [ERROR]: "]) for (const suffix of ["", " (reached max retries: 0)"]) {
    const { input } = setup();
    input.run = () => ({ ...denial(), stderr: `${prefix}An error occurred (AccessDenied) when calling the AssumeRole operation${suffix}: private\n` });
    assert.equal(createSyntheticAlternatePrincipalAttempt(input)().accepted, true);
  }
  const { input } = setup();
  input.run = () => ({ ...denial(), stderr: "An error occurred (AccessDenied) when calling the AssumeRole operation (reached max retries: 2): private" });
  assert.equal(createSyntheticAlternatePrincipalAttempt(input)().accepted, false);
});
