import { Router, type Request } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "../lib/db.js";
import { logger } from "../lib/logger.js";

const router: Router = Router();

function getDeviceKey(req: Request): string | null {
  const v = req.header("x-device-key");
  if (!v || typeof v !== "string" || v.length < 16) return null;
  return v;
}

// -----------------------------------------------------------------------------
// POST /api/device/forget — delete server-side per-device data
//
// Per contracts.md: deletes saved_places, watches, push_subscriptions, and
// device_reports for the calling device key. Does NOT delete rows from
// `reports` — those are anonymised contributions to public consensus
// (see decisions.md D-002).
// -----------------------------------------------------------------------------

router.post("/api/device/forget", async (req, res, next) => {
  try {
    const deviceKey = getDeviceKey(req);
    if (!deviceKey) {
      res.status(400).json({ error: "Missing X-Device-Key", code: "BAD_DEVICE_KEY" });
      return;
    }
    await db
      .delete(schema.savedPlaces)
      .where(eq(schema.savedPlaces.deviceKey, deviceKey));
    await db.delete(schema.watches).where(eq(schema.watches.deviceKey, deviceKey));
    await db
      .delete(schema.pushSubscriptions)
      .where(eq(schema.pushSubscriptions.deviceKey, deviceKey));
    await db
      .delete(schema.deviceReports)
      .where(eq(schema.deviceReports.deviceKey, deviceKey));
    logger.info("device data forgotten");
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// -----------------------------------------------------------------------------
// GET /api/me/visits — locations this device has reported on, newest first,
// each with the most recent report's verdict and barriers.
// -----------------------------------------------------------------------------

router.get("/api/me/visits", async (req, res, next) => {
  try {
    const deviceKey = getDeviceKey(req);
    if (!deviceKey) {
      res.status(400).json({ error: "Missing X-Device-Key", code: "BAD_DEVICE_KEY" });
      return;
    }

    // Pull all of this device's reports newest-first; join with location.
    // For Phase 4 a simple per-location latest is enough — the user has tens,
    // not thousands, of personal reports.
    const rows = await db
      .select({
        reportId: schema.reports.id,
        locationId: schema.reports.locationId,
        reportType: schema.reports.reportType,
        barriers: schema.reports.barriers,
        submittedAt: schema.reports.submittedAt,
        location: {
          id: schema.locations.id,
          name: schema.locations.name,
          address: schema.locations.address,
          latitude: schema.locations.latitude,
          longitude: schema.locations.longitude,
          type: schema.locations.type,
        },
      })
      .from(schema.reports)
      .innerJoin(
        schema.locations,
        and(
          eq(schema.reports.locationId, schema.locations.id),
          // Don't surface visits to archived locations.
          sql`${schema.locations.archivedAt} IS NULL`,
        ),
      )
      .where(eq(schema.reports.deviceKey, deviceKey))
      .orderBy(desc(schema.reports.submittedAt));

    // Collapse to latest per location.
    const seen = new Set<string>();
    const visits = rows.filter((r) => {
      if (seen.has(r.locationId)) return false;
      seen.add(r.locationId);
      return true;
    });

    res.json(visits);
  } catch (err) {
    logger.error({ err }, "GET /api/me/visits failed");
    next(err);
  }
});

export default router;
