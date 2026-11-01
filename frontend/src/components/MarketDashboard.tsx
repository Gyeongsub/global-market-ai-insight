"use client";

import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { assets, getAsset } from "../data/assets";
import { demoScenarios, isDemoScenario, type DemoScenario } from "../data/demo-job";
import { contractDemoResult, createContractDemoRunner } from "../data/contract-demo";
import { createLocalHttpDemoRunner, isLocalHttpDemoLocation } from "../data/local-http-demo";
import AnalysisResult from "./AnalysisResult";
import DemoErrorNotice from "./DemoErrorNotice";
import { demoErrorPresentation } from "../data/demo-error";
import QuoteSnapshot from "./QuoteSnapshot";
import { checkedPriceSnapshot } from "../data/quote-presentation";
import { dashboardJobReducer, initialDashboardJobState } from "../data/dashboard-state";
import { demoAnnouncement } from "../data/demo-announcement";
import en from "../locales/en.json";
import ja from "../locales/ja.json";
import ko from "../locales/ko.json";
import { isLocale, readLocale, saveLocale } from "../locales/preference";
import type { JobOperation, Locale, SymbolCode } from "../types/market";

const messages = { en, ja, ko } as const;
const DEVELOPMENT_HTTP_BUILD = typeof import.meta.env !== "undefined" && import.meta.env.DEV;
const languageNames: Record<Locale, string> = {
  en: "English",
  ja: "日本語",
  ko: "한국어",
};

export default function MarketDashboard() {
  // Keep the banner and selected runner bound to one mount, including hash
  // navigation by the skip link. Production folding still removes the HTTP arm.
  const [localHttpDemo] = useState(() => DEVELOPMENT_HTTP_BUILD && typeof window !== "undefined" && isLocalHttpDemoLocation(window.location.href));
  const [locale, setLocale] = useState<Locale>(() => typeof window === "undefined" ? "en" : readLocale(() => window.localStorage));
  const [selectedSymbol, setSelectedSymbol] = useState<SymbolCode>("VOO");
  const [jobView, dispatchJob] = useReducer(dashboardJobReducer, initialDashboardJobState);
  const { status, hasInsight, completed, priceResult, error, jobId, waitingStopped, submitting } = jobView;
  const waitingStoppedHeading = useRef<HTMLHeadingElement>(null);
  const [scenario, setScenario] = useState<DemoScenario>("success");
  const [runner] = useState(() => (DEVELOPMENT_HTTP_BUILD && localHttpDemo ? createLocalHttpDemoRunner : createContractDemoRunner)({
    set: (callback, delay) => window.setTimeout(callback, delay),
    clear: handle => window.clearTimeout(handle),
  }, step => {
    dispatchJob({ type: "step", step });
  }));

  const text = messages[locale];
  const selected = useMemo(() => getAsset(selectedSymbol), [selectedSymbol]);
  const busy = status === "QUEUED" || status === "RUNNING";
  const quote = useMemo(() => checkedPriceSnapshot(priceResult ?? (selected.available ?
    contractDemoResult({ operation: "PRICE", symbol: selectedSymbol, locale }) : null), selectedSymbol, locale),
  [priceResult, selected, selectedSymbol, locale]);

  useEffect(() => () => runner.cancel(), [runner]);
  useEffect(() => { if (waitingStopped) waitingStoppedHeading.current?.focus(); }, [waitingStopped]);

  useEffect(() => {
    document.documentElement.lang = locale;
    saveLocale(locale, () => window.localStorage);
  }, [locale]);

  function selectAsset(symbol: SymbolCode) {
    if (runner.isActive()) return;
    setSelectedSymbol(symbol);
    dispatchJob({ type: "reset" });
  }

  function startJob(nextOperation: JobOperation) {
    if (runner.isActive()) return;
    dispatchJob({ type: "begin" });
    try { runner.start({ operation: nextOperation, symbol: selectedSymbol, locale }, scenario, selected.available); }
    catch {
      runner.cancel();
      dispatchJob({ type: "step", step: { afterMs: 0, status: "FAILED", hasInsight: false, error: "REQUEST_FAILED" } });
    }
  }

  function stopWaiting() {
    if (!runner.isActive()) return;
    runner.cancel();
    dispatchJob({ type: "stop-waiting" });
  }

  const errorText = error ? demoErrorPresentation(error, text).body : null;

  const liveMessage = waitingStopped ? `${selectedSymbol}: ${text.waitingStoppedBody}` : demoAnnouncement(text, selectedSymbol, status, hasInsight, errorText, submitting);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">{text.skipLink}</a>
      <header className="site-header">
        <div className="header-inner">
          <div className="brand" aria-label="Global Market AI Insight">
            <span className="brand-mark" aria-hidden="true">GM</span>
            <span className="brand-copy">
              <span className="brand-name">Global Market AI Insight</span>
              <span className="brand-tagline">{text.brandTagline}</span>
            </span>
          </div>
          <div className="header-actions">
            <span className="system-status"><i className="status-dot" />{text.systemReady}</span>
            <label>
              <span className="sr-only">{text.languageLabel}</span>
              <select
                className="language-select"
                aria-label={text.languageLabel}
                value={locale}
                disabled={busy}
                onChange={(event) => {
                  if (!runner.isActive() && isLocale(event.target.value)) {
                    runner.cancel(); setLocale(event.target.value); dispatchJob({ type: "reset" });
                  }
                }}
              >
                {(Object.keys(languageNames) as Locale[]).map((code) => (
                  <option value={code} key={code}>{languageNames[code]}</option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </header>

      <main className="page-main" id="main-content" tabIndex={-1}>
        {DEVELOPMENT_HTTP_BUILD && localHttpDemo && <aside className="http-demo-banner" role="note">{text.localHttpDemo}</aside>}
        <section className="hero" aria-labelledby="hero-title">
          <div>
            <p className="eyebrow">{text.eyebrow}</p>
            <h1 id="hero-title">{text.headlineLead}<br /><span>{text.headlineAccent}</span></h1>
            <p className="hero-copy">{text.heroCopy}</p>
          </div>
          <aside className="hero-note">
            <p className="hero-note-label">{text.heroNoteLabel}</p>
            <strong>{text.heroNoteTitle}</strong>
            <p>{text.heroNoteBody}</p>
          </aside>
        </section>

        <details className="demo-controls">
          <summary>{text.demoControls}</summary>
          <p id="demo-help">{text.demoHelp}</p>
          <label htmlFor="demo-scenario">{text.demoScenario}</label>
          <select id="demo-scenario" aria-describedby="demo-help" value={scenario} disabled={busy} onChange={(event) => {
            if (!runner.isActive() && isDemoScenario(event.target.value)) {
              setScenario(event.target.value); dispatchJob({ type: "reset" });
            }
          }}>
            {demoScenarios.map(value => <option key={value} value={value}>{text.scenarios[value]}</option>)}
          </select>
        </details>

        <section aria-labelledby="asset-heading">
          <div className="market-strip">
            <h2 id="asset-heading" className="section-label">{text.assetSection}</h2>
            <div className="market-meta">
              <span className="demo-pill">{text.demoData}</span>
              <span>{text.marketClosed}</span>
            </div>
          </div>
          <div className="asset-grid">
            {assets.map((asset) => (
              <button
                type="button"
                key={asset.symbol}
                className={`asset-card ${selectedSymbol === asset.symbol ? "selected" : ""}`}
                aria-pressed={selectedSymbol === asset.symbol}
                disabled={busy}
                onClick={() => selectAsset(asset.symbol)}
              >
                <span className="asset-top">
                  <span className="asset-symbol">{asset.symbol}</span>
                  <span className="asset-type">{asset.type === "LEVERAGED_ETF" ? "2× ETF" : asset.type}</span>
                </span>
                <span className="asset-name">{asset.symbol === "SPCX" ? text.spcxIdentity : asset.name}</span>
                <span className="asset-signal">
                  <strong>{asset.available ? `${asset.changePercent! > 0 ? "+" : ""}${asset.changePercent!.toFixed(2)}%` : "N/A"}</strong>
                  <span className="mini-bars" aria-hidden="true">
                    {asset.bars.map((height, index) => <i key={index} style={{ height }} />)}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="workspace" aria-label={text.workspaceLabel}>
          <article className="quote-panel">
            <div className="panel-head">
              <div className="panel-title-wrap">
                <p className="panel-kicker">{text.quoteKicker}</p>
                <h2 className="panel-title">{selected.symbol} · {text.quoteTitle}</h2>
              </div>
              <span className="freshness-pill">{text.demoData} · {quote ? text.quoteLabels.freshness[quote.freshness] : text.priceUnavailable}</span>
            </div>
            <div className="quote-body">
              <QuoteSnapshot quote={quote} symbol={selectedSymbol} locale={locale} labels={text.quoteLabels} common={text}
                {...(selected.symbol === "SPCX" ? { sourceNote: text.spcxMockSource } : {})} />

              <div className="action-row">
                <button className="action-button" type="button" disabled={busy} onClick={() => startJob("PRICE")}>
                  <span>{text.checkPrice}</span><span className="button-arrow">↗</span>
                </button>
                <button className="action-button primary" type="button" disabled={busy} onClick={() => startJob("ANALYZE")}>
                  <span>{text.analyze}</span><span className="button-arrow">→</span>
                </button>
              </div>
              <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{liveMessage}</div>
            </div>
          </article>

          <article className="insight-panel" aria-busy={busy}>
            <div className="panel-head">
              <div className="panel-title-wrap">
                <p className="panel-kicker">{text.insightKicker}</p>
                <h2 className="panel-title">{text.insightTitle}</h2>
              </div>
              <span className="job-pill">{waitingStopped ? text.waitingStoppedLabel : submitting ? text.jobSubmitting : status === "QUEUED" ? text.jobQueued : status === "RUNNING" ? text.jobRunning : status === "SUCCEEDED" ? text.jobComplete : status === "TIMED_OUT" ? text.jobTimedOut : status === "FAILED" ? text.jobFailed : text.jobReady}</span>
            </div>

            {busy ? (
              <div className="loading-insight">
                <div>
                  <div className="loading-ring" aria-hidden="true" />
                  <h3>{text.starting}</h3>
                  <p>{submitting ? text.submitting : status === "QUEUED" ? text.queued : text.running}</p>
                  <div className="progress-steps" aria-hidden="true">
                    <i className="active" /><i className={status === "RUNNING" ? "active" : ""} /><i />
                  </div>
                  <button className="action-button wait-stop" type="button" onClick={stopWaiting} aria-describedby="waiting-stop-note">{text.stopWaiting}</button>
                  <p className="waiting-stop-note" id="waiting-stop-note">{text.stopWaitingNote}</p>
                </div>
              </div>
            ) : waitingStopped ? (
              <div className="empty-insight waiting-stopped"><div>
                <h3 ref={waitingStoppedHeading} tabIndex={-1}>{text.waitingStoppedTitle}</h3><p>{text.waitingStoppedBody}</p>
                <p>{text.waitingStoppedRecovery}</p>
              </div></div>
            ) : error ? (
              <DemoErrorNotice error={error} text={text} />
            ) : selected.available && hasInsight && completed?.result ? (
              <AnalysisResult result={completed.result} symbol={selectedSymbol} locale={locale} labels={text.analysisLabels} />
            ) : status === "SUCCEEDED" ? (
              <div className="empty-insight price-complete">
                <div>
                  <h3>{text.priceDoneTitle}</h3>
                  <p>{text.priceDoneBody}</p>
                </div>
              </div>
            ) : (
              <div className="empty-insight">
                <div>
                  <div className="empty-icon" aria-hidden="true">{selected.available ? "AI" : "N/A"}</div>
                  <h3>{selected.available ? text.emptyTitle : text.unavailableTitle}</h3>
                  <p>{selected.available ? text.emptyBody : text.unavailableBody}</p>
                </div>
              </div>
            )}
            {jobId && <p className="job-reference"><span>{text.demoJobId}</span><code>{jobId}</code></p>}
          </article>
        </section>

        <div className="disclaimer">
          <span className="disclaimer-mark" aria-hidden="true">!</span>
          <span>{text.disclaimer}</span>
        </div>

        <section className="architecture-note" aria-labelledby="architecture-title">
          <div>
            <h2 id="architecture-title">{text.architectureTitle}</h2>
            <p>{text.architectureBody}</p>
          </div>
          <div className="architecture-flow">{text.architectureFlow}</div>
        </section>
      </main>

      <footer className="site-footer">
        <span>{text.footerLeft}</span>
        <a href="/THIRD_PARTY_NOTICES.txt">{text.thirdPartyNotices}</a>
        <span>{text.footerRight}</span>
      </footer>
    </div>
  );
}
