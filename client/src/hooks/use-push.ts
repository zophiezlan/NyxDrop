import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";

export type PushPermissionState =
  | "default"
  | "granted"
  | "denied"
  | "unsupported";

function readPermission(): PushPermissionState {
  if (typeof window === "undefined") return "unsupported";
  if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    return "unsupported";
  }
  return Notification.permission as Exclude<PushPermissionState, "unsupported">;
}

function urlBase64ToBuffer(base64: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const buf = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);
  return buf;
}

/**
 * Manage Web Push subscription state. Constitution and spec §9 require:
 * - A custom pre-prompt before triggering the browser permission ask. The
 *   caller owns that UX; this hook only exposes `requestAndSubscribe()`
 *   which fires the browser prompt + subscription dance after the user has
 *   already accepted the pre-prompt.
 * - Token-free server registration (the device key in the request header
 *   is the only identifier the server stores alongside the subscription).
 */
export function usePushSubscription(): {
  permission: PushPermissionState;
  isSubscribed: boolean;
  requestAndSubscribe: () => Promise<{ ok: true } | { ok: false; reason: string }>;
  unsubscribe: () => Promise<void>;
} {
  const [permission, setPermission] = useState<PushPermissionState>(readPermission);
  const [isSubscribed, setIsSubscribed] = useState(false);

  // Check existing subscription on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (permission !== "granted") return;
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (!cancelled) setIsSubscribed(!!sub);
      } catch {
        if (!cancelled) setIsSubscribed(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [permission]);

  const requestAndSubscribe = useCallback(async (): Promise<
    { ok: true } | { ok: false; reason: string }
  > => {
    if (permission === "unsupported") return { ok: false, reason: "unsupported" };

    let perm = Notification.permission;
    if (perm === "default") {
      perm = await Notification.requestPermission();
      setPermission(perm as PushPermissionState);
    }
    if (perm !== "granted") return { ok: false, reason: "denied" };

    try {
      const { publicKey } = await api<{ publicKey: string }>(
        "/api/push/vapid-public-key",
      );
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      const sub =
        existing ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToBuffer(publicKey),
        }));
      const json = sub.toJSON();
      await api<{ ok: true }>("/api/push/subscribe", {
        method: "POST",
        body: {
          endpoint: json.endpoint,
          keys: json.keys,
        },
      });
      setIsSubscribed(true);
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        reason: err instanceof Error ? err.message : "subscription failed",
      };
    }
  }, [permission]);

  const unsubscribe = useCallback(async (): Promise<void> => {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await api<void>("/api/push/subscribe", {
          method: "DELETE",
          body: { endpoint: sub.endpoint },
        });
        await sub.unsubscribe();
      }
    } finally {
      setIsSubscribed(false);
    }
  }, []);

  return { permission, isSubscribed, requestAndSubscribe, unsubscribe };
}
