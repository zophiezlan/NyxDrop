import "dotenv/config";

import { sql } from "drizzle-orm";
import { db, schema } from "../lib/db.js";
import { logger } from "../lib/logger.js";

// =============================================================================
// Nuclear reset — wipes locations, reports, device_reports, saved places,
// watches, and guardian notes. Use this when you want to start from a
// completely empty database before re-running imports + seeds.
//
// Does NOT touch guardian accounts (so your admin token still works) or
// push subscriptions. To wipe those too, drop the schema and re-push.
//
// Typical workflow after running this:
//   npm run db:import-thn
//   npm run db:import-nsw-nsp
//   npm run db:import-vic-nsp
//   npm run db:seed                    # adds the hand-curated CBD venues
//   npm run db:seed-reports            # paints realistic distribution
// =============================================================================

async function main(): Promise<void> {
  logger.info("reset-all: wiping locations + all dependent rows");

  const before = await db.execute(sql`
    SELECT
      (SELECT COUNT(*)::int FROM locations)       AS locations,
      (SELECT COUNT(*)::int FROM reports)         AS reports,
      (SELECT COUNT(*)::int FROM device_reports)  AS device_reports
  `);
  const beforeCounts = before.rows[0] as {
    locations: number;
    reports: number;
    device_reports: number;
  };

  // Delete in dependency order. Most child tables CASCADE from locations,
  // but being explicit makes the intent obvious and avoids surprise on
  // schema changes.
  await db.delete(schema.deviceReports);
  await db.delete(schema.reports);
  // guardian_notes, saved_places, watches all FK to locations with ON DELETE
  // CASCADE — the locations delete below will sweep them.
  await db.delete(schema.locations);

  logger.info(
    {
      locationsDeleted: beforeCounts.locations,
      reportsDeleted: beforeCounts.reports,
      deviceReportsDeleted: beforeCounts.device_reports,
    },
    "reset-all: done — re-run imports + seeds to repopulate",
  );
}

main().catch((err) => {
  logger.error({ err }, "reset-all failed");
  process.exit(1);
});
