import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { FRONTEND_HELPER_PRODUCERS, collectFrontendHelperProducers } from "./frontend-helper-attribution.mjs";
import { inspectPinnedPackageArchive } from "./pinned-package-archive.mjs";

const fail = () => { throw new Error("PUBLISHED_HELPER_PROOF_INVALID"); };
const targetKnown = target => FRONTEND_HELPER_PRODUCERS.includes(target);
const utf8 = bytes => new TextDecoder("utf-8", { fatal: true }).decode(bytes);
const tarballUrl = target => `https://registry.npmjs.org/${target.name}/-/${target.name}-${target.version}.tgz`;

export function verifyHelperPublishedMetadata(target, metadata, integrity) {
  if (!targetKnown(target) || metadata?.name !== target.name || metadata?.version !== target.version ||
      metadata?.license !== target.license || metadata?.repository?.url !== target.repository ||
      metadata?.dist?.tarball !== tarballUrl(target) || metadata?.dist?.integrity !== integrity ||
      !/^sha512-[A-Za-z0-9+/]{86}==$/.test(integrity ?? "")) fail();
}

/** Whole lock-integrity-matched notices; no guessed generated-source license mapping. */
export function inspectPublishedHelperArchive(target, compressed, integrity, local) {
  if (!targetKnown(target) || local?.name !== target.name || local?.version !== target.version) fail();
  const archive = inspectPinnedPackageArchive(target, compressed, integrity, "frontend-helper");
  if (archive.manifest?.repository?.url !== target.repository || archive.manifestBytes !== local.manifestBytes ||
      archive.manifestSha256 !== local.manifestSha256 || archive.rootDocuments.length !== target.documents.length) fail();
  for (const expected of target.documents) {
    const entries = archive.rootDocuments.filter(doc => doc.name === expected.name);
    const installed = local.documents?.filter(doc => doc.name === expected.name);
    if (entries.length !== 1 || installed?.length !== 1 || entries[0].bytes !== expected.bytes || entries[0].sha256 !== expected.sha256 ||
        installed[0].bytes !== expected.bytes || installed[0].sha256 !== expected.sha256) fail();
  }
  return { name: target.name, version: target.version, tarballSha256: archive.tarballSha256,
    lockedIntegrityMatched: true, installedManifestBytesMatched: true, installedNoticeBytesMatched: true,
    filesInspected: archive.filesInspected, rootDocuments: archive.rootDocuments,
    archiveExtracted: false, installedPackageModified: false, installedProducerCodeBytesVerified: false,
    exactGeneratedHelperSourceOriginVerified: false, legalApproval: false, readyForPublication: false };
}

/** Only four fixed public reads. No caller host/path/auth headers/redirects. */
export async function fetchFrontendHelperBytes(target, kind, fetcher = fetch) {
  if (!targetKnown(target) || !["metadata", "tarball"].includes(kind)) fail();
  const url = kind === "metadata" ? `https://registry.npmjs.org/${target.name}/${target.version}` : tarballUrl(target);
  const maximum = kind === "metadata" ? 100_000 : 5_000_000;
  const response = await fetcher(url, { redirect: "error", signal: AbortSignal.timeout(20_000),
    credentials: "omit", referrerPolicy: "no-referrer", headers: { Accept: "application/json, application/octet-stream" } });
  const reader = response.body?.getReader(), chunks = []; let size = 0;
  try {
    if (response.status !== 200 || !reader || (response.url && response.url !== url)) fail();
    const declared = response.headers.get("content-length");
    if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > maximum)) fail();
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength; if (size > maximum) fail(); chunks.push(Buffer.from(value));
    }
  } finally { await reader?.cancel(); }
  if (size < 1) fail();
  return Buffer.concat(chunks);
}

export async function collectPublishedHelperProof(root = process.cwd(), fetcher = fetch) {
  const local = collectFrontendHelperProducers(root).report, results = [];
  for (const target of FRONTEND_HELPER_PRODUCERS) {
    const installed = local.producers.find(row => row.name === target.name), integrity = installed.lockedIntegrity;
    const metadata = JSON.parse(utf8(await fetchFrontendHelperBytes(target, "metadata", fetcher)));
    verifyHelperPublishedMetadata(target, metadata, integrity);
    results.push(inspectPublishedHelperArchive(target, await fetchFrontendHelperBytes(target, "tarball", fetcher), integrity, installed));
  }
  return { mode: "published-frontend-helper-notice-proof", awsCalls: 0, publicRegistryRequests: 4,
    lockfileSha256: local.lockfileSha256, filesWritten: 0, packagesInstalled: 0, uploaded: false, results,
    nativeCompilerOriginReviewRequired: true, legalApproval: false, readyForPublication: false };
}

if (import.meta.url === (process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "")) {
  try {
    const args = process.argv.slice(2);
    if (args.length === 0) console.log(JSON.stringify({ mode: "dry-run", awsCalls: 0, publicRegistryRequests: 0,
      requestedRegistryReadsMax: 4, targets: FRONTEND_HELPER_PRODUCERS.map(({ name, version }) => ({ name, version })),
      filesWritten: 0, packagesInstalled: 0, uploaded: false, readyForPublication: false }));
    else {
      if (args.length !== 1 || args[0] !== "--execute-public-metadata") fail();
      console.log(JSON.stringify(await collectPublishedHelperProof()));
    }
  } catch { console.error(JSON.stringify({ error: "PUBLISHED_HELPER_PROOF_INCOMPLETE", rawDetailsSuppressed: true,
    uploaded: false, readyForPublication: false })); process.exitCode = 1; }
}
