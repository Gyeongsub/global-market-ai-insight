import {
  BedrockRuntimeClient,
  ConverseCommand,
  type BedrockRuntimeClientConfig,
  type ConverseCommandInput,
  type ConverseCommandOutput,
} from "@aws-sdk/client-bedrock-runtime";
import type {
  BedrockConverseRequest,
  BedrockConverseResponse,
  BedrockConverseTransport,
} from "./bedrock-analysis-adapter.js";

export interface BedrockCommandSender {
  send(command: ConverseCommand, options: { abortSignal: AbortSignal }): Promise<ConverseCommandOutput>;
}

interface AwsBedrockConverseTransportOptions {
  region: string;
  client?: BedrockCommandSender;
}

const AWS_REGION_PATTERN = /^[a-z]{2}(?:-gov)?-[a-z]+-\d$/;
type MutableJson = null | string | number | boolean | MutableJson[] | { [key: string]: MutableJson };

// The domain schema is deeply readonly; the SDK document type has mutable
// arrays. Copy validated JSON instead of asserting away that type boundary.
function sdkJson(value: unknown, depth = 0): MutableJson {
  if (depth > 16) throw Error("BEDROCK_TOOL_SCHEMA_INVALID");
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map(item => sdkJson(item, depth + 1));
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype)
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sdkJson(item, depth + 1)]));
  throw Error("BEDROCK_TOOL_SCHEMA_INVALID");
}

export function buildBedrockRuntimeClientConfig(region: string): BedrockRuntimeClientConfig {
  if (!AWS_REGION_PATTERN.test(region)) throw new Error("AWS region is invalid.");
  return {
    region,
    // One application request must remain one billable model attempt. Any future
    // retry policy belongs above this transport and requires an explicit cost review.
    maxAttempts: 1,
  };
}

function toSdkRequest(request: BedrockConverseRequest): ConverseCommandInput {
  return {
    modelId: request.modelId,
    system: request.system.map(({ text }) => ({ text })),
    messages: request.messages.map((message) => ({
      role: message.role,
      content: message.content.map(({ text }) => ({ text })),
    })),
    toolConfig: {
      tools: request.toolConfig.tools.map(({ toolSpec }) => ({
        toolSpec: {
          name: toolSpec.name,
          description: toolSpec.description,
          inputSchema: { json: sdkJson(toolSpec.inputSchema.json) },
        },
      })),
      toolChoice: { tool: { name: request.toolConfig.toolChoice.tool.name } },
    },
    inferenceConfig: { ...request.inferenceConfig },
  };
}

function fromSdkResponse(response: ConverseCommandOutput): BedrockConverseResponse {
  const content = response.output?.message?.content ?? [];
  return {
    stopReason: response.stopReason ?? "",
    output: {
      message: {
        content: content.map((block) => {
          if ("text" in block && typeof block.text === "string") return { text: block.text };
          if ("toolUse" in block && block.toolUse) {
            return {
              toolUse: {
                name: block.toolUse.name ?? "",
                input: block.toolUse.input,
                ...(block.toolUse.toolUseId === undefined ? {} : { toolUseId: block.toolUse.toolUseId }),
              },
            };
          }
          return {};
        }),
      },
    },
    usage: {
      inputTokens: response.usage?.inputTokens ?? -1,
      outputTokens: response.usage?.outputTokens ?? -1,
      totalTokens: response.usage?.totalTokens ?? -1,
    },
  };
}

export class AwsBedrockConverseTransport implements BedrockConverseTransport {
  private readonly client: BedrockCommandSender;

  constructor(options: AwsBedrockConverseTransportOptions) {
    const config = buildBedrockRuntimeClientConfig(options.region);
    this.client = options.client ?? new BedrockRuntimeClient(config);
  }

  async converse(request: BedrockConverseRequest, options: { abortSignal: AbortSignal }): Promise<BedrockConverseResponse> {
    const response = await this.client.send(new ConverseCommand(toSdkRequest(request)), options);
    return fromSdkResponse(response);
  }
}
