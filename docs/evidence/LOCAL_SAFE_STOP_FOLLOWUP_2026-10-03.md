# Same-day follow-up — runtime notices, launch scope and local safety, 2026-10-03

This later session is separate from the [earlier 437-test scoped checkpoint](LOCAL_SAFE_STOP_2026-10-03.md).
No cloud deployment, task launch, provider/Bedrock call, GitHub action or new
credential was performed. All source changes remain local and undeployed.

## Completed implementation and first complete native gate

- [Runtime notice assembly](PHASE12_RUNTIME_ATTRIBUTION_2026-10-03.md) preserves
  the three pinned frontend packages' actual upstream documents. The current
  five-file build must match those notice bytes and stage stable notices before
  HTML. Missing backend documents remain blocked, not replaced with a generic
  license or silently declared complete.
- [Controller launch scope](CONTROLLER_LAUNCH_IDENTITY_2026-10-03.md) requires
  matching full account/region/revision identity and exact returned worker
  ownership; uncertain launches still retain capacity rather than retrying or
  releasing a possibly active task's slot.
- Local development exposes frontend source and the pinned store only, rejects
  private paths before public/SPA fallbacks, disables console forwarding and
  refuses unreviewed public-directory additions or redirects.
- The first complete native checker in this follow-up completed: **488 total, 487 passed, one
  skipped**, with 73 guard tests (72 passed/one OS file-symlink privilege skip),
  327 service/contract/operator, 42 infrastructure and 46 frontend tests.
  All type/lint/build/synth, secret and current artifact checks completed.
  Directory-junction negative tests did run; the skip is not a pass.
- The supplementary HTTP proof made **33 loopback requests**, no external
  network/AWS calls. Both development and preview matched the 3,653-byte notice
  hash, rejected a real disposable private-path sentinel and invalid paths,
  refused untrusted Host/CORS access, and closed owned servers. It also tests
  failed-before-listen and stalled shutdown paths. HTTP checks are not browser
  rendering or a guarantee against arbitrary future plugins.

An intermediate native run found a lint rule violation in the control-character
check; it was repaired without disabling lint or the validation. Only the later
complete pass above is that earlier native result. A separate isolated-source
rebuild is recorded in [its evidence](PHASE12_LOCAL_CLEAN_SOURCE_PROOF_2026-10-03.md)
when completed; it is not inferred from the native pass.

The first isolated-source run then passed the same 488-test gate for a 300-file,
3,211,713-byte copied snapshot, SHA-256
`b8ad63081ebb051500418767f0455c3b11f8dbdd1ec95048ad21c936b3e80ba2`.
It copied 43,840 installed dependency files (740,079,823 bytes), rebased 2,617
internal links and explicitly omitted seven already broken unused index links.
No fresh install/clean clone was claimed. Both HTTP servers and the temporary
source tree were removed. These figures precede the extra module-metadata
source and its documentation and are not promoted to its current full proof.

## Extra bounded module-metadata scope

The [build-only module checkpoint](FRONTEND_EMITTED_MODULE_METADATA_2026-10-03.md)
adds seven focused passing tests and verifies freshly written JS byte hashes
without exposing absolute module IDs or emitting a new public artifact.
Actual metadata has 13 first-party, 10 pinned-runtime and two virtual-generated
entries. Generated helpers still require license provenance review; complete
attribution/legal/publication approval remain false.

The complete native gate was then repeated successfully for this additional
source: **495 total, 494 passed, one skipped**, with 73 guards (72 passed/one
file-symlink privilege skip), 327 service/contract/operator, 42 infrastructure
and 53 frontend tests. Type/lint/build/synth/secret/release checks and the
33-request owned-loopback proof all completed. Written JS module-metadata bytes
matched. This is the final current native source result. The final isolated
repeat also completed all 495 tests (494 passed/one skipped), for a 304-file,
3,230,699-byte snapshot with fingerprint
`26f2bb5c5759cde2f13acd2468ca7af3218e5f0941d0d07790c7afcba707db30`.
Its own servers and temporary copy were closed/removed before the success
packet. The [source-proof record](PHASE12_LOCAL_CLEAN_SOURCE_PROOF_2026-10-03.md)
keeps failed attempts, reused-dependency limits and later documentation edits
distinct from that complete result.

## Browser and cloud observations

The selected Chrome session confirmed English/Japanese/Korean notice-footer
labels and the fixed local href. At the actual measured narrow viewport of
406 pixels, English/Japanese content had no horizontal overflow; a requested
320-pixel viewport was clamped, so 320-pixel coverage is **not** claimed.
The original Korean preference and ordinary viewport were restored.
Chrome blocked the plain-text notice navigation with `ERR_BLOCKED_BY_CLIENT`.
Its protection was not weakened or bypassed. Correct local HTTP bytes/headers
do not prove Chrome rendered that file; this browser acceptance remains open.

Read-only Tokyo console observations in this later session:

- Project ECS cluster at 15:42: zero running/pending tasks and active/draining
  services; no project work was launched by this session.
- Controller environment: `API_AUTH_MODE=AWS_IAM`, internal provider-backed jobs
  false and live-result display false. The static `CIRCUIT_STATE=CLOSED` variable
  is not the persisted circuit's effective state.
- A SELECT projecting only `jobId`, `state`, `version` for the exact three
  control keys completed at **18:13:32 Tokyo**: only `control_circuit OPEN 9`
  returned, not either slot. Its read-consistency mode was not independently
  proven; this is not the complete automated readiness gate.
- Console billing showed rounded/delayed $0.00 month-to-date and $0.01 forecast.
  These figures do not prove a hard cap or zero account-wide future charges.

The bounded CLI readiness attempt could not establish STS identity; it did not
create a login or change cloud state. Read-only browser observations do not
silently substitute for the scripted identity/Budget/ownership readiness gate.
The control query may incur a tiny DynamoDB read charge. Existing S3/ECR/log/
table storage and delayed billing remain possible. This session created no new
recurring chargeable resource or public access.

## Publication and closure boundary

High-confidence source scan: zero findings. The publication preflight remains
blocked with **18 manual-review findings in 15 files**: original image metadata,
historical third-party SBOM email fields and explicitly synthetic scanner/ARN
fixtures. The stricter launch tests add three synthetic cloud-identifier files;
the detector was not allowlisted. [The review](../PUBLICATION_SECURITY_REVIEW.md)
retains every final action. No remote, workflow, staging, commit or push occurred.

The final publication preflight covered **304 candidates** and retained all
18 findings across 15 files. No live readiness, hosting deployment, exact
future container scan, full development-license approval or GitHub publication
is asserted by these local tests.

## Final closure

- Final fresh Tokyo ECS observation at **20:02**: zero running/pending tasks
  and zero active/draining services in the project cluster. This is scoped to
  that cluster, not an account-wide resource inventory.
- Console Sign out returned the public AWS page with sign-in controls and no
  IAM/account fields. A private ignored-output screenshot was retained; no
  upload occurred. No new CLI login or credential was created. A CLI cache
  deletion/logout is not claimed.
- The final isolated proof returned at **20:23:48 Tokyo** with its owned
  servers closed and temporary copy removed. Independent post-result checks
  found zero listeners on 4173/5173, zero source-proof temporary directories,
  zero disposable HTTP fixtures and no private-path sentinel. No Git remote
  or GitHub workflow exists. The logout screenshot is ignored by Git.
- Source credential scan reported zero high-confidence findings; the current
  five-file release passed the exact pinned-notice/privacy audit. Publication
  remains blocked, including original image/SBOM privacy and license review.
- No new recurring resource, deployment, IAM expansion, provider/Bedrock call,
  task launch, Git remote/workflow/commit/push or public access was created.
  Existing storage and delayed billing, plus tiny read-only DynamoDB query
  charges, remain possible; no zero-cost or hard-cap guarantee is made.
- The five-hour account window reset during closure. No new implementation
  scope was started to consume the refreshed allowance. The user's stop
  instruction takes precedence over the earlier approximate usage target.
