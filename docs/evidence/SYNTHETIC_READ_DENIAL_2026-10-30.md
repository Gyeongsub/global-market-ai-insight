# Bounded synthetic-role read-denial acceptance — 2026-10-30

## Scope and authority

The separately approved one-attempt cycle from 2026-10-29 was deferred without
execution at the user's stop, then resumed on 2026-10-30 after console/CLI login.
It created one temporary exact-owner/MFA model role, assumed it once, attempted
two fixed read-only canaries, cleared the lease and deleted the exact stack/role.
The approval is now consumed. No actual provider secret, decryption, model
invocation, RunTask, durable deployment or GitHub publication was performed.

## Exact-source prerequisites

- Current gate `92bfa592-511c-4b1b-8b15-97096c97d977`: completed
  2026-10-30T10:46:57.575Z, 90 steps, 1,754 pass / one existing skip, 363058 ms.
- Isolated local Git/frozen-install gate
  `1ab58a07-dfc9-40bb-883e-80a0292ae19c`: completed 10:56:22.264Z,
  same 90 steps and test counts; install 63772 ms / gate 380732 ms.
- Both bind 785 files / 7,070,776 bytes, SHA-256
  `1710c803ece3f48ffc1f095c3a2853d5b1e801144fdece0b8a46f553d9cde53f`.
- Fresh installation used locked public packages, no lifecycle scripts/private
  registry credentials, no remote Git repository and no retained temporary tree.
  Source repository was not changed. These proofs predate this evidence update;
  later cloud operations need fresh matching proofs, not reuse after edits.

## Actual bounded exercise

The explicit `--execute-temporary-role-read-denial` operator completed once.
Its private ignored journal is retained locally; identifiers, raw AWS errors and
credentials are deliberately absent from this publication-candidate document.

- Normal lifecycle calls: 17; cleanup calls: 10 (preflight/acquisition separate).
- Fresh policy review followed by one STS assumption; two native HTTPS requests.
- `ssm:GetParameter`: nonce-derived name, `WithDecryption:false`.
- `ecs:DescribeClusters`: one nonce-derived name, no default cluster query.
- Both strict reviewers accepted explicit AccessDeniedException evidence for
  the exact action. Missing-resource, generic failure or fixture output is not
  counted as denial evidence. No retry occurred.
- `readDenialVerified:true`, `completed:true`, primary/cleanup errors false.
- Deletion acknowledgement accepted; role and stack absence confirmed by the
  operator. Local credential lease was cleared before role teardown.
- Inference/provider calls zero; no server/listener created by the exercise.

At 2026-10-30T11:00:53.320Z, three independent read-only requests confirmed the
exact stack DELETE_COMPLETE, role absent and the sole expected IAM role resource
DELETE_COMPLETE. These checks did not perform an additional deletion.

This proves only the two tested read denials. RunTask denial, another principal,
server-side authorization-window expiry and restricted-role model invocation
remain unverified. The existing user-facing administrator-backed lab was not
silently migrated. Clearing local references/deleting the role is not a claim of
secure JavaScript memory erasure or instantaneous global credential revocation.

## Local UI observation and limitations

The existing search preview was checked without AWS/model/provider calls or
clipboard/external-link actions. Korean/English labels, Enter on skip-to-main
and Space selecting QLD worked; Korean language was restored. The requested
390-pixel Chrome override instead measured inner width 520/client width 500;
there was no measured overflow at that observed width. Screenshot capture timed
out. This is not 390-pixel mobile visual acceptance or a screen-reader audit.
The override was reset, test tab closed and the working preview emitted verified
closure/successful child exit. An earlier isolated preview was unreachable and
needed terminal interruption after its server-close message; independent local
inventory is still required before claiming complete local shutdown.

## Cost and final-closure boundary

Preflight confirmed disabled internal jobs/live display, OPEN v11, zero running
or pending tasks, services and occupied slots. The USD 5 monthly budget reported
actual USD 0 / forecast USD 0.002. Chrome displayed approximately USD 0.01 current
month and month-end forecast. These different observations are not reconciled
as an exact final charge; billing delays, rounding and retained storage apply.

The post-exercise 11-read check confirmed the same disabled/OPEN v11/zero active
compute and zero occupied-slot posture, with the same budget observation. CLI
logout removed the existing profile's login cache. It does not invalidate every
previously loaded token. Chrome tab access then failed on a focus-command timeout
on two attempts; console sign-out is unconfirmed and was handed to the user.
Final local residue checks still require completion.
Retained ECR/S3/DynamoDB/log resources can still cost money.
No account-wide zero-cost or permanent-safety claim follows from this exercise.

## Local-only follow-up after AWS closure

The native read-denial adapter now explicitly sets `rejectUnauthorized:true` on
both the private HTTPS agent and each request, rather than relying on the Node
default. Before the actual cloud run, the operator environment was checked to
have neither NODE_OPTIONS nor NODE_TLS_REJECT_UNAUTHORIZED set; the successful
live run is not evidence of an insecure connection. This subsequent hardening
does not reclassify the earlier source fingerprint as covering the changed code.

A zero-network regression intercepts the actual native-request boundary and
checks both TLS options, TLS 1.2 minimum, private agent/no keep-alive, and that a
socket error cannot dispatch the second request. It failed before the correction
(the explicit option was undefined), then passed. The related 32-test group and
strict services typecheck passed. No new cloud request was sent with this edit;
full-source verification remains separate.

The in-app browser subsequently measured the requested narrow viewport correctly:
inner width 390, client/scroll widths 375 (scrollbar accounted for), in English,
Japanese and Korean. Korean viewport and English full-page screenshots were
visually inspected; Japanese was DOM/layout-checked, not screenshot-certified.
SPCX overview retained identity/source safeguards and the offline SPCX ANALYZE
flow reached FAILED/DATA_UNAVAILABLE without a fabricated quote/result. That
screen also had client/scroll width 375, one main and one h1. No clipboard or
external link was activated. Language/viewport were restored, the test tab closed,
and the preview reported verified closure and successful child exit. This is
search/offline UI evidence, not real synthetic Bedrock mobile-result acceptance.

A separate credential-scrubbed, three-minute local synthetic-session fixture
then rendered the actual lab page in Japanese at inner width 390 and client/scroll
width 375. The full-page screenshot showed the result, disclaimer and controls
without horizontal overflow. Refresh and reload retained one fixture attempt;
explicit close displayed CLOSED, removed the result and stopped the listener.
The process exited zero with `fixtureCalls:1`, `awsCalls:0`, and no capability or
result retained. Viewport was reset and the test tab closed. Production-style
AWS labels/token counts in this injected fixture are not live inference evidence.

## Post-edit gate interruption

Current-source receipt `113d735a-8f52-4220-bbdf-9b016ce35b7b` failed its unchanged
600-second whole-gate deadline after 81 successful steps. The source stayed
unchanged; this is not a full pass. Helper tests and service tests took about
190 and 251 seconds respectively. Infrastructure assertions were interrupted;
the precise host-side cause of the slowdown is not established. No deadline,
test selection or AWS permission was relaxed in response.

Independent local inventory found no running helper, listener or login-cache
residue, but one maintenance-reference test synthesis directory remained. Its
creation time, exact test prefix, six CDK-generated files and absence of links
were checked before removing only that disposable directory. No source or AWS
resource was removed; these files are reproducible test output, not user data.
Fresh full-source verification and a final independent inventory remain required.

## Subsequent full local gate and publication triage

Receipt `d934b6e4-981f-4755-82ee-b101cff2b96d` subsequently passed all 90 unchanged
steps in 266841 ms, 1,755 tests passing and one existing skip. Source remained
unchanged: 786 files, 7,086,796 bytes, SHA-256
`486a5816385fc7368cbfd2a873fae7d92022a7dfced12a9d4221fc0498d042bd`.
It made zero AWS/external calls and closed its 33-request loopback checks.
The earlier timeout remains a failed receipt; a faster later run does not prove
the earlier host-side cause. This receipt predates the final documentation below
and the proposed expiry runbook; fresh matching gates precede any new cloud action.

The local publication audit covered 786 candidates and retained 43 findings across
40 files: 30 cloud-identifier shapes, nine email-shaped strings, three personal-
path shapes and one original PNG metadata finding. Against the October 24 triage,
the eleven additions are nine synthetic cloud-identity/endpoint fixtures and two
email-shape matches: a reserved local-proof Git author and rejected URL user-info.
Their relevant source context was inspected; no detector waiver or publication
clearance follows. The source high-confidence secret scan passed within the gate.
Original PNG/SBOM rights/metadata and full final history/privacy review remain open.

Git initially refused the audit because of repository ownership metadata. The
successful read used a process-only `safe.directory` value for this exact
workspace, not a global trust change. No remote, commit, workflow, upload or push
was created. [Earlier finding context](PUBLICATION_TRIAGE_2026-10-24.md).

The next [time-window contrast proposal](../runbooks/synthetic-expiry-validation-candidate.md)
is documentation only and needs a separate approval plus implementation/source
gates. No new role, STS request, model call or lease-retention exception follows
from preparing that proposal.

## Safe waiting checkpoint

At 2026-10-30T11:34:12.1129087Z the independent local inventory verified all ten
residue categories zero: Docker/AWS CLI/project/unattributed helper processes,
scoped listeners, owned temporary directories, backend staging, frontend work,
login-cache JSON and active Docker socket directories. Two assistant processes
were excluded and two empty work directories retained. This inventory did not
query AWS or claim account-wide credential revocation. Documentation links
(266 Markdown files / 849 links) and the high-confidence secret scan also passed
before this final checkpoint-only text was appended.

The weekly account meter was 21% used / 79% remaining; the requested 20%-remaining
stop threshold was not reached. Further live work waits for the new specific
IAM/inference/expiry scope, not for a claimed quota exhaustion. No new experiment
is running. Chrome console sign-out remains unconfirmed after the connection
timeout and the user handoff; CLI logout and local cache absence are confirmed.

## References

[GetParameter](https://docs.aws.amazon.com/systems-manager/latest/APIReference/API_GetParameter.html),
[DescribeClusters](https://docs.aws.amazon.com/AmazonECS/latest/APIReference/API_DescribeClusters.html)
and [AWS denial guidance](https://docs.aws.amazon.com/IAM/latest/UserGuide/troubleshoot_access-denied.html)
were checked on 2026-10-30. A reported policy type need not be the only policy
that denies access. See the [operator runbook](../runbooks/synthetic-role-rehearsal.md)
and [least-privilege ADR](../adr/0021-synthetic-lab-least-privilege-candidate.md).

[Node HTTPS request options](https://nodejs.org/api/https.html#httpsrequestoptions-callback)
and [TLS connection options](https://nodejs.org/api/tls.html#tlsconnectoptions-callback)
describe certificate verification. Local option-interception tests are not a
live handshake or new AWS denial acceptance claim.
