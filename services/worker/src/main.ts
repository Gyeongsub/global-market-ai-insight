import { validateCreateJobRequest } from "../../controller/src/validation.js";
import { attachApplicationMetadata, validateAnalysisResult } from "./analysis.js";
import { groundedSelectionPolicy, renderGroundedAnalysis } from "./grounded-analysis.js";
import { normalizeQuote, type ProviderQuote } from "./quote-normalizer.js";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BedrockAnalysisAdapter } from "./providers/bedrock-analysis-adapter.js";
import { AwsBedrockConverseTransport } from "./providers/aws-bedrock-converse-transport.js";
import { TwelveDataProvider } from "./providers/twelve-data-provider.js";
import { DynamoDbJobRepository } from "./repositories/job-repository.js";
import { parseAwsWorkerConfig } from "./worker-config.js";
import { runOneShotWorker, WorkerLifecycleError, type WorkerLifecycleDependencies } from "./worker-lifecycle.js";
import { armWorkerProcessDeadline } from "./process-deadline.js";
export { armWorkerProcessDeadline, WORKER_PROCESS_CEILING_MS } from "./process-deadline.js";

// Exporting the production transport keeps it in the single-file worker bundle.
// APP_ENV=aws requires explicit validated config; local fixtures never enter it.
export { AwsBedrockConverseTransport } from "./providers/aws-bedrock-converse-transport.js";
export { DynamoDbJobRepository } from "./repositories/job-repository.js";
export { runOneShotWorker } from "./worker-lifecycle.js";
// The offline runtime fixture exercises the same production adapters with
// injected transports. Exporting them does not create an endpoint or AWS call.
export { TwelveDataProvider } from "./providers/twelve-data-provider.js";
export { BedrockAnalysisAdapter } from "./providers/bedrock-analysis-adapter.js";

interface LocalJobFixture {
  operation: unknown;
  symbol: unknown;
  locale: unknown;
  quote: ProviderQuote;
}

function log(level: "info" | "error", fields: Record<string, unknown>) {
  // Misconfiguration is untrusted text too. Never log its original value.
  const environment = process.env.APP_ENV === "local" || process.env.APP_ENV === "aws" ? process.env.APP_ENV : "unknown";
  const sanitized = { timestamp: new Date().toISOString(), level, service: "worker", environment, ...fields };
  console.log(JSON.stringify(sanitized));
}

export function safeLogJobId(value: unknown): string | undefined {
  return typeof value === "string" && /^[A-Za-z0-9_-]{16,64}$/.test(value) ? value : undefined;
}

export function runLocalFixture(jobId: string, rawFixture: string) {
  const fixture = JSON.parse(rawFixture) as LocalJobFixture;
  const request = validateCreateJobRequest({ operation: fixture.operation, symbol: fixture.symbol, locale: fixture.locale });
  const quote = normalizeQuote(fixture.quote, request.symbol);

  if (request.operation === "PRICE") return quote;

  // Local mode selects only deterministic approved IDs; it never calls a model.
  // Reuse production rendering so three-language fixture acceptance is honest.
  const policy = groundedSelectionPolicy(request.symbol, quote);
  const rendered = renderGroundedAnalysis({
    observationIds: policy.allowed.observations,
    riskIds: policy.required.risks,
    specialConsiderationIds: policy.required.special,
    uncertaintyId: policy.required.uncertainty,
  }, {symbol: request.symbol, locale: request.locale, quote});
  return validateAnalysisResult(attachApplicationMetadata(rendered,
    { symbol: request.symbol, locale: request.locale, dataAsOf: quote.marketTimestamp, modelId: "local-fixture-model" }));
}

export function createAwsWorkerDependencies(environment: Record<string, string | undefined>): WorkerLifecycleDependencies {
  const config = parseAwsWorkerConfig(environment);
  return {
    repository: new DynamoDbJobRepository({ tableName: config.jobsTableName, region: config.region }),
    marketDataProvider: new TwelveDataProvider({ apiKey: config.twelveDataApiKey }),
    analysisEngine: new BedrockAnalysisAdapter({
      transport: new AwsBedrockConverseTransport({ region: config.region }),
      modelId: config.bedrockModelId,
      maxOutputTokens: config.bedrockMaxOutputTokens,
    }),
  };
}

export async function runWorkerEntry(
  environment: Record<string, string | undefined>,
  awsDependencies?: WorkerLifecycleDependencies,
) {
  const jobId = safeLogJobId(environment.JOB_ID);
  if (!jobId) throw new Error("JOB_ID must be a bounded application job identifier.");
  if (environment.APP_ENV === "local") {
    const fixture = environment.LOCAL_JOB_FIXTURE_JSON;
    if (!fixture) throw new Error("LOCAL_JOB_FIXTURE_JSON is required in local mode.");
    return runLocalFixture(jobId, fixture);
  }
  if (environment.APP_ENV !== "aws") throw new Error("APP_ENV must be local or aws.");
  return await runOneShotWorker(jobId, awsDependencies ?? createAwsWorkerDependencies(environment));
}

export function safeWorkerLogError(error: unknown): {
  errorCode: string;
  message: string;
  diagnosticCategory?: string;
} {
  if (error instanceof WorkerLifecycleError) {
    return {
      errorCode: error.code,
      message: error.message,
      ...(error.diagnosticCategory === undefined ? {} : { diagnosticCategory: error.diagnosticCategory }),
    };
  }
  return { errorCode: "WORKER_CONFIGURATION_ERROR", message: "Worker execution could not start." };
}

export function safeWorkerFailureLogFields(error: unknown): {
  errorCode: string;
  diagnosticCategory?: string;
} {
  const safe = safeWorkerLogError(error);
  return {
    errorCode: safe.errorCode,
    ...(safe.diagnosticCategory === undefined ? {} : { diagnosticCategory: safe.diagnosticCategory }),
  };
}

async function main() {
  const jobId = safeLogJobId(process.env.JOB_ID);
  const started = Date.now();
  log("info", { ...(jobId ? { jobId } : {}), status: "STARTING" });
  const result = await runWorkerEntry(process.env);
  const operation = "kind" in result ? result.kind === "PRICE" ? "PRICE" : "ANALYZE" : result.operation;
  log("info", { ...(jobId ? { jobId } : {}), status: "SUCCEEDED", operation, durationMs: Date.now() - started });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  // No environment override, retry, state rewrite or graceful-I/O wait here.
  // Keep the unref'ed guard armed even after main settles: an ignored abort
  // can otherwise retain a connection and keep the Fargate process running.
  armWorkerProcessDeadline(() => {
    const jobId = safeLogJobId(process.env.JOB_ID);
    log("error", { ...(jobId ? { jobId } : {}), status: "FAILED", errorCode: "WORKER_PROCESS_DEADLINE_EXCEEDED" });
  });
  main().catch((error: unknown) => {
    const safeError = safeWorkerFailureLogFields(error);
    const jobId = safeLogJobId(process.env.JOB_ID);
    log("error", { ...(jobId ? { jobId } : {}), status: "FAILED", ...safeError });
    process.exitCode = 1;
  });
}
