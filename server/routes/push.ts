import { Router, type Request } from "express";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "../lib/db.js";
import { logger } from "../lib/logger.js";

const router: Router = Router();

function getDeviceKey(req: Request): string | null {
  const v = req.header("x-device-key");
  if (!v || typeof v !== "string" || v.length < 16) return null;
  return v;
}

// -----------------------------------------------------------------------------
// GET /api/push/vapid-public-key
// Cached aggressively client-side. Rotated by re-running generate-vapid.
// -----------------------------------------------------------------------------

router.get("/api/push/vapid-public-key", (_req, res) => {
  const publicKey = process.env.VAPID_PUBLIC_KEY ?? null;
  if (!publicKey) {
    res.status(503).json({
      error: "Push not configured on this server",
      code: "PUSH_DISABLED",
    });
    return;
  }
  res.json({ publicKey });
});

// -----------------------------------------------------------------------------
// POST /api/push/subscribe
// -----------------------------------------------------------------------------

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

router.post("/api/push/subscribe", async (req, res, next) => {
  try {
    const deviceKey = getDeviceKey(req);
    if (!deviceKey) {
      res.status(400).json({ error: "Missing X-Device-Key", code: "BAD_DEVICE_KEY" });
      return;
    }
    const parsed = subscribeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "Invalid subscription",
        code: "VALIDATION_FAILED",
        fields: parsed.error.flatten().fieldErrors,
      });
      return;
    }
    const { endpoint, keys } = parsed.data;

    // Endpoint is unique-keyed; duplicate subscribes are no-ops returning 200.
    const [existing] = await db
      .select()
      .from(schema.pushSubscriptions)
      .where(eq(schema.pushSubscriptions.endpoint, endpoint))
      .limit(1);
    if (existing) {
      res.status(200).json({ ok: true, alreadySubscribed: true });
      return;
    }

    await db.insert(schema.pushSubscriptions).values({
      deviceKey,
      endpoint,
      p256dhKey: keys.p256dh,
      authKey: keys.auth,
    });
    res.status(201).json({ ok: true });
  } catch (err) {
    logger.error({ err }, "POST /api/push/subscribe failed");
    next(err);
  }
});

// -----------------------------------------------------------------------------
// DELETE /api/push/subscribe
// -----------------------------------------------------------------------------

const unsubscribeSchema = z.object({ endpoint: z.string().url() });

router.delete("/api/push/subscribe", async (req, res, next) => {
  try {
    const deviceKey = getDeviceKey(req);
    if (!deviceKey) {
      res.status(400).json({ error: "Missing X-Device-Key", code: "BAD_DEVICE_KEY" });
      return;
    }
    const parsed = unsubscribeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "Invalid body",
        code: "VALIDATION_FAILED",
        fields: parsed.error.flatten().fieldErrors,
      });
      return;
    }
    await db
      .delete(schema.pushSubscriptions)
      .where(
        and(
          eq(schema.pushSubscriptions.deviceKey, deviceKey),
          eq(schema.pushSubscriptions.endpoint, parsed.data.endpoint),
        ),
      );
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
