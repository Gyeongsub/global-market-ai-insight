import React, { useEffect, useRef, useState } from "react";
import { assets } from "../data/assets";
import { buildSearchPrompt, CHATGPT_URL, copySearchPrompt } from "../data/search-handoff";
import { isLocale, readLocale, saveLocale } from "../locales/preference";
import messages from "../locales/search-handoff.json";
import type { JobOperation, Locale, SymbolCode } from "../types/market";
import MarketDashboard from "./MarketDashboard";

export default function SearchHandoff() {
  const [locale, setLocale] = useState<Locale>(() => typeof window === "undefined" ? "en" : readLocale(() => window.localStorage));
  const [symbol, setSymbol] = useState<SymbolCode>("VOO");
  const [operation, setOperation] = useState<JobOperation>("PRICE");
  const [lab, setLab] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "pending" | "ok" | "failed">("idle");
  const copyRevision = useRef(0);
  const previousLab = useRef(false);
  const labOpenButton = useRef<HTMLButtonElement>(null);
  const labBackButton = useRef<HTMLButtonElement>(null);
  const text = messages[locale];
  const prompt = buildSearchPrompt(symbol, operation, locale);

  useEffect(() => {
    document.documentElement.lang = locale;
    saveLocale(locale, () => window.localStorage);
  }, [locale]);
  useEffect(() => () => { copyRevision.current++; }, []);
  useEffect(() => {
    if (previousLab.current !== lab) (lab ? labBackButton : labOpenButton).current?.focus();
    previousLab.current = lab;
  }, [lab]);

  function resetCopy() { copyRevision.current++; setCopyState("idle"); }
  async function copy() {
    const revision = ++copyRevision.current;
    setCopyState("pending");
    const copied = await copySearchPrompt(prompt, value => navigator.clipboard.writeText(value));
    // A completed old write must not announce that a newly selected question was copied.
    if (revision === copyRevision.current) setCopyState(copied ? "ok" : "failed");
  }

  if (lab) return <React.Fragment>
    <nav className="search-lab-return" aria-label={text.labTitle}>
      <button ref={labBackButton} className="action-button" type="button" onClick={() => {
        resetCopy(); setLocale(readLocale(() => window.localStorage)); setLab(false);
      }}>{text.labBack}</button>
    </nav>
    <MarketDashboard />
  </React.Fragment>;

  return <div className="app-shell">
    <a className="skip-link" href="#search-main-content">{text.skipLink}</a>
    <header className="site-header"><div className="header-inner">
      <div className="brand"><span className="brand-mark" aria-hidden="true">GM</span><span className="brand-name">Global Market AI Insight</span></div>
      <label className="search-language">{text.language}
        <select className="language-select" value={locale} onChange={event => {
          if (isLocale(event.target.value)) { resetCopy(); setLocale(event.target.value); }
        }}>
          <option value="en">English</option><option value="ja">日本語</option><option value="ko">한국어</option>
        </select>
      </label>
    </div></header>
    <main id="search-main-content" className="page-main search-main" tabIndex={-1}>
      <section className="hero" aria-labelledby="search-title"><div>
        <p className="eyebrow">{text.eyebrow}</p><h1 id="search-title">{text.title}</h1><p className="hero-copy">{text.intro}</p>
      </div></section>
      <section aria-labelledby="search-assets"><h2 id="search-assets" className="section-label">{text.asset}</h2>
        <div className="asset-grid">{assets.map(asset => <button type="button" key={asset.symbol}
          className={`asset-card ${symbol === asset.symbol ? "selected" : ""}`} aria-pressed={symbol === asset.symbol}
          aria-label={`${asset.symbol} — ${asset.symbol === "SPCX" ? text.uncertain : asset.name}`}
          onClick={() => { resetCopy(); setSymbol(asset.symbol); }}>
          <span className="asset-symbol">{asset.symbol}</span>
          <span className="asset-name">{asset.symbol === "SPCX" ? text.uncertain : asset.name}</span>
        </button>)}</div>
      </section>
      <section className="search-panel" aria-labelledby="search-intent"><h2 id="search-intent">{text.intent}</h2>
        <div className="action-row">{(["PRICE", "ANALYZE"] as const).map(value => <button type="button" key={value}
          className={`action-button ${operation === value ? "primary" : ""}`} aria-pressed={operation === value}
          onClick={() => { resetCopy(); setOperation(value); }}>{value === "PRICE" ? text.price : text.analysis}</button>)}</div>
        <label className="search-prompt-label" htmlFor="search-prompt">{text.prompt}</label>
        <textarea id="search-prompt" className="search-prompt" readOnly value={prompt} rows={12} aria-describedby="search-privacy" />
        <p id="search-privacy" className="search-note">{text.privacy}</p>
        <div className="action-row">
          <button type="button" className="action-button primary" disabled={copyState === "pending"} onClick={() => { void copy(); }}>{copyState === "pending" ? text.copying : text.copy}</button>
          <a className="action-button" href={CHATGPT_URL} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{text.open}</a>
        </div>
        <p role="status" aria-live="polite" className="search-copy-status">{copyState === "ok" ? text.copied : copyState === "failed" ? text.copyFailed : ""}</p>
        <p className="search-note">{text.limits}</p><p className="search-disclaimer">{text.disclaimer}</p>
      </section>
      <aside className="search-panel" aria-labelledby="search-lab"><h2 id="search-lab">{text.labTitle}</h2><p className="search-note">{text.labBody}</p>
        <button ref={labOpenButton} type="button" className="action-button" onClick={() => { resetCopy(); setLab(true); }}>{text.labOpen}</button>
      </aside>
      <aside className="search-panel" aria-labelledby="aws-synthetic-title"><h2 id="aws-synthetic-title">{text.awsTitle}</h2>
        <p className="search-note">{text.awsBody}</p>
        <a className="action-button" href="http://127.0.0.1:4175/" target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{text.awsOpen}</a>
        <p className="search-note">{text.awsLimit}</p>
      </aside>
      <footer className="search-footer"><a href="/THIRD_PARTY_NOTICES.txt">{text.notices}</a></footer>
    </main>
  </div>;
}
