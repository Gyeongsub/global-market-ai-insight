import type { BedrockConverseResponse } from "../../worker/src/providers/bedrock-analysis-adapter.js";

const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
type ResponseFailureReason = "RESPONSE_SHAPE" | "USAGE_SHAPE" |
  "CACHE_READ_USAGE" | "CACHE_WRITE_USAGE" | "CACHE_DETAILS";
class ResponseFailure extends Error {
  constructor(readonly reason: ResponseFailureReason) { super("SYNTHETIC_EXPIRY_RESPONSE_UNVERIFIED"); }
}
/** Fixed labels only: never retain field names, values or arbitrary error data. */
export function syntheticExpiryResponseFailureSummary(error: unknown) {
  return error instanceof ResponseFailure ? error.reason : null;
}
/** Native Converse JSON is not the internal three-counter usage contract.
 * Accept only documented, inactive cache metadata for this no-cache experiment.
 * Optional nulls are absent in the pinned SDK's JSON deserializer; required
 * counters are never defaulted or repaired. This is not evidence of live nulls.
 * The existing domain validator still checks counters, caps, sums and tool output.
 * Like the pinned SDK and existing SDK transport, unmodeled response metadata is
 * projected out, not treated as instructions, usage counters or browser content.
 * Required counters are not repaired; known active cache usage is still rejected.
 * This response projection cannot change the fixed request or authorize retries. */
export function normalizeSyntheticExpiryResponse(value: unknown): BedrockConverseResponse {
  const fail = (reason: ResponseFailureReason): never => { throw new ResponseFailure(reason); };
  if (!object(value)) return fail("RESPONSE_SHAPE");
  if (!object(value.usage)) return fail("USAGE_SHAPE");
  const usage = value.usage;
  if (Object.hasOwn(usage, "cacheReadInputTokens") && usage.cacheReadInputTokens !== null && usage.cacheReadInputTokens !== 0)
    return fail("CACHE_READ_USAGE");
  if (Object.hasOwn(usage, "cacheWriteInputTokens") && usage.cacheWriteInputTokens !== null && usage.cacheWriteInputTokens !== 0)
    return fail("CACHE_WRITE_USAGE");
  if (Object.hasOwn(usage, "cacheDetails") && usage.cacheDetails !== null && (!Array.isArray(usage.cacheDetails) || usage.cacheDetails.length !== 0))
    return fail("CACHE_DETAILS");
  return { ...value, usage: { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, totalTokens: usage.totalTokens } } as unknown as BedrockConverseResponse;
}
