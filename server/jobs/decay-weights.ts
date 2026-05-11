import { sql } from "drizzle-orm";
import { db, schema } from "../lib/db.js";
import { logger } from "../lib/logger.js";

const HOUR_MS = 60 * 60 * 1000;

/**
 * One pass that refreshes `reports.weight` per algorithms.md §8: a single
 * batched UPDATE rather than per-row roundtrips, so it's cheap to run on
 * Neon's HTTP driver. Returns the number of rows affected.
 *
 * weight(t) = 0.5 ^ (ageHours / 48) for ageHours ≤ 168, else 0.
 */
async function runWeightDecayPass(): Promise<number> {
  const start = Date.now();
  const result = await db.execute(sql`
    UPDATE ${schema.reports}
    SET weight = CASE
      WHEN EXTRACT(EPOCH FROM (NOW() - submitted_at)) / 3600 > 168 THEN 0
      ELSE ROUND(
        POWER(0.5, EXTRACT(EPOCH FROM (NOW() - submitted_at)) / 3600 / 48)::numeric,
        3
      )
    END
  `);
  const rows = (result as { rowCount?: number; rowsAffected?: number }).rowCount
    ?? (result as { rowsAffected?: number }).rowsAffected
    ?? 0;
  logger.info({ durationMs: Date.now() - start, rows }, "decay-weights pass complete");
  return rows;
}

let timer: ReturnType<typeof setInterval> | null = null;

/**
 * Start the hourly weight-decay scheduler. Idempotent: calling twice replaces
 * the previous timer rather than stacking. Call once from server bootstrap.
 *
 * The first pass runs immediately on boot so a freshly-restarted process
 * doesn't hold stale weights for up to an hour. Subsequent passes are
 * spaced by HOUR_MS. Per algorithms.md §8.3 anything more frequent than
 * hourly buys you nothing — half-life is 48h.
 */
export function startWeightDecayScheduler(): void {
  if (timer) clearInterval(timer);
  void runWeightDecayPass().catch((err: unknown) =>
    logger.error({ err }, "decay-weights initial pass failed"),
  );
  timer = setInterval(() => {
    void runWeightDecayPass().catch((err: unknown) =>
      logger.error({ err }, "decay-weights pass failed"),
    );
  }, HOUR_MS);
  // Don't keep the event loop alive on shutdown.
  if (typeof timer.unref === "function") timer.unref();
}

export function stopWeightDecayScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
