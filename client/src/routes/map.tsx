import { Suspense, lazy, useCallback, useEffect, useState } from "react";
import { useLocation as useWouterLocation } from "wouter";
import { useGeolocation } from "@/hooks/use-geolocation";
import { useLocations } from "@/hooks/use-locations";
import { useMode } from "@/hooks/use-mode";
import { OnboardingOverlay } from "@/components/shared/OnboardingOverlay";
import { DetailSheet } from "@/components/sheets/DetailSheet";

const InteractiveMap = lazy(() =>
  import("@/components/map/InteractiveMap").then((m) => ({ default: m.InteractiveMap })),
);

interface MapRouteProps {
  openSheet?: "detail" | "report" | "my-places";
  sheetId?: string;
  forceMode?: "now" | "plan";
}

export default function MapRoute({ openSheet, sheetId, forceMode }: MapRouteProps) {
  const [, navigate] = useWouterLocation();
  const geo = useGeolocation();
  const { mode, setMode } = useMode();
  const [selectedId, setSelectedId] = useState<string | null>(sheetId ?? null);

  // Sync URL → state when navigating in (e.g. /m/:id deep-link, browser back).
  useEffect(() => {
    if (openSheet === "detail" && sheetId) {
      setSelectedId(sheetId);
    } else if (!openSheet) {
      setSelectedId(null);
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
    navigate("/");
  }, [navigate]);

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

      {openSheet === "report" || openSheet === "my-places" ? (
        <SheetPlaceholder kind={openSheet} onClose={handleClose} />
      ) : null}

      {selectedId ? (
        <DetailSheet
          locationId={selectedId}
          geo={geo.isFallback ? undefined : geo.position}
          onClose={handleClose}
        />
      ) : null}

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
 * Phase 1 placeholder for the report sheet (Phase 2) and the My Places sheet
 * (Phase 4). Renders a simple notice so deep-links don't 404.
 */
function SheetPlaceholder({
  kind,
  onClose,
}: {
  kind: "report" | "my-places";
  onClose: () => void;
}) {
  const label = kind === "report" ? "Report a visit" : "My Places";
  const phase = kind === "report" ? "Phase 2" : "Phase 4";
  return (
    <aside
      role="dialog"
      aria-modal="false"
      className="fixed inset-x-0 bottom-0 z-30 rounded-t-2xl border-t bg-white p-5 shadow-2xl"
    >
      <h2 className="text-lg font-semibold">{label}</h2>
      <p className="mt-2 text-sm text-neutral-600">Lands in {phase}.</p>
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
