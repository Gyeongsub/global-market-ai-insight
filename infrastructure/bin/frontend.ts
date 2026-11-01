import { resolve } from "node:path";
import { App } from "aws-cdk-lib/core";
import { loadProjectConfig } from "../lib/config.js";
import { FrontendStack } from "../lib/frontend-stack.js";

// Separate entry point: the existing Foundation/Compute/API assembly is unchanged.
if (process.env.GMAI_ENABLE_FRONTEND !== "true") {
  throw new Error("Frontend synthesis requires explicit GMAI_ENABLE_FRONTEND=true; deployment needs separate approval.");
}
const config = loadProjectConfig(process.env.GMAI_CONFIG ?? resolve("infrastructure/environments/dev.example.json"));
const app = new App({ outdir: process.env.CDK_OUTDIR ?? resolve("cdk.out/frontend") });
const account = process.env.CDK_DEFAULT_ACCOUNT;
new FrontendStack(app, `${config.projectName}-${config.environment}-frontend`, {
  config,
  viewerPublicKeyPem: process.env.GMAI_FRONTEND_PUBLIC_KEY_PEM ?? "",
  env: account ? { account, region: config.region } : { region: config.region },
});
app.synth();
