# Early infrastructure gate loading — 2026-10-14

Local-only correction after the actual timeout in
[source/schema evidence](PHASE12_SOURCE_AND_SCHEMA_BOUNDARY_2026-10-14.md).
The main entrypoint previously imported all CDK/stack modules and constructed
the App before parsing deployment/cost flags, even for requests that must fail.

It now checks dedicated-reference scope and opt-in/cost flags first, then config
and image digest, and only then loads CDK/constructs App. Other stack modules load
only on their original branches. No flag, condition, permission, resource, test,
assertion, concurrency limit or deadline is removed or relaxed.

Four new actual entrypoint tests copy only the main entrypoint and two pure
config/gate modules into a disposable root without CDK. Invalid cost flags reject
before even a missing config file is read; dedicated scope/mutable image refusals
reject without CDK or output. The valid default case reaches missing CDK and
**fails**; it is not a synthesis pass. Positive synthesis remains independent.
The focused four-file run passed 23 tests in 35,189 ms. All 33 strict operator
entrypoints and the infrastructure strict type check passed.

An independent actual default synthesis matched the prior Foundation template
byte-for-byte: SHA-256
`ea48e2e2edd780dc8cc3520e28f5fa616803963dd96cfdd40a4225ca5218cfd1`.
Both contained exactly ECR repository, DynamoDB table and log group; no service,
load balancer or NAT. This is local default-assembly equivalence, not every
optional branch, live stack equality or deployment acceptance.

No deployed stack/policy/controller/worker behavior was changed. No AWS call,
deployment, image build/push, schedule/workload or publication followed this
loading change. Revision-bound whole checks and closing evidence are separate;
measured runtime is not a future performance promise.
