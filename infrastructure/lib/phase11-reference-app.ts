import { App } from "aws-cdk-lib/core";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import { projectLogGroups } from "../../services/operations/log_queries/src/query-catalog.js";
import { AlarmCircuitStack } from "./alarm-circuit-stack.js";
import { parseProjectConfig } from "./config.js";
import { OperationsStack } from "./operations-stack.js";
import { phase11ReferenceFingerprint } from "./phase11-reference-identity.js";
import type { Phase11ReferenceInputs } from "./phase11-reference-inputs.js";
export { parsePhase11ReferenceInputs, type Phase11ReferenceInputs } from "./phase11-reference-inputs.js";

const PREFIX = "global-market-ai-insight-dev";

/** No lookup, base stacks, worker image, runtime update, table or API creation. */
export function createPhase11ReferenceStacks(app: App, inputs: Phase11ReferenceInputs, handlerCode: lambda.Code): {
  operations: OperationsStack;
  alarmCircuit: AlarmCircuitStack;
} {
  if (app.node.children.length !== 0) throw new Error("PHASE11_REFERENCE_APP_NOT_EMPTY");
  // Revalidate callers that do not use the environment parser.
  const config = parseProjectConfig(inputs.config);
  if (`${config.projectName}-${config.environment}` !== PREFIX || inputs.environment.region !== config.region ||
      typeof inputs.environment.account !== "string" || !/^[0-9]{12}$/.test(inputs.environment.account) ||
      /^0+$/.test(inputs.environment.account) || typeof inputs.httpApiId !== "string" || !/^[a-z0-9]{10}$/.test(inputs.httpApiId)) throw new Error("PHASE11_REFERENCE_INPUT_INVALID");
  if (inputs.referenceFingerprint !== phase11ReferenceFingerprint(inputs.environment.account, inputs.httpApiId)) throw new Error("PHASE11_REFERENCE_FINGERPRINT_MISMATCH");
  if (inputs.unreservedDrill !== undefined && typeof inputs.unreservedDrill !== "boolean") throw new Error("PHASE11_REFERENCE_CONCURRENCY_MODE_INVALID");
  const groups = projectLogGroups(config.projectName, config.environment);
  const operations = new OperationsStack(app, `${PREFIX}-operations`, {
    config,
    env: inputs.environment,
    notificationsEnabled: false,
    customMetricsEnabled: true,
    resourceFactory: scope => ({
      controllerFunction: lambda.Function.fromFunctionName(scope, "ExistingController", `${PREFIX}-controller`),
      httpApi: apigwv2.HttpApi.fromHttpApiAttributes(scope, "ExistingApi", { httpApiId: inputs.httpApiId }),
      apiAccessLogGroup: logs.LogGroup.fromLogGroupName(scope, "ExistingApiLogs", groups.apiAccess),
      controllerLogGroup: logs.LogGroup.fromLogGroupName(scope, "ExistingControllerLogs", groups.controller),
      workerLogGroup: logs.LogGroup.fromLogGroupName(scope, "ExistingWorkerLogs", groups.worker),
    }),
  });
  const alarmCircuit = new AlarmCircuitStack(app, `${PREFIX}-alarm-circuit`, {
    config,
    env: inputs.environment,
    jobsTable: scope => dynamodb.Table.fromTableName(scope, "ExistingJobsTable", `${PREFIX}-jobs`),
    handlerCode,
    unreservedDrill: inputs.unreservedDrill ?? false,
  });
  alarmCircuit.addStackDependency(operations);
  return { operations, alarmCircuit };
}
