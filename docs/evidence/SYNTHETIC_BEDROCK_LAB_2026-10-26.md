# Synthetic Bedrock lab — 2026-10-26

This is dated evidence for the direct local-owner → Tokyo Bedrock exercise,
not a public release, current market-data service or synthetic Fargate deployment.

## Source and local verification

- Fixed misleading browser close handling: only a positive exact server reply
  confirms session closure. Lost replies, navigation/restoration and view expiry
  clear local data without claiming that the server stopped.
- Ignore late responses; consume the run allowance before dispatch; retain the
  original conservative deadline across refreshes. Localize controls and status.
- Added eight browser-state tests; combined session/HTTP/browser suite: 15 pass.
- Service typecheck, secret scan and 766 document links passed.
- Full gate `5c7d6ae7-3f53-4bbb-b37c-ab9a5c6a3c68` ran
  09:49:14.743–09:54:26.213 UTC: 90 steps, 1,626 tests, 1,625 pass and one
  existing environment skip. No AWS/external calls; 33 dedicated loopback checks;
  test servers closed. Current installation, not a fresh clone/install proof.
- Gate fingerprint: 734 files, 6,690,045 bytes,
  `2dba9805514346d983cbf95f3d8e73f9d4b411305dfbdc7eac717fccdc3b311f`.
  This exact source was checked by both live lab starts. This evidence and later
  documentation edits change the fingerprint; a future live run needs a new gate.

## Two bounded real calls

Existing owner CLI authentication was refreshed using the existing Chrome AWS
session. No new identity, policy, permanent key, provider signup or resource was
created. Each separate server admitted exactly one attempt, no retries, output
maximum 512 tokens, five-minute lifetime. The sole input was the fixed invented
QLD snapshot, never a real quote or user portfolio.

| Locale | AWS result received (UTC) | Input | Output | Attempts |
| --- | --- | ---: | ---: | ---: |
| English | 2026-10-26T09:55:16.645Z | 895 | 93 | 1 |
| Japanese | 2026-10-26T09:57:08.257Z | 895 | 93 | 1 |

Both showed validated localized educational output, synthetic-data warnings and
token usage. Manual refresh and full reload reused the same timestamp/result;
Run stayed disabled. Each explicit End session showed CLOSED, erased the result
and ended its owning process. Each terminal summary reported requests=12,
listening=false, closed=true, capabilityRetained=false, resultRetained=false,
modelAttempts=1, providerCalls=0, cloudResourcesCreated=0.

The Korean live checkpoint remains [the previous day's evidence](SYNTHETIC_BEDROCK_LAB_2026-10-25.md),
not a repeated paid test on this revision. All three locale contracts pass locally.

## Browser limits, not false visual sign-off

Chrome accessibility/DOM behavior passed. Screenshot capture timed out twice.
A requested 320px override produced measured 406/426 CSS-pixel widths instead;
those observations showed no horizontal overflow but are **not** 320px mobile
acceptance. The override was reset and both owned lab tabs were closed. No
mobile/full visual sign-off or saved screenshot is claimed.

Later, a separate injected-fixture browser exercise (zero AWS calls) used the
same page/session/server with a fake transport. In the in-app browser the measured
viewport was 320px, document client/scroll widths both 305px, for English READY
and Korean SUCCEEDED. All three Korean buttons measured about 264.8px wide;
Run was disabled after the sole fake result. Full-page screenshot capture failed,
so this is DOM/overflow evidence, not complete visual or live mobile acceptance.
The fake usage was 800 input/100 output and must not be added to AWS billing or
represented as a new AWS result. Explicit End session showed CLOSED; server exit
reported listening=false, closed=true, requests=6, capabilityRetained=false,
resultRetained=false, modelAttempts=1 (fake transport), awsCalls=0. The tab was
closed and the temporary viewport override reset.

## Cost/security checkpoint

Before and after the two calls, the scoped 11-query AWS read-only check found:
provider jobs and live result display disabled, circuit OPEN version 11, zero
running/pending tasks, zero services, zero occupied slots. No deployment or AWS
resource mutation was performed. Existing budgets showed actual USD 0 and
forecast USD 0.004; delayed billing means these are not proof of zero call cost.
Today's two real calls total 1,790 input + 186 output = 1,976 tokens and are
billable. Existing retained storage may continue to cost money.

Official CLI logout succeeded. Independent local inventory at
2026-10-26T09:59:22.3399206+00:00 showed all ten residue categories zero,
including listeners, helpers and CLI login-cache files; two assistant processes
were excluded and two empty work directories intentionally retained. This local
check is not an account-wide audit or revocation of all issued credentials.
The user's independent Chrome console session was not logged out by this step.

## Remaining work

Continue zero-call browser/accessibility and operator-safety review, retaining
honest visual-verification limitations. The [Korean API/AWS learning guide](../API_INTEGRATION_LEARNING_GUIDE_KO.md)
is now delivered locally; it does not claim the user completed its exercises.
Full synthetic Fargate integration, narrower deployed lab IAM, genuine signed
second-principal testing and separately reviewed GitHub publication remain
uncompleted/deferred, not implied by this direct-inference checkpoint.
