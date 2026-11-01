import { resolve } from "node:path";
import { loadProjectConfig, validateWorkerImageDigest } from "../lib/config.js";
import { parseDeploymentGates } from "../lib/deployment-gates.js";

// An operator selecting the isolated drill must not silently synthesize base
// stacks by forgetting the dedicated --app entry point.
if (process.env.GMAI_MAINTENANCE_REFERENCE_ONLY !== undefined && process.env.GMAI_MAINTENANCE_REFERENCE_ONLY !== "false") {
  throw new Error("Reference-only maintenance requires the dedicated maintenance entry point; the main app refuses this scope.");
}
if (process.env.GMAI_PHASE11_REFERENCE_ONLY !== undefined && process.env.GMAI_PHASE11_REFERENCE_ONLY !== "false") {
  throw new Error("Reference-only Phase 11 requires the dedicated drill entry point; the main app refuses this scope.");
}
if (process.env.GMAI_ALLOW_UNRESERVED_ALARM_DRILL !== undefined && process.env.GMAI_ALLOW_UNRESERVED_ALARM_DRILL !== "false") {
  throw new Error("Unreserved alarm drill requires the dedicated reference-only entry point.");
}

// Validate opt-in/cost/reference boundaries before loading CDK or constructing
// an App. Invalid requests must not pay heavy module setup or create an output.
const {
  apiEnabled,
  internalJobsEnabled,
  operationsEnabled,
  maintenanceEnabled,
  notificationsEnabled,
  alarmCircuitEnabled,
  customMetricsEnabled,
} = parseDeploymentGates(process.env);
const configPath = process.env.GMAI_CONFIG ?? resolve("infrastructure/environments/dev.example.json");
const config = loadProjectConfig(configPath);
const account = process.env.CDK_DEFAULT_ACCOUNT;
const env = account ? { account, region: config.region } : { region: config.region };
const prefix = `${config.projectName}-${config.environment}`;
const requestedDigest = process.env.GMAI_WORKER_IMAGE_DIGEST ?? config.workerImageDigest;
if (operationsEnabled && !requestedDigest) throw new Error("Operations draft requires a pinned worker image digest for its API dependency.");
const validatedDigest = requestedDigest ? validateWorkerImageDigest(requestedDigest) : undefined;

const { App } = await import("aws-cdk-lib/core");
const { FoundationStack } = await import("../lib/foundation-stack.js");
const app = new App({ outdir: process.env.CDK_OUTDIR ?? resolve("cdk.out") });

const foundation = new FoundationStack(app, `${prefix}-foundation`, { config, env });

if (validatedDigest) {
  const { ComputeStack } = await import("../lib/compute-stack.js");
  const compute = new ComputeStack(app, `${prefix}-compute`, {
    config,
    env,
    workerRepository: foundation.workerRepository,
    workerLogGroup: foundation.workerLogGroup,
    jobsTable: foundation.jobsTable,
    workerImageDigest: validatedDigest,
    internalJobExecutionEnabled: internalJobsEnabled,
  });
  compute.addStackDependency(foundation);

  // A deployed HTTP API has a public execute-api endpoint and can trigger
  // billable Fargate/provider work. Keep it out of the default assembly until
  // a reviewed deployment explicitly enables this gate.
  if (apiEnabled) {
    const { ApiStack } = await import("../lib/api-stack.js");
    const api = new ApiStack(app, `${prefix}-api`, {
      config,
      env,
      controllerFunction: compute.controllerFunction,
    });
    api.addStackDependency(compute);
    if (operationsEnabled) {
      const { OperationsStack } = await import("../lib/operations-stack.js");
      const operations = new OperationsStack(app, `${prefix}-operations`, {
        config,
        env,
        controllerFunction: compute.controllerFunction,
        httpApi: api.httpApi,
        apiAccessLogGroup: api.accessLogGroup,
        controllerLogGroup: compute.controllerLogGroup,
        workerLogGroup: foundation.workerLogGroup,
        notificationsEnabled,
        customMetricsEnabled,
      });
      operations.addStackDependency(api);
      if (alarmCircuitEnabled) {
        const { AlarmCircuitStack } = await import("../lib/alarm-circuit-stack.js");
        const lambda = await import("aws-cdk-lib/aws-lambda");
        const alarmCircuit = new AlarmCircuitStack(app, `${prefix}-alarm-circuit`, {
          config,
          env,
          jobsTable: foundation.jobsTable,
          handlerCode: lambda.Code.fromAsset(resolve("services/operations/alarm_circuit/bundle")),
        });
        alarmCircuit.addStackDependency(operations);
      }
      if (maintenanceEnabled) {
        const { MaintenanceStack } = await import("../lib/maintenance-stack.js");
        const lambda = await import("aws-cdk-lib/aws-lambda");
        const maintenance = new MaintenanceStack(app, `${prefix}-maintenance`, {
          config,
          env,
          jobsTable: foundation.jobsTable,
          cluster: compute.cluster,
          handlerCode: lambda.Code.fromAsset(resolve("services/operations/sweeper/bundle")),
        });
        maintenance.addStackDependency(operations);
      }
    }
  }
}

app.synth();
