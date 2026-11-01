# Local verification checkpoints — 2026-10-19 Tokyo

These are separate source/proof scopes, not release, IAM, hosting or publication
approval. Earlier failed receipts remain failed. No cloud workload or write ran.

## Actual Linux worker and independent closure

Owned session receipt `worker-session-62cc8922-0f6c-4b7a-bc5f-f6443049d94a` passed
normal start/build/scan/runtime/stop and configuration cleanup. The stopped-only
signature/creation-time/tree checks did not adopt an existing Desktop instance.
No reset, prune, volume/image deletion, global setting or credential fallback.
The signed stop plugin used normal shutdown. Transient socket backups remain
recoverable: before scope `18e9acd6f1bd479bb7ce6d6cc6e42ac9`, after scope
`0b9d361e493c465b826759b14fc6ae99`. This is not a permanent upstream socket fix.

Build receipt `worker-1aa25509-8ff4-4637-a13d-8aa044c7eeda` and runtime receipt
`runtime-170ed3e2-77c8-4926-a88f-5f3c565e5870` were independently reread through
their strict validators together with the session and then-current source.
All agreed on 562 files/5,611,226 bytes, SHA-256
`9fe42072ee0b33de59a30a9b877563e458aa3ade6447d7014d75a8d0085c1a72`.
The local image ID was
`sha256:4e0910315dac5735d9bd8963f6e471b89584cbf50ec13a0d406a77d5df8a31a4`.
All three application files matched; the 1,489,321-byte module SHA-256 was
`5b8fddeb27a835e844e1f006f4c3f825807e1ed47ef3c14212c4b8e9db37f39a`.

Actual Linux x64 Node **22.23.3**, UID/GID 65532, passed 41 lifecycle cases
(30 normal/11 negative) and 18 sequential real entrypoint children (6 normal/
12 negative). Outer container had no network, host mounts or credentials;
read-only/capability/resource isolation passed. All children exited, outputs
were sanitized, the container was absent afterwards and temporary configuration/
archive were removed. Provider/model requests were synthetic only; AWS and real
provider/model requests zero. No push, registry promotion or remote execution.

Fresh exact-image scan: UNKNOWN/HIGH/CRITICAL/secrets zero; **MEDIUM 23/LOW 8
remain**. This is not complete application/native/generated/OS licensing or
advisory clearance. The image is not authorized for deployment/publication.
Later tests, CDK imports and handoff documents are outside this whole-source
fingerprint; their existence does not silently rebind its full-source tag.

Independent read-only inventory at **12:25:22 UTC** found all ten local residue
counts zero (Docker/CLI/project/unknown helpers, selected ports, owned temporary
roots, backend staging, nonempty work roots, login cache, active socket roots).
Two assistant processes and one empty work parent were preserved. No global
credential revocation or all-region cloud safety is inferred from that local read.

## Fixed dependency query

At **12:23:25.654 UTC**, one official npm bulk query sent only the previously
reviewed 391 public names/versions. No source, private project metadata, token,
installation or lifecycle script. All 37 declared runtime identities were covered;
returned/matching advisories zero at every severity. Lock SHA-256:
`02493a22ca0ab337455d210a5f2ce421768cfa9bcb71e4e420e9e46593ddc2b6`;
coordinate hash `a0e47d1dbf929ad39008801fbec48f94be8742e73e546edea6eef90cbc95be3c`;
empty response hash `44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a`.
No npm metavulnerability propagation, complete image/legal clearance or future
safety guarantee. Dependencies and the reviewed lock did not change.

## Public CDK core entrypoint, not a permission/template rewrite

Pinned installed `aws-cdk-lib@2.263.0` explicitly exports `./core` as
`./core/index.js`. Twelve used runtime classes/values were strictly identical
between the root/core entrypoints; root declarations re-export core. Only core
imports were mechanically redirected to that public export, never private lib
paths or another package/version. Service-specific imports, resource properties,
IAM statements, flags, account/region and disabled defaults were not changed.
Two guards check public export/object identity and parse every typed source to
prevent reintroducing whole-service-barrel core imports.

One separate-process ESM startup observation measured root 974 ms/84 MiB/477
loaded CJS modules versus core 208 ms/59 MiB/150 modules. Not a controlled cold
benchmark or a latency guarantee. The unchanged complete nine-file/two-process
infrastructure checks passed in **90,573 ms**. All strict operator types passed
in **18,599 ms**, versus roughly 43–46 seconds in earlier whole observations;
different source/warming conditions mean a precise causal speedup is not claimed.
No cache, test omission, shared-process test execution, reduced assertion,
concurrency change or longer 360,000 ms ceiling was introduced.

The cumulative admission guard has two additional expiry-after-launch/attachment/
compensation tests beyond the earlier 73-case focused observation; both pass,
and service TypeScript passes. Actual fresh whole verification for this later
source is a separate result, not inferred from these targeted observations or
the earlier failed 82-record snapshots.

Pointers: [request budget](CONTROLLER_INVOCATION_BUDGET_2026-10-19.md),
[environment/call boundaries](PHASE12_CALL_AND_ENV_BOUNDARIES_2026-10-19.md).
