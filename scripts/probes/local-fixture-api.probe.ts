// Opt-in actual loopback matrix; never part of routine unit checks or AWS acceptance.
import assert from "node:assert/strict";
import test from "node:test";
import { MarketApiClient } from "../../frontend/src/api/jobs.js";
import { createJobSession } from "../../frontend/src/api/job-session.js";
import { startLocalFixtureApi, LOCAL_FIXTURE_LIMITS } from "../../services/local-demo/src/fixture-api.js";

test("all 30 local HTTP symbol/locale/operation paths and finite session ceilings", { timeout: 90_000 }, async t => {
  const app = await startLocalFixtureApi(0), client = new MarketApiClient(app.origin);
  let active: ReturnType<typeof createJobSession> | undefined, normalCases = 0;
  t.signal.addEventListener("abort", () => { active?.dispose(); void app.close(); }, { once: true });
  t.mock.method(console, "warn", () => {});
  try {
    for (const symbol of ["VOO", "QLD", "TSLA", "SPCX", "GOOG"] as const)
      for (const locale of ["en", "ja", "ko"] as const) for (const operation of ["PRICE", "ANALYZE"] as const) {
        active = createJobSession(client, () => {}); await active.start({ symbol, locale, operation });
        const state = active.getState(); if (state.status !== "SUCCEEDED") assert.fail("Local fixture matrix failed.");
        assert.equal(state.resultAvailable, true); assert.equal(state.job.symbol, symbol); assert.equal(state.job.locale, locale);
        assert.equal(state.job.result?.symbol, symbol);
        if (operation === "ANALYZE") assert.equal(state.job.result?.locale, locale);
        assert.doesNotMatch(JSON.stringify(state.job), /taskArn|idempotencyKeyHash|requestHash/);
        normalCases++;
      }
    for (let index = normalCases; index < LOCAL_FIXTURE_LIMITS.jobs; index++) {
      active = createJobSession(client, () => {}); await active.start({ symbol: "VOO", locale: "en", operation: "PRICE" });
      assert.equal(active.getState().status, "SUCCEEDED");
    }
    active = createJobSession(client, () => {}); await active.start({ symbol: "VOO", locale: "en", operation: "PRICE" });
    const rejected = active.getState(); if (rejected.status !== "FAILED") assert.fail(); assert.equal(rejected.code, "RATE_LIMITED");
    assert.equal(app.snapshot().launches, 32);
    while (app.snapshot().requests < LOCAL_FIXTURE_LIMITS.requests) {
      const response = await fetch(app.origin + "/v1/health"); assert.equal(response.status, 200); await response.arrayBuffer();
    }
    const capped = await fetch(app.origin + "/v1/health"); assert.equal(capped.status, 429); await capped.arrayBuffer();
  } finally { active?.dispose(); await app.close(); }
  const snapshot = app.snapshot(); assert.equal(snapshot.listening, false); assert.equal(snapshot.jobsRetained, 0); assert.equal(snapshot.timersRetained, 0);
  console.log(JSON.stringify({ mode: "local-fixture-http-matrix", normalCases, jobCeilingVerified: true, requestCeilingVerified: true,
    ...snapshot, liveAwsAuthorizationVerified: false, productionDashboardConnected: false, publicationPerformed: false }));
});
