import { useEffect, useRef, useState } from "react";
import { useMap, useMapEvents } from "react-leaflet";

interface SearchThisAreaButtonProps {
  onTrigger: (bbox: { swLat: number; swLon: number; neLat: number; neLon: number }) => void;
}

/**
 * Inline-on-map "Search this area" button. Renders inside the leaflet
 * container so it auto-positions correctly. Appears once the user has
 * panned or zoomed the map far enough that the visible viewport meaningfully
 * differs from the initial fit.
 */
export function SearchThisAreaButton({ onTrigger }: SearchThisAreaButtonProps) {
  const map = useMap();
  const [show, setShow] = useState(false);
  const initialCentreRef = useRef<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    const c = map.getCenter();
    initialCentreRef.current = { lat: c.lat, lng: c.lng };
  }, [map]);

  useMapEvents({
    moveend: () => {
      const c = map.getCenter();
      const start = initialCentreRef.current;
      if (!start) return;
      // Show after the user has panned ~more than half a viewport width.
      const dLat = Math.abs(c.lat - start.lat);
      const dLng = Math.abs(c.lng - start.lng);
      setShow(dLat > 0.01 || dLng > 0.01);
    },
  });

  if (!show) return null;

  const handleClick = () => {
    const b = map.getBounds();
    onTrigger({
      swLat: b.getSouthWest().lat,
      swLon: b.getSouthWest().lng,
      neLat: b.getNorthEast().lat,
      neLon: b.getNorthEast().lng,
    });
    initialCentreRef.current = { lat: map.getCenter().lat, lng: map.getCenter().lng };
    setShow(false);
  };

  return (
    <div className="leaflet-top leaflet-center" style={{ pointerEvents: "none" }}>
      <div className="leaflet-control" style={{ pointerEvents: "auto", marginTop: 60 }}>
        <button
          type="button"
          onClick={handleClick}
          className="rounded-full bg-white px-4 py-2 text-sm font-medium text-neutral-900 shadow-lg ring-1 ring-neutral-200 hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-neutral-900"
        >
          🔍 Search this area
        </button>
      </div>
    </div>
  );
}
