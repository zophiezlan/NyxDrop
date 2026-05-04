import { Suspense, lazy, useCallback, useEffect, useState } from "react";
import { useLocation as useWouterLocation } from "wouter";
import { useGeolocation } from "@/hooks/use-geolocation";
import { useLocations } from "@/hooks/use-locations";
import { useMode } from "@/hooks/use-mode";
import { useOfflineReportDrain } from "@/hooks/use-report";
import { OnboardingOverlay } from "@/components/shared/OnboardingOverlay";
import { BottomActionBar } from "@/components/shared/BottomActionBar";
import { Toast } from "@/components/shared/Toast";
import { DetailSheet } from "@/components/sheets/DetailSheet";
import { ReportSheet } from "@/components/sheets/ReportSheet";

const InteractiveMap = lazy(() =>
  import("@/components/map/InteractiveMap").then((m) => ({ default: m.InteractiveMap })),
);

interface MapRouteProps {
  openSheet?: "detail" | "report" | "my-places";
  sheetId?: string;
  forceMode?: "now" | "plan";
}

interface ReportState {
  locationId?: string;
  preselectedName?: string;
}

interface ToastState {
  message: string;
  tone?: "info" | "warn";
}

export default function MapRoute({ openSheet, sheetId, forceMode }: MapRouteProps) {
  const [, navigate] = useWouterLocation();
  const geo = useGeolocation();
  const { mode, setMode } = useMode();
  const [selectedId, setSelectedId] = useState<string | null>(sheetId ?? null);
  const [reportState, setReportState] = useState<ReportState | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  // Drain offline-queued reports as soon as connectivity returns. Mounted
  // here (route-level) so it survives sheet open/close.
  useOfflineReportDrain();

  // Sync URL → state when navigating in (e.g. /m/:id deep-link, browser back).
  useEffect(() => {
    if (openSheet === "detail" && sheetId) {
      setSelectedId(sheetId);
      setReportState(null);
    } else if (openSheet === "report" && sheetId) {
      setReportState({ locationId: sheetId });
      setSelectedId(null);
    } else if (!openSheet) {
      setSelectedId(null);
      setReportState(null);
    }
  }, [openSheet, sheetId]);

  // Apply forced mode from /emergency deep-link exactly once on mount.
  useEffect(() => {
    if (forceMode && mode !== forceMode) setMode(forceMode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const locationsQuery = useLocations({
    lat: geo.position.lat,
    lon: geo.position.lon,
  });

  const handleSelect = useCallback(
    (id: string) => {
      setSelectedId(id);
      navigate(`/m/${id}`);
    },
    [navigate],
  );

  const handleClose = useCallback(() => {
    setSelectedId(null);
    setReportState(null);
    navigate("/");
  }, [navigate]);

  const openReportForCurrent = useCallback(() => {
    if (!selectedId) return;
    const loc = locationsQuery.data?.find((l) => l.id === selectedId);
    setReportState({
      locationId: selectedId,
      preselectedName: loc?.name,
    });
    setSelectedId(null);
    navigate(`/r/${selectedId}`);
  }, [selectedId, locationsQuery.data, navigate]);

  const openAddPlace = useCallback(() => {
    setReportState({});
    setSelectedId(null);
    navigate("/r/new");
  }, [navigate]);

  const handleSubmitted = useCallback((ack: string) => {
    setToast({ message: ack, tone: "info" });
  }, []);

  const handleQueued = useCallback((reason: "offline" | "network_error") => {
    setToast({
      message:
        reason === "offline"
          ? "Report saved offline. Will sync when you're back online."
          : "Could not reach the server. Saved offline; will sync soon.",
      tone: "warn",
    });
  }, []);

  return (
    <div className={`relative ${mode === "now" ? "bg-red-50" : "bg-neutral-50"}`}>
      <Suspense fallback={<MapPlaceholder />}>
        <InteractiveMap
          centre={geo.position}
          userPosition={geo.isFallback ? undefined : geo.position}
          locations={locationsQuery.data ?? []}
          selectedId={selectedId}
          onSelect={handleSelect}
        />
      </Suspense>

      {locationsQuery.isError ? <ApiBanner /> : null}

      {openSheet === "my-places" ? (
        <SheetPlaceholder kind="my-places" onClose={handleClose} />
      ) : null}

      {selectedId ? (
        <DetailSheet
          locationId={selectedId}
          geo={geo.isFallback ? undefined : geo.position}
          onClose={handleClose}
          onReport={openReportForCurrent}
        />
      ) : null}

      {reportState ? (
        <ReportSheet
          preselectedLocationId={reportState.locationId}
          preselectedName={reportState.preselectedName}
          onClose={handleClose}
          onSubmitted={handleSubmitted}
          onQueued={handleQueued}
        />
      ) : null}

      {toast ? (
        <Toast
          message={toast.message}
          tone={toast.tone}
          onClose={() => setToast(null)}
        />
      ) : null}

      <BottomActionBar
        hidden={!!selectedId || !!reportState || mode === "now"}
        onIWentHere={() => {
          // Without a pre-selected pin, drop the user into the search step.
          openAddPlace();
        }}
        onAddPlace={openAddPlace}
      />

      <OnboardingOverlay />
    </div>
  );
}

function MapPlaceholder() {
  return (
    <div className="flex h-dvh w-dvw items-center justify-center bg-neutral-100 text-sm text-neutral-500">
      Loading the map…
    </div>
  );
}

function ApiBanner() {
  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-40 bg-amber-100 border-b border-amber-200 px-4 py-2 text-center text-xs text-amber-900"
    >
      Could not reach the server. The map may be empty until the connection is back.
    </div>
  );
}

/**
 * Placeholder for sheets not yet implemented (My Places — Phase 4).
 */
function SheetPlaceholder({
  kind,
  onClose,
}: {
  kind: "my-places";
  onClose: () => void;
}) {
  const label = kind === "my-places" ? "My Places" : kind;
  return (
    <aside
      role="dialog"
      aria-modal="false"
      className="fixed inset-x-0 bottom-0 z-30 rounded-t-2xl border-t bg-white p-5 shadow-2xl"
    >
      <h2 className="text-lg font-semibold">{label}</h2>
      <p className="mt-2 text-sm text-neutral-600">Lands in Phase 4.</p>
      <button
        type="button"
        className="mt-4 rounded-lg border px-3 py-1.5 text-xs"
        onClick={onClose}
      >
        Close
      </button>
    </aside>
  );
}
