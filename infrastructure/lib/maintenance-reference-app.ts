import { App } from "aws-cdk-lib/core";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { MaintenanceStack } from "./maintenance-stack.js";
import { MAINTENANCE_PREFIX, maintenanceReferenceFingerprint, validateMaintenanceReferenceConfig,
  type MaintenanceReferenceInputs } from "./maintenance-reference-inputs.js";
export { MAINTENANCE_PREFIX, MAINTENANCE_DISABLED_FLAGS, maintenanceReferenceFingerprint, parseMaintenanceReferenceInputs,
  type MaintenanceReferenceInputs } from "./maintenance-reference-inputs.js";
function fail(): never { throw new Error("MAINTENANCE_REFERENCE_SCOPE_INVALID"); }
/** One disabled maintenance stack only. No lookups, imports or base changes. */
export function createMaintenanceReferenceStack(app: App, input: MaintenanceReferenceInputs, handlerCode: lambda.Code): MaintenanceStack {
  if (app.node.children.length !== 0) fail();
  const config = validateMaintenanceReferenceConfig(input.config);
  if (input.referenceFingerprint !== maintenanceReferenceFingerprint(input.account)) fail();
  return new MaintenanceStack(app, `${MAINTENANCE_PREFIX}-maintenance`, {
    config, env: { account: input.account, region: config.region }, analyticsReporting: false,
    jobsTable: scope => dynamodb.Table.fromTableName(scope, "ExistingJobs", `${MAINTENANCE_PREFIX}-jobs`),
    cluster: scope => ecs.Cluster.fromClusterArn(scope, "ExistingCluster", `arn:aws:ecs:${config.region}:${input.account}:cluster/${MAINTENANCE_PREFIX}-worker`),
    handlerCode,
  });
}
