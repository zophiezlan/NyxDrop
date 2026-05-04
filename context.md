# Domain Context

This document gives the agent the working knowledge needed to build NaloxoneLocate without misreading the domain. Read it once before writing code; refer back when a domain term appears in the spec.

Nothing in this document is medical advice or a regulatory citation. It is a working primer for software engineering decisions.

## What naloxone is

Naloxone is a medication that reverses opioid overdoses by displacing opioids from receptors in the brain. It is non-addictive, has no effect on a person who has not taken opioids, and works within minutes. Take-home naloxone has been credited with thousands of overdose reversals globally.

In Australia, naloxone is available **without a prescription** through the federal Take Home Naloxone (THN) program. Despite this, access is uneven: some pharmacies stock it, some don't; some staff are trained, some aren't; some ask for ID and Medicare cards in defiance of the program's intent. This unevenness is the problem the app exists to map.

### Forms

Two formulations are common:

- **Nasal spray** (Nyxoid) — pre-loaded device, no needles, easier for first-time responders. Most users prefer this form.
- **Injectable** (Prenoxad) — multi-dose syringe, faster acting in some scenarios, requires more training.

Some users have a strong preference. Some respond to questions about which form they want with relief because the staff member knows what they're talking about. The schema records both forms per location.

## Australian access points

The app's location taxonomy reflects the actual landscape:

- **NSP** (Needle and Syringe Program) — government-funded harm-reduction services that distribute injecting equipment and often naloxone. Staffed by peer workers and harm-reduction nurses. Highest-trust environment for the user base.
- **Pharmacy** — community pharmacies. Variable. Chemist Warehouse, Priceline, Terry White, etc. Where the THN program is technically available; where the most friction also occurs.
- **Hospital** — emergency departments. Always have injectable naloxone for in-house use. Usually not a take-home source unless discharged from an overdose presentation.
- **Community health** — generic health services, sometimes including primary care.
- **AOD organisation** (Alcohol and Other Drugs) — specialist drug services, often non-clinical, peer-led. Distinct from generic community health in tone and trust.
- **Library** — yes, libraries. Several Australian library pilots have stocked take-home naloxone as part of public-health initiatives.
- **Public building** — council offices, community centres.
- **Festival site** — temporary deployments at music festivals. Time-bounded.
- **Drop-in centre** — homelessness services, harm-reduction drop-ins. High-trust for the user base.
- **Other** — escape valve.

The taxonomy is closed for now. Adding a category requires an amendment.

## "Soft denial"

A pharmacy can technically dispense naloxone while making the experience awful. Examples observed in real-world reports:

- *"They asked why I wanted it."*
- *"They asked for ID and a Medicare card. I had neither."*
- *"They told me to go to the doctor for a script."* (in defiance of THN)
- *"The pharmacist said they'd have to check with the manager."*
- *"They charged me $40."* (THN is free)
- *"They made me wait 20 minutes."*
- *"They asked many questions."*
- *"Staff were difficult."*

Each of these is a soft denial. The person may have eventually walked out with naloxone, but the experience taxes them, may stop them returning, and certainly stops them recommending the place. A binary "did they have it" rating cannot capture this.

The `barriers` field on a report is a structured taxonomy of these experiences. The fixed checklist is:

- `id_required`
- `medicare_required`
- `prescription_required`
- `cost_involved` (with optional amount)
- `wrong_form_only` (e.g., asked for nasal, only injectable available)
- `long_wait`
- `staff_unsure` (untrained, deferring to colleague, looked it up)
- `staff_rude`
- `many_questions`
- `age_restriction`
- `limited_hours`

Plus an optional free-text note.

The detail sheet must surface aggregates of this data as headline facts. See `algorithms.md` for the surfacing rules.

## DRSABCD

The Australian first-aid acronym for emergency response, taught in every workplace first-aid course. The Now mode of the app shows it as a four-step card:

1. **D** — Danger (check the scene is safe)
2. **R** — Response (tap the shoulder, ask "are you OK?")
3. **S** — Send for help (call 000)
4. **A** — Airway (clear the airway)
5. **B** — Breathing (check; rescue breaths if not breathing)
6. **C** — Compressions (CPR if no pulse)
7. **D** — Defibrillator (if available)

For an opioid overdose specifically, naloxone administration occurs alongside this — typically after airway is clear and breathing has been assessed. The card includes a note about naloxone administration, with a link to the nasal-spray-use diagrams in `/about`.

## Why peer-led, why anonymous

Drug use is criminalised in Australia. People who use drugs face genuine legal, custodial, and social risk if their identity is associated with their use. Many also have mistrust of institutions earned through prior negative experiences with healthcare, police, or social services.

A naloxone-locator app that requires login is, for this audience, a surveillance tool. They will not use it.

The app's anonymity is therefore not a privacy nicety — it is the thing that makes the app usable at all by the population most likely to need it. Every design decision must respect this. Any feature that attempts to "improve trust" by adding identity is moving in the wrong direction.

The device-fingerprint model — a random localStorage key, no PII, no analytics that link to a person, deletable in one button — is the floor. Do not erode it.

## Guardians

A guardian is a community partner the app trusts to attach signed context to specific locations. Examples:

- A peer worker at an NSP who knows the place's actual hours and quirks
- A harm-reduction nurse at a community health service
- A festival medic team coordinator
- A pharmacist who has personally implemented THN at their pharmacy and wants to advertise it

Guardians are vetted **out of band**. The admin team confirms (via email exchange or phone call) that the person actually works at the organisation in question and is authorised to speak for it. Then a token is issued.

Guardians can:

- Attach a note to one or more locations they're affiliated with
- Edit and delete their own notes
- Mark a location as `community_verified` (within their organisation's scope)

Guardians cannot:

- See user reports beyond the aggregate data already public
- See device fingerprints or any user-identifying data
- Modify reports
- Issue tokens to other guardians (that is admin-only)

## Australian terminology and conventions

Use these consistently:

- Emergency number: **000** (not 911, not 999)
- Ambulance: **paramedics** (not EMTs)
- Pharmacy not drugstore
- "Chemist" is also acceptable colloquially
- THN = Take Home Naloxone (the federal program)
- NSP = Needle and Syringe Program
- AOD = Alcohol and Other Drugs
- "Substance use" is preferred over "drug abuse"
- "People who use drugs" (PWUD) is preferred over "addicts" or "users" in copy

States and territories: NSW, VIC, QLD, WA, SA, TAS, NT, ACT.

Default geographic centre when geolocation is unavailable: **Melbourne CBD** (latitude `-37.8136`, longitude `144.9631`).

## Languages

The app scaffolds six languages, chosen to match Australian harm-reduction-priority communities:

- **English (en)** — ships first
- **Mandarin Chinese (zh)** — second-largest non-English language in AU
- **Arabic (ar)** — significant population, RTL handling required
- **Spanish (es)** — Latin American diaspora
- **Vietnamese (vi)** — long-established AU community
- **Korean (ko)** — growing diaspora

Each language ships only when a community translator has reviewed the strings. Auto-translation is forbidden — the cost of mistranslating "naloxone access" or "asked for ID" in this context is too high.

## Glossary

- **Naloxone** — opioid overdose reversal medication
- **Take Home Naloxone (THN)** — federal program providing free naloxone without prescription
- **NSP** — Needle and Syringe Program
- **AOD** — Alcohol and Other Drugs (sector term for harm-reduction services)
- **Peer worker** — staff member with lived experience of drug use, employed in a support role
- **Soft denial** — technically dispensing while making the experience punitive
- **Guardian** — vetted community partner authorised to post signed notes
- **DRSABCD** — Australian first-aid response framework
- **Device fingerprint** — random localStorage key used as pseudonymous identity
- **Pin status** — green/amber/red/grey state derived from recent reports
- **Reliability score** — 0.00–5.00 long-term star rating with confidence modifier
