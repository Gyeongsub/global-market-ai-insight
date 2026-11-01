import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { cacheScanChildEnvironment, collectPrivateCacheTarget, safeScanTemporaryDirectory } from "./scan-live-image-cache.js";
import { createLiveImageReadOnlyRunner, verifyRegistryManifest } from "./live-image-readiness.js";
import { collectPhase11Readiness, createPhase11ReadOnlyCliRunner, phase11ReadOnlyChildEnvironment } from "./phase11-live-readiness.js";
import { verifyLocalPatchArchive } from "./prepare-worker-patch.js";
import { PATCH, verifyPromotedImageDetail } from "./worker-patch-identity.js";
export { PATCH, verifyPromotedImageDetail } from "./worker-patch-identity.js";

// One dated, actually built and scanned release. A later source/digest needs a
// new build, acceptance and operator review; this is not a generic push gate.
const HOST = "npipe:////./pipe/dockerDesktopLinuxEngine", REPO = "global-market-ai-insight-dev-worker";
type Json = Record<string, any>;
function object(value: unknown): Json | null { return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Json : null; }
function fail(code: string): never { throw new Error(code); }
export function requireRecentPatchAcceptance(now: number) {
  const accepted = Date.parse(PATCH.acceptanceTime);
  if (!Number.isSafeInteger(now) || now < accepted || now - accepted >= 3_600_000 || new Date(now).toISOString().slice(0, 10) !== "2026-10-04") fail("PROMOTION_PATCH_ACCEPTANCE_EXPIRED");
}
export function registryPassword(value: unknown, account: string, now: number): string {
  const input = object(value);
  if (!Number.isSafeInteger(now) || now <= 0 || !/^[0-9]{12}$/.test(account) || /^0+$/.test(account) || !Array.isArray(input?.authorizationData) || input.authorizationData.length !== 1) fail("PROMOTION_AUTH_INVALID");
  const entry = object(input.authorizationData[0]), token = entry?.authorizationToken;
  const expiry = typeof entry?.expiresAt === "string" ? Date.parse(entry.expiresAt) : NaN;
  if (entry?.proxyEndpoint !== `https://${account}.dkr.ecr.ap-northeast-1.amazonaws.com` || typeof token !== "string" ||
      token.length > 16_384 || !/^[A-Za-z0-9+/]+={0,2}$/.test(token) || !Number.isFinite(expiry) || expiry <= now || expiry - now > 43_500_000) fail("PROMOTION_AUTH_INVALID");
  const decoded = Buffer.from(token, "base64");
  if (decoded.toString("base64") !== token) fail("PROMOTION_AUTH_INVALID");
  const text = new TextDecoder("utf-8", { fatal: true }).decode(decoded);
  if (!text.startsWith("AWS:") || text.length < 20 || text.length > 8192 || /[\x00-\x20\x7f]/.test(text)) fail("PROMOTION_AUTH_INVALID");
  return text.slice(4);
}
export function privatePatchPromotionPlan(args: readonly string[] = []) {
  if (args.length) fail("PROMOTION_ARGUMENTS_REJECTED");
  return { mode: "dry-run", awsCalls: 0, privateImagePushesMax: 1, registryPasswordsMax: 1, credentialsPrinted: false,
    registryPasswordLifetimeRevokedByLogout: false, privateAclRequired: true, existingImagesDeleted: false, deployments: 0, internalJobsEnabled: false, readyForExecution: false };
}
export function privateAclChildEnvironment(source: NodeJS.ProcessEnv, directory: string) {
  const env = cacheScanChildEnvironment(source, directory);
  // Do not feed PowerShell 7's inherited module directories to Windows
  // PowerShell 5.1; let the latter initialize its native security modules.
  for (const key of Object.keys(env)) if (key.toUpperCase() === "PSMODULEPATH") delete env[key];
  return { ...env, GMAI_OWNED_DOCKER_CONFIG: directory };
}
export const PRIVATE_ACL = `
$ErrorActionPreference = 'Stop'
$taskConfigPath = $env:GMAI_OWNED_DOCKER_CONFIG
$taskUserSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
$taskSystemSid = [System.Security.Principal.SecurityIdentifier]::new('S-1-5-18')
$taskPrivateAcl = [System.Security.AccessControl.DirectorySecurity]::new()
$taskPrivateAcl.SetOwner($taskUserSid)
$taskPrivateAcl.SetAccessRuleProtection($true, $false)
foreach ($taskAllowedSid in @($taskUserSid, $taskSystemSid)) {
  $taskPrivateAcl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($taskAllowedSid, 'FullControl', 'ContainerInherit, ObjectInherit', 'None', 'Allow'))
}
Set-Acl -LiteralPath $taskConfigPath -AclObject $taskPrivateAcl
$taskActualAcl = Get-Acl -LiteralPath $taskConfigPath
$taskRules = @($taskActualAcl.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier]))
if (!$taskActualAcl.AreAccessRulesProtected -or $taskRules.Count -ne 2 -or $taskActualAcl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value -ne $taskUserSid.Value) { throw 'ACL verification failed' }
foreach ($taskRule in $taskRules) {
  if ($taskRule.IsInherited -or $taskRule.AccessControlType -ne 'Allow' -or $taskRule.IdentityReference.Value -notin @($taskUserSid.Value, 'S-1-5-18') -or $taskRule.FileSystemRights -ne 'FullControl') { throw 'ACL verification failed' }
}
'{"privateAclVerified":true}'
`;

export function promoteWorkerPatch() {
  requireRecentPatchAcceptance(Date.now());
  const aws = process.env.GMAI_AWS_CLI_PATH, cli = process.env.GMAI_DOCKER_CLI_PATH;
  if (process.env.AWS_PROFILE !== "gmai-admin" || process.platform !== "win32" || !aws || !cli) fail("PROMOTION_ARGUMENTS_REJECTED");
  for (const [path, expected] of [[aws, "aws.exe"], [cli, "docker.exe"]]) if (!isAbsolute(path!) || basename(path!).toLowerCase() !== expected ||
      !existsSync(path!) || !lstatSync(path!).isFile() || lstatSync(path!).isSymbolicLink()) fail("PROMOTION_CLI_INVALID");
  const started = Date.now(), base = resolve(tmpdir()), physical = realpathSync(base), directory = mkdtempSync(join(base, "gmai-live-image-scan-"));
  const config = join(directory, "docker-config"), archive = join(directory, "image.tar"), env = cacheScanChildEnvironment(process.env, config);
  let registry = "", alias = "", loginAttempted = false, tagged = false, pushAttempted = false, completed = false, packet: Record<string, unknown> | undefined;
  const docker = (args: string[], timeout = 20_000, input?: string) => spawnSync(cli, ["--host", HOST, ...args],
    { env, encoding: "utf8", windowsHide: true, timeout, maxBuffer: 2_000_000, input });
  const output = (result: ReturnType<typeof docker>) => { if (result.status !== 0 || result.signal !== null) fail("PROMOTION_DOCKER_FAILED"); return result.stdout; };
  let directCalls = 0;
  const query = (operation: "get-authorization-token" | "describe-images" | "batch-get-image", account: string, args: string[] = []) => {
    if (directCalls >= 4 || Date.now() - started + 30_000 >= 600_000) fail("PROMOTION_DEADLINE"); directCalls++;
    const result = spawnSync(aws, ["ecr", operation, "--registry-id" + (operation === "get-authorization-token" ? "s" : ""), account,
      ...args, "--profile", "gmai-admin", "--region", "ap-northeast-1", "--no-paginate", "--no-cli-pager", "--output", "json"],
    { env: phase11ReadOnlyChildEnvironment(process.env), encoding: "utf8", windowsHide: true, timeout: 30_000, maxBuffer: 2_000_000 });
    if (result.status !== 0 || result.signal !== null) {
      if (operation === "describe-images" && result.signal === null && /\(ImageNotFoundException\)/.test(result.stderr)) return { absent: true };
      fail("PROMOTION_AWS_FAILED");
    }
    return JSON.parse(result.stdout);
  };
  try {
    if (!safeScanTemporaryDirectory(base, directory, physical)) fail("PROMOTION_TEMP_INVALID"); mkdirSync(config);
    const initial = collectPhase11Readiness(createPhase11ReadOnlyCliRunner());
    if (initial.readyForAccountSpecificDiff !== true) fail("PROMOTION_BASELINE_BLOCKED");
    const live = collectPrivateCacheTarget(createLiveImageReadOnlyRunner());
    const account = live.target.reference.split(".")[0]!;
    registry = `${account}.dkr.ecr.ap-northeast-1.amazonaws.com`; alias = `${registry}/${REPO}:${PATCH.remoteTag}`;
    const prior = query("describe-images", account, ["--repository-name", REPO, "--image-ids", `imageTag=${PATCH.remoteTag}`]);
    if (!object(prior)?.absent) fail("PROMOTION_TAG_ALREADY_PRESENT_OR_UNKNOWN");
    const inspection = JSON.parse(output(docker(["image", "inspect", "--platform", "linux/amd64", PATCH.localTag])));
    output(docker(["image", "save", "--platform", "linux/amd64", "--output", archive, PATCH.localTag], 30_000));
    if (!lstatSync(archive).isFile() || lstatSync(archive).isSymbolicLink() || lstatSync(archive).size > 256 * 1024 * 1024 || realpathSync(archive) !== archive) fail("PROMOTION_ARCHIVE_INVALID");
    const candidate = verifyLocalPatchArchive(readFileSync(archive), inspection);
    if (candidate.imageId !== PATCH.runtimeDigest || candidate.target.runtimeDigest !== PATCH.runtimeDigest || candidate.target.configDigest !== PATCH.configDigest) fail("PROMOTION_PATCH_IDENTITY_MISMATCH");
    const acl = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", PRIVATE_ACL],
      { env: privateAclChildEnvironment(env, config), encoding: "utf8", timeout: 10_000, maxBuffer: 20_000, windowsHide: true });
    if (acl.status !== 0 || acl.signal !== null || JSON.parse(acl.stdout).privateAclVerified !== true) fail("PROMOTION_PRIVATE_ACL_UNVERIFIED");
    requireRecentPatchAcceptance(Date.now());
    let password = registryPassword(query("get-authorization-token", account), account, Date.now());
    loginAttempted = true;
    try { output(docker(["login", "--username", "AWS", "--password-stdin", registry], 30_000, password)); } finally { password = ""; }
    output(docker(["image", "tag", candidate.imageId, alias])); tagged = true;
    if (Date.now() - started + 180_000 >= 600_000) fail("PROMOTION_DEADLINE");
    pushAttempted = true;
    const pushed = output(docker(["image", "push", "--platform", "linux/amd64", alias], 180_000));
    const digests = [...pushed.matchAll(/\bdigest:\s*(sha256:[a-f0-9]{64})/g)].map(match => match[1]);
    if (digests.length !== 1 || digests[0] !== PATCH.runtimeDigest) fail("PROMOTION_PUSH_UNVERIFIED");
    const size = verifyPromotedImageDetail(query("describe-images", account, ["--repository-name", REPO, "--image-ids", `imageDigest=${PATCH.runtimeDigest}`]), account);
    const manifest = verifyRegistryManifest(query("batch-get-image", account, ["--repository-name", REPO, "--image-ids", `imageDigest=${PATCH.runtimeDigest}`]), account, PATCH.runtimeDigest, "application/vnd.oci.image.manifest.v1+json");
    if (object(manifest.config)?.digest !== PATCH.configDigest) fail("PROMOTION_PUSH_UNVERIFIED");
    completed = true;
    const final = collectPhase11Readiness(createPhase11ReadOnlyCliRunner());
    if (final.readyForAccountSpecificDiff !== true || JSON.stringify(initial.circuit) !== JSON.stringify(final.circuit)) fail("PROMOTION_BASELINE_CHANGED");
    packet = { mode: "one-private-patch-image-promotion", privateImagePushes: 1, registryPasswordRetrievals: 1, credentialOutputPrinted: false,
      privateCredentialDirectoryAclVerified: true, exactRuntimeManifestAndConfigMatched: true, pushedCompressedBytes: size,
      runtimeManifestDigest: PATCH.runtimeDigest, artifactSource: "dated-verified-local-build-and-archive-scan", imageIndexOrAttestationsPushed: false,
      deployments: 0, internalJobsEnabled: false, liveDisplayEnabled: false, circuitStillVerifiedOpen: true, runningTasks: 0, pendingTasks: 0, services: 0, occupiedSlots: 0,
      patchedImageActuallyDeployed: false, liveImageScanAndExactComputeDiffStillRequired: true, readyForExecution: false, readyForPublication: false };
  } finally {
    if (loginAttempted) docker(["logout", registry], 15_000); // Removes only the isolated client's entry, not server token validity.
    try {
      if (tagged && !completed) {
        const inspection = JSON.parse(output(docker(["image", "inspect", "--platform", "linux/amd64", alias])));
        if (!Array.isArray(inspection) || inspection.length !== 1 || inspection[0]?.Id !== PATCH.runtimeDigest || !inspection[0]?.RepoTags?.includes(alias)) fail("PROMOTION_ALIAS_OWNER_UNVERIFIED");
        output(docker(["image", "rm", alias]));
      }
    } finally {
      // Credential removal is not skipped if a separate alias cleanup is
      // ambiguous. Never broaden a Docker deletion to "fix" that ambiguity.
      if (!safeScanTemporaryDirectory(base, directory, physical)) fail("PROMOTION_TEMP_INVALID");
      rmSync(directory, { recursive: true }); if (existsSync(directory)) fail("PROMOTION_CREDENTIAL_CLEANUP_UNVERIFIED");
    }
  }
  if (!packet) fail(completed ? "PROMOTION_POSTCHECK_INCOMPLETE" : pushAttempted ? "PROMOTION_PUSH_OUTCOME_UNKNOWN" : "PROMOTION_INCOMPLETE");
  return { ...packet, isolatedCredentialFilesAndArchiveRemoved: true, localPrivateRegistryAliasRetainedForPostDeploymentScan: true, registryTokenServerValidityRevoked: false };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (!args.length) console.log(JSON.stringify(privatePatchPromotionPlan()));
    else { if (args.length !== 1 || args[0] !== "--execute-one-private-push") fail("PROMOTION_ARGUMENTS_REJECTED"); console.log(JSON.stringify(promoteWorkerPatch())); }
  } catch (error) {
    const code = error instanceof Error && /^PROMOTION_[A-Z_]+$/.test(error.message) ? error.message : "PROMOTION_INCOMPLETE";
    console.error(JSON.stringify({ error: code, rawDetailsSuppressed: true, automaticRetryAllowed: false, readyForExecution: false,
      isolatedCredentialCleanupMustBeIndependentlyVerified: true, remotePushOutcomeMustBeIndependentlyVerified: true })); process.exitCode = 1;
  }
}
