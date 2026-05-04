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

**Status:** deferred (resolve in Phase 6)
**Date:** 2026-05-04

plan.md says the daily-metrics aggregation runs "cron-ish via setInterval."
Process restarts risk double-firing for a given date. Fix: before each
increment, check whether `daily_metrics` already has a row for the target
date with the metric in question — UPSERT pattern with `ON CONFLICT (date) DO
UPDATE` or a `WHERE NOT EXISTS` guard.

Defer the actual implementation to Phase 6 (when the metrics job lands).
Flagging here so it isn't forgotten.

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

**Status:** open (resolve in Phase 6)
**Date:** 2026-05-04

The i18n module sketched in plan.md uses a module-scoped table that
`setLocale()` mutates. React won't re-render on this. Need either:

- A small React context that holds the active locale and broadcasts changes;
  components read via `useTranslation()` hook.
- Or accept a full reload on locale change (`window.location.reload()`),
  which is simpler but ugly.

Resolve in Phase 6. Default to context if no objection.

---

## D-008 — CSP `unsafe-inline` for styles is for Leaflet, not Tailwind

**Status:** decided (clarification)
**Date:** 2026-05-04

plan.md "Security headers" attributes the `unsafe-inline` style directive to
Tailwind. That's incorrect — Tailwind compiles to a static CSS file and
doesn't need it. The actual cause is Leaflet's inline `style="..."` attributes
on map elements (popups, marker positioning, etc.). When updating CSP later,
search for Leaflet, not Tailwind.
