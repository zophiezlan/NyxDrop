import { Router, type Request } from "express";
import { z } from "zod";
import {
  insertReportSchema,
  type InsertReport,
} from "@shared/schema";
import {
  listReportsForLocation,
  submitReport,
} from "../lib/reports.js";
import { checkReportAllowed } from "../lib/rate-limit.js";
import { logger } from "../lib/logger.js";

const router: Router = Router();

const DEVICE_KEY_HEADER = "x-device-key";

function getDeviceKey(req: Request): string | null {
  const v = req.header(DEVICE_KEY_HEADER);
  if (!v || typeof v !== "string" || v.length < 16) return null;
  return v;
}

// -----------------------------------------------------------------------------
// POST /api/reports
// -----------------------------------------------------------------------------

router.post("/api/reports", async (req, res, next) => {
  try {
    const deviceKey = getDeviceKey(req);
    if (!deviceKey) {
      res.status(400).json({
        error: "Missing or invalid X-Device-Key header",
        code: "BAD_DEVICE_KEY",
      });
      return;
    }

    const parsed = insertReportSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "Invalid report data",
        code: "VALIDATION_FAILED",
        fields: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const result = await submitReport(deviceKey, parsed.data as InsertReport);
    if (!result.ok) {
      res.status(429).json({
        error: "You already reported this place today. Try again tomorrow.",
        code: "RATE_LIMITED",
        nextReportAllowedAt: result.nextReportAllowedAt.toISOString(),
      });
      return;
    }

    res.status(201).json({ ...result.report, ackMessage: result.ackMessage });
  } catch (err) {
    logger.error({ err }, "POST /api/reports failed");
    next(err);
  }
});

// -----------------------------------------------------------------------------
// POST /api/reports/check — pre-flight rate-limit check used by the report sheet
// -----------------------------------------------------------------------------

const checkBodySchema = z.object({ locationId: z.string().min(1) });

router.post("/api/reports/check", async (req, res, next) => {
  try {
    const deviceKey = getDeviceKey(req);
    if (!deviceKey) {
      res.status(400).json({
        error: "Missing or invalid X-Device-Key header",
        code: "BAD_DEVICE_KEY",
      });
      return;
    }
    const parsed = checkBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "Invalid body",
        code: "VALIDATION_FAILED",
        fields: parsed.error.flatten().fieldErrors,
      });
      return;
    }
    const result = await checkReportAllowed(deviceKey, parsed.data.locationId);
    if (result.canReport) {
      res.json({ canReport: true, nextReportAllowedAt: null });
    } else {
      res.json({
        canReport: false,
        nextReportAllowedAt: result.nextReportAllowedAt.toISOString(),
      });
    }
  } catch (err) {
    next(err);
  }
});

// -----------------------------------------------------------------------------
// GET /api/locations/:id/reports
// -----------------------------------------------------------------------------

const listQuerySchema = z.object({
  limit: z
    .union([z.string(), z.number()])
    .transform((v) => (typeof v === "number" ? v : Number.parseInt(v, 10)))
    .pipe(z.number().int().min(1).max(100))
    .optional()
    .default(20),
  windowDays: z
    .union([z.string(), z.number()])
    .transform((v) => (typeof v === "number" ? v : Number.parseInt(v, 10)))
    .pipe(z.number().int().min(1).max(365))
    .optional()
    .default(30),
});

router.get("/api/locations/:id/reports", async (req, res, next) => {
  try {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        error: "Invalid query",
        code: "VALIDATION_FAILED",
        fields: parsed.error.flatten().fieldErrors,
      });
      return;
    }
    const reports = await listReportsForLocation(req.params.id, parsed.data);
    res.json(reports);
  } catch (err) {
    next(err);
  }
});

export default router;
