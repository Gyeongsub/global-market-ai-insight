import type { Locale } from "../types/market";

type PreferenceStorage = Pick<Storage, "getItem" | "setItem">;
const key = "gmai-locale";

export function isLocale(value: unknown): value is Locale {
  return value === "en" || value === "ja" || value === "ko";
}

// Accessing localStorage itself can throw, not only getItem/setItem.
export function readLocale(storage: () => PreferenceStorage): Locale {
  try {
    const saved = storage().getItem(key);
    return isLocale(saved) ? saved : "en";
  } catch { return "en"; }
}

export function saveLocale(locale: Locale, storage: () => PreferenceStorage): boolean {
  if (!isLocale(locale)) return false;
  try { storage().setItem(key, locale); return true; }
  catch { return false; }
}
