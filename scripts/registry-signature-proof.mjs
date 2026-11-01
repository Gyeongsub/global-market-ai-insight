import { createHash, createPublicKey, verify } from "node:crypto";
import { performance } from "node:perf_hooks";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { readLocalDependencyLock } from "./dependency-license-inventory.mjs";
import { PUBLISHED_LICENSE_TARGETS, fetchPublishedBytes, verifyPublishedMetadata, inspectPublishedArchive } from "./published-license-proof.mjs";

// Public registry key reviewed 2026-10-15. Rotation requires a new review;
// matching a registry signature is NOT publisher/build/source provenance.
export const REVIEWED_REGISTRY_KEY_ID = "SHA256:DhQ8wR5APBvFHLF/+Tc+AYvPOdTpcIDqOhxsBHRwC7U";
export const REVIEWED_REGISTRY_SPKI_SHA256 = "fb190a462123443500cbcdb6519623e7179e9f38d84ad4e9362b72d2b68b62c1";
// Lint-only Zod refresh; the three exact AWS SDK target records are unchanged.
// 2026-11-01: minimatch local backport; public coordinate body and declared
// runtime BOM hashes are unchanged. This binding is not new network consent.
const REVIEWED_LOCK = "9739b078cbca97d4e7d4b40f4c2b81a88a946faa843ee546ac5a0cbf5c0cfba2";
const KEYS_URL = "https://registry.npmjs.org/-/npm/v1/keys";
const KEY_PROOFS = new WeakMap();
const fail = () => { throw new Error("REGISTRY_SIGNATURE_PROOF_INCOMPLETE"); };
const object = value => value !== null && typeof value === "object" && !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
function base64(value, maximum) {
  if (typeof value !== "string" || !value || value.length > maximum || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) fail();
  const bytes = Buffer.from(value, "base64");
  if (bytes.toString("base64") !== value) fail();
  return bytes;
}
const parse = bytes => JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes));

export function registrySignaturePlan(args = []) {
  if (args.length) fail();
  return { mode: "dry-run", awsCalls: 0, publicRegistryRequests: 0, requestedRegistryReadsMax: 7,
    filesWritten: 0, packagesInstalled: 0, subprocessesStarted: 0, uploaded: false,
    sourceCommitVerified: false, buildProvenanceVerified: false, legalApproval: false, readyForPublication: false };
}

/** Only the reviewed, unexpired pinned public key can produce a local proof. */
export function verifyReviewedRegistryKeys(document) {
  if (!object(document) || Object.keys(document).join(",") !== "keys" || !Array.isArray(document.keys) ||
      document.keys.length < 1 || document.keys.length > 8) fail();
  const ids = new Set(); let selected;
  for (const row of document.keys) {
    if (!object(row) || Object.keys(row).sort().join(",") !== "expires,key,keyid,keytype,scheme" ||
        typeof row.keyid !== "string" || !/^SHA256:[A-Za-z0-9+/]{43}$/.test(row.keyid) || ids.has(row.keyid) ||
        row.keytype !== "ecdsa-sha2-nistp256" || row.scheme !== "ecdsa-sha2-nistp256" ||
        row.expires !== null && (typeof row.expires !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(row.expires) ||
          !Number.isFinite(Date.parse(row.expires)) || new Date(row.expires).toISOString() !== row.expires)) fail();
    ids.add(row.keyid);
    const der = base64(row.key, 1024), key = createPublicKey({ key: der, type: "spki", format: "der" });
    if (key.asymmetricKeyType !== "ec" || key.asymmetricKeyDetails?.namedCurve !== "prime256v1" ||
        !key.export({ type: "spki", format: "der" }).equals(der)) fail();
    if (row.keyid === REVIEWED_REGISTRY_KEY_ID) {
      if (row.expires !== null || hash(der) !== REVIEWED_REGISTRY_SPKI_SHA256) fail();
      selected = key;
    }
  }
  if (!selected) fail();
  const report = Object.freeze({ reviewedKeyMatched: true, registryKeySpkiSha256: REVIEWED_REGISTRY_SPKI_SHA256,
    keySetEntries: ids.size, independentPublisherTrustClaimed: false });
  KEY_PROOFS.set(report, selected);
  return report;
}

/** Verify the exact npm name/version/integrity message with Node's verifier.
 * Do not infer that registry signing covers repository/license/attestation fields. */
export function verifyPublishedRegistrySignature(target, metadata, integrity, keyProof) {
  verifyPublishedMetadata(target, metadata, integrity);
  return verifyRegistrySignedIdentity(target, metadata, integrity, keyProof);
}

/** Pure identity/integrity verification only; this function makes no request.
 * Network callers separately confine their reviewed fixed public coordinates. */
export function verifyRegistrySignedIdentity(target, metadata, integrity, keyProof) {
  if (!object(target) || !/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(target.name ?? "") ||
      typeof target.name !== "string" || target.name.length > 214 || typeof target.version !== "string" ||
      target.version.length > 48 || !/^\d+\.\d+\.\d+$/.test(target.version) ||
      metadata?.name !== target.name || metadata?.version !== target.version || metadata?.dist?.integrity !== integrity ||
      !/^sha512-[A-Za-z0-9+/]{86}==$/.test(integrity ?? "")) fail();
  const key = KEY_PROOFS.get(keyProof), signatures = metadata.dist.signatures;
  if (!key || !Array.isArray(signatures) || signatures.length < 1 || signatures.length > 4) fail();
  const seen = new Set(), message = Buffer.from(`${target.name}@${target.version}:${integrity}`);
  for (const row of signatures) {
    if (!object(row) || Object.keys(row).sort().join(",") !== "keyid,sig" || row.keyid !== REVIEWED_REGISTRY_KEY_ID) fail();
    const signature = base64(row.sig, 256);
    if (seen.has(row.sig) || !verify("sha256", message, key, signature)) fail();
    seen.add(row.sig);
  }
  return { registrySignatureVerified: true, verifiedSignatures: seen.size, signedIdentityAndIntegrityMatched: true,
    registryKeySpkiSha256: REVIEWED_REGISTRY_SPKI_SHA256, repositoryFieldsCryptographicallyVerified: false,
    sourceCommitVerified: false, buildProvenanceVerified: false, publisherSignatureVerified: false,
    legalApproval: false, readyForPublication: false };
}

export async function fetchReviewedRegistryKeys(fetcher, signal) {
  const response = await fetcher(KEYS_URL, { redirect: "error", signal,
    headers: { Accept: "application/json" }, credentials: "omit", referrerPolicy: "no-referrer" });
  const reader = response.body?.getReader();
  try {
    const declared = response.headers.get("content-length");
    if (response.status !== 200 || !reader || response.url && response.url !== KEYS_URL ||
        declared !== null && (!/^\d+$/.test(declared) || Number(declared) > 20000)) fail();
    const chunks = []; let size = 0;
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength; if (size > 20000) fail(); chunks.push(Buffer.from(value));
    }
    if (!size) fail();
    return verifyReviewedRegistryKeys(parse(Buffer.concat(chunks)));
  } finally { await reader?.cancel(); }
}

/** Seven fixed public GETs at most, no install/extract/execute/upload. */
export async function collectRegistrySignatureProof(root = process.cwd(), fetcher = fetch) {
  const before = readLocalDependencyLock(root);
  if (before.lockfileSha256 !== REVIEWED_LOCK) fail();
  const start = performance.now(), signal = AbortSignal.timeout(60000); let requests = 0;
  const bounded = async (url, options) => {
    if (++requests > 7 || performance.now() - start >= 60000) fail();
    return fetcher(url, { ...options, signal: AbortSignal.any([signal, options.signal]),
      credentials: "omit", referrerPolicy: "no-referrer" });
  };
  const keyProof = await fetchReviewedRegistryKeys(bounded, signal), results = [];
  for (const target of PUBLISHED_LICENSE_TARGETS) {
    const integrity = before.lock.packages?.[`${target.name}@${target.version}`]?.resolution?.integrity;
    const metadata = parse(await fetchPublishedBytes(target, "metadata", bounded));
    const signature = verifyPublishedRegistrySignature(target, metadata, integrity, keyProof);
    const archive = inspectPublishedArchive(target, await fetchPublishedBytes(target, "tarball", bounded), integrity);
    results.push({ ...archive, ...signature, gitHeadProvided: typeof metadata.gitHead === "string" && /^[a-f0-9]{40}$/.test(metadata.gitHead),
      buildAttestationAdvertised: object(metadata.dist.attestations) });
  }
  if (readLocalDependencyLock(root).lockfileSha256 !== before.lockfileSha256 || performance.now() - start >= 60000) fail();
  return { mode: "public-registry-signature-and-archive-proof", lockfileSha256: before.lockfileSha256,
    publicRegistryRequests: requests, deadlineMs: 60000, awsCalls: 0, filesWritten: 0, packagesInstalled: 0,
    archiveExtracted: false, uploaded: false, results, independentPublisherTrustClaimed: false,
    sourceCommitVerified: false, buildProvenanceVerified: false, legalApproval: false, readyForPublication: false };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (!args.length) console.log(JSON.stringify(registrySignaturePlan()));
    else {
      if (args.length !== 1 || args[0] !== "--execute-public-metadata") fail();
      console.log(JSON.stringify(await collectRegistrySignatureProof()));
    }
  } catch { console.error(JSON.stringify({ error: "REGISTRY_SIGNATURE_PROOF_INCOMPLETE", rawDetailsSuppressed: true,
    uploaded: false, readyForPublication: false })); process.exitCode = 1; }
}
