# Local UI observations — 2026-10-23 Tokyo

Chrome, fixed 127.0.0.1:4173 preview, no provider/Bedrock/AWS connection. All
visible prices/results were labeled synthetic fixtures. No public hosting.
This supplements, not replaces, automated tests or real cloud acceptance.

Observed through supported browser controls and read-only DOM inspection:

- Original Korean preference and all five asset buttons appeared.
- English circuit scenario immediately displayed CIRCUIT_OPEN, no job started,
  no real setting changed, no automatic retry.
- English timeout showed queued state and disabled asset/action/scenario controls,
  then TIMED_OUT and explicit warning that a waiting timeout does not prove a
  real worker stopped. No duplicate-click or real cancellation acceptance claim.
- SPCX unavailable scenario returned DATA_UNAVAILABLE with no substitute/invented
  result; visible old prices remained explicitly identified as demo fixtures.
- Japanese selection survived reload. Reload correctly reset transient asset/job
  state; only locale persistence is required.
- Keyboard Space selected QLD; Enter started Analyze; Japanese queued-to-success
  mock flow showed daily 2x leverage, path dependence and increased downside risk.
- Japanese skip-link Enter focused MAIN/main-content. Keyboard page scrolling worked.
- Original Korean preference was restored and survived reload; document lang was ko.
- Captured browser error-log entries: zero. This is not a full console/network audit.

One normal Korean viewport screenshot was saved in ignored outputs. Full-page
Japanese capture timed out; one normal-viewport fallback timed out too. These
failures are retained, not treated as successful screenshot/visual evidence.
Only the first Korean screenshot exists. No viewport override, raw hidden state,
DOM mutation or alternate native/terminal/browser-control mechanism was used.
Complete responsive/visual/accessibility and all-symbol/locale E2E remain open.

The native summary was exposed differently by AX versus DOM. A no-match button
locator was abandoned after fresh observation; the visible disclosure was opened
normally, then its labeled native select used. No hidden option was force-clicked.

The preview had a five-minute automatic close and was explicitly stopped after
testing; it emitted previewClosed true. The outer terminal reported exit 1 after
Ctrl+C, so the message alone is not independent zero-residue proof. The owned
test tab closed. Final process/listener inventory is recorded in the safe-stop
record. Screenshots are not committed or publication-approved.

Web chunk before and after the later environment-only guard changes remained
223,076 bytes, SHA-256
`c83e68f1495dda861b537837d701652ab700d40bbffb666b1770457505ece1c3`.
No new UI behavior is inferred from a different build/source fingerprint.
