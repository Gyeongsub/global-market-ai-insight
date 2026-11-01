import { assets } from "./assets.js";
import { isLocale } from "../locales/preference.js";
import messages from "../locales/search-handoff.json";
import type { JobOperation, Locale, SymbolCode } from "../types/market.js";

// No prompt, account context, referrer or credentials belong in this URL.
export const CHATGPT_URL = "https://chatgpt.com/";

export function buildSearchPrompt(symbol: SymbolCode, operation: JobOperation, locale: Locale): string {
  if (!assets.some(asset => asset.symbol === symbol) || !isLocale(locale) ||
      (operation !== "PRICE" && operation !== "ANALYZE")) throw new Error("SEARCH_SELECTION_INVALID");
  const text = messages[locale];
  return text.template.replace("{symbol}", symbol)
    .replace("{intent}", operation === "PRICE" ? text.priceTask : text.analysisTask);
}

export async function copySearchPrompt(prompt: string, write: (text: string) => Promise<void>): Promise<boolean> {
  try { await write(prompt); return true; } catch { return false; }
}
