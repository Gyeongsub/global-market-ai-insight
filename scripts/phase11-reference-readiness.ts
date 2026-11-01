import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createPhase11ReadOnlyCliRunner, PHASE11_LOG_GROUP_PAGE_LIMIT, summarizeReadinessFailure } from "./phase11-live-readiness.js";
import { phase11ReferenceFingerprint } from "../infrastructure/lib/phase11-reference-identity.js";

const PROFILE = "gmai-admin";
const REGION = "ap-northeast-1";
const PREFIX = "global-market-ai-insight-dev";
const ROUTES = ["GET /v1/assets", "GET /v1/health", "GET /v1/jobs/{jobId}", "POST /v1/jobs"].sort();
type JsonObject = Record<string, unknown>;
type ReadRunner = (args: readonly string[]) => unknown;

export interface Phase11ReferenceSnapshot {
  identity: unknown;
  foundationResources: unknown;
  computeResources: unknown;
  apiResources: unknown;
  api: unknown;
  routes: unknown;
  integrations: unknown;
  controller: unknown;
  table: unknown;
  logGroups: readonly unknown[];
}

function object(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
}

function collection(value: unknown, key: string): JsonObject[] | null {
  const response = object(value);
  if (!response || response.NextToken !== undefined || response.nextToken !== undefined || !Array.isArray(response[key]) ||
      response[key].length > 1000 || response[key].some((entry: unknown) => object(entry) === null)) return null;
  return response[key] as JsonObject[];
}

function principalAccount(identity: unknown): string | null {
  const input = object(identity);
  return typeof input?.Account === "string" && /^[0-9]{12}$/.test(input.Account) && !/^0+$/.test(input.Account) &&
    input.Arn === `arn:aws:iam::${input.Account}:user/aws-admin-user` ? input.Account : null;
}

function resources(value: unknown): JsonObject[] | null {
  const entries = collection(value, "StackResourceSummaries");
  const logicalIds = new Set<string>();
  if (!entries) return null;
  for (const entry of entries) {
    if (typeof entry.LogicalResourceId !== "string" || !/^[A-Za-z0-9]{1,255}$/.test(entry.LogicalResourceId) ||
        logicalIds.has(entry.LogicalResourceId) || typeof entry.ResourceType !== "string" ||
        typeof entry.PhysicalResourceId !== "string" || entry.PhysicalResourceId.length === 0 || entry.PhysicalResourceId.length > 4096 ||
        typeof entry.ResourceStatus !== "string") return null;
    logicalIds.add(entry.LogicalResourceId);
  }
  return entries;
}

function owns(entries: JsonObject[] | null, type: string, name: string): boolean {
  const matches = entries?.filter(entry => entry.ResourceType === type && entry.PhysicalResourceId === name);
  return matches?.length === 1 && /^(?:CREATE|UPDATE)_COMPLETE$/.test(String(matches[0]?.ResourceStatus));
}

function apiIdFromResources(value: unknown): string | null {
  const matches = resources(value)?.filter(entry => entry.ResourceType === "AWS::ApiGatewayV2::Api");
  return matches?.length === 1 && typeof matches[0]?.PhysicalResourceId === "string" &&
    /^[a-z0-9]{10}$/.test(matches[0].PhysicalResourceId) && /^(?:CREATE|UPDATE)_COMPLETE$/.test(String(matches[0].ResourceStatus))
    ? matches[0].PhysicalResourceId : null;
}

/** Six existing resources must be owned by the three exact project stack reads. */
function ownership(snapshot: Pick<Phase11ReferenceSnapshot, "foundationResources" | "computeResources" | "apiResources">): Record<string, boolean> {
  const foundation = resources(snapshot.foundationResources);
  const compute = resources(snapshot.computeResources);
  const api = resources(snapshot.apiResources);
  return {
    jobsTable: owns(foundation, "AWS::DynamoDB::Table", `${PREFIX}-jobs`),
    workerLogGroup: owns(foundation, "AWS::Logs::LogGroup", `/aws/ecs/${PREFIX}/worker`),
    controller: owns(compute, "AWS::Lambda::Function", `${PREFIX}-controller`),
    controllerLogGroup: owns(compute, "AWS::Logs::LogGroup", `/aws/lambda/${PREFIX}-controller`),
    api: apiIdFromResources(snapshot.apiResources) !== null,
    apiAccessLogGroup: owns(api, "AWS::Logs::LogGroup", `/aws/apigateway/${PREFIX}-api-access`),
  };
}

/** Return decision facts only; never resource IDs, environment values, endpoints or AWS records. */
export function evaluatePhase11ReferenceReadiness(snapshot: Phase11ReferenceSnapshot): Record<string, unknown> {
  const account = principalAccount(snapshot.identity);
  const owners = ownership(snapshot);
  const apiId = apiIdFromResources(snapshot.apiResources);
  const api = object(snapshot.api);
  const apiVerified = account !== null && apiId !== null && api?.ApiId === apiId && api.Name === `${PREFIX}-api` &&
    api.ProtocolType === "HTTP" && api.ApiEndpoint === `https://${apiId}.execute-api.${REGION}.amazonaws.com`;
  const controller = object(snapshot.controller);
  const variables = object(object(controller?.Environment)?.Variables);
  const controllerArn = account ? `arn:aws:lambda:${REGION}:${account}:function:${PREFIX}-controller` : null;
  const controllerVerified = account !== null && controller?.FunctionName === `${PREFIX}-controller` &&
    controller.FunctionArn === controllerArn && controller.Runtime === "nodejs22.x" && controller.State === "Active" &&
    controller.LastUpdateStatus === "Successful" && variables?.ENABLE_PROVIDER_BACKED_JOBS === "false" && variables.ENABLE_LIVE_RESULT_DISPLAY === "false";
  const table = object(object(snapshot.table)?.Table);
  const keySchema = Array.isArray(table?.KeySchema) ? table.KeySchema : [];
  const tableVerified = account !== null && table?.TableName === `${PREFIX}-jobs` &&
    table.TableArn === `arn:aws:dynamodb:${REGION}:${account}:table/${PREFIX}-jobs` && table.TableStatus === "ACTIVE" &&
    object(table.BillingModeSummary)?.BillingMode === "PAY_PER_REQUEST" && keySchema.length === 1 &&
    object(keySchema[0])?.AttributeName === "jobId" && object(keySchema[0])?.KeyType === "HASH";
  const routes = collection(snapshot.routes, "Items");
  const integrations = collection(snapshot.integrations, "Items");
  const integration = integrations?.length === 1 ? integrations[0] : undefined;
  const integrationVerified = controllerArn !== null && integration?.IntegrationType === "AWS_PROXY" &&
    integration.IntegrationUri === controllerArn && integration.PayloadFormatVersion === "2.0" && integration.IntegrationMethod === "POST" &&
    typeof integration.TimeoutInMillis === "number" && Number.isInteger(integration.TimeoutInMillis) && integration.TimeoutInMillis > 0 && integration.TimeoutInMillis <= 15_000 &&
    typeof integration.IntegrationId === "string" && /^[a-z0-9]{1,32}$/.test(integration.IntegrationId);
  const routeKeys = routes?.map(route => route.RouteKey);
  const routesVerified = routes?.length === 4 && routeKeys?.every(key => typeof key === "string") === true &&
    JSON.stringify([...routeKeys!].sort()) === JSON.stringify(ROUTES) && integrationVerified &&
    routes.every(route => route.AuthorizationType === "AWS_IAM" && route.Target === `integrations/${integration!.IntegrationId}`);
  const groupNames = [`/aws/apigateway/${PREFIX}-api-access`, `/aws/lambda/${PREFIX}-controller`, `/aws/ecs/${PREFIX}/worker`];
  const logsVerified = account !== null && snapshot.logGroups.length === 3 && snapshot.logGroups.every((response, index) => {
    const entries = collection(response, "logGroups");
    const entry = entries?.length === 1 ? entries[0] : undefined;
    const name = groupNames[index];
    const expectedArn = `arn:aws:logs:${REGION}:${account}:log-group:${name}`;
    return entry?.logGroupName === name && entry.arn === `${expectedArn}:*` &&
      (entry.logGroupArn === undefined || entry.logGroupArn === expectedArn) && typeof entry.retentionInDays === "number" && [7, 14].includes(entry.retentionInDays);
  });
  const referencesVerified = Object.values(owners).every(Boolean) && apiVerified && controllerVerified && tableVerified &&
    routesVerified && integrationVerified && logsVerified;
  return {
    mode: "phase11-reference-readiness", workloadRegion: REGION, awsCalls: 12, cloudMutations: 0, rawIdentifiersPrinted: false,
    expectedPrincipal: account !== null, stackOwnership: owners,
    existingApiVerified: apiVerified, iamRoutesVerified: routesVerified, controllerIntegrationVerified: integrationVerified,
    disabledControllerVerified: controllerVerified, existingTableVerified: tableVerified, boundedLogGroupsVerified: logsVerified,
    // Configuration alone does not prove which bundle is deployed or live denial.
    privateOwnerConfigurationMatchesCaller: account !== null && controllerVerified &&
      object(object(controller?.Environment)?.Variables)?.PRIVATE_OWNER_USER_ARN === object(snapshot.identity)?.Arn,
    privateOwnerLiveAcceptanceVerified: false,
    referencesVerified,
    referenceFingerprint: referencesVerified ? phase11ReferenceFingerprint(account!, apiId!) : null,
    readyForReferenceSpecificDiff: referencesVerified,
    readyForDeployment: false,
    upstreamDeploymentAuthorized: false,
    coreReadinessStillRequired: true,
    circuitMutationAuthorized: false,
  };
}

function query(service: string, operation: string, extra: readonly string[] = []): string[] {
  return [service, operation, ...extra, "--profile", PROFILE, "--region", REGION, "--no-cli-pager", "--no-paginate", "--output", "json"];
}

/** At most twelve allowlisted reads. Ownership must pass before following the existing API ID. */
export function collectPhase11ReferenceReadiness(run: ReadRunner): Record<string, unknown> {
  const identity = run(query("sts", "get-caller-identity"));
  if (principalAccount(identity) === null) throw new Error("PHASE11_REFERENCE_IDENTITY_INVALID");
  const sourceReads = {
    foundationResources: run(query("cloudformation", "list-stack-resources", ["--stack-name", `${PREFIX}-foundation`])),
    computeResources: run(query("cloudformation", "list-stack-resources", ["--stack-name", `${PREFIX}-compute`])),
    apiResources: run(query("cloudformation", "list-stack-resources", ["--stack-name", `${PREFIX}-api`])),
  };
  if (!Object.values(ownership(sourceReads)).every(Boolean)) throw new Error("PHASE11_REFERENCE_OWNERSHIP_INVALID");
  const apiId = apiIdFromResources(sourceReads.apiResources)!;
  const snapshot: Phase11ReferenceSnapshot = {
    identity, ...sourceReads,
    api: run(query("apigatewayv2", "get-api", ["--api-id", apiId])),
    routes: run(query("apigatewayv2", "get-routes", ["--api-id", apiId])),
    integrations: run(query("apigatewayv2", "get-integrations", ["--api-id", apiId])),
    controller: run(query("lambda", "get-function-configuration", ["--function-name", `${PREFIX}-controller`])),
    table: run(query("dynamodb", "describe-table", ["--table-name", `${PREFIX}-jobs`])),
    logGroups: [`/aws/apigateway/${PREFIX}-api-access`, `/aws/lambda/${PREFIX}-controller`, `/aws/ecs/${PREFIX}/worker`]
      .map(name => run(query("logs", "describe-log-groups", ["--log-group-name-prefix", name, "--limit", PHASE11_LOG_GROUP_PAGE_LIMIT]))),
  };
  return evaluatePhase11ReferenceReadiness(snapshot);
}

function main(): void {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log(JSON.stringify({ mode: "dry-run", operation: "phase11-reference-readiness", workloadRegion: REGION,
      awsCallsMax: 12, cloudMutations: 0, rawIdentifiersPrinted: false, readyForDeployment: false, coreReadinessStillRequired: true }));
    return;
  }
  if (args.length !== 1 || args[0] !== "--execute-read-only" || process.env.AWS_PROFILE !== PROFILE) throw new Error("PHASE11_REFERENCE_ARGUMENTS_INVALID");
  console.log(JSON.stringify(collectPhase11ReferenceReadiness(createPhase11ReadOnlyCliRunner())));
}

const entry = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === entry) {
  try { main(); }
  catch (error) { console.error(JSON.stringify(summarizeReadinessFailure(error))); process.exitCode = 1; }
}
