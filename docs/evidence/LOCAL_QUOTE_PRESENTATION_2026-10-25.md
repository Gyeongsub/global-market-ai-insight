# Local quote presentation — 2026-10-25

Scope: resumed the interrupted UI work under the user's local-only boundary.
No AWS/provider/model call, deployment, vendor contact or publication. This is
an implementation checkpoint, not today's final safe-stop or whole-cloud audit.

## Implemented and focused verification

Eight durable `frontend/tests/quote-presentation.test.ts` cases replace the
previous one-off probe. They cover 15 asset/locale SSR fixtures, rejected quote
fields/missing values, canonical timestamps and both DST offsets (including the
repeated November hour), runtime option rejection, finite numeric extremes,
all 60 locale/market-state/freshness combinations, optional zero/negative/absent
changes and escaped source/notes. No native fetch is allowed by the fixture
matrix. This is text/DOM evidence, not a live-data or screen-reader test.

The tests exposed a real runtime boundary gap: a caller could pass an unsupported
timezone that Intl formatted but the UI labelled as America/New_York. Runtime
locale, timezone, string and sign-option validation now rejects it before
coercion. The shared API schema and supported three locales are unchanged.
The combined quote/dashboard/contract/local-HTTP-adapter tests passed **21/21**
on supported Node 24.22.1.

## Actual browser scope

The local development page displayed UTC market time, Eastern display conversion,
UTC retrieval time, source, fixture label and freshness in all three languages.
Five asset selections per language were measured at actual `innerWidth=320`:
15 combinations, root client/scroll widths both 299 (scrollbar excluded), no
main-element right-edge overflow, correct selected heading and all three
canonical datetime attributes preserved. The browser override required a 240px
request under the current zoom to produce measured 320 CSS pixels; requested
dimensions alone were not treated as proof. The override was reset afterward.

A Korean GOOG price action reached the explicit price-only completion message
without AI analysis and kept the quote provenance. Browser error logs were empty
when checked. Screenshot capture again timed out; full visual, assistive speech
and arbitrary content-layout acceptance remain unverified.

The owned tab was closed. Explicit `stop` closed both owned development/API
children, with API requests/jobs/timers all zero (the exercised route was the
default in-memory demo). No background server was retained between batches.

## Runtime environment observation

Today's default bundled Node reports 24.19.0, below the repository's unchanged
security floor. The guarded demo wrapper rejected startup before children were
launched. An already-installed prior bundle contains Node 24.22.1; its baseline
check and Windows Authenticode status passed. Executable SHA-256:
`6416a2fc6ccaf41d71fc50e3c0ff9074c633249e3c74564d55cd0a5c25b61ecb`.
Subsequent execution uses that explicit executable. No runtime download,
installation, global PATH/trust/settings change or relaxed version check occurred.
Initial checks on 24.19.0 are not used as the supported-runtime acceptance result.
The version/signature observation is not a guarantee against future advisories.

## Completed quote-source regression (before later error presentation work)

The initial clone attempt stopped before Git/install because the selected prior
Node bundle has no adjacent Git. No source/runtime minimum or timeout was relaxed.
The proof now accepts an explicit, validated installed Git path with the execution
flag; no PATH/environment fallback, original Git mutation or global trust change.
Ten clone-helper tests pass. The chosen installed Git reports 2.53.0.windows.3.

Receipt `local-clone-f0d19711-9cf0-469f-b752-902414142e26.json` completed at
2026-10-24T22:40:34.988Z: 641 source files, 6,060,471 bytes, source SHA-256
`e6b39d4db3915006874bdf666291c72fa8ea98ad6a036e80099dc444fe638d2b`.
The private tracked snapshot/clone and fresh frozen installation passed all
90 steps and 1,428 tests (1,427 pass, one existing privilege skip). Installation
took 72,499 ms; the unchanged 360,000-ms full gate took 331,900 ms. All 33 loopback
HTTP checks passed. Strict receipt validation and current source equality passed
before documentation/later error changes. This is not a publisher clone or CI.

Independent inventory at 2026-10-24T22:40:51.8764165+00:00 found all ten scoped
process/listener/temp/cache residue counts zero. Two assistant processes and two
empty work parents were explicitly excluded/retained. This proves local closure
at that point, not current cloud safety or credential revocation. Fresh install
downloaded pinned public packages from the npm registry; no private registry
credentials were passed and no project source was uploaded.

## Remaining verification

The receipt above does not cover the subsequent error/announcement changes.
Their current evidence is [recorded separately](LOCAL_ERROR_PRESENTATION_2026-10-25.md). Screenshots and
full assistive-technology review remain limited as described above. Public data
rights, user authentication/TLS/hosting, maintenance IAM, image/license/privacy,
publisher-clone/CI and explicit publication gates stay uncleared.
