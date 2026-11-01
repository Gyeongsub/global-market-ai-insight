# Phase 9 local UI checkpoint — 2026-09-13 evening

No AWS/provider/Bedrock calls, login, cloud deployment, image push, publication or subscription change in this session. Morning cloud evidence was transcribed separately; its resource/Budget observations were not re-queried tonight.

## Changes

- Locale preference restores synchronously and safely falls back to English when storage access/getItem fails. Denied/quota-exceeded writes do not crash the UI. Only en/ja/ko are accepted. Six executable tests cover supported languages, invalid values and blocked storage access/read/write.
- Queued/running status badges now match demo progress instead of displaying READY during work. Loading explicitly describes a simulation, not an actual worker launch. Workspace/exchange context labels are localized.
- A 390px Japanese QLD inspection exposed an unwrapped risk disclosure extending beyond its card. The risk pill now wraps with a bounded width; a CSS regression test was added.

## Verification

- Full check after locale/status changes passed: 174 discovered TypeScript tests (including six new preference cases), 7 infrastructure and 4 existing frontend contracts = 185 unique tests. The preference tests also ran redundantly in that check; the duplicate runner step was removed because test-all already discovers frontend/tests. No test was removed.
- After the CSS fix, static build passed and five frontend contract tests passed, including the new wrapping regression: combined current unique coverage is 186 tests. A second full-suite run after the CSS-only change was not performed.
- In-app browser: Japanese/Korean/English selections survive reload. Japanese QLD demo transitions to success, disables asset/action buttons while busy, and shows canonical localized risk content; existing results change to Korean when selected. No live API was connected.
- 390px viewport: Japanese risk width before fix about 376px exceeded its roughly 365px parent. After fix width about 304px and height about 48px fit within its roughly 350px parent. DOM and screenshot inspection were used; stitched full-page captures contained repeated regions and are not portfolio screenshots.
- English desktop viewport 1280px: visible layout reviewed; document client/scroll widths both 1265px. Initial Japanese mobile client/scroll widths were both 375px, illustrating that no page-level horizontal overflow alone does not prove inner content is unclipped.
- Browser exact-text locator inspection timed out on the wrapped Japanese text; read-only DOM geometry confirmed the rendered element instead. No application failure was inferred from the locator timeout.
- Original Korean selection restored, page reloaded to clear demo state, temporary viewport override reset.

## Remaining work

Phase 9 is not wholly complete. Failure/timeout/circuit-open demo screens, exhaustive keyboard/screen-reader review, and complete language × asset × viewport coverage remain. Live browser/API integration and public data-display rights are still gated. Next session can start locally with localized failure-state presentation and tests, without AWS login.

Usage checkpoints: five-hour allowance 89%, 79%, then 10% remaining. New work stopped immediately at the final checkpoint to reserve cleanup. No reset credit was used.
