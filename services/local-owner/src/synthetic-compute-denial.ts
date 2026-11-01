import { validateSyntheticOwner } from "../../../shared/security/synthetic-lab-policy.js";

const prefix = "global-market-ai-insight-dev", region = "ap-northeast-1";
const fail = () => Error("SYNTHETIC_COMPUTE_DENIAL_SCOPE_REJECTED");
const object = (v: unknown): v is Record<string, any> => !!v && typeof v === "object" && !Array.isArray(v);
const empty = (v: unknown) => Array.isArray(v) && v.length === 0;

/** Local proposal only: no network, deployment or RunTask entry. Empty EC2
 * capacity is an extra containment condition, not an authorization decision or
 * an atomic lock against another operator registering an instance afterward.
 * A real adapter must recheck scope, use the restricted lease, accept only an
 * exact ecs:RunTask IAM denial and reconcile even ambiguous request outcomes. */
export function syntheticComputeDenialRequest(input: {
  account: unknown; ownerArn: unknown; nonce: unknown; checkedAtMs: number; nowMs: number;
  controller: unknown; taskDefinition: unknown; clusters: unknown; instances: unknown;
}) {
  try {
    const owner = validateSyntheticOwner(input.ownerArn, input.account), account = input.account as string;
    if (typeof input.nonce !== "string" || !/^[a-f0-9]{32}$/.test(input.nonce) ||
        !Number.isSafeInteger(input.checkedAtMs) || input.checkedAtMs < 0 || !Number.isSafeInteger(input.nowMs) ||
        input.nowMs < input.checkedAtMs || input.nowMs - input.checkedAtMs >= 30000 ||
        !object(input.controller) || !object(input.controller.Environment) || !object(input.controller.Environment.Variables) ||
        input.controller.Environment.Error !== undefined || !object(input.taskDefinition) || !object(input.taskDefinition.taskDefinition) ||
        !object(input.clusters) || !object(input.instances)) throw fail();
    const controller = input.controller, vars = controller.Environment.Variables, task = input.taskDefinition.taskDefinition;
    const clusterArn = `arn:aws:ecs:${region}:${account}:cluster/${prefix}-worker`;
    if (controller.FunctionName !== `${prefix}-controller` || controller.FunctionArn !== `arn:aws:lambda:${region}:${account}:function:${prefix}-controller` ||
        controller.State !== "Active" || controller.LastUpdateStatus !== "Successful" ||
        vars.API_AUTH_MODE !== "AWS_IAM" || vars.PRIVATE_OWNER_USER_ARN !== owner ||
        vars.ENABLE_PROVIDER_BACKED_JOBS !== "false" || vars.ENABLE_LIVE_RESULT_DISPLAY !== "false" || vars.WORKER_CLUSTER !== clusterArn ||
        typeof vars.WORKER_TASK_DEFINITION !== "string" || !new RegExp(`^arn:aws:ecs:${region}:${account}:task-definition/${prefix}-worker:[1-9][0-9]{0,5}$`).test(vars.WORKER_TASK_DEFINITION) ||
        task.taskDefinitionArn !== vars.WORKER_TASK_DEFINITION || task.status !== "ACTIVE" || task.networkMode !== "awsvpc" ||
        task.cpu !== "256" || task.memory !== "512" || !Array.isArray(task.compatibilities) || !task.compatibilities.includes("EC2") ||
        !Array.isArray(task.containerDefinitions) || task.containerDefinitions.length !== 1) throw fail();
    const worker = task.containerDefinitions[0];
    if (!object(worker) || worker.name !== "worker" || worker.essential !== true || worker.readonlyRootFilesystem !== true ||
        worker.user !== "65532:65532" || typeof worker.image !== "string" ||
        !new RegExp(`^${account}\\.dkr\\.ecr\\.${region}\\.amazonaws\\.com/${prefix}-worker@sha256:[a-f0-9]{64}$`).test(worker.image) ||
        typeof vars.WORKER_SUBNET_IDS !== "string" || typeof vars.WORKER_SECURITY_GROUP_ID !== "string" ||
        !/^sg-[a-f0-9]{17}$/.test(vars.WORKER_SECURITY_GROUP_ID)) throw fail();
    const subnets = vars.WORKER_SUBNET_IDS.split(",") as string[];
    if (subnets.length !== 2 || new Set(subnets).size !== 2 || subnets.some(s => !/^subnet-[a-f0-9]{17}$/.test(s))) throw fail();
    if (!empty(input.clusters.failures) || !Array.isArray(input.clusters.clusters) || input.clusters.clusters.length !== 1 ||
        input.clusters.nextToken !== undefined || input.instances.nextToken !== undefined || !empty(input.instances.containerInstanceArns)) throw fail();
    const cluster = input.clusters.clusters[0];
    if (!object(cluster) || cluster.clusterArn !== clusterArn || cluster.clusterName !== `${prefix}-worker` || cluster.status !== "ACTIVE" ||
        cluster.registeredContainerInstancesCount !== 0 || cluster.runningTasksCount !== 0 || cluster.pendingTasksCount !== 0 ||
        cluster.activeServicesCount !== 0 || !empty(cluster.capacityProviders) || !empty(cluster.defaultCapacityProviderStrategy)) throw fail();
    const startedBy = `gmai${input.nonce}`;
    return { region, endpoint: "https://ecs.ap-northeast-1.amazonaws.com/", service: "ecs",
      target: "AmazonEC2ContainerServiceV20141113.RunTask", checkedAtMs: input.checkedAtMs,
      request: { cluster: clusterArn, taskDefinition: task.taskDefinitionArn, launchType: "EC2", count: 1,
        clientToken: `gmai-denial-${input.nonce}`, startedBy, enableExecuteCommand: false,
        networkConfiguration: { awsvpcConfiguration: { subnets, securityGroups: [vars.WORKER_SECURITY_GROUP_ID], assignPublicIp: "DISABLED" } },
        // Runtime containment if a concurrent operator changes the empty cluster.
        // This does not prevent ECS-agent secret injection or replace cleanup.
        overrides: { containerOverrides: [{ name: "worker", environment: [
          { name: "JOB_ID", value: "" }, { name: "APP_ENV", value: "deny-probe" },
        ] }] },
      },
      liveAuthorizationVerified: false, executionAuthorized: false,
      independentTaskReconciliationRequired: true, taskSecretInjectionPrevented: false };
  } catch { throw fail(); }
}

export function syntheticComputeDenialPlan() {
  return { mode: "local-candidate", awsCalls: 0, runTaskRequests: 0, proposedRunTaskRequestsMax: 1,
    proposedLaunchType: "EC2", fargateSelected: false, capacityProviderStrategyPermitted: false,
    emptyRegisteredCapacityRequired: true, snapshotMaxAgeMs: 30000, proposedCount: 1,
    zeroCountDryRunAssumed: false, modelCalls: 0, providerCalls: 0, liveEntryImplemented: true,
    unexpectedTaskReconciliationImplemented: true, liveAuthorizationVerified: false,
    taskSecretInjectionPrevented: false, concurrentCapacityChangeRisk: true };
}
