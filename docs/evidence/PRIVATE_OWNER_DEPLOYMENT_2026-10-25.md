# Owner-only controller update and GET acceptance — 2026-10-25

Scope: the user-approved private, single-owner AWS practice target. No GitHub
publication, provider/model job, market-data redistribution or subscription.

## Executed and independently observed

- The pre-update current-installation full gate passed 90 steps / 1,471 tests
  (1,470 pass, one existing privilege skip), with zero AWS/external network calls.
  Receipt `5f7f10cb-a0df-4757-94f9-c5d8662d8a3a` completed at
  `2026-10-25T06:39:26.813Z`; source digest
  `20bdfe28afca0c61f7778dffeb7b7396d98b9d2ee393d74125d4b72a0ae63688`.
  This is not a fresh clone/frozen installation or proof for subsequent edits.
- One unexecuted owner-change review completed first and removed its exact draft
  and private temporary package. The earlier preparation failure reached no
  CloudFormation mutation; separate read-runner limits were corrected first.
- Exactly one execution attempt then uploaded the 283,010-byte controller ZIP to
  the existing private bootstrap bucket and executed its reviewed change set.
  ZIP SHA-256:
  `b6e230ef62728da7e698e5ff221590a4eb212d85856066ec90347d3c744ffcdb`.
  Conditional upload, expected bucket owner, SHA-256 and AES256 encryption were
  checked. All four bucket public-access blocks were verified. No new bucket.
- The executed change set modifies only the existing controller Lambda Code and
  owner environment property, without replacement. No IAM, worker or network
  change or added/removed resource. Rollback was not disabled.

## Reconciliation, not a blind retry

The initial execution tool returned `PRIVATE_OWNER_TERMINAL_STACK_CHANGED` after
CloudFormation reached its terminal state. It did **not** report success or retry.
The full in-memory pre-update stack snapshot was not retained. Consequently an
exact retrospective whole-stack metadata comparison cannot be recovered.

Current DescribeStacks reports UPDATE_COMPLETE; the exact selected change set
reports EXECUTE_COMPLETE and one non-replacing Lambda update. It includes a new
LastOperations entry, which documents an operation rather than configuration.
The old comparator incorrectly treated operation IDs as stable configuration.
The owner-specific comparator now validates the documented operation shape before
excluding only that metadata. DeploymentConfig, rollback, role, tags, parameters,
outputs and unknown fields remain compared. This explains a supported failure
mechanism, not a claim that the lost before snapshot was recovered.

An independent 24-read code proof downloaded the private ZIP and matched its
digest to Lambda plus all three files to the current locally rebuilt source.
The private download was removed. Main bundle SHA-256:
`979afb7aa6e119933c6e2cdba663bf4701e3ada7d83a404dc29ebd33c2b219e8`.

The separate executed-scope reconciliation uses historical resolved change-set
contexts without substituting them for unresolved template Ref/GetAtt values.
Its first attempt stopped before HTTP on that distinction; a regression test and
fix preceded the successful attempt. No redeployment was performed.

## Actual HTTP acceptance

The final reconciliation/acceptance performed 49 bounded AWS reads and three GETs:

- Signed owner GET `/v1/assets`: exact five-symbol catalog matched.
- Signed owner GET `/v1/health`: `ok`, OPEN, job creation false.
- Anonymous GET `/v1/assets`: HTTP 403.

No POST, Fargate launch, provider call or Bedrock call. A real signed second IAM
principal was **not** tested. Local non-owner/root/role/foreign-context rejection
tests remain a different kind of evidence. No second identity/key was created.
Credentials, raw AWS identifiers and response bodies were not printed or saved.

Before/after snapshots matched during this read-only acceptance: job creation and
live display false, persisted circuit OPEN version 11, running/pending tasks,
services and occupied slots all zero. Foundation/compute UPDATE_COMPLETE, API
CREATE_COMPLETE; optional operations/alarm-circuit/maintenance stacks absent.
The exact owner configuration matches the current STS principal and all four
existing routes retain AWS_IAM. Full historical stack-baseline recovery is false.

## Cost and remaining work

Readiness found one USD 5 monthly budget, reported actual USD 0 and forecast
USD 0.005. Console showed approximately USD 0.01; these are differently timed,
delayed observations, not a zero-cost or hard-cap claim. API/Lambda/log requests
and the retained small S3 artifact can incur usage/storage charges. Existing
ECR/S3/DynamoDB/log storage remains; no always-on compute was introduced.

The cloud segment was closed before continuing local development: scoped CLI
logout removed its cache, and the Console Sign out action was verified by both
the public sign-in page and screenshot. Already loaded CLI tokens are not claimed
universally revoked; the CLI warns they may survive until their short expiration.
Independent local inventory at `2026-10-25T07:03:26Z` found all ten scoped residue
counts zero, including helpers, listeners, temporary directories and login cache.
Subsequent local work has its own later closure requirement. Private browser access, full
signed non-owner cloud negative acceptance, provider entitlement and remaining
release gates stay unfinished. CloudFront remains undeployed/disabled.

Primary API definitions checked: [Stack](https://docs.aws.amazon.com/AWSCloudFormation/latest/APIReference/API_Stack.html),
[OperationEntry](https://docs.aws.amazon.com/AWSCloudFormation/latest/APIReference/API_OperationEntry.html).
