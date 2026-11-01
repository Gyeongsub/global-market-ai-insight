import { resolve } from "node:path";
import { loadProjectConfig } from "../lib/config.js";
import { parseMaintenanceReferenceInputs } from "../lib/maintenance-reference-inputs.js";

try {
  const config = loadProjectConfig(process.env.GMAI_CONFIG ?? resolve("infrastructure/environments/dev.example.json"));
  const inputs = parseMaintenanceReferenceInputs(config, process.env);
  const { App } = await import("aws-cdk-lib/core");
  const lambda = await import("aws-cdk-lib/aws-lambda");
  const { createMaintenanceReferenceStack } = await import("../lib/maintenance-reference-app.js");
  const app = new App({ outdir: process.env.CDK_OUTDIR ?? resolve("cdk.out") });
  createMaintenanceReferenceStack(app, inputs, lambda.Code.fromAsset(resolve("services/operations/sweeper/bundle")));
  app.synth();
} catch {
  console.error("Maintenance reference-only synthesis refused; raw values are suppressed.");
  process.exitCode = 1;
}
