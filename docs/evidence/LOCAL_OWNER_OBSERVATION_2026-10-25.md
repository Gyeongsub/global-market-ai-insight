# Owner workstation: real read-only AWS browser checkpoint

Date: 2026-10-25. Scope: ADR 0017, trusted owner PC; no public deployment.

## Current-source local proof before AWS observation

Full gate `ee37425e-8626-400d-a274-08818cba9069`, completed
2026-10-25T09:33:23.338Z: 90 steps, 1,532 tests (1,531 passed, one existing
OS-privilege skip), source unchanged. Source fingerprint: 689 files,
6,375,803 bytes, SHA-256
`a4b0f3b2065138c2a5f90ea90e1c50e161330e33d825aa463dd8f1be03560af9`.
No AWS/external-network calls in that gate; 33 dedicated loopback HTTP requests,
test servers closed. This is an installed-workspace proof, not fresh-install,
clean-Git, full dependency-byte verification or publication approval.
Subsequent documentation/controller changes require their own current-source gate.

## Real observation, not a fixture

The explicit operator completed 48 bounded readiness read commands around two
owner-signed GETs (catalog and safe health). Its before/after readiness fingerprint
matched: owner configuration, pinned deployed controller package, jobs/display
disabled, circuit OPEN and no running/pending tasks, services or occupied slots.
The source observation time was **2026-10-25T09:38:09.746Z**.

Chrome AX/DOM inspection showed `AWS owner-signed GET snapshot`, the same timestamp,
`OPEN / disabled at observation time`, all five catalog entries and the explicit
SPCX/provider-coverage disclaimer. The actual `meta[name="local-capability"]`
was absent after loading, and the DOM width check reported no horizontal overflow.
Refresh retained the same dated observation and performed no additional AWS calls.
This is functional AX/DOM evidence, not a claim of screenshot/pixel validation.
An earlier fixture screenshot attempt timed out; it was not accepted as visual proof.

Enter stopped the owned process with exit 0. Its final aggregate was: 8 local HTTP
requests, closed true, listening false, observation/capability not retained,
AWS calls from HTTP 0, job calls 0, cloud mutations 0, provider/model calls 0.
The owned verification tab was closed. Authentication closure and an independent
end-of-task inventory remain separate from this per-server closure.

## Failed attempts and scope accounting

- First live attempt failed without sufficient stage detail. Its actual number of
  reads is unknown, bounded by 48 readiness reads and two signed GET attempts.
  Snapshot age versus the sequential closing check is a hypothesis, not a proven cause.
- A second attempt passed 48 reads/two GETs but stdin EOF immediately closed its
  listener (zero browser requests); this was not browser acceptance.
- A third attempt passed 48 reads/two GETs, but cross-site Chrome navigation was
  correctly denied. It closed with two local requests and no retained observation.
- Browser-only diagnostics then reproduced the issue with explicitly labeled,
  credential-scrubbed fixtures. A denied token/data-free landing and explicit
  same-origin link fixed navigation without weakening bootstrap/CORS protections.
- Including the successful run above: 144 confirmed readiness read commands and
  six signed GETs, plus the first failed attempt (upper bound 192 reads/eight GETs).
  CLI authentication/STS and any credential refresh are outside these workflow counts.

## Security and cost

No job POST, Fargate launch, provider request, Bedrock invocation, cloud mutation,
domain purchase, new hosting, dependency installation or GitHub upload occurred.
Small API/Lambda/DynamoDB read charges may apply; existing storage remains chargeable.
USD 5 alerts are not a hard cap. This dated checkpoint does not establish future
cloud state, second-principal live denial, provider licensing, complete product
acceptance, full IAM/image clearance or project completion.
