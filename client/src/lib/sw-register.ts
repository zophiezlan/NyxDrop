// Service worker registration + update flow.
//
// Registration is gated to production (see main.tsx). Once registered:
//
// 1. The browser fetches /sw.js periodically; when it changes, a new SW
//    moves into `installing` then `waiting` state.
// 2. We watch the registration's `updatefound` event. When the new SW
//    finishes installing, we surface a "tap to refresh" toast (via the
//    custom DOM event `nl:sw-update-available`).
// 3. The Toast handler posts {type: "SKIP_WAITING"} to the waiting SW. The
//    SW activates, fires `controllerchange`, and we reload the page.
//
// This pattern preserves the user's session: nothing reloads until they
// tap the toast.

const SCRIPT_URL = "/sw.js";

export function registerServiceWorker(): void {
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(SCRIPT_URL)
      .then((registration) => {
        // If a new SW is already waiting at registration time, fire the
        // "update available" event immediately. This handles the case where
        // the user has the page open across an update window.
        if (registration.waiting && navigator.serviceWorker.controller) {
          dispatchUpdateAvailable(registration.waiting);
        }

        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            if (
              installing.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              // A new SW finished installing while a previous SW is still
              // controlling the page. Surface the refresh prompt.
              dispatchUpdateAvailable(installing);
            }
          });
        });
      })
      .catch((err) => {
        console.warn("[sw] registration failed", err);
      });

    let reloading = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      // Only reload after the user has explicitly opted in (which sets the
      // dispatch flag below). Without this guard a fresh first install
      // would also trigger a reload.
      if (!reloading && (window as unknown as { __nlSwRefreshing?: boolean }).__nlSwRefreshing) {
        reloading = true;
        window.location.reload();
      }
    });
  });
}

function dispatchUpdateAvailable(worker: ServiceWorker): void {
  const ev = new CustomEvent<{ activate: () => void }>("nl:sw-update-available", {
    detail: {
      activate: () => {
        (window as unknown as { __nlSwRefreshing?: boolean }).__nlSwRefreshing = true;
        worker.postMessage({ type: "SKIP_WAITING" });
      },
    },
  });
  window.dispatchEvent(ev);
}
