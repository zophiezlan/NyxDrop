# Phased Build Plan

Eight phases. Each phase is independently demoable and ships a real piece of the product. Within a phase, tasks are roughly sequential but may be parallelised where independent.

Each phase ends with a **demo gate**: a concrete check the agent must pass before moving on. Don't skip these — moving forward on a broken foundation compounds.

The companion `prompts.md` has ready-to-paste agent prompts for each phase.

---

## Phase 0 — Foundation (≈1 day)

Get a clean repo running locally on a developer machine on any OS, with database, build, test, and lint all green.

### Tasks

- [ ] Initialise git repo with a sensible `.gitignore`
- [ ] `package.json` with the stack from `plan.md`. Use **`cross-env`** for `NODE_ENV` in scripts.
- [ ] `tsconfig.json` strict, with path aliases `@/*`, `@shared/*`, `@server/*`
- [ ] `vite.config.ts` with React plugin, the same path aliases, and `client/` as root
- [ ] `vitest.config.ts` scoped to unit tests only (do not include `tests/e2e/**`)
- [ ] `playwright.config.ts` pointing at `tests/e2e/`, baseURL `http://localhost:5000`
- [ ] `eslint.config.js` (flat config) + `.prettierrc`
- [ ] `tailwind.config.ts`, `postcss.config.js`, `client/src/styles/globals.css`
- [ ] `drizzle.config.ts` with `DATABASE_URL` from env
- [ ] `.env.example` with the variables listed in `plan.md` § "Build and deploy"
- [ ] **Add `import "dotenv/config"` as the FIRST import in `server/index.ts` and `drizzle.config.ts`** — non-negotiable
- [ ] `server/index.ts` boots Express, applies security headers, registers a single `/api/health` route, hosts Vite middleware in dev or `dist/public` in prod
- [ ] `client/src/main.tsx` and `client/src/App.tsx` render an empty `<div>Hello</div>`
- [ ] `client/index.html` with the basic meta tags, manifest link, theme colour
- [ ] `client/public/manifest.json` and a stub `sw.js` that does nothing yet
- [ ] One Australian icon set in `client/public/icons/` (192, 512, maskable)
- [ ] `railway.toml` with `/api/health` healthcheck

### Demo gate

```
npm install
npm run check       # passes with 0 errors
npm run lint        # passes
npm run dev         # boots, serves on :5000 on Windows AND macOS AND Linux
curl http://localhost:5000/api/health  # returns {"status":"ok",...}
```

---

## Phase 1 — Read path (≈2 days)

Render the map. Show pins. Tap a pin, see a detail sheet. No reports yet, no auth, no offline.

### Tasks

- [ ] `shared/schema.ts` — define `locations`, `reports`, `device_reports` tables (Phase 2 fills the others)
- [ ] `shared/consensus.ts` stub functions (return placeholders); real implementation in Phase 3
- [ ] `npm run db:push` works against a Neon dev branch
- [ ] `server/scripts/seed.ts` seeds ~30 real Australian locations (sourced from open NSP directory + the existing seed file as reference) plus ~10 reports per location
- [ ] `server/routes/locations.ts` implements `GET /api/locations`, `GET /api/locations/:id`, `GET /api/locations/search`
- [ ] `client/src/lib/device-key.ts`
- [ ] `client/src/lib/api.ts` — fetch wrapper that injects `X-Device-Key`
- [ ] `client/src/hooks/use-locations.ts` — TanStack queries
- [ ] `client/src/components/map/InteractiveMap.tsx` — react-leaflet, OSM tiles, pin rendering (size + colour + border + glyph per `algorithms.md`)
- [ ] `client/src/components/map/UserLocationDot.tsx`
- [ ] `client/src/components/sheets/DetailSheet.tsx` — slides up from bottom, drag to expand/dismiss; renders all sections in `spec.md` §5 (guardian notes section can render empty array for now)
- [ ] `client/src/routes/map.tsx` — handles `/`, `/m/:id`, `/r/:id`
- [ ] Geolocation permission flow with Melbourne fallback
- [ ] Onboarding overlay (one-time)
- [ ] Lazy-load Leaflet (separate chunk)

### Demo gate

```
- Open / on a phone-sized viewport
- See ~30 pins centred on user location (or Melbourne)
- Pins are appropriately coloured/sized/bordered/glyphed
- Tap a pin → detail sheet rises with name, address, hours, fact rows, recent reports
- Refresh on /m/<id> deep-links to that pin's detail
- Lighthouse Performance ≥ 80 on localhost
```

---

## Phase 2 — Write path (≈2 days)

Submit reports, including soft barriers. Rate-limit. Queue offline.

### Tasks

- [ ] Finish all `shared/schema.ts` tables (`saved_places`, `watches`, `guardian_*`, `push_subscriptions`, `daily_metrics`)
- [ ] Insert Zod schemas with the validation rules from `data-model.md`
- [ ] `server/routes/reports.ts` — `POST /api/reports`, `POST /api/reports/check`, `GET /api/locations/:id/reports`
- [ ] `server/lib/rate-limit.ts` — DB-backed report rate limiting via `device_reports`
- [ ] `client/src/components/sheets/ReportSheet.tsx` — full multi-step flow per `spec.md` §6
- [ ] `client/src/lib/offline-queue.ts` — IndexedDB queue with retry/backoff
- [ ] `client/src/hooks/use-report.ts` — mutation that handles online/offline branching
- [ ] On submit, optimistically update the location's recent reports
- [ ] Acknowledgment toast with the *"N people have used reports like yours"* sentence
- [ ] Wire `I went here` and `Add a place` buttons in the bottom action bar
- [ ] `server/routes/locations.ts` — implement `POST /api/locations`
- [ ] Add-a-place flow as Step 0 of report sheet

### Demo gate

```
- Tap I went here → submit a success report → see new report appear in detail timeline
- Submit a success_but with two barriers → see them stored, see the new report
- Try to submit twice in 24h → see 429 with "try again tomorrow" message
- Disable network → submit a report → see "queued" toast → re-enable → see report syncs without user action
- Add a brand new place via the report sheet → it appears as a pin on the map
```

---

## Phase 3 — Trust algorithms (≈1.5 days)

Real consensus math. Pin status reflects recent reports. Reliability stars work. Aggregate barrier facts surface.

### Tasks

- [ ] Implement all functions in `shared/consensus.ts` per `algorithms.md`
- [ ] `shared/__tests__/consensus.test.ts` — every test case listed in `algorithms.md` §10
- [ ] Server's `getLocationsWithConsensus` and `getLocationWithConsensus` use the real functions
- [ ] After each report insert, recompute denormalised `totalReportsCount`, `reliabilityScore`, `lastReportAt` on the location row
- [ ] Hourly weight-decay job (`server/jobs/decay-weights.ts`)
- [ ] Detail sheet renders headline barrier facts
- [ ] Pin status / size / label all driven by real math
- [ ] Pin-status flip detection function (used for notifications in Phase 4)

### Demo gate

```
- Run npm test → all consensus tests pass
- A location with 5 consecutive success reports is green and 4-5 stars
- A location with 5 denied reports is red and 0-1 stars
- A location with 3 success_but reports including id_required shows
  "ID sometimes reported recently" in the detail sheet
- A location whose only report is 8 days old is grey
- Manually bump submittedAt back 48 hours → confirm weight halves
```

---

## Phase 4 — Personal layer (≈1.5 days)

Saved places, watches, web push.

### Tasks

- [ ] `server/routes/saved-places.ts` — full CRUD per `contracts.md`
- [ ] `server/routes/watches.ts` — full CRUD
- [ ] `server/routes/push.ts` — `POST /api/push/subscribe`, `DELETE /api/push/subscribe`, `GET /api/push/vapid-public-key`
- [ ] `scripts/generate-vapid.ts` — generate VAPID keypair, print env vars
- [ ] `server/lib/push.ts` — `sendPushToDevice(deviceKey, payload)`, `sendPushToWatchers(locationId, payload)`
- [ ] Pin-status-flip hook fires watch alerts (with 6h per-watcher suppression)
- [ ] `client/src/hooks/use-saved-places.ts`, `use-watches.ts`, `use-push.ts`
- [ ] `client/src/components/sheets/MyPlacesSheet.tsx` — Saved / Visited / Watching tabs per `spec.md` §8; opened from `/`, `/me`, or the 👤 button. `/me` is a deep-link variant of `/` that auto-opens this sheet — not a separate route.
- [ ] *Forget this device* button: clears localStorage, IndexedDB, calls `POST /api/device/forget`
- [ ] Pre-prompt UX before browser push permission ask
- [ ] Service worker handles `push` and `notificationclick` events
- [ ] Detail sheet's Save/Watch buttons wire up

### Demo gate

```
- Save a place → it appears in /me → Saved
- Toggle watch on → on a separate browser, submit a report that flips status →
  watcher sees a push notification within seconds
- Tap notification → opens /m/<id>
- Forget this device → /me empties; saved place no longer in DB
```

---

## Phase 5 — Modes & emergency (≈1 day)

Plan vs Now mode. Crisis state expressed as a state, not a route.

### Tasks

- [ ] `client/src/hooks/use-mode.ts` — global mode state (Plan default; persisted in URL or sessionStorage)
- [ ] `client/src/components/shared/ModeToggle.tsx` — sticky two-segment control
- [ ] `client/src/components/now-mode/NowModeOverlay.tsx` — background tint, top Call 000 button
- [ ] `client/src/components/now-mode/Call000Button.tsx`
- [ ] `client/src/components/now-mode/DrsabcdCard.tsx`
- [ ] In Now mode: hide red/grey pins, auto-zoom to nearest 3 green/amber, swap detail sheet to minimal variant
- [ ] `/emergency` deep link boots in Now mode with a sessionStorage flag
- [ ] Mode switch does not lose map state
- [ ] *I'm OK now* button restores Plan mode
- [ ] Keyboard shortcut Ctrl+E enters Now mode
- [ ] Plan mode filter sheet with all sections including the headline-barrier filter

### Demo gate

```
- Tap Now → background tints, only green/amber pins visible, Call 000 prominent,
  DRSABCD card at bottom
- Pin tap shows the minimal variant
- Tap I'm OK now → returns to Plan, same map position
- Visit /emergency cold → boots straight into Now mode
- In Plan mode, enable "Hide places where ID was asked recently" → pins disappear
  for places matching the rule, chip shows "Hiding N places…"
```

---

## Phase 6 — Polish: search, accessibility, i18n, /about (≈2 days)

The pieces that make it a real app, not a tech demo.

### Tasks

- [ ] Search bar with text autocomplete (debounced 200ms)
- [ ] Voice search via Web Speech API (only mounted if supported)
- [ ] "Search this area" button after pan/zoom
- [ ] `client/src/lib/i18n.ts` and `client/public/locales/en.json` (full string coverage)
- [ ] Scaffold `zh.json`, `ar.json`, `es.json`, `vi.json`, `ko.json` with English fallbacks and `<beta>` tags in language picker
- [ ] RTL support for `ar` (set `dir` on `<html>`)
- [ ] `Settings` sheet with all controls in `spec.md` §12
- [ ] High-contrast mode CSS
- [ ] Reduced-motion mode that disables transitions/animations
- [ ] Adjustable font size with CSS custom property
- [ ] `client/src/routes/about.tsx` — the consolidated /about page per `spec.md` §14
- [ ] Server `GET /api/metrics/summary` for the three counters
- [ ] Daily metrics job
- [ ] Naloxone how-to-use diagrams (placeholder SVGs initially)
- [ ] Keyboard navigation works on the map, the report flow, the detail sheet
- [ ] Screen-reader announcements for state changes
- [ ] axe-core checks pass on every primary screen

### Demo gate

```
- Voice search "pharmacy near me" → results appear
- Switch language to Arabic → text becomes RTL even though strings remain English
  (no auto-translation)
- Slide font size to 24px → text scales everywhere including pin labels
- Toggle reduced motion → all transitions stop
- Tab through the report flow with no mouse → submit a report
- npm run test:e2e -- --project=accessibility passes
- /about loads, three counters show real numbers from daily_metrics
```

---

## Phase 7 — Guardian admin (≈1 day)

The only authenticated surface. Token-only login, post notes, super-admin can issue tokens.

### Tasks

- [ ] `server/lib/auth.ts` — bcrypt token verification, custom session middleware
- [ ] `server/routes/guardian-admin.ts` — login, logout, me, notes CRUD, admin issue/revoke
- [ ] `client/src/routes/guardian/*` — login screen, dashboard, post-note form, super-admin token issuance UI
- [ ] `scripts/seed-admin.ts` — bootstrap super-admin guardian using `ADMIN_BOOTSTRAP_TOKEN` env
- [ ] Public-side: detail sheet renders guardian notes section above algorithmic data
- [ ] Posting a guardian note triggers watcher push notifications
- [ ] Audit log table + endpoint
- [ ] Rate-limit guardian login (5 attempts per 15 min per IP)

### Demo gate

```
- Run scripts/seed-admin.ts → output a token
- Visit /guardian → log in with token → see dashboard
- Post a note on an affiliated location → note appears on the public detail sheet
  with first name + organisation + verified badge
- Try to post on a non-affiliated location → 403
- As super-admin, issue a new token → tester can log in → can only post on
  their affiliated locations
- Watch a location → guardian posts note → push received
```

---

## Phase 8 — PWA hardening, deploy (≈1 day)

Real service worker, install prompts, cache strategies, deploy to a real domain.

### Tasks

- [ ] Service worker implements all caching strategies in `plan.md` § "PWA / Service Worker"
- [ ] App is installable to home screen on iOS Safari and Android Chrome
- [ ] Offline: app shell loads from cache, last-loaded pins visible, tap shows cached detail
- [ ] Update flow: new SW version triggers a "tap to refresh" toast
- [ ] Lighthouse PWA pass
- [ ] Lighthouse Performance ≥ 85 on a throttled-3G profile
- [ ] Lighthouse Accessibility ≥ 95
- [ ] CI workflow: `check && lint && test && test:e2e`
- [ ] Set up Neon prod database
- [ ] Deploy to Railway (or chosen host) with all env vars
- [ ] DNS pointed at the deploy
- [ ] HTTPS verified (HSTS, Secure cookies)
- [ ] Health check passes from the host

### Demo gate

```
- Install app to phone home screen
- Turn off network, open from home screen → app loads, pins visible
- Submit report offline → comes back online → report syncs without user action
- Run Lighthouse against the deployed URL → all targets met
- Verify CSP header, HSTS, X-Frame-Options on the deployed origin
```

---

## Out of scope for MVP (future phases)

These are intentionally not in the initial build. They appear in the existing codebase as scaffolding; the constitution forbids re-adding them without amendment.

- ~~Gamification, XP, badges, achievements~~
- ~~Peer mentorship matching~~
- ~~Community Health / Resilience dashboards~~
- ~~Multi-tab privacy settings UI with privacy "score"~~
- ~~Sound effects~~
- ~~In-app messaging between users~~
- Partner-org dashboard (post-MVP, separate sub-domain)
- Native mobile apps (the PWA covers iOS and Android)
- Bulk admin import tools (do imports via CLI scripts initially)

---

## Estimated total

12 working days for a focused single developer or coordinated agent + reviewer pair. Each phase is short enough to keep momentum and demoable enough to maintain morale.
