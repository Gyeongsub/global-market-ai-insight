import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { OPERATOR_TYPECHECK_FILES, operatorTypecheckArguments } from "../operator-typecheck-plan.mjs";

test("one strict no-output compiler program covers all 51 fixed operator entrypoints", () => {
  const args = operatorTypecheckArguments(process.cwd());
  assert.deepEqual(args.slice(1, 10), ["--noEmit", "--module", "NodeNext", "--moduleResolution", "NodeNext", "--target", "ES2022", "--strict", "--skipLibCheck"]);
  assert.equal(OPERATOR_TYPECHECK_FILES.length, 51); assert.equal(new Set(OPERATOR_TYPECHECK_FILES).size, 51);
  assert.ok(Object.isFrozen(OPERATOR_TYPECHECK_FILES)); assert.equal(args.length, 61);
  for (const name of ["synthetic-trust-probe.ts", "synthetic-role-cli.ts", "synthetic-role-template-review.ts", "synthetic-role-draft.ts", "synthetic-role-draft-live.ts", "synthetic-role-rehearsal.ts", "synthetic-role-rehearsal-live.ts"])
    assert.ok(args.includes(resolve("scripts", name)));
  assert.ok(args.includes(resolve("scripts", "local-owner-observation.ts")));
  for (const name of ["private-owner-review.ts", "private-owner-draft.ts", "private-owner-acceptance.ts"]) assert.ok(args.includes(resolve("scripts", name)));
  assert.ok(args.includes(resolve("scripts", "candidate-vulnerability-triage.ts")));
  for (const name of OPERATOR_TYPECHECK_FILES) assert.ok(/^[a-z0-9-]+\.ts$/.test(name) && existsSync(resolve("scripts", name)));
  for (const file of ["verify-controller-release.ts", "circuit-denial-workflow.ts", "circuit-denial-live.ts", "iam-boundary-proof.ts", "verify-worker-release.ts", "maintenance-recovery-rehearsal.ts", "maintenance-reference-preflight.ts", "maintenance-log-diagnostics.ts", "controller-policy-review.ts", "controller-change-set-review.ts", "controller-policy-completion-proof.ts", "controller-log-delivery-proof.ts", "live-base-manifest-proof.ts"])
    assert.ok(args.includes(resolve("scripts", file)));
});
test("relative, missing and null-bearing roots cannot produce a compiler plan", () => {
  for (const root of [undefined, "", ".", "PRIVATE_SENTINEL\0", 42]) assert.throws(() => operatorTypecheckArguments(root), /OPERATOR_TYPECHECK_ROOT_INVALID/);
});
test("importing the fixed plan performs no compiler, AWS or other child action", () => {
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", 'await import("./scripts/operator-typecheck-plan.mjs");'], { encoding: "utf8", timeout: 5000 });
  assert.equal(r.status, 0); assert.equal(r.stdout, ""); assert.equal(r.stderr, "");
});
