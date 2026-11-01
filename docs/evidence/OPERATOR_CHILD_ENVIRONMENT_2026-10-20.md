# Operator child environment — 2026-10-20 Tokyo

Local correction only. No AWS call/login, permission/resource mutation, paid job,
external data transfer, new dependency, workflow or publication in this scope.
The earlier same-day read-session cloud results are not proof of this new code.

## Reproduction and boundary

Three red tests found that the shared AWS CLI runner still inherited unknown
application credentials, proxy/Python/TLS settings, malformed values and
conflicting case aliases. The runner injection reproduced transmission into
its child environment, without running AWS. A fourth red synthesis test found
unknown application/compiler/transport settings survived the credential denylist.
These are synthetic exposures, not evidence that a real credential leaked.

Both paths now reuse the OS-bootstrap allowlist already used by the local whole
gate. Arbitrary app/credential/tooling/Git/proxy/CA/TLS/Python settings and cloud
opt-ins are not passed through. Retained values are bounded and cannot contain
NUL/CR/LF; conflicting OS-name case aliases fail closed rather than depend on
Windows key ordering. The caller environment is never mutated or printed.

The CLI path adds only the fixed existing `gmai-admin` profile and disabled
client-side metrics. It retains the existing `AWS_CONFIG_FILE` location, if
present and unambiguous, without reading or printing its contents. Unknown
profile-case aliases are normalized; conflicts/malformed values produce the
fixed private-free `AWS_CHILD_ENVIRONMENT_INVALID` code before spawning.
Static credential and shared-credential-file environment overrides are dropped.
The existing single attempt, no metadata, no pager/prompt and ignored configured
endpoints remain. No query/action/resource/deadline/permission is broadened.

Credential-free synthesis does not receive the profile location or identity.
It receives the same fixed metadata/endpoint guards plus compile-cache disabled
and TLS verification enabled. Its existing exact-key assertion now explicitly
requires those two safety values; it was not weakened to a partial assertion.
Source-owned, reviewed fixed template values remain separately injected by each
operator after the environment boundary. None authorizes cloud deployment.

## Verification and limitations

The corrected CLI boundary and related reference/image/template/scan suite passed
128 local tests. Its initial restricted-host run passed 127 and failed the
existing junction-ownership test with EPERM; the same unmodified assertion
passed in an OS-capable local run. No Windows security/policy setting changed.
The separate synthesis/read/image boundary suite passed 59 tests, and all 34
strict operator entrypoints typechecked. The later 13-test query-boundary suite
also passes, including an actual Node child verifying the runner's projection
without echoing a sentinel or executing an AWS CLI. That child is not AWS proof;
final whole/frozen verification remains separate.

This is an environment projection, not an OS/filesystem sandbox. Bootstrap
paths, default readable profile files and explicit profile configuration still
exist; their credential_process/profile contents and the caller's startup state
are not proved safe here. These changes cannot revoke loaded credentials or
prove global sign-out. CLI/console closure and cloud observations are recorded
separately. The earlier owned Linux proof binds the worker bundle and its own
568-file snapshot; these later operator/declaration/tests/docs are outside that
full-source fingerprint. No historical container or whole pass is relabelled.
