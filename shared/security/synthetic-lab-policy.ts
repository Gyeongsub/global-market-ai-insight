/** Local policy candidate only. No credentials, AWS client or deployment here.
 * The IAM window is deliberately separate from the process/one-attempt limits. */
export const SYNTHETIC_LAB_ROLE_NAME = "global-market-ai-insight-dev-synthetic-lab";
export const SYNTHETIC_MODEL_ARN = "arn:aws:bedrock:ap-northeast-1::foundation-model/amazon.nova-lite-v1:0";
export const SYNTHETIC_ROLE_SESSION_SECONDS = 900;
const WINDOW_MS = 300000;

export function validateSyntheticOwner(ownerUserArn: unknown, account: unknown): string {
  if (typeof account !== "string" || !/^[0-9]{12}$/.test(account) || /^0+$/.test(account) ||
      typeof ownerUserArn !== "string" || ownerUserArn !== `arn:aws:iam::${account}:user/aws-admin-user`)
    throw Error("SYNTHETIC_POLICY_OWNER_INVALID");
  return ownerUserArn;
}

export function syntheticRoleTrust(ownerUserArn: unknown, account: unknown) {
  const owner = validateSyntheticOwner(ownerUserArn, account);
  return { Version: "2012-10-17", Statement: [{ Effect: "Allow", Principal: { AWS: owner },
    Action: "sts:AssumeRole", Condition: {
      Bool: { "aws:SecureTransport": "true", "aws:MultiFactorAuthPresent": "true" },
      Null: { "aws:TokenIssueTime": "false" },
      StringLike: { "sts:RoleSessionName": "gmai-synthetic-*" },
    } }] };
}

export function syntheticModelPolicy() {
  return { Version: "2012-10-17", Statement: [
    { Sid: "OnlyTokyoNovaLite", Effect: "Allow", Action: "bedrock:InvokeModel", Resource: SYNTHETIC_MODEL_ARN,
      Condition: { StringEquals: { "aws:RequestedRegion": "ap-northeast-1" }, Bool: { "aws:SecureTransport": "true" } } },
    { Sid: "DenyOtherActions", Effect: "Deny", NotAction: "bedrock:InvokeModel", Resource: "*" },
    { Sid: "DenyOtherModels", Effect: "Deny", Action: "bedrock:InvokeModel", NotResource: SYNTHETIC_MODEL_ARN },
    { Sid: "DenyOtherRegions", Effect: "Deny", Action: "*", Resource: "*",
      Condition: { StringNotEquals: { "aws:RequestedRegion": "ap-northeast-1" } } },
    { Sid: "DenyInsecureTransport", Effect: "Deny", Action: "*", Resource: "*",
      Condition: { BoolIfExists: { "aws:SecureTransport": "false" } } },
  ] };
}

/** STS credentials last at least 900s; this policy denies new authorization
 * outside the requested 300s window. It cannot cancel an already accepted call. */
export function syntheticSessionPolicy(startedAt: unknown) {
  if (typeof startedAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(startedAt))
    throw Error("SYNTHETIC_POLICY_WINDOW_INVALID");
  const start = Date.parse(startedAt);
  if (!Number.isFinite(start) || new Date(start).toISOString() !== startedAt || start < 0 || start > 253402300499999)
    throw Error("SYNTHETIC_POLICY_WINDOW_INVALID");
  const expiresAt = new Date(start + WINDOW_MS).toISOString();
  const base = syntheticModelPolicy();
  return { Version: base.Version, Statement: [...base.Statement,
    { Sid: "DenyBeforeWindow", Effect: "Deny", Action: "*", Resource: "*", Condition: { DateLessThan: { "aws:CurrentTime": startedAt } } },
    { Sid: "DenyAtOrAfterWindow", Effect: "Deny", Action: "*", Resource: "*", Condition: { DateGreaterThanEquals: { "aws:CurrentTime": expiresAt } } },
  ] };
}
