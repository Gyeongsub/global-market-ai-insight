import { DynamoDBClient, GetItemCommand, UpdateItemCommand, type AttributeValue } from "@aws-sdk/client-dynamodb";
import type { CircuitRecord } from "./circuit.js";
import { boundedAwsCall } from "../../../../shared/time/bounded-aws-call.js";

export const CIRCUIT_KEY = "control_circuit";
export interface CircuitSender {
  send(command: GetItemCommand | UpdateItemCommand, options: { abortSignal: AbortSignal }): Promise<unknown>;
}

export function decodeCircuit(item: Record<string, AttributeValue> | undefined): CircuitRecord | null {
  if (!item) return null;
  const state = item.state?.S;
  const reason = item.reason?.S;
  const actor = item.actor?.S;
  const updatedAt = item.updatedAt?.S;
  const version = Number(item.version?.N);
  if ((state !== "CLOSED" && state !== "OPEN") || !reason || !actor || !updatedAt ||
      reason.length > 128 || actor.length > 64 || !updatedAt.endsWith("Z") || Number.isNaN(Date.parse(updatedAt)) ||
      !Number.isSafeInteger(version) || version < 1 || item.expiresAt !== undefined) return null;
  return { state, reason, actor, updatedAt, version };
}

// This adapter is shared by the controller's read path and a future operator
// command. IAM, not this class, separates read-only callers from operators.
export class DynamoDbCircuitStore {
  private readonly client: CircuitSender;
  constructor(private readonly tableName: string, region: string, client?: CircuitSender) {
    if (!/^[A-Za-z0-9_.-]{3,255}$/.test(tableName)) throw new Error("Invalid circuit table.");
    this.client = client ?? new DynamoDBClient({ region, maxAttempts: 1 });
  }

  private async send(command: GetItemCommand | UpdateItemCommand, parent?: AbortSignal): Promise<unknown> {
    return boundedAwsCall(signal => this.client.send(command, { abortSignal: signal }), 2_000, undefined, parent);
  }

  async read(signal?: AbortSignal): Promise<CircuitRecord | null> {
    try {
      const response = await this.send(new GetItemCommand({
        TableName: this.tableName, Key: { jobId: { S: CIRCUIT_KEY } }, ConsistentRead: true,
      }), signal) as { Item?: Record<string, AttributeValue> };
      return decodeCircuit(response.Item);
    } catch { return null; }
  }

  async state(signal?: AbortSignal): Promise<"CLOSED" | "OPEN"> {
    return (await this.read(signal))?.state ?? "OPEN";
  }

  async change(input: { state: "CLOSED" | "OPEN"; reason: string; actor: string; expectedVersion: number; now: Date; confirmed?: boolean }): Promise<void> {
    if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0 || input.expectedVersion >= Number.MAX_SAFE_INTEGER ||
        !/^[a-zA-Z0-9_.-]{1,128}$/.test(input.reason) || !/^[a-zA-Z0-9_.-]{1,64}$/.test(input.actor) ||
        !["OPEN", "CLOSED"].includes(input.state) || Number.isNaN(input.now.getTime())) throw new Error("Invalid circuit change.");
    if (input.state === "CLOSED" && (input.confirmed !== true || input.expectedVersion === 0)) {
      throw new Error("Initialize OPEN first; closing requires confirmation and a current version.");
    }
    try {
      await this.send(new UpdateItemCommand({
        TableName: this.tableName, Key: { jobId: { S: CIRCUIT_KEY } },
        UpdateExpression: "SET #state = :state, #reason = :reason, #actor = :actor, #updatedAt = :now, #version = :next REMOVE #ttl",
        ConditionExpression: input.expectedVersion === 0 ? "attribute_not_exists(#version)" : "#version = :expected",
        ExpressionAttributeNames: { "#state": "state", "#reason": "reason", "#actor": "actor", "#updatedAt": "updatedAt", "#version": "version", "#ttl": "expiresAt" },
        ExpressionAttributeValues: {
          ":state": { S: input.state }, ":reason": { S: input.reason }, ":actor": { S: input.actor },
          ":now": { S: input.now.toISOString() }, ":next": { N: String(input.expectedVersion + 1) },
          ...(input.expectedVersion === 0 ? {} : { ":expected": { N: String(input.expectedVersion) } }),
        },
      }));
    } catch { throw new Error("Circuit change failed; read the current version before retrying."); }
  }
}
