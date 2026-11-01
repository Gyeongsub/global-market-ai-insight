import { ECSClient, DescribeClustersCommand } from "@aws-sdk/client-ecs";
import { resolve } from "node:path";
import { loadProjectConfig } from "../infrastructure/lib/config.js";
import { SlotReconciler } from "../services/operations/sweeper/src/slot-reconciler.js";

const execute = process.argv.includes("--execute");
const confirmed = process.argv.includes("--confirm-stopped-only");
const config = loadProjectConfig(process.env.GMAI_CONFIG ?? resolve("infrastructure/environments/dev.example.json"));
const summary = {
  mode: execute ? "execute" : "dry-run",
  region: config.region,
  slotsMax: config.maxActiveJobs,
  awsCallsMax: execute ? 1 + (config.maxActiveJobs * 4) : 0,
  releaseRule: "terminal-job-and-exact-ecs-task-stopped",
};

if (!execute) {
  console.log(JSON.stringify(summary));
} else {
  if (!confirmed) throw new Error("Execution requires --confirm-stopped-only.");
  if (process.env.AWS_PROFILE !== "gmai-admin") throw new Error("Execution requires AWS_PROFILE=gmai-admin.");
  const ecs = new ECSClient({ region: config.region, maxAttempts: 1 });
  const clusterName = `${config.projectName}-${config.environment}-worker`;
  const described = await ecs.send(new DescribeClustersCommand({ clusters: [clusterName] }));
  const cluster = described.clusters?.[0];
  if (described.failures?.length || described.clusters?.length !== 1 || cluster?.clusterName !== clusterName || !cluster.clusterArn) throw new Error("The exact reviewed worker cluster was not found.");
  const reconciler = new SlotReconciler({
    tableName: `${config.projectName}-${config.environment}-jobs`,
    region: config.region,
    clusterArn: cluster.clusterArn,
    maxActiveJobs: config.maxActiveJobs,
    ecs,
  });
  const outcome = await reconciler.reconcile();
  console.log(JSON.stringify({ ...summary, executed: true, ...outcome }));
}
