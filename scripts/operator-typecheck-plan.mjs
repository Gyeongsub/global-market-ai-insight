import { isAbsolute, resolve } from "node:path";

// One compiler program covers the same strict fixed entrypoints. Repeating
// identical compiler setup for five subsets wastes the bounded fresh gate.
export const OPERATOR_TYPECHECK_FILES = Object.freeze([
  "circuit-control.ts", "circuit-denial-preflight.ts", "live-image-readiness.ts",
  "refresh-live-basic-scan.ts", "scan-live-image-cache.ts", "compute-template-review.ts",
  "compute-patch-rollout.ts", "prepare-worker-patch.ts", "promote-worker-patch.ts",
  "signed-api-acceptance.ts", "reconcile-stopped-slots.ts", "inspect-analysis-job.ts",
  "phase11-drill-preflight.ts", "phase11-reference-preflight.ts", "phase11-reference-readiness.ts",
  "phase11-live-readiness.ts", "phase11-deployment-diagnostics.ts", "verify-controller-release.ts",
  "circuit-denial-live.ts", "circuit-denial-workflow.ts", "iam-boundary-proof.ts", "verify-worker-release.ts",
  "maintenance-recovery-rehearsal.ts",
  "maintenance-reference-preflight.ts",
  "maintenance-reference-readiness.ts",
  "maintenance-policy-proof.ts",
  "maintenance-log-diagnostics.ts",
  "controller-policy-review.ts",
  "controller-change-set-review.ts",
  "controller-log-delivery-proof.ts",
  "controller-policy-rollout.ts",
  "controller-policy-completion-proof.ts",
  "live-base-manifest-proof.ts",
  "candidate-vulnerability-triage.ts",
  "private-owner-review.ts",
  "private-owner-draft.ts",
  "private-owner-acceptance.ts",
  "local-owner-observation.ts",
  "synthetic-trust-probe.ts",
  "synthetic-role-cli.ts",
  "synthetic-role-template-review.ts",
  "synthetic-role-draft.ts",
  "synthetic-role-draft-live.ts",
  "synthetic-role-rehearsal.ts",
  "synthetic-role-rehearsal-live.ts",
  "synthetic-alternate-principal-cli.ts",
  "synthetic-alternate-principal-rehearsal.ts",
  "synthetic-compute-denial-reconcile.ts",
  "synthetic-compute-denial-exercise.ts",
  "synthetic-restricted-browser-exercise.ts",
  "synthetic-analysis-lab.ts",
]);

export function operatorTypecheckArguments(root) {
  if (typeof root !== "string" || !root || root.includes("\0") || !isAbsolute(root)) throw new Error("OPERATOR_TYPECHECK_ROOT_INVALID");
  return [resolve(root, "node_modules/typescript/bin/tsc"), "--noEmit", "--module", "NodeNext", "--moduleResolution", "NodeNext",
    "--target", "ES2022", "--strict", "--skipLibCheck", ...OPERATOR_TYPECHECK_FILES.map(file => resolve(root, "scripts", file))];
}
