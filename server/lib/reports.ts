import { and, eq, gte, sql } from "drizzle-orm";
import { db, schema } from "./db.js";
import { checkReportAllowed, recordReport } from "./rate-limit.js";
import { sendPushToWatchers } from "./push.js";
import { logger } from "./logger.js";
import {
  calculatePinStatus,
  calculateReliabilityScore,
  classifyPinFlip,
} from "../../shared/consensus.js";
import type { InsertReport, Report, ReportType } from "../../shared/schema.js";

const SEVENTY_TWO_HOURS_MS = 72 * 60 * 60 * 1000;

export type ReportSubmissionResult =
  | { ok: true; report: Report; ackMessage: string }
  | { ok: false; reason: "rate_limited"; nextReportAllowedAt: Date };

/**
 * Insert a report, update the rate-limit ledger, recompute the location's
 * denormalised aggregates, and bump daily metrics. All in one transaction.
 *
 * Phase 1 keeps the consensus stubs from `shared/consensus.ts`; the real
 * weight-decay aggregation lands in Phase 3.
 */
export async function submitReport(
  deviceKey: string,
  insert: InsertReport,
  now: Date = new Date(),
): Promise<ReportSubmissionResult> {
  const allowed = await checkReportAllowed(deviceKey, insert.locationId, now);
  if (!allowed.canReport) {
    return {
      ok: false,
      reason: "rate_limited",
      nextReportAllowedAt: allowed.nextReportAllowedAt,
    };
  }

  // Capture pin status BEFORE the new report so we can detect a meaningful
  // flip and notify watchers (algorithms.md §9). We use the same 72h window
  // as `composeLocationWithConsensus`.
  const before = await getPinStatusFor(insert.locationId, now);

  // Insert the report.
  const [created] = await db
    .insert(schema.reports)
    .values({ ...insert, deviceKey, submittedAt: now })
    .returning();
  if (!created) throw new Error("report insert returned no row");

  await recordReport(deviceKey, insert.locationId, now);
  await recomputeLocationAggregates(insert.locationId);
  await bumpDailyMetrics(insert.reportType, now);

  // Fire-and-forget the watch alerts so we don't block the response on push
  // delivery (which can take seconds).
  void notifyOnFlip(insert.locationId, before, now).catch((err: unknown) =>
    logger.warn({ err, locationId: insert.locationId }, "watch alert dispatch failed"),
  );

  const ackMessage = await buildAckMessage(now);

  return { ok: true, report: created, ackMessage };
}

interface PinStatusSnapshot {
  status: ReturnType<typeof calculatePinStatus>["status"];
  label: string;
  locationName: string;
}

async function getPinStatusFor(
  locationId: string,
  now: Date,
): Promise<PinStatusSnapshot | null> {
  const cutoff = new Date(now.getTime() - SEVENTY_TWO_HOURS_MS);
  const recent = await db
    .select()
    .from(schema.reports)
    .where(
      and(
        eq(schema.reports.locationId, locationId),
        gte(schema.reports.submittedAt, cutoff),
      ),
    );
  const result = calculatePinStatus(recent, now);
  const [loc] = await db
    .select({ name: schema.locations.name })
    .from(schema.locations)
    .where(eq(schema.locations.id, locationId))
    .limit(1);
  return {
    status: result.status,
    label: result.label,
    locationName: loc?.name ?? "Unknown",
  };
}

async function notifyOnFlip(
  locationId: string,
  before: PinStatusSnapshot | null,
  now: Date,
): Promise<void> {
  if (!before) return;
  const after = await getPinStatusFor(locationId, now);
  if (!after) return;
  const flip = classifyPinFlip(before.status, after.status);
  if (flip === "no_meaningful_flip") return;
  await sendPushToWatchers(
    locationId,
    flip,
    before.status,
    after.status,
    after.label,
    after.locationName,
  );
}

/**
 * Recompute and persist the denormalised hot fields on `locations`:
 * `totalReportsCount`, `reliabilityScore`, `lastReportAt`. Phase 3 uses
 * `calculateReliabilityScore` from `@shared/consensus` so the server-side
 * value matches the canonical confidence-modified algorithm.
 */
export async function recomputeLocationAggregates(locationId: string): Promise<void> {
  const rows = await db
    .select()
    .from(schema.reports)
    .where(eq(schema.reports.locationId, locationId));

  if (rows.length === 0) {
    await db
      .update(schema.locations)
      .set({
        totalReportsCount: 0,
        reliabilityScore: "0.00",
        lastReportAt: null,
      })
      .where(eq(schema.locations.id, locationId));
    return;
  }

  const total = rows.length;
  const reliability = calculateReliabilityScore(rows);
  const lastReportAt = rows.reduce<Date | null>((acc, r) => {
    if (!acc || r.submittedAt.getTime() > acc.getTime()) return r.submittedAt;
    return acc;
  }, null);

  await db
    .update(schema.locations)
    .set({
      totalReportsCount: total,
      reliabilityScore: reliability.score.toFixed(2),
      lastReportAt,
    })
    .where(eq(schema.locations.id, locationId));
}

/**
 * UPSERT today's `daily_metrics` row to bump submitted-report counters.
 * Idempotent for retries within the same day.
 */
async function bumpDailyMetrics(reportType: ReportType, at: Date): Promise<void> {
  const date = isoDate(at);
  const isSuccessful = reportType === "success" || reportType === "success_but";

  await db
    .insert(schema.dailyMetrics)
    .values({
      date,
      reportsSubmitted: 1,
      successfulReports: isSuccessful ? 1 : 0,
    })
    .onConflictDoUpdate({
      target: schema.dailyMetrics.date,
      set: {
        reportsSubmitted: sql`${schema.dailyMetrics.reportsSubmitted} + 1`,
        successfulReports: sql`${schema.dailyMetrics.successfulReports} + ${isSuccessful ? 1 : 0}`,
      },
    });
}

/**
 * Build the acknowledgment string sent back with a successful report. We use
 * "people who contributed reports in the last 30 days" as a reasonable proxy
 * for the spec's intended phrasing — it's the only solidarity-shaped metric
 * available without analytics. Falls back to no second sentence if zero or
 * the query errors. See decisions.md (open: refine in Phase 6).
 */
async function buildAckMessage(now: Date): Promise<string> {
  const head = "Thanks.";
  try {
    const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const result = await db
      .select({
        n: sql<number>`COUNT(DISTINCT ${schema.reports.deviceKey})::int`,
      })
      .from(schema.reports)
      .where(gte(schema.reports.submittedAt, cutoff));
    const count = result[0]?.n ?? 0;
    if (count <= 0) return head;
    return `${head} ${count} ${count === 1 ? "person has" : "people have"} contributed reports like yours this month.`;
  } catch {
    return head;
  }
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Reports for a location, newest first, optionally constrained to the last
 * `windowDays` days.
 */
export async function listReportsForLocation(
  locationId: string,
  options: { limit: number; windowDays?: number },
): Promise<Report[]> {
  const conditions = [eq(schema.reports.locationId, locationId)];
  if (options.windowDays) {
    const cutoff = new Date(Date.now() - options.windowDays * 24 * 60 * 60 * 1000);
    conditions.push(gte(schema.reports.submittedAt, cutoff));
  }
  return db
    .select()
    .from(schema.reports)
    .where(and(...conditions))
    .orderBy(sql`${schema.reports.submittedAt} DESC`)
    .limit(options.limit);
}
