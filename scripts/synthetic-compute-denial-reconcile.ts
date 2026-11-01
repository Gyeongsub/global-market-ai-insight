import { syntheticComputeDenialRequest } from "../services/local-owner/src/synthetic-compute-denial.js";

type Scope = Parameters<typeof syntheticComputeDenialRequest>[0];
type Json = Record<string, any>;
type Call = (operation: "list-tasks" | "describe-tasks" | "stop-task", args: readonly string[]) => unknown;
const fail = () => Error("SYNTHETIC_COMPUTE_RECONCILIATION_UNVERIFIED");
const object = (v: unknown): v is Json => !!v && typeof v === "object" && !Array.isArray(v);
const empty = (v: unknown) => Array.isArray(v) && v.length === 0;

/** Injected candidate only: no native entry, credentials or task creation.
 * Cleanup uses the immutable scope recorded BEFORE the request, not a newly
 * extended admission window. The caller must independently verify final cloud
 * posture. Unknown request + empty eventual-consistent reads is not proof that
 * the request never committed; retain that uncertainty rather than claim clean. */
export async function reconcileSyntheticComputeDenial(input: {
  scope: Scope; outcome: "not-sent" | "explicit-denial" | "unknown";
  call: Call; wait: () => Promise<void>; record: (state: Json) => void;
}) {
  const scope = structuredClone(input.scope), spec = syntheticComputeDenialRequest(scope), request = spec.request;
  if (!["not-sent", "explicit-denial", "unknown"].includes(input.outcome)) throw fail();
  let calls = 0, stopAttempted = false, taskStopped = false, observedEmpty = false, taskArn = "", failed = false;
  const record = (stage: string) => input.record({ stage, calls, stopAttempted, taskStopped, observedEmpty,
    verifiedTaskArn: taskArn || null, outcome: input.outcome, inferenceCalls: 0 });
  const call: Call = (operation, args) => { if (++calls > 15) throw fail(); return input.call(operation, args); };
  const arnPattern = new RegExp(`^arn:aws:ecs:ap-northeast-1:${scope.account}:task/global-market-ai-insight-dev-worker/[a-f0-9]{32}$`);
  function listed() {
    const value = call("list-tasks", ["--cluster", request.cluster, "--started-by", request.startedBy, "--max-results", "1"]);
    if (!object(value) || value.nextToken !== undefined || !Array.isArray(value.taskArns) || value.taskArns.length > 1 ||
        value.taskArns.some((v: unknown) => typeof v !== "string" || !arnPattern.test(v))) throw fail();
    return value.taskArns as string[];
  }
  function describe(arn: string) {
    const value = call("describe-tasks", ["--cluster", request.cluster, "--tasks", arn]);
    if (!object(value) || !empty(value.failures) || !Array.isArray(value.tasks) || value.tasks.length !== 1) throw fail();
    const task = value.tasks[0];
    if (!object(task) || task.taskArn !== arn || task.clusterArn !== request.cluster || task.taskDefinitionArn !== request.taskDefinition ||
        task.startedBy !== request.startedBy || task.launchType !== "EC2" || task.enableExecuteCommand !== false ||
        !["PROVISIONING", "PENDING", "ACTIVATING", "RUNNING", "DEACTIVATING", "STOPPING", "DEPROVISIONING", "STOPPED"].includes(task.lastStatus) ||
        !["RUNNING", "STOPPED"].includes(task.desiredStatus) || !object(task.overrides) ||
        !Array.isArray(task.overrides.containerOverrides) || task.overrides.containerOverrides.length !== 1) throw fail();
    const override = task.overrides.containerOverrides[0];
    if (!object(override) || override.name !== "worker" || override.command !== undefined || !Array.isArray(override.environment) ||
        override.environment.length !== 2 || !override.environment.every((v: unknown) => object(v) && typeof v.name === "string" && typeof v.value === "string")) throw fail();
    const sorted = [...override.environment].sort((a, b) => a.name.localeCompare(b.name));
    if (sorted[0].name !== "APP_ENV" || sorted[0].value !== "deny-probe" || sorted[1].name !== "JOB_ID" || sorted[1].value !== "") throw fail();
    taskArn = arn;
    return task;
  }
  try {
    record("reconcile-start");
    if (input.outcome !== "not-sent") {
      let candidates: string[] = [];
      for (let attempt = 0; attempt < (input.outcome === "explicit-denial" ? 1 : 3); attempt++) {
        candidates = listed();
        if (candidates.length) break;
        observedEmpty = true;
        if (input.outcome === "unknown" && attempt < 2) await input.wait();
      }
      if (candidates.length) {
        observedEmpty = false;
        let task = describe(candidates[0]!); record("owned-task-verified");
        if (task.lastStatus !== "STOPPED") {
          stopAttempted = true; record("stop-intent");
          // A timed-out acknowledgement is not retried; fresh descriptions
          // decide whether this exact owned task actually stopped.
          try { call("stop-task", ["--cluster", request.cluster, "--task", taskArn, "--reason", "Bounded IAM denial probe cleanup"]); }
          catch { /* preserve verification path and reserved read budget */ }
          for (let attempt = 0; attempt < 3; attempt++) {
            task = describe(taskArn);
            if (task.lastStatus === "STOPPED") break;
            if (attempt < 2) await input.wait();
          }
        }
        if (task.lastStatus !== "STOPPED") throw fail();
        taskStopped = true;
        const remaining = listed();
        if (remaining.length) throw fail();
        observedEmpty = true;
      }
    }
  } catch { failed = true; }
  finally { record("reconcile-finished"); }
  const unresolvedCommit = input.outcome === "unknown" && !taskStopped;
  return { mode: "synthetic-compute-injected-reconciliation", completed: !failed && !unresolvedCommit,
    calls, stopAttempted, taskStopped, observedEmpty, failed, unresolvedCommit,
    denialContradicted: input.outcome === "explicit-denial" && taskArn !== "",
    unexpectedTaskObserved: taskArn !== "", liveCloudClosureVerified: false, independentCloudPostureRequired: true };
}
