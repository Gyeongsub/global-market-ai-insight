# Worker acknowledgement bounds — 2026-10-20 Tokyo

Local implementation, not deployed. No new dependency, permission, cloud
resource, paid provider/model request, image push or publication. Existing
provider rights, public authentication/hosting, Maintenance 28/31, image/license,
clean-clone/CI and final privacy/history gates remain unresolved.

## Reproduction and implementation

Five new red tests reproduced pending work after cancellation: an uncooperative
model transport, provider fetch, response cancellation, and the provider/model
stages of the worker operation. The previous timer requested cancellation but
the caller still awaited the underlying promise. All five failed as still
pending before the change; their delayed promises were settled for test cleanup.

`shared/time/elapsed-budget.ts` centralizes the existing monotonic acknowledgement
guard. `AwsCallBudget` retains its exact 250–15,000 ms bounds and error identity;
it delegates to that same primitive, rather than changing IAM, retries or Lambda
timeouts. The worker-specific primitive allows 1–300,000 ms, rejects invalid or
backwards clocks, races cancellation, observes late rejections, and removes its
own timers/listeners. Disposal is permanent and cannot grant another budget.

Provider and model stages share the remaining job budget without renewal. A
provider/model that ignores cancellation cannot keep the operation's caller
pending indefinitely or turn its late reply into a model launch/success. Wall
clock rollback and delayed timer delivery cannot bless an elapsed reply.

Twelve Data retains the existing three-attempt maximum, 3,500 ms default request
timeout and up-to-2,000 ms backoff. One cumulative ceiling is derived from those
same caps (14,500 ms at the default, at most 34,000 ms with the existing maximum
configuration). Each individual request still has its own unchanged timeout.
Body reads/cancellation and custom sleepers cannot extend the total ceiling.
An abort also asks the active body reader to cancel; a late fetch body receives
best-effort cancellation without waiting for its acknowledgement. A later
provider timeout attempt remains within the existing capped, stateless GET retry
policy; a parent job cancellation cannot retry. This is not a new spend allowance.

Bedrock retains its 20-second default, at most one SDK/model attempt, the same
input/output token caps, grounded IDs and stable sanitized error projection.
Parent cancellation is non-retryable; an adapter's own timeout retains the
existing timeout classification. Nothing retries an ambiguous model request.

## Verification scopes

The focused suite passes **97 tests**, including existing controller admission,
RunTask ambiguity, worker repositories/lifecycle, all provider/model scenarios,
the existing AWS wrapper and new shared-budget guards. Service TypeScript passes.
The initial typecheck correctly rejected two optional field assignments; those
types were corrected without weakening compiler settings or assertions.

The offline Linux runtime fixture now requires **45 lifecycle scenarios** (30
normal, 15 negative), including four cancellation-ignoring provider/model/body/
backoff cases. Expected mocked calls are exactly 43 provider/20 model; real
network/AWS/model/provider calls remain zero. The result schema is **3**: older
schema-2/41-case receipts cannot prove this new scope. All 18 actual entrypoint
cases and their isolation/time/output rules are unchanged. Twenty-five focused
fixture/operator guards pass. Actual image and complete frozen-install results
must be recorded separately after running them; no historical pass is borrowed.

## Separate actual Linux result

Owned session `6dac9f3a-a055-4757-a76e-1e1f5620223b` completed at
10:18:53.511 UTC. Build `e6da8e5b-d886-427c-a704-3636230a3085` and runtime
`633bca05-471d-4e49-90b7-9bdc31e228ca` independently passed their strict saved
schemas and matched the then-current 568-file/5,652,175-byte source SHA-256
`0bd18355d9aa76f4586e300176a411307038c07850d4855b9efc1087d53ff4ad`.
Linux x64 Node 22.23.3, uid/gid 65532 passed all 45 lifecycle and 18 entrypoint
cases. Exact worker module: 1,491,809 bytes, SHA-256
`18968c2e42d9711968f2225f799ce192f92d6d486907548c9f5994fc7ec11528`.
Image ID `sha256:60642242f5de998c6737918005198ca5aa18efaa869849a7f4454af6e5e0af9a`.

Network none, read-only, no host mounts/credentials/ports, capabilities dropped,
no-new-privileges and existing resource ceilings were independently verified.
HIGH/CRITICAL/UNKNOWN/secrets zero does not waive MEDIUM 23/LOW 8, native/generated/
OS/legal review. Only this owned Desktop instance was started and normally
stopped; no reset/prune/volume/image deletion or WSL shutdown. Recoverable socket
backups and private images/caches were retained. Independent inventory at
10:20:05 UTC found all ten residue counts zero, preserving two assistant
processes/one empty work parent. Later operator/tests/docs are outside this
full-source fingerprint, even when their worker module remains identical.
Whole/frozen proof and final ending inventory remain separate.

## Limits and official references

Cancellation is cooperative. This bounds local acknowledgement and continuation,
not remote execution, native sockets, process lifetime, accepted AWS writes,
remote cancellation or billing rollback. A previously accepted request can still
incur cost. Do not retry an ambiguous RunTask or model call, delete capacity, or
claim a hard AWS spending cap. Real role/network/failure and image/license
acceptance remain separate from local synthetic evidence.

Node 22 documents that stream cancellation returns a promise completed when
cancellation finishes; waiting for that promise is not itself a timeout.
[Node 22 streams](https://nodejs.org/docs/latest-v22.x/api/webstreams.html).
AWS describes its controller/signal interface as cooperative cancellation, not a
transaction rollback mechanism.
[AWS SDK cancellation interface](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-smithy-types/Interface/AbortController/).
