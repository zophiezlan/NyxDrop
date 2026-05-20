import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";

import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import type { Map as LeafletMap } from "leaflet";
import MarkerClusterGroupDefault from "@changey/react-leaflet-markercluster";
import { createPinIcon, createUserLocationIcon } from "./pin-icon.js";
import type { LocationWithConsensus, PinStatus, LocationType, VerificationLevel } from "@shared/schema";

// The package is CommonJS — esbuild's interop sometimes hands us the
// component nested under `.default`. Normalise both shapes.
const MarkerClusterGroup =
  (MarkerClusterGroupDefault as unknown as { default?: typeof MarkerClusterGroupDefault })
    .default ?? MarkerClusterGroupDefault;

type AutoFitMode = "default" | "nearest-3";

export type ViewportBbox = {
  swLat: number;
  swLon: number;
  neLat: number;
  neLon: number;
};

interface InteractiveMapProps {
  centre: { lat: number; lon: number };
  userPosition?: { lat: number; lon: number };
  locations: LocationWithConsensus[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /**
   * "default" fits user + closest 12 pins once. "nearest-3" auto-zooms to
   * user + closest 3 pins from the visible set every time the mode changes
   * (Now mode demand from spec.md §4.1).
   */
  autoFitMode?: AutoFitMode;
  /**
   * Fires with the current viewport bbox on mount, then debounced after
   * pan/zoom. The parent feeds this into the locations query so the server
   * only ships pins for the visible area instead of the whole table.
   */
  onViewportChange?: (bbox: ViewportBbox) => void;
}

function FitToBounds({
  centre,
  locations,
  autoFitMode,
}: {
  centre: { lat: number; lon: number };
  locations: LocationWithConsensus[];
  autoFitMode: AutoFitMode;
}) {
  const map = useMap();
  const fittedToDefaultRef = useRef(false);
  // Track the last mode we fit for so we re-fit when entering Now mode.
  const lastFitModeRef = useRef<AutoFitMode | null>(null);

  useEffect(() => {
    if (locations.length === 0) {
      if (!fittedToDefaultRef.current) {
        map.setView([centre.lat, centre.lon], 13);
      }
      return;
    }

    if (autoFitMode === "nearest-3") {
      if (lastFitModeRef.current === "nearest-3") return;
      const sorted = [...locations]
        .map((loc) => ({
          loc,
          d:
            (Number(loc.latitude) - centre.lat) ** 2 +
            (Number(loc.longitude) - centre.lon) ** 2,
        }))
        .sort((a, b) => a.d - b.d)
        .slice(0, 3)
        .map((entry) => entry.loc);
      const points: [number, number][] = [
        [centre.lat, centre.lon],
        ...sorted.map((loc): [number, number] => [
          Number(loc.latitude),
          Number(loc.longitude),
        ]),
      ];
      map.fitBounds(points, { padding: [60, 60], maxZoom: 15 });
      lastFitModeRef.current = "nearest-3";
      return;
    }

    lastFitModeRef.current = "default";
    if (fittedToDefaultRef.current) return;
    const sorted = [...locations]
      .map((loc) => ({
        loc,
        d:
          (Number(loc.latitude) - centre.lat) ** 2 +
          (Number(loc.longitude) - centre.lon) ** 2,
      }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 12)
      .map((entry) => entry.loc);
    const points: [number, number][] = [
      [centre.lat, centre.lon],
      ...sorted.map((loc): [number, number] => [
        Number(loc.latitude),
        Number(loc.longitude),
      ]),
    ];
    map.fitBounds(points, { padding: [40, 40], maxZoom: 14 });
    fittedToDefaultRef.current = true;
  }, [centre, locations, map, autoFitMode]);

  return null;
}

/**
 * Streams the current viewport bbox up to the parent. Emits once on mount
 * (so the initial load is viewport-scoped rather than nationwide) and again
 * after `moveend`, debounced to coalesce flick pans.
 */
function ViewportReporter({ onViewportChange }: { onViewportChange: (bbox: ViewportBbox) => void }) {
  const map = useMap();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = useRef(onViewportChange);
  callbackRef.current = onViewportChange;

  const emit = useCallback(() => {
    const b = map.getBounds();
    callbackRef.current({
      swLat: b.getSouthWest().lat,
      swLon: b.getSouthWest().lng,
      neLat: b.getNorthEast().lat,
      neLon: b.getNorthEast().lng,
    });
  }, [map]);

  useEffect(() => {
    // Initial bbox immediately on mount — the parent waits on this before
    // showing pins so the first query is already viewport-scoped.
    emit();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [emit]);

  useMapEvents({
    moveend: () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(emit, 350);
    },
  });

  return null;
}

// -----------------------------------------------------------------------------
// Memoized marker. Splitting this out + memoizing on the *primitive* fields
// that affect the icon means panning the map or selecting a different pin
// doesn't force every other marker to re-render. Previously every render of
// the parent created fresh `icon` + `eventHandlers` objects per marker,
// which made react-leaflet call setIcon on every L.Marker on every render.
// -----------------------------------------------------------------------------

interface MapMarkerProps {
  id: string;
  lat: number;
  lon: number;
  name: string;
  consensusLabel: string;
  status: PinStatus;
  size: number;
  type: LocationType;
  verification: VerificationLevel;
  selected: boolean;
  onSelect: (id: string) => void;
}

const MapMarker = memo(function MapMarker({
  id,
  lat,
  lon,
  name,
  consensusLabel,
  status,
  size,
  type,
  verification,
  selected,
  onSelect,
}: MapMarkerProps) {
  const icon = useMemo(
    () => createPinIcon({ status, size, type, verification, selected }),
    [status, size, type, verification, selected],
  );
  const handlers = useMemo(
    () => ({
      click: () => onSelect(id),
      keypress: (e: { originalEvent: KeyboardEvent }) => {
        const ke = e.originalEvent;
        if (ke.key === "Enter" || ke.key === " ") onSelect(id);
      },
    }),
    [id, onSelect],
  );
  return (
    <Marker
      position={[lat, lon]}
      icon={icon}
      eventHandlers={handlers}
      alt={`${name} — ${consensusLabel}`}
      title={name}
    />
  );
});

export function InteractiveMap({
  centre,
  userPosition,
  locations,
  selectedId,
  onSelect,
  autoFitMode = "default",
  onViewportChange,
}: InteractiveMapProps) {
  const userIcon = useMemo(() => createUserLocationIcon(), []);
  const mapRef = useRef<LeafletMap | null>(null);
  // Stable identity so MapMarker's React.memo isn't busted every render.
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;
  const stableOnSelect = useCallback((id: string) => selectRef.current(id), []);

  return (
    <MapContainer
      center={[centre.lat, centre.lon]}
      zoom={13}
      // `isolate` (`isolation: isolate`) forces a new stacking context on the
      // leaflet-container so its internal pane z-indices (tile=200, marker=600,
      // popup=700, etc.) don't leak into the parent stacking context and paint
      // over our fixed overlays/sheets.
      className="h-dvh w-dvw isolate"
      zoomControl={false}
      ref={mapRef}
      preferCanvas={true}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />
      <FitToBounds centre={centre} locations={locations} autoFitMode={autoFitMode} />
      {onViewportChange ? <ViewportReporter onViewportChange={onViewportChange} /> : null}
      {userPosition ? (
        <Marker
          position={[userPosition.lat, userPosition.lon]}
          icon={userIcon}
          interactive={false}
          keyboard={false}
        />
      ) : null}
      <MarkerClusterGroup
        chunkedLoading
        maxClusterRadius={60}
        disableClusteringAtZoom={16}
        spiderfyOnMaxZoom={true}
        showCoverageOnHover={false}
      >
        {locations.map((loc) => (
          <MapMarker
            key={loc.id}
            id={loc.id}
            lat={Number(loc.latitude)}
            lon={Number(loc.longitude)}
            name={loc.name}
            consensusLabel={loc.consensusLabel}
            status={loc.pinStatus}
            size={loc.pinSize}
            type={loc.type}
            verification={loc.verificationLevel}
            selected={loc.id === selectedId}
            onSelect={stableOnSelect}
          />
        ))}
      </MarkerClusterGroup>
    </MapContainer>
  );
}
