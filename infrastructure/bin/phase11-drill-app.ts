import { resolve } from "node:path";
import { loadProjectConfig } from "../lib/config.js";
import { parsePhase11ReferenceInputs } from "../lib/phase11-reference-inputs.js";

try {
  const config = loadProjectConfig(process.env.GMAI_CONFIG ?? resolve("infrastructure/environments/dev.example.json"));
  const inputs = parsePhase11ReferenceInputs(config, process.env);
  const { App } = await import("aws-cdk-lib/core");
  const lambda = await import("aws-cdk-lib/aws-lambda");
  const { createPhase11ReferenceStacks } = await import("../lib/phase11-reference-app.js");
  const app = new App({ outdir: process.env.CDK_OUTDIR ?? resolve("cdk.out") });
  createPhase11ReferenceStacks(app, inputs, lambda.Code.fromAsset(resolve("services/operations/alarm_circuit/bundle")));
  app.synth();
} catch {
  console.error("Phase 11 reference-only synthesis refused; raw values are suppressed.");
  process.exitCode = 1;
}
