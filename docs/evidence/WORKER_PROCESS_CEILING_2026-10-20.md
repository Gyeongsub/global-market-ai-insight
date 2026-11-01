# Worker retained-I/O ceiling — 2026-10-20 Tokyo

Local only; no AWS deployment, task launch, credential access, image push,
permission/resource change or publication. This addresses an injected retained
I/O failure mode, not an observed real AWS SDK or production container incident.

## Reproduction

An initial source-loader probe timed out without confirming caller completion;
it is inconclusive, not evidence of this failure. A separate compiled-bundle
child did confirm BOOT, provider I/O start, and caller failure after the short
synthetic job deadline. A deliberately cancellation-ignoring provider retained
an interval handle. Although the caller settled and set exitCode=1, the child
did not exit naturally; its owning test parent terminated it at three seconds.
No socket, AWS, model, provider or external network request was used. Merely
settling a promise or setting exitCode is not proof a process stopped.

## Last-resort application guard

The actual executable entrypoint now arms one fixed **300,000 ms** process
ceiling, matching the existing maximum job interval. No environment override
can disable or enlarge it. It remains armed after the main promise settles,
so retained I/O cannot silently clear the protection. Its timer is unref'ed:
healthy one-shot work exits naturally rather than waiting idle for five minutes.

On expiry it reports only a fixed process-failure category and a validated job
identifier, then exits non-zero even if reporting throws. It does not wait for
another I/O acknowledgement, retry an API/model call, manufacture a terminal
job state, overwrite an accepted result or release an ambiguous capacity slot.
Reporting is best effort, not durable CloudWatch notification acceptance.
The lower request/job deadlines and token/attempt caps remain unchanged.

The helper's explicit ports permit short synthetic timer/exit tests in trusted
source; the production entrypoint supplies neither a duration nor a replacement
termination function. Importing the worker as a library does not arm or trigger
this executable-only guard.

## Verification scopes

Four deterministic guard tests and eleven existing worker-entry tests pass;
service types pass. Thirty combined guard/runtime/owned-Docker operator tests
pass. A separate actual Windows Node 24.19.0 child sequence proves one natural
exit and two retained-I/O exits, including a throwing report callback, with no
parent timeout credited as success and no private output. This is not Linux.

The Linux fixture keeps all 45 lifecycle/18 entrypoint cases and adds **three
actual process probes**: natural early exit, retained I/O and a throwing report.
It checks the production constant separately while exercising a source-owned
100 ms synthetic limit, not a five-minute wall-clock measurement. Child exit,
signal, timeout and exact safe output are checked. A parent-forced kill cannot
count as guard success. All children are sequential, at most three seconds
each/ten seconds total, inside the existing isolated container. The fixture's
**schema 4** requires every process-proof field; schema 3 cannot clear it.
The unchanged 20,000-character program limit is met (19,350 characters before
later text-only handoff changes). Actual Linux and whole/frozen results must
identify their own source and outcome after execution.

## Explicit residual boundaries

This is an application event-loop guard, **not an OS-enforced watchdog**. It
cannot preempt blocked JavaScript, a paused/frozen process, host failure, delay
before Node starts, or module initialization before the guard arms. It does not establish AWS cancellation, Fargate stop
latency, transaction rollback, billing accuracy or a dollar cap. Independently
verified sweeper/maintenance/notification and task-stop acceptance remain release
gates; no earlier Maintenance 28/31 or image/legal block is waived. A late
process failure does not erase a job result already conditionally committed.

The earlier frozen result `fresh-8e403a5f-d56b-4d6c-ac6e-9b9d73a34323` passed
88 steps/1,298 tests (1,297 pass/one existing privilege skip) in 293,303 ms, with
74,871 ms isolated installation. Its strict receipt independently matched the
570-file/5,665,875-byte source SHA-256
`67095ec46314a065ca13717060624b3a2dd588d02a87c12ff2fdee2e137afb30` before this
later guard scope. That success remains scoped; it cannot clear these changes.

## Separate actual Linux acceptance

Owned session `07e2c8a0-2a8c-4826-900d-25b62ad77549` completed at
10:40:47.717 UTC with normal Desktop shutdown and configuration cleanup. Build
`a30fea0b-a268-4bdd-ba00-48c7057eb0b1` and runtime
`6a89cf42-6805-4248-80d4-d081ccc957cb` independently passed strict saved schemas
and matched the then-current **575 files/5,682,680 bytes**, source SHA-256
`92cda551ec87261223e65c9bf6c7c80f7d361be3c2fa64422f140fd88d1418c3`.
Actual Linux x64 Node 22.23.3/nonroot passed **45 lifecycle +18 entrypoint +3
process probes**, with the original network-none/read-only/no-mount/no-credential
isolation and resource limits. Schema 4/complete process facts were required;
the parent's timeout/kill was never credited as a successful guard exit.

Exact image:
`sha256:f4b092ef175f7fec97f704872e74944f0652743e2833414dc02905faa558f142`.
Worker module: **1,492,833 bytes**, SHA-256
`f59047dae4177cde1de7be5d9c0652716b0d7d84364865850bfabd3e75421c34`.
UNKNOWN/HIGH/CRITICAL/secrets zero does not waive MEDIUM 23/LOW 8 or native/
generated/OS/license/IAM release gates. No push or cloud execution followed.
Recoverable socket backup scopes were `f017b63438e74fcbb75c1416415a9164` and
`923cd7f9bc2b4a62be144ebe4380e378`; images/volumes/caches and original user data
were not reset/pruned/deleted. Independent inventory at **10:41:34 UTC** found
all ten residue counts zero, preserving two assistant processes and an empty
work parent. Later result/handoff text is outside that exact source fingerprint;
whole/frozen validation and final closure must be separately recorded.
