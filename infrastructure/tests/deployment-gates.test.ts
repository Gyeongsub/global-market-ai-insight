import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseDeploymentGates, type DeploymentFlagName } from "../lib/deployment-gates.js";

const names: DeploymentFlagName[] = [
  "GMAI_ENABLE_API",
  "GMAI_ENABLE_INTERNAL_JOBS",
  "GMAI_ENABLE_OPERATIONS",
  "GMAI_ENABLE_MAINTENANCE_DRAFT",
  "GMAI_ENABLE_ALARM_NOTIFICATIONS",
  "GMAI_ACKNOWLEDGE_ALARM_NOTIFICATION_COST",
  "GMAI_ENABLE_ALARM_CIRCUIT_AUTOMATION",
  "GMAI_ACKNOWLEDGE_ALARM_CIRCUIT_COST",
  "GMAI_ENABLE_CUSTOM_OPERATION_METRICS",
  "GMAI_ACKNOWLEDGE_CUSTOM_METRIC_COST",
];

function isolatedMain(t: { after: (fn: () => void) => void }) {
  const root = mkdtempSync(join(tmpdir(), "gmai-main-preflight-test-"));
  t.after(() => rmSync(root, { recursive: true }));
  mkdirSync(join(root, "infrastructure", "bin"), { recursive: true });
  mkdirSync(join(root, "infrastructure", "lib"), { recursive: true });
  for (const file of ["bin/app.ts", "lib/config.ts", "lib/deployment-gates.ts"])
    copyFileSync(resolve("infrastructure", file), join(root, "infrastructure", file));
  writeFileSync(join(root, "package.json"), '{"type":"module"}\n');
  copyFileSync(resolve("infrastructure/environments/dev.example.json"), join(root, "config.json"));
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const name of Object.keys(env)) if (/^(AWS_|GMAI_|CDK_|NODE_OPTIONS$|NODE_PATH$|TWELVE_?DATA|BEDROCK_)/i.test(name)) delete env[name];
  env.AWS_EC2_METADATA_DISABLED = "true";
  const run = (flags: NodeJS.ProcessEnv = {}) => spawnSync(process.execPath,
    [resolve("node_modules/tsx/dist/cli.mjs"), join(root, "infrastructure/bin/app.ts")], {
      cwd: root, encoding: "utf8", windowsHide: true, timeout: 10_000,
      env: { ...env, GMAI_CONFIG: join(root, "config.json"), CDK_OUTDIR: join(root, "cdk.out"), ...flags },
    });
  return { root, run };
}

test("invalid cost gates reject before reading config or requiring any installed CDK module", t => {
  const { root, run } = isolatedMain(t);
  assert.equal(existsSync(join(root, "node_modules")), false);
  const result = run({ GMAI_ENABLE_API: "true", GMAI_ENABLE_OPERATIONS: "true", GMAI_ENABLE_ALARM_NOTIFICATIONS: "true",
    GMAI_CONFIG: join(root, "missing-private-config.json") });
  assert.equal(result.status, 1); assert.equal(result.signal, null); assert.equal(result.error, undefined);
  assert.match(result.stderr, /Alarm notifications require a separate cost acknowledgement/);
  assert.doesNotMatch(result.stderr, /ERR_MODULE_NOT_FOUND|ENOENT|missing-private-config/);
  assert.equal(existsSync(join(root, "cdk.out")), false);
});

test("reference-only and low-quota scope refusals happen before CDK import or App construction", t => {
  const { root, run } = isolatedMain(t);
  for (const name of ["GMAI_MAINTENANCE_REFERENCE_ONLY", "GMAI_PHASE11_REFERENCE_ONLY", "GMAI_ALLOW_UNRESERVED_ALARM_DRILL"]) {
    const result = run({ [name]: "true" });
    assert.equal(result.status, 1); assert.equal(result.signal, null); assert.equal(result.error, undefined);
    assert.match(result.stderr, /dedicated/); assert.doesNotMatch(result.stderr, /ERR_MODULE_NOT_FOUND/);
    assert.equal(existsSync(join(root, "cdk.out")), false);
  }
});

test("mutable image tags are rejected before loading CDK or creating a Foundation stack", t => {
  const { root, run } = isolatedMain(t), result = run({ GMAI_WORKER_IMAGE_DIGEST: "latest" });
  assert.equal(result.status, 1); assert.equal(result.signal, null); assert.equal(result.error, undefined);
  assert.match(result.stderr, /workerImageDigest must be a sha256 digest, not a mutable tag/);
  assert.doesNotMatch(result.stderr, /ERR_MODULE_NOT_FOUND/);
  assert.equal(existsSync(join(root, "cdk.out")), false);
});

test("valid default configuration reaches the real CDK dependency boundary rather than an invented synth pass", t => {
  const { root, run } = isolatedMain(t), result = run();
  assert.equal(result.status, 1); assert.equal(result.signal, null); assert.equal(result.error, undefined);
  assert.match(result.stderr, /ERR_MODULE_NOT_FOUND/); assert.match(result.stderr, /aws-cdk-lib/);
  assert.equal(existsSync(join(root, "cdk.out")), false);
});

test("all deployment gates default false and every non-boolean value is rejected", () => {
  assert.deepEqual(parseDeploymentGates({}), {
    apiEnabled: false,
    internalJobsEnabled: false,
    operationsEnabled: false,
    maintenanceEnabled: false,
    notificationsEnabled: false,
    alarmCircuitEnabled: false,
    customMetricsEnabled: false,
  });
  for (const name of names) {
    assert.throws(() => parseDeploymentGates({ [name]: "yes" }), new RegExp(`${name} must be true`));
  }
});

test("operations-dependent features fail before synthesis without their parent gates", () => {
  assert.throws(() => parseDeploymentGates({ GMAI_ENABLE_INTERNAL_JOBS: "true" }), /IAM-protected API stack/);
  assert.throws(() => parseDeploymentGates({ GMAI_ENABLE_OPERATIONS: "true" }), /IAM-protected API stack/);
  assert.throws(() => parseDeploymentGates({ GMAI_ENABLE_MAINTENANCE_DRAFT: "true" }), /operations draft/);
  assert.throws(() => parseDeploymentGates({ GMAI_ENABLE_ALARM_NOTIFICATIONS: "true" }), /operations draft/);
  assert.throws(() => parseDeploymentGates({ GMAI_ENABLE_ALARM_CIRCUIT_AUTOMATION: "true" }), /operations draft/);
  assert.throws(() => parseDeploymentGates({ GMAI_ENABLE_CUSTOM_OPERATION_METRICS: "true" }), /operations draft/);
});

test("every cost acknowledgement is paired with exactly its enabled feature", () => {
  const base = { GMAI_ENABLE_API: "true", GMAI_ENABLE_OPERATIONS: "true" };
  for (const [feature, acknowledgement] of [
    ["GMAI_ENABLE_ALARM_NOTIFICATIONS", "GMAI_ACKNOWLEDGE_ALARM_NOTIFICATION_COST"],
    ["GMAI_ENABLE_ALARM_CIRCUIT_AUTOMATION", "GMAI_ACKNOWLEDGE_ALARM_CIRCUIT_COST"],
    ["GMAI_ENABLE_CUSTOM_OPERATION_METRICS", "GMAI_ACKNOWLEDGE_CUSTOM_METRIC_COST"],
  ] as const) {
    assert.throws(() => parseDeploymentGates({ ...base, [feature]: "true" }), /separate cost acknowledgement/);
    assert.throws(() => parseDeploymentGates({ ...base, [acknowledgement]: "true" }), /cost acknowledgement requires/);
    assert.doesNotThrow(() => parseDeploymentGates({ ...base, [feature]: "true", [acknowledgement]: "true" }));
  }
});

test("the fully acknowledged local operations plan parses without enabling internal jobs", () => {
  assert.deepEqual(parseDeploymentGates({
    GMAI_ENABLE_API: "true",
    GMAI_ENABLE_OPERATIONS: "true",
    GMAI_ENABLE_CUSTOM_OPERATION_METRICS: "true",
    GMAI_ACKNOWLEDGE_CUSTOM_METRIC_COST: "true",
    GMAI_ENABLE_ALARM_CIRCUIT_AUTOMATION: "true",
    GMAI_ACKNOWLEDGE_ALARM_CIRCUIT_COST: "true",
  }), {
    apiEnabled: true,
    internalJobsEnabled: false,
    operationsEnabled: true,
    maintenanceEnabled: false,
    notificationsEnabled: false,
    alarmCircuitEnabled: true,
    customMetricsEnabled: true,
  });
});

test("dedicated drill entries reject invalid scopes before loading CDK or creating an assembly", t => {
  const { root } = isolatedMain(t);
  for (const file of ["bin/phase11-drill-app.ts", "bin/maintenance-drill-app.ts", "lib/phase11-reference-inputs.ts",
    "lib/phase11-reference-identity.ts", "lib/maintenance-reference-inputs.ts"])
    copyFileSync(resolve("infrastructure", file), join(root, "infrastructure", file));
  for (const [entry, label] of [["phase11-drill-app.ts", "Phase 11"], ["maintenance-drill-app.ts", "Maintenance"]]) {
    const result = spawnSync(process.execPath,
      ["--import", "tsx", join(root, "infrastructure/bin", entry!)], { cwd: process.cwd(),
        encoding: "utf8", timeout: 10_000, windowsHide: true,
        env: { ...process.env, GMAI_CONFIG: join(root, "config.json"), CDK_OUTDIR: join(root, "cdk.out"),
          GMAI_PHASE11_REFERENCE_ONLY: "PRIVATE_SENTINEL", GMAI_MAINTENANCE_REFERENCE_ONLY: "PRIVATE_SENTINEL" } });
    assert.equal(existsSync(join(root, "node_modules")), false);
    assert.equal(result.status, 1); assert.equal(result.signal, null); assert.equal(result.error, undefined);
    assert.equal(result.stdout, ""); assert.match(result.stderr, new RegExp(`${label} reference-only synthesis refused`));
    assert.doesNotMatch(result.stderr, /ERR_MODULE_NOT_FOUND|aws-cdk-lib|PRIVATE_SENTINEL/);
    assert.equal(existsSync(join(root, "cdk.out")), false);
  }
});
