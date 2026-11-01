# CLI input comparison — 2026-10-13

This is separate diagnostic evidence, not the original Maintenance permission
gate or real CloudWatch Logs authorization. The original 31-case matrix and all
older diagnostic modes are unchanged. No policy, role, log, task or stack changed.

After ordinary existing-profile CLI authentication refresh, fresh eleven-read
readiness passed: disabled execution/display, OPEN/version 11, empty owned task/
service/slot state, healthy base stacks, absent temporary targets and USD 5 Budget
actual USD 0 / forecast USD 0.008. No new principal/key/permission/duration setting
was requested. Authentication output was suppressed; a fresh read proved success.

## Measured comparison

The new default-zero plan bounds execution to 36 reads: fourteen reference reads
before and after, four exact-owner metadata reads and four unattached simulations.
Only PutLogEvents is compared, for one actually returned Controller stream and
the non-applicable group input, each via separate scalar arguments and structured
`--cli-input-json`. PolicyInputList remains a list of policy **strings**; action,
policy and resource identity are identical between each pair. No input file,
debug output, private identifier or log message is written/read/printed.

Actual execution exited 0 with all 36 calls complete. Both exact-stream inputs
returned implicitDeny with zero aggregate matched statements; both group-input
controls returned allowed with one matched statement at both levels. All four
responses had complete exact action/resource decisions, no missing context or
truncation. Optional organization/boundary fields remain unknown, not cleared.

All fourteen full references/request scopes and group ownership were stable;
changed read ordinals were empty. Selected metadata identity was stable under
the previously documented token boundary. Raw metadata stability was false,
deprecated sequence-token change true and token values printed false.

The observation does not show that changing these two CLI input formats fixes
the discrepancy. It is **not** packet-level wire verification and does not
prove the exact simulator/service cause. No group-input allow substitutes for
stream acceptance, and no broad control policy was attached. Original Maintenance
deployment/recovery, live-service authorization and release blocks remain.

Seven new focused regression cases plus the existing diagnostics/policy cases
passed 47/47; all 33 strict operator entrypoints passed. Later final-source whole
gate and safe stop are separately recorded, not inferred from these unit tests.

## Primary sources checked October 13

- [CloudWatch Logs service authorization](https://docs.aws.amazon.com/service-authorization/latest/reference/list_logs.html): CreateLogStream and PutLogEvents use log-stream resource types.
- [Identity policy examples](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/iam-identity-based-access-control-cwl.html): specific stream and scoped group suffix forms.
- [IAM simulator limitations](https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies_testing-policies.html): simulation does not perform real service requests and may differ from live behavior.
- [CLI structured input](https://docs.aws.amazon.com/cli/latest/reference/iam/simulate-custom-policy.html): JSON input and scalar override semantics.

The initially guessed legacy service-authorization URL redirected to its index;
the current linked `list_logs.html` page above was actually fetched instead.
