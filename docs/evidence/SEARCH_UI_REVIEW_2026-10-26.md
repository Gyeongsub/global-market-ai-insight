# Search UI and offline data-integrity review — 2026-10-26

## Scope

Local search companion and optional offline dashboard only. No new AWS calls,
provider calls, deployment, signup, publication or IAM changes during this review.
The earlier actual Bedrock exercises and cloud snapshot are recorded separately
in [the synthetic AWS evidence](SYNTHETIC_BEDROCK_LAB_2026-10-26.md).

## Browser findings and repairs

The in-app browser could capture the page after Chrome screenshot capture had
failed. The initial search screen joined ticker/name text on one line and used
default blue/purple link text against a dark button. Scoped card layout, explicit
link/visited colors, accessible asset names and narrow action layout were fixed.
Copy-failure text no longer incorrectly locates the question box “below.”

Observed checks in the in-app browser:

- Three locales × five assets × two question intents: 30 UI combinations.
  Prepared text preserved selected symbol, DATA_UNAVAILABLE and source safeguards.
- Explicit Korean copy reported success. It replaced the clipboard with a
  generated question; clipboard contents were not read and no question was sent.
- Plain ChatGPT and separate local AWS-lab links remained distinct. The link
  does not start the lab or automatically submit a prompt.
- Narrow layout measurements reported `innerWidth = 320`, no elements extending
  beyond that viewport. Full-page screenshots sometimes returned a narrower
  image/captured the sticky header mid-page; they are not a universal mobile or
  cross-browser accessibility certification.
- The later repaired SPCX offline ANALYZE path reached FAILED/DATA_UNAVAILABLE,
  with no quote, time, analysis, issuer assertion or NYSE/Nasdaq claim. The final
  measured offline viewport had inner/client/scroll widths all 320 and no
  overflowing main/header/footer elements. Search return navigation worked.

The SPCX regression was a **legacy fixture defect**, not verified market news:
the old offline UI included an asserted issuer/listing and invented quote. The
local asset is now UNVERIFIED and null-valued, all three locale insights removed,
both PRICE/ANALYZE unavailable even under the success scenario. HTTP fixture
server and client mapping reject fabricated success too. Other assets retain
explicitly labeled local fixtures. Historical deployed catalog/provider evidence
is retained as history and was not silently changed or redeployed.

## Tests and artifact

Targeted contract/presentation/session tests, HTTP fixture regressions, TypeScript
and build passed. The last quote/error presentation run was 12/12 passing tests.
The built frontend chunk at the final browser check was:

`assets/index-CNQHS-E_.js`, 275480 bytes,
SHA-256 `dd9b886215ee21ad0425a3f4317136c7d7dc70c475070e4d48e8f45be479c682`.

This is a local artifact, not a deployed site. Initial full gate
`c8238607-a224-4482-b00d-cf5179bfbd66` failed because old fixture tests still assumed
SPCX success. The runner and metadata-composition tests were updated to assert
unavailable without dropping their 30-intent/error/duplicate coverage.

The subsequent gate `35bbaad4-b021-4c46-be46-d3513c90ca41` passed at
10:38:45.234 UTC: 90 steps, 1,638 tests (1,637 pass / one existing OS skip),
33 dedicated loopback checks, no AWS/external calls, 231137 ms. Fingerprint:
744 files / 6,735,493 bytes,
`f26dc6793f2a1bfc0b79bfbc89053ac3b32dcb2f570b8bc7169f136f82f5ee03`.
It also covers the local-only restricted-role candidate. Documentation edits
afterward change the source fingerprint; this is not a fresh-install or live
AWS gate for a subsequently changed tree.

## Bounded preview and cleanup

Added an explicit dry-run-by-default preview launcher with fixed
`127.0.0.1:4173`, five-minute lifetime, 330-second child-process ceiling, sanitized
child environment and Enter/stop/EOF/signal handling. Five lifecycle/argument
tests cover normal stop, stop during startup, wrong binding, failed close and
surviving listener without falsely claiming verified closure.

Two browser verification sessions were closed via the launcher. Both emitted
`closureVerified: true` and supervisor `childSuccessful: true`. Task-created tabs
were closed and the viewport override reset. Independent inventory at
2026-10-26T10:40:07.7710266+00:00 found all ten residue categories zero. Two
assistant processes were excluded and two empty directories retained. Further
work requires another final check; this is not a permanent cloud-state claim.
[User runbook](../runbooks/local-search-preview.md).

## Remaining limits

No current-source fresh install, screen-reader audit, real Bedrock mobile result
visual acceptance, new cloud read, synthetic Fargate deployment, least-privilege
lab identity or GitHub publication is established by this UI review. The AWS
learning track remains separate from default search acceptance.

## Later isolated-install and keyboard checkpoints

The private local Git snapshot/clone proof
`35d11ec8-5505-4389-938b-7215230d6cd2` passed at 10:49:08.473 UTC.
It used 744 files / 6,738,752 bytes, source SHA-256
`fb667d86be7d48eb9c488c8af9a6deae761b58cc954380525c3d45d7d1a73aca`.
A byte-identical temporary clone and fresh frozen install passed all 90 gate
steps, 1,638 tests (1,637 pass / one existing skip), with 33 loopback checks.
Public package downloads occurred without registry credentials or lifecycle
scripts. The original repository was not changed, no Git remote was contacted,
and temporary trees were removed. This is not a GitHub publisher clone or CI.

Subsequent keyboard changes add localized skip-to-main and preserve focus when
entering/returning from the offline simulation. IAB checks verified Korean and
Japanese skip links focus the main element; English Tab from main reaches VOO
with a solid focus outline, Space selects QLD and Enter selects overview. Korean
simulation navigation focuses Back on entry and the opener on return. Final DOM
has one main/one h1; the locale was restored to Korean and the temporary tab closed.
No clipboard action, external link activation or model call occurred in this batch.
The new chunk is `assets/index-DFUw-B16.js`, 275883 bytes, SHA-256
`cf67ced84b26d297e3e04fd2d55601bc927b46551a05ef7f5f6a24877c554e7c`.

The preview reported verified closure and successful child exit. Independent
inventory at 10:58:58.5013753 UTC found all ten residue categories zero, two
assistant processes excluded and two empty directories retained. The isolated
install above predates these keyboard and later runtime/credential-boundary
changes; it must not be used as their exact-source acceptance receipt.
