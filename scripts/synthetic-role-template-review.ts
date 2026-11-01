import { createHash } from "node:crypto";
import { SYNTHETIC_LAB_ROLE_NAME, syntheticModelPolicy, syntheticRoleTrust, validateSyntheticOwner } from "../shared/security/synthetic-lab-policy.js";

type Json = Record<string, any>;
function fail(): never { throw Error("SYNTHETIC_ROLE_TEMPLATE_REJECTED"); }
function canonical(value: any): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
  return JSON.stringify(value);
}
function same(a: unknown, b: unknown) { return canonical(a) === canonical(b); }
export function syntheticRoleDraftTags(nonce: string) {
  if (!/^[a-f0-9]{32}$/.test(nonce)) fail();
  return [{ Key: "Project", Value: "global-market-ai-insight" }, { Key: "ProofId", Value: nonce },
    { Key: "Purpose", Value: "synthetic-lab-role-proof" }];
}
function matchingTags(value: unknown, nonce: string) {
  return Array.isArray(value) && value.every(v => v && typeof v.Key === "string" && typeof v.Value === "string") &&
    same([...value].sort((a, b) => a.Key.localeCompare(b.Key)), syntheticRoleDraftTags(nonce));
}
export function syntheticRoleTemplateExpected(ownerArn: string, account: string) {
  validateSyntheticOwner(ownerArn, account);
  return { Resources: { SyntheticLabRole: { Type: "AWS::IAM::Role", DeletionPolicy: "Delete", UpdateReplacePolicy: "Delete", Properties: {
    AssumeRolePolicyDocument: syntheticRoleTrust(ownerArn, account),
    Description: "Private synthetic learning: Tokyo Nova Lite only; not a deployment or provider role",
    MaxSessionDuration: 3600, RoleName: SYNTHETIC_LAB_ROLE_NAME,
    Policies: [{ PolicyDocument: syntheticModelPolicy(), PolicyName: "TokyoNovaLiteOnly" }],
    Tags: [{ Key: "Environment", Value: "dev" }, { Key: "ManagedBy", Value: "CDK" },
      { Key: "Owner", Value: "portfolio-developer" }, { Key: "Project", Value: "global-market-ai-insight" },
      { Key: "Purpose", Value: "synthetic-bedrock-learning" }],
  } } } };
}
export function reviewSyntheticRoleTemplate(value: unknown, ownerArn: string, account: string) {
  try {
    const serialized = JSON.stringify(value);
    if (!serialized || serialized.length > 20000 || !same(value, syntheticRoleTemplateExpected(ownerArn, account))) fail();
    return { resources: 1, iamRoles: 1, permissionPolicies: 1, computeResources: 0, storageResources: 0,
      publicEndpoints: 0, retentionOnDelete: false,
      templateSha256: createHash("sha256").update(canonical(value)).digest("hex"), executionAuthorized: false };
  } catch { fail(); }
}

/** Structural review of a CREATE proposal only. This never executes/deletes a
 * change set or verifies actual authorization. Caller must re-read immediately
 * before execution and reconcile its exact owned stack after any ambiguity. */
export function reviewSyntheticRoleDraftOwnership(change: Json, template: unknown, input: {
  ownerArn: string; account: string; nonce: string; startedAtMs: number; stack: Json;
}) {
  const reviewed = reviewSyntheticRoleTemplate(template, input.ownerArn, input.account);
  const name = `gmai-synthetic-role-${input.nonce}`, created = Date.parse(change?.CreationTime);
  if (!/^[a-f0-9]{32}$/.test(input.nonce) || !Number.isSafeInteger(input.startedAtMs) || input.startedAtMs < 0 ||
      !Number.isFinite(created) || created < input.startedAtMs - 1000 || created > input.startedAtMs + 240000 ||
      change?.ChangeSetName !== name || change.StackName !== name ||
      change.ChangeSetType !== undefined && change.ChangeSetType !== "CREATE" ||
      !["CREATE_PENDING", "CREATE_IN_PROGRESS", "CREATE_COMPLETE", "FAILED"].includes(change.Status) ||
      change.ExecutionStatus !== (change.Status === "CREATE_COMPLETE" ? "AVAILABLE" : "UNAVAILABLE") || change.NextToken !== undefined ||
      change.IncludeNestedStacks !== false || ![undefined, false].includes(change.ImportExistingResources) || change.RoleARN !== undefined ||
      change.OnStackFailure !== "DELETE" || !same(change.NotificationARNs ?? [], []) || !matchingTags(change.Tags, input.nonce) ||
      change.ParentChangeSetId !== undefined || change.RootChangeSetId !== undefined || change.DeploymentMode !== undefined ||
      change.DeploymentConfig !== undefined && !same(change.DeploymentConfig, { Mode: "STANDARD", DisableRollback: false }) || change.StackDriftStatus !== undefined ||
      !same(change.Capabilities, ["CAPABILITY_NAMED_IAM"]) || !same(change.Parameters ?? [], []) ||
      !new RegExp(`^arn:aws:cloudformation:ap-northeast-1:${input.account}:changeSet/${name}/[a-zA-Z0-9-]+$`).test(change.ChangeSetId ?? "") ||
      !new RegExp(`^arn:aws:cloudformation:ap-northeast-1:${input.account}:stack/${name}/[a-zA-Z0-9-]+$`).test(change.StackId ?? "")) fail();
  // DescribeChangeSet does not document ChangeSetType in its response. The
  // independently read new stack's REVIEW_IN_PROGRESS state proves this is not
  // an update proposal; the caller must bind its recorded CREATE request too.
  const stack = input.stack, stackCreated = Date.parse(stack?.CreationTime);
  if (stack?.StackId !== change.StackId || stack.StackName !== name || stack.StackStatus !== "REVIEW_IN_PROGRESS" ||
      !Number.isFinite(stackCreated) || stackCreated < input.startedAtMs - 1000 || stackCreated > input.startedAtMs + 240000 ||
      stack.RoleARN !== undefined || stack.ParentId !== undefined || stack.RootId !== undefined ||
      stack.DeploymentConfig !== undefined && !same(stack.DeploymentConfig, { Mode: "STANDARD", DisableRollback: false }) ||
      stack.EnableTerminationProtection !== false ||
      !(same(stack.Tags, []) || matchingTags(stack.Tags, input.nonce)) ||
      !same(stack.Parameters ?? [], []) || !same(stack.NotificationARNs ?? [], [])) fail();
  // CREATE placeholders can have no tags until execution. Empty tags alone are
  // never ownership: require the independently read tagged proposal, exact
  // template, unique IDs and bounded creation times together. Cleanup may use
  // this historical binding after the normal activity window expires.
  return { ...reviewed, draftOwnershipVerified: true, stackTagsApplied: !same(stack.Tags, []), executionAuthorized: false };
}

export function reviewSyntheticRoleChangeSet(change: Json, template: unknown, input: {
  ownerArn: string; account: string; nonce: string; startedAtMs: number; nowMs: number; stack: Json;
}) {
  const reviewed = reviewSyntheticRoleDraftOwnership(change, template, input);
  if (!Number.isSafeInteger(input.nowMs) || input.nowMs < input.startedAtMs || input.nowMs - input.startedAtMs > 300000 ||
      Date.parse(change.CreationTime) > input.nowMs || Date.parse(input.stack.CreationTime) > input.nowMs ||
      change.Status !== "CREATE_COMPLETE" || change.ExecutionStatus !== "AVAILABLE" ||
      !Array.isArray(change.Changes) || change.Changes.length !== 1) fail();
  const resource = change.Changes[0];
  if (resource.Type !== "Resource" || resource.ResourceChange?.Action !== "Add" ||
      resource.ResourceChange.LogicalResourceId !== "SyntheticLabRole" || resource.ResourceChange.ResourceType !== "AWS::IAM::Role" ||
      resource.ResourceChange.PhysicalResourceId !== undefined || resource.ResourceChange.ChangeSetId !== undefined ||
      ![undefined, "False"].includes(resource.ResourceChange.Replacement)) fail();
  return { ...reviewed, createProposalVerified: true, existingStackUpdate: false, changes: 1,
    exactStackAndChangeSetNamesVerified: true, executionAuthorized: false };
}
