import bcrypt from "bcrypt";
import crypto from "node:crypto";
import { and, eq, gte, isNull, sql } from "drizzle-orm";
import type { NextFunction, Request, Response } from "express";
import { db, schema } from "./db.js";
import { logger } from "./logger.js";
import type { Guardian } from "../../shared/schema.js";

// =============================================================================
// Token shape: 32 random bytes base64url-encoded. Shown once at issuance,
// stored as bcrypt hash. The token IS the password — there is no username.
// =============================================================================

const BCRYPT_COST = 12;
const SESSION_COOKIE = "nl_guardian_session";
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
export const SESSION_COOKIE_NAME = SESSION_COOKIE;

export function generatePlainToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export async function hashToken(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

// =============================================================================
// Login rate-limit (per-IP, in-memory) — 5 attempts / 15 min (spec.md §13.1
// supplemented by plan.md "Guardian admin auth"). Acceptable for a single-
// instance deployment; revisit if we ever scale horizontally.
// =============================================================================

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 5;
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

function ipKey(req: Request): string {
  // Express's req.ip respects `trust proxy` which we set in server/index.ts.
  return req.ip ?? "unknown";
}

export function checkLoginRateLimit(req: Request): {
  allowed: boolean;
  retryAfterSeconds?: number;
} {
  const key = ipKey(req);
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry || entry.resetAt <= now) {
    loginAttempts.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return { allowed: true };
  }
  if (entry.count >= LOGIN_MAX_ATTEMPTS) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((entry.resetAt - now) / 1000),
    };
  }
  entry.count += 1;
  return { allowed: true };
}

export function clearLoginRateLimit(req: Request): void {
  loginAttempts.delete(ipKey(req));
}

// =============================================================================
// Token verification — bcrypt-compare against every active hash for the
// matching guardian set. With a handful of guardians this is O(n) and fine
// (constitution XII: no premature abstraction). Prefix-indexing if N grows.
// =============================================================================

export async function verifyTokenAndGetGuardian(plain: string): Promise<Guardian | null> {
  const candidateRows = await db
    .select({
      tokenId: schema.guardianTokens.id,
      tokenHash: schema.guardianTokens.tokenHash,
      guardian: schema.guardians,
    })
    .from(schema.guardianTokens)
    .innerJoin(
      schema.guardians,
      and(
        eq(schema.guardianTokens.guardianId, schema.guardians.id),
        eq(schema.guardians.isActive, true),
      ),
    )
    .where(
      and(
        isNull(schema.guardianTokens.revokedAt),
        // Allow nulls (no expiry) OR not-yet-expired tokens.
        sql`(${schema.guardianTokens.expiresAt} IS NULL OR ${schema.guardianTokens.expiresAt} > NOW())`,
      ),
    );

  for (const row of candidateRows) {
    let ok = false;
    try {
      ok = await bcrypt.compare(plain, row.tokenHash);
    } catch (err) {
      logger.warn({ err }, "bcrypt compare failed");
      continue;
    }
    if (ok) {
      // Bump last-used.
      await db
        .update(schema.guardianTokens)
        .set({ lastUsedAt: new Date() })
        .where(eq(schema.guardianTokens.id, row.tokenId));
      return row.guardian;
    }
  }
  return null;
}

// =============================================================================
// Sessions
// =============================================================================

export async function createSession(guardianId: string): Promise<string> {
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const [created] = await db
    .insert(schema.guardianSessions)
    .values({ guardianId, expiresAt })
    .returning();
  if (!created) throw new Error("session insert returned no row");
  return created.id;
}

export async function destroySession(sessionId: string): Promise<void> {
  await db.delete(schema.guardianSessions).where(eq(schema.guardianSessions.id, sessionId));
}

export async function getSessionGuardian(sessionId: string): Promise<Guardian | null> {
  const rows = await db
    .select({ guardian: schema.guardians })
    .from(schema.guardianSessions)
    .innerJoin(
      schema.guardians,
      and(
        eq(schema.guardianSessions.guardianId, schema.guardians.id),
        eq(schema.guardians.isActive, true),
      ),
    )
    .where(
      and(
        eq(schema.guardianSessions.id, sessionId),
        gte(schema.guardianSessions.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return rows[0]?.guardian ?? null;
}

// =============================================================================
// Cookie helpers
// =============================================================================

export function setSessionCookie(res: Response, sessionId: string): void {
  const isProd = process.env.NODE_ENV === "production";
  const parts = [
    `${SESSION_COOKIE}=${sessionId}`,
    "Path=/",
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
    "HttpOnly",
    "SameSite=Strict",
  ];
  if (isProd) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

export function clearSessionCookie(res: Response): void {
  const isProd = process.env.NODE_ENV === "production";
  const parts = [
    `${SESSION_COOKIE}=`,
    "Path=/",
    "Max-Age=0",
    "HttpOnly",
    "SameSite=Strict",
  ];
  if (isProd) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

function readCookie(req: Request, name: string): string | null {
  const raw = req.headers.cookie;
  if (!raw) return null;
  for (const piece of raw.split(/;\s*/)) {
    const eq = piece.indexOf("=");
    if (eq < 0) continue;
    if (piece.slice(0, eq) === name) return piece.slice(eq + 1);
  }
  return null;
}

// =============================================================================
// Middleware
// =============================================================================

declare module "express-serve-static-core" {
  interface Request {
    guardian?: Guardian;
    guardianSessionId?: string;
  }
}

export async function requireGuardian(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const sid = readCookie(req, SESSION_COOKIE);
  if (!sid) {
    res.status(401).json({ error: "Not signed in", code: "UNAUTHORIZED" });
    return;
  }
  const g = await getSessionGuardian(sid);
  if (!g) {
    clearSessionCookie(res);
    res.status(401).json({ error: "Session invalid or expired", code: "UNAUTHORIZED" });
    return;
  }
  req.guardian = g;
  req.guardianSessionId = sid;
  next();
}

export function requireSuperAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.guardian) {
    res.status(401).json({ error: "Not signed in", code: "UNAUTHORIZED" });
    return;
  }
  if (!req.guardian.isAdmin) {
    res.status(403).json({ error: "Admin only", code: "FORBIDDEN" });
    return;
  }
  next();
}
