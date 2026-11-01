import assert from "node:assert/strict";
import test from "node:test";
import { ConverseCommand, type ConverseCommandOutput } from "@aws-sdk/client-bedrock-runtime";
import {
  AwsBedrockConverseTransport,
  buildBedrockRuntimeClientConfig,
  type BedrockCommandSender,
} from "../src/providers/aws-bedrock-converse-transport.js";
import type { BedrockConverseRequest } from "../src/providers/bedrock-analysis-adapter.js";
import { buildGroundedSelectionToolConfig } from "../src/grounded-analysis.js";

const request: BedrockConverseRequest = {
  modelId: "amazon.nova-lite-v1:0",
  system: [{ text: "Use the required tool." }],
  messages: [{ role: "user", content: [{ text: "bounded input" }] }],
  toolConfig: buildGroundedSelectionToolConfig("QLD"),
  inferenceConfig: { maxTokens: 256, temperature: 0, topP: 0.9 },
};

test("pins the SDK to one attempt and leaves credential resolution to the ECS task role", () => {
  const config = buildBedrockRuntimeClientConfig("ap-northeast-1");
  assert.equal(config.region, "ap-northeast-1");
  assert.equal(config.maxAttempts, 1);
  assert.equal("credentials" in config, false);
  assert.throws(() => buildBedrockRuntimeClientConfig("not-a-region"), /region is invalid/);
});

test("maps the bounded request to ConverseCommand and returns only the approved response fields", async () => {
  let capturedCommand: ConverseCommand | undefined;
  let capturedSignal: AbortSignal | undefined;
  const response: ConverseCommandOutput = {
    stopReason: "tool_use",
    output: {
      message: {
        role: "assistant",
        content: [{
          toolUse: {
            toolUseId: "tool-1",
            name: "select_grounded_insights",
            input: { uncertaintyId: "SINGLE_QUOTE_NO_FORECAST" },
          },
        }],
      },
    },
    usage: { inputTokens: 22, outputTokens: 8, totalTokens: 30 },
    metrics: { latencyMs: 25 },
    $metadata: {},
  };
  const client: BedrockCommandSender = {
    async send(command, options) {
      capturedCommand = command;
      capturedSignal = options.abortSignal;
      return response;
    },
  };
  const transport = new AwsBedrockConverseTransport({ region: "ap-northeast-1", client });
  const controller = new AbortController();
  const actual = await transport.converse(request, { abortSignal: controller.signal });

  assert.ok(capturedCommand instanceof ConverseCommand);
  assert.equal(capturedSignal, controller.signal);
  assert.deepEqual(capturedCommand.input, request);
  assert.notEqual(capturedCommand.input.toolConfig?.tools[0]?.toolSpec?.inputSchema.json, request.toolConfig.tools[0]!.toolSpec.inputSchema.json);
  assert.deepEqual(actual, {
    stopReason: "tool_use",
    output: { message: { content: [{ toolUse: {
      toolUseId: "tool-1",
      name: "select_grounded_insights",
      input: { uncertaintyId: "SINGLE_QUOTE_NO_FORECAST" },
    } }] } },
    usage: { inputTokens: 22, outputTokens: 8, totalTokens: 30 },
  });
});

test("non-JSON or cyclic tool schemas are rejected before the SDK request", async () => {
  let calls = 0;
  const transport = new AwsBedrockConverseTransport({ region: "ap-northeast-1", client: { async send() { calls++; throw Error("UNEXPECTED_SDK_CALL"); } } });
  const cyclic: any = {}; cyclic.self = cyclic;
  for (const schema of [{ invalid: () => {} }, { invalid: Infinity }, cyclic, new Date()]) {
    const invalid: any = { ...request, toolConfig: { ...request.toolConfig, tools: [{ toolSpec: {
      ...request.toolConfig.tools[0]!.toolSpec, inputSchema: { json: schema } } }] } };
    await assert.rejects(transport.converse(invalid, { abortSignal: new AbortController().signal }), /BEDROCK_TOOL_SCHEMA_INVALID/);
  }
  assert.equal(calls, 0);
});

test("converts an incomplete SDK response into validator-safe invalid values", async () => {
  const client: BedrockCommandSender = {
    async send() {
      return { $metadata: {} } as ConverseCommandOutput;
    },
  };
  const transport = new AwsBedrockConverseTransport({ region: "ap-northeast-1", client });
  const actual = await transport.converse(request, { abortSignal: new AbortController().signal });
  assert.equal(actual.stopReason, "");
  assert.deepEqual(actual.output.message.content, []);
  assert.deepEqual(actual.usage, { inputTokens: -1, outputTokens: -1, totalTokens: -1 });
});
