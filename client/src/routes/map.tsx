import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import { useLocation as useWouterLocation } from "wouter";
import { useGeolocation } from "@/hooks/use-geolocation";
import { useLocations } from "@/hooks/use-locations";
import { useMode } from "@/hooks/use-mode";
import { useOfflineReportDrain } from "@/hooks/use-report";
import { OnboardingOverlay } from "@/components/shared/OnboardingOverlay";
import { BottomActionBar } from "@/components/shared/BottomActionBar";
import { ModeToggle } from "@/components/shared/ModeToggle";
import { Toast } from "@/components/shared/Toast";
import { DetailSheet } from "@/components/sheets/DetailSheet";
import { ReportSheet } from "@/components/sheets/ReportSheet";
import { MyPlacesSheet } from "@/components/sheets/MyPlacesSheet";
import {
  EMPTY_FILTERS,
  FilterSheet,
  activeFilterCount,
  type Filters,
} from "@/components/sheets/FilterSheet";
import { SettingsSheet } from "@/components/sheets/SettingsSheet";
import { SearchBar } from "@/components/search/SearchBar";
import { NowModeOverlay } from "@/components/now-mode/NowModeOverlay";
import { useAppPreferences } from "@/hooks/use-app-preferences";
import { filterByAbsenceOfBarriers } from "@shared/consensus";
import type { LocationWithConsensus } from "@shared/schema";
import { api, ApiError } from "@/lib/api";
import { forgetDevice } from "@/lib/device-key";
import { useT } from "@/lib/i18n";
import { useQueryClient } from "@tanstack/react-query";

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

type Bbox = { swLat: number; swLon: number; neLat: number; neLon: number };

export default function MapRoute({ openSheet, sheetId, forceMode }: MapRouteProps) {
  const t = useT();
  const [, navigate] = useWouterLocation();
  const geo = useGeolocation();
  const { mode, setMode } = useMode();
  const [selectedId, setSelectedId] = useState<string | null>(sheetId ?? null);
  const [reportState, setReportState] = useState<ReportState | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [settingsSheetOpen, setSettingsSheetOpen] = useState(false);
  const [searchAreaBbox, setSearchAreaBbox] = useState<Bbox | null>(null);
  const { preferences, setPreferences } = useAppPreferences();
  const qc = useQueryClient();

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
    } else if (openSheet === "my-places") {
      // /me opens the MyPlacesSheet on top of the map; close any detail or
      // report sheet that was open so the user actually sees it.
      setSelectedId(null);
      setReportState(null);
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
    bbox: searchAreaBbox ?? undefined,
    type: filters.type.length > 0 ? filters.type : undefined,
    verification: filters.verification.length > 0 ? filters.verification : undefined,
    recent: filters.recent || undefined,
    openNow: filters.openNow || undefined,
  });

  // Ctrl+E (or Cmd+E on Mac) toggles Now mode from anywhere in the app.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "e") {
        e.preventDefault();
        setMode(mode === "now" ? "plan" : "now");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, setMode]);

  // Compose all the client-side filters: barrier-hide (algorithms.md §4),
  // naloxone form, accessibility tags. Server already applied type, verif,
  // recent, openNow query params.
  const visibleLocations: LocationWithConsensus[] = useMemo(() => {
    const all = locationsQuery.data ?? [];
    let next = filterByAbsenceOfBarriers(all, filters.hideBarriers);

    if (filters.naloxoneForm !== "any") {
      next = next.filter((loc) =>
        loc.naloxoneForms.includes(filters.naloxoneForm as "nasal_spray" | "injectable"),
      );
    }
    if (filters.tags.length > 0) {
      next = next.filter((loc) =>
        filters.tags.every((t) => loc.tags.includes(t)),
      );
    }

    // In Now mode hide red/grey pins (spec.md §4.1) — they're not what the
    // user needs in a crisis. The map keeps the same centre and zoom; only
    // the visible pin set changes.
    if (mode === "now") {
      next = next.filter(
        (loc) => loc.pinStatus === "green" || loc.pinStatus === "amber",
      );
    }
    return next;
  }, [mode, locationsQuery.data, filters]);

  const hiddenByBarrierCount = useMemo(() => {
    if (filters.hideBarriers.length === 0) return 0;
    const total = locationsQuery.data?.length ?? 0;
    const after = filterByAbsenceOfBarriers(
      locationsQuery.data ?? [],
      filters.hideBarriers,
    ).length;
    return total - after;
  }, [filters.hideBarriers, locationsQuery.data]);

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

  const handleQueued = useCallback(
    (reason: "offline" | "network_error") => {
      setToast({
        message:
          reason === "offline"
            ? t("report.queued_offline")
            : t("report.queued_network"),
        tone: "warn",
      });
    },
    [t],
  );

  return (
    <div className={`relative ${mode === "now" ? "bg-red-50" : "bg-neutral-50"}`}>
      <Suspense fallback={<MapPlaceholder />}>
        <InteractiveMap
          centre={geo.position}
          userPosition={geo.isFallback ? undefined : geo.position}
          locations={visibleLocations}
          selectedId={selectedId}
          onSelect={handleSelect}
          autoFitMode={mode === "now" ? "nearest-3" : "default"}
          onSearchArea={mode === "plan" ? setSearchAreaBbox : undefined}
        />
      </Suspense>

      {locationsQuery.isError ? <ApiBanner message={t("errors.api_unreachable")} /> : null}

      {openSheet === "my-places" ? (
        <MyPlacesSheet
          onClose={handleClose}
          onOpenLocation={(id) => {
            setSelectedId(id);
            navigate(`/m/${id}`);
          }}
        />
      ) : null}

      {selectedId ? (
        <DetailSheet
          locationId={selectedId}
          geo={geo.isFallback ? undefined : geo.position}
          mode={mode}
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
        hidden={
          !!selectedId ||
          !!reportState ||
          openSheet === "my-places" ||
          filterSheetOpen ||
          mode === "now"
        }
        onIWentHere={() => {
          // Without a pre-selected pin, drop the user into the search step.
          openAddPlace();
        }}
        onAddPlace={openAddPlace}
        onFilters={() => setFilterSheetOpen(true)}
        activeFilterCount={activeFilterCount(filters)}
      />

      <TopRightButtons
        hidden={
          !!selectedId ||
          !!reportState ||
          openSheet === "my-places" ||
          settingsSheetOpen ||
          mode === "now"
        }
        onMyPlaces={() => navigate("/me")}
        onSettings={() => setSettingsSheetOpen(true)}
      />

      <ModeToggle
        mode={mode}
        onChange={setMode}
        hidden={
          mode === "now" ||
          !!reportState ||
          openSheet === "my-places" ||
          settingsSheetOpen
        }
      />

      {!selectedId &&
      !reportState &&
      openSheet !== "my-places" &&
      !settingsSheetOpen &&
      mode !== "now" ? (
        <SearchBar
          geo={geo.isFallback ? undefined : geo.position}
          voiceEnabled={preferences.voiceSearchEnabled}
          locale={preferences.locale === "en" ? "en-AU" : preferences.locale}
          onPick={(loc) => {
            setSelectedId(loc.id);
            navigate(`/m/${loc.id}`);
          }}
        />
      ) : null}

      {mode === "now" ? (
        <NowModeOverlay onExit={() => setMode("plan")} />
      ) : null}

      {filterSheetOpen ? (
        <FilterSheet
          value={filters}
          onChange={setFilters}
          onClose={() => setFilterSheetOpen(false)}
          onReset={() => setFilters(EMPTY_FILTERS)}
        />
      ) : null}

      {settingsSheetOpen ? (
        <SettingsSheet
          preferences={preferences}
          onChange={setPreferences}
          onClose={() => setSettingsSheetOpen(false)}
          onForgetDevice={async () => {
            try {
              await api<void>("/api/device/forget", { method: "POST" });
            } catch (err) {
              if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
                // Don't proceed on a 4xx — surface to user via toast and bail.
                setToast({
                  message: t("errors.forget_device_failed"),
                  tone: "warn",
                });
                return;
              }
              // 5xx / network — proceed with local wipe regardless.
            }
            forgetDevice();
            qc.clear();
            window.location.assign("/");
          }}
        />
      ) : null}

      {hiddenByBarrierCount > 0 && mode !== "now" ? (
        <HiddenByBarrierChip
          count={hiddenByBarrierCount}
          barriers={filters.hideBarriers}
          onClear={() => setFilters({ ...filters, hideBarriers: [] })}
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

function HiddenByBarrierChip({
  count,
  barriers,
  onClear,
}: {
  count: number;
  barriers: string[];
  onClear: () => void;
}) {
  // The first selected barrier drives the chip text; if multiple barriers
  // are active, fall back to a count-only phrasing.
  const phrase =
    barriers.length === 1
      ? phraseForBarrier(barriers[0]!)
      : `${barriers.length} soft barrier filters active`;
  return (
    <div className="fixed inset-x-3 top-3 z-30 flex items-center justify-center pointer-events-none">
      <div className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-xs text-blue-900 shadow-md ring-1 ring-blue-200">
        <span>
          Hiding {count} {count === 1 ? "place" : "places"} — {phrase}
        </span>
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear barrier filters"
          className="ml-1 rounded-full px-1 text-blue-700 hover:bg-blue-100 focus:outline-none focus:ring-1 focus:ring-blue-700"
        >
          ×
        </button>
      </div>
    </div>
  );
}

function phraseForBarrier(b: string): string {
  switch (b) {
    case "id_required":
      return "ID often asked recently";
    case "medicare_required":
      return "Medicare often asked recently";
    case "cost_involved":
      return "charged recently";
    case "staff_rude":
      return "staff attitude flagged recently";
    case "long_wait":
      return "long waits recently";
    default:
      return b.replace(/_/g, " ");
  }
}

function TopRightButtons({
  hidden,
  onMyPlaces,
  onSettings,
}: {
  hidden: boolean;
  onMyPlaces: () => void;
  onSettings: () => void;
}) {
  if (hidden) return null;
  return (
    <div className="fixed top-3 right-3 z-30 flex gap-2">
      <button
        type="button"
        onClick={onSettings}
        aria-label="Settings"
        title="Settings"
        className="rounded-full bg-white shadow-lg ring-1 ring-neutral-200 w-11 h-11 text-lg flex items-center justify-center hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-neutral-900"
      >
        ⚙
      </button>
      <button
        type="button"
        onClick={onMyPlaces}
        aria-label="My Places"
        title="My Places"
        className="rounded-full bg-white shadow-lg ring-1 ring-neutral-200 w-11 h-11 text-lg flex items-center justify-center hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-neutral-900"
      >
        👤
      </button>
    </div>
  );
}

function ApiBanner({ message }: { message: string }) {
  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-40 bg-amber-100 border-b border-amber-200 px-4 py-2 text-center text-xs text-amber-900"
    >
      {message}
    </div>
  );
}

