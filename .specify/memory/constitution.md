<!--
SYNC IMPACT REPORT
==================
Version change: TEMPLATE (uninitialised) → 1.0.0
Bump rationale: Initial ratification. No prior version to compare; MAJOR.MINOR.PATCH
                seeded at 1.0.0 per template guidance.

Modified principles (template placeholder → final name):
  PRINCIPLE_1 → I. Identity is the device, not the person
  PRINCIPLE_2 → II. The map is the app
  PRINCIPLE_3 → III. Mode is a state, not a route
  PRINCIPLE_4 → IV. Reports are visit-anchored
  PRINCIPLE_5 → V. Trust is layered, never averaged on the surface
  (added)     → VI. Soft barriers are first-class data
  (added)     → VII. Anonymity must be small enough to fit on one screen
  (added)     → VIII. No gamification
  (added)     → IX. Accessibility is non-negotiable
  (added)     → X. Australian context first
  (added)     → XI. Offline-tolerant by default
  (added)     → XII. No premature abstraction

Added sections:
  - Core Principles (12 principles; template carried 5 placeholder slots)
  - Platform & Data Boundaries (was SECTION_2)
  - Development Workflow & Quality Gates (was SECTION_3)
  - Governance

Removed sections: none (all template slots populated; no slots intentionally
                      left as bracket tokens).

Templates requiring updates:
  ✅ .specify/templates/plan-template.md      — generic; "Constitution Check"
                                                gate is filled per-feature, no
                                                template-level edit needed.
  ✅ .specify/templates/spec-template.md      — generic; no constitution refs.
  ✅ .specify/templates/tasks-template.md     — generic; no constitution refs.
  ✅ .specify/templates/checklist-template.md — generic; no constitution refs.
  ✅ .specify/templates/commands/*            — directory absent in this repo;
                                                nothing to align.
  ✅ CLAUDE.md                                — minimal pointer; no edit needed.

Follow-up TODOs: none. All placeholders resolved with concrete values.
-->

# NyxDrop Constitution

## Core Principles

### I. Identity is the device, not the person

The app has no user accounts and never will. Identity is a random key generated in
the browser on first open, stored only in `localStorage`, and used to scope
rate-limits, watchlists, saved places, and offline queues.

The single exception is the **guardian** role: a small, vetted set of community
partners (NSP coordinators, peer workers, harm-reduction nurses) who issue notes
against specific locations. Guardian credentials are issued **out of band** by an
admin team, never via self-service signup, and are scoped to a separate admin
surface.

A user MUST be able to erase their device key in **one button** with one
confirmation. After erasure the app keeps no server-side record linking past
reports to the now-erased key.

### II. The map is the app

The map is not a page — it is the entire product surface. Other routes exist only
when the content has no spatial home (`/about`, `/me`, the guardian admin tool).
Everything else slides over the map as a sheet.

If a feature would require a new page, first ask whether it could be a sheet. The
default answer is yes.

### III. Mode is a state, not a route

The app is always in one of two modes: **Plan** (default, cool-headed browsing) or
**Now** (crisis-shaped, distance-first, large tap targets, Call 000 prominent).
The map persists across mode switches. The user never loses where they are.

`/emergency` exists only as a deep link that boots the app in Now mode — useful
for phone home-screen shortcuts. It is not a separate page.

### IV. Reports are visit-anchored

Every report is a claim about a specific past visit at a specific time, not a
vote, not a vibe, not a rolling state. The schema and the UI both respect this:
every report has a timestamp, every report belongs to one device, no device may
submit a second report for the same place within 24 hours.

Reports decay in influence over time (half-life 48 hours, negligible after seven
days). Yesterday's evidence outweighs last month's.

### V. Trust is layered, never averaged on the surface

Four orthogonal trust signals coexist and MUST never be collapsed into a single
"score" on the surface:

1. **Recency** — last 72 hours, weighted by age. Drives pin colour.
2. **Reliability** — long-term star score with confidence modifier. Shown only in
   detail.
3. **Verification level** — `unverified` / `community_verified` / `official`.
   Shown as a badge.
4. **Guardian notes** — signed human context attached to a place. Shown above
   algorithmic data.

A pin's colour reflects only recency. Its size reflects report volume
(confidence). Its border reflects verification. Stars and guardian notes are
detail-sheet only. We will not invent a single combined number.

### VI. Soft barriers are first-class data

The most important data this app collects is *not* "did they have naloxone" — it
is *"how were you treated when you asked"*. The `barriers` field in a report is
not a label; it is a structured observation that drives:

- **Headline facts** on the detail sheet ("ID rarely asked here", "Cost reported
  by 3 of last 5 visits")
- **Filters** in Plan mode ("hide places where ID was asked recently")
- **Aggregate insights** in `/about` ("X% of locations have not been reported
  asking for ID this month")

A binary success/fail rating would erase soft denial. We will not build that.

### VII. Anonymity must be small enough to fit on one screen

The privacy story is one paragraph: *We do not have accounts. Your device gets a
random key stored only in your browser. Reports are anonymous. You can erase the
key any time.* That paragraph and the erase button are the entire privacy
surface.

We will not ship privacy "scores", multi-tab privacy dashboards, or privacy
badges. They are theatre and they erode the simplicity that makes the privacy
claim believable.

### VIII. No gamification

No XP, no levels, no badges, no achievements, no celebration modals, no confetti,
no leaderboards, no sound effects. The reward for contributing a report is one
line of acknowledgment: *"Thanks. N people have used reports like yours to plan
their visit this month."*

The audience is not motivated by points. They are motivated by helping the next
person not get humiliated at a counter. The interaction model MUST reflect that.

### IX. Accessibility is non-negotiable

WCAG 2.1 AA is the floor, not the goal. Every release MUST pass:

- Keyboard navigation through every flow, including pin selection on the map
- Screen reader announcement of state changes (mode switch, report submission,
  watch alerts)
- Adjustable type (12–24px slider)
- High-contrast mode
- Reduced-motion mode that disables all animations and transitions
- Voice search via Web Speech API on supported browsers

If a feature cannot meet these, the feature is not done.

### X. Australian context first

Default geography is Melbourne when geolocation is unavailable. Emergency number
is 000, not 911. Address format is Australian. Terminology is Australian (NSP,
AOD, Take Home Naloxone). Currency, when shown, is AUD.

The app scaffolds six languages — English, Mandarin, Arabic, Spanish, Vietnamese,
Korean — chosen for their relevance to Australian harm-reduction-priority
communities. English ships first; the others ship when a community translator has
reviewed them. Auto-translation is forbidden.

### XI. Offline-tolerant by default

Reports MUST queue locally when offline (IndexedDB) and sync transparently when
connectivity returns. The map's last-loaded pin set MUST remain visible offline.
The PWA MUST install and run on a flaky bus.

A user MUST never lose a report because of network failure.

### XII. No premature abstraction

Build the simple version first. Three similar lines beat a clever helper. A
single file of 200 lines beats five files of 60 each if the relationship between
them is obvious.

We will not introduce feature flags, plugin architectures, or "extensibility"
hooks until a real second use case exists. We will not generalise from one
example.

## Platform & Data Boundaries

These constraints follow directly from the principles above and are restated here
so plans and reviews can cite them as gates.

- **Client surface**: PWA. Map is the root. Sheets, not pages, are the default
  container for non-spatial content.
- **Client storage**: `localStorage` for the device key and lightweight prefs;
  `IndexedDB` for queued reports, cached pin sets, and watchlists. No other
  client persistence layer is permitted without an amendment.
- **Server identity model**: server stores reports keyed by device key only. No
  email, phone, IP-derived identity, fingerprint, or cross-session linkage may be
  persisted alongside a report. Deletion of a device key MUST sever the
  server-side link to its prior reports.
- **Telemetry**: no third-party analytics SDKs, no session replay, no behavioural
  tracking. Aggregate, non-identifying counters for product health are
  permissible only when their schema is documented in `/about`.
- **Guardian admin surface**: separate route, separate auth, separate UI
  vocabulary. Out-of-band credential issuance only.
- **Rate-limits and abuse controls**: scoped to the device key. The 24-hour
  per-device per-place report cap (Principle IV) is enforced server-side.
- **Decay parameters**: recency half-life is 48 hours; reports become negligible
  after seven days. Changes to either constant require an amendment under the
  Governance procedure below, because they redefine what "recent" means on the
  surface (Principle V).

## Development Workflow & Quality Gates

Every feature, before merge, MUST pass these gates. A failure on any gate is a
blocker, not a discussion point.

- **Constitution Check** (in `plan.md`): the plan explicitly cites which
  principles the feature touches and how it complies. Violations require entries
  in the plan's Complexity Tracking table with a justified rejection of the
  simpler alternative.
- **Accessibility audit** (Principle IX): keyboard, screen reader, type slider,
  high-contrast, reduced-motion, and voice search are exercised against the
  changed flows. Audit results are recorded in the PR description.
- **Privacy review** (Principles I, VII): any change that touches the device
  key, report payload, server persistence, or third-party network calls requires
  a one-paragraph privacy note in the PR confirming no new identifiers are
  introduced and the erase button still severs all links.
- **Trust-surface review** (Principle V): any change to pin rendering, list
  ordering, detail sheet, or `/about` aggregates is reviewed against the rule
  that the four trust signals stay separate on the surface.
- **Offline check** (Principle XI): any feature that writes data is exercised
  with the network throttled off. Reports queue, map last-set persists, and sync
  is transparent on reconnect.
- **Localisation gate** (Principle X): copy changes flow through the translation
  workflow. A non-English string is shipped only after a community translator
  has reviewed it; auto-translated strings are rejected at review.
- **Guardian-surface isolation** (Principle I): code changes that touch the
  guardian admin tool are reviewed for separation from the public app —
  shared components are inspected to confirm no guardian-only affordances leak
  into the public surface.
- **Simplicity gate** (Principle XII): new abstractions, plugin layers, or
  feature flags require an explicit second concrete use case in the PR
  description. "We might need this later" is rejected.

## Governance

This constitution supersedes all other practices, style guides, and informal
conventions in the repository. Where a lower-level document conflicts with a
principle here, the principle wins and the lower-level document MUST be amended.

**Amendment procedure**:

1. Open a PR that edits this file and includes a Sync Impact Report (see HTML
   comment at the top of this file) describing version delta, modified
   principles, and downstream files touched.
2. The PR description MUST state the bump type (MAJOR / MINOR / PATCH) and the
   reasoning. Versioning policy:
   - **MAJOR**: a principle is removed, redefined in a backward-incompatible
     way, or governance is restructured.
   - **MINOR**: a new principle or section is added, or material new guidance is
     added to an existing principle.
   - **PATCH**: clarifications, wording, typos, non-semantic refinements.
3. Templates and runtime guidance touched by the change MUST be updated in the
   same PR (or have follow-up TODOs listed in the Sync Impact Report).
4. At least one human reviewer outside the PR author approves. For MAJOR
   amendments, the guardian-partner liaison is consulted before merge when the
   change affects Principles I, V, VI, or X.

**Compliance review**:

- All PRs cite affected principles in the description.
- Reviewers MUST verify the Constitution Check section of the plan and the
  workflow gates above.
- Drift discovered after merge (a feature that violates a principle on `main`)
  is logged as a remediation task at P1 priority and fixed before any new work
  in the same surface.

**Runtime guidance**: `CLAUDE.md` and any feature-level `plan.md` files are
runtime guidance and inherit from this constitution. They MUST NOT contradict
it.

**Version**: 1.0.0 | **Ratified**: 2026-05-04 | **Last Amended**: 2026-05-04
