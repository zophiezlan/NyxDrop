# Constitution

These are the non-negotiable principles of NaloxoneLocate. Every later document — spec, plan, tasks — defers to this one. If a later decision contradicts a constitutional principle, the principle wins, and the contradicting decision must be revised.

When a feature request, a refactor, or an LLM suggestion violates one of these, push back. If the violation is genuinely required, this document must be amended in writing first.

---

## I. Identity is the device, not the person

The app has no user accounts and never will. Identity is a random key generated in the browser on first open, stored only in `localStorage`, and used to scope rate-limits, watchlists, saved places, and offline queues.

The single exception is the **guardian** role: a small, vetted set of community partners (NSP coordinators, peer workers, harm-reduction nurses) who issue notes against specific locations. Guardian credentials are issued **out of band** by an admin team, never via self-service signup, and are scoped to a separate admin surface.

A user must be able to erase their device key in **one button** with one confirmation. After erasure the app keeps no server-side record linking past reports to the now-erased key.

## II. The map is the app

The map is not a page — it is the entire product surface. Other routes exist only when the content has no spatial home (`/about`, `/me`, the guardian admin tool). Everything else slides over the map as a sheet.

If a feature would require a new page, first ask whether it could be a sheet. The default answer is yes.

## III. Mode is a state, not a route

The app is always in one of two modes: **Plan** (default, cool-headed browsing) or **Now** (crisis-shaped, distance-first, large tap targets, Call 000 prominent). The map persists across mode switches. The user never loses where they are.

`/emergency` exists only as a deep link that boots the app in Now mode — useful for phone home-screen shortcuts. It is not a separate page.

## IV. Reports are visit-anchored

Every report is a claim about a specific past visit at a specific time, not a vote, not a vibe, not a rolling state. The schema and the UI both respect this: every report has a timestamp, every report belongs to one device, no device can submit a second report for the same place within 24 hours.

Reports decay in influence over time (half-life 48 hours, negligible after seven days). Yesterday's evidence outweighs last month's.

## V. Trust is layered, never averaged on the surface

Four orthogonal trust signals coexist and must never be collapsed into a single "score" on the surface:

1. **Recency** — last 72 hours, weighted by age. Drives pin colour.
2. **Reliability** — long-term star score with confidence modifier. Shown only in detail.
3. **Verification level** — `unverified` / `community_verified` / `official`. Shown as a badge.
4. **Guardian notes** — signed human context attached to a place. Shown above algorithmic data.

A pin's colour reflects only recency. Its size reflects report volume (confidence). Its border reflects verification. Stars and guardian notes are detail-sheet only. Do not invent a single combined number.

## VI. Soft barriers are first-class data

The most important data this app collects is *not* "did they have naloxone" — it is *"how were you treated when you asked"*. The `barriers` field in a report is not a label; it is a structured observation that drives:

- **Headline facts** on the detail sheet ("ID rarely asked here", "Cost reported by 3 of last 5 visits")
- **Filters** in Plan mode ("hide places where ID was asked recently")
- **Aggregate insights** in `/about` ("X% of locations have not been reported asking for ID this month")

A binary success/fail rating would erase soft denial. We will not build that.

## VII. Anonymity must be small enough to fit on one screen

The privacy story is one paragraph: *We do not have accounts. Your device gets a random key stored only in your browser. Reports are anonymous. You can erase the key any time.* That paragraph and the erase button are the entire privacy surface.

We will not ship privacy "scores", multi-tab privacy dashboards, or privacy badges. They are theatre and they erode the simplicity that makes the privacy claim believable.

## VIII. No gamification

No XP, no levels, no badges, no achievements, no celebration modals, no confetti, no leaderboards, no sound effects. The reward for contributing a report is one line of acknowledgment: *"Thanks. N people have used reports like yours to plan their visit this month."*

The audience is not motivated by points. They are motivated by helping the next person not get humiliated at a counter. The interaction model must reflect that.

## IX. Accessibility is non-negotiable

WCAG 2.1 AA is the floor, not the goal. Every release must pass:

- Keyboard navigation through every flow, including pin selection on the map
- Screen reader announcement of state changes (mode switch, report submission, watch alerts)
- Adjustable type (12–24px slider)
- High-contrast mode
- Reduced-motion mode that disables all animations and transitions
- Voice search via Web Speech API on supported browsers

If a feature cannot meet these, the feature is not done.

## X. Australian context first

Default geography is Melbourne when geolocation is unavailable. Emergency number is 000, not 911. Address format is Australian. Terminology is Australian (NSP, AOD, Take Home Naloxone). Currency, when shown, is AUD.

The app scaffolds six languages — English, Mandarin, Arabic, Spanish, Vietnamese, Korean — chosen for their relevance to Australian harm-reduction-priority communities. English ships first; the others ship when a community translator has reviewed them. Auto-translation is forbidden.

## XI. Offline-tolerant by default

Reports must queue locally when offline (IndexedDB) and sync transparently when connectivity returns. The map's last-loaded pin set must remain visible offline. The PWA must install and run on a flaky bus.

A user must never lose a report because of network failure.

## XII. No premature abstraction

Build the simple version first. Three similar lines beat a clever helper. A single file of 200 lines beats five files of 60 each if the relationship between them is obvious.

Do not introduce feature flags, plugin architectures, or "extensibility" hooks until a real second use case exists. Do not generalise from one example.

---

## Amendments

This document is amended only by deliberate decision, recorded in the project's commit history with the rationale. An LLM may not amend this document by inference.
