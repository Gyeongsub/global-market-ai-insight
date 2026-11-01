import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { demoAnnouncement } from "../src/data/demo-announcement.js";
import { assets } from "../src/data/assets.js";

for (const locale of ["en", "ja", "ko"]) {
  const text = JSON.parse(readFileSync(new URL(`../src/locales/${locale}.json`, import.meta.url), "utf8"));
  test(`${locale} announces the selected asset and distinguishes price from analysis`, () => {
    for (const asset of assets) {
      const price = demoAnnouncement(text, asset.symbol, "SUCCEEDED", false, null);
      const analysis = demoAnnouncement(text, asset.symbol, "SUCCEEDED", true, null);
      assert.notEqual(price, analysis);
      for (const message of [price, analysis]) {
        assert.ok(message.includes(asset.symbol));
        assert.ok(message.length > 30);
        assert.doesNotMatch(message, /\{symbol\}/);
      }
      assert.equal(demoAnnouncement(text, asset.symbol, "QUEUED", false, null), `${asset.symbol}: ${text.queued}`);
      assert.equal(demoAnnouncement(text, asset.symbol, "QUEUED", false, null, true), `${asset.symbol}: ${text.submitting}`);
      assert.notEqual(text.submitting, text.queued);
      assert.equal(demoAnnouncement(text, asset.symbol, "RUNNING", false, null), `${asset.symbol}: ${text.running}`);
    }
  });
  test(`${locale} reports failures and ready state without announcing a success`, () => {
    for (const status of ["FAILED", "TIMED_OUT"] as const) {
      assert.equal(demoAnnouncement(text, "QLD", status, false, text.timeoutBody), `QLD: ${text.timeoutBody}`);
    }
    assert.equal(demoAnnouncement(text, "QLD", "IDLE", false, null), text.jobReady);
    for (const key of ["priceCompleteAnnouncement", "analysisCompleteAnnouncement"]) assert.equal((text[key].match(/\{symbol\}/g) ?? []).length, 1);
    assert.ok(text.priceDoneTitle.length > 0 && text.priceDoneBody.length > 30);
  });
}
