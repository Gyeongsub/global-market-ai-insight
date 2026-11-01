import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";
import catalog from "../../../shared/asset_catalog/assets.json" with { type: "json" };
import { ownerPage, OWNER_PAGE_JS } from "../src/page.js";
import { OWNER_PAGE_MESSAGES } from "../src/page-messages.js";

// Execute the application's fixed script with inert DOM doubles. This is not
// browser rendering, AWS integration or evidence of visual accessibility.
class Element {
  textContent = "";
  value = "en";
  children: Element[] = [];
  listeners = new Map<string, () => void>();
  replaceChildren() { this.children = []; }
  append(child: Element) { this.children.push(child); }
  addEventListener(name: string, listener: () => void) { this.listeners.set(name, listener); }
}
const fixture = () => ({ source: "local-test-fixture", observedAt: "2026-10-25T10:00:00.000Z", catalog: structuredClone(catalog), remainingMs: 10000 });
function harness() {
  const elements = new Map<string, Element>();
  const get = (id: string) => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id)!; };
  const windowEvents = new Map<string, (event?: unknown) => void>();
  const documentEvents = new Map<string, () => void>();
  let now = 100, removed = false, timerId = 0;
  const timers = new Map<number, { delay: number; fn: () => void }>();
  const calls: { url: string; options: RequestInit }[] = [];
  let resolve!: (value: unknown) => void, reject!: (error: unknown) => void;
  const pending = new Promise((yes, no) => { resolve = yes; reject = no; });
  const document = {
    title: "", documentElement: { lang: "en" }, getElementById: get,
    querySelector: () => ({ content: "a".repeat(64), remove: () => { removed = true; } }),
    createElement: () => new Element(),
    addEventListener: (name: string, listener: () => void) => documentEvents.set(name, listener),
  };
  const context = {
    document, window: { addEventListener: (name: string, listener: (event?: unknown) => void) => windowEvents.set(name, listener) },
    performance: { now: () => now }, AbortController,
    setTimeout: (fn: () => void, delay: number) => { timers.set(++timerId, { delay, fn }); return timerId; },
    clearTimeout: (id: number) => timers.delete(id),
    fetch: (url: string, options: RequestInit) => { calls.push({ url, options }); return pending; },
  };
  runInNewContext(OWNER_PAGE_JS, context, { timeout: 1000 });
  const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
  return {
    get, document, calls, timers, windowEvents, documentEvents, flush,
    removed: () => removed, setNow: (value: number) => { now = value; },
    select: (locale: string) => { get("language").value = locale; get("language").listeners.get("change")!(); },
    load: async (value: unknown = fixture()) => { resolve({ ok: true, json: async () => value }); await flush(); },
    fail: async () => { reject(Error("PRIVATE_SENTINEL")); await flush(); },
  };
}

test("three fixed dictionaries have identical keys and HTML has a labeled selector", () => {
  for (const locale of ["en", "ja", "ko"] as const) {
    assert.deepEqual(Object.keys(OWNER_PAGE_MESSAGES[locale]).sort(), Object.keys(OWNER_PAGE_MESSAGES.en).sort());
    assert.ok(Object.values(OWNER_PAGE_MESSAGES[locale]).every(value => value.length > 0 && !value.includes("<")));
  }
  const html = ownerPage("a".repeat(64));
  assert.match(html, /label id="language-label" for="language"/);
  assert.match(html, /option value="ja" lang="ja"/); assert.match(html, /option value="ko" lang="ko"/);
  assert.doesNotMatch(OWNER_PAGE_JS, /localStorage|sessionStorage|document\.cookie|innerHTML|setInterval/);
});

test("language changes translate static and observation copy without requests or expiry renewal", async () => {
  const page = harness();
  assert.equal(page.removed(), true);
  assert.equal(page.document.documentElement.lang, "en");
  await page.load();
  assert.equal(page.calls.length, 1);
  assert.equal(page.calls[0]!.url, "/bridge/observation");
  assert.equal(page.calls[0]!.options.method, "POST");
  assert.equal(page.calls[0]!.options.credentials, "omit");
  const timer = [...page.timers.entries()];
  assert.equal(timer.length, 1); assert.equal(timer[0]![1].delay, 10000);
  for (const locale of ["ja", "ko", "en"] as const) {
    page.select(locale);
    const copy = OWNER_PAGE_MESSAGES[locale];
    assert.equal(page.document.documentElement.lang, locale); assert.equal(page.document.title, copy.title);
    assert.equal(page.get("status").textContent, copy.loaded);
    assert.equal(page.get("source").textContent, copy.fixtureSource);
    assert.equal(page.get("health").textContent, copy.safeHealth);
    assert.equal(page.get("observed").textContent, fixture().observedAt);
    assert.equal(page.get("assets").children.length, 5);
    assert.deepEqual([...page.timers.entries()], timer);
    assert.equal(page.calls.length, 1);
  }
  page.select("__proto__"); assert.equal(page.document.documentElement.lang, "en");
});

test("AWS source is distinct in every language; pending language is preserved on completion", async () => {
  const page = harness(); page.select("ko");
  assert.equal(page.get("status").textContent, OWNER_PAGE_MESSAGES.ko.loading);
  await page.load({ ...fixture(), source: "aws-owner-read-only" });
  for (const locale of ["ko", "ja", "en"] as const) {
    page.select(locale); assert.equal(page.get("source").textContent, OWNER_PAGE_MESSAGES[locale].awsSource);
  }
  assert.equal(page.calls.length, 1);
});

test("fixed deadline subtracts network time and delayed background expiry cannot be extended", async () => {
  for (const wake of ["language", "focus", "visibilitychange"] as const) {
    const page = harness(); page.setNow(2100); await page.load();
    assert.equal([...page.timers.values()][0]!.delay, 8000);
    page.setNow(10100);
    if (wake === "language") page.select("ko");
    else if (wake === "focus") page.windowEvents.get("focus")!();
    else page.documentEvents.get("visibilitychange")!();
    assert.equal(page.get("assets").children.length, 0); assert.equal(page.get("observed").textContent, "—");
    assert.equal(page.timers.size, 0); assert.equal(page.calls.length, 1);
    page.select("ja"); assert.equal(page.get("status").textContent, OWNER_PAGE_MESSAGES.ja.closed);
    assert.equal(page.get("source").textContent, "—");
  }
});

test("page hide, cached restoration and expiry erase data, never refetch or resurrect", async () => {
  for (const close of ["pagehide", "pageshow", "timer"] as const) {
    const page = harness(); await page.load();
    if (close === "timer") [...page.timers.values()][0]!.fn();
    else page.windowEvents.get(close)!({ persisted: true });
    assert.equal(page.get("assets").children.length, 0); assert.equal(page.timers.size, 0);
    assert.equal(page.calls[0]!.options.signal!.aborted, true);
    page.select("ko"); assert.equal(page.get("status").textContent, OWNER_PAGE_MESSAGES.ko.closed);
    assert.equal(page.calls.length, 1); assert.equal(page.get("health").textContent, "—");
  }
});

test("closing pending request or fetch timeout rejects late uncooperative completion", async () => {
  for (const close of ["pagehide", "timeout"] as const) {
    const page = harness();
    if (close === "timeout") [...page.timers.values()][0]!.fn();
    else page.windowEvents.get("pagehide")!();
    await page.load();
    assert.equal(page.get("assets").children.length, 0);
    assert.equal(page.get("status").textContent, OWNER_PAGE_MESSAGES.en.closed);
    assert.equal(page.timers.size, 0); assert.equal(page.calls.length, 1);
  }
});

test("failures use fixed localized copy; invalid TTL/source and reversed clock fail closed", async () => {
  const failed = harness(); failed.select("ja"); await failed.fail();
  assert.equal(failed.get("status").textContent, OWNER_PAGE_MESSAGES.ja.closed);
  for (const input of [{ ...fixture(), source: "unknown" }, ...[0, -1, 300001, 1.5].map(remainingMs => ({ ...fixture(), remainingMs }))]) {
    const page = harness(); await page.load(input);
    assert.equal(page.get("assets").children.length, 0); assert.equal(page.timers.size, 0);
  }
  const reversed = harness(); reversed.setNow(50); await reversed.load();
  assert.equal(reversed.get("status").textContent, OWNER_PAGE_MESSAGES.en.closed);
  assert.equal(reversed.timers.size, 0);
});
