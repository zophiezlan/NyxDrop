// Trust algorithms shared between client and server. See algorithms.md for the
// derivation; this file is the authoritative implementation referenced from
// constitution V ("trust is layered, never averaged on the surface") and VI
// ("soft barriers as first-class data").

import type {
  BarrierFact,
  BarrierValue,
  GuardianNoteWithGuardian,
  Location,
  LocationWithConsensus,
  PinStatus,
  Report,
  ReportType,
} from "./schema.js";

// =============================================================================
// 1. Pin recency status (algorithms.md §1)
// =============================================================================

const HALF_LIFE_HOURS = 48;
const DECAY_HORIZON_HOURS = 168; // 7 days

/** Weight a report by age (hours). 1.0 at age 0, 0.5 at 48h, 0 past 168h. */
export function calculateReportWeight(
  submittedAt: Date | string | number,
  now: Date = new Date(),
): number {
  const t = submittedAt instanceof Date ? submittedAt : new Date(submittedAt);
  const ageHours = (now.getTime() - t.getTime()) / 3_600_000;
  if (ageHours < 0) return 1;
  if (ageHours > DECAY_HORIZON_HOURS) return 0;
  return Math.pow(0.5, ageHours / HALF_LIFE_HOURS);
}

export interface PinStatusResult {
  status: PinStatus;
  label: string;
  confidenceN: number;
}

/**
 * Pin colour from the last 72 hours of weight-decayed reports. Reports older
 * than 7 days contribute zero. See algorithms.md §1.4 for thresholds.
 */
export function calculatePinStatus(
  reports: Report[],
  now: Date = new Date(),
): PinStatusResult {
  let successWeight = 0;
  let partialWeight = 0;
  let failureWeight = 0;
  let mostRecent: Date | null = null;

  for (const r of reports) {
    const w = calculateReportWeight(r.submittedAt, now);
    if (w === 0) continue;
    switch (r.reportType) {
      case "success":
        successWeight += w;
        break;
      case "success_but":
        partialWeight += w;
        break;
      case "out_of_stock":
      case "denied":
        failureWeight += w;
        break;
    }
    if (!mostRecent || r.submittedAt.getTime() > mostRecent.getTime()) {
      mostRecent = r.submittedAt;
    }
  }

  const totalWeight = successWeight + partialWeight + failureWeight;
  const recentCount = reports.filter(
    (r) => calculateReportWeight(r.submittedAt, now) > 0,
  ).length;

  if (totalWeight === 0) {
    return { status: "grey", label: "No recent reports", confidenceN: 0 };
  }

  const successRatio = successWeight / totalWeight;
  const failureRatio = failureWeight / totalWeight;
  const partialRatio = partialWeight / totalWeight;

  let status: PinStatus;
  let intent: "success" | "fail" | "mixed";
  if (successRatio >= 0.7) {
    status = "green";
    intent = "success";
  } else if (failureRatio >= 0.6) {
    status = "red";
    intent = "fail";
  } else if (partialRatio >= 0.4 || successRatio + partialRatio >= 0.6) {
    status = "amber";
    intent = "mixed";
  } else {
    status = "amber";
    intent = "mixed";
  }

  const label = buildPinLabel(intent, recentCount, mostRecent, now);
  return { status, label, confidenceN: recentCount };
}

function buildPinLabel(
  intent: "success" | "fail" | "mixed",
  recentCount: number,
  mostRecent: Date | null,
  now: Date,
): string {
  if (!mostRecent) return "No recent reports";
  const ageHours = (now.getTime() - mostRecent.getTime()) / 3_600_000;
  const within24h = ageHours < 24;
  const verb =
    intent === "success" ? "Got it easily" : intent === "fail" ? "Recent issues" : "Mixed results";

  if (within24h) {
    const suffix =
      recentCount === 1
        ? `1 report ${ageInWords(ageHours)}`
        : `${recentCount} ${recentCount === 1 ? "report" : "reports"} today`;
    return `${verb} — ${suffix}`;
  }
  return `${verb} — last reported ${ageInWords(ageHours)}`;
}

function ageInWords(ageHours: number): string {
  if (ageHours < 1) return "just now";
  if (ageHours < 24) return `${Math.round(ageHours)}h ago`;
  const days = Math.round(ageHours / 24);
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

// =============================================================================
// 2. Long-term reliability (algorithms.md §2)
// =============================================================================

const PER_REPORT_SCORE: Record<ReportType, number> = {
  success: 5,
  success_but: 3,
  out_of_stock: 1,
  denied: 0,
};

export interface ReliabilityResult {
  score: number;
  stars: number;
  confidenceTier: "low" | "medium" | "high";
}

export function calculateReliabilityScore(reports: Report[]): ReliabilityResult {
  const n = reports.length;
  if (n === 0) {
    return { score: 0, stars: 0, confidenceTier: "low" };
  }

  const sum = reports.reduce((acc, r) => acc + PER_REPORT_SCORE[r.reportType], 0);
  const baseScore = sum / n;

  let modifier: number;
  let tier: ReliabilityResult["confidenceTier"];
  if (n < 3) {
    modifier = 0.7;
    tier = "low";
  } else if (n < 10) {
    modifier = 0.85;
    tier = "medium";
  } else if (n < 20) {
    modifier = 1.0;
    tier = "medium";
  } else {
    modifier = 1.1;
    tier = "high";
  }

  const score = Math.min(5, baseScore * modifier);
  const stars = Math.max(1, Math.round(score));
  return { score, stars, confidenceTier: tier };
}

// =============================================================================
// 3. Aggregate barrier surfacing (algorithms.md §3) — the most important UX
// algorithm. Turns the per-report `barriers` arrays into pre-visit headline
// facts.
// =============================================================================

interface BarrierLabels {
  rare: string | null; // null = don't surface even if rare
  occasional: string | null;
  frequent: string | null;
}

const BARRIER_LABELS: Record<BarrierValue, BarrierLabels> = {
  id_required: {
    rare: "ID rarely asked here",
    occasional: "ID sometimes asked recently",
    frequent: "ID often asked recently",
  },
  medicare_required: {
    rare: "Medicare card not usually requested",
    occasional: "Medicare sometimes requested recently",
    frequent: "Medicare often requested recently",
  },
  prescription_required: {
    rare: "Script rarely required",
    occasional: "Script sometimes asked for",
    frequent: "Script asked for in recent visits",
  },
  cost_involved: {
    rare: "Reported as free",
    occasional: "Cost sometimes reported",
    frequent: "Cost reported in recent visits",
  },
  wrong_form_only: {
    rare: "Both forms usually stocked",
    occasional: "Sometimes only one form stocked",
    frequent: "Often only one form stocked",
  },
  long_wait: {
    rare: "No long waits reported",
    occasional: "Sometimes long waits",
    frequent: "Long waits in recent visits",
  },
  staff_unsure: {
    rare: "Staff usually trained here",
    occasional: "Staff sometimes unsure recently",
    frequent: "Staff often unsure recently",
  },
  staff_rude: {
    rare: null, // too sensitive to surface as a positive — see algorithms.md §3.3
    occasional: "Staff attitude flagged recently",
    frequent: "Staff attitude reported recently",
  },
  many_questions: {
    rare: "Few questions asked",
    occasional: "Sometimes many questions asked",
    frequent: "Many questions asked recently",
  },
  age_restriction: {
    rare: null,
    occasional: null,
    frequent: "Age restrictions applied recently",
  },
  limited_hours: {
    rare: null,
    occasional: null,
    frequent: null,
  },
};

const SURFACEABLE_BARRIERS = (Object.keys(BARRIER_LABELS) as BarrierValue[]).filter(
  (b) => BARRIER_LABELS[b].rare || BARRIER_LABELS[b].occasional || BARRIER_LABELS[b].frequent,
);

export function surfaceBarrierFacts(
  reports: Report[],
  now: Date = new Date(),
): BarrierFact[] {
  const cutoff30 = now.getTime() - 30 * 24 * 60 * 60 * 1000;
  const cutoff90 = now.getTime() - 90 * 24 * 60 * 60 * 1000;
  const within30: Report[] = [];
  const within90: Report[] = [];
  for (const r of reports) {
    const t = r.submittedAt.getTime();
    if (t >= cutoff90) within90.push(r);
    if (t >= cutoff30) within30.push(r);
  }
  const total30 = within30.length;
  const total90 = within90.length;

  const facts: BarrierFact[] = [];

  for (const barrier of SURFACEABLE_BARRIERS) {
    const labels = BARRIER_LABELS[barrier];
    const n30 = within30.filter((r) => r.barriers.includes(barrier)).length;
    const n90 = within90.filter((r) => r.barriers.includes(barrier)).length;

    let kind: BarrierFact["kind"] | null = null;
    if (total30 >= 5 && n30 / total30 >= 0.4) kind = "frequent";
    else if (total30 >= 3 && n30 >= 2) kind = "occasional";
    else if (total30 >= 5 && n30 === 0) kind = "rare";
    else if (total90 >= 10 && n90 / total90 <= 0.1) kind = "rare";

    if (!kind) continue;
    const label = labels[kind];
    if (!label) continue;

    let displayLabel = label;
    if (
      barrier === "cost_involved" &&
      (kind === "frequent" || kind === "occasional")
    ) {
      const median = medianCostAmount(within30);
      if (median !== null) {
        displayLabel = `${label} (typically ${formatAud(median)})`;
      }
    }

    facts.push({
      kind,
      barrier,
      label: displayLabel,
      countInWindow: kind === "rare" && total30 < 5 ? n90 : n30,
      windowDays: kind === "rare" && total30 < 5 ? 90 : 30,
    });
  }

  // Order: frequent first (most actionable warnings), then occasional, then
  // rare (positive signals last). Cap at 4 per algorithms.md §3.4.
  const rank: Record<BarrierFact["kind"], number> = {
    frequent: 0,
    occasional: 1,
    rare: 2,
  };
  facts.sort((a, b) => rank[a.kind] - rank[b.kind]);
  return facts.slice(0, 4);
}

function medianCostAmount(reports: Report[]): number | null {
  const amounts: number[] = [];
  for (const r of reports) {
    if (!r.barriers.includes("cost_involved")) continue;
    if (r.costAmount === null || r.costAmount === undefined) continue;
    const n = Number.parseFloat(String(r.costAmount));
    if (Number.isFinite(n)) amounts.push(n);
  }
  if (amounts.length < 3) return null;
  amounts.sort((a, b) => a - b);
  const mid = Math.floor(amounts.length / 2);
  return amounts.length % 2 === 0
    ? (amounts[mid - 1]! + amounts[mid]!) / 2
    : amounts[mid]!;
}

function formatAud(n: number): string {
  return `$${n.toFixed(0)}`;
}

// =============================================================================
// 4. Headline barrier filter (algorithms.md §4)
// =============================================================================

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

// =============================================================================
// 5. Pin size (algorithms.md §5)
// =============================================================================

export function calculatePinSize(totalReports: number): number {
  if (totalReports <= 0) return 16;
  return Math.min(48, 16 + Math.round(8 * Math.log10(totalReports + 1)));
}

// =============================================================================
// 6. Distance, Haversine (algorithms.md §6)
// =============================================================================

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
    Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  return R * c;
}

// =============================================================================
// 7. isOpenNow (algorithms.md §7)
// =============================================================================

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

// =============================================================================
// 8. Pin-status flip detection (algorithms.md §9) — used by Phase 4 push.
// =============================================================================

export type PinFlipKind =
  | "improvement"
  | "degradation"
  | "no_meaningful_flip";

/**
 * Classifies a pin-status transition. `grey → *` is suppressed because it
 * just means the location went from "no recent data" to "first report" —
 * not interesting. Same-status returns `no_meaningful_flip`.
 */
export function classifyPinFlip(from: PinStatus, to: PinStatus): PinFlipKind {
  if (from === to) return "no_meaningful_flip";
  if (from === "grey") return "no_meaningful_flip";
  if (to === "grey") return "no_meaningful_flip";

  // Better → worse direction
  const order: Record<PinStatus, number> = { green: 0, amber: 1, red: 2, grey: 3 };
  return order[to] > order[from] ? "degradation" : "improvement";
}

// =============================================================================
// Composition helper used by API handlers to build LocationWithConsensus.
// =============================================================================

export function composeLocationWithConsensus(
  loc: Location,
  reportsForRecency: Report[],
  allReports: Report[],
  guardianNotes: GuardianNoteWithGuardian[],
  options?: {
    distance?: number;
    isSaved?: boolean;
    isWatched?: boolean;
    now?: Date;
  },
): LocationWithConsensus {
  const now = options?.now ?? new Date();
  const status = calculatePinStatus(reportsForRecency, now);
  const reliability = calculateReliabilityScore(allReports);
  return {
    ...loc,
    pinStatus: status.status,
    pinSize: calculatePinSize(loc.totalReportsCount),
    consensusLabel: status.label,
    reliabilityStars: reliability.stars,
    recentReports: reportsForRecency,
    guardianNotes,
    barrierFacts: surfaceBarrierFacts(allReports, now),
    distance: options?.distance,
    isSaved: options?.isSaved,
    isWatched: options?.isWatched,
  };
}
