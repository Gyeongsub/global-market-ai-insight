import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { cleanSourceChildEnvironment, copySources, fingerprintCopiedSource, fingerprintCurrentSource } from "./clean-source-build-proof.mjs";
import { ownedLocalGateReportDirectory } from "./local-gate-proof.mjs";
import { safeFreshInstallResult } from "./record-fresh-install-proof.mjs";
import { freshInstallFailureObservation, runFreshInstallProof } from "./fresh-install-proof.mjs";
import { assertNodeSecurityBaseline } from "./node-security-baseline.mjs";

const fail = () => { throw new Error("LOCAL_GIT_CLONE_INCOMPLETE"); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const failures = new WeakMap();
function observedFailure(observation) {
  const error = new Error("LOCAL_GIT_CLONE_INCOMPLETE"); failures.set(error, observation); return error;
}

export function localGitClonePlan(args = []) {
  if (args.length) fail();
  return { mode: "dry-run", awsCalls: 0, subprocessesStarted: 0, filesWritten: 0,
    sourceRepositoryModified: false, remoteRepositoryContacted: false, localSnapshotCloneVerified: false,
    frozenInstallFromCloneVerified: false, publishedRepositoryCloneVerified: false, ciExecuted: false,
    publicationPerformed: false, readyForPublication: false };
}

/** This is process-local isolation, never a global safe.directory/config change. */
export function localGitEnvironment(source, ownedRoot) {
  const env = cleanSourceChildEnvironment(source);
  const empty = join(ownedRoot, "empty-config");
  return { ...env, HOME: ownedRoot, USERPROFILE: ownedRoot,
    GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_SYSTEM: empty, GIT_CONFIG_GLOBAL: empty,
    GIT_ATTR_NOSYSTEM: "1", GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0",
    GIT_PROTOCOL_FROM_USER: "0", GIT_LFS_SKIP_SMUDGE: "1", GIT_NO_LAZY_FETCH: "1" };
}

export function localGitConfiguration(ownedRoot) {
  return ["core.hooksPath=" + join(ownedRoot, "empty-hooks"), "core.attributesFile=" + join(ownedRoot, "empty-config"),
    "core.autocrlf=false", "core.fsmonitor=false", "core.untrackedCache=false", "core.symlinks=false",
    "credential.helper=", "protocol.allow=never", "protocol.file.allow=always", "submodule.recurse=false",
    "fetch.recurseSubmodules=false", "commit.gpgSign=false", "tag.gpgSign=false", "user.name=Local Proof",
    "user.email=local-proof@example.invalid"].flatMap(value => ["-c", value]);
}

export function safeLocalGitTemporaryDirectory(base, directory, physicalBase) {
  try {
    const name = basename(directory);
    return /^gmai-local-git-proof-[A-Za-z0-9]+$/.test(name) && relative(resolve(base), resolve(directory)) === name &&
      lstatSync(directory).isDirectory() && !lstatSync(directory).isSymbolicLink() &&
      realpathSync(base) === physicalBase && realpathSync(directory) === resolve(physicalBase, name);
  } catch { return false; }
}

export function validateGitIndex(text, expectedFiles) {
  if (typeof text !== "string" || text.length > 500_000 || !text.endsWith("\0")) fail();
  const entries = text.slice(0, -1).split("\0"), seen = new Set();
  if (!Number.isSafeInteger(expectedFiles) || expectedFiles < 1 || expectedFiles > 2000 || entries.length !== expectedFiles) fail();
  for (const entry of entries) {
    const match = /^(100644|100755) ([a-f0-9]{40}) 0\t([^\0\r\n]+)$/.exec(entry);
    if (!match) fail();
    const path = match[3], segments = path.split("/");
    if (seen.has(path) || path.startsWith("/") || path.includes("\\") || segments.some(part =>
      !part || part === "." || part === ".." || [".git", ".gitmodules", ".gitattributes", ".lfsconfig"].includes(part.toLowerCase()))) fail();
    seen.add(path);
  }
  return { files: entries.length, regularTrackedFilesOnly: true, attributesSubmodulesAndLinksAbsent: true };
}

/** Reject repository-controlled filters/submodules BEFORE Git reads any file. */
export function validateGitSourceTree(root) {
  let files = 0;
  function visit(directory) {
    if (lstatSync(directory).isSymbolicLink() || realpathSync(directory) !== directory) fail();
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if ([".git", ".gitmodules", ".gitattributes", ".lfsconfig"].includes(entry.name.toLowerCase()) || entry.isSymbolicLink()) fail();
      if (entry.isDirectory()) visit(join(directory, entry.name));
      else if (!entry.isFile() || ++files > 2000) fail();
    }
  }
  visit(resolve(root)); if (!files) fail();
  return { files, repositoryFiltersAbsent: true };
}

export function validateClonedFrozenResult(value, expectedFingerprint) {
  try {
    const proof = safeFreshInstallResult(value);
    if (!proof || !same(proof.sourceFingerprint, expectedFingerprint)) fail();
    return proof;
  } catch { fail(); }
}

export function safeLocalCloneProof(value) {
  try {
    const serialized = JSON.stringify(value);
    if (typeof serialized !== "string" || serialized.length > 25_000) return null;
    const p = JSON.parse(serialized), keys = ["mode", "gitVersion", "sourceFingerprint", "trackedFiles", "gitObjectsChecked",
      "byteIdenticalClone", "localSnapshotCloneVerified", "frozenInstallFromCloneVerified", "freshInstallProof", "sourceRepositoryModified",
      "remoteRepositoryContacted", "cloneRemoteRemoved", "gitHooksAndUserConfigurationUsed", "temporaryTreeRetained",
      "publishedRepositoryCloneVerified", "ciExecuted", "awsCalls", "publicationPerformed", "readyForPublication"];
    if (!p || typeof p !== "object" || Array.isArray(p) || Object.keys(p).sort().join(",") !== keys.sort().join(",") ||
        p.mode !== "local-git-snapshot-frozen-proof" || !/^\d+\.\d+\.\d+(?:\.windows\.\d+)?$/.test(p.gitVersion ?? "") || p.awsCalls !== 0) return null;
    const nested = safeFreshInstallResult(p.freshInstallProof);
    if (!nested || !same(p.sourceFingerprint, nested.sourceFingerprint) || p.trackedFiles !== nested.sourceFingerprint.files) return null;
    for (const key of ["gitObjectsChecked", "byteIdenticalClone", "localSnapshotCloneVerified", "frozenInstallFromCloneVerified", "cloneRemoteRemoved"])
      if (p[key] !== true) return null;
    for (const key of ["sourceRepositoryModified", "remoteRepositoryContacted", "gitHooksAndUserConfigurationUsed", "temporaryTreeRetained",
      "publishedRepositoryCloneVerified", "ciExecuted", "publicationPerformed", "readyForPublication"]) if (p[key] !== false) return null;
    return p;
  } catch { return null; }
}

function validGitExecutableArgument(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 4096 && !/[\0\r\n]/.test(value) &&
    isAbsolute(value) && basename(value).toLowerCase() === (process.platform === "win32" ? "git.exe" : "git");
}

export function parseLocalGitCloneArguments(args) {
  if (!Array.isArray(args)) fail();
  if (args.length === 0) return { execute: false };
  if (args[0] !== "--execute-local-git-frozen-proof") fail();
  if (args.length === 1) return { execute: true };
  if (args.length !== 3 || args[1] !== "--git-executable" || !validGitExecutableArgument(args[2])) fail();
  return { execute: true, gitExecutable: args[2] };
}

/** Explicit operator-selected installed tool, not a repository/PATH fallback.
 * Physical-path checks are not publisher authentication: choose trusted Git. */
export function supportedGitExecutable(explicitPath) {
  if (explicitPath !== undefined && !validGitExecutableArgument(explicitPath)) fail();
  const path = explicitPath === undefined ? (process.platform === "win32"
    ? resolve(dirname(process.execPath), "..", "..", "native", "git", "cmd", "git.exe") : "/usr/bin/git") : resolve(explicitPath);
  const offset = relative(resolve(process.cwd()), path);
  if (offset === "" || (!isAbsolute(offset) && offset !== ".." && !offset.startsWith(`..${sep}`))) fail();
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || realpathSync(path) !== path || stat.size < 1 || stat.size > 100_000_000) fail();
  return path;
}

/** Seed and clone only inside a new owned temporary tree. No original Git command runs. */
export function prepareLocalSnapshotClone(directory, git, sourceCopier = copySources) {
  const seed = join(directory, "seed"), clone = join(directory, "clone"), template = join(directory, "empty-hooks");
  mkdirSync(seed); mkdirSync(template); writeFileSync(join(directory, "empty-config"), "", { flag: "wx" });
  sourceCopier(seed);
  validateGitSourceTree(seed);
  const fingerprint = fingerprintCopiedSource(seed), env = localGitEnvironment(process.env, directory);
  let commandIndex = 0;
  const run = (cwd, args) => {
    commandIndex++;
    const result = spawnSync(git, [...localGitConfiguration(directory), ...args], {
      cwd, env, encoding: "utf8", timeout: 20_000, maxBuffer: 1_000_000, windowsHide: true });
    if (result.error || result.status !== 0 || result.signal !== null) {
      // Fixed numeric/boolean diagnostics only; no private Git error text.
      const denied = /Permission denied|Access is denied|Operation not permitted/i.test(result.stderr ?? "");
      throw observedFailure({ stage: "git-command", commandIndex, permissionDenied: denied,
        timedOut: result.error?.code === "ETIMEDOUT", exitCode: Number.isSafeInteger(result.status) ? result.status : null });
    }
    return result.stdout;
  };
  const version = run(seed, ["--version"]).trim();
  if (!/^git version \d+\.\d+\.\d+(?:\.windows\.\d+)?$/.test(version)) fail();
  run(seed, ["init", "--template=" + template, "--initial-branch=proof", "--object-format=sha1", "."]);
  run(seed, ["add", "--all", "--force", "--", "."]);
  const index = validateGitIndex(run(seed, ["ls-files", "--stage", "-z"]), fingerprint.files);
  run(seed, ["commit", "--no-verify", "--no-gpg-sign", "-m", "Local private source snapshot"]);
  run(seed, ["fsck", "--full", "--strict"]);
  const commit = run(seed, ["rev-parse", "--verify", "HEAD"]).trim();
  if (!/^[a-f0-9]{40}$/.test(commit)) fail();
  run(directory, ["clone", "--no-local", "--no-hardlinks", "--no-recurse-submodules", "--template=" + template,
    pathToFileURL(seed).href, clone]);
  run(clone, ["remote", "remove", "origin"]);
  if (run(clone, ["remote"]).trim() !== "" || run(clone, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]) !== "" ||
      run(clone, ["rev-parse", "--verify", "HEAD"]).trim() !== commit || !same(fingerprintCurrentSource(clone), fingerprint)) fail();
  validateGitIndex(run(clone, ["ls-files", "--stage", "-z"]), fingerprint.files);
  run(clone, ["fsck", "--full", "--strict"]);
  return { clone, fingerprint, index, gitVersion: version.replace("git version ", "") };
}

export async function runLocalGitCloneProof(gitExecutable) {
  assertNodeSecurityBaseline();
  const git = supportedGitExecutable(gitExecutable);
  const root = resolve(process.cwd()), before = fingerprintCurrentSource(root);
  const base = resolve(tmpdir()), physicalBase = realpathSync(base);
  const directory = resolve(mkdtempSync(join(base, "gmai-local-git-proof-")));
  if (!safeLocalGitTemporaryDirectory(base, directory, physicalBase)) fail();
  let result;
  try {
    const snapshot = prepareLocalSnapshotClone(directory, git);
    if (!same(snapshot.fingerprint, before)) fail();
    // The operator's existing pinned YAML reader bootstraps lock validation.
    // Only the clone's source is copied; no installed dependency enters the
    // fresh store/build. The clone and operator lock bytes already match.
    let frozen;
    try { frozen = validateClonedFrozenResult(await runFreshInstallProof(destination => copySources(destination, snapshot.clone)), before); }
    catch (error) {
      const observation = freshInstallFailureObservation(error);
      throw observedFailure({ stage: "frozen-install-from-clone", nestedStage: observation?.mode ?? null,
        ...(observation ? { detail: observation } : {}) });
    }
    if (!same(fingerprintCurrentSource(snapshot.clone), before) || !same(fingerprintCurrentSource(root), before)) fail();
    result = { mode: "local-git-snapshot-frozen-proof", gitVersion: snapshot.gitVersion, sourceFingerprint: before,
      trackedFiles: snapshot.index.files, gitObjectsChecked: true, byteIdenticalClone: true, localSnapshotCloneVerified: true,
      frozenInstallFromCloneVerified: true, freshInstallProof: frozen, sourceRepositoryModified: false,
      remoteRepositoryContacted: false, cloneRemoteRemoved: true, gitHooksAndUserConfigurationUsed: false,
      temporaryTreeRetained: false, publishedRepositoryCloneVerified: false, ciExecuted: false, awsCalls: 0,
      publicationPerformed: false, readyForPublication: false };
  } finally {
    if (!safeLocalGitTemporaryDirectory(base, directory, physicalBase)) fail();
    rmSync(directory, { recursive: true }); if (existsSync(directory)) fail();
  }
  return result;
}

export async function recordLocalGitCloneProof(operation = runLocalGitCloneProof) {
  const directory = ownedLocalGateReportDirectory(process.cwd()), runId = randomUUID(), path = join(directory, `local-clone-${runId}.json`);
  const initial = { mode: "recorded-local-git-snapshot-frozen-proof", runId, completed: false, passed: false,
    startedAt: new Date().toISOString(), rawDetailsSuppressed: true, independentLocalClosureRequired: true };
  writeFileSync(path, JSON.stringify(initial) + "\n", { flag: "wx" });
  let proof, failureObservation = null;
  try { proof = safeLocalCloneProof(await operation()); } catch (error) { proof = null; failureObservation = failures.get(error) ?? null; }
  const packet = { ...initial, completed: true, completedAt: new Date().toISOString(), passed: proof !== null,
    ...(proof ? { proof } : { error: "LOCAL_GIT_CLONE_INCOMPLETE", ...(failureObservation ? { failureObservation } : {}) }) };
  if (ownedLocalGateReportDirectory(process.cwd()) !== directory || !lstatSync(path).isFile() || lstatSync(path).isSymbolicLink() ||
      realpathSync(path) !== path || readFileSync(path, "utf8") !== JSON.stringify(initial) + "\n") fail();
  writeFileSync(path, JSON.stringify(packet) + "\n"); return packet;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const options = parseLocalGitCloneArguments(process.argv.slice(2));
    if (!options.execute) console.log(JSON.stringify(localGitClonePlan()));
    else {
      const packet = await recordLocalGitCloneProof(() => runLocalGitCloneProof(options.gitExecutable));
      console.log(JSON.stringify(packet)); if (!packet.passed) process.exitCode = 1;
    }
  } catch { console.error(JSON.stringify({ error: "LOCAL_GIT_CLONE_INCOMPLETE", rawDetailsSuppressed: true,
    independentLocalClosureRequired: true })); process.exitCode = 1; }
}
