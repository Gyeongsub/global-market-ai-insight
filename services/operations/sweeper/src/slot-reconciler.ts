import { DynamoDBClient, GetItemCommand, TransactWriteItemsCommand, type AttributeValue } from "@aws-sdk/client-dynamodb";
import { ECSClient, DescribeTasksCommand } from "@aws-sdk/client-ecs";
import { isOwnedWorkerTask, type ObservedTask } from "./task-identity.js";
import { MaintenanceCallBudget } from "./maintenance-call-budget.js";

export interface SlotDynamoSender {
  send(command: GetItemCommand | TransactWriteItemsCommand, options: { abortSignal: AbortSignal }): Promise<unknown>;
}
export interface SlotEcsSender {
  send(command: DescribeTasksCommand, options: { abortSignal: AbortSignal }): Promise<unknown>;
}
interface Options {
  tableName: string; region: string; clusterArn: string; maxActiveJobs: number;
  dynamo?: SlotDynamoSender; ecs?: SlotEcsSender;
  elapsedNow?: () => number;
}
type Item = Record<string, AttributeValue>;

// No schedule/handler is registered by this module. Deployment and operator
// execution remain separate gates. Missing evidence always retains capacity.
export class SlotReconciler {
  private readonly dynamo: SlotDynamoSender;
  private readonly ecs: SlotEcsSender;
  constructor(private readonly options: Options) {
    if (!/^[A-Za-z0-9_.-]{3,255}$/.test(options.tableName) || !Number.isInteger(options.maxActiveJobs) || options.maxActiveJobs < 1 || options.maxActiveJobs > 5) throw new Error("Invalid slot configuration.");
    const cluster = /^arn:aws:ecs:([a-z0-9-]+):([0-9]{12}):cluster\/([A-Za-z0-9_-]+)$/.exec(options.clusterArn);
    if (!cluster || cluster[1] !== options.region) throw new Error("Invalid reconciliation cluster.");
    this.dynamo = options.dynamo ?? new DynamoDBClient({ region: options.region, maxAttempts: 1 });
    this.ecs = options.ecs ?? new ECSClient({ region: options.region, maxAttempts: 1 });
  }

  async reconcile(signal?: AbortSignal): Promise<{ released: number; retained: number; empty: number }> {
    const budget = new MaintenanceCallBudget(10_000, signal, this.options.elapsedNow);
    const result = { released: 0, retained: 0, empty: 0 };
    const read = async (key: string): Promise<Item | undefined> => {
      const response = await budget.call(abortSignal => this.dynamo.send(new GetItemCommand({ TableName: this.options.tableName, Key: { jobId: { S: key } }, ConsistentRead: true }), { abortSignal })) as { Item?: Item };
      return response.Item;
    };
    try {
      for (let index = 0; index < this.options.maxActiveJobs; index += 1) {
        if (!budget.active()) { result.retained += this.options.maxActiveJobs - index; break; }
        try {
          const slotKey = `control_slot_${index}`;
          const slot = await read(slotKey);
          if (!slot) { result.empty += 1; continue; }
          const owner = slot.ownerJobId?.S;
          const acquired = slot.acquiredAt?.S;
          if (!owner || !/^job_[a-f0-9]{48}$/.test(owner) || !acquired) { result.retained += 1; continue; }
          const job = await read(owner);
          const taskArn = job?.taskArn?.S;
          const status = job?.status?.S;
          const version = Number(job?.version?.N);
          // A job ID may be reused after retention; never release an older
          // owner's slot using a newer job's STOPPED task.
          const taskPrefix = this.options.clusterArn.replace(":cluster/", ":task/") + "/";
          if (!job || job.createdAt?.S !== acquired || !taskArn?.startsWith(taskPrefix) ||
              !/^[a-f0-9]{32}$/.test(taskArn.slice(taskPrefix.length)) || !status ||
              !["SUCCEEDED", "FAILED", "TIMED_OUT"].includes(status) || !Number.isSafeInteger(version) || version < 1) {
            result.retained += 1; continue;
          }
          const response = await budget.call(abortSignal => this.ecs.send(new DescribeTasksCommand({ cluster: this.options.clusterArn, tasks: [taskArn] }), { abortSignal })) as {
            tasks?: ObservedTask[]; failures?: unknown[];
          };
          const task = response.tasks?.[0];
          if ((response.failures?.length ?? 0) !== 0 || response.tasks?.length !== 1 ||
              !isOwnedWorkerTask(task, taskArn, this.options.clusterArn, owner) || task.lastStatus !== "STOPPED") {
            result.retained += 1; continue;
          }
          await budget.call(abortSignal => this.dynamo.send(new TransactWriteItemsCommand({ TransactItems: [
            { ConditionCheck: {
              TableName: this.options.tableName, Key: { jobId: { S: owner } },
              ConditionExpression: "#task = :task AND #version = :version AND #status = :status AND #created = :created",
              ExpressionAttributeNames: { "#task": "taskArn", "#version": "version", "#status": "status", "#created": "createdAt" },
              ExpressionAttributeValues: { ":task": { S: taskArn }, ":version": { N: String(version) }, ":status": { S: status }, ":created": { S: acquired } },
            } },
            { Delete: {
              TableName: this.options.tableName, Key: { jobId: { S: slotKey } },
              ConditionExpression: "#owner = :owner AND #acquired = :acquired",
              ExpressionAttributeNames: { "#owner": "ownerJobId", "#acquired": "acquiredAt" },
              ExpressionAttributeValues: { ":owner": { S: owner }, ":acquired": { S: acquired } },
            } },
          ] }), { abortSignal }));
          result.released += 1;
        } catch { result.retained += 1; }
      }
      return result;
    } finally { budget.dispose(); }
  }
}
