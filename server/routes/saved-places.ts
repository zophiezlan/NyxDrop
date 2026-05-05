import { Router, type Request } from "express";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "../lib/db.js";
import { insertSavedPlaceSchema } from "../../shared/schema.js";
import { logger } from "../lib/logger.js";

const router: Router = Router();

function getDeviceKey(req: Request): string | null {
  const v = req.header("x-device-key");
  if (!v || typeof v !== "string" || v.length < 16) return null;
  return v;
}

// -----------------------------------------------------------------------------
// GET /api/saved-places — joined with Location summary
// -----------------------------------------------------------------------------

router.get("/api/saved-places", async (req, res, next) => {
  try {
    const deviceKey = getDeviceKey(req);
    if (!deviceKey) {
      res.status(400).json({ error: "Missing X-Device-Key", code: "BAD_DEVICE_KEY" });
      return;
    }
    const rows = await db
      .select({
        id: schema.savedPlaces.id,
        locationId: schema.savedPlaces.locationId,
        personalLabel: schema.savedPlaces.personalLabel,
        personalNote: schema.savedPlaces.personalNote,
        createdAt: schema.savedPlaces.createdAt,
        location: {
          id: schema.locations.id,
          name: schema.locations.name,
          address: schema.locations.address,
          latitude: schema.locations.latitude,
          longitude: schema.locations.longitude,
          type: schema.locations.type,
          totalReportsCount: schema.locations.totalReportsCount,
          reliabilityScore: schema.locations.reliabilityScore,
          lastReportAt: schema.locations.lastReportAt,
        },
      })
      .from(schema.savedPlaces)
      .innerJoin(
        schema.locations,
        eq(schema.savedPlaces.locationId, schema.locations.id),
      )
      .where(eq(schema.savedPlaces.deviceKey, deviceKey))
      .orderBy(desc(schema.savedPlaces.createdAt));
    res.json(rows);
  } catch (err) {
    logger.error({ err }, "GET /api/saved-places failed");
    next(err);
  }
});

// -----------------------------------------------------------------------------
// POST /api/saved-places — save a location
// -----------------------------------------------------------------------------

router.post("/api/saved-places", async (req, res, next) => {
  try {
    const deviceKey = getDeviceKey(req);
    if (!deviceKey) {
      res.status(400).json({ error: "Missing X-Device-Key", code: "BAD_DEVICE_KEY" });
      return;
    }
    const parsed = insertSavedPlaceSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "Invalid saved-place data",
        code: "VALIDATION_FAILED",
        fields: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    // Check for an existing entry first so we can return 409.
    const [existing] = await db
      .select()
      .from(schema.savedPlaces)
      .where(
        and(
          eq(schema.savedPlaces.deviceKey, deviceKey),
          eq(schema.savedPlaces.locationId, parsed.data.locationId),
        ),
      )
      .limit(1);
    if (existing) {
      res.status(409).json({ error: "Already saved", code: "ALREADY_SAVED" });
      return;
    }

    const [created] = await db
      .insert(schema.savedPlaces)
      .values({ ...parsed.data, deviceKey })
      .returning();
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

// -----------------------------------------------------------------------------
// PATCH /api/saved-places/:id — update label/note
// -----------------------------------------------------------------------------

const patchSchema = z.object({
  personalLabel: z.string().max(40).nullish(),
  personalNote: z.string().max(500).nullish(),
});

router.patch("/api/saved-places/:id", async (req, res, next) => {
  try {
    const deviceKey = getDeviceKey(req);
    if (!deviceKey) {
      res.status(400).json({ error: "Missing X-Device-Key", code: "BAD_DEVICE_KEY" });
      return;
    }
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "Invalid patch",
        code: "VALIDATION_FAILED",
        fields: parsed.error.flatten().fieldErrors,
      });
      return;
    }
    const [updated] = await db
      .update(schema.savedPlaces)
      .set(parsed.data)
      .where(
        and(
          eq(schema.savedPlaces.id, req.params.id),
          eq(schema.savedPlaces.deviceKey, deviceKey),
        ),
      )
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Not found", code: "NOT_FOUND" });
      return;
    }
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// -----------------------------------------------------------------------------
// DELETE /api/saved-places/:id
// -----------------------------------------------------------------------------

router.delete("/api/saved-places/:id", async (req, res, next) => {
  try {
    const deviceKey = getDeviceKey(req);
    if (!deviceKey) {
      res.status(400).json({ error: "Missing X-Device-Key", code: "BAD_DEVICE_KEY" });
      return;
    }
    const result = await db
      .delete(schema.savedPlaces)
      .where(
        and(
          eq(schema.savedPlaces.id, req.params.id),
          eq(schema.savedPlaces.deviceKey, deviceKey),
        ),
      )
      .returning();
    if (result.length === 0) {
      res.status(404).json({ error: "Not found", code: "NOT_FOUND" });
      return;
    }
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
