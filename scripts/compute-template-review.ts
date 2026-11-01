import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { collectPrivateCacheTarget } from "./scan-live-image-cache.js";
import { createLiveImageReadOnlyRunner, evaluateStoredBasicScan, verifyRegistryManifest } from "./live-image-readiness.js";
import { PATCH, verifyPromotedImageDetail } from "./promote-worker-patch.js";
import { collectPhase11Readiness, createPhase11ReadOnlyCliRunner, phase11ReadOnlyChildEnvironment } from "./phase11-live-readiness.js";

const PREFIX = "global-market-ai-insight-dev";
type Json = Record<string, any>;
function fail(code: string): never { throw new Error(code); }
function object(value: unknown): Json | null { return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Json : null; }
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const record = object(value);
  if (record) return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
  return JSON.stringify(value) ?? "undefined";
}
function resources(value: unknown): Json {
  const template = object(value), entries = object(template?.Resources);
  if (!entries || Object.keys(entries).length === 0 || Object.keys(entries).length > 200 ||
      Object.entries(entries).some(([key, value]) => !/^[A-Za-z][A-Za-z0-9]{0,254}$/.test(key) || !object(value) ||
        !/^(?:AWS::[A-Za-z0-9]+::[A-Za-z0-9]+|Custom::[A-Za-z0-9]{1,128})$/.test(value.Type) || (value.Properties !== undefined && !object(value.Properties)))) fail("COMPUTE_REVIEW_TEMPLATE_INVALID");
  return entries;
}
function imports(value: unknown, found = new Set<string>()): Set<string> {
  if (Array.isArray(value)) for (const child of value) imports(child, found);
  const record = object(value);
  if (record) for (const [key, child] of Object.entries(record)) {
    if (key === "Fn::ImportValue") {
      if (typeof child !== "string" || !/^global-market-ai-insight-dev-foundation:[A-Za-z0-9]{1,200}$/.test(child)) fail("COMPUTE_REVIEW_IMPORT_UNSUPPORTED");
      found.add(child);
    } else imports(child, found);
  }
  return found;
}
function actions(resource: Json): string[] {
  const document = object(resource.Properties?.PolicyDocument);
  if (!document) return [];
  if (!Array.isArray(document.Statement) || document.Statement.length > 100) fail("COMPUTE_REVIEW_POLICY_INVALID");
  const result = new Set<string>();
  for (const statement of document.Statement) {
    if (!object(statement) || statement.Effect !== "Allow" || statement.NotAction !== undefined || statement.NotResource !== undefined) fail("COMPUTE_REVIEW_POLICY_UNSUPPORTED");
    const values = Array.isArray(statement.Action) ? statement.Action : [statement.Action];
    if (values.length === 0 || values.some((value: unknown) => typeof value !== "string" || !/^[a-z0-9-]+:[A-Za-z0-9*]+$/.test(value))) fail("COMPUTE_REVIEW_POLICY_INVALID");
    for (const action of values) result.add(action);
  }
  return [...result].sort();
}

/** Structural comparison only. It never treats an action-set comparison as a complete IAM or replacement review. */
export function reviewComputeTemplates(liveValue: unknown, proposedValue: unknown, foundationValue: unknown) {
  const live = resources(liveValue), proposed = resources(proposedValue);
  resources(foundationValue);
  const foundationOutputs = object(object(foundationValue)?.Outputs);
  if (!foundationOutputs || Object.keys(foundationOutputs).length > 200) fail("COMPUTE_REVIEW_EXPORTS_INVALID");
  const exports = new Set<string>();
  for (const value of Object.values(foundationOutputs)) {
    const name = object(object(value)?.Export)?.Name;
    if (name === undefined) continue;
    if (typeof name !== "string" || !/^global-market-ai-insight-dev-foundation:[A-Za-z0-9]{1,200}$/.test(name) || exports.has(name)) fail("COMPUTE_REVIEW_EXPORTS_INVALID");
    exports.add(name);
  }
  const required = imports(proposedValue);
  const added = Object.keys(proposed).filter(key => !live[key]).sort();
  const removed = Object.keys(live).filter(key => !proposed[key]).sort();
  const changed = Object.keys(proposed).filter(key => live[key] && canonical(live[key]) !== canonical(proposed[key])).sort().map(key => {
    const before = live[key], after = proposed[key];
    const properties = [...new Set([...Object.keys(before.Properties ?? {}), ...Object.keys(after.Properties ?? {})])]
      .filter(name => canonical(before.Properties?.[name]) !== canonical(after.Properties?.[name])).sort();
    if (properties.some(name => !/^[A-Za-z][A-Za-z0-9]{0,100}$/.test(name))) fail("COMPUTE_REVIEW_PROPERTY_INVALID");
    const oldActions = actions(before), newActions = actions(after);
    return { logicalId: key, type: after.Type, resourceTypeChanged: before.Type !== after.Type, changedProperties: properties,
      nonPropertyFieldsChanged: canonical({ ...before, Properties: undefined }) !== canonical({ ...after, Properties: undefined }),
      changedNonPropertyFields: [...new Set([...Object.keys(before), ...Object.keys(after)])]
        .filter(name => name !== "Properties" && canonical(before[name]) !== canonical(after[name])).sort(),
      addedIamActions: newActions.filter(action => !oldActions.includes(action)), removedIamActions: oldActions.filter(action => !newActions.includes(action)),
      policyResourceOrConditionReviewStillRequired: properties.includes("PolicyDocument") };
  });
  const worker = Object.values(proposed).filter(value => value.Type === "AWS::ECS::TaskDefinition");
  const controller = Object.values(proposed).filter(value => value.Type === "AWS::Lambda::Function" && value.Properties?.FunctionName === `${PREFIX}-controller`);
  const variables = controller[0]?.Properties?.Environment?.Variables;
  const workerContainer = worker[0]?.Properties?.ContainerDefinitions;
  if (worker.length !== 1 || controller.length !== 1 || variables?.ENABLE_PROVIDER_BACKED_JOBS !== "false" || variables.ENABLE_LIVE_RESULT_DISPLAY !== "false" ||
      !Array.isArray(workerContainer) || workerContainer.length !== 1 || workerContainer[0]?.ReadonlyRootFilesystem !== true || workerContainer[0]?.User !== "65532:65532" ||
      Object.values(proposed).some(value => ["AWS::ECS::Service", "AWS::EC2::NatGateway", "AWS::ElasticLoadBalancingV2::LoadBalancer"].includes(value.Type))) fail("COMPUTE_REVIEW_SAFETY_GUARDS_INVALID");
  const metadataChanges = ["Parameters", "Conditions", "Mappings", "Outputs", "Transform"]
    .filter(key => canonical(object(liveValue)?.[key]) !== canonical(object(proposedValue)?.[key]));
  const missingImports = [...required].filter(name => !exports.has(name)).sort();
  return { comparedComputeResources: Object.keys(proposed).length, addedResourceIds: added, removedResourceIds: removed, changedResources: changed,
    changedTemplateSections: metadataChanges, requiredFoundationImports: required.size, missingFoundationImports: missingImports,
    disabledExecutionFlagsVerified: true, taskHardeningVerified: true, noAlwaysOnWorkerResources: true,
    existingFoundationExportCompatibility: missingImports.length === 0,
    fullReplacementAndIamReviewComplete: false, deploymentPerformed: false, readyForDeployment: false };
}

export function deployedComputeAvailabilityZones(value: unknown) {
  const entries = resources(value);
  const names = ["WorkerVpcpublicworkerSubnet1Subnet37E39F3A", "WorkerVpcpublicworkerSubnet2Subnet073D8779"];
  const zones = names.map(name => {
    const resource = entries[name], properties = object(resource?.Properties);
    if (resource?.Type !== "AWS::EC2::Subnet" || properties?.MapPublicIpOnLaunch !== true ||
        typeof properties.AvailabilityZone !== "string" || !/^ap-northeast-1[a-z]$/.test(properties.AvailabilityZone)) fail("COMPUTE_REVIEW_AZ_CONTEXT_UNVERIFIED");
    return properties.AvailabilityZone as string;
  });
  if (new Set(zones).size !== 2 || Object.values(entries).filter(value => value.Type === "AWS::EC2::Subnet").length !== 2) fail("COMPUTE_REVIEW_AZ_CONTEXT_UNVERIFIED");
  return zones;
}

export function computeReviewSynthEnvironment(source: NodeJS.ProcessEnv, account: string, digest: string, directory: string, availabilityZones?: readonly string[]) {
  if (!/^[0-9]{12}$/.test(account) || /^0+$/.test(account) || !/^sha256:[a-f0-9]{64}$/.test(digest)) fail("COMPUTE_REVIEW_IDENTITY_INVALID");
  if (availabilityZones !== undefined && (availabilityZones.length !== 2 || new Set(availabilityZones).size !== 2 || availabilityZones.some(zone => !/^ap-northeast-1[a-z]$/.test(zone)))) fail("COMPUTE_REVIEW_AZ_CONTEXT_UNVERIFIED");
  const env = phase11ReadOnlyChildEnvironment(source);
  for (const key of Object.keys(env)) if (/^(AWS_|GMAI_|CDK_|TWELVE_?DATA|BEDROCK_|OPENAI_|ANTHROPIC_|GITHUB_TOKEN$|GH_TOKEN$|NODE_OPTIONS$|NODE_PATH$|HTTP_PROXY$|HTTPS_PROXY$|ALL_PROXY$|NO_PROXY$)/i.test(key)) delete env[key];
  return { ...env, CDK_DEFAULT_ACCOUNT: account, CDK_OUTDIR: directory, CDK_DISABLE_CLI_TELEMETRY: "true",
    ...(availabilityZones ? { CDK_CONTEXT_JSON: JSON.stringify({ [`availability-zones:account=${account}:region=ap-northeast-1`]: [...availabilityZones] }) } : {}),
    GMAI_CONFIG: resolve("infrastructure/environments/dev.example.json"), GMAI_WORKER_IMAGE_DIGEST: digest,
    // Synthesize the existing API dependency to preserve Compute exports used
    // by that deployed stack. It is never uploaded or deployed by this command.
    GMAI_ENABLE_API: "true", GMAI_ENABLE_INTERNAL_JOBS: "false", GMAI_ENABLE_OPERATIONS: "false",
    GMAI_ENABLE_MAINTENANCE_DRAFT: "false", GMAI_ENABLE_ALARM_NOTIFICATIONS: "false", GMAI_ACKNOWLEDGE_ALARM_NOTIFICATION_COST: "false",
    GMAI_ENABLE_ALARM_CIRCUIT_AUTOMATION: "false", GMAI_ACKNOWLEDGE_ALARM_CIRCUIT_COST: "false",
    GMAI_ENABLE_CUSTOM_OPERATION_METRICS: "false", GMAI_ACKNOWLEDGE_CUSTOM_METRIC_COST: "false",
    GMAI_PHASE11_REFERENCE_ONLY: "false", GMAI_ALLOW_UNRESERVED_ALARM_DRILL: "false" };
}
export function safeComputeReviewTemporaryDirectory(base: string, directory: string, physicalBase: string) {
  try { const name = basename(directory); return /^gmai-compute-review-[A-Za-z0-9]+$/.test(name) && relative(resolve(base), resolve(directory)) === name &&
    lstatSync(directory).isDirectory() && !lstatSync(directory).isSymbolicLink() && realpathSync(base) === physicalBase && realpathSync(directory) === resolve(physicalBase, name); }
  catch { return false; }
}
export function computeTemplateReviewPlan(args: readonly string[] = []) {
  if (args.length) fail("COMPUTE_REVIEW_ARGUMENTS_REJECTED");
  return { mode: "dry-run", awsCalls: 0, awsReadsMax: 39, cloudMutations: 0, assetUploads: 0, changeSetsCreated: 0, deployments: 0,
    usesCurrentLiveImageDigest: true, newImageReleasePrepared: false, readyForDeployment: false };
}

export function executeComputeTemplateReview(reviewDatedPatch = false) {
  if (process.env.AWS_PROFILE !== "gmai-admin") fail("COMPUTE_REVIEW_ARGUMENTS_REJECTED");
  const configured = process.env.GMAI_AWS_CLI_PATH;
  if (!configured || !isAbsolute(configured) || basename(configured).toLowerCase() !== "aws.exe" || !existsSync(configured) ||
      !lstatSync(configured).isFile() || lstatSync(configured).isSymbolicLink()) fail("COMPUTE_REVIEW_CLI_INVALID");
  const started = Date.now(), base = resolve(tmpdir()), physicalBase = realpathSync(base);
  const directory = resolve(mkdtempSync(join(base, "gmai-compute-review-")));
  let packet: Record<string, unknown> | undefined;
  try {
    if (!safeComputeReviewTemporaryDirectory(base, directory, physicalBase)) fail("COMPUTE_REVIEW_TEMP_INVALID");
    const bounded = (reader: (args: readonly string[]) => unknown) => (args: readonly string[]) => {
      const elapsed = Date.now() - started;
      if (elapsed < 0 || elapsed + 30_000 >= 420_000) fail("COMPUTE_REVIEW_DEADLINE");
      const value = reader(args);
      if (Date.now() - started >= 420_000) fail("COMPUTE_REVIEW_DEADLINE");
      return value;
    };
    const baseline = () => {
      const reader = bounded(createPhase11ReadOnlyCliRunner());
      let identity: unknown, task: unknown;
      const report = collectPhase11Readiness(args => {
        const value = reader(args);
        if (args[0] === "sts") identity = value;
        if (args[1] === "describe-task-definition") task = value;
        return value;
      });
      return { report, account: object(identity)?.Account, image: object(task)?.taskDefinition?.containerDefinitions?.[0]?.image,
        taskArn: object(task)?.taskDefinition?.taskDefinitionArn };
    };
    const initial = baseline();
    if (initial.report.readyForAccountSpecificDiff !== true) fail("COMPUTE_REVIEW_BASELINE_BLOCKED");
    const image = collectPrivateCacheTarget(bounded(createLiveImageReadOnlyRunner()));
    const account = image.target.reference.split(".")[0]!, liveDigest = image.target.reference.split("@")[1]!;
    if (account !== initial.account || image.target.reference !== initial.image || Date.now() - started + 60_000 >= 420_000) fail("COMPUTE_REVIEW_BASELINE_CHANGED");
    let patchReads = 0, patchBasicScan: Record<string, unknown> | undefined;
    if (reviewDatedPatch) {
      const reader = bounded(createLiveImageReadOnlyRunner());
      const query = (operation: string, args: string[]) => {
        patchReads++;
        return reader(["ecr", operation, "--registry-id", account, "--repository-name", `${PREFIX}-worker`, ...args,
          "--profile", "gmai-admin", "--region", "ap-northeast-1", "--no-cli-pager", "--no-paginate", "--output", "json"]);
      };
      verifyPromotedImageDetail(query("describe-images", ["--image-ids", `imageDigest=${PATCH.runtimeDigest}`]), account);
      const manifest = verifyRegistryManifest(query("batch-get-image", ["--image-ids", `imageDigest=${PATCH.runtimeDigest}`]), account, PATCH.runtimeDigest, "application/vnd.oci.image.manifest.v1+json");
      if (object(manifest.config)?.digest !== PATCH.configDigest) fail("COMPUTE_REVIEW_PATCH_IDENTITY_INVALID");
      patchBasicScan = evaluateStoredBasicScan(query("describe-image-scan-findings", ["--image-id", `imageDigest=${PATCH.runtimeDigest}`, "--max-results", "1000"]), account, PATCH.runtimeDigest, Date.now());
      if (patchBasicScan.basicOsGatePassed !== true) fail("COMPUTE_REVIEW_PATCH_SCAN_BLOCKED");
    }
    const digest = reviewDatedPatch ? PATCH.runtimeDigest : liveDigest;
    const readTemplate = (stack: "foundation" | "compute") => {
      const elapsed = Date.now() - started; if (elapsed < 0 || elapsed + 30_000 >= 420_000) fail("COMPUTE_REVIEW_DEADLINE");
      const result = spawnSync(configured, ["cloudformation", "get-template", "--stack-name", `${PREFIX}-${stack}`, "--template-stage", "Original",
        "--profile", "gmai-admin", "--region", "ap-northeast-1", "--no-cli-pager", "--output", "json"],
      { env: phase11ReadOnlyChildEnvironment(process.env), timeout: Math.min(30_000, 420_000 - elapsed), maxBuffer: 1_500_000, encoding: "utf8", windowsHide: true });
      if (result.status !== 0 || result.signal !== null || typeof result.stdout !== "string") fail("COMPUTE_REVIEW_READ_FAILED");
      const input = object(JSON.parse(result.stdout));
      if (!Array.isArray(input?.StagesAvailable) || !input.StagesAvailable.includes("Original")) fail("COMPUTE_REVIEW_RESPONSE_INVALID");
      const body = input.TemplateBody;
      if (typeof body === "string") { if (Buffer.byteLength(body) > 1_000_000) fail("COMPUTE_REVIEW_TEMPLATE_INVALID"); return JSON.parse(body); }
      if (!object(body)) fail("COMPUTE_REVIEW_TEMPLATE_INVALID"); return body;
    };
    const live = readTemplate("compute"), foundation = readTemplate("foundation");
    const zones = deployedComputeAvailabilityZones(live);
    if (Date.now() - started + 60_000 >= 420_000) fail("COMPUTE_REVIEW_DEADLINE");
    const synth = spawnSync(process.execPath, [resolve("node_modules/tsx/dist/cli.mjs"), resolve("infrastructure/bin/app.ts")], {
      env: computeReviewSynthEnvironment(process.env, account, digest, directory, zones), timeout: 60_000, maxBuffer: 200_000, encoding: "utf8", windowsHide: true });
    if (synth.status !== 0 || synth.signal !== null) fail("COMPUTE_REVIEW_SYNTH_FAILED");
    const path = join(directory, `${PREFIX}-compute.template.json`);
    if (!lstatSync(path).isFile() || lstatSync(path).isSymbolicLink() || lstatSync(path).size > 1_000_000 || realpathSync(path) !== path) fail("COMPUTE_REVIEW_TEMPLATE_INVALID");
    const proposed = JSON.parse(readFileSync(path, "utf8"));
    const review = reviewComputeTemplates(live, proposed, foundation);
    const final = baseline();
    if (final.report.readyForAccountSpecificDiff !== true || canonical(initial.report.circuit) !== canonical(final.report.circuit) ||
        final.account !== initial.account || final.image !== initial.image || final.taskArn !== initial.taskArn || Date.now() - started >= 420_000) fail("COMPUTE_REVIEW_BASELINE_CHANGED");
    packet = { mode: "live-read-only-compute-template-review", awsCalls: 22 + image.report.awsCalls + 2 + patchReads, cloudMutations: 0, assetUploads: 0,
      changeSetsCreated: 0, deployments: 0, usesCurrentLiveImageDigest: !reviewDatedPatch, patchedCandidateReviewed: reviewDatedPatch,
      ...(patchBasicScan ? { patchBasicOsScan: patchBasicScan } : {}),
      existingDeployedSubnetZonesPreserved: true, existingApiSynthesizedOnlyToPreserveExports: true, apiDeployed: false,
      fullLiveImageArchiveScanStillRequired: true, storedCircuitStillVerifiedOpen: true, runningTasks: 0, pendingTasks: 0, services: 0, occupiedSlots: 0,
      localSynthCredentialEnvironmentStripped: true, rawCloudTemplatesPrinted: false, ...review };
  } finally {
    if (!safeComputeReviewTemporaryDirectory(base, directory, physicalBase)) fail("COMPUTE_REVIEW_TEMP_INVALID");
    rmSync(directory, { recursive: true }); if (existsSync(directory)) fail("COMPUTE_REVIEW_CLEANUP_UNVERIFIED");
  }
  if (!packet) fail("COMPUTE_REVIEW_INCOMPLETE"); return { ...packet, privateAssemblyRemoved: true };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (!args.length) console.log(JSON.stringify(computeTemplateReviewPlan()));
    else {
      if (args[0] !== "--execute-read-only" || args.length > 2 || (args.length === 2 && args[1] !== "--review-dated-patch")) fail("COMPUTE_REVIEW_ARGUMENTS_REJECTED");
      console.log(JSON.stringify(executeComputeTemplateReview(args[1] === "--review-dated-patch")));
    }
  } catch (error) {
    const code = error instanceof Error && /^COMPUTE_REVIEW_[A-Z_]+$/.test(error.message) ? error.message : "COMPUTE_REVIEW_INCOMPLETE";
    console.error(JSON.stringify({ error: code, rawDetailsSuppressed: true, readyForDeployment: false, cloudMutations: 0, cleanupMustBeIndependentlyVerified: true })); process.exitCode = 1;
  }
}
