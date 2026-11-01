import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { demoErrorCode, demoErrorPresentation } from "../src/data/demo-error.js";
import { sessionDemoStep } from "../src/data/contract-demo.js";
import { demoAnnouncement } from "../src/data/demo-announcement.js";
import DemoErrorNotice from "../src/components/DemoErrorNotice.js";
import schema from "../../shared/schemas/error.schema.json" with { type: "json" };
import en from "../src/locales/en.json" with { type: "json" };
import ja from "../src/locales/ja.json" with { type: "json" };
import ko from "../src/locales/ko.json" with { type: "json" };
import type { PublicJob } from "../src/api/jobs.js";

const request = { operation: "ANALYZE", symbol: "QLD", locale: "en" } as const;
const codes = [...schema.properties.error.properties.code.enum, "INVALID_RESPONSE", "REQUEST_FAILED", "TIMED_OUT"];

test("every public error and local transport failure has fixed three-language presentation", () => {
  for (const text of [en, ja, ko]) for (const code of codes) {
    const view = demoErrorPresentation(code, text);
    assert.equal(view.code, code); assert.ok(view.title.length > 3); assert.ok(view.body.length > 10);
    assert.match(view.recovery, /no automatic retry|自動再試行|자동 재시도/i);
    const step = sessionDemoStep({ status: code === "TIMED_OUT" ? "TIMED_OUT" : "FAILED", request,
      code, remoteMayContinue: true });
    assert.equal(step?.error, code); assert.equal(step?.hasInsight, false); assert.equal(step?.job, undefined);
    const html = renderToStaticMarkup(createElement(DemoErrorNotice, { error: code, text }));
    assert.ok(html.includes(code)); assert.ok(html.includes(view.title)); assert.ok(html.includes(view.body));
    assert.doesNotMatch(html, /<a\b|<button\b|<script\b/); // No embedded retry, link or script action.
  }
});

test("unknown codes, prototype keys and private objects never select error prose or leak to HTML", () => {
  const privateValue = '<img src="https://private.invalid" onerror="PRIVATE_SENTINEL">';
  const inputs: unknown[] = [undefined, null, false, 1, {}, ["MODEL_ERROR"], "__proto__", "constructor", "toString",
    privateValue, { code: "MODEL_ERROR", message: privateValue }, { toString() { throw Error("must not coerce"); } }];
  for (const value of inputs) for (const text of [en, ja, ko]) {
    assert.equal(demoErrorCode(value), "REQUEST_FAILED");
    const html = renderToStaticMarkup(createElement(DemoErrorNotice, { error: value, text }));
    assert.ok(html.includes(text.requestErrors.requestFailed.title));
    assert.doesNotMatch(html, /PRIVATE_SENTINEL|private\.invalid|<img|<script|constructor|__proto__/);
  }
});

test("a result-redacted success announces unavailable, never completed price or AI insight", () => {
  const job: PublicJob = { ...request, jobId: `job_${"a".repeat(32)}`, status: "SUCCEEDED", schemaVersion: "1.0.0",
    createdAt: "2026-10-24T00:00:00.000Z", updatedAt: "2026-10-24T00:00:00.000Z", expiresAt: "2026-10-25T00:00:00.000Z" };
  const step = sessionDemoStep({ status: "SUCCEEDED", request, job, resultAvailable: false });
  assert.ok(step); assert.equal(step.error, "DATA_UNAVAILABLE");
  for (const text of [en, ja, ko]) {
    const message = demoErrorPresentation(step.error, text);
    assert.equal(demoAnnouncement(text, "QLD", step.status, step.hasInsight, message.body), `QLD: ${text.dataUnavailableBody}`);
    assert.notEqual(message.body, text.priceDoneBody);
  }
});

test("failure categories remain distinct and never assert remote billing or worker termination", () => {
  for (const text of [en, ja, ko]) {
    const categories = ["DATA_UNAVAILABLE", "PROVIDER_ERROR", "MODEL_ERROR", "RATE_LIMITED", "INVALID_RESPONSE", "REQUEST_FAILED"];
    assert.equal(new Set(categories.map(code => demoErrorPresentation(code, text).title)).size, categories.length);
    assert.match(text.requestFailureRecovery, /billing|課金|과금/);
    assert.match(text.requestErrors.launch.body, /billing|課金|과금/);
    assert.match(text.recoveryHint, /SPCX/);
    assert.match(text.recoveryHint, /unverified|未確認|검증되지/);
  }
});
