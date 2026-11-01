/** IAM is verified by API Gateway, not by a browser-supplied header or body.
 * This additional boundary selects one IAM user from otherwise valid signers.
 * It is not a protection against an administrator replacing/invoking Lambda. */
const USER = /^arn:(aws|aws-us-gov|aws-cn):iam::([0-9]{12}):user\/(?:[A-Za-z0-9_+=,.@-]+\/)*[A-Za-z0-9_+=,.@-]{1,64}$/;
const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;

export function parsePrivateOwnerArn(value: unknown, clusterArn: string): string | null {
  // Old/omitted configuration locks the API instead of permitting every signer.
  if (value === undefined || value === "") return null;
  const owner = typeof value === "string" && value.length <= 512 ? USER.exec(value) : null;
  const cluster = /^arn:(aws|aws-us-gov|aws-cn):ecs:[a-z0-9-]+:([0-9]{12}):cluster\//.exec(clusterArn);
  if (!owner || !cluster || owner[1] !== cluster[1] || owner[2] !== cluster[2]) {
    throw new Error("Private owner configuration is invalid.");
  }
  return value as string;
}

export function isPrivateOwnerRequest(event: unknown, ownerArn: string | null): boolean {
  const owner = typeof ownerArn === "string" && ownerArn.length <= 512 ? USER.exec(ownerArn) : null;
  const request = record(event);
  const context = record(request?.requestContext);
  const authorizer = record(context?.authorizer);
  const iam = record(authorizer?.iam);
  return owner !== null && request?.version === "2.0" && context?.accountId === owner[2] &&
    authorizer?.jwt === undefined && authorizer?.lambda === undefined &&
    iam?.accountId === owner[2] && iam?.userArn === ownerArn;
}
