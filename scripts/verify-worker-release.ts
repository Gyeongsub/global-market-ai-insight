import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { cacheScanChildEnvironment, collectPrivateCacheTarget, readBoundedCachedArchiveFiles, verifyCachedLiveImage } from "./scan-live-image-cache.js";
import { createLiveImageReadOnlyRunner } from "./live-image-readiness.js";
import { collectPhase11Readiness, createPhase11ReadOnlyCliRunner } from "./phase11-live-readiness.js";
import { PATCH, PRIVATE_ACL, privateAclChildEnvironment } from "./promote-worker-patch.js";
import { verifyReviewedWorkerBaseSource, verifyWorkerBaseMetadata } from "./worker-base-identity.js";
import { verifyReleaseSource } from "./release-source-proof.js";

import { readCurrentWorkerBundle as currentBundle, safeWorkerProofDirectory, verifyWorkerApplicationArchive,
  WORKER_APPLICATION_FILES as FILES, workerProofFail as fail, workerProofFailurePacket } from "./worker-application-proof.js";
export { readApplicationLayer, readCurrentWorkerBundle, safeWorkerProofDirectory, verifyWorkerApplicationArchive,
  workerProofFailurePacket } from "./worker-application-proof.js";
const HOST = "npipe:////./pipe/dockerDesktopLinuxEngine", LIMIT = 256 * 1024 * 1024;
export function workerReleasePlan(args: readonly string[] = []) {
  if (args.length) fail("ARGUMENTS_REJECTED");
  return { mode: "dry-run", awsCalls: 0, awsCallsMax: 42, cloudMutations: 0, dockerCallsMax: 3, containersStarted: 0,
    imagePulls: 0, imagePushes: 0, credentialsRetrieved: false, sourceMapsCreated: false, archiveExtractionPerformed: false, readyForPublication: false };
}
export function verifyWorkerRelease() {
  const dockerCli = process.env.GMAI_DOCKER_CLI_PATH;
  if (process.platform !== "win32" || process.env.AWS_PROFILE !== "gmai-admin" || !dockerCli || !isAbsolute(dockerCli) ||
      basename(dockerCli).toLowerCase() !== "docker.exe" || !lstatSync(dockerCli).isFile() || lstatSync(dockerCli).isSymbolicLink()) fail("CONFIGURATION_INVALID");
  const base = resolve(tmpdir()), physical = realpathSync(base), directory = mkdtempSync(join(base, "gmai-worker-source-proof-"));
  let calls = 0; const started = Date.now(), configPath = join(directory, "docker-config"), archive = join(directory, "image.tar");
  let packet: Record<string, unknown> | undefined;
  const core = () => { const reader = createPhase11ReadOnlyCliRunner(); const result = collectPhase11Readiness(reader);
    if (result.readyForAccountSpecificDiff !== true) fail("CORE_BLOCKED"); return result; };
  const docker = (args: string[], timeout = 20_000) => {
    if (++calls > 3 || Date.now() - started > 480_000) fail("DEADLINE_OR_CALL_LIMIT");
    const result = spawnSync(dockerCli!, ["--host", HOST, ...args], { encoding: "utf8", windowsHide: true, timeout, maxBuffer: 2_000_000,
      env: cacheScanChildEnvironment(process.env, configPath) });
    if (result.status !== 0 || result.signal !== null) fail("DOCKER_READ_UNVERIFIED"); return result.stdout;
  };
  try {
    if (!safeWorkerProofDirectory(base, directory, physical)) fail("TEMP_INVALID");
    const acl = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", PRIVATE_ACL], { encoding: "utf8", windowsHide: true,
      env: privateAclChildEnvironment(process.env, directory), timeout: 10_000, maxBuffer: 20_000 });
    if (acl.status !== 0 || JSON.parse(acl.stdout).privateAclVerified !== true) fail("PRIVATE_ACL_UNVERIFIED");
    const sourceBase = verifyReviewedWorkerBaseSource();
    const expected = currentBundle();
    const sourceProof = verifyReleaseSource("worker", expected.get("main.mjs")!);
    mkdirSync(configPath); const initialCore = core();
    const initial = collectPrivateCacheTarget(createLiveImageReadOnlyRunner());
    if (initial.target.runtimeDigest !== PATCH.runtimeDigest || initial.target.configDigest !== PATCH.configDigest) fail("LIVE_PATCH_REQUIRED");
    verifyCachedLiveImage(JSON.parse(docker(["image", "inspect", "--platform", "linux/amd64", initial.target.reference])), initial.target);
    docker(["image", "save", "--platform", "linux/amd64", "--output", archive, initial.target.reference], 30_000);
    const stat = lstatSync(archive);
    if (!stat.isFile() || stat.isSymbolicLink() || realpathSync(archive) !== archive || stat.size < 1 || stat.size > LIMIT) fail("ARCHIVE_INVALID");
    const archiveBytes = readFileSync(archive), archiveFiles = readBoundedCachedArchiveFiles(archiveBytes);
    const manifestBytes = archiveFiles.get(`blobs/sha256/${initial.target.runtimeDigest.slice(7)}`);
    const configBytes = archiveFiles.get(`blobs/sha256/${initial.target.configDigest.slice(7)}`);
    if (!manifestBytes || !configBytes) fail("BASE_IDENTITY_UNVERIFIED");
    const baseProof = verifyWorkerBaseMetadata(manifestBytes!, configBytes!, initial.target);
    const proof = verifyWorkerApplicationArchive(archiveBytes, initial.target, expected);
    const final = collectPrivateCacheTarget(createLiveImageReadOnlyRunner()), finalCore = core(), current = currentBundle();
    verifyReviewedWorkerBaseSource();
    const closingSourceProof = verifyReleaseSource("worker", current.get("main.mjs")!);
    if (JSON.stringify(initial.target) !== JSON.stringify(final.target) || JSON.stringify(initialCore.circuit) !== JSON.stringify(finalCore.circuit) ||
        JSON.stringify(sourceProof) !== JSON.stringify(closingSourceProof) ||
        FILES.some(file => !current.get(file)!.equals(expected.get(file)!))) fail("CLOSING_STATE_CHANGED");
    verifyCachedLiveImage(JSON.parse(docker(["image", "inspect", "--platform", "linux/amd64", final.target.reference])), final.target);
    packet = { mode: "owned-live-worker-application-source-proof", awsCalls: 22 + initial.report.awsCalls + final.report.awsCalls,
      cloudMutations: 0, dockerCalls: calls, containersStarted: 0, imagePulls: 0, imagePushes: 0, credentialsRetrieved: false,
      archiveBytes: stat.size, ...proof, ...sourceBase, reviewedBaseLayersMatched: baseProof.baseLayers,
      reviewedBasePrefixAndDiffIdsMatched: true, laterOverlaysVerifiedByApplicationProof: true,
      sourceAndLiveTargetRechecked: true, currentSourceRebuildVerified: true, jobsEnabled: false, displayEnabled: false,
      emptyTaskServiceAndSlotInventory: true, circuitVersionUnchanged: true, privateIdentifiersPrinted: false };
  } finally {
    if (!safeWorkerProofDirectory(base, directory, physical)) fail("TEMP_INVALID");
    rmSync(directory, { recursive: true }); if (existsSync(directory)) fail("TEMP_CLEANUP_UNVERIFIED");
  }
  if (!packet) fail("INCOMPLETE"); return { ...packet, privateArchiveAndConfigurationRemoved: true };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { const args = process.argv.slice(2);
    if (!args.length) console.log(JSON.stringify(workerReleasePlan()));
    else { if (args.length !== 1 || args[0] !== "--execute-read-only") fail("ARGUMENTS_REJECTED"); console.log(JSON.stringify(verifyWorkerRelease())); }
  } catch (error) { console.error(JSON.stringify(workerProofFailurePacket(error))); process.exitCode = 1; }
}
