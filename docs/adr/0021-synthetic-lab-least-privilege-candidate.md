# ADR 0021 — Separate least-privilege identity for the synthetic lab

- Date: 2026-10-26
- Status: **temporary restricted analysis/session-window/denials and English restricted browser verified; no durable deployment or publication**
- Scope: ADR 0020 direct Bedrock learning, not provider or Fargate reactivation

## Problem

Current verified cutover: the stable user entry delegates exclusively to a fresh
temporary-role browser lifecycle. Administrator-key export and its fallback are
removed. Startup/close/expiry failures attempt listener, lease and owned-stack
cleanup; the browser remains one-click/one-attempt and loopback only. Fifty focused
regressions plus strict operator checking passed, followed by matching 90-step
current/clone gates and one actual English browser analysis with refresh/reload
and explicit close. Independent reads confirmed role/stack deletion. The earlier
unexplained local-test failure remains recorded, not erased by later passes.
[Browser evidence and limits](../evidence/SYNTHETIC_RESTRICTED_BROWSER_2026-10-31.md).
Older runner-status paragraphs below are
dated historical checkpoints, not current implementation claims.

Latest October 31 acceptance: one restricted EC2 RunTask request was explicitly
denied after matching 90-step / 1,864-pass source proofs. Automatic cleanup,
independent four-read deletion/task checks and idle/disabled/OPEN posture passed.
No inference or Fargate request in this cycle. The restricted browser runner is
the remaining connection gate. [Evidence](../evidence/SYNTHETIC_COMPUTE_DENIAL_2026-10-31.md).

Latest October 31 follow-up: one alternate same-account source role was denied
assumption of the unchanged target. Matching 90-step current/frozen-clone gates
passed 1,835 tests / one skip; automatic cleanup and four independent reads
verified both roles absent and the target stack deleted. No model/compute call.
This closes the tested alternate-principal gate, not every possible principal,
RunTask denial or runner cutover. [Evidence](../evidence/SYNTHETIC_ALTERNATE_PRINCIPAL_2026-10-31.md).

Latest completed October 31 cycle: matching current/frozen-clone proofs passed
1,801 tests / one skip; the temporary restricted role produced a valid analysis
and explicit session-policy denial after its absolute window. Cleanup and three
independent absence/deletion reads passed. This closes the bounded positive and
expiry gates, not alternate-principal/RunTask denial or user-facing migration.
[Accepted result and limits](../evidence/SYNTHETIC_USAGE_COMPATIBILITY_2026-10-31.md).

Latest October 31 follow-up: a freshly gated temporary cycle produced a valid
restricted-role English synthetic analysis. Its post-window request returned 403,
but explicit session-policy-denial acceptance remains unresolved. Independent
reads confirmed role/stack deletion. The candidate runner is not cut over and
the remaining foreign-principal/RunTask gates are not waived.
[Latest evidence](../evidence/SYNTHETIC_USAGE_COMPATIBILITY_2026-10-31.md).

2026-10-31: the new one-cycle revalidation returned HTTP 200 but the positive
control failed usage normalization. No second call followed; temporary role/stack
cleanup and independent absence checks passed. Offline compatibility work does
not make this a valid analysis or expiry acceptance. The approval is consumed;
the current runner and IAM policies remain unchanged.
[Dated outcome](../evidence/SYNTHETIC_EXPIRY_CONTRAST_2026-10-31.md).

Later 2026-10-30: a separately approved expiry-contrast cycle made one restricted
model-request attempt, but the positive control failed validation. No post-window
request was sent. Automatic cleanup and independent deletion checks passed.
This does not establish restricted inference or expiry acceptance; the cycle's
approval is consumed. [Outcome](../evidence/SYNTHETIC_EXPIRY_CONTRAST_2026-10-30.md).

2026-10-30: one separately approved temporary cycle verified explicit SSM
GetParameter and ECS DescribeClusters denial, then automatically removed the
role with independent absence checks. [Evidence](../evidence/SYNTHETIC_READ_DENIAL_2026-10-30.md).
This does not prove RunTask, another principal, server-side expiry or restricted
inference, and does not authorize another role creation.

2026-10-29: the separately approved corrected temporary-role rehearsal passed
automatic teardown and independent deleted-stack/absent-role checks, without a
model request. [Evidence](../evidence/SYNTHETIC_ROLE_CLEANUP_2026-10-29.md).
The prior failed/recovered result below is retained as history; negative-access,
expiry and actual restricted-runner inference remain separate uncompleted gates.

2026-10-28: the approved one-role/one-assumption/no-inference rehearsal succeeded
at creation and local credential clearing, but automatic cleanup failed.
Independent recovery confirmed the exact stack deleted and role absent. This
does not establish automated teardown, denied-access/expiry or restricted model
execution. [Final evidence](../evidence/SYNTHETIC_ROLE_DRAFT_2026-10-28.md#approved-temporary-role-rehearsal-and-final-stop).

The verified direct lab consumes temporary credentials from the existing owner
administrator profile. The app restricts its requests, but those credentials have
more permissions than inference needs. Clearing memory on exit does not turn an
administrator credential into a least-privilege one. Current live evidence must
continue to disclose that residual risk until the replacement is actually tested.

## Candidate

An isolated CDK stack defines one named lab role. It is not imported by the main
app and creates no compute, storage, subscription,
network or public endpoint in its template. Trust is the exact configured owner
IAM user, temporary credentials, secure transport and MFA present. A missing MFA
context is denial, not a reason to remove the condition. The existing CLI-login
flow's compatibility was subsequently established by the permission-free probe
below; the actual model permission/runner boundary is still not deployed.
The separate default-inert temporary rehearsal can execute a newly reviewed
proposal only after current/fresh-source and cloud-posture gates, and requires
automatic teardown. It does not enable a durable deployment or live runner.

The permission policy permits only `bedrock:InvokeModel` for the exact Tokyo
Nova Lite foundation-model ARN. Explicit denials cover other actions, other model
resources, other regions and insecure/missing secure-transport context. No stream,
cross-region profile, provider secret, PassRole, Fargate, IAM mutation or managed
administrator policy is granted. AWS documents InvokeModel as the permission
required by the non-streaming Converse operation. [Converse API](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_Converse.html).

Future runtime credentials should be obtained once with AssumeRole, a 900-second
credential lifetime and a session policy containing an absolute five-minute
authorization window. STS's minimum credential duration is 900 seconds; the role
setting's minimum maximum-duration value is one hour. These are **not** a claim
that AWS issues five-minute credentials. Session permissions intersect with role
permissions. [AssumeRole reference](https://docs.aws.amazon.com/STS/latest/APIReference/API_AssumeRole.html).
The candidate denies requests before the window and at/after its end using
`aws:CurrentTime`. [Condition keys](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_condition-keys.html).

The application still needs one-attempt admission, 512 output tokens, bounded
input, no retry, a five-minute process lifetime and independent cleanup. IAM does
not count calls or cap dollars. Time denial cannot cancel work already accepted
by AWS, and closing the UI cannot revoke a stolen credential. GetCallerIdentity
must not be used as proof that all other access is denied.

## Gates before use

1. Current full local gate and isolated fresh-install proof; review exact rendered
   role/trust/session policies, not only source snippets.
2. Verify same-account owner and current safe cloud posture. Review the isolated
   change scope; do not attach this role to deployed workers or the controller.
3. Verify MFA/temporary context with the existing login flow. If it cannot meet
   the trust condition, stop that path and request owner-led authentication;
   never create long-lived keys or weaken MFA to make a test pass.
4. Add a bounded broker credential boundary that never passes administrator
   credentials to the inference process, never logs/persists returned keys and
   never falls back to the administrator when assumption fails.
5. Verify owner assumption, foreign-principal denial, no-secret/no-Fargate access,
   exact model/region and expiry. Offline structural assertions and policy
   simulation are not live negative-authorization evidence.
6. Only then run one new explicit paid smoke and record cleanup plus retained
   credentials/role limitations. Do not count earlier admin-backed calls as proof
   of the new role.

The durable model role has not been created. A separate temporary permission-free
probe role was created, assumed with deny-all, deleted and verified absent. The
current executable lab remains unchanged and must not be represented as using
the proposed model role.

## Local implementation

October 31 local follow-up adds an alternate-principal policy, exact snapshot,
source lease, one-shot adapter and ownership-checked cleanup. The distinct
default-inert two-role live mode is prepared, not executed. The source only
permits assumption of the exact target; that request carries deny-all even on
unexpected success. Forty-one focused candidate/entry tests and strict type
checks passed. This is not live trust-policy rejection evidence; fresh full
source gates and actual independently verified cleanup remain required.
[Bounded scope](../runbooks/synthetic-alternate-principal-candidate.md).

- [Policy builder](../../shared/security/synthetic-lab-policy.ts)
- [Isolated stack](../../infrastructure/lib/synthetic-lab-role-stack.ts)
- [Structural tests](../../infrastructure/tests/synthetic-lab-role.test.ts)
- [Candidate response/credential boundary](../../services/local-owner/src/synthetic-role-credentials.ts)
- [Boundary tests](../../services/local-owner/tests/synthetic-role-credentials.test.ts)

The tests check exact action/resource/trust, no unexpected template resources,
strict owner/region/time input, a five-minute window and STS policy length. They
do not implement an IAM evaluator or assert a deployment succeeded.

The credential boundary now builds the fixed AssumeRole request, checks a fresh
four-response role/policy snapshot and validates returned role/session IDs,
temporary-key shape and bounded expiration. It clears raw response credential
fields, offers no refresh or administrator fallback, stops use after the absolute
five-minute window or a reversed/invalid clock, and clears the shared credential
object when closed. It serializes status only. This is not secure erasure of JS
memory or revocation of server-issued credentials. It has only injected-fixture
tests at that checkpoint; no live runner connection is supplied. The operator must
still bound reads/assumption time and use the exact fresh role snapshot.

A subsequent local-only acquisition/CLI/runtime composition now performs four
fresh role-policy reads in order, one assumption with the absolute window, and
supplies only the restricted lease to an explicit-endpoint Bedrock client. CLI
processes are bounded to 20 seconds with no retry; a failure permanently closes
the adapter. Raw output references are dropped, errors sanitized and credentials
cleared on failed validation. The runtime preserves the remaining authorization
window rather than granting another five minutes, checks the lease even if the
SDK caches credentials and attempts every close step on cleanup failure.
These components have no live entry and are **not connected to the current
administrator-backed runner**. No additional role, STS credential or inference
was created by this local work. Fresh full-source verification remains required.

- [Acquisition orchestration](../../services/local-owner/src/synthetic-role-acquisition.ts)
- [Bounded CLI adapter](../../scripts/synthetic-role-cli.ts)
- [Restricted runtime composition](../../services/local-owner/src/restricted-synthetic-runtime.ts)

The additional [restricted server composition](../../services/local-owner/src/restricted-synthetic-lab.ts)
binds that runtime to the existing loopback server without adding an executable
or default credential fallback. Explicit close and automatic server end both
attempt server/session, SDK client and lease cleanup; startup/close failures are
sanitized and never declared a verified close. Local tests cover a real short-lived
loopback listener, automatic expiry and injected failures with zero model calls.
It is still a candidate, not evidence of an actual least-privilege AWS invocation.

A separate [permission-free trust probe](../runbooks/synthetic-trust-probe.md)
is prepared to test only the authentication prerequisite. It uses a uniquely
tagged temporary role with no permission policies, an additional five-minute
trust window, a single deny-all STS session, projected output without keys and
ownership-checked cleanup. It does not deploy this model-permission candidate.
Its fixture tests are not evidence of a real assumption or real deletion.

The [dated live probe](../evidence/SYNTHETIC_TRUST_PROBE_2026-10-26.md) subsequently
confirmed exact MFA trust with the existing temporary owner login and verified
cleanup. It did not test model invocation, a second signed principal or expiry.

## Unexecuted proposal review

Actual automated proposal review/cleanup was accepted on 2026-10-28, with
independent exact-target deletion and model-role absence reads. This did not
deploy or assume the model role. A separate [temporary credential rehearsal](../runbooks/synthetic-role-rehearsal.md)
candidate now prepares one reviewed CREATE execution, one credential-only
assumption and automatic stack/role cleanup. It requires new source proofs and
actual acceptance; no live denied-access, expiry or inference claim follows from
its local tests. The original unexecuted operator remains execution-free.

The [draft runbook](../runbooks/synthetic-role-draft.md) describes a separate,
default-inert operator. The exact rendered template allows only the one named
role and explicitly deletes it on stack deletion/replacement. No bootstrap,
asset upload, transform, managed policy, retained resource or public endpoint is
allowed. The operator requires both recent current-source and isolated fresh
clone receipts before reading AWS, then verifies owner and disabled cloud posture.
It can create one **unexecuted** CREATE change set but cannot execute it.

DescribeChangeSet does not document a ChangeSetType response. The reviewer binds
the recorded CREATE request, exact template hash, new unique tagged stack in
REVIEW_IN_PROGRESS, one Add role change, names/ARNs and timestamps instead.
Deleting the change set alone can leave that empty stack. Cleanup independently
checks ownership, draft absence, stack state and zero/pagination-free resources,
then deletes only its exact stack ARN and verifies deletion plus role absence.
An ambiguous create followed only by absence is not declared clean. Another
actor's execution/retagging or nonempty stack blocks deletion and is reported.
Local failure-injection tests are not evidence of a cloud proposal or deletion.
