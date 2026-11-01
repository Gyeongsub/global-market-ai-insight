// Explicit local integration probe, not a default whole-gate Git mutation.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fingerprintCurrentSource } from "../clean-source-build-proof.mjs";
import { localGitConfiguration, localGitEnvironment, prepareLocalSnapshotClone } from "../local-git-clone-proof.mjs";

test("actual local snapshot clones tracked bytes without original-repository or remote action", { timeout: 90_000 }, () => {
  const git = process.platform === "win32" ? resolve(dirname(process.execPath), "..", "..", "native", "git", "cmd", "git.exe") : "/usr/bin/git";
  const base = realpathSync(tmpdir()), directory = mkdtempSync(join(base, "gmai-local-git-proof-"));
  const before = fingerprintCurrentSource(), originalHead = join(process.cwd(), ".git", "HEAD");
  const head = existsSync(originalHead) ? readFileSync(originalHead) : null;
  try {
    const result = prepareLocalSnapshotClone(directory, git);
    assert.deepEqual(result.fingerprint, before); assert.deepEqual(fingerprintCurrentSource(result.clone), before);
    assert.ok(result.index.files > 1); assert.equal(existsSync(join(result.clone, "node_modules")), false);
    assert.equal(/\[remote /i.test(readFileSync(join(result.clone, ".git", "config"), "utf8")), false);
    const status = spawnSync(git, [...localGitConfiguration(directory), "status", "--porcelain"], {
      cwd: result.clone, env: localGitEnvironment(process.env, directory), encoding: "utf8", windowsHide: true, timeout: 20_000 });
    assert.equal(status.status, 0); assert.equal(status.stdout, "");
    assert.deepEqual(fingerprintCurrentSource(), before);
    if (head) assert.deepEqual(readFileSync(originalHead), head);
  } finally { rmSync(directory, { recursive: true }); }
});
