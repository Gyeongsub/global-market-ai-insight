# Permission-free synthetic-lab trust probe

Purpose: establish whether the existing temporary owner login can satisfy the
candidate role's exact-user, temporary-credential, HTTPS and MFA trust conditions.
This does not invoke Bedrock or validate the model permission policy. It does not
create the durable candidate role or switch the current administrator-backed lab.

## Boundaries

- Dry-run by default. The live flag is `--execute-no-permission-trust-probe`.
- Require the supported Node runtime, current-source successful local gate,
  exact `gmai-admin` owner and safe project read-only baseline first.
- Create at most one unique `gmai-synthetic-trust-<random nonce>` IAM role, no
  identity permission policy or instance profile. Its trust additionally expires
  five minutes after probe start. Do not modify existing roles or owner MFA.
- After a short propagation wait, inspect the exact role ID, trust, creation
  time, tags, empty inline/managed policies and empty instance-profile membership.
- Attempt AssumeRole only once with a 900-second duration and explicit deny-all
  session policy. CLI output projection excludes all returned keys. Never use
  the resulting credentials, relax MFA or retry with the administrator.
- A denied attempt is inconclusive about the cause: MFA context, propagation or
  another policy may be responsible. It is not proof that MFA is absent.
- In `finally`, inspect ownership/memberships again and delete only the unchanged
  owned role. Confirm absence independently, allowing two bounded propagation
  waits. Unknown/error is not absence; do not detach unrelated added policies.

An absent read before any deletion is not sufficient after an uncertain create;
the role may appear later. The probe performs bounded discovery and otherwise
leaves cleanup explicitly unverified for reconciliation. A lost deletion response
requires two consecutive absent reads rather than one. The journal retains the
verified role ID privately when available, never keys.

Role deletion is not a general STS revocation mechanism. A successful probe may
have issued 15-minute credentials, but the requested session policy denies all
actions; the probe never uses or prints those keys. STS GetCallerIdentity's
special behavior must not be treated as evidence of workload permission.

The probe makes up to 12 preflight reads plus at most 12 normal / 12 cleanup
calls. Each probe CLI call has a 20-second deadline, no SDK/CLI automatic retry,
and a fixed AWS endpoint. New work ends after four minutes; cleanup retains a
separate bounded call budget even if the local wall clock changes. It adds no
compute, storage, paid model, provider request, schedule or public endpoint.
Existing AWS resources/requests and delayed billing remain separate concerns.

The explicit global IAM endpoint is signed in `us-east-1`; the explicit STS
endpoint remains in `ap-northeast-1`. IAM is global: this is not a workload/model
region change. Signing the global endpoint as Tokyo was observed to fail before
role creation and must not be confused with failed MFA authorization.

## Operator sequence

1. Run the full local gate after the last source edit. Authenticate the existing
   CLI profile normally; do not create long-lived keys. Keep private values out
   of chat and screenshots.
2. Set `AWS_PROFILE=gmai-admin`, the verified absolute `GMAI_AWS_CLI_PATH`, and
   `GMAI_OWNER_GATE_RUN_ID` to that successful current-source receipt.
3. Plan: `node --import tsx scripts/synthetic-trust-probe.ts`.
4. Execute once: append `--execute-no-permission-trust-probe`. A journal is created
   under ignored `outputs/local-gates/synthetic-trust-<nonce>.json` before creation.
5. Require `absentConfirmed=true`. `completed=true` means the probe and cleanup
   completed, not necessarily that assumption succeeded; check `assumption`.
6. Independently repeat the existing project read-only posture check and local
   inventory, then log the CLI out when AWS work ends. Browser logout is separate.

If interrupted or `cleanupError=true`, read the owned journal before any rerun.
Do not start another probe or bulk-delete matching names. Reconcile that exact
role's nonce tag, ID (if recorded), trust, creation window and empty memberships;
only then delete it and verify absence. Any foreign modification is a blocker.
The five-minute trust window reduces exposure after interruption but does not
replace cleanup confirmation.

## Evidence limits and sources

The injected tests cover success, denial, ambiguous create/delete, wait failure,
foreign or modified resources and malformed projected responses. They are not
live IAM authorization or live cleanup evidence. No actual probe result is
claimed here until a separately dated execution record is available.

AWS references, reviewed 2026-10-26:
[CreateRole](https://docs.aws.amazon.com/IAM/latest/APIReference/API_CreateRole.html),
[DeleteRole](https://docs.aws.amazon.com/IAM/latest/APIReference/API_DeleteRole.html),
[AssumeRole](https://docs.aws.amazon.com/STS/latest/APIReference/API_AssumeRole.html),
[MFA API access](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_mfa_configure-api-require.html).
