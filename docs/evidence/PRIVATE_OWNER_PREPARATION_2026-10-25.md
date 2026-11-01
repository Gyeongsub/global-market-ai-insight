# Owner-only AWS preparation — 2026-10-25 Tokyo

The user chose real AWS for single-owner private learning. This supersedes the
earlier local-only restriction, but does not authorize anonymous publication,
GitHub upload, vendor contact, a data subscription or bypassing access controls.
See [ADR 0015](../adr/0015-owner-only-aws-practice.md). This is preparation and
read-only verification, not a completed or deployed private web application.

## Implemented locally, not deployed

- Controller production handlers require the configured exact IAM user in the
  trusted API Gateway v2 IAM context. Missing configuration denies all requests.
  Other principals, mixed authorizers, account mismatches and header/body identity
  claims are rejected before service access. Privileged direct Lambda invocation
  and stolen owner credentials are outside this application-layer boundary.
- Configuration accepts one bounded IAM username and derives its ARN within the
  stack account. No IAM permission expansion, job enablement or live display change.
- Fixed ACCESS_DENIED responses and three-language UI messages expose no identity
  or remote diagnostic text. API contracts and controller bundle smoke checks agree.
- Reference readiness separates configured owner equality from live acceptance;
  configuration alone never asserts deployed owner isolation.

## Local verification

Current-installation receipt: `outputs/local-gates/e2f7a4ee-0294-47de-9b6a-03e85ed35a51.json`.
Completed 2026-10-24T23:48:23.110Z in 215,801 ms: 90 successful steps, 1,455 tests
(1,454 passed / one existing privilege skip), 33 loopback HTTP requests, zero AWS
and external-network calls. HTTP servers closed; fixture not retained.

Source was unchanged throughout the run: 653 files / 6,145,964 bytes / SHA-256
`72538ac1d5aa296dc198efb7fbe73df832ffa52d46d926b29d55fe49842e6ae5`.
Subsequent handoff-only Markdown edits are outside that fingerprint. This is not
a fresh dependency installation, clean clone or newly deployed cloud proof.
Supported, already-installed Node 24.22.1 was used; no dependency, runtime floor,
global PATH or system security setting was changed.

Preserved unsuccessful history: `914d1e0a-8146-4fc0-a428-16b105c7b3e3` was
intentionally interrupted during a test-assertion correction; `57530565-0377-4bba-afb2-1c16838f5987`
failed because sandboxed loopback requests were denied. The same nine fixture tests
passed with local-loopback access, followed by the full successful run above.
No failed receipt is treated as success. One fixture test lacks finally cleanup
on request failure; interrupted diagnostic children were checked absent. A future
test-only follow-up should make that failure path close its fixture explicitly.

## Fresh, scoped AWS observations

The initial CLI session was expired. Normal CLI browser login reused the user's
existing authenticated session; no new access key or IAM grant was created.
Two 11-read core checks and two 12-read reference checks completed (46 scoped
readiness calls, excluding authentication/failed initial diagnostics).

- Foundation and Compute UPDATE_COMPLETE; API CREATE_COMPLETE.
- Optional Operations, AlarmCircuit and Maintenance stacks absent.
- Internal jobs and live result display verified disabled.
- Circuit verified OPEN, version 11; occupied slots zero.
- ECS running tasks, pending tasks and services all zero.
- Existing API IAM routes, integration and owned references verified.
- Deployed owner configuration did not match the new requirement; live owner
  acceptance remains false. Local owner changes have NOT been deployed.
- USD 5 monthly Budget: actual USD 0 / forecast USD 0.005. Console Home displayed
  current/forecast USD 0.01. These separate, delayed observations do not establish
  zero cost, a hard spending cap or an explanation for their difference.

No deployment, IAM mutation, new resource, image push, provider/model invocation,
Fargate workload, subscription, vendor message or GitHub publication occurred.
Existing storage and request charges may continue. The inventory is project-scoped,
not a fresh account-wide/all-region inventory or an unconditional safety guarantee.

## Closure and restart

CLI logout removed the cached login; already loaded access tokens may remain valid
for up to 15 minutes. Browser sign-out was confirmed at the public AWS console
landing page. Other user tabs were not changed. Universal token revocation is not
claimed.

Independent local inventory at 2026-10-24T23:50:42.0940143Z verified all ten residue
counts zero: Docker, AWS CLI, project helpers, unattributed helpers, scoped listeners,
owned temporary directories, backend staging directories, frontend work directories,
login-cache JSON files and active Docker socket directories. Two assistant processes
and two empty retained work directories were explicitly excluded. No files or
processes were deleted/stopped by the read-only inventory.

Latest weekly usage was 22% used / 78% remaining, not the historical 20%-remaining
stop threshold. This record closes the bounded owner-control preparation step;
it does not claim quota exhaustion or whole-project completion.

Next: review the owner-configured controller deployment and exact change set, keep
jobs/display disabled and circuit OPEN, then prove signed owner catalog/health and
non-owner rejection before enabling any workload. Browser credentials must remain
server-side; private browser integration, data-use entitlement and other release
gates remain unfinished. No public CloudFront draft or GitHub push is enabled.
