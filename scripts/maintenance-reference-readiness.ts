import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { collectPhase11Readiness, createPhase11ReadOnlyCliRunner, summarizeReadinessFailure } from "./phase11-live-readiness.js";
import { maintenanceReferenceFingerprint, MAINTENANCE_PREFIX as PREFIX } from "../infrastructure/lib/maintenance-reference-inputs.js";

type RecordValue = Record<string, unknown>;
type Reader = (args: readonly string[]) => unknown;
function object(value: unknown): RecordValue | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : undefined;
}
function owned(value: unknown, type: string, physical: string): boolean {
  const response = object(value), entries = response?.StackResourceSummaries;
  if (!response || response.NextToken !== undefined || response.nextToken !== undefined || !Array.isArray(entries) || entries.length > 1000) return false;
  const logicalIds = new Set<string>();
  for (const raw of entries) {
    const entry = object(raw);
    if (!entry || typeof entry.LogicalResourceId !== "string" || !/^[A-Za-z0-9]{1,255}$/.test(entry.LogicalResourceId) ||
      logicalIds.has(entry.LogicalResourceId) || typeof entry.ResourceType !== "string" ||
      typeof entry.PhysicalResourceId !== "string" || typeof entry.ResourceStatus !== "string") return false;
    logicalIds.add(entry.LogicalResourceId);
  }
  const matches = entries.map(object).filter(entry => entry?.ResourceType === type && entry.PhysicalResourceId === physical);
  return matches.length === 1 && /^(?:CREATE|UPDATE)_COMPLETE$/.test(String(matches[0]?.ResourceStatus));
}
export function evaluateMaintenanceReferences(core: RecordValue, snapshot: {
  identity: unknown; controller: unknown; foundationResources: unknown; computeResources: unknown; table: unknown;
}) {
  const identity = object(snapshot.identity), account = identity?.Account;
  const principalVerified = typeof account === "string" && /^(?!0{12}$)[0-9]{12}$/.test(account) &&
    identity?.Arn === `arn:aws:iam::${account}:user/aws-admin-user`;
  const cluster = principalVerified ? `arn:aws:ecs:ap-northeast-1:${account}:cluster/${PREFIX}-worker` : undefined;
  const variables = object(object(object(snapshot.controller)?.Environment)?.Variables);
  const exactRuntimeReferences = cluster !== undefined && variables?.MAX_ACTIVE_JOBS === "2" &&
    variables.JOBS_TABLE_NAME === `${PREFIX}-jobs` && variables.WORKER_CLUSTER === cluster;
  const tableOwned = owned(snapshot.foundationResources, "AWS::DynamoDB::Table", `${PREFIX}-jobs`);
  // CloudFormation ECS Cluster Ref/PhysicalResourceId is the name, not ARN.
  // Keep that exact owned name distinct from the exact account/Region ARN in
  // the captured controller; never accept an arbitrary ARN-looking value.
  const clusterOwned = cluster !== undefined && owned(snapshot.computeResources, "AWS::ECS::Cluster", `${PREFIX}-worker`);
  const controllerOwned = owned(snapshot.computeResources, "AWS::Lambda::Function", `${PREFIX}-controller`);
  const table = object(object(snapshot.table)?.Table);
  const exactTable = principalVerified && table?.TableName === `${PREFIX}-jobs` &&
    table.TableArn === `arn:aws:dynamodb:ap-northeast-1:${account}:table/${PREFIX}-jobs` && table.TableStatus === "ACTIVE" &&
    object(table.BillingModeSummary)?.BillingMode === "PAY_PER_REQUEST" &&
    JSON.stringify(table.KeySchema) === JSON.stringify([{ AttributeName: "jobId", KeyType: "HASH" }]) &&
    JSON.stringify(table.AttributeDefinitions) === JSON.stringify([{ AttributeName: "jobId", AttributeType: "S" }]);
  const coreReady = core.readyForAccountSpecificDiff === true && object(core.stacks)?.maintenance === "ABSENT";
  const referencesVerified = coreReady && principalVerified && exactRuntimeReferences && tableOwned && clusterOwned && controllerOwned && exactTable;
  return { mode: "maintenance-reference-readiness", awsCalls: 14, cloudMutations: 0,
    coreReadinessPassed: coreReady, principalVerified, exactRuntimeReferences, ownership: { table: tableOwned, cluster: clusterOwned, controller: controllerOwned },
    exactOnDemandTable: exactTable, referencesVerified,
    referenceFingerprint: referencesVerified ? maintenanceReferenceFingerprint(account as string) : null,
    readyForReferenceSpecificDiff: referencesVerified, readyForDeployment: false, readyForLiveAcceptance: false,
    liveCodeAndIamDiffStillRequired: true, maintenanceInvokeAuthorized: false, slotOrJobMutationAuthorized: false,
    taskLaunchAuthorized: false, scheduleEnablementAuthorized: false, rawIdentifiersPrinted: false };
}

/** Eleven fresh core reads then exactly three ownership/schema reads. The
 * runtime references are captured from that same controller response, not a
 * caller-supplied environment value, boolean or historical fingerprint. */
export function collectMaintenanceReferenceReadiness(coreReader: Reader, referenceReader: Reader) {
  let identity: unknown, controller: unknown;
  const core = collectPhase11Readiness(args => {
    const result = coreReader(args);
    if (args[0] === "sts") identity = result;
    if (args[0] === "lambda") controller = result;
    return result;
  });
  if (core.readyForAccountSpecificDiff !== true) throw new Error("MAINTENANCE_CORE_NOT_READY");
  const query = (service: string, action: string, extra: string[]) => referenceReader([
    service, action, ...extra, "--profile", "gmai-admin", "--region", "ap-northeast-1", "--no-cli-pager", "--no-paginate", "--output", "json",
  ]);
  return evaluateMaintenanceReferences(core, { identity, controller,
    foundationResources: query("cloudformation", "list-stack-resources", ["--stack-name", `${PREFIX}-foundation`]),
    computeResources: query("cloudformation", "list-stack-resources", ["--stack-name", `${PREFIX}-compute`]),
    table: query("dynamodb", "describe-table", ["--table-name", `${PREFIX}-jobs`]),
  });
}

const entry = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === entry) {
  try {
    const args = process.argv.slice(2);
    if (args.length === 0) console.log(JSON.stringify({ mode: "dry-run", operation: "maintenance-reference-readiness", awsCallsMax: 14,
      cloudMutations: 0, readyForDeployment: false, readyForLiveAcceptance: false, rawIdentifiersPrinted: false }));
    else {
      if (args.length !== 1 || args[0] !== "--execute-read-only" || process.env.AWS_PROFILE !== "gmai-admin") throw new Error("MAINTENANCE_READINESS_ARGUMENTS_INVALID");
      const started = Date.now(); let calls = 0;
      const bounded = (reader: Reader): Reader => args => {
        const elapsed = Date.now() - started;
        if (!Number.isSafeInteger(elapsed) || elapsed < 0 || elapsed >= 180_000 || calls >= 14) throw new Error("MAINTENANCE_READINESS_BOUND_EXCEEDED");
        calls++;
        const result = reader(args);
        if (Date.now() - started >= 180_000) throw new Error("MAINTENANCE_READINESS_BOUND_EXCEEDED");
        return result;
      };
      // The shared allowlist remains unchanged and each runner keeps its own
      // twelve-read cap. The outer scope also caps the pair at fourteen reads.
      console.log(JSON.stringify(collectMaintenanceReferenceReadiness(bounded(createPhase11ReadOnlyCliRunner()), bounded(createPhase11ReadOnlyCliRunner()))));
    }
  } catch (error) {
    console.error(JSON.stringify(summarizeReadinessFailure(error))); process.exitCode = 1;
  }
}
