import { Router, type Request } from "express";
import { and, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import { insertLocationSchema, insertCorrectionSchema } from "@shared/schema";
import { db, schema } from "../lib/db.js";
import {
  getLocationsWithConsensus,
  getLocationWithConsensus,
  searchLocations,
} from "../lib/locations.js";
import { logger } from "../lib/logger.js";

const router: Router = Router();

// Query-string parsers --------------------------------------------------------

const numLike = z
  .union([z.string(), z.number()])
  .transform((v) => (typeof v === "number" ? v : Number.parseFloat(v)))
  .pipe(z.number().finite());

const csvList = z
  .union([z.string(), z.array(z.string())])
  .transform((v) => (Array.isArray(v) ? v : v.split(",").filter(Boolean)));

const listQuerySchema = z.object({
  lat: numLike.optional(),
  lon: numLike.optional(),
  bbox: z
    .string()
    .regex(/^-?\d+(\.\d+)?(,-?\d+(\.\d+)?){3}$/)
    .optional(),
  type: csvList.optional(),
  verification: csvList.optional(),
  recent: z
    .union([z.literal("true"), z.literal("false"), z.boolean()])
    .transform((v) => v === true || v === "true")
    .optional(),
  openNow: z
    .union([z.literal("true"), z.literal("false"), z.boolean()])
    .transform((v) => v === true || v === "true")
    .optional(),
});

const detailQuerySchema = z.object({
  lat: numLike.optional(),
  lon: numLike.optional(),
});

const searchQuerySchema = z.object({
  q: z.string().min(1).max(200),
  lat: numLike.optional(),
  lon: numLike.optional(),
  limit: numLike
    .pipe(z.number().int().min(1).max(50))
    .optional()
    .default(20),
});

// Routes ----------------------------------------------------------------------

router.get("/api/locations/search", async (req, res, next) => {
  try {
    const parsed = searchQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        error: "Invalid search query",
        code: "VALIDATION_FAILED",
        fields: parsed.error.flatten().fieldErrors,
      });
      return;
    }
    const { q, lat, lon, limit } = parsed.data;
    const geo = lat !== undefined && lon !== undefined ? { lat, lon } : undefined;
    const results = await searchLocations(q, limit, geo);
    res.json(results);
  } catch (err) {
    next(err);
  }
});

router.get("/api/locations/:id", async (req, res, next) => {
  try {
    const id = req.params.id;
    const parsed = detailQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        error: "Invalid query",
        code: "VALIDATION_FAILED",
        fields: parsed.error.flatten().fieldErrors,
      });
      return;
    }
    const { lat, lon } = parsed.data;
    const geo = lat !== undefined && lon !== undefined ? { lat, lon } : undefined;
    const loc = await getLocationWithConsensus(id, geo);
    if (!loc) {
      res.status(404).json({ error: "Location not found", code: "NOT_FOUND" });
      return;
    }
    res.json(loc);
  } catch (err) {
    next(err);
  }
});

router.get("/api/locations", async (req, res, next) => {
  try {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        error: "Invalid filter query",
        code: "VALIDATION_FAILED",
        fields: parsed.error.flatten().fieldErrors,
      });
      return;
    }
    const { lat, lon, bbox, type, verification, recent } = parsed.data;
    const geo = lat !== undefined && lon !== undefined ? { lat, lon } : undefined;

    let bboxParsed: { swLat: number; swLon: number; neLat: number; neLon: number } | undefined;
    if (bbox) {
      const parts = bbox.split(",").map(Number) as [number, number, number, number];
      bboxParsed = { swLat: parts[0], swLon: parts[1], neLat: parts[2], neLon: parts[3] };
    }

    const results = await getLocationsWithConsensus(
      {
        bbox: bboxParsed,
        type,
        verification,
        recentOnly: recent,
      },
      geo,
    );
    res.json(results);
  } catch (err) {
    logger.error({ err }, "GET /api/locations failed");
    next(err);
  }
});

// -----------------------------------------------------------------------------
// POST /api/locations — add-a-place flow
// -----------------------------------------------------------------------------

const DAILY_NEW_LOCATION_LIMIT = 5;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function getDeviceKey(req: Request): string | null {
  const v = req.header("x-device-key");
  if (!v || typeof v !== "string" || v.length < 16) return null;
  return v;
}

router.post("/api/locations", async (req, res, next) => {
  try {
    const deviceKey = getDeviceKey(req);
    if (!deviceKey) {
      res.status(400).json({
        error: "Missing or invalid X-Device-Key header",
        code: "BAD_DEVICE_KEY",
      });
      return;
    }

    const parsed = insertLocationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "Invalid location data",
        code: "VALIDATION_FAILED",
        fields: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    // Rate limit: 5 new locations per device per 24h.
    const cutoff = new Date(Date.now() - ONE_DAY_MS);
    const recent = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(schema.locations)
      .where(
        and(
          eq(schema.locations.addedByDeviceKey, deviceKey),
          gte(schema.locations.addedAt, cutoff),
        ),
      );
    if ((recent[0]?.count ?? 0) >= DAILY_NEW_LOCATION_LIMIT) {
      res.status(429).json({
        error: "You have added the maximum new places for today.",
        code: "RATE_LIMITED",
      });
      return;
    }

    const [created] = await db
      .insert(schema.locations)
      .values({ ...parsed.data, addedByDeviceKey: deviceKey })
      .returning();
    if (!created) throw new Error("location insert returned no row");

    // Bump daily metrics so /about's locationsAdded counter advances.
    const today = new Date();
    const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    await db
      .insert(schema.dailyMetrics)
      .values({ date: ymd, locationsAdded: 1 })
      .onConflictDoUpdate({
        target: schema.dailyMetrics.date,
        set: {
          locationsAdded: sql`${schema.dailyMetrics.locationsAdded} + 1`,
        },
      });

    res.status(201).json(created);
  } catch (err) {
    logger.error({ err }, "POST /api/locations failed");
    next(err);
  }
});

// -----------------------------------------------------------------------------
// POST /api/locations/:id/correction — moderation queue
// -----------------------------------------------------------------------------

router.post("/api/locations/:id/correction", async (req, res, next) => {
  try {
    const deviceKey = getDeviceKey(req);
    if (!deviceKey) {
      res.status(400).json({
        error: "Missing or invalid X-Device-Key header",
        code: "BAD_DEVICE_KEY",
      });
      return;
    }
    const parsed = insertCorrectionSchema.safeParse({
      locationId: req.params.id,
      text: (req.body ?? {}).text,
    });
    if (!parsed.success) {
      res.status(400).json({
        error: "Invalid correction",
        code: "VALIDATION_FAILED",
        fields: parsed.error.flatten().fieldErrors,
      });
      return;
    }
    await db.insert(schema.corrections).values({
      locationId: req.params.id,
      deviceKey,
      text: parsed.data.text,
    });
    res.status(202).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
