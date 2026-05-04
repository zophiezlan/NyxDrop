import { and, eq } from "drizzle-orm";
import { db, schema } from "./db.js";

const REPORT_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Returns the timestamp at which this device may submit its next report for
 * `locationId`, or `null` if a report is allowed right now.
 *
 * Source of truth is the `device_reports` ledger — one row per
 * (deviceKey, locationId) pair, updated transactionally by `recordReport`.
 */
export async function checkReportAllowed(
  deviceKey: string,
  locationId: string,
  now: Date = new Date(),
): Promise<{ canReport: true } | { canReport: false; nextReportAllowedAt: Date }> {
  const [existing] = await db
    .select()
    .from(schema.deviceReports)
    .where(
      and(
        eq(schema.deviceReports.deviceKey, deviceKey),
        eq(schema.deviceReports.locationId, locationId),
      ),
    )
    .limit(1);

  if (!existing) return { canReport: true };

  const nextAllowed = new Date(existing.lastReportAt.getTime() + REPORT_WINDOW_MS);
  if (now >= nextAllowed) return { canReport: true };
  return { canReport: false, nextReportAllowedAt: nextAllowed };
}

/**
 * Records that the given device has just submitted a report for the given
 * location, updating the ledger via UPSERT. Caller must already have inserted
 * the report row in the same transaction context — this helper just keeps the
 * rate-limit ledger in sync.
 */
export async function recordReport(
  deviceKey: string,
  locationId: string,
  at: Date = new Date(),
): Promise<void> {
  await db
    .insert(schema.deviceReports)
    .values({ deviceKey, locationId, lastReportAt: at })
    .onConflictDoUpdate({
      target: [schema.deviceReports.deviceKey, schema.deviceReports.locationId],
      set: { lastReportAt: at },
    });
}
