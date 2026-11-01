import React from "react";
import { storedResultValid } from "../../../shared/schemas/result-validation";
import type { Locale, SymbolCode } from "../types/market";

export interface AnalysisLabels {
  observations: string; opportunities: string; risks: string; specialConsiderations: string; uncertainty: string;
  dataAsOf: string; model: string; prompt: string;
}

export default function AnalysisResult({ result, symbol, locale, labels }: {
  result: Record<string, unknown>; symbol: SymbolCode; locale: Locale; labels: AnalysisLabels;
}) {
  if (!storedResultValid(result, { operation: "ANALYZE", symbol, locale })) return null;
  const groups = ["observations", "opportunities", "risks", "specialConsiderations"] as const;
  return <React.Fragment><div className="insight-content">
    <p className="insight-summary">{result.summary as string}</p>
    <div className="insight-grid">
      {groups.filter(group => (result[group] as string[]).length > 0).map(group => <section className="insight-item" key={group}>
        <div><h3>{labels[group]}</h3><ul>{(result[group] as string[]).map((item, index) => <li key={index}>{item}</li>)}</ul></div>
      </section>)}
    </div>
    <section className="analysis-uncertainty"><h3>{labels.uncertainty}</h3><p>{result.uncertainty as string}</p></section>
    <dl className="analysis-provenance">
      <div><dt>{labels.dataAsOf}</dt><dd><time dateTime={result.dataAsOf as string}>{result.dataAsOf as string}</time></dd></div>
      <div><dt>{labels.model}</dt><dd>{result.modelId as string}</dd></div>
      <div><dt>{labels.prompt}</dt><dd>{result.promptVersion as string}</dd></div>
    </dl>
    <p className="risk-pill">{result.disclaimer as string}</p>
  </div></React.Fragment>;
}
