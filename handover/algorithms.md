# Algorithms

The small but critical math. All functions live in `shared/consensus.ts` and are importable from both client and server. Each has an extensive unit test in `shared/__tests__/consensus.test.ts`.

These algorithms are the heart of the trust model. The constitution forbids collapsing them into a single surface number; this document describes how each contributes.

---

## 1. Pin recency status

The colour of a pin reflects only the last 72 hours of weight-decayed reports. It is a fast-moving signal.

### 1.1 Inputs

```ts
function calculatePinStatus(
  reports: Report[]
): { status: PinStatus; label: string; confidenceN: number };
```

Where `reports` are reports for a single location with `submittedAt` within the last 72 hours.

### 1.2 Weight decay

Each report has a weight that decays with age:

```
weight(t) = 0.5 ^ (ageHours / 48)    if ageHours ≤ 168
         = 0                         if ageHours > 168
```

- Half-life: 48 hours
- Negligible after 7 days
- A 24-hour-old report has weight ≈ 0.71
- A 48-hour-old report has weight = 0.5
- A 72-hour-old report has weight ≈ 0.35

### 1.3 Weighted classification

For each report in window, accumulate one of four buckets based on `reportType`:

| reportType | Bucket |
|---|---|
| `success` | `successWeight` |
| `success_but` | `partialWeight` |
| `out_of_stock` | `failureWeight` |
| `denied` | `failureWeight` |

Sum totalWeight = success + partial + failure.

### 1.4 Status decision

```
if totalWeight === 0:
  return { status: "grey",  label: "No recent reports", confidenceN: 0 }

successRatio = successWeight / totalWeight
failureRatio = failureWeight / totalWeight
partialRatio = partialWeight / totalWeight

if successRatio >= 0.7:
  return { status: "green", label: "Got it easily — N reports today/week" }
if failureRatio >= 0.6:
  return { status: "red",   label: "Recent issues reported" }
if partialRatio >= 0.4 OR (successRatio + partialRatio) >= 0.6:
  return { status: "amber", label: "Mixed results — check details" }
return { status: "amber", label: "Mixed results" }
```

### 1.5 Label refinement

The label is rendered with friendly time-windowed language:

- If most recent report was today: *"Got it easily — 2 reports today"* / *"Mixed results — 4 reports this week"*
- If most recent was within 7 days: *"Got it — last reported 3 days ago"*
- If grey: *"No recent reports"*

`confidenceN` is the integer count of reports in window — used by callers to decorate the label.

---

## 2. Long-term reliability score

A 0.00–5.00 number representing trustworthiness across the entire history. Slow-moving. Rendered in the detail sheet only, never on the pin.

### 2.1 Inputs

```ts
function calculateReliabilityScore(reports: Report[]): {
  score: number;        // 0.00 - 5.00
  stars: number;        // 1 - 5 rounded for display
  confidenceTier: "low" | "medium" | "high";
};
```

`reports` is **all reports** for the location (not weight-decayed; volume matters here).

### 2.2 Per-report score

```
case "success":      score = 5
case "success_but":  score = 3
case "out_of_stock": score = 1
case "denied":       score = 0
```

### 2.3 Confidence modifier

Volume matters for trust. A single "got it easily" report shouldn't make a place 5 stars.

```
n = reports.length
baseScore = mean(perReportScores)

if n < 3:        modifier = 0.7,  tier = "low"
else if n < 10:  modifier = 0.85, tier = "medium"
else if n < 20:  modifier = 1.0,  tier = "medium"
else:            modifier = 1.1,  tier = "high"

score = min(5.0, baseScore * modifier)
stars = max(1, round(score))   // floor at 1 star to avoid "0 stars" display
```

### 2.4 Empty-history case

```
if reports.length === 0:
  return { score: 0, stars: 0, confidenceTier: "low" }
```

A zero-star display means "no reports yet" — it should be paired with the `confidenceTier` and possibly hidden in favour of a "newly added" badge.

---

## 3. Aggregate barrier surfacing

This is the most important UX algorithm. It turns the `barriers` jsonb arrays on individual reports into headline pre-visit facts on the detail sheet.

### 3.1 Inputs

```ts
function surfaceBarrierFacts(reports: Report[]): BarrierFact[];

interface BarrierFact {
  kind: "rare" | "occasional" | "frequent";    // determines tone (green/amber)
  barrier: string;                              // canonical barrier key
  label: string;                                // human-readable
  countInWindow: number;
  windowDays: number;
}
```

`reports` is all reports for the location with `visitDate` within the last 90 days.

### 3.2 Surfacing rules per barrier

For each barrier in the controlled vocabulary, compute:

- `n30` = count of reports in last 30 days mentioning this barrier
- `total30` = total reports in last 30 days
- `n90` = count in last 90 days mentioning this barrier
- `total90` = total reports in last 90 days

Then classify:

| Condition | Kind | Label template |
|---|---|---|
| `total30 ≥ 5` AND `n30 / total30 ≥ 0.4` | `frequent` | "[Barrier] often reported recently" (amber) |
| `total30 ≥ 3` AND `n30 ≥ 2` | `occasional` | "[Barrier] sometimes reported" (amber) |
| `total30 ≥ 5` AND `n30 === 0` | `rare` | "[Barrier] rarely seen here" (green) |
| `total90 ≥ 10` AND `n90 / total90 ≤ 0.1` | `rare` | "[Barrier] rarely seen here" (green) |
| otherwise | (omitted) | not surfaced |

### 3.3 Label vocabulary

Phrasing per barrier (positive frame for `rare`, neutral for `occasional`/`frequent`):

| Barrier | Rare label | Frequent / occasional label |
|---|---|---|
| `id_required` | "ID rarely asked here" | "ID often asked recently" |
| `medicare_required` | "Medicare card not usually requested" | "Medicare often requested recently" |
| `prescription_required` | "Script rarely required" | "Script asked for in recent visits" |
| `cost_involved` | "Reported as free" | "Cost reported in recent visits" (with median if ≥3 cost amounts) |
| `wrong_form_only` | "Both forms usually stocked" | "Often only one form stocked" |
| `long_wait` | "No long waits reported" | "Long waits in recent visits" |
| `staff_unsure` | "Staff usually trained here" | "Staff sometimes unsure recently" |
| `staff_rude` | (omit even if rare — too sensitive) | "Staff attitude reported recently" |
| `many_questions` | "Few questions asked" | "Many questions asked recently" |
| `age_restriction` | (omit unless `frequent`) | "Age restrictions applied recently" |
| `limited_hours` | (don't surface — covered by hours data) | (don't surface) |

### 3.4 Output ordering

Return at most 4 facts, ordered by:

1. `frequent` first (most actionable warnings)
2. Then `occasional`
3. Then `rare` (positive signals last; we don't want to lead with "ID rarely asked" if cost is frequently a problem)

### 3.5 Cost amount aggregation

When `cost_involved` is `frequent` or `occasional` and ≥3 reports include a `costAmount`, append the median to the label:

```
"Cost reported in recent visits (typically $40)"
```

Use median, not mean, to avoid one outlier skewing.

### 3.6 Why this matters

A user looking at a pin wants to know, before walking in:

- *Will they ask me for ID?*
- *Will they charge me?*
- *Are they nice?*

The barriers data answers all three. The detail sheet must surface those answers as clearly as it surfaces hours and phone number. This is the function that makes that happen.

---

## 4. Headline barrier filter (Plan-mode filter sheet)

The constitution names the "Avoid known soft barriers" filter as a key UX element. Implementation:

### 4.1 Inputs

```ts
function filterByAbsenceOfBarriers(
  locations: LocationWithConsensus[],
  hideBarriers: string[]    // e.g. ["id_required", "cost_involved"]
): LocationWithConsensus[];
```

### 4.2 Logic

For each location, fetch its `barrierFacts` (already computed via §3). Hide the location if any of its facts has `kind = "frequent"` and `barrier ∈ hideBarriers`.

`occasional` does not trigger the hide. The user is opting out of *commonly* problematic places, not places where one report mentioned the barrier.

### 4.3 UX corollary

When the filter is active, show a chip at the top of the map:

```
Hiding 7 places where ID was often asked recently   [×]
```

So the user understands the filter is non-trivially affecting the map.

---

## 5. Pin size (confidence)

Pin diameter on the map encodes report-volume confidence — independent of pin colour.

### 5.1 Function

```ts
function calculatePinSize(totalReports: number): number {
  // Returns diameter in px, between 16 and 48, log-scaled
  if (totalReports === 0) return 16;
  return Math.min(48, 16 + Math.round(8 * Math.log10(totalReports + 1)));
}
```

| Reports | Diameter |
|---|---|
| 0 | 16 |
| 1 | 18 |
| 5 | 22 |
| 10 | 24 |
| 50 | 30 |
| 100 | 32 |
| 500 | 38 |
| 1000+ | 40 (capped at 48 by formula above) |

The selected (tapped) pin is rendered at 1.4× this size with a brighter ring.

---

## 6. Distance (Haversine)

```ts
function haversineDistance(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number }
): number {
  const R = 6371; // km
  const φ1 = (a.lat * Math.PI) / 180;
  const φ2 = (b.lat * Math.PI) / 180;
  const Δφ = ((b.lat - a.lat) * Math.PI) / 180;
  const Δλ = ((b.lon - a.lon) * Math.PI) / 180;
  const x = Math.sin(Δφ / 2) ** 2 +
            Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  return R * c;
}
```

Returns kilometres. Used for distance display, distance filtering, and Now-mode sorting.

For distance filters in `GET /api/locations`, the server computes haversine in JavaScript on the result set; we don't need PostGIS at this scale. If location count exceeds 10,000, revisit.

---

## 7. "Open now" derivation

The `hours` field on a location is free text ("Mon-Fri 9-5"). For the "Open now" filter and badge, parse it into a canonical form:

### 7.1 Canonical form

```ts
type OpeningHours = {
  [day in "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun"]?: Array<{
    from: string;   // "09:00"
    to: string;     // "17:00"
  }>;
};
```

A second column `hoursStructured` (jsonb) on `locations` stores the parsed form. The free-text `hours` remains for display; the structured form drives "Open now". Parsing happens at write time (admin or import script) or via a tiny client-side parser when adding a location.

### 7.2 isOpenNow

```ts
function isOpenNow(hours: OpeningHours | null, now = new Date()): boolean | null {
  if (!hours) return null;        // unknown
  const day = ["sun","mon","tue","wed","thu","fri","sat"][now.getDay()];
  const todayWindows = hours[day] ?? [];
  const hhmm = now.toTimeString().slice(0, 5);
  return todayWindows.some(w => w.from <= hhmm && hhmm < w.to);
}
```

Returns `null` (unknown) for locations with unstructured hours — UI shows "Hours unknown" rather than misleading the user.

---

## 8. Decay job

### 8.1 What it does

A periodic job (hourly via `setInterval` or external cron) refreshes the `weight` column on every report:

```ts
// server/jobs/decay-weights.ts
export async function decayReportWeights() {
  const now = Date.now();
  const all = await db.select({ id: reports.id, submittedAt: reports.submittedAt }).from(reports);
  for (const r of all) {
    const ageHours = (now - r.submittedAt.getTime()) / 3_600_000;
    const w = ageHours > 168 ? 0 : Math.pow(0.5, ageHours / 48);
    await db.update(reports).set({ weight: w.toFixed(3) }).where(eq(reports.id, r.id));
  }
}
```

### 8.2 Why store the weight?

Computing weight on read is also valid, but storing it:

- Lets the consensus query be a simple aggregate without a per-row math step
- Keeps the algorithm centralised in one job we can audit
- Makes the weighted sum trivially indexable if needed later

### 8.3 Frequency

Hourly is plenty — a 1-hour drift in weights moves a 48-hour decay by ~1.4%. Don't run it more often.

---

## 9. Pin-status flip detection (for push notifications)

When a new report is submitted, we want to detect if the location's pinStatus *flipped* — and if so, notify watchers.

### 9.1 Flow

```ts
async function onReportSubmitted(report: Report) {
  const before = await getLocationConsensus(report.locationId);  // pre-insert
  await db.insert(reports).values(report);
  await recomputeLocationDenormals(report.locationId);
  const after = await getLocationConsensus(report.locationId);

  if (before.pinStatus !== after.pinStatus) {
    await enqueueWatchAlerts(report.locationId, {
      kind: "status_change",
      from: before.pinStatus,
      to: after.pinStatus,
      label: after.consensusLabel,
    });
  }
}
```

### 9.2 Suppression

Don't notify on every flip — only on:

- `red → green`, `red → amber`, `amber → green` (improvements)
- `green → red`, `green → amber`, `amber → red` (degradations)
- Never on `grey → *` (initial state, not an interesting flip)

Send at most one notification per (deviceKey, locationId) per 6 hours, regardless of flips. A noisy place shouldn't spam.

---

## 10. Test fixtures

`shared/__tests__/consensus.test.ts` should cover, at minimum:

- Empty reports → grey, 0 stars
- 1 success report → green, low confidence, 4 stars (5 × 0.7 modifier)
- 5 success reports → green, medium confidence
- 20 success + 1 denied → green, ~4.9 stars
- All denied → red, 0-1 stars
- Mixed 50/50 success and success_but → amber
- Old reports (>168h) → grey (no contribution to recency)
- Half-life check: a 48h report contributes exactly half what a 0h report does
- Barrier surfacing: 5 reports, 3 with `id_required` → "ID often asked recently"
- Barrier surfacing: 10 reports, 0 with `id_required` → "ID rarely asked here"
- Pin size: 0 reports → 16, 100 → 32, 1000 → 40
- Haversine: Sydney-Melbourne ≈ 713km
- isOpenNow: unstructured hours returns null
- Reliability confidence modifier boundaries (n=2, n=3, n=9, n=10, n=19, n=20)
