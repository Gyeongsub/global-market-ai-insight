/** Fields returned by ECS DescribeTasks that prove the one-shot worker owner. */
export type ObservedTask = {
  taskArn?: string;
  clusterArn?: string;
  lastStatus?: string;
  desiredStatus?: string;
  startedBy?: string;
  overrides?: { containerOverrides?: Array<{ name?: string; environment?: Array<{ name?: string; value?: string }> }> };
};

/** Fail closed if an ARN was attached to the wrong job or worker override. */
export function isOwnedWorkerTask(task: ObservedTask | undefined, taskArn: string, clusterArn: string, owner: string): task is ObservedTask {
  const overrides = task?.overrides?.containerOverrides;
  const environment = overrides?.[0]?.environment;
  return task?.taskArn === taskArn && task.clusterArn === clusterArn &&
    task.startedBy === owner.slice(0, 36) && overrides?.length === 1 &&
    overrides[0]?.name === "worker" && environment?.length === 1 &&
    environment[0]?.name === "JOB_ID" && environment[0]?.value === owner;
}
