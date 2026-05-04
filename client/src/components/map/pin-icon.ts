import L from "leaflet";
import type { LocationType, PinStatus, VerificationLevel } from "@shared/schema";

// Visual mapping per spec.md §2.2. The glyph choices here are placeholders
// per decisions.md D-006 — Phase 1 may swap to Lucide-rendered SVG.

const TYPE_GLYPH: Record<LocationType, string> = {
  nsp: "▽",
  pharmacy: "+",
  hospital: "H",
  community_health: "⚕",
  aod_organisation: "♥",
  library: "📚",
  public_building: "▢",
  festival_site: "🎪",
  drop_in_centre: "⌂",
  other: "•",
};

const STATUS_BG: Record<PinStatus, string> = {
  green: "#16a34a", // tailwind green-600
  amber: "#f59e0b", // tailwind amber-500
  red: "#dc2626", // tailwind red-600
  grey: "#9ca3af", // tailwind gray-400
};

interface PinOptions {
  status: PinStatus;
  size: number; // diameter px
  type: LocationType;
  verification: VerificationLevel;
  selected?: boolean;
}

export function createPinIcon({
  status,
  size,
  type,
  verification,
  selected,
}: PinOptions): L.DivIcon {
  const renderedSize = selected ? Math.round(size * 1.4) : size;
  const bg = STATUS_BG[status];
  const glyph = TYPE_GLYPH[type];
  const borderStyle =
    verification === "unverified" ? "1px dashed rgba(255,255,255,0.85)" : "2px solid white";
  const ring = selected ? "0 0 0 3px rgba(15,23,42,0.85)" : "0 1px 4px rgba(0,0,0,0.4)";
  const fontSize = Math.max(10, Math.round(renderedSize * 0.45));

  const html = `
    <div
      class="nl-pin"
      style="
        width:${renderedSize}px;
        height:${renderedSize}px;
        border-radius:9999px;
        background:${bg};
        border:${borderStyle};
        box-shadow:${ring};
        display:flex;
        align-items:center;
        justify-content:center;
        color:white;
        font-weight:600;
        font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
        font-size:${fontSize}px;
        line-height:1;
      "
      aria-hidden="true"
    >${glyph}</div>
  `;

  return L.divIcon({
    html,
    className: "nl-pin-icon",
    iconSize: [renderedSize, renderedSize],
    iconAnchor: [renderedSize / 2, renderedSize / 2],
    popupAnchor: [0, -(renderedSize / 2)],
  });
}

export function createUserLocationIcon(): L.DivIcon {
  const html = `
    <div
      class="nl-user-dot"
      style="
        width:18px;
        height:18px;
        border-radius:9999px;
        background:#2563eb;
        border:3px solid white;
        box-shadow:0 0 0 6px rgba(37,99,235,0.18);
      "
      aria-hidden="true"
    ></div>
  `;
  return L.divIcon({
    html,
    className: "nl-user-icon",
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}
