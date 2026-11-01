import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import SearchHandoff from "../src/components/SearchHandoff.js";
import { buildSearchPrompt, CHATGPT_URL, copySearchPrompt } from "../src/data/search-handoff.js";
import messages from "../src/locales/search-handoff.json" with { type: "json" };
import type { SymbolCode, Locale, JobOperation } from "../src/types/market.js";

test("all 30 question combinations use only fixed selections and retain source/identity/freshness safeguards", t => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls++; throw Error("NETWORK_FORBIDDEN"); });
  const prompts = new Set<string>();
  for (const locale of ["en", "ja", "ko"] as const) {
    const text = messages[locale];
    assert.deepEqual(Object.keys(text).sort(), Object.keys(messages.en).sort());
    for (const symbol of ["VOO", "QLD", "TSLA", "SPCX", "GOOG"] as const) {
      for (const intent of ["PRICE", "ANALYZE"] as const) {
        const prompt = buildSearchPrompt(symbol, intent, locale);
        prompts.add(prompt);
        assert.ok(prompt.includes(symbol));
        assert.ok(prompt.includes(intent === "PRICE" ? text.priceTask : text.analysisTask));
        assert.match(prompt, /SPCX/); assert.match(prompt, /DATA_UNAVAILABLE/);
        assert.doesNotMatch(prompt, /\{symbol\}|\{intent\}|133\.11|api[_-]?key|arn:aws|https?:\/\//i);
        assert.ok(prompt.length < 2200);
      }
    }
  }
  assert.equal(prompts.size, 30); assert.equal(calls, 0);
  assert.match(messages.en.template, /timestamp and timezone/);
  assert.match(messages.ja.template, /日時・タイムゾーン/);
  assert.match(messages.ko.template, /시각과 시간대/);
  assert.match(messages.en.analysisTask, /daily reset/);
});

test("invalid symbol, locale, intent and injection-like input fail closed", () => {
  for (const bad of ["AAPL", "SPCX?secret=x", "__proto__", "", null, undefined]) {
    assert.throws(() => buildSearchPrompt(bad as SymbolCode, "PRICE", "en"), /SEARCH_SELECTION_INVALID/);
    assert.throws(() => buildSearchPrompt("VOO", bad as JobOperation, "en"), /SEARCH_SELECTION_INVALID/);
    assert.throws(() => buildSearchPrompt("VOO", "PRICE", bad as Locale), /SEARCH_SELECTION_INVALID/);
  }
});

test("copy writes exactly the visible question once and reports sync/async denial without exposing errors", async () => {
  const prompt = buildSearchPrompt("QLD", "ANALYZE", "ko"), writes: string[] = [];
  assert.equal(await copySearchPrompt(prompt, async value => { writes.push(value); }), true);
  assert.deepEqual(writes, [prompt]);
  assert.equal(await copySearchPrompt(prompt, async () => { throw Error("PRIVATE_BROWSER_ERROR"); }), false);
  assert.equal(await copySearchPrompt(prompt, () => { throw Error("MISSING_CLIPBOARD"); }), false);
});

test("initial render is a credential-free search companion, not quote fixtures or a submitted request", t => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls++; throw Error("NETWORK_FORBIDDEN"); });
  const html = renderToStaticMarkup(createElement(SearchHandoff));
  assert.match(html, /Ask better questions/);
  assert.match(html, /<textarea[^>]*readOnly/);
  assert.match(html, /href="https:\/\/chatgpt\.com\/" target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer"/);
  assert.match(html, /role="status" aria-live="polite"/);
  assert.match(html, /class="skip-link" href="#search-main-content"/);
  assert.match(html, /<main id="search-main-content" class="page-main search-main" tabindex="-1"/);
  assert.match(html, /SPCX · identity must be verified/);
  assert.match(html, /aria-label="VOO — Vanguard S&amp;P 500 ETF"/);
  assert.match(html, /aria-label="QLD — ProShares Ultra QQQ"/);
  assert.doesNotMatch(html, /589\.42|133\.11|<iframe|<form|RUNNING|Starting secure worker/);
  assert.equal(calls, 0);
  assert.equal(new URL(CHATGPT_URL).search, ""); assert.equal(new URL(CHATGPT_URL).hash, "");
});

test("search-only visual rules separate card labels and keep external action links readable", async () => {
  const css = await readFile(new URL("../src/styles/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.search-main \.asset-card\s*\{[^}]*display: flex;[^}]*flex-direction: column;[^}]*min-width: 0;/);
  assert.match(css, /\.search-main \.asset-name\s*\{[^}]*margin: 0;[^}]*overflow-wrap: anywhere;/);
  assert.match(css, /\.search-main a\.action-button, \.search-main a\.action-button:visited\s*\{\s*color: var\(--ink\);/);
  assert.match(css, /\.search-main \.action-row\s*\{\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
  assert.match(css, /@media \(max-width: 680px\)\s*\{\s*\.search-main \.action-row\s*\{\s*grid-template-columns: minmax\(0, 1fr\);/);
  assert.doesNotMatch(messages.en.copyFailed, /below/);
  assert.doesNotMatch(messages.ja.copyFailed, /下の/);
  assert.doesNotMatch(messages.ko.copyFailed, /아래/);
});

test("search UI has no fetch/SDK/session import and retains copy revision, fallback and local lab separation", async () => {
  const component = await readFile(new URL("../src/components/SearchHandoff.tsx", import.meta.url), "utf8");
  const prompt = await readFile(new URL("../src/data/search-handoff.ts", import.meta.url), "utf8");
  const entry = await readFile(new URL("../src/main.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(component + prompt, /fetch\(|XMLHttpRequest|WebSocket|sendBeacon|window\.open|document\.cookie|readText\(|@aws-sdk|from ["']openai/);
  assert.match(component, /revision === copyRevision\.current/);
  assert.match(component, /text\.copyFailed/);
  assert.match(component, /if \(lab\) return/);
  assert.match(component, /previousLab\.current !== lab/);
  assert.match(component, /\(lab \? labBackButton : labOpenButton\)\.current\?\.focus\(\)/);
  assert.match(entry, /import\.meta\.env\.DEV.*\? <MarketDashboard \/> : <SearchHandoff \/>/);
});
