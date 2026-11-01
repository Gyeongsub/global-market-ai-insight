# Threat Model

## Real synthetic analysis boundary — ADR 0020

**Current accepted boundary, 2026-10-31 (ADR 0021):** the stable entry creates
one temporary model-only role, verifies its exact policy/trust, then passes one
restricted STS lease to the analysis broker. Administrator credentials are not
exported into the model SDK. A valid English browser analysis, explicit post-window
denial, alternate-principal rejection, EC2 RunTask denial and independent cleanup
have dated evidence. This is not every-principal/action/language coverage.
[Accepted scope and residuals](evidence/SYNTHETIC_RESTRICTED_BROWSER_2026-10-31.md).

The parent lifecycle still uses the owner's existing privileged CLI session to
manage the exact temporary role/stack. Restricting the model lease does not reduce
that parent's account permissions or isolate a compromised PC. Role deletion,
local listener/lease closure and policy-window expiry are separate controls;
none is a universal immediate credential-revocation or zero-spending guarantee.
Historical candidate paragraphs below record earlier states, not today's runner.

**Current development-tool residual:** one moderate minimatch advisory matches
two locked lint versions. No declared-runtime match was found, and bounded
trusted-path tests do not exercise the reported advanced preprocessing path.
The packages remain unpatched; no suppression or all-clear is inferred.
[Disclosure, exact versions and operating limits](evidence/LINT_ADVISORY_REVIEW_2026-10-31.md).

Earlier 2026-10-28 candidate: a separate [temporary role rehearsal](runbooks/synthetic-role-rehearsal.md)
can execute only one freshly reviewed isolated CREATE proposal, validate the
exact role/policy, assume once and clear its lease without using it for inference.
Cleanup rechecks stack/template/resource ownership, role creation time/tags/trust
and the previously observed immutable role ID; unknown ownership blocks deletion.
Abrupt termination, concurrent administrator changes, IAM propagation and copied
credentials are not made impossible by these checks. Intent journals require
exact-target reconciliation after a crash. No security acceptance or runtime
switch is claimed by local tests; live denial/expiry and inference remain gated.

The lab requires the current source gate and an existing temporary owner
profile matching the deployed controller owner. Current IAM changes are confined
to the owned temporary model role/stack, not a broad grant to existing workloads. AWS endpoint,
region, model, synthetic input and locale enum are pinned. Host/Origin/Fetch
Metadata plus per-process random capability guard start/status/close; no request
body, external CORS, arbitrary prompts, URLs, cookies or browser credentials.
Validated model output uses textContent, never HTML. Error details are suppressed.
Duplicate requests cannot trigger more inference; shutdown aborts and discards
results. This remains a trusted-single-user-PC boundary, not protection against
local malware/OS peers with access to the operator's credentials. Existing admin
profile privileges are not reduced by the application allowlist. [ADR 0020](adr/0020-synthetic-bedrock-local-lab.md).

Earlier 2026-10-26 checkpoint: client close acknowledgement and independent elapsed deadlines are
tested; lost replies clear the view without claiming server closure. The
[restricted-role/session policy candidate](adr/0021-synthetic-lab-least-privilege-candidate.md)
then had structural tests but was not deployed or used by the runner. At that
checkpoint it did not remove the model runner's administrator-credential risk;
the October 31 cutover above supersedes that status. The search preview launcher is bounded
and credential-free, not an OS isolation boundary or a cloud teardown tool.

## ChatGPT handoff boundary — ADR 0019

The default page writes only its visible fixed-template question to the clipboard
on an explicit click; it never reads clipboard/account/session data. The separate
ChatGPT anchor has a fixed HTTPS URL without prompt parameters, no opener and no
referrer. The owner controls paste/submission; responses are not imported. Stored
locale is the only preference; no API key, AWS credential or private holding is
needed. Incorrect/stale web results remain a risk: prompts require verifiable
sources, timestamps and uncertainty, including explicit SPCX identity checking.
The AWS lab controls below remain unchanged. [ADR 0019](adr/0019-chatgpt-search-companion.md).

## Trusted local owner bridge — 2026-10-25

[ADR 0017](adr/0017-local-owner-aws-bridge.md) replaces mandatory hosted access
with a short-lived loopback UI and server-side IAM signing. This trusts the owner
OS; it does not isolate hostile local users or malware. Host/Origin/Fetch Metadata,
memory-only capability, SOP/CORP/CSP and no CORS defend against remote-web access.
No AWS credential, arbitrary URL proxy, filesystem server or job action reaches
the initial observation HTTP handler. Dated catalog/health is a snapshot, not an
authorization lease or proof that cloud state cannot subsequently change.
Maximum accepted observation age is three minutes to allow independent closing
reads; server lifetime remains five minutes. Public AWS API IAM protection and
the existing owner guard remain; this does not make the AWS endpoint network-private.
Anonymous endpoint abuse can still incur request charges. Hosted authentication
below remains deferred, not silently enabled by this change.

2026-10-25: [owner-only target](adr/0015-owner-only-aws-practice.md) now has a deployed
controller boundary for exact gateway IAM identity. Missing configuration denies
all routes before body parsing, repository/circuit reads or task launch. Header/
body spoofing, another account/user, assumed roles and mixed authorizer contexts
are rejected in local tests. Deployed owner catalog/health GETs and an anonymous
403 have separate [bounded evidence](evidence/PRIVATE_OWNER_DEPLOYMENT_2026-10-25.md);
a real signed second-principal negative remains untested. This is not a per-request MFA check or protection
against privileged direct Lambda invocation or stolen owner credentials. Preserve
MFA, session expiry and gateway IAM. Rejected public-endpoint requests can still
cost; private S3 is not viewer authentication. Browser controls remain unfinished.

The [private-browser session candidate](adr/0016-private-browser-session-preparation.md)
is local only: hash-only tickets, one-time atomic exchange plans, short session
expiry, bounded reads and strict read-only authorizer preparation. Neither a
mock transaction nor a stored session proves actual AWS IAM/CloudFront isolation.
Browser credentials, public bootstrap, key custody, cache/revocation semantics,
TLS and unauthenticated request cost remain release gates. No owned domain is
available; the user deferred purchase, so hosted authentication stays disabled.

2026-10-24: lint-only Zod 4.4.3 matched one HIGH advisory; a reviewed exact 4.6.6
override and post-repair registry zero-match close that dated dependency finding,
not all supply-chain/OS/legal risk. Signed operator response parsing additionally
rejects duplicate decoded keys/BOM and bounded-work excess without hanging on
cleanup. The runtime BOM is unchanged; no cloud policy/exposure was altered.
[Repair and limits](evidence/ZOD_SECURITY_REFRESH_2026-10-24.md),
[response boundary](evidence/LOCAL_BOUNDARIES_2026-10-24.md).

2026-10-23 local hardening: supported frontend commands now reject native/WASI/
compiler-test overrides before launch and pass only the fixed bootstrap child
environment. Public byte review covers selected files, not the entire toolchain.
The unused live API client also bounds local abort acknowledgement independently
of a cooperative transport, discarding late data/private rejections. Neither
change is a sandbox, remote task cancellation or a release approval.
[Compiler boundary](evidence/FRONTEND_COMPILER_BOUNDARY_2026-10-23.md),
[client boundary](evidence/BROWSER_API_DEADLINES_2026-10-23.md).

## Development middleware/editor attack surface — 2026-10-22

An actual npm refresh found six Vite 8.2.1 advisories, including Windows editor
command/path risks and filesystem/origin-boundary issues. No active long-lived
development server was found and no exploit/compromise is claimed. Exact Vite
8.2.4/compiler lock update, public coordinate/integrity/notice review, supported
Node and post-update zero-match query address this known development dependency
scope. Loopback/fs/CSP/credential controls remain, not a substitute for patching.
No public hosting or full native/legal/OS acceptance.
[Evidence and limits](evidence/VITE_SECURITY_REFRESH_2026-10-22.md).

## Local CA/Node remediation and operator baseline — 2026-10-22

Pinned patched build/runtime, fixed CA package, bounded public bundle inspection
and effective Node default-store checks replace the old unverified trust state.
The two affected DER fingerprints are absent; actual local scan/runtime passed
their own first source snapshot. Current operator execution checks reject old
Node security baselines before effects; default/import remain inert. A portable
official hash/Authenticode-verified Node is task-local, not a system security
change. Neither a version label nor a zero-finding projection is full trust,
publisher-signature, handshake, native-source, licensing or release acceptance.
MEDIUM 23/LOW 8 and independent cloud/publication blocks remain.
[Precise proof and residual boundaries](evidence/WORKER_CA_REMEDIATION_2026-10-22.md).

## CA trust advisory and scanner-schema boundary — 2026-10-21

An actual fresh scan introduced a Debian DSA identifier without a CVE. The old
parser rejected the shape; diagnostics stayed private/fail-closed, not clean.
Strict DSA recognition and reused Debian coordinate reconstruction now preserve
the advisory, installed/fixed version and original UNKNOWN severity. Finite
blocked observations are separate from clean acceptance; execution stops before
worker runtime. No ignore/VEX or severity waiver, image promotion or cloud write.

A newer public image still declared the old CA package and changed its base
entrypoint to select the OS CA store. Merely changing FROM while overriding that
entrypoint does not establish effective trust remediation. Experimental changes
were reverted; no active handshake/complete certificate/bundled-store acceptance
is claimed. Keep the image quarantined and live work disabled pending exact
remediation and acceptance. [Actual scopes and limitations](evidence/WORKER_CA_ADVISORY_2026-10-21.md).

## Retained-I/O process protection — 2026-10-20 (not deployed)

A synthetic compiled worker settled its job error but retained an interval
handle and did not exit naturally. The executable now keeps an unref'ed fixed
five-minute final exit guard, with non-zero termination even if reporting fails.
It does not delay healthy exits or rewrite/retry accepted job effects. This is
not OS-level preemption, durable alarm delivery, cloud stop acceptance or a
spending cap; blocked JavaScript/host failure still require independent external
recovery. [Exact scope](evidence/WORKER_PROCESS_CEILING_2026-10-20.md).

## Operator child boundary — 2026-10-20 (local only)

Four synthetic red reproductions found unknown credentials/tool/transport values
could still survive the operator denylist. Read-only CLI and credential-free
synthesis now reuse the same OS bootstrap projection, with only the CLI's fixed
profile/explicit config location added. Actual child projection and types pass;
readable profile/credential_process files and parent startup are not sandboxed
or cleared. No runtime role, IAM condition, endpoint permission or AWS resource
changed. [Scope and residual trust](evidence/OPERATOR_CHILD_ENVIRONMENT_2026-10-20.md).

## Uncooperative dependency review — 2026-10-20 (not deployed)

Requesting abort alone can leave a pending provider/model/body-cancellation wait.
Shared monotonic budgets now bound acknowledgement, observe late rejections and
block continuation/retry after the parent job expires. The caller cannot gain
time from backwards clocks or delayed timer callbacks. Existing attempt/token
caps remain unchanged; already accepted remote work, native handles and billing
are not rolled back or proven cancelled. No permission/publication gate changes.
[Reproductions and verification scope](evidence/WORKER_UNCOOPERATIVE_DEADLINES_2026-10-20.md).

## Local call/environment review — 2026-10-19 (not deployed)

Build/test child environments keep only OS bootstrap values; unknown application
credentials, executable/proxy/CA settings and opt-ins are not inherited. This
does not isolate readable files or undo parent startup settings. Controller and
worker SDK calls discard late acknowledgements before subsequent work, but
abort cannot roll back AWS effects already accepted. No blind retries or inferred
slot/task cleanup. Existing IAM, image/license and publication gates remain.
[Reproductions and precise limits](evidence/PHASE12_CALL_AND_ENV_BOUNDARIES_2026-10-19.md).

## Local environment/ending review — 2026-10-18 (not deployed)

Fixture frontend configuration disables dotenv and generic client environment
prefixes after two synthetic reproductions; this does not sanitize arbitrary
future source/public assets or authorize real API access. A separate read-only
ending inventory treats failed/partial/unknown reads as unverified and does no
cleanup. It reports explicit assistant/review/empty-parent exclusions rather
than deleting user artifacts to make a count zero. [Client environment scope](evidence/FRONTEND_ENV_BOUNDARY_2026-10-18.md),
[ending inventory and limitations](evidence/LOCAL_SAFE_STOP_INVENTORY_2026-10-18.md).

## Local resumed boundary review — 2026-10-16 (not deployed)

Original-text duplicate JSON keys and case-aliased admission headers now fail
before work. The prepared browser client rejects oversized/malformed streams,
wrong job identities and raw remote error prose while preserving redacted
success metadata. These local guards do not recover duplicates hidden inside
already-decoded SDK objects or authorize connecting the fixture UI to AWS.
[Exact boundary/test scope](evidence/LOCAL_JSON_AND_BROWSER_BOUNDARIES_2026-10-16_RESUME.md).

The [retained local image triage](evidence/PHASE12_CANDIDATE_TRIAGE_2026-10-16_RESUME.md)
keeps 23 MEDIUM/eight LOW occurrences; no exploitability waiver or current-image
proof for later code follows. The separate [retired-key observation](evidence/PHASE12_RETIRED_KEY_OBSERVATION_2026-10-16_RESUME.md)
does not trust an expired key for current release or establish a signing time.
All existing source/license, provider, IAM and final-publication gates remain.

## Current image/scanner boundary — 2026-10-04

The August zero-HIGH/CRITICAL observation was not durable: today's fresh DB
found three HIGH OpenSSL package findings in a rebuild of the old base. The
candidate was never pushed/deployed and was removed; a refreshed immutable
official Linux/amd64 runtime produced zero HIGH/CRITICAL/secret findings.
Remaining LOW/MEDIUM findings, unscanned build tooling, SDK bundle attribution
and the exact live ECR digest are separate risks, not waived by the threshold.
Do not enable live jobs based on an old scan or a different local image.

A read-only bind of the Docker Unix socket still exposes the daemon's mutation
API. The current bounded Trivy execution has **no Docker socket, source,
credentials or user-home mount**. It reads only a privately exported exact
candidate archive, with a separate owned cache and writable bounded temporary
filesystem; capabilities are dropped, root is read-only and telemetry/version
checks disabled. Public vulnerability DB downloads are allowed, while fixture
worker smokes use no network. Cleanup independently verifies owned containers
gone and archive/cache removed. This is not perfect sandbox isolation or
complete privacy/license/exploitability proof.

## Prepared admission protections — 2026-09-06, not deployed

Controller capacity slots cap concurrent reservations across minute boundaries, while a versioned circuit check shares the admission transaction. Worker IAM excludes control keys; controller IAM cannot change the circuit or delete capacity slots. Transaction-only actions also require enclosing-operation context. Actual effective IAM still needs cloud validation.

An uncertain launch never frees capacity. Reconciliation requires terminal job/version/creation-time, matching actual STOPPED task, and conditional slot ownership. This prevents expired/reused job IDs or stale readers releasing another task's reservation. Missing evidence deliberately causes retained capacity and may require manual recovery. Administrator credentials bypass application controls; neither these controls nor Budget guarantee an account-wide spending ceiling.

## Protected assets

- market provider credential
- AWS credentials and role sessions
- job integrity and idempotency records
- Bedrock prompt constraints and validated results
- cost budget and circuit-control authority
- deployment supply chain

## Main threats and controls

| Threat | Boundary | Required control | Residual risk |
|---|---|---|---|
| Arbitrary ticker or locale | Browser → API | strict enum/schema before write or task launch | abusive valid requests |
| Duplicate task spend | Browser/API | idempotency hash, request hash, conditional create | malicious unique keys |
| Unauthenticated public job abuse | Internet → API | AWS IAM authorization on every initial route, stack opt-in, fail-closed job flag, API throttle, atomic per-minute admission limit, circuit before work | a future anonymous frontend design requires a separate auth/abuse review |
| Secret leakage | IaC/ECS/build/log/browser | operator-created Standard SecureString, exact execution-role injection, no secret in template/override/image, redaction and scans | process environment is readable inside a compromised container; provider SDK error changes |
| Provider symbol confusion | Provider → worker | issuer/exchange/symbol validation, `SPCX` unavailable default | provider metadata defect |
| Stale/mislabelled price | Provider → worker | timestamp, state, currency, freshness validation | provider contract ambiguity |
| Prompt injection in data | Provider/model | normalized facts only, no free-form prompt, output schema | subtle unsafe phrasing |
| Model financial advice | Model → user | prohibited-language evaluation, application disclaimer, escape output | language variation |
| Terminal job overwrite | Worker → DynamoDB | conditional status/version, immutable terminal state | manual admin repair error |
| Public worker exposure | Internet → Fargate | no listener, no inbound SG rules, one-shot process | outbound compromise |
| IAM privilege escalation | Runtime → AWS | role separation, exact PassRole/model/secret/table scope, negative tests | AWS policy drift |
| Bill shock | Public API → services | throttle, task/token limits, timeouts, circuit, alerts | delayed billing data |
| Supply-chain vulnerability | package/image | pinned dependencies/base version, scan, digest deploy | zero-day vulnerability |

## Local build and expired-stage boundary — 2026-10-17

Fixed backend build outputs reject redirected parents/shared inodes and stage
only three reviewed files. Compiler override variables are refused before the
compiler loads; selected installed compiler bytes matched fixed official
archives without executing them. This narrows accidental build redirection,
not concurrent-host compromise or full source/native/license provenance.
[Build boundary](evidence/BACKEND_BUILD_BOUNDARIES_2026-10-17.md),
[compiler scope](evidence/PHASE12_COMPILER_BYTES_2026-10-17.md).

The local worker now blocks a model stage after a provider consumes the job
deadline and refuses late success/content. Conditional terminal conflicts remain
errors. Already-started remote calls can still bill, and wall clock is trusted;
this is not a distributed spending cap. This correction is not in the earlier
dated local candidate or the live image. Keep admission disabled pending fresh
source-bound release checks. [Deadline boundary](evidence/WORKER_DEADLINE_BOUNDARY_2026-10-17.md).

## Phase 12 provenance and operator-input boundary — 2026-10-10

The public base-image reader accepts only one fixed anonymous GCR namespace and
digest. Size/request/time limits, independent compressed and expanded hashes,
an in-memory overlay model and exact format-specific headers are required.
Restricted ordinary GNU records use no USTAR filename prefix; only valid
optional time metadata and otherwise zero extension fields are accepted.
V7/PAX/unknown formats, GNU extensions, traversal, high-bit numeric fields and
unsupported devices are rejected; arbitrary links are never resolved, and the
archive is never extracted or executed. Only
bounded public package identities, regular-document hashes and three fixed
version-matched GCC shared-source relationships are reported. Raw copyright
text, publisher fields and arbitrary link targets are not serialized.

The private manifest-only reader independently verifies ownership, safe disabled
state, immutable manifest bytes and the ordered 22-layer public descriptor
prefix before and after its bounded reads. It does not read private config or
layers and cannot attest to their diff-IDs, current application bytes, current
vulnerabilities, publisher signatures or complete legal/distribution obligations.
The separate archive verifier additionally requires exact USTAR path semantics,
clean header termination and zero payload padding for the final mkdir/COPY
layers. Synthetic regression tests are not proof that today's private image
passes that stronger archive verifier; that wrapper was not executed today.

Advisory inventory transmission to an external registry and a persistent IAM
condition removal are separate approval boundaries. Automatic review rejected
both relevant executions before any write/transmission. No alternate endpoint,
tool or disguised lookup may bypass that result. Current advisories remain
unknown without a specifically approved current query, and an OPEN circuit or a
successful local build cannot substitute for permission/release acceptance.

## Phase 10 fixture-hosting boundary — local draft only, 2026-09-24

- **Static public exposure:** a private S3 bucket and OAC restrict origin reads, but enabling CloudFront and uploading objects makes the selected bundle public to anyone with the URL. The release audit rejects known internal references, credentials, unreviewed social-image metadata and external assets; this is a pattern check, not a complete privacy/license review. The proposed browser CSP has `connect-src 'none'`, so the fixture cannot call the signed API. The hosted fixture must be visibly synthetic.
- **Container build-context disclosure:** even a multi-stage Dockerfile can send
  unrelated local bytes to the builder. The context excludes credentials,
  infrastructure output, evidence, generated bundles and local work paths;
  tests require immutable base-image digests and a runtime stage that copies
  only the freshly built worker bundle. This reduces exposure but does not
  replace inspecting a freshly built image and its history before push.
- **TLS downgrade allowance:** [AWS documents](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/DownloadDistValuesGeneral.html) that its default CloudFront certificate uses a `TLSv1` minimum security policy even with HTTPS-only viewer access. Accepting that for a credential-free demo versus adding a custom domain and certificate remains an explicit security/cost decision. Do not claim TLS 1.2 minimum for the current draft.
- **Update/rollback confusion:** immutable assets are staged before HTML, and changed content under an old immutable key is refused. Previous local bytes can be checked against a manifest, but remote bytes/cache headers have not been verified; rollback is not available merely because the local check passes. A partial release requires an exact remote-state review, not a blind retry or deletion.
- **Traffic and retained costs:** a distribution price class is not a spend cap or a flat-rate-plan subscription. Public request volume, CloudFront Functions, S3 requests/storage and retained objects can cost money. The template remains disabled and no plan enrollment is in the stack; fresh account-specific billing evidence and bounded approval are required before publication.

## Phase 11 maintenance boundary — local draft only, 2026-09-24

The sweeper and reconciler are not deployed or scheduled. Their exact-owner check requires the task ARN, cluster ARN, truncated `startedBy` and sole `worker` container override carrying the full expected `JOB_ID`. Ambiguous/missing ECS evidence retains the slot rather than stopping a guessed task or freeing capacity. The reconciler additionally requires a terminal job, matching creation time and an observed `STOPPED` task, followed by a conditional transaction. This lowers accidental cross-job task-stop/release risk but cannot substitute for live IAM-negative checks, schedule review, or manual recovery of evidence that has expired. No task or slot is touched by reading this document or running the local checker.

## Phase 11 alarm-to-circuit boundary — local draft only, 2026-09-30

The automatic response is isolated from the sweeper and is absent from default
synthesis. Its EventBridge pattern and Lambda both require one of three exact
project alarms entering `ALARM`; the handler additionally checks the Tokyo
Region, expected AWS account and exact single alarm ARN. The Lambda role can
only read/update the `control_circuit` key. It has no ECS, Bedrock, SSM, SNS,
PassRole or circuit-close permission. A conditional version conflict is never
overwritten: success is reported only if a fresh consistent read proves the
newer state is already `OPEN`. False positives can stop new admissions until a
human diagnoses and explicitly resets the circuit; this availability tradeoff
is intentional and is not a guaranteed billing cap. No rule or function was
deployed and no live alarm/circuit mutation was performed in this checkpoint.

## Phase 5 IAM negative boundary

- The ECS execution role can retrieve only the named provider parameter and cannot read or update jobs or invoke Bedrock.
- The worker task role can read/update only the jobs table and invoke only the selected foundation model; it cannot retrieve Parameter Store values, launch tasks, or pass roles.
- The controller role can launch only the selected task definition on the selected cluster and pass only the two ECS roles to `ecs-tasks.amazonaws.com`; it cannot retrieve the provider parameter or invoke Bedrock.
- The deployment identity remains outside these runtime roles and is not defined as an application runtime permission.

## Excluded data

The first release has no user accounts, personal portfolio, payment, trading credential, or free-form prompt. Logs must not add these data classes accidentally.

## Phase 7 public boundary

- The API access log contains route, status, response length, and generated request ID only; it does not log body, idempotency key, provider response, or integration exception text.
- The Lambda role cannot read the provider parameter or invoke Bedrock. It can transact/read/update only the jobs table, run only the selected task definition on the selected cluster, and pass only the two ECS roles to the ECS tasks service.
- Internal hashes and task ARN are removed at the server projection and rejected by the prepared browser client if unexpectedly returned.
- The checked-in development config keeps job creation and provider result display false. Deploying the endpoint does not itself authorize enabling these flags.
- All initial routes require SigV4 authorization. No AWS credentials or signing logic are added to the browser application.
## Local contract-driven view update — 2026-10-24

The dashboard now uses strict client/session parsing with a fixed injected
in-memory fixture transport. No native fetch, AWS signing credential or public
endpoint configuration is added; fixture CSP still denies connections. The
session rejects terminal data for another operation/symbol/locale, suppresses
late cancelled/disposed results, never fills redacted results from fixtures,
and cannot retry a POST. Analysis renders validated fields as escaped React
text, including uncertainty/provenance/disclaimer. Local cancellation does NOT
stop an already accepted worker or revoke credentials. Public authentication,
provider rights, current-image/legal and publication gates remain separate.
[Exact scope](evidence/CONTRACT_DASHBOARD_2026-10-24.md).

