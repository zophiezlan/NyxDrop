import { useRef, useState } from "react";
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

  useMapEvents({
    moveend: () => {
      const c = map.getCenter();
      // The first moveend after mount is the FitToBounds initial fit — not a
      // user pan. Capture that settled position as the baseline; subsequent
      // moveends are compared against it to decide whether to show.
      if (!initialCentreRef.current) {
        initialCentreRef.current = { lat: c.lat, lng: c.lng };
        return;
      }
      const start = initialCentreRef.current;
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
          className="rounded-full bg-surface px-4 py-2 text-sm font-medium text-fg shadow-lg ring-1 ring-nl-ring hover:bg-nl-hover active:scale-95 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-nl-primary transition-transform"
        >
          🔍 Search this area
        </button>
      </div>
    </div>
  );
}
