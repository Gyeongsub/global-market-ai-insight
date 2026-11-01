# Synthetic expiry contrast — one consumed attempt, no expiry acceptance

## Scope and source gates

The user separately approved one temporary least-privilege role/stack, one STS
assumption and at most two fixed synthetic QLD English Tokyo Nova Lite requests,
512 output tokens per request, no retry. Chrome console signout was explicitly
left to the user. No provider, RunTask, public endpoint or durable role was allowed.

Current receipt `e5fc9af7-6411-40cd-9390-d6ece1328eb4` and isolated local-clone
receipt `2c10af52-7433-45b7-b90b-0405dac6f02a` both passed 90 steps, 1,781 tests
with one existing skip. Both matched 791 files / 7,131,926 bytes, SHA-256
`a73953cd3c9236c70cac2753be511f863576b29d55ec7e999efe58528761f8db`.
The clone used 392 locked package identities, lifecycle scripts disabled, no
private registry credentials or GitHub remote. Its temporary trees were removed.
These proofs precede this outcome documentation; new live work needs fresh proofs.

## Actual outcome

- One role was created and the restricted credential acquisition reached the
  model request. Exactly one model-request attempt was recorded.
- The positive control did not pass. No second/post-window request was attempted.
- `positiveControlVerified=false`, `serverSideExpiryVerified=false`,
  `completed=false`, `primaryError=true`. This is not expiry or inference acceptance.
- The experiment closed and reported `credentialsRetained=false`. Automatic
  cleanup succeeded: deletion acknowledged, stack/role absent, `cleanupError=false`.
- Three subsequent independent reads confirmed the exact stack DELETE_COMPLETE,
  sole IAM role resource DELETE_COMPLETE, and GetRole NoSuchEntity.
- Post-run 11-read readiness confirmed jobs/display disabled, circuit OPEN v11,
  zero running/pending tasks, services and occupied slots; operations, alarm and
  maintenance stacks absent. Baseline learning stacks remain intentionally.
- CLI logout removed the profile's cached login credentials. This is not a claim
  that every already-issued credential is instantly revoked. Chrome is unchanged
  and the user will sign out independently.

The one-cycle approval is consumed. Do not repeat the live experiment automatically.
The ordinary five-minute credential lease and administrator-backed UI runner were
not changed or enabled by this experiment. No broad negative-authorization or
durable least-privilege runner acceptance follows.

## Cost and privacy

The fixed request body was 2,084 bytes and output was capped at 512 tokens. One
attempt may be billable; no valid usage packet was retained, so neither zero
inference cost nor an exact charge is asserted. Budget reads before/after showed
USD 5 monthly limit, actual USD 0 and forecast USD 0.002, subject to billing delay.
Existing retained storage can still incur small charges. No always-on compute,
paid subscription, external data API or public deployment was created.

The [official Tokyo Bedrock price list](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonBedrock/current/ap-northeast-1/index.json)
was read on 2026-10-30 (publication 2026-10-29T18:57:48Z): Nova Lite input
USD 0.000072 / 1K tokens; output USD 0.000288 / 1K tokens. These rates do not
establish the token usage or charge of the failed control.
Only invented synthetic data was used; no provider key, actual quotes or user
personal information was put in the prompt. Raw AWS responses and credentials
were not added to evidence or logs. Nothing was uploaded to GitHub.

## Offline finding and next resumption

The sanitized receipt does not identify whether the control failed at transport,
HTTP, timing, JSON or grounded-result validation. Do not infer the cause.
An offline capture using the installed AWS SDK and fake credentials, with no
network handler, showed its Converse path uses `amazon.nova-lite-v1%3A0`; the
new native transport used a literal colon. The parsed request bodies were
semantically identical (2,084 bytes), despite JSON property-order differences.
This path difference is a compatibility lead, not a proven cause of the live
failure. No endpoint or policy fix and no second live attempt was made.

Next: add narrowly enumerated, non-sensitive failure-stage diagnostics; compare
the native URI/signing behavior against the pinned SDK offline; retain all request,
time, identity and cleanup limits. Run local regressions and fresh source gates.
Any new role/model cycle needs a new specific approval; today's approval cannot
be recycled. User requested safe stop before this new implementation began.

## Final independent local closure

At 2026-10-30T12:27:06.9824348Z the read-only inventory verified zero in all ten
residue categories: Docker/AWS CLI/project/unattributed helper processes, scoped
listeners (including today's login callback), owned temporary directories,
backend staging, frontend work, login-cache JSON and active Docker socket
directories. Two assistant processes were excluded and two empty work directories
retained. No additional process stop, deletion or security-setting change was
needed. This is a scoped local observation, not account-wide credential revocation.
