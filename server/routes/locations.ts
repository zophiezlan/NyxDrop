import { Router } from "express";
import { z } from "zod";
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

export default router;
