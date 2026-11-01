import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { readLocalDependencyLock } from "./dependency-license-inventory.mjs";
import { inspectPinnedPackageArchive } from "./pinned-package-archive.mjs";

export const PUBLISHED_LICENSE_TARGETS = Object.freeze([
  Object.freeze({ name: "@aws-sdk/credential-provider-http", version: "3.972.72" }),
  Object.freeze({ name: "@aws-sdk/credential-provider-login", version: "3.972.77" }),
  Object.freeze({ name: "@aws-sdk/nested-clients", version: "3.997.44" }),
]);
const fail = () => { throw new Error("PUBLISHED_PACKAGE_PROOF_INVALID"); };
const utf8 = bytes => new TextDecoder("utf-8", { fatal: true }).decode(bytes);
const identity = value => PUBLISHED_LICENSE_TARGETS.some(t => value?.name === t.name && value?.version === t.version);
const canonicalTarball = target => `https://registry.npmjs.org/${target.name}/-/${target.name.split("/")[1]}-${target.version}.tgz`;

export function verifyPublishedMetadata(target, metadata, lockedIntegrity) {
  if (!identity(target) || metadata?.name !== target.name || metadata?.version !== target.version || metadata?.license !== "Apache-2.0" ||
      metadata?.repository?.url !== "git+https://github.com/aws/aws-sdk-js-v3.git" ||
      metadata?.dist?.tarball !== canonicalTarball(target) || metadata?.dist?.integrity !== lockedIntegrity ||
      !/^sha512-[A-Za-z0-9+/]{86}==$/.test(lockedIntegrity ?? "")) fail();
  return { tarball: canonicalTarball(target), integrity: lockedIntegrity };
}

/** Inspect the integrity-matched tar in memory. Never extract paths, install or execute its code. */
export function inspectPublishedArchive(target, compressed, integrity) {
  if (!identity(target)) fail();
  const archive = inspectPinnedPackageArchive({ ...target, license: "Apache-2.0" }, compressed, integrity, "aws-sdk");
  const documents = archive.rootDocuments;
  return { name: target.name, version: target.version, tarballSha256: archive.tarballSha256, lockedIntegrityMatched: true,
    filesInspected: archive.filesInspected, rootDocuments: documents,
    rootLicensePresent: documents.some(doc => /^(?:LICEN[CS]E|COPYING)(?:[._-]|$)/i.test(doc.name)),
    archiveExtracted: false, installedPackageModified: false, completeLegalProvenanceVerified: false, readyForPublication: false };
}

async function boundedPublicFetch(url, maximum, fetcher) {
  const response = await fetcher(url, { redirect: "error", signal: AbortSignal.timeout(20_000),
    credentials: "omit", referrerPolicy: "no-referrer", headers: { Accept: "application/json, application/octet-stream" } });
  const reader = response.body?.getReader();
  const chunks = []; let size = 0;
  try {
    if (response.status !== 200 || !reader || (response.url && response.url !== url)) fail();
    const declared = response.headers.get("content-length");
    if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > maximum)) fail();
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > maximum) fail();
      chunks.push(Buffer.from(value));
    }
  } finally { await reader?.cancel(); }
  if (size < 1) fail();
  return Buffer.concat(chunks);
}

/** No caller-selected hosts, paths, authorization headers or redirect destination. */
export async function fetchPublishedBytes(target, kind, fetcher = fetch) {
  if (!identity(target) || !["metadata", "tarball"].includes(kind)) fail();
  const url = kind === "metadata" ? `https://registry.npmjs.org/${encodeURIComponent(target.name)}/${target.version}` : canonicalTarball(target);
  return boundedPublicFetch(url, kind === "metadata" ? 100_000 : 2_000_000, fetcher);
}

export async function collectPublishedLicenseProof(root = process.cwd(), fetcher = fetch) {
  const { lock, lockfileSha256 } = readLocalDependencyLock(root);
  const results = [];
  for (const target of PUBLISHED_LICENSE_TARGETS) {
    const integrity = lock.packages?.[`${target.name}@${target.version}`]?.resolution?.integrity;
    if (!/^sha512-[A-Za-z0-9+/]{86}==$/.test(integrity ?? "")) fail();
    const metadata = JSON.parse(utf8(await fetchPublishedBytes(target, "metadata", fetcher)));
    const source = verifyPublishedMetadata(target, metadata, integrity);
    results.push(inspectPublishedArchive(target, await fetchPublishedBytes(target, "tarball", fetcher), source.integrity));
  }
  return { mode: "published-package-license-proof", lockfileSha256, awsCalls: 0, publicRegistryRequests: 6,
    publicMetadataOnly: true, filesWritten: 0, packagesInstalled: 0, uploaded: false, results,
    legalApproval: false, readyForPublication: false };
}

if (import.meta.url === (process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "")) {
  try {
    const args = process.argv.slice(2);
    if (args.length === 0) console.log(JSON.stringify({ mode: "dry-run", awsCalls: 0, publicRegistryRequests: 0,
      requestedRegistryReadsMax: 6, targets: PUBLISHED_LICENSE_TARGETS, filesWritten: 0, uploaded: false, readyForPublication: false }));
    else {
      if (args.length !== 1 || args[0] !== "--execute-public-metadata") fail();
      console.log(JSON.stringify(await collectPublishedLicenseProof()));
    }
  } catch { console.error(JSON.stringify({ error: "PUBLISHED_PACKAGE_PROOF_INCOMPLETE", rawDetailsSuppressed: true, uploaded: false, readyForPublication: false })); process.exitCode = 1; }
}
