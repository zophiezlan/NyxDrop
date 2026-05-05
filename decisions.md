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
