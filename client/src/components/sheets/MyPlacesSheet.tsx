import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { forgetDevice } from "@/lib/device-key";
import { formatDistanceKm, relativeTime } from "@/lib/format";
import { useGeolocation } from "@/hooks/use-geolocation";
import {
  useSavedPlaces,
  useUnsaveLocation,
  type SavedPlaceRow,
} from "@/hooks/use-saved-places";
import {
  useUnwatchLocation,
  useWatches,
  type WatchRow,
} from "@/hooks/use-watches";
import { haversineDistance } from "@shared/consensus";
import { useT } from "@/lib/i18n";

type Tab = "saved" | "visited" | "watching";

interface MyPlacesSheetProps {
  onClose: () => void;
  onOpenLocation: (locationId: string) => void;
}

interface VisitRow {
  reportId: string;
  locationId: string;
  reportType: "success" | "success_but" | "out_of_stock" | "denied";
  barriers: string[];
  submittedAt: string;
  location: {
    id: string;
    name: string;
    address: string;
    latitude: string;
    longitude: string;
    type: string;
  };
}

const REPORT_VERDICT_KEYS: Record<VisitRow["reportType"], string> = {
  success: "report_verdict.success",
  success_but: "report_verdict.success_but",
  out_of_stock: "report_verdict.out_of_stock",
  denied: "report_verdict.denied",
};

export function MyPlacesSheet({ onClose, onOpenLocation }: MyPlacesSheetProps) {
  const t = useT();
  const sheetRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<Tab>("saved");
  const geo = useGeolocation();

  const saved = useSavedPlaces();
  const watches = useWatches();
  const visits = useVisits();

  useEffect(() => {
    sheetRef.current?.focus();
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const userPos = geo.isFallback ? undefined : geo.position;

  return (
    <aside
      ref={sheetRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="false"
      aria-labelledby="my-places-title"
      className="fixed inset-x-0 bottom-0 z-30 max-h-[90dvh] overflow-y-auto rounded-t-2xl border-t border-nl-border bg-surface shadow-2xl outline-none animate-sheet-up"
    >
      <div className="flex justify-center pt-2">
        <div className="h-1 w-10 rounded-full bg-fg-faint/40" aria-hidden="true" />
      </div>

      <div className="px-5 pt-3 pb-8 text-fg space-y-5">
        <header className="flex items-start justify-between gap-3">
          <h2 id="my-places-title" className="text-lg font-semibold">
            {t("my_places.title")}
          </h2>
          <button
            type="button"
            className="rounded-md text-sm text-fg-muted hover:text-fg focus:outline-none focus:underline"
            onClick={onClose}
            aria-label={t("actions.close")}
          >
            {t("actions.close")}
          </button>
        </header>

        <div role="tablist" className="flex gap-1 text-sm">
          {(
            [
              ["saved", `${t("my_places.tab_saved")}${saved.data ? ` (${saved.data.length})` : ""}`],
              [
                "visited",
                `${t("my_places.tab_visited")}${visits.data ? ` (${visits.data.length})` : ""}`,
              ],
              [
                "watching",
                `${t("my_places.tab_watching")}${watches.data ? ` (${watches.data.length})` : ""}`,
              ],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              type="button"
              onClick={() => setTab(id)}
              className={`flex-1 rounded-xl px-3 py-2 active:scale-[0.97] transition-transform ${
                tab === id
                  ? "bg-nl-primary text-nl-on-primary"
                  : "bg-surface-inset text-fg-secondary hover:bg-nl-hover"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "saved" ? (
          <SavedTab
            rows={saved.data ?? []}
            isLoading={saved.isLoading}
            userPos={userPos}
            onOpen={onOpenLocation}
          />
        ) : null}
        {tab === "visited" ? (
          <VisitedTab
            rows={visits.data ?? []}
            isLoading={visits.isLoading}
            userPos={userPos}
            onOpen={onOpenLocation}
          />
        ) : null}
        {tab === "watching" ? (
          <WatchingTab
            rows={watches.data ?? []}
            isLoading={watches.isLoading}
            userPos={userPos}
            onOpen={onOpenLocation}
          />
        ) : null}

        <ForgetDeviceButton onClose={onClose} />
      </div>
    </aside>
  );
}

// -----------------------------------------------------------------------------
// Saved
// -----------------------------------------------------------------------------

function SavedTab({
  rows,
  isLoading,
  userPos,
  onOpen,
}: {
  rows: SavedPlaceRow[];
  isLoading: boolean;
  userPos?: { lat: number; lon: number };
  onOpen: (id: string) => void;
}) {
  const t = useT();
  const unsave = useUnsaveLocation();
  if (isLoading) return <p className="text-sm text-fg-muted">{t("my_places.loading")}</p>;
  if (rows.length === 0) {
    return (
      <p className="text-sm text-fg-muted">
        {t("my_places.empty_saved")}
      </p>
    );
  }
  return (
    <ul className="divide-y divide-nl-divider">
      {rows.map((row) => (
        <li key={row.id} className="py-2">
          <RowButton
            name={row.location.name}
            address={row.location.address}
            metaLeft={row.personalLabel ?? undefined}
            distance={
              userPos &&
              haversineDistance(userPos, {
                lat: Number(row.location.latitude),
                lon: Number(row.location.longitude),
              })
            }
            onOpen={() => onOpen(row.location.id)}
          />
          <div className="ms-1 mt-1 flex items-center justify-between text-xs">
            <span className="text-fg-muted">
              {t("my_places.reports_count").replace("{count}", String(row.location.totalReportsCount))}
            </span>
            <button
              type="button"
              onClick={() => unsave.mutate(row.id)}
              disabled={unsave.isPending}
              aria-busy={unsave.isPending && unsave.variables === row.id}
              className="text-red-700 dark:text-red-400 hover:underline focus:outline-none focus:underline disabled:opacity-60 disabled:cursor-wait"
              aria-label={t("my_places.remove_label").replace("{name}", row.location.name)}
            >
              {unsave.isPending && unsave.variables === row.id
                ? t("my_places.removing")
                : `✕ ${t("my_places.remove")}`}
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

// -----------------------------------------------------------------------------
// Visited
// -----------------------------------------------------------------------------

function VisitedTab({
  rows,
  isLoading,
  userPos,
  onOpen,
}: {
  rows: VisitRow[];
  isLoading: boolean;
  userPos?: { lat: number; lon: number };
  onOpen: (id: string) => void;
}) {
  const t = useT();
  if (isLoading) return <p className="text-sm text-fg-muted">{t("my_places.loading")}</p>;
  if (rows.length === 0) {
    return (
      <p className="text-sm text-fg-muted">
        {t("my_places.empty_visited")}
      </p>
    );
  }
  return (
    <ul className="divide-y divide-nl-divider">
      {rows.map((row) => (
        <li key={row.reportId} className="py-2">
          <RowButton
            name={row.location.name}
            address={row.location.address}
            metaLeft={`Last reported ${relativeTime(row.submittedAt)} — ${t(REPORT_VERDICT_KEYS[row.reportType] as Parameters<typeof t>[0])}`}
            distance={
              userPos &&
              haversineDistance(userPos, {
                lat: Number(row.location.latitude),
                lon: Number(row.location.longitude),
              })
            }
            onOpen={() => onOpen(row.location.id)}
          />
        </li>
      ))}
    </ul>
  );
}

// -----------------------------------------------------------------------------
// Watching
// -----------------------------------------------------------------------------

function WatchingTab({
  rows,
  isLoading,
  userPos,
  onOpen,
}: {
  rows: WatchRow[];
  isLoading: boolean;
  userPos?: { lat: number; lon: number };
  onOpen: (id: string) => void;
}) {
  const t = useT();
  const unwatch = useUnwatchLocation();
  if (isLoading) return <p className="text-sm text-fg-muted">{t("my_places.loading")}</p>;
  if (rows.length === 0) {
    return (
      <p className="text-sm text-fg-muted">
        {t("my_places.empty_watching")}
      </p>
    );
  }
  return (
    <ul className="divide-y divide-nl-divider">
      {rows.map((row) => (
        <li key={row.id} className="py-2">
          <RowButton
            name={row.location.name}
            address={row.location.address}
            metaLeft={
              row.lastAlertAt ? t("my_places.last_alert").replace("{time}", relativeTime(row.lastAlertAt)) : t("my_places.no_alerts")
            }
            distance={
              userPos &&
              haversineDistance(userPos, {
                lat: Number(row.location.latitude),
                lon: Number(row.location.longitude),
              })
            }
            onOpen={() => onOpen(row.location.id)}
          />
          <div className="ms-1 mt-1 flex items-center justify-end text-xs">
            <button
              type="button"
              onClick={() => unwatch.mutate(row.id)}
              disabled={unwatch.isPending}
              aria-busy={unwatch.isPending && unwatch.variables === row.id}
              className="text-red-700 dark:text-red-400 hover:underline focus:outline-none focus:underline disabled:opacity-60 disabled:cursor-wait"
              aria-label={t("my_places.stop_watching_label").replace("{name}", row.location.name)}
            >
              {unwatch.isPending && unwatch.variables === row.id
                ? t("my_places.stopping_watch")
                : `🔕 ${t("my_places.stop_watching")}`}
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

// -----------------------------------------------------------------------------
// Shared row + Forget device
// -----------------------------------------------------------------------------

function RowButton({
  name,
  address,
  metaLeft,
  distance,
  onOpen,
}: {
  name: string;
  address: string;
  metaLeft?: string;
  distance?: number;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="block w-full text-start rounded-md px-1 py-1 hover:bg-nl-hover focus:bg-nl-hover focus:outline-none"
    >
      <div className="font-medium text-sm">{name}</div>
      <div className="text-xs text-fg-muted">
        {address}
        {distance !== undefined ? ` · ${formatDistanceKm(distance)}` : ""}
      </div>
      {metaLeft ? (
        <div className="text-xs text-fg-secondary mt-0.5">{metaLeft}</div>
      ) : null}
    </button>
  );
}

function ForgetDeviceButton({ onClose }: { onClose: () => void }) {
  const t = useT();
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const handleConfirm = async () => {
    setError(null);
    setWorking(true);
    try {
      await api<void>("/api/device/forget", { method: "POST" });
    } catch (err) {
      // If the server is unreachable, we still wipe local state — the
      // contract is "this device is forgotten." The user has been warned.
      if (!(err instanceof ApiError)) {
        // Network failure — proceed with local wipe regardless.
      } else if (err.status >= 500) {
        // 5xx — same logic.
      } else {
        setError(t("my_places.server_error"));
        setWorking(false);
        return;
      }
    }
    forgetDevice();
    qc.clear();
    onClose();
    // Reload so the new device key is generated and all caches reset.
    window.location.assign("/");
  };

  if (!confirming) {
    return (
      <div className="pt-4 border-t border-nl-border">
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="w-full rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950 px-3 py-2.5 text-sm text-red-800 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-700"
        >
          {t("my_places.forget_button")}
        </button>
      </div>
    );
  }

  return (
    <div className="pt-4 border-t border-nl-border space-y-3">
      <p className="text-sm text-fg">
        {t("my_places.forget_warning")}
      </p>
      {error ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            setConfirming(false);
            setError(null);
          }}
          disabled={working}
          className="flex-1 rounded-xl border border-nl-border-input px-3 py-2 text-sm hover:bg-nl-hover"
        >
          {t("my_places.forget_cancel")}
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={working}
          className="flex-1 rounded-xl bg-red-700 px-3 py-2 text-sm text-white hover:bg-red-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-700 disabled:opacity-50 active:scale-[0.97] transition-transform"
        >
          {working ? t("my_places.forgetting") : t("my_places.forget_confirm")}
        </button>
      </div>
    </div>
  );
}

/** Visits hook (Phase 4 only — promote if used elsewhere). */
function useVisits() {
  return useQuery({
    queryKey: ["my-visits"],
    queryFn: ({ signal }) => api<VisitRow[]>("/api/me/visits", { signal }),
    staleTime: 30_000,
  });
}
