import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation as useWouterLocation } from "wouter";
import { useGeolocation } from "@/hooks/use-geolocation";
import { useLocations } from "@/hooks/use-locations";
import { useMode } from "@/hooks/use-mode";
import { useOfflineReportDrain } from "@/hooks/use-report";
import { OnboardingOverlay } from "@/components/shared/OnboardingOverlay";
import { DemoChip } from "@/components/shared/DemoNotice";
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
  /** Optional click handler; turns the toast into a tappable refresh prompt. */
  onAction?: () => void;
  actionLabel?: string;
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
  // Viewport bbox driven by the map's pan/zoom. The locations query stays
  // disabled until the map emits its first viewport so we never fire a
  // nationwide /api/locations fetch on cold start.
  const [viewportBbox, setViewportBbox] = useState<Bbox | null>(null);
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
    bbox: viewportBbox ?? undefined,
    type: filters.type.length > 0 ? filters.type : undefined,
    verification: filters.verification.length > 0 ? filters.verification : undefined,
    recent: filters.recent || undefined,
    openNow: filters.openNow || undefined,
    enabled: viewportBbox !== null,
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

  // Phase 8: surface a "tap to refresh" toast when a new service worker
  // version is waiting. Tapping the action triggers the SW skipWaiting
  // and the page reloads (sw-register.ts). The toast persists until the
  // user dismisses or actions it.
  useEffect(() => {
    const onUpdate = (ev: Event) => {
      const detail = (ev as CustomEvent<{ activate: () => void }>).detail;
      setToast({
        message: t("sw.update_available"),
        tone: "info",
        actionLabel: t("sw.refresh"),
        onAction: detail.activate,
      });
    };
    window.addEventListener("nl:sw-update-available", onUpdate);
    return () => window.removeEventListener("nl:sw-update-available", onUpdate);
  }, [t]);

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
    <div className={`relative ${mode === "now" ? "bg-red-50 dark:bg-red-950" : "bg-surface-dim"}`}>
      <Suspense fallback={<MapPlaceholder />}>
        <InteractiveMap
          centre={geo.position}
          userPosition={geo.isFallback ? undefined : geo.position}
          locations={visibleLocations}
          selectedId={selectedId}
          onSelect={handleSelect}
          autoFitMode={mode === "now" ? "nearest-3" : "default"}
          onViewportChange={setViewportBbox}
        />
      </Suspense>

      {locationsQuery.isError ? <ApiBanner message={t("errors.api_unreachable")} /> : null}

      <LoadingIndicator
        isFetching={locationsQuery.isFetching}
        count={visibleLocations.length}
        hidden={
          mode === "now" ||
          !!selectedId ||
          !!reportState ||
          openSheet === "my-places" ||
          settingsSheetOpen
        }
      />


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
          actionLabel={toast.actionLabel}
          onAction={toast.onAction}
          duration={toast.onAction ? 0 : 5000}
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

      <DemoChip
        hidden={
          !!selectedId ||
          !!reportState ||
          openSheet === "my-places" ||
          filterSheetOpen ||
          settingsSheetOpen
        }
      />

      <OnboardingOverlay />
    </div>
  );
}

function MapPlaceholder() {
  const t = useT();
  return (
    <div className="flex h-dvh w-dvw items-center justify-center bg-surface-inset text-sm text-fg-muted">
      {t("map.loading")}
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
  const t = useT();
  const phrase =
    barriers.length === 1
      ? (t(`barrier.${barriers[0]!}` as Parameters<typeof t>[0]) || barriers[0]!.replace(/_/g, " "))
      : t("map.barrier_chip_multi").replace("{count}", String(barriers.length));
  const places = count === 1 ? t("map.barrier_chip_place") : t("map.barrier_chip_places");
  const chipText = t("map.barrier_chip_hiding")
    .replace("{count}", String(count))
    .replace("{places}", places)
    .replace("{phrase}", phrase);
  return (
    <div className="fixed inset-x-3 top-3 z-30 flex items-center justify-center pointer-events-none">
      <div className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-blue-50 dark:bg-blue-950 px-3 py-1.5 text-xs text-blue-900 dark:text-blue-200 shadow-md ring-1 ring-blue-200 dark:ring-blue-800">
        <span>{chipText}</span>
        <button
          type="button"
          onClick={onClear}
          aria-label={t("map.clear_barrier_filters")}
          className="ms-1 rounded-full px-1 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900 focus:outline-none focus:ring-1 focus:ring-blue-700"
        >
          ×
        </button>
      </div>
    </div>
  );
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
  const t = useT();
  if (hidden) return null;
  return (
    <div className="fixed top-3 end-3 z-30 flex gap-2">
      <button
        type="button"
        onClick={onSettings}
        aria-label={t("settings.title")}
        title={t("settings.title")}
        className="rounded-full bg-surface shadow-lg ring-1 ring-nl-ring w-11 h-11 text-lg flex items-center justify-center hover:bg-nl-hover active:scale-95 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-nl-primary transition-transform"
      >
        ⚙
      </button>
      <button
        type="button"
        onClick={onMyPlaces}
        aria-label={t("my_places.title")}
        title={t("my_places.title")}
        className="rounded-full bg-surface shadow-lg ring-1 ring-nl-ring w-11 h-11 text-lg flex items-center justify-center hover:bg-nl-hover active:scale-95 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-nl-primary transition-transform"
      >
        👤
      </button>
    </div>
  );
}

// `LoadingIndicator` surfaces query state to the user. While the locations
// query is in flight we show a top-edge indeterminate progress strip plus a
// small "Loading places…" chip; once data lands the chip switches to a
// place-count summary that auto-dismisses after a couple of seconds. The
// idea is to set expectations during slow viewport renders (whole cities,
// states) without cluttering the map permanently.
function LoadingIndicator({
  isFetching,
  count,
  hidden,
}: {
  isFetching: boolean;
  count: number;
  hidden: boolean;
}) {
  const t = useT();
  const [recentlyLoaded, setRecentlyLoaded] = useState(false);
  const wasFetchingRef = useRef(false);

  useEffect(() => {
    if (isFetching) {
      wasFetchingRef.current = true;
      setRecentlyLoaded(false);
      return;
    }
    if (!wasFetchingRef.current) return;
    wasFetchingRef.current = false;
    setRecentlyLoaded(true);
    const tid = setTimeout(() => setRecentlyLoaded(false), 2200);
    return () => clearTimeout(tid);
  }, [isFetching]);

  if (hidden) return null;
  if (!isFetching && !recentlyLoaded) return null;

  const countLabel =
    count === 1
      ? t("map.showing_count_one")
      : t("map.showing_count_other").replace("{count}", String(count));

  return (
    <>
      {isFetching ? (
        <div
          aria-hidden="true"
          className="fixed inset-x-0 top-0 z-40 h-0.5 overflow-hidden pointer-events-none"
        >
          <div className="h-full w-1/3 bg-nl-primary/80 animate-nl-progress" />
        </div>
      ) : null}
      <div
        className="fixed inset-x-3 top-3 z-30 flex items-center justify-center pointer-events-none"
        role="status"
        aria-live="polite"
      >
        <div className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-surface/95 backdrop-blur px-3 py-1.5 text-xs text-fg shadow-md ring-1 ring-nl-ring">
          {isFetching ? (
            <>
              <span
                aria-hidden="true"
                className="inline-block h-3 w-3 rounded-full border-2 border-nl-primary/30 border-t-nl-primary animate-spin"
              />
              <span>{t("map.loading_places")}</span>
            </>
          ) : (
            <span>{countLabel}</span>
          )}
        </div>
      </div>
    </>
  );
}

function ApiBanner({ message }: { message: string }) {
  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-40 bg-amber-100 dark:bg-amber-950 border-b border-amber-200 dark:border-amber-800 px-4 py-2 text-center text-xs text-amber-900 dark:text-amber-200"
    >
      {message}
    </div>
  );
}

