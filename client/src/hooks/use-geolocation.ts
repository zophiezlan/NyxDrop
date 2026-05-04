import { useEffect, useState } from "react";

// Default geographic centre when geolocation is unavailable. See context.md.
export const MELBOURNE_CBD = { lat: -37.8136, lon: 144.9631 };

export type GeolocationStatus =
  | "idle"
  | "requesting"
  | "granted"
  | "denied"
  | "unavailable";

export interface GeolocationState {
  status: GeolocationStatus;
  position: { lat: number; lon: number };
  /** True if `position` is the Melbourne fallback rather than the device location. */
  isFallback: boolean;
}

const STORAGE_KEY = "nl.geo-permission";

/**
 * Asks the browser for the user's location once, falls back to Melbourne CBD
 * if denied or unavailable. The decision is cached in localStorage so we don't
 * re-prompt on every load.
 */
export function useGeolocation(): GeolocationState {
  const [state, setState] = useState<GeolocationState>(() => ({
    status: "idle",
    position: MELBOURNE_CBD,
    isFallback: true,
  }));

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setState({ status: "unavailable", position: MELBOURNE_CBD, isFallback: true });
      return;
    }

    const cached = localStorage.getItem(STORAGE_KEY);
    if (cached === "denied" || cached === "unavailable") {
      setState({ status: cached, position: MELBOURNE_CBD, isFallback: true });
      return;
    }

    setState((s) => ({ ...s, status: "requesting" }));
    let cancelled = false;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (cancelled) return;
        localStorage.setItem(STORAGE_KEY, "granted");
        setState({
          status: "granted",
          position: { lat: pos.coords.latitude, lon: pos.coords.longitude },
          isFallback: false,
        });
      },
      (err) => {
        if (cancelled) return;
        const status: GeolocationStatus =
          err.code === err.PERMISSION_DENIED ? "denied" : "unavailable";
        localStorage.setItem(STORAGE_KEY, status);
        setState({ status, position: MELBOURNE_CBD, isFallback: true });
      },
      { timeout: 10_000, maximumAge: 60_000 },
    );

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
