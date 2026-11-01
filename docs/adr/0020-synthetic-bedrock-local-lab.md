# ADR 0020 — Separate bounded synthetic-data Bedrock exercise

Date: 2026-10-25. Status: user-approved scope; verify execution separately.

## Context and decision

AWS learning is the principal objective. The ChatGPT handoff in ADR 0019 solves
current research without new data-provider accounts, but does not exercise AWS.
The user therefore authorized synthetic input, actual AWS analysis, and results
in the browser while preserving search. No provider licensing claim is needed
for invented numbers; they must never masquerade as observed market prices.

Keep the search companion unchanged and add a plain link to a separately started
127.0.0.1:4175 lab. The broker directly invokes Tokyo `amazon.nova-lite-v1:0` with
one fixed invented QLD quote. The model selects schema-constrained approved
insight IDs; the existing adapter validates IDs/usage and renders localized
educational wording. This is actual Bedrock inference, not free-form prediction.

This deliberately small first exercise does not deploy a synthetic Fargate
worker. The retained API/Lambda/DynamoDB/Fargate stack, disabled provider jobs,
disabled live display and OPEN operating circuit are unchanged. A later full
pipeline exercise requires its own scope, deployment review and bounded cost.

## Boundaries

- Current full local gate/fingerprint and existing owner identity required.
- Temporary CLI credentials exported only into process memory; no credentials
  in browser, URL, repository or logs. Pin HTTPS AWS endpoint, model and region.
- Only fixed QLD input and three locales. No user text, key, provider or URL field.
- Host + Origin + Fetch Metadata + random 256-bit capability; no CORS, cookie
  authentication, LAN listening, tunnel, autostart or arbitrary file serving.
- Cross-site entry receives only a safe continuation page, not a capability.
- One attempt per process (failures consume it), 20-second client deadline,
  SDK maxAttempts=1, 512 max output tokens, serialized request <=8192 bytes.
- The 1500-input-token adapter validation occurs AFTER inference. It is not a
  prebilling token cap. Fixed prompt and byte cap bound input; no fabricated
  dollar hard cap. A timeout/abort may still incur charges for accepted work.
- Five-minute lifetime, bounded HTTP requests/connections, explicit close,
  abort in-flight request, destroy SDK client, erase retained result/capability.
- Server restart grants another paid attempt. Limits are not account-wide and
  cannot protect against an authorized local operator deliberately restarting.
- Trusted single-user PC only: loopback/capability is not an OS-user boundary
  against malware or another local process. Existing admin credentials remain
  broad; no IAM grant or policy expansion is made by this exercise.

## Consequences

AWS SDK, SigV4, temporary credentials, inference contract, validation, metering,
CSRF/loopback boundaries and teardown can be studied without new subscriptions.
ChatGPT results stay in ChatGPT; synthetic Bedrock results are a different panel.
No public hosting or GitHub upload. Existing storage fees are not eliminated.
Use [the runbook](../runbooks/synthetic-bedrock-lab.md) for startup and shutdown.
