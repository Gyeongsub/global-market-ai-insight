import { resolve } from "node:path";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { ECSClient } from "@aws-sdk/client-ecs";
import { loadProjectConfig } from "../infrastructure/lib/config.js";
import { inspectAnalysisJob, parseInspectionPlan } from "../services/operations/api-smoke/src/job-inspection.js";

async function main() {
  const plan = parseInspectionPlan(process.argv.slice(2));
  const summary = { mode: plan.execute ? "execute" : "dry-run", symbol: plan.symbol, locale: plan.locale, awsCallsMax: plan.execute ? 2 : 0, writes: 0 };
  if (!plan.execute) { console.log(JSON.stringify(summary)); return; }
  const account = process.env.GMAI_VERIFIED_ACCOUNT_ID;
  if (process.env.AWS_PROFILE !== "gmai-admin" || !/^[0-9]{12}$/.test(account ?? "")) throw new Error("Fresh verified account and temporary profile required.");
  const config = loadProjectConfig(process.env.GMAI_CONFIG ?? resolve("infrastructure/environments/dev.example.json"));
  const db = new DynamoDBClient({ region: config.region, maxAttempts: 1 });
  const ecs = new ECSClient({ region: config.region, maxAttempts: 1 });
  try {
    const result = await inspectAnalysisJob({ jobId: plan.jobId, symbol: plan.symbol, locale: plan.locale,
      modelId: config.bedrockModelId, region: config.region, tableName: `${config.projectName}-${config.environment}-jobs`,
      clusterArn: `arn:aws:ecs:${config.region}:${account}:cluster/${config.projectName}-${config.environment}-worker`,
    }, { readJob: (command, abortSignal) => db.send(command, { abortSignal }), describeTask: (command, abortSignal) => ecs.send(command, { abortSignal }) });
    console.log(JSON.stringify({ ...summary, ...result }));
    if (!result.passed) process.exitCode = 1;
  } finally { db.destroy(); ecs.destroy(); }
}
main().catch(() => { console.error("Private job inspection failed; verify arguments, identity and session. Raw data suppressed."); process.exitCode = 1; });
