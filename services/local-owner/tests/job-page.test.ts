import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { OWNER_JOB_PREVIEW_JS, OWNER_JOB_COPY } from "../src/job-page.js";

class Element {
  textContent = ""; value = "en"; disabled = false;
  listeners = new Map<string, () => void>();
  addEventListener(name: string, callback: () => void) { this.listeners.set(name, callback); }
}
function harness(state = "READY") {
  const elements = new Map<string, Element>(), events = new Map<string, (event?: unknown) => void>();
  const get = (id: string) => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id)!; };
  let now = 0, removed = 0, next = 0;
  const timers = new Map<number, { callback: () => void; delay: number }>();
  const calls: { url: string; options: RequestInit; resolve: (response: unknown) => void; reject: (error: unknown) => void }[] = [];
  const doc = { title: "", documentElement: { lang: "en" }, getElementById: get,
    querySelector: (selector: string) => ({ content: selector.includes("local-capability") ? "a".repeat(64) :
      JSON.stringify({ state, request: { operation: "PRICE", symbol: "QLD", locale: "en" }, remainingMs: 120000 }), remove: () => { removed++; } }),
    addEventListener: (name: string, callback: () => void) => events.set(name, callback),
  };
  runInNewContext(OWNER_JOB_PREVIEW_JS, { document: doc, window: { addEventListener: (name: string, callback: (event?: unknown) => void) => events.set(name, callback) },
    performance: { now: () => now }, AbortController,
    setTimeout: (callback: () => void, delay: number) => { timers.set(++next, { callback, delay }); return next; },
    clearTimeout: (id: number) => timers.delete(id),
    fetch: (url: string, options: RequestInit) => new Promise((resolve, reject) => calls.push({ url, options, resolve, reject })),
  }, { timeout: 1000 });
  const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
  return { get, doc, calls, events, timers, flush, removed: () => removed, setNow: (value: number) => { now = value; },
    click: (id: string) => get(id).listeners.get("click")!(),
    select: (locale: string) => { get("language").value = locale; get("language").listeners.get("change")!(); },
    respond: async (index: number, status: number, body: unknown = {}) => { calls[index]!.resolve({ status, json: async () => body }); await flush(); },
  };
}

test("synthetic page has zero bootstrap calls, three languages, fixed intent and no deadline renewal", () => {
  const h = harness(); assert.equal(h.calls.length, 0); assert.equal(h.removed(), 2);
  assert.equal(h.get("start").disabled, false); assert.equal(h.get("poll").disabled, true);
  assert.equal(h.get("intent").textContent, "PRICE · QLD · en");
  const timers = [...h.timers.entries()];
  for (const locale of ["ja", "ko", "en"] as const) {
    h.select(locale); assert.equal(h.doc.documentElement.lang, locale);
    assert.equal(h.get("fixture").textContent, OWNER_JOB_COPY[locale].source);
    assert.equal(h.get("state").textContent, OWNER_JOB_COPY[locale].ready);
    assert.equal(h.get("intent").textContent, "PRICE · QLD · en");
    assert.deepEqual([...h.timers.entries()], timers); assert.equal(h.calls.length, 0);
  }
});

test("one explicit click dispatches exactly once; polling is manual and never follows response URLs", async () => {
  const h = harness(); h.click("start"); h.click("start");
  assert.equal(h.calls.length, 1); assert.equal(h.calls[0]!.url, "/bridge/job/start");
  assert.equal(h.calls[0]!.options.credentials, "omit"); assert.equal(h.calls[0]!.options.method, "POST");
  await h.respond(0, 202, { statusUrl: "https://evil.invalid/PRIVATE_SENTINEL" });
  assert.equal(h.calls.length, 1); assert.equal(h.get("start").disabled, true); assert.equal(h.get("poll").disabled, false);
  h.click("start"); assert.equal(h.calls.length, 1);
  h.click("poll"); assert.equal(h.calls[1]!.url, "/bridge/job/status");
  await h.respond(1, 200, { status: "RUNNING" }); assert.equal(h.get("state").textContent, OWNER_JOB_COPY.en.running);
  h.click("poll"); await h.respond(2, 409, { error: { code: "OWNER_JOB_POLL_TOO_EARLY" } });
  assert.equal(h.get("state").textContent, OWNER_JOB_COPY.en.early);
  h.click("poll"); await h.respond(3, 200, { status: "SUCCEEDED" });
  assert.equal(h.get("state").textContent, OWNER_JOB_COPY.en.succeeded); assert.equal(h.get("poll").disabled, true);
  h.click("poll"); assert.equal(h.calls.length, 4);
});

test("refresh bootstrap state prevents a second job and never polls automatically", () => {
  for (const state of ["SUBMITTING", "ACCEPTED", "TERMINAL", "UNVERIFIED", "CLOSED"]) {
    const h = harness(state); assert.equal(h.calls.length, 0); assert.equal(h.get("start").disabled, true);
    h.click("start"); assert.equal(h.calls.length, 0);
    assert.equal(h.get("poll").disabled, state !== "ACCEPTED");
  }
  const terminal = harness("TERMINAL");
  for (const locale of ["en", "ja", "ko"] as const) {
    terminal.select(locale);
    assert.equal(terminal.get("state").textContent, OWNER_JOB_COPY[locale].terminal);
    assert.notEqual(terminal.get("state").textContent, OWNER_JOB_COPY[locale].succeeded);
  }
});

test("failed and timed-out metadata use fixed localized outcomes without retry or remote prose", async () => {
  for (const [status, key] of [["FAILED", "failed"], ["TIMED_OUT", "timedOut"]] as const) {
    const h = harness(); h.click("start"); await h.respond(0, 202); h.click("poll");
    await h.respond(1, 200, { status, message: "PRIVATE_SENTINEL" });
    for (const locale of ["en", "ja", "ko"] as const) {
      h.select(locale); assert.equal(h.get("state").textContent, OWNER_JOB_COPY[locale][key]);
      assert.equal(h.get("poll").disabled, true); assert.equal(h.get("start").disabled, true);
    }
    h.click("start"); h.click("poll"); assert.equal(h.calls.length, 2);
  }
});

test("invalid or reversed monotonic clock closes the page without transport", () => {
  for (const now of [NaN, Infinity, -1]) {
    const h = harness(); h.setNow(now); h.click("start");
    assert.equal(h.calls.length, 0); assert.equal(h.get("state").textContent, OWNER_JOB_COPY.en.closed);
    assert.equal(h.timers.size, 0);
  }
});

test("close while submission is pending cancels local acknowledgement and suppresses late resurrection", async () => {
  const h = harness(); h.click("start"); h.click("close");
  assert.equal(h.calls.length, 2); assert.equal(h.calls[0]!.options.signal!.aborted, true);
  assert.equal(h.calls[1]!.url, "/bridge/job/close");
  await h.respond(1, 200, { closed: true, remoteMayContinue: true });
  await h.respond(0, 202);
  assert.equal(h.get("state").textContent, OWNER_JOB_COPY.en.closed); assert.equal(h.get("intent").textContent, "");
  h.click("start"); h.click("poll"); assert.equal(h.calls.length, 2); assert.equal(h.timers.size, 0);
});

test("failed response cannot retry, expose private prose or display a licensed result", async () => {
  const h = harness(); h.click("start"); await h.respond(0, 503, { message: "PRIVATE_SENTINEL" });
  assert.equal(h.get("state").textContent, OWNER_JOB_COPY.en.error); h.click("start"); assert.equal(h.calls.length, 1);
  h.click("close"); assert.equal(h.get("state").textContent, OWNER_JOB_COPY.en.closed);
  const result = harness(); result.click("start"); await result.respond(0, 202); result.click("poll");
  await result.respond(1, 200, { status: "SUCCEEDED", result: { price: "PRIVATE_SENTINEL" } });
  assert.equal(result.get("state").textContent, OWNER_JOB_COPY.en.error); assert.equal(result.get("poll").disabled, true);
});

test("expiry and browser restoration clear intent/capability without a new request", async () => {
  for (const event of ["focus", "visibilitychange", "pageshow", "pagehide"] as const) {
    const h = harness(); h.click("start");
    if (event === "focus" || event === "visibilitychange") h.setNow(120000);
    h.events.get(event)!({ persisted: true }); await h.respond(0, 202);
    h.select("ko"); assert.equal(h.get("state").textContent, OWNER_JOB_COPY.ko.closed);
    assert.equal(h.get("intent").textContent, ""); assert.equal(h.calls.length, 1); assert.equal(h.timers.size, 0);
  }
});
