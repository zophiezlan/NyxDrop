import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError, api } from "@/lib/api";
import {
  MAX_RETRIES,
  bumpRetry,
  enqueueReport,
  listQueued,
  removeQueued,
} from "@/lib/offline-queue";

export interface ReportSubmitInput {
  locationId: string;
  reportType: "success" | "success_but" | "out_of_stock" | "denied";
  visitDate: string; // YYYY-MM-DD, user-local
  barriers: string[];
  costAmount?: string | null;
  notes?: string | null;
}

export interface ReportApiResponse {
  id: string;
  ackMessage?: string;
}

export type SubmitResult =
  | { kind: "submitted"; ackMessage: string }
  | { kind: "queued"; reason: "offline" | "network_error" }
  | { kind: "rate_limited"; nextReportAllowedAt: string }
  | { kind: "validation_failed"; fields: Record<string, string[]> };

const DEFAULT_ACK = "Thanks. Your report is saved.";

async function postReport(
  input: ReportSubmitInput,
): Promise<ReportApiResponse> {
  return api<ReportApiResponse>("/api/reports", {
    method: "POST",
    body: input,
  });
}

/**
 * Drain pending offline-queue entries by re-POSTing each. Returns the count
 * that synced successfully on this drain. Idempotent — safe to call from
 * multiple triggers (online event, mount, post-submit).
 */
async function drain(): Promise<number> {
  const pending = await listQueued();
  let synced = 0;
  for (const entry of pending) {
    try {
      await postReport(entry.payload as ReportSubmitInput);
      await removeQueued(entry.id);
      synced++;
    } catch (err) {
      if (err instanceof ApiError) {
        // 4xx: payload is bad / rate-limited. Drop it from the queue — the
        // user-facing flow has long since moved on; we'd rather lose a stale
        // duplicate than spam-retry forever.
        if (err.status >= 400 && err.status < 500) {
          await removeQueued(entry.id);
          continue;
        }
      }
      // Network or 5xx: bump retryCount, drop after MAX_RETRIES.
      const updated = await bumpRetry(entry.id);
      if (updated && updated.retryCount >= MAX_RETRIES) {
        await removeQueued(entry.id);
      }
    }
  }
  return synced;
}

/**
 * Drain the offline-report queue on mount and whenever the browser regains
 * connectivity. Mount this hook ONCE at the route level (not inside the
 * ReportSheet) so the listener survives sheet open/close and runs as long as
 * the user has the app open.
 */
export function useOfflineReportDrain(): { pendingCount: number } {
  const qc = useQueryClient();
  const [pendingCount, setPendingCount] = useState(0);
  const draining = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const refreshPending = async () => {
      const list = await listQueued();
      if (!cancelled) setPendingCount(list.length);
    };
    const tryDrain = async () => {
      if (draining.current) return;
      draining.current = true;
      try {
        if (typeof navigator !== "undefined" && !navigator.onLine) return;
        const synced = await drain();
        if (!cancelled && synced > 0) {
          await qc.invalidateQueries({ queryKey: ["locations"] });
          await qc.invalidateQueries({ queryKey: ["location"] });
        }
        if (!cancelled) await refreshPending();
      } finally {
        draining.current = false;
      }
    };
    void tryDrain();
    const onOnline = () => void tryDrain();
    window.addEventListener("online", onOnline);
    return () => {
      cancelled = true;
      window.removeEventListener("online", onOnline);
    };
  }, [qc]);

  return { pendingCount };
}

/**
 * Mutation-style hook for submitting reports. Handles the four outcomes the
 * UI cares about: submitted / queued / rate-limited / validation-failed.
 */
export function useReportSubmission(): {
  submit: (input: ReportSubmitInput) => Promise<SubmitResult>;
  isSubmitting: boolean;
} {
  const qc = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async (input: ReportSubmitInput): Promise<SubmitResult> => {
    setIsSubmitting(true);
    try {
      // If we're definitively offline, skip the network attempt and queue.
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        await enqueueReport(input);
        return { kind: "queued", reason: "offline" };
      }

      try {
        const res = await postReport(input);
        await qc.invalidateQueries({ queryKey: ["location", input.locationId] });
        await qc.invalidateQueries({ queryKey: ["locations"] });
        return { kind: "submitted", ackMessage: res.ackMessage ?? DEFAULT_ACK };
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.status === 429) {
            const body = err as ApiError & { nextReportAllowedAt?: string };
            return {
              kind: "rate_limited",
              nextReportAllowedAt:
                (body as unknown as { nextReportAllowedAt?: string })
                  .nextReportAllowedAt ?? new Date(Date.now() + 86_400_000).toISOString(),
            };
          }
          if (err.status === 400) {
            return { kind: "validation_failed", fields: err.fields ?? {} };
          }
          // 5xx — queue and retry later.
          await enqueueReport(input);
          return { kind: "queued", reason: "network_error" };
        }
        // Non-API error (network, CORS, etc.) — queue.
        await enqueueReport(input);
        return { kind: "queued", reason: "network_error" };
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return { submit, isSubmitting };
}
