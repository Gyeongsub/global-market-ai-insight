const REGION_PATTERN = /^[a-z]{2}(?:-gov)?-[a-z]+-\d$/;
const CLUSTER_ARN = /^arn:(aws|aws-us-gov|aws-cn):ecs:([a-z0-9-]+):(\d{12}):cluster\/([A-Za-z0-9_-]{1,255})$/;
const DEFINITION_ARN = /^arn:(aws|aws-us-gov|aws-cn):ecs:([a-z0-9-]+):(\d{12}):task-definition\/([A-Za-z0-9_-]{1,255}):([1-9]\d{0,9})$/;

export interface WorkerLaunchScope {
  clusterArn: string;
  taskDefinitionArn: string;
  taskArnPrefix: string;
}

/** CDK supplies full ARNs. Never infer an account or resolve an unpinned revision. */
export function workerLaunchScope(region: string, cluster: string, taskDefinition: string): WorkerLaunchScope {
  const partition = region.startsWith("us-gov-") ? "aws-us-gov" : region.startsWith("cn-") ? "aws-cn" : "aws";
  const clusterMatch = typeof cluster === "string" && cluster.length <= 512 ? CLUSTER_ARN.exec(cluster) : null;
  const definitionMatch = typeof taskDefinition === "string" && taskDefinition.length <= 512 ? DEFINITION_ARN.exec(taskDefinition) : null;
  if (!REGION_PATTERN.test(region) || !clusterMatch || !definitionMatch ||
      clusterMatch[1] !== partition || definitionMatch[1] !== partition ||
      clusterMatch[2] !== region || definitionMatch[2] !== region || clusterMatch[3] !== definitionMatch[3]) {
    // Do not echo an ARN, account, supplied region or revision into public logs.
    throw new Error("Worker launch resource scope is invalid.");
  }
  return Object.freeze({ clusterArn: cluster, taskDefinitionArn: taskDefinition,
    taskArnPrefix: `arn:${partition}:ecs:${region}:${clusterMatch[3]}:task/${clusterMatch[4]}/` });
}

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);

/** Missing or conflicting response proof is not success, and never triggers a second launch. */
export function expectedLaunchedTask(response: unknown, scope: WorkerLaunchScope, jobId: string, containerName: string): string | null {
  if (!object(response) || (response.failures !== undefined && (!Array.isArray(response.failures) || response.failures.length !== 0)) ||
      !Array.isArray(response.tasks) || response.tasks.length !== 1) return null;
  const task: unknown = response.tasks[0];
  if (!object(task) || typeof task.taskArn !== "string" || !task.taskArn.startsWith(scope.taskArnPrefix) ||
      !/^[a-f0-9]{32}$/.test(task.taskArn.slice(scope.taskArnPrefix.length)) ||
      task.clusterArn !== scope.clusterArn || task.taskDefinitionArn !== scope.taskDefinitionArn ||
      task.startedBy !== jobId.slice(0, 36) || task.launchType !== "FARGATE" || task.enableExecuteCommand !== false ||
      !object(task.overrides) || !Array.isArray(task.overrides.containerOverrides) || task.overrides.containerOverrides.length !== 1) return null;
  const override: unknown = task.overrides.containerOverrides[0];
  if (!object(override) || override.name !== containerName || !Array.isArray(override.environment) || override.environment.length !== 1) return null;
  const variable: unknown = override.environment[0];
  if (!object(variable) || variable.name !== "JOB_ID" || variable.value !== jobId) return null;
  // Unexpected execution instructions or role overrides require review, not acceptance.
  if (["command", "environmentFiles", "cpu", "memory", "memoryReservation", "resourceRequirements"].some(key => override[key] !== undefined) ||
      ["executionRoleArn", "taskRoleArn", "cpu", "memory", "ephemeralStorage", "inferenceAcceleratorOverrides"].some(key => task.overrides && object(task.overrides) && task.overrides[key] !== undefined)) return null;
  return task.taskArn;
}
