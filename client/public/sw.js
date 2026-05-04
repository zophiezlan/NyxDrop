// Service worker stub.
// Real caching strategies (cache-first shell, network-first /api/locations,
// IndexedDB fallback) land in Phase 8 per plan.md "PWA / Service Worker".
// This stub exists from Phase 0 only so the manifest references something real.

const VERSION = "phase-0-stub";

self.addEventListener("install", () => {
  // Take over as soon as installed; no precache yet.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // Pass through. No caching in Phase 0.
});

console.info("[sw] booted", VERSION);
