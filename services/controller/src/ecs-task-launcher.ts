import { ECSClient, RunTaskCommand, type ECSClientConfig } from "@aws-sdk/client-ecs";
import { stableHash } from "./job.js";
import type { TaskLauncher } from "./controller-service.js";
import { expectedLaunchedTask, workerLaunchScope, type WorkerLaunchScope } from "./worker-launch-scope.js";
import { boundedAwsCall } from "../../../shared/time/bounded-aws-call.js";

export interface ControllerEcsSender {
  send(command: RunTaskCommand, options: { abortSignal: AbortSignal }): Promise<unknown>;
}

export class TaskLaunchError extends Error {
  constructor(public readonly code: "TIMEOUT" | "ACCESS_DENIED" | "REJECTED" | "UNAVAILABLE") {
    super("Secure worker launch failed.");
    this.name = "TaskLaunchError";
  }
}

interface LauncherOptions {
  region: string;
  cluster: string;
  taskDefinition: string;
  subnetIds: string[];
  securityGroupId: string;
  containerName?: string;
  operationTimeoutMs?: number;
  elapsedNow?: () => number;
  client?: ControllerEcsSender;
}

const REGION_PATTERN = /^[a-z]{2}(?:-gov)?-[a-z]+-\d$/;
const JOB_ID_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

export function controllerEcsConfig(region: string): ECSClientConfig {
  if (!REGION_PATTERN.test(region)) throw new Error("AWS region is invalid.");
  return { region, maxAttempts: 1 };
}

function names(error: unknown): Set<string> {
  const output = new Set<string>();
  let current = error;
  for (let depth = 0; depth < 3 && typeof current === "object" && current !== null; depth += 1) {
    const value = current as { name?: unknown; code?: unknown; cause?: unknown };
    if (typeof value.name === "string") output.add(value.name);
    if (typeof value.code === "string") output.add(value.code);
    current = value.cause;
  }
  return output;
}

function safeTaskError(error: unknown): TaskLaunchError {
  const identities = names(error);
  if (["AbortError", "TimeoutError", "RequestTimeout", "ETIMEDOUT"].some((name) => identities.has(name))) return new TaskLaunchError("TIMEOUT");
  if (["AccessDeniedException", "UnrecognizedClientException", "ExpiredTokenException"].some((name) => identities.has(name))) return new TaskLaunchError("ACCESS_DENIED");
  return new TaskLaunchError("UNAVAILABLE");
}

export class EcsFargateTaskLauncher implements TaskLauncher {
  private readonly client: ControllerEcsSender;
  private readonly containerName: string;
  private readonly operationTimeoutMs: number;
  private readonly scope: WorkerLaunchScope;
  private readonly subnetIds: readonly string[];
  private readonly securityGroupId: string;
  private readonly elapsedNow: (() => number) | undefined;

  constructor(options: LauncherOptions) {
    this.scope = workerLaunchScope(options.region, options.cluster, options.taskDefinition);
    if (!Array.isArray(options.subnetIds) || options.subnetIds.length < 1 || options.subnetIds.length > 4 ||
        new Set(options.subnetIds).size !== options.subnetIds.length || options.subnetIds.some((value) => !/^subnet-[a-f0-9]{8,17}$/.test(value))) {
      throw new Error("Worker subnet configuration is invalid.");
    }
    if (!/^sg-[a-f0-9]{8,17}$/.test(options.securityGroupId)) throw new Error("Worker security group is invalid.");
    this.subnetIds = Object.freeze([...options.subnetIds]);
    this.securityGroupId = options.securityGroupId;
    this.containerName = options.containerName ?? "worker";
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(this.containerName)) throw new Error("Worker container name is invalid.");
    this.operationTimeoutMs = options.operationTimeoutMs ?? 7_000;
    this.elapsedNow = options.elapsedNow;
    if (!Number.isInteger(this.operationTimeoutMs) || this.operationTimeoutMs < 500 || this.operationTimeoutMs > 15_000) throw new Error("ECS operation timeout is invalid.");
    this.client = options.client ?? (new ECSClient(controllerEcsConfig(options.region)) as ControllerEcsSender);
  }

  async launch(jobId: string, signal?: AbortSignal): Promise<{ taskArn: string }> {
    if (!JOB_ID_PATTERN.test(jobId)) throw new TaskLaunchError("REJECTED");
    try {
      const response = await boundedAwsCall(callSignal => this.client.send(new RunTaskCommand({
        cluster: this.scope.clusterArn,
        taskDefinition: this.scope.taskDefinitionArn,
        launchType: "FARGATE",
        count: 1,
        clientToken: stableHash(`run-task|${jobId}`),
        startedBy: jobId.slice(0, 36),
        enableExecuteCommand: false,
        networkConfiguration: {
          awsvpcConfiguration: {
            subnets: [...this.subnetIds],
            securityGroups: [this.securityGroupId],
            assignPublicIp: "ENABLED",
          },
        },
        overrides: {
          containerOverrides: [{
            name: this.containerName,
            environment: [{ name: "JOB_ID", value: jobId }],
          }],
        },
      }), { abortSignal: callSignal }), this.operationTimeoutMs, this.elapsedNow, signal);
      const taskArn = expectedLaunchedTask(response, this.scope, jobId, this.containerName);
      if (taskArn === null) throw new TaskLaunchError("REJECTED");
      return { taskArn };
    }
    catch (error) {
      if (error instanceof TaskLaunchError) throw error;
      throw safeTaskError(error);
    }
  }
}
