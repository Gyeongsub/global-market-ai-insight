# Alternate-principal denial — bounded two-role rehearsal

Date: 2026-10-31. One distinct default-inert two-role cycle subsequently passed
after matching 90-step current/frozen-clone gates (1,835 pass / one skip). One
source assumption and one denied target attempt completed; four independent
reads confirmed both roles absent and the target stack deleted. No model or
compute request occurred. [Actual result](../evidence/SYNTHETIC_ALTERNATE_PRINCIPAL_2026-10-31.md).
The original local preparation created no role or AWS request.
The preceding restricted analysis and
absolute-window denial are already accepted in the
[dated evidence](../evidence/SYNTHETIC_USAGE_COMPATIBILITY_2026-10-31.md).
This preparation adds zero model/provider/compute requests.

## Why a separate source principal

Using the model role itself to attempt AssumeRole would encounter its explicit
non-model action denial. That is not evidence that the target trust rejects a
different principal. The proposed probe therefore uses one unique temporary
same-account role with permission to assume only the exact model role. It is
not another human account, IAM user or external AWS account. The model role's
owner-only trust must remain unchanged.

The [policy builder](../../shared/security/synthetic-alternate-principal.ts)
retains owner/MFA/temporary/TLS constraints, restricts the source trust and
permissions to an absolute five-minute window and denies other actions/targets/
regions. Source assumption uses a 900-second credential duration but the
authorization window stays five minutes. The one target assumption is always
requested with an explicit deny-all session policy. If it unexpectedly succeeds,
the test fails and its returned credentials are not used. GetCallerIdentity is
not a useful proof that all permissions were revoked.

AWS documents the session-policy intersection and explicit-deny precedence in
[AssumeRole permissions](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_temp_control-access_assumerole.html).
Neither IAM conditions nor this design count requests or guarantee a dollar cap.

## Implemented locally

- [Snapshot review](../../services/local-owner/src/synthetic-alternate-principal-review.ts)
  checks exact role identity, nonce tags, creation time, owner trust, inline
  permission policy, empty attached policies/instance profiles and unpaginated
  responses. Extra or missing permissions, stale windows and ambiguous reads fail.
- [One-shot CLI adapter candidate](../../scripts/synthetic-alternate-principal-cli.ts)
  takes an injected runner only; it cannot spawn AWS by itself. It fixes Tokyo
  regional STS, exact target, one attempt, 20-second timeout, 16 KiB output and
  no retry. It supplies only restricted source keys in the child environment,
  removes inherited profile/proxy/endpoint overrides, disables metadata and sets
  configuration/credential files to Windows NUL. Keys are never command arguments.
- CLI query output excludes returned target keys. Raw child stdout/stderr and
  source environment references are cleared, and source-lease close is attempted
  on every path. Cleanup failure cannot become an accepted result. This is not
  secure erasure of process memory or revocation of STS credentials.
- Only the exact STS AccessDenied service-error projection is a candidate pass;
  unexpected success, expired credentials, signature errors, throttling, CLI
  failures and late responses are not. AWS CLI documents
  [exit 254](https://docs.aws.amazon.com/cli/latest/topic/return-codes.html) as a
  service error, not specifically authorization denial. We additionally require
  the exact error and operation, and do not diagnose which trust condition denied.
- The [source credential lease](../../services/local-owner/src/synthetic-alternate-principal-lease.ts)
  binds the exact role/session IDs and consumes raw credentials on success or
  rejection. It keeps the original absolute window, closes on reverse/invalid
  clocks and never refreshes or falls back to administrator inference.
- The [source lifecycle](../../scripts/synthetic-alternate-principal-rehearsal.ts)
  checks target trust/policy before and after, creates one nonce-tagged source,
  verifies empty membership before granting only exact-target assumption, then
  acquires one source session and makes at most one target attempt. It always
  attempts owned source cleanup; cancellation blocks normal work, not cleanup.
  Unknown ownership, unexpected permissions, a surviving policy/role or ambiguous
  creation without deletion proof remain cleanup failures, never false success.
- Thirty-three candidate tests plus eight live-entry/legacy regression tests
  passed without AWS. The entry tests use local child processes with stripped
  credentials. Strict service/operator type checks passed. Whole-source gates
  must still be refreshed; focused checks alone do not authorize live use.

## Requirements for any future live attempt

1. Pass matching current/isolated-clone exact-source gates and verify current
   owner identity plus idle cloud posture. Review this two-role scope under the
   current user authority; previous one-role approvals are not silently reused.
2. The distinct mode in the [existing live operator](../../scripts/synthetic-role-rehearsal-live.ts)
   wraps the source lifecycle inside the already ownership-checked target stack
   rehearsal. It changes no target trust and creates at most two temporary roles:
   one target and one probe. No model permission is granted to the source probe.
3. Execute at most one bounded cycle. The target is not assumed by the owner in
   this mode: source assumption once, target assumption attempt once. No model,
   RunTask, provider, public endpoint, durable role or subscription is involved.
4. Delete both owned resources and independently confirm absence. Never delete
   an unowned or concurrently changed role. Report cleanup uncertainty instead
   of treating the five-minute authorization limit as resource cleanup.

Inspect the default-inert scope with
`node --import tsx scripts/synthetic-role-rehearsal-live.ts --plan-alternate-principal`.
The distinct live flag is `--execute-temporary-role-alternate-principal`; it requires
the existing AWS profile/executable and both fresh gate receipt IDs. The source
journal is embedded in the owned target rehearsal journal. Parent target cleanup
still runs if source cleanup or denial acceptance fails. Normal source operations
are bounded to 28 calls/four minutes, cleanup to 32 calls; each native subprocess
has a 20-second timeout and SDK/CLI retries are disabled. The two fixed propagation
waits and cleanup reconciliation waits are each 15 seconds. Actual target request
is separately one attempt/20 seconds/16 KiB, with only source credentials.

IAM does not provide compare-and-swap deletion against a role-policy revision;
fresh ownership/policy reads reduce but do not eliminate a concurrent operator
race. This is an isolated owner-only rehearsal, not a multi-administrator lease.

`liveAuthorizationVerified` remains false in pure reviewers and local adapters.
The live orchestrator must combine actual signed-request evidence with the
independent resource/identity checks. One alternate principal does not establish
that every possible principal is denied or identify a unique denying predicate.

## Separate compute-denial gate

This probe does not close RunTask denial. A fabricated task definition can fail
before authorization; an invalid request is not an IAM negative test. RunTask has
no documented DryRun flag, and count zero is not assumed to be a safe dry run.
A future proposal needs a reviewed exact request and containment/cleanup if it
unexpectedly starts work. No RunTask request is included here. See the
[RunTask API](https://docs.aws.amazon.com/AmazonECS/latest/APIReference/API_RunTask.html).

The subsequent [EC2-only empty-capacity candidate](synthetic-compute-denial-candidate.md)
is local preparation only. It retains this open live gate and does not reuse the
two-role assumption cycle as permission or evidence for a compute request.
