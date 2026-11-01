import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, readdirSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { computeReviewSynthEnvironment, deployedComputeAvailabilityZones, reviewComputeTemplates } from "./compute-template-review.js";
import { collectPrivateCacheTarget, scanLiveImageCache } from "./scan-live-image-cache.js";
import { createLiveImageReadOnlyRunner, evaluateStoredBasicScan, verifyRegistryManifest } from "./live-image-readiness.js";
import { PATCH, PRIVATE_ACL, privateAclChildEnvironment, verifyPromotedImageDetail } from "./promote-worker-patch.js";
import { collectPhase11Readiness, createPhase11ReadOnlyCliRunner, phase11ReadOnlyChildEnvironment } from "./phase11-live-readiness.js";

const PREFIX = "global-market-ai-insight-dev", STACK = `${PREFIX}-compute`;
const TASK = "WorkerTaskDefinition8AD2CCFF", CONTROLLER = "ControllerFunctionC25B79B1", POLICY = "ControllerRoleDefaultPolicyA5FA0784";
const referenceProofs = new WeakMap<object, string>();
type Json = Record<string, any>;
function object(value: unknown): Json | null { return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Json : null; }
function fail(code: string): never { throw new Error(code); }
export function canonicalStackTags(value: unknown) {
  const tags = value ?? [];
  if (!Array.isArray(tags) || tags.length > 50 || tags.some(tag => !object(tag) || Object.keys(tag).some(key => !["Key", "Value"].includes(key)) ||
      typeof tag.Key !== "string" || tag.Key.length < 1 || tag.Key.length > 128 || typeof tag.Value !== "string" || tag.Value.length > 256) ||
      new Set(tags.map(tag => tag.Key)).size !== tags.length) fail("ROLLOUT_STACK_TAGS_INVALID");
  return canonicalPatchValue([...tags].sort((a, b) => a.Key < b.Key ? -1 : a.Key > b.Key ? 1 : 0));
}
export function preservedStackTagArguments(value: unknown) {
  canonicalStackTags(value);
  const tags = (value ?? []) as {Key:string;Value:string}[];
  if (tags.some(tag => !/^[A-Za-z0-9_.:-]{1,128}$/.test(tag.Key) || /[=\u0000-\u001f\u007f]/.test(tag.Value))) fail("ROLLOUT_STACK_TAGS_INVALID");
  return tags.length ? ["--tags", ...tags.map(tag => `${tag.Key}=${tag.Value}`)] : [];
}
export function reviewedChangeSetArguments(name: string, stack: Json, proposedPath: string) {
  canonicalStackTags(stack.Tags);
  if (!/^gmai-compute-patch-[a-f0-9]{32}$/.test(name) || !isAbsolute(proposedPath) ||
      !Array.isArray(stack.Parameters) || stack.Parameters.length !== 1 || stack.Parameters[0]?.ParameterKey !== "BootstrapVersion" ||
      typeof stack.RoleARN !== "string") fail("ROLLOUT_CHANGE_SET_INPUT_INVALID");
  return ["--stack-name",STACK,"--change-set-name",name,"--change-set-type","UPDATE","--template-body",`file://${proposedPath}`,
    "--role-arn",stack.RoleARN,"--tags",JSON.stringify(stack.Tags??[]),"--parameters",JSON.stringify([{ParameterKey:"BootstrapVersion",UsePreviousValue:true}]),
    "--capabilities","CAPABILITY_IAM","CAPABILITY_NAMED_IAM","--no-include-nested-stacks","--no-import-existing-resources","--client-token",`${name}-reviewed`];
}
export function canonicalPatchValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalPatchValue).join(",")}]`;
  const record = object(value);
  if (record) return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonicalPatchValue(record[key])}`).join(",")}}`;
  return JSON.stringify(value) ?? "undefined";
}

export function reviewDatedPatchArchiveProof(value: unknown) {
  const proof = object(value);
  if (proof?.mode !== "dated-private-candidate-cached-archive-scan" || proof.datedCandidateScanned !== true ||
      proof.archiveGatePassed !== true || proof.scannerDatabaseFresh !== true || proof.exactImageConfigMatched !== true ||
      proof.indexChildAndLocalConfigMatched !== true || proof.archiveContentsMatchedToRuntimeManifest !== true ||
      proof.controllerStillDisabled !== true || proof.ownedScannerAbsent !== true || proof.temporaryArchiveAndCacheRemoved !== true ||
      proof.detectedSecrets !== 0 || ["UNKNOWN", "HIGH", "CRITICAL"].some(key => proof.severityCounts?.[key] !== 0) ||
      !Number.isSafeInteger(proof.awsCalls) || proof.awsCalls < 1 || proof.awsCalls > 30 ||
      ["cloudMutations", "imagePulls", "imagePushes", "credentialRetrievals"].some(key => proof[key] !== 0) ||
      proof.dockerSocketMounted !== false || proof.sourceOrHomeMounted !== false) fail("ROLLOUT_ARCHIVE_PROOF_UNVERIFIED");
  return { freshDatedCandidateArchiveGatePassed: true, archiveSeverityCounts: proof.severityCounts,
    archiveDetectedSecrets: 0, archiveOsPackagesInspected: proof.osPackagesInspected };
}

/** Recheck the same bounded physical files after CDK preparation; never run a changed asset. */
export function rolloutAssetFingerprint(assembly: string, paths: readonly string[]) {
  let bytes = 0, files = 0; const hash = createHash("sha256");
  if (!isAbsolute(assembly) || realpathSync(assembly) !== assembly || paths.length < 1 || paths.length > 3) fail("ROLLOUT_ASSET_SCOPE_INVALID");
  const walk = (file: string): void => {
    const rel = relative(assembly, file), info = lstatSync(file);
    if (rel.startsWith("..") || isAbsolute(rel) || info.isSymbolicLink() || realpathSync(file) !== file) fail("ROLLOUT_ASSET_SCOPE_INVALID");
    if (info.isDirectory()) for (const child of readdirSync(file).sort()) walk(join(file, child));
    else if (info.isFile()) {
      bytes += info.size; if (++files > 100 || bytes > 8_000_000) fail("ROLLOUT_ASSET_SCOPE_INVALID");
      hash.update(JSON.stringify(rel)); hash.update(String(info.size)); hash.update(readFileSync(file));
    } else fail("ROLLOUT_ASSET_SCOPE_INVALID");
  };
  for (const path of paths) walk(path);
  return { bytes, files, fingerprint: hash.digest("hex") };
}

export function reviewRolloutAssetDestination(value: unknown, account: string, hash: string) {
  const destination = object(value);
  // CDK's standard role preserves this one partition placeholder in asset manifests.
  // Tokyo is always the aws partition; no other substitution/destination is accepted.
  const role = typeof destination?.assumeRoleArn === "string" ? destination.assumeRoleArn.replace("${AWS::Partition}", "aws") : undefined;
  if (!/^[0-9]{12}$/.test(account) || /^0+$/.test(account) || !/^[a-f0-9]{64}$/.test(hash) ||
      !destination || Object.keys(destination).some(key => !["bucketName", "objectKey", "region", "assumeRoleArn"].includes(key)) ||
      destination.bucketName !== `cdk-hnb659fds-assets-${account}-ap-northeast-1` || destination.region !== "ap-northeast-1" ||
      ![`${hash}.zip`, `${hash}.json`].includes(destination.objectKey) ||
      role !== `arn:aws:iam::${account}:role/cdk-hnb659fds-file-publishing-role-${account}-ap-northeast-1`) fail("ROLLOUT_ASSET_DESTINATION_INVALID");
  return { exactOwnedBootstrapDestination: true, partitionPlaceholderResolvedOnlyToAws: true };
}

/** This is intentionally one dated code/image patch, never a generic infrastructure deployment. */
export function reviewExclusiveComputePatch(live: Json, proposed: Json, foundation: Json, oldDigest: string) {
  const report = reviewComputeTemplates(live, proposed, foundation);
  if (!/^sha256:[a-f0-9]{64}$/.test(oldDigest) || oldDigest === PATCH.runtimeDigest || report.comparedComputeResources !== 26 ||
      report.addedResourceIds.length || canonicalPatchValue(report.removedResourceIds) !== '["CDKMetadata"]' ||
      live.Resources.CDKMetadata?.Type !== "AWS::CDK::Metadata" || report.changedTemplateSections.length || report.missingFoundationImports.length ||
      Object.keys(proposed).some(key => !["AWSTemplateFormatVersion", "Description", "Resources", "Outputs", "Parameters", "Rules", "Metadata"].includes(key)) ||
      ["AWSTemplateFormatVersion", "Description", "Parameters", "Rules", "Outputs"].some(key => canonicalPatchValue(live[key]) !== canonicalPatchValue(proposed[key]))) fail("ROLLOUT_TEMPLATE_SCOPE_INVALID");
  for (const change of report.changedResources) {
    const allowed = change.logicalId === TASK ? ["ContainerDefinitions"] : change.logicalId === CONTROLLER ? ["Code"] : [];
    if (change.resourceTypeChanged || change.changedProperties.some(key => !allowed.includes(key)) ||
        change.changedNonPropertyFields.some(key => key !== "Metadata")) fail("ROLLOUT_RESOURCE_DELTA_INVALID");
  }
  if (!report.changedResources.some(value => value.logicalId === TASK && value.changedProperties.includes("ContainerDefinitions")) ||
      !report.changedResources.some(value => value.logicalId === CONTROLLER && value.changedProperties.includes("Code"))) fail("ROLLOUT_PATCH_NOT_NEEDED_OR_INCOMPLETE");
  const before = live.Resources[TASK]?.Properties, after = proposed.Resources[TASK]?.Properties;
  const oldContainer = object(before?.ContainerDefinitions?.[0]), newContainer = object(after?.ContainerDefinitions?.[0]);
  const beforeImage = canonicalPatchValue(oldContainer?.Image), afterImage = canonicalPatchValue(newContainer?.Image);
  if (before?.Family !== `${PREFIX}-worker` || after?.Cpu !== "256" || after?.Memory !== "512" ||
      beforeImage.split(oldDigest).length !== 2 || beforeImage.replace(oldDigest, PATCH.runtimeDigest) !== afterImage ||
      canonicalPatchValue({ ...oldContainer, Image: undefined }) !== canonicalPatchValue({ ...newContainer, Image: undefined })) fail("ROLLOUT_IMAGE_ONLY_DELTA_INVALID");
  const oldCode = live.Resources[CONTROLLER]?.Properties?.Code, code = proposed.Resources[CONTROLLER]?.Properties?.Code;
  if (!object(code) || !/^[a-f0-9]{64}\.zip$/.test(code.S3Key) ||
      canonicalPatchValue({ ...oldCode, S3Key: undefined }) !== canonicalPatchValue({ ...code, S3Key: undefined })) fail("ROLLOUT_CODE_DELTA_INVALID");
  // TaskDefinition replacement changes these exact existing references only.
  const references: string[] = [];
  const visit = (value: unknown, path: string) => {
    if (Array.isArray(value)) value.forEach((child, index) => visit(child, `${path}/${index}`));
    const record = object(value);
    if (record) for (const [key, child] of Object.entries(record)) {
      if ((key === "Ref" && child === TASK) || (key === "Fn::GetAtt" && Array.isArray(child) && child[0] === TASK)) references.push(path);
      else visit(child, `${path}/${key}`);
    }
  };
  visit(proposed, "");
  const statement = proposed.Resources[POLICY]?.Properties?.PolicyDocument?.Statement;
  if (!Array.isArray(statement)) fail("ROLLOUT_TASK_REFERENCE_INVALID");
  const runTaskIndex = statement.findIndex((value: Json) => canonicalPatchValue(value.Action) === '"ecs:RunTask"');
  const runTask = statement[runTaskIndex];
  if (runTaskIndex < 0 || runTask?.Effect !== "Allow" || canonicalPatchValue(runTask.Resource) !== canonicalPatchValue({ Ref: TASK }) ||
      canonicalPatchValue(runTask.Condition) !== canonicalPatchValue({ ArnEquals: { "ecs:cluster": { "Fn::GetAtt": ["WorkerClusterB2BB5BD9", "Arn"] } } })) fail("ROLLOUT_TASK_REFERENCE_INVALID");
  const expectedReferences = [`/Resources/${CONTROLLER}/Properties/Environment/Variables/WORKER_TASK_DEFINITION`,
    `/Resources/${POLICY}/Properties/PolicyDocument/Statement/${runTaskIndex}/Resource`, "/Outputs/TaskDefinitionArn/Value"].sort();
  if (canonicalPatchValue(references.sort()) !== canonicalPatchValue(expectedReferences)) fail("ROLLOUT_TASK_REFERENCE_INVALID");
  return { strictImageOnlyContainerDelta: true, strictCodeKeyOnlyDelta: true, networkAndIamDocumentsUnchanged: true,
    metadataOnlyChangeTypes: Object.fromEntries(report.changedResources.filter(value => value.changedProperties.length === 0 && ![TASK, CONTROLLER, POLICY].includes(value.logicalId)).map(value => [value.logicalId, value.type])),
    indirectTaskReferencesReviewed: references.length, taskDefinitionReplacementExpected: true, preservedApiExports: true,
    addedResources: 0, removedMetadataOnly: true, executionRemainsDisabled: true };
}

export function reviewComputePatchChangeSet(value: unknown, account: string, name: string, stack: Json, now: number, started: number, metadataOnlyChangeTypes: Readonly<Record<string, string>> = {}, referenceProof?: object) {
  const referencesVerified = !!referenceProof && referenceProofs.get(referenceProof) === createHash("sha256").update(canonicalPatchValue(value)).digest("hex");
  const changeSet = object(value), creation = typeof changeSet?.CreationTime === "string" ? Date.parse(changeSet.CreationTime) : NaN;
  if (!/^[0-9]{12}$/.test(account) || /^0+$/.test(account) || !/^gmai-compute-patch-[a-f0-9]{32}$/.test(name) ||
      changeSet?.StackName !== STACK || changeSet.StackId !== stack.StackId ||
      !String(stack.StackId).startsWith(`arn:aws:cloudformation:ap-northeast-1:${account}:stack/${STACK}/`) ||
      !String(changeSet.ChangeSetId).startsWith(`arn:aws:cloudformation:ap-northeast-1:${account}:changeSet/${name}/`) ||
      changeSet.ChangeSetName !== name || changeSet.Status !== "CREATE_COMPLETE" || changeSet.ExecutionStatus !== "AVAILABLE" ||
      !Number.isSafeInteger(now) || !Number.isSafeInteger(started) || !Number.isFinite(creation) || creation < started - 1000 || creation > now || now - creation > 300_000 ||
      changeSet.NextToken != null || changeSet.ParentChangeSetId != null || changeSet.IncludeNestedStacks === true || changeSet.ImportExistingResources === true ||
      changeSet.DeploymentMode !== undefined || changeSet.OnStackFailure === "DO_NOTHING" ||
      canonicalStackTags(changeSet.Tags) !== canonicalStackTags(stack.Tags) ||
      canonicalPatchValue(changeSet.NotificationARNs ?? []) !== canonicalPatchValue(stack.NotificationARNs ?? []) ||
      !Array.isArray(changeSet.Changes) || changeSet.Changes.length < 2 || changeSet.Changes.length > 27) fail("ROLLOUT_CHANGE_SET_IDENTITY_INVALID");
  const seen = new Set<string>(); const summary: Json[] = [];
  for (const change of changeSet.Changes) {
    const resource = object(change?.ResourceChange), id = resource?.LogicalResourceId;
    if (change.Type !== "Resource" || !resource || typeof id !== "string" || seen.has(id) ||
        resource.ChangeSetId !== undefined || resource.ModuleInfo !== undefined) fail("ROLLOUT_CHANGE_SET_SCOPE_INVALID");
    seen.add(id);
    if (id === "CDKMetadata") {
      if (resource.Action !== "Remove" || resource.ResourceType !== "AWS::CDK::Metadata") fail("ROLLOUT_CHANGE_SET_SCOPE_INVALID");
    } else {
      const metadataOnly = ![TASK, CONTROLLER, POLICY].includes(id) && Object.hasOwn(metadataOnlyChangeTypes, id);
      const allowedType = id === TASK ? "AWS::ECS::TaskDefinition" : id === CONTROLLER ? "AWS::Lambda::Function" : id === POLICY ? "AWS::IAM::Policy" : metadataOnlyChangeTypes[id];
      if (!allowedType || resource.Action !== "Modify" || resource.ResourceType !== allowedType ||
          !Array.isArray(resource.Scope) || resource.Scope.some((scope: unknown) => !["Properties", "Metadata"].includes(String(scope))) ||
          (id !== TASK && resource.Replacement !== "False") || (id === TASK && resource.Replacement !== "True") ||
          metadataOnly && canonicalPatchValue(resource.Scope) !== '["Metadata"]' ||
          !Array.isArray(resource.Details) || resource.Details.length > 30) fail("ROLLOUT_CHANGE_SET_SCOPE_INVALID");
      for (const detail of resource.Details) {
        const target = detail?.Target;
        if (!["Static", "Dynamic"].includes(detail?.Evaluation) || !["Properties", "Metadata"].includes(target?.Attribute)) fail("ROLLOUT_CHANGE_SET_DETAIL_INVALID");
        if (target.Attribute === "Metadata") {
          // AWS defines RequiresRecreation only for Properties; Metadata may omit it.
          // Resource replacement and the separately compared property values remain gated above.
          if (detail.ChangeSource !== "DirectModification" || ![undefined, null, "Never"].includes(target.RequiresRecreation)) fail("ROLLOUT_CHANGE_SET_DETAIL_INVALID");
          continue;
        }
        if (metadataOnly) fail("ROLLOUT_CHANGE_SET_DETAIL_INVALID");
        const direct = detail.ChangeSource === "DirectModification";
        const indirect = detail.ChangeSource === "ResourceReference" && [TASK, `${TASK}.Arn`].includes(detail.CausingEntity);
        const provenDirectEnvironment = referencesVerified && direct && detail.Evaluation === "Dynamic" && detail.CausingEntity == null && target.Name === "Environment";
        const provenDirectPolicy = referencesVerified && direct && detail.Evaluation === "Static" && detail.CausingEntity == null;
        if (id === TASK ? (!direct || target.Name !== "ContainerDefinitions" || target.RequiresRecreation !== "Always") :
            id === CONTROLLER ? (!(direct && target.Name === "Code" || (indirect || provenDirectEnvironment) && target.Name === "Environment") || target.RequiresRecreation !== "Never") :
            (!(indirect || provenDirectPolicy) || target.Name !== "PolicyDocument" || target.RequiresRecreation !== "Never")) fail("ROLLOUT_CHANGE_SET_DETAIL_INVALID");
      }
    }
    summary.push({ logicalId: id, action: resource.Action, type: resource.ResourceType, replacement: resource.Replacement ?? "not-applicable" });
  }
  if (!seen.has(TASK) || !seen.has(CONTROLLER) || !seen.has(POLICY)) fail("ROLLOUT_CHANGE_SET_SCOPE_INVALID");
  return { reviewedChanges: summary, completeNonpaginated: true, onlyReviewedTaskReplacementAndDependents: true };
}

function patchResourceContext(value: unknown, id: string, phase: "BeforeContext" | "AfterContext"): Json {
  const changes = object(value)?.Changes;
  const rows = Array.isArray(changes) ? changes.filter((item: Json) => item?.ResourceChange?.LogicalResourceId === id) : [];
  const raw=rows.length===1 ? rows[0].ResourceChange[phase] : undefined;
  if(typeof raw!=="string" || Buffer.byteLength(raw)>200_000) fail("ROLLOUT_REFERENCE_CONTEXT_INVALID");
  let context:Json|null; try {context=object(JSON.parse(raw));}catch{fail("ROLLOUT_REFERENCE_CONTEXT_INVALID");}
  if(!context || !object(context.Properties)) fail("ROLLOUT_REFERENCE_CONTEXT_INVALID");
  return context;
}

/** Independent current IAM response + unchanged symbolic template + bounded resolved contexts.
 * A proof is private, branded and bound to this entire change set. No caller-supplied boolean grants it. */
export function reviewComputePatchReferenceContexts(value: unknown, live: Json, proposed: Json, controller: Json, iamResponse: unknown) {
  const oldTask=controller.Environment?.Variables?.WORKER_TASK_DEFINITION, account=String(controller.FunctionArn).split(":")[4];
  if(typeof oldTask!=="string" || !new RegExp(`^arn:aws:ecs:ap-northeast-1:${account}:task-definition/${PREFIX}-worker:[1-9][0-9]*$`).test(oldTask) ||
    !new RegExp(`^arn:aws:lambda:ap-northeast-1:${account}:function:${PREFIX}-controller$`).test(String(controller.FunctionArn)) ||
    !new RegExp(`^arn:aws:iam::${account}:role/[A-Za-z0-9+=,.@_-]{1,64}$`).test(String(controller.Role))) fail("ROLLOUT_REFERENCE_OWNER_INVALID");
  const props=live.Resources?.[POLICY]?.Properties, afterProps=proposed.Resources?.[POLICY]?.Properties;
  if(!props || canonicalPatchValue(props)!==canonicalPatchValue(afterProps) ||
    canonicalPatchValue(props.Roles)!==canonicalPatchValue([{Ref:"ControllerRole10B665F1"}]) ||
    typeof props.PolicyName!=="string" || !/^[A-Za-z0-9+=,.@_-]{1,128}$/.test(props.PolicyName) ||
    canonicalPatchValue(live.Resources?.[CONTROLLER]?.Properties?.Environment)!==canonicalPatchValue(proposed.Resources?.[CONTROLLER]?.Properties?.Environment) ||
    canonicalPatchValue(afterProps.PolicyDocument?.Statement?.find((s:Json)=>s.Action==="ecs:RunTask")?.Resource)!==canonicalPatchValue({Ref:TASK})) fail("ROLLOUT_REFERENCE_TEMPLATE_INVALID");
  const beforePolicy=patchResourceContext(value,POLICY,"BeforeContext"), afterPolicy=patchResourceContext(value,POLICY,"AfterContext");
  const beforeController=patchResourceContext(value,CONTROLLER,"BeforeContext"), afterController=patchResourceContext(value,CONTROLLER,"AfterContext");
  const beforeDoc=beforePolicy.Properties.PolicyDocument, afterDoc=afterPolicy.Properties.PolicyDocument;
  const iam=object(iamResponse); let actualDoc=iam?.PolicyDocument;
  if(typeof actualDoc==="string") { try {actualDoc=JSON.parse(decodeURIComponent(actualDoc));}catch{fail("ROLLOUT_REFERENCE_IAM_INVALID");} }
  const roleName=controller.Role.split("/").at(-1);
  if(iam?.RoleName!==roleName || iam?.PolicyName!==props.PolicyName || !object(actualDoc) ||
    canonicalPatchValue(actualDoc)!==canonicalPatchValue(beforeDoc) || beforeDoc?.Version!=="2012-10-17" ||
    !Array.isArray(beforeDoc.Statement) || !Array.isArray(afterDoc?.Statement) || beforeDoc.Statement.length>20) fail("ROLLOUT_REFERENCE_IAM_INVALID");
  const beforeRuns=beforeDoc.Statement.filter((s:Json)=>s.Action==="ecs:RunTask"), afterRuns=afterDoc.Statement.filter((s:Json)=>s.Action==="ecs:RunTask");
  if(beforeRuns.length!==1 || afterRuns.length!==1 || beforeRuns[0].Effect!=="Allow" || beforeRuns[0].Resource!==oldTask ||
    canonicalPatchValue(beforeRuns[0].Condition)!==canonicalPatchValue({ArnEquals:{"ecs:cluster":controller.Environment.Variables.WORKER_CLUSTER}})) fail("ROLLOUT_REFERENCE_RUN_TASK_INVALID");
  const afterTask=afterRuns[0].Resource;
  // Only a known intrinsic placeholder or a new owned exact revision can stand in for the unchanged Ref.
  const intrinsic=canonicalPatchValue(afterTask)===canonicalPatchValue({Ref:TASK});
  const ownedRevision=typeof afterTask==="string" && new RegExp(`^arn:aws:ecs:ap-northeast-1:${account}:task-definition/${PREFIX}-worker:[1-9][0-9]*$`).test(afterTask) && afterTask!==oldTask;
  const unresolved=afterTask==="{{changeSet:KNOWN_AFTER_APPLY}}";
  if(!intrinsic && !ownedRevision && !unresolved) fail("ROLLOUT_REFERENCE_PLACEHOLDER_UNVERIFIED");
  const normalizePolicy=(context:Json)=>({...context,Metadata:undefined,Properties:{...context.Properties,
    PolicyDocument:{...context.Properties.PolicyDocument,Statement:context.Properties.PolicyDocument.Statement.map((s:Json)=>s.Action==="ecs:RunTask"?{...s,Resource:undefined}:s)}}});
  if(canonicalPatchValue(normalizePolicy(beforePolicy))!==canonicalPatchValue(normalizePolicy(afterPolicy)) ||
    canonicalPatchValue(beforePolicy.Properties.Roles)!==canonicalPatchValue([roleName]) || beforePolicy.Properties.PolicyName!==props.PolicyName) fail("ROLLOUT_REFERENCE_POLICY_BROADENED");
  const beforeEnv=beforeController.Properties.Environment?.Variables, afterEnv=afterController.Properties.Environment?.Variables;
  if(!object(beforeEnv) || !object(afterEnv) || beforeEnv.WORKER_TASK_DEFINITION!==oldTask ||
    canonicalPatchValue(afterEnv.WORKER_TASK_DEFINITION)!==canonicalPatchValue(afterTask) ||
    beforeController.Properties.Role!==controller.Role || afterController.Properties.Role!==controller.Role ||
    [beforeEnv,afterEnv].some(env=>env.ENABLE_PROVIDER_BACKED_JOBS!=="false" || env.ENABLE_LIVE_RESULT_DISPLAY!=="false") ||
    beforeController.Properties.Code?.S3Key!==live.Resources[CONTROLLER].Properties.Code.S3Key ||
    afterController.Properties.Code?.S3Key!==proposed.Resources[CONTROLLER].Properties.Code.S3Key) fail("ROLLOUT_REFERENCE_ENVIRONMENT_INVALID");
  const normalizeController=(context:Json)=>({...context,Metadata:undefined,Properties:{...context.Properties,
    Code:{...context.Properties.Code,S3Key:undefined},Environment:{...context.Properties.Environment,
      Variables:{...context.Properties.Environment.Variables,WORKER_TASK_DEFINITION:undefined}}}});
  if(canonicalPatchValue(normalizeController(beforeController))!==canonicalPatchValue(normalizeController(afterController))) fail("ROLLOUT_REFERENCE_CONTROLLER_BROADENED");
  const functionChange=object(value)!.Changes.find((change:Json)=>change?.ResourceChange?.LogicalResourceId===CONTROLLER)?.ResourceChange;
  if(!functionChange?.Details?.some((detail:Json)=>detail.ChangeSource==="ResourceReference" && detail.CausingEntity===TASK &&
    detail.Target?.Attribute==="Properties" && detail.Target?.Name==="Environment" && detail.Target?.RequiresRecreation==="Never")) fail("ROLLOUT_REFERENCE_DEPENDENCY_UNVERIFIED");
  const proof=Object.freeze({currentInlinePolicyIndependentlyMatched:true,symbolicPolicyAndEnvironmentUnchanged:true,
    policyOnlyTaskReferenceChanges:true,controllerOnlyCodeAndTaskReferenceChanges:true,unknownReferenceIsNotAnArnClaim:unresolved,
    executionFlagsRemainDisabled:true});
  referenceProofs.set(proof,createHash("sha256").update(canonicalPatchValue(value)).digest("hex"));
  return proof;
}

/** Counts/booleans only; raw before/after properties, parameters, tags and ARNs never escape. */
export function computePatchChangeSetDiagnostic(value: unknown, account: string, name: string, stack: Json, now: number, started: number) {
  const v = object(value), creation = typeof v?.CreationTime === "string" ? Date.parse(v.CreationTime) : NaN;
  let tagsEqual = false; try { tagsEqual = canonicalStackTags(v?.Tags) === canonicalStackTags(stack.Tags); } catch { /* Invalid remains false. */ }
  return { stackNameMatched: v?.StackName === STACK, stackIdMatched: v?.StackId === stack.StackId,
    stackArnOwned: String(stack.StackId).startsWith(`arn:aws:cloudformation:ap-northeast-1:${account}:stack/${STACK}/`),
    changeSetArnOwned: String(v?.ChangeSetId).startsWith(`arn:aws:cloudformation:ap-northeast-1:${account}:changeSet/${name}/`),
    nameMatched: v?.ChangeSetName === name, creationComplete: v?.Status === "CREATE_COMPLETE", executionAvailable: v?.ExecutionStatus === "AVAILABLE",
    timeValid: Number.isFinite(creation) && creation >= started - 1000 && creation <= now && now - creation <= 300_000,
    nonpaginated: v?.NextToken == null, parentAbsent: v?.ParentChangeSetId == null, nestedAbsent: v?.IncludeNestedStacks !== true,
    importAbsent: v?.ImportExistingResources !== true, driftModeAbsent: v?.DeploymentMode === undefined,
    rollbackNotDisabled: v?.OnStackFailure !== "DO_NOTHING", exactTagMapMatched: tagsEqual,
    notificationArnsUnchanged: canonicalPatchValue(v?.NotificationARNs ?? []) === canonicalPatchValue(stack.NotificationARNs ?? []),
    boundedChangeCount: Array.isArray(v?.Changes) && v.Changes.length >= 2 && v.Changes.length <= 27 };
}

/** Enum-only diagnostics: never expose before/after values, arbitrary IDs or causes. */
export function computePatchDetailDiagnostic(value: unknown, metadataOnlyChangeTypes: Readonly<Record<string, string>> = {}) {
  const allowedIds = new Set([TASK, CONTROLLER, POLICY, "CDKMetadata", ...Object.keys(metadataOnlyChangeTypes)]);
  const label = (value: unknown, allowed: readonly string[]) => value == null ? "absent" : allowed.includes(String(value)) ? String(value) : "out-of-scope";
  return (Array.isArray(object(value)?.Changes) ? object(value)!.Changes.slice(0, 27) : []).map((change: Json) => {
    const resource = object(change?.ResourceChange);
    return { logicalId: allowedIds.has(resource?.LogicalResourceId) ? resource!.LogicalResourceId : "out-of-scope",
      details: (Array.isArray(resource?.Details) ? resource!.Details.slice(0, 30) : []).map((detail: Json) => ({
        evaluation: label(detail?.Evaluation, ["Static", "Dynamic"]),
        source: label(detail?.ChangeSource, ["DirectModification", "ResourceReference", "ResourceAttribute", "ParameterReference", "Automatic", "NoModification"]),
        cause: label(detail?.CausingEntity, [TASK, `${TASK}.Arn`]),
        attribute: label(detail?.Target?.Attribute, ["Properties", "Metadata"]),
        name: label(detail?.Target?.Name, ["ContainerDefinitions", "Code", "Environment", "PolicyDocument"]),
        recreation: label(detail?.Target?.RequiresRecreation, ["Never", "Always", "Conditionally"]),
      })) };
  });
}

/** Private context is reduced to fixed booleans, never environment values or IAM ARNs. */
export function computePatchContextDiagnostic(value: unknown, oldTask: string) {
  const changes = object(value)?.Changes;
  const context = (id: string, phase: "BeforeContext" | "AfterContext") => {
    const raw = Array.isArray(changes) ? changes.find((item: Json) => item?.ResourceChange?.LogicalResourceId === id)?.ResourceChange?.[phase] : undefined;
    if (typeof raw !== "string" || Buffer.byteLength(raw) > 200_000) return null;
    try { return object(JSON.parse(raw)); } catch { return null; }
  };
  const vocabulary = new Set(["known","after","apply","dynamic","change","set","value","aws","cloudformation","ref","getatt","unresolved","resource","reference","will","be","determined","during","update","unknown","changeset","computed"]);
  const classify = (v: unknown) => ({ stringValue: typeof v === "string", currentTaskArn: v === oldTask,
    stringLength:typeof v==="string" ? v.length : null,
    recognizedPlaceholderWords:typeof v==="string" && v!==oldTask ? [...new Set(v.toLowerCase().split(/[^a-z]+/).filter(word=>vocabulary.has(word)))] : [],
    placeholderPunctuation:typeof v==="string" && v!==oldTask ? [...new Set(v.split("").filter(char=>"{}<>[]():_- ".includes(char)))].sort().join("") : "",
    exactIntrinsicTaskReference: canonicalPatchValue(v) === canonicalPatchValue({Ref:TASK}), exactTaskLogicalId: v === TASK,
    taskArnSameFamily: typeof v === "string" && new RegExp(`^${oldTask.replace(/[.*+?^${}()|[\]\\]/g,"\\$&").replace(/:[0-9]+$/,"")}:[0-9]+$`).test(v),
    containsWildcard: typeof v === "string" && /[*?]/.test(v),
    containsTaskLogicalId: typeof v === "string" && v.includes(TASK), objectValue: object(v) !== null, arrayValue: Array.isArray(v) });
  const policyBefore=context(POLICY,"BeforeContext")?.Properties?.PolicyDocument;
  const policyAfter=context(POLICY,"AfterContext")?.Properties?.PolicyDocument;
  const withoutTask = (policy: Json | undefined) => object(policy) && Array.isArray(policy!.Statement) ? {
    ...policy, Statement: policy!.Statement.map((statement: Json) => statement.Action === "ecs:RunTask" ? {...statement,Resource:undefined} : statement),
  } : null;
  const statements=(policy: Json | undefined) => Array.isArray(policy?.Statement) ? policy.Statement.filter((s: Json) => s.Action === "ecs:RunTask") : [];
  const envBefore=context(CONTROLLER,"BeforeContext")?.Properties?.Environment?.Variables;
  const envAfter=context(CONTROLLER,"AfterContext")?.Properties?.Environment?.Variables;
  return { beforePolicyContextPresent: object(policyBefore)!==null, afterPolicyContextPresent: object(policyAfter)!==null,
    beforeEnvironmentContextPresent: object(envBefore)!==null, afterEnvironmentContextPresent: object(envAfter)!==null,
    policyOtherwiseIdentical: !!withoutTask(policyBefore) && canonicalPatchValue(withoutTask(policyBefore))===canonicalPatchValue(withoutTask(policyAfter)),
    beforeRunTaskStatements: statements(policyBefore).length, afterRunTaskStatements: statements(policyAfter).length,
    beforePolicyTask: classify(statements(policyBefore)[0]?.Resource), afterPolicyTask: classify(statements(policyAfter)[0]?.Resource),
    beforeEnvironmentTask: classify(envBefore?.WORKER_TASK_DEFINITION), afterEnvironmentTask: classify(envAfter?.WORKER_TASK_DEFINITION),
    environmentOtherwiseIdentical: object(envBefore)!==null && canonicalPatchValue({...envBefore,WORKER_TASK_DEFINITION:undefined})===canonicalPatchValue({...envAfter,WORKER_TASK_DEFINITION:undefined}),
    executionFlagsRemainDisabled: envBefore?.ENABLE_PROVIDER_BACKED_JOBS==="false" && envAfter?.ENABLE_PROVIDER_BACKED_JOBS==="false" &&
      envBefore?.ENABLE_LIVE_RESULT_DISPLAY==="false" && envAfter?.ENABLE_LIVE_RESULT_DISPLAY==="false" };
}

export function computePatchRolloutPlan(args: readonly string[] = []) {
  if (args.length) fail("ROLLOUT_ARGUMENTS_REJECTED");
  return { mode: "dry-run", awsCalls: 0, assetUploads: 0, changeSetsCreated: 0, deployments: 0,
    futureExclusiveTarget: STACK, futureChangeSetsMax: 2, futureExecutionsMax: 1, rollbackDisabled: false,
    jobsEnabled: false, circuitMutations: 0, imagePushes: 0, workerTasksLaunched: 0, publicActions: 0 };
}

/** Private temp data can be removed only while its physical direct-child identity is unchanged. */
export function safeRolloutDirectory(base: string, directory: string, physical: string) {
  try { const name = basename(directory); return /^gmai-compute-rollout-[A-Za-z0-9]+$/.test(name) &&
    relative(resolve(base), resolve(directory)) === name && lstatSync(directory).isDirectory() && !lstatSync(directory).isSymbolicLink() &&
    realpathSync(base) === physical && realpathSync(directory) === resolve(physical, name); } catch { return false; }
}

export async function executeComputePatchRollout(prepareOnly = false) {
  const aws = process.env.GMAI_AWS_CLI_PATH;
  if (process.env.AWS_PROFILE !== "gmai-admin" || !aws || !isAbsolute(aws) || basename(aws).toLowerCase() !== "aws.exe" ||
      !lstatSync(aws).isFile() || lstatSync(aws).isSymbolicLink() || existsSync(join(homedir(), ".cdk.json"))) fail("ROLLOUT_CONFIGURATION_UNVERIFIED");
  const started = Date.now(), base = resolve(tmpdir()), physical = realpathSync(base), directory = mkdtempSync(join(base, "gmai-compute-rollout-"));
  const name = `gmai-compute-patch-${randomUUID().replaceAll("-", "")}`;
  let calls = 0, prepared = false, executionAttempted = false, packet: Json | undefined, ownedAccount: string | undefined, ownedStackId: string | undefined;
  const env = phase11ReadOnlyChildEnvironment(process.env);
  for (const key of Object.keys(env)) if (/^(GMAI_|CDK_|OPENAI_|ANTHROPIC_|TWELVE_?DATA|BEDROCK_|GH_TOKEN$|GITHUB_TOKEN$|NODE_OPTIONS$|NODE_PATH$|HTTP_PROXY$|HTTPS_PROXY$|ALL_PROXY$|NO_PROXY$)/i.test(key)) delete env[key];
  Object.assign(env, { CDK_HOME: join(directory, "cdk-home"), CDK_DISABLE_CLI_TELEMETRY: "true", CDK_DISABLE_VERSION_CHECK: "true" });
  const consumeCall = (cleanup = false) => {
    if (++calls > (cleanup ? 170 : 160) || !cleanup && Date.now() - started + 30_000 >= 1_500_000) fail("ROLLOUT_DEADLINE");
  };
  const query = (service: string, operation: string, extra: string[], cleanup = false) => {
    consumeCall(cleanup);
    const result = spawnSync(aws, [service, operation, ...extra, "--profile", "gmai-admin", "--region", "ap-northeast-1", "--no-cli-pager", "--no-paginate", "--output", "json"],
      { env, encoding: "utf8", windowsHide: true, timeout: 30_000, maxBuffer: 2_000_000 });
    if (result.status !== 0 || result.signal !== null) {
      if (cleanup && operation === "describe-change-set" && /\(ChangeSetNotFound\)/.test(result.stderr)) return { absent: true };
      fail("ROLLOUT_AWS_OPERATION_UNVERIFIED");
    }
    return result.stdout.trim() ? JSON.parse(result.stdout) : {};
  };
  const baseline = () => {
    const run = createPhase11ReadOnlyCliRunner(); let identity: Json | null = null, controller: Json | null = null, stacks: Json | null = null;
    const report = collectPhase11Readiness(args => { consumeCall(); const value = run(args);
      if (args[0] === "sts") identity = object(value); if (args[0] === "lambda") controller = object(value); if (args[1] === "describe-stacks") stacks = object(value); return value; });
    if (report.readyForAccountSpecificDiff !== true) fail("ROLLOUT_BASELINE_BLOCKED");
    return { report, account: (identity as Json | null)?.Account as string, controller: controller as Json | null,
      stack: (stacks as Json | null)?.Stacks?.find((value: Json) => value.StackName === STACK) as Json,
      stableOtherStacks: canonicalPatchValue((stacks as Json | null)?.Stacks?.filter((value: Json) => [`${PREFIX}-foundation`, `${PREFIX}-api`].includes(value.StackName))) };
  };
  const template = (stack: string, changeSet?: string) => {
    const value = query("cloudformation", "get-template", ["--stack-name", stack, "--template-stage", "Original", ...(changeSet ? ["--change-set-name", changeSet] : [])]);
    if (!Array.isArray(value.StagesAvailable) || !value.StagesAvailable.includes("Original")) fail("ROLLOUT_TEMPLATE_UNVERIFIED");
    return typeof value.TemplateBody === "string" ? JSON.parse(value.TemplateBody) : value.TemplateBody;
  };
  const currentControllerPolicy = (controller:Json, live:Json, account:string) => {
    const props=live.Resources?.[POLICY]?.Properties;
    if(!new RegExp(`^arn:aws:iam::${account}:role/[A-Za-z0-9+=,.@_-]{1,64}$`).test(String(controller.Role)) ||
      canonicalPatchValue(props?.Roles)!==canonicalPatchValue([{Ref:"ControllerRole10B665F1"}]) ||
      typeof props?.PolicyName!=="string" || !/^[A-Za-z0-9+=,.@_-]{1,128}$/.test(props.PolicyName)) fail("ROLLOUT_REFERENCE_OWNER_INVALID");
    return query("iam","get-role-policy",["--role-name",controller.Role.split("/").at(-1),"--policy-name",props.PolicyName]);
  };
  try {
    if (!safeRolloutDirectory(base, directory, physical)) fail("ROLLOUT_TEMP_INVALID");
    const acl = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", PRIVATE_ACL],
      { env: privateAclChildEnvironment(env, directory), encoding: "utf8", timeout: 10_000, maxBuffer: 20_000, windowsHide: true });
    if (acl.status !== 0 || acl.signal !== null || JSON.parse(acl.stdout).privateAclVerified !== true) fail("ROLLOUT_PRIVATE_ACL_UNVERIFIED");
    mkdirSync(join(directory, "assembly"));
    const initial = baseline();
    ownedAccount = initial.account; ownedStackId = initial.stack.StackId;
    const imageReader = createLiveImageReadOnlyRunner();
    const image = collectPrivateCacheTarget(args => { consumeCall(); return imageReader(args); });
    const account = initial.account, oldDigest = image.target.reference.split("@")[1]!;
    if (image.target.reference.split(".")[0] !== account || !image.report.exactOwnedLiveImageVerified) fail("ROLLOUT_IMAGE_IDENTITY_INVALID");
    const candidateReader = createLiveImageReadOnlyRunner();
    const candidateQuery = (operation: string, args: string[]) => { consumeCall(); return candidateReader(["ecr", operation, "--registry-id", account,
      "--repository-name", `${PREFIX}-worker`, ...args, "--profile", "gmai-admin", "--region", "ap-northeast-1", "--no-cli-pager", "--no-paginate", "--output", "json"]); };
    verifyPromotedImageDetail(candidateQuery("describe-images", ["--image-ids", `imageDigest=${PATCH.runtimeDigest}`]), account);
    const candidate = verifyRegistryManifest(candidateQuery("batch-get-image", ["--image-ids", `imageDigest=${PATCH.runtimeDigest}`]), account, PATCH.runtimeDigest, "application/vnd.oci.image.manifest.v1+json");
    if (object(candidate.config)?.digest !== PATCH.configDigest) fail("ROLLOUT_IMAGE_IDENTITY_INVALID");
    const scan = evaluateStoredBasicScan(candidateQuery("describe-image-scan-findings", ["--image-id", `imageDigest=${PATCH.runtimeDigest}`, "--max-results", "1000"]), account, PATCH.runtimeDigest, Date.now());
    if (!scan.basicOsGatePassed) fail("ROLLOUT_SCAN_BLOCKED");
    const live = template(STACK), foundation = template(`${PREFIX}-foundation`), assembly = join(directory, "assembly");
    const synth = spawnSync(process.execPath, [resolve("node_modules/tsx/dist/cli.mjs"), resolve("infrastructure/bin/app.ts")],
      { env: computeReviewSynthEnvironment(process.env, account, PATCH.runtimeDigest, assembly, deployedComputeAvailabilityZones(live)), timeout: 60_000, maxBuffer: 200_000, encoding: "utf8", windowsHide: true });
    if (synth.status !== 0 || synth.signal !== null) fail("ROLLOUT_SYNTH_UNVERIFIED");
    const proposedPath = join(assembly, `${STACK}.template.json`), proposed = JSON.parse(readFileSync(proposedPath, "utf8"));
    const strictReview = reviewExclusiveComputePatch(live, proposed, foundation, oldDigest);
    const assemblyManifest = JSON.parse(readFileSync(join(assembly, "manifest.json"), "utf8"));
    const proposedRole = assemblyManifest.artifacts?.[STACK]?.properties?.cloudFormationExecutionRoleArn;
    if (typeof proposedRole !== "string" || proposedRole.replace("${AWS::Partition}", "aws") !== initial.stack.RoleARN) fail("ROLLOUT_EXECUTION_ROLE_CHANGED");
    const tagArguments = preservedStackTagArguments(initial.stack.Tags);
    // This is an actual fresh scan of the immutable existing candidate, not a caller-supplied boolean or an old report.
    const archiveProof = scanLiveImageCache({}, true), archiveReview = reviewDatedPatchArchiveProof(archiveProof);
    console.error(JSON.stringify({ stage: "fresh-candidate-archive-verified", ...archiveReview, scannerAndTemporaryDataRemoved: true }));
    calls += Number(archiveProof.awsCalls);
    if (calls > 160 || Date.now() - started + 240_000 >= 1_050_000) fail("ROLLOUT_DEADLINE");
    // No arbitrary executable/Docker asset is allowed in this exclusive assembly.
    const assetManifestPath = join(assembly, `${STACK}.assets.json`), assetManifestBytes = readFileSync(assetManifestPath);
    const assets = JSON.parse(assetManifestBytes.toString("utf8"));
    if (Object.keys(assets.dockerImages ?? {}).length || !object(assets.files) || Object.keys(assets.files).length > 3) fail("ROLLOUT_ASSET_SCOPE_INVALID");
    const assetPaths: string[] = [];
    for (const [hash, record] of Object.entries(assets.files) as [string, Json][]) {
      if (!/^[a-f0-9]{64}$/.test(hash) || !["zip", "file"].includes(record.source?.packaging) ||
          typeof record.source?.path !== "string" || Object.keys(record.source).some(key => !["path", "packaging"].includes(key)) ||
          !object(record.destinations) || Object.keys(record.destinations).length !== 1) fail("ROLLOUT_ASSET_SCOPE_INVALID");
      const path = resolve(assembly, record.source.path), rel = relative(assembly, path);
      if (rel.startsWith("..") || isAbsolute(rel) || realpathSync(path) !== path || lstatSync(path).isSymbolicLink()) fail("ROLLOUT_ASSET_SCOPE_INVALID");
      reviewRolloutAssetDestination(Object.values(record.destinations)[0], account, hash);
      assetPaths.push(path);
    }
    const assetProof = rolloutAssetFingerprint(assembly, assetPaths);
    console.error(JSON.stringify({ stage: "exclusive-change-set-preparation", ...strictReview, boundedAssetFiles: assetProof.files, sourceAssetBytesBeforeCompression: assetProof.bytes }));
    const cdk = spawnSync(process.execPath, [resolve("node_modules/aws-cdk/bin/cdk"), "deploy", STACK, "--app", assembly, "--exclusively",
      "--method", "prepare-change-set", "--change-set-name", name, "--require-approval", "never", "--rollback", "--concurrency", "1",
      "--asset-parallelism", "false", ...tagArguments, "--profile", "gmai-admin", "--ci", "--no-lookups", "--no-version-reporting", "--no-notices"],
      { env, cwd: directory, encoding: "utf8", windowsHide: true, timeout: 240_000, maxBuffer: 2_000_000 });
    prepared = true; // Even a timeout may already have created the exact owned change set.
    if (cdk.status !== 0 || cdk.signal !== null) fail("ROLLOUT_PREPARATION_UNVERIFIED");
    // The pinned CDK prepare method hard-codes IncludeNestedStacks:true and
    // does not preserve these live stack tags. It is used only to publish the
    // bounded assets. Never execute its draft; delete the exact owned draft
    // and create one explicit, non-nested UPDATE with the original tags/role.
    const cdkDraft = query("cloudformation", "describe-change-set", ["--stack-name", STACK, "--change-set-name", name]);
    if(cdkDraft.StackId!==initial.stack.StackId||cdkDraft.ChangeSetName!==name||cdkDraft.StackName!==STACK||cdkDraft.ExecutionStatus!=="AVAILABLE"||
      !String(cdkDraft.ChangeSetId).startsWith(`arn:aws:cloudformation:ap-northeast-1:${account}:changeSet/${name}/`))fail("ROLLOUT_CDK_DRAFT_UNVERIFIED");
    query("cloudformation","delete-change-set",["--stack-name",STACK,"--change-set-name",cdkDraft.ChangeSetId]);
    const deletedDraft=query("cloudformation","describe-change-set",["--stack-name",STACK,"--change-set-name",name],true);
    if(!deletedDraft.absent)fail("ROLLOUT_CDK_DRAFT_CLEANUP_UNVERIFIED");
    if(lstatSync(proposedPath).size>51200||!assetManifestBytes.equals(readFileSync(assetManifestPath))||canonicalPatchValue(assetProof)!==canonicalPatchValue(rolloutAssetFingerprint(assembly,assetPaths)))fail("ROLLOUT_PREPARED_ASSET_CHANGED");
    query("cloudformation","create-change-set",reviewedChangeSetArguments(name,initial.stack,proposedPath));
    let changeSet:Json|undefined;
    for(let poll=0;poll<12;poll++){
      const current=query("cloudformation","describe-change-set",["--stack-name",STACK,"--change-set-name",name,"--include-property-values"]);
      if(current.Status==="CREATE_COMPLETE"){changeSet=current;break;}
      if(!["CREATE_PENDING","CREATE_IN_PROGRESS"].includes(current.Status))fail("ROLLOUT_REVIEWED_PREPARATION_UNVERIFIED");
      await new Promise(done=>setTimeout(done,5000));
    }
    if(!changeSet)fail("ROLLOUT_REVIEWED_PREPARATION_UNVERIFIED");
    console.error(JSON.stringify({ stage: "change-set-identity-diagnostic", ...computePatchChangeSetDiagnostic(changeSet, account, name, initial.stack, Date.now(), started) }));
    console.error(JSON.stringify({ stage: "change-set-detail-diagnostic", resources: computePatchDetailDiagnostic(changeSet, strictReview.metadataOnlyChangeTypes) }));
    console.error(JSON.stringify({ stage: "change-set-private-context-diagnostic", ...computePatchContextDiagnostic(changeSet, initial.controller?.Environment?.Variables?.WORKER_TASK_DEFINITION) }));
    if (prepareOnly) {
      const envelope = computePatchChangeSetDiagnostic(changeSet, account, name, initial.stack, Date.now(), started);
      if (Object.values(envelope).some(v => v !== true)) fail("ROLLOUT_PREPARE_IDENTITY_UNVERIFIED");
      if (canonicalPatchValue(template(STACK,name))!==canonicalPatchValue(proposed)) fail("ROLLOUT_PREPARED_TEMPLATE_CHANGED");
      const final = baseline();
      if (final.account!==account || final.stableOtherStacks!==initial.stableOtherStacks ||
        canonicalPatchValue(final.report.circuit)!==canonicalPatchValue(initial.report.circuit) ||
        final.controller?.CodeSha256!==initial.controller?.CodeSha256 ||
        final.controller?.Environment?.Variables?.WORKER_TASK_DEFINITION!==initial.controller?.Environment?.Variables?.WORKER_TASK_DEFINITION) fail("ROLLOUT_BASELINE_CHANGED");
      packet = { mode:"exclusive-disabled-compute-patch-prepare-only", ...strictReview, ...archiveReview,
        ...computePatchContextDiagnostic(changeSet,initial.controller?.Environment?.Variables?.WORKER_TASK_DEFINITION),
        changeSetExecutions:0, changeSetsCreated:2, sourceAssetBytesBeforeCompression:assetProof.bytes, boundedAssetFiles:assetProof.files,
        jobsEnabled:false, circuitVerifiedOpen:true, workerTasksLaunched:0, providerCalls:0, modelCalls:0,
        readyForExecution:false, readyForPublication:false };
    } else {
    const originalInlinePolicy=currentControllerPolicy(initial.controller!,live,account);
    const referenceReview=reviewComputePatchReferenceContexts(changeSet,live,proposed,initial.controller!,originalInlinePolicy);
    const changeReview = reviewComputePatchChangeSet(changeSet, account, name, initial.stack, Date.now(), started, strictReview.metadataOnlyChangeTypes,referenceReview);
    console.error(JSON.stringify({stage:"independent-reference-policy-reviewed",...referenceReview}));
    console.error(JSON.stringify({ stage: "exclusive-change-set-reviewed", ...changeReview }));
    if (canonicalPatchValue(template(STACK, name)) !== canonicalPatchValue(proposed) || canonicalPatchValue(JSON.parse(readFileSync(proposedPath, "utf8"))) !== canonicalPatchValue(proposed)) fail("ROLLOUT_PREPARED_TEMPLATE_CHANGED");
    if (!assetManifestBytes.equals(readFileSync(assetManifestPath)) || canonicalPatchValue(assetProof) !== canonicalPatchValue(rolloutAssetFingerprint(assembly, assetPaths))) fail("ROLLOUT_PREPARED_ASSET_CHANGED");
    const beforeExecution = baseline();
    if (beforeExecution.account !== account || beforeExecution.stableOtherStacks !== initial.stableOtherStacks ||
        canonicalPatchValue(beforeExecution.report.circuit) !== canonicalPatchValue(initial.report.circuit) ||
        beforeExecution.controller?.CodeSha256 !== initial.controller?.CodeSha256 ||
        beforeExecution.controller?.Environment?.Variables?.WORKER_TASK_DEFINITION !== initial.controller?.Environment?.Variables?.WORKER_TASK_DEFINITION ||
        Date.now() - started > 1_050_000) fail("ROLLOUT_BASELINE_CHANGED");
    const freshChangeSet = query("cloudformation", "describe-change-set", ["--stack-name", STACK, "--change-set-name", name, "--include-property-values"]);
    const freshReferenceReview=reviewComputePatchReferenceContexts(freshChangeSet,live,proposed,beforeExecution.controller!,currentControllerPolicy(beforeExecution.controller!,live,account));
    reviewComputePatchChangeSet(freshChangeSet, account, name, initial.stack, Date.now(), started, strictReview.metadataOnlyChangeTypes,freshReferenceReview);
    if (freshChangeSet.ChangeSetId !== changeSet.ChangeSetId) fail("ROLLOUT_PREPARED_TEMPLATE_CHANGED");
    if (!assetManifestBytes.equals(readFileSync(assetManifestPath)) || canonicalPatchValue(assetProof) !== canonicalPatchValue(rolloutAssetFingerprint(assembly, assetPaths))) fail("ROLLOUT_PREPARED_ASSET_CHANGED");
    // At-most-once submission. Ambiguity triggers reads, never another execute.
    executionAttempted = true;
    let acknowledgementVerified = false;
    try { query("cloudformation", "execute-change-set", ["--stack-name", STACK, "--change-set-name", changeSet.ChangeSetId, "--client-request-token", name, "--no-disable-rollback"]); acknowledgementVerified = true; }
    catch { /* Completion and safe stop require independent stack reads below. */ }
    let outcome = "";
    for (let poll = 0; poll < 40; poll++) {
      const state = query("cloudformation", "describe-stacks", ["--stack-name", STACK]);
      if (!Array.isArray(state.Stacks) || state.Stacks.length !== 1 || state.Stacks[0].StackId !== initial.stack.StackId) fail("ROLLOUT_STACK_IDENTITY_CHANGED");
      outcome = state.Stacks[0].StackStatus;
      if (outcome === "UPDATE_COMPLETE" && Date.parse(state.Stacks[0].LastUpdatedTime) >= Date.parse(changeSet.CreationTime)) break;
      if (["UPDATE_ROLLBACK_COMPLETE", "UPDATE_ROLLBACK_FAILED", "UPDATE_FAILED"].includes(outcome)) break;
      if (!["UPDATE_COMPLETE", "UPDATE_IN_PROGRESS", "UPDATE_COMPLETE_CLEANUP_IN_PROGRESS", "UPDATE_ROLLBACK_IN_PROGRESS", "UPDATE_ROLLBACK_COMPLETE_CLEANUP_IN_PROGRESS"].includes(outcome)) fail("ROLLOUT_STACK_STATE_UNVERIFIED");
      await new Promise(done => setTimeout(done, 5000));
    }
    if (outcome !== "UPDATE_COMPLETE" || canonicalPatchValue(template(STACK)) !== canonicalPatchValue(proposed)) fail("ROLLOUT_COMPLETION_UNVERIFIED");
    const final = baseline(), finalImageReader = createLiveImageReadOnlyRunner();
    const finalImage = collectPrivateCacheTarget(args => { consumeCall(); return finalImageReader(args); });
    if (final.account !== account || final.stack.RoleARN !== initial.stack.RoleARN || canonicalStackTags(final.stack.Tags) !== canonicalStackTags(initial.stack.Tags) || final.stableOtherStacks !== initial.stableOtherStacks || canonicalPatchValue(final.report.circuit) !== canonicalPatchValue(initial.report.circuit) ||
        finalImage.target.reference.split("@")[1] !== PATCH.runtimeDigest || finalImage.target.runtimeDigest !== PATCH.runtimeDigest ||
        finalImage.target.configDigest !== PATCH.configDigest || final.controller?.Environment?.Variables?.WORKER_TASK_DEFINITION === initial.controller?.Environment?.Variables?.WORKER_TASK_DEFINITION ||
        final.controller?.CodeSha256 === initial.controller?.CodeSha256) fail("ROLLOUT_POSTCHECK_UNVERIFIED");
    const finalInlinePolicy=currentControllerPolicy(final.controller!,proposed,account);
    let oldPolicy=originalInlinePolicy.PolicyDocument, finalPolicy=finalInlinePolicy.PolicyDocument;
    if(typeof oldPolicy==="string")oldPolicy=JSON.parse(decodeURIComponent(oldPolicy));
    if(typeof finalPolicy==="string")finalPolicy=JSON.parse(decodeURIComponent(finalPolicy));
    const currentTask=final.controller!.Environment.Variables.WORKER_TASK_DEFINITION;
    const normalizeRuntimePolicy=(policy:Json,task:string)=>{
      if(!Array.isArray(policy?.Statement) || policy.Statement.filter((s:Json)=>s.Action==="ecs:RunTask").length!==1 ||
        policy.Statement.find((s:Json)=>s.Action==="ecs:RunTask")?.Resource!==task)fail("ROLLOUT_POST_POLICY_UNVERIFIED");
      return {...policy,Statement:policy.Statement.map((s:Json)=>s.Action==="ecs:RunTask"?{...s,Resource:undefined}:s)};
    };
    if(finalInlinePolicy.RoleName!==originalInlinePolicy.RoleName || finalInlinePolicy.PolicyName!==originalInlinePolicy.PolicyName ||
      final.controller?.Role!==initial.controller?.Role || canonicalPatchValue(normalizeRuntimePolicy(oldPolicy,initial.controller!.Environment.Variables.WORKER_TASK_DEFINITION))!==
      canonicalPatchValue(normalizeRuntimePolicy(finalPolicy,currentTask)))fail("ROLLOUT_POST_POLICY_UNVERIFIED");
    packet = { mode: "exclusive-disabled-compute-patch-rollout", ...strictReview, ...archiveReview, ...changeReview,...referenceReview,
      cdkControlPlaneCallsNotCounted: true, changeSetsCreated: 2, unexecutedCdkDraftRemoved: true, reviewedNonNestedUpdateCreated: true,
      existingStackTagsAndExecutionRolePreserved: true, changeSetExecutions: 1, executeAcknowledgementVerified: acknowledgementVerified,
      computeUpdateComplete: true, foundationAndApiUnchanged: true, exactTemplateRuntimeAndConfigMatched: true,
      controllerCodeAndTaskReferenceChanged: true, postUpdateExactInlinePolicyVerified:true, rollbackDisabled: false, sourceAssetBytesBeforeCompression: assetProof.bytes,
      boundedAssetFiles: assetProof.files, preparedAssetFingerprint: assetProof.fingerprint, assetFingerprintUnchangedBeforeExecution: true,
      publicActions: 0, imagePushes: 0, providerCalls: 0, modelCalls: 0, workerTasksLaunched: 0, jobsEnabled: false,
      circuitVerifiedOpen: true, runningTasks: 0, pendingTasks: 0, services: 0, occupiedSlots: 0,
      archivePostDeploymentScanStillRequired: true, readyForExecution: false, readyForPublication: false };
    }
  } finally {
    // Never delete unrelated change sets or project images/assets after ambiguity.
    try { if (prepared) {
      const current = query("cloudformation", "describe-change-set", ["--stack-name", STACK, "--change-set-name", name], true);
      if (!current.absent && current.ChangeSetName === name && current.StackName === STACK &&
          current.StackId === ownedStackId && String(current.ChangeSetId).startsWith(`arn:aws:cloudformation:ap-northeast-1:${ownedAccount}:changeSet/${name}/`) &&
          !["EXECUTE_IN_PROGRESS"].includes(current.ExecutionStatus)) {
        query("cloudformation", "delete-change-set", ["--stack-name", STACK, "--change-set-name", current.ChangeSetId], true);
        const absent = query("cloudformation", "describe-change-set", ["--stack-name", STACK, "--change-set-name", name], true);
        if (!absent.absent) fail("ROLLOUT_CHANGE_SET_CLEANUP_UNVERIFIED");
      } else if (!current.absent) fail("ROLLOUT_CHANGE_SET_CLEANUP_UNVERIFIED");
    } } finally {
      if (!safeRolloutDirectory(base, directory, physical)) fail("ROLLOUT_TEMP_INVALID");
      rmSync(directory, { recursive: true }); if (existsSync(directory)) fail("ROLLOUT_TEMP_CLEANUP_UNVERIFIED");
    }
  }
  if (!packet) fail(executionAttempted ? "ROLLOUT_POSTCHECK_UNVERIFIED" : "ROLLOUT_INCOMPLETE");
  return { ...packet, explicitAwsCalls: calls, privateAssemblyRemoved: true, ownedChangeSetRemoved: true };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { const args = process.argv.slice(2); if (!args.length) console.log(JSON.stringify(computePatchRolloutPlan()));
    else { if (args.length !== 1 || !["--execute-one-disabled-rollout","--prepare-only-disabled-patch"].includes(args[0]!)) fail("ROLLOUT_ARGUMENTS_REJECTED");
      console.log(JSON.stringify(await executeComputePatchRollout(args[0] === "--prepare-only-disabled-patch"))); } }
  catch (error) { const code = error instanceof Error && /^ROLLOUT_[A-Z_]+$/.test(error.message) ? error.message : "ROLLOUT_INCOMPLETE";
    console.error(JSON.stringify({ error: code, privateDetailsSuppressed: true, safeStopMustBeIndependentlyVerified: true, noAutomaticRetry: true })); process.exitCode = 1; }
}
