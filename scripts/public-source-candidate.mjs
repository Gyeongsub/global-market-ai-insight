import { createHash, randomUUID } from "node:crypto";
import { dirname, join, relative, resolve, isAbsolute, sep } from "node:path";
import { lstatSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { capturePublicationManifest, inspectPublicationCandidate } from "./publication-audit.mjs";
import { ownedLocalGateReportDirectory } from "./local-gate-proof.mjs";
import { sanitizeSocialImage } from "../frontend/scripts/sanitize-social-image.mjs";

const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const fail = () => { throw Error("PUBLIC_SOURCE_CANDIDATE_INCOMPLETE"); };
const OMIT = "docs/evidence/worker-image-20260810.cdx.json";
const IMAGE = "frontend/public/og.png";
const BLOCKED = new Set(["credential-pattern", "sensitive-file-name-review",
  "credential-or-assistant-private-state-review", "generated-or-private-path-review",
  "automation-workflow-cost-review", "unreviewed-text-encoding", "unrecognized-file-type-review"]);

export function publicSourcePlan(args = []) {
  if (args.length) fail();
  return { mode: "dry-run", sourceCopied: false, awsCalls: 0, networkCalls: 0,
    sourceModified: false, gitModified: false, publicationPerformed: false,
    readyForPublication: false, omittedHistoricalSbom: OMIT, separateCleanImage: IMAGE };
}

/** This is a local projection, not clearing original artifact rights/findings. */
export function publicSourceProjection(file, bytes) {
  if (typeof file !== "string" || !file || file.includes("\\") || file.includes(":") ||
      /[\x00-\x1f\x7f]/.test(file) || file.split("/").some(p => !p || p === "." || p === ".." || p.toLowerCase() === ".git") ||
      !Buffer.isBuffer(bytes)) fail();
  if (file === OMIT) return null;
  return file === IMAGE ? sanitizeSocialImage(bytes).bytes : Buffer.from(bytes);
}

export function preparePublicSourceCandidate(root = process.cwd()) {
  const base = resolve(root), before = capturePublicationManifest(base);
  if (before.findings.some(f => BLOCKED.has(f.category))) fail();
  const reportDirectory = ownedLocalGateReportDirectory(base), output = dirname(reportDirectory);
  const id = randomUUID(), directory = join(output, `public-source-${id}`);
  mkdirSync(directory);
  const owned = () => relative(output, directory) === `public-source-${id}` &&
    realpathSync(output) === output && realpathSync(directory) === directory &&
    lstatSync(directory).isDirectory() && !lstatSync(directory).isSymbolicLink();
  const manifest = [], findings = [], transformations = [];
  let complete = false;
  try {
    if (!owned()) fail();
    for (const entry of before.manifest) {
      const source = join(base, entry.file), stat = lstatSync(source);
      if (!stat.isFile() || stat.isSymbolicLink() || realpathSync(source) !== source) fail();
      const bytes = readFileSync(source);
      if (hash(bytes) !== entry.sha256 || realpathSync(source) !== source || !lstatSync(source).isFile()) fail();
      const projected = publicSourceProjection(entry.file, bytes);
      if (projected === null) {
        transformations.push({ file: entry.file, operation: "omit-private-historical-sbom", originalSha256: entry.sha256 });
        continue;
      }
      const destination = resolve(directory, entry.file), offset = relative(directory, destination);
      if (!offset || isAbsolute(offset) || offset === ".." || offset.startsWith(`..${sep}`)) fail();
      mkdirSync(dirname(destination), { recursive: true });
      if (realpathSync(dirname(destination)) !== dirname(destination)) fail();
      writeFileSync(destination, projected, { flag: "wx", mode: 0o600 });
      if (realpathSync(destination) !== destination || !readFileSync(destination).equals(projected)) fail();
      const categories = inspectPublicationCandidate(entry.file, projected);
      if (categories.some(c => BLOCKED.has(c))) fail();
      findings.push(...categories.map(category => ({ file: entry.file, category })));
      const sha256 = hash(projected);
      manifest.push({ file: entry.file, bytes: projected.length, sha256 });
      if (sha256 !== entry.sha256) transformations.push({ file: entry.file, operation: "clean-image-copy",
        originalSha256: entry.sha256, candidateSha256: sha256, removedBytes: bytes.length - projected.length });
    }
    if (JSON.stringify(capturePublicationManifest(base).manifest) !== JSON.stringify(before.manifest) || !owned()) fail();
    const record = { mode: "local-public-source-candidate", schemaVersion: 1, createdAt: new Date().toISOString(),
      candidateDirectory: `outputs/public-source-${id}`, candidateFiles: manifest.length,
      candidateManifestSha256: hash(JSON.stringify(manifest)), manifest, findings, transformations,
      sourceUnchanged: true, originalsPreserved: true, sourceCopied: true, awsCalls: 0, networkCalls: 0,
      gitModified: false, publicationPerformed: false, historyReviewed: false,
      frozenInstallVerified: false, rightsApproved: false, readyForPublication: false };
    writeFileSync(join(reportDirectory, `public-source-${id}.json`), JSON.stringify(record) + "\n", { flag: "wx", mode: 0o600 });
    complete = true;
    return { ...record, manifest: undefined, findings: undefined, findingCount: findings.length };
  } finally {
    if (!complete) {
      if (!owned()) fail();
      rmSync(directory, { recursive: true, force: true });
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (!args.length) console.log(JSON.stringify(publicSourcePlan()));
    else if (args.length === 1 && args[0] === "--prepare-local-candidate") console.log(JSON.stringify(preparePublicSourceCandidate()));
    else fail();
  } catch { console.error(JSON.stringify({ error: "PUBLIC_SOURCE_CANDIDATE_INCOMPLETE", publicationPerformed: false, rawDetailsSuppressed: true })); process.exitCode = 1; }
}
