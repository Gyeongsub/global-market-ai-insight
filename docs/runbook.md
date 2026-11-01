# Operations Runbook

### Default product is manual ChatGPT handoff — ADR 0019

For search preparation, do not start Docker, sign into AWS, enable job/display
flags or close the circuit. Open the local frontend, choose symbol/intent/locale,
copy the visible question and open ChatGPT; the owner pastes/sends. If clipboard
permission is unavailable, use manual selection/copy; do not change browser
security settings. No answer returns to the app. The optional simulation is local
synthetic data only. Stop owned preview processes after testing and verify local
listeners; retained cloud storage is not removed by this operation.
The following AWS procedures are separate learning/operations paths, not search
prerequisites. [ADR 0019](adr/0019-chatgpt-search-companion.md).

### Owner-only transition — 2026-10-25

The controller-only update has now executed exactly once. See the
[deployment/reconciliation evidence](evidence/PRIVATE_OWNER_DEPLOYMENT_2026-10-25.md)
before resuming; do not repeat deployment merely because the original tool's
terminal metadata comparison failed. Current deployed bytes, exact change-set
scope and owner GET/anonymous rejection were independently checked. The full
historical pre-update stack metadata was not recovered, and actual signed
second-principal rejection remains untested.

`scripts/private-owner-acceptance.ts` defaults to no effects. Its explicit
`--reconcile-read-only <reviewed-zip-sha256>` mode performs bounded reads only;
`--verify-three-get-requests <reviewed-zip-sha256>` additionally performs exactly
two owner GETs and one anonymous GET. No jobs or automatic retry. It checks that
the executed change set is at most 24 hours old, so do not weaken that condition
to reuse a historical receipt on a later day. Rebind fresh acceptance to the
actual current release instead. CLI/console were logged out after today's cloud
segment; local tests do not require login.

The [browser-session candidate](adr/0016-private-browser-session-preparation.md)
is not a production login service. No domain purchase or TLS downgrade is allowed
by the user's deferral. Do not wire its local factory into existing IAM routes,
grant workload roles auth-record access, create signing keys or add paid identity
services as a workaround. Fresh role isolation, key custody, issuer delivery,
edge/cache/revocation and abuse-cost review precede any such deployment.

Follow [ADR 0015](adr/0015-owner-only-aws-practice.md). Before deploying the new
controller, compare `ownerIamUserName` to the fresh operator IAM identity and
review the generated account-bound `PRIVATE_OWNER_USER_ARN`. No value means
deny-all, not anonymous access. Keep all gateway routes AWS_IAM, provider creation
and result display false, and the persisted circuit OPEN during the change.
Verify deployed bundle/configuration, then owner GET catalog/health and rejected
unsigned/non-owner requests. Never fix a 403 by removing the owner guard, IAM or
putting signing credentials in the browser. Role migration needs a new exact
principal design. IAM administrative rights and stolen sessions remain outside
this application check. No new controller rollout is claimed by local tests.

The bounded operator is `scripts/private-owner-draft.ts`: default arguments have
zero effects; `--prepare-one-unexecuted-review` creates, reviews and removes one
unexecuted change set, with no upload. `--execute-one-owner-update` is the separate
execution mode. It requires `GMAI_OWNER_GATE_RUN_ID` identifying a successful
current-source local-gate receipt less than one hour old, the existing temporary
`gmai-admin` profile and `GMAI_AWS_CLI_PATH`. Do not copy account identifiers into
tracked configuration. The caller identity selects the exact owner.

Execution preserves the deployed template except the controller zip key and owner
variable. Before uploading, the operator checks bootstrap bucket ownership/public
access blocking, uses a content-addressed key, If-None-Match and SHA-256, and verifies
stored checksum/length/encryption. It never overwrites an existing artifact or
retries an ambiguous write. One small deployment artifact may remain for deployment
or rollback; include its storage in cost accounting even if later preflight fails.
CloudFormation rollback stays enabled. Configuration/code updates are sequential;
jobs/display stay disabled and persisted circuit OPEN throughout. The operator
checks the exact terminal stack, deployed hash, owner environment and unchanged
worker/IAM/network-related template and runtime settings. A successful API response
alone is not acceptance. On ambiguous execution, reconcile the exact change set;
never repeat execution or delete an in-progress operation. Separately verify live
owner and unauthorized requests after deployment.

Implementation references: [CloudFormation Lambda updates](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-lambda-function.html),
[conditional S3 put](https://docs.aws.amazon.com/cli/latest/reference/s3api/put-object.html),
[S3 checksum metadata](https://docs.aws.amazon.com/cli/latest/reference/s3api/head-object.html).

### Local security/reflow update — 2026-10-24

The exact lint-only Zod override resolves the new HIGH advisory; current runtime
SBOM and reviewed target integrities remain unchanged. Do not disable the strict
lock binding to work around a security query failure: review changed public
coordinates first. Supported signing requests retain one POST/no retry and the
same deadlines; timeout acknowledgement is not remote task cleanup. Reflow was
observed in three locales at innerWidth 320 without changing user browser zoom.
Final whole proof, residue counts and retained release decisions are separate.
[Security repair](evidence/ZOD_SECURITY_REFRESH_2026-10-24.md),
[source/UI boundaries](evidence/LOCAL_BOUNDARIES_2026-10-24.md),
[safe stop](evidence/LOCAL_SAFE_STOP_2026-10-24.md).

### Resume after local code closure — 2026-10-23

The corrected compiler/client source passed its genuine whole/frozen gate.
Do not repeat unchanged image/simulator/registry checks to consume allowance or
infer release authorization. Read current release gates and dated evidence:
Maintenance positive controls/recovery, provider rights, authentication/abuse,
hosting TLS/billing, exact deployment-image/legal and clean-clone/CI/privacy
remain open. New source changes need their own proportionate verification.
[Final local scope](evidence/LOCAL_SAFE_STOP_2026-10-23.md).

### Browser acknowledgement is not job termination — 2026-10-23

The client now settles aborted waits even for a noncooperative supplied fetch/
reader, discards late data and attempts cleanup without hanging on it. Existing
request/poll bounds remain. Do not interpret AbortError/POLL_TIMEOUT as a stopped
worker or zero charge; reconcile the real job/task before manually retrying.
No automatic retry or live browser connection was enabled.
[Evidence and untested remote boundaries](evidence/BROWSER_API_DEADLINES_2026-10-23.md).

### Frontend compiler boundary — 2026-10-23

Use the supported frontend package build/dev/preview scripts. Dev/preview now
call the fixed Vite wrapper with no extra arguments; default wrapper execution
is a zero-action plan. Remove externally supplied NAPI_RS/ROLLDOWN/ESBUILD
override variables instead of bypassing their rejection. Bootstrap-only child
environment strips inherited credentials/preloads/proxies and internally sets
NAPI native version enforcement to 1. This does not protect parent preloads,
audit PATH or sandbox readable local files. Manual direct Vite/API use is not
covered. No global settings change is required.

`node scripts/frontend-compiler-byte-proof.mjs` defaults to no reads; explicit
`--execute-public-byte-proof` compares 11 selected installed files using six
fixed public npm reads, no install/execution/upload. Not a full dependency/
signature/source/legal or actual compiler-use attestation. Keep current lock
and reviewed target versions exact. [Evidence](evidence/FRONTEND_COMPILER_BOUNDARY_2026-10-23.md).

### Resume gate after safe stop — 2026-10-22

Start with the corrected source's genuine isolated frozen whole verification.
The last whole run failed; separate 62 frontend and 33 HTTP passes are not a
replacement receipt. Provision/verify a supported patched runtime separately:
the temporary portable tool is removed at closure; the managed Codex runtime
was not upgraded. No AWS login is needed for this local gate. Keep cloud jobs
disabled/OPEN and do not repeat unchanged image scans or relax gate deadlines.
[Exact final scope](evidence/LOCAL_SAFE_STOP_2026-10-22.md).

### Patched local development tooling — 2026-10-22

Use the current frozen lock (Vite 8.2.4/Rolldown 1.2.14) with a supported patched
Node. Do not start a stale Vite 8.2.1 node_modules tree, use an old audit receipt,
expose dev/preview on all interfaces or enable lifecycle scripts to bypass a
failed gate. Current npm zero-match and whole producer notice checks do not
clear worker OS findings, native-source/legal or publication gates.
[Exact repair and retained failures](evidence/VITE_SECURITY_REFRESH_2026-10-22.md).

### Local CA/Node patched candidate — 2026-10-22

The October 21 quarantine below applies to that old image, not a clean receipt
for a replacement. The patched local base now has independent CA package/bundle
and effective Node store evidence plus a fresh local scan/runtime. Real cloud
execution stays disabled/OPEN; local success is not promotion authorization.
Use a supported patched LTS for security operators (22.x >=22.23.4 or 24.x
>=24.22.1). The guard does not install/upgrade Node or authenticate its binary;
verify the official download and publisher separately. Do not bypass it with a
faked version, old receipt, ignore rule or altered TLS security setting.
[Exact commands' scope and evidence](evidence/WORKER_CA_REMEDIATION_2026-10-22.md).

### CA advisory quarantine — 2026-10-21

Do not launch/promote the current worker image: DSA-6572-1 is UNKNOWN severity,
not a clean scan. `fixed` describes an available package fix, not this installed
version. Keep jobs/display disabled and circuit OPEN; do not borrow an earlier
runtime receipt or suppress UNKNOWN/DSA findings. Review the fixed CA material,
exact base and effective Node CA-store configuration, then repeat exact-image
scan and bounded offline runtime before a separately reviewed rollout. A proposed
base remained unverified and was not adopted; no Windows trust setting changes.
[Actual blocked observation and safe investigation](evidence/WORKER_CA_ADVISORY_2026-10-21.md).

### Retained-I/O process expiry — local only, 2026-10-20

The executable worker now keeps a fixed unref'ed five-minute ceiling after its
main promise settles. It can terminate a responsive process with retained I/O
without waiting on another transport or logger. A process failure is not proof
an earlier job result/write was rolled back; never release capacity or overwrite
terminal state from that signal alone. The application timer cannot preempt a
blocked event loop or host failure; independently verified ECS/maintenance stop
remains required. No environment override or AWS rollout is part of this change.
[Reproduction and precise verification](evidence/WORKER_PROCESS_CEILING_2026-10-20.md).

### Operator environment rejection — local correction, 2026-10-20

AWS child processes receive OS bootstrap plus the fixed temporary profile and
existing explicit config location only. Unknown credentials/proxies/Python/CA/
tool settings and execution opt-ins are not inherited. Conflicting case aliases
or malformed retained values fail before dispatch with a fixed safe category.
Do not bypass this using broad environment inheritance. Default readable files,
profile credential_process and already loaded tokens remain separate trust/
revocation boundaries. Credential-free synthesis does not receive a profile.
[Exact tested scope](evidence/OPERATOR_CHILD_ENVIRONMENT_2026-10-20.md).

### Worker did not acknowledge cancellation — local only, 2026-10-20

Provider/model/body/backoff waits now race the same monotonic acknowledgement
budget; expiry cannot launch the next stage. Model requests remain single
attempt; provider GET retries remain capped at three and parent cancellation
cannot retry. A timeout is not proof the remote request stopped or was free.
Do not retry an ambiguous model/RunTask or release slots solely from timeout.
The Linux fixture requires schema 3/45 lifecycle cases plus the unchanged 18
entrypoints; a historical schema-2 receipt does not clear this source. Current
AWS deployment, role/network/cancellation and billing acceptance are separate.
[Exact implementation and limits](evidence/WORKER_UNCOOPERATIVE_DEADLINES_2026-10-20.md).

### Cumulative create timeout — local only, 2026-10-19

The new 12-second controller request budget does not reset on slot fallback.
After it expires, no later launch, attachment or compensation is initiated;
already-accepted effects can remain ambiguous. Do not clear a slot based only
on HTTP timeout or retry writes blindly. Independently reconcile exact records/
tasks under the existing approved recovery procedure. Lambda remains 15 seconds;
this local guard is not deployed or measured cloud latency acceptance.
[Tested contract](evidence/CONTROLLER_INVOCATION_BUDGET_2026-10-19.md).

### Late AWS acknowledgement — local correction, 2026-10-19

Repository/ECS timeouts now discard late normal replies and prevent the next
stage. A timeout does not establish that an admission, claim, update or task
launch failed on AWS. Do not retry writes, erase occupied slots, fabricate task
references or relabel ambiguous results as success. Independently reconcile
the exact record/version/task within the existing least-privilege procedure.
Changes are not deployed and do not clear Maintenance permission acceptance.
[Scope](evidence/PHASE12_CALL_AND_ENV_BOUNDARIES_2026-10-19.md).

### Read-only local ending check — 2026-10-18

The final implementation passed separate 88-step/1,246-test native and genuine
frozen-install checks; the earlier timeout stays failed. Read the
[exact distinct source/receipt scopes](evidence/PHASE12_LOCAL_GATES_2026-10-18_MAINTENANCE.md)
and [independent ending/auth limitations](evidence/LOCAL_SAFE_STOP_2026-10-18_MAINTENANCE.md)
before resuming. Do not use those as IAM/provider/image/publication approval.

From the workspace, the fixed local-safe-stop inventory defaults to an inert
plan. `node scripts/local-safe-stop-inventory.mjs --execute-local-read-only`
performs bounded Windows reads; add the single actual ephemeral login callback
port with `--callback-port` when needed. A nonzero exit or unknown observation
is not an empty inventory. This tool never performs cleanup or opens AWS/Docker.
Do not respond to a residue by blind process killing, credential-cache deletion
or recursive filesystem cleanup. Preserve unrelated work and independently
verify exact ownership before any repair. Empty parents/review artifacts and
assistant workers are explicit exclusions. A passing local report never clears
cloud, global-session or publication gates. [Exact scope and actual negative/
positive observations](evidence/LOCAL_SAFE_STOP_INVENTORY_2026-10-18.md).

### Maintenance cancellation and elapsed budget — 2026-10-18

The prepared, undeployed sweeper and slot reconciler now enforce their existing
20s/10s limits around every SDK call, independently of UTC job deadlines.
Late stopped-task evidence cannot start another mutation. An update/delete
whose acknowledgement is late may already have happened: retain ambiguity,
use independent current reads, and never retry or free capacity merely from
the summary counters. In-flight cancellation cannot undo accepted requests.
The 21-scenario synthetic rehearsal is not AWS recovery/IAM acceptance.
[Correction and exact verification scope](evidence/PHASE11_MAINTENANCE_DEADLINE_2026-10-18.md).

### Fixture preview policy — 2026-10-18 resumed

Production preview now shares the exact fixture CSP and permissions policy
with the disabled hosting template. Use preview, not the HMR development
server, to validate the built product under `connect-src 'none'`; keep both
loopback-only. The actual fixed HTTP proof checks headers on HTML and assets
and the stricter plain-text notice route, then closes its two servers.
Missing header/HMR proof fields cannot satisfy a new whole gate. No loopback
result verifies remote TLS/HSTS/origin access or authorizes deployment.
[Correction, observations and limits](evidence/LOCAL_FIXTURE_POLICY_2026-10-18_RESUME.md).

### Resumed owned local acceptance — 2026-10-18 Tokyo

Prefer the fixed `local-worker-acceptance.mjs` workflow for a new local-only
worker build and offline runtime proof on this Windows host. Its default is a
zero-action plan. Explicit invocation is `node --import tsx
scripts/local-worker-acceptance.mjs --execute-local-acceptance` from this
workspace, with the project's pinned installed toolchain. Read the
[entrypoint/ownership/cleanup contract](evidence/WORKER_ENTRYPOINT_ACCEPTANCE_2026-10-18_RESUME.md)
first. It refuses already-running Docker, verifies vendor signatures and exact
process ownership, preserves only validated stopped socket directories,
performs one source-bound build/scan and one offline fixture, then stops and
checks cleanup. No AWS login, role/profile choice or registry login is needed.

Do not edit source during the run, force adoption of another instance, repeat
an existing source tag, or convert a failed receipt into a pass. Inspect the
separate child receipts and independently verify local shutdown. The unchanged
fresh-install gate remains separate. No result authorizes deployment or public
data display. The actual combined-run result is not asserted by these steps.

### Source-bound offline runtime preparation — 2026-10-18 Tokyo

On this Windows host, even a successful normal Docker stop can leave unusable
transient socket entries for the next start. Before **each** planned start,
verify Docker Desktop/backend processes are zero, then use the stopped-only
`docker-transient-preflight.mjs --execute-stopped-socket-backup` guard. It
preserves at most two exact socket-only directories as recoverable backups;
never run it while Docker is active, broaden its path/content allowlist, reset
Desktop, prune images/volumes or alter security settings. If normal stop is
unresponsive in this known failed startup, the official bounded Desktop force
stop can be used for today's owned instance, followed by independent zero
process verification. Recovery is not proof of a permanent upstream fix.

`prepare-worker-patch.ts --plan-source-bound-candidate` and the default
`record-worker-candidate.mjs` / `worker-runtime-smoke.mjs` are zero-action plans. Explicit local candidate
preparation and the isolated runtime fixture do not authorize ECR promotion,
cloud enablement or publication. They derive a current Tokyo-day/full-source
local identity, reject overwriting it and require exact closing rechecks. Read
the [41-scenario scope and cleanup contract](evidence/WORKER_RUNTIME_ACCEPTANCE_2026-10-18.md)
before use. Do not relabel an old image or reuse a scan after source changes.
With the verified Docker path configured, run the recorded source-bound local
build/scan first, then the fixed runtime smoke, without an intervening source
edit. Incomplete/failed receipts never clear the runtime gate. Default commands
do not need Docker running; no normal workflow automatically reauthenticates AWS.
The October 18 corrected source passed a 41-case actual Linux Node 22 smoke and
the separate 86-step fresh-install gate; [exact snapshot/remaining boundaries](evidence/PHASE12_LOCAL_GATES_2026-10-18.md)
and [independent safe stop](evidence/LOCAL_SAFE_STOP_2026-10-18.md) are required
context, not approval to use the retained image for a later changed source.

### Current local preparation — 2026-10-17 Tokyo

Keep admission/display false and the persisted circuit OPEN. The current local
deadline correction blocks new expired provider/model stages and late success;
it has not been deployed. A pre-correction local candidate is retained only as
dated evidence. Do not reuse its scan/ID to promote current source or infer a
hard upstream spend cap. Read the [stage boundary](evidence/WORKER_DEADLINE_BOUNDARY_2026-10-17.md)
and [candidate scope](evidence/PHASE12_CURRENT_WORKER_CANDIDATE_2026-10-17.md).
The source/whole proof and independent final cloud/local closure must be
recorded separately. No normal workflow requires reopening AWS or Docker merely
to demonstrate these local tests.

### Historical disabled recovery-preparation checkpoint — 2026-10-06

Keep jobs/display false and the persisted circuit OPEN. The local recovery
rehearsal/reference-only stack is ready for review, **not deployment or real
recovery acceptance**. Two proposed log allows remain unverified; the current
controller circuit-check simulation denied and its local condition correction
is not deployed. Resolve those findings before enabling admission. The old
image-only patch operator must reject this IAM change. Read the
[bounded Maintenance plan](MAINTENANCE_RECOVERY_DRILL.md) and
[actual preparation evidence](evidence/PHASE11_MAINTENANCE_PREPARATION_2026-10-06.md).
Do not reuse old task/slot/owner evidence or substitute a synthetic success for
a controlled actual STOPPED/conditional-release proof. No schedule is enabled.
[Safe handoff](evidence/LOCAL_SAFE_STOP_2026-10-06.md) records the 724-test frozen
snapshot, independent disabled/empty/OPEN/private reads, both login sign-outs
and local cleanup. The two unresolved permission gates remain blocked.

### Historical patched/denied admission checkpoint — 2026-10-05

One exclusive disabled Compute update and actual-live image/controller proofs
passed. HIGH/CRITICAL/UNKNOWN/secrets zero, LOW eight/MEDIUM 23 remain. Complete
source/dependency/license/publication gates are separate.
[Patch acceptance](evidence/PHASE12_COMPUTE_PATCH_ACCEPTANCE_2026-10-05.md).

Real Stage C passed one typed 503/CIRCUIT_OPEN and consistent unique job absence
before/after. Admission restored: jobs/display false, persisted OPEN/11, zero
tasks/pending/services/slots, unchanged private IAM API references. No circuit
close or provider/model/task launch. The default-zero operator enforces fresh
code/image proof, one POST/no retry, revision-bound restoration and independent
closing reads. Never infer cleanup from HTTP, reuse a historical version or
rerun merely for demonstration. Read
[denial acceptance](evidence/PHASE11_CIRCUIT_DENIAL_ACCEPTANCE_2026-10-05.md) and
[read-only IAM matrix](IAM_BOUNDARY_VERIFICATION.md).
Full session stop and the successful 695-test frozen-install snapshot have
[separate handoff evidence](evidence/LOCAL_SAFE_STOP_2026-10-05.md). Subsequent
documentation is separately checked; no whole-repository publication clearance.
Keep GitHub/publication disabled pending final approval/full review.

### Historical disabled patch review — 2026-10-04 evening

No Compute update was executed: exact resolved policy/dependency details
remain unverified. All owned preparation change sets were removed. Jobs/
display stay false, OPEN/11, with tasks/services/slots zero. Resume with a new
bounded policy/task-ARN comparison, not job enablement. The stopped-only Docker
socket helper recovered a healthy normal restart without data/security-policy
changes; Docker and console/CLI sessions were then closed. Read
[evening review](evidence/PHASE12_COMPUTE_PATCH_REVIEW_2026-10-04_EVENING.md) and
[safe stop](evidence/LOCAL_SAFE_STOP_2026-10-04_EVENING.md).

### Historical cloud checkpoint — completed temporary drill (2026-10-04)

The dedicated two-target reference path passed fresh core/reference readiness,
an exact 17-addition diff, deployment, the real synthetic alarm signal and
verified teardown. OPEN/9 → operator CLOSED/10 → automated OPEN/11 took 79
seconds. Both temporary stacks and all scoped resources, the owned synthetic
stream and two new exact bootstrap S3 object versions were removed. Final
jobs/display were false and running/pending tasks/services/occupied slots zero.
CLI and console logout were verified. Read
[the acceptance and cleanup evidence](evidence/PHASE11_ALARM_ACCEPTANCE_2026-10-04.md).
These are dated observations, not reusable mutation versions or account-wide
zero-cost proof. Worker/controller source changes were undeployed at that checkpoint;
the 2026-10-05 checkpoint above supersedes this historical release status.

The fresh account had Lambda total/unreserved concurrency 10/10. Only this
development reference-only drill explicitly used
`GMAI_ALLOW_UNRESERVED_ALARM_DRILL=true`; ordinary synthesis still reserves one
and the main app rejects the flag. This omits a function reservation, not a
function-level concurrency-one cap or a quota increase. Refresh and review
[ADR 0014](adr/0014-low-quota-temporary-alarm-drill.md) before any future use.

`pnpm operations:circuit-denial-preflight` now prepares Stage C with zero
AWS/API calls and refuses execution arguments. The local composed controller
test verified rejection before persistence/launch and continued private status
reads, but **live Stage C had not run at that checkpoint**. The signed helper accepts one exact
503/CIRCUIT_OPEN response only; its task/slot/restore facts stay unverified
until independent live evidence is collected. Never infer cleanup from HTTP.
See [the preparation record](evidence/PHASE11_CIRCUIT_DENIAL_PREPARATION_2026-10-04.md).

The 2026-10-04 current-database rebuild found three HIGH OS findings in the
superseded base; refreshing only the local Dockerfile removed those HIGH
findings in the new local candidate. **An old successful scan, a pinned digest,
non-root/read-only metadata or this local candidate does not clear the live
ECR image.** Before any new execution enablement (including Stage C), freshly
scan the exact registry digest referenced by the live task definition and
review current worker/controller compatibility plus the exact deployment
diff. Keep execution/display false and the circuit OPEN until these pass.
The zero-call denial preflight now explicitly records this unresolved gate.

Docker Desktop's 2026-10-04 Inference-manager startup failure was recovered
without factory reset or data deletion: only two validated transient runtime
directories were moved to same-parent backups before restart. Preserve those
backups; never restore their stale sockets over a working runtime or delete
the data root/VHDX. [Recovery boundaries](evidence/DOCKER_RUNTIME_RECOVERY_2026-10-04.md).
The later normal restart reproduced the same endpoint failure. The eight
failed owned processes were stopped after exact path/PID/start-time validation,
and both transient folders were again preserved and recreated empty. Docker
is stopped at handoff; unattended restart reliability and an official durable
Desktop/Windows compatibility fix remain unresolved.

### Reference-only alternative — historical setup (2026-10-03)

The ordinary five-stack packet and separate two-stack packet are different
paths. Do not manufacture absent exports by implicitly updating base stacks.
Today's complete console name-only comparison lacked four of seven required
names; values and the prior failure cause were not verified.
See [ADR 0013](adr/0013-reference-only-operations-drill.md).

`pnpm operations:phase11-reference-preflight` performs zero calls, uses synthetic
references, synthesizes only Operations/AlarmCircuit and removes temporary
output. It rejects `--execute`. `pnpm operations:phase11-reference-readiness`
also defaults to zero calls; `-- --execute-read-only` requires fresh temporary
authentication and at most twelve metadata reads for exact ownership, all four
IAM routes/integration, healthy disabled controller, on-demand table and logs.

**Both core and reference readiness must be fresh and successful** before a
reference-specific diff. They are independent passes: at most eleven plus
twelve reads, not one twelve-read proof. The shared runner bounds each instance
to twelve reads/three minutes, thirty seconds per call, one attempt and private
output. Endpoint/TLS/debug overrides, extra/duplicate options, widened resources
and writes fail before process launch. CLI provenance/profile configuration
still requires review.

Match the fresh private account/API/fingerprint and explicitly select
`infrastructure/bin/phase11-drill-app.ts`; the main app refuses reference-only
selection. The fingerprint is not authentication, age proof or deployment
approval. Never save private snapshots/identifiers in repository files. No base
stack or worker image is required here, but future metric filters attach to
existing logs. Current pricing, exact account-specific diff, bounded circuit/
log drill and two-hour teardown remain separate gates.

### Phase 11 sanitized live-readiness gate

Before an account-specific Operations/AlarmCircuit diff, run
`pnpm operations:phase11-readiness` locally. This default mode performs zero
AWS calls. After a fresh temporary `gmai-admin` login, add
`-- --execute-read-only` for at most 11 sanitized reads. If the AWS CLI is not
on `PATH`, set the uncommitted `GMAI_AWS_CLI_PATH` to its absolute executable
path.

The result never prints account IDs, ARNs, endpoints, image addresses/digests
or job owners. It fails closed unless the USD 5 monthly Budget, healthy base
stacks, absent Phase 11 target stacks, disabled internal/display flags, zero
tasks/services/slots, hardened digest-pinned worker and verified `OPEN` circuit
all agree. `readyForAccountSpecificDiff=true` authorizes only an exact diff;
`readyForDeployment` remains false. See the
[2026-10-02 tool evidence](evidence/PHASE11_LIVE_READINESS_TOOL_2026-10-02.md).

Missing flags, spend figures, slot reads or collection fields are not safe
defaults. A continuation token means the bounded single page is incomplete;
do not treat its count as zero or silently increase the read budget. Both spend
figures must be known and below USD 5. This remains a delayed observation.

Before an exclusive Phase 11 target retry, compare every target-template
`Fn::ImportValue` with a fresh complete CloudFormation export inventory in
memory using `evaluatePhase11Imports`. The local preflight supplies import
counts but cannot prove live availability. Missing exports are one possible
failure category, not the established cause of the earlier rollback. Do not
deploy upstream stacks as a shortcut.

`pnpm operations:phase11-diagnostics` defaults to zero calls. Its explicit
stdin mode classifies bounded private process/events/change-set evidence
without echoing or saving it. Signal categories never establish the cause or
authorize a retry. See the [follow-up boundary and verification record](evidence/PHASE11_LOCAL_DEPLOYMENT_SAFETY_2026-10-02.md).

Historical successful cloud safety checkpoint (2026-10-02, earlier session): the
empty failed Operations stack was removed; both Phase 11 targets were absent,
tasks/services/slots zero, execution/display false and circuit OPEN/version 9.
CLI and console logout were confirmed. [Safe-stop evidence](evidence/LOCAL_SAFE_STOP_2026-10-02.md).
The later local follow-up could not authenticate a new read and made no cloud
mutation. Earlier QLD/ja acceptance is recorded in
[its dated evidence](evidence/PHASE8_QLD_JA_ACCEPTANCE_2026-09-13.md).

### Exact private analysis inspector

`pnpm exec tsx scripts/inspect-analysis-job.ts --job-id <exact-job-id> --symbol QLD --locale ja` previews zero calls. After fresh STS identity/region verification, use temporary `AWS_PROFILE=gmai-admin`, set `GMAI_VERIFIED_ACCOUNT_ID` from that verified identity and add `--execute` for at most two exact reads. This supplied value is an operator prerequisite, not independent STS proof. Output is boolean-only. A failed check does not prove task termination; this command neither stops tasks nor releases slots. Follow exact-STOPPED reconciliation separately. Never publish private identifiers or raw records.

Latest checkpoint (2026-09-12): single TSLA/en ANALYZE succeeded, exact task STOPPED/exit 0, slot reclaimed; restore deployment completed, final circuit OPEN/version 7 and tasks/slots 0. CLI logout and user console logout confirmed. See [evidence and final-query limitations](evidence/PHASE8_TSLA_EN_ACCEPTANCE_2026-09-12.md). Never reuse the historical version without a fresh read. The reusable `analysis-inspection.ts` helper checks only private schema/metadata/canonical policy content; it does not retrieve an independent market quote or replace exact task verification.

## Circuit learning drill (OPEN initialization executed 2026-09-06)

Execution note: the OPEN initialization portion was completed on 2026-09-06. The user reviewed the dry-run, conditionally wrote version 1 with reason `dev-initialize`, then independently read `effectiveState=OPEN` and `verifiedRecord=true`. The 2026-10-04 bounded alarm drill subsequently exercised one operator CLOSE and automated reopen; that does not make a new reset safe without fresh state and scope review.

The distinction to learn is: **rate** limits new admissions per minute; **capacity slots** limit outstanding admitted work across minutes; **OPEN circuit** denies new admissions; **Budget** sends delayed notifications and is not a spending lock. Already-admitted work is not cancelled by OPEN.

1. After separately approved deployment, verify the temporary IAM user's account and Tokyo region. Keep provider jobs/display disabled. Do not paste credentials into this project or chat.
2. Preview the operation locally with the command below. It makes zero AWS calls. The user should inspect the OPEN state and version rather than merely copy a cloud command.
3. Only after explicit mutation approval, execute initialization with the verified `gmai-admin` temporary profile and the additional `--execute` flag. Version 0 is for absent initialization; never guess an existing version.
4. Read status with `--action status --execute`; a missing/invalid record reports effective OPEN and `verifiedRecord=false`, not verified stored state. Resolve access/read failures before initialization or reset.
5. Closing requires a fresh observed version, `--action close`, a non-sensitive reason code and `--confirm-close`, plus separate approval. Keep the exposure flags false throughout this initial drill. A conflict requires a fresh read, not an unconditional overwrite.
6. Reopen with a fresh version and verify health. An effective OPEN result does not alone prove a successful operator write: inspect the verified record/version as well.

```text
pnpm exec tsx scripts/circuit-control.ts --action open --expected-version 0 --reason dev-initialize
```

Do not delete slot records to restore capacity based only on elapsed time. The prepared reconciler requires exact terminal-job and actual ECS STOPPED evidence. It is not yet deployed or scheduled. Missing task ARN, expired job/evidence or conflicting ownership requires reviewed recovery. Drain slots before changing their count. Do not claim automatic stale-job cleanup is active until the operations stack and its drill are actually verified.

## Automatic alarm-to-OPEN implementation (temporarily verified, now removed)

The `AlarmCircuitStack` is separate from the maintenance schedule and is
not part of default synthesis. A future reviewed deployment must deliberately
set both `GMAI_ENABLE_ALARM_CIRCUIT_AUTOMATION=true` and
`GMAI_ACKNOWLEDGE_ALARM_CIRCUIT_COST=true` together with the existing API and
operations gates. This is not standing approval to deploy those resources.

The rule accepts only six project operations alarms entering `ALARM`: three
basic API/Lambda alarms and three optional task-launch/provider/model alarms.
The optional three exist only when their separate custom-metric cost gate is
enabled; default Operations synthesis has no log metric filter.
The Lambda rechecks account, Tokyo Region, exact alarm ARN and allowlist, then
conditionally opens only `control_circuit`. It cannot close the circuit, launch
a task, read a provider secret or publish a notification. An already-open
circuit is a successful no-op. A version conflict succeeds only after a fresh
read proves a concurrent OPEN; otherwise the invocation fails without an
unconditional retry or overwrite.

For a future approved drill: first capture a reviewed resource/IAM/cost diff;
verify internal jobs false and exact task/service/slot counts zero; then obtain
separate approval for one freshly versioned temporary `CLOSED` write. Create no
provider job. Immediately publish the one bounded two-event synthetic log batch
and require the exact alarm automation to restore `OPEN` within two evaluation
periods. If it does not, manually restore OPEN from a fresh read and abort
without repeating the signal. Verify the stored reason/actor/version without
publishing account or alarm ARNs; optionally prove a new job is blocked with
zero task launch under its own approval; then remove the two target stacks
within two hours and verify the rule, Lambda, log group, metric filters and
alarms are gone. An alarm returning to `OK` never closes the circuit
automatically.

The exact staged call/resource/abort/teardown bounds are in the
[Phase 11 controlled live drill plan](PHASE11_CONTROLLED_LIVE_DRILL_PLAN.md).
Stage C's temporary internal-job enablement is deliberately a second approval,
not part of the signal-only alarm test.
Stages A–B were completed and torn down on 2026-10-04; Stage C, notifications
and maintenance remain separate unresolved scopes. Today's authorization does
not create standing authority to expose a product or restore recurring resources.

## Signed PRICE acceptance and prepared ANALYZE acceptance

Update 2026-09-10: the first signed ANALYZE/QLD/ko drill succeeded and its stored result and exact STOPPED task were verified. Closing state was internal false/display false/circuit OPEN version 5, tasks/services/slots zero. See [the live evidence](evidence/PHASE8_ANALYZE_ACCEPTANCE_2026-09-10.md). Historical version numbers below must not be reused for another mutation.

The single signed PRICE drill succeeded on 2026-09-07 and ended with circuit OPEN/version 3, internal jobs disabled and no running tasks/services/occupied slots. These are dated observations; read current state before another run. ANALYZE tooling was prepared locally on 2026-09-09; see [the Phase 8 checkpoint](evidence/PHASE8_ANALYZE_PREPARATION_2026-09-09.md).

The local acceptance tools are dry-run-first. They never print credentials, provider results, task ARNs or the API endpoint.

```powershell
pnpm exec tsx scripts/signed-api-acceptance.ts
pnpm exec tsx scripts/reconcile-stopped-slots.ts
```

A live drill requires a fresh identity/region/Budget check, a reviewed Compute-only deployment with `GMAI_ENABLE_API=true` and `GMAI_ENABLE_INTERNAL_JOBS=true`, and authorization covering the concrete cost/security scope. Existing user authorization may cover a bounded small-cost test. Read the current circuit version immediately before closing it; never reuse a version from this document. Run exactly one acceptance, reopen the circuit using a fresh version, verify zero running tasks/services, and return the deployed internal-job flag to `false`. Slot recovery may execute only with `--confirm-stopped-only`; it releases nothing unless the exact owner job is terminal and the exact ECS task is observed `STOPPED`.

For a zero-call ANALYZE plan (explicit single symbol and locale, supported since 2026-09-11):

```powershell
pnpm exec tsx scripts/signed-api-acceptance.ts --operation ANALYZE --symbol TSLA --locale en
```

After the live preflight and reviewed enable/restore plan, add `--execute --confirm-one-task --confirm-one-bedrock-call`. The tool does not deploy, change the circuit, reconcile slots or perform rollback. It also does not verify the stored analysis content: separately validate only the exact submitted job's result in memory, emit sanitized validation booleans, and never print its price, raw result or prompt. Confirm kind, symbol, locale, model/prompt provenance, timestamp, disclaimer, QLD risks and task STOPPED. A timeout, connection failure or nonzero exit requires inspecting that exact job/task before another run; do not rerun the POST to diagnose an ambiguous launch.

## Safety first

Before any cloud action, record masked account/region/environment and confirm the USD 5 notification is active. Never paste root, AWS, provider, or email credentials into logs or issue text.

## New jobs fail

1. Check circuit state and controller error metrics.
2. Check only correlated logs using request ID and `jobId`. The local
   2026-09-29 worker hardening makes a bounded `jobId` available on both
   success and failure logs; a missing value means the supplied identifier was
   absent or unsafe, not that no worker was launched. Do not search by raw
   provider payload, secret, task override dump or exception text.
3. Separate validation, DynamoDB, `RunTask`, provider and Bedrock failures.
4. Do not widen IAM broadly. Reproduce the exact denied action and adjust the smallest resource/action condition.

The tested local query catalog and its cost/privacy boundary are documented in
[bounded observability queries](observability-queries.md). It creates query
plans only; running any Logs Insights query remains an explicit live AWS action.

## Provider auth/rate-limit failure

1. Open the application circuit manually if failures are sustained.
2. Confirm no new task launches while job reads remain available.
3. Inspect provider account limit without exposing the key.
4. Rotate a suspected credential and update only the secret store.
5. Run one bounded smoke request before manual reset.

## Bedrock failure

1. Confirm model lifecycle, region availability and account access.
2. Check token cap, schema rejection and throttling separately.
3. Never bypass output validation to restore service.
4. Keep PRICE available only if circuit policy explicitly permits split behavior; v1 may open the shared circuit.

## Stale job

The locally tested 2026-09-23 sweeper core is **not scheduled or deployed**. It reads only exact occupied slot keys and cannot infer success from a deadline alone. A missing task ARN or an unconfirmed stop must retain capacity for operator review. Do not run it against live AWS until the handler/IAM/schedule and cost/security gates are reviewed. See [Phase 11 local evidence](evidence/PHASE11_LOCAL_OBSERVABILITY_2026-09-23.md).

1. Compare `deadlineAt`, status, version and task ARN.
2. Describe the exact project task and verify its `startedBy` plus sole `worker` override's full `JOB_ID` against the slot owner. An ARN in the same cluster alone is insufficient proof.
3. Stop only an overdue running task.
4. Conditional-update the matching non-terminal job to `TIMED_OUT`.
5. Verify the worker cannot overwrite the terminal record.

## Circuit reset

1. Record state, reason, actor and time.
2. Resolve or isolate the triggering condition.
3. Run one controlled probe.
4. Reset manually with explicit confirmation.
5. Watch task count, errors and spend after reset.

## Fixture frontend release or abort (future, not an executable procedure)

The frontend stack is a disabled local template; no hosting release has been approved. This checklist must be completed and turned into an exact, reviewed operator procedure **before** any CloudFront/S3 write. It does not authorize a deployment or a rollback.

1. Confirm the intended AWS account, region, Budget and cost estimate; distinguish CloudFront pay-as-you-go from any separately subscribed flat-rate plan. Resolve the default CloudFront certificate's TLS minimum trade-off and confirm fixture-only/public content approval.
2. Review the exact synthesized resource diff and local bundle inventory. Keep the browser disconnected from the IAM-protected API; recheck no secret, raw provider result, internal URL, source map or unreviewed image metadata is in the built bundle.
3. Preserve the previous complete built bundle and its matching reviewed audit JSON. The local release planner may verify their bytes, but `rollback.available=false` remains correct until remote state and execution are independently checked.
4. If a release is later approved, upload new immutable assets first, then the stable image, and HTML last. Verify each remote object's bytes and cache metadata before HTML. Do not delete old hashed assets merely because the new HTML no longer references them.
5. On partial failure, stop before enabling or further advertising the distribution. Record which exact objects, headers and distribution settings changed; do not retry blindly or assert the previous release is restored. Obtain a scoped rollback decision based on both archived and remote evidence.
6. For approved teardown, first prevent public delivery, wait for CloudFront's disabled state, then remove the distribution. Review and explicitly authorize object deletion before emptying the bucket; S3 storage can remain billable while objects remain. Recheck the distribution, bucket and related resources plus delayed Billing/Budget data.

See [Phase 10 hosting decision precheck](evidence/PHASE10_HOSTING_DECISION_PRECHECK_2026-09-24.md) and [frontend release gates](FRONTEND_RELEASE_GATES.md). This is not a live account inventory or zero-cost guarantee.

## Emergency teardown

1. Preserve only sanitized portfolio evidence.
2. Open the circuit and stop new work.
3. Stop project tasks.
4. Review the exact deployed-resource diff, retained data and recovery need, then execute a bounded IaC teardown only after the relevant approval. A local synth is not teardown proof.
5. Verify CloudFront, S3, API Gateway, Lambda, ECS, ECR, DynamoDB, logs, parameters/secrets, EventBridge, alarms and SNS are gone as intended.
6. Check explicitly for NAT Gateway, ALB, Elastic IP and VPC endpoint.
7. Recheck Billing/Budgets. Delete a general project IAM identity only after chargeable services/subscriptions are confirmed closed.
