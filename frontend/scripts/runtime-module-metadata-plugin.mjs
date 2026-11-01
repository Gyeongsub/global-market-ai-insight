import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { collectProductionPackageGraph } from "../../scripts/check-production-licenses.mjs";
import { collectRuntimeAttribution } from "../../scripts/runtime-attribution.mjs";
import { FRONTEND_HELPER_PRODUCERS, collectFrontendHelperProducers } from "../../scripts/frontend-helper-attribution.mjs";

const digest = bytes => createHash("sha256").update(bytes).digest("hex");
function within(root, path) {
  const offset = relative(resolve(root), resolve(path));
  return offset !== "" && offset !== ".." && !isAbsolute(offset) && !offset.startsWith(`..${sep}`);
}

/** Counts metadata, never emits absolute module IDs, source code or source maps. */
export function summarizeEmittedModules(bundle, frontendRoot, packages) {
  try {
    if (!bundle || typeof bundle !== "object" || !Array.isArray(packages) || packages.length > 200) throw new Error();
    const chunks = [], seen = new Set(), included = new Map();
    const categories = { frontendSource: 0, sharedContractSource: 0, lockedRuntimePackage: 0, virtualGenerated: 0, unclassified: 0 };
    // The contract-driven fixture UI now imports these six first-party modules.
    // This is origin categorization only, never source/native/legal attestation.
    // Do not classify the whole repository or arbitrary shared paths as reviewed.
    const contractSources = new Set(["strict-json.ts", "result-validation.ts", "disclaimer.ts", "error.schema.json",
      "price-result.schema.json", "analysis-result.schema.json"].map(name => resolve(frontendRoot, "../shared/schemas", name)));
    for (const chunk of Object.values(bundle)) {
      if (chunk?.type !== "chunk") continue;
      if (typeof chunk.fileName !== "string" || !/^assets\/[A-Za-z0-9_-]+-[A-Za-z0-9_-]{8,}\.js$/.test(chunk.fileName)
        || typeof chunk.code !== "string" || !chunk.modules || typeof chunk.modules !== "object" || Array.isArray(chunk.modules)) throw new Error();
      const bytes = Buffer.byteLength(chunk.code);
      if (bytes < 1 || bytes > 5_000_000 || chunks.length >= 32) throw new Error();
      chunks.push({ key: chunk.fileName, bytes, sha256: digest(chunk.code) });
      for (const id of Object.keys(chunk.modules)) {
        if (typeof id !== "string" || id.length < 1 || id.length > 8192 || seen.size >= 2000) throw new Error();
        if (seen.has(id)) continue;
        seen.add(id);
        if (id.startsWith(String.fromCharCode(0))) { categories.virtualGenerated += 1; continue; }
        const path = id.split("?")[0];
        if (!isAbsolute(path)) { categories.unclassified += 1; continue; }
        const pkg = packages.find(candidate => within(candidate.directory, path));
        if (pkg) {
          if (!/^(@[a-z0-9._-]+\/)?[a-z0-9._-]+$/.test(pkg.name) || !/^\d+\.\d+\.\d+$/.test(pkg.version)
            || !["MIT", "Apache-2.0", "0BSD"].includes(pkg.license)) throw new Error();
          const key = `${pkg.name}@${pkg.version}`;
          const row = included.get(key) ?? { name: pkg.name, version: pkg.version, license: pkg.license, modules: 0 };
          row.modules += 1; included.set(key, row); categories.lockedRuntimePackage += 1;
        } else if (within(resolve(frontendRoot, "src"), path) || resolve(path) === resolve(frontendRoot, "index.html")) {
          categories.frontendSource += 1;
        } else if (contractSources.has(resolve(path))) categories.sharedContractSource += 1;
        else categories.unclassified += 1;
      }
    }
    if (chunks.length === 0 || seen.size === 0) throw new Error();
    return { mode: "local-emitted-module-metadata", awsCalls: 0, externalNetworkCalls: 0,
      chunks: chunks.sort((a, b) => a.key.localeCompare(b.key)), modules: seen.size, categories,
      runtimePackages: [...included.values()].sort((a, b) => a.name.localeCompare(b.name)),
      absoluteModuleIdsPrinted: false, sourceMapCreated: false, completeAttributionVerified: false,
      generatedHelperReviewRequired: categories.virtualGenerated > 0, unclassifiedModuleReviewRequired: categories.unclassified > 0,
      legalReviewApproved: false, publicationPerformed: false };
  } catch { throw new Error("EMITTED_MODULE_METADATA_INCOMPLETE"); }
}

export function runtimeModuleMetadataPlugin(root = fileURLToPath(new URL("../../", import.meta.url))) {
  let packages, helperProducers, helperMetadata;
  return {
    name: "runtime-module-metadata", apply: "build", enforce: "post",
    async buildStart() {
      try {
        const expected = await collectRuntimeAttribution(root, "frontend");
        packages = await collectProductionPackageGraph(root, "frontend");
        helperProducers = collectFrontendHelperProducers(root).report;
        if (packages.length !== expected.report.runtimePackages || packages.some(pkg =>
          !expected.report.packages.some(row => row.name === pkg.name && row.version === pkg.version && row.license === pkg.license))) throw new Error();
      } catch { throw new Error("EMITTED_MODULE_METADATA_INCOMPLETE"); }
    },
    generateBundle(_options, bundle) {
      helperMetadata = summarizeGeneratedHelpers(bundle, id => this.getModuleInfo(id), helperProducers);
    },
    writeBundle(_options, bundle) {
      const report = summarizeEmittedModules(bundle, resolve(root, "frontend"), packages);
      const finalHelpers = summarizeGeneratedHelpers(bundle, id => this.getModuleInfo(id), helperProducers);
      if (!helperMetadata || report.categories.virtualGenerated !== helperMetadata.helpers.length ||
          JSON.stringify(finalHelpers) !== JSON.stringify(helperMetadata)) {
        throw new Error("GENERATED_HELPER_METADATA_INCOMPLETE");
      }
      verifyWrittenModuleChunks(root, report.chunks);
      console.log(JSON.stringify({ ...report, writtenChunkBytesMatched: true, generatedHelpers: helperMetadata }));
    },
  };
}

const HELPER_IDENTITIES = Object.freeze([
  { id: "\0rolldown/runtime.js", label: "rolldown-runtime", sourceRequired: false, producers: ["rolldown"] },
  { id: "\0vite/modulepreload-polyfill.js", label: "vite-modulepreload-polyfill", sourceRequired: true, producers: ["vite", "rolldown"] },
]);

/** Hash only two observed generated modules, never print their code or module paths. */
export function summarizeGeneratedHelpers(bundle, getInfo, producerReport) {
  try {
    if (!bundle || typeof bundle !== "object" || typeof getInfo !== "function" ||
        producerReport?.mode !== "local-frontend-helper-producer-notices" || producerReport?.awsCalls !== 0 ||
        producerReport?.networkCalls !== 0 || producerReport?.producerPackages !== 2 ||
        producerReport?.documentBytesPreserved !== true || producerReport?.readyForPublication !== false ||
        !/^[a-f0-9]{64}$/.test(producerReport?.lockfileSha256 ?? "") || !Array.isArray(producerReport.producers) ||
        producerReport.producers.length !== 2) throw new Error();
    const producers = FRONTEND_HELPER_PRODUCERS.map(expected => {
      const matches = producerReport.producers.filter(row => row?.name === expected.name);
      const row = matches[0];
      if (matches.length !== 1 || row.version !== expected.version || !/^[a-f0-9]{64}$/.test(row.manifestSha256 ?? "") ||
          !Array.isArray(row.documents) || row.documents.length !== expected.documents.length) throw new Error();
      const documents = expected.documents.map(doc => {
        const matched = row.documents.filter(entry => entry?.name === doc.name);
        if (matched.length !== 1 || matched[0].bytes !== doc.bytes || matched[0].sha256 !== doc.sha256) throw new Error();
        return { name: doc.name, bytes: doc.bytes, sha256: doc.sha256 };
      });
      return { name: expected.name, version: expected.version, manifestSha256: row.manifestSha256, documents };
    });
    if (Object.keys(bundle).length > 64) throw new Error();
    const copies = new Map();
    for (const chunk of Object.values(bundle)) {
      if (chunk?.type !== "chunk") continue;
      if (typeof chunk.fileName !== "string" || !/^assets\/[A-Za-z0-9_-]+-[A-Za-z0-9_-]{8,}\.js$/.test(chunk.fileName) ||
          !chunk.modules || typeof chunk.modules !== "object" || Array.isArray(chunk.modules) || Object.keys(chunk.modules).length > 2000) throw new Error();
      for (const [id, entry] of Object.entries(chunk.modules)) {
        if (!id.startsWith("\0")) continue;
        const known = HELPER_IDENTITIES.find(helper => helper.id === id);
        if (!known || typeof entry?.code !== "string" || entry.code.length < 1 || Buffer.byteLength(entry.code) > 20_000 ||
            entry.renderedLength !== entry.code.length) throw new Error();
        const prior = copies.get(id);
        if (prior && prior.renderedSha256 !== digest(entry.code)) throw new Error();
        const source = getInfo(id)?.code;
        if ((known.sourceRequired && typeof source !== "string") ||
            (source != null && (typeof source !== "string" || source.length < 1 || Buffer.byteLength(source) > 20_000))) throw new Error();
        const row = { helper: known.label, producerPackages: known.producers,
          renderedBytes: Buffer.byteLength(entry.code), renderedSha256: digest(entry.code),
          sourceBytes: typeof source === "string" ? Buffer.byteLength(source) : null,
          sourceSha256: typeof source === "string" ? digest(source) : null,
          sourceMetadataPresent: typeof source === "string", containingChunks: [...(prior?.containingChunks ?? []), chunk.fileName] };
        if (prior && (prior.sourceBytes !== row.sourceBytes || prior.sourceSha256 !== row.sourceSha256)) throw new Error();
        copies.set(id, row);
      }
    }
    if (copies.size !== HELPER_IDENTITIES.length) throw new Error();
    return { mode: "local-generated-helper-byte-metadata", awsCalls: 0, externalNetworkCalls: 0,
      lockfileSha256: producerReport.lockfileSha256,
      producers,
      helpers: [...copies.values()].sort((a, b) => a.helper.localeCompare(b.helper)),
      exactGeneratedSourceOriginVerified: false, installedProducerCodeBytesVerified: false,
      nativeCompilerOriginReviewRequired: true, completeLegalProvenanceVerified: false,
      sourceCodePrinted: false, absoluteModuleIdsPrinted: false, uploaded: false, readyForPublication: false };
  } catch { throw new Error("GENERATED_HELPER_METADATA_INCOMPLETE"); }
}

/** Only fixed current JS artifacts may be read; no caller-selected source-file access. */
export function verifyWrittenModuleChunks(root, chunks) {
  try {
    if (!Array.isArray(chunks) || chunks.length === 0 || chunks.length > 32) throw new Error();
    const frontend = resolve(root, "frontend"), dist = resolve(frontend, "dist"), assets = resolve(dist, "assets");
    for (const path of [frontend, dist, assets]) {
      const stat = lstatSync(path);
      if (!stat.isDirectory() || stat.isSymbolicLink() || realpathSync(path) !== path) throw new Error();
    }
    for (const chunk of chunks) {
      if (!/^assets\/[A-Za-z0-9_-]+-[A-Za-z0-9_-]{8,}\.js$/.test(chunk?.key) || !Number.isInteger(chunk.bytes)
        || chunk.bytes < 1 || chunk.bytes > 5_000_000 || !/^[a-f0-9]{64}$/.test(chunk.sha256)) throw new Error();
      const path = resolve(dist, chunk.key), stat = lstatSync(path);
      if (!stat.isFile() || stat.isSymbolicLink() || realpathSync(path) !== path || stat.size !== chunk.bytes) throw new Error();
      if (digest(readFileSync(path)) !== chunk.sha256) throw new Error();
    }
  } catch { throw new Error("WRITTEN_MODULE_BYTES_INCOMPLETE"); }
}
