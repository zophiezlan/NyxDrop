import { Router } from "express";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "../lib/db.js";
import { logger } from "../lib/logger.js";
import { sendPushToWatchers } from "../lib/push.js";
import {
  checkLoginRateLimit,
  clearLoginRateLimit,
  clearSessionCookie,
  createSession,
  destroySession,
  generatePlainToken,
  hashToken,
  requireGuardian,
  requireSuperAdmin,
  setSessionCookie,
  verifyTokenAndGetGuardian,
} from "../lib/auth.js";
import type { AuditAction } from "../../shared/schema.js";

const router: Router = Router();

// -----------------------------------------------------------------------------
// Login / logout / me
// -----------------------------------------------------------------------------

const loginSchema = z.object({ token: z.string().min(8).max(256) });

router.post("/api/guardian/login", async (req, res, next) => {
  try {
    const limit = checkLoginRateLimit(req);
    if (!limit.allowed) {
      res.setHeader("Retry-After", String(limit.retryAfterSeconds ?? 60));
      res.status(429).json({
        error: "Too many login attempts. Try again later.",
        code: "RATE_LIMITED",
      });
      return;
    }
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request", code: "VALIDATION_FAILED" });
      return;
    }
    const guardian = await verifyTokenAndGetGuardian(parsed.data.token);
    if (!guardian) {
      // Bcrypt is intentionally slow; this is the rate-limit gate.
      res.status(401).json({ error: "Invalid token", code: "INVALID_TOKEN" });
      return;
    }
    clearLoginRateLimit(req);
    const sid = await createSession(guardian.id);
    setSessionCookie(res, sid);
    res.json({
      guardian: publicGuardian(guardian),
    });
  } catch (err) {
    logger.error({ err }, "POST /api/guardian/login failed");
    next(err);
  }
});

router.post("/api/guardian/logout", requireGuardian, async (req, res, next) => {
  try {
    if (req.guardianSessionId) await destroySession(req.guardianSessionId);
    clearSessionCookie(res);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

router.get("/api/guardian/me", requireGuardian, (req, res) => {
  if (!req.guardian) {
    res.status(401).json({ error: "Not signed in", code: "UNAUTHORIZED" });
    return;
  }
  res.json({ guardian: publicGuardian(req.guardian) });
});

function publicGuardian(g: { id: string; firstName: string; organisation: string; affiliatedLocationIds: string[]; isAdmin: boolean }) {
  return {
    id: g.id,
    firstName: g.firstName,
    organisation: g.organisation,
    affiliatedLocationIds: g.affiliatedLocationIds,
    isAdmin: g.isAdmin,
  };
}

// -----------------------------------------------------------------------------
// Notes — guardian's own
// -----------------------------------------------------------------------------

const postNoteSchema = z.object({
  locationId: z.string().min(1),
  noteText: z.string().min(1).max(500),
});

router.post("/api/guardian/notes", requireGuardian, async (req, res, next) => {
  try {
    const parsed = postNoteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "Invalid note",
        code: "VALIDATION_FAILED",
        fields: parsed.error.flatten().fieldErrors,
      });
      return;
    }
    const guardian = req.guardian!;
    const isAffiliated =
      guardian.isAdmin ||
      guardian.affiliatedLocationIds.includes(parsed.data.locationId);
    if (!isAffiliated) {
      res.status(403).json({
        error: "You are not affiliated with this location.",
        code: "NOT_AFFILIATED",
      });
      return;
    }

    const [created] = await db
      .insert(schema.guardianNotes)
      .values({
        locationId: parsed.data.locationId,
        guardianId: guardian.id,
        noteText: parsed.data.noteText,
      })
      .returning();
    if (!created) throw new Error("note insert returned no row");

    // Bump the daily-metrics counter so /about's "notes posted" climbs.
    const today = new Date();
    const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    try {
      await db
        .insert(schema.dailyMetrics)
        .values({ date: ymd, notesPosted: 1 })
        .onConflictDoUpdate({
          target: schema.dailyMetrics.date,
          set: {
            notesPosted: sql`${schema.dailyMetrics.notesPosted} + 1`,
          },
        });
    } catch {
      // Soft-fail: missing metrics shouldn't block the note insert.
    }

    // Notify watchers of this location. Fire-and-forget so we don't block
    // the response on push delivery.
    void notifyWatchersOfNote(parsed.data.locationId, parsed.data.noteText, guardian.firstName).catch(
      (err: unknown) =>
        logger.warn({ err, locationId: parsed.data.locationId }, "guardian note push failed"),
    );

    res.status(201).json(created);
  } catch (err) {
    logger.error({ err }, "POST /api/guardian/notes failed");
    next(err);
  }
});

async function notifyWatchersOfNote(
  locationId: string,
  noteText: string,
  guardianFirstName: string,
): Promise<void> {
  // Reuse sendPushToWatchers helper; pin-flip semantics don't apply but the
  // payload + 6h suppression do. Treat as an "improvement" so the verb is
  // status-update-ish. (Phase 4 plumbing is general enough to handle this.)
  const [loc] = await db
    .select({ name: schema.locations.name })
    .from(schema.locations)
    .where(eq(schema.locations.id, locationId))
    .limit(1);
  await sendPushToWatchers(
    locationId,
    "improvement",
    "amber",
    "amber",
    `${guardianFirstName} posted a note: ${noteText.slice(0, 60)}${noteText.length > 60 ? "…" : ""}`,
    loc?.name ?? "this place",
  );
}

const patchNoteSchema = z.object({
  noteText: z.string().min(1).max(500),
});

router.patch("/api/guardian/notes/:id", requireGuardian, async (req, res, next) => {
  try {
    const parsed = patchNoteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "Invalid note",
        code: "VALIDATION_FAILED",
        fields: parsed.error.flatten().fieldErrors,
      });
      return;
    }
    const [existing] = await db
      .select()
      .from(schema.guardianNotes)
      .where(eq(schema.guardianNotes.id, String(req.params.id)))
      .limit(1);
    if (!existing) {
      res.status(404).json({ error: "Not found", code: "NOT_FOUND" });
      return;
    }
    if (existing.guardianId !== req.guardian!.id && !req.guardian!.isAdmin) {
      res.status(403).json({ error: "Not your note", code: "FORBIDDEN" });
      return;
    }
    const [updated] = await db
      .update(schema.guardianNotes)
      .set({ noteText: parsed.data.noteText, updatedAt: new Date() })
      .where(eq(schema.guardianNotes.id, String(req.params.id)))
      .returning();
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.delete("/api/guardian/notes/:id", requireGuardian, async (req, res, next) => {
  try {
    const [existing] = await db
      .select()
      .from(schema.guardianNotes)
      .where(eq(schema.guardianNotes.id, String(req.params.id)))
      .limit(1);
    if (!existing) {
      res.status(404).json({ error: "Not found", code: "NOT_FOUND" });
      return;
    }
    if (existing.guardianId !== req.guardian!.id && !req.guardian!.isAdmin) {
      res.status(403).json({ error: "Not your note", code: "FORBIDDEN" });
      return;
    }
    await db
      .update(schema.guardianNotes)
      .set({ archivedAt: new Date() })
      .where(eq(schema.guardianNotes.id, String(req.params.id)));
    await writeAudit(req.guardian!.id, "ARCHIVE_NOTE", String(req.params.id), {});
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

router.get("/api/guardian/notes/mine", requireGuardian, async (req, res, next) => {
  try {
    const rows = await db
      .select({
        id: schema.guardianNotes.id,
        locationId: schema.guardianNotes.locationId,
        noteText: schema.guardianNotes.noteText,
        createdAt: schema.guardianNotes.createdAt,
        updatedAt: schema.guardianNotes.updatedAt,
        archivedAt: schema.guardianNotes.archivedAt,
        location: {
          id: schema.locations.id,
          name: schema.locations.name,
          address: schema.locations.address,
        },
      })
      .from(schema.guardianNotes)
      .innerJoin(
        schema.locations,
        eq(schema.guardianNotes.locationId, schema.locations.id),
      )
      .where(eq(schema.guardianNotes.guardianId, req.guardian!.id))
      .orderBy(desc(schema.guardianNotes.createdAt));
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// -----------------------------------------------------------------------------
// Super-admin: issue token
// -----------------------------------------------------------------------------

const issueTokenSchema = z.object({
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  email: z.string().email().max(200),
  organisation: z.string().min(1).max(200),
  affiliatedLocationIds: z.array(z.string().min(1)).max(50),
  isAdmin: z.boolean().optional().default(false),
  expiresAt: z.string().datetime().optional().nullable(),
});

router.post(
  "/api/guardian/admin/issue-token",
  requireGuardian,
  requireSuperAdmin,
  async (req, res, next) => {
    try {
      const parsed = issueTokenSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: "Invalid issue request",
          code: "VALIDATION_FAILED",
          fields: parsed.error.flatten().fieldErrors,
        });
        return;
      }
      const data = parsed.data;
      // Upsert the guardian by email so re-issuing for a returning partner
      // doesn't create a duplicate row.
      const [existing] = await db
        .select()
        .from(schema.guardians)
        .where(eq(schema.guardians.email, data.email))
        .limit(1);
      const guardianId = existing
        ? existing.id
        : await (async () => {
            const [created] = await db
              .insert(schema.guardians)
              .values({
                firstName: data.firstName,
                lastName: data.lastName,
                email: data.email,
                organisation: data.organisation,
                affiliatedLocationIds: data.affiliatedLocationIds,
                isAdmin: data.isAdmin,
              })
              .returning();
            if (!created) throw new Error("guardian insert returned no row");
            return created.id;
          })();
      if (existing) {
        await db
          .update(schema.guardians)
          .set({
            firstName: data.firstName,
            lastName: data.lastName,
            organisation: data.organisation,
            affiliatedLocationIds: data.affiliatedLocationIds,
            isAdmin: data.isAdmin,
            isActive: true,
          })
          .where(eq(schema.guardians.id, existing.id));
      }

      const token = generatePlainToken();
      const tokenHash = await hashToken(token);
      const expiresAt = data.expiresAt ? new Date(data.expiresAt) : null;
      const [tk] = await db
        .insert(schema.guardianTokens)
        .values({ guardianId, tokenHash, expiresAt })
        .returning();
      if (!tk) throw new Error("token insert returned no row");

      await writeAudit(req.guardian!.id, "ISSUE_TOKEN", tk.id, {
        forGuardianId: guardianId,
        email: data.email,
      });

      const host = `${req.protocol}://${req.get("host")}`;
      res.status(201).json({
        guardianId,
        token,
        loginUrl: `${host}/guardian?t=${encodeURIComponent(token)}`,
      });
    } catch (err) {
      logger.error({ err }, "POST /api/guardian/admin/issue-token failed");
      next(err);
    }
  },
);

router.post(
  "/api/guardian/admin/revoke-token/:tokenId",
  requireGuardian,
  requireSuperAdmin,
  async (req, res, next) => {
    try {
      const [updated] = await db
        .update(schema.guardianTokens)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(schema.guardianTokens.id, String(req.params.tokenId)),
            isNull(schema.guardianTokens.revokedAt),
          ),
        )
        .returning();
      if (!updated) {
        res.status(404).json({ error: "Not found", code: "NOT_FOUND" });
        return;
      }
      await writeAudit(req.guardian!.id, "REVOKE_TOKEN", String(req.params.tokenId), {});
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  "/api/guardian/admin/audit-log",
  requireGuardian,
  requireSuperAdmin,
  async (_req, res, next) => {
    try {
      const rows = await db
        .select()
        .from(schema.auditLog)
        .orderBy(desc(schema.auditLog.at))
        .limit(100);
      res.json(rows);
    } catch (err) {
      next(err);
    }
  },
);

// -----------------------------------------------------------------------------
// Audit helper
// -----------------------------------------------------------------------------

async function writeAudit(
  actorGuardianId: string,
  action: AuditAction,
  targetId: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  try {
    await db.insert(schema.auditLog).values({
      actorGuardianId,
      action,
      targetId,
      metadata,
    });
  } catch (err) {
    // Soft-fail — audit failure shouldn't break the user-facing op.
    logger.warn({ err, action, targetId }, "audit insert failed");
  }
}

// -----------------------------------------------------------------------------
// Public read of guardian notes for a location (used by detail sheet)
// -----------------------------------------------------------------------------

router.get("/api/locations/:id/guardian-notes", async (req, res, next) => {
  try {
    const rows = await db
      .select({
        id: schema.guardianNotes.id,
        noteText: schema.guardianNotes.noteText,
        updatedAt: schema.guardianNotes.updatedAt,
        guardianFirstName: schema.guardians.firstName,
        guardianOrganisation: schema.guardians.organisation,
      })
      .from(schema.guardianNotes)
      .innerJoin(
        schema.guardians,
        eq(schema.guardianNotes.guardianId, schema.guardians.id),
      )
      .where(
        and(
          eq(schema.guardianNotes.locationId, String(req.params.id)),
          isNull(schema.guardianNotes.archivedAt),
        ),
      )
      .orderBy(desc(schema.guardianNotes.updatedAt));
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

export default router;
