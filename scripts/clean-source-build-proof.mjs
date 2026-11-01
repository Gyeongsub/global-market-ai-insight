import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { stripVTControlCharacters } from "node:util";
import {
  cpSync,
  copyFileSync,
  constants,
  existsSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
} from "node:fs";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { LOCAL_CHECK_GATE_TIMEOUT_MS, summarizeLocalCheckTimings } from "./local-check-step.mjs";
import { cleanSourceChildEnvironment } from "./local-proof-environment.mjs";
export { cleanSourceChildEnvironment } from "./local-proof-environment.mjs";

const SOURCE_ROOT = resolve(process.cwd());
// Measured whole-gate growth exhausted both the earlier 240s and 360s bounds.
// Keep one fixed ten-minute local-only ceiling; no test is skipped/retried,
// and timeout is still failure. Cloud/operator deadlines are unchanged.
export const LOCAL_GATE_TIMEOUT_MS = LOCAL_CHECK_GATE_TIMEOUT_MS;
const TOP_LEVEL_FILES = new Set([
  ".dockerignore",
  ".env.example",
  ".gitignore",
  "LICENSE",
  "README.md",
  "THIRD_PARTY_NOTICES.md",
  "agent.md",
  "cdk.json",
  "package.json",
  "plan.md",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "tsconfig.services.json",
]);
const SOURCE_DIRECTORIES = ["docs", "frontend", "infrastructure", "scripts", "services", "shared"];
const GENERATED_NAMES = new Set(["node_modules", ".pnpm-store", "dist", "bundle", "cdk.out", "coverage", ".git"]);
const FRONTEND_GENERATED_ROOTS = new Set(["frontend/.next", "frontend/.vinext", "frontend/.wrangler", "frontend/out"]);
const PRIVATE_NAMES = new Set([".aws", ".codex", ".agents", ".tmp", "outputs", "work", ".terraform", "cdk.context.json", ".npmrc", ".yarnrc.yml", ".netrc"]);
const PRIVATE_SUFFIXES = [".pem", ".key", ".p12", ".pfx", ".crt", ".cer", ".der"];

function within(root, path) {
  const rel = relative(root, path);
  return rel === "" || (!isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${sep}`));
}

function safeTemporaryDirectory() {
  const base = resolve(tmpdir());
  const physicalBase = realpathSync(base);
  const directory = resolve(mkdtempSync(join(base, "gmai-clean-source-proof-")));
  assert.ok(safeToRemove(base, directory, physicalBase), "Temporary directory could not be physically verified.");
  return { base, directory, physicalBase };
}

export function safeToRemove(base, directory, expectedPhysicalBase) {
  try {
    const name = basename(directory);
    const rel = relative(resolve(base), resolve(directory));
    if (!expectedPhysicalBase || rel !== name || !/^gmai-clean-source-proof-[A-Za-z0-9]+$/.test(name)) return false;
    const details = lstatSync(directory);
    return details.isDirectory() && !details.isSymbolicLink()
      && realpathSync(base) === expectedPhysicalBase
      && realpathSync(directory) === resolve(expectedPhysicalBase, name);
  } catch { return false; }
}

export function copyFilter(source, sourceRoot = SOURCE_ROOT) {
  const name = basename(source);
  const lowerName = name.toLowerCase();
  const sourceOffset = relative(resolve(sourceRoot), resolve(source)).split(sep).join("/").toLowerCase();
  if (FRONTEND_GENERATED_ROOTS.has(sourceOffset)) return false;
  if (GENERATED_NAMES.has(lowerName) || PRIVATE_NAMES.has(lowerName)) return false;
  if (/\.tfstate(?:\.|$)/i.test(name)) return false;
  if (lowerName === ".env" || (lowerName.startsWith(".env.") && name !== ".env.example")) return false;
  const details = lstatSync(source);
  if (details.isSymbolicLink()) throw new Error("Source symlinks require explicit publication review.");
  if (!within(resolve(sourceRoot), resolve(source)) || !within(realpathSync(sourceRoot), realpathSync(source))) {
    throw new Error("Source escapes the intended publication boundary.");
  }
  if (!details.isFile() && !details.isDirectory()) throw new Error("Source must be a regular file or directory.");
  if (PRIVATE_SUFFIXES.some(suffix => name.toLowerCase().endsWith(suffix))) {
    throw new Error("Private-key file types cannot enter the reproducibility candidate.");
  }
  return true;
}

export function copySources(destination, sourceRoot = SOURCE_ROOT) {
  const selectedRoot = resolve(sourceRoot);
  assert.ok(lstatSync(selectedRoot).isDirectory() && !lstatSync(selectedRoot).isSymbolicLink() && realpathSync(selectedRoot) === selectedRoot,
    "Source copy needs a physical root.");
  for (const file of TOP_LEVEL_FILES) {
    const source = join(selectedRoot, file);
    assert.ok(existsSync(source) && copyFilter(source, selectedRoot) && lstatSync(source).isFile(), `Required source file is missing: ${file}`);
    cpSync(source, join(destination, file));
  }
  for (const directory of SOURCE_DIRECTORIES) {
    const source = join(selectedRoot, directory);
    assert.ok(existsSync(source) && copyFilter(source, selectedRoot) && lstatSync(source).isDirectory(), `Required source directory is missing: ${directory}`);
    cpSync(source, join(destination, directory), { recursive: true, filter: sourcePath => copyFilter(sourcePath, selectedRoot) });
  }
}

function assertNoGeneratedInputs(destination) {
  for (const path of [
    "cdk.out",
    "frontend/dist",
    "frontend/.next", "frontend/.vinext", "frontend/.wrangler", "frontend/out",
    "services/controller/bundle",
    "services/worker/bundle",
    "services/operations/sweeper/bundle",
    "services/operations/alarm_circuit/bundle",
  ]) assert.equal(existsSync(join(destination, path)), false, `Generated input was copied: ${path}`);
}

/** Copy, never hard-link, the current installation; all recreated links stay in the temporary tree. */
export function copyInstalledDependencies(sourceRoot, destination) {
  const source = realpathSync(sourceRoot);
  const target = realpathSync(destination);
  assert.ok(!within(source, target) && !within(target, source), "Dependency copy roots must be disjoint.");
  assert.ok(!lstatSync(destination).isSymbolicLink(), "Dependency output cannot be redirected.");
  const roots = ["node_modules", "frontend/node_modules"].map(name => {
    const original = join(source, name);
    assert.ok(lstatSync(original).isDirectory() && !lstatSync(original).isSymbolicLink() && realpathSync(original) === original,
      "Installed dependency roots must be physical directories.");
    const copied = join(target, name);
    assert.equal(existsSync(copied), false, "Dependency copy requires fresh output directories.");
    return { original, copied };
  });
  const frontend = join(target, "frontend");
  assert.ok(lstatSync(frontend).isDirectory() && !lstatSync(frontend).isSymbolicLink() && realpathSync(frontend) === frontend,
    "Frontend output cannot be redirected.");
  const links = [];
  const counts = { files: 0, bytes: 0, links: 0, unresolvedLinksOmitted: 0 };
  let entries = 0;
  function copyEntry(original, copied, boundary) {
    if (++entries > 120_000) throw new Error("Dependency copy exceeds its entry bound.");
    const details = lstatSync(original);
    if (details.isSymbolicLink()) {
      let physical;
      try { physical = realpathSync(original); }
      catch (error) {
        // Keep the existing installation's incompleteness explicit. Any required
        // missing module still fails the later full gate; no download or repair.
        if (error.code === "ENOENT") { counts.unresolvedLinksOmitted += 1; return; }
        throw error;
      }
      const owner = roots.find(root => within(root.original, physical));
      // pnpm's index can point to the declared frontend workspace package, not
      // just node_modules. Only that exact copied source root is allowed; never
      // map an arbitrary sibling, private folder or outside workspace.
      const frontendSource = join(source, "frontend");
      const workspaceTarget = physical === frontendSource ? frontend : null;
      if (workspaceTarget !== null) {
        const manifest = join(frontendSource, "package.json");
        const copiedManifest = join(frontend, "package.json");
        assert.ok(lstatSync(manifest).isFile() && !lstatSync(manifest).isSymbolicLink() &&
          readFileSync(manifest).equals(readFileSync(copiedManifest)), "Workspace package copy does not match its source.");
      }
      assert.ok(owner || workspaceTarget, "Dependency link escapes the installed roots.");
      assert.ok(statSync(physical).isDirectory(), "Dependency file links require separate review.");
      links.push({ original, copied, physical, rewritten: workspaceTarget ?? join(owner.copied, relative(owner.original, physical)) });
      return;
    }
    assert.ok(within(boundary, realpathSync(original)), "Dependency entry escapes its source root.");
    if (details.isDirectory()) {
      mkdirSync(copied);
      for (const name of readdirSync(original).sort()) copyEntry(join(original, name), join(copied, name), boundary);
    } else {
      assert.ok(details.isFile() && details.size <= 200_000_000, "Dependency entry is not a bounded regular file.");
      counts.files += 1; counts.bytes += details.size;
      assert.ok(counts.files <= 100_000 && counts.bytes <= 2_000_000_000, "Dependency copy exceeds its byte/file bound.");
      copyFileSync(original, copied, constants.COPYFILE_EXCL);
      assert.equal(lstatSync(copied).size, details.size, "Dependency changed during copy.");
    }
  }
  for (const root of roots) copyEntry(root.original, root.copied, root.original);
  for (const link of links) {
    assert.equal(realpathSync(link.original), link.physical, "Dependency link changed during copy.");
    assert.ok(within(target, link.rewritten) && lstatSync(link.rewritten).isDirectory(), "Copied dependency link target is unavailable.");
    symlinkSync(link.rewritten, link.copied, process.platform === "win32" ? "junction" : "dir");
    counts.links += 1;
  }
  return counts;
}

/** Fingerprints the copied, pre-build source snapshot; never includes dependency/generated inputs. */
export function fingerprintCopiedSource(directory) {
  const root = resolve(directory), rootStat = lstatSync(root), hash = createHash("sha256");
  assert.ok(rootStat.isDirectory() && !rootStat.isSymbolicLink(), "Source fingerprint needs a physical directory.");
  let files = 0, bytes = 0;
  function visit(current, prefix = "") {
    const entries = readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    for (const entry of entries) {
      const path = join(current, entry.name), key = prefix + entry.name;
      assert.ok(copyFilter(path, root), "Generated or private inputs cannot enter a source fingerprint.");
      const stat = lstatSync(path);
      if (stat.isDirectory()) { visit(path, key + "/"); continue; }
      assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.size <= 10_000_000, "Source fingerprint input is not a bounded regular file.");
      files += 1; bytes += stat.size;
      assert.ok(files <= 2_000 && bytes <= 64_000_000, "Source fingerprint exceeds the reviewed size boundary.");
      const content = readFileSync(path);
      assert.equal(content.length, stat.size, "Source changed during fingerprinting.");
      // Name framing + byte length + bytes avoid concatenation ambiguity.
      hash.update(JSON.stringify([key, content.length]) + "\n"); hash.update(content);
    }
  }
  visit(root);
  return { files, bytes, sha256: hash.digest("hex") };
}

/** Same publication-candidate scope and framing as the copied-source proof,
 * but excludes generated/private trees in a working directory instead of
 * requiring their absence. It neither copies source nor reads dependencies. */
export function fingerprintCurrentSource(directory = process.cwd()) {
  const root = resolve(directory), rootStat = lstatSync(root);
  assert.ok(rootStat.isDirectory() && !rootStat.isSymbolicLink() && realpathSync(root) === root,
    "Current source needs a physical root.");
  const records = []; let files = 0, bytes = 0, entries = 0;
  function visit(path, key) {
    assert.ok(++entries <= 10_000, "Current source exceeds the entry boundary.");
    if (!copyFilter(path, root)) return;
    const before = lstatSync(path);
    if (before.isDirectory()) {
      for (const name of readdirSync(path).sort()) visit(join(path, name), `${key}/${name}`);
      return;
    }
    assert.ok(before.isFile() && !before.isSymbolicLink() && before.size <= 10_000_000,
      "Current source input is not a bounded regular file.");
    files++; bytes += before.size;
    assert.ok(files <= 2_000 && bytes <= 64_000_000, "Current source exceeds the byte/file boundary.");
    const content = readFileSync(path), after = lstatSync(path);
    assert.ok(after.isFile() && !after.isSymbolicLink() && realpathSync(path) === path &&
      content.length === before.size && after.size === before.size && after.mtimeMs === before.mtimeMs &&
      after.ctimeMs === before.ctimeMs && after.ino === before.ino, "Current source changed during a read.");
    records.push({ key, content });
  }
  for (const file of TOP_LEVEL_FILES) {
    const path = join(root, file);
    assert.ok(lstatSync(path).isFile() && copyFilter(path, root), "Current source is missing a required file.");
  }
  for (const name of SOURCE_DIRECTORIES) {
    const path = join(root, name);
    assert.ok(lstatSync(path).isDirectory() && copyFilter(path, root), "Current source is missing a required directory.");
  }
  // Match recursive copied-tree traversal, including a directory whose name
  // precedes a sibling such as example.md; a flat pathname sort differs there.
  for (const name of [...TOP_LEVEL_FILES, ...SOURCE_DIRECTORIES].sort()) visit(join(root, name), name);
  const hash = createHash("sha256");
  for (const { key, content } of records) {
    hash.update(JSON.stringify([key, content.length]) + "\n"); hash.update(content);
  }
  return { files, bytes, sha256: hash.digest("hex") };
}

/** Only numeric successful test summaries leave the captured child output. */
export function summarizeLocalGateTests(output) {
  const text = stripVTControlCharacters(output);
  const summaries = [];
  const pattern = /^(?:ℹ |# )tests (\d+)\r?\n(?:ℹ |# )suites \d+\r?\n(?:ℹ |# )pass (\d+)\r?\n(?:ℹ |# )fail (\d+)\r?\n(?:ℹ |# )cancelled (\d+)\r?\n(?:ℹ |# )skipped (\d+)\r?\n(?:ℹ |# )todo (\d+)/gm;
  for (const match of text.matchAll(pattern)) {
    const [total, passed, failed, cancelled, skipped, todo] = match.slice(1).map(Number);
    assert.ok([total, passed, failed, cancelled, skipped, todo].every(value => Number.isSafeInteger(value) && value <= 10_000), "Local test summary is invalid.");
    assert.ok(total === passed + skipped && failed === 0 && cancelled === 0 && todo === 0, "Local test summary is incomplete.");
    summaries.push({ total, passed, skipped });
  }
  assert.equal(summaries.length, 4, "Local gate must report all four reviewed test groups.");
  return { groups: summaries.length, total: summaries.reduce((sum, group) => sum + group.total, 0),
    passed: summaries.reduce((sum, group) => sum + group.passed, 0), skipped: summaries.reduce((sum, group) => sum + group.skipped, 0) };
}

export function runCleanSourceBuildProof() {
  const { base, directory, physicalBase } = safeTemporaryDirectory();
  let packet;
  let stage = "source-copy";
  try {
    copySources(directory);
    assertNoGeneratedInputs(directory);
    const sourceFingerprint = fingerprintCopiedSource(directory);
    stage = "dependency-copy";
    const dependencyCopy = copyInstalledDependencies(SOURCE_ROOT, directory);
    const env = cleanSourceChildEnvironment(process.env);
    stage = "full-local-gate";
    const gateStarted = Date.now();
    const result = spawnSync(process.execPath, [join(directory, "scripts", "check-all.mjs")], {
      cwd: directory,
      env,
      encoding: "utf8",
      timeout: LOCAL_GATE_TIMEOUT_MS,
      maxBuffer: 2_000_000,
      windowsHide: true,
    });
    const gateElapsedMs = Date.now() - gateStarted;
    const stepTimings = summarizeLocalCheckTimings(result.stdout);
    if (result.status !== 0) {
      console.error(JSON.stringify({ mode: "local-clean-source-gate-diagnostics", stepTimings,
        timeout: result.error?.code === "ETIMEDOUT", rawDetailsSuppressed: true }));
      const safeSteps = [...`${result.stdout ?? ""}\n${result.stderr ?? ""}`.matchAll(/^\[check\] ([A-Za-z0-9 ()/;-]+)$/gm)];
      const lastStep = safeSteps.at(-1)?.[1] ?? "unknown step";
      throw new Error(`The generated-artifact-free source copy failed during: ${lastStep}.`);
    }
    assert.equal(result.signal, null, "The generated-artifact-free source proof was interrupted.");
    const tests = summarizeLocalGateTests(result.stdout ?? "");
    const localHttpReports = (result.stdout ?? "").split(/\r?\n/).filter(line => line.startsWith('{"mode":"local-http-safety-proof",'));
    assert.equal(localHttpReports.length, 1, "Local HTTP safety evidence must be present exactly once.");
    const localHttp = JSON.parse(localHttpReports[0]);
    assert.ok(localHttp.awsCalls === 0 && localHttp.externalNetworkCalls === 0 && localHttp.serversClosed === true
      && localHttp.temporaryFixtureRetained === false && localHttp.publicationPerformed === false
      && localHttp.developmentAndPreviewPassed === true && localHttp.exactNoticeBytesMatched === true
      && localHttp.fixturePreviewSecurityHeadersMatched === true && localHttp.developmentHmrPolicyUnchanged === true && localHttp.remoteTlsOrHostingVerified === false
      && localHttp.privateSentinelReturned === false && Number.isInteger(localHttp.loopbackHttpRequests)
      && localHttp.loopbackHttpRequests > 0 && localHttp.loopbackHttpRequests <= 40, "Local HTTP safety evidence is incomplete.");
    packet = {
      mode: "local-clean-source-build-proof",
      awsCalls: 0,
      networkCalls: localHttp.loopbackHttpRequests,
      externalNetworkCalls: 0,
      loopbackHttpRequests: localHttp.loopbackHttpRequests,
      localHttpServersClosed: true,
      cloudMutations: 0,
      sourceFiles: sourceFingerprint.files,
      sourceFingerprint,
      generatedArtifactsUsedAsInputs: false,
      fullLocalGatePassed: true,
      fullLocalGateTimeoutMs: LOCAL_GATE_TIMEOUT_MS,
      gateElapsedMs,
      stepTimings,
      tests,
      dependencyInstallVerified: false,
      dependencyReuse: "isolated file copies with internal-only directory links; no install performed",
      dependencyCopy,
      cleanCloneClaimed: false,
      publicationPerformed: false,
      temporaryCopyRetained: false,
    };
  } catch (error) {
    if (error instanceof Error && /^The generated-artifact-free source copy failed during: [A-Za-z0-9 ()/;-]+\.$/.test(error.message)) throw error;
    const fixedFailures = new Map([
      ["Dependency copy roots must be disjoint.", "ROOTS_OVERLAP"],
      ["Dependency output cannot be redirected.", "OUTPUT_REDIRECTED"],
      ["Installed dependency roots must be physical directories.", "SOURCE_REDIRECTED"],
      ["Dependency copy requires fresh output directories.", "OUTPUT_EXISTS"],
      ["Frontend output cannot be redirected.", "FRONTEND_REDIRECTED"],
      ["Dependency link escapes the installed roots.", "LINK_OUTSIDE"],
      ["Dependency file links require separate review.", "FILE_LINK_UNREVIEWED"],
      ["Dependency entry escapes its source root.", "ENTRY_OUTSIDE"],
      ["Dependency entry is not a bounded regular file.", "ENTRY_INVALID"],
      ["Copied dependency link target is unavailable.", "LINK_TARGET_MISSING"],
    ]);
    const fixed = [...fixedFailures].find(([message]) => typeof error?.message === "string" && error.message.startsWith(message));
    const code = fixed?.[1] ?? (["EACCES", "EPERM", "ENOSPC", "ENAMETOOLONG", "ENOENT"].includes(error?.code) ? error.code : "LOCAL_PROOF_INCOMPLETE");
    // Only a fixed stage and bounded code leave the process, not exception paths or content.
    throw new Error(`Local source proof failed at ${stage}: ${code}.`);
  } finally {
    assert.ok(safeToRemove(base, directory, physicalBase), "Refusing to remove an unverified temporary path.");
    rmSync(directory, { recursive: true, force: true });
  }
  return packet;
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invokedDirectly && process.argv.length !== 2) {
  console.error("Clean-source proof accepts no arguments and never installs dependencies or accesses AWS.");
  process.exitCode = 1;
} else if (invokedDirectly) {
  try { console.log(JSON.stringify(runCleanSourceBuildProof())); }
  catch (error) {
    const category = error instanceof Error && /^(?:The generated-artifact-free source copy failed during: [A-Za-z0-9 ()/;-]+|Local source proof failed at (?:source-copy|dependency-copy|full-local-gate): (?:EACCES|EPERM|ENOSPC|ENAMETOOLONG|ENOENT|ROOTS_OVERLAP|OUTPUT_REDIRECTED|SOURCE_REDIRECTED|OUTPUT_EXISTS|FRONTEND_REDIRECTED|LINK_OUTSIDE|FILE_LINK_UNREVIEWED|ENTRY_OUTSIDE|ENTRY_INVALID|LINK_TARGET_MISSING|LOCAL_PROOF_INCOMPLETE))\.$/.test(error.message)
      ? error.message : "LOCAL_CLEAN_SOURCE_PROOF_INCOMPLETE";
    console.error(`Clean-source proof failed: ${category} Raw build details are suppressed.`);
    process.exitCode = 1;
  }
}
