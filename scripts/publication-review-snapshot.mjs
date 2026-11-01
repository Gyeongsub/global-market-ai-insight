import { createHash, randomUUID } from "node:crypto";
import { lstatSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { capturePublicationManifest } from "./publication-audit.mjs";
import { ownedLocalGateReportDirectory } from "./local-gate-proof.mjs";

const snapshots = new WeakMap();
const hash = value => createHash("sha256").update(value).digest("hex");
const fail = () => { throw Error("PUBLICATION_SNAPSHOT_INCOMPLETE"); };
const effects = { awsCalls: 0, externalNetworkCalls: 0, sourceFilesModified: false,
  imageModified: false, sourceContentsCopied: false, gitIndexModified: false,
  pushPerformed: false, readyForPublication: false, findingsWaived: false };
const blocked = new Set(["credential-pattern", "sensitive-file-name-review",
  "credential-or-assistant-private-state-review", "generated-or-private-path-review"]);

export function publicationSnapshotPlan(args = []) {
  if (args.length) fail();
  return { mode: "dry-run", operation: "local-publication-review-snapshot", filesWritten: 0,
    gitReads: 0, candidateReads: 0, ...effects };
}

export function createPublicationReviewSnapshot(root = process.cwd()) {
  const base = resolve(root), captured = capturePublicationManifest(base);
  // Do not persist even an inventory for tracked private state or secret findings.
  if (captured.findings.some(f => blocked.has(f.category))) fail();
  const manifestJson = JSON.stringify(captured.manifest);
  const record = { mode: "local-publication-review-snapshot", schemaVersion: 1,
    createdAt: new Date().toISOString(), candidateFiles: captured.candidateFiles,
    candidateBytes: captured.totalBytes, candidateManifestSha256: hash(manifestJson),
    findings: captured.findings, manifest: captured.manifest, ...effects,
    stableDoubleReadVerified: true, atomicSnapshotClaimed: false, historyReviewed: false,
    metadataOrRightsCleared: false, sourceContentsIncluded: false, localOnly: true };
  // Keep a private byte copy so mutation of the returned view cannot be written.
  snapshots.set(record, { base, bytes: JSON.stringify(record) + "\n", manifestJson });
  return record;
}

export function writePublicationReviewSnapshot(root, record) {
  const saved = snapshots.get(record), base = resolve(root);
  if (!saved || base !== saved.base || saved.bytes !== JSON.stringify(record) + "\n") fail();
  const current = capturePublicationManifest(base);
  if (JSON.stringify(current.manifest) !== saved.manifestJson) fail();
  const directory = ownedLocalGateReportDirectory(base);
  const file = join(directory, `publication-review-${randomUUID()}.json`);
  writeFileSync(file, saved.bytes, { flag: "wx", mode: 0o600 });
  if (!lstatSync(file).isFile() || lstatSync(file).isSymbolicLink() || realpathSync(file) !== file ||
      readFileSync(file, "utf8") !== saved.bytes) fail();
  return { mode: record.mode, schemaVersion: 1, candidateFiles: record.candidateFiles,
    candidateBytes: record.candidateBytes, candidateManifestSha256: record.candidateManifestSha256,
    findingCount: record.findings.length, filesWritten: 1, reportFile: file.slice(directory.length + 1),
    stableDoubleReadVerified: true, historyReviewed: false, ...effects };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (!args.length) console.log(JSON.stringify(publicationSnapshotPlan()));
    else {
      if (args.length !== 1 || args[0] !== "--execute-local-snapshot") fail();
      console.log(JSON.stringify(writePublicationReviewSnapshot(process.cwd(), createPublicationReviewSnapshot())));
    }
  } catch {
    console.error(JSON.stringify({ error: "PUBLICATION_SNAPSHOT_INCOMPLETE", rawDetailsSuppressed: true,
      ...effects })); process.exitCode = 1;
  }
}
