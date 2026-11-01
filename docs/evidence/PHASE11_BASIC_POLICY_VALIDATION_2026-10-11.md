# Basic policy validation — 2026-10-11 resumed session

This independent diagnostic is not effective permission testing or release
approval. It does not replace the original 31-case matrix or its applicable
exact-action/exact-stream positive controls.

## Reviewed bounded scope

The existing diagnostic entrypoint has a separate default-zero-call plan and an
explicit `--execute-basic-policy-validation` mode. It submits only two fixed
unattached identity-policy documents: the exact six-statement local Maintenance
CDK proposal, and a literal exact synthetic stream control for CreateLogStream
and PutLogEvents. No arbitrary policy/resource/profile input is accepted.

The total bound is 30 calls: two complete 14-read existing-reference snapshots
and exactly two basic `accessanalyzer validate-policy` calls. Timeout remains
bounded. Complete before/after snapshots include account identity, Budget,
controller settings, task definition, circuit, both slots, inventories and
reference ownership. The proposed document is rebuilt and compared at closing.
Policies are never attached, roles are not assumed, analyzers are not created,
and Logs/workload APIs are not invoked. Paid custom policy checks are excluded.

The parser rejects pagination, incomplete/unknown response envelopes, malformed
finding types and excessive counts/text/locations. Only numeric finding counts
and five fixed public issue-code counts can be printed. Unknown/new issue codes
are counted, never reflected with private details, paths or account identifiers.
Zero findings still set effective authorization and deployment approval false.

## Actual result

The execution completed with **30 AWS calls and zero cloud mutations**. Both
documents returned complete responses with ERROR, SECURITY_WARNING, WARNING and
SUGGESTION counts all zero. Full live references and proposed policy were stable
before/after. No error/warning was observed by this basic validator; that is not
proof of the precise cause of the simulator discrepancy or a general absence of
account/organization controls.

The [separate action-coverage comparison](PHASE11_LOG_ACTION_COVERAGE_2026-10-11.md)
still has six stream denials, while its independent group/table controls allow.
The original matrix still has three unverified stream cases. Maintenance
deployment, real stale-job drill and notification/automation enablement remain
blocked. Do not widen policies, swap the evaluated resource, use an older allow,
or bypass these gates using a live test or deployment.

Focused diagnostics/policy tests passed **28 cases**, including the five new
validation tests; strict checking of all 33 operator entrypoints passed. These
are local tests, not a reconstruction of the original October 10 rollout or a
new authorization to repeat its completed controller correction.

## Primary sources checked October 11

- [ValidatePolicy API](https://docs.aws.amazon.com/access-analyzer/latest/APIReference/API_ValidatePolicy.html): identity-policy input, finding fields and pagination.
- [Validation guidance](https://docs.aws.amazon.com/IAM/latest/UserGuide/access-analyzer-policy-validation.html): grammar/best-practice checks are distinct from testing effective permissions.
- [Policy-check reference](https://docs.aws.amazon.com/IAM/latest/UserGuide/access-analyzer-reference-policy-checks.html): fixed INVALID_ACTION and ARN issue-code meanings.
- [IAM Access Analyzer pricing](https://aws.amazon.com/iam/access-analyzer/pricing/): basic policy validation is provided at no additional charge; custom checks and internal/unused analyzers are separate paid features.

This session created none of those paid analyzer/custom-check scopes. Existing
project read/storage/delayed charges remain possible; this is not an invoice or
an account-wide zero-spend guarantee.
