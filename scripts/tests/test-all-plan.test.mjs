import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve } from "node:path";
import { SERVICE_TEST_CONCURRENCY, serviceTestArguments, javascriptHelperTestArguments, frontendArtifactTestArguments } from "../test-all.mjs";
import { startupEnvironment, startupProofPlan } from "../local-module-startup-proof.mjs";

function fixture(operation) {
  const base = resolve(tmpdir()), physical = realpathSync(base), root = mkdtempSync(join(base, "gmai-service-runner-"));
  const marker = join(root, ".owner"), token = randomUUID(); writeFileSync(marker, token, { flag: "wx" });
  try {
    for (const directory of ["services", "shared", "frontend/tests", "scripts/tests"]) mkdirSync(join(root, directory), { recursive: true });
    return operation(root);
  } finally {
    assert.match(basename(root), /^gmai-service-runner-[A-Za-z0-9]+$/);
    assert.equal(relative(base, root), basename(root)); assert.equal(realpathSync(base), physical);
    assert.equal(realpathSync(root), join(physical, basename(root))); assert.equal(lstatSync(root).isSymbolicLink(), false);
    assert.equal(lstatSync(marker).isSymbolicLink(), false); assert.equal(readFileSync(marker, "utf8"), token);
    rmSync(root, { recursive: true }); assert.equal(existsSync(root), false);
  }
}

test("all existing TypeScript test files remain present exactly once with a fixed two-process bound", () => {
  const expected = [];
  function walk(dir) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, e.name);
      if (e.isDirectory()) walk(path); else if (e.name.endsWith(".test.ts")) expected.push(path);
    }
  }
  for (const dir of ["services", "shared", "frontend/tests", "scripts/tests"]) walk(resolve(dir));
  const args = serviceTestArguments();
  assert.equal(SERVICE_TEST_CONCURRENCY, 2);
  assert.deepEqual(args.slice(0, 4), ["--import", "tsx", "--test", "--test-concurrency=2"]);
  assert.ok(expected.length > 50); assert.deepEqual(args.slice(4), expected.sort());
  assert.equal(new Set(args.slice(4)).size, expected.length);
  assert.equal(args.some(arg => /--test-(?:skip|name-pattern)|force-exit/.test(arg)), false);
  const gate = readFileSync("scripts/check-all.mjs", "utf8");
  assert.match(gate, /name: "service and contract tests",\s+args: \[resolve\("scripts\/test-all.mjs"\)\]/);
});

test("the runner rejects an empty group instead of pretending there were no tests", () => {
  const root = mkdtempSync(join(tmpdir(), "gmai-local-gate-tests-"));
  try {
    for (const dir of ["services", "shared", "frontend/tests", "scripts/tests"]) mkdirSync(join(root, dir), { recursive: true });
    assert.throws(() => serviceTestArguments(root), /^Error: SERVICE_TEST_FILES_MISSING$/);
    writeFileSync(join(root, "services/one.test.ts"), "// synthetic fixture\n");
    assert.deepEqual(serviceTestArguments(root).slice(4), [join(root, "services/one.test.ts")]);
  } finally { rmSync(root, { recursive: true }); }
});

test("every JavaScript helper and frontend artifact test is included once, including later additions", () => {
  for (const [directory, collect] of [["scripts/tests", javascriptHelperTestArguments], ["frontend/tests", frontendArtifactTestArguments]]) {
    const expected = [];
    function walk(path) {
      for (const entry of readdirSync(path, { withFileTypes: true })) {
        const file = join(path, entry.name);
        if (entry.isDirectory()) walk(file); else if (entry.name.endsWith(".test.mjs")) expected.push(file);
      }
    }
    walk(resolve(directory));
    const args = collect();
    assert.deepEqual(args.slice(0, 2), ["--test", "--test-concurrency=2"]);
    assert.deepEqual(args.slice(2), expected.sort()); assert.equal(new Set(args.slice(2)).size, expected.length);
  }
  assert.ok(javascriptHelperTestArguments().some(path => path.endsWith("retired-runtime-signature-observation.test.mjs")));
  const gate = readFileSync("scripts/check-all.mjs", "utf8");
  assert.match(gate, /name: "local publication and documentation guards \(no push\)",\s+args: javascriptHelperTestArguments\(\)/);
  assert.match(gate, /name: "frontend contract tests",\s+args: frontendArtifactTestArguments\(\)/);
});

test("fixed JavaScript scopes reject empty or redirected roots and discover nested additions", () => fixture(root => {
  for (const [directory, collect] of [["scripts/tests", javascriptHelperTestArguments], ["frontend/tests", frontendArtifactTestArguments]]) {
    assert.throws(() => collect(root), /^Error: SERVICE_TEST_FILES_MISSING$/);
    mkdirSync(join(root, directory, "nested"));
    writeFileSync(join(root, directory, "nested/new.test.mjs"), "// synthetic");
    writeFileSync(join(root, directory, "nested/ignored.test.ts"), "// separate TypeScript group");
    assert.deepEqual(collect(root).slice(2), [join(root, directory, "nested/new.test.mjs")]);
    symlinkSync(join(root, "services"), join(root, directory, "redirected"), "junction");
    assert.throws(() => collect(root), /^Error: SERVICE_TEST_SCOPE_INVALID$/);
  }
}));

test("nested additions are included but redirected test roots cannot execute a sibling file", () => fixture(root => {
  mkdirSync(join(root, "services/nested"));
  writeFileSync(join(root, "services/nested/new.test.ts"), "// synthetic");
  assert.deepEqual(serviceTestArguments(root).slice(4), [join(root, "services/nested/new.test.ts")]);
  mkdirSync(join(root, "outside")); writeFileSync(join(root, "outside/private.test.ts"), "PRIVATE_SENTINEL");
  symlinkSync(join(root, "outside"), join(root, "shared/redirected"), "junction");
  assert.throws(() => serviceTestArguments(root), /^Error: SERVICE_TEST_SCOPE_INVALID$/);
}));

test("invalid roots and excessive nesting fail before returning a reduced test plan", () => fixture(root => {
  for (const input of [null, "", ".", root + "\0"]) assert.throws(() => serviceTestArguments(input));
  const deep = join(root, "services", ...Array(13).fill("nested")); mkdirSync(deep, { recursive: true });
  writeFileSync(join(deep, "one.test.ts"), "// synthetic");
  assert.throws(() => serviceTestArguments(root), /^Error: SERVICE_TEST_SCOPE_INVALID$/);
}));

test("imports are inert and caller-selected files or skip flags never start the real test group", () => {
  for (const path of ["test-all", "local-module-startup-proof"]) {
    const imported = spawnSync(process.execPath, ["--input-type=module", "-e", `await import("./scripts/${path}.mjs");`],
      { encoding: "utf8", windowsHide: true, timeout: 5000 });
    assert.equal(imported.status, 0); assert.equal(imported.stdout, ""); assert.equal(imported.stderr, "");
    for (const args of [["PRIVATE_SENTINEL"], ["--test-name-pattern", "PRIVATE_SENTINEL"]]) {
      const result = spawnSync(process.execPath, [`scripts/${path}.mjs`, ...args], { encoding: "utf8", windowsHide: true, timeout: 5000 });
      assert.equal(result.status, 1); assert.equal(result.stdout, ""); assert.equal((result.stdout + result.stderr).includes("PRIVATE_SENTINEL"), false);
    }
  }
});

test("startup diagnostic defaults to zero action and never inherits caller cache or coverage destinations", () => {
  assert.equal(startupProofPlan().subprocessesStarted, 0); assert.equal(startupProofPlan().externalNetworkCalls, 0);
  assert.throws(() => startupProofPlan(["--execute-local"]));
  const source = { NODE_COMPILE_CACHE: "PRIVATE_SENTINEL", node_compile_cache_portable: "PRIVATE_SENTINEL",
    NODE_DISABLE_COMPILE_CACHE: "PRIVATE_SENTINEL", NODE_V8_COVERAGE: "PRIVATE_SENTINEL", AWS_SECRET_ACCESS_KEY: "PRIVATE_SENTINEL" };
  assert.equal(JSON.stringify(startupEnvironment(source, null)).includes("PRIVATE_SENTINEL"), false);
  assert.equal(startupEnvironment(source, null).NODE_DISABLE_COMPILE_CACHE, "1");
  const configured = startupEnvironment(source, "owned-cache");
  assert.equal(configured.NODE_COMPILE_CACHE, "owned-cache"); assert.equal(configured.NODE_DISABLE_COMPILE_CACHE, undefined);
  assert.equal(source.NODE_COMPILE_CACHE, "PRIVATE_SENTINEL");
});
