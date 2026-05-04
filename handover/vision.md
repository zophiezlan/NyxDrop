# Vision

> **One map. Two modes. No accounts. Honest about the counter experience.**

That sentence is the entire product positioning. When you have to make a judgment call that the spec doesn't cover, return to it. Everything in NaloxoneLocate is an expression of those four claims.

## The user

Picture a 32-year-old in outer Melbourne whose ex-partner has just relapsed. They have a phone with patchy 4G on the bus. They are trying to find a pharmacy that stocks nasal naloxone, ideally one that won't make them produce a Medicare card. They have never used this app before. They will use it for ninety seconds and decide whether to trust it.

Or picture a peer worker at a Sydney NSP who knows that the Chemist Warehouse two blocks away has a new pharmacist on Saturdays who refuses to dispense without a prescription, in defiance of the Take Home Naloxone program. They want a way to warn the next person without making a scene.

Or picture someone at a regional festival, sober, watchful, planning ahead in case a friend overdoses. They want to know which on-site medic tent has naloxone and where the closest off-site backup is.

These three people are the audience. They share four things:

1. **They are stressed or planning for stress.** Not browsing.
2. **They are wary of institutions.** Not interested in signing up.
3. **They have been judged at counters before, or know someone who has.** They want the *human* truth, not just the *clinical* one.
4. **Their time matters.** Every extra tap is a tax on a person who is already paying enough.

## The central insight

Most "find a place" apps treat their data as binary: do they have it or don't they. This app rejects that. The single most important fact about a naloxone access point is not whether they technically stock it — it is **how you will be treated when you ask**.

A pharmacy can be perfectly compliant on paper and still tell a person to come back with a Medicare card, ask why they want it, raise an eyebrow, take ten minutes to "check", and send them out feeling humiliated. That experience cannot show up on a binary stock indicator. It will, however, decide whether that person ever tries again.

So the central feature is the `success_but` report and its `barriers` array. Every other feature — the pin colour, the filter, the detail sheet, the aggregate insight — exists in service of surfacing what happens at the counter, not just what's behind it.

If you are building this app and you have to choose between two implementations, pick the one that makes barrier data more visible.

## Two modes, one map

The app is always in one of two emotional registers. The architecture must respect this without forcing the user to navigate between pages to switch.

### Plan mode (default)

Cool-headed. Looking ahead. Browsing.

- Whole map. All pin colours visible.
- Filters available, including the headline filter: "hide places where ID was asked in the last month"
- Detail sheets are rich: history, hours, guardian notes, the full reliability picture, save-to-my-places
- Search bar is voice-enabled
- Adding a place, watching for changes, building a personal kit of trusted locations

This is where 80% of usage happens. Most users never enter Now mode.

### Now mode

Crisis-shaped. Right-now. Stripped.

- Background tints faintly red — peripheral cue to anyone watching the screen that something serious is happening
- Top of map: a giant **CALL 000** button. Paramedics carry naloxone. They are, statistically, the fastest path.
- Map auto-zooms to the nearest three green or amber pins
- Red and grey pins are hidden — they are not what you need right now
- Pin tap: a minimal sheet with name, distance, *Directions*, *Call this place*, status, naloxone form. Nothing else.
- Below the map, always visible: a four-step DRSABCD card
- Exit via "I'm OK now" — language that does not punish a false alarm

The mode toggle is one tap. The map state — zoom, pan, pin selection — survives the switch.

## What "good" feels like

A user opens the app on a flaky bus. The map renders within a second from cached pin data. They tap a pin. The detail sheet shows a guardian note from "Sarah, Uniting NSP" saying *"Ask for me at the back counter; open till 9 PM weekdays."* They save the place. They put the phone away.

A week later they go. Naloxone is dispensed without fuss. They open the app on the way home, tap *I went here*, tap *I got it, no problems*, tap *Today*, submit. One line back: *Thanks. 47 people have used reports like yours to plan their visit this month.* No fanfare. No level-up. No "you're a star".

That is the loop. Every design decision should serve it.

## What we deliberately reject

This list is as important as the things we build.

- **No accounts.** Anonymity is a feature, not an inconvenience.
- **No gamification.** XP for naloxone reports is tonally wrong. The reward is solidarity.
- **No mentorship matching.** A different app. Real peer support happens through guardian notes anchored to specific places.
- **No live data dashboard theatre.** Three counters on `/about` is the entire data surface.
- **No multi-tab privacy settings.** One paragraph and one button.
- **No celebration confetti, no achievement notifications, no sound effects.** This is an overdose-prevention tool.
- **No 5-star Yelp surface.** Stars exist in the schema; they live in the detail sheet, not on the pin.
- **No login wall.** Not even a "create an anonymous account to save places" wall. Saving is local-first; the device key is enough.
- **No social sharing badges.** Sharing a location is one button that opens the OS share sheet. We don't need a "Share Achievement Card" component.
- **No machine translation.** Six languages scaffolded, ship them when humans translate them.

If a future feature request feels like it belongs on this list, refuse it.

## The trust model in plain words

Four signals, never averaged together on the surface:

1. **Recency.** What have people said about this place in the last three days? This is what the pin colour reflects. Reports older than a week barely count.
2. **Reliability.** Across the whole history, how has this place performed? This is the five-star number, shown in detail only, with a confidence modifier so a place with two reports does not get to be five-star yet.
3. **Verification.** Has someone official said this place stocks naloxone? `unverified`, `community_verified`, `official`. A badge, not a number.
4. **Human override.** Has a guardian we trust attached a note? Their first name and a verified badge appear above all algorithmic data.

The first three are computed. The fourth is a person speaking. The fourth wins.

## The map pin, in detail

A user can read four dimensions from a single pin without tapping:

- **Colour** — recency status. Green = recently fine. Amber = mixed. Red = recent issues. Grey = no recent reports.
- **Size** — report-volume confidence. A pin with one report is small; a pin with fifty is large. Both can be any colour.
- **Border** — verification. Solid white = community-verified or official. Dashed = unverified.
- **Glyph** — location type. NSP, pharmacy, hospital, library, festival, AOD organisation, drop-in centre, etc.

That density of information without a tap is what makes the map worth using over a list.

## The detail sheet, in detail

When a pin is tapped:

```
Chemist Warehouse Pitt Street
199 Pitt Street, Sydney NSW 2000

● Got it easily — 2 reports today
★★★★☆  (87 reports total)
✓ Community verified

💬 Sarah (verified guardian, NSP)
"Ask at the back counter, not the front register.
 Open till 9 PM."  — 3 days ago

Open now · 8 AM – 9 PM
📞 02 9234 5678
🌐 chemistwarehouse.com.au
Nasal spray available
♿ Wheelchair accessible
⊘ ID rarely asked here       ← derived from barrier reports

Recent reports
✓ Today, 11:42 — got it, no issues
△ Yesterday — got it, asked for ID
✓ 2 days ago — easy
[ show all 87 ]

[ I went here ]  [ ↑ Save ] [ 🔔 Watch ]
[ ↗ Directions ]
```

The "ID rarely asked here" line is the most important UX innovation in the entire product. It is an aggregate of soft-barrier reports surfaced as a *pre-visit answer*, not a *post-visit observation*. That is what the barriers data is for. Build it.

## The unified report flow

One sheet, four steps. Replaces the current implementation's three modals.

1. **When?** — Today / Yesterday / This week / Earlier (date picker)
2. **What happened?** — Got it easily / Got it but… / Out of stock / Turned away
3. **(If barriers or denied) Which barriers?** — checklist
4. **(Optional) Anything else?** — free-text note

Submit. One-line acknowledgment. Done.

If the user taps "I went here" with no pin selected, an extra leading step asks "Where?" — autocomplete plus map drop-pin plus "use my current location". Add-a-place is part of reporting, not a separate command.

## The personal layer: My Places

Saved + Visited + Watching, in one sheet on `/me`. The Watchlist is a bell icon inside My Places, not a parallel concept. Web Push notifies you when:

- A watched location's status changes
- A guardian posts a note on a watched location
- (opt-in) A new location is added near your home region

All keyed off the device fingerprint. *Forget this device* lives at the bottom of `/me` and clears everything in one button.

## Guardians

The only authenticated surface in the whole app — and it is back-of-house. A small admin tool issues guardian tokens to vetted community partners. Guardians log in with the token, attach a signed note to a location, and that note appears above the algorithmic data.

Token issuance is **deliberately not self-service**. An NSP coordinator emails a small admin team. The team verifies the person works there. A token is issued. The note is signed with their first name and a verified badge.

This is the human override on the algorithm. It is also the project's smallest authenticated surface and the only place where a real account exists. Keep it small.

## The shape of the codebase

If we build this right:

- 3 user-facing routes (`/`, `/about`, `/me`) plus one deep-link variant (`/emergency`)
- 1 admin route (guardian tool)
- ~6 sheets that slide over the map
- 1 trust algorithm in `shared/`
- 1 device-fingerprint module
- ~30 components total
- The schema is small and stable

If you find yourself building a fourth user-facing page, stop and ask why.

## A closing instruction to the agent

You are building a tool that may, in some small way, decide whether somebody gets naloxone tonight. Treat that seriously. When the spec is silent and the constitution is silent and the vision is silent, ask: *what would a stressed, wary, time-poor person need from this screen right now?* Build that. Don't build anything else.
