# October 31 bounded expiry revalidation — HTTP success, acceptance incomplete

## Approved execution and source boundary

The user separately approved one temporary role/stack, one STS assumption and at
most two fixed synthetic English QLD Tokyo Nova Lite requests. Each request had
512 output tokens maximum, no retry and a 20-second deadline. The second was
conditional on a validated positive control and the five-minute policy window.
This approval is now consumed; it does not authorize another live cycle.

Before execution, both current and isolated frozen-clone gates passed 90 steps,
1,788 tests and one existing skip. Both fingerprints were 796 files / 7,154,750
bytes, SHA-256 `a3c83da1ec1706aa4a8763474037b5eff839e95ecb721cf9132d9e2373449e69`.
Current receipt: `4763679d-932e-4d67-ad7b-45767c814b09`; clone receipt:
`87eb5666-7582-44f6-925b-9c72985f6d9c`. Clone installation used 392 locked package
identities, disabled lifecycle scripts, no private registry credentials and no
remote repository. Temporary clone/install trees were removed.

## Actual result, not inferred success

- One temporary role was deployed and one restricted model request was attempted.
- The server returned HTTP 200. Strict JSON parsing passed; normalization of the
  usage shape rejected the result at `CONTROL_NORMALIZATION`.
- Positive-control acceptance and server-side expiry acceptance remain false.
- No second model request, retry, administrator fallback, provider API call,
  Fargate task or public deployment was performed.
- The credential holder closed, with `credentialsRetained=false` and no cleanup
  failure. Raw responses, prompts, private identifiers and keys were not added
  to diagnostic output. No exact usage or inference charge can be recovered from
  this sanitized record.

HTTP 200 narrows this attempt beyond transport/signing/status failure, but does
not establish a valid analysis result. The record cannot distinguish the exact
unexpected usage field/value. Do not present a local fixture as that response.

## Cleanup and independent readback

Automatic deletion was acknowledged; `stackAbsent=true`, `roleAbsent=true`,
`cleanupError=false`. Three separate reads at **2026-10-30T22:29:38Z** (October 31
JST) independently confirmed the exact stack's DELETE_COMPLETE tombstone, absent
IAM role and the sole IAM role resource's DELETE_COMPLETE state. Private journal
identifiers remain in ignored operator output, not this evidence document.

A further 11-read posture check confirmed running/pending tasks, ECS services and
occupied slots all zero, provider execution/display disabled, circuit OPEN v11,
and operations/alarm-circuit/maintenance stacks absent. Foundation/compute/API
baseline stacks remain unchanged. This is scoped verification, not an account-wide
zero-resource or zero-cost claim.

The CLI logout command subsequently removed the `gmai-admin` login cache. It does
not revoke tokens already loaded elsewhere. Browser console signout is not
verified and remains an explicit user handoff. Local final inventory is recorded
below after the final tests; no browser automation logout is claimed.

## Cost

The October 30T16:04:56Z AWS public Tokyo price offer was checked on October 31:
Nova Lite input USD 0.000072 / 1,000 tokens; output USD 0.000288 / 1,000 tokens.
[Official regional offer](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonBedrock/current/ap-northeast-1/index.json).
The HTTP 200 request may be billed even though our validator rejected it. There
was no second request; exact billed usage is unverified. The post-run USD 5
monthly Budget read reported actual USD 0 / forecast USD 0.002, subject to billing
delay, not evidence that this request was free. Retained baseline storage may
continue to accrue small charges; no new always-on service was left behind.

## Offline follow-up after cleanup

A new no-network pinned-SDK response test proves optional cache metadata `null`
is deserialized as absent. It failed against our native normalizer before the
correction. The normalizer now accepts null only for the three known optional
cache fields; nonzero/invalid cache activity and unknown fields still fail.
Required usage counters, sums and caps remain unchanged. A private error class
now supplies fixed normalization reason labels without field names or values.
The focused suite passed **34 tests** and service TypeScript checking passed.

This compatibility correction is not proof that the live response contained
nulls. It and the added failure categories postdate the live source fingerprint;
they are locally verified only, not live-accepted. Another actual attempt needs
new explicit approval, fresh matching source gates and authentication. Do not
recycle today's approval or enlarge IAM permissions to bypass the validator.
Restricted-runner migration, expiry, foreign-principal and RunTask-denial gates
remain separate and incomplete.

## Final local verification and stop

The post-follow-up current-source gate `cbe24cec-8020-4f0c-95c5-0f61cc74b309`
passed all 90 steps, **1,791 tests / one existing skip**, with no timeout. Its
fingerprint was 797 files / 7,166,112 bytes, SHA-256
`7fbd9b009b38749ec9a1ea8f7bb5c43aed0762574ccbf2562b9afd758611a390`.
No AWS/external network call occurred during this gate. This final evidence
paragraph postdates that proof; future live work requires fresh matching proofs.

The first shutdown inventory at 22:38:35Z reported three listener entries, so it
was not accepted as a clean stop. Separate TCP/process reads showed PID 0 entries;
data-free connections to loopback 4173, 5173 and the authentication callback port
were all refused. No process kill, socket deletion, network restart or inventory
exception was used. At **2026-10-30T22:40:28.9032192Z**, the unchanged independent
inventory passed: all ten residue categories zero (Docker, AWS CLI, project and
unattributed helpers, scoped listeners, temporary/staging/work directories,
login-cache JSON and Docker socket directories). Two assistant host processes
were explicitly excluded and two empty workspace directories retained.

Local closure and the exact temporary cloud-resource cleanup are verified.
Chrome AWS console signout remains unverified and is for the user to perform.
This does not assert global token revocation, zero retained AWS storage charges,
full-account cleanup, model result validity or server-side expiry acceptance.
