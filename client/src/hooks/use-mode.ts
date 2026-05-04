import { useCallback, useEffect, useState } from "react";

export type AppMode = "plan" | "now";

const STORAGE_KEY = "nl.mode";

function readInitialMode(): AppMode {
  if (typeof window === "undefined") return "plan";
  // /emergency deep-link forces Now mode regardless of stored preference.
  if (window.location.pathname === "/emergency") return "now";
  const stored = sessionStorage.getItem(STORAGE_KEY);
  return stored === "now" ? "now" : "plan";
}

/**
 * Mode is a state, not a route (constitution III). The map persists across
 * mode switches; only the chrome and visible pin set differ.
 */
export function useMode(): {
  mode: AppMode;
  setMode: (m: AppMode) => void;
  toggle: () => void;
} {
  const [mode, setModeState] = useState<AppMode>(readInitialMode);

  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY, mode);
  }, [mode]);

  const setMode = useCallback((m: AppMode) => setModeState(m), []);
  const toggle = useCallback(
    () => setModeState((m) => (m === "plan" ? "now" : "plan")),
    [],
  );

  return { mode, setMode, toggle };
}
