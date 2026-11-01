import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { readLocalDependencyLock } from "./dependency-license-inventory.mjs";
import { collectRuntimeAttribution, readRuntimeNoticeDocuments, validateRuntimeAttributionText } from "./runtime-attribution.mjs";

// Exact currently reviewed producer documents. A tool/version/document change
// must be reviewed, not silently accepted as complete generated-code provenance.
export const FRONTEND_HELPER_PRODUCERS = Object.freeze([
  Object.freeze({ name: "vite", version: "8.2.4", license: "MIT", repository: "git+https://github.com/vitejs/vite.git",
    documents: Object.freeze([Object.freeze({ name: "LICENSE.md", bytes: 112425,
      sha256: "387dd7baa307083401a27c58c362c30832f5ba1dba84f10cc22c33401523f45c" })]) }),
  Object.freeze({ name: "rolldown", version: "1.2.14", license: "MIT", repository: "git+https://github.com/rolldown/rolldown.git",
    documents: Object.freeze([
      Object.freeze({ name: "LICENSE", bytes: 1302, sha256: "23ecfff35a5a2e80d92142f75228912c3b1abc4b5a8337a821ff4397e2f9f734" }),
      Object.freeze({ name: "THIRD-PARTY-LICENSE", bytes: 2209, sha256: "a877291d800ed43692f3f9ae09d8e01cc6f7293ad39d43896059c188ffbb8b7c" }),
    ]) }),
]);
const fail = () => { throw new Error("FRONTEND_HELPER_ATTRIBUTION_INCOMPLETE"); };
const hash = value => createHash("sha256").update(value).digest("hex");
const plainVersion = value => typeof value === "string" ? value.split("(")[0] : null;
function inside(root, path) {
  const offset = relative(root, path);
  return offset !== "" && offset !== ".." && !isAbsolute(offset) && !offset.startsWith(`..${sep}`);
}

/** Only pre-reviewed names and whole unmodified document bytes may be copied. */
export function verifyHelperProducerDocuments(target, documents) {
  if (!FRONTEND_HELPER_PRODUCERS.includes(target) || !Array.isArray(documents) || documents.length !== target.documents.length) fail();
  for (const expected of target.documents) {
    const selected = documents.filter(doc => doc?.name === expected.name);
    if (selected.length !== 1 || selected[0].bytes !== expected.bytes || selected[0].sha256 !== expected.sha256 ||
        typeof selected[0].text !== "string" || Buffer.byteLength(selected[0].text) !== expected.bytes ||
        hash(selected[0].text) !== expected.sha256) fail();
  }
}

/** No network, installation, code execution or request-selected filesystem path. */
export function collectFrontendHelperProducers(root = process.cwd()) {
  try {
    const physicalRoot = realpathSync(root), store = realpathSync(join(physicalRoot, "node_modules", ".pnpm"));
    if (!inside(physicalRoot, store)) fail();
    const frontend = join(physicalRoot, "frontend");
    if (lstatSync(frontend).isSymbolicLink() || realpathSync(frontend) !== frontend) fail();
    const { lock, lockfileSha256 } = readLocalDependencyLock(physicalRoot);
    const declared = JSON.parse(readFileSync(join(frontend, "package.json"), "utf8"));
    const pinned = lock.importers?.frontend?.devDependencies?.vite;
    if (declared?.devDependencies?.vite !== "8.2.4" || pinned?.specifier !== "8.2.4" || plainVersion(pinned?.version) !== "8.2.4") fail();
    const requireFrontend = createRequire(join(frontend, "package.json"));
    const viteManifest = requireFrontend.resolve("vite/package.json");
    const manifests = [viteManifest, createRequire(viteManifest).resolve("rolldown/package.json")];
    const producerRows = [], blocks = [];
    for (let index = 0; index < FRONTEND_HELPER_PRODUCERS.length; index++) {
      const target = FRONTEND_HELPER_PRODUCERS[index], path = manifests[index], directory = dirname(path);
      const stat = lstatSync(path);
      if (!inside(store, path) || !stat.isFile() || stat.isSymbolicLink() || stat.size < 1 || stat.size > 100_000 ||
          realpathSync(path) !== path || lstatSync(directory).isSymbolicLink() || realpathSync(directory) !== directory) fail();
      const bytes = readFileSync(path), manifest = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
      const locked = lock.packages?.[`${target.name}@${target.version}`];
      if (manifest?.name !== target.name || manifest?.version !== target.version || manifest?.license !== target.license ||
          manifest?.repository?.url !== target.repository || !/^sha512-[A-Za-z0-9+/]{86}==$/.test(locked?.resolution?.integrity ?? "")) fail();
      if (index === 0 && !Object.entries(lock.snapshots ?? {}).some(([key, value]) =>
        plainVersion(key) === "vite@8.2.4" && plainVersion(value?.dependencies?.rolldown) === "1.2.14")) fail();
      const documents = readRuntimeNoticeDocuments(directory, store, target.name === "rolldown" ? ["THIRD-PARTY-LICENSE"] : []);
      verifyHelperProducerDocuments(target, documents);
      producerRows.push({ name: target.name, version: target.version, license: target.license,
        manifestBytes: bytes.length, manifestSha256: hash(bytes), lockedIntegrity: locked.resolution.integrity,
        documents: documents.map(({ text: _text, ...doc }) => doc) });
      blocks.push(`\n===== build-helper producer ${target.name}@${target.version} (${target.license}) =====\n`);
      for (const doc of documents) blocks.push(`\n--- ${doc.name} ---\n`, doc.text, "\n");
    }
    return { text: blocks.join(""), report: { mode: "local-frontend-helper-producer-notices", awsCalls: 0, networkCalls: 0,
      lockfileSha256, producerPackages: producerRows.length, producers: producerRows, documentBytesPreserved: true,
      exactGeneratedHelperSourceOriginVerified: false, nativeCompilerOriginReviewRequired: true,
      completeLegalProvenanceVerified: false, uploaded: false, readyForPublication: false } };
  } catch { fail(); }
}

/** Conservative runtime AND producer notices, not a claim every producer file is emitted. */
export async function collectFrontendAttribution(root = process.cwd()) {
  const runtime = await collectRuntimeAttribution(root, "frontend"), helpers = collectFrontendHelperProducers(root);
  if (runtime.report.lockfileSha256 !== helpers.report.lockfileSha256) fail();
  const text = `${runtime.text}\nConservative build-generated helper producer notices follow.\n` +
    "These whole upstream documents do not prove exact native/generated source origin or grant publication approval.\n" + helpers.text;
  validateRuntimeAttributionText(text);
  return { text, report: { ...runtime.report, artifactBytes: Buffer.byteLength(text), artifactSha256: hash(text),
    buildHelperProducers: helpers.report, generatedHelperSourceReviewRequired: true } };
}

if (import.meta.url === (process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "")) {
  try {
    if (process.argv.length !== 2) fail();
    console.log(JSON.stringify((await collectFrontendAttribution()).report));
  } catch { console.error(JSON.stringify({ error: "FRONTEND_HELPER_ATTRIBUTION_INCOMPLETE", rawDetailsSuppressed: true,
    awsCalls: 0, networkCalls: 0, uploaded: false, readyForPublication: false })); process.exitCode = 1; }
}
