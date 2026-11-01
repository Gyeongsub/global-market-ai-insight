import { OWNER_PAGE_MESSAGES } from "./page-messages.js";

// Fixed diagnostic assets, separate from the production/fixture application.
// All variable data is rendered with textContent, never interpreted as HTML.
// External applications/extensions can mark a top-level navigation cross-site.
// This denied landing contains no data or capability. An explicit same-origin
// link click is required before the protected bootstrap is served.
export const OWNER_ENTRY_HTML = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Open local owner check</title></head><body><main><h1>Open local owner check</h1><p>This navigation originated outside the local workspace. No AWS data or session capability has been provided.</p><p><a href="/" rel="noreferrer">Continue to the local owner check</a></p><p>This is a trusted-device checkpoint, not an AWS sign-in or a public service.</p></main></body></html>';
export function ownerPage(capability: string): string {
  if (!/^[a-f0-9]{64}$/.test(capability)) throw Error("OWNER_PAGE_CAPABILITY_INVALID");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="local-capability" content="${capability}"><title>Private AWS observation</title><link rel="stylesheet" href="/owner.css"><script src="/owner.js" defer></script></head><body><main><p class="eyebrow">GLOBAL MARKET AI INSIGHT · OWNER WORKSTATION</p><div class="language"><label id="language-label" for="language">Page language</label><select id="language"><option value="en" lang="en">English</option><option value="ja" lang="ja">日本語</option><option value="ko" lang="ko">한국어</option></select></div><h1 id="page-title">Private AWS observation</h1><p id="intro">Read-only catalog and safety snapshot. No market prices or AI analysis are requested.</p><section aria-labelledby="status-title"><h2 id="status-title">Connection check</h2><p id="status" role="status">Checking the local observation…</p><dl><dt id="source-label">Source</dt><dd id="source">—</dd><dt id="observed-label">Observed at (UTC)</dt><dd id="observed">—</dd><dt id="health-label">Circuit / job creation</dt><dd id="health">—</dd></dl></section><section aria-labelledby="assets-title"><h2 id="assets-title">Project asset catalog</h2><ul id="assets"></ul><p id="catalog-note">Catalog membership does not confirm provider coverage. SPCX requires validation; no replacement or fabricated quote is used.</p></section><p class="note" id="scope-note">This page expires within five minutes. Refreshing it does not call AWS again. Your trusted local OS is the access boundary; this is not a public website.</p></main></body></html>`;
}
export const OWNER_PAGE_JS = `"use strict";
(() => {
  const messages = ${JSON.stringify(OWNER_PAGE_MESSAGES)};
  const element = id => document.getElementById(id);
  const meta = document.querySelector('meta[name="local-capability"]');
  let capability = meta?.content;
  meta?.remove();
  let locale = "en", state = "loading", observation, expiresAt, expiryTimer;
  const controller = new AbortController();
  const startedAt = performance.now();
  const fetchTimer = setTimeout(() => controller.abort(), 5000);
  const render = () => {
    const copy = messages[locale];
    document.documentElement.lang = locale;
    document.title = copy.title;
    for (const [id, key] of [["page-title", "title"], ["intro", "intro"], ["language-label", "language"],
      ["status-title", "connection"], ["source-label", "source"], ["observed-label", "observed"],
      ["health-label", "health"], ["assets-title", "assets"], ["catalog-note", "catalogNote"], ["scope-note", "scopeNote"]]) {
      element(id).textContent = copy[key];
    }
    element("status").textContent = copy[state];
    element("assets").replaceChildren();
    for (const id of ["source", "observed", "health"]) element(id).textContent = "—";
    if (state !== "loaded" || !observation) return;
    element("source").textContent = copy[observation.source === "aws-owner-read-only" ? "awsSource" : "fixtureSource"];
    element("observed").textContent = observation.observedAt;
    element("health").textContent = copy.safeHealth;
    for (const asset of observation.catalog.assets) {
      const row = document.createElement("li"); row.textContent = asset.symbol + " — " + asset.displayName; element("assets").append(row);
    }
  };
  const clear = () => {
    capability = undefined; observation = undefined; state = "closed";
    clearTimeout(expiryTimer); clearTimeout(fetchTimer); controller.abort(); render();
  };
  const renderUnlessExpired = () => {
    const now = performance.now();
    if (now < startedAt || (expiresAt !== undefined && now >= expiresAt)) clear(); else render();
  };
  element("language").addEventListener("change", () => {
    const selected = element("language").value;
    locale = ["en", "ja", "ko"].includes(selected) ? selected : "en";
    element("language").value = locale;
    renderUnlessExpired();
  });
  window.addEventListener("pagehide", clear, { once: true });
  window.addEventListener("pageshow", event => { if (event.persisted) clear(); });
  window.addEventListener("focus", renderUnlessExpired);
  document.addEventListener("visibilitychange", renderUnlessExpired);
  render();
  async function load() {
    try {
      if (!capability) throw Error();
      const response = await fetch("/bridge/observation", { method: "POST", credentials: "omit", cache: "no-store",
        redirect: "error", headers: { "x-gmai-local-capability": capability }, signal: controller.signal });
      if (!response.ok) throw Error();
      const value = await response.json();
      if (state === "closed" || controller.signal.aborted || !capability || !Number.isSafeInteger(value.remainingMs) || value.remainingMs <= 0 || value.remainingMs > 300000) throw Error();
      if (!["aws-owner-read-only", "local-test-fixture"].includes(value.source)) throw Error();
      // Subtract the complete local request time, conservatively. Language changes,
      // focus and browser restore must never renew this absolute deadline.
      expiresAt = startedAt + value.remainingMs;
      const remaining = expiresAt - performance.now();
      if (remaining <= 0) throw Error();
      capability = undefined;
      clearTimeout(fetchTimer);
      observation = value; state = "loaded"; renderUnlessExpired();
      if (state === "loaded") expiryTimer = setTimeout(clear, remaining);
    } catch { clear(); }
  }
  void load();
})();`;
export const OWNER_PAGE_CSS = `:root{color-scheme:dark;font-family:system-ui,sans-serif;background:#0d1626;color:#e7edf6}body{margin:0}main{max-width:780px;margin:5vh auto;padding:24px}h1{font-size:clamp(1.8rem,5vw,2.6rem)}h2{font-size:1.1rem}p,li,dd{line-height:1.6}section{background:#172338;border:1px solid #33445b;border-radius:14px;padding:20px;margin:22px 0}.eyebrow{color:#7edfc4;font-size:.75rem;letter-spacing:.12em}dt{color:#b1c3db;margin-top:12px}dd{margin-left:0;overflow-wrap:anywhere}.note{color:#b1c3db;font-size:.9rem}li{padding:5px 0}.language{display:flex;gap:12px;align-items:center;flex-wrap:wrap}select{font:inherit;background:#172338;color:#e7edf6;border:1px solid #7edfc4;border-radius:6px;padding:8px;max-width:100%}select:focus-visible{outline:3px solid #7edfc4;outline-offset:4px}`;
