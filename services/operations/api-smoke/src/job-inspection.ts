import { GetItemCommand, type GetItemCommandOutput } from "@aws-sdk/client-dynamodb";
import { DescribeTasksCommand, type DescribeTasksCommandOutput } from "@aws-sdk/client-ecs";
import { SUPPORTED_LOCALES, SUPPORTED_SYMBOLS, type Locale, type SymbolCode } from "../../../controller/src/contracts.js";
import { inspectAnalysisResult } from "./analysis-inspection.js";

export interface InspectionInput {
  jobId: string; symbol: SymbolCode; locale: Locale; modelId: string;
  tableName: string; clusterArn: string; region: string;
}
export interface InspectionReaders {
  readJob(command: GetItemCommand, signal: AbortSignal): Promise<GetItemCommandOutput>;
  describeTask(command: DescribeTasksCommand, signal: AbortSignal): Promise<DescribeTasksCommandOutput>;
}

/** Two exact read-only calls at most. Never return a private field or raw SDK error. */
export async function inspectAnalysisJob(input: InspectionInput, readers: InspectionReaders) {
  const result = { passed: false, jobMatched: false, jobSucceeded: false, taskMatched: false, taskStopped: false, workerExitedCleanly: false,
    analysis: inspectAnalysisResult(null, input), readCalls: 0, readFailed: false };
  const cluster = /^arn:aws:ecs:([a-z0-9-]+):([0-9]{12}):cluster\/([A-Za-z0-9_-]+)$/.exec(input.clusterArn);
  if (!/^job_[a-f0-9]{48}$/.test(input.jobId) || !SUPPORTED_SYMBOLS.includes(input.symbol) || !SUPPORTED_LOCALES.includes(input.locale)
    || !/^[A-Za-z0-9_.-]{3,255}$/.test(input.tableName) || !cluster || cluster[1] !== input.region || input.region !== "ap-northeast-1"
    || !/^[A-Za-z0-9._:-]{1,160}$/.test(input.modelId)) return result;
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 15_000);
  try {
    result.readCalls += 1;
    const read = await readers.readJob(new GetItemCommand({ TableName: input.tableName, Key: { jobId: { S: input.jobId } }, ConsistentRead: true }), abort.signal);
    const item = read.Item;
    result.jobMatched = !!item && item.jobId?.S === input.jobId && item.operation?.S === "ANALYZE" && item.symbol?.S === input.symbol && item.locale?.S === input.locale;
    if (!result.jobMatched || !item) return result;
    result.jobSucceeded = item.status?.S === "SUCCEEDED" && item.attemptCount?.N === "1";
    const taskArn = item.taskArn?.S;
    const taskPrefix = input.clusterArn.replace(":cluster/", ":task/") + "/";
    if (!taskArn?.startsWith(taskPrefix) || !/^[a-f0-9]{32}$/.test(taskArn.slice(taskPrefix.length))) return result;
    result.readCalls += 1;
    const described = await readers.describeTask(new DescribeTasksCommand({ cluster: input.clusterArn, tasks: [taskArn] }), abort.signal);
    const task = described.tasks?.[0];
    result.taskMatched = !described.failures?.length && described.tasks?.length === 1 && task?.taskArn === taskArn && task.clusterArn === input.clusterArn;
    if (!result.taskMatched || !task) return result;
    result.taskStopped = task.lastStatus === "STOPPED" && task.desiredStatus === "STOPPED";
    result.workerExitedCleanly = task.containers?.length === 1 && task.containers[0]?.name === "worker" && task.containers[0]?.exitCode === 0;
    const raw = item.resultJson?.S;
    if (raw && Buffer.byteLength(raw, "utf8") <= 16_000) {
      try { result.analysis = inspectAnalysisResult(JSON.parse(raw), input); } catch { /* private invalid JSON */ }
    }
    result.passed = result.jobSucceeded && result.taskStopped && result.workerExitedCleanly && result.analysis.passed;
  } catch { result.readFailed = true; }
  finally { clearTimeout(timer); }
  return result;
}

export function parseInspectionPlan(args: string[]) {
  const values = new Map<string, string>();
  for (let i = 0; i < args.length; i += 1) {
    const key = args[i]!;
    if (!["--job-id", "--symbol", "--locale", "--execute"].includes(key) || values.has(key)) throw new Error("Invalid inspection option.");
    if (key === "--execute") values.set(key, "true");
    else {
      const value = args[++i];
      if (!value || value.startsWith("--")) throw new Error("Missing inspection option.");
      values.set(key, value);
    }
  }
  const jobId = values.get("--job-id") ?? "";
  const symbol = values.get("--symbol") as SymbolCode;
  const locale = values.get("--locale") as Locale;
  if (!/^job_[a-f0-9]{48}$/.test(jobId) || !SUPPORTED_SYMBOLS.includes(symbol) || !SUPPORTED_LOCALES.includes(locale)) throw new Error("Explicit valid job, symbol and locale required.");
  return { jobId, symbol, locale, execute: values.has("--execute") };
}
