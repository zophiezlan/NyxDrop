# Functional Specification

What to build, screen by screen, flow by flow. This document is the single source of truth for *what*. The companion `plan.md` covers *how*.

Constitutional principles (`constitution.md`) override any conflict in this document. If a spec item violates a principle, raise it for amendment rather than building it.

---

## 1. Routes

The complete user-facing route table:

| Path | Purpose |
|---|---|
| `/` | The map (the app) |
| `/m/<location-id>` | Map with that location's detail sheet open. Deep-linkable, shareable. |
| `/r/<location-id>` | Map with the report sheet open for that location. Shareable as "tell us how it went". |
| `/emergency` | Map booted into Now mode. For phone home-screen shortcuts. |
| `/me` | My Places sheet (saved + visited + watching). Can also open as a sheet from `/`. |
| `/about` | The single static page covering Learn, Data, Privacy, and Contact. |

A separate guardian admin tool lives at `/guardian` and is described in §13. It is not part of the public app's IA.

The map state (zoom, pan, selected pin, mode) survives all sheet open/close transitions. Closing a sheet returns the URL to `/`.

## 2. The map

The persistent canvas of the app. Implementation: react-leaflet over OpenStreetMap tiles.

### 2.1 First open

- Geolocate the user. If granted, centre on their location. If denied or unavailable, centre on Melbourne CBD.
- Fit zoom to show the user's location and the closest 8–12 pins.
- Show a small one-time overlay sheet: "What this is" — three sentences and a *Got it* button. Set a localStorage flag so it never reappears.

### 2.2 Pin rendering

Each pin encodes four dimensions visually. The rules are in `algorithms.md` §1; the visual mapping:

- **Colour** = recency status. `green`, `amber`, `red`, `grey`.
- **Size** = report-volume confidence, 16–48px diameter on a log scale.
- **Border** = verification level. Solid white 2–3px = `community_verified` or `official`. Dashed 1px = `unverified`.
- **Glyph** = location type. Single emoji-style icon: NSP `▽`, pharmacy `+`, hospital `H`, community health `⚕`, AOD `❤`, library `📚`, public building `▢`, festival `🎪`, drop-in `🏠`, other `•`.

Pin tap opens the detail sheet (§5).

### 2.3 Clustering

Cluster pins when zoomed out. Cluster markers are circles with the count, coloured by the dominant recency state of their members (most-frequent of green/amber/red/grey, ties go to amber). Tap to zoom in.

### 2.4 User location dot

Distinct from pins. Blue with a pulse halo. Click to recentre. Updates if user moves significantly (≥100m).

## 3. Plan mode (default)

The default state. All pins visible. All filters available.

### 3.1 Top bar (sticky)

Left: search bar (§7). Right: ⚙ settings, 👤 my-places.

### 3.2 Mode toggle (sticky, below top bar)

A two-segment control: `[ Plan ]  [ Now ]`. Tapping `Now` enters Now mode (§4). The toggle is visible at all times.

### 3.3 Bottom action bar (sticky)

`[ ⊕ I went here ]   [ ✚ Add a place ]   [ ⚙ Filters ]`

- `I went here` — opens report sheet (§6) for the currently selected pin, or with no pin pre-selected if none is selected.
- `Add a place` — opens report sheet starting at the "Where?" step.
- `Filters` — opens the filter sheet (§3.4).

### 3.4 Filter sheet

Slides up from bottom action bar. Sections:

- **Location type** — multi-select chips for the ten taxonomy values
- **Naloxone form** — single select: `any` / `nasal_spray` / `injectable`
- **Verification** — multi-select: `unverified`, `community_verified`, `official`
- **Distance** — single-select: any / 2km / 5km / 10km / 25km
- **Open now** — toggle
- **Recently reported** — toggle (only show pins with reports in last 7 days)
- **Headline filter: Avoid known soft barriers** — multi-select chips:
  - "Hide places where ID was asked recently"
  - "Hide places where Medicare was required recently"
  - "Hide places that charged recently"
  - "Hide places where staff were rude recently"
  - "Hide places that took long recently"
- **Accessibility** — `wheelchair_accessible`, `bulk_available`, `confidential`, `peer_support`

A counter chip at the top shows active filter count. Reset button clears all.

The headline filter is the most important UX element. Implementation rule in `algorithms.md` §4.

## 4. Now mode

A *state*, not a route. Entered by tapping `Now` on the mode toggle, or by deep-linking to `/emergency`.

### 4.1 Visual changes

- Background tints faintly red (page background `bg-red-50` light / `bg-red-950/20` dark)
- Top bar collapses: search and settings hide. A giant red **CALL 000** button replaces the top bar at full width.
- Map auto-zooms to the nearest 3 green or amber pins
- Red and grey pins are **hidden** (not greyed — hidden)
- Mode toggle replaced by an "I'm OK now" button that returns to Plan

### 4.2 Pin sheet (Now mode variant)

When a pin is tapped in Now mode, a minimal sheet opens at half-height:

```
[Name]
[X km away] · [Open now / Closed]
[Status: Got it easily / Mixed / etc]
[Naloxone form: nasal / injectable / both]

[ ↗ Directions ]   [ 📞 Call this place ]
```

Nothing else. No reliability stars, no reports timeline, no save button. Don't tax a person in crisis with information.

### 4.3 DRSABCD card

Always visible at the bottom of the screen in Now mode, above the bottom action bar. A single card with the 7 steps as numbered list, each step one line. Tap a step to expand it. A note at the bottom: "Naloxone is given alongside these steps, typically after airway is clear."

### 4.4 Exit

The "I'm OK now" button is the primary exit. The mode toggle is also still tappable. Either restores Plan mode without losing map state.

## 5. Detail sheet

Opens when a pin is tapped in Plan mode. Slides from bottom to ⅔ height. Drag handle to expand to full or dismiss.

### 5.1 Header section

- Location name
- Address (one line)
- Current status pill (`Got it easily — 2 reports today` etc) — colour matches pin recency
- Reliability stars (1–5, with `(N reports)` text)
- Verification badge: `Community verified` / `Official partner` / no badge for unverified

### 5.2 Guardian notes section (only if any exist)

Above all algorithmic data. Each note:

```
💬 [GuardianFirstName] (verified guardian, [organisation])
[note text]
— [relative time, e.g. "3 days ago"]
```

Multiple notes stack newest-first.

### 5.3 Facts section

Two-column grid:

- Hours (with "Open now" / "Closed" badge derived from current time)
- Phone (tap to call)
- Website (tap to open)
- Naloxone form: nasal / injectable / both
- Tags (chips): wheelchair_accessible, no_id_required, etc
- **Headline barrier facts** — derived from aggregate barrier data (`algorithms.md` §3). Examples:
  - "ID rarely asked here" (green tone)
  - "ID often asked recently" (amber tone, 2+ reports in last 30 days)
  - "Cost reported by 3 of last 5 visits" (amber tone)
  - "No long waits reported" (green tone)
- Access notes (free text, if present)

### 5.4 Recent reports timeline

Last 5 reports, newest first. Each row:

```
[icon] [relative time] — [type description] [, barriers if any]
```

E.g.:

```
✓ Today, 11:42 — got it, no issues
△ Yesterday — got it, asked for ID and Medicare
✗ 2 days ago — out of stock
```

Below: `[ Show all (87) ]` link that expands the timeline inline.

### 5.5 Action row

Three buttons in a row:

```
[ ⊕ I went here ]   [ 🔖 Save ]   [ 🔔 Watch ]
```

Plus a full-width:

```
[ ↗ Directions ]
```

`Save` toggles `Saved` state. `Watch` toggles `Watching` state. `I went here` opens the report sheet (§6) pre-filled with this location.

### 5.6 Sub-actions

Smaller links below the action row:

- `Share` (opens OS share sheet with the location URL)
- `Suggest a correction` (opens a small sheet with a free-text field; submits as a queued admin task — out of MVP scope but stub the button)
- `How do I use this?` (only if naloxone form is set; opens the use-instructions sheet from `/about`)

## 6. Report flow (unified)

Single sheet replacing all "report" and "add location" modals. Triggered from the action bar, the detail sheet, watch-alert push notifications, or `/r/<id>` deep link.

### 6.1 Step 0 — Where? (only if no pre-selected location)

Three options:

```
[ 📍 Use my current location ]
[ 🔍 Search for a place ]      ← autocomplete
[ 🗺 Drop a pin on the map ]
```

Search autocomplete searches existing locations first; if no match, offers `Add "[query]" as a new place`.

If the user adds a new place, capture: name, address (geocode-suggest), location type, hours (optional), phone (optional), naloxone form, accessibility tags. Then proceed to Step 1.

### 6.2 Step 1 — When?

Single-select chip group:

```
( ) Today
( ) Yesterday
( ) Earlier this week
( ) Earlier  ← reveals date picker
```

Default: Today. The selected value becomes the report's `visitDate` (separate from the server-set `timestamp`).

### 6.3 Step 2 — What happened?

Single-select cards:

```
✓  Got it, no problems
△  Got it, but…             ← reveals Step 3
✗  They were out of stock
⊘  They turned me away      ← reveals Step 3
```

Internal mapping: `success`, `success_but`, `out_of_stock`, `denied`.

### 6.4 Step 3 — Which barriers? (only for `success_but` and `denied`)

Multi-select checklist. Each barrier is one row with a label. The full vocabulary:

- Asked for ID (`id_required`)
- Wanted Medicare card (`medicare_required`)
- Wanted a prescription (`prescription_required`)
- Charged me (`cost_involved`) — reveals optional `$ amount` field
- Wrong form only stocked (`wrong_form_only`)
- Long wait (`long_wait`)
- Staff seemed unsure (`staff_unsure`)
- Staff were rude (`staff_rude`)
- Asked many questions (`many_questions`)
- Age restriction applied (`age_restriction`)
- Limited hours / closed (`limited_hours`)

At least one must be selected for `success_but` and `denied`. The "Charged me" row reveals an optional dollar-amount text field; if filled, it's stored on the report.

### 6.5 Step 4 — Anything else? (optional)

Single textarea, 500 char limit:

```
Tip, time of day, who to ask for, anything to say to the next person…
```

### 6.6 Submit

```
[ Submit anonymously ]
```

On submit:

1. POST to `/api/reports` (or queue locally if offline).
2. Show acknowledgment toast: *"Thanks. N people have used reports like yours to plan their visit this month."* (N is fetched lazily; if not available, omit the second sentence.)
3. Close the sheet.
4. Invalidate the location's detail query so the new report appears immediately.

If the device's `(deviceFingerprint, locationId)` pair has a report within the last 24 hours, the API returns 429 and the sheet shows: *"You already reported this place today. Try again tomorrow."*

If offline: the report is queued in IndexedDB and the toast says *"Report saved offline. Will sync when you're back online."*

## 7. Search

A single bar at the top of the map. Three modes:

- **Type** — text autocomplete on name and address (debounced 200ms, server-side fuzzy match)
- **Voice** — Web Speech API on supported browsers; show mic icon. On result, populate the bar and trigger search.
- **Search this area** — appears as a button after the user pans/zooms; queries locations within current map bounds.

Tap a result: zoom map to the location and open its detail sheet.

Voice search uses the current i18n locale. If voice is unavailable on the browser, the mic icon is hidden.

## 8. My Places (`/me`, also a sheet)

Three tabs:

### 8.1 Saved

Locations the user has tagged. Each row:

```
[icon] [Name]
[Address] · [N km] · [status pill]
[personal label] (e.g. "home", "work")
[bell-icon, on/off for watching]   [✕ remove]
```

Tap row → close sheet, recentre map on that location with detail open.

The personal label is editable inline. The note is editable from the detail sheet.

### 8.2 Visited

Locations the user has reported on. Each row shows last verdict:

```
[icon] [Name]
[Last reported X days ago: "Got it easily" / "Asked for ID" etc]
```

### 8.3 Watching

Locations with watch enabled. Same format as Saved. Bottom of tab: link "Notification permissions" if not yet granted.

### 8.4 Forget this device

Bottom of `/me`, full-width destructive button:

```
[ ⚠ Forget this device ]
```

Confirm dialog:

```
This will erase your saved places, your visit history, and your device key.
This cannot be undone. Past reports stay anonymous in the public data.

[ Cancel ]   [ Yes, forget ]
```

On confirm: clear all localStorage and IndexedDB, reload to `/`.

## 9. Notifications

Web Push via VAPID. No third-party push providers.

### 9.1 Permission flow

Triggered when the user first enables a watch. Show a custom pre-prompt explaining what they'll get notified about, *then* trigger the browser prompt. If denied, the watch still saves but no push is registered.

### 9.2 Notification types

- **Watch alert: status change** — pin colour flipped on a watched location. Title: "Status update: [Name]". Body: e.g. "Now reporting Got it easily after recent issues."
- **Watch alert: guardian note** — a guardian posted a new note on a watched location. Title: "New note: [Name]". Body: First 80 chars of the note.
- **(Opt-in only) Region: new place** — a new location was added within 5km of the user's home region. Title: "New nearby: [Name]". Body: "Added [time ago]."

Tapping a notification opens `/m/<id>`.

### 9.3 Settings

In Settings sheet (§12): toggles for each notification type. Region notifications are off by default and require setting a "home region" (just a saved place tagged "home").

## 10. Add a place

Not a separate flow — it is Step 0 of the report flow (§6.1). If a user wants to add without reporting, the action bar's `Add a place` button starts the same flow but stops after creating the location, with a soft prompt: *"Want to add a report about your visit too?"*

## 11. Onboarding

Single one-time overlay on first open. Three lines, one button:

```
NaloxoneLocate

A community map of naloxone access in Australia.
Anonymous. No accounts. Built by peers.

If someone is overdosing right now, tap [ Now mode ] or call 000.

[ Got it ]
```

Sets `localStorage.onboarded = true`. Never reappears.

## 12. Settings

Sheet opened from the ⚙ icon. Sections:

### 12.1 Display

- Language (select: en, zh ‹beta›, ar ‹beta›, es ‹beta›, vi ‹beta›, ko ‹beta›)
- Theme (light / dark / system)
- Font size (12–24px slider)
- High contrast (toggle)
- Reduced motion (toggle)

### 12.2 Input

- Voice search (toggle, only shown if browser supports Web Speech API)

### 12.3 Notifications (only if any watches are active)

- Watch alerts: status change (toggle)
- Watch alerts: guardian notes (toggle)
- Region: new places near home (toggle, requires a "home" tagged saved place)

### 12.4 About

- App version
- Link to `/about`
- Link to "Forget this device" (jumps to `/me` bottom)

No sound effects toggle. No "privacy score" gauge. No accessibility menu duplicate. One sheet.

## 13. Guardian admin

Separate route, password-gated, not linked from the public app.

### 13.1 Login

`/guardian` shows a single password field. The token is the password. No usernames. Token is verified server-side; on success a session cookie is set (HttpOnly, Secure, SameSite=Strict, 24h expiry).

### 13.2 Guardian dashboard

After login:

- Profile card: first name, organisation, affiliated locations
- "Add a note" button — opens form: select location (limited to affiliated), note text (500 char), save
- "My notes" list — edit, delete

Guardians cannot see device fingerprints, individual reports, or anything beyond what the public app shows.

### 13.3 Admin (super-admin only)

Same `/guardian` route, but tokens marked `isAdmin` see additional sections:

- Issue token: form for first name, organisation, affiliated location IDs, generates a one-time URL to send the guardian
- Revoke token
- Audit log (token issuance, note moderation actions)

The super-admin token is created by hand on first deploy via a CLI script (`scripts/seed-admin.ts`).

## 14. /about

A single static page with eight sections, navigable by anchor links:

1. **What this is** — one paragraph
2. **How to recognise an overdose** — DRSABCD card (same as Now mode)
3. **How to use a nasal naloxone spray** — three diagrams + steps
4. **How to use injectable naloxone** — diagrams + steps
5. **The map by the numbers** — three live counters: total locations, reports in last 30 days, percent successful in last 30 days
6. **How we know what we know** — one paragraph explaining the trust model in human terms
7. **Privacy** — one paragraph plus a link to "Forget this device"
8. **Contact** — three emails: `guardians@`, `partners@`, `hello@`

No hero gradients. No "Live Data Dashboard ✨" badges. No animated bouncing icons. Plain, clear, honest.

## 15. PWA behaviour

- Installable to home screen on iOS Safari and Android Chrome
- Offline: last-loaded pin set remains visible; tap a pin → cached detail; report goes to offline queue
- Service worker caches: shell HTML, JS bundle, CSS, last 200 pin payloads, last 50 detail payloads
- Cache-first for shell, network-first with cache fallback for `/api/locations`

## 16. Acceptance criteria (MVP)

The MVP is shippable when all of the following pass:

- [ ] User can find their location, see nearby pins, tap one, see detail, get directions
- [ ] User can submit a report with full barrier data, visit date, optional note
- [ ] Report is rate-limited to once per (device, location) per 24h
- [ ] Pin colour reflects last 72h of weight-decayed reports per `algorithms.md` §1
- [ ] Reliability score reflects all-time reports with confidence modifier per `algorithms.md` §2
- [ ] Detail sheet shows aggregate barrier facts ("ID rarely asked here") per `algorithms.md` §3
- [ ] Plan mode filters work, including the headline-barrier filter
- [ ] Now mode tints background, hides red/grey pins, shows DRSABCD, prominent Call 000
- [ ] Mode toggle preserves map state
- [ ] Voice search works on Chrome / Edge / Safari
- [ ] User can save, watch, and tag personal-labelled locations on `/me`
- [ ] "Forget this device" clears all local data
- [ ] Web Push fires on watched-location status change
- [ ] Guardian admin tool issues tokens; guardians can post notes; notes appear in detail sheet
- [ ] Offline: app loads, pins visible, reports queue and sync on reconnect
- [ ] WCAG 2.1 AA passes on the map, the report flow, and the detail sheet (audit with axe-core)
- [ ] No accounts exist for end users
- [ ] No XP, badges, or celebration components anywhere in the codebase
