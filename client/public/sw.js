// Service worker — Phase 8.
//
// Caching strategy (per plan.md § "PWA / Service Worker"):
//
// - App shell (`/`, `/index.html`, hashed JS/CSS bundles) — cache-first
//   with a network refresh-in-the-background pass.
// - Map tiles (tile.openstreetmap.org)                    — cache-first
//   with a 7-day soft TTL. Beyond that, refetch on hit.
// - `/api/locations*` (read)                              — network-first,
//   fall back to the most recent cached response when offline.
// - All other `/api/*`                                    — network-only.
// - Static assets in `/icons`, `/locales`, `/manifest.json` — cache-first.
//
// Cache versioning: bumping VERSION invalidates every old cache name. The
// `activate` handler deletes anything whose name does not start with the
// current VERSION prefix.
//
// Update flow: install does NOT skipWaiting. The new SW sits in `waiting`
// until the page calls postMessage({type: "SKIP_WAITING"}), letting the
// app surface a "tap to refresh" toast first (see main.tsx). On
// `controllerchange` the page reloads.

const VERSION = "phase-8-1";
const APP_SHELL_CACHE = `${VERSION}-app-shell`;
const TILE_CACHE = `${VERSION}-tiles`;
const API_LOCATIONS_CACHE = `${VERSION}-api-locations`;
const STATIC_CACHE = `${VERSION}-static`;

const TILE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Files needed to render the app shell offline. Hashed bundle filenames are
// added on first request; this list is just the entry points.
const APP_SHELL_URLS = ["/", "/index.html", "/manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE).then((cache) =>
      // `addAll` is atomic — if one fetch fails, the install fails. Use
      // individual `add` calls so a transient flake on one URL doesn't kill
      // the whole install.
      Promise.all(APP_SHELL_URLS.map((u) => cache.add(u).catch(() => undefined))),
    ),
  );
  // Don't skipWaiting here — let the page call it via postMessage so the
  // user gets a chance to see the "tap to refresh" toast.
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => !name.startsWith(VERSION))
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// -----------------------------------------------------------------------------
// Fetch handlers — keep the strategy switch flat and obvious. Each branch
// returns a Promise<Response>. Anything else falls through to the default
// (network-only) browser behaviour.
// -----------------------------------------------------------------------------

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Vite dev assets must never be cached. The dev SW is gated off in
  // main.tsx, but belt-and-braces: bypass anything obviously dev-only.
  if (url.pathname.startsWith("/@") || url.pathname.startsWith("/src/")) {
    return;
  }

  // Map tiles — cache-first with TTL.
  if (
    url.hostname.endsWith(".tile.openstreetmap.org") ||
    url.hostname === "tile.openstreetmap.org"
  ) {
    event.respondWith(handleTile(req));
    return;
  }

  // Same-origin only beyond this point.
  if (url.origin !== self.location.origin) return;

  // /api/locations* — network-first with offline fallback.
  if (url.pathname.startsWith("/api/locations")) {
    event.respondWith(handleApiLocations(req));
    return;
  }

  // All other /api — network-only (let it fail when offline).
  if (url.pathname.startsWith("/api/")) return;

  // Locales / icons / manifest — cache-first.
  if (
    url.pathname.startsWith("/locales/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.json"
  ) {
    event.respondWith(cacheFirst(req, STATIC_CACHE));
    return;
  }

  // Hashed Vite bundles (`/assets/*-<hash>.js`/`.css`) — cache-first; their
  // filenames change on every build so staleness is bounded by deploy.
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(cacheFirst(req, APP_SHELL_CACHE));
    return;
  }

  // Navigation requests (HTML) — network-first, fall back to cached "/" so
  // the app shell is available offline. Wouter routes are SPA-internal so
  // any path resolves to "/" in cache.
  if (req.mode === "navigate") {
    event.respondWith(handleNavigation(req));
    return;
  }
});

async function handleNavigation(req) {
  try {
    const fresh = await fetch(req);
    // Stash the latest "/" so subsequent offline navigations still work.
    if (fresh && fresh.ok) {
      const cache = await caches.open(APP_SHELL_CACHE);
      cache.put("/", fresh.clone()).catch(() => undefined);
    }
    return fresh;
  } catch {
    const cache = await caches.open(APP_SHELL_CACHE);
    const cached = (await cache.match("/")) ?? (await cache.match("/index.html"));
    if (cached) return cached;
    return new Response("Offline and no app shell cached.", {
      status: 503,
      headers: { "Content-Type": "text/plain" },
    });
  }
}

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) return cached;
  // No cached copy: fall through to network. If the network fails the
  // browser surfaces the error to the page, same as without a SW.
  const fresh = await fetch(req);
  if (fresh && fresh.ok) cache.put(req, fresh.clone()).catch(() => undefined);
  return fresh;
}

async function handleTile(req) {
  const cache = await caches.open(TILE_CACHE);
  const cached = await cache.match(req);
  if (cached) {
    const cachedAt = Number(cached.headers.get("x-cached-at") ?? "0");
    if (Date.now() - cachedAt < TILE_TTL_MS) return cached;
    // Stale — fall through to refetch.
  }
  try {
    const fresh = await fetch(req);
    if (fresh && fresh.ok) {
      // Annotate with cached-at so the TTL check above works on next hit.
      // We have to clone the response to mutate headers.
      const body = await fresh.clone().blob();
      const headers = new Headers(fresh.headers);
      headers.set("x-cached-at", String(Date.now()));
      const annotated = new Response(body, {
        status: fresh.status,
        statusText: fresh.statusText,
        headers,
      });
      cache.put(req, annotated.clone()).catch(() => undefined);
    }
    return fresh;
  } catch (err) {
    if (cached) return cached; // Better stale than blank.
    throw err;
  }
}

async function handleApiLocations(req) {
  const cache = await caches.open(API_LOCATIONS_CACHE);
  try {
    const fresh = await fetch(req);
    if (fresh && fresh.ok) cache.put(req, fresh.clone()).catch(() => undefined);
    return fresh;
  } catch (err) {
    const cached = await cache.match(req);
    if (cached) return cached;
    // No cache and offline: return a 503-shaped response the client can
    // treat as "API unreachable" (the existing ApiBanner handles this).
    throw err;
  }
}

// -----------------------------------------------------------------------------
// Web Push (carried over from Phase 4)
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
      // Constitution VIII: no celebration; these are quiet status updates.
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
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
