import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve } from "node:path";
import test from "node:test";
import { INFRA_TEST_CONCURRENCY, infrastructureTestArguments } from "../test-infra.mjs";

function fixture(operation) {
  const parent = resolve(tmpdir()), physical = realpathSync(parent);
  const root = mkdtempSync(join(parent, "gmai-infra-runner-test-")), token = randomUUID(), marker = join(root, ".owner");
  writeFileSync(marker, token, { flag: "wx" });
  try { return operation(root); }
  finally {
    assert.match(basename(root), /^gmai-infra-runner-test-[A-Za-z0-9]+$/);
    assert.equal(relative(parent, root), basename(root)); assert.equal(realpathSync(parent), physical);
    assert.equal(realpathSync(root), join(physical, basename(root))); assert.equal(lstatSync(root).isSymbolicLink(), false);
    assert.equal(lstatSync(marker).isSymbolicLink(), false); assert.equal(readFileSync(marker, "utf8"), token);
    rmSync(root, { recursive: true }); assert.equal(existsSync(root), false);
  }
}

test("every current infrastructure file runs exactly once with the original two-file bound and no CLI launcher", () => {
  const expected = [];
  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const file = join(dir, entry.name);
      if (entry.isDirectory()) walk(file); else if (entry.name.endsWith(".test.ts")) expected.push(file);
    }
  }
  walk(resolve("infrastructure/tests"));
  const args = infrastructureTestArguments();
  assert.equal(INFRA_TEST_CONCURRENCY, 2);
  assert.deepEqual(args.slice(0, 4), ["--import", "tsx", "--test", "--test-concurrency=2"]);
  assert.equal(expected.length >= 9, true); assert.deepEqual(args.slice(4), expected.sort());
  assert.equal(new Set(args.slice(4)).size, expected.length);
  assert.equal(args.some(arg => /--test-(?:skip|name-pattern)|force-exit|tsx[\\/]dist[\\/]cli/.test(arg)), false);
  assert.match(readFileSync("scripts/check-all.mjs", "utf8"), /name: "infrastructure assertions",\s+args: \[resolve\("scripts\/test-infra.mjs"\)\]/);
  assert.equal(JSON.parse(readFileSync("package.json", "utf8")).scripts["test:infra"], "node scripts/test-infra.mjs");
});

test("new nested tests cannot be silently omitted, while ordinary support modules are not mistaken for tests", () => fixture(root => {
  mkdirSync(join(root, "infrastructure/tests/nested"), { recursive: true });
  writeFileSync(join(root, "infrastructure/tests/one.test.ts"), "// synthetic");
  writeFileSync(join(root, "infrastructure/tests/nested/two.test.ts"), "// synthetic");
  writeFileSync(join(root, "infrastructure/tests/support.ts"), "// not a test");
  assert.deepEqual(infrastructureTestArguments(root).slice(4), [
    join(root, "infrastructure/tests/nested/two.test.ts"), join(root, "infrastructure/tests/one.test.ts"),
  ].sort());
}));

test("empty, missing, relative, invalid or junction-redirected test scopes fail rather than reducing coverage", () => fixture(root => {
  for (const input of ["relative", "", null, root + "\0"]) assert.throws(() => infrastructureTestArguments(input));
  assert.throws(() => infrastructureTestArguments(root));
  mkdirSync(join(root, "infrastructure/tests"), { recursive: true });
  assert.throws(() => infrastructureTestArguments(root));
  mkdirSync(join(root, "outside")); writeFileSync(join(root, "outside/private.test.ts"), "PRIVATE_SENTINEL");
  symlinkSync(join(root, "outside"), join(root, "infrastructure/tests/redirected"), "junction");
  assert.throws(() => infrastructureTestArguments(root));
}));

test("import does not run tests and caller-selected files/skip arguments are rejected without reflection", () => {
  const imported = spawnSync(process.execPath, ["--input-type=module", "-e", 'await import("./scripts/test-infra.mjs");'],
    { encoding: "utf8", windowsHide: true, timeout: 5000 });
  assert.equal(imported.status, 0); assert.equal(imported.stdout, ""); assert.equal(imported.stderr, "");
  for (const args of [["PRIVATE_SENTINEL"], ["--test-name-pattern", "PRIVATE_SENTINEL"]]) {
    const result = spawnSync(process.execPath, ["scripts/test-infra.mjs", ...args], { encoding: "utf8", windowsHide: true, timeout: 5000 });
    assert.equal(result.status, 1); assert.equal(result.stdout, "");
    assert.equal((result.stdout + result.stderr).includes("PRIVATE_SENTINEL"), false);
  }
});
