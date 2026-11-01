import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("production assets contain no development-only HTTP fixture target, selector or transport", async () => {
  const directory = new URL("dist/assets/", root);
  const names = (await readdir(directory)).filter(name => name.endsWith(".js"));
  assert.ok(names.length > 0);
  for (const name of names) {
    const source = await readFile(new URL(name, directory), "utf8");
    assert.doesNotMatch(source, /127\.0\.0\.1:4174|x-local-fixture-scenario|LOCAL_HTTP_FIXTURE_TARGET_REJECTED|\/http-demo/);
  }
});

test("renders product identity and safety context from the static entry", async () => {
  const entry = await readFile(new URL("src/main.tsx", root), "utf8");
  const dashboard = await readFile(new URL("src/components/MarketDashboard.tsx", root), "utf8");
  const html = await readFile(new URL("index.html", root), "utf8");

  assert.match(entry, /MarketDashboard/);
  assert.match(html, /Global Market AI Insight/);
  assert.doesNotMatch(html, /codex-preview|Starter Project/);
  assert.match(dashboard, /DEMO|text\.disclaimer/);
  assert.match(dashboard, /aria-live="polite"/);
  assert.doesNotMatch(dashboard, /dangerouslySetInnerHTML/);
  assert.match(dashboard, /href="\/THIRD_PARTY_NOTICES\.txt"/);
  assert.match(dashboard, /text\.thirdPartyNotices/);
});

test("produces an AWS S3-compatible static bundle", async () => {
  const html = await readFile(new URL("dist/index.html", root), "utf8");
  assert.match(html, /Global Market AI Insight/);
  assert.match(html, /og\.png/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/);
});

test("local development and preview are loopback-only with narrow file scope and protected-state denies", async () => {
  const source = await readFile(new URL("vite.config.ts", root), "utf8");
  assert.match(source, /host: "127\.0\.0\.1"/);
  assert.match(source, /preview: \{ host: "127\.0\.0\.1", port: 4173, strictPort: true, headers: \{\.\.\.FIXTURE_PREVIEW_HEADERS\} \}/);
  assert.match(source, /fs: \{\s*strict: true/);
  assert.match(source, /forwardConsole: false/);
  assert.match(source, /new URL\("\.", import\.meta\.url\)/);
  assert.match(source, /new URL\("\.\.\/node_modules\/\.pnpm", import\.meta\.url\)/);
  assert.doesNotMatch(source, /allow:.*new URL\("\.\.\/?"/);
  for (const part of [".env", ".aws", ".codex", ".agents", ".git", ".npmrc", ".yarnrc.yml", "outputs", "work", "cdk.out", "tfstate", "pem,key,p12,pfx,cer,der"])
    assert.ok(source.includes(part));
});

test("keeps the fixed asset and locale allowlists", async () => {
  const assets = await readFile(new URL("src/data/assets.ts", root), "utf8");
  const types = await readFile(new URL("src/types/market.ts", root), "utf8");
  const dashboard = await readFile(new URL("src/components/MarketDashboard.tsx", root), "utf8");

  for (const symbol of ["VOO", "QLD", "TSLA", "SPCX", "GOOG"]) assert.match(assets, new RegExp(`symbol: "${symbol}"`));
  assert.match(types, /"en" \| "ja" \| "ko"/);
  assert.match(dashboard, /saveLocale\(locale, \(\) => window\.localStorage\)/);
});

test("preserves leveraged ETF and unverified SPCX unavailable-data safeguards", async () => {
  const assets = await readFile(new URL("src/data/assets.ts", root), "utf8");
  const insights = await readFile(new URL("src/data/insights.ts", root), "utf8");
  const locales = await Promise.all(["en", "ja", "ko"].map(async (locale) => JSON.parse(await readFile(new URL(`src/locales/${locale}.json`, root), "utf8"))));

  assert.match(insights, /daily reset/i);
  assert.match(insights, /path dependency/i);
  assert.match(insights, /일일 재설정/);
  assert.match(assets, /symbol: "SPCX"[^\n]*type: "UNVERIFIED"[^\n]*price: null[^\n]*available: false/);
  assert.doesNotMatch(assets + insights, /SpaceX|133\.11|15\.83|Listing verified|上場を確認|상장 확인/);
  assert.match(insights, /symbol === "SPCX"\) throw new Error\("FIXTURE_UNAVAILABLE"\)/);
  assert.match(locales[0].unavailableBody, /never substitute/i);
  assert.match(locales[1].unavailableBody, /置換/);
  assert.match(locales[2].unavailableBody, /대체/);
  for (const locale of locales) assert.ok(locale.disclaimer.length > 30);
  const expectedKeys = Object.keys(locales[0]).sort();
  for (const locale of locales.slice(1)) assert.deepEqual(Object.keys(locale).sort(), expectedKeys);
});

test("long risk disclosures wrap instead of being clipped on small screens", async () => {
  const css = await readFile(new URL("src/styles/globals.css", root), "utf8");
  const riskRule = css.match(/\.risk-pill\s*\{([^}]+)\}/)?.[1] ?? "";
  assert.match(riskRule, /max-width:\s*100%/);
  assert.match(riskRule, /white-space:\s*normal/);
  assert.match(riskRule, /overflow-wrap:\s*anywhere/);
});

test("structured analysis uses a full-width text column and wraps contract-length prose", async () => {
  const css = await readFile(new URL("src/styles/globals.css", root), "utf8");
  const item = css.match(/\.insight-item\s*\{([^}]+)\}/)?.[1] ?? "";
  const content = css.match(/\.insight-content\s*\{([^}]+)\}/)?.[1] ?? "";
  assert.match(item, /grid-template-columns:\s*minmax\(0,\s*1fr\)\s*;/);
  assert.match(content, /overflow-wrap:\s*anywhere\s*;/);
  assert.doesNotMatch(item, /grid-template-columns:\s*30px/);
  assert.doesNotMatch(content, /overflow(?:-x)?:\s*(?:hidden|clip)/);
});

test("narrow viewports do not force a fixed body width and compact rows can reflow", async () => {
  const css = await readFile(new URL("src/styles/globals.css", root), "utf8");
  const body = css.match(/\bbody\s*\{([^}]+)\}/)?.[1] ?? "";
  assert.match(body, /min-width:\s*0\s*;/);
  const mobile = css.slice(css.indexOf("@media (max-width: 680px)"), css.indexOf("@media (prefers-reduced-motion"));
  for (const selector of ["header-inner", "market-meta", "panel-head"]) {
    const rule = mobile.match(new RegExp(`\\.${selector}\\s*\\{([^}]+)\\}`))?.[1] ?? "";
    assert.match(rule, /flex-wrap:\s*wrap\s*;/, `${selector} can wrap at small widths`);
  }
  assert.doesNotMatch(body, /overflow-x:\s*(?:hidden|clip)/, "overflow must reflow, not be hidden");
});

test("failure scenarios are translated and retain local-only safety context", async () => {
  for (const language of ["en", "ja", "ko"]) {
    const locale = JSON.parse(await readFile(new URL(`src/locales/${language}.json`, root), "utf8"));
    assert.deepEqual(Object.keys(locale.scenarios).sort(), ["circuit", "success", "timeout", "unavailable"]);
    for (const key of ["demoControls", "demoHelp", "demoScenario", "circuitTitle", "circuitBody", "timeoutTitle", "timeoutBody", "dataUnavailableBody", "recoveryHint", "jobTimedOut", "jobFailed", "skipLink"]) assert.ok(locale[key].length > 0);
    assert.match(locale.demoHelp, /AWS/);
  }
  const dashboard = await readFile(new URL("src/components/MarketDashboard.tsx", root), "utf8");
  assert.equal((dashboard.match(/role="status"/g) ?? []).length, 1);
  assert.match(dashboard, /href="#main-content"/);
  assert.match(dashboard, /id="main-content" tabIndex=\{-1\}/);
  assert.doesNotMatch(dashboard, /fetch\(|createJob\(|pollJob\(/);
});

test("quote timestamps and provenance remain readable rather than ellipsized", async () => {
  const css = await readFile(new URL("src/styles/globals.css", root), "utf8");
  const rule = css.match(/\.fact strong\s*\{([^}]+)\}/)?.[1] ?? "";
  assert.match(rule, /white-space:\s*normal/);
  assert.match(rule, /overflow-wrap:\s*anywhere/);
  assert.doesNotMatch(rule, /overflow:\s*hidden|text-overflow:\s*ellipsis/);
});

test("secondary text retains readable contrast on the base dark surfaces", async () => {
  const css = await readFile(new URL("src/styles/globals.css", root), "utf8");
  const color = name => css.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, "i"))?.[1];
  const luminance = hex => {
    assert.ok(hex, "required palette token is present");
    const channels = [1, 3, 5].map(start => parseInt(hex.slice(start, start + 2), 16) / 255)
      .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  for (const foreground of ["ink", "muted", "subtle"]) {
    for (const background of ["navy", "panel", "panel-raised"]) {
      const a = luminance(color(foreground));
      const b = luminance(color(background));
      assert.ok((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) >= 4.5, `${foreground} on ${background}`);
    }
  }
  // Token pairs only: gradients, compositing and all UI states need browser review.
});

test("completion guidance has one atomic live region and a separate price-only result", async () => {
  const source = await readFile(new URL("src/components/MarketDashboard.tsx", root), "utf8");
  assert.equal((source.match(/role="status"/g) ?? []).length, 1);
  assert.match(source, /aria-live="polite" aria-atomic="true"/);
  assert.match(source, /demoAnnouncement\(text, selectedSymbol, status, hasInsight,/);
  assert.match(source, /className="empty-insight price-complete"/);
  assert.match(source, /text\.priceDoneTitle/);
  assert.match(source, /text\.priceDoneBody/);
});
