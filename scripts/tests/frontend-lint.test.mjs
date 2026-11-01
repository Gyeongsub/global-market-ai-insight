import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { frontendLintPlan, frontendLintStep } from "../frontend-lint.mjs";
import { runTimedLocalCheckStep } from "../local-check-step.mjs";
import { cleanSourceChildEnvironment } from "../local-proof-environment.mjs";

test("lint plan is inert and retains unresolved advisory and isolation limits", () => {
  const plan = frontendLintPlan();
  assert.equal(plan.subprocessesStarted, 0);
  assert.equal(plan.advisoryRemediated, false);
  assert.equal(plan.operatingSystemIsolationClaimed, false);
  for (const args of [["--fix"], ["--cache"], ["--config", "private"], null])
    assert.throws(() => frontendLintPlan(args), /FRONTEND_LINT_ARGUMENTS_REJECTED/);
});

test("all lint entrypoints retain fixed frontend/config scope without cache or mutation", () => {
  const step = frontendLintStep();
  assert.equal(step.cwd, resolve("frontend"));
  assert.deepEqual(step.args, ["--max-old-space-size=512", resolve("frontend/node_modules/eslint/bin/eslint.js"),
    ".", "--config", resolve("frontend/eslint.config.mjs"), "--ignore-pattern", "dist", "--ignore-pattern", ".next"]);
  assert.equal(step.timeoutMs, 60000);
  for (const [path, command] of [["package.json", "node scripts/frontend-lint.mjs --execute-local-lint"],
    ["frontend/package.json", "node ../scripts/frontend-lint.mjs --execute-local-lint"]])
    assert.equal(JSON.parse(readFileSync(path, "utf8")).scripts.lint, command);
  assert.match(readFileSync("scripts/check-all.mjs", "utf8"), /name: "frontend lint",\s+\.\.\.frontendLintStep\(\)/);
});

test("per-step budget never renews the whole budget and late success is rejected", () => {
  for (const [remaining, elapsed, expectedBudget, passes] of [
    [600000, 20, 60000, true], [5, 4, 5, true], [5, 6, 5, false], [600000, 60001, 60000, false],
  ]) {
    let tick = 0, calls = 0;
    const result = runTimedLocalCheckStep(frontendLintStep(), { timeoutMs: remaining,
      now: () => tick++ === 0 ? 0 : elapsed, emit: () => {},
      spawn: (exe, args, options) => {
        calls++;
        assert.equal(exe, process.execPath);
        assert.equal(options.timeout, expectedBudget);
        assert.equal(options.killSignal, "SIGKILL");
        assert.equal(options.windowsHide, true);
        assert.equal(options.shell, undefined);
        assert.equal(options.env.NODE_OPTIONS, undefined);
        assert.equal(options.env.AWS_SESSION_TOKEN, undefined);
        return { status: 0, signal: null };
      } });
    assert.equal(calls, 1);
    assert.equal(result.successfulExit, passes);
  }
});

test("invalid per-step ceilings fail before child creation", () => {
  for (const timeoutMs of [0, -1, NaN, Infinity, 600001, "60000"])
    assert.throws(() => runTimedLocalCheckStep({ ...frontendLintStep(), timeoutMs }, {
      spawn: () => assert.fail("must not spawn") }), /LOCAL_CHECK_TIMEOUT_INVALID/);
});

test("timeout, resource error and nonzero lint results remain failures without retry", () => {
  for (const result of [{ status: 1, signal: null }, { status: 2, signal: null },
    { status: null, signal: "SIGKILL", error: { code: "ETIMEDOUT" } },
    { status: 0, signal: null, error: { code: "ENOMEM" } }, {}]) {
    let calls = 0;
    assert.equal(runTimedLocalCheckStep(frontendLintStep(), { now: () => 0, emit: () => {},
      spawn: () => { calls++; return result; } }).successfulExit, false);
    assert.equal(calls, 1);
  }
});

test("default CLI is inert and arbitrary scope/fix arguments fail without reflecting them", () => {
  for (const args of [[], ["PRIVATE_SENTINEL"], ["--execute-local-lint", "--fix"]]) {
    const result = spawnSync(process.execPath, ["scripts/frontend-lint.mjs", ...args], {
      env: cleanSourceChildEnvironment(process.env), encoding: "utf8", timeout: 10000, windowsHide: true });
    assert.equal(result.status, args.length ? 1 : 0);
    assert.equal((result.stdout + result.stderr).includes("PRIVATE_SENTINEL"), false);
    if (!args.length) assert.equal(JSON.parse(result.stdout).subprocessesStarted, 0);
  }
});
