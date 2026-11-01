import { createHash } from "node:crypto";

/** A non-secret consistency check, not authentication or proof of a live read. */
export function phase11ReferenceFingerprint(account: string, httpApiId: string): string {
  if (typeof account !== "string" || !/^[0-9]{12}$/.test(account) || /^0+$/.test(account) ||
      typeof httpApiId !== "string" || !/^[a-z0-9]{10}$/.test(httpApiId)) throw new Error("PHASE11_REFERENCE_IDENTITY_INVALID");
  const prefix = "global-market-ai-insight-dev";
  return createHash("sha256").update(JSON.stringify({
    version: "phase11-references-v1", account, region: "ap-northeast-1", httpApiId,
    controller: `${prefix}-controller`, jobsTable: `${prefix}-jobs`,
    logGroups: [`/aws/apigateway/${prefix}-api-access`, `/aws/lambda/${prefix}-controller`, `/aws/ecs/${prefix}/worker`],
  })).digest("hex");
}
