import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { localOwnerObservationPlan, reviewLocalOwnerBaseline, LOCAL_OWNER_CONTROLLER_ZIP_SHA256, LocalOwnerCheckError, runLocalOwnerObservation } from "../local-owner-observation.js";

test("unsupported runtime blocks live observation before any AWS reads", async () => {
  const version = Object.getOwnPropertyDescriptor(process.versions, "node")!;
  const environment = { ...process.env };
  try {
    Object.defineProperty(process.versions, "node", { ...version, value: "24.19.0" });
    assert.equal(localOwnerObservationPlan().awsCalls, 0);
    await assert.rejects(runLocalOwnerObservation(), (error: unknown) => {
      assert.ok(error instanceof LocalOwnerCheckError);
      assert.deepEqual(error.progress, { stage: "configuration", awsReadAttempts: 0, signedGetAttempts: 0 });
      assert.equal(error.reason, "PROJECT_NODE_SECURITY_BASELINE_REQUIRED");
      return true;
    });
    assert.deepEqual({ ...process.env }, environment);
  } finally { Object.defineProperty(process.versions, "node", version); }
});

test("local owner operator defaults to zero action and a fixed two-GET observation", () => {
  const plan = localOwnerObservationPlan();
  assert.equal(plan.awsCalls, 0); assert.equal(plan.serversStarted, 0);
  assert.equal(plan.preflightReadMax, 48); assert.equal(plan.signedGetsMax, 2);
  assert.equal(plan.jobPosts, 0); assert.equal(plan.cloudMutations, 0);
  assert.equal(plan.localLifetimeMs, 300000); assert.throws(() => localOwnerObservationPlan(["--execute"]));
  const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/local-owner-observation.ts"], { encoding: "utf8", timeout: 15000 });
  assert.equal(result.status, 0); assert.deepEqual(JSON.parse(result.stdout), plan); assert.equal(result.stderr, "");
});

test("local owner live code baseline cannot silently accept another Lambda package or principal", () => {
  const base = () => ({ refs: { privateOwnerConfigurationMatchesCaller: true }, runtime: { State: "Active", LastUpdateStatus: "Successful",
    CodeSha256: Buffer.from(LOCAL_OWNER_CONTROLLER_ZIP_SHA256, "hex").toString("base64") } });
  reviewLocalOwnerBaseline(base() as never);
  for (const key of ["State", "LastUpdateStatus", "CodeSha256"] as const) {
    const value = base(); value.runtime[key] = "PRIVATE_SENTINEL"; assert.throws(() => reviewLocalOwnerBaseline(value as never));
  }
  const value = base(); value.refs.privateOwnerConfigurationMatchesCaller = false;
  assert.throws(() => reviewLocalOwnerBaseline(value as never));
});

test("operator diagnostics retain only fixed stages and bounded counts, never upstream prose", () => {
  const error = new LocalOwnerCheckError({ stage: "capture", awsReadAttempts: 24, signedGetAttempts: 1 }, Error("PRIVATE_SENTINEL"));
  assert.equal(error.reason, "DETAILS_SUPPRESSED"); assert.equal(error.progress.stage, "capture");
  assert.doesNotMatch(JSON.stringify(error), /PRIVATE_SENTINEL/);
  const invalid = new LocalOwnerCheckError({ stage: "PRIVATE_SENTINEL", awsReadAttempts: NaN, signedGetAttempts: Infinity } as never);
  assert.deepEqual(invalid.progress, { stage: "configuration", awsReadAttempts: 0, signedGetAttempts: 0 });
  assert.equal(new LocalOwnerCheckError(error.progress, Error("OWNER_OBSERVATION_INVALID")).reason, "OWNER_OBSERVATION_INVALID");
});
