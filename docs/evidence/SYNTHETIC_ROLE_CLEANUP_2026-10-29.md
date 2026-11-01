# Synthetic role cleanup correction — 2026-10-29

## Scope

Resume at the previous failed automatic cleanup, preserve the verified recovery
and avoid treating a prior one-attempt IAM approval as an unlimited retry budget.
No new role or model request is part of the local corrections below.

## Local changes and regression evidence

- Use three distinct, stable operation-specific client tokens for CREATE
  proposal, execution and deletion. A deduplication fixture failed before the
  correction, then passed. This models a documented failure class, not proof of
  yesterday's AWS root cause.
- Retain only bounded deletion diagnostics: NOT_ATTEMPTED, ACKNOWLEDGED,
  TOKEN_CONFLICT and UNVERIFIED. Recognize only a strict single-line DeleteStack
  TokenAlreadyExists CLI envelope. Raw identifiers, credentials and AWS error
  prose are not included in the result/journal diagnostic.
- A second regression reproduced false cleanup when a known rejected deletion
  was followed by invisible stack/role reads. The correction requires an exact
  deletion tombstone to reconcile this known rejection. No mutation is retried.
- Focused rehearsal/draft-adapter/live-adapter tests: 31 passed. Service
  TypeScript build passed. Full current/fresh-source proofs are pending.
- Existing ownership, original template/resource/role-ID checks, 30/48 call
  bounds, one-assumption/no-inference boundary and default inert CLI remain.

## AWS diagnostic readback

The existing CLI session was refreshed through the user's already signed-in
AWS browser session. One read raced login completion and failed without any
mutation; a later bounded CloudTrail read succeeded. For the exact prior stack,
the one-hour window contained one DeleteStack event at 2026-10-28T12:12:39Z,
without a reported error; the response had no additional page. The matching
request-token category was not established. No matching initial automatic
deletion failure appeared, so its cause remains unconfirmed. Do not turn this
negative audit result into proof of request absence or token conflict.

## Local proof and screen checkpoint

Current gate `461a679c-b8a6-4388-a5ed-09ee579d369d` passed 90 steps at
10:44:42.892Z: 1,725 pass / one existing skip, 33 loopback checks, zero
AWS/external calls, closed HTTP servers, 433154 ms. Source: 778 files,
7,006,570 bytes, SHA-256
`8b8b0b2e5705d6046798aef34eb94d441cd7d44b11bc4cd0ec041394e9ca0d31`.

Fresh-clone attempt `71d6d33a-b75a-460e-b7e8-886bd4490f84` failed its
480-second full-gate deadline after 84 successful measured steps. Completed
steps consumed 427515 ms; infrastructure assertions took 110552 ms and service
tests 94876 ms, versus 91868/88661 ms in the current gate. The timeout occurred
during lint; later steps were not accepted. No test failure was observed, but
this is not a passed install/source gate. The wrapper exited 1 and removed its
temporary trees. An interim inventory found zero temporary directories and
listeners; active local diagnostics and the login cache correctly prevented a
safe-stop claim.

The local-only budget was adjusted to a single 600-second ceiling. All 90
checks, fail-on-timeout behavior, minimal child environment, and AWS limits
remain unchanged. Deadline/receipt regression tests passed 44/44. A diagnostic
run of the same infrastructure files with concurrency three completed in
106204 ms, not evidence of improvement; the production concurrency remains two.
No cloud action follows until both new exact-source proofs pass.

IAB mobile checks at 390 x 844 verified English and Japanese search, QLD risk
wording, SPCX identity warnings and the plain ChatGPT URL. The Japanese offline
SPCX ANALYZE flow ended DATA_UNAVAILABLE without invented price or analysis.
English/Japanese/Korean document width was 375 within the 390 viewport, with
one main element. Locale returned to Korean; the viewport was reset and the
temporary tab closed. Preview/supervisor both confirmed closure. No clipboard
copy, external navigation, actual AWS lab start or inference occurred. This
does not certify real Bedrock mobile output or all assistive technologies.

The user separately approved one new temporary role creation/STS/cleanup
revalidation. The subsequent outcome is recorded below.

## Corrected-source proof and approved live acceptance

An intermediate current gate `29f89495-3a51-4961-8e67-b3e0bb2daa33` failed
at the JavaScript-helper stage. Focused diagnostics found Windows EPERM while
creating test-only links in the restricted execution environment; these tests
were not removed or skipped. Its diagnostic temporary root was subsequently
absent. Re-execution through the normal permission workflow passed.

- Current gate `6a2d2fa7-b12b-4516-bae3-8da1cb39d10b`: passed at
  11:09:32.694Z, 310944 ms, all 90 steps, 1,725 pass / one existing skip.
- Fresh local clone `164bae0e-eee1-45a4-98f4-cfcd6fb4a538`: passed at
  11:18:39.087Z with the same 90 steps and test counts; install 64602 ms,
  gate 371385 ms. Public locked packages only, no lifecycle scripts or private
  registry credentials, temporary trees removed, no remote repository contact.
- Exact common source: 778 files / 7,009,489 bytes,
  `7adb10067397048e12669abc2a3904b5c477c1a06673a1a426f5af2795df2385`.
  Both gates ran 33 loopback checks and confirmed server closure with zero AWS
  calls. Later documentation/local candidate edits require fresh proof for a
  later cloud action.

The newly approved rehearsal created the one isolated model role, assumed it
once, cleared its local credential lease and automatically deleted its stack.
Result: completed true; deployed/exercised true; stackAbsent/roleAbsent true;
primaryError/cleanupError false; deletionResponse ACKNOWLEDGED; 17 normal and
10 cleanup control-plane calls. Source/preflight/credential reads are separate
from those control-plane counters. Inference/provider calls were zero.

At approximately 11:23Z, three independent reads confirmed the exact stack
DELETE_COMPLETE, GetRole NoSuchEntity and its sole IAM resource DELETE_COMPLETE.
No recovery mutation was needed. Historical deleted-stack/change-set records
are not active permissions. The earlier failed/recovered run remains separate.

This completes temporary credential rehearsal/automated teardown acceptance,
not durable role deployment, other-principal denial, denied-secret/compute
access, server-side expiry or restricted inference. Credential clearing/role
deletion is not a claim of instant global revocation or secure JS memory erasure.
The user-facing executable has not been switched to the candidate role.

## Post-rehearsal safety and local-only continuation

The scoped 11-read posture check after deletion confirmed zero running/pending
tasks, services and occupied slots, circuit OPEN v11, internal jobs disabled and
live result display disabled. Operations/maintenance/alarm-circuit stacks remain
absent. The configured USD 5 monthly budget reported actual USD 0 and forecast
USD 0.002 at that read; delayed billing and retained storage still apply.

CLI logout then removed the gmai-admin cached login. Already issued/copied
credentials are not instantly revoked by cache removal (the CLI warns about
previously issued credentials). No additional AWS mutation or service request
has been made during the subsequent local candidate work. Browser sign-out and
the final independent local inventory still require fresh confirmation at stop.

Read-denial request/transport/response candidates were developed with injected
fixtures only. The focused group passed 31 tests and service typecheck. Current
gate `88fe9a77-77c4-440e-bf3f-7745cd39cae9` passed at 11:44:42.003Z:
90 steps, 1,749 pass / one existing skip, 347319 ms, 33 closed loopback checks,
zero AWS/external calls. Source: 784 files / 7,052,887 bytes,
`1a93fdbc36acfa6439547f458ba97e2a96425c7ae349ee58a29a0fb9b62d99ea`.

A later single-use exercise composition connects the four policy reads, one
assumption, restricted signer, two denials and visible credential clearing in
injected tests. Its seven acquisition/composition tests and service typecheck
passed, including policy mismatch, failure/close, no retry and no private output.
These later source/doc edits are not covered by the preceding fingerprint.
Native HTTPS remains unwired and live-unverified; the production lab still uses
its prior owner runner. No model call, external data access or durable IAM change
is part of this local batch. The completed one-attempt approval has not been
reused; a new two-read negative-authorization attempt is separately pending.

## Safe handoff while the next sensitive scope awaits approval

Final local gate `8474c7a7-c37c-4b73-a22f-b8d788472050` passed at
11:53:54.107Z: all 90 steps, 1,752 pass / one existing skip, 309617 ms,
33 closed loopback checks and zero AWS/external calls. Its code/doc checkpoint
was 785 files / 7,060,933 bytes,
`7b75f824327d62bc0c5e2a2fca92e3c8fcbe53903387f8685785f14448fd070d`.
This receipt predates this final documentation update; a later cloud attempt
requires new exact-source current/fresh-clone receipts, not a reused old proof.

The fresh Chrome console showed current-month and month-end forecast values of
about USD 0.01. This differs from the earlier budget read and is not reconciled
as an exact final charge; billing delay, display rounding/scopes and retained
S3/ECR/DynamoDB/log storage remain caveats. Sign out was clicked and the public
AWS console page with Sign in controls was observed. No secret-bearing callback
URL was read or revisited after its earlier tab-binding failure.

Independent local inventory at 11:54:30Z passed: Docker/AWS CLI/project helper/
unattributed helper processes, scoped listeners, owned temporary directories,
backend staging, frontend work, login-cache JSON files and Docker socket
directories were all zero. Two assistant processes were excluded and two empty
work directories were retained. No process kill, file delete, security setting
change or additional AWS call was performed by the inventory. CLI cache absence
and browser sign-out do not prove global revocation of any previously copied
credentials.

No native negative-authorization call, role recreation, model invocation,
provider call, Git remote or publication followed the completed approval.
The next separately approved scope would need a bounded operator/lifecycle
integration, new source proofs/authentication and independent role/stack absence
checks; its implementation and live acceptance are not completed here.

## References

## Subsequent separate read-denial approval and preparation

After the safe handoff the user approved one temporary role, one STS assumption,
at most two fixed canary read-denial requests and verified cleanup. Local operator
integration now awaits the asynchronous bounded exercise before teardown and
records a separate exercise mode/count without raw service errors. Existing
credential-only behavior is retained. Twenty-seven focused lifecycle/operator
tests and the operator TypeScript check passed. This is preparation, not a live
denial result; fresh whole-source proofs and new login are required.

## References (continued)

[DeleteStack](https://docs.aws.amazon.com/AWSCloudFormation/latest/APIReference/API_DeleteStack.html)
and [ExecuteChangeSet](https://docs.aws.amazon.com/AWSCloudFormation/latest/APIReference/API_ExecuteChangeSet.html)
define a unique request token for each operation and document TokenAlreadyExists.
The code separates operation tokens; it does not weaken IAM or retry failed
mutations automatically.
