import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { operatorTypecheckArguments } from "./operator-typecheck-plan.mjs";
import { javascriptHelperTestArguments, frontendArtifactTestArguments } from "./test-all.mjs";
import { directTypeScriptCheckStep, remainingLocalGateMs, runTimedLocalCheckStep } from "./local-check-step.mjs";
import { cleanSourceChildEnvironment } from "./local-proof-environment.mjs";
import { frontendLintStep } from "./frontend-lint.mjs";

// The direct check entrypoint has the same fixed whole budget as proof wrappers;
// later steps receive only what remains, never a new ten minutes per child.
const gateStarted = performance.now();
const localEnvironment = cleanSourceChildEnvironment(process.env);

// Keep the routine local check deterministic even when an operator shell still
// has opt-in deployment flags from a different workflow. This is synth only.
const foundationSynthEnv = {
  ...localEnvironment,
  GMAI_CONFIG: resolve("infrastructure/environments/dev.example.json"),
  CDK_OUTDIR: resolve("cdk.out"),
  GMAI_ENABLE_API: "false",
  GMAI_ENABLE_INTERNAL_JOBS: "false",
  GMAI_ENABLE_OPERATIONS: "false",
  GMAI_ENABLE_MAINTENANCE_DRAFT: "false",
  GMAI_ENABLE_ALARM_NOTIFICATIONS: "false",
  GMAI_ACKNOWLEDGE_ALARM_NOTIFICATION_COST: "false",
  GMAI_ENABLE_ALARM_CIRCUIT_AUTOMATION: "false",
  GMAI_ACKNOWLEDGE_ALARM_CIRCUIT_COST: "false",
  GMAI_ENABLE_CUSTOM_OPERATION_METRICS: "false",
  GMAI_ACKNOWLEDGE_CUSTOM_METRIC_COST: "false",
  GMAI_PHASE11_REFERENCE_ONLY: "false",
  GMAI_MAINTENANCE_REFERENCE_ONLY: "false",
  GMAI_ACKNOWLEDGE_MAINTENANCE_DRILL_COST: "false",
  GMAI_ALLOW_UNRESERVED_ALARM_DRILL: "false",
};
delete foundationSynthEnv.GMAI_WORKER_IMAGE_DIGEST;
delete foundationSynthEnv.CDK_DEFAULT_ACCOUNT;

const steps = [
  {
    name: "local safe-stop inventory zero-action plan (no diagnostics or cleanup)",
    args: [resolve("scripts/local-safe-stop-inventory.mjs")],
    cwd: process.cwd(),
  },
  {
    name: "owned local Docker worker acceptance zero-action plan (no cloud or process start)",
    args: [resolve("scripts/local-worker-acceptance.mjs")],
    cwd: process.cwd(),
  },
  {
    name: "recorded current worker candidate zero-action plan (no Docker or cloud)",
    args: [resolve("scripts/record-worker-candidate.mjs")],
    cwd: process.cwd(),
  },
  {
    name: "offline worker runtime smoke zero-action plan (no Docker or cloud)",
    args: [resolve("scripts/worker-runtime-smoke.mjs")],
    cwd: process.cwd(),
  },
  {
    name: "current source-bound local candidate zero-action plan (no Docker or cloud)",
    args: [resolve("node_modules/tsx/dist/cli.mjs"), resolve("scripts/prepare-worker-patch.ts"), "--plan-source-bound-candidate"],
    cwd: process.cwd(),
  },
  {
    name: "installed compiler official byte proof zero-action plan (no downloads)",
    args: [resolve("scripts/compiler-byte-proof.mjs")],
    cwd: process.cwd(),
  },
  {
    name: "frontend selected compiler byte proof zero-action plan (no downloads)",
    args: [resolve("scripts/frontend-compiler-byte-proof.mjs")],
    cwd: process.cwd(),
  },
  {
    name: "frontend development command zero-action plan (no server)",
    args: [resolve("frontend/scripts/vite-command.mjs")],
    cwd: process.cwd(),
  },
  {
    name: "Tokyo dated local candidate zero-action plan (no Docker or cloud)",
    args: [resolve("node_modules/tsx/dist/cli.mjs"), resolve("scripts/prepare-worker-patch.ts"), "--plan-20261017-candidate"],
    cwd: process.cwd(),
  },
  {
    name: "retired registry key zero-action observation plan (no downloads or trust change)",
    args: [resolve("scripts/retired-runtime-signature-observation.mjs")],
    cwd: process.cwd(),
  },
  {
    name: "retained local candidate triage zero-action plan (no Docker or cloud)",
    args: [resolve("node_modules/tsx/dist/cli.mjs"), resolve("scripts/candidate-vulnerability-triage.ts")],
    cwd: process.cwd(),
  },
  {
    name: "runtime package byte proof zero-action plan (no downloads)",
    args: [resolve("scripts/runtime-package-content-proof.mjs")],
    cwd: process.cwd(),
  },
  {
    name: "runtime signature coverage zero-action plan (no downloads)",
    args: [resolve("scripts/runtime-registry-signatures.mjs")],
    cwd: process.cwd(),
  },
  {
    name: "registry signature proof zero-action plan (no downloads)",
    args: [resolve("scripts/registry-signature-proof.mjs")],
    cwd: process.cwd(),
  },
  {
    name: "unsigned local IAM wire zero-action plan (no CLI or server)",
    args: [resolve("scripts/local-iam-wire-proof.mjs")],
    cwd: process.cwd(),
  },
  {
    name: "runtime SBOM public schema zero-action plan (no downloads)",
    args: [resolve("scripts/runtime-sbom-preview.mjs"), "--plan-public-schema"],
    cwd: process.cwd(),
  },
  {
    name: "runtime SBOM preview zero-action plan (no upload)",
    args: [resolve("scripts/runtime-sbom-preview.mjs")],
    cwd: process.cwd(),
  },
  {
    name: "current runtime SBOM in-memory privacy and lock proof (zero AWS/network)",
    args: [resolve("scripts/runtime-sbom-preview.mjs"), "--check-local"],
    cwd: process.cwd(),
  },
  {
    name: "CLI input parsing comparison zero-AWS plan (not permission acceptance)",
    args: [resolve("node_modules/tsx/dist/cli.mjs"), resolve("scripts/maintenance-log-diagnostics.ts"), "--plan-input-transport"],
    cwd: process.cwd(),
  },
  {
    name: "recorded frozen install zero-action plan (no downloads)",
    args: [resolve("scripts/record-fresh-install-proof.mjs")],
    cwd: process.cwd(),
  },
  {
    name: "existing reference comparison zero-AWS plan (no simulations)",
    args: [resolve("node_modules/tsx/dist/cli.mjs"), resolve("scripts/maintenance-log-diagnostics.ts"), "--plan-baseline-comparison"],
    cwd: process.cwd(),
  },
  {
    name: "durable local gate zero-action plan (no child or network)",
    args: [resolve("scripts/local-gate-proof.mjs")],
    cwd: process.cwd(),
  },
  {
    name: "existing stream IAM comparison zero-AWS plan (not permission acceptance)",
    args: [resolve("node_modules/tsx/dist/cli.mjs"), resolve("scripts/maintenance-log-diagnostics.ts"), "--plan-resource-existence"],
    cwd: process.cwd(),
  },
  {
    name: "dated current worker candidate zero-action plan (no promotion)",
    args: [resolve("node_modules/tsx/dist/cli.mjs"), resolve("scripts/prepare-worker-patch.ts"), "--plan-current-candidate"],
    cwd: process.cwd(),
  },
  {
    name: "pinned frontend build-helper notice inputs (zero network/AWS; not legal approval)",
    args: [resolve("scripts/frontend-helper-attribution.mjs")],
    cwd: process.cwd(),
  },
  {
    name: "published frontend-helper notice zero-network plan (no installation/upload)",
    args: [resolve("scripts/published-helper-license-proof.mjs")],
    cwd: process.cwd(),
  },
  {
    name: "reviewed public-coordinate advisory zero-network plan (unknown never passes)",
    args: [resolve("scripts/registry-advisory-proof.mjs")],
    cwd: process.cwd(),
  },
  {
    name: "missing other-platform license declaration zero-network plan (not source/notice approval)",
    args: [resolve("scripts/published-license-metadata.mjs")],
    cwd: process.cwd(),
  },
  {
    name: "fixed public base-image notice zero-network plan (no Docker or cloud calls)",
    args: [resolve("scripts/public-base-notice-proof.mjs")],
    cwd: process.cwd(),
  },
  {
    name: "operator scripts type check",
    args: operatorTypecheckArguments(process.cwd()),
    cwd: process.cwd(),
  },
  {
    name: "maintenance full-chain synthetic recovery rehearsal (zero AWS/network)",
    args: [resolve("node_modules/tsx/dist/cli.mjs"), resolve("scripts/maintenance-recovery-rehearsal.ts")],
    cwd: process.cwd(),
  },
  {
    name: "maintenance single-stack reference preflight (zero AWS; disabled schedule)",
    args: [resolve("node_modules/tsx/dist/cli.mjs"), resolve("scripts/maintenance-reference-preflight.ts")],
    cwd: process.cwd(),
  },
  {
    name: "maintenance existing-reference readiness zero-AWS plan",
    args: [resolve("node_modules/tsx/dist/cli.mjs"), resolve("scripts/maintenance-reference-readiness.ts")],
    cwd: process.cwd(),
  },
  {
    name: "proposed maintenance IAM matrix zero-AWS plan",
    args: [resolve("node_modules/tsx/dist/cli.mjs"), resolve("scripts/maintenance-policy-proof.ts")],
    cwd: process.cwd(),
  },
  {
    name: "maintenance log diagnostics zero-AWS plan (no acceptance substitution)",
    args: [resolve("node_modules/tsx/dist/cli.mjs"), resolve("scripts/maintenance-log-diagnostics.ts")],
    cwd: process.cwd(),
  },
  {
    name: "exclusive controller policy correction zero-AWS review plan",
    args: [resolve("node_modules/tsx/dist/cli.mjs"), resolve("scripts/controller-policy-review.ts")],
    cwd: process.cwd(),
  },
  {
    name: "bounded circuit denial zero-AWS plan",
    args: [resolve("node_modules/tsx/dist/cli.mjs"), resolve("scripts/circuit-denial-live.ts")],
    cwd: process.cwd(),
  },
  {
    name: "exclusive unexecuted controller change-set review zero-AWS plan",
    args: [resolve("node_modules/tsx/dist/cli.mjs"), resolve("scripts/controller-change-set-review.ts")],
    cwd: process.cwd(),
  },
  {
    name: "existing controller log delivery zero-AWS plan",
    args: [resolve("node_modules/tsx/dist/cli.mjs"), resolve("scripts/controller-log-delivery-proof.ts")],
    cwd: process.cwd(),
  },
  {
    name: "exclusive disabled controller policy rollout zero-AWS plan",
    args: [resolve("node_modules/tsx/dist/cli.mjs"), resolve("scripts/controller-policy-rollout.ts")],
    cwd: process.cwd(),
  },
  {
    name: "owned IAM boundary simulation zero-AWS plan",
    args: [resolve("node_modules/tsx/dist/cli.mjs"), resolve("scripts/iam-boundary-proof.ts")],
    cwd: process.cwd(),
  },
  {
    name: "independent controller completion zero-AWS plan (not original rollout success)",
    args: [resolve("node_modules/tsx/dist/cli.mjs"), resolve("scripts/controller-policy-completion-proof.ts")],
    cwd: process.cwd(),
  },
  {
    name: "live worker application proof zero-AWS plan",
    args: [resolve("node_modules/tsx/dist/cli.mjs"), resolve("scripts/verify-worker-release.ts")],
    cwd: process.cwd(),
  },
  {
    name: "owned live base manifest prefix zero-AWS plan (no Docker or image pull)",
    args: [resolve("node_modules/tsx/dist/cli.mjs"), resolve("scripts/live-base-manifest-proof.ts")],
    cwd: process.cwd(),
  },
  {
    name: "clean-source proof script syntax",
    args: ["--check", resolve("scripts/clean-source-build-proof.mjs")],
    cwd: process.cwd(),
  },
  {
    name: "Docker transient recovery zero-action plan and guards",
    args: [resolve("scripts/docker-transient-preflight.mjs")],
    cwd: process.cwd(),
  },
  {
    name: "fresh-install proof zero-network plan",
    args: [resolve("scripts/fresh-install-proof.mjs")],
    cwd: process.cwd(),
  },
  {
    name: "published-package proof zero-network plan",
    args: [resolve("scripts/published-license-proof.mjs")],
    cwd: process.cwd(),
  },
  {
    name: "circuit operator zero-AWS plan",
    args: [resolve("node_modules/tsx/dist/cli.mjs"), resolve("scripts/circuit-control.ts"), "--action", "open", "--expected-version", "0", "--reason", "dev-initialize"],
    cwd: process.cwd(),
  },
  {
    name: "circuit denial preparation zero-AWS plan",
    args: [resolve("node_modules/tsx/dist/cli.mjs"), resolve("scripts/circuit-denial-preflight.ts")],
    cwd: process.cwd(),
  },
  {
    name: "exact live image readiness zero-AWS plan",
    args: [resolve("node_modules/tsx/dist/cli.mjs"), resolve("scripts/live-image-readiness.ts")],
    cwd: process.cwd(),
  },
  {
    name: "one owned Basic scan refresh zero-AWS plan",
    args: [resolve("node_modules/tsx/dist/cli.mjs"), resolve("scripts/refresh-live-basic-scan.ts")],
    cwd: process.cwd(),
  },
  {
    name: "cached exact live archive scan zero-AWS plan",
    args: [resolve("node_modules/tsx/dist/cli.mjs"), resolve("scripts/scan-live-image-cache.ts")],
    cwd: process.cwd(),
  },
  {
    name: "Compute template comparison zero-AWS plan",
    args: [resolve("node_modules/tsx/dist/cli.mjs"), resolve("scripts/compute-template-review.ts")],
    cwd: process.cwd(),
  },
  {
    name: "exclusive disabled Compute patch rollout zero-AWS plan",
    args: [resolve("node_modules/tsx/dist/cli.mjs"), resolve("scripts/compute-patch-rollout.ts")],
    cwd: process.cwd(),
  },
  {
    name: "deployed controller source binding zero-AWS plan",
    args: [resolve("node_modules/tsx/dist/cli.mjs"), resolve("scripts/verify-controller-release.ts")],
    cwd: process.cwd(),
  },
  {
    name: "worker patch preparation zero-AWS/push plan",
    args: [resolve("node_modules/tsx/dist/cli.mjs"), resolve("scripts/prepare-worker-patch.ts")],
    cwd: process.cwd(),
  },
  {
    name: "one dated private patch promotion zero-AWS plan",
    args: [resolve("node_modules/tsx/dist/cli.mjs"), resolve("scripts/promote-worker-patch.ts")],
    cwd: process.cwd(),
  },
  {
    name: "Phase 11 live readiness zero-AWS plan",
    args: [resolve("node_modules/tsx/dist/cli.mjs"), resolve("scripts/phase11-live-readiness.ts")],
    cwd: process.cwd(),
  },
  {
    name: "Phase 11 existing-reference readiness zero-AWS plan",
    args: [resolve("node_modules/tsx/dist/cli.mjs"), resolve("scripts/phase11-reference-readiness.ts")],
    cwd: process.cwd(),
  },
  {
    name: "Phase 11 deployment diagnostics zero-AWS plan",
    args: [resolve("node_modules/tsx/dist/cli.mjs"), resolve("scripts/phase11-deployment-diagnostics.ts")],
    cwd: process.cwd(),
  },
  {
    name: "signed API acceptance zero-AWS plan",
    args: [resolve("node_modules/tsx/dist/cli.mjs"), resolve("scripts/signed-api-acceptance.ts")],
    cwd: process.cwd(),
  },
  {
    name: "signed ANALYZE acceptance zero-AWS plan",
    args: [resolve("node_modules/tsx/dist/cli.mjs"), resolve("scripts/signed-api-acceptance.ts"), "--operation", "ANALYZE", "--symbol", "TSLA", "--locale", "en"],
    cwd: process.cwd(),
  },
  {
    name: "slot reconciliation zero-AWS plan",
    args: [resolve("node_modules/tsx/dist/cli.mjs"), resolve("scripts/reconcile-stopped-slots.ts")],
    cwd: process.cwd(),
  },
  {
    name: "private analysis inspection zero-AWS plan",
    args: [resolve("node_modules/tsx/dist/cli.mjs"), resolve("scripts/inspect-analysis-job.ts"), "--job-id", `job_${"a".repeat(48)}`, "--symbol", "QLD", "--locale", "ja"],
    cwd: process.cwd(),
  },
  {
    name: "high-confidence secret patterns",
    args: [resolve("scripts/check-secrets.mjs")],
    cwd: process.cwd(),
  },
  {
    name: "local publication and documentation guards (no push)",
    args: javascriptHelperTestArguments(),
    cwd: process.cwd(),
  },
  {
    name: "local documentation links (no network)",
    args: [resolve("scripts/check-document-links.mjs")],
    cwd: process.cwd(),
  },
  {
    name: "production dependency licenses",
    args: [resolve("scripts/check-production-licenses.mjs")],
    cwd: process.cwd(),
  },
  {
    name: "service type check",
    args: [resolve("node_modules/typescript/bin/tsc"), "-p", resolve("tsconfig.services.json")],
    cwd: process.cwd(),
  },
  {
    name: "service and contract tests",
    args: [resolve("scripts/test-all.mjs")],
    cwd: process.cwd(),
  },
  {
    name: "controller single-file bundle",
    args: [resolve("scripts/build-controller-bundle.mjs")],
    cwd: process.cwd(),
  },
  {
    name: "controller no-network health smoke",
    args: [resolve("scripts/smoke-controller-bundle.mjs")],
    cwd: process.cwd(),
  },
  {
    name: "worker container-target compile",
    args: [resolve("node_modules/typescript/bin/tsc"), "-p", resolve("services/worker/tsconfig.build.json")],
    cwd: process.cwd(),
  },
  {
    name: "worker single-file bundle",
    args: [resolve("scripts/build-worker-bundle.mjs")],
    cwd: process.cwd(),
  },
  {
    name: "maintenance handler single-file bundle (not deployed)",
    args: [resolve("scripts/build-sweeper-bundle.mjs")],
    cwd: process.cwd(),
  },
  {
    name: "alarm circuit handler single-file bundle (not deployed)",
    args: [resolve("scripts/build-alarm-circuit-bundle.mjs")],
    cwd: process.cwd(),
  },
  {
    name: "backend emitted-module byte proof (in-memory; no cloud artifact changes)",
    args: [resolve("scripts/backend-module-proof.mjs")],
    cwd: process.cwd(),
  },
  {
    name: "emitted backend exact-version notice gap inventory (no text copy/upload)",
    args: [resolve("scripts/backend-notice-inventory.mjs")],
    cwd: process.cwd(),
  },
  {
    name: "one-shot worker smoke",
    args: [resolve("services/worker/bundle/main.mjs")],
    cwd: process.cwd(),
    env: {
      ...localEnvironment,
      APP_ENV: "local",
      JOB_ID: "01J00000000000000000000000",
      LOCAL_JOB_FIXTURE_JSON: readFileSync(resolve("shared/test_fixtures/qld-quote.json"), "utf8"),
    },
  },
  {
    name: "infrastructure type check",
    args: [resolve("node_modules/typescript/bin/tsc"), "-p", resolve("infrastructure/tsconfig.json")],
    cwd: process.cwd(),
  },
  {
    name: "infrastructure assertions",
    args: [resolve("scripts/test-infra.mjs")],
    cwd: process.cwd(),
  },
  {
    name: "foundation CDK synth",
    args: [resolve("node_modules/tsx/dist/cli.mjs"), resolve("infrastructure/bin/app.ts")],
    cwd: process.cwd(),
    env: foundationSynthEnv,
  },
  {
    name: "frontend type check",
    args: [resolve("node_modules/typescript/bin/tsc"), "-p", resolve("frontend/tsconfig.json")],
    cwd: process.cwd(),
  },
  {
    name: "frontend lint",
    ...frontendLintStep(),
  },
  {
    name: "frontend static build",
    args: [resolve("frontend/scripts/build.mjs")],
    cwd: process.cwd(),
  },
  {
    name: "frontend contract tests",
    args: frontendArtifactTestArguments(),
    cwd: process.cwd(),
  },
  {
    name: "fixture frontend release inventory (no upload)",
    args: [resolve("frontend/scripts/release-audit.mjs")],
    cwd: process.cwd(),
  },
  {
    name: "fixture frontend release sequence (no upload)",
    args: [resolve("frontend/scripts/release-plan.mjs")],
    cwd: process.cwd(),
  },
  {
    name: "loopback-only HTTP safety proof (no external network or AWS)",
    args: [resolve("frontend/scripts/local-http-safety-proof.mjs")],
    cwd: process.cwd(),
  },
];

for (const proposedStep of steps) {
  const step = directTypeScriptCheckStep(proposedStep, process.cwd());
  const timeoutMs = remainingLocalGateMs(gateStarted, performance.now());
  if (timeoutMs === 0) { console.error("LOCAL_GATE_DEADLINE_EXCEEDED"); process.exit(1); }
  console.log(`\n[check] ${step.name}`);
  const result = runTimedLocalCheckStep(step, { timeoutMs });
  if (!result.successfulExit) process.exit(result.exitCode);
}

if (remainingLocalGateMs(gateStarted, performance.now()) === 0) {
  console.error("LOCAL_GATE_DEADLINE_EXCEEDED"); process.exit(1);
}

console.log("\n[check] all local checks passed");
