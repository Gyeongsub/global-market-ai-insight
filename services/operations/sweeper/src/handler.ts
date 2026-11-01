import { SlotReconciler } from "./slot-reconciler.js";
import { StaleJobSweeper } from "./stale-job-sweeper.js";

interface MaintenanceStep { run(): Promise<unknown> }

export function parseMaintenanceConfig(env: Record<string, string | undefined>) {
  const region = env.AWS_REGION;
  const tableName = env.JOBS_TABLE_NAME;
  const clusterArn = env.WORKER_CLUSTER_ARN;
  const maxActiveJobs = Number(env.MAX_ACTIVE_JOBS);
  if (region !== "ap-northeast-1" || !tableName || !/^[A-Za-z0-9_.-]{3,255}$/.test(tableName) ||
      !clusterArn || !/^arn:aws:ecs:ap-northeast-1:[0-9]{12}:cluster\/[A-Za-z0-9_-]+$/.test(clusterArn) ||
      !Number.isInteger(maxActiveJobs) || maxActiveJobs < 1 || maxActiveJobs > 5) {
    throw new Error("Invalid maintenance configuration.");
  }
  return { region, tableName, clusterArn, maxActiveJobs };
}

export async function runMaintenance(sweep: MaintenanceStep, reconcile: MaintenanceStep) {
  const sweepOutcome = await sweep.run();
  const reconcileOutcome = await reconcile.run();
  return { sweep: sweepOutcome, reconcile: reconcileOutcome };
}

/** Prepared Lambda entrypoint. Deployment and schedule enablement remain separate gates. */
export async function handler(): Promise<unknown> {
  const config = parseMaintenanceConfig(process.env);
  const sweep = new StaleJobSweeper(config);
  const reconcile = new SlotReconciler(config);
  try {
    const result = await runMaintenance({ run: () => sweep.sweep() }, { run: () => reconcile.reconcile() });
    // Numeric summaries only: no job ID, task ARN, provider value or SDK detail.
    console.log(JSON.stringify({ event: "maintenance-complete", ...result }));
    return result;
  } catch {
    console.error(JSON.stringify({ event: "maintenance-failed" }));
    throw new Error("Maintenance failed.");
  }
}
