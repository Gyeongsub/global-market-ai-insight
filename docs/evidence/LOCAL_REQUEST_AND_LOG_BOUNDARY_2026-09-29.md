# Request decoding and worker-log boundary — 2026-09-29

This is a local-only hardening checkpoint. No AWS API, market provider, Bedrock,
GitHub or deployment action is required by these changes or their tests.

## Changes

- The controller's JSON request parser now rejects malformed, oversized or
  non-canonical base64 before decoding. It also rejects invalid UTF-8 bytes
  instead of replacing them silently. A normal canonical base64 JSON request
  remains accepted.
- The one-shot worker includes its bounded `JOB_ID` in a sanitized failure log
  so a failed launch can be correlated with controller and job-state records.
  Missing or unsafe values are omitted; raw fixture content, error text and
  credentials are never echoed by this path. A later same-day follow-up also
  removed the stable human-readable error sentence from worker telemetry;
  only the error code and optional allowlisted diagnostic category remain.
- A subprocess regression test covers the real local worker entrypoint on
  failure, in addition to unit tests for the decoder and identifier filter.

## Verification and limits

The targeted tests passed. The full local checker passed 234 service/contract,
19 infrastructure, 21 frontend and 11 publication/secret-preflight tests
(285 total), plus type checks, lint, local bundles, no-network smoke, synth,
license and secret checks. The first full attempt stopped at an esbuild Windows
filesystem access denial; rerunning the same local-only check with approved
filesystem access succeeded. No cloud endpoint was used by the checker.

This does not establish a live deployment, container-image scan, public data
rights, or account-wide cost safety. The existing CloudFront, notification,
live-browser authorization and GitHub publication gates remain unchanged.
