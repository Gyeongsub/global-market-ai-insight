# Owner-only local AWS observation

This is the first connection checkpoint for [ADR 0017](adr/0017-local-owner-aws-bridge.md),
not the completed market UI. The ordinary frontend remains a labeled fixture.

## What runs

`scripts/local-owner-observation.ts` has a zero-action default. Explicit
`--execute-read-only` requires the existing `gmai-admin` temporary login,
`GMAI_AWS_CLI_PATH`, and `GMAI_OWNER_GATE_RUN_ID` identifying a passing full local
gate for the exact current source, completed within one hour.

The operator performs two bounded 24-read readiness snapshots around exactly two
signed GETs (`v1/assets` and `v1/health`). It checks the same owner, fixed deployed
controller package, jobs/display disabled, circuit OPEN, no tasks/services/slots,
budget readiness and IAM references through the existing validators. It refuses
changed or unknown state, never redeploys or retries a mutation, and starts no
web listener on failed preflight. The recorded package digest must be renewed
through actual release proof if the controller changes.

Only after those checks does `http://127.0.0.1:4175/` serve a copied, sanitized
observation. The HTTP server has no AWS client or filesystem access path. Refresh
performs zero cloud calls. Source and observation time are explicit; no quote,
model output, account identifier, endpoint or private upstream prose is shown.
The observation may be up to three minutes old at server start because the closing
readiness check is independent and sequential. It is explicitly dated, not an
authorization lease or a claim that AWS state is still unchanged at view time.
The local server itself still expires within five minutes. A failed run reports
only a fixed stage and bounded attempt counts, never raw AWS errors or responses.

Run with the supported local Node runtime and installed tsx, for example:

```powershell
# Set the three operator environment variables locally; never paste credentials.
node node_modules/tsx/dist/cli.mjs scripts/local-owner-observation.ts
node node_modules/tsx/dist/cli.mjs scripts/local-owner-observation.ts --execute-read-only
```

The first command is a plan only. Do not substitute fixture output for AWS proof.
The live command needs an interactive terminal (TTY). Closing stdin is an explicit
safe-stop trigger; piping the command from a non-interactive caller can therefore
close the listener immediately after readiness, before browser inspection.
Use the printed loopback address in the same trusted device's browser. Cross-site
top-level navigation (including some extension-opened tabs) receives a denied,
data/token-free landing. Its explicit local link performs same-origin navigation
before bootstrap. Frames, another hostname/port, missing browser metadata and
generic curl navigation remain rejected. No CORS exception is needed.
For browser-only diagnosis without AWS, the separate explicit
`node scripts/local-owner-fixture.mjs --execute-local-fixture` runs the same
boundary with a prominent LOCAL TEST FIXTURE label and a credential-scrubbed child.
This is never an automatic fallback from failed AWS authentication.

The observation page defaults to English and offers Japanese and Korean. This
diagnostic page keeps the language in memory only (no cookie or browser storage),
so reload returns to English. That is separate from the main product's persisted
locale requirement. Switching language performs no request and never renews the
fixed expiry. The client conservatively subtracts the local fetch time; focus,
visibility, pagehide and back/forward restoration cannot revive an expired DTO.

## Security boundaries

- 127.0.0.1 only; no LAN listener, DNS alias, SSH tunnel or public hosting.
- Five-minute maximum, 128 HTTP requests, 16 simultaneous sockets, 8 KiB headers,
  5-second socket/request limits; exact empty request bodies and fixed paths.
- Random 256-bit in-memory capability, exact origin and Fetch Metadata on reads;
  strict navigation metadata protects bootstrap. SOP/CORP/CSP/no-store/no-referrer
  add defenses, but are not protection from a compromised local OS.
- No capability in a URL, log, file, cookie or browser storage. Page metadata is
  removed before use; pagehide/back-forward-cache handling clears displayed data.
- Temporary AWS credentials remain in the operator's server-side environment/cache,
  never in HTML/JS or the response. The existing AWS owner check still applies.
- No arbitrary URL, job POST, circuit switch, provider/model call or cloud write.

## Close and verify

Press Enter in the owned process or wait for automatic expiry (maximum five minutes).
SIGINT/SIGTERM also close it. The final aggregate must say `closed: true`,
`listening: false`, observation/capability not retained. No claim of secure memory
erasure is made. The safe-stop inventory includes port 4175. Check the owned
process/listener and log out the temporary AWS CLI session separately at task end;
process exit does not revoke issued temporary credentials or log out the console.

Actual two-GET checks can incur small API/Lambda/DynamoDB charges. No additional
hosting or idle service is created; existing storage remains chargeable. A USD 5
budget alert is not a hard spending cap. The script does not enable jobs/display
or alter circuit state, and after its fixed observation there are no background
cloud refreshes. Current cloud facts, historical evidence and local fixture tests
must remain labeled separately.

The first real browser connection and its exact verification limits are recorded
in [the 2026-10-25 observation evidence](evidence/LOCAL_OWNER_OBSERVATION_2026-10-25.md).

## Next stage remains disabled

The [cloud-side admission window candidate](adr/0018-owner-admission-window.md) is
local code only. It neither enables the UI's PRICE/ANALYZE operations nor changes
the deployed controller or the fixed digest accepted by this observation command.
Private access does not itself establish provider display/AI rights. On 2026-10-25,
Twelve Data's [personal usage guidance](https://support.twelvedata.com/en/articles/5332349-commercial-and-personal-usage)
lists Grow/Pro/Ultra and explicitly describes Pro internal AI use; its
[pricing page](https://twelvedata.com/pricing) labels Basic internal non-display.
Basic personal screen display/AI-processing entitlement is therefore unverified,
not assumed prohibited or approved. No provider inquiry, upgrade or payment is made.
