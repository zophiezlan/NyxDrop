// XYZ slippy-map tile math (OSM / Google / Mapbox convention).
//
// We snap viewports to a fixed tile grid so each region of the map has a
// stable, sharable cache key. Containment becomes set membership instead of
// geometry math, the server's response is identical for everyone viewing
// the same tile, and invalidating a single tile is targeted rather than
// nuking the whole cache.
//
// References:
//   https://wiki.openstreetmap.org/wiki/Slippy_map_tilenames
//   https://docs.mapbox.com/help/glossary/zoom-level/

export type TileCoord = { z: number; x: number; y: number };
export type Bbox = { swLat: number; swLon: number; neLat: number; neLon: number };

/** Reference zoom for the default suburb/street-level browsing experience.
 *  Used as a starting point by `pickTileZoom`. */
export const DEFAULT_TILE_Z = 10;

/** Maximum tile zoom we'll ever fetch at. Beyond ~14 the tile is small
 *  enough that you'd be loading individual buildings; not useful. */
const MAX_TILE_Z = 14;

/**
 * Adaptive tile zoom for the current viewport.
 *
 * A fixed tile zoom either over-fetches at street level (one giant tile
 * per viewport, can't invalidate selectively) or implodes at continent
 * level (thousands of tiny tiles). Instead we pick a tile zoom that keeps
 * the visible viewport at ~3-6 tiles wide regardless of map zoom — the
 * same heuristic OSM and Mapbox use.
 *
 * Same physical area can end up cached at multiple tile zooms (once when
 * you viewed the suburb, again when zoomed-out viewing the metro). Each
 * zoom level is its own cache slot. That duplication is the price for
 * O(1) viewport→tile-set translation at every scale.
 */
export function pickTileZoom(viewport: Bbox): number {
  const span = Math.max(
    Math.abs(viewport.neLon - viewport.swLon),
    Math.abs(viewport.neLat - viewport.swLat),
    0.001,
  );
  // We want viewport ≈ 4 tiles wide, so tile size ≈ span/4.
  // Tile size in degrees at zoom z is 360/2^z, so z = log2(360 / (span/4)).
  const z = Math.round(Math.log2(360 / (span / 4)));
  return Math.max(0, Math.min(MAX_TILE_Z, z));
}

export function lonToTileX(lon: number, z: number): number {
  return Math.floor(((lon + 180) / 360) * 2 ** z);
}

export function latToTileY(lat: number, z: number): number {
  const r = (lat * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z,
  );
}

function tileXToLon(x: number, z: number): number {
  return (x / 2 ** z) * 360 - 180;
}

function tileYToLat(y: number, z: number): number {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** z;
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

export function tileBbox(tile: TileCoord): Bbox {
  return {
    swLat: tileYToLat(tile.y + 1, tile.z),
    swLon: tileXToLon(tile.x, tile.z),
    neLat: tileYToLat(tile.y, tile.z),
    neLon: tileXToLon(tile.x + 1, tile.z),
  };
}

export function tileKey(tile: TileCoord): string {
  return `${tile.z}/${tile.x}/${tile.y}`;
}

/** All tiles at the given zoom that intersect the bbox. Clamped to legal
 *  latitudes (Web Mercator breaks past ~±85°) and wraps the world in
 *  longitude so an "all of Australia" zoom-out doesn't blow up. */
export function tilesForBbox(bbox: Bbox, z: number = DEFAULT_TILE_Z): TileCoord[] {
  const swLat = Math.max(-85.05, Math.min(85.05, bbox.swLat));
  const neLat = Math.max(-85.05, Math.min(85.05, bbox.neLat));
  const max = 2 ** z;

  const x1 = lonToTileX(bbox.swLon, z);
  const x2 = lonToTileX(bbox.neLon, z);
  // Leaflet sometimes hands us lon ranges spanning >360° at deep zoom-outs;
  // cap how many longitude tiles we'll fetch so a runaway viewport can't
  // request thousands of tiles.
  const widthRaw = x2 - x1 + 1;
  const width = Math.min(Math.max(widthRaw, 1), max);

  const yMin = Math.min(latToTileY(swLat, z), latToTileY(neLat, z));
  const yMax = Math.max(latToTileY(swLat, z), latToTileY(neLat, z));
  const yLo = Math.max(0, yMin);
  const yHi = Math.min(max - 1, yMax);

  const tiles: TileCoord[] = [];
  for (let dx = 0; dx < width; dx++) {
    const x = ((x1 + dx) % max + max) % max;
    for (let y = yLo; y <= yHi; y++) {
      tiles.push({ z, x, y });
    }
  }
  return tiles;
}

/** Which tile a single point falls in. Used for targeted invalidation
 *  after a report/add — we only need to bust the tile containing the
 *  affected location, not the whole locations cache. */
export function tileForPoint(
  lat: number,
  lon: number,
  z: number = DEFAULT_TILE_Z,
): TileCoord {
  return { z, x: lonToTileX(lon, z), y: latToTileY(lat, z) };
}
