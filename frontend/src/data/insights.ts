import type { Locale, LocalizedInsight, SymbolCode } from "../types/market.js";

const generic: Record<Locale, Omit<LocalizedInsight, "risk">> = {
  en: {
    summary: "The fixture shows a modest session move. This alone does not establish a durable trend; the market timestamp, broader conditions, and source limitations remain important context.",
    items: [
      { title: "Observed signal", body: "The fixture records a single-session percentage change, not evidence of a lasting trend." },
      { title: "Useful context", body: "Price freshness and market state are displayed separately from the AI narrative." },
      { title: "Uncertainty", body: "A single quote cannot explain cause, valuation, or future direction." }
    ]
  },
  ja: {
    summary: "サンプルでは小幅な値動きが見られます。これだけでは持続的なトレンドとは判断できず、市場時刻、全体環境、データソースの制約が重要です。",
    items: [
      { title: "観測されたシグナル", body: "サンプルは1日の変化率を示すもので、持続的なトレンドの証拠ではありません。" },
      { title: "確認すべき文脈", body: "価格の鮮度と市場状態はAIの説明とは分けて表示しています。" },
      { title: "不確実性", body: "単一の価格だけでは原因、バリュエーション、将来方向は説明できません。" }
    ]
  },
  ko: {
    summary: "샘플에서는 완만한 일일 움직임이 관측됩니다. 이것만으로 지속적인 추세를 판단할 수 없으며 시장 시각, 전체 시장 환경, 데이터 출처의 한계를 함께 봐야 합니다.",
    items: [
      { title: "관측된 신호", body: "샘플은 하루의 등락률을 나타내며 지속적인 추세의 근거는 아닙니다." },
      { title: "확인할 맥락", body: "가격의 최신성과 시장 상태를 AI 설명과 분리해 표시합니다." },
      { title: "불확실성", body: "한 시점의 가격만으로 원인, 가치 평가, 향후 방향을 설명할 수 없습니다." }
    ]
  }
};

const riskByLocale: Record<Locale, string> = {
  en: "Risk note · Market prices can move materially and the fixture is not live data.",
  ja: "リスク注記 · 市場価格は大きく変動する可能性があり、表示値はライブデータではありません。",
  ko: "위험 안내 · 시장 가격은 크게 변동할 수 있으며 표시값은 실시간 데이터가 아닙니다."
};

const qld: Record<Locale, LocalizedInsight> = {
  en: {
    summary: "QLD seeks 2× the daily performance of its benchmark before fees and expenses. The daily reset means multi-day outcomes can diverge significantly from simply doubling the benchmark return.",
    items: [
      { title: "Daily leverage", body: "The 2× objective applies to one day, not an arbitrary holding period." },
      { title: "Path dependency", body: "Compounding and volatility can help or hurt depending on the sequence of returns." },
      { title: "Elevated downside", body: "Losses can be amplified, so risk cannot be inferred from the positive demo move." }
    ],
    risk: "Leveraged ETF · Daily reset, compounding, and elevated downside require special care."
  },
  ja: {
    summary: "QLDは手数料・費用控除前でベンチマークの日次変動の2倍を目指します。日次リセットにより、複数日の結果は単純な2倍から大きく乖離することがあります。",
    items: [
      { title: "日次レバレッジ", body: "2倍という目標は任意の保有期間ではなく、1日単位に適用されます。" },
      { title: "経路依存性", body: "複利とボラティリティの影響は、リターンの順序によって有利にも不利にもなります。" },
      { title: "拡大する下落リスク", body: "損失も増幅されるため、デモの上昇だけでリスクを判断できません。" }
    ],
    risk: "レバレッジETF · 日次リセット、複利、拡大する下落リスクに注意が必要です。"
  },
  ko: {
    summary: "QLD는 수수료와 비용 차감 전 기준 지수의 일일 수익률 2배를 목표로 합니다. 매일 재설정되므로 여러 날의 결과는 지수 수익률을 단순히 두 배 한 값과 크게 달라질 수 있습니다.",
    items: [
      { title: "일일 레버리지", body: "2배 목표는 임의의 보유 기간이 아니라 하루 단위로 적용됩니다." },
      { title: "경로 의존성", body: "복리와 변동성의 영향은 수익률 순서에 따라 유리하거나 불리하게 작용합니다." },
      { title: "확대된 하락 위험", body: "손실도 증폭될 수 있으므로 데모의 상승만으로 위험을 판단할 수 없습니다." }
    ],
    risk: "레버리지 ETF · 일일 재설정, 복리, 확대된 하락 위험에 각별한 주의가 필요합니다."
  }
};


export function getInsight(symbol: SymbolCode, locale: Locale): LocalizedInsight {
  if (symbol === "QLD") return qld[locale];
  if (symbol === "SPCX") throw new Error("FIXTURE_UNAVAILABLE");
  return { ...generic[locale], risk: riskByLocale[locale] };
}
