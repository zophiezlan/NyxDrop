// Trust algorithms shared between client and server.
//
// Phase 1 ships these as STUBS that return safe placeholder values so the read
// path renders. Phase 3 replaces every function with the real math from
// algorithms.md and adds the test fixtures listed in §10.

import type {
  BarrierFact,
  GuardianNoteWithGuardian,
  Location,
  LocationWithConsensus,
  PinStatus,
  Report,
} from "./schema.js";

// -----------------------------------------------------------------------------
// 1. Pin recency status (algorithms.md §1)
// -----------------------------------------------------------------------------

export interface PinStatusResult {
  status: PinStatus;
  label: string;
  confidenceN: number;
}

export function calculatePinStatus(reports: Report[]): PinStatusResult {
  // STUB. Phase 3 implements the weight-decayed classification from §1.
  if (reports.length === 0) {
    return { status: "grey", label: "No recent reports", confidenceN: 0 };
  }
  // Simple temporary heuristic so seeded data renders something visible.
  const counts = { success: 0, success_but: 0, out_of_stock: 0, denied: 0 };
  for (const r of reports) counts[r.reportType]++;
  const total = reports.length;
  if (counts.success / total >= 0.7) {
    return { status: "green", label: `Got it easily — ${total} recent`, confidenceN: total };
  }
  if ((counts.out_of_stock + counts.denied) / total >= 0.6) {
    return { status: "red", label: "Recent issues reported", confidenceN: total };
  }
  return { status: "amber", label: "Mixed results — check details", confidenceN: total };
}

// -----------------------------------------------------------------------------
// 2. Long-term reliability (algorithms.md §2)
// -----------------------------------------------------------------------------

export interface ReliabilityResult {
  score: number;
  stars: number;
  confidenceTier: "low" | "medium" | "high";
}

export function calculateReliabilityScore(reports: Report[]): ReliabilityResult {
  // STUB. Phase 3 implements the per-report score + confidence modifier.
  if (reports.length === 0) {
    return { score: 0, stars: 0, confidenceTier: "low" };
  }
  const map: Record<Report["reportType"], number> = {
    success: 5,
    success_but: 3,
    out_of_stock: 1,
    denied: 0,
  };
  const sum = reports.reduce((s, r) => s + map[r.reportType], 0);
  const score = sum / reports.length;
  return {
    score,
    stars: Math.max(1, Math.round(score)),
    confidenceTier: reports.length < 10 ? "low" : "medium",
  };
}

// -----------------------------------------------------------------------------
// 3. Aggregate barrier surfacing (algorithms.md §3)
// -----------------------------------------------------------------------------

export function surfaceBarrierFacts(_reports: Report[]): BarrierFact[] {
  // STUB. Phase 3 implements the windowed classification and labelling.
  return [];
}

// -----------------------------------------------------------------------------
// 4. Headline barrier filter (algorithms.md §4)
// -----------------------------------------------------------------------------

export function filterByAbsenceOfBarriers(
  locations: LocationWithConsensus[],
  hideBarriers: string[],
): LocationWithConsensus[] {
  if (hideBarriers.length === 0) return locations;
  return locations.filter(
    (loc) =>
      !loc.barrierFacts.some(
        (f) => f.kind === "frequent" && hideBarriers.includes(f.barrier),
      ),
  );
}

// -----------------------------------------------------------------------------
// 5. Pin size (algorithms.md §5) — implemented now (small, used by Phase 1 map)
// -----------------------------------------------------------------------------

export function calculatePinSize(totalReports: number): number {
  if (totalReports <= 0) return 16;
  return Math.min(48, 16 + Math.round(8 * Math.log10(totalReports + 1)));
}

// -----------------------------------------------------------------------------
// 6. Distance, Haversine (algorithms.md §6) — implemented now
// -----------------------------------------------------------------------------

export function haversineDistance(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const R = 6371;
  const φ1 = (a.lat * Math.PI) / 180;
  const φ2 = (b.lat * Math.PI) / 180;
  const Δφ = ((b.lat - a.lat) * Math.PI) / 180;
  const Δλ = ((b.lon - a.lon) * Math.PI) / 180;
  const x =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  return R * c;
}

// -----------------------------------------------------------------------------
// 7. isOpenNow (algorithms.md §7)
// -----------------------------------------------------------------------------

export function isOpenNow(
  hours: Location["hoursStructured"],
  now: Date = new Date(),
): boolean | null {
  if (!hours) return null;
  const days = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
  const day = days[now.getDay()];
  if (!day) return null;
  const todayWindows = hours[day] ?? [];
  const hhmm = now.toTimeString().slice(0, 5);
  return todayWindows.some((w) => w.from <= hhmm && hhmm < w.to);
}

// -----------------------------------------------------------------------------
// Composition helper used by API handlers to build LocationWithConsensus.
// -----------------------------------------------------------------------------

export function composeLocationWithConsensus(
  loc: Location,
  recentReports: Report[],
  allReports: Report[],
  guardianNotes: GuardianNoteWithGuardian[],
  options?: { distance?: number; isSaved?: boolean; isWatched?: boolean },
): LocationWithConsensus {
  const status = calculatePinStatus(recentReports);
  const reliability = calculateReliabilityScore(allReports);
  return {
    ...loc,
    pinStatus: status.status,
    pinSize: calculatePinSize(loc.totalReportsCount),
    consensusLabel: status.label,
    reliabilityStars: reliability.stars,
    recentReports,
    guardianNotes,
    barrierFacts: surfaceBarrierFacts(allReports),
    distance: options?.distance,
    isSaved: options?.isSaved,
    isWatched: options?.isWatched,
  };
}
