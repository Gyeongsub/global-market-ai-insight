import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { AwsIamApiClient, runOneJobAcceptance } from "../services/operations/api-smoke/src/signed-api-client.js";
import { parseAcceptancePlan } from "../services/operations/api-smoke/src/acceptance-plan.js";

const summary = parseAcceptancePlan(process.argv.slice(2));

if (summary.mode === "dry-run") {
  console.log(JSON.stringify(summary));
} else {
  if (process.env.AWS_PROFILE !== "gmai-admin") throw new Error("Execution requires AWS_PROFILE=gmai-admin.");
  const outputs = JSON.parse(readFileSync(resolve(".tmp/phase7-deploy-outputs.json"), "utf8")) as Record<string, Record<string, unknown>>;
  const endpoint = outputs["global-market-ai-insight-dev-api"]?.HttpApiEndpoint;
  if (typeof endpoint !== "string") throw new Error("The reviewed API endpoint output is unavailable.");
  const outcome = await runOneJobAcceptance(new AwsIamApiClient(endpoint), { operation: summary.operation, symbol: summary.symbol, locale: summary.locale });
  const passed = outcome.status === "SUCCEEDED";
  console.log(JSON.stringify({ ...summary, executed: true, passed, jobId: outcome.jobId, status: outcome.status, apiCalls: outcome.apiCalls }));
  if (!passed) process.exitCode = 1;
}
