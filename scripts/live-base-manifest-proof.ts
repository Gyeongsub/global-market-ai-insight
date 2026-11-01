import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { collectPhase11Readiness, createPhase11ReadOnlyCliRunner } from "./phase11-live-readiness.js";
import { createLiveImageReadOnlyRunner } from "./live-image-readiness.js";
import { collectPrivateCacheTarget } from "./scan-live-image-cache.js";
import { verifyReviewedWorkerBaseSource, verifyWorkerBaseManifestPrefix } from "./worker-base-identity.js";

type Reader = (args: readonly string[]) => unknown;
interface Dependencies { coreReader: () => Reader; imageReader: () => Reader; now?: () => number; source?: () => unknown; }
const fail = (): never => { throw new Error("LIVE_BASE_MANIFEST_PROOF_INCOMPLETE"); };
const object = (value: unknown): value is Record<string, any> => value !== null && typeof value === "object" && !Array.isArray(value);
export function liveBaseManifestPlan(args: readonly string[] = []) {
  if (args.length) fail();
  return { mode: "dry-run", awsCalls: 0, awsReadsMax: 46, cloudMutations: 0, dockerCalls: 0,
    imagePulls: 0, imagePushes: 0, credentialRetrievals: 0, imageCodeExecuted: false,
    privateConfigBytesRead: false, layerBodiesRead: false, readyForPublication: false };
}

/** Owned, disabled target only. A registry-metadata prefix is not an archive proof. */
export function collectLiveBaseManifestProof(dependencies: Dependencies): Record<string, unknown> {
  try {
    const now = dependencies.now ?? Date.now, source = dependencies.source ?? verifyReviewedWorkerBaseSource;
    const started = now(); let calls = 0;
    const limited = (read: Reader): Reader => args => {
      const elapsed = now() - started;
      if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed >= 480_000 || ++calls > 46) fail();
      return read(args);
    };
    const checkSource = () => { const report = source(); if (!object(report) || report.reviewedDockerfileMatched !== true) fail(); };
    checkSource();
    const core = () => {
      const read = limited(dependencies.coreReader()); let reference: string | undefined;
      const report = collectPhase11Readiness(args => {
        const value = read(args);
        if (args[0] === "ecs" && args[1] === "describe-task-definition" && object(value)) {
          const image = value.taskDefinition?.containerDefinitions?.[0]?.image;
          if (typeof image === "string") reference = image;
        }
        return value;
      });
      if (report.readyForAccountSpecificDiff !== true || !reference) fail(); return { report, reference };
    };
    const image = () => {
      const read = limited(dependencies.imageReader()); let manifestBytes: Buffer | undefined;
      const scope = collectPrivateCacheTarget(args => {
        const value = read(args);
        if (args[0] === "ecr" && args[1] === "batch-get-image" && object(value) && typeof value.images?.[0]?.imageManifest === "string") {
          const raw = value.images[0].imageManifest;
          if (Buffer.byteLength(raw) > 256 * 1024) fail();
          const candidate = JSON.parse(raw);
          if (object(candidate) && object(candidate.config)) manifestBytes = Buffer.from(raw);
        }
        return value;
      }, now);
      if (!manifestBytes) fail();
      return { target: scope.target, report: verifyWorkerBaseManifestPrefix(manifestBytes!, scope.target) };
    };
    const initialCore = core(), initial = image(), final = image(), finalCore = core(); checkSource();
    if (JSON.stringify(initial.target) !== JSON.stringify(final.target) ||
        initialCore.reference !== initial.target.reference || finalCore.reference !== final.target.reference ||
        JSON.stringify(initialCore.report.circuit) !== JSON.stringify(finalCore.report.circuit) ||
        !Number.isFinite(now() - started) || now() - started < 0 || now() - started >= 480_000) fail();
    return { mode: "owned-live-base-manifest-prefix-proof", observedAtUtc: new Date().toISOString(),
      awsCalls: calls, cloudMutations: 0, dockerCalls: 0, imagePulls: 0, imagePushes: 0,
      credentialRetrievals: 0, privateConfigBytesRead: false, layerBodiesRead: false,
      reviewedDockerfileMatched: true, sourceAndOwnedTargetRechecked: true,
      disabledExecutionAndDisplayVerified: true, emptyTaskServiceAndSlotInventories: true,
      verifiedOpenCircuitVersionUnchanged: true, privateIdentifiersPrinted: false, ...final.report };
  } catch { return fail(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (!args.length) console.log(JSON.stringify(liveBaseManifestPlan()));
    else {
      if (args.length !== 1 || args[0] !== "--execute-read-only" || process.env.AWS_PROFILE !== "gmai-admin") fail();
      console.log(JSON.stringify(collectLiveBaseManifestProof({ coreReader: createPhase11ReadOnlyCliRunner,
        imageReader: createLiveImageReadOnlyRunner })));
    }
  } catch {
    console.error(JSON.stringify({ error: "LIVE_BASE_MANIFEST_PROOF_INCOMPLETE", provenanceStatus: "unknown",
      rawDetailsSuppressed: true, cloudMutations: 0, readyForPublication: false })); process.exitCode = 1;
  }
}
