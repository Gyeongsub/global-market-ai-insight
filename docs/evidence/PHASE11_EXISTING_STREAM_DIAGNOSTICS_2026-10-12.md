# Existing-stream comparison — 2026-10-12

The original 31-case Maintenance matrix and its exact-action/resource positive
controls are unchanged. No policy was connected, role assumed, group/stream
created, event written, function invoked, job launched or circuit changed.
Successful diagnostic observations are not deployed-role/service acceptance.

## Scope and failures preserved

A separately selected plan defaults to zero calls. Its six unattached
simulations compare an owned existing Controller stream, a synthetic stream in
the same group, and an explicitly non-acceptance group-input control, for each
CreateLogStream/PutLogEvents action. Two full 14-read existing-reference snapshots
and four bounded metadata reads cap execution at 38 calls/eight minutes.
Metadata comes from the exact successfully owned Compute log group. At most one
five-entry stream page is read, never log messages or an exhaustive inventory.

The first actual attempt failed before a complete result. A separate three-read
shape diagnosis observed correct group/ARN/retention, five matching stream ARNs
and a further page, but no default-format names matched the newly added parser.
The parser now accepts only the exact Controller custom-group prefix as well as
the default `$LATEST` pattern; foreign functions/versions remain rejected.
This fixes this new diagnostic's input handling, not the older simulator denial.

The next actual comparison failed `LIVE_REFERENCE_CHANGED`; its six decision
results were not recovered and are not inferred. A separate baseline-only mode
made 32 reads and **zero simulations**. Both full reference snapshots, request
scopes and ownership were identical; raw selected log metadata was different.
The command correctly exited nonzero and did not authorize deployment.

An independent six-read field comparison then found no group-field changes,
stable stream count/name/ARN/timestamps, and only `uploadSequenceToken` changing
at each of five selected stream positions. Values/identifiers were never printed.
This is not retrospective proof of the first failure or the original IAM cause.

## Explicit diagnostic identity boundary

AWS documents that sequenceToken is ignored by PutLogEvents. This deprecated
value and the opaque page continuation token are now separated from diagnostic
resource identity, not silently presented as unchanged raw metadata. Every
other selected metadata field, pagination-presence fact, actual ARN/name/creation
identity and all complete account/controller/Budget/circuit/task/slot/ownership
references remain compared. Unknown changed fields still fail stability.
Token types/sizes are bounded. Reports preserve `rawControllerMetadataStable`
and `deprecatedSequenceTokensChanged`, never token values.

No change was made to the original permission matrix, attached policy,
controller correction or Compute rollout comparators. A diagnostic `allowed`
does not imply permission acceptance for another resource, especially the absent
Maintenance group. The six exact observations and closing outcome from the
corrected run are recorded below from actual output, not old allows/denials. Focused diagnostics/policy tests
passed 40, and the strict 33-entrypoint operator check passed after the fix.

## Corrected actual observations

The corrected run completed with 38 calls and no mutations. CreateLogStream
and PutLogEvents each returned implicitDeny for both the actual existing exact
stream and the same-group synthetic stream (four exact-stream denials).
Both group-input controls returned allowed, but remain non-applicable controls,
never substituted for stream permission acceptance. All six replies matched
exact action/resource with complete, agreeing aggregate/individual decisions.
The four stream observations had zero aggregate matched statements; the two
group controls had one at both levels. Optional organization/boundary fields
remain absent/unknown, not evidence of their absence from the account.

All fourteen full reference reads/request scopes and Controller group ownership
matched before/after. Diagnostic identity stability passed for all selected
fields except the explicitly bounded continuation/deprecated sequence tokens.
Raw metadata stability remained **false**, deprecated sequence-token change
**true**, values printed **false**. These differences were not hidden by a
successful numeric identity report. No prior failed run was retroactively passed.

The actual existing stream also denying means absence of the hypothetical
Maintenance group is not by itself a sufficient explanation for these observed
denials. It does not establish the exact simulator/service root cause. The
original three unverified stream cases, Maintenance deployment/recovery and
actual-service authorization remain blocked; no attached grant was broadened.

## Primary sources checked October 12

- [Custom Lambda log-group naming](https://docs.aws.amazon.com/lambda/latest/dg/monitoring-cloudwatchlogs-loggroups.html): includes exact function/version in custom stream names.
- [LogStream fields](https://docs.aws.amazon.com/AmazonCloudWatchLogs/latest/APIReference/API_LogStream.html): ARN, timestamps, names and legacy token fields.
- [PutLogEvents token behavior](https://docs.aws.amazon.com/AmazonCloudWatchLogs/latest/APIReference/API_PutLogEvents.html): ignored sequence token does not bypass IAM permissions.
- [SimulateCustomPolicy](https://docs.aws.amazon.com/IAM/latest/APIReference/API_SimulateCustomPolicy.html): unattached simulation does not perform service operations and can differ from live authorization.

Root cause of the original Logs simulation discrepancy, Maintenance deployment/
recovery, notification, hosting, licensing/privacy/CI and publication remain
separate gates. No old controller mutation or 391-coordinate advisory POST was
repeated.
