// Phase 6 i18n scaffold. Constitution X: six locales scaffolded; non-English
// strings ship only when a community translator has reviewed them. Auto-
// translation is forbidden.
//
// For Phase 6 we ship the en strings and load other locales lazily — they
// fall back to en until reviewed. The Settings picker tags non-English
// locales as <beta> so the user knows.

import { useEffect, useState } from "react";

export type Locale = "en" | "zh" | "ar" | "es" | "vi" | "ko";

export const LOCALES: ReadonlyArray<Locale> = ["en", "zh", "ar", "es", "vi", "ko"];

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  zh: "中文 (Mandarin)",
  ar: "العربية (Arabic)",
  es: "Español (Spanish)",
  vi: "Tiếng Việt (Vietnamese)",
  ko: "한국어 (Korean)",
};

/** True when the locale is fully translated and not a beta placeholder. */
export function isLocaleReady(locale: Locale): boolean {
  return locale === "en";
}

const tables: Partial<Record<Locale, Record<string, string>>> = {};
let activeLocale: Locale = "en";
const listeners = new Set<() => void>();

export async function loadLocale(locale: Locale): Promise<void> {
  if (tables[locale]) return;
  try {
    const res = await fetch(`/locales/${locale}.json`);
    if (!res.ok) throw new Error(`fetch ${locale}: ${res.status}`);
    tables[locale] = (await res.json()) as Record<string, string>;
  } catch {
    tables[locale] = {};
  }
}

export function setActiveLocale(locale: Locale): void {
  activeLocale = locale;
  // Inform any subscribed components so they re-render with the new strings.
  for (const fn of listeners) fn();
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/**
 * Look up a translation, falling back to the English table, then the key
 * itself. Designed so that components can call `t("home.title")` and get a
 * sane string even before locales/<lang>.json is loaded.
 */
export function t(key: string, fallbackEn?: string): string {
  const v = tables[activeLocale]?.[key];
  if (v) return v;
  const en = tables.en?.[key];
  if (en) return en;
  return fallbackEn ?? key;
}

/**
 * App-level driver. Loads the en fallback table and the requested locale,
 * then activates it. Idempotent — repeat calls with the same locale are no-ops
 * after the first load.
 */
export function ensureLocale(locale: Locale): Promise<void> {
  return (async () => {
    await loadLocale("en");
    if (locale !== "en") await loadLocale(locale);
    setActiveLocale(locale);
  })();
}

/**
 * Component hook: subscribes the calling component to active-locale changes
 * so it re-renders when the user picks a new language. Returns the bound t().
 */
export function useT(): typeof t {
  const [, force] = useState(0);
  useEffect(() => subscribe(() => force((n) => n + 1)), []);
  return t;
}
