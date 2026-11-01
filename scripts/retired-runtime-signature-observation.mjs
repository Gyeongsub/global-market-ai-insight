import { createHash, createPublicKey, verify } from "node:crypto";
import { performance } from "node:perf_hooks";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { readLocalDependencyLock } from "./dependency-license-inventory.mjs";
import { verifyReviewedRegistryKeys } from "./registry-signature-proof.mjs";

// Official npm key-set observation, 2026-10-16. This retired key is NOT added
// to current-policy trust. A valid equation is not a trusted signing timestamp.
export const RETIRED_KEY = Object.freeze({ keyId: "SHA256:jl3bwswu80PjjokCgh0o2w5c2U4LhQAE57gj9cz1kzA",
  spkiSha256: "1e908a55459fe6ddac1ccbc137ea8631ee837032fec2a2ccc528b38d81f17108", expires: "2025-01-29T00:00:00.000Z" });
export const RETIRED_TARGETS = Object.freeze([Object.freeze({ name: "mnemonist", version: "0.38.3" }),
  Object.freeze({ name: "obliterator", version: "1.6.1" }), Object.freeze({ name: "tslib", version: "2.8.1" })]);
// 2026-10-24: lint-only Zod lock refresh; all three exact runtime target
// identities/integrities and the retired key/expiry policy are unchanged.
// This rebinding does not authenticate an old signing time or trust that key.
// 2026-11-01: minimatch local backport; public coordinate body and declared
// runtime BOM hashes are unchanged. This binding is not new network consent.
const LOCK = "9739b078cbca97d4e7d4b40f4c2b81a88a946faa843ee546ac5a0cbf5c0cfba2";
const KEYS_URL = "https://registry.npmjs.org/-/npm/v1/keys";
const proofs = new WeakMap();
const fail = () => { throw new Error("RETIRED_SIGNATURE_OBSERVATION_INCOMPLETE"); };
const object = v => v !== null && typeof v === "object" && !Array.isArray(v);
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
function base64(text, max) {
  if (typeof text !== "string" || !text || text.length > max || !/^[A-Za-z0-9+/]+={0,2}$/.test(text)) fail();
  const bytes = Buffer.from(text, "base64"); if (bytes.toString("base64") !== text) fail(); return bytes;
}

export function retiredSignaturePlan(args = []) {
  if (args.length) fail();
  return { mode: "dry-run", publicRegistryRequests: 0, requestedPublicGetsMax: 4, awsCalls: 0, filesWritten: 0,
    packagesInstalled: 0, archivesFetched: 0, uploaded: false, currentTrustPolicyChanged: false,
    trustedSigningTimeVerified: false, readyForPublication: false };
}

export function observeRetiredRegistryKey(document, now = Date.now()) {
  // Keep the active-key validation completely intact, including malformed or
  // duplicated keys. Neither caller booleans nor a bare key can make a proof.
  verifyReviewedRegistryKeys(document);
  const rows = document.keys.filter(row => row.keyid === RETIRED_KEY.keyId);
  if (rows.length !== 1 || rows[0].expires !== RETIRED_KEY.expires || !Number.isSafeInteger(now) || now <= Date.parse(RETIRED_KEY.expires)) fail();
  const der = base64(rows[0].key, 1024), key = createPublicKey({ key: der, format: "der", type: "spki" });
  if (digest(der) !== RETIRED_KEY.spkiSha256 || key.asymmetricKeyType !== "ec" || key.asymmetricKeyDetails?.namedCurve !== "prime256v1") fail();
  const report = Object.freeze({ retiredKeyPresentInOfficialKeySet: true, keyExpiredAtObservation: true,
    keySpkiSha256: RETIRED_KEY.spkiSha256, keyExpiry: RETIRED_KEY.expires,
    currentTrustPolicyChanged: false, trustedSigningTimeVerified: false });
  proofs.set(report, key); return report;
}

export function verifyRetiredRuntimeSignature(target, metadata, integrity, proof) {
  if (!object(target)) fail(); const { name, version } = target;
  if (!RETIRED_TARGETS.some(p => p.name === name && p.version === version) ||
      !/^sha512-[A-Za-z0-9+/]{86}==$/.test(integrity ?? "") || metadata?.name !== name || metadata?.version !== version ||
      metadata?.dist?.integrity !== integrity || metadata?.dist?.tarball !== `https://registry.npmjs.org/${name}/-/${name}-${version}.tgz`) fail();
  const key = proofs.get(proof), signatures = metadata.dist.signatures;
  if (!key || !Array.isArray(signatures) || signatures.length !== 1 || !object(signatures[0]) ||
      Object.keys(signatures[0]).sort().join(",") !== "keyid,sig" || signatures[0].keyid !== RETIRED_KEY.keyId ||
      !verify("sha256", Buffer.from(`${name}@${version}:${integrity}`), key, base64(signatures[0].sig, 256))) fail();
  return { name, version, retiredKeySignatureEquationVerified: true,
    signedIdentityAndIntegrityMatched: true, trustedSigningTimeVerified: false, currentPolicyRegistrySignatureVerified: false,
    publisherSignatureVerified: false, sourceCommitVerified: false, buildProvenanceVerified: false, readyForPublication: false };
}

async function readPublicMetadata(url, fetcher, signal, budget) {
  const allowed = [KEYS_URL, ...RETIRED_TARGETS.map(p => `https://registry.npmjs.org/${p.name}/${p.version}`)];
  if (!allowed.includes(url) || ++budget.requests > 4) fail();
  const response = await fetcher(url, { method: "GET", signal, redirect: "error", credentials: "omit", referrerPolicy: "no-referrer", headers: { Accept: "application/json" } });
  const reader = response.body?.getReader();
  try {
    const length = response.headers.get("content-length");
    if (response.status !== 200 || !reader || response.url && response.url !== url ||
        !/^application\/json(?:\s*;|$)/i.test(response.headers.get("content-type") ?? "") ||
        length !== null && (!/^[0-9]+$/.test(length) || Number(length) > 100000)) fail();
    const parts = []; let bytes = 0, chunks = 0;
    for (;;) {
      const part = await reader.read(); signal.throwIfAborted(); if (part.done) break;
      bytes += part.value.byteLength; budget.bytes += part.value.byteLength;
      if (++chunks > 4096 || bytes > 100000 || budget.bytes > 320000) fail(); parts.push(Buffer.from(part.value));
    }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(Buffer.concat(parts)));
  } finally { await reader?.cancel(); }
}

export async function collectRetiredRuntimeSignatures(root = process.cwd(), fetcher = fetch) {
  try {
  const before = readLocalDependencyLock(root); if (before.lockfileSha256 !== LOCK) fail();
  const started = performance.now(), signal = AbortSignal.timeout(30000), budget = { requests: 0, bytes: 0 };
  const key = observeRetiredRegistryKey(await readPublicMetadata(KEYS_URL, fetcher, signal, budget));
  const results = [];
  for (const target of RETIRED_TARGETS) {
    const integrity = before.lock.packages?.[`${target.name}@${target.version}`]?.resolution?.integrity;
    const metadata = await readPublicMetadata(`https://registry.npmjs.org/${target.name}/${target.version}`, fetcher, signal, budget);
    results.push(verifyRetiredRuntimeSignature(target, metadata, integrity, key));
  }
  if (readLocalDependencyLock(root).lockfileSha256 !== before.lockfileSha256 || performance.now() - started >= 30000) fail();
  return { mode: "fixed-retired-runtime-signature-observation", publicRegistryRequests: budget.requests, metadataBytes: budget.bytes,
    lockfileSha256: LOCK, awsCalls: 0, filesWritten: 0, packagesInstalled: 0, archivesFetched: 0, uploaded: false, key, results,
    currentTrustPolicyChanged: false, allCurrentPolicySignaturesVerified: false, trustedSigningTimeVerified: false,
    applicableLegalObligationsVerified: false, readyForPublication: false };
  } catch { return fail(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (!args.length) console.log(JSON.stringify(retiredSignaturePlan()));
    else { if (args.length !== 1 || args[0] !== "--execute-fixed-public-metadata") fail(); console.log(JSON.stringify(await collectRetiredRuntimeSignatures())); }
  } catch { console.error(JSON.stringify({ error: "RETIRED_SIGNATURE_OBSERVATION_INCOMPLETE", rawDetailsSuppressed: true,
    currentTrustPolicyChanged: false, readyForPublication: false })); process.exitCode = 1; }
}
