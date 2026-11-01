# Synthetic trust compatibility probe — 2026-10-26

This records a permission-free authentication prerequisite, not deployment of
the least-privilege model role or a new paid inference result.

## Initial pre-create failure

The source passed fresh-install/local-clone proof
`d0c50e43-69fd-4e82-8233-e14b771d77ce` (11:27:36–11:36:03 UTC) and current-install
gate `7a3985e3-aeb9-4046-bd77-70fbfb4cbfba` (11:36:44–11:41:57 UTC).
Both covered 90 steps and 1,655 tests (1,654 pass / one existing skip), with
749 source files / 6,787,653 bytes and fingerprint
`c209a8f1b0a1ed48d5e0ebd49a9e87cc5b561b073998ecacd140e2aa9487467f`.
Fresh installation used 392 locked public package identities without private
registry credentials or lifecycle scripts and removed its temporary trees.

The live entry's owner and project-readiness prerequisites passed, but its first
IAM GetRole failed. The result explicitly reported createAttempted=false,
normalCalls=1, cleanupCalls=0, assumption=not-attempted. No role was created,
no STS assumption attempted and no model/provider call made.

Two bounded read-only diagnostic queries against that exact planned role name
found SignatureDoesNotMatch with the explicit global IAM endpoint signed in
Tokyo, and NoSuchEntity when signed in us-east-1. Raw diagnostics, account IDs
and credentials were not printed. The latter confirms the planned role was
absent; the first result says nothing about MFA compatibility.

The transport now pairs the explicit global IAM endpoint with us-east-1 signing
and keeps regional STS in Tokyo. A regression test binds each endpoint to its
signing region. These source changes invalidate the receipts above for another
live run; fresh exact-source verification is required before retrying.

## Corrected execution and cleanup

Corrected source passed fresh-install/local-clone receipt
`9da1c992-2a81-443d-850f-a4f7fb96bee8` (11:45:35–11:54:04 UTC) and current-install
receipt `cc37a459-1b2e-4a9d-87ec-fd07f192039f` (11:54:37–11:59:52 UTC).
Both covered 90 steps / 1,656 tests (1,655 pass / one existing skip), 750 files /
6,791,405 bytes, fingerprint
`352e496a95ff9d200a718f85d2b168a880b0d1adf5125f0142f1e942d26cf2e8`.

The bounded real probe then completed: the exact-user, HTTPS, temporary-token
and MFA trust succeeded with one deny-all AssumeRole request. The role had no
permission policies or instance profiles. Normal calls=7, cleanup calls=6,
primaryError=false, cleanupError=false, absentConfirmed=true. The one owned
role was deleted and independently read as absent. No returned access key was
printed or used; no model/provider call occurred. This is positive trust evidence,
not model-policy/second-principal/expiry negative-authorization evidence.

An independent 11-query project check afterward confirmed provider jobs and
display disabled, execution flags disabled, running/pending/tasks/services and
occupied slots zero, circuit OPEN version 11. The monthly USD 5 budget displayed
actual 0 / forecast 0.004; delayed billing is not a zero-cost guarantee. The
official CLI logout then removed the gmai-admin login cache. This does not revoke
already issued credentials or log out the user's independent Chrome session.
The issued probe session had an explicit deny-all policy and was never used;
role deletion alone is not claimed to revoke STS credentials.

## Boundaries still open

The durable model role is not deployed. Independent local inventory remains
required at final task closure, not inferred from these cloud observations.
An interim independent local inventory at 12:05:17.0458141 UTC verified all ten
residue counts zero, including helper processes, listeners and CLI login cache;
two assistant processes were excluded and two empty work directories retained.
Later local development must still finish with a new final inventory.
The retained model lab still uses the temporary owner administrator identity.
No GitHub upload was performed; a local 749-file publication preflight found
42 manual-review findings (29 cloud identifier, 9 email, 1 embedded image
metadata, 3 personal path), which remain blockers to publication sign-off.
