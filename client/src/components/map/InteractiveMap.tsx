import "leaflet/dist/leaflet.css";

import { useEffect, useMemo, useRef } from "react";
import { MapContainer, Marker, TileLayer, useMap } from "react-leaflet";
import type { Map as LeafletMap } from "leaflet";
import { createPinIcon, createUserLocationIcon } from "./pin-icon.js";
import type { LocationWithConsensus } from "@shared/schema";

interface InteractiveMapProps {
  centre: { lat: number; lon: number };
  userPosition?: { lat: number; lon: number };
  locations: LocationWithConsensus[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function FitToBounds({
  centre,
  locations,
}: {
  centre: { lat: number; lon: number };
  locations: LocationWithConsensus[];
}) {
  const map = useMap();
  const fittedRef = useRef(false);

  useEffect(() => {
    if (fittedRef.current) return;
    if (locations.length === 0) {
      map.setView([centre.lat, centre.lon], 13);
      fittedRef.current = true;
      return;
    }
    // Fit to user + closest 8-12 pins. We approximate "closest" by sorting on
    // squared euclidean distance which is fine for picking the nearest set.
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
      ...sorted.map((loc): [number, number] => [Number(loc.latitude), Number(loc.longitude)]),
    ];
    map.fitBounds(points, { padding: [40, 40], maxZoom: 14 });
    fittedRef.current = true;
  }, [centre, locations, map]);

  return null;
}

export function InteractiveMap({
  centre,
  userPosition,
  locations,
  selectedId,
  onSelect,
}: InteractiveMapProps) {
  const userIcon = useMemo(() => createUserLocationIcon(), []);
  const mapRef = useRef<LeafletMap | null>(null);

  return (
    <MapContainer
      center={[centre.lat, centre.lon]}
      zoom={13}
      className="h-dvh w-dvw"
      zoomControl={false}
      ref={mapRef}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />
      <FitToBounds centre={centre} locations={locations} />
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
