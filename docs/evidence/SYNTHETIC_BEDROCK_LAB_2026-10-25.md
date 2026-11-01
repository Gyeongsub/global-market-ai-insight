# Synthetic Bedrock lab — 2026-10-25

## Delivered scope

ChatGPT question preparation/copy/manual handoff preserved. Added a separately
started protected loopback lab, one fixed invented QLD snapshot, three analysis
locales, real Tokyo Nova Lite inference and browser-visible validated results.
No data-provider calls/signups, IAM change, cloud deployment or GitHub publication.
This is direct Bedrock from the local broker, NOT an end-to-end Fargate deployment.
Existing grounded adapter selects approved insight IDs and renders application
wording; no unrestricted prose or market prediction is claimed.

## Local verification

Full gate `9916a7aa-7b18-435a-91a8-46612c1ff56d`:

- Started 2026-10-25T12:14:11.210Z; completed 12:19:12.603Z.
- 90 steps; 1,618 tests total, 1,617 pass, one existing environment skip.
- 33 dedicated HTTP safety-proof requests; no AWS/external-network calls.
- Source unchanged during gate: 729 files / 6,650,948 bytes;
  SHA-256 `5b7eafa46aaba9b8d3878e4a796eeff5a124363a8007471ed391d18e247ecaa3`.
- New tests cover all locales, simultaneous starts, failed/malformed outputs,
  cancel/late response, timeout, expiry, hostile HTTP requests, reload, result
  isolation, no automatic paid start, credential/gate boundaries and shutdown.
- This evidence/status documentation was added after execution; the source
  fingerprint is the pre-evidence tested snapshot, not a claim about later edits.

## Actual AWS/browser result (not a mock)

Existing Chrome console session was connected to the `gmai-admin` CLI profile.
Live entry matched owner/controller configuration and the fresh full gate, then
served 127.0.0.1:4175 with pinned temporary credentials and HTTPS endpoint.

- Main UI showed the new link and retained ChatGPT prompt/controls.
- Link's cross-origin navigation received the no-capability continuation page.
- Explicit continuation opened the lab; Korean selected and Run clicked once.
- Actual model: `amazon.nova-lite-v1:0`, region `ap-northeast-1`.
- Completion 2026-10-25T12:20:52.018Z: `SUCCEEDED`.
- AWS-reported usage: input **895**, output **88**, total **983** tokens.
- Result showed invented USD 100 snapshot, QLD leverage/path-dependency risks,
  synthetic source, uncertainty and educational disclaimer.
- Refresh and page reload retained the same timestamp/usage/result and disabled
  Run; no additional model attempt. Desktop screenshots showed the warning,
  controls and result/token section without overlap. Mobile visual QA not done.
- End session showed CLOSED and removed the result from the page.
- Server exit: requests 12, modelAttempts **1**, listening false, closed true,
  capabilityRetained false, resultRetained false, providerCalls 0,
  cloudResourcesCreated 0. Preview server separately reported listening false.

## AWS cost/security verification

Read-only before/after readiness checks (11 reads each) both confirmed:
provider jobs and live display disabled; OPEN circuit version 11; zero running
tasks, pending tasks, ECS services and occupied slots. No cloud state was changed.
Budget check reported actual USD 0 and forecast USD 0.005; billing is delayed and
these values do NOT prove the inference was free. The single call is billable;
no new recurring infrastructure was created. Retained storage may still cost.

No customer holdings, provider key or user free-form content was sent to Bedrock.
Temporary AWS credentials stayed in the server process; browser received only
the local capability. Provider credentials were not read. Broad existing admin
permissions were not expanded, but remain an operator-level residual risk.
Timeout/cancel cannot guarantee cancellation of already accepted billable work.

## Final safe stop

Official `aws logout --profile gmai-admin` completed successfully. Independent
inventory at 2026-10-25T12:24:38.4592306Z verified local closure: all ten scoped
residue categories zero, including project helpers, listeners, AWS CLI processes
and login-cache JSON files. Two assistant processes were excluded and two empty
work directories retained. This is not a claim that every previously issued AWS
credential was revoked; the user's independent Chrome console session was not
logged out by this check. Owned verification tabs were closed.

Post-evidence documentation check: 251 Markdown files / 748 links, zero findings.
High-confidence secret scan: passed, zero findings. No public upload occurred.
