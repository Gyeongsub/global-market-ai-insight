import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
import test from "node:test";

const frontendRequire = createRequire(new URL("../package.json", import.meta.url));
const lintRequire = createRequire(frontendRequire.resolve("eslint-plugin-react-hooks"));

const typescriptLintRequire = createRequire(frontendRequire.resolve("typescript-eslint"));
const parserRequire = createRequire(typescriptLintRequire.resolve("@typescript-eslint/parser"));
const estreeRequire = createRequire(parserRequire.resolve("@typescript-eslint/typescript-estree"));

// A local backport does not change registry version-range findings. Keep the
// historical advisory and legacy-version disposition separate from patch tests.
test("legacy and modern lint matchers retain their separately reviewed APIs", () => {
  const legacyRequire = createRequire(frontendRequire.resolve("eslint"));
  const legacy = legacyRequire("minimatch");
  assert.equal(legacyRequire("minimatch/package.json").version, "3.1.5");
  assert.equal(typeof legacy, "function");
  assert.equal(typeof legacy.Minimatch.prototype.firstPhasePreProcess, "undefined");
  assert.equal(legacy("src/example.ts", "**/*.ts"), true);
  assert.equal(legacy("src/example.js", "**/*.ts"), false);
  assert.equal(estreeRequire("minimatch/package.json").version, "10.2.6");
  assert.equal(typeof estreeRequire("minimatch").Minimatch.prototype.firstPhasePreProcess, "function");
});

test("trusted lint fixture avoids advanced glob preprocessing, with a small positive control", async () => {
  const matcher = estreeRequire("minimatch");
  const original = matcher.Minimatch.prototype.firstPhasePreProcess;
  let advancedCalls = 0;
  try {
    matcher.Minimatch.prototype.firstPhasePreProcess = function (...args) {
      advancedCalls++;
      return original.apply(this, args);
    };
    assert.equal(matcher.minimatch("src/example.ts", "**/*.ts", { dot: true }), true);
    assert.equal(matcher.minimatch("src/example.js", "**/*.ts", { dot: true }), false);
    assert.equal(advancedCalls, 0);
    const { ESLint } = frontendRequire("eslint");
    const lint = new ESLint({ cwd: fileURLToPath(new URL("../", import.meta.url)),
      overrideConfigFile: fileURLToPath(new URL("../eslint.config.mjs", import.meta.url)) });
    const filePath = "src/review-fixture.ts";
    const config = await lint.calculateConfigForFile(filePath);
    assert.equal(config.settings.react.version, frontendRequire("react/package.json").version);
    assert.equal(config.languageOptions.parserOptions.projectService, undefined);
    const results = await lint.lintText("const value: number = 1;\nconsole.log(value);\n", { filePath });
    assert.equal(results.length, 1);
    assert.equal(results[0].fatalErrorCount, 0);
    assert.equal(results[0].errorCount, 0);
    assert.equal(advancedCalls, 0);
    // Tiny ordinary pattern proves the instrumentation would detect that path.
    // Do not run amplification/DoS payloads, benchmarks or untrusted configs.
    assert.equal(matcher.minimatch("src/example.ts", "**/*.ts", { optimizationLevel: 2 }), true);
    assert.equal(advancedCalls, 1);
  } finally {
    matcher.Minimatch.prototype.firstPhasePreProcess = original;
  }
});

test("the modern matcher patch is exact-version and bound into the lock", () => {
  const patch = readFileSync(new URL("../../scripts/patches/minimatch-10.2.6-preprocess.patch", import.meta.url));
  const digest = createHash("sha256").update(patch).digest("hex");
  const lock = readFileSync(new URL("../../pnpm-lock.yaml", import.meta.url), "utf8");
  const workspace = readFileSync(new URL("../../pnpm-workspace.yaml", import.meta.url), "utf8");
  assert.match(workspace, /minimatch@10\.2\.6: scripts\/patches\/minimatch-10\.2\.6-preprocess\.patch/);
  assert.ok(lock.includes("minimatch@10.2.6: " + digest));
});

test("both modern module formats bound preprocessing without a large amplification probe", async () => {
  const packageRoot = dirname(estreeRequire.resolve("minimatch/package.json"));
  const commonjs = estreeRequire("minimatch");
  const esm = await import(pathToFileURL(join(packageRoot, "dist/esm/index.js")).href);
  for (const { Minimatch } of [commonjs, esm]) {
    const pattern = Array(3).fill("**/../a/b").join("/");
    const bounded = new Minimatch(pattern, { optimizationLevel: 2, braceExpandMax: 4 });
    assert.ok(bounded.set.length <= 4);
    const ordinary = new Minimatch("**/../a/b/**/../c/d", { optimizationLevel: 2 });
    assert.equal(ordinary.set.length, 4);
    assert.equal(ordinary.match("../a/b/../c/d"), true);
    assert.equal(ordinary.match("x/a/b/y/c/d"), true);
    let comparisons = 0;
    const original = ordinary.partsMatch;
    ordinary.partsMatch = function (...args) { comparisons++; return original.apply(this, args); };
    const large = Array.from({ length: 1001 }, (_, i) => [String(i)]);
    assert.equal(ordinary.secondPhasePreProcess(large), large);
    assert.equal(comparisons, 0);
    assert.equal(ordinary.secondPhasePreProcess([["x"], ["x"]]).length, 1);
    assert.ok(comparisons > 0);
  }
});

test("the lint-only Zod resolution uses the reviewed fixed version and narrow override", () => {
  const metadata = lintRequire("zod/package.json");
  assert.equal(metadata.version, "4.6.6");
  assert.equal(metadata.license, "MIT");
  const workspace = readFileSync(new URL("../../pnpm-workspace.yaml", import.meta.url), "utf8");
  assert.match(workspace, /"zod@4\.4\.3": 4\.6\.6/);
});

test("small oversized constrained arrays fail before element validation without an OOM probe", async () => {
  const { z } = lintRequire("zod");
  for (const constraint of ["max", "length"]) {
    let visited = 0;
    const item = z.string().refine(() => { visited++; return true; });
    const schema = z.array(item)[constraint](1);
    const result = schema.safeParse(["a", "b", "c", "d"]);
    assert.equal(result.success, false);
    assert.equal(visited, 0);
    assert.deepEqual(result.error.issues.map(issue => issue.code), ["too_big"]);
    const asyncResult = await schema.safeParseAsync(["a", "b", "c", "d"]);
    assert.equal(asyncResult.success, false);
    assert.equal(visited, 0);
    assert.equal(schema.safeParse(["ok"]).success, true);
    assert.equal(visited, 1);
    assert.equal(schema.safeParse([42]).success, false, "within-limit elements are still validated");
  }
});
