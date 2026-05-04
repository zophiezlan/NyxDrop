import "dotenv/config";

import { eq } from "drizzle-orm";
import { db, schema } from "../lib/db.js";
import { generatePlainToken, hashToken } from "../lib/auth.js";
import { logger } from "../lib/logger.js";

// Bootstrap super-admin guardian. Idempotent: re-running issues a fresh
// token for the same admin email instead of duplicating the row.
//
//   ADMIN_BOOTSTRAP_TOKEN=… npx tsx server/scripts/seed-admin.ts
//
// (Or set ADMIN_BOOTSTRAP_TOKEN in .env first.)
//
// On success: prints the plain token to stdout. The token is shown ONCE —
// re-running the script issues a new one and revokes prior tokens for the
// admin guardian.

const ADMIN_EMAIL = process.env.ADMIN_BOOTSTRAP_EMAIL ?? "admin@example.org";
const ADMIN_FIRST_NAME = process.env.ADMIN_BOOTSTRAP_FIRST_NAME ?? "Admin";
const ADMIN_LAST_NAME = process.env.ADMIN_BOOTSTRAP_LAST_NAME ?? "Bootstrap";
const ADMIN_ORG = process.env.ADMIN_BOOTSTRAP_ORG ?? "NaloxoneLocate Admin";

async function main(): Promise<void> {
  if (!process.env.ADMIN_BOOTSTRAP_TOKEN) {
    logger.error(
      "ADMIN_BOOTSTRAP_TOKEN env var is not set. Set it (or rotate it) before running.",
    );
    process.exit(1);
  }

  const [existing] = await db
    .select()
    .from(schema.guardians)
    .where(eq(schema.guardians.email, ADMIN_EMAIL))
    .limit(1);

  let guardianId: string;
  if (existing) {
    await db
      .update(schema.guardians)
      .set({
        firstName: ADMIN_FIRST_NAME,
        lastName: ADMIN_LAST_NAME,
        organisation: ADMIN_ORG,
        isAdmin: true,
        isActive: true,
      })
      .where(eq(schema.guardians.id, existing.id));
    guardianId = existing.id;
    logger.info({ guardianId }, "updated existing admin guardian");

    // Revoke prior tokens so the freshly-issued one is the only valid one.
    await db
      .update(schema.guardianTokens)
      .set({ revokedAt: new Date() })
      .where(eq(schema.guardianTokens.guardianId, guardianId));
  } else {
    const [created] = await db
      .insert(schema.guardians)
      .values({
        firstName: ADMIN_FIRST_NAME,
        lastName: ADMIN_LAST_NAME,
        email: ADMIN_EMAIL,
        organisation: ADMIN_ORG,
        affiliatedLocationIds: [],
        isAdmin: true,
        isActive: true,
      })
      .returning();
    if (!created) throw new Error("guardian insert returned no row");
    guardianId = created.id;
    logger.info({ guardianId }, "created admin guardian");
  }

  const plain = generatePlainToken();
  const tokenHash = await hashToken(plain);
  await db.insert(schema.guardianTokens).values({ guardianId, tokenHash });

  process.stdout.write("\nSuper-admin token (shown ONCE):\n");
  process.stdout.write(`  ${plain}\n\n`);
  process.stdout.write("Login with this token at /guardian.\n");
}

main().catch((err: unknown) => {
  logger.error({ err }, "seed-admin failed");
  process.exit(1);
});
