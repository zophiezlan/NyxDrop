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
 *
 * Permission is only requested AFTER the first user interaction with the page
 * (pointer or key event), or immediately if the user has already granted on a
 * previous visit. Without this gate, Chrome's auto-prompt fires on page load,
 * Lighthouse flags `geolocation-on-start`, and the user gets a permission
 * dialog before they've even seen the map. Users who never interact with the
 * page (Lighthouse synthetic visits, headless probes) never trigger the ask.
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

    let cancelled = false;
    let started = false;

    const start = () => {
      if (started || cancelled) return;
      started = true;
      setState((s) => ({ ...s, status: "requesting" }));
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
    };

    // Returning user who already granted: ask immediately. The browser's
    // auto-grant skips the prompt, so there's no surprise UX hit and the
    // map centres on the user's location on first paint.
    if (cached === "granted") {
      start();
      return () => {
        cancelled = true;
      };
    }

    // First-time visitor (or cleared cache): wait for any user interaction
    // before triggering the browser's permission prompt.
    const onInteract = () => {
      start();
      detach();
    };
    const detach = () => {
      window.removeEventListener("pointerdown", onInteract);
      window.removeEventListener("keydown", onInteract);
      window.removeEventListener("touchstart", onInteract);
    };
    window.addEventListener("pointerdown", onInteract, { once: true });
    window.addEventListener("keydown", onInteract, { once: true });
    window.addEventListener("touchstart", onInteract, { once: true });

    return () => {
      cancelled = true;
      detach();
    };
  }, []);

  return state;
}
