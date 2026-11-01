import assert from "node:assert/strict";
import test from "node:test";
import { SUPPORTED_LOCALES, SUPPORTED_SYMBOLS } from "../../../controller/src/contracts.js";
import { parseAcceptancePlan } from "../src/acceptance-plan.js";
import { runOneJobAcceptance } from "../src/signed-api-client.js";

test("acceptance selection preserves historical defaults and rejects malformed or bulk selectors", () => {
  assert.equal(parseAcceptancePlan([]).symbol, "QLD");
  assert.equal(parseAcceptancePlan([]).locale, "ko");
  for (const args of [
    ["--symbol"], ["--locale"], ["--symbol", "ALL"], ["--symbol", "QLD,VOO"],
    ["--locale", "en,ja,ko"], ["--locale", "EN"], ["--symbol", "qld"],
    ["--symbol", "TSLA", "--symbol", "QLD"], ["--locale", "en", "--locale", "ja"],
    ["--symbol", "--execute"], ["--count", "2"],
  ]) assert.throws(() => parseAcceptancePlan(args));
});

// Synthetic transport only: this matrix must never create real AWS jobs.
for (const operation of ["PRICE", "ANALYZE"] as const) {
  for (const symbol of SUPPORTED_SYMBOLS) {
    for (const locale of SUPPORTED_LOCALES) {
      test(`local acceptance selection ${operation}/${symbol}/${locale} stays one-job bounded`, async () => {
        const args = ["--operation", operation, "--symbol", symbol, "--locale", locale];
        const dry = parseAcceptancePlan(args);
        assert.equal(dry.mode, "dry-run");
        assert.deepEqual([dry.taskLaunchesMax, dry.providerCallsMax, dry.bedrockCallsMax, dry.apiCallsMax], [0, 0, 0, 0]);
        const live = parseAcceptancePlan([...args, "--execute", "--confirm-one-task", "--confirm-one-bedrock-call"]);
        assert.deepEqual([live.taskLaunchesMax, live.providerCallsMax, live.bedrockCallsMax, live.apiCallsMax], [1, 3, operation === "ANALYZE" ? 1 : 0, 18]);
        assert.equal(live.resultDisplayEnabled, false);
        if (operation === "ANALYZE") {
          assert.throws(() => parseAcceptancePlan([...args, "--execute", "--confirm-one-task"]), /confirm-one-bedrock-call/);
        }
        let posts = 0;
        let calls = 0;
        const jobId = `job_${"e".repeat(48)}`;
        const client = { async request(method: "GET" | "POST", path: string, body?: Record<string, unknown>) {
          calls += 1;
          if (path === "v1/health") return { circuit: "CLOSED", jobCreationEnabled: true };
          if (method === "POST") {
            posts += 1;
            assert.deepEqual(body, { operation, symbol, locale });
            return { jobId };
          }
          // An unavailable instrument remains a failure, never a fabricated success.
          return { jobId, status: symbol === "SPCX" ? "FAILED" : "SUCCEEDED" };
        } };
        const outcome = await runOneJobAcceptance(client, { operation: live.operation, symbol: live.symbol, locale: live.locale });
        assert.equal(posts, 1);
        assert.equal(calls, 3);
        assert.equal(outcome.apiCalls, 3);
        assert.equal(outcome.status, symbol === "SPCX" ? "FAILED" : "SUCCEEDED");
      });
    }
  }
}

test("direct callers cannot bypass selection validation before transport access", async () => {
  let calls = 0;
  const client = { async request() { calls += 1; return {}; } };
  for (const invalid of [
    { operation: "DELETE", symbol: "QLD", locale: "ko" },
    { operation: "ANALYZE", symbol: "ALL", locale: "ko" },
    { operation: "ANALYZE", symbol: "QLD", locale: "fr" },
  ]) {
    await assert.rejects(() => runOneJobAcceptance(client, invalid as Parameters<typeof runOneJobAcceptance>[1]), /allowlisted/);
  }
  assert.equal(calls, 0);
});
