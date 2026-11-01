import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { basename, isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { cleanSourceChildEnvironment } from "./local-proof-environment.mjs";

const PROFILE = "gmai-admin";
const REGION = "ap-northeast-1";
const BUDGET_REGION = "us-east-1";
const PREFIX = "global-market-ai-insight-dev";
const MAX_OUTPUT_BYTES = 2_000_000;
// DescribeLogGroups accepts at most 50 entries, unlike the Budgets read.
export const PHASE11_LOG_GROUP_PAGE_LIMIT = "50";

type JsonObject = Record<string, unknown>;
type CliRunner = (args: readonly string[]) => unknown;

const SAFE_QUERY_STAGES = new Set([
  "sts.get-caller-identity",
  "budgets.describe-budgets",
  "cloudformation.describe-stacks",
  "lambda.get-function-configuration",
  "ecs.list-tasks",
  "ecs.list-services",
  "ecs.describe-task-definition",
  "dynamodb.get-item",
  "cloudformation.list-stack-resources",
  "apigatewayv2.get-api",
  "apigatewayv2.get-routes",
  "apigatewayv2.get-integrations",
  "dynamodb.describe-table",
  "logs.describe-log-groups",
]);

class ReadinessSafeError extends Error {
  constructor(readonly code: string, readonly stage: string) {
    super(code);
  }
}

export function summarizeReadinessFailure(error: unknown): Record<string, string> {
  if (error instanceof ReadinessSafeError &&
      /^[A-Z_]{3,48}$/.test(error.code) &&
      /^[a-z0-9-]+(?:\.[a-z-]+)?$/.test(error.stage)) {
    return { error: error.code, stage: error.stage };
  }
  return { error: "READINESS_CHECK_FAILED", stage: "unknown" };
}

export function parseReadOnlyAwsOutput(output: string, stage: string): unknown {
  if (output.trim() === "" && stage === "dynamodb.get-item") return {};
  try { return JSON.parse(output); }
  catch { throw new ReadinessSafeError("AWS_RESPONSE_INVALID", stage); }
}

export interface Phase11ReadinessSnapshot {
  identity: unknown;
  budgets: unknown;
  stacks: unknown;
  controller: unknown;
  runningTasks: unknown;
  pendingTasks: unknown;
  services: unknown;
  taskDefinition: unknown;
  circuit: unknown;
  slots: readonly unknown[];
}

function object(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : null;
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function string(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function numeric(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value) ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function completeCollection(value: unknown, key: string): unknown[] | null {
  const response = object(value);
  // One page is the whole bounded read only when no continuation is present.
  if (!response || response.NextToken !== undefined || response.nextToken !== undefined ||
      !Array.isArray(response[key])) return null;
  return response[key] as unknown[];
}

function completeArnCount(value: unknown, key: string): number | null {
  const values = completeCollection(value, key);
  return values && values.every(candidate => typeof candidate === "string" && candidate.startsWith("arn:aws:"))
    ? values.length : null;
}

function slotOccupied(value: unknown): boolean | null {
  const response = object(value);
  if (!response) return null;
  if (!Object.hasOwn(response, "Item")) return false;
  const item = object(response.Item);
  return item && Object.keys(item).length > 0 ? true : null;
}

function attributeString(item: JsonObject | null, name: string): string | null {
  return string(object(item?.[name])?.S);
}

function attributeNumber(item: JsonObject | null, name: string): number | null {
  return numeric(object(item?.[name])?.N);
}

function stackMap(stacks: unknown): Map<string, JsonObject> | null {
  const values = completeCollection(stacks, "Stacks");
  if (!values) return null;
  const result = new Map<string, JsonObject>();
  for (const candidate of values) {
    const stack = object(candidate);
    const name = string(stack?.StackName);
    if (!stack || !name || result.has(name) || !string(stack.StackStatus)?.match(/^[A-Z_]{3,64}$/)) return null;
    result.set(name, stack);
  }
  return result;
}

function safeStackStatus(stacks: Map<string, JsonObject> | null, name: string): string {
  if (!stacks) return "UNKNOWN";
  const status = string(stacks.get(name)?.StackStatus);
  return status && /^[A-Z_]{3,64}$/.test(status) ? status : "ABSENT";
}

function budgetSummary(budgetsValue: unknown): { usd5MonthlyCostBudgets: number; actualUsd: number | null; forecastUsd: number | null } {
  const matches = (completeCollection(budgetsValue, "Budgets") ?? []).filter(candidate => {
    const budget = object(candidate);
    const limit = object(budget?.BudgetLimit);
    return budget?.BudgetType === "COST" && budget?.TimeUnit === "MONTHLY" &&
      limit?.Unit === "USD" && numeric(limit?.Amount) === 5;
  }).map(candidate => object(candidate)!);
  // Multiple matching budgets require operator review rather than choosing one.
  const first = matches.length === 1 ? matches[0] : undefined;
  const spend = object(first?.CalculatedSpend);
  const actual = object(spend?.ActualSpend);
  const forecast = object(spend?.ForecastedSpend);
  return {
    usd5MonthlyCostBudgets: matches.length,
    actualUsd: actual?.Unit === "USD" ? numeric(actual.Amount) : null,
    forecastUsd: forecast?.Unit === "USD" ? numeric(forecast.Amount) : null,
  };
}

export function evaluatePhase11Readiness(snapshot: Phase11ReadinessSnapshot): Record<string, unknown> {
  const identity = object(snapshot.identity);
  const account = string(identity?.Account);
  const arn = string(identity?.Arn);
  const accountShapeValid = account !== null && /^\d{12}$/.test(account) && !/^0+$/.test(account);
  const expectedPrincipal = accountShapeValid && arn === `arn:aws:iam::${account}:user/aws-admin-user`;
  const budgets = budgetSummary(snapshot.budgets);
  const budgetSpendWithinLimit = budgets.actualUsd !== null && budgets.actualUsd >= 0 && budgets.actualUsd < 5 &&
    budgets.forecastUsd !== null && budgets.forecastUsd >= 0 && budgets.forecastUsd < 5;
  const stacks = stackMap(snapshot.stacks);
  const stackStates = {
    foundation: safeStackStatus(stacks, `${PREFIX}-foundation`),
    compute: safeStackStatus(stacks, `${PREFIX}-compute`),
    api: safeStackStatus(stacks, `${PREFIX}-api`),
    operations: safeStackStatus(stacks, `${PREFIX}-operations`),
    alarmCircuit: safeStackStatus(stacks, `${PREFIX}-alarm-circuit`),
    maintenance: safeStackStatus(stacks, `${PREFIX}-maintenance`),
  };
  const baselineStacksHealthy = [stackStates.foundation, stackStates.compute, stackStates.api]
    .every(status => /^(?:CREATE|UPDATE)_COMPLETE$/.test(status));
  const targetsAbsent = stackStates.operations === "ABSENT" && stackStates.alarmCircuit === "ABSENT" && stackStates.maintenance === "ABSENT";

  const variables = object(object(object(snapshot.controller)?.Environment)?.Variables);
  const internalJobsEnabled = variables?.ENABLE_PROVIDER_BACKED_JOBS === "true";
  const liveResultDisplayEnabled = variables?.ENABLE_LIVE_RESULT_DISPLAY === "true";
  const executionFlagsVerifiedDisabled = variables?.ENABLE_PROVIDER_BACKED_JOBS === "false" &&
    variables?.ENABLE_LIVE_RESULT_DISPLAY === "false";
  const taskDefinitionReference = string(variables?.WORKER_TASK_DEFINITION);
  const taskDefinitionScopeValid = accountShapeValid && taskDefinitionReference !== null &&
    new RegExp(`^arn:aws:ecs:${REGION}:${account}:task-definition/${PREFIX}-worker:[1-9][0-9]*$`).test(taskDefinitionReference);

  const taskDefinition = object(object(snapshot.taskDefinition)?.taskDefinition);
  const containers = array(taskDefinition?.containerDefinitions);
  const worker = containers.length === 1 ? object(containers[0]) : null;
  const image = string(worker?.image);
  const imagePinnedByDigest = accountShapeValid && image !== null &&
    new RegExp(`^${account}\\.dkr\\.ecr\\.${REGION}\\.amazonaws\\.com/${PREFIX}-worker@sha256:[0-9a-f]{64}$`).test(image);
  const taskDefinitionMatchesController = taskDefinitionReference !== null &&
    string(taskDefinition?.taskDefinitionArn) === taskDefinitionReference;
  const hardenedWorker = worker?.readonlyRootFilesystem === true && worker?.user === "65532:65532";

  const runningTasks = completeArnCount(snapshot.runningTasks, "taskArns");
  const pendingTasks = completeArnCount(snapshot.pendingTasks, "taskArns");
  const services = completeArnCount(snapshot.services, "serviceArns");

  const circuitItem = object(object(snapshot.circuit)?.Item);
  const circuitState = attributeString(circuitItem, "state");
  const circuitVersion = attributeNumber(circuitItem, "version");
  const circuitVerifiedOpen = attributeString(circuitItem, "jobId") === "control_circuit" && circuitState === "OPEN" && circuitVersion !== null &&
    Number.isSafeInteger(circuitVersion) && circuitVersion >= 1;
  const slotStates = snapshot.slots.map(slotOccupied);
  const occupiedSlots = slotStates.length === 2 && slotStates.every(value => value !== null)
    ? slotStates.filter(Boolean).length : null;

  const readyForAccountSpecificDiff = accountShapeValid && expectedPrincipal &&
    budgets.usd5MonthlyCostBudgets === 1 && budgetSpendWithinLimit && baselineStacksHealthy && targetsAbsent &&
    executionFlagsVerifiedDisabled && taskDefinitionScopeValid && runningTasks === 0 &&
    pendingTasks === 0 && services === 0 && imagePinnedByDigest &&
    taskDefinitionMatchesController && hardenedWorker && circuitVerifiedOpen && occupiedSlots === 0;

  return {
    mode: "phase11-live-readiness",
    workloadRegion: REGION,
    awsCalls: 11,
    cloudMutations: 0,
    accountShapeValid,
    expectedPrincipal,
    budget: { ...budgets, spendWithinLimit: budgetSpendWithinLimit },
    stacks: stackStates,
    compute: {
      internalJobsEnabled,
      liveResultDisplayEnabled,
      executionFlagsVerifiedDisabled,
      taskDefinitionScopeValid,
      runningTasks,
      pendingTasks,
      services,
      imagePinnedByDigest,
      taskDefinitionMatchesController,
      hardenedWorker,
    },
    circuit: { verifiedOpen: circuitVerifiedOpen, version: circuitVerifiedOpen ? circuitVersion : null },
    occupiedSlots,
    readyForAccountSpecificDiff,
    readyForDeployment: false,
    approvalsStillRequired: [
      "current Tokyo pricing and exact CloudFormation/IAM diff",
      "deployment of the two target stacks",
      "temporary exact-version circuit close and one synthetic log batch",
      "verified teardown and delayed-billing review",
    ],
  };
}

function awsExecutable(): string {
  const configured = process.env.GMAI_AWS_CLI_PATH;
  if (!configured) return "aws";
  if (!isAbsolute(configured) || !["aws", "aws.exe"].includes(basename(configured).toLowerCase()) ||
      !existsSync(configured) || !statSync(configured).isFile()) {
    throw new Error("Invalid AWS CLI path.");
  }
  return configured;
}

/** Reject changed destination, TLS/debug flags and widened resources before spawning a CLI. */
export function validatePhase11ReadOnlyQuery(args: readonly string[]): string {
  const stage = `${args[0] ?? ""}.${args[1] ?? ""}`;
  if (!SAFE_QUERY_STAGES.has(stage)) throw new ReadinessSafeError("AWS_OPERATION_NOT_ALLOWLISTED", "unknown");
  const invalid = () => { throw new ReadinessSafeError("AWS_QUERY_ARGUMENTS_INVALID", stage); };
  if (args.length > 32 || args.some(value => typeof value !== "string" || value.length > 4096)) invalid();
  const options = new Map<string, string | true>();
  const switches = new Set(["--no-cli-pager", "--no-paginate", "--consistent-read"]);
  for (let index = 2; index < args.length; index += 1) {
    const key = args[index]!;
    if (!key.startsWith("--") || options.has(key)) invalid();
    if (switches.has(key)) options.set(key, true);
    else {
      const value = args[++index];
      if (value === undefined || value.startsWith("--")) invalid();
      options.set(key, value!);
    }
  }
  const extras: Record<string, readonly string[]> = {
    "sts.get-caller-identity": [],
    "budgets.describe-budgets": ["--account-id", "--max-results"],
    "cloudformation.describe-stacks": [],
    "cloudformation.list-stack-resources": ["--stack-name"],
    "lambda.get-function-configuration": ["--function-name"],
    "ecs.list-tasks": ["--cluster", "--desired-status"],
    "ecs.list-services": ["--cluster"],
    "ecs.describe-task-definition": ["--task-definition"],
    "dynamodb.get-item": ["--table-name", "--key", "--consistent-read"],
    "dynamodb.describe-table": ["--table-name"],
    "apigatewayv2.get-api": ["--api-id"],
    "apigatewayv2.get-routes": ["--api-id"],
    "apigatewayv2.get-integrations": ["--api-id"],
    "logs.describe-log-groups": ["--log-group-name-prefix", "--limit"],
  };
  const required = ["--profile", "--region", "--output", "--no-cli-pager", "--no-paginate", ...extras[stage]!];
  if (options.size !== required.length || required.some(key => !options.has(key)) || options.get("--profile") !== PROFILE ||
      options.get("--region") !== (stage === "budgets.describe-budgets" ? BUDGET_REGION : REGION) || options.get("--output") !== "json") invalid();
  const matches = (key: string, pattern: RegExp) => typeof options.get(key) === "string" && pattern.test(options.get(key) as string);
  if (options.has("--account-id") && (!matches("--account-id", /^[0-9]{12}$/) || options.get("--max-results") !== "100")) invalid();
  if (options.has("--stack-name") && ![`${PREFIX}-foundation`, `${PREFIX}-compute`, `${PREFIX}-api`].includes(options.get("--stack-name") as string)) invalid();
  if (options.has("--function-name") && options.get("--function-name") !== `${PREFIX}-controller`) invalid();
  if (options.has("--cluster") && options.get("--cluster") !== `${PREFIX}-worker`) invalid();
  if (options.has("--desired-status") && !["RUNNING", "PENDING"].includes(options.get("--desired-status") as string)) invalid();
  if (options.has("--task-definition") && !matches("--task-definition", new RegExp(`^arn:aws:ecs:${REGION}:[0-9]{12}:task-definition/${PREFIX}-worker:[1-9][0-9]*$`))) invalid();
  if (options.has("--table-name") && options.get("--table-name") !== `${PREFIX}-jobs`) invalid();
  if (options.has("--key")) {
    let key: JsonObject | null = null;
    try { key = object(JSON.parse(options.get("--key") as string)); } catch { invalid(); }
    const partition = object(key?.jobId);
    if (!key || Object.keys(key).length !== 1 || !partition || Object.keys(partition).length !== 1 ||
        typeof partition.S !== "string" || !["control_circuit", "control_slot_0", "control_slot_1"].includes(partition.S)) invalid();
  }
  if (options.has("--api-id") && !matches("--api-id", /^[a-z0-9]{10}$/)) invalid();
  if (options.has("--log-group-name-prefix") && (![`/aws/apigateway/${PREFIX}-api-access`, `/aws/lambda/${PREFIX}-controller`, `/aws/ecs/${PREFIX}/worker`]
      .includes(options.get("--log-group-name-prefix") as string) || options.get("--limit") !== PHASE11_LOG_GROUP_PAGE_LIMIT)) invalid();
  return stage;
}

export function phase11ReadOnlyChildEnvironment(input: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  try {
    const env = cleanSourceChildEnvironment(input);
    // Preserve only the existing operator-selected profile configuration
    // location. This is not permission to read arbitrary secret values or to
    // trust credential_process/profile contents; those remain an operator boundary.
    let profileFile: string | undefined;
    for (const [key, value] of Object.entries(input)) {
      if (key.toUpperCase() !== "AWS_CONFIG_FILE" || value === undefined) continue;
      if (typeof value !== "string" || value.length > 32768 || /[\0\r\n]/.test(value) ||
          profileFile !== undefined && profileFile !== value) throw new Error("Invalid profile location.");
      profileFile = value;
    }
    return {...env, ...(profileFile === undefined ? {} : {AWS_CONFIG_FILE: profileFile}),
      AWS_PROFILE: PROFILE, AWS_CSM_ENABLED: "false"};
  } catch {
    throw new ReadinessSafeError("AWS_CHILD_ENVIRONMENT_INVALID", "unknown");
  }
}

interface ReadOnlyCliDependencies {
  now?: () => number;
  spawn?: (executable: string, args: readonly string[], options: { encoding: "utf8"; timeout: number; maxBuffer: number; windowsHide: boolean; env: NodeJS.ProcessEnv }) => { status: number | null; signal: string | null; stdout: unknown };
}

export function createPhase11ReadOnlyCliRunner(dependencies: ReadOnlyCliDependencies = {}): CliRunner {
  const executable = awsExecutable();
  const env = phase11ReadOnlyChildEnvironment(process.env);
  const now = dependencies.now ?? Date.now;
  const spawn = dependencies.spawn ?? ((command, args, options) => spawnSync(command, args, options));
  let calls = 0;
  const started = now();
  if (!Number.isSafeInteger(started) || started < 0) throw new ReadinessSafeError("AWS_READ_LIMIT_EXCEEDED", "unknown");
  return args => {
    const stage = validatePhase11ReadOnlyQuery(args);
    const elapsed = now() - started;
    if (calls >= 12 || !Number.isSafeInteger(elapsed) || elapsed >= 180_000 || elapsed < 0) throw new ReadinessSafeError("AWS_READ_LIMIT_EXCEEDED", stage);
    calls += 1;
    const result = spawn(executable, [...args], {
      encoding: "utf8",
      timeout: Math.min(30_000, 180_000 - elapsed),
      maxBuffer: MAX_OUTPUT_BYTES,
      windowsHide: true,
      env,
    });
    const finishedElapsed = now() - started;
    if (!Number.isSafeInteger(finishedElapsed) || finishedElapsed >= 180_000 || finishedElapsed < 0) throw new ReadinessSafeError("AWS_READ_LIMIT_EXCEEDED", stage);
    if (result.status !== 0 || result.signal !== null || typeof result.stdout !== "string" ||
        Buffer.byteLength(result.stdout, "utf8") > MAX_OUTPUT_BYTES) {
      throw new ReadinessSafeError("AWS_READ_FAILED", stage);
    }
    return parseReadOnlyAwsOutput(result.stdout, stage);
  };
}

function common(service: string, operation: string, region: string, extra: readonly string[] = []): string[] {
  return [service, operation, ...extra, "--profile", PROFILE, "--region", region, "--no-cli-pager", "--no-paginate", "--output", "json"];
}

export function collectPhase11Readiness(run: CliRunner): Record<string, unknown> {
  const identity = run(common("sts", "get-caller-identity", REGION));
  const account = string(object(identity)?.Account);
  if (!account || !/^\d{12}$/.test(account) || /^0+$/.test(account)) {
    throw new ReadinessSafeError("IDENTITY_VALIDATION_FAILED", "identity");
  }
  if (string(object(identity)?.Arn) !== `arn:aws:iam::${account}:user/aws-admin-user`) {
    throw new ReadinessSafeError("IDENTITY_VALIDATION_FAILED", "identity");
  }
  const controllerName = `${PREFIX}-controller`;
  const cluster = `${PREFIX}-worker`;
  const table = `${PREFIX}-jobs`;
  const controller = run(common("lambda", "get-function-configuration", REGION, ["--function-name", controllerName]));
  const taskDefinition = string(object(object(object(controller)?.Environment)?.Variables)?.WORKER_TASK_DEFINITION);
  if (!taskDefinition || !new RegExp(`^arn:aws:ecs:${REGION}:${account}:task-definition/${PREFIX}-worker:[1-9][0-9]*$`).test(taskDefinition)) {
    throw new ReadinessSafeError("CONTROLLER_CONFIGURATION_FAILED", "controller");
  }
  const getItem = (key: string) => run(common("dynamodb", "get-item", REGION, [
    "--table-name", table,
    "--key", JSON.stringify({ jobId: { S: key } }),
    "--consistent-read",
  ]));
  const snapshot: Phase11ReadinessSnapshot = {
    identity,
    budgets: run(common("budgets", "describe-budgets", BUDGET_REGION, ["--account-id", account, "--max-results", "100"])),
    stacks: run(common("cloudformation", "describe-stacks", REGION)),
    controller,
    runningTasks: run(common("ecs", "list-tasks", REGION, ["--cluster", cluster, "--desired-status", "RUNNING"])),
    pendingTasks: run(common("ecs", "list-tasks", REGION, ["--cluster", cluster, "--desired-status", "PENDING"])),
    services: run(common("ecs", "list-services", REGION, ["--cluster", cluster])),
    taskDefinition: run(common("ecs", "describe-task-definition", REGION, ["--task-definition", taskDefinition])),
    circuit: getItem("control_circuit"),
    slots: [getItem("control_slot_0"), getItem("control_slot_1")],
  };
  return evaluatePhase11Readiness(snapshot);
}

function main(): void {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log(JSON.stringify({
      mode: "dry-run",
      operation: "phase11-live-readiness",
      workloadRegion: REGION,
      awsCallsMax: 11,
      cloudMutations: 0,
      rawIdentifiersPrinted: false,
      readyForDeployment: false,
    }));
    return;
  }
  if (args.length !== 1 || args[0] !== "--execute-read-only") throw new Error("Invalid readiness arguments.");
  if (process.env.AWS_PROFILE !== PROFILE) throw new Error("The verified temporary profile is required.");
  console.log(JSON.stringify(collectPhase11Readiness(createPhase11ReadOnlyCliRunner())));
}

const entry = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === entry) {
  try { main(); }
  catch (error) {
    console.error(JSON.stringify(summarizeReadinessFailure(error)));
    process.exitCode = 1;
  }
}
