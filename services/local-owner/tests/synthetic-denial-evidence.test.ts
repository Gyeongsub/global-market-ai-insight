import test from "node:test";
import assert from "node:assert/strict";
import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { reviewSyntheticDenialResponse, syntheticDenialEvidencePlan, type SyntheticDenialCase } from "../src/synthetic-denial-evidence.js";

const message = (action: string, layer = "session") => `User: arn:aws:sts::123456789012:assumed-role/private/example is not authorized to perform: ${action} on resource: private with an explicit deny in ${layer === "session" ? "a session" : "an identity-based"} policy`;
const reply = (action = "bedrock:InvokeModel", layer = "session") => ({ status: 403,
  body: JSON.stringify({ __type: "AccessDeniedException", message: message(action, layer) }) });

test("fixed action and explicit policy denial are parsed without claiming live acceptance", () => {
  for (const [name, action] of [["parameter-canary", "ssm:GetParameter"], ["cluster-read", "ecs:DescribeClusters"],
    ["wrong-model", "bedrock:InvokeModel"], ["wrong-region", "bedrock:InvokeModel"], ["expired-window", "bedrock:InvokeModel"], ["run-task", "ecs:RunTask"]] as const) {
    const r = reviewSyntheticDenialResponse(name, reply(action));
    assert.equal(r.accepted, true); assert.equal(r.liveAuthorizationVerified, false);
    assert.doesNotMatch(JSON.stringify(r), /123456789012|private|arn:/);
  }
});
test("expiry requires session denial, not an unrelated identity deny", () => {
  assert.equal(reviewSyntheticDenialResponse("expired-window", reply("bedrock:InvokeModel", "identity")).accepted, false);
  assert.equal(reviewSyntheticDenialResponse("wrong-model", reply("bedrock:InvokeModel", "identity")).accepted, true);
});
test("validation, missing resources, throttles, expiry and signature errors are not IAM denial", () => {
  for (const code of ["ValidationException", "ParameterNotFound", "ResourceNotFoundException", "ThrottlingException", "ExpiredTokenException", "SignatureDoesNotMatch", "AccessDeniedExceptionOther"]) {
    assert.equal(reviewSyntheticDenialResponse("wrong-model", { status: 403, body: JSON.stringify({ __type: code, message: message("bedrock:InvokeModel") }) }).accepted, false);
  }
  for (const status of [200, 301, 400, 401, 429, 500]) assert.equal(reviewSyntheticDenialResponse("wrong-model", { ...reply(), status }).accepted, false);
});
test("generic denial, wrong action and action suffixes do not satisfy the case", () => {
  for (const text of ["Access denied", "not authorized to perform bedrock:InvokeModel", message("ecs:RunTask"), message("bedrock:InvokeModelWithResponseStream"), message("bedrock:InvokeModel") + "\nextra"]) {
    assert.equal(reviewSyntheticDenialResponse("wrong-model", { status: 403, body: JSON.stringify({ __type: "AccessDeniedException", message: text }) }).accepted, false);
  }
});
test("duplicate, conflicting, oversized and malformed remote envelopes fail closed", () => {
  for (const body of ["{", "null", "[]", '{"__type":"AccessDeniedException","__type":"AccessDeniedException"}',
    JSON.stringify({ __type: "AccessDeniedException", code: "ValidationException", message: message("bedrock:InvokeModel") }),
    JSON.stringify({ __type: "AccessDeniedException", message: message("bedrock:InvokeModel"), Message: message("bedrock:InvokeModel") }),
    JSON.stringify({ __type: "AccessDeniedException", message: "x".repeat(16385) })]) {
    assert.equal(reviewSyntheticDenialResponse("wrong-model", { status: 403, body }).accepted, false);
  }
  assert.equal(reviewSyntheticDenialResponse("wrong-model", { ...reply(), errorType: "ValidationException" }).accepted, false);
  for (const invalid of [null, undefined, {}, [], "secret"])
    assert.equal(reviewSyntheticDenialResponse("wrong-model", invalid).accepted, false);
  assert.equal(reviewSyntheticDenialResponse("toString" as SyntheticDenialCase, reply()).accepted, false);
});
test("header-only error and namespaced AWS JSON type are recognized with the same strict message", () => {
  assert.equal(reviewSyntheticDenialResponse("wrong-region", { status: 403, errorType: "AccessDeniedException", body: JSON.stringify({ message: message("bedrock:InvokeModel") }) }).accepted, true);
  assert.equal(reviewSyntheticDenialResponse("parameter-canary", { status: 400, body: JSON.stringify({ __type: "com.amazonaws.ssm#AccessDeniedException", Message: message("ssm:GetParameter") }) }).accepted, true);
});
test("plan has no network or credential effects and no broad denial claims", () => {
  assert.deepEqual(syntheticDenialEvidencePlan(), { mode: "local-candidate", networkCalls: 0, credentialAccess: false,
    cases: ["parameter-canary", "cluster-read", "wrong-model", "wrong-region", "expired-window", "run-task"], runTaskDenialVerified: false,
    secretReadPerformed: false, foreignPrincipalVerified: false, serverSideExpiryVerified: false,
    liveTransportImplemented: false, liveAuthorizationVerified: false });
});

test("rejection diagnostics are fixed categories, never upstream prose or credentials", () => {
  const cases = [
    [null, "ENVELOPE"],
    [{ ...reply(), status: 200 }, "STATUS_OR_BODY"],
    [{ status: 403, body: "PRIVATE_SENTINEL" }, "JSON"],
    [{ status: 403, body: JSON.stringify({ __type: "PRIVATE_SENTINEL" }) }, "ERROR_CODE"],
    [{ status: 403, body: JSON.stringify({ __type: "AccessDeniedException", message: { secret: "PRIVATE_SENTINEL" } }) }, "MESSAGE"],
    [{ status: 403, body: JSON.stringify({ __type: "AccessDeniedException", message: "PRIVATE_SENTINEL" }) }, "ACTION"],
    [reply("bedrock:InvokeModel", "identity"), "POLICY_LAYER"],
  ] as const;
  for (const [response, expected] of cases) {
    const result = reviewSyntheticDenialResponse("expired-window", response);
    assert.equal(result.accepted, false);
    if (!result.accepted) assert.equal(result.reason, expected);
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE_SENTINEL|123456789012|arn:/);
  }
  assert.equal(reviewSyntheticDenialResponse("expired-window", reply()).accepted, true);
});

test("legacy restJson error suffix agrees with the pinned SDK without networking", async () => {
  for (const errorType of ["AccessDeniedException", "AccessDeniedException:httpStatusCode=403",
    "com.amazonaws.bedrock#AccessDeniedException", "com.amazonaws.bedrock#AccessDeniedException:https://example.invalid/detail"]) {
    const body = JSON.stringify({ message: message("bedrock:InvokeModel") });
    let handled = 0;
    const client = new BedrockRuntimeClient({ region: "ap-northeast-1", maxAttempts: 1,
      credentials: { accessKeyId: `ASIA${"X".repeat(16)}`, secretAccessKey: "x".repeat(40), sessionToken: "fixture-only" },
      requestHandler: { async handle() { handled++; return { response: { statusCode: 403,
        headers: { "content-type": "application/json", "x-amzn-errortype": errorType }, body: Buffer.from(body) } }; }, destroy() {} } });
    try {
      await assert.rejects(client.send(new ConverseCommand({ modelId: "amazon.nova-lite-v1:0",
        messages: [{ role: "user", content: [{ text: "offline fixture" }] }] })), { name: "AccessDeniedException" });
      assert.equal(handled, 1);
      for (const response of [{ status: 403, errorType, body },
        { status: 403, body: JSON.stringify({ __type: errorType, message: message("bedrock:InvokeModel") }) }]) {
        const result = reviewSyntheticDenialResponse("expired-window", response);
        assert.equal(result.accepted, true);
        assert.doesNotMatch(JSON.stringify(result), /123456789012|arn:|httpStatusCode|example\.invalid/);
      }
    } finally { client.destroy(); }
  }
});

test("protocol error normalization cannot hide conflicting codes or substitute generic denial", () => {
  for (const errorType of ["ValidationException:AccessDeniedException", ":AccessDeniedException", "AccessDeniedExceptionOther:x",
    "a#b#AccessDeniedException:x", "AccessDeniedException,ValidationException", "AccessDeniedException:\nprivate",
    "AccessDeniedException:" + "x".repeat(256)]) {
    assert.equal(reviewSyntheticDenialResponse("expired-window", { ...reply(), errorType }).accepted, false);
  }
  const errorType = "AccessDeniedException:httpStatusCode=403";
  for (const body of [
    { __type: "ValidationException", message: message("bedrock:InvokeModel") },
    { __type: "AccessDeniedException", message: "Access denied" },
    { __type: "AccessDeniedException", message: message("ecs:RunTask") },
    { __type: "AccessDeniedException", message: message("bedrock:InvokeModel", "identity") },
  ]) assert.equal(reviewSyntheticDenialResponse("expired-window", { status: 403, errorType, body: JSON.stringify(body) }).accepted, false);
});
