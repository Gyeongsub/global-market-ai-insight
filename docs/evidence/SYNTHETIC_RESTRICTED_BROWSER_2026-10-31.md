# Restricted-role browser acceptance — 2026-10-31

Private, fixed synthetic QLD English exercise; not actual prices, public hosting,
an external data API or a Fargate integration. The stable user entry now uses the
temporary model-only role lifecycle, with no administrator-key export fallback.

## Source and local checks

- Current receipt: `de9d0b6a-6aca-4225-89f4-2091743fa7bb`, completed
  `2026-10-31T01:48:08.716Z`.
- Frozen-clone receipt: `7acabfd4-cc30-4324-8c61-cea4f8c21bd8`, completed
  `2026-10-31T01:40:56.442Z`.
- Identical source: 822 files / 7,385,033 bytes / SHA-256
  `c2d789a88fd204a10c8fd730be1eeadb90c2227c16535651a72be3699755f414`.
- Both passed 90 steps, 1,874 tests and one existing skip. Each closed its
  33-request loopback proof; the clone/fresh-install temporary trees were removed.
  No GitHub repository, publication or deployed worker update was involved.

Failed receipts remain failures. The first pair stopped at a new SDK test-double
type error, which was corrected and type-checked. The later current receipt
`38859c4a-9c09-45ec-bc97-aae3c63ecd6d` stopped at service/contract tests, with no
preserved individual failure detail. Its exact cause is **unresolved**, not
asserted to be load or an AWS error. An isolated 1,293-test service run, a full
diagnostic run, the frozen-clone gate and a subsequent standalone current gate
passed. No checks, assertions or timeouts were removed or relaxed. This residual
diagnostic gap must remain visible; passing later runs does not explain it.

## Actual browser observations

The owned private journal ends in `e9cbad33c61a43c5960ee18b1866181d` under ignored
`outputs/local-gates`; it is not a publication attachment.

1. One temporary role/stack, one STS assumption. The UI opened at the exact
   loopback address with **READY — no model call yet**.
2. One explicit **Run synthetic analysis once** click, English. No retries.
3. **SUCCEEDED — synthetic analysis validated**; response received at
   `2026-10-31T01:51:40.257Z`, 895 input / 93 output / 988 total tokens.
4. **Refresh result** and a full page reload retained the same result timestamp
   and **Model attempts 1**; the paid action stayed disabled.
5. **End session** showed **CLOSED — local session ended**, removed the result
   and disabled all action buttons. The supervisor subsequently verified listener,
   credential lease, capability and result closure and finished automatic teardown.

The lifecycle reports `browserAnalysisAccepted:false` by design: it cannot infer
UI success from clean teardown. This separately observed browser evidence supplies
that acceptance. It does not claim all languages were re-run on this restricted
entry; earlier administrator-backed language tests are historical, not equivalent.
No screenshot, result or credential was uploaded. Reviewed synthetic-only result
and closed-state JPEGs are retained locally under ignored `outputs/browser-evidence`.

## Independent closure and cost

Parent lifecycle: 17 normal management calls / 10 cleanup calls, acknowledged
deletion, no primary/cleanup error. Acquisition has its separately bounded four
role reads and one STS call. These counts are not an account-wide API total.

At `2026-10-31T01:53:27.202Z`, three independent AWS reads verified the exact
stack `DELETE_COMPLETE`, the model role absent, and its sole IAM resource deleted.
The subsequent 11-read posture check found execution/display disabled, circuit
**OPEN v11**, zero running/pending tasks, services and occupied slots. Existing
Foundation/Compute/API stacks remained healthy; optional operations stacks absent.

One model request only. At the Tokyo rates checked earlier on October 31
(USD 0.000072 / 1,000 input and USD 0.000288 / 1,000 output tokens), this response
calculates to **USD 0.000091224** before tax, credits and billing adjustments.
This is not the session/account total or a final bill. The USD 5 Budget still
reported actual USD 0 / forecast USD 0.002; its delayed readings do not establish
zero charges. Retained S3/ECR/DynamoDB/log storage may incur charges.
Later, the signed-in console Home displayed current-month and forecast cost of
USD 0.01 before sign-out. This different view is not reconciled to the Budget
snapshot or represented as a final invoice; neither supports a zero-cost claim.
[Official regional price source](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonBedrock/current/ap-northeast-1/index.json).

No provider calls, ECS task launch, public endpoint, permanent model role or
GitHub upload occurred. A one-attempt application limit is not an IAM spending
cap; restarting creates a new allowance. STS credentials last 15 minutes, while
the tested session policy denies work outside its absolute five-minute window.
Cleanup does not claim universal instantaneous revocation or secure RAM erasure.

## Separate search regression, no model calls

The bounded loopback preview verified Japanese/Korean/English notices, the SPCX
identity warning, manual handoff and credential-free plain ChatGPT URL with
`noopener noreferrer` / `no-referrer`. No clipboard or ChatGPT submission was
performed. At a 390px viewport the observed document width was 375px; keyboard
activation of the skip link moved focus to `MAIN#search-main-content`.
This is a focused review, not complete WCAG/assistive-technology certification.
The original Japanese preference and viewport were restored; the preview exited
with confirmed closure and its agent-created tab was closed.

After cloud work, project CLI logout removed its login cache and Chrome Sign out
returned to the public AWS page with a sign-in control. The read-only local
inventory at `2026-10-31T02:01:27Z` verified zero Docker, AWS CLI, project or
unattributed helper processes; zero scoped listeners, owned temporary/build work
directories, login-cache JSON files and active Docker sockets. Retained source,
review evidence and cloud storage were not deleted. Subsequent work is local;
repeat the local inventory after any later build/test processes.

## Subsequent local completion checkpoint

After the cloud session and authentication were closed, current-installation
receipt `1fddd17b-4782-4564-add8-c68d4aba4e31` completed at
`2026-10-31T02:07:45.789Z`: 90 steps, **1,878 passed / one existing skip**, 33
loopback requests and confirmed HTTP fixture/server closure. Its exact source
was 827 files / 7,412,932 bytes / SHA-256
`f790a2b5848cdb1c6c66bdc07cae79f7b2836730e0c6ffc474b64482dfd738a5`.
This includes the failure-hint helper/tests and earlier learning documents,
not the later documentation-only edits or a new frozen-clone/cloud acceptance.

The helper preserves only bounded test ordinals/title hashes on future failures;
it does not persist raw child logs, grant retries or turn failed gates into passes.
A separately bounded three-run service reproduction exited successfully in
86,410 / 84,815 / 83,715 milliseconds. Its ad-hoc count parser did not recognize
the reporter format, so no per-run test count is claimed from those packets.
No failure was reproduced, **and the earlier failure remains unexplained**.
No assertions, timeouts or concurrency limits were relaxed.

The refreshed local inventory at `2026-10-31T02:14:37.9740357Z` verified zero
Docker/AWS CLI/project/unattributed helpers, scoped listeners, owned temporary
and staging directories, login-cache JSON files and active Docker socket
directories. Earlier PID-zero port entries were not ignored or killed; a later
query and this inventory found none. Two empty work directories were retained.
No new cloud request was made after the independent cloud closure above.

Source secret scanning found zero high-confidence matches. Documentation-only
follow-up corrected the current-vs-historical architecture narrative, added an
optional cost-free owner-learning exercise, and records publication/privacy
review separately. These observations are bounded local evidence, not account-wide
revocation, a zero-charge guarantee, public-release approval or proof that the
user personally completed the learning exercise.
