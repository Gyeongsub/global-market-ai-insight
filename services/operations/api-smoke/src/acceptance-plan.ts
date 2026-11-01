import { SUPPORTED_LOCALES, SUPPORTED_SYMBOLS, type Locale, type SymbolCode } from "../../../controller/src/contracts.js";

/** Parse before reading credentials or creating a transport. No AWS calls. */
export function parseAcceptancePlan(args: string[]) {
  let operation: "PRICE" | "ANALYZE" = "PRICE";
  // Preserve the historical smoke-test defaults; product UI still defaults to en.
  let symbol: SymbolCode = "QLD";
  let locale: Locale = "ko";
  const seen = new Set<string>();
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (seen.has(arg)) throw new Error("Duplicate acceptance option.");
    seen.add(arg);
    if (arg === "--operation") {
      const value = args[++index];
      if (value !== "PRICE" && value !== "ANALYZE") throw new Error("Operation must be PRICE or ANALYZE.");
      operation = value;
    } else if (arg === "--symbol") {
      const value = args[++index];
      if (!SUPPORTED_SYMBOLS.includes(value as SymbolCode)) throw new Error("Unsupported acceptance symbol.");
      symbol = value as SymbolCode;
    } else if (arg === "--locale") {
      const value = args[++index];
      if (!SUPPORTED_LOCALES.includes(value as Locale)) throw new Error("Unsupported acceptance locale.");
      locale = value as Locale;
    } else if (!["--execute", "--confirm-one-task", "--confirm-one-bedrock-call"].includes(arg)) {
      throw new Error("Unknown acceptance option.");
    }
  }
  const execute = seen.has("--execute");
  if (execute && !seen.has("--confirm-one-task")) throw new Error("Execution requires --confirm-one-task.");
  if (execute && operation === "ANALYZE" && !seen.has("--confirm-one-bedrock-call")) {
    throw new Error("ANALYZE execution requires --confirm-one-bedrock-call.");
  }
  return {
    mode: execute ? "execute" as const : "dry-run" as const,
    operation,
    symbol,
    locale,
    region: "ap-northeast-1",
    taskLaunchesMax: execute ? 1 : 0,
    providerCallsMax: execute ? 3 : 0,
    bedrockCallsMax: execute && operation === "ANALYZE" ? 1 : 0,
    apiCallsMax: execute ? 18 : 0,
    workerDeadlineSeconds: 90,
    bedrockOutputTokensMax: operation === "ANALYZE" ? 512 : 0,
    resultDisplayEnabled: false,
  };
}
