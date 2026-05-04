# Agent Kickoff Prompts

Ready-to-paste prompts for invoking an AI agent at each phase of `tasks.md`. Each prompt is self-contained — it tells the agent what to read, what to build, what to verify, and what to report back.

These work with Claude Code, Cursor, Aider, Continue, or any agentic coding tool. They assume the entire `handover/` directory has been placed at the repo root or copied into spec-kit's expected paths.

---

## Master prompt (use this once at session start)

```
You are building NaloxoneLocate from scratch — a community-sourced naloxone-access map for Australia. This is a peer-led harm-reduction tool for people who use drugs; build it with seriousness.

Before writing any code, read these files in this order:

1. handover/constitution.md — non-negotiable rules. Memorise them.
2. handover/vision.md — the prose north-star. Use it for taste-level decisions.
3. handover/context.md — domain primer. Australian harm-reduction context, soft denial, guardians, DRSABCD.
4. handover/spec.md — what to build, screen by screen.
5. handover/plan.md — how to build it (stack, structure, deploy).
6. handover/data-model.md — schema with reasoning.
7. handover/contracts.md — API contracts.
8. handover/algorithms.md — pin status, reliability, barrier surfacing math.
9. handover/tasks.md — phased build plan. Eight phases.

After reading, confirm the following in your response without writing code yet:

- The 12 constitutional principles, named
- The two modes (Plan, Now) and why they are states not pages
- Why the "barriers" array is the most important data the app collects
- The four trust signals and the rule against averaging them on the surface
- The phase you are about to start

Wait for confirmation before proceeding. If at any point you find yourself wanting to add gamification, accounts, or a "live data dashboard", stop and re-read the constitution.
```

---

## Phase 0 — Foundation

```
Begin Phase 0 from handover/tasks.md.

Goal: a fresh repo with the stack from handover/plan.md, scripts that work on Windows AND macOS AND Linux, dotenv loaded as the first import, and a /api/health endpoint.

Critical pitfalls to avoid (the previous attempt at this app hit all of these):
- NEVER use bash-prefix env-var syntax in package.json scripts. Use cross-env.
- ALWAYS make `import "dotenv/config"` the FIRST line in server/index.ts and drizzle.config.ts.
- ALWAYS scope vitest's include glob to unit tests only. Do not let it pick up tests/e2e/*.spec.ts.
- ALWAYS use the path aliases @/, @shared/, @server/ consistently across tsconfig, vite, vitest.

Deliverables:
- All files listed in tasks.md Phase 0
- npm install / npm run check / npm run lint / npm run dev all succeed
- curl http://localhost:5000/api/health returns {"status":"ok",...}

Do not implement anything from later phases. Stop at the demo gate.

Report back with: the exact commands you ran to verify, and any decisions you made that aren't in the spec.
```

---

## Phase 1 — Read path

```
Begin Phase 1 from handover/tasks.md.

Goal: render the map. Show pins coloured/sized/bordered/glyphed per algorithms.md §1 and §5. Tap a pin → detail sheet rises with the full layout from spec.md §5.

Read the relevant sections before starting:
- spec.md §1 (routes), §2 (map), §5 (detail sheet)
- data-model.md sections on `locations`, `reports`, `device_reports`
- algorithms.md §1, §5 (pin status and size)
- contracts.md sections on Locations

Stub algorithms in shared/consensus.ts now (return placeholder values); the real implementation lands in Phase 3. The detail sheet should still render — guardian notes and barrier facts will be empty arrays for now.

Seed ~30 real Australian locations across Sydney, Melbourne, and Brisbane with ~10 reports each. Include at least: 2 NSPs, 5 pharmacies, 2 hospitals, 1 library, 1 festival site. Use real addresses where possible.

Demo gate: verify by hand on a phone-sized viewport that pins render correctly, that tapping shows the detail sheet, and that /m/<id> deep-links work after refresh.

Report back with: a screenshot of the map, the seed location list, and Lighthouse Performance score.
```

---

## Phase 2 — Write path

```
Begin Phase 2 from handover/tasks.md.

Goal: the unified report flow per spec.md §6 — visit-anchored, time-anchored, with full barrier vocabulary, rate-limited to once per (device, location) per 24h, and queued offline if the network is down.

Read before starting:
- spec.md §6 (report flow) and §10 (add-a-place)
- contracts.md Reports section, especially the validation rules
- constitution.md V (visit-anchored) and VI (soft barriers as first-class)

Critical:
- The report sheet is ONE sheet with progressive steps. Do not build three separate modals.
- The barrier vocabulary is the controlled list in algorithms.md / data-model.md. Do not invent new barriers.
- The 24h rate limit is enforced server-side via the device_reports table, not client-side.
- The acknowledgment toast says "Thanks. N people have used reports like yours to plan their visit this month." NOT "Achievement unlocked" or any gamification language.
- Offline reports queue in IndexedDB and sync transparently. The user must NOT lose a report due to network failure.

Demo gate: submit success, success_but with barriers, denied; verify rate limit; verify offline queue and resync.

Report back with: the validation rules you actually implemented (matching contracts.md), and a list of any spec ambiguities you had to resolve.
```

---

## Phase 3 — Trust algorithms

```
Begin Phase 3 from handover/tasks.md.

Goal: the consensus math is real and tested. Pin status reflects actual recency. Reliability stars work. Aggregate barrier facts surface on the detail sheet — this is the most important UX feature in the entire app.

Read carefully:
- algorithms.md §1 (pin status), §2 (reliability), §3 (barrier surfacing) — implement EXACTLY as specified
- algorithms.md §10 (test fixtures) — every test case listed there must pass
- constitution.md V (trust is layered, never averaged on the surface) and VI (soft barriers drive headline facts)

Implement every function in shared/consensus.ts as a pure function. Add the test file shared/__tests__/consensus.test.ts covering the §10 fixtures plus any edge cases you find. Tests run under vitest.

Then wire:
- getLocationsWithConsensus and getLocationWithConsensus on the server use the real functions
- After each report insert: recompute denormals on the location row
- Hourly weight-decay job
- Detail sheet renders headline barrier facts with appropriate green/amber tone

Demo gate: all tests pass; the detail sheet shows phrases like "ID rarely asked here" or "Cost reported in recent visits" derived from seeded reports.

Report back with: test output, the list of consensus tests you wrote, and any cases where you had to make a judgment call beyond the spec.
```

---

## Phase 4 — Personal layer

```
Begin Phase 4 from handover/tasks.md.

Goal: My Places (Saved + Visited + Watching). Web Push notifications via VAPID. Forget-this-device button.

Read:
- spec.md §8 (My Places), §9 (Notifications), §11 (Forget device)
- contracts.md Saved places / Watches / Push sections
- plan.md "Web Push (VAPID)" and "Device key"

Critical:
- Watches are a flag inside My Places, NOT a parallel concept
- The pre-prompt before the browser permission ask is mandatory
- "Forget this device" is one button with one confirmation. It clears localStorage, IndexedDB, and server-side per-device data. Past anonymous reports remain.
- Pin-status flips trigger watcher notifications, but only if from→to is meaningful (see algorithms.md §9)
- Suppress notifications to ≤1 per (device, location) per 6h

Run scripts/generate-vapid.ts once and put the output in .env. The VAPID public key is fetched at runtime via /api/push/vapid-public-key.

Demo gate: full save → watch → flip-status → notification → tap notification → land on the right page flow.

Report back with: a list of watch-alert triggers you wired, and a verification that "Forget this device" actually cleared everything (show the SQL query confirming).
```

---

## Phase 5 — Modes & emergency

```
Begin Phase 5 from handover/tasks.md.

Goal: the two modes are STATES, not routes. The map state survives switches. /emergency is a deep link that boots in Now mode. The headline-barrier filter works in Plan mode.

Read:
- spec.md §3 (Plan mode), §4 (Now mode)
- constitution.md III (Mode is a state, not a route)
- algorithms.md §4 (headline barrier filter)
- vision.md "Two modes, one map"

Implementation notes:
- Mode is global state — useMode hook with persistence in URL hash or sessionStorage
- The map component reads mode and adjusts: pin filtering, sheet variant, toggle visible
- NEVER navigate (router.push) on mode switch. The whole app is one route at the conceptual level.
- The Now-mode background tint is bg-red-50 in light, bg-red-950/20 in dark
- The DRSABCD card is visible at the BOTTOM, fixed, with a note about naloxone administration timing
- "I'm OK now" copy must be non-judgmental — a false alarm is fine

Demo gate: verify that Now → tap a pin → I'm OK now returns to the same map position with the same pin selected.

Report back with: a screen recording or step-by-step description of mode switch preserving state.
```

---

## Phase 6 — Polish

```
Begin Phase 6 from handover/tasks.md.

Goal: search (text + voice + search-this-area), full Settings sheet, accessibility (WCAG AA), i18n scaffold, /about page.

Read:
- spec.md §7 (Search), §12 (Settings), §14 (/about)
- constitution.md IX (Accessibility) and X (Australian context first)
- plan.md "i18n"

Critical:
- Voice search uses Web Speech API directly. NO third-party speech service. The mic icon is hidden if the browser doesn't support SpeechRecognition.
- i18n: ship en first, fully translated. Other locales scaffold with English fallbacks and a <beta> badge in the language picker. NO auto-translation.
- Arabic must set <html dir="rtl"> when active.
- The /about page is ONE page replacing Learn + Data + Privacy. Plain, honest, no hero gradients, no animated bouncing icons.
- The three /about counters come from /api/metrics/summary, computed from daily_metrics.
- Settings is ONE sheet. No "privacy score" gauge. No sound effects toggle.
- Every primary screen passes axe-core. Run @axe-core/playwright in tests/e2e/accessibility.spec.ts.

Demo gate: voice search works on Chrome and Safari, font slider scales everything (12-24px), /about loads with real numbers, RTL works for Arabic, axe checks pass.

Report back with: the axe report summary, the en.json string count, and a Lighthouse Accessibility score.
```

---

## Phase 7 — Guardian admin

```
Begin Phase 7 from handover/tasks.md.

Goal: the only authenticated surface in the app. Token-only login. Notes posted by guardians appear above algorithmic data on public detail sheets. Super-admin can issue and revoke tokens.

Read:
- spec.md §13 (Guardian admin)
- contracts.md Guardian admin section
- plan.md "Guardian admin auth"
- data-model.md guardians, guardian_tokens, guardian_sessions

Critical:
- The token IS the password. No usernames. Bcrypt cost factor 12.
- Plain tokens are shown ONCE at issuance and never retrievable.
- Session cookie is HttpOnly, Secure, SameSite=Strict, 24h. Custom 60-line middleware — do NOT add express-session.
- Guardians can post notes only on their affiliatedLocationIds. Super-admins can post anywhere.
- Notes appear in the PUBLIC detail sheet above the algorithmic data, signed with first name + organisation + verified badge.
- Posting a note triggers watcher notifications.
- Audit log records token issuance and revocation.
- scripts/seed-admin.ts uses ADMIN_BOOTSTRAP_TOKEN env to create the first super-admin.

Rate-limit guardian login: 5 attempts / 15 min / IP. Bcrypt is intentionally slow; do not memoise.

Demo gate: full token-issuance → login → post-note → public-visibility → revocation flow.

Report back with: a sample issued token URL, the audit log entries from your test run, and confirmation that the public app exposes nothing about device fingerprints to guardians.
```

---

## Phase 8 — PWA hardening, deploy

```
Begin Phase 8 from handover/tasks.md.

Goal: real service worker with the caching strategies in plan.md, app installable to home screen, offline pin viewing, throttled-3G performance budgets met, deploy to a real host.

Read:
- spec.md §15 (PWA behaviour)
- plan.md "PWA / Service Worker" and "Performance budgets"
- constitution.md XI (Offline-tolerant)

Critical:
- Vanilla service worker, no Workbox.
- Cache strategies: app shell cache-first, /api/locations network-first with IndexedDB fallback, all other API network-only (mutations go through the explicit offline queue).
- New SW versions: detect controllerchange and show a non-blocking "tap to refresh" toast. NEVER force-reload.
- Install prompt: do not auto-trigger. Let the browser show its own prompt.
- Performance: lazy-load /about (large content), code-split Leaflet (~140KB), tile prefetch limited to viewport.
- CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy must be live on the deployed origin.

CI: a single workflow runs check + lint + test + test:e2e on every PR. Fail the build on any failure.

Deploy: Railway with all env vars. Verify VAPID keys, DATABASE_URL, SESSION_SECRET, ADMIN_BOOTSTRAP_TOKEN are all set. Run scripts/seed-admin.ts ONCE in production via railway run.

Demo gate: the deployed app loads on a real phone, installs to home screen, works fully offline after first load, scores within all the budgets in plan.md "Performance budgets".

Report back with: the deployed URL, a Lighthouse report from the PRODUCTION origin (not localhost), and a screenshot of the app installed on a phone home screen.
```

---

## Mid-build self-check

Use this prompt periodically (e.g., after each phase) to catch drift:

```
Pause and audit the codebase against handover/constitution.md. For each of the 12 principles, answer:

- Is this principle still upheld?
- Has any recent change weakened it?
- Are there feature requests in the backlog or in your own queue that would violate it?

If any answer is "no" or "yes (weakened)", stop and surface the issue before continuing. Do not silently work around constitutional violations.

Also check:
- Any new file > 400 lines? Likely needs splitting.
- Any new component imported by zero callers? Delete it.
- Any TODO/FIXME you introduced? Either resolve or document why it's deferred.
- Any new dependency added? Justify against plan.md "What we explicitly reject".
```

---

## When the agent gets stuck

```
You're stuck. That's fine. Before retrying:

1. Re-read the relevant section of handover/spec.md and handover/plan.md.
2. Check whether the constitution forbids the path you were trying.
3. Ask: is the spec actually unclear, or am I making it harder than it is?

If the spec is unclear, propose two specific resolutions and pick the one that better serves the user portrait in handover/vision.md ("a 32-year-old in outer Melbourne whose ex-partner has just relapsed"). Document the decision in a `decisions.md` file at repo root.

If you were making it harder than it is, simplify and try again. The constitution explicitly forbids premature abstraction (XII). Three similar lines beat a clever helper.
```
