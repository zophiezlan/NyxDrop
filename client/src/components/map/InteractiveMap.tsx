import "leaflet/dist/leaflet.css";

import { useEffect, useMemo, useRef } from "react";
import { MapContainer, Marker, TileLayer, useMap } from "react-leaflet";
import type { Map as LeafletMap } from "leaflet";
import { createPinIcon, createUserLocationIcon } from "./pin-icon.js";
import { SearchThisAreaButton } from "@/components/search/SearchThisAreaButton";
import type { LocationWithConsensus } from "@shared/schema";

type AutoFitMode = "default" | "nearest-3";

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
   * Called when the user taps "Search this area" after panning/zooming. The
   * bbox is the current viewport in {sw,ne}{Lat,Lon} form. When omitted the
   * search-this-area button is not rendered.
   */
  onSearchArea?: (bbox: {
    swLat: number;
    swLon: number;
    neLat: number;
    neLon: number;
  }) => void;
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
      map.setView([centre.lat, centre.lon], 13);
      return;
    }

    if (autoFitMode === "nearest-3") {
      // Always re-fit when entering Now mode so the user sees the closest
      // green/amber pins (spec.md §4.1). After the initial Now-mode fit,
      // hold position so the user can pan freely without snap-back.
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

    // Default: fit user + closest 12 once on first load.
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

export function InteractiveMap({
  centre,
  userPosition,
  locations,
  selectedId,
  onSelect,
  autoFitMode = "default",
  onSearchArea,
}: InteractiveMapProps) {
  const userIcon = useMemo(() => createUserLocationIcon(), []);
  const mapRef = useRef<LeafletMap | null>(null);

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
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />
      <FitToBounds centre={centre} locations={locations} autoFitMode={autoFitMode} />
      {onSearchArea ? <SearchThisAreaButton onTrigger={onSearchArea} /> : null}
      {userPosition ? (
        <Marker
          position={[userPosition.lat, userPosition.lon]}
          icon={userIcon}
          interactive={false}
          keyboard={false}
        />
      ) : null}
      {locations.map((loc) => (
        <Marker
          key={loc.id}
          position={[Number(loc.latitude), Number(loc.longitude)]}
          icon={createPinIcon({
            status: loc.pinStatus,
            size: loc.pinSize,
            type: loc.type,
            verification: loc.verificationLevel,
            selected: loc.id === selectedId,
          })}
          eventHandlers={{
            click: () => onSelect(loc.id),
            keypress: (e) => {
              const ke = e.originalEvent as KeyboardEvent;
              if (ke.key === "Enter" || ke.key === " ") onSelect(loc.id);
            },
          }}
          alt={`${loc.name} — ${loc.consensusLabel}`}
          title={loc.name}
        />
      ))}
    </MapContainer>
  );
}
