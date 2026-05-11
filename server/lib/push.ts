import webpush, { type SendResult } from "web-push";
import { and, eq, gte, isNull, or } from "drizzle-orm";
import { db, schema } from "./db.js";
import { logger } from "./logger.js";
import type { PinFlipKind } from "../../shared/consensus.js";
import type { PinStatus } from "../../shared/schema.js";

let initialised = false;

/**
 * Configure web-push with VAPID. Idempotent: safe to call from server
 * bootstrap. Logs a warning if keys are missing rather than throwing — the
 * server is still useful without push, and `sendPushToDevice` returns 0 in
 * that case.
 */
export function initialisePush(): boolean {
  if (initialised) return true;
  const subject = process.env.VAPID_SUBJECT;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!subject || !publicKey || !privateKey) {
    logger.warn("VAPID keys not set — push notifications disabled");
    return false;
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  initialised = true;
  return true;
}

export interface PushPayload {
  /** Notification title shown in the OS tray. */
  title: string;
  /** Body text. ≤ 80 chars per spec.md §9.2. */
  body: string;
  /** Where the user lands when they tap. */
  url: string;
  /** "status_change" | "guardian_note" | "region_new" — used by SW for grouping. */
  kind: "status_change" | "guardian_note" | "region_new";
  /** Optional tag so newer alerts replace older ones for the same location. */
  tag?: string;
}

/**
 * Send a push notification to every active subscription registered against
 * `deviceKey`. Drops 410 Gone subscriptions from the table. Returns the count
 * of deliveries that completed without error.
 */
// Phase 4: guardian -> individual device push (not yet wired to a route)
export async function sendPushToDevice(
  deviceKey: string,
  payload: PushPayload,
): Promise<number> {
  if (!initialisePush()) return 0;
  const subs = await db
    .select()
    .from(schema.pushSubscriptions)
    .where(eq(schema.pushSubscriptions.deviceKey, deviceKey));
  if (subs.length === 0) return 0;

  let delivered = 0;
  const json = JSON.stringify(payload);
  for (const sub of subs) {
    try {
      const result: SendResult = await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dhKey, auth: sub.authKey },
        },
        json,
      );
      if (result.statusCode >= 200 && result.statusCode < 300) {
        delivered++;
        await db
          .update(schema.pushSubscriptions)
          .set({ lastSuccessAt: new Date() })
          .where(eq(schema.pushSubscriptions.id, sub.id));
      }
    } catch (err: unknown) {
      const status =
        typeof err === "object" && err !== null && "statusCode" in err
          ? (err as { statusCode: number }).statusCode
          : null;
      if (status === 404 || status === 410) {
        // Endpoint is gone — prune it.
        await db
          .delete(schema.pushSubscriptions)
          .where(eq(schema.pushSubscriptions.id, sub.id));
        continue;
      }
      await db
        .update(schema.pushSubscriptions)
        .set({ lastFailureAt: new Date() })
        .where(eq(schema.pushSubscriptions.id, sub.id));
      logger.warn({ err, status, endpoint: sub.endpoint }, "push send failed");
    }
  }
  return delivered;
}

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

/**
 * Notify all watchers of a location of a meaningful pin-status flip. Honours
 * the per-(device, location) 6-hour suppression from algorithms.md §9.2 and
 * the per-watcher `alertOnStatusChange` preference.
 *
 * Returns count of notifications enqueued (delivered to push service —
 * actual OS delivery is best-effort).
 */
export async function sendPushToWatchers(
  locationId: string,
  flipKind: PinFlipKind,
  fromStatus: PinStatus,
  toStatus: PinStatus,
  consensusLabel: string,
  locationName: string,
): Promise<number> {
  if (flipKind === "no_meaningful_flip") return 0;

  const now = new Date();
  const sixHoursAgo = new Date(now.getTime() - SIX_HOURS_MS);

  // Watches eligible: this location + alertOnStatusChange + last alert > 6h
  // ago (or never).
  const eligible = await db
    .select()
    .from(schema.watches)
    .where(
      and(
        eq(schema.watches.locationId, locationId),
        eq(schema.watches.alertOnStatusChange, true),
        or(
          isNull(schema.watches.lastAlertAt),
          // gte requires the column on the left and value on the right.
          // We want lastAlertAt < sixHoursAgo, i.e. NOT (lastAlertAt ≥ sixHoursAgo).
          // Easier: filter eligible by JS after the query.
          gte(schema.watches.createdAt, new Date(0)),
        ),
      ),
    );

  const ready = eligible.filter(
    (w) => !w.lastAlertAt || w.lastAlertAt.getTime() < sixHoursAgo.getTime(),
  );

  if (ready.length === 0) return 0;

  const verb = flipKind === "improvement" ? "Status update" : "Heads up";
  const payload: PushPayload = {
    title: `${verb}: ${locationName}`,
    body: consensusLabel,
    url: `/m/${locationId}`,
    kind: "status_change",
    tag: `nl-status-${locationId}`,
  };

  let total = 0;
  for (const watch of ready) {
    total += await sendPushToDevice(watch.deviceKey, payload);
    await db
      .update(schema.watches)
      .set({ lastAlertAt: now })
      .where(eq(schema.watches.id, watch.id));
  }
  logger.info(
    { locationId, flipKind, fromStatus, toStatus, ready: ready.length, delivered: total },
    "watch alerts dispatched",
  );
  return total;
}
