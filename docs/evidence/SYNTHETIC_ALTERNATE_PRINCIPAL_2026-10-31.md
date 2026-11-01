# October 31 alternate-principal rejection and independent cleanup

## Verified result

One bounded two-role cycle completed under the user's current autonomous-work
instruction. It created the existing isolated target-role stack and one unique
temporary source role. The source could request only STS assumption of the exact
target, with an absolute five-minute authorization window. The target's existing
owner/MFA/temporary/TLS trust was not changed.

One source assumption succeeded. The single source-signed target assumption
returned the exact STS AccessDenied service error. Target trust/policy and identity
were checked before and after. There was no retry, model request, RunTask,
provider API call, public endpoint, durable role or subscription. The target
request carried explicit deny-all and projected out child credentials, even
though unexpected success was not observed.

This accepts **one tested alternate same-account role's access rejection**.
It does not prove every possible principal is denied, isolate which individual
trust condition caused the denial, establish RunTask denial, revoke all previously
issued credentials or migrate the user-facing runner.

## Exact-source proofs

- Current receipt: `db4380f3-b019-43e3-9573-5edd0072b07c`.
- Isolated frozen-clone receipt: `f396c261-6170-4c1f-8b3c-85e2b176c913`.
- Both: **90 steps, 1,835 passed / one existing skip**, 809 files / 7,283,371 bytes.
- SHA-256: `81c60d41c7a9dd1104b1ffca13c84104aa5d621c07e619c2ee6d0d2acfc757c3`.
- Locked registry dependencies: 392; install lifecycle scripts disabled. No
  GitHub contact/upload; isolated tree removed and local HTTP listeners closed.
- The implementation first passed 41 focused candidate/entry tests and strict
  service/operator checks, including ambiguous writes, changed ownership,
  unexpected allow, cancellation, cleanup failure and consumed raw credentials.

Source remained unchanged through live execution. This later evidence update is
not part of that source hash; another mutation needs fresh matching source gates.

## Cleanup and independent confirmation

The source lifecycle completed with 21 normal / nine cleanup calls, a cleared
credential lease and verified source absence. The parent target lifecycle
completed with 17 normal / ten cleanup calls and acknowledged stack deletion.
Neither reported a primary or cleanup error. Counts exclude the target-signed
attempt, prerequisite reads and independent post-run checks.

At **2026-10-31T00:38:05.424Z**, four independent read-only requests confirmed:

1. Exact owned target stack: DELETE_COMPLETE.
2. Target model role: absent.
3. Unique source probe role: absent.
4. The target stack's sole expected IAM role resource: DELETE_COMPLETE.

The subsequent eleven-read project posture check passed: running/pending tasks,
services and occupied slots all zero; internal execution and live display false;
circuit OPEN at version 11. Operations/alarm/maintenance stacks were absent.
Foundation/Compute/API retained their existing completed states. This is a scoped
project check, not an account-wide absence inventory.

## Security and cost boundary

Source keys were confined to the parent lease and the single STS child environment,
not command arguments, returned results or journal files. Raw response references
were cleared; role deletion and reference clearing are not secure memory erasure
or a universal credential-revocation claim. The target source policies and role
trust were never broadened to make the test pass.

This cycle made **zero model/provider/compute requests** and retained no new
resource. Existing ECR/S3/DynamoDB/log storage can still incur charges. The USD 5
Budget showed actual USD 0 / forecast USD 0.002, which is delayed accounting and
not a zero-bill guarantee. Earlier model requests in the same autonomous work
remain recorded in the
[usage-compatibility evidence](SYNTHETIC_USAGE_COMPATIBILITY_2026-10-31.md).

CLI/browser authentication remains open while authorized work continues; this
checkpoint is not today's final logout/safe-stop claim. Next: local preparation
of the compute-denial gate, then gated restricted browser cutover/acceptance.
No further model request is authorized by this evidence record itself.

See the [bounded runbook](../runbooks/synthetic-alternate-principal-candidate.md).
