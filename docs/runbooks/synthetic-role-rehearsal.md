# Temporary model-role credential rehearsal

Latest: the separately approved two-read cycle completed on 2026-10-30 with
explicit SSM/ECS denial, credential clearing, automatic role deletion and three
independent absence checks. [Evidence](../evidence/SYNTHETIC_READ_DENIAL_2026-10-30.md).
Its one-attempt approval is consumed; it is not permission for another IAM/STS
cycle or inference. Older pending/candidate descriptions below are historical.

Status: automatic temporary rehearsal accepted on 2026-10-29; this is distinct from
the accepted **unexecuted** [draft review](synthetic-role-draft.md).
The separately approved corrected run passed automatic cleanup and independent
exact-target absence checks, without inference. [Latest evidence](../evidence/SYNTHETIC_ROLE_CLEANUP_2026-10-29.md).
This is not standing permission to recreate the role or a negative-authorization
or restricted-inference acceptance. The prior failure below remains historical.
It must pass new current-source/fresh-install proofs before any actual use.
On 2026-10-28 the proof-bound live command was rejected before process creation
by execution safety review, which requires exact approval for temporary IAM
creation and STS issuance. Do not bypass this denial. No rehearsal was executed.
The user subsequently explicitly approved exactly one temporary least-privilege
role creation, one STS assumption, local credential clearing and owned deletion,
with independent residue verification and same-day safe stop. No model call is
authorized by that approval. Fresh proofs and authentication are still required;
approval alone is not a live success claim.

The subsequently approved run did create and assume one temporary role, clearing
its local lease without inference. Automatic deletion verification failed and
independent ownership-checked recovery was necessary. The exact stack is now
DELETE_COMPLETE and the role absent; an EXECUTE_COMPLETE change-set history
record remains. See [final evidence](../evidence/SYNTHETIC_ROLE_DRAFT_2026-10-28.md#approved-temporary-role-rehearsal-and-final-stop).
Do not rerun this candidate unchanged. Investigate reuse of the same client token
across creation/execution/deletion and preserve the original failed outcome.
Recovery with a distinct deletion token preceded confirmed closure, but token
reuse is a hypothesis, not a proven root cause. No further role or STS attempt is
authorized by the completed one-attempt exercise.

## Purpose and limits

Verify that the exact-owner/MFA model role can be created through the isolated
CloudFormation template, assumed once with a five-minute authorization window,
and removed again. No model invocation, provider request, UI listener, Fargate,
public endpoint or durable deployment is part of this rehearsal. The existing
administrator-backed executable is not silently changed to this candidate.

The role permits only Tokyo Nova Lite; it is not a permission-free trust probe.
STS issues a minimum 900-second credential, while its session policy denies new
authorization outside an absolute five-minute window. Clearing the process's
credential object and deleting the role are not a claim of instant global token
revocation or secure erasure of JavaScript memory. No issued key is logged,
written to a file, exported to the browser or sent to a service request here.

## Preconditions and operation

Use the patched Node runtime, verified AWS CLI path, existing temporary
`gmai-admin` profile and recent exact-source current/fresh-clone receipts selected
by `GMAI_OWNER_GATE_RUN_ID` and `GMAI_CLONE_GATE_RUN_ID`. The executable
`scripts/synthetic-role-rehearsal-live.ts` defaults to a zero-effect plan.
Its sole live flag is `--execute-temporary-role-rehearsal`.

It first performs owner and disabled/idle cloud checks, refuses an existing fixed
model role or unique stack, and journals intent to an ignored private local file.
It creates one new CREATE proposal, independently reviews its exact template and
empty stack, rechecks role absence, then executes that exact proposal once.
The old unexecuted-draft command still cannot execute anything.

An execution acknowledgement is not deployment success. Wait for CREATE_COMPLETE
and verify the sole owned role resource, unchanged template and role metadata.
Then read all four exact role/policy responses, assume once and immediately
clear/close the credential lease. This proves assumption and local closure only,
not InvokeModel permission, denied-secret/compute access or server-side expiry.

The control-plane path has 30 normal calls; new normal calls stop after a
12-minute start window, with
48 independent cleanup calls. Each CLI process is bounded to 20 seconds with one
attempt; each poll wait is 15 seconds. The credential exercise separately permits
four reads within 90 seconds and one assumption with a 20-second process limit.
The shared preflight is 12 read-only calls. These are operation bounds, not an
account-wide cost cap or protection against forcibly killing the process/PC.
An in-flight call and the separately bounded credential exercise can extend
elapsed activity beyond the normal-call start window; cleanup is independent.

## Cleanup and failure

2026-10-29 local correction: create, execute and delete use separate stable
operation-scoped tokens. The journal/result records NOT_ATTEMPTED, ACKNOWLEDGED,
TOKEN_CONFLICT or UNVERIFIED for deletion, without raw AWS prose. An exact
DeleteStack TokenAlreadyExists envelope is classified as TOKEN_CONFLICT, never
absence or permission to retry. After that known rejection, absent observations
cannot prove cleanup; an independently bound DELETE_COMPLETE tombstone can.
The original failed run is not reclassified. The subsequent approved corrected
run passed automatic cleanup as recorded in the latest evidence above.

Cleanup runs after any creation attempt. Before stack deletion, re-read the exact
owned stack, original template and complete resource inventory. Only the single
expected role (or an empty failed/draft stack) is eligible. Check role creation
time, exact trust and configured tags; if a role ID was observed, it must still
match. Foreign/replaced roles, unexpected resources, pagination, changed template,
security protection or ownership uncertainty block deletion and are reported.
In particular, a CREATE_FAILED physical name is not proof of ownership. A
surviving role requires a CREATE_COMPLETE resource row before automatic cleanup;
otherwise the role must be independently absent. Ambiguous failed creations
require reconciliation, not deletion of a possibly colliding role.

Only the exact stack ARN is deleted, without force-delete, retain-resources,
manual role/policy deletion or another role ARN. A still-unexecuted proposal is
removed first. An ambiguous execution is never retried or treated as success;
only independently observed stable owned state is eligible for cleanup.

Verify deletion/valid DELETE_COMPLETE tombstone and role absence. Lost deletion
acknowledgement needs the exact tombstone or consecutive absent reads. A failed
observation during expected state propagation is bounded: execution/deletion are
never replayed, and the role-absence check has at most three reads. A failed
or unconfirmed cleanup is not success. Inspect the owned journal before any
retry and use independent read-only closure checks afterward. Do not delete an
existing unrelated role to make the next attempt pass.

An interrupted journal at create-intent/execute-intent is an ambiguous operation
even if its preceding attempt boolean is false: the process may have dispatched
after recording intent. Always reconcile the exact target after a crash; never
interpret that older boolean as proof that no AWS write happened.

The template contains IAM only, no always-on compute or data storage. Retained
project storage and unrelated account usage can still incur charges. A later
negative-authorization/expiry phase and bounded paid inference need separate
acceptance evidence. No GitHub publication follows from this rehearsal.

Before an owned deletion request, an absent stack read is never sufficient to
declare cleanup, even after a verified proposal or acknowledged execution.
Automatic rollback deletion requires the exact DELETE_COMPLETE tombstone.
The private journal records the original start time and observed immutable role
ID for recovery; publication-candidate output contains neither role/account IDs
nor credentials. The journal is not a guarantee against OS tampering.

## Next denial-evidence boundary — local only

### Newly approved bounded read-denial attempt, 2026-10-29

The user has now separately approved exactly one new temporary role / STS /
two-read denial / cleanup cycle. `--plan-read-denial` is an inert plan;
`--execute-temporary-role-read-denial` explicitly selects the new path in
`scripts/synthetic-role-rehearsal-live.ts`. The existing credential-only flag
still performs no service request. Both modes require the same fresh matching
current/frozen-clone receipts, verified owner, disabled cloud posture and exact
isolated template/ownership checks. No previous source receipt is reusable after
a change. No model, task launch, provider or real secret request is included.

The existing lifecycle awaits the bounded exercise before owned teardown. The
new exercise acquires once, signs at most two fixed requests sequentially and
clears the lease on success/failure/cancel. Any unverified first response prevents
the second request. Raw errors, payloads and credentials are not printed. Journal
fields distinguish `exerciseMode`, `readDenialAccepted` and attempted request
count; a failed/ambiguous run is not automatically retried. The result's narrow
`readDenialVerified` is true only after the native pair is accepted and the owned
lifecycle completes. Broader negative authorization, RunTask, foreign principal,
server-side expiry and restricted model invocation remain unverified.

After the single attempt, independently confirm the exact deleted stack, absent
role and resource deletion, then disabled/OPEN/zero-compute posture and local
authentication/process cleanup. A failed or partial response consumes this live
attempt too; do not weaken response validation and retry under the same approval.

The candidate history below describes earlier fixture-only checkpoints. The new
operator is prepared, but not live-accepted until dated evidence records it.

The [pure response reviewer](../../services/local-owner/src/synthetic-denial-evidence.ts)
has no network or credential access. It accepts only a bounded, unambiguous
AccessDeniedException envelope for the exact action and explicit identity/session
policy wording. Expiry requires an explicit session-policy denial. Missing
resources, invalid JSON requests, unsupported models/regions, signature errors,
ExpiredToken and generic denial are not sufficient. This conservative subset may
reject genuine denials that omit detail; it must not be weakened to label them
passes without independent evidence.

A future bounded transport must still bind the restricted principal, fixed HTTPS
endpoint, exact safe request, server response and timing. Parser fixtures are not
AWS authorization evidence. Use a nonexistent parameter canary without decryption,
not a real provider secret. DescribeClusters denial is not RunTask denial. Do not
send a launch-capable request or valid inference payload merely to test denial.
Foreign-principal and server-side expiry tests remain unimplemented/live-unverified.

The local [read-denial candidate](../../services/local-owner/src/synthetic-read-denial.ts)
now supplies immutable SSM GetParameter / ECS DescribeClusters request shapes
with nonce-derived canary names, no decryption and no caller-selected resource.
It accepts only an explicitly supplied restricted lease/transport factory, with
two ordered attempts, no retry, a 40-second whole budget, 20 seconds per request,
lease rechecks and cleanup on success/failure/close. It has no default network
client or CLI entry. Injected fixture success remains liveAuthorizationVerified
false. Random names are not proof of nonexistence; an unexpected success, missing
resource or ambiguous denial stops the batch without publishing the raw result.
This is not an approval to recreate the role or make service requests.

The separately injected [signed transport](../../services/local-owner/src/synthetic-read-denial-transport.ts)
is now a local candidate, not a wired operator or an accepted live test. It has
no default credential chain: the caller must supply a freshly verified lease.
Only two ordered Tokyo HTTPS targets and exact bodies can be signed; concurrent
requests, changed/expired credentials and retries are rejected. Its private TLS
agent has no keep-alive or redirect behavior and is destroyed on failure/close.
The bounded response reader rejects successful responses before consuming data,
limits errors to 16 KiB / 256 chunks, requires complete valid UTF-8 and cancels
on abort. Injected-wire/stream tests use fake credentials and no network. These
tests do not prove the TLS handshake or AWS denial behavior; no native request
was sent. A real two-request denial exercise still needs its own approval and
temporary-role lifecycle integration with automatic verified cleanup.

The [single-use exercise composition](../../services/local-owner/src/synthetic-read-denial-exercise.ts)
connects four fresh role-policy reads and one STS acquisition to that fixed pair,
then verifies that the borrowed credential fields are empty and lease access is
closed. Construction is inert; only the separately selected read-denial executable
path calls it. Acquisition,
factory and request failures remain sanitized, and close cancels the candidate
before dropping the lease. Injected composition tests do not authorize any new
IAM/STS operation or establish live denial. The eventual operator still needs
an approved temporary lifecycle and independent absence checks.

[GetParameter](https://docs.aws.amazon.com/systems-manager/latest/APIReference/API_GetParameter.html)
documents WithDecryption and ParameterNotFound; [DescribeClusters](https://docs.aws.amazon.com/AmazonECS/latest/APIReference/API_DescribeClusters.html)
documents explicit cluster selection. Read denial does not prove RunTask denial.

[AWS denial guidance](https://docs.aws.amazon.com/IAM/latest/UserGuide/troubleshoot_access-denied.html)
distinguishes implicit/explicit denial and notes that a reported policy type is
not necessarily the only applicable policy. The parser does not infer otherwise.

The existing project's IAM role did not expose CloudFormation system tags in a
2026-10-28 read, so their presence is not assumed. When present they must bind
this exact stack; configured tags, creation time, fresh stack/template/resource
reads and a previously observed RoleId are also checked. These checks do not
provide an atomic transaction against another administrator changing IAM.

Sources: [ExecuteChangeSet](https://docs.aws.amazon.com/AWSCloudFormation/latest/APIReference/API_ExecuteChangeSet.html)
explains asynchronous execution and incompatibility of DisableRollback with an
already specified OnStackFailure; [DeleteStack](https://docs.aws.amazon.com/AWSCloudFormation/latest/APIReference/API_DeleteStack.html)
describes asynchronous deletion; [resource summaries](https://docs.aws.amazon.com/AWSCloudFormation/latest/APIReference/API_StackResourceSummary.html)
define the ownership/status fields. No broad deletion examples are adopted.
