import { Router, type Request } from "express";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "../lib/db.js";
import { insertWatchSchema } from "@shared/schema";
import { logger } from "../lib/logger.js";

const router: Router = Router();

function getDeviceKey(req: Request): string | null {
  const v = req.header("x-device-key");
  if (!v || typeof v !== "string" || v.length < 16) return null;
  return v;
}

router.get("/api/watches", async (req, res, next) => {
  try {
    const deviceKey = getDeviceKey(req);
    if (!deviceKey) {
      res.status(400).json({ error: "Missing X-Device-Key", code: "BAD_DEVICE_KEY" });
      return;
    }
    const rows = await db
      .select({
        id: schema.watches.id,
        locationId: schema.watches.locationId,
        alertOnStatusChange: schema.watches.alertOnStatusChange,
        alertOnGuardianNote: schema.watches.alertOnGuardianNote,
        lastAlertAt: schema.watches.lastAlertAt,
        createdAt: schema.watches.createdAt,
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
      .from(schema.watches)
      .innerJoin(
        schema.locations,
        eq(schema.watches.locationId, schema.locations.id),
      )
      .where(eq(schema.watches.deviceKey, deviceKey))
      .orderBy(desc(schema.watches.createdAt));
    res.json(rows);
  } catch (err) {
    logger.error({ err }, "GET /api/watches failed");
    next(err);
  }
});

router.post("/api/watches", async (req, res, next) => {
  try {
    const deviceKey = getDeviceKey(req);
    if (!deviceKey) {
      res.status(400).json({ error: "Missing X-Device-Key", code: "BAD_DEVICE_KEY" });
      return;
    }
    const parsed = insertWatchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "Invalid watch data",
        code: "VALIDATION_FAILED",
        fields: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const [existing] = await db
      .select()
      .from(schema.watches)
      .where(
        and(
          eq(schema.watches.deviceKey, deviceKey),
          eq(schema.watches.locationId, parsed.data.locationId),
        ),
      )
      .limit(1);
    if (existing) {
      res.status(409).json({ error: "Already watching", code: "ALREADY_WATCHING" });
      return;
    }

    const [created] = await db
      .insert(schema.watches)
      .values({ ...parsed.data, deviceKey })
      .returning();
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

const patchSchema = z.object({
  alertOnStatusChange: z.boolean().optional(),
  alertOnGuardianNote: z.boolean().optional(),
});

router.patch("/api/watches/:id", async (req, res, next) => {
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
      .update(schema.watches)
      .set(parsed.data)
      .where(
        and(
          eq(schema.watches.id, req.params.id),
          eq(schema.watches.deviceKey, deviceKey),
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

router.delete("/api/watches/:id", async (req, res, next) => {
  try {
    const deviceKey = getDeviceKey(req);
    if (!deviceKey) {
      res.status(400).json({ error: "Missing X-Device-Key", code: "BAD_DEVICE_KEY" });
      return;
    }
    const result = await db
      .delete(schema.watches)
      .where(
        and(
          eq(schema.watches.id, req.params.id),
          eq(schema.watches.deviceKey, deviceKey),
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
