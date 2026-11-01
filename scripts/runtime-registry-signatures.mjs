import { performance } from "node:perf_hooks";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { readLocalDependencyLock } from "./dependency-license-inventory.mjs";
import { collectRuntimeSbomPreview } from "./runtime-sbom-preview.mjs";
import { REVIEWED_REGISTRY_KEY_ID, fetchReviewedRegistryKeys, verifyRegistrySignedIdentity } from "./registry-signature-proof.mjs";

// Lint-only Zod refresh; the reviewed 37-component runtime BOM is unchanged.
// 2026-11-01: minimatch local backport; public coordinate body and declared
// runtime BOM hashes are unchanged. This binding is not new network consent.
const REVIEWED_LOCK = "9739b078cbca97d4e7d4b40f4c2b81a88a946faa843ee546ac5a0cbf5c0cfba2";
const REVIEWED_BOM = "b222ba76dfe7af7eca19529836f47417b249685e044db48263fcb20e4991aec2";
const fail = () => { throw new Error("RUNTIME_REGISTRY_SIGNATURES_INCOMPLETE"); };
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const parse = bytes => JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes));
const packageName = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
function identity(target) {
  if (!object(target) || typeof target.name !== "string" || !packageName.test(target.name) || target.name.length > 214 ||
      typeof target.version !== "string" || target.version.length > 48 || !/^\d+\.\d+\.\d+$/.test(target.version) ||
      !/^sha512-[A-Za-z0-9+/]{86}==$/.test(target.integrity ?? "")) fail();
  return `${target.name}@${target.version}`;
}
export function runtimeRegistrySignaturePlan(args = []) {
  if (args.length) fail();
  return { mode: "dry-run", awsCalls: 0, publicRegistryRequests: 0, requestedRegistryReadsMax: 38,
    reviewedRuntimeComponents: 37, archivesFetched: 0, packagesInstalled: 0, subprocessesStarted: 0,
    filesWritten: 0, uploaded: false, sourceCommitVerified: false, legalApproval: false, readyForPublication: false };
}

/** Signature coverage is separate from fetched archive/installed byte proof.
 * Missing/unreviewed keys remain UNKNOWN; invalid reviewed-key signatures fail. */
export function classifyRuntimeRegistrySignature(target, metadata, keyProof) {
  identity(target);
  const tarball = `https://registry.npmjs.org/${target.name}/-/${target.name.split("/").at(-1)}-${target.version}.tgz`;
  if (metadata?.name !== target.name || metadata?.version !== target.version || metadata?.dist?.integrity !== target.integrity ||
      metadata?.dist?.tarball !== tarball) fail();
  const signatures = metadata.dist.signatures;
  if (signatures === undefined || Array.isArray(signatures) && signatures.length === 0)
    return { state: "signature-not-advertised", registrySignatureVerified: false };
  if (!Array.isArray(signatures) || signatures.length > 4 || signatures.some(row => !object(row) ||
      Object.keys(row).sort().join(",") !== "keyid,sig" || typeof row.keyid !== "string" ||
      !/^SHA256:[A-Za-z0-9+/]{43}$/.test(row.keyid) || typeof row.sig !== "string" ||
      row.sig.length < 1 || row.sig.length > 256 || !/^[A-Za-z0-9+/]+={0,2}$/.test(row.sig) ||
      Buffer.from(row.sig, "base64").toString("base64") !== row.sig)) fail();
  if (new Set(signatures.map(row => `${row.keyid}:${row.sig}`)).size !== signatures.length) fail();
  if (signatures.some(row => row.keyid !== REVIEWED_REGISTRY_KEY_ID)) {
    const reviewed = signatures.filter(row => row.keyid === REVIEWED_REGISTRY_KEY_ID);
    if (reviewed.length) verifyRegistrySignedIdentity(target,
      { ...metadata, dist: { ...metadata.dist, signatures: reviewed } }, target.integrity, keyProof);
    return { state: "unreviewed-signing-key", registrySignatureVerified: false };
  }
  const result = verifyRegistrySignedIdentity(target, metadata, target.integrity, keyProof);
  return { state: "reviewed-registry-signature-verified", registrySignatureVerified: true,
    verifiedSignatures: result.verifiedSignatures };
}

/** Target comes from the exact reviewed runtime graph, never caller input. */
async function fetchRuntimeRegistryMetadata(target, fetcher, signal, budget) {
  identity(target);
  const url = `https://registry.npmjs.org/${encodeURIComponent(target.name)}/${target.version}`;
  const response = await fetcher(url, { redirect: "error", signal, credentials: "omit", referrerPolicy: "no-referrer",
    headers: { Accept: "application/json" } });
  const reader = response.body?.getReader();
  try {
    const declared = response.headers.get("content-length");
    if (response.status !== 200 || !reader || response.url && response.url !== url ||
        declared !== null && (!/^\d+$/.test(declared) || Number(declared) > 100000)) fail();
    const chunks = []; let size = 0;
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength; budget.bytes += value.byteLength;
      if (size > 100000 || budget.bytes > 2000000) fail(); chunks.push(Buffer.from(value));
    }
    if (!size) fail();
    return parse(Buffer.concat(chunks));
  } finally { await reader?.cancel(); }
}

async function reviewedRuntimeSource(root) {
  const proof = readLocalDependencyLock(root);
  if (proof.lockfileSha256 !== REVIEWED_LOCK) fail();
  const preview = await collectRuntimeSbomPreview(root);
  if (preview.report.artifactSha256 !== REVIEWED_BOM || preview.report.components !== 37 ||
      preview.report.runtimeManifestsStable !== true || preview.report.lockfileSha256 !== REVIEWED_LOCK) fail();
  const targets = preview.bom.components.map(({ name, version }) => ({ name, version,
    integrity: proof.lock.packages[`${name}@${version}`].resolution.integrity }));
  if (new Set(targets.map(identity)).size !== 37) fail();
  return { targets, sourceSha256: preview.report.runtimeSourceMetadataSha256 };
}

export async function collectRuntimeRegistrySignatures(root = process.cwd(), fetcher = fetch) {
  const before = await reviewedRuntimeSource(root), start = performance.now(), signal = AbortSignal.timeout(60000);
  const budget = { bytes: 0 }; let requests = 0;
  const bounded = (url, options) => {
    if (++requests > 38 || performance.now() - start >= 60000) fail();
    return fetcher(url, { ...options, signal: AbortSignal.any([signal, options.signal]) });
  };
  const keyProof = await fetchReviewedRegistryKeys(bounded, signal), results = [];
  for (const target of before.targets) {
    const metadata = await fetchRuntimeRegistryMetadata(target, bounded,
      AbortSignal.any([signal, AbortSignal.timeout(15000)]), budget);
    results.push({ name: target.name, version: target.version, ...classifyRuntimeRegistrySignature(target, metadata, keyProof) });
  }
  const after = await reviewedRuntimeSource(root);
  if (before.sourceSha256 !== after.sourceSha256 || JSON.stringify(before.targets) !== JSON.stringify(after.targets) ||
      performance.now() - start >= 60000) fail();
  const verified = results.filter(row => row.registrySignatureVerified).length;
  return { mode: "reviewed-declared-runtime-registry-signatures", sourceMetadataSha256: before.sourceSha256,
    sourceUnchanged: true, lockfileSha256: REVIEWED_LOCK, runtimeBomSha256: REVIEWED_BOM,
    publicRegistryRequests: requests, metadataBytes: budget.bytes, deadlineMs: 60000,
    components: results.length, verifiedRegistrySignatureComponents: verified,
    unverifiedRegistrySignatureComponents: results.length - verified, allRegistrySignaturesVerified: verified === results.length,
    awsCalls: 0, archivesFetched: 0, installedPackageBytesVerified: false, packagesInstalled: 0,
    filesWritten: 0, uploaded: false, results, publisherSignatureVerified: false,
    sourceCommitVerified: false, buildProvenanceVerified: false, vulnerabilityScanPerformed: false,
    developmentOrImageGraphCovered: false, legalApproval: false, readyForPublication: false };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (!args.length) console.log(JSON.stringify(runtimeRegistrySignaturePlan()));
    else {
      if (args.length !== 1 || args[0] !== "--execute-public-metadata") fail();
      console.log(JSON.stringify(await collectRuntimeRegistrySignatures()));
    }
  } catch { console.error(JSON.stringify({ error: "RUNTIME_REGISTRY_SIGNATURES_INCOMPLETE", rawDetailsSuppressed: true,
    uploaded: false, readyForPublication: false })); process.exitCode = 1; }
}
