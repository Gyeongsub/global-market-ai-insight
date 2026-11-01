# Private synthetic Bedrock lab

This is a real, billable AWS exercise using invented data, not market-data access.
No Twelve Data key is read and no provider signup is needed. ChatGPT handoff stays
available separately. [Decision/boundaries](../adr/0020-synthetic-bedrock-local-lab.md).

October 31 cutover acceptance: the user entry now exclusively composes a
temporary model-only role, one STS session and automatic stack cleanup. The old
administrator-key export path is removed. Local lifecycle/entry regression tests
pass. Matching 90-step current/clone proofs and an actual English restricted
browser exercise verified one analysis, refresh/reload without another call,
explicit close and independent temporary-role deletion. A future execution still
requires fresh matching proofs; historical success is not a reusable permit.
[Exact evidence and limits](../evidence/SYNTHETIC_RESTRICTED_BROWSER_2026-10-31.md).

The first cutover-wide current/clone runs stopped at service type checking because
a new test double returned an incomplete SDK response. The unreachable-send test
double now throws if called; service type checking and all four adapter tests
pass. Those failed receipts are retained and are not reused as execution gates.
No live role or model request was created by those failed gates.
One later current service-test gate also failed without individual diagnostic
detail; its exact cause remains unresolved. Independent service/full/clone and
standalone current checks passed afterward, without relaxing any assertion or
timeout. Retain that limitation rather than attributing it to a guessed cause.

## Start (trusted owner PC only)

1. Use the supported local Node runtime (see runtime policy), not an older PATH
   version. Run `node scripts/local-gate-proof.mjs --execute-local` and
   `node scripts/local-git-clone-proof.mjs --execute-local-git-frozen-proof`.
   Keep both successful run IDs. No source edits afterward: the entry checks matching
   current and isolated fresh-install fingerprints, freshness
   (one hour) and exact source fingerprint.
   The live entry also checks the runtime minimum again before files, credentials
   or AWS calls; a passing source receipt does not authorize an older executable.
2. Authenticate the existing `gmai-admin` CLI profile using `aws login --profile
   gmai-admin --region ap-northeast-1`; complete any browser/MFA step yourself.
   Console authentication alone is not sufficient for CLI use. Do not create
   long-lived keys or copy secrets into chat or files.
3. Set `AWS_PROFILE=gmai-admin`, `GMAI_AWS_CLI_PATH` to the verified installed
   absolute `aws.exe` path, `GMAI_OWNER_GATE_RUN_ID` to the current gate run ID and
   `GMAI_CLONE_GATE_RUN_ID` to the frozen-clone run ID.
4. Dry-run: `node node_modules/tsx/dist/cli.mjs scripts/synthetic-analysis-lab.ts`.
   It makes zero AWS calls. Start with the same command plus
   `--execute-synthetic-analysis` in an interactive terminal. This checks owner
   identity and disabled/OPEN/idle posture, creates one owned temporary IAM stack,
   checks the exact model-role policy, assumes it once, then opens the remaining
   five-minute authorization window's local listener. Wait for the ready summary;
   the role-creation phase is not a listener-ready signal. Opening the page alone
   does NOT invoke Bedrock. Existing same-name roles are not reused or overwritten.
5. On the main search screen choose **Real AWS practice — synthetic analysis**,
   or navigate directly to `http://127.0.0.1:4175/`. If the safe entry page appears,
   click its local continuation link. Choose English/Japanese/Korean, then **Run
   synthetic analysis once**. Only the fixed invented QLD snapshot is transmitted.
6. Read validated analysis and AWS token counts. Model chooses approved IDs;
   the application renders wording. It is not a forecast or unrestricted essay.
   Refresh and duplicate clicks do not create another model call. Failure consumes
   the allowance too. Never automatically restart/retry after an ambiguous failure.

## End

Choose **End session**, press Enter in the owning terminal, or wait <=5 minutes.
The listener closes, in-flight work is aborted, result/capability cleared and SDK
connections destroyed. Browser navigation clears its display but the server may
remain until its expiry; do not confuse closing a tab with verified process stop.
After listener closure, **keep the terminal process running until temporary
role/stack cleanup finishes**. Verify `completed`, `stackAbsent`, `roleAbsent`,
`browserResult.credentialLeaseClosed` and `browserResult.listenerClosed` are true,
then independently check cloud deletion and local safe-stop inventory. A killed
terminal or incomplete private journal is not safe-stop evidence. Do not launch
another run over an unresolved temporary stack.
The browser distinguishes **confirmed session close** from **view cleared / server
close unconfirmed**. A lost response, page navigation, browser restoration or local
display deadline does not prove that the server stopped. Do not restart the lab
to resolve that uncertainty: check the owning terminal and local inventory first.
The client clears its capability/result and ignores late responses in all these
cases; the server independently retains its five-minute maximum lifetime.
Run `aws logout --profile gmai-admin` when project CLI work is finished. This does
not revoke other independent browser sessions or all server-issued credentials.

## Cost and scope

At most one Nova Lite attempt per process, output <=512 tokens, request <=8192
bytes, 20-second client deadline. Input usage validation is post-call, not an AWS
spending cap. Accepted work may be billed after timeout/close. Restarting grants
another allowance. No provisioned throughput, cross-region model, Fargate task,
permanent deployment, public endpoint, data-provider calls or saved results.
Each live run does create and delete one temporary CloudFormation/IAM role stack;
this control-plane lifecycle is not a permanent role installation.
Existing S3/ECR/DynamoDB/log storage is retained and may still incur charges.
The owner profile is used only for gated identity/readiness and role management.
The model SDK receives only the separately acquired model-only lease, never
exported owner administrator keys or a default credential chain. The role permits
only exact Tokyo Nova Lite inference; a session policy restricts its absolute
five-minute window. AWS STS credentials last 15 minutes, which must not be confused
with that authorization window. Closing/deleting is not an instantaneous universal
revocation or secure memory-erasure guarantee. [ADR 0021](../adr/0021-synthetic-lab-least-privilege-candidate.md).
AWS Budgets alerts are not hard spending stops. Consult current regional pricing:
[Amazon Bedrock pricing](https://aws.amazon.com/bedrock/pricing/).

## Verification status

On 2026-10-25, the full 90-step local gate passed (1,617 pass / one existing skip),
and one actual Korean Nova Lite analysis succeeded in Chrome: 895 input / 88
output tokens. Refresh/reload reused that result; explicit close cleared it and
stopped the server. [Dated evidence](../evidence/SYNTHETIC_BEDROCK_LAB_2026-10-25.md).
On 2026-10-26, English and Japanese each passed a separate real one-attempt
exercise (895 input / 93 output each), refresh/reload and confirmed closure,
after a new 90-step gate (1,625 pass / one existing skip).
[Current dated evidence and visual limitations](../evidence/SYNTHETIC_BEDROCK_LAB_2026-10-26.md).
No full synthetic Fargate integration or mobile visual QA is claimed.
