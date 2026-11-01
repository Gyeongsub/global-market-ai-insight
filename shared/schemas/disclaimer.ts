import type { Locale } from "../../services/controller/src/contracts.js";

const disclaimers: Record<Locale, string> = {
  en: "Educational market insight only — not financial advice.",
  ja: "教育目的の市場インサイトであり、金融アドバイスではありません。",
  ko: "교육 목적의 시장 인사이트이며 금융 자문이 아닙니다.",
};

export function canonicalDisclaimer(locale: Locale): string {
  return disclaimers[locale];
}
