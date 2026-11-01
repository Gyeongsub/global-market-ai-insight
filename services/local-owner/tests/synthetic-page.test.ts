import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { SYNTHETIC_JS } from "../src/synthetic-page.js";
import { SYNTHETIC_COPY } from "../src/synthetic-copy.js";

class Element {
  textContent = ""; value = "en"; disabled = false; hidden = false;
  onclick?: () => Promise<void>; onchange?: () => void;
  children: Element[] = [];
  replaceChildren() { this.children = []; }
  append(child: Element) { this.children.push(child); }
}
function state(status = "READY", locale = "en", remainingMs = 300000) {
  return { state: status, attempts: status === "READY" ? 0 : 1, locale, remainingMs,
    dataOrigin: "synthetic", quote: {}, region: "ap-northeast-1", modelId: "amazon.nova-lite-v1:0" };
}
function success(locale = "en") {
  return { ...state("SUCCEEDED", locale, 290000), completedAt: "2026-10-26T10:00:00.000Z", usage: { inputTokens: 895, outputTokens: 88, totalTokens: 983 },
    result: { kind: "ANALYSIS", symbol: "QLD", locale, modelId: "amazon.nova-lite-v1:0", dataAsOf: "2026-01-01T00:00:00.000Z", promptVersion: "grounded-v1",
      summary: "Synthetic summary", observations: ["Invented price"], opportunities: [], risks: ["Risk"], specialConsiderations: ["Synthetic source"], uncertainty: "No forecast", disclaimer: "Educational only" } };
}
function harness() {
  const elements = new Map<string, Element>(), events = new Map<string, (event?: unknown) => void>();
  const get = (id: string) => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id)!; };
  let now = 0, removed = 0, next = 0;
  const timers = new Map<number, { callback: () => void; delay: number }>();
  const calls: { url: string; options: RequestInit; resolve: (response: unknown) => void; reject: (error: unknown) => void }[] = [];
  const doc = { title: "", documentElement: { lang: "en" }, getElementById: get, createElement: () => new Element(),
    querySelector: () => ({ content: "a".repeat(64), remove: () => { removed++; } }),
    addEventListener: (name: string, callback: () => void) => events.set(name, callback) };
  runInNewContext(SYNTHETIC_JS, { document: doc, window: { addEventListener: (name: string, cb: (event?: unknown) => void) => events.set(name, cb) },
    performance: { now: () => now }, AbortController,
    setTimeout: (callback: () => void, delay: number) => { timers.set(++next, { callback, delay }); return next; },
    clearTimeout: (id: number) => timers.delete(id),
    fetch: (url: string, options: RequestInit) => new Promise((resolve, reject) => calls.push({ url, options, resolve, reject })),
  }, { timeout: 1000 });
  const flush = async () => { for (let i = 0; i < 25; i++) await Promise.resolve(); };
  return { get, doc, calls, events, timers, flush, removed: () => removed, now: (v: number) => { now = v; },
    click: (id: string) => { void get(id).onclick!(); },
    select: (locale: string) => { get("language").value = locale; get("language").onchange!(); },
    respond: async (i: number, body: unknown, ok = true) => { calls[i]!.resolve({ ok, json: async () => body }); await flush(); },
    reject: async (i: number) => { calls[i]!.reject(Error("PRIVATE_SENTINEL")); await flush(); } };
}

test("bootstrap only reads status; all headings/actions/status messages localize without a model call", async () => {
  const h = harness(); assert.equal(h.calls.length, 1); assert.equal(h.calls[0]!.url, "/bridge/status"); assert.equal(h.removed(), 1);
  await h.respond(0, state());
  for (const locale of ["en", "ja", "ko"] as const) {
    assert.deepEqual(Object.keys(SYNTHETIC_COPY[locale]).sort(), Object.keys(SYNTHETIC_COPY.en).sort());
    h.select(locale); assert.equal(h.get("language-label").textContent, SYNTHETIC_COPY[locale].language);
    assert.equal(h.get("input-title").textContent, SYNTHETIC_COPY[locale].input);
    assert.equal(h.get("status").textContent, SYNTHETIC_COPY[locale].ready); assert.equal(h.doc.title, SYNTHETIC_COPY[locale].title);
  }
  assert.equal(h.calls.length, 1); assert.equal(h.get("run").disabled, false);
});
test("one paid click; repeats ignored; refresh preserves validated result and cannot re-enable a used allowance", async () => {
  const h = harness(); await h.respond(0, state()); h.select("ko"); h.click("run"); h.click("run");
  assert.equal(h.calls.length, 2); assert.equal(h.calls[1]!.url, "/bridge/start/ko");
  assert.equal(h.calls[1]!.options.credentials, "omit"); await h.respond(1, success("ko"));
  assert.equal(h.get("result").hidden, false); assert.match(h.get("usage").textContent, /895/);
  assert.equal(h.get("run").disabled, true); h.click("refresh"); await h.respond(2, state());
  assert.equal(h.get("run").disabled, true); h.click("run"); assert.equal(h.calls.length, 3);
});
test("close acknowledges server closure only on an exact positive reply", async () => {
  for (const reply of ["network-error", { closed: false }, { closed: true, unexpected: "PRIVATE_SENTINEL" }, { closed: true }]) {
    const h = harness(); await h.respond(0, state()); h.click("close"); h.click("close"); assert.equal(h.calls.length, 2);
    assert.equal(h.get("status").textContent, SYNTHETIC_COPY.en.closing);
    if (reply === "network-error") await h.reject(1); else await h.respond(1, reply);
    const confirmed = typeof reply === "object" && Object.keys(reply).length === 1 && reply.closed;
    assert.equal(h.get("status").textContent, confirmed ? SYNTHETIC_COPY.en.closed : SYNTHETIC_COPY.en.unconfirmed);
    assert.equal(h.get("run").disabled, true); assert.equal(h.get("close").disabled, true); assert.equal(h.timers.size, 0);
  }
});
test("close during analysis aborts old fetch, clears result, ignores late success and retains localized outcome", async () => {
  const h = harness(); await h.respond(0, state()); h.click("run"); h.click("close");
  assert.equal(h.calls[1]!.options.signal!.aborted, true); await h.respond(2, { closed: true }); await h.respond(1, success());
  assert.equal(h.get("result").hidden, true); assert.equal(h.get("analysis").children.length, 0);
  h.select("ja"); assert.equal(h.get("status").textContent, SYNTHETIC_COPY.ja.closed);
  h.click("refresh"); h.click("run"); assert.equal(h.calls.length, 3);
});
test("network failure and malformed results never leak remote prose or re-enable paid start", async () => {
  for (const invalid of [{ ...success(), modelId: "PRIVATE_SENTINEL" }, { ...success(), dataOrigin: "live" },
    { ...success(), usage: { inputTokens: 5, outputTokens: 90000, totalTokens: 90005 } }, { ...success(), secret: "PRIVATE_SENTINEL" },
    { ...success(), remainingMs: Infinity }, { ...success(), result: null }]) {
    const h = harness(); await h.respond(0, state()); h.click("run"); await h.respond(1, invalid);
    assert.equal(h.get("result").hidden, true); assert.equal(h.get("status").textContent, SYNTHETIC_COPY.en.failed);
    assert.equal(h.get("run").disabled, true); assert.doesNotMatch(h.get("status").textContent, /PRIVATE_SENTINEL/);
  }
  const h = harness(); await h.respond(0, state()); h.click("run"); await h.reject(1); h.click("run"); assert.equal(h.calls.length, 2);
});
test("slow response never extends deadline; resume after expiry clears data without claiming server confirmation", async () => {
  const h = harness(); h.now(20000); await h.respond(0, state("READY", "en", 290000));
  assert.equal([...h.timers.values()][0]!.delay, 270000);
  h.now(290001); h.events.get("focus")!();
  assert.equal(h.get("status").textContent, SYNTHETIC_COPY.en.expired); assert.equal(h.timers.size, 0);
  h.click("run"); assert.equal(h.calls.length, 1);
});
test("invalid/reversed clocks, tab hide and BFCache restore discard state and ignore late results", async () => {
  for (const event of ["pagehide", "pageshow", "focus", "visibilitychange"]) {
    const h = harness(); await h.respond(0, state()); h.click("run");
    if (event === "focus" || event === "visibilitychange") h.now(NaN);
    h.events.get(event)!({ persisted: true }); await h.respond(1, success());
    assert.equal(h.get("result").hidden, true); assert.equal(h.get("run").disabled, true); assert.equal(h.timers.size, 0);
    assert.equal(h.calls[1]!.options.signal!.aborted, true);
    assert.notEqual(h.get("status").textContent, SYNTHETIC_COPY.en.closed);
  }
});
test("a noncooperative fetch is bounded and cannot overwrite the error after timeout", async () => {
  const h = harness(); await h.respond(0, state()); h.click("run");
  [...h.timers.values()].find(t => t.delay === 25000)!.callback(); await h.flush();
  assert.equal(h.get("status").textContent, SYNTHETIC_COPY.en.failed); assert.equal(h.calls[1]!.options.signal!.aborted, true);
  await h.respond(1, success()); assert.equal(h.get("result").hidden, true); assert.equal(h.get("status").textContent, SYNTHETIC_COPY.en.failed);
});
