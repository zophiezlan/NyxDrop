// Service worker.
//
// Phase 4 wires the Web Push handlers (push + notificationclick).
// Phase 8 will add real cache strategies (app shell, /api/locations, etc.).

const VERSION = "phase-4";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // Pass-through for Phase 4. Caching strategies land in Phase 8.
});

// -----------------------------------------------------------------------------
// Web Push
// -----------------------------------------------------------------------------

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let data;
  try {
    data = event.data.json();
  } catch {
    return;
  }
  const { title, body, url, tag } = data;
  if (!title || !body) return;
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag: tag || "nl-default",
      data: { url: url || "/" },
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      // Constitution VIII: no celebration; Phase 5 Now-mode is for crises,
      // these are quiet status updates. Default vibration off.
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // Focus an existing tab if one is already open at the target URL.
      for (const client of clients) {
        if ("focus" in client) {
          const u = new URL(client.url);
          if (u.pathname === url) return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    }),
  );
});

console.info("[sw] booted", VERSION);
