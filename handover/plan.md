# Technical Plan

How to build what `spec.md` describes. Stack, structure, build, deploy.

This document does not describe *what* the app does (see `spec.md`) or *why* (see `vision.md`). It describes the technical approach and the constraints the agent must work within.

---

## Stack decisions

| Layer | Choice | Reason |
|---|---|---|
| Language | TypeScript 5.6+ everywhere | Single language client + server + shared schema |
| Frontend framework | React 18 | Mature, accessible component model, large ecosystem |
| Build tool | Vite | Fast HMR, sane production builds |
| Routing | wouter | Tiny (~1.5KB), no provider tree complexity, hooks-based |
| Server state | TanStack Query v5 | Cache, refetch, mutations, optimistic updates |
| Styling | Tailwind CSS + shadcn/ui (curated) | Utility-first, no custom design system maintenance |
| Maps | react-leaflet over Leaflet 1.9 | OSS, OpenStreetMap tiles, performant, well-typed |
| Forms | react-hook-form + zod | Validation aligned with shared schema |
| HTTP framework | Express 4 | Boring, well-understood, single-port deployment |
| ORM | Drizzle ORM | Type-safe, schema-first, no codegen step |
| Database | PostgreSQL via Neon serverless | Branching, edge-friendly, generous free tier |
| Schema validation | drizzle-zod | One source of truth for DB + API + client types |
| Offline storage | IndexedDB via raw API (no wrapper) | Smaller bundle, full control over upgrade path |
| Push | Web Push (VAPID) via `web-push` server library | Self-hosted, no third party, no vendor lock-in |
| PWA | Vanilla service worker (no Workbox) | Predictable, small, debuggable |
| Voice | Web Speech API directly | No third-party speech services |
| i18n | Custom thin layer (~150 LOC) | No i18next; simple translation table by locale |
| Testing | Vitest (unit) + Playwright (E2E) | Same Vite config, fast feedback |
| Linting | ESLint flat config + Prettier | Standard |

### What we explicitly reject

- **No auth library on the public app** (no NextAuth, no Passport, no Clerk). The public app has no users.
- **No state management library** (no Redux, Zustand, Jotai). React state + TanStack Query is enough.
- **No animation library beyond Tailwind transitions and `framer-motion` *only if* a specific micro-interaction needs it.** Default to CSS.
- **No CSS-in-JS runtime.** Tailwind only.
- **No analytics SDK that links to a person.** If aggregate metrics are needed, server-side counters only, never client identifiers.
- **No Workbox.** Vanilla service worker.
- **No GraphQL.** REST/JSON over Express.

## Repository layout

```
.
├── client/
│   ├── index.html
│   ├── public/
│   │   ├── manifest.json
│   │   ├── sw.js                    # service worker
│   │   ├── icons/                   # PWA icons (192, 512, maskable)
│   │   └── locales/                 # JSON translation files (en.json first)
│   └── src/
│       ├── main.tsx                 # entry, registers SW
│       ├── App.tsx                  # router + providers
│       ├── routes/
│       │   ├── map.tsx              # / and /m/:id and /r/:id
│       │   ├── about.tsx            # /about
│       │   ├── me.tsx               # /me
│       │   └── guardian/            # /guardian admin tool
│       ├── components/
│       │   ├── map/                 # InteractiveMap, Pin, ClusterPin, UserLocationDot
│       │   ├── sheets/              # DetailSheet, ReportSheet, FilterSheet, SettingsSheet, MyPlacesSheet
│       │   ├── now-mode/            # NowModeOverlay, DrsabcdCard, Call000Button
│       │   ├── ui/                  # curated shadcn primitives (~10 max)
│       │   └── shared/              # Navigation, ModeToggle, ErrorBoundary, OfflineBanner
│       ├── hooks/
│       │   ├── use-device-key.ts
│       │   ├── use-mode.ts          # plan vs now state
│       │   ├── use-locations.ts     # TanStack queries for locations
│       │   ├── use-report.ts        # report mutation + offline queue
│       │   ├── use-watches.ts
│       │   ├── use-saved-places.ts
│       │   ├── use-push.ts
│       │   ├── use-i18n.ts
│       │   └── use-voice-search.ts
│       ├── lib/
│       │   ├── device-key.ts        # localStorage random key
│       │   ├── offline-queue.ts     # IndexedDB report queue
│       │   ├── i18n.ts              # tiny translation lookup
│       │   ├── format.ts            # relativeTime, distance, currency
│       │   └── api.ts               # fetch wrapper + error normalisation
│       └── styles/
│           └── globals.css
├── server/
│   ├── index.ts                     # express bootstrap, single port
│   ├── routes/
│   │   ├── locations.ts
│   │   ├── reports.ts
│   │   ├── saved-places.ts
│   │   ├── watches.ts
│   │   ├── guardian-notes.ts
│   │   ├── push.ts
│   │   └── guardian-admin.ts        # /api/guardian/*
│   ├── lib/
│   │   ├── db.ts                    # drizzle client
│   │   ├── consensus.ts             # imports from shared/consensus.ts
│   │   ├── push.ts                  # web-push helpers
│   │   ├── auth.ts                  # guardian token verification
│   │   ├── rate-limit.ts            # in-memory + DB-backed for reports
│   │   └── security-headers.ts
│   ├── jobs/
│   │   └── decay-weights.ts         # hourly cron-ish task
│   └── scripts/
│       ├── seed.ts                  # seed Australian locations
│       ├── seed-admin.ts            # bootstrap super-admin guardian token
│       └── generate-vapid.ts
├── shared/
│   ├── schema.ts                    # drizzle tables + zod insert schemas + TS types
│   └── consensus.ts                 # pin status, reliability, decay, barrier surfacing
├── tests/
│   └── e2e/
│       ├── plan-mode.spec.ts
│       ├── now-mode.spec.ts
│       ├── report-flow.spec.ts
│       ├── offline.spec.ts
│       ├── accessibility.spec.ts
│       └── guardian-admin.spec.ts
├── handover/                        # this directory
├── .env.example
├── drizzle.config.ts
├── eslint.config.js
├── package.json
├── playwright.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── vite.config.ts
└── vitest.config.ts
```

## Path aliases

Mirror across `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`:

```ts
"@/*": ["./client/src/*"]
"@shared/*": ["./shared/*"]
"@server/*": ["./server/*"]   // tests and scripts only; don't import server from client
```

## Single-port deployment

Express serves both the API (`/api/*`) and the React app (Vite middleware in dev, static `dist/public` in production). One port, one process. This makes Railway/Fly/Render deployment trivial.

```ts
// server/index.ts (sketch)
import "dotenv/config";
import express from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic } from "./vite";
import { securityHeaders } from "./lib/security-headers";

const app = express();
app.disable("x-powered-by");
app.use(securityHeaders);
app.use(express.json({ limit: "100kb" }));

registerRoutes(app);

const isProd = process.env.NODE_ENV === "production";
const server = app.listen(parseInt(process.env.PORT ?? "5000"), "0.0.0.0");

if (isProd) {
  serveStatic(app);
} else {
  await setupVite(app, server);
}
```

`dotenv/config` is the very first import. Without it, `DATABASE_URL` is undefined and the Drizzle client throws on startup.

## Cross-platform scripts

`package.json` scripts use `cross-env` so they work on Windows, macOS, and Linux:

```json
{
  "scripts": {
    "dev": "cross-env NODE_ENV=development tsx server/index.ts",
    "start": "cross-env NODE_ENV=production node dist/index.js",
    "build": "vite build && esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist",
    "check": "tsc",
    "db:push": "drizzle-kit push",
    "db:seed": "tsx server/scripts/seed.ts",
    "test": "vitest --project unit",
    "test:e2e": "playwright test",
    "lint": "eslint .",
    "format": "prettier --write ."
  }
}
```

The `vitest --project unit` flag scopes Vitest to unit tests only; Playwright `*.spec.ts` files in `tests/e2e/` must not be picked up by Vitest's include glob.

## Schema as single source of truth

`shared/schema.ts` defines the Postgres schema (Drizzle), the API validators (drizzle-zod's `createInsertSchema`), and the TS types (`$inferSelect`). Both client and server import from `@shared/schema`.

Editing this file changes the database schema, the API validation, and the client types simultaneously. After structural changes, run `npm run db:push`.

## Trust algorithms in `shared/`

`shared/consensus.ts` exports pure functions used by both client and server:

- `calculatePinStatus(reports: Report[]): { status, label }` — recency
- `calculateReliabilityScore(reports: Report[]): number` — long-term
- `calculateReportWeight(timestamp: Date): number` — decay
- `calculatePinSize(totalReports: number): number` — confidence sizing
- `surfaceBarrierFacts(reports: Report[]): BarrierFact[]` — headline facts
- `haversineDistance(a, b): number` — km

Importing from `@shared/consensus` from anywhere is allowed. The server uses these to compute the `LocationWithConsensus` shape; the client uses the same functions for client-side recomputation if reports change locally (e.g., user just submitted a report and we want the pin to update before the server roundtrip).

The math itself is in `algorithms.md`. Tests for these functions live in `shared/__tests__/consensus.test.ts` and run under Vitest.

## Device key

A 16-byte random ID, hex-encoded, generated with `crypto.getRandomValues` on first open and stored in `localStorage` under key `nl.device-key`. The device key is sent in a custom header `X-Device-Key` on every API request that mutates state or queries personal data.

```ts
// client/src/lib/device-key.ts
export function getDeviceKey(): string {
  let key = localStorage.getItem("nl.device-key");
  if (!key) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    key = Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
    localStorage.setItem("nl.device-key", key);
  }
  return key;
}

export function forgetDevice() {
  localStorage.clear();
  // Also wipe IndexedDB
  indexedDB.deleteDatabase("nl-offline");
}
```

The server treats `X-Device-Key` as opaque. It is used as the `device_fingerprint` column in `reports`, `device_reports`, `saved_places`, `watches`, and `push_subscriptions`. It is **never** logged.

## Offline queue

IndexedDB database `nl-offline`, two object stores:

- `pending-reports` — keyed by client-generated UUID, contains the full `InsertReport` plus a `queuedAt` timestamp and `retryCount`
- `cached-locations` — keyed by `id`, stores last-seen `LocationWithConsensus` payloads with a TTL of 24h

On regaining connectivity (`window.online` event or successful response after failure), drain `pending-reports` in order, oldest first. On 200, delete; on 4xx, surface to user; on 5xx or network error, increment `retryCount` and back off exponentially up to 5 attempts.

The service worker also reads `cached-locations` to serve `/api/locations` requests when the network fails.

## PWA / Service Worker

`client/public/sw.js`. Vanilla, no Workbox. Strategies:

- **App shell** (`index.html`, `main.js`, `main.css`, fonts) — cache-first
- **Map tiles** — cache-first with 7-day expiry
- **`/api/locations` (read)** — network-first, fall back to IndexedDB `cached-locations`
- **All other API** — network-only (no offline mutations except via the explicit queue path in `lib/offline-queue.ts`)
- **Static assets in `public/`** — cache-first

`registerServiceWorker()` is called once from `client/src/main.tsx` after the app mounts. Update flow: on `controllerchange`, show a non-blocking toast: *"New version available — tap to refresh."*

## Web Push (VAPID)

`scripts/generate-vapid.ts` generates a VAPID keypair on first install:

```ts
import webpush from "web-push";
const keys = webpush.generateVAPIDKeys();
console.log("VAPID_PUBLIC_KEY=" + keys.publicKey);
console.log("VAPID_PRIVATE_KEY=" + keys.privateKey);
```

Output goes into `.env`. The client receives `VAPID_PUBLIC_KEY` via a `/api/push/vapid-public-key` endpoint at runtime (do not bake into bundle — easier to rotate).

Subscription flow:

1. User enables their first watch
2. Client calls `Notification.requestPermission()` after a custom pre-prompt
3. Client calls `serviceWorkerRegistration.pushManager.subscribe()` with the public key
4. Client POSTs the subscription JSON to `/api/push/subscribe` along with `X-Device-Key`
5. Server stores in `push_subscriptions` table

Sending: a server-side function `sendPushToDevice(deviceKey, payload)` looks up subscriptions by device key and uses `webpush.sendNotification`. Failed sends with HTTP 410 (Gone) prune the subscription.

Triggers (in `server/jobs/`):

- After a new report changes a watched location's pin status → enqueue alert
- After a new guardian note on a watched location → enqueue alert
- After a new location is added within 5km of a user's "home" saved place (opt-in) → enqueue alert

## Rate limiting

Two layers:

- **Reports** — DB-backed: `device_reports` table tracks last-report-time per `(device_fingerprint, location_id)`. The `POST /api/reports` handler checks this and returns 429 if within 24h.
- **General API** — in-memory token bucket per IP, 100 requests / 15 minutes, applied via middleware. Acceptable for single-instance deployment; revisit if scaling horizontally.

## Security headers

```
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=(self), microphone=(self)
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://*.tile.openstreetmap.org; connect-src 'self'; manifest-src 'self'
```

`unsafe-inline` for styles is regrettable but Tailwind-injected styles depend on it; alternative is a hash list which is fragile across builds.

## Guardian admin auth

Bcrypt-hashed token. The token is the password — there is no username. On `/api/guardian/login`, compare submitted token against stored hash. On match, set an HttpOnly Secure SameSite=Strict session cookie containing a server-side session ID.

Sessions stored in Postgres (`guardian_sessions` table), 24h expiry. No `express-session` package; a 60-line custom middleware is enough.

Tokens are generated by `scripts/seed-admin.ts` (super-admin only) or by an authenticated super-admin via the dashboard. Token format: 32 bytes base64url, displayed once at issuance, never retrievable again.

## i18n

Custom thin layer in `client/src/lib/i18n.ts`. Translation tables are JSON files in `client/public/locales/<lang>.json`. Loaded lazily via dynamic import on locale change.

```ts
// client/src/lib/i18n.ts
type Locale = "en" | "zh" | "ar" | "es" | "vi" | "ko";
const tables: Partial<Record<Locale, Record<string, string>>> = {};

export async function setLocale(locale: Locale) {
  if (!tables[locale]) {
    tables[locale] = await fetch(`/locales/${locale}.json`).then(r => r.json());
  }
  localStorage.setItem("nl.locale", locale);
  document.documentElement.lang = locale;
  document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
}

export function t(key: string): string {
  const locale = (localStorage.getItem("nl.locale") ?? "en") as Locale;
  return tables[locale]?.[key] ?? tables.en?.[key] ?? key;
}
```

`en.json` ships first. Other locales scaffold with English fallback and a `<beta>` badge in the language picker until reviewed by a community translator.

## Build and deploy

Target: Railway (or any single-process Node host). `railway.toml`:

```toml
[build]
builder = "NIXPACKS"
buildCommand = "npm ci && npm run build"

[deploy]
startCommand = "npm start"
healthcheckPath = "/api/health"
healthcheckTimeout = 30
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 5

[[env]]
name = "NODE_ENV"
value = "production"

[[env]]
name = "NODE_VERSION"
value = "20"
```

`/api/health` returns `{ status: "ok", time: <iso> }` — used by Railway healthcheck and by uptime monitors.

Required env vars:

```
DATABASE_URL          # Neon postgres connection string
SESSION_SECRET        # 32+ chars, used for guardian session signing
VAPID_PUBLIC_KEY
VAPID_PRIVATE_KEY
VAPID_SUBJECT         # mailto:guardians@<domain>
ADMIN_BOOTSTRAP_TOKEN # one-time use; first super-admin is created with this
PORT                  # set by Railway
```

## Performance budgets

Hard targets the build must meet:

- Initial JS bundle: ≤ 200KB gzipped
- First Contentful Paint on 3G: ≤ 2.5s
- Time to Interactive on 3G: ≤ 5s
- Lighthouse Performance: ≥ 85
- Lighthouse Accessibility: ≥ 95
- Lighthouse Best Practices: ≥ 95
- Lighthouse SEO: ≥ 90
- Lighthouse PWA: pass

Achieved by:

- Lazy-loading routes (`React.lazy` per route file)
- Lazy-loading `/about` content (it's large)
- Code-splitting Leaflet (~140KB) — only loaded on `/`
- Map tile prefetch limited to current viewport
- TanStack Query default `staleTime: 60_000`

## Testing strategy

- **Unit tests** for `shared/consensus.ts` — every algorithm has at least 5 test cases including edge cases (empty reports, all old reports, single report, mixed)
- **Component tests** for sheets and the report flow using `@testing-library/react`
- **E2E tests** with Playwright covering: open → see pins → tap pin → submit report → see updated pin; mode toggle; offline submit and resync; voice search if browser supports; guardian admin token issuance and note posting
- **Accessibility** tests with `@axe-core/playwright` on every critical screen

CI runs `npm run check && npm run lint && npm run test && npm run test:e2e` on every PR.

## Observability

Light-touch:

- Server logs JSON lines via `pino` to stdout. Fields: `level`, `time`, `msg`, `path`, `method`, `status`, `duration_ms`. **Never** log device keys.
- Client errors caught by ErrorBoundary log to console; in production, stub a `reportError(err)` function for future Sentry integration but don't include any third-party SDK in the initial bundle.
- One server-side counter table: `daily_metrics` with columns `date`, `reports_submitted`, `locations_added`, `notes_posted`. Updated by a daily cron-ish job. Powers the `/about` numbers without needing analytics SDK.
