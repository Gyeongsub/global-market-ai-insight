# Direct local gate budget — 2026-10-14

The direct checker shares the durable wrappers' unchanged 360,000 ms ceiling.
Every step receives only the remaining monotonic budget, not a new six minutes.
Exhaustion before/after the final step fails. The observer rejects invalid or
extended budgets and invalid clocks, hides windows and forcibly terminates its
own timed-out child. A zero exit with an invalid duration is not verified success.
Args/environment/raw output/exception/paths remain outside numeric receipts.

Tests cover decreasing/exhausted/invalid budgets, propagation of the remainder,
and a real deliberately hanging Node child with a SIGTERM handler. It was stopped
and failed without retry. This is not proof of arbitrary descendant/temp cleanup;
independent closure remains mandatory. No test or deadline is dropped/relaxed.
One local-wire zero-action plan makes 76 steps; four test groups and two-file
concurrency remain. No cloud/provider/model call, workflow or upload introduced.

## Earlier revision, not borrowed for these later changes

After early loading was corrected, schema-version 2 receipt
`outputs/local-gates/66684741-bcbb-4412-bb24-e57735af430a.json` passed its exact
464-file/4,834,066-byte source, SHA-256
`31e334bed51e86fec5e913fbc0cefa4301b2f5f7f61b0ee4234bf41ac94d1b3c`.
Before/after source matched. All 75 steps and 983 tests (982 pass/one existing
Windows privilege skip) completed at 298,183 ms; 33 loopback checks and server/
fixture closure passed. Current installation only, not fresh install/clone/CI.

The first timeout stays a separate failed revision. Deadline/wire changes need
their own final whole/frozen-install proof. No earlier pass is promoted to them.

Node documents synchronous timeout waiting when SIGTERM is handled. A real test
on installed Node 24.19.0 verifies the stronger signal here; future hosts need
their own checks. [Node reference](https://nodejs.org/api/child_process.html).
