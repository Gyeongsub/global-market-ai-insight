# Phase 12 — exact local acceptance scopes, 2026-10-18 Tokyo

No deployment, ECR push, real market/model transaction, permission change,
hosting, CI execution or publication. These proofs do not clear release gates.

## Initial scope: 39-case runtime, not the later correction

The earlier build receipt `9922e4a4-bb17-4349-98ec-86df126c1b6a` and runtime
receipt `8c068407-234c-4675-8013-b35836bb5124` covered 525 files / 5,339,393
bytes, source SHA-256
`708b1d9d74d312fe1e46aa4698ec7256c739fd4037d32b79633b0c434c4403fa`.
It passed 39 isolated Linux Node 22 cases. The subsequent adapter own-timeout
correction and reusable exact-field journals are not in that image. Its pass
is retained, never relabeled as evidence for the later source.

## Corrected source: common binding across all three proofs

Current implementation snapshot: **528 files / 5,374,087 bytes**, SHA-256
`92a98c308da6a9e1f6b1e2b9f518f41ab002329f185697c1417d79e3b514a44c`.

- Recorded build/static scan `3f79f991-40b8-4f5c-a139-79145538d8c1`, completed
  01:03:46.679 UTC: one source-bound local image, reviewed base prefix and three
  exact application files matched. Archive 54,922,240 bytes; image manifest
  `sha256:3adc584adf04f6fbc13dbed4d22d6f403a43294fbac93619dc396fedb54ba832`.
  Fresh DB, UNKNOWN/HIGH/CRITICAL/secrets zero; MEDIUM 23 / LOW 8 retained.
- Recorded runtime `8ec6a8bb-e0a8-411b-8c6f-80eba75d51da`, completed
  01:04:12.522 UTC: Linux x64 Node 22.23.3, UID/GID 65532, **41 cases** (30
  normal/11 negative), 39 provider / 19 model **mock** requests, actual service
  requests zero. Exact isolation verified before/after exit zero; owned
  container/archive/config absent afterward. No source/home/socket mount,
  credentials, published port or external network.
- Recorded genuine fresh install `4fad0408-747a-492b-9bfd-b8ce8512b65b`, completed
  01:11:58.830 UTC: pinned pnpm 11.16.0 official tool integrity verified,
  391 locked identities, no dependency reuse/private registry credentials/
  lifecycle scripts or existing-install change. Installation 70,086 ms;
  **86-step whole gate 323,086 ms** under the unchanged 360,000 ms limit.
  Four groups/concurrency two, **1,194 tests: 1,193 pass / one existing Windows
  privilege skip**. Thirty-three loopback requests, servers closed and owned
  temporary installation removed. This is not a clean Git clone or CI run.

At **01:12:31.073 UTC**, an independent read of all three completed/passed
receipts passed the three strict schema validators and matched the exact
current source fingerprint above. No implementation/source edit occurred
between the corrected image, runtime and frozen-install operations. Worker
module: **1,488,026 bytes**, SHA-256
`6c755e1558d2fb6c8605a685648d9c64efd9d0b30b7a61334a0cf337223520b6`.
The module's written bytes also matched bracketed in-memory source rebuilds.

The four new own-adapter timeout regressions initially failed and then passed;
53 focused provider/model/operation/lifecycle tests pass. Seventeen focused
image/runtime journal/operator guards pass. Failures, unknown private fields,
unsafe findings, altered initial receipts or incomplete cleanup cannot become
durable success. A killed producer leaves an incomplete record. These unit
tests are not substitutes for the actual three proofs above.

## Handoff boundary and remaining gates

This result document, safe-stop record and final README/plan/readiness/runbook
handoff text are later edits, outside the accepted fingerprint. They receive
separate secret/link/publication checks. Neither documentation edits nor the
retained image authorize live execution of changed source.

Independent [safe-stop evidence](LOCAL_SAFE_STOP_2026-10-18.md) covers cloud,
authentication, Docker, processes, listeners and temporary resources. Preserve
the unresolved IAM/Maintenance controls, provider rights, source/native/OS/
license attribution, retained image findings, hosting/auth/CI/privacy/history
and final publication approval gates. No pass or scanner finding was waived.
