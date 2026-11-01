import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { directTypeScriptCheckStep, LOCAL_CHECK_GATE_TIMEOUT_MS, remainingLocalGateMs, runTimedLocalCheckStep, summarizeLocalCheckTimings } from "../local-check-step.mjs";

const step = { name: "fixed local check (zero AWS; not approval)", args: ["PRIVATE_SENTINEL.mjs"], cwd: "PRIVATE_SENTINEL",
  env: { PRIVATE_SENTINEL: "PRIVATE_SENTINEL" } };

test("direct check steps default to a minimal child environment, not the operator shell", () => {
  const key = "GMAI_SYNTHETIC_UNRECOGNIZED_CREDENTIAL", previous = process.env[key];
  try {
    process.env[key] = "PRIVATE_SENTINEL";
    let seen;
    const { env: _explicit, ...defaultStep } = step;
    const result = runTimedLocalCheckStep(defaultStep, { now: () => 1, emit: () => {},
      spawn: (_exe, _args, options) => { seen = options.env; return { status: 0, signal: null }; } });
    assert.equal(result.successfulExit, true); assert.equal(Object.hasOwn(seen, key), false);
    assert.equal(seen.AWS_EC2_METADATA_DISABLED, "true");
    assert.equal(process.env[key], "PRIVATE_SENTINEL");
  } finally { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; }
});

test("direct TypeScript checks preserve every fixed entrypoint argument and never mutate the original plan", () => {
  const original = { ...step, cwd: process.cwd(), args: [resolve("node_modules/tsx/dist/cli.mjs"), resolve("scripts/circuit-control.ts"),
    "--action", "open", "--expected-version", "0", "--reason", "dev-initialize"] };
  const snapshot = structuredClone(original), direct = directTypeScriptCheckStep(original, process.cwd());
  assert.deepEqual(original, snapshot); assert.deepEqual(direct.args, ["--import", "tsx", ...original.args.slice(1)]);
  assert.equal(direct.cwd, original.cwd); assert.equal(direct.env, original.env); assert.equal(direct.name, original.name);
  assert.equal(directTypeScriptCheckStep(step, process.cwd()), step);
  for (const candidate of [{ ...original, cwd: resolve("frontend") }, { ...original, args: [original.args[0]] },
    { ...original, args: [original.args[0], resolve("../private.ts")] }, { ...original, args: [...original.args, "PRIVATE\0"] }])
    assert.throws(() => directTypeScriptCheckStep(candidate, process.cwd()), /^Error: LOCAL_CHECK_TS_ENTRY_INVALID$/);
  for (const root of [null, ".", "", "PRIVATE\0"]) assert.throws(() => directTypeScriptCheckStep(original, root));
});

test("real direct Node registration returns the same zero-action packet as the old launcher", () => {
  const original = { name: "synthetic launcher equivalence", cwd: process.cwd(),
    args: [resolve("node_modules/tsx/dist/cli.mjs"), resolve("scripts/circuit-control.ts"), "--action", "open", "--expected-version", "0", "--reason", "dev-initialize"] };
  const old = spawnSync(process.execPath, original.args, { encoding: "utf8", windowsHide: true, timeout: 10_000 });
  const direct = spawnSync(process.execPath, directTypeScriptCheckStep(original, process.cwd()).args, { encoding: "utf8", windowsHide: true, timeout: 10_000 });
  assert.equal(old.status, 0); assert.equal(direct.status, 0); assert.equal(old.signal, null); assert.equal(direct.signal, null);
  assert.equal(old.error, undefined); assert.equal(direct.error, undefined); assert.equal(old.stderr, ""); assert.equal(direct.stderr, "");
  assert.deepEqual(JSON.parse(direct.stdout), JSON.parse(old.stdout)); assert.equal(JSON.parse(direct.stdout).awsCalls, 0);
});

test("observer runs the unchanged child once and never emits args/cwd/env/output", () => {
  let calls = 0, tick = 0; const packets = [];
  const report = runTimedLocalCheckStep(step, { now: () => [10, 34.25][tick++], emit: p => packets.push(p),
    spawn: (exe, args, options) => {
      calls++; assert.equal(exe, process.execPath); assert.equal(args, step.args);
      assert.equal(options.cwd, step.cwd); assert.equal(options.env, step.env); assert.equal(options.stdio, "inherit");
      assert.equal(options.timeout, 600000); assert.equal(options.killSignal, "SIGKILL"); assert.equal(options.windowsHide, true);
      return { status: 0, signal: null, stdout: "PRIVATE_SENTINEL", stderr: "PRIVATE_SENTINEL" };
    } });
  assert.deepEqual(report, { successfulExit: true, exitCode: 0 }); assert.equal(calls, 1);
  assert.deepEqual(packets, [{ mode: "local-check-step-timing", schemaVersion: 1, step: step.name,
    elapsedMs: 25, successfulExit: true, rawDetailsSuppressed: true }]);
  assert.equal(JSON.stringify(packets).includes("PRIVATE_SENTINEL"), false);
});

test("the direct whole-gate budget decreases monotonically and never refreshes a child deadline", () => {
  assert.equal(LOCAL_CHECK_GATE_TIMEOUT_MS, 600000);
  assert.deepEqual([100, 110, 599999, 600099, 600100, 620000].map(now => remainingLocalGateMs(100, now)),
    [600000, 599990, 101, 1, 0, 0]);
  for (const values of [[NaN, 1], [1, Infinity], [-1, 10], [100, 99]])
    assert.throws(() => remainingLocalGateMs(...values), /^Error: LOCAL_GATE_CLOCK_INVALID$/);
  const gate = readFileSync("scripts/check-all.mjs", "utf8");
  assert.match(gate, /runTimedLocalCheckStep\(step, \{ timeoutMs \}\)/);
  assert.match(gate, /remainingLocalGateMs\(gateStarted, performance\.now\(\)\)/);
});

test("invalid or extended child budgets reject before executing a process", () => {
  for (const timeoutMs of [0, -1, NaN, 600001, Infinity, 0.5])
    assert.throws(() => runTimedLocalCheckStep(step, { timeoutMs, spawn: () => assert.fail("must not spawn") }),
      /^Error: LOCAL_CHECK_TIMEOUT_INVALID$/);
  let seen;
  runTimedLocalCheckStep(step, { timeoutMs: 123, now: () => 1, emit: () => {},
    spawn: (_exe, _args, options) => { seen = options.timeout; return { status: 0, signal: null }; } });
  assert.equal(seen, 123);
});

test("a real hanging local child is terminated, never retried or mistaken for successful output", () => {
  const packets = [];
  const report = runTimedLocalCheckStep({ name: "synthetic local timeout guard", cwd: process.cwd(),
    args: ["-e", 'setInterval(()=>{},1000);process.on("SIGTERM",()=>{});'] }, { timeoutMs: 150, emit: p => packets.push(p) });
  assert.equal(report.successfulExit, false); assert.ok(report.exitCode > 0);
  assert.equal(packets.length, 1); assert.equal(packets[0].successfulExit, false);
});

test("failed, killed and spawn-error children fail closed without retries or private errors", () => {
  for (const result of [{ status: 2, signal: null }, { status: null, signal: "SIGTERM" },
    { status: 0, signal: null, error: new Error("PRIVATE_SENTINEL") }, { status: -1, signal: null }, {}, "throw"]) {
    let calls = 0;
    const report = runTimedLocalCheckStep(step, { now: () => 1, emit: p => {
      assert.equal(p.successfulExit, false); assert.equal(JSON.stringify(p).includes("PRIVATE_SENTINEL"), false);
    }, spawn: () => { calls++; if (result === "throw") throw new Error("PRIVATE_SENTINEL"); return result; } });
    assert.equal(report.successfulExit, false); assert.ok(report.exitCode > 0); assert.equal(calls, 1);
  }
});

test("invalid clocks are unknown timings and never waive child failure", () => {
  for (const ticks of [[NaN, 1], [Infinity, Infinity], [100, 99], [0, 600001]]) {
    let n = 0;
    const result = runTimedLocalCheckStep(step, { now: () => ticks[n++],
      spawn: () => ({ status: 1, signal: null }), emit: p => assert.equal(p.elapsedMs, null) });
    assert.equal(result.successfulExit, false);
  }
});

test("invalid check shapes stop before spawn without echoing rejected details", () => {
  for (const bad of [{ ...step, name: "PRIVATE_SENTINEL@example.invalid" }, { ...step, args: [] },
    { ...step, args: ["PRIVATE_SENTINEL\0"] }, { ...step, cwd: "" }, { ...step, env: null }]) {
    assert.throws(() => runTimedLocalCheckStep(bad, { spawn: () => assert.fail("must not spawn") }), /^Error: LOCAL_CHECK_STEP_INVALID$/);
  }
});

test("invalid observer clocks cannot turn a successful-looking child exit into verified success", () => {
  for (const ticks of [[NaN, 1], [10, 9], [0, 600001]]) {
    let n = 0;
    assert.equal(runTimedLocalCheckStep(step, { now: () => ticks[n++], emit: p => assert.equal(p.successfulExit, false),
      spawn: () => ({ status: 0, signal: null }) }).successfulExit, false);
  }
});

test("every fixed whole-gate label is accepted without executing any real child", () => {
  const labels = [...readFileSync("scripts/check-all.mjs", "utf8").matchAll(/\n\s+name: "([^"]+)"/g)].map(m => m[1]);
  assert.ok(labels.length >= 50);
  for (const name of labels) assert.equal(runTimedLocalCheckStep({ ...step, name }, { now: () => 0,
    emit: () => {}, spawn: () => ({ status: 0, signal: null }) }).successfulExit, true);
});

const timing = (elapsedMs, successfulExit = true) => JSON.stringify({ mode: "local-check-step-timing", schemaVersion: 1,
  step: "PRIVATE SENTINEL; not approval", elapsedMs, successfulExit, rawDetailsSuppressed: true });
test("captured timing summary keeps bounded numbers and ordinal positions only", () => {
  const report = summarizeLocalCheckTimings(["PRIVATE_SENTINEL", timing(20), timing(35), timing(35, false)].join("\n"));
  assert.equal(report.recordsValid, true); assert.equal(report.measuredSteps, 3); assert.equal(report.failedSteps, 1);
  assert.equal(report.totalMeasuredStepMs, 90); assert.deepEqual(report.slowestSteps.map(p => p.index), [2, 3, 1]);
  assert.equal(report.successfulGateClaimed, false); assert.equal(JSON.stringify(report).includes("PRIVATE"), false);
});
test("missing, malformed, oversized or privately extended timing records remain incomplete", () => {
  const extra = JSON.parse(timing(1)); extra.path = "PRIVATE_SENTINEL";
  for (const output of ["PRIVATE_SENTINEL", '{"mode":"local-check-step-timing",broken', timing(null), timing(-1), timing(600001),
    JSON.stringify(extra), Array.from({ length: 101 }, () => timing(1)).join("\n")]) {
    const report = summarizeLocalCheckTimings(output); assert.equal(report.recordsValid, false);
    assert.equal(report.successfulGateClaimed, false); assert.equal(JSON.stringify(report).includes("PRIVATE_SENTINEL"), false);
    assert.ok(report.slowestSteps.length <= 10);
  }
});
