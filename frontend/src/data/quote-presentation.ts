import { storedResultValid } from "../../../shared/schemas/result-validation.js";
import type { NormalizedQuote } from "../../../services/worker/src/quote-normalizer.js";
import type { Locale, SymbolCode } from "../types/market.js";
import { isLocale } from "../locales/preference.js";

/** Same persisted-result contract, projected once at the display boundary.
 * Invalid or mismatched input is unavailable, never a fabricated replacement. */
export function checkedPriceSnapshot(value: unknown, symbol: SymbolCode, locale: Locale): Readonly<NormalizedQuote> | null {
  try {
    if (!isLocale(locale) || !storedResultValid(value, { operation: "PRICE", symbol, locale })) return null;
    return Object.freeze({ ...(value as NormalizedQuote) });
  } catch { return null; }
}

export function quoteTimestamp(value: string, locale: Locale, zone: "UTC" | "America/New_York"): string {
  // Runtime guards also protect JS callers: an arbitrary zone must not be
  // formatted and then incorrectly labelled as America/New_York.
  if (typeof value !== "string" || !isLocale(locale) || (zone !== "UTC" && zone !== "America/New_York"))
    throw Error("QUOTE_TIMESTAMP_REJECTED");
  const date = new Date(value);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) || !Number.isFinite(date.getTime()) || date.toISOString() !== value)
    throw Error("QUOTE_TIMESTAMP_REJECTED");
  const formatted = new Intl.DateTimeFormat(locale, { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", ...(zone === "UTC" ? {} : { timeZoneName: "shortOffset" }) }).format(date);
  return zone === "UTC" ? `${formatted} UTC` : `${formatted} [America/New_York]`;
}

export function quoteMoney(value: number, currency: string, locale: Locale, signed = false): string {
  if (!Number.isFinite(value) || typeof currency !== "string" || !/^[A-Z]{3}$/.test(currency) ||
      !isLocale(locale) || typeof signed !== "boolean") throw Error("QUOTE_AMOUNT_REJECTED");
  const scientific = value !== 0 && (Math.abs(value) < 1e-8 || Math.abs(value) >= 1e12);
  const formatted = new Intl.NumberFormat(locale, { style: "currency", currency,
    maximumFractionDigits: 8, ...(scientific ? { notation: "scientific" as const } : {}),
    ...(signed ? { signDisplay: "exceptZero" as const } : {}) }).format(value);
  return scientific ? `≈ ${formatted}` : formatted;
}

export function quotePercent(value: number, locale: Locale): string {
  if (!Number.isFinite(value) || !isLocale(locale)) throw Error("QUOTE_PERCENT_REJECTED");
  const scientific = value !== 0 && (Math.abs(value) < 1e-6 || Math.abs(value) >= 1e9);
  // Input is already percentage points. Unit formatting avoids underflow when
  // dividing a subnormal by 100 and avoids multiplying a huge value back up.
  const formatted = new Intl.NumberFormat(locale, { style: "unit", unit: "percent", signDisplay: "exceptZero",
    minimumFractionDigits: 2, maximumFractionDigits: 6, ...(scientific ? { notation: "scientific" as const } : {}) }).format(value);
  return scientific ? `≈ ${formatted}` : formatted;
}
