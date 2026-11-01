import React from "react";
import type { NormalizedQuote } from "../../../services/worker/src/quote-normalizer.js";
import type { Locale, SymbolCode } from "../types/market.js";
import { checkedPriceSnapshot, quoteMoney, quotePercent, quoteTimestamp } from "../data/quote-presentation.js";

export interface QuoteLabels {
  marketStates: Record<NormalizedQuote["marketState"], string>;
  freshness: Record<NormalizedQuote["freshness"], string>;
  marketUtc: string;
  marketEastern: string;
  retrievedUtc: string;
  timezoneNote: string;
  freshnessLabel: string;
}
export default function QuoteSnapshot({ quote: candidate, symbol, locale, labels, common, sourceNote }: {
  quote: Readonly<NormalizedQuote> | null; symbol: SymbolCode; locale: Locale; labels: QuoteLabels;
  common: { priceUnavailable: string; exchangeContext: string; marketState: string; source: string; demoData: string };
  sourceNote?: string;
}) {
  const quote = checkedPriceSnapshot(candidate, symbol, locale);
  const state = quote ? labels.marketStates[quote.marketState] : labels.marketStates.UNKNOWN;
  const change = quote?.change, percent = quote?.changePercent;
  return <React.Fragment>
    <div className="quote-main">
      <div>
        <p className="quote-price">{quote ? quoteMoney(quote.price, quote.currency, locale) : common.priceUnavailable}
          {quote && <sup>{quote.currency}</sup>}
        </p>
        {(change !== undefined || percent !== undefined) && <p className={`quote-change ${((percent ?? change ?? 0) < 0) ? "negative" : ""}`}>
          {change !== undefined && quote ? quoteMoney(change, quote.currency, locale, true) : null}
          {change !== undefined && percent !== undefined ? " · " : null}
          {percent !== undefined ? quotePercent(percent, locale) : null} · {common.demoData}
        </p>}
      </div>
      <p className="market-closed"><strong>{state}</strong>{quote ? common.exchangeContext : null}</p>
    </div>
    <div className="quote-facts">
      <div className="fact"><span>{common.marketState}</span><strong>{state}</strong></div>
      <div className="fact"><span>{labels.marketUtc}</span><strong>{quote ? <time dateTime={quote.marketTimestamp}>{quoteTimestamp(quote.marketTimestamp, locale, "UTC")}</time> : common.priceUnavailable}</strong></div>
      <div className="fact"><span>{labels.marketEastern}</span><strong>{quote ? <time dateTime={quote.marketTimestamp}>{quoteTimestamp(quote.marketTimestamp, locale, "America/New_York")}</time> : common.priceUnavailable}</strong></div>
      <div className="fact"><span>{labels.retrievedUtc}</span><strong>{quote ? <time dateTime={quote.retrievedAt}>{quoteTimestamp(quote.retrievedAt, locale, "UTC")}</time> : common.priceUnavailable}</strong></div>
      <div className="fact"><span>{common.source}</span><strong>{quote?.source ?? common.priceUnavailable}</strong>{sourceNote && <small>{sourceNote}</small>}</div>
      <div className="fact"><span>{labels.freshnessLabel}</span><strong>{quote ? `${common.demoData} · ${labels.freshness[quote.freshness]}` : common.priceUnavailable}</strong></div>
    </div>
    <p className="quote-timezone-note">{labels.timezoneNote}</p>
  </React.Fragment>;
}
