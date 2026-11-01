import { DynamoDBClient, GetItemCommand, UpdateItemCommand, type AttributeValue } from "@aws-sdk/client-dynamodb";
import { DescribeTasksCommand, ECSClient, StopTaskCommand } from "@aws-sdk/client-ecs";
import { evaluateStaleJob } from "./sweeper.js";
import { isOwnedWorkerTask, type ObservedTask } from "./task-identity.js";
import { MaintenanceCallBudget } from "./maintenance-call-budget.js";

type DynamoCommand = GetItemCommand | UpdateItemCommand;
type EcsCommand = DescribeTasksCommand | StopTaskCommand;
type Item = Record<string, AttributeValue>;
export interface SweepDynamoSender {
  send(command: DynamoCommand, options: { abortSignal: AbortSignal }): Promise<unknown>;
}
export interface SweepEcsSender {
  send(command: EcsCommand, options: { abortSignal: AbortSignal }): Promise<unknown>;
}

interface Options {
  tableName: string;
  region: string;
  clusterArn: string;
  maxActiveJobs: number;
  dynamo?: SweepDynamoSender;
  ecs?: SweepEcsSender;
  elapsedNow?: () => number;
}

/**
 * Bounded slot-key sweep, not a table scan. The prepared handler's deployment
 * and disabled schedule are separate gates; this module never enables either.
 * Missing/ambiguous evidence always retains the slot for manual review.
 */
export class StaleJobSweeper {
  private readonly dynamo: SweepDynamoSender;
  private readonly ecs: SweepEcsSender;
  private readonly taskPrefix: string;

  constructor(private readonly options: Options) {
    if (!/^[A-Za-z0-9_.-]{3,255}$/.test(options.tableName) ||
        !Number.isInteger(options.maxActiveJobs) || options.maxActiveJobs < 1 || options.maxActiveJobs > 5) {
      throw new Error("Invalid sweep configuration.");
    }
    const cluster = /^arn:aws:ecs:([a-z0-9-]+):([0-9]{12}):cluster\/([A-Za-z0-9_-]+)$/.exec(options.clusterArn);
    if (!cluster || cluster[1] !== options.region) throw new Error("Invalid sweep cluster.");
    this.taskPrefix = options.clusterArn.replace(":cluster/", ":task/") + "/";
    this.dynamo = options.dynamo ?? new DynamoDBClient({ region: options.region, maxAttempts: 1 });
    this.ecs = options.ecs ?? new ECSClient({ region: options.region, maxAttempts: 1 });
  }

  async sweep(now = new Date(), signal?: AbortSignal): Promise<{ inspected: number; timedOut: number; stopRequested: number; retainedForReview: number }> {
    if (Number.isNaN(now.getTime())) throw new Error("Invalid sweep time.");
    const result = { inspected: 0, timedOut: 0, stopRequested: 0, retainedForReview: 0 };
    const budget = new MaintenanceCallBudget(20_000, signal, this.options.elapsedNow);
    const read = async (key: string): Promise<Item | undefined> => {
      const response = await budget.call(abortSignal => this.dynamo.send(new GetItemCommand({
        TableName: this.options.tableName, Key: { jobId: { S: key } }, ConsistentRead: true,
      }), { abortSignal })) as { Item?: Item };
      return response.Item;
    };
    try {
      for (let index = 0; index < this.options.maxActiveJobs; index++) {
        if (!budget.active()) { result.retainedForReview += this.options.maxActiveJobs - index; break; }
        try {
          const slot = await read(`control_slot_${index}`);
          if (!slot) continue;
          result.inspected++;
          const owner = slot.ownerJobId?.S;
          const acquiredAt = slot.acquiredAt?.S;
          if (!owner || !/^job_[a-f0-9]{48}$/.test(owner) || !acquiredAt) {
            result.retainedForReview++; continue;
          }
          const job = await read(owner);
          const taskArn = job?.taskArn?.S;
          const status = job?.status?.S;
          const deadlineAt = job?.deadlineAt?.S;
          const version = Number(job?.version?.N);
          if (job?.jobId?.S !== owner || job.createdAt?.S !== acquiredAt || !deadlineAt ||
              !["QUEUED", "RUNNING", "SUCCEEDED", "FAILED", "TIMED_OUT"].includes(status ?? "") ||
              !Number.isSafeInteger(version) || version < 1 || version >= Number.MAX_SAFE_INTEGER) {
            result.retainedForReview++; continue;
          }
          if (status !== "QUEUED" && status !== "RUNNING") continue;
          const decision = evaluateStaleJob({ jobId: owner, status, deadlineAt, ...(taskArn ? { taskArn } : {}) }, now);
          if (!decision) continue;
          // No task reference is ambiguous: a launch could have succeeded but
          // its ARN write may have failed. Never clear the job/slot blindly.
          if (!taskArn || !taskArn.startsWith(this.taskPrefix) || !/^[a-f0-9]{32}$/.test(taskArn.slice(this.taskPrefix.length))) {
            result.retainedForReview++; continue;
          }
          const response = await budget.call(abortSignal => this.ecs.send(new DescribeTasksCommand({ cluster: this.options.clusterArn, tasks: [taskArn] }), { abortSignal })) as {
            tasks?: ObservedTask[];
            failures?: unknown[];
          };
          const task = response.tasks?.[0];
          if ((response.failures?.length ?? 0) !== 0 || response.tasks?.length !== 1 ||
              !isOwnedWorkerTask(task, taskArn, this.options.clusterArn, owner) ||
              !["PROVISIONING", "PENDING", "ACTIVATING", "RUNNING", "DEACTIVATING", "STOPPING", "DEPROVISIONING", "STOPPED"].includes(task.lastStatus ?? "")) {
            result.retainedForReview++; continue;
          }
          if (task.lastStatus !== "STOPPED") {
            if (task.desiredStatus === "STOPPED") { result.retainedForReview++; continue; }
            // An exact ARN is required; never StopTask by a guessed family or
            // list result. Do not mark terminal until actual STOPPED is seen.
            await budget.call(abortSignal => this.ecs.send(new StopTaskCommand({ cluster: this.options.clusterArn, task: taskArn, reason: "JOB_DEADLINE_EXCEEDED" }), { abortSignal }));
            result.stopRequested++;
            const stoppedResponse = await budget.call(abortSignal => this.ecs.send(new DescribeTasksCommand({ cluster: this.options.clusterArn, tasks: [taskArn] }), { abortSignal })) as {
              tasks?: ObservedTask[];
              failures?: unknown[];
            };
            const stopped = stoppedResponse.tasks?.[0];
            if ((stoppedResponse.failures?.length ?? 0) !== 0 || stoppedResponse.tasks?.length !== 1 ||
                !isOwnedWorkerTask(stopped, taskArn, this.options.clusterArn, owner) || stopped.lastStatus !== "STOPPED") {
              result.retainedForReview++; continue;
            }
          }
          await budget.call(abortSignal => this.dynamo.send(new UpdateItemCommand({
            TableName: this.options.tableName,
            Key: { jobId: { S: owner } },
            UpdateExpression: "SET #status = :timedOut, #updatedAt = :now, #version = :nextVersion, #errorCode = :errorCode, #errorMessage = :errorMessage",
            ConditionExpression: "#status = :previousStatus AND #version = :previousVersion AND #taskArn = :taskArn AND #createdAt = :acquiredAt AND #deadlineAt = :deadlineAt",
            ExpressionAttributeNames: {
              "#status": "status", "#updatedAt": "updatedAt", "#version": "version", "#errorCode": "errorCode",
              "#errorMessage": "errorMessage", "#taskArn": "taskArn", "#createdAt": "createdAt", "#deadlineAt": "deadlineAt",
            },
            ExpressionAttributeValues: {
              ":timedOut": { S: "TIMED_OUT" }, ":now": { S: now.toISOString() }, ":nextVersion": { N: String(version + 1) },
              ":errorCode": { S: "JOB_DEADLINE_EXCEEDED" }, ":errorMessage": { S: "Job deadline exceeded." },
              ":previousStatus": { S: status }, ":previousVersion": { N: String(version) },
              ":taskArn": { S: taskArn }, ":acquiredAt": { S: acquiredAt }, ":deadlineAt": { S: deadlineAt },
            },
          }), { abortSignal }));
          result.timedOut++;
          // Slot deletion is intentionally absent. The separate reconciler
          // requires a terminal job and an observed STOPPED task first.
        } catch {
          result.retainedForReview++;
        }
      }
      return result;
    } finally {
      budget.dispose();
    }
  }
}
