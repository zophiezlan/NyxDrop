import "dotenv/config";

import { sql } from "drizzle-orm";
import { db, schema } from "../lib/db.js";
import { logger } from "../lib/logger.js";

// =============================================================================
// Wipe ALL reports and reset per-location aggregates, but keep the 6,289
// imported locations intact. Intended for resetting the demo dataset between
// runs of seed-realistic-reports.ts without losing the THN/NSP/VIC imports.
//
// After this script: re-run `npm run db:seed-reports` to repaint the demo
// distribution, optionally followed by `npm run db:seed` if you want the
// hand-curated CBD narratives back (note: db:seed itself does a full reset
// including locations, so use db:seed-reports alone for an incremental
// repaint).
// =============================================================================

async function main(): Promise<void> {
  logger.info("reset-reports: wiping reports + device_reports");

  // device_reports references reports indirectly via location_id, not via
  // reports.id, so we can drop both with a plain DELETE in dependency order.
  // (TRUNCATE would be faster but Drizzle doesn't expose it cleanly.)
  const reportsBefore = await db.execute(sql`SELECT COUNT(*)::int AS n FROM reports`);
  const deviceBefore = await db.execute(sql`SELECT COUNT(*)::int AS n FROM device_reports`);

  await db.delete(schema.deviceReports);
  await db.delete(schema.reports);

  // Reset denormalised aggregates on every location so pinStatus collapses
  // back to grey across the board.
  const locUpdate = await db.execute(sql`
    UPDATE locations
    SET total_reports_count = 0,
        reliability_score = '0.00',
        last_report_at = NULL
    WHERE archived_at IS NULL
  `);

  logger.info(
    {
      reportsDeleted: (reportsBefore.rows[0] as { n: number }).n,
      deviceReportsDeleted: (deviceBefore.rows[0] as { n: number }).n,
      locationsReset: locUpdate.rowCount ?? 0,
    },
    "reset-reports: done",
  );
}

main().catch((err) => {
  logger.error({ err }, "reset-reports failed");
  process.exit(1);
});
