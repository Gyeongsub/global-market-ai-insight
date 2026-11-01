# AWS Support review draft — NOT SENT — 2026-10-15

Local preparation only. No case, email, issue, attachment or simulation was
submitted by this document. A later submission needs review of its exact
destination, disclosed data, support entitlement and any cost. This document
contains only documentation identifiers and dated aggregate observations;
do not attach private reference snapshots, credentials, debug logs or messages.

## Draft issue summary

We are investigating an IAM policy-simulator discrepancy for CloudWatch Logs.
Our proposed least-privilege Maintenance policy has not been deployed. Its
original 31-case matrix remains blocked: three exact-stream cases lack valid
same-resource positive controls. We are not requesting broader permissions or
treating a simulator result as live-service authorization.

On October 13, 2026, AWS CLI 2.36.19 submitted the same unattached identity
policy/action/resource through scalar arguments and structured JSON. Both
exact existing-stream requests returned `implicitDeny`, with zero aggregate
matched statements. Both group-wildcard diagnostic inputs returned `allowed`,
with one matched statement. The group inputs were NOT accepted as applicable
stream-resource controls. Four observations were complete and untruncated,
with no reported missing context. Before/after project reference checks agreed.
These are historical observations, not a fresh October 15 simulator run.

An October 14 unsigned loopback fixture confirmed synthetic CLI Query values
survive both input forms, including stream slash/bracket/dollar syntax. It did
not capture or verify a real signed AWS request. The fixture's pagination issue
was local; real operators already disabled pagination. No precise cause is
established, and no live role assumption, policy attachment or Logs write was
used to work around the discrepancy.

## Synthetic request shape for review — not measured on AWS

The following identifiers are invented documentation examples. They are NOT
actual account, resource or request identifiers. Do not describe these JSON
examples as the captured private request or as a reproduced AWS outcome.
`Resource: "*"` below belongs ONLY to an unattached diagnostic policy string;
it is not a production/role policy and must never be attached to a principal.

```json
{
  "PolicyInputList": ["{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":\"logs:PutLogEvents\",\"Resource\":\"*\"}]}"],
  "ActionNames": ["logs:PutLogEvents"],
  "ResourceArns": ["arn:aws:logs:ap-northeast-1:123456789012:log-group:example-log-group:log-stream:example-stream"]
}
```

The comparison changes only `ResourceArns[0]` to
`arn:aws:logs:ap-northeast-1:123456789012:log-group:example-log-group:*`.
That comparison is diagnostic, not a replacement for the applicable exact-stream
resource. PolicyInputList contains JSON **strings**, not nested policy objects.
No caller-selected endpoint, credentials, principal ARN, raw log content or
actual resource name is part of this draft. No executable command is supplied.

## Questions for AWS, if later submitted

1. Are the exact-stream resource and unattached policy input shapes above
   supported for PutLogEvents? What minimum synthetic reproduction is needed?
2. What caller/organization/service context can affect SimulateCustomPolicy in
   this situation, and which response fields distinguish those influences?
3. If a group-wildcard evaluation input matches but its applicable exact-stream
   counterpart does not, is there documented simulator behavior or an issue
   worth investigating? We do not infer that the broader input grants access.
4. What independently scoped validation would AWS recommend without attaching
   broad policies or modifying a healthy production-like stack?

## Documentation checked October 15

[IAM simulator documentation](https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies_testing-policies.html)
distinguishes custom from attached-principal evaluation and cautions that
simulation differs from live service requests. It also describes automatic
principal/organization context and says missing SCP context is not surfaced.
Therefore an empty MissingContextValues list does not prove absence of an
organization restriction. No account-specific SCP/boundary cause is asserted.

[Logs identity-policy examples](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/iam-identity-based-access-control-cwl.html)
describe scoped group-suffix and specific-stream forms for stream actions.
[The API reference](https://docs.aws.amazon.com/IAM/latest/APIReference/API_SimulateCustomPolicy.html)
defines the request, contexts, optional ownership and evaluation data.
These documents do not establish the cause of the historical observations.

The original 31-case gate, exact-resource positive controls, disabled admission/
display and OPEN circuit stay unchanged. Support advice alone would need an
independent documented compatibility/security decision before any real change.
[Original decision map](../PHASE11_LOG_SIMULATOR_INVESTIGATION.md),
[measured input comparison](PHASE11_CLI_INPUT_COMPARISON_2026-10-13.md).
