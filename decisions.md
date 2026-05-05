# Decisions

A running log of judgment calls that aren't fully resolved by the constitution,
spec, plan, or data-model. Each entry has a status: **decided**, **deferred**,
or **open**.

When the spec is silent and you have to make a call, add an entry here. When a
later decision overrides an earlier one, edit the entry in place and note the
rationale.

---

## D-001 — Working copy of the spec lives in `specs/001-naloxone-locate/`

**Status:** decided
**Date:** 2026-05-04

The handover suite shipped with two copies of every doc: one in `handover/`
and the same content in `specs/001-naloxone-locate/` per the README's setup
instructions. Going forward:

- `specs/001-naloxone-locate/` is the **working copy**. Patches, clarifications,
  and amendments land here.
- `handover/` is a frozen archive of the as-shipped suite. Do not edit it.

Why: speckit reads from `specs/001-naloxone-locate/`, so that's where changes
need to live. Keeping `handover/` immutable preserves a clean diff against the
original handover.

Patches applied at kickoff (2026-05-04):

- data-model.md: added `hoursStructured` column on `locations` (algorithms.md
  §7 referenced it but no column was declared)
- data-model.md: added `corrections` table (contracts.md /correction endpoint
  needed a queue table)
- data-model.md: added `audit_log` table (contracts.md
  /api/guardian/admin/audit-log needed a backing table)
- spec.md §1, §8 + plan.md + tasks.md Phase 4: clarified that `/me` is a
  deep-link variant of `/` that opens the My Places sheet on top of the map,
  not a separate page (constitution II)
- spec.md §6.4 + contracts.md POST /api/reports: barrier vocabulary is filtered
  by report type (a denied user shouldn't see `wrong_form_only`, etc.)

---

## D-002 — `reports.deviceKey` is preserved in plaintext on "forget device"

**Status:** open
**Date:** 2026-05-04

Constitution I says: *"After erasure the app keeps no server-side record
linking past reports to the now-erased key."*

contracts.md /api/device/forget says: *"What is preserved: rows in `reports` —
they are anonymised data points contributing to public consensus, and the
device key on them is treated as opaque random text."*

These are reconcilable but the link technically still exists in
`reports.deviceKey`. Two paths:

- **(A) — current handover behaviour.** Keep `reports.deviceKey` plaintext.
  Defensible because the key is opaque random hex with no PII, and the user
  loses access to it after forget. But if the DB is later compromised and an
  attacker somehow learns the old device key, they can re-link.
- **(B) — stronger.** Store `sha256(deviceKey)` on `reports.deviceKey` from
  the start. Plaintext lives only on `device_reports` (rate-limit), `watches`,
  `saved_places`, `push_subscriptions` — all of which `forget` deletes. Forget
  then truly severs the link with no ambiguity.

(B) costs one line of code at insert time. The trade-off is that if we ever
need to re-derive a per-device value across the reports table for a future
feature, we can't.

**Default if nothing decided by Phase 2:** (A). Revisit if a privacy review
flags this.

---

## D-003 — `visitDate` is the user's local Y-M-D

**Status:** decided
**Date:** 2026-05-04

`visitDate` is a `date` column with no time component. When a user picks
"Today" / "Yesterday" / a date picker, the client computes Y-M-D from the
device's local clock and sends it to the server. The server trusts the
incoming value (within the contracts.md range constraint: ≤ today, ≥ 90 days
ago, evaluated against the server's UTC date).

Why: a user in Perth at 11 pm picking "Today" means the local Friday, even
if the server is on UTC and it's already Saturday there. Treating the visit
as user-local is what matches the user's mental model.

Edge: a malicious or buggy client could send a `visitDate` more than 24h in
the future of UTC. Validation rule: `visitDate ≤ today_utc + 1` (allows for
timezone slack), `visitDate ≥ today_utc − 90`.

---

## D-004 — `/about` "% successful" → "% got naloxone"

**Status:** decided
**Date:** 2026-05-04

`daily_metrics.successfulReports` counts `success + success_but`. The `/about`
public counter must use the phrasing **"X% got naloxone in the last 30 days"**,
not "X% successful." Calling barrier-laden visits "successful" implies the
experience was clean and erodes constitution VI (soft barriers as first-class
data).

The breakdown — clean success vs success-with-barriers — is shown in detail
sheets, not on `/about`.

---

## D-005 — Daily metrics job idempotency

**Status:** deferred (revisit in Phase 8 if traffic warrants it)
**Date:** 2026-05-04 → updated 2026-05-05

plan.md says the daily-metrics aggregation runs "cron-ish via setInterval."
Process restarts risk double-firing for a given date. Fix: before each
increment, check whether `daily_metrics` already has a row for the target
date with the metric in question — UPSERT pattern with `ON CONFLICT (date) DO
UPDATE` or a `WHERE NOT EXISTS` guard.

**2026-05-05 update:** Phase 6 shipped a `/api/metrics/summary` endpoint that
computes the three `/about` counters live from `locations` + `reports` with a
5-minute in-memory cache (server/routes/metrics.ts). At current data volumes
this is fine; the `daily_metrics` aggregation job is an optimisation and a
prerequisite for *historical* metrics, neither of which Phase 6 needs. The job
remains deferred. Revisit if `/about` becomes hot enough that the live query
shows up in DB load, or when someone wants a 30-day trend chart.

---

## D-006 — Pin glyphs

**Status:** deferred (resolve during Phase 1)
**Date:** 2026-05-04

spec.md §2.2 specifies emoji-style glyphs (NSP `▽`, AOD `❤`, etc.). Some are
tonally weak (`❤` for a drug-and-alcohol service) and not widely recognisable.

Proposed alternative: use Lucide React icons (already shadcn-friendly) rendered
into the Leaflet `divIcon` HTML. Same density, better recognisability, no
emoji-rendering inconsistencies across platforms.

Resolve in Phase 1 when pin rendering is implemented. Document the chosen
icon-per-type mapping in `spec.md` §2.2 once decided.

---

## D-007 — i18n locale switch must trigger React re-render

**Status:** decided
**Date:** 2026-05-04 → resolved 2026-05-05

The i18n module sketched in plan.md uses a module-scoped table that
`setLocale()` mutates. React won't re-render on this. Need either:

- A small React context that holds the active locale and broadcasts changes;
  components read via `useTranslation()` hook.
- Or accept a full reload on locale change (`window.location.reload()`),
  which is simpler but ugly.

**Resolution:** subscribe-pattern (no Context). `client/src/lib/i18n.ts`
exposes a module-scoped `subscribe(fn)` callback list. Components call
`useT()` which subscribes for the lifetime of the component and forces a
re-render when `setActiveLocale()` fires. `useAppPreferences` calls
`ensureLocale(prefs.locale)` whenever preferences change, which loads the
locale file and activates it. Avoids Context to keep a single import surface
and dodge the context-provider boilerplate; subscribe pattern is fine here
because the broadcast is rare (only on language switch).

---

## D-008 — CSP `unsafe-inline` for styles is for Leaflet, not Tailwind

**Status:** decided (clarification)
**Date:** 2026-05-04

plan.md "Security headers" attributes the `unsafe-inline` style directive to
Tailwind. That's incorrect — Tailwind compiles to a static CSS file and
doesn't need it. The actual cause is Leaflet's inline `style="..."` attributes
on map elements (popups, marker positioning, etc.). When updating CSP later,
search for Leaflet, not Tailwind.

---

## D-009 — `UserLocationDot` is rendered inline, not a separate component

**Status:** decided
**Date:** 2026-05-05

tasks.md Phase 1 lists `client/src/components/map/UserLocationDot.tsx` as a
deliverable. The implementation renders the user-location marker inline
inside `InteractiveMap.tsx` via `<Marker>` + `createUserLocationIcon()`
(client/src/components/map/pin-icon.ts).

No reason to extract: it is one Marker with one icon, configured by one
`userPosition` prop, tightly coupled to the leaflet map context. A separate
component would be a wrapper without behaviour. Constitution XII: three
similar lines beat a clever helper.

Revisit only if the user-location representation grows (accuracy ring,
heading arrow, etc.).

---

## D-013 — Government registry membership is NOT a trust signal

**Status:** decided
**Date:** 2026-05-05 (extended for NSW NSP and Vic NSP sources 2026-05-06)

The Australian Government Take Home Naloxone Program publishes a
participating-site registry via ArcGIS (see `server/scripts/import-thn.ts`).
NSW Health publishes a parallel directory of NSP outlets (primary,
secondary, and pharmacies) as CSVs (see
`server/scripts/import-nsw-nsp.ts`). Victorian DHHS publishes its NSP
outlet directory via a CartoDB SQL endpoint, with an extra `naloxone`
boolean indicating which outlets are funded to supply naloxone through
the NSP (see `server/scripts/import-vic-nsp.ts`). Other states will
likely follow.

Importing any of them gave us a tempting shortcut: tag every imported row
with `verificationLevel: "official"` and let pin colour reflect
"gov-confirmed."

That would have collapsed two orthogonal signals into one number, in
violation of constitution V (*"Trust is layered, never averaged on the
surface"*). Worse, it would have lied to the user. The point of the app —
the soft-denial problem the entire build is shaped around — is that a place
*on the registry* may still turn you away, ask for ID, charge you, or be out
of stock. Painting registry-membership as a verification badge would erase
the very phenomenon the constitution requires us to surface.

**The rule, locked:**

1. Sites imported from any government registry land at
   `verificationLevel: "unverified"`. Re-imports do **not** downgrade rows
   the community (or a guardian) has since promoted.
2. Registry membership is recorded as separate, narrow columns:
   - `locations.thn_object_id` — OBJECTID from the THN locator
   - `locations.nsw_nsp_listing` — `primary` / `secondary` / `pharmacy`
     (the NSW sub-list this row is on)
   - `locations.vic_nsp_listing` — `fixed_site` / `secure_dispensing` /
     `vehicle_outreach` / `pharmacy` / `foot_patrol` (the Vic
     `operating_model`)
   - `locations.vic_nsp_supplies_naloxone` — boolean from the Vic dataset's
     `naloxone` field, indicating the outlet is *funded* to supply
     naloxone through the NSP. Same rule: a funded-to-supply flag is not a
     stock-available-today claim.
   These are presence flags, not trust scores. They never enter consensus
   math, pin colour, pin size, reliability stars, or the verification
   badge.
3. The detail sheet renders a single neutral panel between guardian notes
   and the algorithmic facts that lists every registry the location appears
   on, plus the closing line *"Whether stock is available today is a
   separate question — see the visitor reports below."* Information, not
   endorsement.
4. The /about page attributes the seed list to both sources and explicitly
   says the registries "do not tell us who actually has stock today, or
   how visitors are treated when they ask. That second layer is what this
   app exists to provide."
5. Importers are idempotent and run by hand (or on a future cron):
   `npm run db:import-thn`, then `npm run db:import-nsw-nsp`, then
   `npm run db:import-vic-nsp`. Order matters because the NSW and Vic
   importers geo-dedup against existing rows; running them after THN lets
   them enrich the national rows with phone/hours and state-specific
   listing flags. They should never run as part of `db:push` or a
   migration — data is operational, not structural.
6. State importers never overwrite community-edited `phone` or `hours`;
   they fill only when the existing field is null.

This decision is load-bearing. If a future feature looks like it would let
"on a government list" surface as a quality signal anywhere on the surface
(pin, badge, ranking, search boost), revisit this entry first. The
constitutional read here is sharp and an LLM may not soften it without
amendment.

---

## D-012 — Lighthouse `target-size` and `image-size-responsive` failures are Leaflet noise

**Status:** decided (won't-fix)
**Date:** 2026-05-05

The post-Phase-8 Lighthouse run flags two audits we do not intend to chase:

- **`target-size` (a11y -4)** — fires on every visible `.nl-pin-icon` Leaflet
  marker. Pin diameter encodes report volume per `algorithms.md` §2 (small =
  low confidence, large = high confidence). Forcing all pins to ≥ 44px
  erases that semantic and visually clutters the map. WCAG SC 2.5.5 explicitly
  exempts "essential" target sizes; pin size is essential here. Bottom action
  bar buttons, Toast dismiss, and the search clear/voice buttons are all
  ≥ 44px and do not appear in the violations list.

- **`image-size-responsive` (best-practices -4 mobile)** — fires on OSM tiles
  served at 256×256 and rendered at 256×256. The displayed size matches the
  intrinsic size exactly; the audit appears to misclassify map tiles
  (rendered into Leaflet panes via `<img>` without a srcset, deliberately)
  as content images. There is no "responsive" variant to serve.

Both leave us at 96 / 96 a11y and 92–96 best-practices, well above the Phase 8
demo gates (≥ 95 a11y; no specific best-practices target). Revisit only if
Lighthouse adds a way to except map markers / tiles, or if a real touch-
target issue appears on a non-Leaflet element.

---

## D-011 — Service worker caches HTTP responses in Cache API, not IndexedDB

**Status:** decided
**Date:** 2026-05-05

plan.md § "Offline queue" specifies an IndexedDB store named
`cached-locations` that the SW reads to serve `/api/locations` requests
when the network fails.

**Resolution:** the Phase 8 SW uses the **Cache Storage API** for all HTTP
response caching (app shell, map tiles, `/api/locations*`, static assets)
and reserves IndexedDB for the offline-report queue (the existing
`pending-reports` store).

Reasons:
- Cache API is purpose-built for response caching — `match(req)` against
  Request objects is exactly what we want; the SW writes are idiomatic
  `cache.put(req, res.clone())`.
- IDB for response bytes would require manual headers/body
  serialisation, MIME re-derivation, and duplicate code paths between
  the SW and any client reader.
- Constitution XII: build the simple version first.

If a future feature needs to read the cached pin payload from React (rather
than only via fetch interception), we can add an IDB shadow store at that
point. So far no feature needs that — the React app uses TanStack Query's
in-memory cache for its own purposes, and the SW's Cache API view is
sufficient for the offline-pins demo gate.

---

## D-010 — Vercel deploy: server-side `@shared/*` aliases must not leak past compile

**Status:** decided
**Date:** 2026-05-05

Vercel's `@vercel/node` runtime compiles each `.ts` file in the function's
import graph individually and does **not** resolve TypeScript path aliases.
A server file that imports from `@shared/schema` will compile to a `.js`
file that still says `from "@shared/schema"`, which Node ESM then tries to
resolve as an npm package — `ERR_MODULE_NOT_FOUND` at runtime, every API
endpoint 500s.

**Resolution:** server-side code (`server/**`) uses **relative imports with
`.js` extensions** (`../../shared/schema.js`) for cross-package imports. The
`@/`, `@shared/`, `@server/` aliases in `tsconfig.json` and `vite.config.ts`
remain available for client code (Vite resolves them at build time) and for
type-only imports if needed, but server-side runtime imports must be
relative.

This bug existed for the entire window between the Vercel migration and
2026-05-05; production was 500'ing on every API call. The triage that
caught it also produced this rule. Don't introduce new `@shared/*` imports
under `server/**` without re-introducing the bug.
