# Synthetic role draft — 2026-10-27

## Source proofs and interrupted run

The DescribeStacks absence parser now recognizes the CLI's optional zero-retry
envelope, anchored to the exact operation and one complete absence diagnostic.
AccessDenied, nonzero retry suffixes and mixed diagnostics remain unverified.
The reproduced regression failed before the repair and passed afterward.

The first fresh-install run was stopped at the user's Wi-Fi pause request:
`a98a2e91-e5d1-46d7-a357-c9a15c80fd61`, completed but **not passed**. Its test
subtree was stopped, the wrapper removed its temporary copies, and a single
orphaned disposable CDK test-output directory was independently identified and
removed. Source files were preserved. CLI login was deliberately retained for
the requested short pause; this was not a full logout/credential-revocation claim.

After the user's resume:

- Isolated clone: `b9f91148-3005-4cf5-9be4-0b67b2df936b`,
  11:38:14.588–11:47:01.846 UTC, install 70,559 ms / gate 352,779 ms.
- Current installation: `29ed7ea7-de26-41a0-926b-a37b7b57dc5d`,
  11:47:22.546–11:53:21.308 UTC, gate 357,776 ms.
- Both: 90 steps, 1,683 tests / 1,682 pass / one existing skip; 766 files,
  6,875,798 bytes, SHA-256
  `beeaeda11a79a725d2b43499a575dfeeed0cfb597d87c61dc213ccdcd76ae6e3`.
- No AWS calls in either gate. Fresh install used 392 locked public package
  identities, no private registry credentials, no lifecycle scripts or reused
  dependencies; temporary copies removed. Both closed their loopback servers.

## Actual proposal and independently verified recovery

One unexecuted CREATE change set was attempted after both receipts and fresh
owner/cloud checks. The normal operator failed closed: reviewed=false,
normalCalls=6, cleanupCalls=1, executeCalls=0, roleCreateRequests=0,
inferenceCalls=0. It **did not confirm cleanup** and that original result was not
rewritten or relabeled as success.

Exact-target diagnostic reads showed two AWS response details not represented
by the earlier fixtures:

1. The REVIEW_IN_PROGRESS placeholder stack had an empty Tags array; the change
   set itself carried the exact Project/Purpose/unique ProofId tags.
2. DescribeChangeSet returned DeploymentConfig with Mode=STANDARD and
   DisableRollback=false. AWS documents these default values in
   [DeploymentConfig](https://docs.aws.amazon.com/AWSCloudFormation/latest/APIReference/API_DeploymentConfig.html).

An independently bounded cleanup verified the current owner/account, unique
names and linked IDs, creation times against the owned journal, exact change-set
tags, one Add IAM-role proposal, safe standard settings, the server-side original
template's hash against the journal, REVIEW_IN_PROGRESS status and zero resources.
Only then it deleted that exact change set, verified absence, re-read the same
empty stack, deleted it and verified deletion. A final fixed-role read confirmed
the model role was absent. Recovery result: draftRemoved=true, stackRemoved=true,
roleAbsent=true, 10 reads / two deletions / zero execute or inference calls.
This recovered a failed automated cleanup; it was not a successful automated
proposal review or role deployment.

## Local correction after recovery

The reviewer now permits only the observed STANDARD/rollback-enabled default
configuration. An empty-tag placeholder requires a matching independently read
tagged proposal, exact original template, same-account unique IDs and bounded
creation timestamps. Empty tags by themselves never prove ownership. Unexpected
tags, template changes, another stack, EXPRESS mode and disabled rollback fail.

For interrupted/pending creation, cleanup can obtain this historical binding
with two extra read-only calls, still within its separate 22-call limit. It does
not turn a pending/failed proposal into a successful or executable review. A
foreign, executed, nonempty or unverified stack still cannot be deleted. The
live adapter's cleanup allowlist adds only GetTemplate, not ExecuteChangeSet.

These changes postdate the receipts above. New full current/fresh source proofs
and a successful automated proposal/cleanup run remain necessary. The current
administrator-backed synthetic lab is unchanged; no least-privilege live-role,
negative-authorization, expiry or publication gate is closed by this evidence.

## Measured local-gate budget and next candidate composition

Fresh run `7093fb03-d920-4450-8d39-35de16f6e093` reached the former 360-second
whole-gate deadline during frontend lint. It is **failed**, not accepted: 84
completed steps / no failed completed step, but missing remaining lint/build/
frontend contract/HTTP evidence. Recorded duration was 360,016 ms; completed
step time totaled 334,143 ms. Infrastructure assertions used 87,301 ms, service
tests 76,598 ms and local publication/documentation guards 47,779 ms.

Together with the prior successful 352,779 ms and 357,776 ms measurements, this
leaves insufficient headroom for a growing 90-step Windows gate. The single
local whole-gate limit is now 480 seconds, shared by producer and receipt
validators. Child steps only receive the remaining budget, not a new eight
minutes. No test, assertion, network restriction or failed receipt is waived;
the live AWS, model, install-download and cleanup limits are unchanged.
The deadline/receipt-focused suite passed 49 tests, including actual termination
of a deliberately hanging child. New full proofs are still required.

A local-only restricted lab composition now connects the candidate runtime to
the existing loopback server. Explicit close and automatic server end share one
cleanup operation; listen/runtime failure and server-close failure still attempt
client destruction and lease clearing. Cleanup errors are reported rather than
silently declared successful. Five focused tests passed, including a real
loopback listener's automatic expiry with no model calls. It is not wired into
the executable administrator-backed lab, and no AWS role was created for it.

## Receipt boundary regression

## Second exact-source run and deletion-tombstone correction

Both new proofs passed for SHA-256
`394b484b13050cbb6abe8061160f173adff881c6e586192f8b8e11b2bbbdbc99`
(769 files / 6,900,528 bytes), 90 steps and 1,691 pass / one existing skip:
current `43457741-b9fb-4164-9f93-e3a7447e7bb1` (393,963 ms), fresh clone
`792ea663-4e32-4a3c-9db8-306a05c2d8e5` (398,966 ms gate; 87,538 ms install).

The next actual attempt successfully reviewed the proposal, but final automatic
deletion verification reported cleanupError=true: normalCalls=7, cleanupCalls=8,
executeCalls=0. Independent reads found the exact stack DELETE_COMPLETE and
confirmed both the change set and model role ABSENT. No additional delete was
needed. The tombstone omitted EnableTerminationProtection, although that field
had been verified false before deletion; this response difference caused the
false-negative cleanup result. The failed automation remains failed evidence.

A regression test reproduced the failure before the fix. The local correction
accepts this omitted field only for the same already-owned stack after its
verified-empty deletion request, with DELETE_COMPLETE and a valid deletion time
not preceding creation. Missing protection on a live placeholder still blocks
deletion, as do unverified identity or malformed deletion time. New full proofs
and an automated end-to-end success are still required after this correction.

## Cost/security boundary (current observations)

Fresh run `f5fea504-c9cb-4877-b7e3-55188860a466` failed at step 67 (the
JavaScript helper suite), not at its deadline. One receipt-validation test still
used the old literal 365,001 ms boundary after the shared whole-gate change.
It now checks rejection immediately beyond the shared limit plus the existing
five-second receipt/termination allowance, and acceptance at that boundary.
This is not a waiver of a failed proof or an AWS timeout change; new complete
proofs remain required.

No model or provider call, actual IAM role, running compute resource or public
endpoint was created by this proposal/recovery. Project provider flags remained
disabled and the last scoped check showed OPEN v11 and zero running/pending tasks,
services and occupied slots. Retained storage may still accrue charges; the
earlier Budget values (actual USD 0 / forecast USD 0.004) are delayed estimates,
not proof of a zero bill. Final logout and closure must be checked when work ends.

## Final user-requested safe stop — 2026-10-27

After the tombstone correction, both 90-step source gates passed: 1,692 passing
tests / one existing skip, 769 files / 6,904,963 bytes, SHA-256
`a243da1c949528ee110b53b5acb5736cf93af9b89bb42aed0af58e8460a8b741`.
Current receipt: `8c758093-3e17-4e26-80bd-b51be8c51c14`, 367,016 ms.
Fresh receipt: `42df5f1f-6492-44ff-b73d-3c17991f045b`, completed
2026-10-27T13:09:57.293Z, 82,362 ms install / 350,819 ms gate. The isolated
clone used a frozen installation with lifecycle scripts disabled, no private
registry credentials, no AWS calls and no publication; temporary trees and
loopback servers were closed. These receipts precede this handoff-only edit.

Desktop browser checks used an injected local fixture, not AWS inference:
Korean result rendering, refresh without another attempt and explicit closure
with result removal were observed. Production-style AWS labels in that fixture
are not live evidence. Mobile viewport setup timed out, so mobile acceptance
remains open; the viewport override was reset and its fixture server stopped.

At the user's stop request no third AWS proposal attempt or role deployment was
started. The final scoped cloud check made 11 read-only calls / zero mutations:
provider/internal jobs and live display disabled, circuit OPEN v11, running and
pending tasks / services / occupied slots all zero. Independent earlier reads
confirmed the exact proposal absent, its empty stack DELETE_COMPLETE and the
model role absent. Today's proposal work made no Bedrock or provider calls.

The console was signed out and its public sign-in page observed. CLI logout
completed and removed the cached login; this does not revoke every previously
issued token. Independent local inventory at 2026-10-27T13:13:31.796Z verified
zero Docker/AWS CLI/project/unattributed helper processes, scoped listeners,
owned temporary/staging/frontend work directories, login-cache JSON files and
active Docker socket directories. Two empty work directories remain; assistant
processes are excluded. Local inventory alone does not assert cloud safety.

Console current-month actual/forecast displayed approximately USD 0.01 each;
the USD 5 Budget report showed delayed actual USD 0 / forecast USD 0.004. These
are not today's incremental cost or proof of zero future charges. Retained AWS
storage can still incur small charges. No always-on compute workload was left
running in the checked project scope.

Next session: reread current scope, obtain fresh same-source current/clone
receipts before any actual proposal, then verify bounded automated proposal
cleanup with the tombstone correction. Role deployment, denied-access/expiry
and least-privilege inference remain separate open gates. The executable lab
remains administrator-backed; no release or GitHub publication is authorized.
