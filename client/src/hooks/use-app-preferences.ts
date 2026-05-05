import { useCallback, useEffect, useState } from "react";
import { ensureLocale } from "@/lib/i18n";

// Persist accessibility/display preferences in localStorage and apply them to
// <html> via classes/CSS variables. The Settings sheet drives this hook;
// every consumer reads from <html> rather than from the hook directly so
// that Tailwind class variants (`dark:`, `motion-reduce:`) work everywhere.

export type Theme = "light" | "dark" | "system";

export interface AppPreferences {
  theme: Theme;
  /** 12 to 24, in px. Default 16 (browser default). */
  fontSize: number;
  highContrast: boolean;
  reducedMotion: boolean;
  voiceSearchEnabled: boolean;
  /** ISO language code; full i18n switching lands when locales/<lang>.json
   *  is filled by community translators (constitution X). */
  locale: "en" | "zh" | "ar" | "es" | "vi" | "ko";
}

const STORAGE_KEY = "nl.preferences";

export const DEFAULT_PREFERENCES: AppPreferences = {
  theme: "system",
  fontSize: 16,
  highContrast: false,
  reducedMotion: false,
  voiceSearchEnabled: true,
  locale: "en",
};

function read(): AppPreferences {
  if (typeof window === "undefined") return DEFAULT_PREFERENCES;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<AppPreferences>;
    return { ...DEFAULT_PREFERENCES, ...parsed };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

function applyToDocument(prefs: AppPreferences): void {
  if (typeof document === "undefined") return;
  const html = document.documentElement;

  // Theme
  if (prefs.theme === "dark") html.classList.add("dark");
  else if (prefs.theme === "light") html.classList.remove("dark");
  else {
    // "system" — defer to prefers-color-scheme
    const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    html.classList.toggle("dark", dark);
  }

  html.classList.toggle("nl-high-contrast", prefs.highContrast);
  html.classList.toggle(
    "nl-reduced-motion",
    prefs.reducedMotion ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  html.style.setProperty("--nl-font-size", `${prefs.fontSize}px`);

  // Locale + RTL
  html.lang = prefs.locale;
  html.dir = prefs.locale === "ar" ? "rtl" : "ltr";

  // Load the locale's translations and activate it. The i18n module caches
  // tables, so subsequent calls with the same locale return immediately.
  void ensureLocale(prefs.locale);
}

export function useAppPreferences(): {
  preferences: AppPreferences;
  setPreferences: (p: AppPreferences) => void;
  update: <K extends keyof AppPreferences>(key: K, value: AppPreferences[K]) => void;
  reset: () => void;
} {
  const [preferences, setPreferencesState] = useState<AppPreferences>(read);

  // Apply on mount and on every change.
  useEffect(() => {
    applyToDocument(preferences);
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    } catch {
      // Storage may be full or denied; ignore — current session still works.
    }
  }, [preferences]);

  // Cross-tab sync: if another tab updates prefs, mirror them here.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      setPreferencesState(read());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Re-apply when system theme/motion preferences change.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const themeMql = window.matchMedia("(prefers-color-scheme: dark)");
    const motionMql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => applyToDocument(preferences);
    themeMql.addEventListener("change", onChange);
    motionMql.addEventListener("change", onChange);
    return () => {
      themeMql.removeEventListener("change", onChange);
      motionMql.removeEventListener("change", onChange);
    };
  }, [preferences]);

  const update = useCallback(
    <K extends keyof AppPreferences>(key: K, value: AppPreferences[K]) => {
      setPreferencesState((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const reset = useCallback(() => setPreferencesState(DEFAULT_PREFERENCES), []);

  return { preferences, setPreferences: setPreferencesState, update, reset };
}
