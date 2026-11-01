import { validateCreateJobRequest } from "../../controller/src/validation.js";
import type { AnalysisResult } from "./analysis.js";
import type { BedrockAnalysisExecution } from "./providers/bedrock-analysis-adapter.js";
import type { MarketDataProvider } from "./providers/market-data-provider.js";
import { normalizeQuote, type NormalizedQuote } from "./quote-normalizer.js";
import { ElapsedBudget } from "../../../shared/time/elapsed-budget.js";

export interface AnalysisEngine {
  analyze(input: {
    symbol: Parameters<typeof normalizeQuote>[1];
    locale: ReturnType<typeof validateCreateJobRequest>["locale"];
    quote: NormalizedQuote;
  }, options?: { abortSignal?: AbortSignal }): Promise<BedrockAnalysisExecution>;
}

export interface WorkerOperationDeadline {
  deadlineAt: string;
  now: () => Date;
  elapsedNow?: () => number;
}

export class WorkerOperationDeadlineError extends Error {
  constructor() {
    super("Job deadline expired during worker execution.");
    this.name = "WorkerOperationDeadlineError";
  }
}

export function assertWorkerOperationDeadline(deadline?: WorkerOperationDeadline): void {
  if (!deadline) return;
  const deadlineMs = Date.parse(deadline.deadlineAt);
  const currentMs = deadline.now().getTime();
  if (!Number.isFinite(deadlineMs) || !Number.isFinite(currentMs) || currentMs >= deadlineMs) {
    throw new WorkerOperationDeadlineError();
  }
}

export async function executeWorkerOperation(
  rawRequest: unknown,
  dependencies: { marketDataProvider: MarketDataProvider; analysisEngine: AnalysisEngine },
  deadline?: WorkerOperationDeadline,
): Promise<NormalizedQuote | AnalysisResult> {
  const request = validateCreateJobRequest(rawRequest);
  assertWorkerOperationDeadline(deadline);
  // Never renew the total job budget between provider and model. A stalled
  // dependency must settle the caller even if it ignores the abort request.
  const budget = deadline ? new ElapsedBudget(Math.max(1, Math.min(300_000,
    Date.parse(deadline.deadlineAt) - deadline.now().getTime())), deadline.elapsedNow, undefined,
    () => new WorkerOperationDeadlineError()) : undefined;
  const call = <T>(send: (options?: {abortSignal?: AbortSignal}) => Promise<T>) => budget
    ? budget.call(signal => send({abortSignal: signal})) : send();
  const assertActive = () => {
    assertWorkerOperationDeadline(deadline);
    if (budget && !budget.active()) throw new WorkerOperationDeadlineError();
  };
  try {
    assertActive();
    const providerQuote = await call(options => dependencies.marketDataProvider.getQuote(request.symbol, options));
    assertActive();
    const quote = normalizeQuote(providerQuote, request.symbol);
    if (request.operation === "PRICE") return quote;
    // The provider may have consumed the remaining budget. Never start a new
    // billable model stage using only the earlier QUEUED -> RUNNING check.
    assertActive();
    const execution = await call(options => dependencies.analysisEngine.analyze({ symbol: request.symbol, locale: request.locale, quote }, options));
    assertActive();
    return execution.result;
  } catch (error) {
    if (budget && !budget.active()) throw new WorkerOperationDeadlineError();
    throw error;
  } finally {
    budget?.dispose();
  }
}
