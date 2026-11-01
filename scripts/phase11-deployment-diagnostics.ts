import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const MAX_INPUT_BYTES = 2_000_000;
const MAX_EVENTS = 200;
const RESOURCE_TYPES = new Set([
  "AWS::CloudFormation::Stack", "AWS::CloudWatch::Alarm", "AWS::CloudWatch::Dashboard",
  "AWS::Logs::MetricFilter", "AWS::Logs::LogGroup", "AWS::Events::Rule",
  "AWS::IAM::Policy", "AWS::IAM::Role", "AWS::Lambda::EventInvokeConfig",
  "AWS::Lambda::Function", "AWS::Lambda::Permission",
]);
const FAILURE_STATUSES = new Set([
  "CREATE_FAILED", "UPDATE_FAILED", "DELETE_FAILED", "ROLLBACK_FAILED",
  "ROLLBACK_COMPLETE", "UPDATE_ROLLBACK_FAILED", "UPDATE_ROLLBACK_COMPLETE",
]);
const CHANGE_SET_STATUSES = new Set(["FAILED", "CREATE_COMPLETE", "CREATE_PENDING", "CREATE_IN_PROGRESS", "DELETE_COMPLETE", "DELETE_FAILED", "DELETE_PENDING", "DELETE_IN_PROGRESS"]);
const SIGNALS = [
  ["AUTHENTICATION", /ExpiredToken|InvalidClientTokenId|UnrecognizedClientException|SSO session.*expired|login session.*expired/i],
  ["AUTHORIZATION", /AccessDenied|UnauthorizedOperation|not authorized to perform|insufficient permissions/i],
  ["MISSING_EXPORT", /No export named|Export.*cannot be found|export.*does not exist/i],
  ["NAME_CONFLICT", /AlreadyExists|already exists|ResourceConflictException/i],
  ["QUOTA", /LimitExceeded|ServiceQuotaExceeded|quota.*exceeded|reserved concurrency.*minimum/i],
  ["BOOTSTRAP", /bootstrap stack.*not found|SSM parameter.*bootstrap.*not found|requires bootstrap stack/i],
  ["ASSET_PUBLISH", /Failed to publish.*asset|asset publishing.*failed|NoSuchBucket/i],
  ["EARLY_VALIDATION", /AWS::EarlyValidation::|early validation.*failed/i],
  ["TEMPLATE_VALIDATION", /ValidationError|Template format error|Invalid template|Unresolved resource dependencies/i],
  ["THROTTLING", /ThrottlingException|TooManyRequestsException|Rate exceeded/i],
] as const;

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
}

function text(value: unknown): string {
  if (value === undefined) return "";
  if (typeof value !== "string" || Buffer.byteLength(value, "utf8") > MAX_INPUT_BYTES) throw new Error("INVALID_INPUT");
  return value;
}

function collection(value: unknown, key: string): { values: unknown[]; complete: boolean } {
  if (value === undefined) return { values: [], complete: false };
  const response = object(value);
  if (!response || !Array.isArray(response[key]) || response[key].length > MAX_EVENTS) throw new Error("INVALID_INPUT");
  return { values: response[key], complete: response.NextToken === undefined && response.nextToken === undefined };
}

/** Read-only classifier: raw output is examined in memory, never returned or persisted. */
export function classifyPhase11DeploymentFailure(input: unknown): Record<string, unknown> {
  const root = object(input);
  if (!root || Buffer.byteLength(JSON.stringify(root), "utf8") > MAX_INPUT_BYTES) throw new Error("INVALID_INPUT");
  const process = root.process === undefined ? null : object(root.process);
  if (root.process !== undefined && (!process || !Number.isInteger(process.exitCode) ||
      Number(process.exitCode) < 0 || Number(process.exitCode) > 255)) throw new Error("INVALID_INPUT");
  const events = collection(root.stackEvents, "StackEvents");
  const changes = collection(root.changeSets, "Summaries");
  const reasons = [text(process?.stdout), text(process?.stderr)];
  const resourceFailures = new Map<string, number>();
  let failureEvents = 0;
  for (const candidate of events.values) {
    const event = object(candidate);
    if (!event || typeof event.ResourceStatus !== "string") throw new Error("INVALID_INPUT");
    if (!FAILURE_STATUSES.has(event.ResourceStatus)) continue;
    failureEvents += 1;
    reasons.push(text(event.ResourceStatusReason));
    const type = RESOURCE_TYPES.has(String(event.ResourceType)) ? String(event.ResourceType) : "OTHER_RESOURCE";
    resourceFailures.set(type, (resourceFailures.get(type) ?? 0) + 1);
  }
  const changeSetStatuses = new Set<string>();
  for (const candidate of changes.values) {
    const change = object(candidate);
    if (!change || !CHANGE_SET_STATUSES.has(String(change.Status))) throw new Error("INVALID_INPUT");
    changeSetStatuses.add(String(change.Status));
    if (change.Status === "FAILED") reasons.push(text(change.StatusReason));
  }
  const combined = reasons.join("\n").replace(/\x1b\[[0-9;]*m/g, "");
  const signals = SIGNALS.filter(([, pattern]) => pattern.test(combined)).map(([category]) => category);
  return {
    mode: "local-phase11-deployment-diagnostics",
    awsCalls: 0,
    cloudMutations: 0,
    rawOutputPersisted: false,
    rawIdentifiersPrinted: false,
    processFailed: process ? process.exitCode !== 0 : null,
    stackEventsComplete: events.complete,
    changeSetsComplete: changes.complete,
    failureEvents,
    failedResourceTypes: Object.fromEntries([...resourceFailures].sort(([a], [b]) => a.localeCompare(b))),
    changeSetStatuses: [...changeSetStatuses].sort(),
    signals,
    causeConfirmed: false,
    requiresPrivateInspection: true,
    nextAction: signals.length ? "VERIFY_MATCHING_SIGNAL_PRIVATELY_BEFORE_RETRY" : "COLLECT_BOUNDED_PRIVATE_DIAGNOSTICS_BEFORE_RETRY",
    readyForRetry: false,
  };
}

async function readInput(): Promise<string> {
  let bytes = 0;
  const chunks: Buffer[] = [];
  const timer = setTimeout(() => process.stdin.destroy(new Error("INPUT_TIMEOUT")), 10_000);
  try {
    for await (const chunk of process.stdin) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bytes += buffer.length;
      if (bytes > MAX_INPUT_BYTES) throw new Error("INPUT_TOO_LARGE");
      chunks.push(buffer);
    }
    return Buffer.concat(chunks).toString("utf8");
  } finally { clearTimeout(timer); }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log(JSON.stringify({ mode: "dry-run", operation: "phase11-deployment-diagnostics", awsCalls: 0, cloudMutations: 0, inputBytesMax: MAX_INPUT_BYTES, readyForRetry: false }));
    return;
  }
  if (args.length !== 1 || args[0] !== "--stdin-json") throw new Error("INVALID_ARGUMENTS");
  console.log(JSON.stringify(classifyPhase11DeploymentFailure(JSON.parse(await readInput()))));
}

const entry = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === entry) {
  main().catch(() => {
    console.error(JSON.stringify({ error: "DEPLOYMENT_DIAGNOSTICS_FAILED", rawDetailsSuppressed: true }));
    process.exitCode = 1;
  });
}
