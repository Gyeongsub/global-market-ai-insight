import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { collectBackendModuleProof } from "./backend-module-proof.mjs";
import { collectProductionPackageGraph } from "./check-production-licenses.mjs";
import { readRuntimeNoticeDocuments } from "./runtime-attribution.mjs";
const identity = value => `${value.name}@${value.version}`;
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const fail = () => { throw new Error("BACKEND_NOTICE_INVENTORY_INCOMPLETE"); };

/** Presence/hashes linked to emitted modules, never legal approval or text copying. */
export function evaluateBackendNoticeInventory(emitted, documents) {
  try {
    if (emitted?.mode !== "local-backend-emitted-module-proof" || emitted.filesWritten !== 0 || !Array.isArray(emitted.reports) ||
        emitted.reports.length !== 4 || !Array.isArray(documents) || documents.length > 200) fail();
    const names = new Set(), byIdentity = new Map(), gaps = [], totals = [];
    for (const doc of documents) {
      if (!object(doc) || Object.keys(doc).some(key => !["name", "version", "state", "documents"].includes(key)) ||
          !/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(doc.name) || !/^\d+\.\d+\.\d+$/.test(doc.version) ||
          !["documents-available", "root-license-missing"].includes(doc.state) || !Array.isArray(doc.documents) || doc.documents.length > 16 || byIdentity.has(identity(doc))) fail();
      for (const value of doc.documents) {
        if (!object(value) || Object.keys(value).some(key => !["name", "bytes", "sha256"].includes(key)) ||
            !/^(?:LICEN[CS]E|COPYING|COPYRIGHT|NOTICE)(?:[._-][A-Za-z0-9._-]{1,48})?$/i.test(value.name) ||
            !Number.isSafeInteger(value.bytes) || value.bytes < 1 || value.bytes > 500_000 || !/^[a-f0-9]{64}$/.test(value.sha256)) fail();
      }
      const licensePresent = doc.documents.some(file => /^(?:LICEN[CS]E|COPYING)(?:[._-]|$)/i.test(file.name));
      if ((doc.state === "documents-available") !== licensePresent || doc.state === "root-license-missing" && doc.documents.length !== 0) fail();
      byIdentity.set(identity(doc), doc);
    }
    const used = new Set();
    for (const report of emitted.reports) {
      if (!["controller", "worker", "sweeper", "alarm-circuit"].includes(report.service) || names.has(report.service) ||
          report.inMemoryRebuildMatchedWrittenArtifact !== true || report.inputsBracketedFinalRebuild !== true || !Array.isArray(report.packages) || report.packages.length > 200 ||
          !/^[a-f0-9]{64}$/.test(report.artifactSha256)) fail();
      names.add(report.service); const packages = new Set(); let missing = 0;
      for (const pkg of report.packages) {
        const key = identity(pkg), doc = byIdentity.get(key);
        if (!doc || packages.has(key)) fail(); packages.add(key); used.add(key);
        if (doc.state === "root-license-missing") { missing++; gaps.push({ service: report.service, name: doc.name, version: doc.version, issue: "upstream-root-license-not-provided" }); }
      }
      totals.push({ service: report.service, artifactSha256: report.artifactSha256, emittedPackages: packages.size,
        packagesWithRootLicense: packages.size - missing, missingRootLicenses: missing });
    }
    if (used.size !== byIdentity.size) fail();
    return { mode: "local-emitted-backend-notice-inventory", awsCalls: 0, externalNetworkCalls: 0, filesWritten: 0,
      services: totals, uniqueEmittedPackages: used.size, documents,
      missingPackageLicenseIdentities: [...new Set(gaps.map(row => `${row.name}@${row.version}`))].length, gaps,
      upstreamCopyrightEmailsPreserved: true, missingRootLicenseIsLegalViolation: false,
      generatedHelperAndBannerReviewRequired: true, fullOsAndDevelopmentLicensesCovered: false,
      bundledDistributedNoticesComplete: false, legalApprovalGranted: false, readyForPublication: false };
  } catch { fail(); }
}

export async function collectBackendNoticeInventory(root = process.cwd()) {
  const emitted = await collectBackendModuleProof(root), packages = await collectProductionPackageGraph(root);
  const used = new Set(emitted.reports.flatMap(report => report.packages.map(identity))), store = realpathSync(resolve(root, "node_modules/.pnpm"));
  const documents = [];
  for (const key of [...used].sort()) {
    const matches = packages.filter(pkg => identity(pkg) === key); if (matches.length !== 1) fail(); const pkg = matches[0];
    try {
      const docs = readRuntimeNoticeDocuments(pkg.directory, store);
      documents.push({ name: pkg.name, version: pkg.version, state: "documents-available", documents: docs.map(({ text: _text, ...report }) => report) });
    } catch (error) {
      if (error?.message !== "ATTRIBUTION_LICENSE_DOCUMENT_MISSING") fail();
      documents.push({ name: pkg.name, version: pkg.version, state: "root-license-missing", documents: [] });
    }
  }
  return evaluateBackendNoticeInventory(emitted, documents);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { if (process.argv.length !== 2) fail(); console.log(JSON.stringify(await collectBackendNoticeInventory())); }
  catch { console.error(JSON.stringify({ error: "BACKEND_NOTICE_INVENTORY_INCOMPLETE", privateDetailsSuppressed: true, filesWritten: 0, readyForPublication: false })); process.exitCode = 1; }
}
