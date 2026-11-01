import { createHash } from "node:crypto";
import { canonicalPatchValue, canonicalStackTags } from "./compute-patch-rollout.js";

type Json = Record<string, any>;
export const OWNER_STACK = "global-market-ai-insight-dev-compute";
export const OWNER_FUNCTION = "global-market-ai-insight-dev-controller";
export const OWNER_RESOURCE = "ControllerFunctionC25B79B1";
export const OWNER_REGION = "ap-northeast-1";
const same = (a: unknown, b: unknown) => canonicalPatchValue(a) === canonicalPatchValue(b);
const object = (v: unknown): v is Json => v !== null && typeof v === "object" && !Array.isArray(v);
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
function fail(code: string): never { throw new Error(`PRIVATE_OWNER_${code}`); }
export const ownerDigest = (v: unknown) => createHash("sha256").update(canonicalPatchValue(v)).digest("hex");

export function reviewOwnerIdentity(identity: Json) {
  const account = identity?.Account;
  if (typeof account !== "string" || !/^(?!0{12}$)[0-9]{12}$/.test(account) ||
      identity.Arn !== `arn:aws:iam::${account}:user/aws-admin-user` ||
      typeof identity.UserId !== "string" || !/^AIDA[A-Z0-9]{16,32}$/.test(identity.UserId)) fail("IDENTITY_INVALID");
  return { account, ownerArn: identity.Arn as string };
}

/** No whole-stack re-synthesis: preserve every property except the controller
 * artifact key and one exact owner variable. Worker/IAM/network remain byte-equivalent. */
export function proposeOwnerTemplate(live: Json, identity: Json, zipSha256: string) {
  const { account, ownerArn } = reviewOwnerIdentity(identity);
  const r = live?.Resources?.[OWNER_RESOURCE], p = r?.Properties;
  if (!object(live) || !object(live.Resources) || Object.keys(live.Resources).length !== 26 ||
      r?.Type !== "AWS::Lambda::Function" || p?.FunctionName !== OWNER_FUNCTION ||
      p.Runtime !== "nodejs22.x" || p.Handler !== "main.handler" ||
      !same(p.Architectures, ["x86_64"]) || !object(p.Code) ||
      !same(Object.keys(p.Code).sort(), ["S3Bucket", "S3Key"]) ||
      p.Code.S3Bucket !== `cdk-hnb659fds-assets-${account}-${OWNER_REGION}` ||
      !/^[a-f0-9]{64}\.zip$/.test(p.Code.S3Key) ||
      !object(p.Environment) || !same(Object.keys(p.Environment), ["Variables"]) || !object(p.Environment.Variables)) fail("TEMPLATE_INVALID");
  const env = p.Environment.Variables;
  if (env.ENABLE_PROVIDER_BACKED_JOBS !== "false" || env.ENABLE_LIVE_RESULT_DISPLAY !== "false" ||
      env.API_AUTH_MODE !== "AWS_IAM" || !["CLOSED", "OPEN"].includes(env.CIRCUIT_STATE) ||
      env.PRIVATE_OWNER_USER_ARN !== undefined && env.PRIVATE_OWNER_USER_ARN !== "" && env.PRIVATE_OWNER_USER_ARN !== ownerArn) fail("POSTURE_INVALID");
  if (!/^[a-f0-9]{64}$/.test(zipSha256) || p.Code.S3Key === `${zipSha256}.zip`) fail("ARTIFACT_INVALID");
  const proposed = clone(live);
  proposed.Resources[OWNER_RESOURCE].Properties.Code.S3Key = `${zipSha256}.zip`;
  proposed.Resources[OWNER_RESOURCE].Properties.Environment.Variables.PRIVATE_OWNER_USER_ARN = ownerArn;
  return proposed;
}

export function reviewOwnerTemplate(live: Json, proposed: Json, identity: Json, zipSha256: string) {
  if (!same(proposed, proposeOwnerTemplate(live, identity, zipSha256))) fail("NONEXCLUSIVE_TEMPLATE");
  return { onlyControllerArtifactAndOwnerChanged: true, resourcesAdded: 0, resourcesRemoved: 0,
    iamChanged: false, workerChanged: false, networkChanged: false, jobsEnabled: false, displayEnabled: false };
}

export function reviewOwnerStack(stack: Json, account: string) {
  if (!/^(?!0{12}$)[0-9]{12}$/.test(account) || stack?.StackName !== OWNER_STACK || stack.StackStatus !== "UPDATE_COMPLETE" ||
      !new RegExp(`^arn:aws:cloudformation:${OWNER_REGION}:${account}:stack/${OWNER_STACK}/[A-Za-z0-9-]+$`).test(stack.StackId) ||
      stack.DisableRollback === true || stack.RoleARN !== `arn:aws:iam::${account}:role/cdk-hnb659fds-cfn-exec-role-${account}-${OWNER_REGION}` ||
      !Array.isArray(stack.Parameters) || stack.Parameters.length !== 1 || stack.Parameters[0].ParameterKey !== "BootstrapVersion" ||
      stack.Parameters[0].ParameterValue !== "/cdk-bootstrap/hnb659fds/version" || !/^[1-9][0-9]*$/.test(stack.Parameters[0].ResolvedValue) ||
      !same(stack.NotificationARNs ?? [], [])) fail("STACK_INVALID");
  canonicalStackTags(stack.Tags);
}

export function ownerDraftIdentity(value: Json, stack: Json, account: string, name: string, started: number, now: number) {
  reviewOwnerStack(stack, account);
  const created = Date.parse(value?.CreationTime);
  if (!/^gmai-owner-[a-f0-9]{32}$/.test(name) || !Number.isSafeInteger(started) || !Number.isSafeInteger(now) ||
      started < 0 || now < started || now - started > 1_800_000 || !Number.isFinite(created) || created < started - 1000 || created > now ||
      value.StackId !== stack.StackId || value.StackName !== OWNER_STACK || value.ChangeSetName !== name ||
      !new RegExp(`^arn:aws:cloudformation:${OWNER_REGION}:${account}:changeSet/${name}/[A-Za-z0-9-]+$`).test(value.ChangeSetId)) fail("DRAFT_OWNER_INVALID");
  return value.ChangeSetId as string;
}

export function reviewOwnerDraft(value: Json, stack: Json, identity: Json, name: string, started: number, now: number,
  live: Json, proposed: Json, runtime: Json, zipSha256: string) {
  const { account, ownerArn } = reviewOwnerIdentity(identity);
  ownerDraftIdentity(value, stack, account, name, started, now);
  reviewOwnerTemplate(live, proposed, identity, zipSha256);
  if (value.Status !== "CREATE_COMPLETE" || value.ExecutionStatus !== "AVAILABLE" || value.NextToken != null ||
      value.ParentChangeSetId != null || value.RootChangeSetId != null || value.IncludeNestedStacks !== false || value.ImportExistingResources === true ||
      value.DeploymentMode != null || value.OnStackFailure != null ||
      canonicalStackTags(value.Tags) !== canonicalStackTags(stack.Tags) || !same(value.NotificationARNs ?? [], stack.NotificationARNs ?? []) ||
      !same(value.RollbackConfiguration ?? {}, stack.RollbackConfiguration ?? {}) || !Array.isArray(value.Parameters) || value.Parameters.length !== 1 ||
      !same({ ...value.Parameters[0], UsePreviousValue: undefined }, { ...stack.Parameters[0], UsePreviousValue: undefined }) ||
      value.Parameters[0].UsePreviousValue != null && value.Parameters[0].UsePreviousValue !== true ||
      !Array.isArray(value.Changes) || value.Changes.length !== 1) fail("DRAFT_ENVELOPE_INVALID");
  const c = value.Changes[0], r = c?.ResourceChange;
  if (c?.Type !== "Resource" || r?.LogicalResourceId !== OWNER_RESOURCE || r.ResourceType !== "AWS::Lambda::Function" ||
      r.Action !== "Modify" || r.Replacement !== "False" || r.ChangeSetId != null || r.ModuleInfo != null ||
      !same(r.Scope, ["Properties"]) || !Array.isArray(r.Details) || r.Details.length < 2 || r.Details.length > 6) fail("DRAFT_DELTA_INVALID");
  const properties = new Set<string>();
  for (const d of r.Details) {
    const t = d?.Target;
    if (d.Evaluation !== "Static" || d.ChangeSource !== "DirectModification" || d.CausingEntity != null ||
        t?.Attribute !== "Properties" || !["Code", "Environment"].includes(t.Name) || t.RequiresRecreation !== "Never" ||
        t.Path != null && (typeof t.Path !== "string" || !new RegExp(`^/Properties/${t.Name}(?:/|$)`).test(t.Path))) fail("DRAFT_DETAIL_INVALID");
    properties.add(t.Name);
  }
  if (!properties.has("Code") || !properties.has("Environment")) fail("DRAFT_DETAIL_INVALID");
  const context = (raw: unknown) => {
    if (typeof raw !== "string" || Buffer.byteLength(raw) > 100_000) fail("CONTEXT_INVALID");
    let v: Json; try { v = JSON.parse(raw); } catch { fail("CONTEXT_INVALID"); }
    if (!object(v) || !object(v.Properties) || v.Type != null && v.Type !== "AWS::Lambda::Function") fail("CONTEXT_INVALID");
    return v;
  };
  const before = context(r.BeforeContext), after = context(r.AfterContext);
  if (runtime?.FunctionName !== OWNER_FUNCTION || runtime.FunctionArn !== `arn:aws:lambda:${OWNER_REGION}:${account}:function:${OWNER_FUNCTION}` ||
      runtime.State !== "Active" || runtime.LastUpdateStatus !== "Successful" ||
      before.Properties.FunctionName !== OWNER_FUNCTION || before.Properties.Role !== runtime.Role ||
      before.Properties.Runtime !== runtime.Runtime || before.Properties.Handler !== runtime.Handler ||
      !same(before.Properties.Environment, runtime.Environment) ||
      !same(before.Properties.Code, live.Resources[OWNER_RESOURCE].Properties.Code)) fail("CONTEXT_BASELINE_INVALID");
  const expected = clone(before);
  expected.Properties.Code.S3Key = `${zipSha256}.zip`;
  expected.Properties.Environment.Variables.PRIVATE_OWNER_USER_ARN = ownerArn;
  if (!same(after, expected)) fail("CONTEXT_DELTA_INVALID");
  return { exactlyOneNonReplacingLambdaUpdate: true, resolvedContextsVerified: true, ...reviewOwnerTemplate(live, proposed, identity, zipSha256) };
}

/** API configuration and code digest are independently read after completion. */
export function reviewOwnerRuntime(before: Json, after: Json, identity: Json, zipSha256: string) {
  const { ownerArn } = reviewOwnerIdentity(identity);
  const ignored = new Set(["CodeSha256", "CodeSize", "LastModified", "RevisionId", "LastUpdateStatus", "LastUpdateStatusReason", "LastUpdateStatusReasonCode", "Environment"]);
  const stable = (v: Json) => Object.fromEntries(Object.entries(v).filter(([key]) => !ignored.has(key)));
  const expectedEnvironment = clone(before.Environment);
  expectedEnvironment.Variables.PRIVATE_OWNER_USER_ARN = ownerArn;
  if (!/^[a-f0-9]{64}$/.test(zipSha256) || after.State !== "Active" || after.LastUpdateStatus !== "Successful" ||
      after.CodeSha256 !== Buffer.from(zipSha256, "hex").toString("base64") || !same(stable(before), stable(after)) ||
      !same(after.Environment, expectedEnvironment)) fail("POST_RUNTIME_INVALID");
  return { deployedCodeDigestMatched: true, ownerConfigurationMatched: true, otherRuntimeSettingsUnchanged: true };
}
