import { Router } from "express";
import { gte, sql } from "drizzle-orm";
import { db, schema } from "../lib/db.js";
import { logger } from "../lib/logger.js";

const router: Router = Router();

interface MetricsSummary {
  totalLocations: number;
  reportsLast30Days: number;
  /** Decimal share 0..1 of last-30d reports that were success or success_but. */
  successShareLast30Days: number;
  lastUpdated: string;
}

let cache: { value: MetricsSummary; expiresAt: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

router.get("/api/metrics/summary", async (_req, res, next) => {
  try {
    if (cache && cache.expiresAt > Date.now()) {
      res.json(cache.value);
      return;
    }

    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [{ total = 0 } = { total: 0 }] = await db
      .select({ total: sql<number>`COUNT(*)::int` })
      .from(schema.locations)
      .where(sql`${schema.locations.archivedAt} IS NULL`);

    const reportsRow = await db
      .select({
        all: sql<number>`COUNT(*)::int`,
        ok: sql<number>`COUNT(*) FILTER (WHERE ${schema.reports.reportType} IN ('success','success_but'))::int`,
      })
      .from(schema.reports)
      .where(gte(schema.reports.submittedAt, cutoff));
    const all = reportsRow[0]?.all ?? 0;
    const ok = reportsRow[0]?.ok ?? 0;
    const successShare = all === 0 ? 0 : ok / all;

    const value: MetricsSummary = {
      totalLocations: total,
      reportsLast30Days: all,
      successShareLast30Days: Number(successShare.toFixed(2)),
      lastUpdated: new Date().toISOString(),
    };

    cache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    res.json(value);
  } catch (err) {
    logger.error({ err }, "GET /api/metrics/summary failed");
    next(err);
  }
});

export default router;
