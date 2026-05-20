import "dotenv/config";

import { sql } from "drizzle-orm";
import { db, schema } from "../lib/db.js";
import { logger } from "../lib/logger.js";
import { calculateReliabilityScore } from "../../shared/consensus.js";
import {
  BARRIERS_FOR_REPORT_TYPE,
  type BarrierValue,
  type Report,
  type ReportType,
} from "../../shared/schema.js";

// =============================================================================
// Realistic-distribution report generator.
//
// Companion to seed.ts. seed.ts curates ~30 headline CBD venues with
// hand-tuned narratives. THIS script paints the rest of the imported
// government registry (~6,200 venues) with population-weighted, venue-typed,
// urbanicity-aware, power-law-distributed visitor reports — so that the
// review experience doesn't show 99.5% grey pins.
//
// Idempotent semantics: venues that already have ANY reports are skipped.
// This means seed.ts can run first (or last) without conflict, and re-running
// this script won't pile on additional reports to the same venues.
//
// Output sentry: all venues are still demo data — the VITE_DEMO_MODE banners
// in the UI must remain on while this seed is in play.
// =============================================================================

// Reproducibility — change SEED to regenerate. Stable seed = stable demo.
const SEED = 0xc0ffee;
const TARGET_VENUE_COUNT = 600;
const REPORT_BATCH_SIZE = 500;

// -----------------------------------------------------------------------------
// Deterministic PRNG (mulberry32). Stable across runs given the same SEED so
// the demo dataset is reproducible.
// -----------------------------------------------------------------------------
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)]!;
}
function weightedPick<T>(rng: () => number, items: ReadonlyArray<[T, number]>): T {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [v, w] of items) {
    r -= w;
    if (r <= 0) return v;
  }
  return items[items.length - 1]![0];
}

// -----------------------------------------------------------------------------
// State + urbanicity classification
// -----------------------------------------------------------------------------
type AusState = "NSW" | "VIC" | "QLD" | "WA" | "SA" | "TAS" | "ACT" | "NT" | "OTHER";

const STATE_PATTERNS: Array<[AusState, RegExp]> = [
  ["NSW", /\b(NSW|New South Wales)\b/i],
  ["VIC", /\b(VIC|Victoria)\b/i],
  ["QLD", /\b(QLD|Queensland)\b/i],
  ["WA", /\b(WA|Western Australia)\b/i],
  ["SA", /\b(SA|South Australia)\b/i],
  ["TAS", /\b(TAS|Tasmania)\b/i],
  ["ACT", /\b(ACT|Australian Capital Territory)\b/i],
  ["NT", /\b(NT|Northern Territory)\b/i],
];
function parseState(address: string | null): AusState {
  if (!address) return "OTHER";
  for (const [s, rx] of STATE_PATTERNS) if (rx.test(address)) return s;
  return "OTHER";
}

// Population shares (ABS-style, normalised to states we sample from). Used
// to weight per-state venue selection so a Perth reviewer sees activity even
// though absolute imported counts skew east-coast.
const STATE_POP_WEIGHT: Record<AusState, number> = {
  NSW: 32,
  VIC: 26,
  QLD: 20,
  WA: 11,
  SA: 7,
  TAS: 2,
  ACT: 2,
  NT: 1,
  OTHER: 0,
};

// City centres for the urbanicity bucket. Within ~30 km → metro, else
// → regional. Coarse but enough to drive the narrative split.
const CITIES: ReadonlyArray<[string, number, number]> = [
  ["Sydney", -33.8688, 151.2093],
  ["Melbourne", -37.8136, 144.9631],
  ["Brisbane", -27.4698, 153.0251],
  ["Perth", -31.9514, 115.8617],
  ["Adelaide", -34.9285, 138.6007],
  ["Hobart", -42.8821, 147.3272],
  ["Canberra", -35.2809, 149.1300],
  ["Darwin", -12.4634, 130.8456],
  ["Newcastle", -32.9283, 151.7817],
  ["Wollongong", -34.4278, 150.8931],
  ["Central Coast", -33.4280, 151.3420],
  ["Geelong", -38.1499, 144.3617],
  ["Gold Coast", -28.0167, 153.4000],
  ["Sunshine Coast", -26.6500, 153.0667],
  ["Townsville", -19.2589, 146.8169],
  ["Cairns", -16.9203, 145.7710],
];
const METRO_RADIUS_KM = 35;

function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
function classifyUrbanicity(lat: number, lon: number): "metro" | "regional" {
  for (const [, cLat, cLon] of CITIES) {
    if (haversineKm(lat, lon, cLat, cLon) <= METRO_RADIUS_KM) return "metro";
  }
  return "regional";
}

// -----------------------------------------------------------------------------
// Narrative profiles per (venue-type, urbanicity) combo.
// `type` mix sums to 100. `barriers` are weighted choices applied to
// success_but / out_of_stock / denied reports per BARRIERS_FOR_REPORT_TYPE
// rules in shared/schema.ts (success carries no barriers).
// -----------------------------------------------------------------------------
type Narrative = {
  /** report-type distribution, weights sum to ~100 */
  typeMix: ReadonlyArray<[ReportType, number]>;
  /** weighted pool of barriers; applied per report subject to legality */
  barrierPool: ReadonlyArray<[BarrierValue, number]>;
  /** chance (0..1) a success_but / denied report includes a cost amount */
  costChance: number;
  /** mean number of barriers per non-success report */
  barriersPerReportMean: number;
};

const NARRATIVES: Record<string, Narrative> = {
  // Peer-led, harm-reduction-focused services: lots of success, low barriers.
  "nsp+metro": {
    typeMix: [["success", 78], ["success_but", 14], ["out_of_stock", 6], ["denied", 2]],
    barrierPool: [["long_wait", 3], ["staff_unsure", 2], ["limited_hours", 2]],
    costChance: 0,
    barriersPerReportMean: 1.0,
  },
  "nsp+regional": {
    typeMix: [["success", 70], ["success_but", 16], ["out_of_stock", 12], ["denied", 2]],
    barrierPool: [["limited_hours", 4], ["long_wait", 2], ["staff_unsure", 2], ["wrong_form_only", 3]],
    costChance: 0,
    barriersPerReportMean: 1.1,
  },
  "drop_in_centre+metro": {
    typeMix: [["success", 82], ["success_but", 13], ["out_of_stock", 4], ["denied", 1]],
    barrierPool: [["limited_hours", 3], ["staff_unsure", 1]],
    costChance: 0,
    barriersPerReportMean: 0.9,
  },
  "drop_in_centre+regional": {
    typeMix: [["success", 75], ["success_but", 15], ["out_of_stock", 8], ["denied", 2]],
    barrierPool: [["limited_hours", 4], ["staff_unsure", 2]],
    costChance: 0,
    barriersPerReportMean: 1.0,
  },
  "community_health+metro": {
    typeMix: [["success", 72], ["success_but", 18], ["out_of_stock", 6], ["denied", 4]],
    barrierPool: [["limited_hours", 3], ["medicare_required", 2], ["long_wait", 3], ["staff_unsure", 2]],
    costChance: 0,
    barriersPerReportMean: 1.1,
  },
  "community_health+regional": {
    typeMix: [["success", 70], ["success_but", 16], ["out_of_stock", 9], ["denied", 5]],
    barrierPool: [["limited_hours", 4], ["medicare_required", 2], ["staff_unsure", 3]],
    costChance: 0,
    barriersPerReportMean: 1.1,
  },
  "aod_organisation+metro": {
    typeMix: [["success", 80], ["success_but", 14], ["out_of_stock", 4], ["denied", 2]],
    barrierPool: [["limited_hours", 3], ["long_wait", 2]],
    costChance: 0,
    barriersPerReportMean: 0.9,
  },
  "aod_organisation+regional": {
    typeMix: [["success", 75], ["success_but", 15], ["out_of_stock", 8], ["denied", 2]],
    barrierPool: [["limited_hours", 4]],
    costChance: 0,
    barriersPerReportMean: 1.0,
  },
  // Pharmacy metro: realistic mix of "asked for script", "asked for ID",
  // "charged me", "didn't know what I meant".
  "pharmacy+metro": {
    typeMix: [["success", 55], ["success_but", 22], ["out_of_stock", 10], ["denied", 13]],
    barrierPool: [
      ["id_required", 6],
      ["prescription_required", 5],
      ["cost_involved", 4],
      ["many_questions", 5],
      ["staff_unsure", 4],
      ["medicare_required", 3],
      ["staff_rude", 2],
      ["long_wait", 2],
      ["wrong_form_only", 2],
    ],
    costChance: 0.35,
    barriersPerReportMean: 1.4,
  },
  // Pharmacy regional: less ID/cost gatekeeping; more stock issues.
  "pharmacy+regional": {
    typeMix: [["success", 62], ["success_but", 16], ["out_of_stock", 16], ["denied", 6]],
    barrierPool: [
      ["staff_unsure", 6],
      ["wrong_form_only", 4],
      ["limited_hours", 4],
      ["prescription_required", 3],
      ["many_questions", 3],
      ["id_required", 2],
      ["cost_involved", 2],
    ],
    costChance: 0.25,
    barriersPerReportMean: 1.3,
  },
  // Hospital ED: gets it eventually, but long waits and lots of questions.
  "hospital+metro": {
    typeMix: [["success", 60], ["success_but", 28], ["out_of_stock", 5], ["denied", 7]],
    barrierPool: [
      ["long_wait", 8],
      ["many_questions", 5],
      ["staff_unsure", 3],
      ["medicare_required", 3],
      ["id_required", 2],
    ],
    costChance: 0,
    barriersPerReportMean: 1.5,
  },
  "hospital+regional": {
    typeMix: [["success", 58], ["success_but", 27], ["out_of_stock", 8], ["denied", 7]],
    barrierPool: [
      ["long_wait", 7],
      ["many_questions", 4],
      ["staff_unsure", 4],
      ["limited_hours", 3],
    ],
    costChance: 0,
    barriersPerReportMean: 1.5,
  },
  // Libraries / public buildings dispense via NSP partnerships — usually
  // smooth, anonymous; barriers are mostly hours.
  "library+metro": {
    typeMix: [["success", 84], ["success_but", 12], ["out_of_stock", 3], ["denied", 1]],
    barrierPool: [["limited_hours", 4], ["staff_unsure", 2]],
    costChance: 0,
    barriersPerReportMean: 0.8,
  },
  "library+regional": {
    typeMix: [["success", 78], ["success_but", 14], ["out_of_stock", 6], ["denied", 2]],
    barrierPool: [["limited_hours", 4], ["staff_unsure", 3]],
    costChance: 0,
    barriersPerReportMean: 0.9,
  },
  // Public buildings / festival sites / other — generic balanced profile.
  default: {
    typeMix: [["success", 65], ["success_but", 20], ["out_of_stock", 10], ["denied", 5]],
    barrierPool: [
      ["staff_unsure", 4],
      ["limited_hours", 3],
      ["long_wait", 2],
      ["id_required", 2],
      ["many_questions", 2],
    ],
    costChance: 0.10,
    barriersPerReportMean: 1.1,
  },
};

function narrativeFor(type: string, urb: "metro" | "regional"): Narrative {
  const key = `${type}+${urb}`;
  return NARRATIVES[key] ?? NARRATIVES.default!;
}

// -----------------------------------------------------------------------------
// Power-law for report count per selected venue.
// Distribution (cumulative): 60% have 1-3, 25% have 4-9, 12% have 10-25,
// 3% have 26-80. Yields a heavy-tailed dataset like real grassroots data.
// -----------------------------------------------------------------------------
function powerLawReportCount(rng: () => number): number {
  const r = rng();
  if (r < 0.60) return 1 + Math.floor(rng() * 3);          // 1..3
  if (r < 0.85) return 4 + Math.floor(rng() * 6);          // 4..9
  if (r < 0.97) return 10 + Math.floor(rng() * 16);        // 10..25
  return 26 + Math.floor(rng() * 55);                       // 26..80
}

// Report age (days) — weighted recent so pinStatus + barrierFacts compute
// meaningfully against the algorithm's 72h / 30d / 90d windows.
function pickAgeDays(rng: () => number): number {
  const r = rng();
  if (r < 0.40) return rng() * 7;        // 0-7d
  if (r < 0.75) return 7 + rng() * 23;   // 7-30d
  if (r < 0.95) return 30 + rng() * 30;  // 30-60d
  return 60 + rng() * 30;                // 60-90d
}

function pickBarriers(
  rng: () => number,
  reportType: ReportType,
  n: Narrative,
): BarrierValue[] {
  if (reportType === "success") return [];
  const allowed = BARRIERS_FOR_REPORT_TYPE[reportType];
  if (allowed.size === 0) return [];
  const pool = n.barrierPool.filter(([b]) => allowed.has(b));
  if (pool.length === 0) return [];
  // Poisson-ish: target the mean, allow up to 3.
  const count = Math.max(1, Math.min(3, Math.round(n.barriersPerReportMean + (rng() - 0.5))));
  const chosen = new Set<BarrierValue>();
  for (let i = 0; i < count * 3 && chosen.size < count; i++) {
    chosen.add(weightedPick(rng, pool));
  }
  return [...chosen];
}

function fakeDeviceKey(rng: () => number): string {
  let out = "";
  for (let i = 0; i < 16; i++) {
    out += Math.floor(rng() * 256).toString(16).padStart(2, "0");
  }
  return out;
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------
interface LocRow {
  id: string;
  name: string;
  address: string | null;
  latitude: string;
  longitude: string;
  type: string;
  hasReports: boolean;
}

async function main(): Promise<void> {
  const rng = makeRng(SEED);
  logger.info({ seed: SEED, target: TARGET_VENUE_COUNT }, "realistic-reports: starting");

  // Pull all non-archived locations and whether they already have any reports.
  // Doing the has-reports check in one go is cheaper than per-venue probes.
  const rows = (await db.execute(sql`
    SELECT
      l.id,
      l.name,
      l.address,
      l.latitude::text   AS latitude,
      l.longitude::text  AS longitude,
      l.type,
      EXISTS (SELECT 1 FROM reports r WHERE r.location_id = l.id) AS has_reports
    FROM locations l
    WHERE l.archived_at IS NULL
  `)).rows as unknown as Array<{
    id: string;
    name: string;
    address: string | null;
    latitude: string;
    longitude: string;
    type: string;
    has_reports: boolean;
  }>;

  logger.info({ total: rows.length }, "realistic-reports: loaded locations");

  // Classify + filter to unreported.
  const candidates: Array<LocRow & { state: AusState; urb: "metro" | "regional" }> = [];
  let alreadyReported = 0;
  for (const r of rows) {
    if (r.has_reports) {
      alreadyReported++;
      continue;
    }
    const lat = Number(r.latitude);
    const lon = Number(r.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    candidates.push({
      id: r.id,
      name: r.name,
      address: r.address,
      latitude: r.latitude,
      longitude: r.longitude,
      type: r.type,
      hasReports: r.has_reports,
      state: parseState(r.address),
      urb: classifyUrbanicity(lat, lon),
    });
  }

  logger.info(
    { eligible: candidates.length, alreadyReported },
    "realistic-reports: classified candidates",
  );

  // Group by state and sample weighted by population.
  const byState = new Map<AusState, typeof candidates>();
  for (const c of candidates) {
    const arr = byState.get(c.state) ?? [];
    arr.push(c);
    byState.set(c.state, arr);
  }

  // Renormalise weights to states we actually have venues in.
  const presentStates = [...byState.keys()].filter((s) => STATE_POP_WEIGHT[s] > 0);
  const totalWeight = presentStates.reduce((s, st) => s + STATE_POP_WEIGHT[st], 0);
  const perStateTarget = new Map<AusState, number>();
  for (const st of presentStates) {
    const ideal = Math.round((STATE_POP_WEIGHT[st] / totalWeight) * TARGET_VENUE_COUNT);
    const have = byState.get(st)!.length;
    perStateTarget.set(st, Math.min(ideal, have));
  }
  // Anything missing (e.g. SA only has 1 venue) — redistribute the slack
  // to the states that DO have headroom.
  let allocated = [...perStateTarget.values()].reduce((s, n) => s + n, 0);
  let slack = TARGET_VENUE_COUNT - allocated;
  for (const st of presentStates) {
    if (slack <= 0) break;
    const have = byState.get(st)!.length;
    const cur = perStateTarget.get(st)!;
    const room = have - cur;
    if (room <= 0) continue;
    const take = Math.min(room, slack);
    perStateTarget.set(st, cur + take);
    slack -= take;
  }

  // Sample per state. Fisher-Yates partial shuffle.
  const selected: typeof candidates = [];
  for (const [st, target] of perStateTarget) {
    const pool = [...byState.get(st)!];
    for (let i = 0; i < target && pool.length > 0; i++) {
      const idx = Math.floor(rng() * pool.length);
      selected.push(pool[idx]!);
      pool[idx] = pool[pool.length - 1]!;
      pool.pop();
    }
  }

  logger.info(
    {
      selectedTotal: selected.length,
      perState: Object.fromEntries(perStateTarget),
    },
    "realistic-reports: selected venues",
  );

  // Generate + insert reports. Batch for speed.
  type ReportInsert = typeof schema.reports.$inferInsert;
  const buffer: ReportInsert[] = [];
  const venueReportCounts = new Map<string, number>();
  let venuesProcessed = 0;
  let reportsGenerated = 0;

  async function flush(): Promise<void> {
    if (buffer.length === 0) return;
    await db.insert(schema.reports).values(buffer);
    buffer.length = 0;
  }

  for (const venue of selected) {
    const narrative = narrativeFor(venue.type, venue.urb);
    const count = powerLawReportCount(rng);
    venueReportCounts.set(venue.id, count);

    for (let i = 0; i < count; i++) {
      const reportType = weightedPick(rng, narrative.typeMix);
      const barriers = pickBarriers(rng, reportType, narrative);
      const ageDays = pickAgeDays(rng);
      const submittedAt = new Date(Date.now() - ageDays * 24 * 60 * 60 * 1000);
      const deviceKey = fakeDeviceKey(rng);

      const includeCost =
        narrative.costChance > 0 &&
        barriers.includes("cost_involved") &&
        rng() < narrative.costChance;
      const cost = includeCost ? (15 + Math.floor(rng() * 50)).toFixed(2) : undefined;

      buffer.push({
        locationId: venue.id,
        deviceKey,
        reportType,
        visitDate: isoDate(submittedAt),
        submittedAt,
        barriers,
        ...(cost !== undefined ? { costAmount: cost } : {}),
      });
      reportsGenerated++;

      if (buffer.length >= REPORT_BATCH_SIZE) await flush();
    }

    venuesProcessed++;
    if (venuesProcessed % 50 === 0) {
      logger.info(
        { venuesProcessed, reportsGenerated },
        "realistic-reports: progress",
      );
    }
  }
  await flush();

  logger.info(
    { venues: venuesProcessed, reports: reportsGenerated },
    "realistic-reports: inserts complete, recomputing aggregates",
  );

  // Recompute per-venue aggregates. Batch via SQL where possible — but we
  // need calculateReliabilityScore() which is in JS, so fetch + per-venue
  // update. Touched venues only.
  let aggUpdated = 0;
  for (const venueId of venueReportCounts.keys()) {
    const reports = (await db
      .select()
      .from(schema.reports)
      .where(sql`${schema.reports.locationId} = ${venueId}`)) as Report[];
    const lastReportAt = reports.reduce<Date | null>((acc, r) => {
      if (!acc || r.submittedAt.getTime() > acc.getTime()) return r.submittedAt;
      return acc;
    }, null);
    const reliability = calculateReliabilityScore(reports);
    await db
      .update(schema.locations)
      .set({
        totalReportsCount: reports.length,
        reliabilityScore: reliability.score.toFixed(2),
        lastReportAt,
      })
      .where(sql`${schema.locations.id} = ${venueId}`);
    aggUpdated++;
    if (aggUpdated % 100 === 0) {
      logger.info({ aggUpdated }, "realistic-reports: aggregates");
    }
  }

  logger.info(
    {
      venues: venuesProcessed,
      reports: reportsGenerated,
      aggregatesUpdated: aggUpdated,
    },
    "realistic-reports: done",
  );
}

main().catch((err) => {
  logger.error({ err }, "realistic-reports failed");
  process.exit(1);
});
