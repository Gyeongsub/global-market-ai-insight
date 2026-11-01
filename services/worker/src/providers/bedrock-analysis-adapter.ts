import type { Locale, SymbolCode } from "../../../controller/src/contracts.js";
import { attachApplicationMetadata, validateAnalysisResult, type AnalysisResult } from "../analysis.js";
import {
  buildGroundedSelectionToolConfig,
  groundedSelectionPolicy,
  GROUNDED_SELECTION_TOOL_NAME,
  GROUNDED_SELECTION_VERSION,
  parseGroundedAnalysisSelection,
  renderGroundedAnalysis,
} from "../grounded-analysis.js";
import type { NormalizedQuote } from "../quote-normalizer.js";
import { ElapsedBudget } from "../../../../shared/time/elapsed-budget.js";

export interface BedrockConverseRequest {
  modelId: string;
  system: Array<{ text: string }>;
  messages: Array<{ role: "user"; content: Array<{ text: string }> }>;
  toolConfig: ReturnType<typeof buildGroundedSelectionToolConfig>;
  inferenceConfig: { maxTokens: number; temperature: 0; topP: number };
}

export interface BedrockConverseResponse {
  stopReason: string;
  output: {
    message: {
      content: Array<{
        text?: string;
        toolUse?: { toolUseId?: string; name: string; input: unknown };
      }>;
    };
  };
  usage: { inputTokens: number; outputTokens: number; totalTokens: number };
}

export interface BedrockConverseTransport {
  converse(request: BedrockConverseRequest, options: { abortSignal: AbortSignal }): Promise<BedrockConverseResponse>;
}

export type BedrockAnalysisErrorCode = "BEDROCK_TIMEOUT" | "BEDROCK_THROTTLED" | "BEDROCK_INVALID_OUTPUT" | "BEDROCK_ERROR";

export class BedrockAnalysisError extends Error {
  constructor(
    public readonly code: BedrockAnalysisErrorCode,
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = "BedrockAnalysisError";
  }
}

export interface BedrockAnalysisExecution {
  result: AnalysisResult;
  usage: { inputTokens: number; outputTokens: number; totalTokens: number };
}

interface BedrockAnalysisAdapterOptions {
  transport: BedrockConverseTransport;
  modelId: string;
  timeoutMs?: number;
  maxInputTokens?: number;
  maxOutputTokens?: number;
  elapsedNow?: () => number;
}

function safeUsage(value: BedrockConverseResponse["usage"], maxInputTokens: number, maxOutputTokens: number) {
  if (value === null || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).sort().join(",") !== "inputTokens,outputTokens,totalTokens" ||
      Object.values(value).some(count => !Number.isSafeInteger(count) || count < 0)) {
    // Provider-controlled keys must never become public error text or fields.
    throw new BedrockAnalysisError("BEDROCK_INVALID_OUTPUT", "Bedrock returned invalid token usage.", false);
  }
  if (value.inputTokens > maxInputTokens || value.outputTokens > maxOutputTokens) {
    throw new BedrockAnalysisError("BEDROCK_INVALID_OUTPUT", "Bedrock token usage exceeded the approved application boundary.", false);
  }
  if (value.totalTokens !== value.inputTokens + value.outputTokens) {
    throw new BedrockAnalysisError("BEDROCK_INVALID_OUTPUT", "Bedrock returned inconsistent token usage.", false);
  }
  return { inputTokens: value.inputTokens, outputTokens: value.outputTokens, totalTokens: value.totalTokens };
}

function mapTransportError(error: unknown): BedrockAnalysisError {
  if (error instanceof BedrockAnalysisError) return error;
  if (error instanceof Error && error.name === "AbortError") {
    return new BedrockAnalysisError("BEDROCK_TIMEOUT", "Bedrock request timed out.", true);
  }
  if (error instanceof Error && /ThrottlingException|Too many requests/i.test(`${error.name} ${error.message}`)) {
    return new BedrockAnalysisError("BEDROCK_THROTTLED", "Bedrock temporarily throttled the request.", true);
  }
  return new BedrockAnalysisError("BEDROCK_ERROR", "Bedrock request failed.", false);
}

export class BedrockAnalysisAdapter {
  private readonly timeoutMs: number;
  private readonly maxInputTokens: number;
  private readonly maxOutputTokens: number;
  private readonly modelId: string;
  private readonly transport: BedrockConverseTransport;
  private readonly elapsedNow: (() => number) | undefined;

  constructor(options: BedrockAnalysisAdapterOptions) {
    this.timeoutMs = options.timeoutMs ?? 20_000;
    this.maxInputTokens = options.maxInputTokens ?? 1_500;
    this.maxOutputTokens = options.maxOutputTokens ?? 512;
    if (!/^[A-Za-z0-9._:-]{1,160}$/.test(options.modelId)) throw new Error("Bedrock modelId is invalid.");
    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs < 500 || this.timeoutMs > 120_000) throw new Error("Bedrock timeout must be between 500 and 120000 milliseconds.");
    if (!Number.isInteger(this.maxInputTokens) || this.maxInputTokens < 256 || this.maxInputTokens > 4_000) throw new Error("Bedrock input token boundary is invalid.");
    if (!Number.isInteger(this.maxOutputTokens) || this.maxOutputTokens < 128 || this.maxOutputTokens > 512) throw new Error("Bedrock output token boundary is invalid.");
    this.modelId = options.modelId;
    this.transport = options.transport;
    this.elapsedNow = options.elapsedNow;
  }

  async analyze(input: { symbol: SymbolCode; locale: Locale; quote: NormalizedQuote }, options?: { abortSignal?: AbortSignal }): Promise<BedrockAnalysisExecution> {
    const cancelled = () => new BedrockAnalysisError("BEDROCK_TIMEOUT", "Bedrock request was cancelled.", false);
    if (options?.abortSignal?.aborted) throw cancelled();
    const policy = groundedSelectionPolicy(input.symbol, input.quote);
    const request: BedrockConverseRequest = {
      modelId: this.modelId,
      system: [{ text: `Select only approved insight IDs with the ${GROUNDED_SELECTION_TOOL_NAME} tool. Do not write natural-language analysis.` }],
      messages: [{
        role: "user",
        content: [{
          text: JSON.stringify({
            selectionVersion: GROUNDED_SELECTION_VERSION,
            symbol: input.symbol,
            locale: input.locale,
            quote: input.quote,
            policy,
          }),
        }],
      }],
      toolConfig: buildGroundedSelectionToolConfig(input.symbol, input.quote),
      inferenceConfig: { maxTokens: this.maxOutputTokens, temperature: 0, topP: 0.9 },
    };

    const budget = new ElapsedBudget(this.timeoutMs, this.elapsedNow, options?.abortSignal,
      () => new BedrockAnalysisError("BEDROCK_TIMEOUT", "Bedrock request timed out.", true));
    try {
      const response = await budget.call(signal => this.transport.converse(request, { abortSignal: signal }));
      if (options?.abortSignal?.aborted) throw cancelled();
      // A transport can resolve despite cancellation. Its late valid payload
      // must not turn the adapter's own expired request into a success.
      if (!budget.active()) throw new BedrockAnalysisError("BEDROCK_TIMEOUT", "Bedrock request timed out.", true);
      const usage = safeUsage(response.usage, this.maxInputTokens, this.maxOutputTokens);
      if (response.stopReason !== "tool_use") throw new BedrockAnalysisError("BEDROCK_INVALID_OUTPUT", "Bedrock did not finish with the required tool call.", false);
      const toolBlocks = response.output.message.content.filter((block) => block.toolUse !== undefined);
      const freeText = response.output.message.content.some((block) => typeof block.text === "string" && block.text.trim().length > 0);
      if (toolBlocks.length !== 1 || freeText) throw new BedrockAnalysisError("BEDROCK_INVALID_OUTPUT", "Bedrock returned an unexpected response shape.", false);
      const toolUse = toolBlocks[0]?.toolUse;
      if (!toolUse || toolUse.name !== GROUNDED_SELECTION_TOOL_NAME) {
        throw new BedrockAnalysisError("BEDROCK_INVALID_OUTPUT", "Bedrock used an unexpected tool.", false);
      }

      let selection;
      try {
        selection = parseGroundedAnalysisSelection(toolUse.input, input.symbol, input.quote);
      }
      catch {
        throw new BedrockAnalysisError("BEDROCK_INVALID_OUTPUT", "Bedrock returned an unapproved insight selection.", false);
      }
      const rendered = renderGroundedAnalysis(selection, input);
      const result = validateAnalysisResult(attachApplicationMetadata(rendered, {
        symbol: input.symbol,
        locale: input.locale,
        dataAsOf: input.quote.marketTimestamp,
        modelId: this.modelId,
      }));
      if (!budget.active()) throw new BedrockAnalysisError("BEDROCK_TIMEOUT", "Bedrock request timed out.", true);
      return { result, usage };
    }
    catch (error) {
      if (options?.abortSignal?.aborted) throw cancelled();
      if (!budget.active()) throw new BedrockAnalysisError("BEDROCK_TIMEOUT", "Bedrock request timed out.", true);
      throw mapTransportError(error);
    }
    finally {
      budget.dispose();
    }
  }
}
