import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { copySources, fingerprintCopiedSource, fingerprintCurrentSource } from "../clean-source-build-proof.mjs";
import { localGitClonePlan, localGitConfiguration, localGitEnvironment, prepareLocalSnapshotClone,
  validateClonedFrozenResult, safeLocalCloneProof, safeLocalGitTemporaryDirectory, validateGitIndex, validateGitSourceTree,
  parseLocalGitCloneArguments, supportedGitExecutable } from "../local-git-clone-proof.mjs";

const hash = "a".repeat(40);
const frozenFixture = () => ({ mode: "isolated-frozen-install-build-proof", pinnedPnpm: "11.16.0", toolArchiveSha256: "a".repeat(64),
  toolArchiveIntegrityMatched: true, toolFiles: 1, sourceFingerprint: { files: 1, bytes: 1, sha256: "b".repeat(64) }, lockedIdentities: 392,
  nonRegistryResolutionPresent: false, lockfileUnchanged: true, freshInstallVerified: true, fullLocalGatePassed: true,
  awsCalls: 0, cloudMutations: 0, lifecycleScriptsEnabled: false, dependencyReuse: false, existingInstallationModified: false,
  temporaryTreeRetained: false, cleanGitCloneClaimed: false, publicationPerformed: false, readyForPublication: false,
  tests: { groups: 4, total: 8, passed: 8, skipped: 0 }, installElapsedMs: 1, gateElapsedMs: 1,
  stepTimings: { observedRecords: 50, measuredSteps: 50, recordsValid: true, failedSteps: 0, totalMeasuredStepMs: 1,
    slowestSteps: [{ index: 1, elapsedMs: 1, successfulExit: true }], stepNamesPrinted: false, rawDetailsSuppressed: true, successfulGateClaimed: false },
  fullLocalGateTimeoutMs: 600000, loopbackHttpRequests: 33, localHttpServersClosed: true,
  publicPackageDownloadsPerformed: true, privateRegistryCredentialsPassed: false });
const proofFixture = () => ({ mode: "local-git-snapshot-frozen-proof", gitVersion: "2.53.0.windows.3", sourceFingerprint: frozenFixture().sourceFingerprint,
  trackedFiles: 1, gitObjectsChecked: true, byteIdenticalClone: true, localSnapshotCloneVerified: true, frozenInstallFromCloneVerified: true,
  freshInstallProof: frozenFixture(), sourceRepositoryModified: false, remoteRepositoryContacted: false, cloneRemoteRemoved: true,
  gitHooksAndUserConfigurationUsed: false, temporaryTreeRetained: false, publishedRepositoryCloneVerified: false, ciExecuted: false, awsCalls: 0,
  publicationPerformed: false, readyForPublication: false });

test("default invocation remains inert and refuses execution/publication-like arguments", () => {
  const plan = localGitClonePlan();
  assert.equal(plan.subprocessesStarted, 0); assert.equal(plan.filesWritten, 0); assert.equal(plan.awsCalls, 0);
  assert.equal(plan.localSnapshotCloneVerified, false); assert.equal(plan.publishedRepositoryCloneVerified, false);
  for (const option of ["--push", "--publish", "--execute", "PRIVATE_SENTINEL"]) assert.throws(() => localGitClonePlan([option]));
});

test("explicit installed Git selection requires the execution flag and an absolute single-file argument", () => {
  const flag = "--execute-local-git-frozen-proof", name = process.platform === "win32" ? "git.exe" : "git";
  const path = join(realpathSync(tmpdir()), "trusted-tools", name);
  assert.deepEqual(parseLocalGitCloneArguments([]), { execute: false });
  assert.deepEqual(parseLocalGitCloneArguments([flag]), { execute: true });
  assert.deepEqual(parseLocalGitCloneArguments([flag, "--git-executable", path]), { execute: true, gitExecutable: path });
  for (const args of [["--git-executable", path], [flag, "--git-executable"], [flag, "--git-executable", name],
    [flag, "--git-executable", path, "--push"], [flag, "--git-executable", path + "\n"],
    [flag, "--git-executable", path + " --version"], [flag, "--git-executable", "https://example.invalid/git.exe"],
    [flag, "--git-executable", path, "--git-executable", path], [flag, "--publish", path]])
    assert.throws(() => parseLocalGitCloneArguments(args));
  assert.throws(() => parseLocalGitCloneArguments(null));
});

test("Git tool validation is read-only, rejects repository tools/missing/empty files and never executes fixture bytes", () => {
  const base = realpathSync(tmpdir()), directory = mkdtempSync(join(base, "gmai-local-git-proof-"));
  try {
    assert.equal(safeLocalGitTemporaryDirectory(base, directory, base), true);
    const name = process.platform === "win32" ? "git.exe" : "git", path = join(directory, name);
    assert.throws(() => supportedGitExecutable(path));
    writeFileSync(path, ""); assert.throws(() => supportedGitExecutable(path));
    writeFileSync(path, "fixture bytes must not execute");
    assert.equal(supportedGitExecutable(path), path);
    assert.throws(() => supportedGitExecutable(join(process.cwd(), name)));
    assert.throws(() => supportedGitExecutable(join(directory, "shell.exe")));
    assert.equal(readFileSync(path, "utf8"), "fixture bytes must not execute");
  } finally { rmSync(directory, { recursive: true }); }
});

test("Git receives neither user configuration nor cloud/Git/SSH credentials", () => {
  const env = localGitEnvironment({ PATH: "safe", USERPROFILE: "PRIVATE_SENTINEL", AWS_PROFILE: "PRIVATE_SENTINEL",
    AWS_SECRET_ACCESS_KEY: "PRIVATE_SENTINEL", GIT_CONFIG_COUNT: "PRIVATE_SENTINEL", GIT_CONFIG_GLOBAL: "PRIVATE_SENTINEL",
    GIT_SSH_COMMAND: "PRIVATE_SENTINEL", SSH_AUTH_SOCK: "PRIVATE_SENTINEL", GH_TOKEN: "PRIVATE_SENTINEL",
    NODE_OPTIONS: "PRIVATE_SENTINEL", HTTP_PROXY: "PRIVATE_SENTINEL" }, resolve("owned-fixture"));
  assert.equal(JSON.stringify(env).includes("PRIVATE_SENTINEL"), false);
  assert.equal(env.PATH, "safe"); assert.equal(env.GIT_CONFIG_NOSYSTEM, "1"); assert.equal(env.GIT_TERMINAL_PROMPT, "0");
  assert.equal(env.GIT_ATTR_NOSYSTEM, "1"); assert.equal(env.GIT_LFS_SKIP_SMUDGE, "1");
  const config = localGitConfiguration(resolve("owned-fixture"));
  for (const value of ["protocol.allow=never", "protocol.file.allow=always", "credential.helper=", "core.autocrlf=false", "commit.gpgSign=false"])
    assert.ok(config.includes(value));
  assert.equal(config.some(value => value.includes("safe.directory")), false);
});

test("tracked file proof rejects links, submodules, filters, stages and duplicate/escaping paths", () => {
  assert.equal(validateGitIndex(`100644 ${hash} 0\tREADME.md\0`, 1).files, 1);
  for (const value of [`120000 ${hash} 0\tlink\0`, `160000 ${hash} 0\tmodule\0`, `100644 ${hash} 1\tfile\0`,
    `100644 ${hash} 0\t../escape\0`, `100644 ${hash} 0\t.gitattributes\0`, `100644 ${hash} 0\tsub/.gitmodules\0`,
    `100644 ${hash} 0\tREADME.md\0`.repeat(2), `100644 ${hash} 0\tREADME.md`]) assert.throws(() => validateGitIndex(value, 1));
});

test("filter/submodule config is rejected before any Git subprocess can see source", () => {
  const base = realpathSync(tmpdir()), directory = mkdtempSync(join(base, "gmai-local-git-proof-"));
  try {
    assert.equal(safeLocalGitTemporaryDirectory(base, directory, base), true);
    assert.equal(safeLocalGitTemporaryDirectory(base, base, base), false);
    assert.throws(() => prepareLocalSnapshotClone(directory, "PRIVATE_SENTINEL", seed => {
      writeFileSync(join(seed, "README.md"), "fixture"); writeFileSync(join(seed, ".gitattributes"), "* filter=PRIVATE_SENTINEL");
    }));
    assert.equal(existsSync(join(directory, "seed", ".git")), false);
    assert.throws(() => validateGitSourceTree(join(directory, "seed")));
  } finally { rmSync(directory, { recursive: true }); }
});

test("selected clone source is copied exactly, never silently replaced by the operator checkout", () => {
  const directory = mkdtempSync(join(realpathSync(tmpdir()), "gmai-local-git-proof-"));
  try {
    const source = join(directory, "source"), copied = join(directory, "copy"); mkdirSync(source); mkdirSync(copied);
    for (const name of [".dockerignore", ".env.example", ".gitignore", "LICENSE", "README.md", "THIRD_PARTY_NOTICES.md", "agent.md", "cdk.json",
      "package.json", "plan.md", "pnpm-lock.yaml", "pnpm-workspace.yaml", "tsconfig.services.json"]) writeFileSync(join(source, name), "synthetic selected source\n");
    for (const name of ["docs", "frontend", "infrastructure", "scripts", "services", "shared"]) mkdirSync(join(source, name));
    mkdirSync(join(source, ".git")); writeFileSync(join(source, ".git", "PRIVATE_SENTINEL"), "must not be copied");
    copySources(copied, source);
    assert.equal(readFileSync(join(copied, "README.md"), "utf8"), "synthetic selected source\n");
    assert.equal(existsSync(join(copied, ".git")), false);
    assert.deepEqual(fingerprintCopiedSource(copied), fingerprintCurrentSource(source));
  } finally { rmSync(directory, { recursive: true }); }
});

test("incomplete or private nested output cannot claim clone/frozen acceptance", () => {
  for (const text of ["PRIVATE_SENTINEL", "{}", JSON.stringify({ mode: "recorded-isolated-frozen-install", completed: true, passed: false }),
    JSON.stringify({ mode: "recorded-isolated-frozen-install", completed: true, passed: true, runId: "a".repeat(36), proof: {} }), "x".repeat(150001)])
    assert.throws(() => validateClonedFrozenResult(text, { files: 1, bytes: 1, sha256: "a".repeat(64) }));
});

test("nested receipt must bind a strict complete frozen proof to the exact tracked source", () => {
  const proof = frozenFixture();
  assert.deepEqual(validateClonedFrozenResult(proof, proof.sourceFingerprint), proof);
  assert.throws(() => validateClonedFrozenResult(proof, { ...proof.sourceFingerprint, files: 2 }));
  assert.throws(() => validateClonedFrozenResult({ ...proof, cleanGitCloneClaimed: true }, proof.sourceFingerprint));
});

test("durable public projection rejects unknown data, changed bounds and overstated release claims", () => {
  assert.deepEqual(safeLocalCloneProof(proofFixture()), proofFixture());
  for (const mutate of [p => { p.privatePath = "PRIVATE_SENTINEL"; }, p => { p.freshInstallProof.privateLog = "PRIVATE_SENTINEL"; },
    p => { p.gitVersion = "PRIVATE_SENTINEL"; }, p => { p.sourceFingerprint = { ...p.sourceFingerprint, files: 2 }; },
    p => { p.trackedFiles = 2; }, p => { p.temporaryTreeRetained = true; }, p => { p.sourceRepositoryModified = true; },
    p => { p.remoteRepositoryContacted = true; }, p => { p.publishedRepositoryCloneVerified = true; }, p => { p.ciExecuted = true; },
    p => { p.awsCalls = 1; }, p => { p.publicationPerformed = true; }, p => { p.readyForPublication = true; }]) {
    const proof = proofFixture(); mutate(proof); assert.equal(safeLocalCloneProof(proof), null);
  }
});

