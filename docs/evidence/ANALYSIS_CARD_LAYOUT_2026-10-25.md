# Local structured-analysis card layout — 2026-10-25

The actual local HTTP browser showed a retained two-column CSS rule assigning
the current single body child to a 30px first column. The Korean VOO card was
440.73px wide but its entire heading/list body only 30px wide. This was observed
in DOM layout, not inferred solely from a source regex or a screenshot.

The rule now has one `minmax(0, 1fr)` column, and analysis content inherits
`overflow-wrap: anywhere`. No text is hidden, truncated or replaced. At the same
desktop viewport the body became 410.60px. At a measured 320 CSS-pixel viewport,
Korean/English VOO and Japanese QLD bodies measured 197.47px with card client and
scroll widths both 225px; root client and scroll widths were both 299px. The
Japanese risk/special-considerations lists remained present. This is selected
DOM/layout coverage, not a full visual or screen-reader accessibility audit.

A targeted new CSS regression failed on the old rule and passed after the fix.
Additional renderer tests cover all 15 fixture identities, maximum contract-length
prose and 20 list items, escaped markup in seven fields, and no partial rendering
for invalid/cross-request/private-field results. The combined renderer/contract
suite passed nine tests; the current production build and 13 artifact tests also
passed. This CSS/test source subsequently passed the current-installation gate:
90 steps, 1,444 tests (1,443 pass / one existing privilege skip), 273,381 ms under
the unchanged six-minute bound, and 33 loopback HTTP checks. Receipt
`abc57fa9-d8a4-4d8f-87dc-43825aeb2269.json` completed 2026-10-24T23:17:24.749Z,
648 files / 6,108,180 bytes, fingerprint
`81c7599effcebff190ca91c7b301f519732bc40ea77dfd6fee5a1ecfeb60ba54`.
Current-source comparison passed before later schema edits; independent inventory
at 23:17:42.2840159Z found all ten residue counts zero, two assistant exclusions
and two empty parent directories retained. This gate reused the current installation
and made no external network requests; it is not a new frozen-install proof.
The 1,439-test controller clone receipt and this layout gate have distinct scopes.

The finite local API recorded 16 requests / three synthetic launches, zero active
jobs, retained jobs and timers at explicit stop. Both children exited, the owned
tab closed and viewport override reset. AWS/provider/model calls were zero.
No dependency, deployment, auth, IAM, data rights, billing policy or publication
change was made. [Earlier controller proof](LOCAL_ERROR_PRESENTATION_2026-10-25.md).
